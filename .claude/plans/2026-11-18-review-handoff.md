# Ultra-review result (2026-11-18) — branch fix/real-agent-tool-surface

7 finders, 18 deduped candidates. Verification: 2 by verifier agents (consent, regex), the rest reproduced with a
script before and after each fix. 15 confirmed and fixed, 1 refuted, 2 judged not a defect.

## Fixed
| # | Finding | Fix |
| --- | --- | --- |
| 1 | Regex guard bypassable; `(a|a)*b`, `((a+))+$`, `\w*\w*\w*$` froze runs for seconds to minutes | Linear-time Thompson-NFA pattern engine inside `createContractValidator` (`validateSuite.compilePattern`), used by `src/matchers.js`; RegExp never sees contract patterns (`test/safe-pattern.test.js`) |
| 2 | Model-spend consent carried over to an auto-selected connection (removal, new launch link) | `preferModelRun` clears consent when it changes the connection; connection `change` clears consent; hashchange resets consent and mode choice; save prefers the just-saved connection (`workspace-ui` test) |
| 3 | Builder notice claimed model test was selected while fixture was | Notice reads the actual `#run-mode` |
| 4 | Save vs polling race picked `connections[0]` | `preferredConnectionId` |
| 5 | MCP case with only final-answer checks passed with nothing evaluated | `CHECKS_NOT_EVALUATED` failure |
| 6 | OUTPUT_ASSERTION `check` leaked an unmasked expected secret | `check` holds operator/path only; operands nested under their path (`operand`) so redaction masks them |
| 7 | contains/notContains searched JSON-escaped text and key names | Search text/number/boolean leaf values only |
| 8 | Recorded `$plumb` data became wildcard matchers on replay | Recorder snapshot wraps such objects in `{ $plumb: 'literal' }` |
| 9 | Date/Map/class instances equalled plain fixture objects | Realm-safe plain-object check |
| 10 | `diffExpected` read inherited props → REPLAY_ERROR | Own-property check |
| 11 | literal/oneOf data bypassed depth limit → stack overflow | Depth ≤ 32 at validation |
| 12 | Declared/inferred schemas were never validated (AI SDK `jsonSchema` without `validate`) | zod `fromJSONSchema` validation for replayed tools; guarded tools left unvalidated so attempts are recorded; original value passed through (no key stripping) |
| 13 | Desktop MCP setup rejected agent-mode contracts | Mode detection in `desktop/runtime/config.mjs` |
| 14 | Docs said MCP/model runs expose only fixture tools | README, APP_WORKSPACE, NATIVE_WALKTHROUGH, WINDOWS_APP corrected |
| 15 | Probe: invalid guarded calls not counted as attempts; `name:latest`; results lost on abort; run errors hidden | Fixed in `scripts/probe-model.mjs` |

## Refuted / not a defect
- Schema-invalid guarded call hidden from evidence: refuted (call reaches replay and is blocked; kept that way deliberately in fix 12).
- Probe localhost regex: `connectionConfig` only accepts exact loopback hosts for http, so not reachable.
- Older contracts with literal `$plumb` data now rejected: `$plumb` is a new reserved key; such data must use `{ "$plumb": "literal", "value": ... }`. Documented.
