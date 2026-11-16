# Improvement backlog

Updated 16 November 2026. This backlog tracks the continuing application-quality goal. Completed increments require authoritative tests and workflow evidence; preview checks do not close external release gates.

| Priority | Work | Evidence / acceptance | State |
| --- | --- | --- | --- |
| P1 | Preserve cross-device execution evidence | Android uploads its actual saved revision and optionally its report; Windows imports contract and report atomically, labels imported provenance, survives restart, and never silently overwrites local edits | Verified in preview.3 (`04907ed`): 189 tests, full CI matrix, both app builds, native imported-evidence viewing and Android upgrade/persistence/refused-upload checks |
| P1 | Preserve historical project contracts | Store immutable contract/task revisions, inspect and restore earlier versions as a new revision, retain exact run inputs, and migrate existing workspaces without inventing lost history | Open: current project revisions count saves but replace earlier contract contents |
| P1 | Make sync setup and recovery usable | Owner pairing/device management, local unpair, clear credential-loss and revoked-device behavior, explicit conflict handling; verify HTTPS Windows/Android round trip | Snapshot relay exists; deployed HTTPS and physical-device checks remain open |
| P1 | Guide a first useful agent test | Create and validate a scenario without authoring a complete JSON document; show a real failure, its fix, evidence and adapter requirements | Open: existing interfaces primarily require JSON editing |
| P1 | Verify actual assistant hosts | Walk through supported Claude and ChatGPT routes with authorized host access; preserve explicit authority for model spending and local execution | Official MCP client checks pass; actual host walkthroughs remain open |
| P1 | Run phone-triggered worker jobs | Scoped pairing, registered job types, idempotent dispatch, offline/reconnect handling, cancellation acknowledgement and immutable results | Planned; snapshot exchange currently does not dispatch execution |
| P1 | Finish distribution and platform verification | Clean-account install/upgrade/uninstall, publisher signing and update strategy, physical Android device, cloud model account, independent security/accessibility review | Seven production gates remain open in release-readiness.json |
| P2 | Expand useful assertions and adapters | JSON Schema outputs, variability assertions, configurable path sanitization, one real framework integration selected with users | Open; preserve exact default tool replay |
| P2 | Improve history, performance and accessibility | Per-project filters/baselines, bounded long histories, keyboard/screen-reader workflows, measured large-suite behavior | Audit and implement after integrity issues |

The 0.2.0-preview.2 baseline has 182 passing local tests, green Windows/Linux CI and Android/Windows builds, and actual Qwen pass/regression evidence on Windows and an Android emulator. The physical-phone LAN connection remains unverified. See [validation](VALIDATION.md), [platform roadmap](PLATFORM_ROADMAP.md), and [release gates](../release-readiness.json).

Latest completed increment: preview.3 preserves cross-device evidence, protects local edits on retry, and labels original report context. The next code priority is immutable historical project revisions; it remains open. Production gates and physical-phone/HTTPS networking remain open.
