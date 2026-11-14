# Initial build verification

Date: 14 November 2026.

## Agent-runner iteration

The complete local suite now passes **76 tests, 0 failures** on the platform below. This includes actual agent-code execution, final-output equality, swallowed and unawaited tool failures, thrown non-Error values, per-case input cloning, closed-session behavior, invalid JSON outputs, and credential masking in assertion evidence. The existing CLI, Studio HTTP, and MCP stdio checks also pass.

`npm run check:agent` passes both actual support-agent cases. `npm run demo:agent` intentionally fails its wrong-recipient case even though the agent catches the tool exception. CLI reports distinguish agent-code replay from planned-call replay and state that zero live calls counts only calls through replay.

The browser confirmed expected-versus-actual response evidence and successful switching to the corrected agent scenario after the report changes. The screenshot has been updated.

A PlumbCheck-specific GitNexus index is now registered. Impact analysis covered the shared runner, validator, and replay class before changes; the validator and replay class were flagged HIGH because they affect both Studio and MCP paths. Their relevant regression tests passed. The older parent-index limitations below describe the initial build, not the current index.

## Automated checks actually run

Local platform: Windows, Node.js **v26.13.0**, npm **11.20.0**.

`npm test`: **48 passed, 0 failed**. Includes deep argument matching, policy precedence, trusted approval context, unknown tools, fixture exhaustion, repeated calls, unused fixtures, result assertions, fixture mutation isolation, recorder behavior and concurrency, malformed contracts, credential-key redaction, HTML script-breakout resistance, JUnit escaping, CLI exit codes, generated report artifacts, HTTP Host/Origin validation, JSON-only requests, body limits, and real JSON-RPC messages over child-process stdio.

The HTTP tests require loopback networking. The initial restricted execution environment returned EACCES before reaching the app. Running the suite with loopback access exercised the server successfully. A forged-Host test was corrected to use raw HTTP because the installed Node fetch implementation replaced that header.

`npm run check`: corrected synthetic contract passed, **2/2**, exit 0.

`npm run example:sdk`: an actual JavaScript agent function returned the replayed order status and consumed its fixture.

`node bin/plumcheck.js demo`: deliberately failed, **2 passed / 4 failed**, demonstrating missing approval, changed recipient, forbidden deletion, and changed result. Zero live tool calls.

`npm pack --dry-run --ignore-scripts`: inspected intended source, examples, web template, and documentation; no environment files, reports, raw recordings, or dependencies. A zero-dependency lockfile is included.

## Browser behavior actually exercised

- Workbench loaded from its loopback server.
- Deliberate regressions displayed as failed checks with readable evidence.
- Fixed-agent button produced 2/2 passing checks.
- Search produced a useful empty state and restored results when cleared.
- Invalid JSON remained in the editor and produced an error without a successful run.
- Fixed/regression selection stayed synchronized after a UI correction.
- Unsaved editor content survived navigation between Contract and Overview.
- Wrong-recipient evidence displayed both attempted and expected arguments.
- Desktop screenshot saved in `docs/images/workbench.jpg`.

## Limits of this validation

- The configured Node 22/24, Windows/Linux GitHub Actions matrix has **not run on GitHub**. It still needs execution before a public release.
- The browser viewport override did not change the reported viewport size, so a true mobile layout check is **unverified** despite responsive CSS being present.
- Browser policy blocked opening a `file:` report directly. Generated HTML payloads and artifacts are tested; a standalone report still needs a manual browser opening.
- No official MCP SDK client, live LLM, or production integration has been tested. Stdio tests cover the documented minimal 2025-11-25 subset.
- GitNexus's existing parent `work` index does not contain this new standalone repository. Symbol lookups were unavailable for the new code; the parent change detector also reported that its indexed directory was not a Git repository. No existing project symbols were changed. Local Git review and direct tests cover the new project; this is not a successful graph impact analysis.
- No external adoption, security audit, or competitor usability study has been completed.
