import { object } from './validation.js';
import { copyJson } from './json-data.js';
import { createMatchers } from './matchers.js';

const matchers = createMatchers();

export class ContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
  }
}

/** Fixture transport only: this class has no network or live-client fallback. */
export class ReplaySession {
  constructor({ fixtures, policies, context = {} }) {
    this.fixtures = structuredClone(fixtures);
    this.policies = structuredClone(policies);
    this.context = structuredClone(context);
    this.cursor = 0;
    this.events = [];
  }

  async callTool(request) {
    const event = { index: this.events.length, tool: '(invalid)', arguments: {}, status: 'failed' };
    const start = performance.now();
    this.events.push(event);
    try {
      event.tool = typeof request?.name === 'string' ? request.name : '(invalid)';
      event.arguments = structuredClone(request?.arguments ?? {});
      if (!request || typeof request.name !== 'string' || !object(request.arguments ?? {})) {
        throw new ContractError('INVALID_CALL', 'Expected { name, arguments: object }.');
      }
      const name = request.name;
      if (this.policies.deny?.includes(name)) throw new ContractError('DENIED_TOOL', `Tool "${name}" is forbidden by the contract.`);
      if (!this.policies.allow?.includes(name)) throw new ContractError('UNLISTED_TOOL', `Tool "${name}" is not explicitly allowed.`);
      if (this.policies.requireApproval?.includes(name) && !this.context.approvedTools?.includes(name)) {
        throw new ContractError('APPROVAL_REQUIRED', `Tool "${name}" requires approval from the trusted test context.`);
      }
      const fixture = this.fixtures[this.cursor];
      if (!fixture) throw new ContractError('FIXTURE_MISSING', `No fixture remains for "${name}". No live call was made.`);
      if (fixture.tool !== name) throw new ContractError('CALL_ORDER', `Expected "${fixture.tool}" before "${name}".`);
      // Exact comparison, except where the fixture uses an explicit $plumb matcher.
      if (!matchers.matchValue(fixture.arguments, request.arguments ?? {})) {
        event.expectedArguments = structuredClone(fixture.arguments);
        event.diffExpected = matchers.diffExpected(fixture.arguments, request.arguments ?? {});
        throw new ContractError('ARGUMENT_MISMATCH', `Arguments for "${name}" differ from fixture ${this.cursor + 1}.`);
      }
      this.cursor++;
      event.result = structuredClone(fixture.result);
      if (fixture.result?.isError === true) throw new ContractError('TOOL_ERROR', `Fixture for "${name}" returned isError: true.`);
      event.status = 'replayed';
      return structuredClone(fixture.result);
    } catch (error) {
      event.code = error instanceof ContractError ? error.code : 'REPLAY_ERROR';
      event.message = error.message;
      event.status = ['DENIED_TOOL', 'UNLISTED_TOOL', 'APPROVAL_REQUIRED'].includes(event.code) ? 'blocked' : 'failed';
      throw error;
    } finally {
      event.durationMs = Math.round((performance.now() - start) * 100) / 100;
    }
  }

  verifyComplete() {
    if (this.cursor !== this.fixtures.length) throw new ContractError('UNUSED_FIXTURES', `${this.fixtures.length - this.cursor} fixture(s) were not consumed.`);
  }
}

/** Captures real calls made by a trusted host. Recording DOES execute that client. */
export function createRecorder(client) {
  if (typeof client?.callTool !== 'function') throw new TypeError('A client with callTool(request) is required.');
  const fixtures = [];
  const operations = new WeakMap();
  return {
    fixtures,
    callTool(request) {
      let entry;
      try { entry = { tool: request.name, arguments: structuredClone(request.arguments ?? {}) }; }
      catch (error) {
        const rejected = Promise.reject(error);
        rejected.catch(() => {});
        return rejected;
      }
      // Insert in invocation order, even when responses complete out of order.
      fixtures.push(entry);
      const operation = (async () => {
        try {
          const result = await client.callTool(request);
          entry.result = structuredClone(result);
          return result;
        } catch (error) {
          let message = 'Tool call failed with an unreadable error.';
          try { const candidate = error?.message; message = typeof candidate === 'string' ? candidate : String(error); } catch { /* Keep a valid text response even for unusual thrown values. */ }
          entry.result = { isError: true, content: [{ type: 'text', text: message }] };
          throw error;
        }
      })();
      operations.set(entry, operation);
      operation.catch(() => {});
      return operation;
    },
    async snapshot() {
      const selected = fixtures.slice();
      await Promise.allSettled(selected.map(entry => operations.get(entry)));
      if (selected.some(entry => !Object.hasOwn(entry, 'result'))) throw new ContractError('RECORDING_INCOMPLETE', 'A recording entry has no completed response.');
      let copied;
      try { copied = copyJson(selected); }
      catch { throw new ContractError('RECORDING_NOT_JSON', 'Recording contains values that cannot be saved as JSON. Use JSON tool arguments and results.'); }
      // Recorded arguments are data. Wrap any object that happens to carry `$plumb`
      // so replaying the recording can never turn it into a wildcard matcher.
      const escape = value => {
        if (Array.isArray(value)) return value.map(escape);
        if (value === null || typeof value !== 'object') return value;
        if (Object.hasOwn(value, '$plumb')) return { $plumb: 'literal', value };
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escape(item)]));
      };
      // The root stays an object (matchers are never allowed at the root; validation rejects one).
      return copied.map(entry => ({ ...entry, arguments: Object.fromEntries(Object.entries(entry.arguments ?? {}).map(([key, item]) => [key, escape(item)])) }));
    },
  };
}
