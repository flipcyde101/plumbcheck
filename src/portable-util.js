/** JSON-only counterpart of node:util comparison for the Android fixture engine.
 * Contracts exclude dates, maps, functions, cyclic data, and class instances. */
export function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => Object.hasOwn(b, k) && isDeepStrictEqual(a[k], b[k]));
}
