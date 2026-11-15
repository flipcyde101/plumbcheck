# Verification record

Updated 15 November 2026 for **0.2.0-preview.1**, on Windows with Node.js 26.13.0 and npm 11.20.0. This is a preview validation record. `release-readiness.json` keeps unverified production gates open.

## Automated checks

- `npm test`: **178 passed, 0 failed**. Covers replay, actual agent interception, policies, arguments/results/output, swallowed failures, fixture isolation, recording, artifact import/redaction, reports, CLI/HTTP boundaries, workspace revisions/recovery, request deduplication, credentials, model budgets, Python, control MCP, snapshot sync, and portable engine parity.
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

The installer is **unsigned**. Clean-account install/uninstall, credential persistence, upgrades, publisher signing, accessibility, and independent review remain release work. Windows and Android bundle their interfaces; neither requires a separately hosted website.

## Android and snapshot sync

Debug and release-variant Android builds completed with lint. The local release-variant APK passed `apksigner verify`; its private preview key and DPAPI-protected password are outside Git. This is a local preview identity, not a verified publisher or Play release. On a separate Android 36.1 QA emulator, native controls ran the regression and corrected suites, saved a project, exported JSON through Android's document picker, and reopened that report without rerunning it. The exported report passed the Node artifact validator. A subsequent APK update retained the saved project, which again passed 2/2. System-bar overlap found during this check was fixed using [Android's inset guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge). Real-device and HTTPS/Keystore walkthroughs remain open.

Relay integration checks covered unauthorized requests, single-use pairing, upload consent, immutable snapshots, import without overwriting edits, a second device, hashed tokens, and revocation. They do not prove a deployed HTTPS service, phone-to-desktop pairing, Keystore recovery, or background execution. No remote service was deployed. Phone-triggered Windows jobs and automatic conflict reconciliation remain roadmap work.

## Reporting boundaries

Workbench checks exercised fixed/regression switching, argument/result/output differences, invalid/oversized imports, draft restoration, literal rendering of HTML-like payloads, credential masking, and JSON exports. Saved execution reports are read-only. Imported reports are validated for consistency; descriptive model provenance is not cryptographic proof of authenticity.

Masking is key-based and cannot identify every secret in arbitrary text. Raw fixtures require review before export/sync. The relay stores fixture JSON and is not end-to-end encrypted. The app does not sandbox imported agent code or certify a real business system's safety.

## Source and CI scope

GitNexus impact checks covered shared rendering/control paths and workspace/model/control modules before edits. The final staged scope check succeeded: 147 changed indexed symbols and 23 affected flows, with CRITICAL overall risk from the broad/shared paths. Source review matched the expected workspace, model, import/report, mobile, and sync scope. Shared workbench functions were flagged HIGH/CRITICAL; affected imports, fixture runs, and saved reports received checks. Some earlier impact traversals were partial and ambiguous symbols required direct source review. Final CI results are recorded with the completed increment.

The preceding `da0af8b` passed its Windows/Linux Node 22/24 matrix and Windows packaging. Consult the [core](https://github.com/stepan4002/plumbcheck/actions/workflows/ci.yml), [Windows](https://github.com/stepan4002/plumbcheck/actions/workflows/windows-desktop.yml), and [Android](https://github.com/stepan4002/plumbcheck/actions/workflows/android.yml) workflows for current results. The repo remains private. No npm publication, public GitHub release, store submission, assistant account installation, or remote deployment was performed.
