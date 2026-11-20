import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const cli=(entry,...args)=>spawnSync(process.execPath,[`bin/${entry}.js`,...args],{cwd,encoding:'utf8',timeout:10000});

test('canonical and legacy CLI commands execute the same passing contract',()=>{
  for(const name of ['plumbcheck','plumcheck']){
    const run=cli(name,'run','examples/customer-support/safe.json','--json');
    assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).passed,true);
  }
});
test('canonical and legacy CLI commands preserve failing exit codes',()=>{
  for(const name of ['plumbcheck','plumcheck'])assert.equal(cli(name,'run','examples/customer-support/regression.json','--json').status,1);
});
test('the package exposes canonical command names plus compatibility aliases',async()=>{
  const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(metadata.name,'plumbcheck');
  for(const name of ['plumbcheck','plumbcheck-mcp','plumcheck','plumcheck-mcp'])assert.ok(metadata.bin[name]);
});
test('canonical MCP entry preserves JSON-RPC framing and replay behavior',()=>{
  const messages=[{jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'alias-test',version:'1'}}},{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'orders.lookup',arguments:{orderId:'ORD-1042'}}}];
  for(const name of ['plumbcheck-mcp','plumcheck-mcp']){
    const result=spawnSync(process.execPath,[`bin/${name}.js`,'examples/customer-support/safe.json','Read-only order lookup'],{cwd,encoding:'utf8',input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',timeout:10000});
    assert.equal(result.status,0,result.stderr);
    const responses=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(responses.length,2);assert.equal(responses[1].result.structuredContent.status,'shipped');
  }
});
test('deprecated aliases warn on stderr only; canonical commands do not', () => {
  const legacy = cli('plumcheck', '--version'), canonical = cli('plumbcheck', '--version');
  assert.equal(legacy.status, 0); assert.equal(legacy.stdout, canonical.stdout);
  assert.match(legacy.stderr, /"plumcheck" command is deprecated and will be removed in 2\.0/);
  assert.equal(canonical.stderr, '');
  const mcp = spawnSync(process.execPath, ['bin/plumcheck-mcp.js'], { cwd, encoding: 'utf8', input: '', timeout: 10000 });
  assert.match(mcp.stderr, /"plumcheck-mcp" command is deprecated/); assert.equal(mcp.stdout, '');
});
test('the sync relay is labelled experimental in its help', () => {
  const help = cli('plumbcheck-sync', '--help');
  assert.equal(help.status, 0); assert.match(help.stdout, /^\[experimental\]/);
  const usage = cli('plumbcheck-sync');
  assert.equal(usage.status, 2); assert.match(usage.stderr, /\[experimental\]/);
});
