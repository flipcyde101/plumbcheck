import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startStudio, loadExamples } from '../src/studio.js';

test('official MCP client controls a real running app through its scoped stdio bridge', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-control-'));
  const app = await startStudio({ port: 0, workspaceDirectory: directory });
  const transport = new StdioClientTransport({ command: process.execPath, args: [process.env.PLUMBCHECK_CONTROL_BIN || fileURLToPath(new URL('../bin/plumbcheck-control.js', import.meta.url)), '--connect', join(directory, 'bridge.json')], stderr: 'pipe' });
  const client = new Client({ name: 'PlumbCheck control test', version: '1.0.0' });
  t.after(async () => { await client.close(); await app.shutdown(); await rm(directory, { recursive: true, force: true }); });
  const project = await app.workspace.saveProject({ name: 'Controlled project', contract: (await loadExamples()).safe });
  await client.connect(transport);
  const tools = await client.listTools(); assert.equal(tools.tools.length, 6);
  assert.ok(!tools.tools.some(t => /shell|command|credential/.test(t.name)));
  const listed = await client.callTool({ name: 'plumbcheck_list_projects', arguments: {} });
  assert.equal(JSON.parse(listed.content[0].text)[0].id, project.id);
  const args = { projectId: project.id, revision: 1, idempotencyKey: 'sdk-test' };
  const start = await client.callTool({ name: 'plumbcheck_run_suite', arguments: args });
  const runId = start.structuredContent.id;
  const repeat = await client.callTool({ name: 'plumbcheck_run_suite', arguments: args }); assert.equal(repeat.structuredContent.id, runId);
  let result;
  for (let i = 0; i < 100; i++) { result = await client.callTool({ name: 'plumbcheck_get_run', arguments: { runId } }); if (result.structuredContent.report) break; await new Promise(r => setTimeout(r, 10)); }
  assert.equal(result.structuredContent.status, 'passed'); assert.equal(result.structuredContent.report.passed, true);
  const denied = await client.callTool({ name: 'plumbcheck_run_suite', arguments: { ...args, command: 'arbitrary shell' } }); assert.equal(denied.isError, true);
});
