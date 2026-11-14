import { createContractValidator } from './contract.js';
import { isDeepStrictEqual } from 'node:util';

export const same = isDeepStrictEqual;
export const own = (object, key) => Object.hasOwn(object, key);
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const validateSuite = createContractValidator();

/** Own-property-only dotted paths; the empty path selects the whole result. */
export function readPath(value, path) {
  if (path === '') return { found: true, value };
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object' || !own(value, part)) return { found: false };
    value = value[part];
  }
  return { found: true, value };
}
