import test from 'node:test';
import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { runModelProject, connectedModel, discoverModels } from '../src/model-agent.js';

const usage = { inputTokens: { total: 10 }, outputTokens: { total: 5 } };
const response = (content, unified = 'stop') => ({ content, finishReason: { unified }, usage, warnings: [] });
const contract = { version: 1, name: 'Model scenario', policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Read order', input: { id: 'ORD-1' }, fixtures: [{ tool: 'orders.lookup', arguments: { id: 'ORD-1' }, result: { status: 'shipped' } }], expect: { callOrder: ['orders.lookup'], output: { status: 'shipped' } } }] };
const limits = { maxSteps: 3, maxOutputTokens: 100 };
function model(argument = 'ORD-1') { return new MockLanguageModelV4({ doGenerate: [response([{ type: 'tool-call', toolCallId: 'call-1', toolName: 'tool_0', input: JSON.stringify({ id: argument }) }], 'tool-calls'), response([{ type: 'text', text: '{"status":"shipped"}' }])] }); }

test('real AI SDK loop runs model-selected tools and checks the final JSON output', async () => {
  const m = model(); const report = await runModelProject({ project: { contract, task: 'Read the order and return JSON.' }, model: m, limits });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(m.doGenerateCalls.length, 2);
  assert.equal(report.cases[0].events[0].tool, 'orders.lookup');
  assert.ok(!JSON.stringify(m.doGenerateCalls[0].tools).includes('ORD-1'), 'Discovery must not reveal expected literal arguments.');
});

test('a wrong model-selected argument fails despite subsequent successful output', async () => {
  const report = await runModelProject({ project: { contract, task: 'Read the order.' }, model: model('WRONG'), limits });
  assert.equal(report.passed, false); assert.ok(report.cases[0].failures.some(f => f.code === 'ARGUMENT_MISMATCH'));
});

test('raw model/provider error bodies never become report evidence', async () => {
  const m = new MockLanguageModelV4({ doGenerate: async () => { throw new Error('SYNTHETIC_PRIVATE_PROVIDER_BODY'); } });
  const report = await runModelProject({ project: { contract, task: 'Read.' }, model: m, limits });
  assert.equal(report.passed, false); assert.ok(!JSON.stringify(report).includes('SYNTHETIC_PRIVATE_PROVIDER_BODY'));
});

test('named providers construct the intended current SDK interfaces', () => {
  for (const provider of ['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'compatible']) {
    const m = connectedModel({ name: provider, provider, model: 'user-selected', baseURL: 'http://localhost:11434/v1' }, 'synthetic');
    assert.equal(m.modelId, 'user-selected');
  }
});

test('model discovery bounds returned IDs and excludes raw malformed provider bodies from errors', async () => {
  const connection = { name: 'Local', provider: 'ollama', model: 'discovery', baseURL: 'http://localhost:11434/v1' };
  const result = await discoverModels(connection, undefined, { fetch: async () => Response.json({ data: [{ id: 'qwen3.5:4b' }, { id: 'x'.repeat(201) }] }) });
  assert.deepEqual(result.models, ['qwen3.5:4b']);
  await assert.rejects(discoverModels(connection, undefined, { fetch: async () => new Response('<html>PRIVATE_PROVIDER_BODY</html>') }), error => !error.message.includes('PRIVATE_PROVIDER_BODY') && /JSON model list/.test(error.message));
});

test('provider usage is reported and a run-wide output budget stops further generations', async () => {
  let usage;
  const report = await runModelProject({ project: { contract, task: 'Read.' }, model: model(), limits: { ...limits, maxTotalOutputTokens: 5 }, onUsage: value => { usage = value; } });
  assert.equal(report.passed, false);
  assert.equal(usage.outputTokens, 5); assert.equal(usage.steps, 1);
  assert.ok(report.cases[0].failures.some(f => /budget exhausted/.test(f.message)));
});

test('an unknown model tool call cannot be healed into a passing output-only test', async () => {
  const suite = { version: 1, name: 'Unknown call', policies: { allow: [] }, cases: [{ name: 'No tools', fixtures: [], expect: { output: 'done' } }] };
  const m = new MockLanguageModelV4({ doGenerate: [response([{ type: 'tool-call', toolCallId: 'unknown', toolName: 'invented_tool', input: '{}' }], 'tool-calls'), response([{ type: 'text', text: 'done' }])] });
  const report = await runModelProject({ project: { contract: suite, task: 'Return done without tools.' }, model: m, limits });
  assert.equal(report.passed, false); assert.ok(report.cases[0].failures.some(f => f.code === 'AGENT_ERROR' && /unknown or schema-invalid/.test(f.message)));
});

test('schema-invalid calls fail even after all valid fixtures were consumed', async () => {
  const m = new MockLanguageModelV4({ doGenerate: [response([{ type: 'tool-call', toolCallId: 'good', toolName: 'tool_0', input: '{"id":"ORD-1"}' }], 'tool-calls'), response([{ type: 'tool-call', toolCallId: 'invalid', toolName: 'tool_0', input: '{"id":123}' }], 'tool-calls'), response([{ type: 'text', text: '{"status":"shipped"}' }])] });
  const report = await runModelProject({ project: { contract, task: 'Read the order.' }, model: m, limits });
  assert.equal(report.passed, false); assert.ok(report.cases[0].failures.some(f => /unknown or schema-invalid/.test(f.message) || ['ARGUMENT_MISMATCH', 'FIXTURE_MISSING'].includes(f.code)));
});

test('a provider that exceeds the final-step output limit cannot produce a passing report', async () => {
  const suite = { version: 1, name: 'Provider limit', policies: { allow: [] }, cases: [{ name: 'Output', fixtures: [], expect: { output: 'done' } }] };
  const m = new MockLanguageModelV4({ doGenerate: response([{ type: 'text', text: 'done' }]) });
  const report = await runModelProject({ project: { contract: suite, task: 'Return done.' }, model: m, limits: { ...limits, maxTotalOutputTokens: 4 } });
  assert.equal(report.passed, false); assert.ok(report.cases[0].failures.some(f => /exceeded.*budget/.test(f.message)));
});

test('tool-call budget failures cannot be swallowed by the SDK after valid fixtures are consumed', async () => {
  const suite = structuredClone(contract);
  suite.cases[0].fixtures = Array.from({ length: 100 }, () => structuredClone(contract.cases[0].fixtures[0]));
  suite.cases[0].expect = { output: 'done' };
  const m = new MockLanguageModelV4({ doGenerate: [response(Array.from({ length: 101 }, (_, i) => ({ type: 'tool-call', toolCallId: `call-${i}`, toolName: 'tool_0', input: '{"id":"ORD-1"}' })), 'tool-calls'), response([{ type: 'text', text: 'done' }])] });
  const report = await runModelProject({ project: { contract: suite, task: 'Read.' }, model: m, limits });
  assert.equal(report.passed, false); assert.equal(report.cases[0].events.length, 100);
  assert.ok(report.cases[0].failures.some(f => /tool-call budget/.test(f.message)));
});
