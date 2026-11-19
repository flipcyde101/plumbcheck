import { object } from './validation.js';

function alternatives(schemas) {
  const unique = [...new Map(schemas.map(schema => [JSON.stringify(schema), schema])).values()];
  return unique.length === 1 ? unique[0] : { anyOf: unique };
}

/** Matchers describe a type, never their pattern or expected value. */
function matcherShape(matcher) {
  switch (matcher.$plumb) {
    case 'contains': case 'matches': return { type: 'string' };
    case 'range': return { type: 'number' };
    case 'oneOf': return alternatives(matcher.values.map(value => shape(value, true)));
    case 'literal': return shape(matcher.value, true);
    default: return {};
  }
}

/** Infer shapes, never literal argument values (which may contain credentials).
 * `raw` treats matcher-like objects as plain data (inside literal / oneOf values). */
function shape(value, raw = false) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', ...(value.length ? { items: alternatives(value.map(item => shape(item, raw))) } : {}) };
  if (object(value) && !raw && Object.hasOwn(value, '$plumb')) return matcherShape(value);
  if (object(value)) return {
    type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child, raw)])),
    required: Object.keys(value), additionalProperties: false,
  };
  return { type: typeof value };
}

export function fixtureInputSchema(fixtures) {
  const inferred = alternatives(fixtures.map(f => shape(f.arguments)));
  return { type: 'object', ...inferred };
}

/** Ordinary JSON fixtures also work over the MCP result envelope. Existing MCP
 * content arrays are preserved, including intentionally faulty test responses. */
export function mcpResult(value) {
  if (object(value) && Array.isArray(value.content)) return value;
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(object(value) ? { structuredContent: value } : {}) };
}
