const sensitive = /^(authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key)$/i;

/** Key-based best-effort masking, NOT a PII or arbitrary-text secret detector. */
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sensitive.test(key) ? '[REDACTED]' : redact(child)]));
  }
  return value;
}
