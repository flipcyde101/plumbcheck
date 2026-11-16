import { randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Workspace, WorkspaceError, connectionConfig } from './workspace.js';
import { runModelProject, discoverModels } from './model-agent.js';
import { validateSuite } from './validation.js';
import { syncRequest, syncURL } from './sync-client.js';

export async function jsonBody(req, limit = 1_200_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new WorkspaceError('Use application/json.', 415);
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new WorkspaceError('Request is too large.', 413); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function workspaceService(directory, options = {}) {
  const workspace = await Workspace.open(directory, { ...options, modelRunner: options.modelRunner || (args => runModelProject({ ...args, fetch: options.fetch })) });
  const token = randomBytes(32).toString('hex');
  const descriptorPath = join(directory, 'bridge.json');
  const authorized = req => {
    const got = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    return got.length === expected.length && timingSafeEqual(got, expected);
  };
  return {
    workspace, descriptorPath, token,
    async listen(port) { await writeFile(descriptorPath, JSON.stringify({ version: 1, url: `http://127.0.0.1:${port}`, token }), { mode: 0o600 }); },
    async close() { await workspace.close(); await unlink(descriptorPath).catch(e => { if (e.code !== 'ENOENT') throw e; }); },
    async handle(req, res, json) {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/') || ['/api/examples', '/api/run'].includes(url.pathname)) return false;
      if (!authorized(req)) { json(401, { error: 'Open the private application launch link or use an authorized PlumbCheck connection.' }); return true; }
      if (url.pathname.startsWith('/api/sync/')) {
        if (req.method !== 'POST') { json(405, { error: 'Use POST.' }); return true; }
        const body = await jsonBody(req);
        if (url.pathname === '/api/sync/pair') {
          const relay = syncURL(body.url);
          const paired = await syncRequest(relay, '/v1/pair', { fetch: options.fetch, method: 'POST', body: { code: body.code, name: body.name } });
          await workspace.vault.set('sync', JSON.stringify({ url: relay, token: paired.token }));
          json(200, { paired: true, deviceId: paired.deviceId, url: relay }); return true;
        }
        const raw = await workspace.vault.get('sync');
        if (!raw) throw new WorkspaceError('Pair this device with a relay first.');
        const settings = JSON.parse(raw);
        settings.fetch = options.fetch;
        if (url.pathname === '/api/sync/list') { json(200, await syncRequest(settings.url, '/v1/snapshots', settings)); return true; }
        if (url.pathname === '/api/sync/upload') {
          if (body.consent !== true) throw new WorkspaceError('Review and authorize uploading fixture data first.');
          const p = workspace.project(body.projectId);
          const run = body.includeReport === true ? workspace.state.runs.find(r => r.projectId === p.id && r.report) : undefined;
          const revision = run?.mode === 'imported' ? run.source?.contractRevision : run?.revision;
          const context = revision && run.contractHash ? { contractRevision: revision, contractHash: run.contractHash } : null;
          json(200, await syncRequest(settings.url, '/v1/snapshots', { ...settings, method: 'POST', body: { project: p, ...(run ? { report: run.report, ...(context ? { reportContext: context } : {}) } : {}) } })); return true;
        }
        if (url.pathname === '/api/sync/import') {
          if (!/^[a-f0-9-]{36}$/.test(body.snapshotId)) throw new WorkspaceError('Invalid snapshot ID.');
          const snapshot = await syncRequest(settings.url, `/v1/snapshots/${body.snapshotId}`, settings);
          const imported = await workspace.importSnapshot(snapshot, settings.url);
          json(200, { ...imported, note: imported.reportRestored ? 'Restored the removed imported report without executing it. Local project edits were preserved.' : imported.reused ? 'Already imported. Local edits and saved evidence were preserved.' : `Imported as a new local project.${imported.run ? ' Its report is in History as imported evidence; it was not executed here.' : ''} Existing edits and previous runs were preserved.` }); return true;
        }
        throw new WorkspaceError('Unknown sync action.', 404);
      }
      if (url.pathname === '/api/control') {
        if (!authorized(req)) { json(401, { error: 'The assistant connection is not authorized.' }); return true; }
        if (req.method !== 'POST') { json(405, { error: 'Use POST.' }); return true; }
        const { tool, arguments: args = {} } = await jsonBody(req);
        let result;
        if (tool === 'plumbcheck_list_projects') result = workspace.summary().projects;
        else if (tool === 'plumbcheck_validate_contract') { validateSuite(args.contract, { mode: args.mode === 'agent' ? 'agent' : 'planned' }); result = { valid: true }; }
        else if (tool === 'plumbcheck_run_suite') result = await workspace.startRun({ ...args, mode: 'fixture' });
        else if (tool === 'plumbcheck_get_run') result = workspace.run(args.runId);
        else if (tool === 'plumbcheck_cancel_run') result = await workspace.cancel(args.runId);
        else if (tool === 'plumbcheck_compare_runs') result = workspace.compare(args.left, args.right);
        else throw new WorkspaceError('Unknown control tool.', 404);
        json(200, result); return true;
      }
      if (url.pathname === '/api/workspace' && req.method === 'GET') { json(200, workspace.summary()); return true; }
      if (url.pathname === '/api/projects' && req.method === 'POST') { json(200, await workspace.saveProject(await jsonBody(req))); return true; }
      if (url.pathname === '/api/discover-models' && req.method === 'POST') {
        const body = await jsonBody(req);
        const c = connectionConfig({ ...body, name: body.name || 'Model discovery', model: body.model || 'model-discovery' });
        const old = body.id ? workspace.state.connections.find(c => c.id === body.id) : null;
        if (body.apiKey !== undefined && (typeof body.apiKey !== 'string' || body.apiKey.length > 4096 || /[\r\n]/.test(body.apiKey))) throw new WorkspaceError('Invalid API key.');
        const key = body.apiKey || (old && old.provider === c.provider && old.baseURL === c.baseURL ? await workspace.vault.get(old.credentialId || old.id) : undefined);
        json(200, await discoverModels(c, key, { fetch: options.fetch })); return true;
      }
      if (url.pathname === '/api/connections' && req.method === 'POST') { json(200, await workspace.saveConnection(await jsonBody(req))); return true; }
      if (url.pathname === '/api/runs' && req.method === 'POST') {
        const body = await jsonBody(req);
        if (body.mode === 'model' && body.modelConsent !== true) throw new WorkspaceError('Authorize sending this scenario to the selected model before running.', 403);
        json(202, await workspace.startRun(body, { allowModel: true })); return true;
      }
      if (url.pathname === '/api/compare' && req.method === 'POST') { const b = await jsonBody(req); json(200, workspace.compare(b.left, b.right)); return true; }
      const match = url.pathname.match(/^\/api\/(projects|connections|runs)\/([a-f0-9-]{36})(?:\/(cancel|models))?$/);
      if (!match) return false;
      const [, kind, id, action] = match;
      if (req.method === 'DELETE' && !action) { await workspace.remove(kind, id); json(200, { removed: true }); return true; }
      if (req.method === 'GET' && kind === 'projects' && !action) { json(200, workspace.project(id)); return true; }
      if (req.method === 'GET' && kind === 'runs' && !action) { json(200, workspace.run(id)); return true; }
      if (req.method === 'POST' && kind === 'runs' && action === 'cancel') { json(200, await workspace.cancel(id)); return true; }
      if (req.method === 'POST' && kind === 'connections' && action === 'models') {
        const c = workspace.state.connections.find(c => c.id === id);
        if (!c) throw new WorkspaceError('Connection not found.', 404);
        json(200, await discoverModels(c, await workspace.vault.get(c.credentialId || id), { fetch: options.fetch })); return true;
      }
      return false;
    },
  };
}
