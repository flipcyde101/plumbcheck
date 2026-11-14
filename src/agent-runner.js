import { ReplaySession, ContractError } from './replay.js';
import { copyJson } from './json-data.js';
import { validateSuite } from './validation.js';
import { evaluateSession, createReport } from './evaluate.js';

/** Only the explicitly supplied trusted agent function executes. No live client
 * is attached to its replay facade. The agent's own I/O is NOT sandboxed. */
export async function runAgentSuite(input, agent) {
  const suite = validateSuite(input, { mode: 'agent' });
  if (typeof agent !== 'function') throw new TypeError('The agent must be a function: async (client, { input, name }) => output.');
  const start = performance.now();
  const cases = [];
  for (const c of suite.cases) {
    const session = new ReplaySession({ fixtures: c.fixtures, policies: suite.policies, context: c.context });
    const pending = [];
    const toolErrors = new Set();
    let active = true;
    const client = Object.freeze({
      callTool(request) {
        if (!active) {
          const rejected = Promise.reject(new ContractError('SESSION_CLOSED', 'Agent case already returned; background calls are unsupported.'));
          rejected.catch(() => {});
          return rejected;
        }
        const promise = session.callTool(request);
        pending.push(promise);
        // Track failures even if the agent swallows errors or forgets to await.
        // Attaching a handler also prevents an unhandled rejection in the host.
        promise.catch(error => { toolErrors.add(error); });
        return promise;
      },
    });
    let output;
    let agentError;
    let agentFailed = false;
    try {
      const value = await agent(client, { input: structuredClone(c.input), name: c.name });
      if (value !== undefined) output = copyJson(value);
    } catch (error) { agentFailed = true; agentError = error; }
    active = false;
    await Promise.allSettled(pending);
    const failures = evaluateSession(session, c.expect, { agent: true, output });
    if (agentFailed && !toolErrors.has(agentError)) {
      failures.push({ code: 'AGENT_ERROR', message: agentError?.message ?? String(agentError) });
    }
    cases.push({ name: c.name, description: c.description ?? '', passed: failures.length === 0, events: session.events, failures,
      ...(output === undefined ? {} : { output }) });
  }
  return createReport(suite, cases, start, 'agent-replay');
}
