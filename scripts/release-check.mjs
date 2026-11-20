// Usage: node scripts/release-check.mjs [release-readiness.json]
// Exit 0 only when every required gate is verified. A gate is required when its scope is
// "1.0" or missing (fail closed). "experimental" and "post-1.0" gates are reported, never blocking.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const file = process.argv[2] ? resolve(process.argv[2]) : new URL('../release-readiness.json', import.meta.url);
const nonBlocking = { experimental: 'EXPERIMENTAL', 'post-1.0': 'POST-1.0' };

let gate;
try {
  gate = JSON.parse(await readFile(file, 'utf8'));
  if (gate?.version !== 1 || !Array.isArray(gate.required)) throw new Error('expected { version: 1, required: [...] }');
} catch (error) {
  console.error(`Release check cannot read its gates: ${error.message}`);
  process.exit(2);
}

const open = [];
for (const item of gate.required) {
  const detail = item.evidence || item.reason || '(no evidence or reason recorded)';
  const label = nonBlocking[item.scope];
  if (label) { console.log(`${label} ${item.status} ${item.id}: ${detail}`); continue; }
  const verified = item.status === 'verified';
  if (!verified) open.push(item.id);
  console.log(`${verified ? 'PASS' : 'OPEN'} ${item.id}${item.scope === undefined ? ' (no scope: treated as required)' : ''}: ${detail}`);
}
if (open.length) {
  console.error(`Release blocked by ${open.length} unverified required gate${open.length === 1 ? '' : 's'}: ${open.join(', ')}. Channel: ${gate.channel ?? 'unknown'}.`);
  process.exitCode = 1;
} else console.log(`All required gates verified. Channel: ${gate.channel ?? 'unknown'}.`);
