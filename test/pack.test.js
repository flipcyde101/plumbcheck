// What `npm publish` would ship. Keeps local evidence, launch material and images out of the package.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
// npm is a .cmd shim on Windows; run its JavaScript entry point with this Node instead of a shell.
const npmCli = process.env.npm_execpath && /npm-cli\.js$/.test(process.env.npm_execpath) ? process.env.npm_execpath : null;

test('the npm package contains only what users need and stays small', { skip: npmCli ? false : 'run through npm test to locate the npm CLI' }, async () => {
  const run = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd, encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.status, 0, run.stderr);
  const [pack] = JSON.parse(run.stdout);
  const files = pack.files.map(f => f.path.replace(/\\/g, '/'));
  for (const path of files) {
    assert.doesNotMatch(path, /^(reports|launch|video[^/]*|\.claude|\.github|android|desktop|dist|compat|test|scripts|plugins|mobile|\.tools|recordings)\//, `${path} must not be published`);
    assert.doesNotMatch(path, /(^|\/)bridge\.json$|\.(png|jpe?g|gif|mp4|webm|tgz|jks|keystore)$|(^|\/)\.env/i, `${path} must not be published`);
  }
  for (const required of ['bin/plumbcheck.js', 'bin/plumbcheck-mcp.js', 'src/index.js', 'src/index.d.ts', 'src/version.js', 'web/index.html', 'schema/contract-v1.schema.json', 'adapters/python/plumbcheck.py', 'docs/STABILITY.md', 'docs/PRIVACY.md', 'docs/CONTRACTS.md', 'LICENSE', 'README.md', 'CHANGELOG.md'])
    assert.ok(files.includes(required), `${required} is missing from the package`);
  assert.ok(pack.unpackedSize < 1_000_000, `unpacked size ${pack.unpackedSize} bytes must stay under 1 MB`);
});

test('every doc listed in package.json files exists', async () => {
  const { files } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const path of files.filter(f => f.includes('.'))) await readFile(new URL(`../${path}`, import.meta.url));
});
