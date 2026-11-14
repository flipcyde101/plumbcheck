import { own, same, readPath } from './validation.js';

// Keep original sensitive keys around assertion values so delivery redaction can
// still mask a failure at a path such as structuredContent.access_token.
function atPath(value, path) {
  return path === '' ? value : path.split('.').reverse().reduce((child, key) => Object.fromEntries([[key, child]]), value);
}

/** Common assertions for planned calls and actual agent code. */
export function evaluateSession(session, expect = {}, { agent = false, output } = {}) {
  const failures = session.events.filter(e => e.status !== 'replayed').map(e => ({ code: e.code, message: e.message, call: e.index }));
  if (expect.callOrder && !same(expect.callOrder, session.events.map(e => e.tool))) {
    failures.push({ code: 'EXPECTED_ORDER', message: `Expected attempted tool order: ${expect.callOrder.join(' → ')}.`, expected: expect.callOrder, actual: session.events.map(e => e.tool) });
  }
  for (const tool of expect.never ?? []) {
    if (session.events.some(e => e.tool === tool)) failures.push({ code: 'FORBIDDEN_CALL', message: `Forbidden tool "${tool}" was attempted.` });
  }
  for (const a of expect.results ?? []) {
    const result = readPath(session.events[a.call]?.result, a.path);
    if (!result.found || !same(result.value, a.equals)) {
      failures.push({ code: 'RESULT_MISMATCH', message: `Call ${a.call + 1} result at "${a.path || '(root)'}" did not match.`, call: a.call,
        expected: atPath(a.equals, a.path), ...(result.found ? { actual: atPath(result.value, a.path) } : { actualMissing: true }) });
    }
  }
  if (agent && own(expect, 'output') && !same(output, expect.output)) {
    failures.push({ code: 'OUTPUT_MISMATCH', message: 'The agent returned a different output than the contract expected.', expected: expect.output,
      ...(output === undefined ? { actualMissing: true } : { actual: output }) });
  }
  if (!failures.length) {
    try { session.verifyComplete(); } catch (error) { failures.push({ code: error.code, message: error.message }); }
  }
  return failures;
}

export function createReport(suite, cases, start, mode = 'fixture-replay') {
  return {
    version: 1, name: suite.name, description: suite.description ?? '', mode,
    scope: 'intercepted-tool-calls',
    createdAt: new Date().toISOString(), durationMs: Math.round((performance.now() - start) * 100) / 100,
    passed: cases.every(c => c.passed),
    summary: { total: cases.length, passed: cases.filter(c => c.passed).length, failed: cases.filter(c => !c.passed).length,
      calls: cases.reduce((n, c) => n + c.events.length, 0), blocked: cases.flatMap(c => c.events).filter(e => e.status === 'blocked').length, liveToolCalls: 0 },
    cases,
  };
}
