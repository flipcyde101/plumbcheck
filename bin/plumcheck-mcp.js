#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { serveMcp } from '../src/mcp.js';

// stdout is reserved for JSON-RPC. Diagnostics go to stderr.
try {
  const [path, caseName, ...extra] = process.argv.slice(2);
  if (!path || !caseName || extra.length) throw new Error('Usage: plumcheck-mcp <suite.json> "<case name>"');
  const suite = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  const { complete, session } = await serveMcp(suite, caseName);
  process.exitCode = complete && session.events.every(e => e.status === 'replayed') ? 0 : 1;
} catch (error) { console.error(`PlumbCheck MCP: ${error.message}`); process.exitCode = 2; }
