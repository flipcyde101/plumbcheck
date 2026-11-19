# Connect your agent

PlumbCheck never calls your real tools. It stands in for the tool layer: your agent sends its tool calls to PlumbCheck, PlumbCheck answers with recorded fixture responses, and every attempted call is checked against the contract. What you connect depends on how your agent reaches its tools.

| Your agent is… | Connect it with | Where it can run |
| --- | --- | --- |
| A JavaScript/TypeScript function (your own loop, Vercel AI SDK, OpenAI or Anthropic SDK tool loops) | `plumbcheck run contract.json --agent my-agent.js`, or `runAgentSuite` in your test runner | Your PC or CI. The code runs locally; the LLM it calls can be local or a cloud API |
| Anything that speaks MCP over stdio (Claude Desktop, Claude Code, Cursor, LangChain/LangGraph or the OpenAI Agents SDK with an MCP adapter) | Replace your real MCP server with `plumbcheck-mcp contract.json "<case>"` | The MCP client must run on the same machine (stdio) |
| A Python agent | `adapters/python/plumbcheck.py` `ReplayClient` / `AsyncReplayClient` | Local or CI with Python 3.9+ and Node.js 22+ |
| Only a model and instructions (prompt testing) | Workspace or Android: connect a model, write the task, run the real model test | Ollama or LM Studio on this PC; OpenAI, Anthropic, Google or an OpenAI-compatible HTTPS endpoint with your key; Android via Ollama |

## 1. JavaScript or TypeScript agent

Export one function. Route every tool call through the `client` PlumbCheck passes in; in production, pass your real MCP client or tool executor with the same `callTool` shape.

```js
// my-agent.js
import { generateText, tool, jsonSchema, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';

export default async function agent(client, { input }) {
  const call = name => async args => client.callTool({ name, arguments: args });
  const { text } = await generateText({
    model: openai('gpt-5-mini'),
    prompt: `Help with order ${input.orderId}.`,
    tools: {
      orders_lookup: tool({ description: 'Look up one order.', inputSchema: jsonSchema({ type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] }), execute: call('orders.lookup') }),
      email_send: tool({ description: 'Email a customer.', inputSchema: jsonSchema({ type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] }), execute: call('email.send') }),
    },
    stopWhen: stepCountIs(5),
  });
  return text; // checked by expect.output / expect.outputChecks
}
```

```sh
plumbcheck run my-contract.json --agent my-agent.js --out reports/agent
```

The module is trusted local code and is not sandboxed: its own network, file or subprocess access is outside replay. A cloud model call made by your agent is real and billed to you. See [agent testing](AGENT_TESTING.md).

## 2. MCP client

Point the client at the fixture server instead of your real server. Example Claude Desktop entry (absolute paths):

```json
{
  "mcpServers": {
    "orders": {
      "command": "node",
      "args": ["C:/path/plumbcheck/bin/plumbcheck-mcp.js", "C:/path/my-contract.json", "Must not delete orders", "--out", "C:/path/reports/mcp"]
    }
  }
}
```

The client discovers every tool the contract names (with declared `tools` descriptions), including denied and approval-gated ones, so a real attempt is observed. The session is single use; the report is written when the client closes the connection. MCP does not carry the agent's final answer, so `expect.output` and `outputChecks` are reported as skipped there. See [MCP](MCP.md).

## 3. Python agent

```python
from plumbcheck import ReplayClient

with ReplayClient("my-contract.json", "Read-only order lookup", out="reports/python") as client:
    result = my_agent(tool_executor=client.call_tool)   # route your framework's tool calls here

assert client.report["passed"]
```

LangGraph, CrewAI or other framework tools must call `client.call_tool(name, arguments)` inside their tool functions. See [the Python adapter](../adapters/python/README.md) and the [runnable order lookup example](../examples/python-order-lookup/README.md).

## 4. Model and instructions only

In the Windows Workspace choose **Find Ollama on this PC** (or add a provider connection), build or open a test, and run **Real model test**. PlumbCheck runs its own small tool-calling agent around that model with your instructions and the contract's tools. This tests the model plus prompt, not your production agent's code. Cloud runs need your API key and are billed by the provider.

To check many scenarios at once from a terminal, use the [live probe](LIVE_MODEL_VERIFICATION.md#live-probe-suite).

## Not supported today

- **Agents hosted by someone else** (n8n, Zapier, Make, the hosted OpenAI Assistants API, custom GPTs, Bedrock or Vertex agents): their tools run on another server, so PlumbCheck cannot intercept the calls. This would need an HTTP tool endpoint that those services can be pointed at.
- **Remote MCP clients** such as ChatGPT web or a cloud-hosted agent: the fixture server speaks stdio only, not HTTP/SSE.
- **Calls that bypass the client**: anything your agent does through another SDK, HTTP request or database driver is not seen.
