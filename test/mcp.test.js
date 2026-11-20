import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const initialize = (id = 0) => rpc(id,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'plumcheck-raw-test',version:'1.0.0'}});
const execute = (messages, name = 'Read-only order lookup') => {
  const result = spawnSync(process.execPath, ['bin/plumbcheck-mcp.js', 'examples/customer-support/safe.json', name], { cwd, encoding:'utf8', input:messages.map(m=>typeof m==='string'?m:JSON.stringify(m)).join('\n')+'\n', timeout:10_000 });
  return { ...result, responses:result.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)) };
};
test('MCP initialization, discovery, and fixture replay over real stdio', () => {
  const r=execute([initialize(),{jsonrpc:'2.0',method:'notifications/initialized'},rpc(1,'tools/list'),rpc(2,'tools/call',{name:'orders.lookup',arguments:{orderId:'ORD-1042'}})]);
  assert.equal(r.status,0,r.stderr); assert.equal(r.responses.length,3);
  assert.equal(r.responses[0].result.protocolVersion,'2025-11-25');
  assert.equal(r.responses[1].result.tools[0].name,'orders.lookup');
  assert.equal(r.responses[2].result.structuredContent.status,'shipped');
});
test('MCP rejects invalid JSON, batches, unsupported methods, and pre-init calls', () => {
  const r=execute(['{broken',[],rpc(1,'tools/list'),initialize(2),rpc(3,'resources/list'),rpc(4,'tools/call',{name:'orders.lookup',arguments:{orderId:'ORD-1042'}})]);
  assert.equal(r.status,0,r.stderr);
  assert.deepEqual(r.responses.slice(0,3).map(m=>m.error.code),[-32700,-32600,-32000]);
  assert.equal(r.responses[4].error.code,-32601);
});
test('MCP missing or mismatched fixtures never invoke a live tool', () => {
  const r=execute([initialize(1),rpc(2,'tools/call',{name:'orders.lookup',arguments:{orderId:'WRONG'}})]);
  assert.equal(r.status,1); assert.equal(r.responses[1].result.isError,true);
  assert.match(r.responses[1].result.content[0].text,/ARGUMENT_MISMATCH/);
});
test('MCP denied tools fail even if called directly without discovery', () => {
  const r=execute([initialize(1),rpc(2,'tools/call',{name:'orders.delete',arguments:{orderId:'ORD-1042'}})]);
  assert.equal(r.status,1); assert.match(r.responses[1].result.content[0].text,/DENIED_TOOL/);
});
test('MCP missing case reports errors only to stderr', () => {
  const r=execute([], 'missing');assert.equal(r.status,2);assert.equal(r.stdout,'');assert.match(r.stderr,/Unknown case/);
});
test('MCP rejects malformed and repeated initialization without resetting the session',()=>{
  const r=execute([rpc(0,'initialize',{}),initialize(1),initialize(2),rpc(3,'tools/call',{name:'orders.lookup',arguments:{orderId:'ORD-1042'}})]);
  assert.equal(r.status,0,r.stderr);assert.equal(r.responses[0].error.code,-32602);assert.equal(r.responses[2].error.code,-32600);
  assert.equal(r.responses[3].result.structuredContent.status,'shipped');
});
test('MCP discovery lists denied tools so an agent attempt is observable', () => {
  const r=execute([initialize(1),rpc(2,'tools/list')]);
  const names=r.responses[1].result.tools.map(t=>t.name);
  assert.ok(names.includes('orders.delete'),names.join());
  assert.ok(!JSON.stringify(r.responses[1].result).includes('ORD-1042'));
});
test('MCP serves agent-mode contracts, lists declared descriptions and reports skipped output checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plumbcheck-mcp-'));
  const file = join(dir, 'agent.json');
  writeFileSync(file, JSON.stringify({ version: 1, name: 'Agent MCP', tools: { 'orders.lookup': { description: 'Find one order.' } }, policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Lookup', input: { orderId: 'A' }, fixtures: [{ tool: 'orders.lookup', arguments: { orderId: 'A' }, result: { status: 'shipped' } }], expect: { outputChecks: [{ contains: 'shipped' }] } }] }));
  const r = spawnSync(process.execPath, ['bin/plumbcheck-mcp.js', file, 'Lookup'], { cwd, encoding: 'utf8', input: [initialize(1), rpc(2, 'tools/list'), rpc(3, 'tools/call', { name: 'orders.lookup', arguments: { orderId: 'A' } })].map(m => JSON.stringify(m)).join('\n') + '\n', timeout: 10_000 });
  const responses = r.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(responses[1].result.tools[0].description, 'Find one order.');
  assert.match(r.stderr, /OUTPUT_CHECKS_SKIPPED: 1/);
});
