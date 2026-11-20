import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { startStudio, loadExamples } from '../src/studio.js';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['bin/plumbcheck.js', ...args], { cwd, encoding: 'utf8', timeout: 10_000 });

const forgedHostRequest = (url) => new Promise((resolve, reject) => {
  const req = request(url, { headers: { Host: 'attacker.example' } }, res => {
    res.resume();
    res.on('end', () => resolve(res.statusCode));
  });
  req.on('error', reject);
  req.end();
});

test('CLI returns stable CI exit codes and machine-readable JSON', () => {
  const safe = cli('run', 'examples/customer-support/safe.json', '--json');
  assert.equal(safe.status, 0, safe.stderr); assert.equal(JSON.parse(safe.stdout).passed, true);
  const failing = cli('run', 'examples/customer-support/regression.json', '--json');
  assert.equal(failing.status, 1); assert.equal(JSON.parse(failing.stdout).summary.failed, 4);
  for (const args of [['unknown'], ['run'], ['run','missing.json'], ['run','--out'], ['studio','--port','no'], ['run','examples/customer-support/safe.json','--typo']]) assert.equal(cli(...args).status, 2, args.join(' '));
});

test('CLI emits standalone HTML, masked JSON, and JUnit artifacts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plumcheck-test-'));
  try {
    const result = cli('run', 'examples/customer-support/safe.json', '--out', dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(join(dir,'report.html'),'utf8'), /Customer support agent/);
    assert.equal(JSON.parse(await readFile(join(dir,'report.json'),'utf8')).passed,true);
    assert.match(await readFile(join(dir,'junit.xml'),'utf8'), /failures="0"/);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

test('studio serves the workbench, validates contracts, and rejects cross-origin calls', async (t) => {
  const server = await startStudio({ port: 0 });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(url);
  assert.equal(page.status,200); assert.match(await page.text(),/data-studio="true"/);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const examples = await (await fetch(url+'/api/examples')).json();
  const run = await fetch(url+'/api/run', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(examples.safe)});
  assert.equal(run.status,200); assert.equal((await run.json()).passed,true);
  const crossOrigin = await fetch(url+'/api/run', {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:JSON.stringify(examples.safe)});
  assert.equal(crossOrigin.status,403);
  assert.equal(await forgedHostRequest(url),403);
  assert.equal((await fetch(url+'/api/run',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await fetch(url+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'})).status,400);
  const empty = await fetch(url+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...examples.safe,cases:[]})});
  assert.equal(empty.status,400); assert.match((await empty.json()).error,/cases/);
  assert.equal((await fetch(url+'/no-such-path')).status,404);
});

test('studio rejects oversized bodies', async (t) => {
  const server = await startStudio({port:0}); t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/run`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:'x'.repeat(1_000_001)})});
  assert.equal(response.status,413);
});
