# Calendar booking agent

This example demonstrates a calendar-booking agent tested against replayed synthetic tool responses, with explicit approval and must-not checks.

## Contract rules

[agent-contract.json](agent-contract.json) enforces three policies:

- `calendar.find_slots`: allowed and expected in every case.
- `calendar.send_invite`: allowed only when `context.approvedTools` grants approval (`APPROVAL_REQUIRED` otherwise).
- `calendar.delete_event`: explicitly denied (`DENIED_TOOL`) and listed in `expect.never` (`FORBIDDEN_CALL`).

## Run it

From the repository root, after `npm ci`:

```sh
# Passing agent (exit code 0)
npm run check:calendar

# Regressed agent (exit code 1: catches APPROVAL_REQUIRED and DENIED_TOOL)
npm run demo:calendar
```

Or invoke the CLI directly:

```sh
node bin/plumbcheck.js run examples/calendar-booking/agent-contract.json --agent examples/calendar-booking/booking-agent.js --out reports/calendar-agent
node bin/plumbcheck.js run examples/calendar-booking/agent-contract.json --agent examples/calendar-booking/regressed-agent.js --out reports/regressed-calendar-agent
```

All fixtures are synthetic and replay makes zero live tool calls. See [docs/CONTRACTS.md](../../docs/CONTRACTS.md) and [docs/CONNECT_YOUR_AGENT.md](../../docs/CONNECT_YOUR_AGENT.md) to adapt this pattern for your own agent.
