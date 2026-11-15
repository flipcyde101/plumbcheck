const { mkdir, readFile, writeFile, rename, unlink } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');

// Windows DPAPI encryption is bound to the signed-in OS user. Never return keys
// to the renderer or include them in project/history records.
exports.createVault = async function createVault(directory, safeStorage) {
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    const transient = new Map();
    return { persistent: false, async get(id) { return transient.get(id); }, async set(id, value) { transient.set(id, value); }, async delete(id) { transient.delete(id); } };
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'credentials.json');
  let keys = {};
  try { keys = JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Credential storage could not be read. Restore a reviewed backup.'); }
  let queue = Promise.resolve();
  const change = update => {
    const next = queue.then(async () => {
      const value = { ...keys }; await update(value);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); await rename(temporary, file); keys = value; }
      finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    });
    queue = next.catch(() => {}); return next;
  };
  return {
    persistent: true,
    async get(id) {
      await queue;
      if (!keys[id]) return undefined;
      const original = keys[id];
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(original, 'base64'));
      if (decrypted.shouldReEncrypt) await change(async keys => { if (keys[id] === original) keys[id] = (await safeStorage.encryptStringAsync(decrypted.result)).toString('base64'); });
      return decrypted.result;
    },
    set(id, value) { return change(async keys => { keys[id] = (await safeStorage.encryptStringAsync(value)).toString('base64'); }); },
    delete(id) { return change(keys => { delete keys[id]; }); },
  };
};
