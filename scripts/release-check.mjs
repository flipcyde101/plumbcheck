// Usage: node scripts/release-check.mjs [release-readiness.json]
// Exit 0 only when every required gate is verified. A gate is required when its scope is
// "1.0" or missing (fail closed). "experimental" and "post-1.0" gates are reported, never blocking.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = process.argv[2] ? resolve(process.argv[2]) : new URL('../release-readiness.json', import.meta.url);
// A Map, not an object literal: a scope such as "constructor" must not match an inherited property.
const nonBlocking = new Map([['experimental', 'EXPERIMENTAL'], ['post-1.0', 'POST-1.0']]);

let gate;
try {
  gate = JSON.parse(await readFile(file, 'utf8'));
  if (gate?.version !== 1 || !Array.isArray(gate.required) || !gate.required.length) throw new Error('expected { version: 1, required: [ at least one gate ] }');
  const ids = new Set();
  for (const [index, item] of gate.required.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !item.id || typeof item.status !== 'string') throw new Error(`gate ${index} needs a string id and status`);
    if (ids.has(item.id)) throw new Error(`gate "${item.id}" is listed twice`);
    ids.add(item.id);
  }
} catch (error) {
  console.error(`Release check cannot read its gates: ${error.message}`);
  process.exit(2);
}

const open = [];
for (const item of gate.required) {
  const detail = item.evidence || item.reason || '(no evidence or reason recorded)';
  const label = typeof item.scope === 'string' ? nonBlocking.get(item.scope) : undefined;
  if (label) { console.log(`${label} ${item.status} ${item.id}: ${detail}`); continue; }
  const verified = item.status === 'verified';
  if (!verified) open.push(item.id);
  console.log(`${verified ? 'PASS' : 'OPEN'} ${item.id}${item.scope === undefined ? ' (no scope: treated as required)' : ''}: ${detail}`);
}
if (open.length) {
  console.error(`Release blocked by ${open.length} unverified required gate${open.length === 1 ? '' : 's'}: ${open.join(', ')}. Channel: ${gate.channel ?? 'unknown'}.`);
  process.exitCode = 1;
} else console.log(`All required gates verified. Channel: ${gate.channel ?? 'unknown'}.`);
