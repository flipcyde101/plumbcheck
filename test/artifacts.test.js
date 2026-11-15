import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createArtifactTools } from '../src/artifacts.js';
import { createContractValidator } from '../src/contract.js';
import { redact, runSuite, runAgentSuite, validateSuite, toHtml } from '../src/index.js';
import { loadExamples } from '../src/studio.js';
import supportAgent from '../examples/customer-support/support-agent.js';

const tools=createArtifactTools(redact,createContractValidator());
const report=async()=>runSuite((await loadExamples()).regression);

test('model report provenance round-trips without permitting inconsistent usage metadata', async () => {
  const value = await report(); value.mode = 'agent-replay';
  value.execution = { runner: 'builtin-model', provider: 'ollama', model: 'qwen3.5:4b', connectionName: 'Local', contractRevision: 1, contractHash: 'a'.repeat(64), limits: { timeoutMs: 60000, maxSteps: 8, maxOutputTokens: 2000, maxTotalOutputTokens: 10000 }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, steps: 2, usageIncomplete: false } };
  const opened = tools.open(JSON.stringify(value)); assert.deepEqual(opened.value.execution, value.execution);
  value.execution.usage.totalTokens = 100;
  assert.throws(() => tools.open(JSON.stringify(value)), /Usage total/);
  value.execution.usage.totalTokens = 15; value.execution.model = '</script><img src=x onerror=alert(1)>';
  const html = await toHtml(value); assert.ok(!html.includes('</script><img src=x'));
});

test('imports planned contracts without running or masking their fixture data',async()=>{
  const {safe}=await loadExamples();safe.cases[0].fixtures[0].arguments.token='raw-fixture';
  const opened=tools.open(JSON.stringify(safe));assert.equal(opened.kind,'contract');assert.equal(opened.runner,'planned');
  assert.equal(opened.value.cases[0].fixtures[0].arguments.token,'raw-fixture');
});
test('imports agent contracts as code-mode data without executing a module',async()=>{
  const suite=JSON.parse(await readFile(new URL('../examples/customer-support/agent-contract.json',import.meta.url),'utf8'));
  const opened=tools.open(JSON.stringify(suite));assert.equal(opened.runner,'agent');assert.equal(opened.kind,'contract');
});
test('exports contracts that round-trip through the same validator and runner',async()=>{
  const {safe}=await loadExamples();const exported=tools.exportContract(JSON.stringify(safe));
  assert.equal((await runSuite(tools.open(exported.json).value)).passed,true);assert.deepEqual(JSON.parse(exported.json),safe);
});
test('imports fixture, agent, and MCP report modes',async()=>{
  const fixture=await report();assert.equal(tools.open(JSON.stringify(fixture)).kind,'report');
  const suite=JSON.parse(await readFile(new URL('../examples/customer-support/agent-contract.json',import.meta.url),'utf8'));
  const agent=await runAgentSuite(suite,supportAgent);assert.equal(tools.report(agent).mode,'agent-replay');
  const mcp=structuredClone(fixture);mcp.mode='mcp-replay';assert.equal(tools.report(mcp).mode,'mcp-replay');
});
test('normalizes missing legacy descriptions and scope',async()=>{
  const r=await report();delete r.description;delete r.scope;delete r.cases[0].description;
  const imported=tools.report(r);assert.equal(imported.description,'');assert.equal(imported.cases[0].description,'');assert.equal(imported.scope,'intercepted-tool-calls');
});
test('masks common credential keys in imported reports without mutating the source',async()=>{
  const r=await report();r.cases[0].events[0].arguments.apiKey='private';
  const imported=tools.report(r);assert.equal(imported.cases[0].events[0].arguments.apiKey,'[REDACTED]');assert.equal(r.cases[0].events[0].arguments.apiKey,'private');
});
for(const [name,change] of [
  ['passed total',r=>{r.summary.passed=99;}],
  ['call total',r=>{r.summary.calls=0;}],
  ['blocked total',r=>{r.summary.blocked=0;}],
  ['nonzero live calls',r=>{r.summary.liveToolCalls=1;}],
  ['root green status',r=>{r.passed=true;}],
  ['case green status',r=>{r.cases[2].passed=true;}],
  ['missing failure evidence',r=>{r.cases[2].failures=[{code:'OTHER',message:'Other failure'}];}],
  ['unknown event status',r=>{r.cases[0].events[0].status='executed';}],
  ['event index',r=>{r.cases[0].events[0].index=99;}],
  ['string summary count',r=>{r.summary.passed='2';}],
  ['invalid timestamp',r=>{r.createdAt='yesterday-ish';}],
  ['invalid duration',r=>{r.durationMs=-1;}],
  ['unknown mode',r=>{r.mode='live';}],
  ['unknown version',r=>{r.version=2;}],
  ['duplicate cases',r=>{r.cases[1].name=r.cases[0].name;}],
  ['bad failure call index',r=>{r.cases[2].failures[0].call=99;}],
]) test(`rejects inconsistent report: ${name}`,async()=>{const r=await report();change(r);assert.throws(()=>tools.report(r));});

