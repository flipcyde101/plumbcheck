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
