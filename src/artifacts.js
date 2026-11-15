/** Browser-neutral tools. This self-contained factory is embedded in saved HTML
 * too, so imports never need a network request or an executable module upload. */
export function createArtifactTools(mask, validateSuite) {
  const maxBytes = 1_000_000;
  const own = (value, key) => Object.hasOwn(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function caseButton(c, index, selected) {
    return `<button class="case-item" data-case="${index}" aria-pressed="${index === selected}"><div class="case-top"><span class="status-icon ${c.passed ? 'pass' : ''}">${c.passed ? '✓' : '×'}</span><span class="case-title">${escapeHtml(c.name)}</span></div><div class="case-meta">${c.events.length} CALL${c.events.length === 1 ? '' : 'S'} · ${c.passed ? 'PASSED' : escapeHtml(c.failures[0]?.code ?? 'FAILED')}</div></button>`;
  }
  function check(condition, message) { if (!condition) throw new Error(message); }
  function text(value, label, nonempty = false) { check(typeof value === 'string' && (!nonempty || value.length > 0), `${label} must be ${nonempty ? 'a nonempty string' : 'a string'}.`); }
  function count(value, label) { check(Number.isSafeInteger(value) && value >= 0, `${label} must be a nonnegative integer.`); }
  function duration(value, label) { check(Number.isFinite(value) && value >= 0, `${label} must be a nonnegative number.`); }

  function bounded(value) {
    const stack = [[value, 0]];
    let visited = 0;
    while (stack.length) {
      const [item, depth] = stack.pop();
      check(depth <= 64, 'JSON nesting exceeds the 64-level limit.');
      check(++visited <= 100000, 'JSON contains too many values.');
      if (typeof item === 'number') check(Number.isFinite(item), 'JSON numbers must be finite.');
      if (item && typeof item === 'object') {
        check(Array.isArray(item) || [Object.prototype, null].includes(Object.getPrototypeOf(item)), 'Only plain JSON data can be imported.');
        for (const child of Object.values(item)) stack.push([child, depth + 1]);
      } else check(item === null || ['string', 'number', 'boolean'].includes(typeof item), 'Only JSON values can be imported.');
    }
    return value;
  }

  function parse(source) {
    check(typeof source === 'string', 'Choose a JSON text file.');
    check(new TextEncoder().encode(source).byteLength <= maxBytes, 'File exceeds the 1 MB import limit.');
    try { return bounded(JSON.parse(source.replace(/^\uFEFF/, ''))); }
    catch (error) { throw new Error(`Cannot open JSON: ${error.message}`); }
  }

  function report(value) {
    bounded(value);
    check(object(value) && value.version === 1, 'Expected a PlumbCheck version 1 report.');
    text(value.name, 'Report name', true);
    check(['fixture-replay', 'agent-replay', 'mcp-replay'].includes(value.mode), 'Unsupported report mode.');
    if (own(value, 'scope')) check(value.scope === 'intercepted-tool-calls', 'Unsupported report scope.');
    if (own(value, 'description')) text(value.description, 'Report description');
    text(value.createdAt, 'Report timestamp', true); check(Number.isFinite(Date.parse(value.createdAt)), 'Invalid report timestamp.');
    duration(value.durationMs, 'Report duration');
    check(typeof value.passed === 'boolean', 'Report passed must be a boolean.');
    check(Array.isArray(value.cases) && value.cases.length > 0 && value.cases.length <= 1000, 'Report must have 1–1000 cases.');
    check(object(value.summary), 'Report summary is required.');
    if (own(value, 'execution')) {
      const e = value.execution;
      check(object(e) && e.runner === 'builtin-model' && value.mode === 'agent-replay', 'Unsupported execution metadata.');
      check(['openai', 'anthropic', 'google', 'ollama', 'lmstudio', 'compatible'].includes(e.provider), 'Unsupported model provider metadata.');
      text(e.model, 'Model ID', true); text(e.connectionName, 'Connection name', true);
      check(e.model.length <= 200 && e.connectionName.length <= 200, 'Model metadata exceeds its text limit.');
      count(e.contractRevision, 'Contract revision'); check(e.contractRevision > 0, 'Contract revision must be positive.');
      check(typeof e.contractHash === 'string' && /^[a-f0-9]{64}$/.test(e.contractHash), 'Invalid contract hash.');
      check(object(e.limits), 'Model execution limits are required.');
      for (const key of ['timeoutMs', 'maxSteps', 'maxOutputTokens', 'maxTotalOutputTokens']) { count(e.limits[key], `Execution ${key}`); check(e.limits[key] > 0, 'Execution limits must be positive.'); }
      if (own(e, 'usage')) {
        check(object(e.usage) && typeof e.usage.usageIncomplete === 'boolean', 'Invalid usage metadata.');
        for (const key of ['inputTokens', 'outputTokens', 'totalTokens', 'steps']) count(e.usage[key], `Usage ${key}`);
        check(e.usage.totalTokens === e.usage.inputTokens + e.usage.outputTokens, 'Usage total does not match its token counts.');
      }
    }
    const names = new Set();
    const cases = value.cases.map(c => {
      check(object(c), 'Each report case must be an object.');
      text(c.name, 'Case name', true); check(!names.has(c.name), 'Report case names must be unique.'); names.add(c.name);
      if (own(c, 'description')) text(c.description, 'Case description');
      check(typeof c.passed === 'boolean' && Array.isArray(c.events) && Array.isArray(c.failures), 'Each case needs passed, events, and failures.');
      c.events.forEach((event, index) => {
        check(object(event) && event.index === index, 'Event indexes must match their positions.');
        text(event.tool, 'Event tool', true); check(own(event, 'arguments'), 'Event arguments are required.');
        check(['replayed', 'blocked', 'failed'].includes(event.status), 'Unsupported event status.');
        duration(event.durationMs, 'Event duration');
        if (event.status !== 'replayed') { text(event.code, 'Event failure code', true); text(event.message, 'Event failure message'); }
      });
      c.failures.forEach(f => {
        check(object(f), 'Each failure must be an object.'); text(f.code, 'Failure code', true); text(f.message, 'Failure message');
        if (own(f, 'call')) {
          count(f.call, 'Failure call index');
          // Result assertions can target a call an agent/MCP client never made.
          check(f.call < c.events.length || (f.code === 'RESULT_MISMATCH' && f.actualMissing === true), 'Failure call index is out of range.');
        }
        if (own(f, 'actualMissing')) check(typeof f.actualMissing === 'boolean', 'actualMissing must be a boolean.');
      });
      check(c.passed === (c.failures.length === 0), 'Case passed disagrees with its failures.');
      for (const event of c.events.filter(e => e.status !== 'replayed')) check(c.failures.some(f => f.code === event.code && f.call === event.index), 'A failed event is missing its failure evidence.');
      return { ...c, description: c.description ?? '' };
    });
    const summary = {
      total: cases.length, passed: cases.filter(c => c.passed).length, failed: cases.filter(c => !c.passed).length,
      calls: cases.reduce((n, c) => n + c.events.length, 0), blocked: cases.flatMap(c => c.events).filter(e => e.status === 'blocked').length, liveToolCalls: 0,
    };
    for (const key of Object.keys(summary)) { count(value.summary[key], `Summary ${key}`); check(value.summary[key] === summary[key], `Report summary ${key} does not match the case evidence.`); }
    check(value.passed === (summary.failed === 0), 'Report passed disagrees with its cases.');
    return mask({ ...value, description: value.description ?? '', scope: 'intercepted-tool-calls', cases, summary });
  }

  function contract(value) {
    bounded(value);
    try { validateSuite(value); return { kind: 'contract', runner: 'planned', value }; }
    catch (planned) {
      try { validateSuite(value, { mode: 'agent' }); return { kind: 'contract', runner: 'agent', value }; }
      catch { throw planned; }
    }
  }

  function open(source) {
    const value = parse(source);
    return object(value) && (own(value, 'summary') || own(value, 'mode')) ? { kind: 'report', value: report(value) } : contract(value);
  }

  function exportContract(source) {
    const result = contract(parse(source));
    let json = JSON.stringify(result.value, null, 2) + '\n';
    if (new TextEncoder().encode(json).byteLength > maxBytes) json = JSON.stringify(result.value);
    return { ...result, json };
  }

  return { maxBytes, parse, report, contract, open, exportContract, escapeHtml, caseButton };
}
