import { fixtureInputSchema } from './mcp-schema.js';

/**
 * Every tool a scenario can be tempted to use: the fixtures it replays plus every
 * tool the contract names in a policy or a `never` assertion.
 *
 * Exposing only fixture tools made deny, approval and `never` checks vacuous for a
 * real agent: a model cannot attempt a tool it was never offered, so a forbidden
 * delete or an unapproved send could not be observed. Calls to exposed tools without
 * a fixture still go through ReplaySession, which blocks or fails them. No live tool
 * is ever attached.
 */
export function toolSurface(suite, scenario) {
  const names = new Set(scenario.fixtures.map(f => f.tool));
  for (const key of ['allow', 'requireApproval', 'deny']) for (const name of suite.policies?.[key] ?? []) names.add(name);
  for (const name of scenario.expect?.never ?? []) names.add(name);
  return [...names].map(name => {
    // Prefer this scenario's fixtures, then any other scenario's, for the argument shape.
    const own = scenario.fixtures.filter(f => f.tool === name);
    const shared = own.length ? own : suite.cases.flatMap(c => c.fixtures ?? []).filter(f => f.tool === name);
    return { name, replayed: own.length > 0, inputSchema: shared.length ? fixtureInputSchema(shared) : { type: 'object' } };
  });
}

/** Provider-safe function names (OpenAI/Anthropic/Gemini/Ollama: [A-Za-z0-9_-], <= 64). */
export function providerToolNames(names) {
  const used = new Set();
  return names.map(name => {
    const base = (name.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z_]/, '_$&') || 'tool').slice(0, 60);
    let candidate = base, suffix = 2;
    while (used.has(candidate)) candidate = `${base.slice(0, 56)}_${suffix++}`;
    used.add(candidate);
    return candidate;
  });
}
