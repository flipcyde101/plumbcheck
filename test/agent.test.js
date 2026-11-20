import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runAgentSuite, redact } from '../src/index.js';
import supportAgent from '../examples/customer-support/support-agent.js';
import regressedAgent from '../examples/customer-support/regressed-agent.js';

const contract = async () => JSON.parse(await readFile(new URL('../examples/customer-support/agent-contract.json', import.meta.url), 'utf8'));
const tiny = () => ({ version:1, name:'Actual code', policies:{allow:['read']}, cases:[{name:'Return data',input:{id:1},fixtures:[{tool:'read',arguments:{id:1},result:{ok:true}}],expect:{callOrder:['read'],output:{ok:true}}}] });
const agent = async (client, {input}) => client.callTool({name:'read',arguments:{id:input.id}});

test('runs actual agent code with response-driven tool arguments and output assertions', async () => {
  const report=await runAgentSuite(await contract(),supportAgent);
  assert.equal(report.passed,true);assert.equal(report.mode,'agent-replay');
  assert.equal(report.scope,'intercepted-tool-calls');assert.equal(report.summary.calls,3);
  assert.deepEqual(report.cases[0].output,{orderId:'ORD-1042',status:'shipped',notified:true});
});

test('a regressed agent cannot swallow a tool mismatch into a passing case', async () => {
  const report=await runAgentSuite(await contract(),regressedAgent);
  assert.equal(report.passed,false);assert.equal(report.summary.failed,1);
  assert.equal(report.cases[0].failures[0].code,'ARGUMENT_MISMATCH');
  assert.equal(report.cases[0].events[1].expectedArguments.to,'customer@example.com');
  assert.equal(report.cases[1].passed,true);
});

test('runner detects an agent that skips its expected tool call', async () => {
  const s=tiny(); delete s.cases[0].expect.callOrder;
  const report=await runAgentSuite(s,async()=>({ok:true}));
  assert.equal(report.cases[0].failures[0].code,'UNUSED_FIXTURES');
});

test('output regression fails even when every tool call passes', async () => {
  const report=await runAgentSuite(tiny(),async(client,context)=>{await agent(client,context);return {ok:false};});
  const failure=report.cases[0].failures[0];assert.equal(failure.code,'OUTPUT_MISMATCH');
  assert.deepEqual(failure.expected,{ok:true});assert.deepEqual(failure.actual,{ok:false});
});

test('falsy and null outputs are asserted rather than ignored', async () => {
  for(const value of [false,0,'',null]) {
    const s=tiny();s.cases[0].expect.output=value;
    assert.equal((await runAgentSuite(s,async(client,context)=>{await agent(client,context);return value;})).passed,true);
  }
});

test('missing agent output cannot satisfy an explicit null assertion', async () => {
  const s=tiny();s.cases[0].expect.output=null;
  const report=await runAgentSuite(s,async(client,context)=>{await agent(client,context);});
  assert.equal(report.passed,false);assert.equal(report.cases[0].failures[0].actualMissing,true);
});

test('an agent without an output assertion may return undefined', async () => {
  const s=tiny();delete s.cases[0].expect.output;
  assert.equal((await runAgentSuite(s,async(client,context)=>{await agent(client,context);})).passed,true);
});

test('any thrown value fails the case, including undefined and null', async () => {
  for(const error of [new Error('Agent crashed'),'bad',null,undefined]) {
    const report=await runAgentSuite(tiny(),async(client,context)=>{await agent(client,context);throw error;});
    assert.equal(report.passed,false);assert.ok(report.cases[0].failures.some(f=>f.code==='AGENT_ERROR'));
  }
});

test('propagated tool errors are reported once rather than duplicated as agent errors', async () => {
  const s=tiny();s.policies.deny=['read'];
  const report=await runAgentSuite(s,agent);
  assert.equal(report.cases[0].failures.filter(f=>f.code==='DENIED_TOOL').length,1);
  assert.ok(!report.cases[0].failures.some(f=>f.code==='AGENT_ERROR'));
});

