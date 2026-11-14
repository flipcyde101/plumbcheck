import test from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, redact } from '../src/index.js';
import { loadExamples } from '../src/studio.js';

test('wrong-recipient evidence retains the expected arguments', async () => {
  const { regression } = await loadExamples();
  const report = await runSuite(regression);
  const event = report.cases.find(c=>c.name==='Wrong email recipient').events[1];
  assert.equal(event.arguments.to,'outsider@example.net');
  assert.equal(event.expectedArguments.to,'customer@example.com');
});

test('credential-key masking covers expected and attempted argument evidence', async () => {
  const { safe } = await loadExamples();
  safe.cases[0].fixtures[0].arguments.api_key='expected-secret';
  safe.cases[0].calls[0].arguments.api_key='attempted-secret';
  const masked=JSON.stringify(redact(await runSuite(safe)));
  assert.ok(!masked.includes('expected-secret'));assert.ok(!masked.includes('attempted-secret'));
  assert.ok(masked.includes('[REDACTED]'));
});
