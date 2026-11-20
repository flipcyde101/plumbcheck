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

  /** Linear-time pattern engine for contract regular expressions (a Thompson-NFA
   * simulation). JavaScript's backtracking RegExp can take exponential time on
   * patterns such as (a|a)*b, and no syntactic guard reliably prevents that, so
   * contract patterns never reach RegExp. Supported: literals and escapes, `.`,
   * classes [a-z] [^...], \d \w \s and negations, \b \B, ^ $, (...) and (?:...),
   * |, and * + ? {n} {n,} {n,m} (counts up to 100; a lazy `?` suffix is accepted).
   * Unsupported (rejected): backreferences, lookarounds, named groups. */
  function compilePattern(source, ignoreCase = false) {
    if (typeof source !== 'string' || source.length < 1 || source.length > 200) throw new Error('use 1 to 200 characters');
    let i = 0;
    const stop = message => { throw new Error(message); };
    const fold = predicate => ignoreCase ? c => predicate(c) || predicate(c.toLowerCase()) || predicate(c.toUpperCase()) : predicate;
    const isWord = c => c !== undefined && /[A-Za-z0-9_]/.test(c);
    const classes = { d: c => c >= '0' && c <= '9', w: isWord, s: c => /\s/.test(c) };
    const controls = { n: '\n', r: '\r', t: '\t', f: '\f', v: '\v', 0: '\0' };
    function escapeChar(inClass) {
      const c = source[i++];
      if (c === undefined) stop('a pattern cannot end with a backslash');
      if (/[1-9]/.test(c) || c === 'k') stop('backreferences are not supported');
      if (classes[c.toLowerCase()] && 'dwsDWS'.includes(c)) { const p = classes[c.toLowerCase()]; return { set: c === c.toLowerCase() ? p : x => !p(x) }; }
      if (!inClass && (c === 'b' || c === 'B')) return { assert: c };
      if (inClass && c === 'b') return { char: '\b' };
      if (Object.hasOwn(controls, c)) return { char: controls[c] };
      if (c === 'x' || c === 'u') {
        const digits = c === 'x' ? 2 : 4, hex = source.slice(i, i + digits);
        if (!new RegExp(`^[0-9A-Fa-f]{${digits}}$`).test(hex)) stop(`\\${c} needs ${digits} hex digits`);
        i += digits; return { char: String.fromCharCode(parseInt(hex, 16)) };
      }
      return { char: c };
    }
    function parseClass() {
      let negate = false; if (source[i] === '^') { negate = true; i++; }
      const parts = [];
      while (source[i] !== ']') {
        if (i >= source.length) stop('a character class is not closed');
        let item = source[i] === '\\' ? (i++, escapeChar(true)) : { char: source[i++] };
        if (item.char !== undefined && source[i] === '-' && source[i + 1] !== ']' && i + 1 < source.length) {
          i++;
          const end = source[i] === '\\' ? (i++, escapeChar(true)) : { char: source[i++] };
          if (end.char === undefined || end.char < item.char) stop('a character range is invalid');
          const lo = item.char, hi = end.char; item = { set: c => c >= lo && c <= hi };
        }
        parts.push(item.set ?? (c => c === item.char));
      }
      i++;
      const predicate = c => parts.some(p => p(c));
      return negate ? c => !predicate(c) : predicate;
    }
    function parseAtom() {
      const c = source[i];
      if (c === '(') {
        if (source.startsWith('(?:', i)) i += 3;
        else if (source[i + 1] === '?') stop('lookarounds and named groups are not supported');
        else i++;
        const node = parseAlt();
        if (source[i] !== ')') stop('a group is not closed');
        i++; return node;
      }
      if (c === '*' || c === '+' || c === '?') stop('a quantifier has nothing to repeat');
      i++;
      if (c === '[') return { t: 'char', p: fold(parseClass()) };
      if (c === '.') return { t: 'char', p: x => x !== '\n' && x !== '\r' && x !== ' ' && x !== ' ' };
      if (c === '^') return { t: 'assert', k: '^' };
      if (c === '$') return { t: 'assert', k: '$' };
      if (c === '\\') {
        const item = escapeChar(false);
        if (item.assert) return { t: 'assert', k: item.assert };
        if (item.set) return { t: 'char', p: fold(item.set) };
        const ch = item.char; return { t: 'char', p: fold(x => x === ch) };
      }
      return { t: 'char', p: fold(x => x === c) };
    }
    function parseRepeat() {
      let node = parseAtom();
      for (;;) {
        let min, max;
        const c = source[i], counted = c === '{' ? /^\{(\d+)(,(\d*))?\}/.exec(source.slice(i)) : null;
        if (c === '*') { min = 0; max = Infinity; i++; }
        else if (c === '+') { min = 1; max = Infinity; i++; }
        else if (c === '?') { min = 0; max = 1; i++; }
        else if (counted) {
          i += counted[0].length; min = Number(counted[1]);
          max = counted[2] === undefined ? min : counted[3] === '' ? Infinity : Number(counted[3]);
          if (min > 100 || (max !== Infinity && max > 100)) stop('repetition counts above 100 are not supported');
          if (max < min) stop('a repetition range is invalid');
        } else return node;
        if (source[i] === '?') i++;
        if (node.t === 'assert') stop('an anchor cannot be repeated');
        node = { t: 'repeat', node, min, max };
      }
    }
    function parseSequence() {
      const nodes = [];
      while (i < source.length && source[i] !== '|' && source[i] !== ')') nodes.push(parseRepeat());
      return { t: 'sequence', nodes };
    }
    function parseAlt() {
      const options = [parseSequence()];
      while (source[i] === '|') { i++; options.push(parseSequence()); }
      return options.length === 1 ? options[0] : { t: 'alt', options };
    }
    const tree = parseAlt();
    if (i < source.length) stop('a closing parenthesis has no group');

    // Compile to a small program; the size cap bounds the per-character work.
    const program = [];
    const emit = instruction => { if (program.length >= 2000) stop('the pattern is too complex'); program.push(instruction); return program.length - 1; };
    function generate(node) {
      if (node.t === 'char') emit({ op: 'char', p: node.p });
      else if (node.t === 'assert') emit({ op: 'assert', k: node.k });
      else if (node.t === 'sequence') node.nodes.forEach(generate);
      else if (node.t === 'alt') {
        const exits = [];
        node.options.forEach((option, index) => {
          if (index === node.options.length - 1) return generate(option);
          const split = emit({ op: 'split' }); program[split].a = program.length;
          generate(option); exits.push(emit({ op: 'jump' })); program[split].b = program.length;
        });
        for (const exit of exits) program[exit].to = program.length;
      } else {
        for (let k = 0; k < node.min; k++) generate(node.node);
        if (node.max === Infinity) {
          const split = emit({ op: 'split' }); program[split].a = program.length;
          generate(node.node); emit({ op: 'jump', to: split }); program[split].b = program.length;
        } else for (let k = node.min; k < node.max; k++) {
          const split = emit({ op: 'split' }); program[split].a = program.length;
          generate(node.node); program[split].b = program.length;
        }
      }
    }
    generate(tree);
    emit({ op: 'match' });

    function test(input) {
      const marks = new Int32Array(program.length).fill(-1);
      let generation = 0;
      const holds = (kind, at) => kind === '^' ? at === 0 : kind === '$' ? at === input.length
        : (isWord(input[at - 1]) !== isWord(input[at])) === (kind === 'b');
      function add(list, start, at) {
        const stack = [start];
        while (stack.length) {
          const pc = stack.pop();
          if (marks[pc] === generation) continue;
          marks[pc] = generation;
          const instruction = program[pc];
          if (instruction.op === 'jump') stack.push(instruction.to);
          else if (instruction.op === 'split') stack.push(instruction.b, instruction.a);
          else if (instruction.op === 'assert') { if (holds(instruction.k, at)) stack.push(pc + 1); }
          else list.push(pc);
        }
      }
      generation++;
      let current = []; add(current, 0, 0);
      for (let at = 0; ; at++) {
        if (current.some(pc => program[pc].op === 'match')) return true;
        if (at >= input.length) return false;
        generation++;
        const next = [], c = input[at];
        for (const pc of current) if (program[pc].op === 'char' && program[pc].p(c)) add(next, pc + 1, at + 1);
        add(next, 0, at + 1); // unanchored search: a match may start at any position
        current = next;
      }
    }
    return { test };
  }

  /** Contract patterns must compile with the linear-time engine above. */
  function pattern(value, label) {
    requireValue(typeof value === 'string' && value.length > 0 && value.length <= 200, `${label} must be a pattern of 1 to 200 characters`);
    try { compilePattern(value); } catch (error) { requireValue(false, `${label} is not a supported pattern: ${error.message}`); }
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
    // Opaque data is not walked as matchers, but its depth is still bounded.
    if (kind === 'literal' || kind === 'oneOf') requireValue(depthOf(kind === 'literal' ? value.value : value.values) <= 32, `${label} ${kind} matcher data is nested too deeply`);
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
    // `$schema` is an editor hint only; it is accepted and ignored (readers before 1.0 reject it).
    keys(suite, ['$schema', 'version', 'name', 'description', 'policies', 'cases', 'tools'], 'suite');
    if (own(suite, '$schema')) requireValue(typeof suite.$schema === 'string', '$schema must be a string');
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

  // Shared with the runtime so validation and matching use one engine.
  validateSuite.compilePattern = compilePattern;
  return validateSuite;
}
