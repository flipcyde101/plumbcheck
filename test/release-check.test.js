import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/release-check.mjs', import.meta.url));
const verified = (id, scope = '1.0') => ({ id, scope, status: 'verified', evidence: 'recorded' });
const pending = (id, scope = '1.0') => ({ id, scope, status: 'pending', reason: 'not yet' });

async function check(t, gates) {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-gates-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'gates.json');
  await writeFile(file, typeof gates === 'string' ? gates : JSON.stringify({ version: 1, channel: 'test', required: gates }));
  const run = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
  return { code: run.status, out: run.stdout + run.stderr };
}

test('all required gates verified exits 0', async t => {
  const r = await check(t, [verified('a'), verified('b')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS a/);
});

test('one pending required gate exits 1 and names it', async t => {
  const r = await check(t, [verified('a'), pending('b')]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /OPEN b/);
  assert.match(r.out, /blocked by 1 unverified required gate: b/);
});

test('a gate without a scope counts as required (fails closed)', async t => {
  const r = await check(t, [verified('a'), { id: 'b', status: 'pending', reason: 'x' }]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /OPEN b \(no scope: treated as required\)/);
});

test('an unknown scope counts as required', async t => {
  const r = await check(t, [pending('b', 'someday')]);
  assert.equal(r.code, 1, r.out);
});

test('experimental and post-1.0 pending gates are reported but do not block', async t => {
  const r = await check(t, [verified('a'), pending('phone', 'experimental'), pending('audit', 'post-1.0')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /EXPERIMENTAL pending phone/);
  assert.match(r.out, /POST-1\.0 pending audit/);
});

test('scope names that are Object.prototype properties do not make a gate non-blocking', async t => {
  for (const scope of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const r = await check(t, [pending('b', scope)]);
    assert.equal(r.code, 1, `${scope}: ${r.out}`);
    assert.match(r.out, /OPEN b/);
  }
});

test('malformed gate lists exit 2 instead of passing or crashing', async t => {
  for (const required of [[], [null], ['text'], [{ id: 'a' }], [{ status: 'verified' }], [verified('a'), verified('a')]]) {
    const r = await check(t, required);
    assert.equal(r.code, 2, `${JSON.stringify(required)}: ${r.out}`);
    assert.doesNotMatch(r.out, /All required gates verified|TypeError/);
  }
});

test('an unreadable gate file exits 2', async t => {
  assert.equal((await check(t, 'not json')).code, 2);
  assert.equal((await check(t, JSON.stringify({ version: 2, required: [] }))).code, 2);
});

test('the real gate file gives every gate a known scope and keeps the 1.0 gates required', async () => {
  const gates = JSON.parse(await readFile(new URL('../release-readiness.json', import.meta.url), 'utf8'));
  const scopes = Object.fromEntries(gates.required.map(g => [g.id, g.scope]));
  assert.deepEqual(scopes, {
    'core-and-integrations': '1.0', 'windows-authenticode': '1.0', 'windows-clean-machine': '1.0', 'live-models': '1.0',
    'assistant-hosts': 'experimental', 'android-device': 'experimental', 'remote-service': 'experimental', 'external-review': 'post-1.0',
  });
  for (const g of gates.required) assert.ok(g.status === 'verified' ? g.evidence : g.reason, `${g.id} needs evidence or a reason`);
});
