#!/usr/bin/env node
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { startSyncRelay } from '../src/sync-relay.js';

const experimental = '[experimental] plumbcheck-sync and the snapshot format may change in any release. See docs/STABILITY.md.';
const usage = 'Usage: plumbcheck-sync --data <private relay directory>';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log(`${experimental}\n${usage}`); process.exit(0); }
  if (args.length !== 2 || args[0] !== '--data') throw new Error(`${experimental}\n${usage}`);
  const directory = resolve(args[1]); await mkdir(directory, { recursive: true, mode: 0o700 });
  const keyFile = resolve(directory, 'owner-token.txt'); let ownerToken;
  try { ownerToken = (await readFile(keyFile, 'utf8')).trim(); }
  catch (e) { if (e.code !== 'ENOENT') throw e; ownerToken = randomBytes(32).toString('hex'); await writeFile(keyFile, ownerToken, { flag: 'wx', mode: 0o600 }); }
  const server = await startSyncRelay({ directory, port: Number(process.env.PORT || 4181), ownerToken });
  console.log(`${experimental}\nPlumbCheck snapshot relay: http://127.0.0.1:${server.address().port}\nOwner credential saved privately in ${keyFile}.\nUse a reviewed HTTPS reverse proxy before connecting another device. Provider keys never belong on this relay.`);
} catch (e) { console.error(e.message); process.exitCode = 2; }
