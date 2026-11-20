// 1.0 must read files written by 0.2 unchanged. The fixtures in test/fixtures/compat/
// were produced by 0.2.0-preview.5 before any 1.0 change; never regenerate them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateSuite, redact, runSuite } from '../src/index.js';
import { createArtifactTools } from '../src/artifacts.js';
import { Workspace } from '../src/workspace.js';

const fixture = name => new URL(`./fixtures/compat/${name}`, import.meta.url);
const read = async name => readFile(fixture(name), 'utf8');
const artifacts = createArtifactTools(redact, validateSuite);

test('a 0.2 contract validates, opens and still runs unchanged', async () => {
  const source = await read('contract-0.2.json');
  const contract = JSON.parse(source);
  assert.equal(validateSuite(structuredClone(contract)).name, contract.name);
  const opened = artifacts.open(source);
  assert.equal(opened.kind, 'contract');
  assert.equal(opened.runner, 'planned');
  const report = await runSuite(contract);
  assert.equal(report.version, 1);
  assert.equal(report.cases.length, contract.cases.length);
});

test('a 0.2 report opens through the artifacts reader with its evidence intact', async () => {
  const source = await read('report-0.2.json');
  const original = JSON.parse(source);
  const opened = artifacts.open(source);
  assert.equal(opened.kind, 'report');
  assert.equal(opened.value.passed, original.passed);
  assert.deepEqual(opened.value.summary, original.summary);
  assert.deepEqual(opened.value.cases.map(c => c.name), original.cases.map(c => c.name));
});

test('a 0.2 workspace reopens with its projects, connections and run history', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-compat-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFile(fixture('workspace-0.2.json'), join(directory, 'workspace.json'));
  const original = JSON.parse(await read('workspace-0.2.json'));
  const workspace = await Workspace.open(directory);
  try {
    const summary = workspace.summary();
    assert.deepEqual(summary.projects.map(p => p.name), original.projects.map(p => p.name));
    assert.deepEqual(summary.connections.map(c => c.name), original.connections.map(c => c.name));
    assert.deepEqual(summary.runs.map(r => [r.id, r.status]), original.runs.map(r => [r.id, r.status]));
    const run = workspace.run(original.runs[0].id);
    assert.deepEqual(run.report.summary, original.runs[0].report.summary);
  } finally { await workspace.close(); }
});

test('the Windows user-data location stays pinned (moving it would orphan 0.2 workspaces)', async () => {
  const builder = JSON.parse(await readFile(new URL('../desktop/electron-builder.json', import.meta.url), 'utf8'));
  assert.equal(builder.appId, 'com.plumbnote.plumbcheck');
  assert.equal(builder.productName, 'PlumbCheck');
  const main = await readFile(new URL('../desktop/runtime/main.cjs', import.meta.url), 'utf8');
  assert.ok(main.includes("app.setPath('userData', path.join(app.getPath('appData'), 'PlumbCheck'));"), 'main.cjs must keep %APPDATA%\\PlumbCheck');
});
