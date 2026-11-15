import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createVault } from '../desktop/runtime/vault.cjs';

test('desktop vault uses the current async encryption API and reopens encrypted credentials', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-vault-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = randomBytes(32);
  const storage = {
    async isAsyncEncryptionAvailable() { return true; },
    async encryptStringAsync(value) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([c.update(value, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), encrypted]); },
    async decryptStringAsync(value) { const d = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); d.setAuthTag(value.subarray(12, 28)); return { result: Buffer.concat([d.update(value.subarray(28)), d.final()]).toString('utf8'), shouldReEncrypt: false }; },
  };
  const first = await createVault(directory, storage); await first.set('example', 'SYNTHETIC_PRIVATE_CREDENTIAL');
  assert.ok(!(await readFile(join(directory, 'credentials.json'), 'utf8')).includes('SYNTHETIC_PRIVATE_CREDENTIAL'));
  const reopened = await createVault(directory, storage); assert.equal(await reopened.get('example'), 'SYNTHETIC_PRIVATE_CREDENTIAL');
  await reopened.delete('example'); assert.equal(await reopened.get('example'), undefined);
});

test('unavailable OS encryption leaves an offline-capable session vault without writing plaintext', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'plumbcheck-transient-vault-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const vault = await createVault(directory, { async isAsyncEncryptionAvailable() { return false; } });
  assert.equal(vault.persistent, false); await vault.set('example', 'SYNTHETIC'); assert.equal(await vault.get('example'), 'SYNTHETIC');
  await assert.rejects(readFile(join(directory, 'credentials.json')), { code: 'ENOENT' });
});
