#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveMcp } from '../src/mcp.js';
import { toHtml, toJUnit } from '../src/report.js';
import { redact } from '../src/redact.js';

// stdout is reserved for JSON-RPC. Diagnostics go to stderr.
try {
  const [path, caseName, ...extra] = process.argv.slice(2);
  if (!path || !caseName || (extra.length && (extra.length !== 2 || extra[0] !== '--out' || !extra[1] || extra[1].startsWith('--')))) throw new Error('Usage: plumbcheck-mcp <suite.json> "<case name>" [--out <directory>]');
  const suite = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  const { report } = await serveMcp(suite, caseName);
  if (extra.length) {
    const out = resolve(extra[1]);
    await mkdir(out, { recursive: true });
    for (const [name, content] of [['report.html', await toHtml(report)], ['report.json', JSON.stringify(redact(report), null, 2) + '\n'], ['junit.xml', toJUnit(report)]]) await writeFile(resolve(out, name), content);
    console.error(`PlumbCheck MCP evidence → ${out}`);
  }
  process.exitCode = report.passed ? 0 : 1;
} catch (error) { console.error(`PlumbCheck MCP: ${error.message}`); process.exitCode = 2; }
