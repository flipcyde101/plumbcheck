import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, dirname } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const app = resolve(root, 'desktop/app');
if (app !== join(root, 'desktop', 'app')) throw new Error('Unexpected staging directory.');
await rm(app, { recursive: true, force: true });
await mkdir(app, { recursive: true });
for (const name of ['src', 'web', 'examples', 'LICENSE', 'README.md', 'SECURITY.md']) {
  await cp(join(root, name), join(app, name), { recursive: true });
}
for (const name of ['runtime', 'assets']) await cp(join(root, 'desktop', name), join(app, 'desktop', name), { recursive: true });
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(app, 'package.json'), JSON.stringify({
  name: 'plumbcheck-desktop', productName: 'PlumbCheck', version: pkg.version,
  description: pkg.description, author: pkg.author, license: pkg.license,
  type: 'module', main: 'desktop/runtime/main.cjs', private: true,
}, null, 2) + '\n');
console.log(`Staged PlumbCheck ${pkg.version} with its local runtime and synthetic examples.`);

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The Windows x64 desktop build requires Windows and an x64 Node.js runtime.');
const helper = join(root, 'desktop', 'mcp-runtime');
await mkdir(helper, { recursive: true });
for (const name of ['bin', 'src', 'web', 'package.json', 'LICENSE']) await cp(join(root, name), join(helper, name), { recursive: true });
await cp(process.execPath, join(helper, 'node.exe'));
let nodeLicense;
for (const name of ['LICENSE', 'LICENSE.txt']) {
  try { nodeLicense = await readFile(join(dirname(process.execPath), name), 'utf8'); break; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!nodeLicense) {
  const response = await fetch(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not obtain the Node.js ${process.version} license: HTTP ${response.status}`);
  nodeLicense = await response.text();
}
if (!nodeLicense.includes('Node.js') || nodeLicense.length < 1000) throw new Error('The bundled Node.js license is incomplete.');
await writeFile(join(helper, 'LICENSE.node.txt'), nodeLicense);
await writeFile(join(helper, 'runtime.json'), JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch }, null, 2) + '\n');
console.log(`Bundled the Node.js ${process.version} console runtime for MCP; no end-user installation is required.`);
