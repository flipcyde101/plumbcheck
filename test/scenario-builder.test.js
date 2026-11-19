import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioTools } from '../src/scenario-builder.js';
import { validateSuite } from '../src/validation.js';
import { runSuite } from '../src/runner.js';
import { connectionConfig } from '../src/workspace.js';

const scenarios = createScenarioTools(validateSuite);
test('builder templates produce valid passing scenarios; correcting a wrong planned value retains the exact test', async () => {
  for (const kind of ['order', 'ticket']) {
    const form = scenarios.template(kind);
    const correct = scenarios.build(form).contract;
    assert.equal((await runSuite(correct)).passed, true);
    form.arguments[0].planned = 'WRONG-ID';
    const wrong = scenarios.build(form).contract;
    const result = await runSuite(wrong);
    assert.equal(result.passed, false);
    assert.ok(result.cases[0].failures.some(f => f.code === 'ARGUMENT_MISMATCH'));
    assert.deepEqual(wrong.cases[0].fixtures, correct.cases[0].fixtures);
    assert.deepEqual(wrong.cases[0].expect, correct.cases[0].expect);
    assert.deepEqual(wrong.cases.map(c => c.name), correct.cases.map(c => c.name));
  }
});
test('builder preserves nested typed values and models trusted test approval explicitly', async () => {
  const form = scenarios.template();
  form.approval = true;
  form.arguments = [{ path: 'order.id', type: 'number', expected: '0', planned: '0' }, { path: 'includeDetails', type: 'boolean', expected: 'false', planned: 'false' }];
  form.responses = [{ path: 'customer.email', type: 'text', value: 'customer@example.test' }, { path: 'count', type: 'number', value: '0' }];
  const built = scenarios.build(form);
  assert.deepEqual(built.contract.cases[0].calls[0].arguments, { order: { id: 0 }, includeDetails: false });
  assert.deepEqual(built.contract.cases[0].context.approvedTools, ['orders.lookup']);
  assert.equal((await runSuite(built.contract)).passed, true);
});
test('builder rejects malformed values, path collisions, prototype keys and oversized inputs before saving', () => {
  for (const path of ['__proto__.polluted', 'constructor.name', 'customer.prototype', 'a..b', 'a[0]']) {
    const form = scenarios.template(); form.arguments[0].path = path;
    assert.throws(() => scenarios.build(form), /field names|Reserved/);
  }
  for (const rows of [[], [{ path: 'a', type: 'text', expected: '', planned: '' }, { path: 'a.b', type: 'text', expected: '', planned: '' }]]) {
    const form = scenarios.template(); form.arguments = rows;
    assert.throws(() => scenarios.build(form), /between|overlapping/);
  }
  for (const [type, value] of [['number', 'NaN'], ['number', ''], ['boolean', 'yes'], ['text', 'x'.repeat(4001)]]) {
    const form = scenarios.template(); form.arguments[0].type = type; form.arguments[0].planned = value;
    assert.throws(() => scenarios.build(form));
  }
  assert.equal({}.polluted, undefined);
  const large = scenarios.template();
  large.arguments = Array.from({ length: 20 }, (_, i) => ({ path: `argument${i}`, type: 'text', expected: '\uffff'.repeat(4000), planned: '\uffff'.repeat(4000) }));
  large.responses = Array.from({ length: 20 }, (_, i) => ({ path: `response${i}`, type: 'text', value: '\uffff'.repeat(4000) }));
  assert.throws(() => scenarios.build(large), /exceeds 1 MB/);
  const inherited = scenarios.template(); inherited.arguments[0].path = 'toString.plumbcheckBuilderProbe';
  try {
    const built = scenarios.build(inherited);
    assert.equal(Object.prototype.toString.plumbcheckBuilderProbe, undefined, 'Nested paths must never traverse inherited objects.');
    assert.equal(built.contract.cases[0].calls[0].arguments.toString.plumbcheckBuilderProbe, 'ORD-1042');
  } finally { delete Object.prototype.toString.plumbcheckBuilderProbe; }
});
test('desktop Ollama accepts copied model-list URLs without relaxing destination restrictions', () => {
  for (const baseURL of ['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:11434/', 'http://127.0.0.1:11434/v1/models']) {
    assert.equal(connectionConfig({ name: 'Local', provider: 'ollama', model: 'qwen3.5:4b', baseURL }).baseURL, 'http://127.0.0.1:11434/v1');
  }
  for (const baseURL of ['http://192.168.1.138:11434', 'https://remote.example/api/tags', 'http://user:secret@localhost:11434/api/tags']) {
    assert.throws(() => connectionConfig({ name: 'Local', provider: 'ollama', model: 'qwen3.5:4b', baseURL }));
  }
});

test('must-not templates build valid contracts that offer the guarded tool and forbid its use', async () => {
  const expectations = { 'unapproved-send': ['email.send', 'requireApproval'], 'forbidden-delete': ['orders.delete', 'deny'], 'injected-instruction': ['orders.delete', 'deny'] };
  for (const [kind, [guarded, policy]] of Object.entries(expectations)) {
    const { contract } = scenarios.build(scenarios.template(kind));
    const c = contract.cases[0];
    assert.ok(contract.policies[policy].includes(guarded), kind);
    assert.deepEqual(c.expect.never, [guarded]);
    assert.equal(c.context, undefined, `${kind} must not pre-approve the guarded tool`);
    assert.equal((await runSuite(contract)).passed, true, 'the planned draft passes; only a real run tests resistance');
  }
  const injected = scenarios.build(scenarios.template('injected-instruction')).contract.cases[0].fixtures[0].result.structuredContent;
  assert.match(injected.note, /orders\.delete/);
});

test('final-answer text becomes a case-insensitive output check and an empty value adds none', async () => {
  const order = scenarios.build(scenarios.template('order')).contract;
  assert.deepEqual(order.cases[0].expect.outputChecks, [{ contains: 'shipped', ignoreCase: true }]);
  assert.equal((await runSuite(order)).cases[0].skippedOutputChecks, 1, 'planned check reports the answer check as not evaluated');
  const none = scenarios.build({ ...scenarios.template('order'), outputContains: '   ' }).contract;
  assert.equal(none.cases[0].expect.outputChecks, undefined);
});

test('approval checkbox and an approval guard are merged instead of overwritten', () => {
  const { contract } = scenarios.build({ ...scenarios.template('unapproved-send'), approval: true });
  assert.deepEqual(contract.policies.requireApproval, ['orders.lookup', 'email.send']);
  assert.deepEqual(contract.cases[0].context.approvedTools, ['orders.lookup'], 'only the main tool is approved');
});

test('builder guards reject a guarded tool equal to the main tool and an injected note that collides', () => {
  assert.throws(() => scenarios.build({ ...scenarios.template('forbidden-delete'), guard: { kind: 'deny', tool: 'orders.lookup' } }), /has to differ/);
  const form = scenarios.template('injected-instruction');
  form.responses.push({ path: 'note', type: 'text', value: 'x' });
  assert.throws(() => scenarios.build(form), /already has a "note" field/);
  assert.throws(() => scenarios.build({ ...scenarios.template('order'), guard: { kind: 'explode', tool: 'x' } }), /must not do/);
});
