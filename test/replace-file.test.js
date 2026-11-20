import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replaceFile, RETRY_DELAYS_MS } from '../src/replace-file.js';

const cjs = createRequire(import.meta.url)('../desktop/runtime/replace-file.cjs');
const err = code => Object.assign(new Error(code), { code });
const noSleep = async () => {};

for (const [label, impl] of [['src (ESM)', replaceFile], ['desktop runtime (CJS)', cjs.replaceFile]]) {
  test(`${label}: retries a transient Windows lock, then succeeds`, async () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      let calls = 0; const waits = [];
      const rename = async () => { if (++calls < 3) throw err(code); };
      await impl('a.tmp', 'a', { rename, sleep: async ms => { waits.push(ms); } });
      assert.equal(calls, 3, code);
      assert.deepEqual(waits, RETRY_DELAYS_MS.slice(0, 2));
    }
  });

  test(`${label}: gives up after the last delay and throws the original error`, async () => {
    let calls = 0; const failure = err('EPERM');
    await assert.rejects(impl('a.tmp', 'a', { rename: async () => { calls++; throw failure; }, sleep: noSleep }), e => e === failure);
    assert.equal(calls, RETRY_DELAYS_MS.length + 1);
  });

  test(`${label}: does not retry other errors`, async () => {
    let calls = 0;
    await assert.rejects(impl('a.tmp', 'a', { rename: async () => { calls++; throw err('ENOENT'); }, sleep: noSleep }), { code: 'ENOENT' });
    assert.equal(calls, 1);
  });

  test(`${label}: replaces a real file`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-replace-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, 'state.json'), 'old'); await writeFile(join(dir, 'state.json.tmp'), 'new');
    await impl(join(dir, 'state.json.tmp'), join(dir, 'state.json'));
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), 'new');
    assert.deepEqual(await readdir(dir), ['state.json']);
  });
}

test('the ESM and CommonJS copies use the same retry schedule', () => {
  assert.deepEqual([...cjs.RETRY_DELAYS_MS], [...RETRY_DELAYS_MS]);
});
