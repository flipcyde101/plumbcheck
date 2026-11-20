import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createUpdateChecker, isNewer, releaseFrom, LATEST } = require('../desktop/runtime/updates.cjs');
const DAY = 24 * 60 * 60 * 1000;
const release = (tag, extra = {}) => ({ tag_name: tag, html_url: `https://github.com/stepan4002/plumbcheck/releases/tag/${tag}`, draft: false, prerelease: false, ...extra });

async function setup(t, { current = '1.0.0', body = release('v1.1.0'), ok = true, fail = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-updates-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  let clock = Date.parse('2026-12-01T10:00:00Z');
  const fetch = async (url, options) => {
    calls.push({ url, options });
    if (fail) throw new Error('offline');
    return { ok, json: async () => body };
  };
  const settingsFile = join(dir, 'settings.json');
  const checker = createUpdateChecker({ fetch, settingsFile, currentVersion: current, now: () => clock });
  return { checker, calls, settingsFile, advance: ms => { clock += ms; } };
}

test('semver precedence, including pre-releases', () => {
  assert.ok(isNewer('1.0.1', '1.0.0'));
  assert.ok(isNewer('1.10.0', '1.9.9'));
  assert.ok(isNewer('2.0.0', '1.99.99'));
  assert.ok(isNewer('1.0.0', '1.0.0-rc.1'), 'a release outranks its release candidate');
  assert.ok(isNewer('1.0.0-rc.2', '1.0.0-rc.1'));
  assert.ok(isNewer('1.0.0-rc.10', '1.0.0-rc.9'), 'numeric identifiers compare as numbers');
  assert.ok(isNewer('1.0.0-rc.1', '1.0.0-beta.5'));
  assert.ok(isNewer('1.0.0-alpha.beta', '1.0.0-alpha.1'), 'alphanumeric outranks numeric');
  assert.ok(isNewer('1.0.0-alpha.1', '1.0.0-alpha'), 'more identifiers outrank fewer');
  for (const [a, b] of [['1.0.0', '1.0.0'], ['1.0.0-rc.1', '1.0.0'], ['0.9.0', '1.0.0'], ['nonsense', '1.0.0'], ['1.0.0', 'nonsense'], ['01.0.0', '0.0.1']]) assert.equal(isNewer(a, b), false, `${a} vs ${b}`);
});

test('only stable releases with a release page in this repository are accepted', () => {
  assert.deepEqual(releaseFrom(release('v1.2.3')), { version: '1.2.3', url: 'https://github.com/stepan4002/plumbcheck/releases/tag/v1.2.3' });
  assert.equal(releaseFrom(release('v1.2.3', { prerelease: true })), null);
  assert.equal(releaseFrom(release('v1.2.3', { draft: true })), null);
  assert.equal(releaseFrom(release('v1.2.3-rc.1')), null, 'pre-release versions are ignored even if not flagged');
  for (const html_url of ['https://github.com/someone/else/releases/tag/v9.0.0', 'http://github.com/stepan4002/plumbcheck/releases/tag/v9.0.0', 'https://github.com/stepan4002/plumbcheck/issues/1', 'https://user:pw@github.com/stepan4002/plumbcheck/releases/', 'https://github.com/stepan4002/plumbcheck/releases/tag/v9.0.0?x=1', 'javascript:alert(1)'])
    assert.equal(releaseFrom({ tag_name: 'v9.0.0', html_url }), null, html_url);
  assert.equal(releaseFrom(null), null);
});

test('a newer release is reported once and the check is throttled to one request a day', async t => {
  const f = await setup(t);
  assert.deepEqual(await f.checker.status(), { enabled: true, available: true, version: '1.1.0', url: 'https://github.com/stepan4002/plumbcheck/releases/tag/v1.1.0' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, LATEST);
  assert.equal(f.calls[0].options.headers['User-Agent'], 'PlumbCheck/1.0.0', 'no personal data in the request');
  f.advance(DAY - 1000);
  assert.equal((await f.checker.status()).available, true, 'the cached result survives within the day');
  assert.equal(f.calls.length, 1);
  f.advance(2000);
  await f.checker.status();
  assert.equal(f.calls.length, 2, 'a day later it checks again');
  const saved = JSON.parse(await readFile(f.settingsFile, 'utf8'));
  assert.equal(saved.checkForUpdates, true);
  assert.ok(Date.parse(saved.lastUpdateCheck));
});

test('the same or an older release, a pre-release and a release candidate upgrade path', async t => {
  assert.equal((await (await setup(t, { body: release('v1.0.0') })).checker.status()).available, false);
  assert.equal((await (await setup(t, { body: release('v0.9.0') })).checker.status()).available, false);
  assert.equal((await (await setup(t, { body: release('v2.0.0', { prerelease: true }) })).checker.status()).available, false);
  assert.equal((await (await setup(t, { current: '1.0.0-rc.1', body: release('v1.0.0') })).checker.status()).available, true);
});

test('failures are silent and still throttle', async t => {
  for (const options of [{ fail: true }, { ok: false }, { body: { message: 'API rate limit exceeded' } }, { body: 'not an object' }]) {
    const f = await setup(t, options);
    assert.deepEqual(await f.checker.status(), { enabled: true, available: false });
    await f.checker.status();
    assert.equal(f.calls.length, 1, `retried within the day for ${JSON.stringify(options)}`);
  }
});

test('turning checks off stops all requests and hides the notice; turning on checks again', async t => {
  const f = await setup(t);
  assert.equal((await f.checker.status()).available, true);
  assert.deepEqual(await f.checker.setEnabled(false), { enabled: false, available: false });
  f.advance(3 * DAY);
  assert.deepEqual(await f.checker.status(), { enabled: false, available: false });
  assert.equal(f.calls.length, 1, 'no request while disabled');
  assert.equal((await f.checker.setEnabled(true)).available, true);
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.checker.setEnabled('yes'), /true or false/);
});

test('a damaged or hand-edited settings file falls back to defaults without crashing', async t => {
  const f = await setup(t);
  await writeFile(f.settingsFile, '{not json');
  assert.equal((await f.checker.status()).available, true);
  await writeFile(f.settingsFile, JSON.stringify({ checkForUpdates: true, lastUpdateCheck: new Date(Date.parse('2026-12-01T10:00:00Z')).toISOString(), latestRelease: { version: '9.9.9', url: 'https://evil.example/' } }));
  assert.equal((await f.checker.status()).available, false, 'a cached URL outside the release pages is never shown');
});

test('concurrent status calls share one request', async t => {
  const f = await setup(t);
  await Promise.all([f.checker.status(), f.checker.status(), f.checker.status()]);
  assert.equal(f.calls.length, 1);
});

/** A fetch that answers only when the test says so, to hold a check open on the "network". */
function heldFetch(body = release('v1.1.0')) {
  const waiting = [];
  const fetch = () => new Promise(resolve => waiting.push(() => resolve({ ok: true, json: async () => body })));
  return { fetch, answer: () => waiting.splice(0).forEach(go => go()), get requests() { return waiting.length; } };
}
const until = async predicate => { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate()); };

