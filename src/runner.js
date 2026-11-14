import { ReplaySession } from './replay.js';
import { validateSuite } from './validation.js';
import { evaluateSession, createReport } from './evaluate.js';

export async function runSuite(input) {
  const suite = validateSuite(input);
  const start = performance.now();
  const cases = [];
  for (const c of suite.cases) {
    const session = new ReplaySession({ fixtures: c.fixtures, policies: suite.policies, context: c.context });
    for (const call of c.calls) {
      try { await session.callTool({ name: call.tool, arguments: call.arguments }); }
      catch { /* Shared evaluation reads the host-owned event evidence. */ }
    }
    const failures = evaluateSession(session, c.expect);
    cases.push({ name: c.name, description: c.description ?? '', passed: failures.length === 0, events: session.events, failures });
  }
  return createReport(suite, cases, start);
}
