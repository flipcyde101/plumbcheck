# Test actual agent code

PlumbCheck has two ways to exercise a contract:

- **Planned-call mode:** JSON declares the calls to check. Useful for reviewing a captured or synthetic execution. No user JavaScript is imported.
- **Agent-code mode:** PlumbCheck calls your actual exported function with a fixture-only client. Your function chooses its tool calls from the input and returned responses. Tool policies, exact arguments, call order, results, fixture completeness, and final output are checked.

## Try a real regression

From the repository root:

```sh
# Correct implementation: passes
node bin/plumcheck.js run examples/customer-support/agent-contract.json --agent examples/customer-support/support-agent.js --out reports/agent

# Buggy implementation: fails, even though the agent catches the mismatch
node bin/plumcheck.js run examples/customer-support/agent-contract.json --agent examples/customer-support/regressed-agent.js --out reports/regressed-agent
```

Both implementations read the order response. The correct one sends the update to the returned customer address. The regressed one chooses an outsider address and catches the resulting tool error. Its test still fails because the runner owns the call evidence independently of the function's error handling.

The contract deliberately omits `calls`: in agent mode, the code supplies the calls. Combining a planned `calls` list with agent mode is rejected to avoid implying that the list was executed or used as input.

## The agent interface

```js
export default async function myAgent(client, { input, name }) {
  const response = await client.callTool({
    name: 'orders.lookup',
    arguments: { orderId: input.orderId }
  });
  return { status: response.structuredContent.status };
}
```

The CLI imports the module's **default export** from a local path relative to your working directory. Module imports execute JavaScript, including top-level code. Use only modules you trust. No module is loaded by the JSON-only workbench's execution endpoint.

The client is a frozen facade exposing only `callTool`. Fixtures, policies, approval context, and captured events stay in the host. Each case receives a cloned `input`, its case `name`, and a new fixture cursor. Calls are matched in invocation order. The function should await all its work before returning; background calls scheduled after it returns are outside the supported lifecycle.

Returning a JSON value records `case.output`. Add `expect.output` to assert equality. `null`, `false`, `0`, and an empty string are all valid expected values. Returning `undefined` is permitted if you do not assert an output. Non-JSON return values fail the case.

```json
{
  "version": 1,
  "name": "My actual agent",
  "policies": { "allow": ["orders.lookup"] },
  "cases": [{
    "name": "Read shipping status",
    "input": { "orderId": "ORD-1042" },
    "fixtures": [{
      "tool": "orders.lookup",
      "arguments": { "orderId": "ORD-1042" },
      "result": { "structuredContent": { "status": "shipped" } }
    }],
    "expect": {
      "callOrder": ["orders.lookup"],
      "output": { "status": "shipped" }
    }
  }]
}
```

An agent case must contain a fixture or an explicit output/call-order/forbidden-tool assertion. An empty case is rejected rather than reporting a meaningless pass. `callOrder: []` can explicitly assert that an agent makes no tool calls.

## Use from your own test runner

```js
import assert from 'node:assert/strict';
import { runAgentSuite } from './src/index.js';
import myAgent from './my-agent.js';

const report = await runAgentSuite(contract, myAgent);
assert.equal(report.passed, true, JSON.stringify(report.cases));
```

Use the same reporter helpers as planned-call mode. `runAgentSuite` validates the entire contract before invoking your callback. It returns a failed report for agent exceptions and tool/assertion failures. Invalid configuration throws. The CLI retains exit codes 0 for pass, 1 for failed checks, and 2 for invalid setup.

## Limits

The zero-live-call count describes calls mediated by PlumbCheck's replay client. An imported agent may independently use the network, filesystem, subprocesses, LLM APIs, or another client. PlumbCheck does not inspect or block those operations. This version has no execution timeout or process isolation; use your test runner's process timeout and a separate sandbox for untrusted code.

Agents must return once their work is complete. Delayed/background tasks are unsupported. Module-global state is shared between cases because the module is imported once; reset it in the agent if your production integration requires independent runs.

Final outputs and assertion evidence may contain PII or free-text secrets. Delivery masking still covers common credential keys only. Review your fixtures and reports before sharing them.
