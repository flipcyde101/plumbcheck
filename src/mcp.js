import { createInterface } from 'node:readline';
import { ReplaySession } from './replay.js';
import { validateSuite } from './validation.js';
import { redact } from './redact.js';

/** Minimal fixture-only MCP stdio adapter, pinned to the 2025-11-25 protocol. */
export function serveMcp(suite, caseName, { input = process.stdin, output = process.stdout, audit = process.stderr } = {}) {
  validateSuite(suite);
  const scenario = suite.cases.find(c => c.name === caseName);
  if (!scenario) throw new Error(`Unknown case "${caseName}".`);
  const session = new ReplaySession({ fixtures: scenario.fixtures, policies: suite.policies, context: scenario.context });
  let initialized = false;
  const definitions = [...new Set(scenario.fixtures.map(f => f.tool))].map(name => ({
    name, description: 'PlumbCheck fixture-only tool. No live service is connected.',
    inputSchema: { type: 'object' },
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
      initialized = true;
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'plumcheck-fixture-server', version: '0.1.0-alpha.1' }, instructions: 'Fixture-only replay. Approval context is a test fixture, not human authentication.' } });
    }
    if (message.method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (!initialized) return error(id, -32000, 'Initialize before calling tools.');
    if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: definitions } });
    if (message.method !== 'tools/call') return error(id, -32601, 'Method not supported by this fixture server.');
    try {
      const result = await session.callTool(message.params);
      audit.write(JSON.stringify(redact(session.events.at(-1))) + '\n');
      return send({ jsonrpc: '2.0', id, result });
    } catch (failure) {
      audit.write(JSON.stringify(redact(session.events.at(-1))) + '\n');
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: `${failure.code ?? 'REPLAY_ERROR'}: ${failure.message}` }] } });
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
      try { session.verifyComplete(); resolve({ complete: true, session }); }
      catch (failure) { audit.write(`${failure.code}: ${failure.message}\n`); resolve({ complete: false, session }); }
    });
  }));
}
