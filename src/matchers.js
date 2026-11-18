import { createContractValidator } from './contract.js';

/** Argument matchers and final-output checks, shared by the Node runner and the
 * Android bundle. Contracts are validated by contract.js before any of this runs.
 * Patterns use contract.js's linear-time engine, never backtracking RegExp. */
export function createMatchers() {
  const { compilePattern } = createContractValidator();
  const compiled = new Map();
  const MAX_PATTERN_INPUT = 20000;
  // Only JSON-like objects count: a Date, Map or class instance never equals a plain fixture object.
  // Realm-safe: a plain object's prototype is null or a root Object.prototype (from any realm).
  const plain = value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === null || Object.getPrototypeOf(proto) === null;
  };
  const isMatcher = value => plain(value) && Object.hasOwn(value, '$plumb');

  /** Strict JSON equality; matcher-shaped data is compared as plain data. */
  function equalJson(a, b) {
    if (Object.is(a, b)) return true;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => equalJson(item, b[i]));
    if (!plain(a) || !plain(b)) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && equalJson(a[k], b[k]));
  }

  /** Text and scalar values inside an answer; object keys are not searched. */
  function leaves(value, found = [], depth = 0) {
    if (typeof value === 'string') found.push(value);
    else if (typeof value === 'number' || typeof value === 'boolean') found.push(String(value));
    else if (value !== null && typeof value === 'object' && depth < 64) for (const item of Object.values(value)) leaves(item, found, depth + 1);
    return found;
  }

  const regexp = (pattern, ignoreCase = false) => {
    const key = `${ignoreCase ? 'i' : '-'}${pattern}`;
    if (!compiled.has(key)) { if (compiled.size > 500) compiled.clear(); compiled.set(key, compilePattern(pattern, ignoreCase)); }
    return compiled.get(key);
  };
  const fold = (text, ignoreCase) => ignoreCase ? text.toLowerCase() : text;

  function satisfies(matcher, actual) {
    switch (matcher.$plumb) {
      case 'any': return actual !== undefined;
      case 'contains': return typeof actual === 'string' && fold(actual, matcher.ignoreCase).includes(fold(matcher.value, matcher.ignoreCase));
      case 'matches': return typeof actual === 'string' && actual.length <= MAX_PATTERN_INPUT && regexp(matcher.pattern, matcher.ignoreCase).test(actual);
      case 'oneOf': return matcher.values.some(value => equalJson(value, actual));
      case 'range': return typeof actual === 'number' && Number.isFinite(actual) && (matcher.min === undefined || actual >= matcher.min) && (matcher.max === undefined || actual <= matcher.max);
      case 'literal': return equalJson(matcher.value, actual);
      default: return false;
    }
  }

  /** Does an actual tool argument value satisfy the (possibly matcher-bearing) fixture value? */
  function matchValue(expected, actual) {
    if (isMatcher(expected)) return satisfies(expected, actual);
    if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => matchValue(item, actual[i]));
    if (plain(expected)) {
      if (!plain(actual)) return false;
      const keys = Object.keys(expected);
      return keys.length === Object.keys(actual).length && keys.every(k => Object.hasOwn(actual, k) && matchValue(expected[k], actual[k]));
    }
    return Object.is(expected, actual);
  }

  /** Diff view only: satisfied matcher leaves take the actual value so the
   * comparison shows real differences, not matcher syntax. */
  function diffExpected(expected, actual) {
    if (isMatcher(expected)) return satisfies(expected, actual) ? structuredClone(actual) : structuredClone(expected);
    if (Array.isArray(expected)) return expected.map((item, i) => diffExpected(item, Array.isArray(actual) ? actual[i] : undefined));
    if (plain(expected)) return Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, diffExpected(v, plain(actual) && Object.hasOwn(actual, k) ? actual[k] : undefined)]));
    return expected;
  }

  function read(output, path) {
    if (!path) return output === undefined ? { found: false } : { found: true, value: output };
    let value = output;
    for (const part of path.split('.')) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) return { found: false };
      value = value[part];
    }
    return { found: true, value };
  }

  const operator = check => ['equals', 'contains', 'notContains', 'matches'].find(key => Object.hasOwn(check, key));

  /** Evaluate one expect.outputChecks entry against an agent's final output. */
  function checkOutput(check, output) {
    const op = operator(check);
    const { found, value } = read(output, check.path || '');
    if (!found) return { op, passed: false, found, reason: 'no output at this path' };
    if (op === 'equals') return { op, passed: equalJson(check.equals, value), found, value };
    if (op === 'matches') {
      if (typeof value !== 'string') return { op, passed: false, found, value, reason: 'pattern checks need text' };
      if (value.length > MAX_PATTERN_INPUT) return { op, passed: false, found, value, reason: `text longer than ${MAX_PATTERN_INPUT} characters is not checked with a pattern` };
      return { op, passed: regexp(check.matches, check.ignoreCase).test(value), found, value };
    }
    // Search the answer's own text values (not JSON-escaped text, not key names).
    const needle = fold(check[op], check.ignoreCase);
    const hit = leaves(value).some(text => fold(text, check.ignoreCase).includes(needle));
    return { op, passed: op === 'contains' ? hit : !hit, found, value };
  }

  return { isMatcher, matchValue, diffExpected, checkOutput, regexp, operator };
}
