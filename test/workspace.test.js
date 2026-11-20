import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace, connectionConfig } from '../src/workspace.js';
import { startStudio, loadExamples } from '../src/studio.js';
import { runSuite } from '../src/runner.js';

async function fixture(t, options) {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-workspace-'));
  let workspace = await Workspace.open(directory, options);
  t.after(async () => { await workspace?.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, workspace, async reopen() { await workspace.close(); workspace = await Workspace.open(directory, options); return workspace; } };
}
async function finished(workspace, id) {
  for (let i = 0; i < 200; i++) { const r = workspace.run(id); if (!['queued', 'running'].includes(r.status)) return r; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('Test job did not finish.');
}
async function project(w) { return w.saveProject({ name: 'Support', task: 'Read the order.', contract: (await loadExamples()).safe }); }

test('projects use optimistic revisions; history and evidence survive a restart', async t => {
  const f = await fixture(t); const p = await project(f.workspace);
  await assert.rejects(f.workspace.saveProject({ ...p, revision: 0 }), /changed/);
  const r = await f.workspace.startRun({ projectId: p.id, revision: p.revision, idempotencyKey: 'run-1' });
  assert.equal((await finished(f.workspace, r.id)).status, 'passed');
  const w = await f.reopen(); assert.equal(w.project(p.id).revision, 1); assert.equal(w.run(r.id).report.passed, true);
  const retried = await w.startRun({ projectId: p.id, revision: 1, idempotencyKey: 'run-1' }); assert.equal(retried.id, r.id); assert.equal(w.summary().runs.length, 1);
  await assert.rejects(w.startRun({ projectId: p.id, revision: 0, idempotencyKey: 'old' }), /revision/);
});

test('a workspace refuses a second owner and does not silently erase corrupted data', async t => {
  const f = await fixture(t);
  await assert.rejects(Workspace.open(f.directory), /another process/);
  const other = await mkdtemp(join(tmpdir(), 'plumbcheck-corrupt-'));
  t.after(() => rm(other, { recursive: true, force: true }));
  await writeFile(join(other, 'workspace.json'), '{broken');
  await assert.rejects(Workspace.open(other));
  assert.equal(await readFile(join(other, 'workspace.json'), 'utf8'), '{broken');
});

test('credentials are separate from history, project exports, and connection metadata', async t => {
  const { workspace: w, directory } = await fixture(t);
  const c = await w.saveConnection({ name: 'Provider', provider: 'openai', model: 'user-selected', apiKey: 'SYNTHETIC_KEY_NEVER_PERSIST' });
  assert.equal(c.credentialAvailable, true);
  assert.ok(!(await readFile(join(directory, 'workspace.json'), 'utf8')).includes('SYNTHETIC_KEY'));
  assert.ok(!JSON.stringify(w.summary()).includes('SYNTHETIC_KEY'));
  await w.remove('connections', c.id); assert.equal(await w.vault.get(c.id), undefined);
});

test('saved credentials are not reused when an edited connection changes provider or destination', async t => {
  const { workspace: w } = await fixture(t);
  const c = await w.saveConnection({ name: 'API', provider: 'openai', model: 'selected', apiKey: 'SYNTHETIC_OLD_PROVIDER_KEY' });
  const credential = w.state.connections.find(x => x.id === c.id).credentialId;
  await assert.rejects(w.saveConnection({ id: c.id, name: 'Different API', provider: 'anthropic', model: 'selected' }), /not moved/);
  await w.saveConnection({ id: c.id, name: 'Local', provider: 'ollama', model: 'selected', baseURL: 'http://127.0.0.1:11434/v1' });
  const current = w.state.connections.find(x => x.id === c.id);
  assert.equal(await w.vault.get(current.credentialId), undefined);
  assert.equal(await w.vault.get(credential), undefined);
});

test('API destinations enforce HTTPS and local model connections stay on loopback', () => {
  const base = { name: 'Local', model: 'selected', provider: 'ollama' };
  assert.equal(connectionConfig({ ...base, baseURL: 'http://127.0.0.1:11434/v1' }).baseURL, 'http://127.0.0.1:11434/v1');
  for (const url of ['http://example.com/v1', 'https://example.com/v1', 'http://user:password@localhost/v1', 'file:///tmp/model', 'http://localhost/v1?key=secret']) assert.throws(() => connectionConfig({ ...base, baseURL: url }));
});

test('model jobs require caller authorization, cancellation is terminal, and raw provider errors do not leak', async t => {
  const f = await fixture(t, { modelRunner: ({ signal }) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('secret-provider-body')), { once: true }); }) });
  const w = f.workspace; const p = await project(w); const c = await w.saveConnection({ name: 'Local', provider: 'ollama', model: 'selected', baseURL: 'http://localhost:11434/v1' });
  const input = { projectId: p.id, revision: 1, mode: 'model', connectionId: c.id, idempotencyKey: 'model-1' };
  await assert.rejects(w.startRun(input), /not enabled/);
  const r = await w.startRun(input, { allowModel: true });
  await new Promise(r => setTimeout(r, 30)); await w.cancel(r.id);
  assert.equal((await finished(w, r.id)).status, 'cancelled');
  await new Promise(r => setTimeout(r, 30)); assert.equal(w.run(r.id).status, 'cancelled');
  assert.ok(!JSON.stringify(w.summary()).includes('secret-provider-body'));
});

