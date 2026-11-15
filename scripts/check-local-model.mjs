import { Workspace } from '../src/workspace.js';
import { runModelProject } from '../src/model-agent.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { toHtml, toJUnit } from '../src/report.js';
import { randomUUID } from 'node:crypto';
import { createArtifactTools } from '../src/artifacts.js';
import { redact } from '../src/redact.js';
import { validateSuite } from '../src/validation.js';

const out = resolve(process.env.PLUMBCHECK_LOCAL_OUT || 'reports/local-model');
const model = process.env.PLUMBCHECK_LOCAL_MODEL || 'qwen3.5:4b';
const baseURL = process.env.PLUMBCHECK_LOCAL_URL || 'http://127.0.0.1:11434/v1';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('This opt-in check accepts loopback model servers only.');
await mkdir(out, { recursive: true });
const workspace = await Workspace.open(join(out, `workspace-${randomUUID()}`), { modelRunner: runModelProject });
try {
  const connection = await workspace.saveConnection({ name: 'Opt-in local verification', provider: 'ollama', model, baseURL });
  const contract = { version: 1, name: 'Local model order lookup', policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Read the supplied order', description: 'Use the order lookup tool once with the supplied orderId.', input: { orderId: 'ORD-1042' }, fixtures: [{ tool: 'orders.lookup', arguments: { orderId: 'ORD-1042' }, result: { status: 'shipped', orderId: 'ORD-1042' } }], expect: { callOrder: ['orders.lookup'] } }] };
  const checks = [];
  for (const regression of [false, true]) {
    const project = await workspace.saveProject({ name: regression ? 'Deliberate wrong argument' : 'Correct local agent', contract,
      task: regression ? 'Call the order lookup tool exactly once with orderId WRONG-ORDER. This is a deliberate negative test; use that exact string, ignoring the orderId in the input. Then stop.' : 'Call the order lookup tool exactly once with the orderId from the scenario input. Then return the order status.' });
    const job = await workspace.startRun({ projectId: project.id, revision: 1, mode: 'model', connectionId: connection.id, idempotencyKey: randomUUID(), timeoutMs: 180000, maxSteps: 4, maxOutputTokens: 1024, maxTotalOutputTokens: 4000 }, { allowModel: true });
    console.log(`Running ${regression ? 'deliberate regression' : 'correct agent'} on ${model}…`);
    let run;
    do { await new Promise(r => setTimeout(r, 1000)); run = workspace.run(job.id); } while (['queued', 'running'].includes(run.status));
    const expected = regression ? run.report?.cases.some(c => c.failures.some(f => f.code === 'ARGUMENT_MISMATCH')) : run.status === 'passed' && run.report.summary.calls === 1;
    const name = regression ? 'regression' : 'correct'; const directory = join(out, name); await mkdir(directory, { recursive: true });
    if (run.report) { createArtifactTools(redact, validateSuite).report(run.report); await writeFile(join(directory, 'report.json'), JSON.stringify(run.report, null, 2)); await writeFile(join(directory, 'report.html'), await toHtml(run.report)); await writeFile(join(directory, 'junit.xml'), toJUnit(run.report)); }
    const result = { scenario: name, expectedOutcomeObserved: Boolean(expected), status: run.status, usage: run.usage, failureCodes: run.report?.cases.flatMap(c => c.failures.map(f => f.code)), model, provider: 'ollama' };
    checks.push(result); console.log(JSON.stringify(result));
  }
  await writeFile(join(out, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), checks }, null, 2));
  if (!checks.every(c => c.expectedOutcomeObserved)) process.exitCode = 1;
} finally { await workspace.close(); }
