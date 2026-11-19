import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const bundle = build({ entryPoints: [fileURLToPath(new URL('../mobile/entry.js', import.meta.url))], bundle: true, write: false, format: 'iife', platform: 'browser', alias: { 'node:util': fileURLToPath(new URL('../src/portable-util.js', import.meta.url)) } });
const until = async predicate => { const deadline = Date.now() + 3000; while (!predicate()) { if (Date.now() > deadline) assert.fail('Mobile interface did not reach the expected state.'); await new Promise(resolve => setTimeout(resolve, 10)); } };
async function phone(t, storage = {}) {
  const errors = [], replies = [], dialogs = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(await readFile(new URL('../mobile/index.html', import.meta.url), 'utf8'), {
    url: 'https://plumbcheck.local/', runScripts: 'outside-only', virtualConsole: console,
    beforeParse(window) {
      for (const name of ['TextEncoder','TextDecoder','Response','Request','Headers','AbortController','AbortSignal','ReadableStream','WritableStream','TransformStream','structuredClone']) window[name] = globalThis[name];
      Object.defineProperty(window, 'crypto', { value: crypto });
      window.confirm = text => { dialogs.push(text); return replies.shift() ?? false; };
      window.fetch = () => { throw new Error('Offline builder must not make a network request.'); };
      for (const [key, value] of Object.entries(storage)) window.localStorage.setItem(key, value);
    },
  });
  dom.window.eval((await bundle).outputFiles[0].text);
  t.after(() => { dom.window.close(); assert.deepEqual(errors, []); });
  const $ = id => dom.window.document.getElementById(id);
  const root = $('scenario-builder'), field = selector => root.querySelector(selector);
  const submit = () => field('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  return { dom, $, field, submit, dialogs, replies, project: () => JSON.parse(dom.window.localStorage.getItem('plumbcheck-project')), evidence: () => JSON.parse(dom.window.localStorage.getItem('plumbcheck-report')) };
}

test('actual mobile bundle builds a test, fails and corrects the same scenario, and restores its evidence', async t => {
  const f = await phone(t);
  f.field('[data-planned]').value = 'WRONG-ID'; f.submit();
  await until(() => /Project saved/.test(f.field('[data-message]').textContent));
  f.$('run').click(); await until(() => /0\/1 passed/.test(f.$('message').textContent));
  assert.equal(f.evidence().report.passed, false);
  f.field('[data-planned]').value = 'ORD-1042'; f.submit();
  await until(() => f.project().revision === 2);
  f.$('run').click(); await until(() => /1\/1 passed/.test(f.$('message').textContent));
  assert.equal(f.evidence().report.cases.length, 1);
  const data = Object.fromEntries(Object.keys(f.dom.window.localStorage).map(key => [key, f.dom.window.localStorage.getItem(key)]));
  const restored = await phone(t, data);
  assert.match(restored.$('message').textContent, /without rerunning/);
  assert.equal(restored.evidence().report.passed, true);
  assert.equal(restored.project().revision, 2);
});

test('mobile builder preserves unsaved instructions and existing draft on cancellation or storage failure', async t => {
  const f = await phone(t);
  f.$('model-task').value = 'Keep these instructions';
  f.submit();
  await until(() => /Creation canceled/.test(f.field('[data-message]').textContent));
  assert.equal(f.$('model-task').value, 'Keep these instructions');
  const before = [f.$('name').value, f.$('contract').value, f.$('model-task').value];
  const original = f.dom.window.Storage.prototype.setItem;
  f.dom.window.Storage.prototype.setItem = function(key, value) { if (key === 'plumbcheck-project') throw new Error('Synthetic storage quota exhausted'); return original.call(this, key, value); };
  f.replies.push(true); f.submit();
  await until(() => /quota exhausted/.test(f.field('[data-message]').textContent));
  assert.deepEqual([f.$('name').value, f.$('contract').value, f.$('model-task').value], before);
  assert.equal(f.project(), null);
});

test('mobile builder saves a must-not template and the offline check reports the skipped answer check', async t => {
  const f = await phone(t, { 'plumbcheck-ollama': JSON.stringify({ server: 'http://127.0.0.1:11434', model: 'qwen3.5:4b' }) });
  f.replies.push(true);
  f.field('[data-template-kind]').value = 'injected-instruction'; f.field('[data-template]').click();
  assert.equal(f.field('[data-guard-kind]').value, 'injection');
  f.submit();
  await until(() => /Project saved/.test(f.field('[data-message]').textContent));
  const contract = f.project().contract;
  assert.deepEqual(contract.cases[0].expect.never, ['orders.delete']);
  assert.match(f.$('message').textContent, /Recommended: authorize the Ollama run/);
  f.$('run').click(); await until(() => /1\/1 passed/.test(f.$('message').textContent));
  assert.equal(f.evidence().report.cases[0].skippedOutputChecks, 1);
});
