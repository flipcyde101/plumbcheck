// The update banner in the real generated page, with the desktop bridge mocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { startStudio } from '../src/studio.js';

const until = async predicate => {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('The expected interface state did not arrive.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

async function page(t, desktop) {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-update-ui-'));
  const server = await startStudio({ port: 0, workspaceDirectory: directory });
  const origin = new URL(server.uiURL).origin;
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(await (await fetch(origin)).text(), {
    url: server.uiURL, runScripts: 'dangerously', virtualConsole,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.fetch = (path, options) => fetch(new URL(path, origin), options);
      window.confirm = () => false;
      if (desktop) window.plumbcheckDesktop = Object.freeze(desktop);
    },
  });
  t.after(async () => { dom.window.close(); await server.shutdown(); await rm(directory, { recursive: true, force: true }); assert.deepEqual(errors, []); });
  const $ = id => dom.window.document.getElementById(id);
  await until(() => !dom.window.document.querySelector('[data-view="workspace"]').hidden);
  return { dom, $ };
}

const url = 'https://github.com/stepan4002/plumbcheck/releases/tag/v1.1.0';

test('a newer release shows a dismissible banner that links to the release page', async t => {
  const calls = [];
  const f = await page(t, { controlSetup: async () => ({}), updateStatus: async () => ({ enabled: true, available: true, version: '1.1.0', url }), setUpdateChecks: async enabled => { calls.push(enabled); return { enabled, available: false }; } });
  await until(() => !f.$('update-banner').hidden);
  assert.equal(f.$('update-text').textContent, 'PlumbCheck 1.1.0 is available.');
  assert.equal(f.$('update-link').href, url);
  assert.equal(f.$('update-link').target, '_blank');
  assert.equal(f.$('update-toggle-row').hidden, false);
  assert.equal(f.$('update-toggle').checked, true);
  f.$('update-dismiss').click();
  assert.equal(f.$('update-banner').hidden, true);
  f.$('update-toggle').checked = false;
  f.$('update-toggle').dispatchEvent(new f.dom.window.Event('change'));
  await until(() => calls.length === 1);
  assert.deepEqual(calls, [false]);
  await until(() => /Update checks are off/.test(f.$('workspace-message').textContent));
});

test('no banner when there is no update, when checks are off, or for a link outside the release pages', async t => {
  for (const status of [{ enabled: true, available: false }, { enabled: false, available: false }, { enabled: true, available: true, version: '9.9.9', url: 'https://evil.example/download' }]) {
    const f = await page(t, { updateStatus: async () => status, setUpdateChecks: async () => status });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.$('update-banner').hidden, true, JSON.stringify(status));
    assert.equal(f.$('update-toggle').checked, status.enabled);
  }
});

test('a failing bridge or a browser without the desktop bridge shows nothing', async t => {
  const failing = await page(t, { updateStatus: async () => { throw new Error('ipc'); }, setUpdateChecks: async () => ({}) });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(failing.$('update-banner').hidden, true);
  const browser = await page(t, null);
  assert.equal(browser.$('update-banner').hidden, true);
  assert.equal(browser.$('update-toggle-row').hidden, true, 'Studio in a browser never offers update checks');
});

test('a late first answer cannot undo the user turning checks off', async t => {
  let answerFirst;
  const calls = [];
  const f = await page(t, {
    updateStatus: () => new Promise(resolve => { answerFirst = resolve; }),
    setUpdateChecks: async enabled => { calls.push(enabled); return { enabled, available: false }; },
  });
  assert.equal(f.$('update-toggle').checked, true, 'checks are on by default, before the first answer arrives');
  f.$('update-toggle').checked = false;
  f.$('update-toggle').dispatchEvent(new f.dom.window.Event('change'));
  await until(() => /Update checks are off/.test(f.$('workspace-message').textContent));
  answerFirst({ enabled: true, available: true, version: '1.1.0', url });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(calls, [false]);
  assert.equal(f.$('update-toggle').checked, false, 'the stale answer must not re-tick the box');
  assert.equal(f.$('update-banner').hidden, true, 'the stale answer must not show the banner');
});
