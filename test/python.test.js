import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('standard-library Python adapter runs actual choices, reports regressions and catches swallowed failures', () => {
  const code = `
import sys
sys.path.insert(0, 'adapters/python')
from plumbcheck import ReplayClient, ContractFailed
with ReplayClient('examples/customer-support/safe.json', 'Read-only order lookup') as client:
    result = client.call_tool('orders.lookup', {'orderId': 'ORD-1042'})
    assert result
assert client.report['passed']
try:
    with ReplayClient('examples/customer-support/safe.json', 'Read-only order lookup') as client:
        try: client.call_tool('orders.lookup', {'orderId': 'WRONG'})
        except ContractFailed: pass
except ContractFailed:
    assert client.report['passed'] is False
else:
    raise AssertionError('Swallowed tool failure must still fail the run')
print('Python adapter verified')
`;
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 20000, env: { ...process.env, PLUMBCHECK_NODE: process.execPath } });
  assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /verified/);
});
