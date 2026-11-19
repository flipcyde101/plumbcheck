import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { runSuite } from '../src/runner.js';
import { loadExamples } from '../src/studio.js';
import { isDeepStrictEqual } from '../src/portable-util.js';

test('bundled Android engine matches the Node runner on the shipped regression corpus', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../mobile/entry.js', import.meta.url))], bundle: true, write: false, format: 'iife', platform: 'browser', alias: { 'node:util': fileURLToPath(new URL('../src/portable-util.js', import.meta.url)) } });
  const context = { performance, structuredClone, console, TransformStream, ReadableStream, WritableStream, TextEncoder, TextDecoder, AbortController, AbortSignal, URL, URLSearchParams, Response, Request, Headers, crypto, setTimeout, clearTimeout, atob, btoa, DOMException };
  context.window = context;
  runInNewContext(bundle.outputFiles[0].text, context);
  const normalize = report => { const r = JSON.parse(JSON.stringify(report)); delete r.createdAt; delete r.durationMs; r.cases.forEach(c => c.events.forEach(e => delete e.durationMs)); return r; };
  const matcherSuite = { version: 1, name: 'Bundled matchers', policies: { allow: ['a'] }, cases: [
    { name: 'pass', calls: [{ tool: 'a', arguments: { id: 'ORD-7', body: 'It SHIPPED' } }], fixtures: [{ tool: 'a', arguments: { id: { $plumb: 'matches', pattern: '^ORD-[0-9]+$' }, body: { $plumb: 'contains', value: 'shipped', ignoreCase: true } }, result: {} }], expect: { outputChecks: [{ contains: 'x' }] } },
    { name: 'fail', calls: [{ tool: 'a', arguments: { id: 'BAD', body: 'shipped' } }], fixtures: [{ tool: 'a', arguments: { id: { $plumb: 'matches', pattern: '^ORD-' }, body: { $plumb: 'any' } }, result: {} }] }] };
  for (const suite of [...Object.values(await loadExamples()), matcherSuite]) {
    assert.deepEqual(normalize(await context.window.PlumbCheckMobile.runSuite(suite)), normalize(await runSuite(suite)));
  }
  const bundled = await context.window.PlumbCheckMobile.runSuite(matcherSuite);
  assert.deepEqual(JSON.parse(JSON.stringify(bundled.cases.map(c => c.passed))), [true, false]);
});
test('portable JSON comparison preserves key order independence, number types and missing fields', () => {
  assert.equal(isDeepStrictEqual({ b: 2, a: [null, 0] }, { a: [null, 0], b: 2 }), true);
  for (const [a, b] of [[0, -0], [1, '1'], [{ a: null }, {}], [[1], { 0: 1 }], [[1], [1, 2]]]) assert.equal(isDeepStrictEqual(a, b), false);
});
