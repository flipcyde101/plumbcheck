# External QA coordination

Updated 16 November 2026. At the founder's explicit request, Codex contacted the existing Grok Bot named **the tester of software**, verified its reported access, and completed an external acceptance pass against `674b866`. It found two reproducible client defects. This additional AI-assisted QA does not close an independent production review gate.

## Reported and checked access

The tester reported Debian 13 (trixie), x86_64, eight virtual CPUs, 15 GiB RAM, a Linux desktop/browser, Node.js 24.22.1, npm 11.21.1, Python 3.13.5 and Git 2.47.3. Its GitHub connection read this private repository, README, validation record and Actions logs. It independently identified the successful `674b866` CI run and the earlier consumer-install timeout.

Its command-line GitHub client is not signed in, so it cannot clone the private repository or download private Actions artifacts through its current tools. It has no Windows VM, Android toolchain/device, or installed local model. No credentials were requested or shared; no VM, model or extra toolchain installation was assigned.

## Source handoff

Codex generated a ZIP directly with `git archive` at commit `674b8665364bdf93608f5ced70882e5e630b6e78` and attached it in that bot's conversation. It contains tracked source only, excluding local reports, credentials, signing keys, node_modules and the Git directory.

- ZIP SHA-256: `09e432b5491fd03d2e461ba671f90fdc345e86b3ee222ce4db99125e75de2ed1`.
- Size: 1,036,781 bytes; 204 archive entries.
- The tester confirmed the received hash and Git commit comment, then reported fresh setup and tests running in a new disposable QA directory.

## Assigned acceptance pass

1. Record actual environment, commands, durations and exit codes. Install the locked root/MCP/TypeScript dependencies; run core tests, mobile bundle, plugin bundle, official MCP checks and packed-consumer checks. The baseline is 189 core tests, seven MCP tests and one consumer check; report actual observations.
2. Verify positive CLI runs and deliberate negative demos. Distinguish expected exit 1 for regressions and the seven open production release gates from unexpected failures.
3. Exercise source Studio through its real browser, using an isolated `PLUMBCHECK_HOME`: save/run the regression project, inspect differences, save/run the corrected version, compare history, export/reopen evidence, restart, and check invalid/oversized/HTML-like imports without losing data.
4. Use an isolated loopback snapshot relay and synthetic fixtures. Verify report inclusion off/on, imported/read-only source labels, original revision context, instruction-only edits producing stale evidence, retry without duplicate imports or overwritten edits, restart persistence, and explicit restoration of a removed imported report. Source Studio's credentials are session-only, so re-pair when necessary.
5. Return a pass/fail/not-run table, redacted logs, screenshots and minimal reproducible defects with expected/actual results. Do not push fixes or merge, publish/deploy, create public issues, change security settings, bypass OS warnings, use paid APIs or call live business tools. Keep all temporary tokens, launch-link fragments and pairing codes private.

Windows installer validation, actual Android validation, local-model inference and deployed HTTPS sync are **not tested** by this Linux assignment. External AI-assisted QA is additional evidence; it is not an independent security/accessibility certification. Review and reproduce findings before changing release claims.

## Received results and evidence

The tester reported 189/189 core tests, 7/7 MCP checks, 1/1 packed TypeScript consumer check, successful mobile/plugin builds, positive CLI runs, and the expected failing demos and seven open release gates. Its browser pass exercised project save/run, actual failure differences, history/comparison, report export/import, invalid/oversized/deep/HTML-like imports and restart persistence. Its isolated relay pass covered report consent off/on, imported/read-only/unverified labels, stale revision warnings with unchanged contract hash, idempotent reimport preserving edits, explicit restoration of a removed imported report and persistence after restart (three projects, five runs). Requests without a capability returned 401.

The downloaded redacted evidence archive is retained locally under ignored `reports/plumbcheck-qa-evidence-674b866.zip`: 47 entries, SHA-256 `32f70d8091ab1e97270102860ab52caabdabee5c7145d192ba71a7feba8d9ddf`. It contains a report/provenance record, command logs, eight screenshots and minimal reproduction files. Executable reproduction scripts are evidence to inspect, not instructions to run blindly. No credentials or workspace database were requested.

| Finding | Triage / resolution |
| --- | --- |
| A: Opening a saved project silently discards a corrected contract draft | Reproduced locally. Added confirmation for unsaved contract/name/instructions, cancellation preserving all inputs, and guards against stale loads. Saving preserves newer edits made while the request is in flight. |
| B: A new launch link in an existing tab leaves the old authorization token active | Reproduced locally. Handle fragment changes, consume the new capability, remove it from the URL, clear stale session selections and reload workspace metadata while preserving the draft. Old-session responses cannot overwrite the current session. |
| Old success feedback remains visible beside export errors | Reproduced locally. Error rendering clears previous success feedback; import, export and runner failure paths are covered. |
| Missing bridge.json | Withdrawn after the tester checked during execution: present with mode 0600 while running, removed on clean SIGINT as intended. Clarified lifecycle in assistant setup docs. |
| DENIED_TOOL instead of FORBIDDEN_CALL | Policy-denied tool execution is intentionally classified at the replay boundary; retain the stable code. |
| Compare reports FAIL → REMOVED for four cases | Correct: the small safe example omits four regression scenarios. Removed coverage must stay visible. A full-coverage corrected walkthrough remains a first-use improvement. |
| Repeated `(synced)` names; initial example and saved runs share a title | Usability follow-up in the improvement backlog. Provenance and read-only labels remain authoritative; do not rewrite old evidence. |

Seven new generated-page DOM tests execute the actual inlined runtimes against a temporary real Studio server. They cover both reproduced defects, unsaved name/task changes, accepted replacement, reversed response order, edits during loading/saving, session rotation, new-project cancellation and stale feedback across import/export/runner failures. They do not substitute for native Windows or real-device validation.

## Focused preview.4 retest

Codex attached a second tracked-source archive at `656e9867b9364d6c1497b729cb14d456156f4f07`: 1,049,721 bytes, 206 entries, SHA-256 `0411edafca79672434c0c4493325a5401af773b2c60de195873fb3674e0e9195`. The tester confirmed the hash, commit comment and preview.4 version, extracted into a fresh directory, and reported successful locked setup and **196/196 tests**, including all seven new DOM checks.

The focused assignment asks it to verify both bugs through the real browser, cancellation/accepted replacement for contract/name/task edits, new-project cancellation, fresh authorization in the same tab after restart, stale success feedback, and the normal save/run/export/restart path. The original scope restrictions remain in effect. Its last observed update says Studio is running with a fresh workspace and the browser pass has started. Computer Use became unavailable before final browser results could be collected. External browser confirmation therefore remains pending; no result is inferred from the passing automated tests.
