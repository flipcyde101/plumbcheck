# Contributing

Thanks for helping make automations easier to test.

Use Node.js 22 or later and run `npm ci` first. Run `npm test`, `npm run check`, `npm run check:agent`, and `npm run example:sdk`. Open the private launch link printed by `npm start` to verify saved workspaces. Keep that link and `bridge.json` private. `npm run demo` and `npm run demo:agent` deliberately exit with 1; those are demonstrated regressions, not a broken installation.

Keep changes focused. Include the problem, a small reproduction, the changed behavior, and relevant validation. Use synthetic fixtures. Do not submit API keys, personal data, company traces, or recordings you lack permission to share.

For fixture MCP changes, install the isolated SDK test dependencies with `npm ci --prefix compat/mcp-sdk --ignore-scripts`, then run `npm run test:mcp`. That compatibility package is test-only. The new control/model integrations separately use the root's pinned runtime dependencies.

For public API or packaging changes, run `npm ci --prefix compat/typescript --ignore-scripts` and `npm run test:types`. This tests the packed package in a separate consumer using both compiler versions and module-resolution modes documented in `docs/TYPESCRIPT.md`.

New integrations must state their supported protocol/framework versions and limitations. Safety-relevant changes need tests proving that failure paths stay closed. UI changes should preserve keyboard access, visible focus, responsive layout, and offline reports.

Run `npm run mobile:build` and `npm run plugin:build` when changing those surfaces. Android native builds use the checked-in Gradle wrapper. `npm run test:local-model` is opt-in, requires a running loopback model server, and must not be added to ordinary account-free CI. Actual host/device/provider support needs its own evidence. `npm run release:check` must remain nonzero until every required gate (scope `1.0`, or no scope) has been verified with recorded evidence. Experimental and post-1.0 gates are reported but do not block. Do not change a gate's status or scope simply to obtain a green release command; a scope change needs a dated reason in CHANGELOG.md.

New here? Start with an issue labelled [good first issue](https://github.com/stepan4002/plumbcheck/labels/good%20first%20issue). Good initial contributions include clearer diagnostics, integration examples, TypeScript declarations, accessibility improvements, and documented real-world test scenarios. Check ROADMAP.md and discuss a large change before committing to it.

Contributions are made under the repository's MIT license. Please interact respectfully and give useful, specific feedback. Contact hello@plumbnote.com if a conversation needs maintainer attention.
