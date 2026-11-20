// One version, one source: package.json. `npm run version:set -- <v>` writes the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { version as moduleVersion } from '../src/version.js';
import { toHtml, runSuite } from '../src/index.js';
import { loadExamples } from '../src/studio.js';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const json = async path => JSON.parse(await text(path));
const { version } = await json('package.json');

test('every hand-maintained location carries the package.json version', async () => {
  assert.match(version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  assert.equal(moduleVersion, version, 'src/version.js');
  assert.equal((await json('package-lock.json')).version, version, 'package-lock.json');
  assert.equal((await json('package-lock.json')).packages[''].version, version, 'package-lock.json root package');
  assert.equal((await json('desktop/package.json')).version, version, 'desktop/package.json');
  assert.equal((await json('desktop/package-lock.json')).packages[''].version, version, 'desktop/package-lock.json');
  assert.equal((await json('plugins/plumbcheck/plugin.json')).version, version, 'plugin.json');
  assert.ok((await text('adapters/python/plumbcheck.py')).includes(`__version__ = "${version}"`), 'Python adapter');
  const gradle = (await text('android/app/build.gradle')).match(/versionCode (\d+); versionName '([^']*)'/);
  assert.equal(gradle?.[2], version, 'Android versionName');
  const [major, minor, patch] = version.split(/[.-]/).map(Number);
  assert.equal(Number(gradle[1]), major * 10000 + minor * 100 + patch, 'Android versionCode');
  assert.ok(Number(gradle[1]) > 6, 'Android versionCode must stay above preview.5 (6)');
});

test('no source file hardcodes its own server or UI version', async () => {
  for (const path of ['src/mcp.js', 'src/control.js']) {
    const source = await text(path);
    assert.doesNotMatch(source, /version: '\d/, `${path} must import src/version.js`);
    assert.match(source, /from '\.\/version\.js'/, path);
  }
  assert.doesNotMatch(await text('web/index.html'), /v0\.\d \/ PREVIEW/);
});

test('saved reports and Studio show the release version', async () => {
  const html = await toHtml(await runSuite((await loadExamples()).safe));
  assert.ok(html.includes(`<span class="version">v${version}</span>`));
  assert.ok(!html.includes('/*__VERSION__*/'));
});

test('the bundled plugin control server inlines the same version', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-version-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const outfile = join(dir, 'control.cjs');
  // Same options as scripts/build-plugin.mjs.
  await build({ entryPoints: [fileURLToPath(new URL('bin/plumbcheck-control.js', root))], outfile, bundle: true, platform: 'node', target: 'node22', format: 'cjs', logLevel: 'silent' });
  assert.ok((await readFile(outfile, 'utf8')).includes(`"${version}"`), 'control bundle carries the version');
});

test('built copies, when present, match (dist/plugin and the staged desktop runtime)', async t => {
  const present = async path => stat(new URL(path, root)).then(() => true, () => false);
  let checked = 0;
  if (await present('dist/plugin/plumbcheck/plugin.json')) { checked++; assert.equal((await json('dist/plugin/plumbcheck/plugin.json')).version, version, 'run npm run plugin:build'); }
  for (const copy of ['desktop/app', 'desktop/mcp-runtime']) {
    if (!(await present(`${copy}/src/version.js`))) continue;
    checked++;
    assert.ok((await text(`${copy}/src/version.js`)).includes(`'${version}'`), `${copy} is stale: run npm --prefix desktop run stage`);
    assert.equal((await json(`${copy}/package.json`)).version, version, `${copy}/package.json`);
  }
  if (!checked) t.skip('no built copies in this checkout');
});
