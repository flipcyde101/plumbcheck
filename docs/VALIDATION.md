# Verification record

Updated 16 November 2026 for **0.2.0-preview.3**, on Windows with Node.js 26.13.0 and npm 11.20.0. This is a preview validation record. `release-readiness.json` keeps unverified production gates open.

## Automated checks

- `npm test`: **189 passed, 0 failed**. Covers replay, actual agent interception, policies, arguments/results/output, swallowed failures, fixture isolation, recording, artifact import/redaction, reports, CLI/HTTP boundaries, workspace revisions/recovery, request deduplication, credentials, model budgets, Python, control MCP, snapshot sync, portable engine parity, Android address restrictions, native transport settlement/cancellation, discovery validation, and SDK model decisions through the mobile adapter.
- `npm run test:mcp`: **7 passed, 0 failed**, using official MCP SDK **1.32.2**. Includes discovery, successful replay, denied approval, wrong arguments, generic JSON fixture envelopes, skipped fixtures, and recorded tool errors.
- `npm run test:types`: **1 packed-consumer check passed**. Packs/installs the real archive, checks TypeScript **5.9.3** and **7.0.2** under NodeNext/Bundler, and exercises installed CLI commands and runtime exports.
- `npm run plugin:build` and an official SDK check against its bundled control entry passed. The client controlled a real local Studio workspace. This is not an actual Claude or ChatGPT host walkthrough.
- `npm run mobile:build` passed. Portable checks compare the browser engine with Node on the shipped pass/failure corpus and JSON comparison semantics.

Model checks use installed AI SDK **7.0.173** ToolLoopAgent and maintained provider packages. Failure tests include unknown/schema-invalid calls that SDK recovery must not turn into passes, last-step usage over budget, a run-wide output budget, and per-case tool-call limits. SDK observer exceptions alone do not enforce these limits.

Workspace checks include durable revisions, corrupt-state rejection, single ownership, interrupted jobs after restart, failed-write recovery, cancelled jobs, concurrent idempotency, persistent tombstones after history deletion, destination-specific credentials, model consent, private capability authentication, and removed cases in comparisons. These checks do not prove immunity to every storage/OS failure.

Replay/evaluation use Node built-ins. The complete package now has pinned production AI SDK/provider/MCP/Zod dependencies. The production dependency audit reported **0 known vulnerabilities** at verification time; this is time-specific and does not replace review.

## Live local model

The user's **Ollama / qwen3.5:4b** completed actual model-selected calls through the built-in agent and fixture-only responses. The correct order lookup passed; deliberately requesting the wrong ID produced `ARGUMENT_MISMATCH`. The opt-in script exported validated JSON, HTML, and JUnit evidence with usage and contract revision/hash. See [the reproducible live check](LIVE_MODEL_VERIFICATION.md).

These are synthetic scenarios, not a reliability benchmark. No real business service or paid API account was attached. OpenAI, Anthropic, Google, LM Studio, other models, and actual assistant hosts need their own live validation. API integration does not imply consumer subscription access.

## Windows packaging and interface

The Windows preview uses Electron **45.3.2**, electron-builder **26.18.0**, and a dedicated bundled Node.js **26.13.0** MCP console runtime. License notices ship with the app; its SBOM inventories production npm packages and pinned desktop/console runtimes. The GUI executable is not a stdio server.

The final local Windows build passed an approved two-call MCP replay and deliberate wrong-recipient failure, including JSON-RPC-only stdout, exit codes, reports, and JUnit field evidence. Its generated SBOM has 107 components. The Windows workflow additionally installs its NSIS build and checks the installed helper; consult its actual run for that result.

Native Computer Use verified the rebuilt app's private workspace access, a saved one-case project, Ollama discovery, connection saving, explicit run consent/limits, and a live Qwen run. It passed with one intercepted call and reported 767 input / 136 output tokens across two model steps. History reopened its actual report with provider/model, contract revision, output, and a read-only/not-rerun label. The native MCP save dialog wrote a contract into the ignored QA directory, returned a bundled-runtime configuration, and the saved file passed the contract validator. [Native Qwen screenshot](images/windows-qwen.jpg).

An additional native restart check stored a synthetic credential through the running app, verified that the credential file contained ciphertext rather than that plaintext, restarted the app, and confirmed that the recovered key reached only a temporary loopback model-list server through Electron's native transport. The synthetic connection was then removed. Saved projects, the Ollama connection, and Qwen evidence also survived the restart. No real API credential was used in this check.

The installer is **unsigned**. Clean-account install/uninstall, credential persistence, upgrades, publisher signing, accessibility, and independent review remain release work. Windows and Android bundle their interfaces; neither requires a separately hosted website.

## Android and snapshot sync

Debug and release-variant Android builds completed with lint and three native address/origin unit tests. The local release-variant APK passed `apksigner verify`; its private preview key and DPAPI-protected password are outside Git. This is a local preview identity, not a verified publisher or Play release. On a separate Android 36.1 QA emulator, native controls ran the regression and corrected suites, saved a project, exported JSON through Android's document picker, and reopened that report without rerunning it. The exported report passed the Node artifact validator. A subsequent APK update retained the saved project, which again passed 2/2. System-bar overlap found during this check was fixed using [Android's inset guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge). Real-device and HTTPS/Keystore walkthroughs remain open.

