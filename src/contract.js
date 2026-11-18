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

  const isMatcher = (value) => object(value) && own(value, '$plumb');

  /** Bounded, compiled regular expressions. Backreferences and quantified groups
   * that contain quantifiers are refused to limit catastrophic backtracking. */
  function pattern(value, label) {
    requireValue(typeof value === 'string' && value.length > 0 && value.length <= 200, `${label} must be a pattern of 1 to 200 characters`);
    requireValue(!/\\[1-9]|\\k</.test(value), `${label} must not use backreferences`);
    requireValue(!/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(value), `${label} must not repeat a group that already contains a repetition`);
    try { new RegExp(value); new RegExp(value, 'i'); } catch { requireValue(false, `${label} is not a valid regular expression`); }
  }

  function matcher(value, label) {
    const kind = value.$plumb;
    const allowed = { any: [], contains: ['value', 'ignoreCase'], matches: ['pattern', 'ignoreCase'], oneOf: ['values'], range: ['min', 'max'], literal: ['value'] }[kind];
    requireValue(typeof kind === 'string' && Array.isArray(allowed), `${label} uses an unknown matcher "${String(kind)}"`);
    keys(value, ['$plumb', ...allowed], `${label} matcher`);
    if (own(value, 'ignoreCase')) requireValue(typeof value.ignoreCase === 'boolean', `${label} matcher ignoreCase must be a boolean`);
    if (kind === 'contains') requireValue(typeof value.value === 'string' && value.value.length > 0 && value.value.length <= 4000, `${label} contains matcher needs value text of 1 to 4000 characters`);
    if (kind === 'matches') pattern(value.pattern, `${label} matches matcher pattern`);
    if (kind === 'oneOf') requireValue(Array.isArray(value.values) && value.values.length > 0 && value.values.length <= 50, `${label} oneOf matcher needs 1 to 50 values`);
    if (kind === 'range') {
      const bound = (key) => !own(value, key) || (typeof value[key] === 'number' && Number.isFinite(value[key]));
      requireValue(bound('min') && bound('max') && (own(value, 'min') || own(value, 'max')), `${label} range matcher needs a finite min and/or max`);
      requireValue(!own(value, 'min') || !own(value, 'max') || value.min <= value.max, `${label} range matcher min must not exceed max`);
    }
    if (kind === 'literal') requireValue(own(value, 'value'), `${label} literal matcher needs a value`);
  }

  /** Fixture arguments may contain matchers; literal.value and oneOf.values stay opaque data. */
  function matcherTree(value, label, depth = 0) {
    requireValue(depth <= 64, `${label} is nested too deeply`);
    if (isMatcher(value)) return matcher(value, label);
    if (Array.isArray(value)) value.forEach((item) => matcherTree(item, label, depth + 1));
    else if (object(value)) for (const item of Object.values(value)) matcherTree(item, label, depth + 1);
  }

  function noMatchers(value, label, depth = 0) {
    if (depth > 64 || value === null || typeof value !== 'object') return;
    requireValue(!isMatcher(value), `${label}: matchers are only allowed in fixture arguments`);
    for (const item of Object.values(value)) noMatchers(item, label, depth + 1);
  }

  function call(value, label, fixture = false) {
    keys(value, fixture ? ['tool', 'arguments', 'result'] : ['tool', 'arguments'], label);
    requireValue(typeof value.tool === 'string' && value.tool.length > 0, `${label}.tool is required`);
    requireValue(object(value.arguments) && !isMatcher(value.arguments), `${label}.arguments must be an object`);
    if (fixture) {
      requireValue(own(value, 'result'), `${label}.result is required`);
      matcherTree(value.arguments, `${label}.arguments`);
    } else noMatchers(value.arguments, `${label}.arguments`);
  }

  function depthOf(value, depth = 0) {
    if (value === null || typeof value !== 'object' || depth > 40) return depth;
    let deepest = depth;
    for (const item of Object.values(value)) deepest = Math.max(deepest, depthOf(item, depth + 1));
    return deepest;
  }

  function tools(value) {
    requireValue(object(value) && Object.keys(value).length <= 200, 'tools must be an object with at most 200 entries');
    for (const [name, declaration] of Object.entries(value)) {
      requireValue(name.length > 0 && name.length <= 128, 'tool names must have 1 to 128 characters');
      keys(declaration, ['description', 'inputSchema'], `tool "${name}"`);
      if (own(declaration, 'description')) requireValue(typeof declaration.description === 'string' && declaration.description.length <= 2000, `tool "${name}" description must be text of at most 2000 characters`);
      if (own(declaration, 'inputSchema')) {
        const schema = declaration.inputSchema;
        requireValue(object(schema) && schema.type === 'object', `tool "${name}" inputSchema must be a JSON Schema with type "object"`);
        if (own(schema, 'properties')) requireValue(object(schema.properties), `tool "${name}" inputSchema.properties must be an object`);
        if (own(schema, 'required')) requireValue(Array.isArray(schema.required) && schema.required.every((v) => typeof v === 'string'), `tool "${name}" inputSchema.required must be an array of names`);
        requireValue(depthOf(schema) <= 32 && JSON.stringify(schema).length <= 20000, `tool "${name}" inputSchema is too large or too deeply nested`);
      }
    }
  }

  function outputChecks(value) {
    requireValue(Array.isArray(value) && value.length > 0 && value.length <= 50, 'expect.outputChecks needs 1 to 50 checks');
    for (const check of value) {
      keys(check, ['path', 'equals', 'contains', 'notContains', 'matches', 'ignoreCase'], 'output check');
      const operators = ['equals', 'contains', 'notContains', 'matches'].filter((key) => own(check, key));
      requireValue(operators.length === 1, 'each output check needs exactly one of equals, contains, notContains or matches');
      if (own(check, 'path')) requireValue(typeof check.path === 'string' && check.path.length <= 500, 'output check path must be text of at most 500 characters');
      for (const key of ['contains', 'notContains']) if (own(check, key)) requireValue(typeof check[key] === 'string' && check[key].length > 0 && check[key].length <= 4000, `output check ${key} must be text of 1 to 4000 characters`);
      if (own(check, 'matches')) pattern(check.matches, 'output check matches');
      if (own(check, 'ignoreCase')) requireValue(typeof check.ignoreCase === 'boolean', 'output check ignoreCase must be a boolean');
    }
  }

  /** Validate the entire contract before any case can execute. Unknown keys fail closed. */
  function validateSuite(suite, { mode = 'planned' } = {}) {
    requireValue(['planned', 'agent'].includes(mode), 'unknown validation mode');
    keys(suite, ['version', 'name', 'description', 'policies', 'cases', 'tools'], 'suite');
    requireValue(suite.version === 1, 'version must be 1');
    requireValue(typeof suite.name === 'string' && suite.name.length > 0, 'name is required');
    if (own(suite, 'description')) requireValue(typeof suite.description === 'string', 'description must be a string');
    if (own(suite, 'tools')) tools(suite.tools);
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
        // outputChecks are valid in planned contracts too (builder drafts) but only
        // evaluate when an agent or model produced output; other modes report them as skipped.
        keys(c.expect, mode === 'agent' ? ['callOrder', 'never', 'results', 'output', 'outputChecks'] : ['callOrder', 'never', 'results', 'outputChecks'], 'expect');
        if (own(c.expect, 'callOrder')) strings(c.expect.callOrder, 'expect.callOrder');
        if (own(c.expect, 'never')) strings(c.expect.never, 'expect.never');
        if (own(c.expect, 'outputChecks')) outputChecks(c.expect.outputChecks);
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
      if (mode === 'agent') requireValue(c.fixtures.length > 0 || (c.expect && (own(c.expect, 'output') || own(c.expect, 'callOrder') || c.expect.never?.length || c.expect.outputChecks?.length)), `${c.name}: agent case needs a fixture or an explicit assertion`);
    }
    return suite;
  }

  return validateSuite;
}
