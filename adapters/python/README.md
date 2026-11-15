# Python agents

This standard-library adapter connects a trusted Python agent to PlumbCheck's fixture MCP server. It needs Python 3.9+ and the source checkout with Node.js 22+, or explicit paths to the Windows app's bundled console runtime/server.

```python
from plumbcheck import ReplayClient

with ReplayClient("contract.json", "Read-only order lookup", out="reports/python") as client:
    order = client.call_tool("orders.lookup", {"orderId": "ORD-1042"})
    # Your real agent decides what to call next using these fixture responses.

assert client.report["passed"]
```

Put this directory on `PYTHONPATH`, or import it from your test project. No pip package has been published. `node=` and `server=` arguments select installed/bundled absolute paths; `PLUMBCHECK_NODE` is another runtime override. Contracts, results, and stdout use JSON. `ContractFailed` is raised on tool failures or a failed contract at clean close, including when an agent swallowed an earlier tool error. Reports remain available in `client.report`; an explicit `out` keeps HTML/JSON/JUnit files.

For asynchronous agents, use `async with AsyncReplayClient(...) as client` and `await client.call_tool(...)`. The client serializes transport requests. Framework-specific tool objects still need to route through this method; this does not automatically import an arbitrary LangGraph/CrewAI project.

Only calls routed through the adapter are checked. Python imports, network access, subprocesses, filesystem operations, and other clients are outside replay and are not isolated. The current Python path checks tool-call evidence through the fixture MCP server; it does not assert the Python function's final return value.
