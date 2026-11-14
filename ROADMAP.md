# Roadmap

The goal is a useful agent testing tool that developers choose repeatedly. Popularity is an outcome to validate, not a release guarantee.

## 0.1 alpha — current foundation

- [x] Offline broken/fixed support-agent scenario
- [x] Exact ordered fixture replay and explicit action policies
- [x] Result equality and forbidden-call assertions
- [x] JavaScript `callTool` adapter and explicit recorder
- [x] Actual-agent CLI runner with input/output assertions and swallowed-error detection
- [x] Expected/actual evidence for call-order, result, and agent-output failures
- [x] Minimal MCP 2025-11-25 fixture stdio server
- [x] Editable Plumbnote-style workbench
- [x] Search, filters, timeline inspection, standalone HTML report
- [x] Masked JSON and JUnit for CI
- [x] Meaningful regression tests and cross-platform CI configuration
- [x] MIT license and contributor documentation

## Before a public beta

- [ ] Five independent developer walkthroughs and documented unmet needs
- [ ] Test official MCP SDK clients against the fixture server
- [ ] Validate the configured Windows/Linux CI matrix on GitHub
- [ ] Add TypeScript declarations and consumer type checks
- [ ] Add structured expected-versus-actual diffs for failed arguments/results
- [ ] Add schema-backed editor completion and full JSON Schema result assertions
- [ ] Improve recording sanitization with explicit field/path configuration
- [ ] Add a runnable model-backed agent example behind opt-in credentials
- [ ] Include two real framework adapters based on design partner needs
- [ ] Audit arbitrary text/PII handling and imported artifact size limits
- [ ] Bundle licensed brand fonts and complete accessibility review

## After demonstrated repeat use

- [ ] More protocol revisions and Streamable HTTP via a maintained MCP implementation
- [ ] Python client adapter and pytest integration
- [ ] Compare two saved executions and baseline update review
- [ ] n8n or LangGraph integration selected by user demand
- [ ] Public synthetic regression benchmark with methodology and misses
- [ ] Maintained integration fixtures from community contributors

Hosted collaboration, team history, access control, and managed connectors are possible later commercial extensions. The local runner, fixtures, and reports should remain genuinely useful under MIT.
