/** Key-based best-effort masking, NOT a PII or arbitrary-text secret detector. */
export function redact(value) {
  const sensitive = /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key)$/i;
  function walk(item) {
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, sensitive.test(key) ? '[REDACTED]' : walk(child)]));
    return item;
  }
  return walk(value);
}
