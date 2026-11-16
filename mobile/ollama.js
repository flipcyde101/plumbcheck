import { createOpenAI } from '@ai-sdk/openai';
import { runModelProject } from '../src/model-runner.js';

export function normalizeOllamaServer(value) {
  const url = new URL(String(value).trim());
  const parts = url.hostname.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) && parts.every(n => n >= 0 && n <= 255);
  const privateHost = ipv4 && (parts[0] === 10 || parts[0] === 127 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS server address without credentials, query parameters, or fragments.');
  if (url.protocol === 'http:' && !privateHost) throw new Error('Unencrypted HTTP is restricted to a private IPv4 address. Use HTTPS for other hosts.');
  if (!['', '/', '/api/tags', '/v1', '/v1/', '/v1/models'].includes(url.pathname)) throw new Error('Enter the Ollama server address, without a custom API path.');
  if (url.protocol === 'http:' && !url.port) url.port = '11434';
  return url.origin;
}

/** Bounded, cancellable native transport. Only the configured Ollama server is
 * available to this bridge; the Android host validates the same constraints. */
export function createNativeModelFetch(bridge, target = globalThis) {
  const pending = new Map();
  target.__plumbcheckModelResponse = result => {
    const request = pending.get(result.id); if (!request) return;
    pending.delete(result.id); request.cleanup();
    if (result.error) request.reject(new Error(result.error));
    else try {
      if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 || typeof result.body !== 'string' || result.body.length > 2000000) throw new Error();
      request.resolve(new Response([204, 205, 304].includes(result.status) ? null : result.body, { status: result.status, headers: { 'Content-Type': result.contentType || 'application/json' } }));
    } catch { request.reject(new Error('The Android bridge returned an invalid or oversized response.')); }
  };
  return (url, options = {}) => new Promise((resolve, reject) => {
    if (!bridge?.requestOllama) { reject(new Error('Model connections require the installed Android app. The browser preview runs offline checks.')); return; }
    if (options.signal?.aborted) { reject(options.signal.reason || new DOMException('Cancelled', 'AbortError')); return; }
    if (pending.size >= 2) { reject(new Error('Wait for the current connection request.')); return; }
    const id = crypto.randomUUID();
    const abort = () => { const request = pending.get(id); if (!request) return; pending.delete(id); request.cleanup(); bridge.cancelOllama(id); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(abort, 185000);
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
    pending.set(id, { resolve, reject, cleanup }); options.signal?.addEventListener('abort', abort, { once: true });
    try { bridge.requestOllama(id, String(url), options.method || 'GET', options.body || ''); }
    catch { pending.delete(id); cleanup(); reject(new Error('The Android connection bridge is unavailable. Reopen the app.')); }
  });
}

export async function discoverOllama(baseURL, transport, signal) {
  const response = await transport(`${normalizeOllamaServer(baseURL)}/api/tags`, { signal });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}. Check the server address.`);
  let data; try { data = await response.json(); } catch { throw new Error('The server did not return an Ollama model list.'); }
  if (!Array.isArray(data.models)) throw new Error('This server did not return Ollama model IDs.');
  return data.models.map(m => m?.name).filter(n => typeof n === 'string' && n.length > 0 && n.length <= 200).slice(0, 1000);
}

export async function runOllama({ contract, task, model, server, transport, signal, onUsage, limits }) {
  const baseURL = normalizeOllamaServer(server);
  if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('Choose an installed model.');
  if (typeof task !== 'string' || !task.trim() || task.length > 12000) throw new Error('Describe the task for the agent (maximum 12000 characters).');
  const selected = createOpenAI({ baseURL: `${baseURL}/v1`, apiKey: 'local', fetch: transport }).chat(model);
  const report = await runModelProject({ project: { contract, task }, model: selected, limits, signal, onUsage });
  signal?.throwIfAborted();
  return report;
}
