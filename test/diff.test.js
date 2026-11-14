import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiffTools } from '../src/diff.js';
import { redact, runSuite, runAgentSuite, toHtml, toJUnit } from '../src/index.js';
import { escapeHtml } from '../src/report.js';
import { loadExamples } from '../src/studio.js';

const diffs = createDiffTools(redact);
const cwd = fileURLToPath(new URL('..', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, ['bin/plumbcheck.js', ...args], { cwd, encoding: 'utf8', timeout: 10_000 });

test('identifies a nested business change without listing unchanged fields', () => {
  const expected={customer:{email:'customer@example.com',id:1},state:'ready'};
  const actual={state:'ready',customer:{id:1,email:'outsider@example.net'}};
  assert.deepEqual(diffs.compare(expected,actual),{changes:[{path:'/customer/email',kind:'changed',expected:'customer@example.com',actual:'outsider@example.net'}],truncated:false});
});

test('distinguishes missing fields, unexpected fields, null, and type changes', () => {
  const result=diffs.compare({count:1,removed:null,nullable:null},{count:'1',nullable:false,extra:[]});
  assert.deepEqual(result.changes.map(c=>[c.path,c.kind]),[['/count','type'],['/extra','added'],['/nullable','type'],['/removed','missing']]);
  assert.equal(Object.hasOwn(result.changes[1],'expected'),false);
  assert.equal(Object.hasOwn(result.changes[3],'actual'),false);
  assert.equal(result.changes[3].expected,null);
});

test('array comparisons use positions and never hide a changed call order', () => {
  const result=diffs.compare(['lookup','send','archive'],['send','lookup']);
  assert.deepEqual(result.changes.map(c=>[c.path,c.kind]),[['/0','changed'],['/1','changed'],['/2','missing']]);
  assert.equal(diffs.compare([],{}).changes[0].kind,'type');
});

test('field paths preserve slashes, tildes, empty keys, and prototype-looking keys', () => {
  const a=JSON.parse('{"a/b":{"~key":1},"":false,"__proto__":{"safe":1}}');
  const b=JSON.parse('{"a/b":{"~key":2},"":true,"__proto__":{"safe":2}}');
  assert.deepEqual(diffs.compare(a,b).changes.map(c=>c.path),['/','/__proto__/safe','/a~1b/~0key']);
  assert.equal({}.safe,undefined);
});

test('a missing root is different from null or an empty result', () => {
  assert.equal(diffs.compare(null,null).changes.length,0);
  const missing=diffs.compare(null,undefined,{actualMissing:true});
  assert.deepEqual(missing.changes,[{path:'',kind:'missing',expected:null}]);
  assert.match(diffs.format(missing),/\(root\).*<missing>/);
});

test('masks credential ancestors before generating rows or text', () => {
  const left={token:{nested:'left-private'},profile:{name:'A'}};
  const right={token:{nested:'right-private'},profile:{name:'B'},headers:{authorization:'added-private'}};
  const result=diffs.compare(left,right);
  assert.deepEqual(result.changes.map(c=>c.path),['/headers','/profile/name']);
  const delivered=JSON.stringify(result)+diffs.format(result)+diffs.html({...result,label:'Arguments'},escapeHtml);
  for(const secret of ['left-private','right-private','added-private']) assert.ok(!delivered.includes(secret));
  assert.match(delivered,/REDACTED/);assert.equal(left.token.nested,'left-private');
});

test('credential-only mismatches remain failed evidence even when their values are masked', () => {
  const detail=diffs.compare({api_key:'left'},{api_key:'right'});
  assert.equal(detail.changes.length,0);assert.match(diffs.format(detail),/original check still failed/);
});

test('comparison and value previews are bounded and disclose their limits', () => {
  const many=n=>Object.fromEntries(Array.from({length:n},(_,i)=>[`field${String(i).padStart(3,'0')}`,i]));
  const exact=diffs.compare(many(20),{});assert.equal(exact.truncated,false);assert.equal(exact.changes.length,20);
  const capped=diffs.compare(many(25),{});assert.equal(capped.truncated,true);assert.equal(capped.changes.length,20);assert.match(diffs.format(capped),/Comparison limited/);
  const wide=diffs.compare(Array(21000).fill(0),Array(21000).fill(0));assert.equal(wide.truncated,true);assert.match(diffs.format(wide),/Comparison limited/);
  const big=diffs.compare('x'.repeat(1000),'y'.repeat(1000));assert.ok(diffs.format(big).length<600);assert.match(diffs.format(big),/…/);
});

test('diff markup escapes malicious field names, labels, and values', () => {
  const detail={label:'<img src=x>',...diffs.compare({'<svg onload="x">':'<script>x</script>'},{'<svg onload="x">':'<img src=x>'})};
  const html=diffs.html(detail,escapeHtml);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('<svg'));assert.ok(!html.includes('<script'));
  assert.match(html,/&lt;img/);assert.match(html,/scope="col"/);assert.match(html,/tabindex="0"/);
});

