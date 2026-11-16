import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSnapshotTools } from '../src/snapshot.js';
import { createArtifactTools } from '../src/artifacts.js';
import { validateSuite } from '../src/validation.js';
import { runSuite } from '../src/runner.js';
import { redact } from '../src/redact.js';
import { Workspace } from '../src/workspace.js';
import { loadExamples } from '../src/studio.js';
import { createEvidenceStore } from '../mobile/evidence.js';

const artifacts = createArtifactTools(redact, validateSuite), snapshots = createSnapshotTools(artifacts);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot() {
  const contract = (await loadExamples()).safe;
  return { version: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDevice: 'QA Android', project: { name: 'Phone support', task: 'Look up the order.', revision: 7, contract }, report: await runSuite(contract), reportContext: { contractRevision: 7, contractHash: hash(contract) } };
}
async function workspace(t) {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-import-')), w = await Workspace.open(directory, { modelRunner() { throw new Error('Import must never start inference.'); } });
  t.after(async () => { await w.close(); await rm(directory, { recursive: true, force: true }); });
  return w;
}
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test('imports preserve original evidence context and mark stale task revisions even when contract hashes match', async t => {
  const w = await workspace(t), input = await snapshot();
  const imported = await w.importSnapshot(input, 'https://relay.example');
  assert.equal(imported.run.source.reportMatchesSnapshot, true); assert.equal(imported.run.source.contractRevision, 7);
  assert.equal(imported.project.revision, 1); assert.equal(imported.run.revision, null); assert.equal(w.controllers.size, 0);
  input.id = randomUUID(); input.project.revision = 8; input.project.task = 'Changed instructions';
  const stale = await w.importSnapshot(input, 'https://relay.example');
  assert.equal(stale.run.source.reportMatchesSnapshot, false); assert.equal(stale.run.source.contractRevision, 7);
  assert.equal(stale.run.contractHash, imported.run.contractHash);
  const local = await w.startRun({ projectId: stale.project.id, revision: 1, idempotencyKey: 'after-import' });
  for (let i = 0; i < 100 && !w.run(local.id).report; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(w.run(local.id).status, 'passed'); assert.equal(w.compare(stale.run.id, local.id).changes.every(c => c.before && c.after), true);
});

test('malformed evidence, inconsistent identity and storage failure cannot leave half an imported project', async t => {
  const w = await workspace(t), input = await snapshot();
  const broken = structuredClone(input); broken.report.summary.passed = 999;
  await assert.rejects(w.importSnapshot(broken, 'https://relay.example'), /summary/i);
  assert.equal(w.summary().projects.length, 0); assert.equal(w.summary().runs.length, 0);
  const originalFile = w.file; w.file = join(w.directory, 'missing', 'workspace.json');
  await assert.rejects(w.importSnapshot(input, 'https://relay.example'), { code: 'ENOENT' });
  assert.equal(w.summary().projects.length, 0); assert.equal(w.summary().runs.length, 0); w.file = originalFile;
  const first = await w.importSnapshot(input, 'https://relay.example'); input.project.task = 'Mutated immutable snapshot';
  await assert.rejects(w.importSnapshot(input, 'https://relay.example'), /immutable snapshot changed/);
  assert.equal(w.project(first.project.id).task, 'Look up the order.');
});

test('snapshot validation rejects unsupported metadata and contradictory model provenance', async () => {
  const input = await snapshot();
  for (const edit of [s => s.project.revision = Number.MAX_SAFE_INTEGER + 1, s => s.sourceDevice = 'x'.repeat(101), s => s.createdAt = 'not-a-date', s => s.reportContext.contractHash = 'not-a-hash', s => s.project.contract = s.report]) {
    const broken = structuredClone(input); edit(broken); assert.throws(() => snapshots.snapshot(broken));
  }
  input.report.mode = 'agent-replay'; input.report.execution = { runner: 'builtin-model', provider: 'ollama', model: 'qwen3.5:4b', connectionName: 'QA', contractRevision: 7, contractHash: input.reportContext.contractHash, limits: { timeoutMs: 1000, maxSteps: 4, maxOutputTokens: 100, maxTotalOutputTokens: 400 } };
  assert.equal(snapshots.snapshot(input).report.execution.model, 'qwen3.5:4b');
  input.reportContext.contractRevision = 8;
  assert.throws(() => snapshots.snapshot(input), /disagrees/);
});

test('explicit reimport restores a removed report without replacing locally edited scenarios', async t => {
  const w = await workspace(t), input = await snapshot();
  const first = await w.importSnapshot(input, 'https://relay.example');
  const changed = structuredClone(first.project); changed.contract.name = 'Local scenario edits';
  await w.saveProject(changed); await w.remove('runs', first.run.id);
  const restored = await w.importSnapshot(input, 'https://relay.example');
  assert.equal(restored.project.contract.name, 'Local scenario edits'); assert.equal(restored.project.revision, 2);
  assert.equal(restored.reportRestored, true); assert.notEqual(restored.run.id, first.run.id);
  assert.deepEqual(restored.run.report, first.run.report); assert.equal(restored.run.source.reportMatchesSnapshot, true);
  assert.equal(w.summary().projects.length, 1); assert.equal(w.summary().runs.length, 1);
});

test('mobile evidence persists source, context and report atomically and keeps legacy reports readable', async () => {
  const input = await snapshot(), memory = storage();
  memory.setItem('plumbcheck-report', JSON.stringify(input.report));
  const store = createEvidenceStore(memory, artifacts, snapshots);
  assert.equal(store.read().origin.kind, 'file'); assert.equal(store.read().context, null);
  const saved = store.write({ report: input.report, context: input.reportContext, origin: { kind: 'sync', deviceName: input.sourceDevice, snapshotRevision: 7 } });
  assert.deepEqual(createEvidenceStore(memory, artifacts, snapshots).read(), saved);
  const failed = createEvidenceStore({ ...memory, setItem() { throw new Error('Quota exceeded'); } }, artifacts, snapshots);
  await assert.rejects(async () => failed.write({ report: input.report, context: { ...input.reportContext, contractRevision: 9 }, origin: { kind: 'local' } }), /Quota/);
  assert.deepEqual(store.read(), saved);
  const corrupt = structuredClone(input.report); corrupt.summary.failed = 42;
  assert.throws(() => store.write({ report: corrupt }), /summary/i); assert.deepEqual(store.read(), saved);
  store.write(null); assert.equal(store.read().report, null, 'Clearing evidence must not resurrect an older legacy report.');
  memory.setItem('plumbcheck-report', '{"storageVersion":999}'); assert.throws(() => store.read(), /damaged/);
});
