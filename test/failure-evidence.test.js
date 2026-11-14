import test from 'node:test';
import assert from 'node:assert/strict';
import { runSuite, runAgentSuite, ReplaySession, redact } from '../src/index.js';

test('uncloneable tool arguments leave failed evidence instead of a false pass',async()=>{
  const suite={version:1,name:'Malformed programmatic call',policies:{allow:['read']},cases:[{name:'Must fail',fixtures:[],calls:[{tool:'read',arguments:{callback:()=>{}}}]}]};
  const report=await runSuite(suite);assert.equal(report.passed,false);assert.equal(report.cases[0].failures[0].code,'REPLAY_ERROR');
  assert.equal(report.cases[0].events.length,1);
});
test('an agent cannot hide an uncloneable call by catching its exception',async()=>{
  const suite={version:1,name:'Agent call failure',policies:{allow:['read']},cases:[{name:'Must fail',fixtures:[],expect:{output:'done'}}]};
  const report=await runAgentSuite(suite,async client=>{try{await client.callTool({name:'read',arguments:{callback:()=>{}}});}catch{}return 'done';});
  assert.equal(report.passed,false);assert.equal(report.cases[0].failures[0].code,'REPLAY_ERROR');
});
test('result assertion evidence preserves sensitive path keys for masking',async()=>{
  const suite={version:1,name:'Sensitive response',policies:{allow:['read']},cases:[{name:'Mismatch',calls:[{tool:'read',arguments:{}}],fixtures:[{tool:'read',arguments:{},result:{structuredContent:{access_token:'actual-private'}}}],expect:{results:[{call:0,path:'structuredContent.access_token',equals:'expected-private'}]}}]};
  const report=await runSuite(suite);assert.equal(report.passed,false);
  assert.equal(report.cases[0].failures[0].expected.structuredContent.access_token,'expected-private');
  const masked=JSON.stringify(redact(report));assert.ok(!masked.includes('actual-private'));assert.ok(!masked.includes('expected-private'));
});
test('calls after an agent case returns cannot consume fixtures or alter its report',async()=>{
  let savedClient;
  const suite={version:1,name:'Closed agent',policies:{allow:['read']},cases:[{name:'No action',fixtures:[],expect:{callOrder:[],output:'done'}}]};
  const report=await runAgentSuite(suite,async client=>{savedClient=client;return 'done';});
  assert.equal(report.passed,true);
  await assert.rejects(savedClient.callTool({name:'read',arguments:{}}),{code:'SESSION_CLOSED'});
  assert.equal(report.summary.calls,0);assert.deepEqual(report.cases[0].events,[]);
});
test('direct SDK malformed calls still have a stable failure code',async()=>{
  const session=new ReplaySession({fixtures:[],policies:{allow:[]}});
  await assert.rejects(session.callTool(null),{code:'INVALID_CALL'});
  assert.equal(session.events[0].code,'INVALID_CALL');
});
