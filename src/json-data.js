/** Copy plain JSON without invoking toJSON or silently dropping invalid values. */
export function copyJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new TypeError('Agent output must contain only finite JSON data without cycles.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('Agent output objects must be plain JSON objects.');
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Agent output must be JSON data without symbol keys.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return Array.from(value, item => copyJson(item, ancestors));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item, ancestors)]));
  } finally { ancestors.delete(value); }
}
