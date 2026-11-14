import test from 'node:test';
import assert from 'node:assert/strict';
import { copyJson } from '../src/json-data.js';

test('output copying preserves plain JSON and aliases without sharing objects',()=>{
  const shared={ok:true};const input={a:shared,b:shared,empty:null,values:[0,false,'']};
  const copy=copyJson(input);assert.deepEqual(copy,input);assert.notEqual(copy.a,shared);assert.notEqual(copy.a,copy.b);
});
test('output copying rejects cycles, non-finite values, holes, and non-JSON objects',()=>{
  const cycle={};cycle.self=cycle;
  for(const value of [cycle,NaN,Infinity,1n,Symbol('x'),()=>{},undefined,new Date(),new Map(),new Set(),{x:undefined},[,,],{[Symbol('x')]:true}]) {
    assert.throws(()=>copyJson(value),/JSON/);
  }
});
test('output copying preserves __proto__ as data without changing object prototypes',()=>{
  const value=JSON.parse('{"__proto__":{"polluted":true},"constructor":"data"}');
  const copy=copyJson(value);assert.equal(Object.getPrototypeOf(copy),Object.prototype);assert.equal({}.polluted,undefined);
  assert.deepEqual(copy,value);
});