test('terminal diff text escapes control characters in values and field paths', () => {
  const result=diffs.compare({'\u001b[2J\n':'old'},{'\u001b[2J\n':'\u001b[2J\n'});
  const text=diffs.format(result);assert.ok(!text.includes('\u001b'));assert.match(text,/\\u001b/);assert.equal(text.split('\n').length,1);
});

test('failure adapters work on actual argument, result, order, and agent-output evidence', async () => {
  const r=await runSuite((await loadExamples()).regression);
  const wrong=r.cases.find(c=>c.name==='Wrong email recipient');
  const detail=diffs.forFailure(wrong,wrong.failures[0]);assert.equal(detail.label,'Tool arguments');assert.equal(detail.changes[0].path,'/to');
  const result=r.cases.find(c=>c.name==='Changed response contract');
  assert.equal(diffs.forFailure(result,result.failures[0]).changes[0].path,'/structuredContent/status');
  const suite={version:1,name:'Output',policies:{},cases:[{name:'Output',fixtures:[],expect:{output:{ok:true}}}]};
  const agent=await runAgentSuite(suite,async()=>({ok:false}));
  assert.equal(diffs.forFailure(agent.cases[0],agent.cases[0].failures[0]).changes[0].path,'/ok');
  const order=diffs.forFailure({events:[]},{code:'EXPECTED_ORDER',expected:['read'],actual:[]});
  assert.equal(order.changes[0].kind,'missing');
  assert.equal(diffs.forFailure(wrong,{code:'APPROVAL_REQUIRED'}),null);
});

test('HTML embeds independent diff tools and JUnit includes actionable differences', async () => {
  const r=await runSuite((await loadExamples()).regression);
  const xml=toJUnit(r);assert.match(xml,/\/to/);assert.match(xml,/outsider@example.net/);assert.match(xml,/\/structuredContent\/status/);
  const html=await toHtml(r);assert.ok(!html.includes('/*__DIFF_TOOLS__*/null'));
  const runtime=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(runtime));
  const offline=new Function(`return (${createDiffTools.toString()})(${redact.toString()});`)();
  assert.equal(offline.compare({a:1},{a:2}).changes[0].path,'/a');
});

test('CLI prints actionable masked differences while JSON output remains report data', async () => {
  const dir=await mkdtemp(join(tmpdir(),'plumbcheck-diff-'));
  try {
    const {safe}=await loadExamples();
    safe.cases[0].calls[0].arguments={orderId:'changed',api_key:'attempted-private'};
    safe.cases[0].fixtures[0].arguments.api_key='expected-private';
    const file=join(dir,'contract.json');await writeFile(file,JSON.stringify(safe));
    const human=cli('run',file);assert.equal(human.status,1,human.stderr);assert.match(human.stdout,/"\/orderId".*expected "ORD-1042".*actual "changed"/);
    const json=cli('run',file,'--json');assert.equal(json.status,1);assert.equal(JSON.parse(json.stdout).passed,false);
    const report=await runSuite(safe);const junit=toJUnit(report);
    for(const text of [human.stdout,json.stdout,junit]) for(const secret of ['attempted-private','expected-private']) assert.ok(!text.includes(secret));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
