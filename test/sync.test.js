import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startSyncRelay } from '../src/sync-relay.js';
import { syncRequest, syncURL } from '../src/sync-client.js';
import { loadExamples, startStudio } from '../src/studio.js';

test('pair, upload, retrieve, import and revoke work without leaking credentials or overwriting edits', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-sync-'));
  const owner = randomBytes(32).toString('hex');
  const relay = await startSyncRelay({ directory: join(directory, 'relay'), port: 0, ownerToken: owner });
  const app = await startStudio({ port: 0, workspaceDirectory: join(directory, 'app') });
  t.after(async () => { await app.shutdown(); await new Promise(r => relay.close(r)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${relay.address().port}`;
  const origin = `http://127.0.0.1:${app.address().port}`;
  const post = async (path, body) => { const r = await fetch(origin + '/api/sync/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${app.workspaceToken}` }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  await assert.rejects(syncRequest(url, '/v1/snapshots'), /Authorize/);
  const pairing = await syncRequest(url, '/v1/pairings', { token: owner, method: 'POST', body: {} });
  assert.equal((await post('pair', { url, code: pairing.code, name: 'Windows' })).status, 200);
  await assert.rejects(syncRequest(url, '/v1/pair', { method: 'POST', body: { code: pairing.code, name: 'replay' } }), /invalid|expired/);
  const p = await app.workspace.saveProject({ name: 'Support', contract: (await loadExamples()).safe });
  const denied = await post('upload', { projectId: p.id }); assert.equal(denied.status, 400);
  const uploaded = await post('upload', { projectId: p.id, consent: true }); assert.equal(uploaded.status, 200);
  const list = await post('list', {}); assert.equal(list.body.length, 1);
  const imported = await post('import', { snapshotId: uploaded.body.id }); assert.equal(imported.status, 200); assert.notEqual(imported.body.project.id, p.id);
  assert.equal(app.workspace.project(p.id).revision, 1); assert.equal(app.workspace.summary().projects.length, 2);
  const phonePair = await syncRequest(url, '/v1/pairings', { token: owner, method: 'POST', body: {} });
  const phone = await syncRequest(url, '/v1/pair', { method: 'POST', body: { code: phonePair.code, name: 'Android' } });
  assert.equal((await syncRequest(url, '/v1/snapshots', { token: phone.token })).length, 1);
  await syncRequest(url, `/v1/devices/${phone.deviceId}/revoke`, { method: 'POST', token: owner, body: {} });
  await assert.rejects(syncRequest(url, '/v1/snapshots', { token: phone.token }), /Authorize/);
  const devices = JSON.parse(await readFile(join(directory, 'relay', 'devices.json'), 'utf8'));
  assert.ok(!JSON.stringify(devices).includes(phone.token));
  for (const file of await readdir(join(directory, 'relay'))) if (/^[a-f0-9-]{36}\.json$/.test(file)) assert.ok(!JSON.stringify(JSON.parse(await readFile(join(directory, 'relay', file), 'utf8'))).includes('tokenHash'));
});

test('sync refuses insecure remote destinations and credentials in URLs', () => {
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com?token=secret', 'file:///tmp/file']) assert.throws(() => syncURL(url));
});
