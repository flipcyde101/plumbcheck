import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchers } from '../src/matchers.js';
import { runSuite } from '../src/runner.js';
import { runAgentSuite } from '../src/agent-runner.js';
import { fixtureInputSchema } from '../src/mcp-schema.js';
import { createDiffTools } from '../src/diff.js';
import { redact } from '../src/redact.js';

const m = createMatchers();
const lookup = (args) => ({ tool: 'email.send', arguments: args, result: { structuredContent: { accepted: true } } });
const agentSuite = (fixtureArgs, expect = {}) => ({ version: 1, name: 'Matchers', policies: { allow: ['email.send'] }, cases: [{ name: 'Send', input: {}, fixtures: [lookup(fixtureArgs)], expect }] });
const send = (args, output) => async client => { await client.callTool({ name: 'email.send', arguments: args }); return output; };

test('each matcher kind accepts what it describes and nothing else', () => {
  assert.equal(m.matchValue({ a: { $plumb: 'any' } }, { a: 0 }), true);
  assert.equal(m.matchValue({ a: { $plumb: 'any' } }, {}), false, 'any still requires the key');
  assert.equal(m.matchValue({ $plumb: 'contains', value: 'Shipped', ignoreCase: true }, 'Your order has shipped.'), true);
  assert.equal(m.matchValue({ $plumb: 'contains', value: 'shipped' }, ['shipped']), false, 'no coercion of non-strings');
  assert.equal(m.matchValue({ $plumb: 'matches', pattern: '^ORD-\\d+$' }, 'ORD-1042'), true);
  assert.equal(m.matchValue({ $plumb: 'matches', pattern: '^ORD-\\d+$' }, 1042), false);
  assert.equal(m.matchValue({ $plumb: 'oneOf', values: [{ id: 1 }, 'x'] }, { id: 1 }), true);
  assert.equal(m.matchValue({ $plumb: 'range', min: 1, max: 5 }, 5), true);
  assert.equal(m.matchValue({ $plumb: 'range', min: 1, max: 5 }, '3'), false);
  assert.equal(m.matchValue({ $plumb: 'literal', value: { $plumb: 'any' } }, { $plumb: 'any' }), true, 'literal escapes matcher syntax');
  assert.equal(m.matchValue({ $plumb: 'literal', value: { $plumb: 'any' } }, 'anything'), false);
  assert.equal(m.matchValue({ list: [{ $plumb: 'any' }] }, { list: [1, 2] }), false, 'array length still exact');
  assert.equal(m.matchValue({ a: 1 }, { a: 1, extra: true }), false, 'unexpected keys still fail');
});

test('pattern matchers refuse text longer than the safety cap instead of truncating', () => {
  assert.equal(m.matchValue({ $plumb: 'matches', pattern: 'ok$' }, 'x'.repeat(20001) + 'ok'), false);
  const r = m.checkOutput({ notContains: 'secret' }, 'x'.repeat(30000) + 'secret');
  assert.equal(r.passed, false, 'notContains has no cap, so late text is still checked');
});

test('a matcher-satisfied free-text argument passes agent replay; a wrong recipient still fails', async () => {
  const fixture = { to: 'customer@example.com', subject: { $plumb: 'any' }, body: { $plumb: 'contains', value: 'shipped', ignoreCase: true } };
  const ok = await runAgentSuite(agentSuite(fixture), send({ to: 'customer@example.com', subject: 'Hi!', body: 'Good news: it SHIPPED today.' }));
  assert.equal(ok.passed, true, JSON.stringify(ok.cases[0].failures));
  const bad = await runAgentSuite(agentSuite(fixture), send({ to: 'outsider@example.net', subject: 'Hi!', body: 'shipped' }));
  assert.equal(bad.cases[0].failures[0].code, 'ARGUMENT_MISMATCH');
  const event = bad.cases[0].events[0];
  assert.deepEqual(event.expectedArguments, fixture, 'evidence keeps the contract as written');
  const detail = createDiffTools(redact).forFailure(bad.cases[0], bad.cases[0].failures[0]);
  assert.deepEqual(detail.changes.map(c => c.path), ['/to'], 'satisfied matchers do not appear as differences');
});

test('planned contracts may use fixture matchers but not matcher calls', async () => {
  const s = { version: 1, name: 'Planned', policies: { allow: ['a'] }, cases: [{ name: 'c', calls: [{ tool: 'a', arguments: { id: 'ORD-9' } }], fixtures: [{ tool: 'a', arguments: { id: { $plumb: 'matches', pattern: '^ORD-' } }, result: {} }] }] };
  assert.equal((await runSuite(s)).passed, true);
  s.cases[0].calls[0].arguments.id = { $plumb: 'any' };
  await assert.rejects(runSuite(s), /only allowed in fixture arguments/);
});

