import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.npm_execpath) throw new Error('Run npm run sbom so the installed npm CLI can generate its dependency inventory.');
const bom = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'sbom', '--sbom-format', 'cyclonedx', '--omit=dev'], { cwd: root, encoding: 'utf8', maxBuffer: 10_000_000, windowsHide: true }));
const electron = createRequire(new URL('../desktop/package.json', import.meta.url))('electron');
const inspected = spawnSync(electron, ['-p', 'JSON.stringify(process.versions)'], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 15000, windowsHide: true });
if (inspected.status !== 0) throw new Error('Could not inspect the pinned desktop runtime.');
const versions = JSON.parse(inspected.stdout.trim());
const consoleRuntime = JSON.parse(await readFile(resolve(root, 'desktop/mcp-runtime/runtime.json'), 'utf8'));
const runtimes = [
  ['electron', versions.electron, 'MIT'],
  ['chromium', versions.chrome, 'BSD-3-Clause'],
  ['nodejs-electron', versions.node, 'MIT'],
  ['nodejs-console', consoleRuntime.node.replace(/^v/, ''), 'MIT'],
];
const refs = [];
for (const [name, version, license] of runtimes) {
  if (!version) throw new Error(`Runtime version missing: ${name}`);
  const ref = `plumbcheck-runtime:${name}:${version}`;
  refs.push(ref);
  bom.components.push({ type: 'framework', 'bom-ref': ref, name, version, licenses: [{ license: { id: license } }] });
}
const rootRef = bom.metadata.component['bom-ref'];
let edge = bom.dependencies.find(d => d.ref === rootRef);
if (!edge) { edge = { ref: rootRef, dependsOn: [] }; bom.dependencies.push(edge); }
edge.dependsOn.push(...refs);
await mkdir(resolve(root, 'dist/windows'), { recursive: true });
await writeFile(resolve(root, 'dist/windows/SBOM.cdx.json'), JSON.stringify(bom, null, 2));
console.log(`Wrote npm dependency and pinned desktop/console runtime inventory (${bom.components.length} components). Upstream runtime notices cover their bundled subcomponents.`);
