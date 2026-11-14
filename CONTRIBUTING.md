# Contributing

Thanks for helping make automations easier to test.

Use Node.js 22 or later. Run `npm test`, `npm run check`, `npm run check:agent`, and `npm run example:sdk`. Open `npm start` to verify the workbench. `npm run demo` and `npm run demo:agent` deliberately exit with 1; those are demonstrated regressions, not a broken installation.

Keep changes focused. Include the problem, a small reproduction, the changed behavior, and relevant validation. Use synthetic fixtures. Do not submit API keys, personal data, company traces, or recordings you lack permission to share.

For MCP changes, install the isolated SDK test dependencies with `npm ci --prefix compat/mcp-sdk --ignore-scripts`, then run `npm run test:mcp`. Those packages are test dependencies only and are not part of the core runtime or published package.

For public API or packaging changes, run `npm ci --prefix compat/typescript --ignore-scripts` and `npm run test:types`. This tests the packed package in a separate consumer using both compiler versions and module-resolution modes documented in `docs/TYPESCRIPT.md`.

New integrations must state their supported protocol/framework versions and limitations. Safety-relevant changes need tests proving that failure paths stay closed. UI changes should preserve keyboard access, visible focus, responsive layout, and offline reports.

Good initial contributions include clearer diagnostics, integration examples, TypeScript declarations, accessibility improvements, and documented real-world test scenarios. Check ROADMAP.md and discuss a large change before committing to it.

Contributions are made under the repository's MIT license. Please interact respectfully and give useful, specific feedback. Contact hello@plumbnote.com if a conversation needs maintainer attention.
