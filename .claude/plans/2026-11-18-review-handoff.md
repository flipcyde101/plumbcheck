# Ultra-review handoff (2026-11-18) — branch fix/real-agent-tool-surface @ 55b2507

Review interrupted by usage limit during verification. Nothing below is fixed yet.

## CONFIRMED (verifier traced, or measured by 5 independent finders)
1. [MAJOR] ReDoS: `pattern()` guard in src/contract.js is bypassable — `(a|a)*b` 27 chars 11.8 s, `((a+))+$`, `\w*\w*\w*$` 500 chars 33 s (no groups at all). Synchronous; freezes Workspace/Android. **Fix:** replace RegExp with linear-time engine — draft in `.claude/plans/safe-pattern-draft.js` (Thompson NFA, untested). Put `compilePattern` inside createContractValidator, expose as `validateSuite.compilePattern`, use it from src/matchers.js (import contract.js; it has no imports). Remove the heuristic + RegExp in matchers; update CONTRACTS.md/SECURITY.md syntax notes.
2. [MAJOR] Consent bypass in web/workspace.js `preferModelRun`: auto-selecting `connections[0]` after removal/hashchange keeps `#model-consent` checked → run on a connection never authorized. **Fix:** whenever preferModelRun changes `#run-connection` (or on hashchange) uncheck `#model-consent`; also reset `runModeTouched` on hashchange; add a `change` listener on `#run-connection` that clears consent.
3. [MINOR] web/workspace.js:40 notice says model test selected even if user picked fixture — use actual `#run-mode` value.
4. [MINOR] Connection-save vs polling refresh race picks connections[0] (consent is cleared there, so no bypass).

## UNVERIFIED (finder-reported, verification cut off) — verify before fixing
- Guarded tool called with schema-invalid args never reaches ReplaySession → AGENT_ERROR instead of DENIED_TOOL; probe says inconclusive/resisted. Fix idea: offer guarded (no-fixture) tools with permissive `{type:'object'}` schema; probe treats invalid call names as attempts.
- jsonSchema() without `validate` → declared schemas may not be enforced; CONTRACTS.md claim may be wrong.
- MCP/agent-mode case with only outputChecks/output and no fixtures passes with nothing evaluated → should fail or require another assertion when skipped.
- OUTPUT_ASSERTION `check` field leaks unmasked secrets (redact masks by key only) — drop `check.equals` or mask via atPath.
- contains/notContains on non-string output use JSON.stringify (escaped quotes, key names) → search only string leaf values.
- createRecorder: recorded agent args containing `$plumb` become matchers → wrap in `{ $plumb: 'literal', value }` on snapshot.
- matchValue treats Date/Map/class instances as plain objects (regression vs isDeepStrictEqual) → require plain prototype.
- diffExpected reads inherited props (`constructor`) → structuredClone throws REPLAY_ERROR; use own-property check.
- literal/oneOf values bypass depth limit → stack overflow in shape(); bound depth in validator.
- desktop/runtime/config.mjs validates planned-only → app can't make MCP setup for agent contracts.
- Docs still say "fixture tools only": README ~184, docs/APP_WORKSPACE.md 27/30/45, docs/NATIVE_WALKTHROUGH.md 38.
- Probe: ollama `name:latest` mismatch; results lost on exception; run.error not printed.

## After fixes
Rerun npm test, test:mcp, test:types, mobile:build, test:probe (qwen3.5:4b, gpt-oss:20b); then wrap-up skill.