for (const [label, args] of [
  ['unknown matcher kind', { a: { $plumb: 'fuzzy' } }],
  ['matcher with extra key', { a: { $plumb: 'any', value: 1 } }],
  ['nested quantifier pattern', { a: { $plumb: 'matches', pattern: '(a+)+$' } }],
  ['alternation group repeated with inner quantifier', { a: { $plumb: 'matches', pattern: '(\\w+|x)*' } }],
  ['backreference pattern', { a: { $plumb: 'matches', pattern: '(a)\\1' } }],
  ['invalid regular expression', { a: { $plumb: 'matches', pattern: '[' } }],
  ['overlong pattern', { a: { $plumb: 'matches', pattern: 'a'.repeat(201) } }],
  ['empty range', { a: { $plumb: 'range' } }],
  ['inverted range', { a: { $plumb: 'range', min: 5, max: 1 } }],
  ['empty oneOf', { a: { $plumb: 'oneOf', values: [] } }],
]) test(`invalid matcher is rejected before running: ${label}`, async () => {
  await assert.rejects(runAgentSuite(agentSuite(args), async () => {}), /Invalid suite:/);
});

test('a root matcher is rejected because MCP and providers need an object schema', async () => {
  await assert.rejects(runAgentSuite(agentSuite({ $plumb: 'any' }), async () => {}), /arguments must be an object/);
});

test('discovery schemas describe matcher types without patterns or expected values', () => {
  const schema = fixtureInputSchema([{ arguments: { id: { $plumb: 'matches', pattern: '^SECRET-\\d+$' }, n: { $plumb: 'range', min: 1 }, kind: { $plumb: 'oneOf', values: ['VIP-A', 'VIP-B'] }, raw: { $plumb: 'literal', value: { $plumb: 'x' } }, free: { $plumb: 'any' } } }]);
  assert.deepEqual(schema.properties.id, { type: 'string' });
  assert.deepEqual(schema.properties.n, { type: 'number' });
  assert.deepEqual(schema.properties.kind, { type: 'string' });
  assert.equal(schema.properties.raw.properties.$plumb.type, 'string', 'literal content is described as data');
  assert.deepEqual(schema.properties.free, {});
  assert.ok(!/SECRET|VIP/.test(JSON.stringify(schema)));
});

test('output checks catch a wrong final answer, read JSON paths, and fail when output is missing', async () => {
  const run = (expect, output) => runAgentSuite(agentSuite({ to: 'x' }, expect), send({ to: 'x' }, output));
  const prose = { outputChecks: [{ contains: 'shipped', ignoreCase: true }, { notContains: 'cancelled', ignoreCase: true }] };
  assert.equal((await run(prose, 'Your order has SHIPPED.')).passed, true);
  const wrong = await run(prose, 'The status is cancelled.');
  assert.deepEqual(wrong.cases[0].failures.map(f => f.code), ['OUTPUT_ASSERTION', 'OUTPUT_ASSERTION']);
  assert.ok(!Object.hasOwn(wrong.cases[0].failures[0], 'expected'), 'only equals carries an expected value');
  const json = { outputChecks: [{ path: 'order.status', equals: 'shipped' }, { path: 'note', matches: '^Delivered by \\w+$' }] };
  assert.equal((await run(json, { order: { status: 'shipped' }, note: 'Delivered by DHL' })).passed, true);
  const badJson = await run(json, { order: { status: 'lost' }, note: 'x' });
  assert.deepEqual(badJson.cases[0].failures[0].actual, { order: { status: 'lost' } });
  const missing = await run({ outputChecks: [{ notContains: 'cancelled' }] }, undefined);
  assert.equal(missing.cases[0].failures[0].code, 'OUTPUT_ASSERTION');
  assert.equal(missing.cases[0].failures[0].actualMissing, true, 'notContains on no output fails closed');
});

test('planned runs report output checks as skipped instead of passing them silently', async () => {
  const s = { version: 1, name: 'Planned', policies: { allow: ['a'] }, cases: [{ name: 'c', calls: [{ tool: 'a', arguments: {} }], fixtures: [{ tool: 'a', arguments: {}, result: {} }], expect: { outputChecks: [{ contains: 'x' }] } }] };
  const report = await runSuite(s);
  assert.equal(report.cases[0].skippedOutputChecks, 1);
});

for (const [label, check] of [
  ['no operator', {}], ['two operators', { contains: 'a', equals: 'a' }], ['unknown key', { contains: 'a', regex: 'x' }],
  ['empty contains', { contains: '' }], ['unsafe pattern', { matches: '(.*a)*' }], ['non-boolean ignoreCase', { contains: 'a', ignoreCase: 'yes' }],
]) test(`invalid output check is rejected: ${label}`, async () => {
  await assert.rejects(runAgentSuite(agentSuite({ to: 'x' }, { outputChecks: [check] }), async () => {}), /Invalid suite:/);
});

for (const [label, tools] of [
  ['root not object', { a: { inputSchema: { type: 'string' } } }],
  ['unknown key', { a: { title: 'x' } }],
  ['bad required', { a: { inputSchema: { type: 'object', required: [1] } } }],
  ['oversize schema', { a: { inputSchema: { type: 'object', description: 'x'.repeat(20001) } } }],
]) test(`invalid tool declaration is rejected: ${label}`, async () => {
  const s = agentSuite({ to: 'x' }); s.tools = tools;
  await assert.rejects(runAgentSuite(s, async () => {}), /Invalid suite:/);
});
