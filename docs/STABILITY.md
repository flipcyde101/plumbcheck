# Stability policy

PlumbCheck follows [Semantic Versioning](https://semver.org/) from 1.0.0. This page lists exactly what 1.x promises. Anything not listed here can change in a minor release.

## Stable in 1.x

A breaking change to anything in this section happens only in a new major version (2.0), and only after the deprecation period below.

| Surface | What is frozen | Reference |
| --- | --- | --- |
| Contract format v1 | Every key documented in the contract reference, its type and meaning. `version` stays `1`. Unknown keys keep failing closed. New optional keys may be added in a minor release. | [CONTRACTS.md](CONTRACTS.md), [`schema/contract-v1.schema.json`](../schema/contract-v1.schema.json) |
| Report format v1 | `report.json` fields: `version`, `name`, `description`, `mode`, `scope`, `createdAt`, `durationMs`, `passed`, `summary`, `cases[]` with `events[]` and `failures[]`, optional `execution`. Failure `code` values are stable; their human-readable `message` text is not. New optional fields may be added. | [CONTRACTS.md#failure-codes](CONTRACTS.md#failure-codes) |
| CLI | `plumbcheck run <suite.json> [--agent <module>] [--out <dir>] [--json]`, `plumbcheck demo [--out <dir>]`, `plumbcheck studio [--port <n>]`, `--help`, `--version`; `plumbcheck-mcp <suite.json> "<case>" [--out <dir>]`; `plumbcheck-control [--connect <bridge.json>]`; the `PLUMBCHECK_HOME` environment variable. | `plumbcheck --help` |
| Exit codes | `0` all checks passed, `1` a contract check failed, `2` invalid input or a runtime error. This holds for `plumbcheck`, `plumbcheck-mcp` and `plumbcheck-control`. | |
| JavaScript API | Every export declared in `src/index.d.ts`: `runSuite`, `runAgentSuite`, `validateSuite`, `ReplaySession`, `createRecorder`, `ContractError`, `redact`, `toHtml`, `toJUnit` and the exported types. | [TYPESCRIPT.md](TYPESCRIPT.md) |
| Python adapter | `ReplayClient(contract, case, *, node=None, server=None, out=None, timeout=30)`, `call_tool(name, arguments=None)`, `close(*, check=True)`, the context-manager form, `report`, `AsyncReplayClient` and `ContractFailed`. It ships in the npm package as `adapters/python/plumbcheck.py` and can be vendored as a single file. | [adapters/python/README.md](../adapters/python/README.md) |
| MCP control server | Tool names `plumbcheck_list_projects`, `plumbcheck_validate_contract`, `plumbcheck_run_suite`, `plumbcheck_get_run`, `plumbcheck_cancel_run`, `plumbcheck_compare_runs` and their argument shapes. | [MCP.md](MCP.md) |
| MCP fixture server | It exposes the contract's tool names unchanged, answers `initialize`, `ping`, `tools/list` and `tools/call` over stdio, and writes evidence to `--out`. | [MCP.md](MCP.md) |
| Windows app data | User data stays in `%APPDATA%\PlumbCheck` (app ID `com.plumbnote.plumbcheck`), so upgrades keep workspaces, connections and run history. | [WINDOWS_APP.md](WINDOWS_APP.md) |

"Stable" covers behaviour that is documented. Fixing behaviour that contradicts the documentation is a bug fix, not a breaking change. A fix that makes a previously passing contract fail because it closes a safety hole (a check that silently passed when it should have failed) is also allowed in a minor release and is called out in the changelog.

## Experimental

These ship with 1.0 but carry no compatibility promise. They can change or be removed in any release, and they are labelled "experimental" in the UI, help text and docs.

- The Android app and its offline/LAN Ollama features.
- `plumbcheck-sync` (the snapshot relay) and the snapshot format.
- The assistant-host plugin bundle in `plugins/plumbcheck` (build from source; not certified by any host).
- The Anthropic and Google providers for model runs (not yet verified against a live account).

## Deprecation

1. A deprecated stable feature keeps working for at least one minor release and prints a warning (or is marked in the docs where it has no output) before it is removed.
2. Removal happens only in the next major version.
3. Every deprecation and removal is listed in [CHANGELOG.md](../CHANGELOG.md).

Deprecated now, removed in 2.0: the command aliases `plumcheck` and `plumcheck-mcp`. Use `plumbcheck` and `plumbcheck-mcp`.

## `$schema` in contracts

Contracts may carry an optional `$schema` key that points to the published schema. PlumbCheck 1.0+ ignores it. PlumbCheck 0.2 rejects unknown keys, so omit it if a 0.2 reader must accept the contract.

## Supported runtimes

Node.js 22 and later (CI runs 22 and 24 on Linux and Windows), Python 3.9+ for the adapter, Windows 10/11 x64 for the desktop app. Dropping a Node.js major that is still maintained upstream is a breaking change.
