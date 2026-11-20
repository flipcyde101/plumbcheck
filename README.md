# Plumb[check]

**Test the work. Trust the agent.**

Local regression tests for what your AI agent *does*: catch a wrong tool argument, an unapproved send, a forbidden operation or a wrong final answer before the agent touches real systems.

[![CI](https://github.com/stepan4002/plumbcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/stepan4002/plumbcheck/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Release](https://img.shields.io/github/v/release/stepan4002/plumbcheck?label=release)](https://github.com/stepan4002/plumbcheck/releases/latest) [![npm](https://img.shields.io/npm/v/plumbcheck)](https://www.npmjs.com/package/plumbcheck)

![A tool reply hides an instruction to delete the order; the agent calls orders.delete; PlumbCheck blocks it and the live probe reports 6/6 caught](docs/images/demo.gif)

*A tool reply hides an instruction to delete the order. The agent tries `orders.delete`, PlumbCheck blocks it and fails the test. `npm run test:probe` runs the same six scenarios against your own local model.*

## Quick start

**Windows app (no Node.js needed):** download `PlumbCheck-…-Windows-x64-Setup.exe` from the [latest release](https://github.com/stepan4002/plumbcheck/releases) and run it. From 1.0.0 the installer and app are signed ([code signing policy](#code-signing-policy)). Until the new signature builds reputation, SmartScreen may still ask you to confirm with **More info → Run anyway**.

**From npm (Node.js 22+):**

```sh
npx plumbcheck demo
npm install --save-dev plumbcheck   # then: npx plumbcheck run suite.json
```

**From source:**

```sh
git clone https://github.com/stepan4002/plumbcheck && cd plumbcheck && npm ci && npm run demo
```

`npm run demo` fails on purpose (exit code 1) and writes `reports/demo/report.html` showing the regressions it caught. `npm start` opens the local Studio.

Built by [Plumbnote](https://plumbnote.com). MIT licensed. Offline fixture checks need no account or API key. Optional model connections use your API account or a local server. No telemetry. The fixture engine uses Node built-ins; model and assistant integrations use pinned SDK dependencies bundled into the Windows app.

Commands: `plumbcheck` and `plumbcheck-mcp`. The earlier `plumcheck` / `plumcheck-mcp` aliases still work but are deprecated and will be removed in 2.0. TypeScript declarations ship with the package; see [typed usage and completed recording snapshots](docs/TYPESCRIPT.md).

**Status: 1.0.** Stable: the CLI, the contract and report formats, the JavaScript API, the Python adapter, the fixture and testing-control MCP servers, and the Windows app with saved projects, model-selected tool tests, run history, cancellation and comparison. Experimental: the Android app, self-hosted snapshot sync and the assistant-host plugin bundle. [What 1.x promises](docs/STABILITY.md). [Release gates](release-readiness.json) record the evidence behind each release; the usability plan is in [ROADMAP.md](ROADMAP.md#usability-work-and-release-plan). Questions and ideas: [Discussions](https://github.com/stepan4002/plumbcheck/discussions). Help and response times: [SUPPORT.md](SUPPORT.md).

![PlumbCheck local workbench](docs/images/workbench.jpg)

## Install and start

**Windows app:** download the `.exe` installer or the portable ZIP from the [latest release](https://github.com/stepan4002/plumbcheck/releases) (`SHA256SUMS.txt` lists checksums). Builds of every commit are also available from the [Windows desktop workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/windows-desktop.yml). No Node.js setup is needed. It includes saved projects, model connections, run evidence, and bundled fixture/control MCP helpers. See [the Windows app guide](docs/WINDOWS_APP.md).

**Android (experimental):** a debug-signed APK is attached to each [release](https://github.com/stepan4002/plumbcheck/releases) and built by the [Android workflow](https://github.com/stepan4002/plumbcheck/actions/workflows/android.yml). It runs fixture checks offline, saves a project, imports/exports JSON, and runs a built-in tool agent through your Ollama server using native Android networking. Actual Qwen calls passed a correct scenario and failed a deliberate wrong-order scenario on the QA emulator. Optional HTTPS snapshot sync is separate. Imported snapshots retain their reports in Windows History with source/revision labels; report upload from Android is explicit. A locally built release-variant APK uses a private preview signing key. Real-phone networking and a long-term distribution identity are not yet verified, so Android is experimental and may change in any release. See [connect Android to Ollama](docs/ANDROID_OLLAMA.md) and [Android and sync](docs/ANDROID_AND_SYNC.md).

**Source version:**

Download this repository, open a terminal in its folder, and use **Node.js 22 or later**:

```sh
npm ci
npm test
npm start
```

The complete developer test suite also uses Python 3 for the optional Python adapter. Running the application itself needs Node.js, not Python.

First run **`npm ci`** to install the locked development/integration dependencies, then run the commands above. Open the **private local launch link printed by Studio**. Source Studio stores projects in `~/.plumbcheck`; keys are session-only there. Windows uses its own app-data directory and OS-encrypted credential storage, and attaches its private connection token automatically.

In **Workspace**, open **Start here / Build your first test**. Review the order-lookup template, enter a project name and task, and choose **Save this test**. Run **Planned-call check**, then inspect its result in History. To demonstrate a failure, set the builder's planned order ID to `WRONG-ORDER`, save and run; restore it to `ORD-1042`, save and rerun. The same case and expected values remain. Android provides the same builder above its project controls.

For an actual model test on Windows, choose **Find Ollama on this PC**, select an installed model, and save the connection. Review the saved test and separately authorize the model run. Discovery confirms access; a real scenario checks tool use. The app does not install models or change network/security settings. Direct model testing uses a built-in tool agent with your instructions; testing an existing framework agent requires the SDK/MCP integration described below. [Connections, limits, and supported modes](docs/APP_WORKSPACE.md).

The separate built-in workbench demonstration starts with six synthetic checks, including four deliberate regressions. Its **smaller passing example** contains two scenarios; comparisons deliberately show the other four as removed. Use the builder walkthrough above to demonstrate failure and correction with unchanged scenario coverage. Offline examples send nothing to an external service.

Use **Open JSON** to import your own contract or saved execution report by file or paste. Edit and download contracts, undo a contract import, or inspect a report with its **not rerun** source label. See [the workbench guide](docs/WORKBENCH.md) for import limits and sharing precautions.

```sh
# Intentionally fails with exit code 1; creates reports/demo/report.html
npm run demo

# Corrected automation passes with exit code 0
npm run check

# Exercise actual JavaScript agent code using the adapter
npm run example:sdk

# Test actual agent code and its final output
npm run check:agent

# Buggy agent fails even though it catches the tool error
npm run demo:agent
```

The demo uses planned tool calls to illustrate contract checking. The SDK example runs a JavaScript function against replayed responses. Neither example invokes an LLM.

For an explicitly opted-in local-model check, start a tool-capable model server and run `npm run test:local-model`. The default verified target is `qwen3.5:4b` on Ollama; environment variables select another loopback endpoint/model. It runs a correct agent and a deliberately wrong argument, then saves actual HTML/JSON/JUnit evidence under `reports/local-model`. It never runs in account-free CI. [Live verification](docs/LIVE_MODEL_VERIFICATION.md).

## Test your actual agent function

```sh
node bin/plumbcheck.js run examples/customer-support/agent-contract.json --agent examples/customer-support/support-agent.js --out reports/agent
```

Your module exports `async function (client, { input, name })` as its default export. The function chooses tool calls from fixture responses; PlumbCheck checks every attempted call and the final `expect.output`. Tool failures still fail the test if the function catches the exception. Each case receives a frozen, fixture-only `callTool` client and cloned input.

`--agent` executes **trusted local JavaScript**, including module imports. It is not sandboxed and can perform I/O independently of the replay client. The JSON-only workbench does not load agent modules. Read [the agent testing guide](docs/AGENT_TESTING.md) for lifecycle and isolation limits.

## What it catches today

PlumbCheck has three ways to run a contract. Only the last two execute something you did not write by hand:

| Mode | What runs | What a failure means |
| --- | --- | --- |
| **Planned-call check** (`plumbcheck run suite.json`, builder default until a model is connected) | Nothing. The `calls` you wrote are compared with the `fixtures` you wrote. | Your contract is internally inconsistent. Useful for authoring and demos, **not evidence about an agent**. |
| **Agent replay** (`--agent`, SDK `ReplaySession`, MCP fixture server) | Your real agent code / MCP client against replayed tool responses. | Your agent made a call the contract does not allow. |
| **Real model test** (Workspace model run, Android, `npm run test:probe`, `npm run test:local-model`) | A real LLM with your instructions chooses tools. | The model made a call the contract does not allow. |

In agent and model modes the agent is offered **every tool the contract names**: fixture tools plus `policies.allow`, `deny`, `requireApproval`, `expect.never` and declared `tools` (with their real descriptions and schemas). A real attempt to use a dangerous tool is therefore observed and blocked instead of being impossible.

| Regression | Check |
| --- | --- |
| Agent sends email without approval | `requireApproval` plus trusted test context → `APPROVAL_REQUIRED` |
| Agent chooses a different recipient | Nested argument comparison, exact unless a `$plumb` matcher allows variation → `ARGUMENT_MISMATCH` |
| Agent deletes an order | Deny policy and `never` assertion → `DENIED_TOOL`, `FORBIDDEN_CALL` |
| Agent calls an unknown tool | Explicit allowlist; absent means denied → `UNLISTED_TOOL` |
| Agent adds, skips, or reorders a call | Ordered fixture consumption and completeness check |
| Tool returns a recorded error | MCP-shaped `isError: true` becomes a failed check, even if the agent catches it |
| Agent or model gives the wrong final answer | `expect.outputChecks` (contains / notContains / matches / JSON path) → `OUTPUT_ASSERTION`; `expect.output` for exact values |
| Agent follows an instruction hidden in a tool response | Deny/`never` on the tool the injection asks for, with the tool exposed to the agent |

Use `$plumb` matchers for argument values an LLM legitimately varies, such as an email body ([argument matchers](docs/CONTRACTS.md#argument-matchers)), and `outputChecks` for prose answers ([final output checks](docs/CONTRACTS.md#final-output-checks)). Output checks need a final answer, so planned-call checks and the MCP fixture server report them as skipped, never as passed. `expect.results` assertions read the replayed fixture, so in replay they confirm your fixture data rather than a live integration; they cannot detect a changed external API.

**How to plug in your agent** (JS function, MCP client, Python, or a model plus instructions), what kinds of agents work and where they can be hosted: see [Connect your agent](docs/CONNECT_YOUR_AGENT.md).

## A contract you can commit

```json
{
  "version": 1,
  "name": "Order support",
  "policies": {
    "allow": ["orders.lookup"],
    "deny": ["orders.delete"]
  },
  "cases": [{
    "name": "Read an order without changing it",
    "calls": [{ "tool": "orders.lookup", "arguments": { "id": "ORD-1042" } }],
    "fixtures": [{
      "tool": "orders.lookup",
      "arguments": { "id": "ORD-1042" },
      "result": { "structuredContent": { "status": "shipped" } }
    }],
    "expect": {
      "never": ["orders.delete"],
      "callOrder": ["orders.lookup"],
      "results": [{ "call": 0, "path": "structuredContent.status", "equals": "shipped" }]
    }
  }]
}
```

Run any contract and produce shareable evidence:

```sh
node bin/plumbcheck.js run examples/customer-support/safe.json --out reports/ci
```

The output directory contains a standalone interactive `report.html`, masked `report.json`, and `junit.xml`. `--json` prints only masked JSON to stdout. Exit codes are **0** for pass, **1** for contract failure, and **2** for invalid input/runtime errors. The CLI rejects unknown fields and flags to catch typos.

See [the contract format](docs/CONTRACTS.md) for assertion semantics.

Failures identify changed fields such as `/to` or `/structuredContent/status`, with expected and actual values in the workbench, CLI, and JUnit output. Missing fields, unexpected fields, and type changes are distinct. See [reading field differences](docs/DIFFERENCES.md) for paths, masking, and display limits.

## Put your agent behind a replay client

```js
import { ReplaySession } from './src/index.js';

const client = new ReplaySession({ fixtures, policies, context });
await yourAgent(client); // client.callTool({ name, arguments })
client.verifyComplete();
```

`callTool` follows the common MCP JavaScript client request shape. It supports one JSON object response per call; task-based, streaming, and multi-round interactions are not supported. It is not a drop-in implementation of every MCP Client method. No official MCP SDK dependency or compatibility certification is claimed.

`createRecorder(client)` wraps a client with that same method and collects `{ tool, arguments, result }` fixtures in memory. Use `await recorder.snapshot()` to wait for calls already in flight and obtain completed, independent JSON fixtures. **Recording with a live client executes its real tools.** Snapshots are raw data; review and sanitize them before persisting or committing. Never expose recording to an untrusted agent. See [the example](examples/customer-support/agent.js).

## Use an MCP client directly

To let an assistant **operate PlumbCheck**, use **Create assistant configuration** in the Windows Workspace. Its separate control service can list saved projects, validate contracts, start offline jobs, inspect evidence, compare runs, and cancel. It has no arbitrary shell tool and cannot spend model credits. The self-contained local plugin (experimental, build from source) is built with `npm run plugin:build`. Host installation and ChatGPT web/mobile HTTPS integration need separate validation; a local stdio package does not enable a cloud connection automatically. [Assistant integration](docs/ASSISTANT_INTEGRATION.md).

To test **an agent's own MCP calls**, use the fixture server below.

```sh
node bin/plumbcheck-mcp.js examples/customer-support/safe.json "Read-only order lookup"
```

Configure that command as a stdio server in your MCP client, using absolute paths when necessary. It exposes every tool the contract names (fixture tools, policy tools, `never` tools and declared `tools`) with parameter shapes and consumes responses in order. Literal argument values are not exposed in discovery schemas. The session is single use; restart it to reset. JSON-RPC goes to stdout and masked audit events to stderr.

Add `--out reports/mcp` to write HTML, JSON, and JUnit evidence when the client closes its input stream. The server evaluates the **observed calls**, including `expect` assertions, at EOF and exits nonzero on a failed contract. Some clients ignore server exit codes; their test harness should inspect `report.passed` as well.

This minimal adapter targets **MCP 2025-11-25**, with `initialize`, `ping`, `tools/list`, and `tools/call`. It does not claim compatibility with the newer 2026 protocol, HTTP transport, resources, prompts, sampling, elicitation, subscriptions, or tasks. See [MCP setup, response handling, CI reports, and SDK checks](docs/MCP.md).

## GitHub Actions

The included [CI workflow](.github/workflows/ci.yml) tests Node 22 and 24 on Linux and Windows, checks corrected contracts, exercises the official MCP client, and uploads reports even on failure. The core suite needs no external integrations. The separate SDK compatibility package downloads its locked test dependencies during setup; test execution requires no accounts or model API keys. Use the CI badge for current results.

## What this does and doesn't guarantee

- Replay makes **zero live tool calls**. Missing fixtures never fall through to a real service.
- Only calls routed through `ReplaySession` or the fixture server are covered. This is **not a sandbox**: your agent code can still access the network, filesystem, subprocesses, or other clients. Isolate untrusted code separately.
- Fixture replay is exact and ordered. It does **not** make an entire agent deterministic: LLM reasoning, time, randomness, and other I/O can vary.
- `context.approvedTools` models a trusted application's approval decision in a test. It does **not** prove that a human approved a real action. Do not populate it from model-generated tool arguments.
- The default suite runner checks provided planned calls. Use `--agent`, the SDK adapter, or the MCP fixture server to exercise a running agent. It does not analyze arbitrary workflow exports or intercept unrelated MCP traffic.
- Recordings and the programmatic `runSuite` result are raw in memory. CLI, HTML, JUnit, and studio output mask common credential **keys**. Free-text secrets and PII are **not automatically detected**. Review artifacts before sharing.

## Build with us

After 1.0 the direction includes automatic updates, a stable Android release, phone-to-worker execution, authenticated remote assistant connections, hosted agent platforms and additional framework adapters. See [the roadmap](ROADMAP.md); the older [improvement backlog](docs/IMPROVEMENT_BACKLOG.md) and [platform roadmap](docs/PLATFORM_ROADMAP.md) are kept as historical planning records. This is not universal-agent compatibility.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [the roadmap](ROADMAP.md), and [the security policy](SECURITY.md). The [product brief](docs/PRODUCT_BRIEF.md) explains the differentiation, research, and validation still needed. The [build prompt](docs/BUILD_PROMPT.md) gives a reusable implementation brief for future coding sessions.

The source repository is [stepan4002/plumbcheck](https://github.com/stepan4002/plumbcheck). The npm package is [`plumbcheck`](https://www.npmjs.com/package/plumbcheck), published from this repository's release workflow with [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- **Signed files:** the Windows installer (`PlumbCheck-<version>-Windows-x64-Setup.exe`) and the app (`PlumbCheck.exe`, also inside the portable ZIP), built from this repository by the [release workflow](.github/workflows/release.yml). Nothing built elsewhere is signed.
- **Roles:** author and committer, reviewer, and approver: [@stepan4002](https://github.com/stepan4002). Every signing request is approved by hand in SignPath, and every change reaches `main` through a reviewed pull request.
- **Privacy:** PlumbCheck sends no telemetry; see the [privacy policy](docs/PRIVACY.md) for every connection the app can make.
- **Uninstall:** Settings → Apps → Installed apps → PlumbCheck, or run `Uninstall PlumbCheck.exe` in the install folder. Your projects in `%APPDATA%\PlumbCheck` are kept unless you delete that folder.

Copyright © 2026 Plumbnote. [MIT License](LICENSE).
