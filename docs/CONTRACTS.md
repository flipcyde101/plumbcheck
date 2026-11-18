# Contract format, version 1

Contracts are JSON. Unknown structural keys fail validation before any calls execute. `description` is optional on suites and cases. Case names must be unique. A suite and every case must contain at least one call.

That call-list rule applies to default planned-call mode. With `--agent` or `runAgentSuite`, cases use `input` and omit `calls`: the supplied agent function chooses the actual calls. Agent cases may additionally assert `expect.output`; both modes may carry `expect.outputChecks`, which only agent and model runs evaluate. See [agent testing](AGENT_TESTING.md). A fixture or explicit assertion is required to avoid empty passing tests.

## Policies

`policies` is required; its optional `allow`, `deny`, and `requireApproval` fields are arrays of exact, case-sensitive tool names. No wildcards. Deny wins over allow. Tools absent from `allow` are blocked. Requiring approval does not implicitly allow a tool.

Case `context.approvedTools` is supplied by the trusted test author. It is a fixture for an app approval decision, not a production approval implementation.

## Calls and fixtures

`calls` contains `{ tool, arguments }`. `arguments` must be a JSON object. `fixtures` contains `{ tool, arguments, result }`, where result is a JSON value.

Each allowed call must match the **next** fixture's tool name and arguments. Object property order does not matter; array order, extra fields, missing fields, types, and values do, unless the fixture uses an explicit [argument matcher](#argument-matchers). Calls do not consume a fixture if policy or matching fails. Returned values and captured events are cloned to prevent accidental fixture mutation.

The suite runner evaluates every planned call to give a complete diagnostic report, even after failures. This is replay-only and does not imply a production agent continues after an error. An invalid/blocked call always fails the case. A `never` assertion checks attempted calls, even if a policy already blocked the tool.

Any otherwise passing case with unused fixtures fails. Each case gets a fresh fixture cursor. SDK users must call `verifyComplete()` themselves. Concurrent calls are matched in invocation order; intentionally nondeterministic parallel tool order is not supported.

## Assertions

`expect` is optional. Matching all calls to their allowed fixtures is itself a contract check. Available extra assertions:

| Field | Meaning |
| --- | --- |
| `callOrder` | Complete expected sequence of attempted tool names, including duplicates |
| `never` | Tool names that must not be attempted |
| `results` | Array of `{ call, path, equals }` assertions on the replayed tool responses |
| `output` | Exact expected final output (agent mode only) |
| `outputChecks` | Checks on the agent's final answer; see [final output checks](#final-output-checks) |

`call` is zero based. Paths use dots (`structuredContent.items.0.status`); an empty path selects the full response. Keys containing dots cannot be addressed individually in v1. Only own properties can satisfy a path; inherited properties cannot. `equals` compares JSON structure exactly, including false, zero, empty string, and null.

`results` read the replayed fixture, so in replay they confirm your fixture data, not a live integration.

This alpha intentionally avoids claiming full JSON Schema result validation. Equality checks support a narrow, inspectable contract. JSON Schema integration is a roadmap item.

## Tool declarations

The optional suite field `tools` gives each tool the description and input schema a real agent would see:

```json
"tools": {
  "orders.lookup": { "description": "Look up one order by ID.", "inputSchema": { "type": "object", "properties": { "orderId": { "type": "string" } }, "required": ["orderId"] } }
}
```

| Field | Meaning |
| --- | --- |
| `description` | Text of at most 2,000 characters shown to models and MCP clients |
| `inputSchema` | JSON Schema whose root has `"type": "object"`; at most 20 KB and 32 levels |

Agent, model and MCP runs offer every tool the contract names: fixture tools, every `policies` entry, `expect.never` and `tools`. Declaring a tool does not allow it; policies still decide. A declared schema replaces the shape inferred from fixtures. For tools the case replays, PlumbCheck validates the model's arguments against the schema, so a schema-breaking call fails the run as an invalid tool call (`AGENT_ERROR`). Tools without a fixture in the case (denied, approval-gated or `never` tools) are not schema-checked on purpose: any attempt must reach replay and be recorded as blocked. Without a declaration a tool gets a neutral description and an inferred shape that never contains literal fixture values.

## Argument matchers

Fixture `arguments` may replace a value with a `$plumb` matcher when an LLM legitimately varies it, such as an email subject or body:

