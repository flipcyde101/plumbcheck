# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes: security fixes are released as 1.x patch or minor versions |
| 1.0.0 release candidates | Until 1.0.0 is published |
| 0.2.0 previews and older | No. Upgrade to the latest 1.x |

Experimental surfaces (the Android app, `plumbcheck-sync`, the assistant-host plugin bundle; see [docs/STABILITY.md](docs/STABILITY.md)) receive fixes on a best-effort basis.

## Reporting a vulnerability

Report privately, never in a public issue, discussion or pull request:

- **Preferred:** GitHub private vulnerability reporting at <https://github.com/stepan4002/plumbcheck/security/advisories/new>.
- **Or email** hello@plumbnote.com with the subject **PlumbCheck security**.

Include the version, your platform, and the smallest reproduction you can, using synthetic data. Do not send real credentials, personal data or private agent traces.

We aim to acknowledge a report within **one working day** (Monday to Friday, CET), the same first-reply target as [SUPPORT.md](SUPPORT.md), and to tell you within three working days whether we confirm it and what we plan. Fixes are released as soon as they are ready and credited in the release notes unless you ask us not to. These are targets, not guarantees.

## Boundaries

ReplaySession has no live client or network fallback. Its guarantees cover calls routed through it. Agent code itself is not sandboxed. Recording through a real client executes its real actions.

`--agent` imports and executes a trusted local JavaScript module, including its top-level imports. Only use code you trust. The frozen replay facade prevents accidental access to host policies or recorded events; it is not a security sandbox. No code modules are loaded through the JSON-only workbench endpoint. Agent-code runs have no timeout or process isolation.

The local studio binds only to 127.0.0.1, validates Host and Origin, accepts JSON-only execution requests, limits request bodies to 1 MB, and executes only fixture contracts. Do not expose it through a public tunnel. There is no authentication service or multi-user support.

Approval context is trusted test input. It is not proof that a real human approved an operation. The MCP fixture server uses this same fixture context and exposes no production approval mechanism.

Common credential keys are masked in delivered reports, but free-text secrets and personal data may remain. In-memory SDK reports, raw recorder fixtures, and authored suite files are not automatically sanitized. Review all fixtures and artifacts before committing, uploading, or publishing them. Default `.gitignore` entries exclude reports, recordings, and environment files.

Workbench file/paste imports stay in the browser tab until you explicitly run a planned-call contract on the local server. Imports accept JSON data, not executable modules or HTML. They have byte, nesting, and value-count limits; imported reports are checked for internal consistency, masked for common credential keys, and rendered with escaped text. Reports are not signed or authenticated, and opening one does not rerun it. Contract downloads retain raw fixture values. See [the workbench guide](docs/WORKBENCH.md).

The Windows application loads its bundled UI through a loopback server with an isolated, sandboxed Electron renderer and a limited native save/configuration bridge. It also bundles a separate Node.js console runtime for the MCP fixture server. No system Node.js installation is needed, but this helper runs with the user's ordinary local permissions and is not a sandbox. From 1.0.0, the Windows app and installer are Authenticode-signed with a certificate issued to SignPath Foundation (see the code signing policy in [README.md](README.md#code-signing-policy)); release candidates may be unsigned. The app checks GitHub for a newer release at most once a day and never downloads or installs anything itself; see [docs/PRIVACY.md](docs/PRIVACY.md). See [the Windows guide](docs/WINDOWS_APP.md).

Do not run untrusted JavaScript agents without an independent sandbox. JSON suite files cannot execute code through PlumbCheck, but they can consume local resources. Import only reasonably sized, trusted test data.

Contracts may contain patterns (`matches` argument matchers and output checks). They never reach JavaScript's backtracking `RegExp`: PlumbCheck compiles them with its own linear-time engine (at most 200 characters, repetition counts up to 100, bounded program size), so matching time grows linearly with the text and cannot hang a run. Text longer than 20,000 characters is not pattern-checked. Backreferences and lookarounds are rejected.

Declared tool descriptions and schemas (`tools`) are shown to the model and MCP clients as written. Do not put secrets or expected answers in them.

## Audit status

No independent security audit has been performed yet; one is planned after 1.0. Dependencies are checked by `npm audit` in CI and kept current by Dependabot, and every GitHub Action is pinned to a commit.
