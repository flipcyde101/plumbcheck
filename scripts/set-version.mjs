// Usage: npm run version:set -- <version>
// Writes one version to every place that carries it. Idempotent: running it twice is a no-op.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = process.argv[2];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const match = semver.exec(version ?? '');
if (!match) { console.error('Usage: npm run version:set -- <semver>, for example 1.0.0-rc.1'); process.exit(2); }
const [major, minor, patch] = match.slice(1, 4).map(Number);
if (minor > 99 || patch > 99) { console.error('Android versionCode needs minor and patch below 100.'); process.exit(2); }

// Every new file is prepared and checked in memory first, then all are written: a changed file
// layout fails before anything is touched instead of leaving the tree with mixed versions.
const pending = new Map();
/** Replace exactly one occurrence, so a changed file layout fails loudly instead of silently skipping. */
async function rewrite(path, pattern, replacement) {
  const text = await readFile(resolve(root, path), 'utf8');
  const hits = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (hits?.length !== 1) throw new Error(`${path}: expected one version marker, found ${hits?.length ?? 0}. Nothing was changed.`);
  pending.set(path, text.replace(pattern, replacement));
}

// Same effect as `npm version --no-git-tag-version`: the manifest and its lock root, nothing re-resolved.
for (const prefix of ['', 'desktop/']) {
  for (const name of ['package.json', 'package-lock.json']) {
    const json = JSON.parse(await readFile(resolve(root, prefix + name), 'utf8'));
    if (name === 'package-lock.json' && !json.packages?.['']) throw new Error(`${prefix}${name}: no root package entry. Nothing was changed.`);
    json.version = version;
    if (name === 'package-lock.json') json.packages[''].version = version;
    pending.set(prefix + name, `${JSON.stringify(json, null, 2)}\n`);
  }
}
await rewrite('src/version.js', /export const version = '[^']*';/, `export const version = '${version}';`);
await rewrite('plugins/plumbcheck/plugin.json', /("version": )"[^"]*"/, `$1"${version}"`);
await rewrite('adapters/python/plumbcheck.py', /^__version__ = "[^"]*"$/m, `__version__ = "${version}"`);
// Pre-releases share their base release's code; the code only has to increase between releases.
const code = major * 10000 + minor * 100 + patch;
await rewrite('android/app/build.gradle', /versionCode \d+; versionName '[^']*'/, `versionCode ${code}; versionName '${version}'`);
for (const [path, text] of pending) await writeFile(resolve(root, path), text);
console.log(`Set version ${version} (Android versionCode ${code}). Rebuild generated copies: npm run plugin:build, npm run mobile:build, npm --prefix desktop run stage.`);
