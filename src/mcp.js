import { createInterface } from 'node:readline';
import { ReplaySession } from './replay.js';
import { validateSuite, object } from './validation.js';
import { redact } from './redact.js';
import { evaluateSession, createReport } from './evaluate.js';
import { mcpResult } from './mcp-schema.js';
import { toolSurface } from './tool-surface.js';

/** Minimal fixture-only MCP stdio adapter, pinned to the 2025-11-25 protocol. */
export function serveMcp(suite, caseName, { input = process.stdin, output = process.stdout, audit = process.stderr } = {}) {
  validateSuite(suite);
  const scenario = suite.cases.find(c => c.name === caseName);
  if (!scenario) throw new Error(`Unknown case "${caseName}".`);
  const session = new ReplaySession({ fixtures: scenario.fixtures, policies: suite.policies, context: scenario.context });
  const start = performance.now();
  let initialized = false;
  // List every contract-named tool (denied, approval-gated and `never` tools too):
  // an agent cannot attempt a tool it never discovers, which made those checks vacuous.
  const definitions = toolSurface(suite, scenario).map(({ name, inputSchema }) => ({
    name, description: 'PlumbCheck fixture-only tool. No live service is connected.', inputSchema,
  }));
  const send = (message) => output.write(JSON.stringify(message) + '\n');
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  async function handle(line) {
    let message;
    try { message = JSON.parse(line); } catch { return error(null, -32700, 'Parse error'); }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (Object.hasOwn(message, 'id') && typeof message.id !== 'string' && typeof message.id !== 'number')) {
      return error(null, -32600, 'Invalid request');
    }
    if (!Object.hasOwn(message, 'id')) return; // Notifications never produce responses.
    const id = message.id;
    if (message.method === 'initialize') {
      const params = message.params;
      if (!object(params) || typeof params.protocolVersion !== 'string' || !object(params.capabilities) || !object(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') {
        return error(id, -32602, 'initialize requires protocolVersion, capabilities, and clientInfo with name/version.');
      }
      if (initialized) return error(id, -32600, 'This fixture session has already been initialized.');
      initialized = true;
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'plumbcheck-fixture-server', version: '0.1.0-alpha.1' }, instructions: 'Fixture-only replay. Approval context is a test fixture, not human authentication.' } });
    }
    if (message.method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (!initialized) return error(id, -32000, 'Initialize before calling tools.');
    if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: definitions } });
    if (message.method !== 'tools/call') return error(id, -32601, 'Method not supported by this fixture server.');
    try {
      const result = await session.callTool(message.params);
      audit.write(JSON.stringify(redact(session.events.at(-1))) + '\n');
      return send({ jsonrpc: '2.0', id, result: mcpResult(result) });
    } catch (failure) {
      const event = session.events.at(-1);
      audit.write(JSON.stringify(redact(event)) + '\n');
      const result = failure.code === 'TOOL_ERROR' ? { ...mcpResult(event.result), isError: true } : { isError: true, content: [{ type: 'text', text: `${failure.code ?? 'REPLAY_ERROR'}: ${failure.message}` }] };
      return send({ jsonrpc: '2.0', id, result });
    }
  }
  // Keep input ordering even if the client pipelines multiple requests.
  let pending = Promise.resolve();
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', line => {
    pending = pending.then(() => handle(line)).catch(failure => { audit.write(`PlumbCheck: ${failure.message}\n`); });
  });
  return new Promise(resolve => lines.on('close', () => {
    pending.then(() => {
      const failures = evaluateSession(session, scenario.expect);
      for (const failure of failures) audit.write(`${failure.code}: ${failure.message}\n`);
      const report = createReport(suite, [{ name: scenario.name, description: scenario.description ?? '', passed: failures.length === 0, events: session.events, failures }], start, 'mcp-replay');
      resolve({ complete: session.cursor === session.fixtures.length, session, report });
    });
  }));
}
