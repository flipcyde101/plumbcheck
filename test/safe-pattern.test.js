import test from 'node:test';
import assert from 'node:assert/strict';
import { createContractValidator } from '../src/contract.js';

const { compilePattern } = createContractValidator();

// Patterns in the supported subset must agree with native RegExp on ordinary input.
const corpus = [
  ['^ORD-\\d+$', ['ORD-1042', 'ORD-', 'xORD-1', 'ORD-12a']],
  ['shipped', ['it shipped today', 'SHIPPED', 'ship']],
  ['^(cat|dog)s?$', ['cat', 'dogs', 'cats!', 'bird']],
  ['colou?r', ['color', 'colour', 'colr']],
  ['^[A-Z][a-z]{2,4}$', ['Anna', 'Al', 'Alexandra', 'anna']],
  ['\\bwar\\b', ['the war ended', 'warning', 'war']],
  ['\\Bing', ['singing', 'ing']],
  ['^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$', ['a@b.co', 'a@b', 'a b@c.de', 'x@y.museum']],
  ['^\\s*$', ['', '   ', ' a ']],
  ['a.c', ['abc', 'a\nc', 'ac']],
  ['^(?:ab)+$', ['abab', 'aba', '']],
  ['x{3}', ['xx', 'xxx', 'axxxa']],
  ['^\\d{1,3}(?:,\\d{3})*$', ['1,000', '12,34', '999', '1,000,000']],
  ['[\\-.]', ['a-b', 'a.b', 'ab']],
  ['\\x41\\u0042', ['AB', 'ab']],
  ['^$', ['', 'a']],
  ['a|', ['b', '']],
  ['[]', ['a']],
  ['(a*)*b', ['aaab', 'aaa']],
];

test('the linear pattern engine agrees with RegExp on supported patterns', () => {
  for (const [pattern, inputs] of corpus) for (const input of inputs) for (const ignoreCase of [false, true]) {
    assert.equal(compilePattern(pattern, ignoreCase).test(input), new RegExp(pattern, ignoreCase ? 'i' : '').test(input), `${pattern} ${ignoreCase ? '(i)' : ''} on ${JSON.stringify(input)}`);
  }
});

test('patterns that make RegExp backtrack exponentially run in linear time', () => {
  const evil = ['(a|a)*b', '((a+))+$', '(?:(?:a+))+$', '(a|aa)+$', '(a|a?)+$', '\\w*\\w*\\w*\\w*$', 'a*a*a*a*a*b', '.*a.*b.*c.*d', '(a+[)]?)+$', '(.*,){20}'];
  const input = 'a'.repeat(20000) + '!';
  for (const pattern of evil) {
    const started = performance.now();
    compilePattern(pattern).test(input);
    assert.ok(performance.now() - started < 2000, `${pattern} took ${Math.round(performance.now() - started)} ms`);
  }
});

test('unsupported or unsafe syntax is rejected with a clear reason', () => {
  for (const [pattern, reason] of [['(a)\\1', /backreferences/], ['(?=a)', /lookarounds/], ['(?<n>a)', /lookarounds/], ['a{101}', /above 100/], ['[', /not closed/], ['(a', /not closed/], ['a)', /no group/], ['*a', /nothing to repeat/], ['a\\', /backslash/], ['^*', /anchor cannot be repeated/], ['[z-a]', /range/], ['((a{100}){100})', /too complex/]]) {
    assert.throws(() => compilePattern(pattern), reason, pattern);
  }
});
