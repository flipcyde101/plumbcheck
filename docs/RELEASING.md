# Public release checklist

The founder selected `stepan4002/plumbcheck` as the source repository. Preview releases are tagged and published on GitHub Releases with the Windows installer, portable ZIP, checksums, SBOM and Android APK attached; record each in `CHANGELOG.md`. The npm package has not been published. Verify repository visibility separately before a public launch.

## Version 0.2 preview

`release-readiness.json` records release gates. Each gate has a `scope`: `1.0` gates are required, `experimental` and `post-1.0` gates are reported but do not block, and a gate with no scope counts as required. Run `npm run release:check`; a nonzero result means a required gate is still missing reviewable evidence, even when preview builds work. Do not mark signing, cloud integrations, assistant hosts, or actual-device checks verified based on mocks or SDK tests.

Install root dependencies with `npm ci`, then run `npm test`, `npm run test:mcp`, `npm run test:types`, `npm run mobile:build`, and `npm run plugin:build`. Compatibility workspaces need their own `npm ci --prefix compat/mcp-sdk` and `npm ci --prefix compat/typescript`. Invoke `npm run test:local-model` separately with an authorized running Ollama model; ordinary CI never calls paid or local models.

For Windows, install the pinned desktop build dependencies, run `npm run desktop:build`, `npm --prefix desktop run test:exe`, and `npm run sbom`. The Windows workflow also silently installs the generated NSIS package and checks its installed helper. Export SHA-256 checksums for the installer, ZIP, and SBOM. This verifies packaging, not publisher identity: the preview installer is unsigned. Native UI, clean-account install/uninstall, credential persistence, and upgrade checks remain separate.

For Android, build bundled assets before Gradle. CI runs `testDebugUnitTest assembleDebug lintDebug` and uploads a debug-signed APK. The Windows build helper can create a local preview signing key only when `-InitializeSigningKey` is explicitly requested; keep it and its DPAPI-protected password outside Git. For a long-term identity, arrange secure backups and production signing before distribution. See docs/ANDROID_AND_SYNC.md. No APK or plugin build is automatically submitted to a marketplace.

Review `dist/plugin/plumbcheck` before packaging it for a supported host: it contains the bundled control server, manifest, skill, icon, MIT license, and third-party notices. Build/SDK success does not certify an actual Claude or ChatGPT host. Never bundle workspace descriptors, API keys, pairing credentials, local reports, or signing keys.

## Public launch

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
