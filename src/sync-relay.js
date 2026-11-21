import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { replaceFile } from './replace-file.js';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { jsonBody } from './workspace-http.js';
import { validateSuite } from './validation.js';
import { redact } from './redact.js';
import { createArtifactTools } from './artifacts.js';
import { createSnapshotTools } from './snapshot.js';

const hash = token => createHash('sha256').update(token).digest('hex');
const random = () => randomBytes(32).toString('hex');
const deviceId = token => hash(token).slice(0, 32);
const MOBILE_ORIGIN = 'https://appassets.androidplatform.net';
const bad = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };

/** Single-owner immutable snapshot relay. Deploy behind authenticated HTTPS.
 * It never holds provider keys, executes agents, or replaces existing snapshots. */
export async function startSyncRelay({ directory, port = 4181, ownerToken } = {}) {
  if (!ownerToken || !/^[a-f0-9]{64}$/.test(ownerToken)) bad('An owner token of 32 random bytes (64 hex characters) is required.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const devicesFile = join(directory, 'devices.json');
  let devices;
  try { devices = JSON.parse(await readFile(devicesFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; devices = {}; }
  const pairings = new Map(), attempts = new Map();
  const snapshots = createSnapshotTools(createArtifactTools(redact, validateSuite));
  let queue = Promise.resolve();
  async function saveDevices(update) {
    const operation = queue.then(async () => {
      const next = { ...devices }; update(next);
      const temporary = `${devicesFile}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 }); await replaceFile(temporary, devicesFile); devices = next; }
      finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    });
    queue = operation.catch(() => {}); return operation;
  }
  const server = createServer(async (req, res) => {
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    // Only the fixed bundled Android origin may read cross-origin results. All
    // data still requires a per-device bearer token. Browser Studio proxies it.
    if (req.headers.origin === MOBILE_ORIGIN) { res.setHeader('Access-Control-Allow-Origin', MOBILE_ORIGIN); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS' && req.headers.origin === MOBILE_ORIGIN) { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.writeHead(204); res.end(); return; }
    const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const owner = token.length === 64 && hash(token) === hash(ownerToken);
    const device = devices[deviceId(token)];
    const permitted = owner || (device && !device.revoked && device.tokenHash === hash(token));
    try {
      if (req.method === 'POST' && req.url === '/v1/pair') {
        const address = req.socket.remoteAddress;
        const now = Date.now(); const rate = attempts.get(address);
        if (rate && rate.until > now && rate.count >= 10) bad('Too many pairing attempts. Try again in a minute.', 429);
        attempts.set(address, { until: now + 60000, count: rate?.until > now ? rate.count + 1 : 1 });
        const body = await jsonBody(req, 2000);
        const pending = pairings.get(hash(String(body.code)));
        if (!pending || pending.expires < now) bad('Pairing code is invalid or expired.', 401);
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) bad('A device name is required.');
        pairings.delete(hash(body.code));
        const nextToken = random(), id = deviceId(nextToken);
        await saveDevices(s => { if (Object.keys(s).length >= 100) bad('Device registry is full.'); s[id] = { id, name: body.name.trim(), tokenHash: hash(nextToken), createdAt: new Date().toISOString(), revoked: false }; });
        return json(201, { deviceId: id, token: nextToken });
      }
      if (!permitted) return json(401, { error: 'Authorize this device before accessing snapshots.' });
      if (req.method === 'POST' && req.url === '/v1/pairings') {
        if (!owner) return json(403, { error: 'Only the owner may pair or revoke devices.' });
        for (const [key, value] of pairings) if (value.expires < Date.now()) pairings.delete(key);
        if (pairings.size >= 10) bad('Too many pending pairing codes.', 429);
        const code = random(); pairings.set(hash(code), { expires: Date.now() + 300000 });
        return json(201, { code, expiresInSeconds: 300 });
      }
      if (req.method === 'GET' && req.url === '/v1/devices') { if (!owner) return json(403, { error: 'Owner access required.' }); return json(200, Object.values(devices).map(({ tokenHash, ...d }) => d)); }
      if (req.method === 'POST' && /^\/v1\/devices\/[a-f0-9]{32}\/revoke$/.test(req.url)) {
        if (!owner) return json(403, { error: 'Owner access required.' });
        const id = req.url.split('/')[3]; await saveDevices(s => { if (!s[id]) bad('Device not found.', 404); s[id] = { ...s[id], revoked: true }; }); return json(200, { revoked: true });
      }
      if (req.method === 'GET' && req.url === '/v1/snapshots') {
        const files = (await readdir(directory)).filter(f => /^[a-f0-9-]{36}\.json$/.test(f));
        const result = [];
        for (const file of files) { const s = JSON.parse(await readFile(join(directory, file), 'utf8')); result.push({ id: s.id, name: s.project.name, revision: s.project.revision, createdAt: s.createdAt, sourceDevice: s.sourceDevice }); }
        return json(200, result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }
      if (req.method === 'POST' && req.url === '/v1/snapshots') {
        if ((await readdir(directory)).filter(f => /^[a-f0-9-]{36}\.json$/.test(f)).length >= 250) bad('Snapshot capacity reached. Owner must archive the relay before adding more.', 413);
        const input = await jsonBody(req, 2_000_000);
        const value = snapshots.snapshot({ version: 1, id: randomUUID(), createdAt: new Date().toISOString(), sourceDevice: owner ? 'Owner' : device.name, project: input.project, ...(input.report !== undefined ? { report: input.report } : {}), ...(input.reportContext !== undefined ? { reportContext: input.reportContext } : {}) });
        await writeFile(join(directory, `${value.id}.json`), JSON.stringify(value), { flag: 'wx', mode: 0o600 });
        return json(201, { id: value.id, createdAt: value.createdAt });
      }
      if (req.method === 'GET' && /^\/v1\/snapshots\/[a-f0-9-]{36}$/.test(req.url)) {
        try { return json(200, JSON.parse(await readFile(join(directory, `${req.url.split('/')[3]}.json`), 'utf8'))); }
        catch (e) { if (e.code === 'ENOENT') return json(404, { error: 'Snapshot not found.' }); throw e; }
      }
      return json(404, { error: 'Not found.' });
    } catch (e) { return json(e.status || 400, { error: e.status ? e.message : 'Invalid request or storage failure.' }); }
  });
  server.requestTimeout = 15000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
