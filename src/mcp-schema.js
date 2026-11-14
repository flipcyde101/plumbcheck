import { object } from './validation.js';

function alternatives(schemas) {
  const unique = [...new Map(schemas.map(schema => [JSON.stringify(schema), schema])).values()];
  return unique.length === 1 ? unique[0] : { anyOf: unique };
}

/** Infer shapes, never literal argument values (which may contain credentials). */
function shape(value) {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', ...(value.length ? { items: alternatives(value.map(shape)) } : {}) };
  if (object(value)) return {
    type: 'object', properties: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)])),
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