| Matcher | Accepts |
| --- | --- |
| `{ "$plumb": "any" }` | Any value of any type; the key must still be present. Use `contains` or `matches` to require text |
| `{ "$plumb": "contains", "value": "shipped", "ignoreCase": true }` | Text containing `value` |
| `{ "$plumb": "matches", "pattern": "^ORD-\\d+$", "ignoreCase": false }` | Text matching a regular expression |
| `{ "$plumb": "oneOf", "values": ["A", "B"] }` | Exactly one of the listed JSON values |
| `{ "$plumb": "range", "min": 1, "max": 5 }` | A finite number within the bounds (either bound optional) |
| `{ "$plumb": "literal", "value": { "$plumb": "any" } }` | Exactly `value`, used to match data that itself contains a `$plumb` key |

`$plumb` is a reserved key in arguments: any object that has it is read as a matcher. To compare real data that contains a `$plumb` key, wrap it as `{ "$plumb": "literal", "value": ... }`; `createRecorder` snapshots do this automatically, so a recording can never turn into a wildcard. Matchers are allowed only below the root of fixture `arguments`. They are rejected in planned `calls` and are inert inside `result`. Values are never coerced: `contains` and `matches` need text, and `range` needs a number. The rest of the arguments still compare exactly, so a changed recipient still fails. Reports keep the fixture as written in `expectedArguments`; the field diff shows only values that really differ. Discovery schemas describe a matcher's type only, never its pattern or value.

Patterns are limited to 200 characters and run on PlumbCheck's own linear-time engine, never JavaScript's backtracking `RegExp`, so no pattern can hang a run. Supported syntax: literals and escapes (`\.`, `\n`, `\x41`, `\u0042`), `.`, character classes such as `[a-z]` and `[^@]`, `\d \w \s` and their negations, `\b \B`, the anchors `^` and `$`, groups `(...)` and `(?:...)`, `|`, and `* + ? {n} {n,} {n,m}` with counts up to 100. Backreferences, lookarounds, named groups and flags other than `ignoreCase` are rejected at validation. A pattern is never applied to text longer than 20,000 characters (that check fails instead). See [SECURITY.md](../SECURITY.md).

## Final output checks

`expect.outputChecks` checks the agent's or model's final answer. Each check has exactly one operator:

| Field | Meaning |
| --- | --- |
| `equals` | Deep JSON equality with the value at `path` |
| `contains` / `notContains` | Text containment. For a JSON answer, every text, number and boolean value inside it is searched; key names are not |
| `matches` | Pattern on text, using the linear-time pattern syntax above |
| `path` | Optional dotted path into a JSON answer; empty or absent selects the whole answer |
| `ignoreCase` | Optional case-insensitive comparison |

Example: `[{ "contains": "shipped", "ignoreCase": true }, { "notContains": "cancelled", "ignoreCase": true }]`. A missing answer or path fails every operator, including `notContains`. Model answers are JSON-parsed when possible and otherwise checked as text.

Output checks need a final answer, so only agent replay (`--agent`, `runAgentSuite`) and real model runs evaluate them. Planned-call checks and the MCP fixture server record them as `skippedOutputChecks` on the case and say so in the CLI, report and audit output. They never count as passed.

## Failure codes

| Code | Meaning |
| --- | --- |
| `DENIED_TOOL` | Explicitly forbidden |
| `UNLISTED_TOOL` | Not in the allowlist |
| `APPROVAL_REQUIRED` | Missing trusted approval fixture |
| `FIXTURE_MISSING` | No next fixture exists |
| `CALL_ORDER` | Next expected tool differs |
| `ARGUMENT_MISMATCH` | Arguments differ (exact, or a matcher is not satisfied) |
| `TOOL_ERROR` | Fixture response has `isError: true` |
| `UNUSED_FIXTURES` | An otherwise passing case skipped a recorded interaction |
| `EXPECTED_ORDER` | Attempt sequence differs from `expect.callOrder` |
| `FORBIDDEN_CALL` | Attempted a tool listed in `expect.never` |
| `RESULT_MISMATCH` | Result at the expected path differs or does not exist |
| `OUTPUT_MISMATCH` | The agent's output differs from `expect.output` |
| `OUTPUT_ASSERTION` | A final output check failed |
| `CHECKS_NOT_EVALUATED` | An MCP case only had final-answer checks, which MCP cannot evaluate |
| `AGENT_ERROR` | The agent or model run threw, or the model made an unknown or schema-invalid tool call |

SDK `ContractError` objects expose `code`. `runSuite()` returns a report with `passed`, `summary`, cases, events, and failures; invalid configuration throws instead. Output masking happens at delivery boundaries, so callers of the SDK must redact their own persisted output.