test('unawaited tool failures still fail the contract without unhandled rejections', async () => {
  const s=tiny();delete s.cases[0].expect;
  const report=await runAgentSuite(s,async client=>{client.callTool({name:'other',arguments:{}});});
  assert.equal(report.cases[0].failures[0].code,'UNLISTED_TOOL');
});

test('agent receives a frozen minimal client without policy or event access', async () => {
  const report=await runAgentSuite(tiny(),async(client,context)=>{
    assert.equal(Object.isFrozen(client),true);assert.deepEqual(Object.keys(client),['callTool']);
    return agent(client,context);
  });
  assert.equal(report.passed,true);
});

test('each case receives independent cloned input and the suite remains unchanged', async () => {
  const s=tiny();s.cases.push({...structuredClone(s.cases[0]),name:'Second'});
  const report=await runAgentSuite(s,async(client,context)=>{const result=await agent(client,context);context.input.id=99;return result;});
  assert.equal(report.passed,true);assert.equal(s.cases[0].input.id,1);assert.equal(s.cases[1].input.id,1);
});

test('all cases validate before any agent code is called', async () => {
  const s=tiny();s.cases.push({name:'Invalid',fixtures:null});let called=0;
  await assert.rejects(runAgentSuite(s,()=>{called++;}),/Invalid suite/);assert.equal(called,0);
});

test('agent-mode contracts reject planned calls instead of silently ignoring them', async () => {
  const s=tiny();s.cases[0].calls=[{tool:'read',arguments:{id:1}}];
  await assert.rejects(runAgentSuite(s,agent),/calls/);
});

test('an empty agent test without fixtures or assertions is invalid', async () => {
  const s=tiny();s.cases[0].fixtures=[];delete s.cases[0].expect;
  await assert.rejects(runAgentSuite(s,async()=>{}),/fixture|assertion/);
});

test('explicit zero-tool contracts can test an output', async () => {
  const s=tiny();s.cases[0].fixtures=[];s.cases[0].expect={callOrder:[],output:'No action needed'};
  assert.equal((await runAgentSuite(s,async()=>'No action needed')).passed,true);
});

test('agent must be a function', async () => {
  await assert.rejects(runAgentSuite(tiny(),{}),/agent must be a function/);
});

test('invalid JSON output is a failed case rather than a report serialization crash', async () => {
  for(const value of [1n,NaN,{broken:()=>{}},{bad:undefined}]) {
    const report=await runAgentSuite(tiny(),async(client,context)=>{await agent(client,context);return value;});
    assert.equal(report.passed,false);assert.ok(report.cases[0].failures.some(f=>f.code==='AGENT_ERROR'));
    assert.doesNotThrow(()=>JSON.stringify(report));
  }
});

test('output failure evidence retains credential keys for delivery masking', async () => {
  const s=tiny();s.cases[0].expect.output={token:'expected-private'};
  const report=await runAgentSuite(s,async(client,context)=>{await agent(client,context);return {token:'actual-private'};});
  const serialized=JSON.stringify(redact(report));
  assert.ok(!serialized.includes('expected-private'));assert.ok(!serialized.includes('actual-private'));
});

test('CLI tests actual agent modules and keeps JSON stdout parseable', () => {
  const cwd=fileURLToPath(new URL('..',import.meta.url));
  const cli=(...args)=>spawnSync(process.execPath,['bin/plumbcheck.js',...args],{cwd,encoding:'utf8',timeout:10_000});
  const shared=['run','examples/customer-support/agent-contract.json','--json','--agent'];
  const good=cli(...shared,'examples/customer-support/support-agent.js');assert.equal(good.status,0,good.stderr);assert.equal(JSON.parse(good.stdout).passed,true);
  const bad=cli(...shared,'examples/customer-support/regressed-agent.js');assert.equal(bad.status,1,bad.stderr);assert.equal(JSON.parse(bad.stdout).summary.failed,1);
  assert.equal(cli(...shared,'does-not-exist.js').status,2);
  assert.equal(cli('run','examples/customer-support/agent-contract.json').status,2);
  assert.equal(cli('demo','--agent','examples/customer-support/support-agent.js').status,2);
  assert.equal(cli('studio','--agent','examples/customer-support/support-agent.js').status,2);
});
