# Contract format, version 1

Contracts are JSON. Unknown structural keys fail validation before any calls execute. `description` is optional on suites and cases. Case names must be unique. A suite and every case must contain at least one call.

That call-list rule applies to default planned-call mode. With `--agent` or `runAgentSuite`, cases use `input` and omit `calls`: the supplied agent function chooses the actual calls. Agent cases may additionally assert `expect.output`. See [agent testing](AGENT_TESTING.md). A fixture or explicit assertion is required to avoid empty passing tests.

## Policies

`policies` is required; its optional `allow`, `deny`, and `requireApproval` fields are arrays of exact, case-sensitive tool names. No wildcards. Deny wins over allow. Tools absent from `allow` are blocked. Requiring approval does not implicitly allow a tool.

Case `context.approvedTools` is supplied by the trusted test author. It is a fixture for an app approval decision, not a production approval implementation.

## Calls and fixtures

`calls` contains `{ tool, arguments }`. `arguments` must be a JSON object. `fixtures` contains `{ tool, arguments, result }`, where result is a JSON value.

Each allowed call must match the **next** fixture's tool name and arguments. Object property order does not matter; array order, extra fields, missing fields, types, and values do. Calls do not consume a fixture if policy or matching fails. Returned values and captured events are cloned to prevent accidental fixture mutation.

The suite runner evaluates every planned call to give a complete diagnostic report, even after failures. This is replay-only and does not imply a production agent continues after an error. An invalid/blocked call always fails the case. A `never` assertion checks attempted calls, even if a policy already blocked the tool.

Any otherwise passing case with unused fixtures fails. Each case gets a fresh fixture cursor. SDK users must call `verifyComplete()` themselves. Concurrent calls are matched in invocation order; intentionally nondeterministic parallel tool order is not supported.

## Assertions

`expect` is optional. Matching all calls to their allowed fixtures is itself a contract check. Available extra assertions:

| Field | Meaning |
| --- | --- |
| `callOrder` | Complete expected sequence of attempted tool names, including duplicates |
| `never` | Tool names that must not be attempted |
| `results` | Array of `{ call, path, equals }` output assertions |

`call` is zero based. Paths use dots (`structuredContent.items.0.status`); an empty path selects the full response. Keys containing dots cannot be addressed individually in v1. Only own properties can satisfy a path; inherited properties cannot. `equals` compares JSON structure exactly, including false, zero, empty string, and null.

This alpha intentionally avoids claiming full JSON Schema result validation. Equality checks support a narrow, inspectable contract. JSON Schema integration is a roadmap item.

## Failure codes

| Code | Meaning |
| --- | --- |
| `DENIED_TOOL` | Explicitly forbidden |
| `UNLISTED_TOOL` | Not in the allowlist |
| `APPROVAL_REQUIRED` | Missing trusted approval fixture |
| `FIXTURE_MISSING` | No next fixture exists |
| `CALL_ORDER` | Next expected tool differs |
| `ARGUMENT_MISMATCH` | Exact arguments differ |
| `TOOL_ERROR` | Fixture response has `isError: true` |
| `UNUSED_FIXTURES` | An otherwise passing case skipped a recorded interaction |
| `EXPECTED_ORDER` | Attempt sequence differs from `expect.callOrder` |
| `FORBIDDEN_CALL` | Attempted a tool listed in `expect.never` |
| `RESULT_MISMATCH` | Result at the expected path differs or does not exist |

SDK `ContractError` objects expose `code`. `runSuite()` returns a report with `passed`, `summary`, cases, events, and failures; invalid configuration throws instead. Output masking happens at delivery boundaries, so callers of the SDK must redact their own persisted output.
