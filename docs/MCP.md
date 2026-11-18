# MCP fixture server

Use the fixture server when an existing MCP client or agent should choose the tool calls. PlumbCheck replies from fixtures and evaluates the calls actually observed during that connection.

## Configure a client

This is a generic stdio configuration; adapt the surrounding config key to your client and use absolute paths. No API keys are needed for the synthetic example.

```json
{
  "mcpServers": {
    "plumbcheck": {
      "command": "node",
      "args": [
        "/absolute/path/plumbcheck/bin/plumbcheck-mcp.js",
        "/absolute/path/plumbcheck/examples/customer-support/safe.json",
        "Approved customer update",
        "--out",
        "/absolute/path/plumbcheck/reports/mcp"
      ]
    }
  }
}
```

On Windows, JSON paths can use forward slashes (`C:/Projects/plumbcheck/...`) or escaped backslashes. The command may also be an absolute path to Node.js. The server does not launch a live backend.

## Discovery and replay

The server advertises the tools represented in the selected case's fixtures. Input schemas describe fixture-derived argument shapes: names, types, required properties, nested objects, and arrays. Alternative shapes are represented with `anyOf`. **Literal argument values are not included in discovery schemas**, since those could contain secrets or private customer data. These schemas describe the fixtures, not the original live tool's authoritative schema.

Replay still matches argument values in order, exactly unless the fixture uses an explicit `$plumb` matcher. Discovery lists every tool the contract names, including denied and approval-gated tools and declared `tools` with their descriptions, so a real attempt is observed and blocked. Agent-mode contracts (cases with `input` and no `calls`) can be served too. MCP does not carry the final answer, so `expect.output` and `expect.outputChecks` are reported as `OUTPUT_CHECKS_SKIPPED` in the audit stream and `skippedOutputChecks` in the report, never as passed. Discovering a tool does not bypass its policy. Calls to denied/unlisted tools, missing approval, mismatched arguments, and exhausted fixtures return an MCP error result and fail the test. Restart the process for a fresh fixture cursor.

Fixtures can contain ordinary JSON responses or MCP-shaped responses. Ordinary objects become text plus `structuredContent`; primitives and arrays become text. An object with a `content` array is treated as an already enveloped MCP response and is preserved. This also permits intentionally malformed response fixtures for testing client validation; the server does not claim to validate every possible MCP content type. A recorded `isError: true` response reaches the client with its original error content and fails the CI contract by default. Result assertions target the raw fixture response before wire-envelope conversion: for a plain `{ "status": "ready" }` fixture, assert the path `status`.

Fixture data is returned to the connected client as authored. Masking applies to delivered test reports and audit records, not to tool responses that the agent must consume to reproduce behavior. Review fixture contents before connecting a client that might forward them to an external model.

## Close the client to finish the test

Clean stdio shutdown means closing the server's stdin and allowing the process to exit. On EOF, PlumbCheck checks:

- Every attempted call against policies and fixtures.
- `expect.callOrder`, `expect.never`, and result-path equality.
- Unused fixtures in an otherwise passing execution.

`--out` writes `report.json`, `report.html`, and `junit.xml` from these observed calls. Logs and the output location go to **stderr**; stdout remains JSON-RPC only. Exit code **0** means the case passed, **1** means a failed contract, and **2** means invalid setup or a report-writing error.

Reports are finalized at clean EOF, not while the client is still connected. A forcibly killed process may not write complete evidence. Use a fresh output directory in CI and do not treat an old report as the result of a new run. Some clients ignore a server's exit code; their harness should also inspect the generated `report.passed` field.

The selected contract's `calls` list is not executed by the server. It belongs to planned-call mode. The MCP client supplies the actual calls, which are evaluated against the same fixtures and `expect` assertions at shutdown. For an in-process JavaScript agent, use [agent-code mode](AGENT_TESTING.md).

## Supported protocol boundary

The minimal adapter negotiates **MCP 2025-11-25** and implements `initialize`, `ping`, `tools/list`, and `tools/call`. Initialization requires the protocol version, capabilities, and client information. Reinitializing the same process is rejected; it cannot reset the fixture cursor.

HTTP transport, tasks, resources, prompts, sampling, elicitation, subscriptions, and the newer 2026 stateless protocol are outside this implementation. SDK compatibility tests are evidence for the tested client version and methods; they are not a certification for every MCP implementation.

Primary references: [2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), and the [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).

## Reproduce the official-client checks

The compatibility package is separate so the core CLI and demo keep zero runtime dependencies and can run without an installation step.

```sh
npm ci --prefix compat/mcp-sdk --ignore-scripts
npm run test:mcp
```

The lockfile pins the SDK and its transitive dependencies. The suite launches the real CLI as a child process through the official `Client` and `StdioClientTransport`, then checks discovery, actual tool calls, approval blocking, argument mismatches, generic-response envelopes, shutdown, and generated CI reports. It runs in the Windows/Linux Node 22/24 CI matrix alongside the dependency-free core suite.
