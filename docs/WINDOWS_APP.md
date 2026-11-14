# Windows application

The Windows x64 build includes an `.exe` installer and a portable ZIP with its own runtime and a native app window. End users do not need to install Node.js, npm, or a separate browser. It includes the synthetic examples, contract editor, local fixture runner, and report viewer.

## Get and use the app

Download the **PlumbCheck-Windows-x64** artifact from a successful [Windows desktop workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/windows-desktop.yml). Extract the downloaded artifact, then open `PlumbCheck-0.1.0-alpha.1-Windows-x64-Setup.exe` to install the app for your user account. Alternatively, extract the included Windows ZIP into a permanent folder and run its `PlumbCheck.exe`; keep its supporting files together. `SHA256SUMS.txt` identifies the files produced by that run. GitHub artifact access follows the repository's visibility and account permissions; artifacts are retained for 30 days.

This is an **unsigned early alpha**, not a signed public release. Code signing, clean-machine validation, and an update channel are still release gates. Do not bypass an operating-system security block; inspect the source/build provenance or use a reviewed build.

The app starts with deliberate regressions. Inspect one, choose **Try the fixed agent**, then use **Contract** to edit/import a scenario. Use **Open JSON** to inspect a saved execution. The workbench runs locally; there are no model API calls, accounts, or telemetry in this demo.

## Test your MCP agent

In the Windows app:

1. Open **Contract**, load or write a planned-call fixture contract, and review its data.
2. Under **Your agent chooses. PlumbCheck checks.**, select a case and choose **Save contract & create MCP config**.
3. Choose where to save the JSON contract. The app displays generic MCP client configuration and the report directory.
4. Copy the configuration into your MCP client, adapting its surrounding configuration key if needed. Disable unrelated live tool servers for this test.
5. Give your agent the task for that case. Its MCP calls are checked against the saved fixtures and policies.
6. Close the MCP connection cleanly. Open the generated `report.json` in PlumbCheck to inspect the observed execution.

The configuration refers to the saved file. Editor changes do not silently update it; save again when you want a changed test. Fixture responses are returned as authored and may be forwarded to your agent's model provider. Review them first.

The app includes a dedicated console runtime for the fixture MCP server. Generated configuration points to it; no system Node.js installation is required. An equivalent command for an app installed in `C:/Apps/PlumbCheck` is:

```powershell
& 'C:/Apps/PlumbCheck/resources/mcp-runtime/node.exe' 'C:/Apps/PlumbCheck/resources/mcp-runtime/bin/plumbcheck-mcp.js' 'C:/Tests/order.json' 'Approved customer update' --out 'C:/Tests/reports/run-1'
```

Use the generated configuration rather than pointing an MCP client at the GUI executable or Setup installer. The console helper receives stdin/stdout pipes and has no app window. JSON-RPC is the only stdout content; audit events go to stderr. Reports finalize at clean stdin EOF. Exit codes are 0 for pass, 1 for a failed contract, and 2 for invalid setup/report-writing errors. See [MCP behavior and boundaries](MCP.md).

This exposes fixture tools to the agent being tested. A future control plugin will let an assistant ask PlumbCheck to start/manage tests; that is a separate milestone in [the platform roadmap](PLATFORM_ROADMAP.md).

## Build from source

For desktop development, use **Node.js 24** and Windows x64:

```powershell
npm ci --prefix desktop --ignore-scripts
node desktop/node_modules/electron/install.js
npm run desktop:dev

# Produce the .exe installer and portable ZIP in dist/windows
npm run desktop:build
npm --prefix desktop run test:exe
```

Build tools are isolated in `desktop/package.json` and its lockfile. The core CLI still has zero third-party runtime dependencies and can run directly with Node.js. The desktop distribution bundles Electron and the build's Node.js console runtime; upstream Electron/Chromium/Node license notices remain in the distribution. Staging copies the Node license from its installation or fetches the matching official release license when absent.

`desktop/scripts/stage.mjs` copies only application source, web assets, synthetic examples, documentation/license files, and the desktop shell into an ignored staging folder. Reports, recordings, credentials, dependency trees, Git metadata, and the founder's research attachment are not bundled.

## Desktop boundaries

The app serves its bundled UI on a random loopback-only port. Renderer Node integration is disabled, context isolation and sandboxing are enabled, IPC checks the originating window/frame, and native save operations use a file dialog. Browser permission requests and unrelated network destinations are denied. Navigation is restricted; known documentation links open in the system browser. Packaged Electron fuses disable its Node environment/inspector launch routes and require the application archive with integrity validation. The separate console helper runs the fixed MCP server script in the user's security context; it is not an isolated worker.

These measures do not sandbox an arbitrary agent program or constitute a security audit. The app does not load agent JavaScript modules through its editor. Direct model/provider connections, mobile execution, sync, and automatic framework adapters are planned rather than present in this alpha.
