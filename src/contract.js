/** Self-contained factory shared by the Node runner and offline workbench. */
export function createContractValidator() {
  const own = (value, key) => Object.hasOwn(value, key);
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

  function requireValue(condition, message) {
    if (!condition) throw new Error(`Invalid suite: ${message}`);
  }

  function keys(value, allowed, label) {
    requireValue(object(value), `${label} must be an object`);
    for (const key of Object.keys(value)) requireValue(allowed.includes(key), `unknown ${label} field "${key}"`);
  }

  function strings(value, label) {
    requireValue(Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0), `${label} must be an array of nonempty strings`);
  }

  function call(value, label, fixture = false) {
    keys(value, fixture ? ['tool', 'arguments', 'result'] : ['tool', 'arguments'], label);
    requireValue(typeof value.tool === 'string' && value.tool.length > 0, `${label}.tool is required`);
    requireValue(object(value.arguments), `${label}.arguments must be an object`);
    if (fixture) requireValue(own(value, 'result'), `${label}.result is required`);
  }

  /** Validate the entire contract before any case can execute. Unknown keys fail closed. */
  function validateSuite(suite, { mode = 'planned' } = {}) {
    requireValue(['planned', 'agent'].includes(mode), 'unknown validation mode');
    keys(suite, ['version', 'name', 'description', 'policies', 'cases'], 'suite');
    requireValue(suite.version === 1, 'version must be 1');
    requireValue(typeof suite.name === 'string' && suite.name.length > 0, 'name is required');
    if (own(suite, 'description')) requireValue(typeof suite.description === 'string', 'description must be a string');
    keys(suite.policies, ['allow', 'deny', 'requireApproval'], 'policies');
    for (const key of ['allow', 'deny', 'requireApproval']) {
      if (own(suite.policies, key)) strings(suite.policies[key], `policies.${key}`);
    }
    requireValue(Array.isArray(suite.cases) && suite.cases.length > 0, 'cases must not be empty');
    const names = new Set();
    for (const c of suite.cases) {
      keys(c, mode === 'agent' ? ['name', 'description', 'input', 'fixtures', 'context', 'expect'] : ['name', 'description', 'calls', 'fixtures', 'context', 'expect'], 'case');
      requireValue(typeof c.name === 'string' && c.name.length > 0 && !names.has(c.name), 'case names must be nonempty and unique');
      names.add(c.name);
      if (own(c, 'description')) requireValue(typeof c.description === 'string', 'case description must be a string');
      if (mode === 'planned') {
        requireValue(Array.isArray(c.calls) && c.calls.length > 0, `${c.name}: calls must not be empty`);
        c.calls.forEach((v) => call(v, 'call'));
      }
      requireValue(Array.isArray(c.fixtures), `${c.name}: fixtures must be an array`);
      c.fixtures.forEach((v) => call(v, 'fixture', true));
      if (own(c, 'context')) {
        keys(c.context, ['approvedTools'], 'context');
        if (own(c.context, 'approvedTools')) strings(c.context.approvedTools, 'context.approvedTools');
      }
      if (own(c, 'expect')) {
        keys(c.expect, mode === 'agent' ? ['callOrder', 'never', 'results', 'output'] : ['callOrder', 'never', 'results'], 'expect');
        if (own(c.expect, 'callOrder')) strings(c.expect.callOrder, 'expect.callOrder');
        if (own(c.expect, 'never')) strings(c.expect.never, 'expect.never');
        if (own(c.expect, 'results')) {
          requireValue(Array.isArray(c.expect.results), 'expect.results must be an array');
          for (const result of c.expect.results) {
            keys(result, ['call', 'path', 'equals'], 'result assertion');
            requireValue(Number.isInteger(result.call) && result.call >= 0 && (mode === 'agent' || result.call < c.calls.length), 'result assertion call index is out of range');
            requireValue(typeof result.path === 'string', 'result assertion path must be a string');
            requireValue(own(result, 'equals'), 'result assertion equals is required');
          }
        }
      }
      if (mode === 'agent') requireValue(c.fixtures.length > 0 || (c.expect && (own(c.expect, 'output') || own(c.expect, 'callOrder') || c.expect.never?.length)), `${c.name}: agent case needs a fixture or an explicit assertion`);
    }
    return suite;
  }

  return validateSuite;
}
