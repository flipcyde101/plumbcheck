export function syncURL(input) {
  const url = new URL(input);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('Use an HTTPS relay URL, or localhost for development.');
  return url.href.replace(/\/$/, '');
}
export async function syncRequest(url, path, { method = 'GET', token, body, fetch: transport = fetch } = {}) {
  const response = await transport(syncURL(url) + path, { method, credentials: 'omit', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(20000) });
  const reader = response.body.getReader(); let bytes = 0; const chunks = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2_100_000) throw new Error('Sync response exceeds the size limit.'); chunks.push(value); } }
  finally { await reader.cancel(); }
  const combined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  const result = JSON.parse(new TextDecoder().decode(combined));
  if (!response.ok) throw new Error(result.error || 'Sync request failed.');
  return result;
}
