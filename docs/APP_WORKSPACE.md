# Application workspace

Updated 16 November 2026. Current channel: 0.2 preview.

The Windows app is an installed Electron application with its runtime included. Its interface is served on a random loopback port inside its own window. The browser Studio is also available for source development. End users do not need a web server, browser, npm, or Node.js installation.

## First useful test

For a recorded hands-on example with screenshots, see [the native Windows walkthrough](NATIVE_WALKTHROUGH.md).

1. Open Workspace → **Start here / Build your first test**. Review the order or ticket template, name the project and describe the task. Enter tool arguments and simulated response fields using text, number or boolean values. Dots create nested fields. Save with **Save this test**.
2. Run **Planned-call check**. Open the completed run in History and inspect its intercepted calls and field differences. The planned call is authored by you; this mode does not invoke a model.
3. In the builder, change a planned argument to `WRONG-ORDER` while leaving the expected value unchanged. Save and run to see `ARGUMENT_MISMATCH`. Restore the correct planned value, save and rerun. While that builder project stays open, these saves update the same project revision; comparison shows failure → pass for the same case.
4. Choose **Find Ollama on this PC**, select an installed model and save its connection. This only checks the server and lists models; it does not download models or prove tool support. Separately authorize sending your saved scenario to the selected model, then run it. The model chooses calls; PlumbCheck supplies simulated tool responses and evaluates what happened. You can also configure a provider API through the connection form.

The builder currently handles one-tool scenarios with up to 20 argument and 20 response fields, eight nested field levels and a 1 MB generated-contract limit. A checked approval option supplies a trusted *test fixture* approval; it does not approve any real-world action. Advanced multi-tool/agent contracts remain available through the Contract editor and SDK. Starting a different builder project replaces the draft only after confirmation when needed. Android has the same builder, but currently retains one phone project rather than the Windows project's full collection.

The separate legacy six-scenario demonstration has four deliberate failures. Its smaller passing example contains two scenarios; comparison correctly reports removed coverage. It is labeled as a built-in example rather than your saved agent's execution.

Saving a project captures its contract and instructions together. Running uses the saved revision, not unsaved editor text. A revision check prevents stale saves/runs. Model mode removes the planned `calls` list before execution; those calls are not supplied to the model as expected answers.

## Supported routes

| Route | Actual behavior | Verification boundary |
| --- | --- | --- |
| Offline JSON | Checks planned tool calls against fixtures and policies | Core, desktop helper, and browser/native workspace checks |
| Built-in model agent | Uses the selected model and project instructions to choose fixture tools | Actual Qwen 3.5:4B via Ollama; SDK-backed simulated-model tests |
| JavaScript SDK/CLI | Runs an explicitly supplied trusted agent callback | Actual callback and swallowed-error regression tests |
| Python adapter | Synchronous/async Python code calls a fixture MCP subprocess | Standard-library integration check; tool-call evidence only |
| External MCP agent | Agent connects to a selected case's fixture tools | Official MCP SDK interoperability; individual hosts need their own walkthrough |
| Assistant control | Assistant starts saved offline jobs and inspects their results | Official SDK plus real stdio bridge; no model spending or arbitrary code |

Named provider adapters use pinned AI SDK packages for OpenAI, Anthropic, and Google. Ollama, LM Studio, and custom compatible endpoints use the provider's chat-compatible path. Constructing an adapter and passing simulated-model checks does not prove a live cloud account/model or every local model supports tool calls.

A chat subscription does not automatically supply an API key. Official subscription sign-in and cloud-host integration remain separate roadmap work. Never paste session cookies or another app's login token into the API-key field.

## Limits and provenance

Each job records the project revision, contract hash, provider/model, request ID, timestamps, limits, status, and masked evidence. Repeating the same request ID returns the same job; reusing it for changed inputs/limits is rejected. On restart, unfinished jobs become **interrupted** and are not silently executed again.

The app supports four active jobs, 100 projects, 20 connections, and 500 visible history entries. A separate 10,000-entry request ledger preserves duplicate-execution protection after history is removed; archive the workspace before starting a new one when that ledger fills. Requests/contracts/evidence have size limits. Workspace commits flush a temporary file before replacing the saved state. Storage failures cannot be reported as successful test runs.

Run deadlines are 1–300 seconds, model steps 1–30 per case, tool calls at most 100 per case, and requested output 64–16,000 tokens per generation. A run-wide output budget defaults to 10,000 tokens. Generation limits are reduced to its remaining budget. If usage is missing, the requested generation allowance is counted conservatively; incomplete provider counts are labeled. Unknown/invalid model tool calls and exceeded limits prevent a passing report even if the SDK would otherwise recover. A provider can violate a requested token cap; the app detects that after the response and stops subsequent work. These limits are not a guaranteed currency ceiling, and input tokens also have a cost on paid providers.

Cancellation aborts the model request and preserves a cancelled job. It does not reverse work already performed by a provider. Only simulated fixture tools are attached to this built-in model loop. Imported arbitrary JavaScript/Python programs are not executed through the app UI and are not sandboxed by the SDK.

## Local storage and credentials

Windows stores the workspace under `%APPDATA%/PlumbCheck`. Source Studio defaults to `~/.plumbcheck`; `PLUMBCHECK_HOME` overrides its directory. One process may own a workspace at a time. Preserve that directory when upgrading. Project/history JSON contains fixture data, so treat backups as private.

Saved-workspace APIs require a private capability token as well as loopback/origin checks. Electron attaches the token in its dedicated session. Source Studio prints a private launch URL; its fragment is stored in that browser tab's session storage and removed from the address bar. Open that link when starting or restarting Studio. Public root HTML does not disclose the token. The older stateless synthetic examples/fixture-run endpoint remains separate from saved data and model access.

Windows credentials use Electron's current asynchronous OS-encryption API and a separate `credentials.json`. Keys never enter project exports or history. If OS encryption is unavailable, the app remains useful offline and keeps any newly entered keys only in the current session. Source Studio is session-only too. Changing a provider/destination never transfers a saved credential to the new destination. Removing a connection deletes its current saved key.

Credential masking is key-based; arbitrary free-text PII/secrets still require review. Import checks establish consistency rather than report authenticity. The app currently offers explicit exports rather than a cloud account or automatic backup service.
