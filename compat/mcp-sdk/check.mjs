import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const safePath = join(root, 'examples/customer-support/safe.json');
const regressionPath = join(root, 'examples/customer-support/regression.json');

async function connected(t, { suite = safePath, name = 'Read-only order lookup' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'plumcheck-official-sdk-'));
  const client = new Client({ name: 'plumcheck-compatibility', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'bin/plumcheck-mcp.js'), suite, name, '--out', dir], cwd: root, stderr: 'pipe' });
  let diagnostics = '';
  transport.stderr.on('data', chunk => { diagnostics += chunk.toString(); });
  t.after(async () => { await client.close(); await rm(dir, { recursive: true, force: true }); });
  await client.connect(transport, { timeout: 5000 });
  return {
    client,
    async finish() {
      await client.close();
      try { return JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')); }
      catch (error) { error.message += `\nServer diagnostics: ${diagnostics}`; throw error; }
    },
  };
}

test('official SDK connects, discovers parameter shapes, calls a tool, and closes cleanly', { timeout: 15000 }, async t => {
  const { client, finish } = await connected(t);
  assert.equal(client.getServerVersion().name, 'plumcheck-fixture-server');
  const tools = await client.listTools();
  assert.equal(tools.tools[0].name, 'orders.lookup');
  assert.equal(tools.tools[0].inputSchema.properties.orderId.type, 'string');
  assert.ok(!JSON.stringify(tools).includes('ORD-1042'));
  const result = await client.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1042' } });
  assert.equal(result.structuredContent.status, 'shipped');
  const report = await finish();
  assert.equal(report.passed, true); assert.equal(report.mode, 'mcp-replay'); assert.equal(report.summary.calls, 1);
});

test('official SDK executes an approved two-tool scenario from discovered tools', { timeout: 15000 }, async t => {
  const { client, finish } = await connected(t, { name: 'Approved customer update' });
  const { tools } = await client.listTools(); assert.equal(tools.length, 2);
  const order = await client.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1042' } });
  const sent = await client.callTool({ name: 'email.send', arguments: { to: order.structuredContent.customerEmail, subject: 'Your order update', body: 'Your order has shipped.' } });
  assert.equal(sent.structuredContent.accepted, true);
  const report = await finish(); assert.equal(report.passed, true); assert.equal(report.summary.calls, 2);
});

test('official SDK receives a blocked approval result and a failing CI report', { timeout: 15000 }, async t => {
  const { client, finish } = await connected(t, { suite: regressionPath, name: 'Email without approval' });
  await client.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1042' } });
  const result = await client.callTool({ name: 'email.send', arguments: { to: 'customer@example.com', subject: 'Your order update', body: 'Your order has shipped.' } });
  assert.equal(result.isError, true); assert.match(result.content[0].text, /APPROVAL_REQUIRED/);
  const report = await finish(); assert.equal(report.passed, false); assert.equal(report.summary.blocked, 1);
});

test('official SDK receives argument mismatches instead of a live fallback', { timeout: 15000 }, async t => {
  const { client, finish } = await connected(t);
  const result = await client.callTool({ name: 'orders.lookup', arguments: { orderId: 'WRONG' } });
  assert.equal(result.isError, true); assert.match(result.content[0].text, /ARGUMENT_MISMATCH/);
  const report = await finish(); assert.equal(report.passed, false); assert.equal(report.summary.liveToolCalls, 0);
});

test('official SDK validates envelopes for plain JSON fixture responses', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumcheck-generic-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'generic.json');
  await writeFile(path, JSON.stringify({ version: 1, name: 'Plain JSON', policies: { allow: ['read'] }, cases: [{ name: 'Read', calls: [{ tool: 'read', arguments: {} }], fixtures: [{ tool: 'read', arguments: {}, result: { status: 'ready' } }] }] }));
  const { client, finish } = await connected(t, { suite: path, name: 'Read' });
  const result = await client.callTool({ name: 'read', arguments: {} });
  assert.deepEqual(result.structuredContent, { status: 'ready' }); assert.equal(result.content[0].text, '{"status":"ready"}');
  assert.equal((await finish()).passed, true);
});

test('official SDK close produces a failure if the client skipped a required fixture', { timeout: 15000 }, async t => {
  const { finish } = await connected(t);
  const report = await finish(); assert.equal(report.passed, false); assert.equal(report.summary.calls, 0); assert.ok(report.cases[0].failures.length > 0);
});

test('official SDK receives the original recorded tool error while the CI report fails', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plumcheck-error-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'error.json');
  const recorded = { isError: true, content: [{ type: 'text', text: 'Rate limited; retry later.' }] };
  await writeFile(path, JSON.stringify({ version: 1, name: 'Recorded error', policies: { allow: ['read'] }, cases: [{ name: 'Read', calls: [{ tool: 'read', arguments: {} }], fixtures: [{ tool: 'read', arguments: {}, result: recorded }] }] }));
  const { client, finish } = await connected(t, { suite: path, name: 'Read' });
  const result = await client.callTool({ name: 'read', arguments: {} });
  assert.deepEqual(result, recorded);
  const report = await finish(); assert.equal(report.passed, false); assert.equal(report.cases[0].failures[0].code, 'TOOL_ERROR');
});
