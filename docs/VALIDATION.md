# Verification record

Date: 14 November 2026. Local platform: Windows, Node.js 26.13.0, npm 11.20.0.

## Current local checks

- `npm test`: **147 passed, 0 failed**. Covers planned and actual-agent replay, policy precedence, exact argument matching, result/output assertions, swallowed tool failures, fixture isolation, completed recorder snapshots, CLI commands and exit codes, credential masking, HTML/JUnit output, Studio HTTP boundaries, MCP child-process stdio, field differences, and desktop MCP configuration.
- `npm run test:mcp`: **7 passed, 0 failed**, using official `@modelcontextprotocol/sdk` **1.32.2**. Checks discovery, replay, approval denial, argument mismatch, generic JSON response envelopes, skipped fixtures at shutdown, and recorded tool errors.
- `npm run test:types`: **1 packed-consumer check passed**. Packs and installs the real archive into a temporary consumer, checks strict positive/negative usage on TypeScript **5.9.3** and **7.0.2** under NodeNext and Bundler resolution, and exercises installed canonical/legacy CLI commands and runtime exports.

The core checks include 31 artifact-import checks, including a genuine missing-call result assertion, plus 13 difference checks and 3 desktop configuration checks. Difference checks cover nested/array/type/missing changes, escaped field paths and HTML, masking credential ancestors before creating rows, bounded comparisons/previews, actual failure evidence, CLI output, JUnit, and standalone embedded helpers. Desktop configuration checks cover absolute paths, spaces, invalid cases/contracts, and resource limits.

HTTP tests require loopback networking. They passed with that access; restricted runs that return EACCES before binding a socket do not test the application.

Core runtime dependencies remain zero. MCP SDK and TypeScript are isolated development compatibility dependencies.

## Windows packaging

Built a Windows x64 NSIS installer and portable ZIP locally using Electron **45.3.2**, electron-builder **26.18.0**, and a bundled Node.js **26.13.0** console runtime. The app includes Electron/Chromium/Node license notices. Packaged checks passed for an approved two-call MCP replay and a wrong-recipient failure, including JSON-RPC-only stdout, exit codes, observed-call reports, generated HTML, and field evidence in JUnit.

The GUI executable is not used as an MCP stdio process: a packaged test caught input loss through that route. Generated configuration points to the dedicated bundled console helper instead. End users still do not need a system Node.js installation.

The native app launched and was listed with its **PlumbCheck — Test the work. Trust the agent.** window title. Native control/save-dialog interaction remains **unverified**: after an earlier controller stall, Computer Use explicitly reported that it was not approved to use PlumbCheck. An owned hidden test instance was verified and stopped before the visible launch. Do not treat packaged MCP checks as proof of native save-dialog behavior. The Windows workflow separately installs the package in its runner and checks the installed MCP layout; consult that run for its actual result. Installer interaction on a clean user machine, code signing, accessibility review, and update behavior remain release work.

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

The latest browser pass verified the new `/to` argument comparison and `/structuredContent/status` result comparison, expanded full assertion JSON, ran the fixed contract (2/2), imported an MCP report by file, and imported output evidence by paste. HTML-like paths/values produced zero injected `img`/`svg`/`script` elements in the inspector, and synthetic credential values were absent from visible evidence. Returning to local checks and rerunning regressions worked. The comparison screenshot is `docs/images/workbench-diff.jpg`. This was browser testing of the shared workbench, not native save-dialog testing.

## GitHub checks and scope

The preceding import/export commit `23c393d` passed all four jobs on Windows/Linux and Node 22/24, including official MCP SDK and packed TypeScript consumers: [verified CI run](https://github.com/stepan4002/plumbcheck/actions/runs/43618323813). Current push results are available in the [core CI workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/ci.yml) and [Windows packaging workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/windows-desktop.yml).

GitNexus impact checks covered the workbench renderer/controls, HTML/JUnit generation, CLI entry, and artifact validator before changes. Renderer/controls were flagged HIGH because local runs and imports share them. The final change-scope check identified the expected reporting, import, and workbench paths. Newly added desktop modules also received direct source review and packaged checks; they were not present in the prior symbol index.

The earlier all-changes scope check succeeded. A subsequent staged MCP recheck was blocked by the environment's “approval policy is never” setting. The staged source diff and whitespace checks were reviewed directly; this is not a claim that the blocked staged call succeeded.

## Remaining limits

- A true mobile viewport has not been verified; the available override did not change the reported viewport dimensions.
- Browser policy blocked opening a standalone `file:` report. Generated HTML data isolation, embedded helper independence, and script compilation are tested, but a direct offline browser opening still needs a manual check.
- No live LLM, production integration, external security audit, or independent developer usability study has been completed.
- Import validation checks structure and consistency, not report authenticity. Masking is key-based and does not detect arbitrary-text secrets or personal data.
- The package has not been published to npm. Its name is not reserved.
