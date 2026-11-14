import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecorder, ReplaySession } from '../src/index.js';

test('snapshot waits for in-flight calls and produces replayable fixtures',async()=>{
  let finish;
  const recorder=createRecorder({async callTool(){await new Promise(resolve=>{finish=resolve;});return {status:'ready'};}});
  const call=recorder.callTool({name:'read',arguments:{id:1}});
  const snapshot=recorder.snapshot();let completed=false;snapshot.then(()=>{completed=true;});
  await Promise.resolve();assert.equal(completed,false);
  finish();await call;const fixtures=await snapshot;
  const replay=new ReplaySession({fixtures,policies:{allow:['read']}});
  assert.deepEqual(await replay.callTool({name:'read',arguments:{id:1}}),{status:'ready'});replay.verifyComplete();
});
test('snapshot captures calls present when requested, preserving invocation order',async()=>{
  let finish;
  const recorder=createRecorder({async callTool({name}){if(name==='first')await new Promise(resolve=>{finish=resolve;});return {name};}});
  const first=recorder.callTool({name:'first',arguments:{}});const snapshot=recorder.snapshot();
  await recorder.callTool({name:'later',arguments:{}});finish();await first;
  assert.deepEqual((await snapshot).map(f=>f.tool),['first']);
  assert.deepEqual((await recorder.snapshot()).map(f=>f.tool),['first','later']);
});
test('snapshot is independent of raw recording entries and prior snapshots',async()=>{
  const recorder=createRecorder({async callTool(){return {nested:{ok:true}};}});
  await recorder.callTool({name:'read',arguments:{id:1}});
  const first=await recorder.snapshot();first[0].result.nested.ok=false;first[0].arguments.id=99;
  const second=await recorder.snapshot();assert.equal(second[0].result.nested.ok,true);assert.equal(second[0].arguments.id,1);
});
test('snapshot preserves error fixtures while callTool still rejects',async()=>{
  const recorder=createRecorder({async callTool(){throw new Error('Disconnected');}});
  const call=recorder.callTool({name:'read',arguments:{}});
  const snapshot=recorder.snapshot();await assert.rejects(call,/Disconnected/);
  assert.deepEqual((await snapshot)[0].result,{isError:true,content:[{type:'text',text:'Disconnected'}]});
});
test('snapshot handles non-Error rejections without leaving an incomplete fixture',async()=>{
  const recorder=createRecorder({async callTool(){throw undefined;}});
  let rejected=false;try{await recorder.callTool({name:'read',arguments:{}});}catch(error){rejected=true;assert.equal(error,undefined);}
  assert.equal(rejected,true);assert.equal((await recorder.snapshot())[0].result.content[0].text,'undefined');
});
test('snapshot rejects non-JSON recordings instead of silently losing values',async()=>{
  for(const value of [undefined,1n,new Map([['a',1]])]){
    const recorder=createRecorder({async callTool(){return value;}});
    await recorder.callTool({name:'read',arguments:{}});
    await assert.rejects(recorder.snapshot(),{code:'RECORDING_NOT_JSON'});
  }
});
test('snapshot rejects externally corrupted incomplete entries',async()=>{
  const recorder=createRecorder({async callTool(){return {ok:true};}});
  await recorder.callTool({name:'read',arguments:{}});delete recorder.fixtures[0].result;
  await assert.rejects(recorder.snapshot(),{code:'RECORDING_INCOMPLETE'});
});
test('empty recorder snapshots are valid empty fixture sets',async()=>{
  const recorder=createRecorder({async callTool(){throw new Error('Must not be called');}});
  assert.deepEqual(await recorder.snapshot(),[]);
});
test('recorder always normalizes unusual thrown values to valid text fixtures',async()=>{
  const unreadable=Object.create(null);const throwingGetter=Object.defineProperty({},'message',{get(){throw new Error('Cannot read');}});
  for(const error of [{message:42},unreadable,throwingGetter]){
    const recorder=createRecorder({async callTool(){throw error;}});
    try{await recorder.callTool({name:'read',arguments:{}});}catch(actual){assert.equal(actual,error);}
    assert.equal(typeof (await recorder.snapshot())[0].result.content[0].text,'string');
  }
});
test('invalid recording arguments reject asynchronously without invoking the client',async()=>{
  let called=false;const recorder=createRecorder({async callTool(){called=true;return {};}});
  let operation;assert.doesNotThrow(()=>{operation=recorder.callTool({name:'read',arguments:{callback:()=>{}}});});
  await assert.rejects(operation);assert.equal(called,false);assert.deepEqual(await recorder.snapshot(),[]);
});
