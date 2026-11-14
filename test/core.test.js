import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runSuite, ReplaySession, createRecorder, redact, toHtml, toJUnit } from '../src/index.js';
import { loadExamples } from '../src/studio.js';

const fixture = () => ({ tool: 'orders.lookup', arguments: { id: 7 }, result: { structuredContent: { status: 'shipped' } } });
const suite = () => ({ version: 1, name: 'Test contract', policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Test case', calls: [{ tool: 'orders.lookup', arguments: { id: 7 } }], fixtures: [fixture()] }] });
const code = async (input) => (await runSuite(input)).cases[0].failures[0]?.code;

test('safe example passes and all four demo regressions fail', async () => {
  const examples = await loadExamples();
  const good = await runSuite(examples.safe);
  assert.equal(good.passed, true);
  const bad = await runSuite(examples.regression);
  assert.deepEqual(bad.summary, { total: 6, passed: 2, failed: 4, calls: 10, blocked: 2, liveToolCalls: 0 });
  assert.deepEqual(bad.cases.slice(2).map(c => c.failures[0].code), ['APPROVAL_REQUIRED', 'ARGUMENT_MISMATCH', 'DENIED_TOOL', 'RESULT_MISMATCH']);
});

test('default policy denies unlisted tools', async () => {
  const s = suite(); s.policies = {};
  assert.equal(await code(s), 'UNLISTED_TOOL');
});

test('deny takes precedence over allow and approval', async () => {
  const s = suite(); s.policies.deny = ['orders.lookup']; s.cases[0].context = { approvedTools: ['orders.lookup'] };
  assert.equal(await code(s), 'DENIED_TOOL');
});

test('approval in tool arguments cannot authorize a call', async () => {
  const s = suite(); s.policies.requireApproval = ['orders.lookup']; s.cases[0].calls[0].arguments.approvedTools = ['orders.lookup'];
  assert.equal(await code(s), 'APPROVAL_REQUIRED');
});

test('host context approval satisfies the test contract', async () => {
  const s = suite(); s.policies.requireApproval = ['orders.lookup']; s.cases[0].context = { approvedTools: ['orders.lookup'] };
  assert.equal((await runSuite(s)).passed, true);
});

test('missing fixtures fail without a live fallback', async () => {
  const s = suite(); s.cases[0].fixtures = [];
  assert.equal(await code(s), 'FIXTURE_MISSING');
});

test('unused fixture prevents a misleading pass', async () => {
  const s = suite(); s.cases[0].fixtures.push(fixture());
  assert.equal(await code(s), 'UNUSED_FIXTURES');
});

test('fixture arguments match deeply independent of object key order', async () => {
  const s = suite(); s.cases[0].fixtures[0].arguments = { nested: { a: 1, b: 2 } }; s.cases[0].calls[0].arguments = { nested: { b: 2, a: 1 } };
  assert.equal((await runSuite(s)).passed, true);
});

test('nested arrays and unexpected keys are part of exact argument matching', async () => {
  const s = suite(); s.cases[0].calls[0].arguments.extra = [1, 2];
  assert.equal(await code(s), 'ARGUMENT_MISMATCH');
});

test('tool name and fixture sequence must match', async () => {
  const s = suite(); s.cases[0].fixtures[0].tool = 'other';
  assert.equal(await code(s), 'CALL_ORDER');
});

test('repeated identical calls consume distinct fixtures in order', async () => {
  const s = suite(); s.cases[0].calls.push(structuredClone(s.cases[0].calls[0])); s.cases[0].fixtures.push({ ...fixture(), result: { count: 2 } });
  const report = await runSuite(s);
  assert.equal(report.passed, true); assert.deepEqual(report.cases[0].events[1].result, { count: 2 });
});

test('failed call does not consume the expected fixture', async () => {
  const replay = new ReplaySession({ fixtures: [fixture()], policies: { allow: ['orders.lookup'] } });
  await assert.rejects(replay.callTool({ name: 'orders.lookup', arguments: { id: 8 } }), { code: 'ARGUMENT_MISMATCH' });
  await replay.callTool({ name: 'orders.lookup', arguments: { id: 7 } });
  replay.verifyComplete();
});

test('error results are failures even when their fixture matches', async () => {
  const s = suite(); s.cases[0].fixtures[0].result = { isError: true, content: [] };
  assert.equal(await code(s), 'TOOL_ERROR');
});

test('expected call sequence checks attempted calls', async () => {
  const s = suite(); s.cases[0].expect = { callOrder: ['something.else'] };
  assert.equal(await code(s), 'EXPECTED_ORDER');
});

test('never assertions reject allowed calls too', async () => {
  const s = suite(); s.cases[0].expect = { never: ['orders.lookup'] };
  assert.equal(await code(s), 'FORBIDDEN_CALL');
});

test('output assertions support dotted array paths and falsy values', async () => {
  const s = suite(); s.cases[0].fixtures[0].result = { items: [{ ok: false, count: 0, text: '' }] };
  s.cases[0].expect = { results: [{ call: 0, path: 'items.0.ok', equals: false }, { call: 0, path: 'items.0.count', equals: 0 }, { call: 0, path: 'items.0.text', equals: '' }] };
  assert.equal((await runSuite(s)).passed, true);
});

test('output assertion can compare the whole result', async () => {
  const s = suite(); s.cases[0].expect = { results: [{ call: 0, path: '', equals: fixture().result }] };
  assert.equal((await runSuite(s)).passed, true);
});

test('inherited properties cannot satisfy result paths', async () => {
  const s = suite(); s.cases[0].expect = { results: [{ call: 0, path: '__proto__', equals: {} }] };
  assert.equal(await code(s), 'RESULT_MISMATCH');
});

for (const [label, change] of [
  ['unsupported versions', s => { s.version = 99; }],
  ['unknown policy keys', s => { s.policies.alow = ['orders.lookup']; }],
  ['empty suite', s => { s.cases = []; }],
  ['empty cases', s => { s.cases[0].calls = []; }],
  ['duplicate case names', s => { s.cases.push(structuredClone(s.cases[0])); }],
  ['invalid arguments', s => { s.cases[0].calls[0].arguments = null; }],
  ['missing fixture result', s => { delete s.cases[0].fixtures[0].result; }],
  ['invalid assertion index', s => { s.cases[0].expect = { results: [{ call: 4, path: '', equals: 0 }] }; }],
  ['unknown assertion keys', s => { s.cases[0].expect = { results: [{ call: 0, path: '', equals: 0, equlas: 1 }] }; }],
  ['unknown approval fields', s => { s.cases[0].context = { approval: true }; }],
]) test(`validate before running: ${label}`, async () => { const s = suite(); change(s); await assert.rejects(runSuite(s), /Invalid suite:/); });

test('cases do not share fixture consumption', async () => {
  const s = suite(); s.cases.push({ ...structuredClone(s.cases[0]), name: 'Second case' });
  assert.equal((await runSuite(s)).summary.passed, 2);
});

test('mutating returned values cannot corrupt fixtures', async () => {
  const f = fixture(); const replay = new ReplaySession({ fixtures: [f, f], policies: { allow: ['orders.lookup'] } });
  f.result.structuredContent.status = 'mutated';
  const a = await replay.callTool({ name: f.tool, arguments: f.arguments }); a.structuredContent.status = 'also mutated';
  const b = await replay.callTool({ name: f.tool, arguments: f.arguments }); assert.equal(b.structuredContent.status, 'shipped');
});

test('recorder captures real client calls and preserves input before mutation', async () => {
  let count = 0;
  const recorder = createRecorder({ async callTool(request) { count++; request.arguments.id = 99; return { ok: true }; } });
  assert.deepEqual(await recorder.callTool({ name: 'orders.lookup', arguments: { id: 7 } }), { ok: true });
  assert.equal(count, 1); assert.equal(recorder.fixtures[0].arguments.id, 7);
});

test('recorder rethrows transport errors and records an error fixture', async () => {
  const recorder = createRecorder({ async callTool() { throw new Error('Disconnected'); } });
  await assert.rejects(recorder.callTool({ name: 'orders.lookup', arguments: {} }), /Disconnected/);
  assert.equal(recorder.fixtures[0].result.isError, true);
});

test('recorder stores concurrent invocations in call order', async () => {
  let finishFirst;
  const recorder = createRecorder({ async callTool({name}) { if(name==='first') await new Promise(r=>{finishFirst=r;}); return { name }; } });
  const first = recorder.callTool({ name:'first' }); await recorder.callTool({ name:'second' }); finishFirst(); await first;
  assert.deepEqual(recorder.fixtures.map(f=>f.tool), ['first','second']);
});

test('redaction masks nested credential keys without mutating the report', () => {
  const value = { API_KEY: 'abc', nested: [{ Authorization: 'xyz', token: '123' }], password: 'private', note: 'a sentence' };
  const masked = redact(value); assert.equal(masked.API_KEY, '[REDACTED]'); assert.equal(masked.nested[0].Authorization, '[REDACTED]'); assert.equal(value.password, 'private'); assert.equal(masked.note, 'a sentence');
});

test('HTML payload cannot break out of its data element', async () => {
  const s = suite(); s.name = '</script><script>alert(1)</script>';
  const html = await toHtml(await runSuite(s));
  assert.ok(!html.includes(s.name));
  const payload = html.match(/id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(payload).name, s.name);
  assert.ok(!html.includes('/*__REPORT__*/null'));
});

test('JUnit escapes test names and failure messages', async () => {
  const s = suite(); s.cases[0].name = '<bad & "name">'; s.policies = {};
  const xml = toJUnit(await runSuite(s));
  assert.match(xml, /failures="1"/); assert.ok(xml.includes('&lt;bad &amp; &quot;name&quot;&gt;')); assert.ok(!xml.includes(s.cases[0].name));
});

test('project has an MIT license', async () => {
  const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.ok(license.startsWith('MIT License'));
});
