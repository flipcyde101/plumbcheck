# Roadmap

The goal is a useful agent testing tool that developers choose repeatedly. Popularity is an outcome to validate, not a release guarantee.

## Windows, Android, AI integrations, and sync

The founder's expanded direction is an independent Windows and Android app, with optional synced projects/results, multiple agent-platform adapters, provider APIs and local models, and plugins that let a user ask Claude or ChatGPT to run tests.

The implementation sequence and acceptance criteria are in [the platform roadmap](docs/PLATFORM_ROADMAP.md). Planned work is distinct from the working alpha below.

| Order | Milestone | Required result |
| --- | --- | --- |
| 1 | Windows `.exe` | Own app window, bundled runtime, packaged MCP test mode, downloadable verified artifact |
| 2 | Claude/ChatGPT testing integrations | An authenticated MCP control server starts real test jobs and returns their evidence |
| 3 | Models and agent platforms | API models, official subscription routes where supported, Ollama/LM Studio, Python/framework adapters |
| 4 | Cross-device sync | Paired Windows/Android devices share versioned contracts, jobs, baselines, and masked reports |
| 5 | Android application | Offline fixture tests plus actual-agent runs on a paired worker, verified on real devices |
| 6 | Public beta / 1.0 | Signed distribution, secure updates, independent usability/security/accessibility checks |

- [ ] M1: Finish and verify the Windows executable (in progress).
- [ ] M2: Separate fixture MCP from the new testing-control MCP; validate host-specific plugins.
- [ ] M3: Add provider, local-model, and officially supported subscription connections; publish a tested adapter matrix.
- [ ] M4: Pair/revoke devices, handle offline edits/conflicts, and dispatch jobs without duplicate execution.
- [ ] M5: Ship a signed Android app with independent fixture testing and explicit remote-runner behavior.
- [ ] M6: Meet the detailed release gates and validate repeat developer use.

The detailed roadmap also includes AI-assisted test drafting, scenario packs, cost/token budgets, baseline review, multi-agent handoff assertions, path-based sanitization, failure simulation, self-hostable sync, and future iOS/macOS/Linux evaluation.

## 0.2 preview — implemented progress

- [x] Windows app workspace with persistent, versioned projects and run history
- [x] Built-in model agent using pinned OpenAI/Anthropic/Google SDK adapters and local/compatible endpoints
- [x] Live Ollama Qwen 3.5:4B pass and deliberate argument regression, with provider-reported usage
- [x] Deadlines, per-case steps/tool calls, run-wide output budget, backend consent, cancellation, and idempotency
- [x] Model execution provenance retained in exported reports; imported evidence remains unauthenticated
- [x] Separate local MCP control bridge and a buildable local plugin, tested with the official SDK
- [x] Standard-library Python MCP replay adapter with swallowed-failure checks
- [x] Android preview build, offline shared-engine parity checks, import/export and Keystore-backed sync credential code
- [x] Self-hosted immutable snapshot relay, expiring single-use pairing, scoped device tokens, revocation, and explicit upload consent
- [x] Release-variant Android APK signed with a private local preview key; build/lint/signature verification
- [ ] Actual Android device walkthrough and native file-picker/Keystore/HTTPS checks
- [ ] Actual assistant-host walkthroughs and authenticated remote-host transport
- [ ] Windows publisher signing, clean-machine checks, and reviewed updates
- [ ] Phone-triggered Windows execution and automatic sync/conflict reconciliation
- [ ] Live cloud-provider account verification, official subscription routes, and independent review

These checks do not mark the full platform milestones complete. `npm run release:check` fails while production gates remain open.

## 0.1 alpha — current foundation

- [x] Offline broken/fixed support-agent scenario
- [x] Exact ordered fixture replay and explicit action policies
- [x] Result equality and forbidden-call assertions
- [x] JavaScript `callTool` adapter and explicit recorder
- [x] Completed, independent recording snapshots with JSON validation
- [x] Canonical `plumbcheck` commands with legacy aliases
- [x] Actual-agent CLI runner with input/output assertions and swallowed-error detection
- [x] Expected/actual evidence for call-order, result, and agent-output failures
- [x] Field-level argument/result/order/output differences in the workbench, CLI, and JUnit
- [x] Minimal MCP 2025-11-25 fixture stdio server
- [x] Fixture-derived tool parameter schemas without literal payload values
- [x] CI reports and assertions over calls observed from MCP clients
- [x] Editable Plumbnote-style workbench
- [x] Search, filters, timeline inspection, standalone HTML report
- [x] Local file/paste contract and report import, contract export, and draft undo
- [x] Read-only saved-report inspection with consistency and resource checks
- [x] Masked JSON and JUnit for CI
- [x] Meaningful regression tests and cross-platform CI configuration
- [x] MIT license and contributor documentation

## Before a public beta

- [ ] Five independent developer walkthroughs and documented unmet needs
- [x] Test official MCP SDK 1.32.2 against the fixture server
- [x] Validate the Windows/Linux Node 22/24 CI matrix on GitHub (initial alpha)
- [x] TypeScript declarations and packed-consumer checks on TypeScript 5.9/7.0
- [x] Add structured expected-versus-actual diffs for failed arguments/results
- [ ] Add schema-backed editor completion and full JSON Schema result assertions
- [ ] Improve recording sanitization with explicit field/path configuration
- [ ] Add a runnable model-backed agent example behind opt-in credentials
- [ ] Include two real framework adapters based on design partner needs
- [ ] Audit arbitrary text/PII handling and externally review artifact import protections
- [ ] Bundle licensed brand fonts and complete accessibility review

## After demonstrated repeat use

- [ ] More protocol revisions and Streamable HTTP via a maintained MCP implementation
- [ ] Python client adapter and pytest integration
- [ ] Compare two saved executions and baseline update review
- [ ] n8n or LangGraph integration selected by user demand
- [ ] Public synthetic regression benchmark with methodology and misses
- [ ] Maintained integration fixtures from community contributors

Hosted collaboration, team history, access control, and managed connectors are possible later commercial extensions. The local runner, fixtures, and reports should remain genuinely useful under MIT.
