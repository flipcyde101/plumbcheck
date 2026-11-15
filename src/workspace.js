import { mkdir, readFile, rename, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { validateSuite } from './validation.js';
import { runSuite } from './runner.js';
import { redact } from './redact.js';

export class WorkspaceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new WorkspaceError(message, status); };
const text = (value, name, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(`${name} is required (maximum ${max} characters).`);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const providerTypes = ['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'compatible'];

export function connectionConfig(input) {
  if (!providerTypes.includes(input?.provider)) fail('Choose a supported provider.');
  const value = { name: text(input.name, 'Connection name'), provider: input.provider, model: text(input.model, 'Model ID') };
  const local = ['ollama', 'lmstudio'].includes(value.provider);
  if (local || value.provider === 'compatible') {
    const url = new URL(text(input.baseURL, 'Server URL', 1000));
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) fail('Use HTTPS, or HTTP on localhost. Do not put credentials in the URL.');
    if (local && !loopback) fail('Local model connections must use localhost.');
    value.baseURL = url.href.replace(/\/$/, '');
  }
  return value;
}

export function memoryVault() {
  const keys = new Map();
  return { persistent: false, async set(id, value) { keys.set(id, value); }, async get(id) { return keys.get(id); }, async delete(id) { keys.delete(id); } };
}

/** One process owns a workspace. Mutations commit atomically before publication. */
export class Workspace {
  static async open(directory, { vault = memoryVault(), modelRunner } = {}) {
    const workspace = new Workspace();
    workspace.directory = resolve(directory);
    workspace.vault = vault;
    workspace.modelRunner = modelRunner;
    workspace.controllers = new Map();
    workspace.tail = Promise.resolve();
    await mkdir(workspace.directory, { recursive: true, mode: 0o700 });
    workspace.file = join(workspace.directory, 'workspace.json');
    workspace.lock = join(workspace.directory, 'workspace.lock');
    try { workspace.lockHandle = await open(workspace.lock, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let pid;
      try { pid = JSON.parse(await readFile(workspace.lock, 'utf8')).pid; } catch { fail('Workspace lock is unreadable. Review it before reopening.', 409); }
      if (!Number.isInteger(pid) || pid < 1) fail('Workspace lock is invalid.', 409);
      try { process.kill(pid, 0); fail('This workspace is already open in another process.', 409); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      await unlink(workspace.lock);
      workspace.lockHandle = await open(workspace.lock, 'wx', 0o600);
    }
    await workspace.lockHandle.writeFile(JSON.stringify({ pid: process.pid }));
    try {
      let raw;
      try { raw = await readFile(workspace.file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      workspace.state = raw ? JSON.parse(raw) : { version: 1, projects: [], connections: [], runs: [] };
      const s = workspace.state;
      if (s.version !== 1 || !Array.isArray(s.projects) || !Array.isArray(s.connections) || !Array.isArray(s.runs)) fail('Unsupported or damaged workspace. Restore a reviewed backup; data was not reset.');
      if (s.requests === undefined) s.requests = s.runs.map(r => ({ keyHash: hash({ key: r.idempotencyKey }), fingerprint: r.fingerprint, runId: r.id }));
      if (!Array.isArray(s.requests)) fail('Workspace request history is damaged. Data was not reset.');
      for (const run of s.runs) if (['queued', 'running'].includes(run.status)) { run.status = 'interrupted'; run.error = 'The application stopped before this run finished. Start a new run explicitly.'; run.finishedAt = new Date().toISOString(); }
      await workspace.commit(() => {});
      return workspace;
    } catch (error) { await workspace.release(); throw error; }
  }
  async commit(change) {
    const operation = this.tail.then(async () => {
      if (this.failure) fail(this.failure, 503);
      const next = structuredClone(this.state);
      const result = change(next);
      const payload = JSON.stringify(next, null, 2);
      if (Buffer.byteLength(payload) > 50_000_000) fail('Workspace storage limit reached. Export and remove older runs.', 413);
      const temporary = `${this.file}.${randomUUID()}.tmp`;
      try {
        const output = await open(temporary, 'wx', 0o600);
        try { await output.writeFile(payload); await output.sync(); } finally { await output.close(); }
        await rename(temporary, this.file);
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      this.state = next;
      return structuredClone(result);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  summary() {
    if (this.failure) fail(this.failure, 503);
    return structuredClone({ version: 1, projects: this.state.projects.map(({ contract, ...p }) => ({ ...p, cases: contract.cases.length })), connections: this.state.connections, runs: this.state.runs.map(({ report, ...r }) => r), persistentSecrets: this.vault.persistent });
  }
  project(id) { return structuredClone(this.state.projects.find(p => p.id === id) ?? fail('Project not found.', 404)); }
  run(id) { if (this.failure) fail(this.failure, 503); return structuredClone(this.state.runs.find(r => r.id === id) ?? fail('Run not found.', 404)); }
  async saveProject(input) {
    const contract = validateSuite(input.contract, { mode: input.contract?.cases?.every(c => !Object.hasOwn(c, 'calls')) ? 'agent' : 'planned' });
    if (Buffer.byteLength(JSON.stringify(contract)) > 1_000_000) fail('Contract exceeds 1 MB.', 413);
    const name = text(input.name, 'Project name');
    const task = text(input.task || 'Complete the task described by the test input. Use the provided tools.', 'Agent instructions', 12000);
    return this.commit(s => {
      let p = input.id && s.projects.find(p => p.id === input.id);
      if (input.id && !p) fail('Project not found.', 404);
      if (p && input.revision !== p.revision) fail('This project changed. Reload before saving.', 409);
      if (!p) { if (s.projects.length >= 100) fail('Maximum 100 projects.'); p = { id: randomUUID(), revision: 0 }; s.projects.push(p); }
      Object.assign(p, { name, task, contract, revision: p.revision + 1, contractHash: hash(contract), updatedAt: new Date().toISOString() });
      return p;
    });
  }
  async saveConnection(input) {
    const config = connectionConfig(input);
    const id = input.id || randomUUID();
    const old = this.state.connections.find(c => c.id === id);
    if (input.id && !old) fail('Connection not found.', 404);
    if (old && this.state.runs.some(r => r.connectionId === id && ['queued', 'running'].includes(r.status))) fail('Cancel the active run before editing this connection.', 409);
    if (!old && this.state.connections.length >= 20) fail('Maximum 20 connections.');
    const apiKey = input.apiKey;
    if (apiKey !== undefined && (typeof apiKey !== 'string' || apiKey.length > 4096 || /[\r\n]/.test(apiKey))) fail('Invalid API key.');
    const destinationChanged = old && (old.provider !== config.provider || old.baseURL !== config.baseURL);
    if (destinationChanged && !apiKey && ['openai', 'anthropic', 'google'].includes(config.provider)) fail('Enter a credential for the new provider. Saved keys are not moved between services.');
    const credentialId = apiKey || destinationChanged ? randomUUID() : old?.credentialId || id;
    if (apiKey) await this.vault.set(credentialId, apiKey);
    try { await this.commit(s => {
      const value = { ...config, id, credentialId };
      const i = s.connections.findIndex(c => c.id === id);
      if (i < 0 && s.connections.length >= 20) fail('Maximum 20 connections.');
      if (i < 0) s.connections.push(value); else s.connections[i] = value;
    }); } catch (error) { if (apiKey) await this.vault.delete(credentialId); throw error; }
    if (old && (old.credentialId || id) !== credentialId) await this.vault.delete(old.credentialId || id);
    return { ...config, id, credentialAvailable: Boolean(await this.vault.get(credentialId)) };
  }
  async remove(kind, id) {
    if (!['projects', 'connections', 'runs'].includes(kind)) fail('Invalid collection.');
    if (this.state.runs.some(r => ['queued', 'running'].includes(r.status) && (r.id === id || r.projectId === id || r.connectionId === id))) fail('Cancel the active run first.', 409);
    const credentialId = kind === 'connections' ? this.state.connections.find(c => c.id === id)?.credentialId || id : null;
    await this.commit(s => { const i = s[kind].findIndex(item => item.id === id); if (i < 0) fail('Item not found.', 404); s[kind].splice(i, 1); });
    if (kind === 'connections') await this.vault.delete(credentialId);
  }
  async startRun(input, { allowModel = false } = {}) {
    const project = this.project(input.projectId);
    if (input.revision !== project.revision) fail('Project revision changed. Reload before running.', 409);
    const mode = input.mode || 'fixture';
    if (!['fixture', 'model'].includes(mode)) fail('Unsupported run mode.');
    if (mode === 'model' && !allowModel) fail('Model spending is not enabled for this caller.', 403);
    const connection = mode === 'model' ? this.state.connections.find(c => c.id === input.connectionId) ?? fail('Choose a model connection.') : null;
    if (mode === 'fixture' && project.contract.cases.some(c => !Array.isArray(c.calls))) fail('This contract needs an agent. Choose model execution or use the agent CLI.');
    const key = text(input.idempotencyKey, 'Run request ID', 128);
    const timeoutMs = input.timeoutMs ?? 60_000;
    const maxSteps = input.maxSteps ?? 8;
    const maxOutputTokens = input.maxOutputTokens ?? 2000;
    const maxTotalOutputTokens = input.maxTotalOutputTokens ?? 10000;
    for (const [n, v, lo, hi] of [['timeoutMs', timeoutMs, 1000, 300000], ['maxSteps', maxSteps, 1, 30], ['maxOutputTokens', maxOutputTokens, 64, 16000], ['maxTotalOutputTokens', maxTotalOutputTokens, 64, 100000]]) if (!Number.isInteger(v) || v < lo || v > hi) fail(`${n} must be between ${lo} and ${hi}.`);
    const limits = { timeoutMs, maxSteps, maxOutputTokens, maxTotalOutputTokens };
    const fingerprint = hash({ projectId: project.id, revision: project.revision, mode, connection, limits });
    const keyHash = hash({ key });
    const recorded = this.state.requests.find(r => r.keyHash === keyHash);
    if (recorded && !this.state.runs.some(r => r.id === recorded.runId)) fail('This request already ran and its result was removed. Start a new request explicitly.', 409);
    const prior = this.state.runs.find(r => r.idempotencyKey === key);
    if (prior) { if (prior.fingerprint !== fingerprint) fail('Run request ID belongs to another request.', 409); return this.run(prior.id); }
    if (this.failure) fail(this.failure, 503);
    if (this.controllers.size >= 4) fail('Four jobs are already active. Wait or cancel one.', 429);
    const run = { id: randomUUID(), projectId: project.id, projectName: project.name, revision: project.revision, contractHash: project.contractHash, mode, connectionId: connection?.id ?? null, provider: connection?.provider ?? null, model: connection?.model ?? null, idempotencyKey: key, fingerprint, status: 'queued', createdAt: new Date().toISOString(), limits };
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    try {
      const reserved = await this.commit(s => {
        const recorded = s.requests.find(r => r.keyHash === keyHash);
        if (recorded && !s.runs.some(r => r.id === recorded.runId)) fail('This request already ran and its result was removed. Start a new request explicitly.', 409);
        const existing = s.runs.find(r => r.idempotencyKey === key);
        if (existing) { if (existing.fingerprint !== fingerprint) fail('Run request ID belongs to another request.', 409); return existing; }
        if (s.runs.length >= 500) fail('Run history is full. Export and remove older runs.');
        if (s.requests.length >= 10000) fail('Workspace request ledger reached 10,000 entries. Archive this workspace before creating a new one.');
        s.requests.push({ keyHash, fingerprint, runId: run.id });
        s.runs.unshift(run); return run;
      });
      if (reserved.id !== run.id) { this.controllers.delete(run.id); return reserved; }
    } catch (error) { this.controllers.delete(run.id); throw error; }
    setImmediate(() => this.execute(run.id, project, connection, controller).catch(() => {
      this.failure = 'Workspace storage is unavailable. Close the app, check available disk space and permissions, then reopen it. No new results can be reported until storage recovers.';
      this.controllers.delete(run.id);
    }));
    return structuredClone(run);
  }
  async execute(id, project, connection, controller) {
    let usage;
    const timer = setTimeout(() => controller.abort(new Error('Run deadline exceeded.')), this.run(id).limits.timeoutMs);
    try {
      if (controller.signal.aborted) return;
      await this.commit(s => { const r = s.runs.find(r => r.id === id); if (r.status === 'cancelled') return; r.status = 'running'; r.startedAt = new Date().toISOString(); });
      controller.signal.throwIfAborted();
      const run = this.run(id);
      const report = run.mode === 'fixture' ? await runSuite(project.contract) : await this.modelRunner({ project, connection, apiKey: await this.vault.get(connection.credentialId || connection.id), limits: run.limits, signal: controller.signal, onUsage: value => { usage = value; } });
      if (controller.signal.aborted) throw controller.signal.reason;
      if (run.mode === 'model') report.execution = { runner: 'builtin-model', provider: connection.provider, model: connection.model, connectionName: connection.name, contractRevision: project.revision, contractHash: project.contractHash, limits: run.limits, ...(usage ? { usage } : {}) };
      const safe = redact(report);
      if (Buffer.byteLength(JSON.stringify(safe)) > 1_000_000) fail('Run evidence exceeded 1 MB. Reduce the scenario.');
      await this.commit(s => { const r = s.runs.find(r => r.id === id); if (r.status === 'cancelled') return; Object.assign(r, { report: safe, status: report.passed ? 'passed' : 'failed', summary: report.summary, ...(usage ? { usage } : {}), finishedAt: new Date().toISOString() }); });
    } catch (error) {
      await this.commit(s => { const r = s.runs.find(r => r.id === id); if (r.status !== 'cancelled') Object.assign(r, { status: 'error', error: controller.signal.aborted ? 'Run deadline exceeded or application is closing.' : 'The runner could not finish. Check the connection, model capability, credentials, and test configuration.', ...(usage ? { usage } : {}), finishedAt: new Date().toISOString() }); });
    } finally { clearTimeout(timer); this.controllers.delete(id); }
  }
  async cancel(id) {
    this.run(id);
    await this.commit(s => { const r = s.runs.find(r => r.id === id); if (!['queued', 'running'].includes(r.status)) fail('Run already finished.', 409); r.status = 'cancelled'; r.finishedAt = new Date().toISOString(); });
    this.controllers.get(id)?.abort(new Error('Cancelled by user.'));
    return this.run(id);
  }
  compare(a, b) {
    const left = this.run(a), right = this.run(b);
    if (!left.report || !right.report || left.projectId !== right.projectId) fail('Choose two completed runs from the same project.');
    const names = [...new Set([...left.report.cases, ...right.report.cases].map(c => c.name))];
    return { left: a, right: b, changes: names.map(name => {
      const previous = left.report.cases.find(c => c.name === name), current = right.report.cases.find(c => c.name === name);
      return { name, before: previous?.passed ?? null, after: current?.passed ?? null, failureCodes: current?.failures.map(f => f.code) ?? [] };
    }) };
  }
  async release() { await this.lockHandle?.close(); await unlink(this.lock).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  async close() {
    for (const controller of this.controllers.values()) controller.abort(new Error('Application closing.'));
    while (this.controllers.size) await new Promise(resolve => setTimeout(resolve, 20));
    await this.tail; await this.release();
  }
}
