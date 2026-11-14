# PlumbCheck: decision and product brief

Date: 14 November 2026. Source: founder request, supplied open-source strategy, and a focused check of the primary sources linked below.

## The decision

Build a small, local testing tool for business-side agent actions. The product should let an engineer demonstrate a dangerous regression, understand why it failed, and keep the check in CI without accounts or paid model calls.

Plumbnote's [public website](https://plumbnote.com/) describes an AI and automation studio and shows AI automation work. That supports the positioning, but it is not independent evidence of reliability, user demand, or product adoption. Use a synthetic order-support scenario to demonstrate engineering capabilities without disclosing client data.

## The situation

The supplied strategy is useful direction, not verified market evidence. Do not reuse its star counts, cited research percentages, market ratings, or implied forecasts in release copy. No star-growth probability can be derived from the document.

[Promptfoo](https://github.com/promptfoo/promptfoo) already describes prompt/agent/RAG testing and CI. [Chronicle](https://github.com/theagentplane/chronicle) explicitly describes recording agent decisions and replaying production failures as regression tests. Record-and-replay is therefore not sufficient differentiation. No exhaustive competitor review has been completed.

Our proposed distinction is a short route from a **business action mistake** to an **action contract with inspectable evidence**. The core examples are wrong recipients, missing approval, forbidden deletion, unexpected call order, and changed integration responses. Validate the usefulness and setup experience with five engineers who already test production agents before making a large launch investment.

## Initial audience and promise

AI platform engineers, automation developers, and reliability engineers who can introduce a local CLI into an existing repository. Promise: test supported tool calls against explicit contracts before deployment. Avoid claims of universal agent safety, deterministic whole-agent replay, enterprise endorsement, or comprehensive MCP compatibility.

## Architecture chosen

- Native Node.js ES modules and the built-in test runner; zero runtime dependencies keeps the demo reproducible offline after download.
- Strict JSON contracts with ordered fixtures and exact nested argument equality.
- A `callTool` adapter lets JavaScript agents use either a live MCP-shaped client or replay transport. Recording is explicit and separate.
- Minimal fixture-only stdio server, pinned to [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) and [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). Current [2026-07-28 transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports) have changed protocol semantics. Newer-version support requires an explicit adapter and compatibility tests, not an untested version claim.
- Local workbench plus standalone HTML, masked JSON, and JUnit output. Nothing requires hosting.

## Plumbnote design system

Observed on the live site: paper `#f4f1e9`, ink `#0a0a0a`, electric blue `#3024ff`, bright pink bracket accents, acid-lime stickers, black borders, hard shadows, oversized heavy headings, and monospace labels. The website uses Space Grotesk and Archivo Black. This alpha uses local font stacks with those names and system fallbacks; no fonts are downloaded or redistributed. Licensed font bundling is a future polish item.

The workbench carries the same bracket wordmark, paper surface, direct copy, and strong typography while keeping the evidence area readable. It is a developer utility, so decorative motion does not interrupt inspection.

## What is working

CLI runner; nested argument matching; explicit policies; trusted approval fixtures; result and agent-output assertions; completed recorder snapshots; actual-agent runner; fixture-only MCP stdio adapter and official client checks; typed package exports; editable local workbench; file/paste contract and report imports; draft undo and contract export; case search and filtering; field-level failure differences; interactive standalone reports; JSON and JUnit; local HTTP boundary checks; credential-key masking; automated tests; verified cross-platform CI; MIT license; contributor and release documentation.

## Validation and launch gates

1. Have five independent engineers compare this workflow with their existing approach. Record setup time, actual regression caught, and reasons they would not use it.
2. Add at least two real agent integrations with sanitized public examples. Test against official MCP clients and more protocol revisions before expanding compatibility claims.
3. Exercise Windows and Linux CI on supported Node releases, audit artifact handling, and review dependency licenses whenever adding packages.
4. Verify the repository owner, package name, security reporting process, and maintainer capacity. Publish only tested claims and a reproducible demo.
5. Launch first through a technical demo and documentation; then consider Show HN, Product Hunt, ecosystem directories, and tutorials. Prepare original, channel-appropriate material. Do not solicit artificial stars or votes.

Measure independent repeat use, teams keeping checks in CI, contributor participation, time to first useful failure, and maintenance load. Stars are visibility evidence, not proof of business value. The project has no verified adoption yet.

MIT is the founder-selected starting license. The original implementation currently has no third-party runtime dependencies; review any future dependencies or bundled assets separately. This is a project decision, not a legal opinion.