Relay integration checks covered unauthorized requests, single-use pairing, upload consent, immutable snapshots, import without overwriting edits, a second device, hashed tokens, and revocation. They do not prove a deployed HTTPS service, phone-to-desktop pairing, Keystore recovery, or background execution. No remote service was deployed. Phone-triggered Windows jobs and automatic conflict reconciliation remain roadmap work.

## Reporting boundaries

Workbench checks exercised fixed/regression switching, argument/result/output differences, invalid/oversized imports, draft restoration, literal rendering of HTML-like payloads, credential masking, and JSON exports. Saved execution reports are read-only. Imported reports are validated for consistency; descriptive model provenance is not cryptographic proof of authenticity.

Masking is key-based and cannot identify every secret in arbitrary text. Raw fixtures require review before export/sync. The relay stores fixture JSON and is not end-to-end encrypted. The app does not sandbox imported agent code or certify a real business system's safety.

## 0.2.0-preview.3 sync evidence increment

A regression test reproduced the dropped-report defect before implementation. Windows now commits imported projects and reports atomically, uses an explicit imported status, retains source context, rejects changed immutable snapshot content, and reuses an existing import without overwriting edits. Android uploads its actual saved revision and optionally its report. Evidence, context and source share one atomic local-storage value; the earlier standalone report storage remains readable. Snapshot validation is shared by the relay, desktop importer and Android.

The seven added checks cover the real HTTP pair/upload/import/restart flow, explicit report inclusion, old-revision evidence after instruction edits, malformed report/context rejection, immutable snapshot mutation, failed-storage atomicity, comparison with a subsequent local run, mobile persistence, legacy migration and quota failure. The complete suite passed 189/189; official MCP 7/7, packed TypeScript, plugin build, Android release unit/assembly/lint/signature and Windows packaging/helper checks passed locally. Final source CI remains to be recorded.

Native Windows History displayed the actual earlier Android Qwen mismatch as IMPORTED, with the original revision, usage and unverified source label. Inspect retained its expected ORD-1042 versus actual WRONG-ORDER evidence. Android upgraded from preview.2 to preview.3 and reopened its existing project/report with a not-rerun label. This verifies native evidence viewing and storage compatibility; it does not establish a deployed HTTPS relay or physical phone-to-Windows networking.

## 0.2.0-preview.1 source and CI scope

GitNexus impact checks covered shared rendering/control paths and workspace/model/control modules before edits. The final staged scope check succeeded: 147 changed indexed symbols and 23 affected flows, with CRITICAL overall risk from the broad/shared paths. Source review matched the expected workspace, model, import/report, mobile, and sync scope. Shared workbench functions were flagged HIGH/CRITICAL; affected imports, fixture runs, and saved reports received checks. Some earlier impact traversals were partial and ambiguous symbols required direct source review. Final CI results are recorded with the completed increment.

The functional increment is `5a85667`, followed by CI configuration/consumer-check fixes in `109a697`. All four Windows/Linux Node 22/24 jobs passed in [core CI](https://github.com/stepan4002/plumbcheck/actions/runs/43768448717). The unchanged Windows application source passed packaging, bundled-helper checks, silent NSIS installation, installed-helper checks, SBOM generation, and artifact upload in [the Windows run](https://github.com/stepan4002/plumbcheck/actions/runs/43768119177). Android debug assembly, lint, and artifact upload passed in [the Android run](https://github.com/stepan4002/plumbcheck/actions/runs/43768448720). The first CI attempts exposed an obsolete Android SDK package default and an invalid cache-only consumer-install assumption; both were corrected before these successful runs.

## 0.2.0-preview.2 native Ollama increment

Source commit `5b137a9` adds the Android Ollama connector. The final GitNexus staged check identified 74 changed indexed symbols and six affected flows, with HIGH aggregate risk. Review matched the shared model extraction, mobile project state, native origin enforcement, and transport lifecycle; both Windows and Android callers were covered by the model checks.

The Android connector shares the portable ToolLoopAgent with Windows and uses a native origin-locked transport. Local checks passed: 182 core tests, seven official MCP checks, the packed TypeScript consumer check, plugin build, Android debug/release unit/assembly/lint checks, release APK signature verification, and Windows packaging plus its positive/negative MCP helper checks. The regenerated SBOM inventories 107 components. All four Node 22/24 Windows/Linux jobs passed in [core CI](https://github.com/stepan4002/plumbcheck/actions/runs/43868302568). Native unit tests, debug assembly, lint, and APK upload passed in [Android CI](https://github.com/stepan4002/plumbcheck/actions/runs/43868302707). Packaging, positive/negative helper checks, silent NSIS installation, installed-helper checks, SBOM/checksums, and artifact upload passed in [Windows CI](https://github.com/stepan4002/plumbcheck/actions/runs/43868302589). These runs all tested source commit `5b137a9`.

Native Android QA discovered the actual installed models, ran Qwen through the PC LAN address, and exported both reports through the document picker. The correct order passed (741 input / 181 output tokens); the deliberate wrong order failed with `ARGUMENT_MISMATCH` (761 input / 271 output tokens). Both took two steps, used zero live business tools, and passed the Node artifact validator with distinct saved revisions/hashes. [Android evidence](images/android-ollama-pass.jpg). This is emulator evidence. The physical phone connection remains unverified after prior browser failures; no claim is made that its network path is fixed.

The repo remains private. No npm publication, public GitHub release, store submission, assistant account installation, or remote deployment was performed. Production gates remain open for publisher signing, clean-account upgrades, live cloud/assistant hosts, real devices and HTTPS pairing, hosted operations, and independent review. `npm run release:check` intentionally fails while these are unverified.
