#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createControlServer } from '../src/control.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function startControl() { try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--connect')) throw new Error('Usage: plumbcheck-control [--connect <PlumbCheck bridge.json>]');
  const file = args[1] || process.env.PLUMBCHECK_BRIDGE || (process.platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'PlumbCheck', 'bridge.json') : join(homedir(), '.plumbcheck', 'bridge.json'));
  const server = createControlServer(async (tool, args) => {
    // Reload the descriptor so a restarted application can rotate its token/port.
    const descriptor = JSON.parse(await readFile(file, 'utf8'));
    const url = new URL(descriptor.url);
    if (descriptor.version !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^[a-f0-9]{64}$/.test(descriptor.token)) throw new Error('Invalid application connection descriptor.');
    const response = await fetch(new URL('/api/control', url), { method: 'POST', headers: { Authorization: `Bearer ${descriptor.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, arguments: args }), redirect: 'error', signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Application request failed.');
    return result;
  });
  await server.connect(new StdioServerTransport());
} catch { process.stderr.write('PlumbCheck control could not start. Use --connect with the running app’s bridge.json.\n'); process.exitCode = 2; } }
startControl();
