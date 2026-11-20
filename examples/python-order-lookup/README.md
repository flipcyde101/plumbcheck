# Python order lookup

This example uses the Python adapter to run the same [read-only order lookup case](../customer-support/agent-contract.json) as the JavaScript support agent. The adapter starts a local fixture server. The example needs no model or API key.

Use Python 3.9+ and Node.js 22+. From the root of a PlumbCheck source checkout, run:

```sh
npm ci
python examples/python-order-lookup/agent.py
```

Use `python3` if that is the command for Python 3 on your system. The example exits with code 0 and prints `Order ORD-1042 is shipped.`

To see how a tool argument regression fails the contract, run:

```sh
python examples/python-order-lookup/agent.py --order-id ORD-9999
```

The fixture expects `ORD-1042`, so the changed argument produces a contract error and exit code 1. Replay checks tool calls and results. The status printed by the Python script comes from the fixture.
