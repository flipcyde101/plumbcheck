# Android and snapshot sync

Updated 16 November 2026 for 0.2.0-preview.2. Android is a preview, not a verified production mobile release.

## Android application

The native Android host bundles the fixture engine and interface. It runs synthetic/planned-call tests without network access, saves a local project, retains the latest result, and imports/exports JSON with Android file pickers. It also runs a built-in tool agent through an explicitly selected Ollama server, using the same bounded AI SDK loop as Windows. Imported reports are inspected rather than rerun. External agent code still needs a supported agent runner. See [Android Ollama setup and boundaries](ANDROID_OLLAMA.md).

The browser bundle is built from the same runner/replay/evaluation modules as Node. A JSON-only comparator replaces `node:util` in that bundle; parity tests cover the shipped pass/fail corpus and relevant JSON comparisons. The app uses a fixed bundled HTTPS origin, denies remote navigation/file privileges, renders data as text, and grants no camera/microphone permissions. The WebView keeps mixed content disabled and its connection policy restricted to HTTPS. A separate native bridge permits only model discovery and chat completions at the configured Ollama origin, refuses redirects, and bounds response size and time. The manifest allows cleartext for this bridge, but native validation restricts HTTP to private IPv4 literals after explicit consent. HTTPS uses normal certificate validation. Optional sync still requires HTTPS; its device token is encrypted with Android Keystore.

Build prerequisites are Node.js 22+, Java 21+ supported by the pinned Gradle version, and Android SDK 36. The Gradle wrapper pins its distribution checksum.

```sh
npm ci
npm run mobile:build
cd android
./gradlew testDebugUnitTest assembleDebug lintDebug
```

The Android workflow uploads a debug-signed preview APK and lint report. For Windows builds, `scripts/build-android.ps1` supports a release variant. `-Release -InitializeSigningKey` explicitly creates a local preview key outside the repository under `%LOCALAPPDATA%/PlumbCheck/Signing`, protecting its password with Windows DPAPI. It does not create a verified publisher identity or submit to Google Play. Back up the key/password securely if keeping that app identity; a lost signing key can prevent future upgrades.

A production keystore can instead be supplied directly to Gradle through `PLUMBCHECK_ANDROID_KEYSTORE`, `PLUMBCHECK_ANDROID_STORE_PASSWORD`, `PLUMBCHECK_ANDROID_KEY_PASSWORD`, and `PLUMBCHECK_ANDROID_KEY_ALIAS`. Do not place these values or private keys in Git. Actual-device upgrades, file pickers, Keystore recovery, battery behavior, and accessibility remain validation gates.

An Android 36.1 emulator walkthrough verified offline regression/corrected runs, local project saving, document-picker export/import, and saved-project retention across an APK update. The exported report passed the Node artifact validator. The Android host now applies system-bar/cutout/keyboard insets on enforced edge-to-edge versions. This is emulator evidence; it does not close real-device or HTTPS pairing gates.

## Self-hosted snapshot relay

The relay is optional and single-owner. It shares immutable project versions and optional masked reports; it does not run arbitrary code, relay model keys, or dispatch jobs to a Windows worker.

```sh
node bin/plumbcheck-sync.js --data /private/path/plumbcheck-relay
```

It binds **127.0.0.1:4181** and creates an owner credential file privately in that directory. Keep it outside the repository and away from shared/synced folders. Provision a reviewed HTTPS reverse proxy before connecting another device. The phone refuses plain-HTTP relay pairing; localhost HTTP exists for development/integration checks only. No hosted service is created by installing the app.

Using a private owner-side client, authorize `POST /v1/pairings` with the owner bearer token. It returns a cryptographically random, single-use code expiring after five minutes. Do not expose the owner token in a URL or prompt. Enter the HTTPS relay URL and that temporary code in each app's optional Sync panel. Device tokens are separate from the owner credential.

1. On Windows, save a project, review its raw fixture content, and explicitly authorize uploading a snapshot. Including the latest masked report is optional.
2. On Android, pair, refresh snapshots, and open a version. Review/save it locally and run its fixture tests independently.
3. Upload a new phone snapshot when ready; refresh/import it on Windows as a new local project.

Uploads preserve earlier versions. Imports create a local copy; simultaneous edits are retained as separate snapshots instead of silently overwriting each other. Android can undo the draft replaced by a sync import. This is explicit snapshot exchange, not automatic background reconciliation.

Owner endpoints list devices and revoke a device at `POST /v1/devices/{deviceId}/revoke`. A revoked token loses snapshot access. Tokens are hashed on the relay, and Android-origin CORS still requires device authorization. The relay has request/pairing/storage limits. Protect its private directory with OS permissions, encrypted storage/backups, and your retention policy: project fixture data itself is stored as JSON and is not end-to-end encrypted.

The local integration check covers unauthorized access, pairing-code reuse, consent, upload/list/import, preservation of local edits, a second device, and revocation. Production HTTPS hosting and real phone-to-desktop walkthroughs are not implied by that check. Phone-triggered Windows agent jobs, automatic conflict merging, push notifications, and public remote assistant access remain roadmap work.
