import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { MockLanguageModelV4 } from 'ai/test';
import { runAgentSuite } from '../src/agent-runner.js';
import { serveMcp } from '../src/mcp.js';
import { createMatchers } from '../src/matchers.js';
import { createRecorder, ReplaySession } from '../src/replay.js';
import { redact } from '../src/redact.js';
import { validateSuite } from '../src/validation.js';
import { runModelProject } from '../src/model-runner.js';
import { readDesktopContract, makeMcpSetup } from '../desktop/runtime/config.mjs';

const m = createMatchers();
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };
const response = (content, unified = 'stop') => ({ content, finishReason: { unified }, usage, warnings: [] });
const call = (id, toolName, input) => ({ type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input) });
const limits = { maxSteps: 3, maxOutputTokens: 100 };

test('an MCP case whose only checks need the final answer fails instead of passing unevaluated', async () => {
  const suite = { version: 1, name: 'x', policies: {}, cases: [{ name: 'c', input: {}, fixtures: [], expect: { outputChecks: [{ contains: 'x' }] } }] };
  const input = new PassThrough();
  const done = serveMcp(suite, 'c', { input, output: new PassThrough(), audit: new PassThrough() });
  input.end();
  const { report } = await done;
  assert.equal(report.passed, false);
  assert.equal(report.cases[0].failures[0].code, 'CHECKS_NOT_EVALUATED');
});

test('a failed output check on a credential path does not leak the expected value after masking', async () => {
  const suite = { version: 1, name: 'x', policies: {}, cases: [{ name: 'c', fixtures: [], expect: { outputChecks: [{ path: 'access_token', equals: 'sk-live-SECRET' }, { path: 'api_key', contains: 'sk-live-OTHER' }] } }] };
  const report = await runAgentSuite(suite, async () => ({ access_token: 'x', api_key: 'y' }));
  assert.equal(report.cases[0].failures.length, 2);
  assert.ok(!/sk-live/.test(JSON.stringify(redact(report))));
});

test('text checks search answer values, not JSON escaping or key names', () => {
  assert.equal(m.checkOutput({ contains: 'He said "refund"' }, { msg: 'He said "refund"' }).passed, true);
  assert.equal(m.checkOutput({ notContains: 'He said "refund"' }, { msg: 'He said "refund"' }).passed, false);
  assert.equal(m.checkOutput({ contains: 'shipped' }, { status: 'cancelled', shipped: false }).passed, false);
  assert.equal(m.checkOutput({ contains: '42' }, { count: 42 }).passed, true);
});

test('recorded arguments that contain $plumb replay as literal data, never as wildcards', async () => {
  const recorder = createRecorder({ callTool: async () => ({ ok: true }) });
  await recorder.callTool({ name: 'a', arguments: { filter: { $plumb: 'any' } } });
  const fixtures = await recorder.snapshot();
  assert.deepEqual(fixtures[0].arguments, { filter: { $plumb: 'literal', value: { $plumb: 'any' } } });
  validateSuite({ version: 1, name: 'r', policies: { allow: ['a'] }, cases: [{ name: 'c', input: {}, fixtures }] }, { mode: 'agent' });
  const session = new ReplaySession({ fixtures, policies: { allow: ['a'] } });
  await assert.rejects(session.callTool({ name: 'a', arguments: { filter: { drop: true } } }), { code: 'ARGUMENT_MISMATCH' });
  const again = new ReplaySession({ fixtures, policies: { allow: ['a'] } });
  await again.callTool({ name: 'a', arguments: { filter: { $plumb: 'any' } } });
});

test('non-JSON objects never equal plain fixture objects and inherited keys cannot satisfy a matcher', async () => {
  assert.equal(m.matchValue({ d: {} }, { d: new Date() }), false);
  assert.equal(m.matchValue({ d: {} }, { d: new Map() }), false);
  const session = new ReplaySession({ fixtures: [{ tool: 'a', arguments: { constructor: { $plumb: 'any' } }, result: {} }], policies: { allow: ['a'] } });
  await assert.rejects(session.callTool({ name: 'a', arguments: {} }), { code: 'ARGUMENT_MISMATCH' });
});

test('deeply nested literal or oneOf data is rejected at validation instead of overflowing later', () => {
  let deep = 0; for (let i = 0; i < 20000; i++) deep = [deep];
  for (const matcher of [{ $plumb: 'literal', value: deep }, { $plumb: 'oneOf', values: [deep] }]) {
    const suite = { version: 1, name: 'x', policies: { allow: ['a'] }, cases: [{ name: 'c', input: {}, fixtures: [{ tool: 'a', arguments: { v: matcher }, result: {} }] }] };
    assert.throws(() => validateSuite(suite, { mode: 'agent' }), /nested too deeply/);
  }
});

test('declared schemas are enforced for replayed tools, while guarded tools still record every attempt', async () => {
  const suite = { version: 1, name: 'x', tools: { a: { inputSchema: { type: 'object', properties: { s: { type: 'string' } }, required: ['s'] } }, 'orders.delete': { inputSchema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'], additionalProperties: false } } },
    policies: { allow: ['a'], deny: ['orders.delete'] }, cases: [{ name: 'c', input: {}, fixtures: [{ tool: 'a', arguments: { s: { $plumb: 'any' } }, result: {} }], expect: { never: ['orders.delete'] } }] };
  const wrongType = new MockLanguageModelV4({ doGenerate: [response([call('1', 'a', { s: 123 })], 'tool-calls'), response([{ type: 'text', text: 'done' }])] });
  const invalid = await runModelProject({ project: { contract: suite, task: 't' }, model: wrongType, limits });
  assert.equal(invalid.passed, false);
  assert.ok(invalid.cases[0].failures.some(f => f.code === 'AGENT_ERROR' && /schema-invalid tool call \(a\)/.test(f.message)));
  const guarded = new MockLanguageModelV4({ doGenerate: [response([call('2', 'orders_delete', { order_id: 'X' })], 'tool-calls'), response([{ type: 'text', text: 'done' }])] });
  const blocked = await runModelProject({ project: { contract: suite, task: 't' }, model: guarded, limits });
  assert.deepEqual(blocked.cases[0].events.map(e => [e.tool, e.status]), [['orders.delete', 'blocked']]);
  assert.ok(blocked.cases[0].failures.some(f => f.code === 'DENIED_TOOL'));
  const extraKey = new MockLanguageModelV4({ doGenerate: [response([call('3', 'a', { s: 'ok', extra: true })], 'tool-calls'), response([{ type: 'text', text: 'done' }])] });
  const extra = await runModelProject({ project: { contract: suite, task: 't' }, model: extraKey, limits });
  assert.ok(extra.cases[0].failures.some(f => f.code === 'ARGUMENT_MISMATCH'), 'schema validation must not strip extra arguments before replay');
});

test('the desktop app can create an MCP setup for an agent-mode contract', async () => {
  const source = await readFile(new URL('../examples/probe/probe.json', import.meta.url), 'utf8');
  const suite = readDesktopContract(source);
  const paths = { executable: process.execPath, runnerScript: process.execPath, contractPath: process.execPath, reportPath: process.execPath };
  assert.equal(makeMcpSetup(suite, 'Control: correct lookup', paths).config.mcpServers.plumbcheck.args[2], 'Control: correct lookup');
});
