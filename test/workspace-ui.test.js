import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { startStudio, loadExamples } from '../src/studio.js';

const until = async predicate => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('The expected interface state did not arrive.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

// Execute the actual generated, inlined application in a DOM against a real
// isolated Studio server. No user workspace, credentials or model calls are used.
async function fixture(t, intercept) {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-ui-'));
  let server = await startStudio({ port: 0, workspaceDirectory: directory });
  const examples = await loadExamples();
  const p = await server.workspace.saveProject({ name: 'Saved regression', task: 'Original instructions', contract: examples.regression });
  const q = await server.workspace.saveProject({ name: 'Other project', task: 'Other instructions', contract: examples.safe });
  const origin = new URL(server.uiURL).origin;
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dialogs = [];
  const replies = [];
  const dom = new JSDOM(await (await fetch(origin)).text(), {
    url: server.uiURL, runScripts: 'dangerously', virtualConsole: console,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.fetch = (path, options) => {
        const perform = () => fetch(new URL(path, origin), options);
        return intercept ? intercept(path, perform, options) : perform();
      };
      window.confirm = message => { dialogs.push(message); return replies.shift() ?? false; };
      window.URL.createObjectURL = () => 'blob:synthetic-test-export';
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = () => {};
    },
  });
  const $ = id => dom.window.document.getElementById(id);
  t.after(async () => { dom.window.close(); await server.shutdown(); await rm(directory, { recursive: true, force: true }); assert.deepEqual(errors, []); });
  await until(() => $('editor').value && dom.window.document.querySelector(`[data-project="${p.id}"]`));
  const open = id => dom.window.document.querySelector(`[data-project="${id}"]`).click();
  const save = () => $('project-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  return { dom, $, p, q, examples, open, save, dialogs, replies, directory, get server() { return server; },
    async restart() { const port = server.address().port; await server.shutdown(); server = await startStudio({ port, workspaceDirectory: directory }); return server.uiURL; },
  };
}

test('opening a project protects contract, name and instruction drafts, including example selection', async t => {
  const f = await fixture(t);
  f.open(f.p.id);
  await until(() => f.$('project-name').value === f.p.name);
  assert.equal(f.dialogs.length, 0, 'Opening the first project must not warn about the untouched included example.');
  f.$('example').value = 'safe';
  f.$('example').dispatchEvent(new f.dom.window.Event('change'));
  const edited = f.$('editor').value;
  f.open(f.p.id);
  await until(() => f.dialogs.length || f.$('editor').value !== edited);
  assert.equal(f.$('editor').value, edited, 'Canceling must retain the corrected contract.');
  assert.match(f.dialogs[0], /unsaved/i);
  f.save();
  await until(() => /Project saved/.test(f.$('workspace-message').textContent));
  assert.deepEqual(f.server.workspace.project(f.p.id).contract, f.examples.safe);
  assert.equal(f.server.workspace.project(f.p.id).revision, 2);
  for (const [id, value] of [['project-name', 'Unsaved name'], ['project-task', 'Unsaved instructions']]) {
    f.$(id).value = value;
    const before = [f.$('project-name').value, f.$('project-task').value, f.$('editor').value];
    const count = f.dialogs.length;
    f.open(f.q.id);
    await until(() => f.dialogs.length > count || f.$(id).value !== value);
    assert.deepEqual([f.$('project-name').value, f.$('project-task').value, f.$('editor').value], before);
  }
  f.replies.push(true);
  f.open(f.q.id);
  await until(() => f.$('project-name').value === f.q.name);
  assert.equal(f.$('project-task').value, f.q.task);
});

test('a new launch link refreshes authorization in the same tab and preserves the draft', async t => {
  const f = await fixture(t);
  f.open(f.p.id);
  await until(() => f.$('project-name').value === f.p.name);
  f.$('project-task').value = 'Keep these unsaved instructions';
  const launch = await f.restart();
  f.dom.window.location.hash = new URL(launch).hash;
  await until(() => f.dom.window.location.hash === '');
  assert.equal(f.$('project-task').value, 'Keep these unsaved instructions');
  f.$('sync-list').click();
  await until(() => !f.$('sync-list').disabled);
  assert.match(f.$('workspace-message').textContent, /Pair this device/);
  assert.doesNotMatch(f.$('workspace-message').textContent, /private application launch/);
  assert.equal(f.dom.window.sessionStorage.getItem('plumbcheck-workspace-token'), f.server.workspaceToken);
});

