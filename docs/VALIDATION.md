# Verification record

Date: 14 November 2026. Local platform: Windows, Node.js 26.13.0, npm 11.20.0.

## Current local checks

- `npm test`: **130 passed, 0 failed**. Covers planned and actual-agent replay, policy precedence, exact argument matching, result/output assertions, swallowed tool failures, fixture isolation, completed recorder snapshots, CLI commands and exit codes, credential masking, HTML/JUnit output, Studio HTTP boundaries, and MCP child-process stdio.
- `npm run test:mcp`: **7 passed, 0 failed**, using official `@modelcontextprotocol/sdk` **1.32.2**. Checks discovery, replay, approval denial, argument mismatch, generic JSON response envelopes, skipped fixtures at shutdown, and recorded tool errors.
- `npm run test:types`: **1 packed-consumer check passed**. Packs and installs the real archive into a temporary consumer, checks strict positive/negative usage on TypeScript **5.9.3** and **7.0.2** under NodeNext and Bundler resolution, and exercises installed canonical/legacy CLI commands and runtime exports.

The 130 core checks include 30 artifact-import checks: both contract modes, all three report modes, runnable export round trips, legacy optional metadata, masking without source mutation, inconsistent counts/status/evidence, invalid JSON, byte/depth limits, BOM handling, UTF-8 sizing, compact exports, optional description validation, embedded helper independence, marker-like payload strings, blank native Error messages, and escaped case-row markup.

HTTP tests require loopback networking. They passed with that access; restricted runs that return EACCES before binding a socket do not test the application.

Core runtime dependencies remain zero. MCP SDK and TypeScript are isolated development compatibility dependencies.

## Browser checks

The local workbench was exercised through its loopback server with synthetic data:

- Opened an observed MCP execution report and verified its read-only/not-rerun banner, case evidence, and hidden rerun controls.
- Rejected an inconsistent report without replacing the current report.
- Displayed HTML-like case/failure content as text, with no injected elements or event handler execution; common credential keys were masked.
- Downloaded a masked JSON report.
- Imported an agent-code contract, verified its CLI-only notice and disabled browser run control, then undid the import to restore the exact dirty draft.
- Ran that restored draft successfully and downloaded it as a contract. The exported file also passed through the CLI runner.
- Rejected invalid pasted JSON and an oversized file without replacing the draft.
- Imported a valid contract by paste and ran it successfully (2/2); imported a saved MCP report by paste and inspected its tool-call evidence.

The existing demo also exercised broken/fixed scenarios, expected-versus-attempted arguments, search/filter empty states, invalid editor JSON, and draft preservation during navigation. Screenshots are in `docs/images`.

## GitHub checks and scope

The preceding typed-package commit `44ebb8d` passed all four jobs on Windows/Linux and Node 22/24, including official MCP SDK and packed TypeScript consumers: [verified CI run](https://github.com/stepan4002/plumbcheck/actions/runs/43613777377). Current push results are available in the [CI workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/ci.yml).

GitNexus impact checks covered the shared validator, report generation, and redactor before this iteration. Validation was flagged HIGH because it serves planned, agent, and MCP runners; their full regression checks passed after extraction into the shared browser-neutral validator. A staged change-scope check is required before each commit.

## Remaining limits

- A true mobile viewport has not been verified; the available override did not change the reported viewport dimensions.
- Browser policy blocked opening a standalone `file:` report. Generated HTML data isolation, embedded helper independence, and script compilation are tested, but a direct offline browser opening still needs a manual check.
- No live LLM, production integration, external security audit, or independent developer usability study has been completed.
- Import validation checks structure and consistency, not report authenticity. Masking is key-based and does not detect arbitrary-text secrets or personal data.
- The package has not been published to npm. Its name is not reserved.
