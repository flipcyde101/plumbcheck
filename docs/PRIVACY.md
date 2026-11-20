# Privacy policy

This policy covers PlumbCheck: the npm package and CLI, Studio, the MCP servers, the Python adapter, the Windows app, and the experimental Android app and snapshot relay. Effective 20 November 2026.

## Summary

PlumbCheck runs on your computer. It has no telemetry, analytics, crash reporting or account system, and Plumbnote receives nothing from it. Your contracts, fixtures, reports and credentials stay on your device unless you send them somewhere yourself.

## What leaves your device, and when

| Connection | When it happens | What is sent | How to stop it |
| --- | --- | --- | --- |
| Model providers you configure (OpenAI, Anthropic, Google, or a server you enter) | Only when you start a model run, or press "Check / list models" | The test input, the tool definitions and fixture responses for that case, and your API key for that provider | Don't add a model connection. Fixture runs never contact a model. |
| Local model servers (Ollama, LM Studio) | Same as above | Same as above, to `localhost` only | Same as above |
| GitHub Releases API (`api.github.com`), Windows app only | At most once a day while the app is open, to see whether a newer PlumbCheck release exists | A standard HTTPS request with no account, cookies or workspace data. GitHub sees your IP address, as for any web request. | Untick "Check for updates" in the Workspace view. Nothing is downloaded or installed automatically. |
| A snapshot relay you run yourself (experimental) | Only after you pair a device and choose to upload | The project snapshot you select, and its report only if you tick "include report". API keys are never included. | Don't pair a relay. |

PlumbCheck never calls your real tools during replay. When you test your own agent code (`--agent`, the Python adapter), that code runs with your normal permissions and can make its own network requests. PlumbCheck does not isolate or monitor it.

## What is stored on your device

- **Windows app:** projects, run history and reports in `%APPDATA%\PlumbCheck\workspace.json`; update-check preference and last check time in `%APPDATA%\PlumbCheck\settings.json`; API keys in `%APPDATA%\PlumbCheck\credentials.json`, encrypted with Windows DPAPI for your Windows user account. Keys are never sent to the app's web view, never written to reports, and never exported.
- **Studio from the CLI:** projects in `~/.plumbcheck` (or `PLUMBCHECK_HOME`). API keys are held in memory for that session only.
- **Android app (experimental):** projects and evidence in app storage; keys protected by the Android Keystore.
- **Reports** (`report.json`, `report.html`, `junit.xml`) are written only where you ask. Values that look like secrets are masked, but reports contain your fixture data, so review them before sharing.

## Removing your data

Uninstalling the Windows app removes the program but keeps `%APPDATA%\PlumbCheck`, so a reinstall or upgrade keeps your work. Delete that folder to remove all local data and saved credentials. Uninstall from **Settings → Apps → Installed apps → PlumbCheck**, or run `Uninstall PlumbCheck.exe` in the install folder.

## Changes and contact

Changes to this policy are listed in [CHANGELOG.md](../CHANGELOG.md). For questions, open an issue at <https://github.com/stepan4002/plumbcheck/issues>. Report security problems privately as described in [SECURITY.md](../SECURITY.md).