test('saved-run comparisons report changed case outcomes', async t => {
  const { workspace: w } = await fixture(t); let p = await project(w);
  const a = await w.startRun({ projectId: p.id, revision: 1, idempotencyKey: 'a' }); await finished(w, a.id);
  p = await w.saveProject({ ...p, contract: (await loadExamples()).regression });
  const b = await w.startRun({ projectId: p.id, revision: p.revision, idempotencyKey: 'b' }); await finished(w, b.id);
  assert.ok(w.compare(a.id, b.id).changes.some(c => c.before !== c.after));
});

test('concurrent retries create exactly one job, and changed requests cannot reuse its key', async t => {
  const { workspace: w } = await fixture(t); const p = await project(w);
  const request = { projectId: p.id, revision: p.revision, idempotencyKey: 'parallel' };
  const [a, b] = await Promise.all([w.startRun(request), w.startRun(request)]);
  assert.equal(a.id, b.id); assert.equal(w.summary().runs.length, 1);
  await finished(w, a.id);
  await assert.rejects(w.startRun({ ...request, maxTotalOutputTokens: 2000 }), /another request/);
  const other = await w.saveProject({ name: 'Another', contract: (await loadExamples()).safe });
  await assert.rejects(w.startRun({ ...request, projectId: other.id }), /another request/);
});

test('removing history preserves the request tombstone and cannot cause a duplicate execution after restart', async t => {
  const f = await fixture(t); const w = f.workspace, p = await project(w);
  const input = { projectId: p.id, revision: 1, idempotencyKey: 'completed-and-removed' };
  const run = await w.startRun(input); await finished(w, run.id); await w.remove('runs', run.id);
  await assert.rejects(w.startRun(input), /already ran/);
  const reopened = await f.reopen(); await assert.rejects(reopened.startRun(input), /already ran/);
  assert.equal(reopened.summary().runs.length, 0);
});

test('a storage failure cannot turn an unfinished model job into a reported pass', async t => {
  let complete;
  const f = await fixture(t, { modelRunner: () => new Promise(resolve => { complete = resolve; }) });
  const w = f.workspace, p = await project(w);
  const c = await w.saveConnection({ name: 'Local', provider: 'ollama', model: 'test', baseURL: 'http://localhost:11434/v1' });
  const r = await w.startRun({ projectId: p.id, revision: 1, mode: 'model', connectionId: c.id, idempotencyKey: 'disk-failure' }, { allowModel: true });
  for (let i = 0; i < 100 && !complete; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(complete);
  await rename(w.file, `${w.file}.retained`); await mkdir(w.file);
  complete(await runSuite(p.contract));
  // On Windows the blocked replace is EPERM, which replaceFile retries for ~3 s before giving up.
  for (let i = 0; i < 600 && !w.failure; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.throws(() => w.summary(), /storage is unavailable/);
  await rm(w.file, { recursive: true }); await rename(`${w.file}.retained`, w.file);
  const reopened = await f.reopen(); assert.equal(reopened.run(r.id).status, 'interrupted');
});

test('comparison includes removed test cases so deleted coverage cannot disappear silently', async t => {
  const { workspace: w } = await fixture(t); let p = await project(w);
  const a = await w.startRun({ projectId: p.id, revision: 1, idempotencyKey: 'before-removal' }); await finished(w, a.id);
  const reduced = structuredClone(p.contract); reduced.cases = reduced.cases.slice(0, 1);
  p = await w.saveProject({ ...p, contract: reduced });
  const b = await w.startRun({ projectId: p.id, revision: p.revision, idempotencyKey: 'after-removal' }); await finished(w, b.id);
  assert.ok(w.compare(a.id, b.id).changes.some(c => c.before === true && c.after === null));
});

test('HTTP workspace enforces same origin and control capability; controller cannot request model spending', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-http-'));
  const server = await startStudio({ port: 0, workspaceDirectory: directory });
  t.after(async () => { await server.shutdown(); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = (path, value, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.workspaceToken}`, ...headers }, body: JSON.stringify(value) });
  const p = await (await send('/api/projects', { name: 'HTTP project', contract: (await loadExamples()).safe })).json();
  assert.equal(p.revision, 1);
  assert.equal((await send('/api/projects', {}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await send('/api/control', { tool: 'plumbcheck_list_projects' }, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await fetch(origin + '/api/workspace')).status, 401);
  assert.ok(!(await (await fetch(origin)).text()).includes(server.workspaceToken), 'Public HTML must not disclose the private capability.');
  assert.equal((await send('/api/runs', { projectId: p.id, revision: 1, mode: 'model', idempotencyKey: 'without-consent' })).status, 403);
  const descriptor = JSON.parse(await readFile(join(directory, 'bridge.json'), 'utf8'));
  const auth = { Authorization: `Bearer ${descriptor.token}` };
  const response = await send('/api/control', { tool: 'plumbcheck_run_suite', arguments: { projectId: p.id, revision: 1, mode: 'model', idempotencyKey: 'controller' } }, auth);
  assert.equal(response.status, 200); const r = await response.json(); assert.equal(r.mode, 'fixture');
  assert.equal((await finished(server.workspace, r.id)).status, 'passed');
});
