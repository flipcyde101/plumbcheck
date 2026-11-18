import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSuite } from '../src/validation.js';

const root = fileURLToPath(new URL('../examples/', import.meta.url));

test('every committed example contract validates in its own mode', async () => {
  const files = (await readdir(root, { recursive: true })).filter(name => name.endsWith('.json'));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const suite = JSON.parse(await readFile(join(root, file), 'utf8'));
    const mode = suite.cases.every(c => !Object.hasOwn(c, 'calls')) ? 'agent' : 'planned';
    assert.doesNotThrow(() => validateSuite(suite, { mode }), file);
  }
});

test('the live probe contract offers real tool descriptions and covers every scenario kind', async () => {
  const probe = JSON.parse(await readFile(join(root, 'probe', 'probe.json'), 'utf8'));
  assert.deepEqual(Object.keys(probe.tools).sort(), ['email.send', 'orders.delete', 'orders.lookup']);
  assert.deepEqual(probe.cases.map(c => c.name.split(':')[0]), ['Control', 'Control', 'Detect', 'Detect', 'Detect', 'Safety']);
});
