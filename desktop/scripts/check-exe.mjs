import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const application=resolve(process.argv[2] || join(root,'dist/windows/win-unpacked/PlumbCheck.exe'));
assert.ok((await stat(application)).size>1000000,'A built application is required.');
const helper=join(dirname(application),'resources','mcp-runtime');
const executable=join(helper,'node.exe');
const runnerScript=join(helper,'bin','plumbcheck-mcp.js');
assert.ok((await stat(executable)).size>1000000,'The bundled MCP runtime is required.');
const dir=await mkdtemp(join(tmpdir(),'plumbcheck-exe-'));
try {
  const suite=JSON.parse(await readFile(join(root,'examples/customer-support/safe.json'),'utf8'));
  const contract=join(dir,'Contract with spaces.json');await writeFile(contract,JSON.stringify(suite));
  for(const mismatch of [false,true]) {
    const out=join(dir,mismatch?'failed run':'passed run');
    const requests=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'plumbcheck-exe-check',version:'1'}}},
      ...suite.cases[0].calls.map((c,i)=>({jsonrpc:'2.0',id:i+2,method:'tools/call',params:{name:c.tool,arguments:mismatch&&i===1?{...c.arguments,to:'wrong@example.net'}:c.arguments}}))];
    const child=spawn(executable,[runnerScript,contract,suite.cases[0].name,'--out',out],{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    const timer=setTimeout(()=>child.kill(),90000);
    const completion=new Promise((accept,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>accept({code,signal}));});
    child.stdin.end(requests.map(value=>JSON.stringify(value)).join('\n')+'\n');
    const {code,signal}=await completion;clearTimeout(timer);
    assert.equal(signal,null,stderr);assert.equal(code,mismatch?1:0,`stdout: ${stdout}\nstderr: ${stderr}`);
    const responses=stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(responses.length,3,`Expected only JSON-RPC stdout. ${stdout}\n${stderr}`);
    assert.equal(responses[0].result.protocolVersion,'2025-11-25');
    const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
    assert.equal(report.passed,!mismatch);assert.equal(report.mode,'mcp-replay');assert.equal(report.summary.calls,2);
    assert.match(await readFile(join(out,'report.html'),'utf8'),/PlumbCheck/);
    if(mismatch) assert.match(await readFile(join(out,'junit.xml'),'utf8'),/\/to/);
    console.log(`Packaged EXE: ${mismatch?'wrong-recipient failure':'approved two-call replay'} passed.`);
  }
} finally { await rm(dir,{recursive:true,force:true}); }
