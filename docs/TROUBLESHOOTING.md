# Troubleshoot Ollama connections

## Windows cannot verify Ollama

> Ollama could not be verified.

**Likely cause**. Ollama is stopped, or the connection points to the wrong port. In Windows, **Find Ollama on this PC** uses `http://127.0.0.1:11434/v1` by default.

**Fix**. Open Ollama on the same PC or run `ollama serve` if you use the CLI. On that PC, open `http://127.0.0.1:11434/api/tags` to check that the server returns a model list. Substitute your configured port in both addresses if it differs. Then choose **Find models** in PlumbCheck again.

## The installed model list is empty

> Server responded without model IDs. Enter a known model ID manually.

Android shows `Connected. Installed models: (none). Run a scenario to verify tool support.`

**Likely cause**. The connection works, but the server has no local models to list.

**Fix**. On the computer running Ollama, use `ollama ls` to check whether the model you want is installed, even if the list contains other models. If needed, run `ollama pull qwen3.5:4b` to install the tool-capable model used in the Android walkthrough. Run discovery again and select the installed ID including its tag. [Ollama CLI reference](https://docs.ollama.com/cli)

## Android cannot reach Ollama on another device

> Could not reach Ollama. Check the same Wi-Fi, server LAN binding, Windows firewall, and Android local-network permissions.

**Likely cause**. The computer can reach Ollama on loopback, but the phone cannot reach the computer's LAN address.

**Fix**. Put both devices on the same trusted network. In Android, enter the Ollama computer's LAN address and port. For example, use `http://192.168.1.10:11434` if that is the computer's address. On the phone, `127.0.0.1` refers to the phone. If the local model list works on the computer but discovery still fails on the phone, check the LAN binding, firewall scope, and network route in the Android guide. Keep access on the intended private network. [Android connection diagnostics](ANDROID_OLLAMA.md#connection-diagnostics)

## A model answers without calling a tool

> Expected attempted tool order: orders.lookup.

**Likely cause**. A real model run has finished without making all the tool calls the scenario expects. The model may lack tool support or the task may leave the required call unclear. Check **Execution evidence** to see whether any calls were attempted.

**Fix**. Select a model with tool support. Try the [synthetic order lookup scenario](../examples/ollama-mobile/order-check.json) with a task that tells the model to use the provided order lookup tool once for order `ORD-1042` and report the returned status. Run it with **Real model test** on Windows or **Run with Ollama** on Android. The planned-call check and model discovery cannot verify model tool use. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
