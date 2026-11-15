import { readFile } from 'node:fs/promises';
const gate = JSON.parse(await readFile(new URL('../release-readiness.json', import.meta.url), 'utf8'));
const missing = gate.required.filter(g => g.status !== 'verified');
for (const item of gate.required) console.log(`${item.status === 'verified' ? 'PASS' : 'OPEN'} ${item.id}: ${item.evidence || item.reason}`);
if (missing.length) { console.error(`Public production release blocked by ${missing.length} unverified gates. Preview builds remain available.`); process.exitCode = 1; }
