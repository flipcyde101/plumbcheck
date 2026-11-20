# Changelog

All notable changes to PlumbCheck are listed here. The project follows [Semantic Versioning](https://semver.org/) from 1.0.0; see the [stability policy](docs/STABILITY.md). `0.x` preview releases could change contracts between versions.

## [Unreleased]

### Added
- A runnable Python example (`examples/python-order-lookup/`) and an Ollama troubleshooting guide (`docs/TROUBLESHOOTING.md`, now shipped in the npm package). Thanks to @flipcyde101 for both, PlumbCheck's first outside contributions.

### Fixed
- Windows: saving a workspace, credentials, app settings or relay devices no longer fails with `EPERM` when antivirus or the search indexer briefly holds the file open. The atomic replace now retries those transient locks for up to about 3 seconds, then reports the error as before.

## [1.0.0-rc.1] - 2026-11-20

Release candidate for 1.0.0. Windows binaries in this pre-release are **not signed** yet; 1.0.0 will be. Verify downloads against `SHA256SUMS.txt`.

### Added
- [Stability policy](docs/STABILITY.md): what 1.x freezes (contract v1, report v1, CLI flags and exit codes, the JS API, the Python adapter, MCP tool names, the Windows data folder) and what ships experimental.
- JSON Schema for contracts at `schema/contract-v1.schema.json`, also published at its `$id` URL. Contracts may carry an optional `$schema` key; PlumbCheck ignores it.
- `npm run version:set -- <version>` writes one version everywhere; Studio, saved reports and both MCP servers report it.
- npm package `plumbcheck`: `npx plumbcheck demo`, `npm install --save-dev plumbcheck`. It now ships the Python adapter (`adapters/python/plumbcheck.py`) and the JSON Schema, and only user-facing docs (1.43 MB to 117 KB).
- Windows: a notice when a newer release exists. The app asks GitHub at most once a day, never downloads or installs anything, and the check can be turned off in the Workspace. See the new [privacy policy](docs/PRIVACY.md).
- Release workflow: a `v*` tag builds and tests everything, signs the Windows app and installer through SignPath Foundation when enabled, drafts the GitHub release with checksums computed after signing, and publishes to npm with provenance.
- CI installs 0.2.0-preview.5, adds 0.2 user data, upgrades in place, checks the data and a generated MCP configuration with the installed runtime, uninstalls, and checks that user data is kept. Compatibility fixtures freeze the 0.2 contract, report and workspace formats.
- Security: supported-versions table and private vulnerability reporting in [SECURITY.md](SECURITY.md), `npm audit` in CI, Dependabot, and every GitHub Action pinned to a commit.

### Changed
- **Anthropic is experimental in 1.0 (decided 2026-11-20).** The `live-models` gate verifies OpenAI (and Ollama, already verified). The Anthropic connection keeps working but carries no 1.0 promise until a live run is recorded.
- **Release gate scope (decided 2026-11-20).** Each gate in `release-readiness.json` now has a `scope`. The 1.0 release requires `core-and-integrations`, `windows-authenticode`, `windows-clean-machine` and `live-models` (OpenAI). `assistant-hosts`, `android-device` and `remote-service` are `experimental`, matching the surfaces that 1.0 ships as experimental; `external-review` is `post-1.0`. Reason: 1.0 covers the CLI, contract format, JS/Python adapters, MCP servers and the Windows app; the phone app, hosted relay and assistant-host plugins are not part of that promise, so they no longer block it. No gate's status was changed to pass. `core-and-integrations` went back to pending because its evidence was for 0.2.0-preview.5. A gate without a scope counts as required.

- The Android app, `plumbcheck-sync` and the assistant-host plugin are labelled experimental in their UI, help text and docs.
- The fixture MCP server reported version `0.1.0-alpha.1` in `serverInfo`; both MCP servers now report the package version.
- The Android `versionCode` is derived from the version (`10000` for 1.0.0). The experimental debug APK cannot update the release-signed preview.5 APK; uninstall that first.

### Deprecated
- The `plumcheck` and `plumcheck-mcp` command aliases. Use `plumbcheck` and `plumbcheck-mcp`. The aliases now print a notice on stderr and are removed in 2.0.

### Known limits
- Windows binaries in this release candidate are unsigned. The NSIS uninstaller stays unsigned in signed releases too.
- Hosted agents (n8n, Zapier, OpenAI Assistants) and remote MCP are not supported yet.

## [0.2.0-preview.5] - 2026-11-19

First tagged release. Preview: not production-ready; see [release gates](release-readiness.json).

### Added
- Real-agent assertions: `$plumb` argument matchers, `outputChecks` on the final answer, suite-level `tools` declarations.
- Every tool a contract names (expected, denied, approval-gated) is offered to the agent, so "must not call" checks can actually fail.
- Scenario builder must-not cases: denied tool, approval required, output assertion.
- `npm run test:probe`: six live scenarios (two controls, three detections, one injected instruction) against a local Ollama model.
- [Connect your agent](docs/CONNECT_YOUR_AGENT.md): which agents are supported, where they can run and how to plug them in.
- Windows app: guided first test builder, local Ollama discovery, saved projects, run history, comparison and cancellation.
- Android preview APK with offline fixture checks and Ollama model tests.
- Python and JavaScript adapters, fixture MCP and testing-control MCP servers, optional self-hosted snapshot sync.

### Fixed
- Contract patterns run on a linear-time matching engine; patterns that could hang the app now finish in under 2 seconds on 20,000 characters.
- Model-spend approval no longer carries over to a connection you did not choose.
- Output-only cases over MCP fail with `CHECKS_NOT_EVALUATED` instead of passing with nothing checked; skipped output checks are reported.
- Failure reports mask secret values.
- Recorded tool calls can no longer act as wildcards on replay.
- Tool argument schemas are enforced for replayed tools.
- The Windows app can create an MCP setup for the current contract format.

### Known limits
- Hosted agents (n8n, Zapier, OpenAI Assistants) and remote MCP are not supported yet.
- The Windows installer is unsigned; the Android APK is debug-signed.

[Unreleased]: https://github.com/stepan4002/plumbcheck/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/stepan4002/plumbcheck/releases/tag/v1.0.0-rc.1
[0.2.0-preview.5]: https://github.com/stepan4002/plumbcheck/releases/tag/v0.2.0-preview.5
