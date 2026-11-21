import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgentSuite } from '../src/index.js';
import { validateSuite } from '../src/validation.js';
import bookingAgent from '../examples/calendar-booking/booking-agent.js';
import regressedBookingAgent from '../examples/calendar-booking/regressed-agent.js';

const root = fileURLToPath(new URL('../examples/', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

test('every committed example contract validates in its own mode', async () => {
  const files = (await readdir(root, { recursive: true })).filter(name => name.endsWith('.json'));
  assert.ok(files.length >= 6);
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

test('calendar-booking example passes with the correct agent and catches approval and deny regressions', async () => {
  const contract = JSON.parse(await readFile(join(root, 'calendar-booking', 'agent-contract.json'), 'utf8'));

  const passing = await runAgentSuite(contract, bookingAgent);
  assert.equal(passing.passed, true);
  assert.equal(passing.mode, 'agent-replay');
  assert.equal(passing.summary.total, 3);
  assert.equal(passing.summary.passed, 3);
  assert.equal(passing.summary.blocked, 0);
  assert.equal(passing.summary.liveToolCalls, 0);
  assert.deepEqual(passing.cases[0].output, { attendee: 'alex@example.com', slot: '2026-11-24T10:00:00Z', invited: true });
  assert.deepEqual(passing.cases[1].output, { attendee: 'alex@example.com', slot: '2026-11-24T10:00:00Z', invited: false });
  assert.deepEqual(passing.cases[2].output, { attendee: 'alex@example.com', slot: null, invited: false });

  const regressed = await runAgentSuite(contract, regressedBookingAgent);
  assert.equal(regressed.passed, false);
  assert.equal(regressed.summary.passed, 1);
  assert.equal(regressed.summary.failed, 2);
  assert.equal(regressed.summary.blocked, 2);
  assert.equal(regressed.cases[0].passed, true);
  assert.deepEqual(regressed.cases[1].failures.map(f => f.code), ['APPROVAL_REQUIRED', 'FORBIDDEN_CALL']);
  assert.equal(regressed.cases[1].events[1].status, 'blocked');
  assert.deepEqual(regressed.cases[2].failures.map(f => f.code), ['DENIED_TOOL', 'FORBIDDEN_CALL']);
  assert.equal(regressed.cases[2].events[1].status, 'blocked');
});

test('calendar-booking example CLI returns exit code 0 for pass and 1 for regressed runs', () => {
  const runCli = agentPath => spawnSync(
    process.execPath,
    ['bin/plumbcheck.js', 'run', 'examples/calendar-booking/agent-contract.json', '--json', '--agent', agentPath],
    { cwd: repoRoot, encoding: 'utf8', timeout: 10_000 },
  );

  const good = runCli('examples/calendar-booking/booking-agent.js');
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).passed, true);

  const bad = runCli('examples/calendar-booking/regressed-agent.js');
  assert.equal(bad.status, 1, bad.stderr);
  const report = JSON.parse(bad.stdout);
  assert.equal(report.passed, false);
  assert.equal(report.cases[1].failures[0].code, 'APPROVAL_REQUIRED');
  assert.equal(report.cases[2].failures[0].code, 'DENIED_TOOL');
});
