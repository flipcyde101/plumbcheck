# Releasing

Releases are cut from `stepan4002/plumbcheck` by [the release workflow](../.github/workflows/release.yml): a `v*` tag builds and tests everything, signs the Windows files when SignPath is enabled, drafts a GitHub release with the installer, portable ZIP, checksums, SBOM and the experimental Android APK, and publishes the npm package with provenance. A maintainer reviews and publishes the draft. Record every release in `CHANGELOG.md`.

## Cutting a release

1. **Bump the version** on a branch: `npm run version:set -- 1.2.3` (or `1.2.3-rc.1`). It writes `package.json` and both lock files, `desktop/package.json`, `src/version.js`, `plugins/plumbcheck/plugin.json`, the Python adapter and the Android `versionName`/`versionCode` (`major*10000 + minor*100 + patch`; pre-releases share their base code). `test/version.test.js` fails if any copy disagrees.
2. **Changelog:** add a `## [1.2.3] - YYYY-MM-DD` section and its link reference to `CHANGELOG.md`. The release notes are taken from that section; the release fails if it is missing or empty.
3. **Verify locally** (see below), then **dry-run the workflow** on the branch: `gh workflow run release.yml --ref <branch> -f dry_run=true`. Manual runs never create a release or publish; they build, test and list the files.
4. **Merge** the pull request after CI is green, then **tag** `main`: `git tag v1.2.3 && git push origin v1.2.3`. The tag must equal `v` plus the `package.json` version.
5. The workflow runs CI, the Windows build with its upgrade-path test, and Android. For a stable version it also requires `npm run release:check` to pass.
6. **Signing** (when `vars.SIGNPATH_ENABLED` is `true`): approve **two** requests in SignPath, first the app (`PlumbCheck.exe`), then the installer that the workflow rebuilds around the signed app. Each waits up to an hour. A stable release without signed files fails; a pre-release may be unsigned.
7. The workflow computes `SHA256SUMS.txt` over the final files and **drafts** the GitHub release (marked pre-release when the version contains `-`). Review the draft and publish it. Re-running the workflow for the same tag replaces the files of a release that is still a draft; once a release is published its files are never replaced, so cut a new version instead.
8. **npm** (when `vars.NPM_TRUSTED_PUBLISHING` is `true`): the `npm` job publishes with provenance through OIDC, using `--tag next` for pre-releases. It skips a version that is already on npm, so re-runs are safe.

### One-time setup

- **SignPath Foundation:** create the project with artifact configurations `app` and `installer` from [`.github/signpath/`](../.github/signpath/), then add the repository secret `SIGNPATH_API_TOKEN` and the variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_POLICY_SLUG` and `SIGNPATH_ENABLED=true`. The `windows-authenticode` gate needs evidence from a signed build, so sign a release candidate before cutting a stable version.
- **npm:** the first version has to be published by hand (`npm publish --tag next` after `npm login` with 2FA), because a trusted publisher can only be added to an existing package. Then on npmjs.com add the trusted publisher (repository `stepan4002/plumbcheck`, workflow `release.yml`, environment `npm`), set publishing access to *Require two-factor authentication and disallow tokens*, and set the repository variable `NPM_TRUSTED_PUBLISHING=true`.
- **Known limit:** the NSIS uninstaller inside the installer is not signed by this flow.

## Gates and verification

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
