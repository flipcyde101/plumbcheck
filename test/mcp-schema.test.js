import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureInputSchema, mcpResult } from '../src/mcp-schema.js';

test('tool discovery infers parameter types without disclosing fixture values',()=>{
  const schema=fixtureInputSchema([{arguments:{orderId:'PRIVATE-ORDER',auth:{token:'PRIVATE-TOKEN'},tags:['PRIVATE-TAG'],amount:10.5,active:true,empty:null}}]);
  assert.equal(schema.properties.orderId.type,'string');assert.equal(schema.properties.auth.properties.token.type,'string');
  assert.equal(schema.properties.tags.items.type,'string');assert.equal(schema.properties.amount.type,'number');
  assert.equal(schema.additionalProperties,false);assert.deepEqual(schema.required,['orderId','auth','tags','amount','active','empty']);
  const serialized=JSON.stringify(schema);for(const secret of ['PRIVATE-ORDER','PRIVATE-TOKEN','PRIVATE-TAG'])assert.ok(!serialized.includes(secret));
});
test('tool discovery describes alternatives for different fixture argument shapes',()=>{
  const schema=fixtureInputSchema([{arguments:{id:1}},{arguments:{name:'A'}},{arguments:{name:'B'}}]);
  assert.equal(schema.type,'object');assert.equal(schema.anyOf.length,2);
  assert.deepEqual(schema.anyOf[0].required,['id']);assert.deepEqual(schema.anyOf[1].required,['name']);
});
test('schema generation preserves dangerous-looking keys as own data',()=>{
  const schema=fixtureInputSchema([{arguments:JSON.parse('{"__proto__":{"x":"y"}}')}]);
  assert.equal(Object.getPrototypeOf(schema.properties),Object.prototype);assert.equal(schema.properties.__proto__.type,'object');assert.equal({}.x,undefined);
});
test('plain object responses receive an MCP text and structured envelope',()=>{
  assert.deepEqual(mcpResult({ok:true}),{content:[{type:'text',text:'{"ok":true}'}],structuredContent:{ok:true}});
});
test('primitives and arrays are valid text results without an invalid structuredContent field',()=>{
  for(const value of [null,false,0,'hello',[1,2]])assert.deepEqual(mcpResult(value),{content:[{type:'text',text:JSON.stringify(value)}]});
});
test('recorded MCP results are preserved instead of double-wrapped',()=>{
  const result={content:[{type:'text',text:'A recorded response'}],structuredContent:{ok:true}};
  assert.equal(mcpResult(result),result);
});
