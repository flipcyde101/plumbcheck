# Live local-model verification

Verified 15 November 2026 with the user's installed **Ollama / qwen3.5:4b**. The server reported tool and thinking capability. Model digest: `d8b0f5e9760cd1682034f292d7ef72ec46f432149be0df7574bf2d6e92e38c04`.

The opt-in check used the actual AI SDK provider transport and built-in model agent, with a fixture-only order tool:

| Scenario | Observed result | Reported usage |
| --- | --- | --- |
| Correct agent | Model chose `orders.lookup` with `orderId: ORD-1042`; one intercepted call; passed | 763 input / 190 output tokens; 2 model steps |
| Deliberate wrong argument | Model supplied the wrong order ID; `ARGUMENT_MISMATCH` failed the test | 793 input / 323 output tokens; 2 model steps |

These are two observed synthetic scenarios, not a performance benchmark or general claim about model reliability. No live order/email service was attached. Final model output and all provider/model inference remain separate from deterministic fixture replay.

The rebuilt Windows application was also exercised through its native interface: discover/save the Ollama connection, save a one-case project, authorize a model run, and inspect the saved evidence. Qwen chose the expected order lookup and passed; that run reported 767 input / 136 output tokens in two steps. The actual model output, provider/model, contract revision, and read-only report state were visible. [Native application evidence](images/windows-qwen.jpg). These counts describe that one run and may differ on repetition.

To reproduce:

```sh
npm ci
npm run test:local-model
```

The default is `qwen3.5:4b` at `http://127.0.0.1:11434/v1`. `PLUMBCHECK_LOCAL_MODEL`, `PLUMBCHECK_LOCAL_URL`, and `PLUMBCHECK_LOCAL_OUT` override the model, loopback destination, and evidence directory. The script refuses a nonloopback destination. Live tests are not included in ordinary CI and require explicit invocation with a running, tool-capable model.

Outputs include `verification.json`, separate correct/regression HTML/JSON/JUnit evidence, and a private test workspace under `reports/local-model`. The regression is an expected failure; the script itself succeeds only if the correct execution passes and the negative execution records an argument mismatch. Reports use synthetic order data and are ignored by Git by default.

OpenAI, Anthropic, Google, LM Studio, other models, and actual assistant hosts still require their own live validation. They are not certified by this Ollama check.

## Android native connector, 16 November 2026

The 0.2.0-preview.2 APK ran on an Android 36.1 QA emulator, connecting through native Android networking to the actual PC Ollama server. Model discovery returned the installed exact IDs. With `qwen3.5:4b`, the default task and a synthetic one-case contract produced these observed results:

| Scenario | Actual tool decision | Outcome | Reported usage |
| --- | --- | --- | --- |
| Correct order | `orders.lookup`, `orderId: ORD-1042` | Passed, saved revision 1 | 741 input / 181 output tokens, 2 steps |
| Deliberate prompt regression | `orders.lookup`, `orderId: WRONG-ORDER` | `ARGUMENT_MISMATCH`, saved revision 2 | 761 input / 271 output tokens, 2 steps |

Both reports were saved with Android's document picker, copied back as developer QA artifacts, and validated by the Node artifact importer. Their contract hashes differed, their provider/model and limits were retained, and both recorded zero live business-tool calls. Inference took approximately 36 and 32 seconds respectively. These are individual synthetic observations. [Android pass screenshot](images/android-ollama-pass.jpg). Reproduce with [the Android guide](ANDROID_OLLAMA.md) and its two example contracts.

The actual physical phone has not yet passed this walkthrough. Emulator success does not resolve its earlier browser connection failure. Other providers, models, agent frameworks, and assistant hosts require separate verification.
