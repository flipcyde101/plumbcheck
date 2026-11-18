# Security policy

This is an early alpha without a production security assurance or response-time commitment. Report suspected vulnerabilities privately to **hello@plumbnote.com** with the subject **PlumbCheck security**. Do not put exploit details, credentials, or private execution traces in a public issue. This is Plumbnote's publicly listed contact address; a dedicated security channel can be configured before launch.

## Boundaries

ReplaySession has no live client or network fallback. Its guarantees cover calls routed through it. Agent code itself is not sandboxed. Recording through a real client executes its real actions.

`--agent` imports and executes a trusted local JavaScript module, including its top-level imports. Only use code you trust. The frozen replay facade prevents accidental access to host policies or recorded events; it is not a security sandbox. No code modules are loaded through the JSON-only workbench endpoint. Agent-code runs have no timeout or process isolation in this alpha.

The local studio binds only to 127.0.0.1, validates Host and Origin, accepts JSON-only execution requests, limits request bodies to 1 MB, and executes only fixture contracts. Do not expose it through a public tunnel. There is no authentication service or multi-user support.

Approval context is trusted test input. It is not proof that a real human approved an operation. The MCP fixture server uses this same fixture context and exposes no production approval mechanism.

Common credential keys are masked in delivered reports, but free-text secrets and personal data may remain. In-memory SDK reports, raw recorder fixtures, and authored suite files are not automatically sanitized. Review all fixtures and artifacts before committing, uploading, or publishing them. Default `.gitignore` entries exclude reports, recordings, and environment files.

Workbench file/paste imports stay in the browser tab until you explicitly run a planned-call contract on the local server. Imports accept JSON data, not executable modules or HTML. They have byte, nesting, and value-count limits; imported reports are checked for internal consistency, masked for common credential keys, and rendered with escaped text. Reports are not signed or authenticated, and opening one does not rerun it. Contract downloads retain raw fixture values. See [the workbench guide](docs/WORKBENCH.md).

The Windows application loads its bundled UI through a loopback server with an isolated, sandboxed Electron renderer and a limited native save/configuration bridge. It also bundles a separate Node.js console runtime for the MCP fixture server. No system Node.js installation is needed, but this helper runs with the user's ordinary local permissions and is not a sandbox. Desktop builds are currently unsigned; signing and an independent security review remain public-release gates. See [the Windows guide](docs/WINDOWS_APP.md).

Do not run untrusted JavaScript agents without an independent sandbox. JSON suite files cannot execute code through PlumbCheck, but they can consume local resources. Import only reasonably sized, trusted test data.

Contracts may contain regular expressions (`matches` argument matchers and output checks). They run synchronously, so a run timeout cannot interrupt one. Patterns are limited to 200 characters, backreferences and repeated groups that already contain a repetition (such as `(a+)+`) are rejected at validation, and a pattern is never applied to text longer than 20,000 characters. These rules reduce, but do not mathematically rule out, slow backtracking. Treat contracts from untrusted sources, including sync snapshots, with the same care as other imported data.

Declared tool descriptions and schemas (`tools`) are shown to the model and MCP clients as written. Do not put secrets or expected answers in them.

Only the current alpha is maintained. No external security audit has been performed.