test('new edits during project loading are retained; older loads cannot replace newer choices', async t => {
  const held = [];
  let hold = false;
  const f = await fixture(t, (path, perform) => hold && path.startsWith('/api/projects/') ? new Promise(resolve => held.push(() => resolve(perform()))) : perform());
  hold = true;
  f.open(f.p.id); f.open(f.q.id);
  held[1]();
  await until(() => f.$('project-name').value === f.q.name);
  held[0]();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(f.$('project-name').value, f.q.name);
  f.open(f.p.id);
  f.$('project-task').value = 'Edited while loading';
  held[2]();
  await until(() => f.dialogs.length || f.$('project-name').value === f.p.name);
  assert.equal(f.$('project-task').value, 'Edited while loading');
});

test('export and run failures clear stale success feedback; invalid imports keep data', async t => {
  const f = await fixture(t);
  const draft = f.$('editor').value;
  for (const button of ['download-contract', 'run-editor']) {
    f.$('editor').value = draft;
    f.$('download-contract').click();
    assert.match(f.$('announcement').textContent, /downloaded/);
    f.$('editor').value = '{invalid';
    f.$(button).click();
    assert.equal(f.$('error').hidden, false);
    assert.doesNotMatch(f.$('announcement').textContent, /downloaded/);
  }
  f.$('editor').value = draft;
  f.$('download-contract').click();
  f.$('import-text').value = '{invalid'; f.$('open-pasted').click();
  assert.equal(f.$('editor').value, draft);
  assert.match(f.$('announcement').textContent, /not opened/);
});

test('saving captures submitted inputs and keeps edits made while the save is in flight', async t => {
  let release;
  const f = await fixture(t, (path, perform, options) => path === '/api/projects' && options.method === 'POST'
    ? new Promise(resolve => { release = () => resolve(perform()); }) : perform());
  f.open(f.p.id);
  await until(() => f.$('project-name').value === f.p.name);
  f.$('project-task').value = 'Submitted instructions';
  f.save();
  await until(() => release);
  f.$('project-task').value = 'Newer instructions';
  f.open(f.q.id);
  assert.equal(f.$('project-name').value, f.p.name, 'Opening a different project must wait for the save.');
  release();
  await until(() => /Project saved/.test(f.$('workspace-message').textContent));
  assert.equal(f.server.workspace.project(f.p.id).task, 'Submitted instructions');
  assert.equal(f.$('project-task').value, 'Newer instructions');
  assert.match(f.$('workspace-message').textContent, /Newer edits/);
  f.open(f.q.id);
  await until(() => f.dialogs.length);
  assert.equal(f.$('project-task').value, 'Newer instructions');
});

test('new-project cancellation preserves metadata and a stale response cannot overwrite a refreshed session', async t => {
  let release;
  let hold = false;
  const f = await fixture(t, (path, perform) => hold && path.startsWith('/api/projects/')
    ? new Promise(resolve => { release = () => resolve(perform()); }) : perform());
  f.open(f.p.id);
  await until(() => f.$('project-name').value === f.p.name);
  f.$('project-name').value = 'Keep my name';
  f.$('new-project').click();
  assert.equal(f.$('project-name').value, 'Keep my name');
  assert.match(f.dialogs[0], /unsaved/);
  hold = true; f.open(f.q.id);
  await until(() => release);
  const launch = await f.restart();
  f.dom.window.location.hash = new URL(launch).hash;
  await until(() => /session refreshed/.test(f.$('workspace-message').textContent));
  release();
  await until(() => /session changed/.test(f.$('workspace-message').textContent));
  assert.equal(f.$('project-name').value, 'Keep my name');
  assert.equal(f.$('project-task').value, f.p.task);
  assert.equal(f.dom.window.location.hash, '');
});

test('file-import and asynchronous runner errors replace previous success messages', async t => {
  const f = await fixture(t, (path, perform) => path === '/api/run'
    ? Promise.resolve(new Response(JSON.stringify({ error: 'Synthetic runner failure' }), { status: 400 })) : perform());
  const before = f.$('editor').value;
  f.$('download-contract').click();
  f.$('run-editor').click();
  await until(() => f.$('error').textContent === 'Synthetic runner failure');
  assert.match(f.$('announcement').textContent, /could not run/);
  assert.equal(f.$('editor').value, before);
  f.$('download-contract').click();
  Object.defineProperty(f.$('artifact-file'), 'files', { value: [{ name: 'invalid.json', size: 8, text: async () => '{invalid' }] });
  f.$('artifact-file').dispatchEvent(new f.dom.window.Event('change'));
  await until(() => /File was not opened/.test(f.$('announcement').textContent));
  assert.equal(f.$('editor').value, before);
  assert.equal(f.$('error').hidden, false);
});
