# Connect Android to Ollama

> **Experimental.** This surface ships with PlumbCheck 1.0 but has no compatibility promise and can change in any release. See [STABILITY.md](STABILITY.md#experimental).

Available in **0.2.0-preview.2**. Install the Android APK, then use **Connect Ollama** inside PlumbCheck. The interface is bundled in the application. A hosted website is not required.

## First model test

1. Start Ollama on your computer with a tool-capable model installed. This preview has been checked with `qwen3.5:4b`.
2. Connect the phone and computer to the same trusted network. Ollama must listen on the computer's LAN address, and the firewall must allow the intended local connection. Follow [Ollama's network configuration](https://docs.ollama.com/faq#how-do-i-configure-ollama-server). Do not expose an unauthenticated model server to the public Internet.
3. Enter the computer's server address, for example `http://192.168.1.10:11434`. Use your computer's actual IPv4 address; `127.0.0.1` on a phone means the phone itself. Pasting an address ending in `/api/tags` or `/v1` also works; the app normalizes it.
4. For local HTTP, authorize the unencrypted connection on that trusted network. Choose **Find models**. Select the exact installed model ID, including its tag.
5. Import [the synthetic order contract](../examples/ollama-mobile/order-check.json), or review your own contract. The model task defaults to completing each scenario with the provided tools.
6. Review and authorize sending the scenario and fixture responses to that server. Choose **Run with Ollama** and keep the app open. The current draft is saved as a project revision.
7. Inspect the result and **Execution evidence**. **Export report** saves JSON through Android's document picker. It includes provider/model, contract revision/hash, limits, and reported token usage.

The [deliberate wrong-order example](../examples/ollama-mobile/wrong-order.json) asks the model to use `WRONG-ORDER`, while the fixture expects `ORD-1042`. Run it with **Run with Ollama** to demonstrate an argument regression. Its planned calls are correct, so the offline button does not exercise that deliberate prompt error. Model choices can vary between runs.

## What executes

Android runs PlumbCheck's built-in AI SDK tool loop. Ollama supplies the model reasoning; PlumbCheck intercepts the model-selected tool calls and supplies fixture responses. No live order/email service is attached. This does not automatically connect an existing Ollama agent framework, arbitrary MCP subprocess, or a Windows/Python program.

Limits are 180 seconds per run, four model steps per case, 1,024 output tokens per step, and 4,000 output tokens across the run. Input tokens are separate and reported when available. Cancellation or leaving the app interrupts inference and does not save a new passing report. An interrupted run may still leave the server doing brief cleanup; this is not a promise of immediate model unload.

Server address and model ID are saved locally. The two consent checkboxes reset when the interface reloads. No cloud API key is stored by this connector. Optional snapshot sync is separate and needs an HTTPS relay; it does not relay inference or automatically keep these devices in sync.

## Connection diagnostics

**Network details** reports Android version, active transport, and target SDK. The app targets SDK 36. Android documents implicit local-network access for apps targeting below 37; targeting 37 will require the new runtime permission. A browser has its own permissions and networking behavior. See [Android local-network protection](https://developer.android.com/privacy-and-security/local-network-permission).

If discovery fails, check the current computer IP, Ollama LAN binding, firewall scope, phone Wi-Fi/VPN route, and router client isolation. A successful request on the computer alone does not prove the phone can reach it. Test port `11434` unless you deliberately configured another port; an earlier temporary diagnostic listener is not a permanent app endpoint.

The native bridge independently restricts requests to the authorized origin and two endpoints: `GET /api/tags` and `POST /v1/chat/completions`. It follows no redirects. HTTP requires a private IPv4 literal and explicit consent; HTTPS requires a normally trusted certificate. Requests and responses are bounded, with cancellation and controlled error messages. The WebView retains its own HTTPS/mixed-content restrictions.

## Verification boundary

An Android 36.1 QA emulator discovered the actual installed Ollama models, ran Qwen successfully, and caught a deliberate `ARGUMENT_MISMATCH`. Both reports exported through the native picker and passed the Node report validator. [Observed model evidence](LIVE_MODEL_VERIFICATION.md) and [Android screenshot](images/android-ollama-pass.jpg).

The user's physical phone previously failed to reach the same PC from two browsers. This native connector has **not yet been verified on that phone**, and emulator success does not establish that its network path is fixed. Real-device networking, background/battery behavior, upgrades, accessibility, and HTTPS/Keystore sync remain release gates.
