// Run with the INSTALLED runtime after upgrading over an older release:
//   <install>\resources\mcp-runtime\node.exe desktop/scripts/check-upgrade.mjs <install dir> <expected version> <seeded workspace.json>
// Checks that the upgraded app reads the older workspace from %APPDATA%\PlumbCheck and that a
// generated MCP configuration points at files that exist and actually serve.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { makeMcpSetup } from '../runtime/config.mjs';

const [installDir, expectedVersion, seededFile] = process.argv.slice(2);
assert.ok(installDir && expectedVersion && seededFile, 'Usage: check-upgrade.mjs <install dir> <expected version> <seeded workspace.json>');
const runtime = join(resolve(installDir), 'resources', 'mcp-runtime');
const fromRuntime = path => import(pathToFileURL(join(runtime, path)).href);

const { version } = await fromRuntime('src/version.js');
assert.equal(version, expectedVersion, 'the installed runtime must be the new release');
assert.equal(resolve(process.execPath).toLowerCase(), join(runtime, 'node.exe').toLowerCase(), 'run this check with the installed node.exe');

// 1. The upgraded runtime opens the workspace written by the older release, unchanged.
const appData = join(process.env.APPDATA, 'PlumbCheck');
const seeded = JSON.parse(await readFile(seededFile, 'utf8'));
const { Workspace } = await fromRuntime('src/workspace.js');
const workspace = await Workspace.open(appData);
try {
  const summary = workspace.summary();
  assert.deepEqual(summary.projects.map(p => p.name), seeded.projects.map(p => p.name));
  assert.deepEqual(summary.runs.map(r => r.id), seeded.runs.map(r => r.id));
  assert.deepEqual(workspace.run(seeded.runs[0].id).report.summary, seeded.runs[0].report.summary);
} finally { await workspace.close(); }
console.log(`Upgraded ${expectedVersion} runtime opened the older workspace in ${appData}.`);

// 2. A generated MCP configuration points at the installed runtime and serves.
const dir = await mkdtemp(join(tmpdir(), 'plumbcheck-upgrade-'));
try {
  const suite = JSON.parse(await readFile(fileURLToPath(new URL('../../examples/customer-support/safe.json', import.meta.url)), 'utf8'));
  const contractPath = join(dir, 'Contract with spaces.json');
  await writeFile(contractPath, JSON.stringify(suite));
  const { config } = makeMcpSetup(suite, suite.cases[0].name, { executable: join(runtime, 'node.exe'), runnerScript: join(runtime, 'bin', 'plumbcheck-mcp.js'), contractPath, reportPath: join(dir, 'reports') });
  const { command, args } = config.mcpServers.plumbcheck;
  for (const path of [command, args[0]]) assert.ok((await stat(path)).isFile(), `generated MCP path must exist: ${path}`);
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise((accept, reject) => { child.once('error', reject); child.once('close', code => accept(code)); });
  const requests = [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'plumbcheck-upgrade-check', version: '1' } } },
    ...suite.cases[0].calls.map((c, i) => ({ jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name: c.tool, arguments: c.arguments } }))];
  child.stdin.end(requests.map(r => JSON.stringify(r)).join('\n') + '\n');
  const timer = setTimeout(() => child.kill(), 90_000);
  const code = await closed; clearTimeout(timer);
  assert.equal(code, 0, `stdout: ${stdout}\nstderr: ${stderr}`);
  assert.equal(JSON.parse(stdout.trim().split('\n')[0]).result.serverInfo.version, expectedVersion);
  console.log('Generated MCP configuration points at the installed runtime and passed a replay.');
} finally { await rm(dir, { recursive: true, force: true }); }
