# Public release checklist

The founder selected `stepan4002/plumbcheck` as the source repository. The npm package and a tagged public release have not been published. Verify repository visibility separately before a public launch.

- [ ] Confirm the GitHub organization/repository name and npm name availability. Local `name` is not a reservation.
- [ ] Review the README and remove claims not supported by tests or real use.
- [ ] Run the CI matrix on Node 22/24 and Linux/Windows. Check the actual job logs.
- [ ] Run `npm test`, `npm run check`, `npm run example:sdk`, and the intentionally failing demo.
- [ ] Verify workbench editing, fixed/regression switching, filters, invalid JSON, and standalone report behavior.
- [ ] Review `npm pack --dry-run` contents for credentials, artifacts, and missing files.
- [ ] Confirm MIT ownership notice and review any new dependencies/assets for license compatibility.
- [ ] Confirm the security reporting inbox and maintainers are prepared to respond.
- [ ] Use only synthetic fixtures in the public demo; inspect artifacts for secrets and PII.
- [ ] Enable the intended GitHub community and vulnerability-reporting features.
- [ ] Record a short reproducible demo of a real bug and its fix.
- [ ] Publish a tagged prerelease and a factual compatibility table.
- [ ] Collect independent usage feedback before a large launch campaign.

Suggested repository description: **Local regression tests for AI agent tool calls. Fixture replay, action contracts, and CI evidence.**

Suggested topics: `agent-testing`, `mcp`, `regression-testing`, `ai-agents`, `developer-tools`, `automation`, `record-replay`.
