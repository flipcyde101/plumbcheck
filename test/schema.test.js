// The published JSON Schema must agree with the validator on every structural rule.
// Validator-only (semantic) checks the schema cannot express, by design:
//   - result assertion `call` index past the planned calls,
//   - duplicate case names,
//   - patterns that do not compile in the linear-time engine (backreferences, lookarounds, counts > 100),
//   - nesting depth and size limits, and the agent-case "needs a fixture or an assertion" rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Ajv from 'ajv';
import { validateSuite } from '../src/index.js';

const root = new URL('../', import.meta.url);
const schema = JSON.parse(await readFile(new URL('schema/contract-v1.schema.json', root), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
const check = ajv.compile(schema);

const fixture = () => ({ tool: 'orders.lookup', arguments: { id: 7 }, result: { structuredContent: { status: 'shipped' } } });
const suite = () => ({ version: 1, name: 'Test contract', policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Test case', calls: [{ tool: 'orders.lookup', arguments: { id: 7 } }], fixtures: [fixture()] }] });
const accepts = value => { try { validateSuite(structuredClone(value)); return true; } catch { try { validateSuite(structuredClone(value), { mode: 'agent' }); return true; } catch { return false; } } };

async function exampleContracts() {
  const found = [];
  for (const folder of await readdir(new URL('examples/', root))) {
    let files; try { files = await readdir(new URL(`examples/${folder}/`, root)); } catch { continue; }
    for (const file of files.filter(f => f.endsWith('.json'))) found.push([`examples/${folder}/${file}`, JSON.parse((await readFile(new URL(`examples/${folder}/${file}`, root), 'utf8')).replace(/^﻿/, ''))]);
  }
  found.push(['test/fixtures/compat/contract-0.2.json', JSON.parse(await readFile(new URL('test/fixtures/compat/contract-0.2.json', root), 'utf8'))]);
  return found;
}

test('the schema id matches its published Pages URL', () => {
  assert.equal(schema.$id, 'https://stepan4002.github.io/plumbcheck/schema/contract-v1.schema.json');
});

test('every example contract passes both the validator and the schema', async () => {
  const examples = await exampleContracts();
  assert.ok(examples.length >= 6);
  for (const [name, contract] of examples) {
    assert.ok(accepts(contract), `${name}: validator`);
    assert.ok(check(contract), `${name}: schema ${ajv.errorsText(check.errors)}`);
  }
});

for (const [label, change] of [
  ['unsupported versions', s => { s.version = 99; }],
  ['unknown suite keys', s => { s.extra = true; }],
  ['unknown policy keys', s => { s.policies.alow = ['orders.lookup']; }],
  ['missing policies', s => { delete s.policies; }],
  ['empty suite', s => { s.cases = []; }],
  ['empty calls', s => { s.cases[0].calls = []; }],
  ['invalid arguments', s => { s.cases[0].calls[0].arguments = null; }],
  ['missing fixture result', s => { delete s.cases[0].fixtures[0].result; }],
  ['unknown assertion keys', s => { s.cases[0].expect = { results: [{ call: 0, path: '', equals: 0, equlas: 1 }] }; }],
  ['unknown approval fields', s => { s.cases[0].context = { approval: true }; }],
  ['wrong name type', s => { s.name = 7; }],
  ['non-string $schema', s => { s.$schema = 1; }],
  ['matchers in planned calls', s => { s.cases[0].calls[0].arguments = { id: { $plumb: 'any' } }; }],
  ['unknown matcher', s => { s.cases[0].fixtures[0].arguments = { id: { $plumb: 'nearly' } }; }],
  ['range matcher without bounds', s => { s.cases[0].fixtures[0].arguments = { id: { $plumb: 'range' } }; }],
  ['output check with two operators', s => { s.cases[0].expect = { outputChecks: [{ contains: 'a', notContains: 'b' }] }; }],
  ['output in a planned case', s => { s.cases[0].expect = { output: 'done' }; }],
  ['planned and agent cases mixed', s => { s.cases.push({ name: 'Agent case', input: 'x', fixtures: [fixture()] }); }],
  ['tool declaration without object schema', s => { s.tools = { 'orders.lookup': { inputSchema: { type: 'string' } } }; }],
]) test(`schema and validator both reject: ${label}`, () => {
  const s = suite(); change(s);
  assert.equal(accepts(s), false, 'validator should reject');
  assert.equal(check(s), false, 'schema should reject');
});

for (const [label, change] of [
  ['assertion index past the calls', s => { s.cases[0].expect = { results: [{ call: 4, path: '', equals: 0 }] }; }],
  ['duplicate case names', s => { s.cases.push(structuredClone(s.cases[0])); }],
  ['pattern with a backreference', s => { s.cases[0].fixtures[0].arguments = { id: { $plumb: 'matches', pattern: '(a)\\1' } }; }],
]) test(`validator-only semantic rule: ${label}`, () => {
  const s = suite(); change(s);
  assert.equal(accepts(s), false, 'validator should reject');
  assert.equal(check(s), true, 'the schema intentionally allows this structural shape');
});

test('a contract with $schema is accepted by the validator and the schema', () => {
  const s = { $schema: schema.$id, ...suite() };
  assert.ok(accepts(s));
  assert.ok(check(s), ajv.errorsText(check.errors));
});

test('fixture matchers of every kind are structurally valid', () => {
  const s = suite();
  s.cases[0].fixtures[0].arguments = { id: { $plumb: 'oneOf', values: [7, 8] }, a: { $plumb: 'any' }, b: { $plumb: 'contains', value: 'x', ignoreCase: true }, c: { $plumb: 'matches', pattern: '^ORD-\\d+$' }, d: { $plumb: 'range', min: 1 }, e: [{ $plumb: 'literal', value: { $plumb: 'any' } }] };
  assert.ok(accepts(s));
  assert.ok(check(s), ajv.errorsText(check.errors));
});
