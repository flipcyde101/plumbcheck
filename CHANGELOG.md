# Changelog

All notable changes to PlumbCheck are listed here. The project follows [Semantic Versioning](https://semver.org/); `0.x` preview releases may change contracts between versions.

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

[0.2.0-preview.5]: https://github.com/stepan4002/plumbcheck/releases/tag/v0.2.0-preview.5