test('turning checks off while a check waits on the network keeps the opt-out', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-updates-race-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settingsFile = join(dir, 'settings.json'), held = heldFetch();
  const checker = createUpdateChecker({ fetch: held.fetch, settingsFile, currentVersion: '1.0.0' });
  const first = checker.status();
  await until(() => held.requests === 1);
  assert.deepEqual(await checker.setEnabled(false), { enabled: false, available: false });
  held.answer();
  assert.deepEqual(await first, { enabled: false, available: false }, 'the late answer reflects the newer choice');
  assert.equal(JSON.parse(await readFile(settingsFile, 'utf8')).checkForUpdates, false, 'the opt-out survives on disk');
  const relaunched = createUpdateChecker({ fetch: () => assert.fail('must not contact GitHub'), settingsFile, currentVersion: '1.0.0', now: () => Date.now() + 3 * DAY });
  assert.deepEqual(await relaunched.status(), { enabled: false, available: false });
});

test('a quick on-then-off ends off, and turning on again uses the cached release', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-updates-race-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const settingsFile = join(dir, 'settings.json'), held = heldFetch();
  await writeFile(settingsFile, JSON.stringify({ checkForUpdates: false }));
  const checker = createUpdateChecker({ fetch: held.fetch, settingsFile, currentVersion: '1.0.0' });
  const on = checker.setEnabled(true);
  await until(() => held.requests === 1);
  await checker.setEnabled(false);
  held.answer();
  assert.equal((await on).enabled, false, 'the slower "on" answer reports the final state');
  assert.equal(JSON.parse(await readFile(settingsFile, 'utf8')).checkForUpdates, false);
  // Turning on again within the day uses the release learned by the earlier check, without a new request.
  assert.deepEqual(await checker.setEnabled(true), { enabled: true, available: true, version: '1.1.0', url: 'https://github.com/stepan4002/plumbcheck/releases/tag/v1.1.0' });
  assert.equal(held.requests, 0);
});

test('a choice that cannot be saved is reported, not silently dropped', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-updates-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const checker = createUpdateChecker({ fetch: async () => ({ ok: false }), settingsFile: join(dir, 'missing-folder', 'settings.json'), currentVersion: '1.0.0' });
  await assert.rejects(checker.setEnabled(false));
  assert.deepEqual(await checker.status(), { enabled: true, available: false }, 'a status check still fails silently');
});
