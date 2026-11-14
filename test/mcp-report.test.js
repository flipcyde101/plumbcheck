import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('..',import.meta.url));
const messages=[{jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'mcp-report-test',version:'1.0.0'}}},{jsonrpc:'2.0',method:'notifications/initialized'},{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read',arguments:{}}}];
const contract=()=>({version:1,name:'MCP evidence',policies:{allow:['read']},cases:[{name:'Check actual calls',calls:[{tool:'read',arguments:{}}],fixtures:[{tool:'read',arguments:{},result:{status:'shipped',token:'private-token'}}],expect:{callOrder:['read'],results:[{call:0,path:'status',equals:'shipped'}]}}]});

async function withServer(input,check){
  const dir=await mkdtemp(join(tmpdir(),'plumcheck-mcp-report-'));
  try{
    const path=join(dir,'suite.json');await writeFile(path,JSON.stringify(input));
    const out=join(dir,'evidence with spaces');
    const run=spawnSync(process.execPath,['bin/plumcheck-mcp.js',path,'Check actual calls','--out',out],{cwd,encoding:'utf8',input:messages.map(m=>JSON.stringify(m)).join('\n')+'\n',timeout:10_000});
    await check(run,out);
  }finally{await rm(dir,{recursive:true,force:true});}
}

test('MCP writes masked JSON, HTML, and JUnit without corrupting JSON-RPC stdout',async()=>{
  await withServer(contract(),async(run,out)=>{
    assert.equal(run.status,0,run.stderr);
    const wire=run.stdout.trim().split('\n').map(line=>JSON.parse(line));assert.equal(wire.length,2);
    assert.deepEqual(wire[1].result.structuredContent,{status:'shipped',token:'private-token'});
    const json=await readFile(join(out,'report.json'),'utf8');assert.ok(!json.includes('private-token'));
    const report=JSON.parse(json);assert.equal(report.passed,true);assert.equal(report.mode,'mcp-replay');assert.equal(report.summary.calls,1);
    assert.match(await readFile(join(out,'report.html'),'utf8'),/MCP CLIENT \/ REPLAY/);
    assert.match(await readFile(join(out,'junit.xml'),'utf8'),/failures="0"/);
  });
});

test('MCP final assertions fail CI even if all replayed tool calls succeeded',async()=>{
  const input=contract();input.cases[0].expect.results[0].equals='cancelled';
  await withServer(input,async(run,out)=>{
    assert.equal(run.status,1,run.stderr);
    const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
    assert.equal(report.passed,false);assert.equal(report.cases[0].events[0].status,'replayed');
    assert.equal(report.cases[0].failures[0].code,'RESULT_MISMATCH');
    assert.deepEqual(report.cases[0].failures[0].actual,{status:'shipped'});
    assert.match(await readFile(join(out,'junit.xml'),'utf8'),/failures="1"/);
  });
});

test('MCP applies forbidden-call assertions to observed client requests',async()=>{
  const input=contract();input.cases[0].expect.never=['read'];
  await withServer(input,async(run,out)=>{
    assert.equal(run.status,1);
    const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
    assert.ok(report.cases[0].failures.some(f=>f.code==='FORBIDDEN_CALL'));
  });
});
