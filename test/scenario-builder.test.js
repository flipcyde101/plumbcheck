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
