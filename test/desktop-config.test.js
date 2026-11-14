import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readDesktopContract, makeMcpSetup } from '../desktop/runtime/config.mjs';
import { loadExamples } from '../src/studio.js';

test('desktop MCP setup preserves paths and case names with spaces as separate arguments', async () => {
  const { safe } = await loadExamples();
  const paths={executable:resolve('App Folder/resources/mcp-runtime/node.exe'),runnerScript:resolve('App Folder/resources/mcp-runtime/bin/plumbcheck-mcp.js'),contractPath:resolve('My contracts/order.json'),reportPath:resolve('My reports/run 1')};
  const setup=makeMcpSetup(safe,'Approved customer update',paths);
  assert.deepEqual(setup.config.mcpServers.plumbcheck,{command:paths.executable,args:[paths.runnerScript,paths.contractPath,'Approved customer update','--out',paths.reportPath]});
  assert.equal(setup.contractPath,paths.contractPath);
});
test('desktop setup rejects nonexistent cases, invalid contracts, and relative paths', async () => {
  const { safe }=await loadExamples();const paths={executable:resolve('node.exe'),runnerScript:resolve('plumbcheck-mcp.js'),contractPath:resolve('contract.json'),reportPath:resolve('reports')};
  assert.throws(()=>makeMcpSetup(safe,'missing',paths),/Choose a case/);
  assert.throws(()=>makeMcpSetup({...safe,policies:{allow:['read'],typo:true}},safe.cases[0].name,paths),/unknown/);
  assert.throws(()=>makeMcpSetup(safe,safe.cases[0].name,{...paths,contractPath:'relative.json'}),/absolute/);
});
test('desktop contract input is validated and byte-limited before a save dialog', async () => {
  const {safe}=await loadExamples();assert.equal(readDesktopContract('\uFEFF'+JSON.stringify(safe)).name,safe.name);
  assert.throws(()=>readDesktopContract('x'.repeat(1000001)),/1 MB/);
  assert.throws(()=>readDesktopContract('é'.repeat(500001)),/1 MB/);
  assert.throws(()=>readDesktopContract('{}'),/Invalid suite/);
  assert.throws(()=>readDesktopContract('['.repeat(70)+'0'+']'.repeat(70)),/64-level/);
});
