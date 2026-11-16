# Assistant testing control

PlumbCheck has two distinct MCP roles:

- The fixture server supplies simulated tools to the agent being tested.
- The control server lets an assistant operate the running PlumbCheck app.

Do not replace a production MCP configuration wholesale. Create a separate test connection using reviewed synthetic fixtures. The app's configuration generator only displays configuration; it does not edit Claude, ChatGPT, Codex, or another client's settings.

## Control connection

Open **Workspace → Create assistant configuration** in the Windows app. Copy the displayed command into a compatible local MCP host. It uses the app's bundled console runtime and `plumbcheck-control.js`, so no system Node installation is required. Keep the app open while using it.

Source Studio can use:

```sh
node bin/plumbcheck-control.js --connect /absolute/path/to/.plumbcheck/bridge.json
```

The descriptor exists only while the app or Studio is running; a clean shutdown removes it. It contains a rotating local capability token and loopback URL. Keep it private; do not paste its contents into a prompt, commit it, sync it, or expose Studio to the network. The generated client configuration contains its file path, not its token. The helper reloads it per call so an app restart can rotate the port/token.

| Tool | Capability |
| --- | --- |
| `plumbcheck_list_projects` | Saved project IDs/revisions, without credentials or raw fixtures |
| `plumbcheck_validate_contract` | Validate a draft without saving/running |
| `plumbcheck_run_suite` | Start offline fixture checks for an existing revision with an idempotency key |
| `plumbcheck_get_run` | Read actual status and masked evidence |
| `plumbcheck_compare_runs` | Compare completed jobs from the same project, including removed cases |
| `plumbcheck_cancel_run` | Request cancellation of a queued/running job |

There is no shell execution, module-path import, connection editing, or model-credit spending tool. Direct model runs require the app's separate authorization path. A job's queued/running status is not evidence of a pass.

Example request: “List my PlumbCheck projects, run revision 2 of Customer Support, and explain any wrong-recipient failure.” The host chooses a project from actual discovery, starts the job, and polls its run ID. Raw project names/results remain data, not instructions.

## Portable local plugin

`npm run plugin:build` creates `dist/plugin/plumbcheck` with an Agent Plugins 1.0 manifest, local MCP configuration, bundled control server, and workflow skill. This portable package requires Node.js 22+. The Windows app's generated configuration instead includes its own runtime. Set `PLUMBCHECK_BRIDGE` when the local workspace uses a nondefault path.

The official MCP client test covers discovery, listing, actual job execution, idempotency, report inspection, and rejection of an arbitrary-command field. The bundled plugin entry is also tested with that client. No plugin is installed into the user's account automatically, and no directory submission is implied.

Claude/ChatGPT/Codex host-specific setup, eligible plans, permission prompts, local plugin support, and remote HTTPS transports differ. Actual host walkthroughs remain release gates. This stdio package is not a hosted ChatGPT web/mobile connector and does not include OAuth or a subscription-token bridge.