test('rejects malformed, oversized, overly deep, and non-finite JSON',()=>{
  assert.throws(()=>tools.open('<html>no</html>'),/Cannot open JSON/);
  assert.throws(()=>tools.open(' '.repeat(1000001)),/1 MB/);
  assert.throws(()=>tools.open('['.repeat(70)+'0'+']'.repeat(70)),/64-level/);
  assert.throws(()=>tools.open('{"number":1e999}'),/finite/);
});
test('UTF-8 bytes determine file limits and BOM-prefixed JSON is supported',async()=>{
  assert.throws(()=>tools.open('"'+'é'.repeat(500001)+'"'),/1 MB/);
  const {safe}=await loadExamples();assert.equal(tools.open('\uFEFF'+JSON.stringify(safe)).kind,'contract');
});
test('large compact contracts do not become impossible to reopen after export',()=>{
  const calls=Array.from({length:2000},()=>({tool:'read',arguments:{value:'x'.repeat(120)}}));
  const suite={version:1,name:'Large',policies:{allow:['read']},cases:[{name:'Large',calls,fixtures:[]}]};
  const source=JSON.stringify(suite);assert.ok(source.length<tools.maxBytes);
  const exported=tools.exportContract(source);assert.ok(new TextEncoder().encode(exported.json).byteLength<=tools.maxBytes);
  assert.equal(tools.open(exported.json).runner,'planned');
});
test('shared validation rejects malformed optional descriptions before a run',async()=>{
  for(const where of ['suite','case']){
    const {safe}=await loadExamples();if(where==='suite')safe.description={};else safe.cases[0].description={};
    assert.throws(()=>validateSuite(safe),/description/);assert.throws(()=>tools.open(JSON.stringify(safe)),/description/);
  }
});
test('report payload marker strings are data and cannot replace runtime bindings',async()=>{
  const r=await report();r.name='/*__REPORT__*/null /*__ARTIFACT_TOOLS__*/null /*__DIFF_TOOLS__*/null /*__WORKBENCH__*/null </script>';
  const html=await toHtml(r);const payload=html.match(/id="report-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(payload).name,r.name);
  const runtime=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(runtime));
  assert.ok(!runtime.includes('/*__WORKBENCH__*/null'));
});
test('embedded helpers run independently of Node imports and closures',async()=>{
  const factory=new Function(`return (${createArtifactTools.toString()})(${redact.toString()}, (${createContractValidator.toString()})());`)();
  const {safe}=await loadExamples();assert.equal(factory.open(JSON.stringify(safe)).kind,'contract');
  assert.equal(factory.report(await report()).summary.failed,4);
});
test('blank native Error messages still produce importable failed agent reports',async()=>{
  const suite={version:1,name:'Empty error message',policies:{},cases:[{name:'Failed agent',fixtures:[],expect:{callOrder:[]}}]};
  const r=await runAgentSuite(suite,async()=>{throw new Error();});
  const imported=tools.report(r);assert.equal(imported.passed,false);assert.equal(imported.cases[0].failures[0].message,'');
});
test('the actual case-row renderer escapes untrusted names and failure codes',async()=>{
  const r=await report();const c=r.cases[2];c.name='<svg onload="alert(1)">';c.failures[0].code='<img src=x onerror="alert(1)">';
  const markup=tools.caseButton(c,2,2);
  assert.ok(!markup.includes('<svg'));assert.ok(!markup.includes('<img'));assert.ok(markup.includes('&lt;svg'));assert.ok(markup.includes('&lt;img'));
  assert.match(markup,/aria-pressed="true"/);
});

test('imports a genuine agent report whose result assertion targets a call never made',async()=>{
  const suite={version:1,name:'Skipped result',policies:{allow:['read']},cases:[{name:'No call',fixtures:[],expect:{results:[{call:2,path:'status',equals:'ok'}],callOrder:[]}}]};
  const r=await runAgentSuite(suite,async()=>{});
  assert.equal(r.cases[0].events.length,0);assert.equal(r.cases[0].failures[0].actualMissing,true);
  const imported=tools.open(JSON.stringify(r));assert.equal(imported.kind,'report');assert.equal(imported.value.passed,false);
  r.cases[0].failures[0].actualMissing=false;assert.throws(()=>tools.report(r),/out of range/);
});
