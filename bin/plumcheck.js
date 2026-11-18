#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { runSuite } from '../src/runner.js';
import { runAgentSuite } from '../src/agent-runner.js';
import { validateSuite } from '../src/validation.js';
import { toHtml, toJUnit } from '../src/report.js';
import { redact } from '../src/redact.js';
import { createDiffTools } from '../src/diff.js';
import { loadExamples, startStudio } from '../src/studio.js';

const help = `PlumbCheck · Test the work. Trust the agent.

Usage:
  plumbcheck studio [--port 4173]        Open the local test workbench
  plumbcheck demo [--out reports/demo]   Run an intentionally failing demo
  plumbcheck run suite.json [options]    Run your tool-call contract

Options:
  --agent <module>   Test a trusted local module's default function (run only)
  --out <directory>  Write report.html, report.json, and junit.xml
  --json             Print masked report JSON to stdout
  --help             Show this help
  --version          Print the package version

Exit codes: 0 passed; 1 contract failure; 2 invalid input or runtime error.
Replay never connects to a live tool. Demo deliberately returns exit code 1.
Agent modules execute trusted local JavaScript; they are NOT sandboxed.
`;

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args[0] === 'help') return console.log(help);
  if (args[0] === '--version') return console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version);
  const command = args.shift();
  if (!['run', 'demo', 'studio'].includes(command)) throw new Error(`Unknown command "${command}". Run with --help.`);
  const options = {};
  let file;
  while (args.length) {
    const arg = args.shift();
    if (['--out', '--port', '--agent'].includes(arg)) {
      if (!args.length || args[0].startsWith('--')) throw new Error(`${arg} needs a value.`);
      options[arg.slice(2)] = args.shift();
    } else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && command === 'run' && !file) file = arg;
    else throw new Error(`Unexpected argument "${arg}".`);
  }
  if (command === 'studio') {
    if (options.out || options.json || options.agent) throw new Error('Studio accepts only --port.');
    const port = options.port === undefined ? 4173 : Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
    const server = await startStudio({ port, workspaceDirectory: resolve(process.env.PLUMBCHECK_HOME || resolve(homedir(), '.plumbcheck')) });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.shutdown().then(() => process.exit(0)));
    console.log(`\nPlumbCheck Studio private launch link → ${server.uiURL}\nKeep this local launch link private.\nLocal projects · Fixture and model testing · Keys are session-only in source Studio\nPress Ctrl+C to stop.\n`);
    return;
  }
  if (options.port) throw new Error('--port is only available for studio.');
  if (options.agent && command !== 'run') throw new Error('--agent is only available for run.');
  if (command === 'run' && !file) throw new Error('A suite JSON file is required.');
  const suite = command === 'demo' ? (await loadExamples()).regression : JSON.parse((await readFile(resolve(file), 'utf8')).replace(/^\uFEFF/, ''));
  let report;
  if (options.agent) {
    validateSuite(suite, { mode: 'agent' });
    const module = await import(pathToFileURL(resolve(options.agent)).href);
    report = await runAgentSuite(suite, module.default);
  } else report = await runSuite(suite);
  if (options.out || command === 'demo') {
    const out = resolve(options.out ?? 'reports/demo');
    await mkdir(out, { recursive: true });
    for (const [name, value] of [['report.html', await toHtml(report)], ['report.json', JSON.stringify(redact(report), null, 2) + '\n'], ['junit.xml', toJUnit(report)]]) {
      await writeFile(resolve(out, name), value);
    }
    if (!options.json) console.log(`\nReports → ${out}`);
  }
  if (options.json) console.log(JSON.stringify(redact(report), null, 2));
  else {
    const diffs = createDiffTools(redact);
    console.log(`\nPlumbCheck · ${report.name}\nMode: ${report.mode === 'agent-replay' ? 'agent replay (trusted local code; not sandboxed)' : 'planned calls (no agent executed: compares the calls written in the contract with its fixtures)'}\n`);
    for (const c of report.cases) {
      console.log(`${c.passed ? 'PASS' : 'FAIL'}  ${c.name}`);
      for (const failure of c.failures) {
        console.log(`      ${failure.code}: ${failure.message}`);
        const detail = diffs.forFailure(c, failure);
        if (detail) console.log(diffs.format(detail).split('\n').map(line => `        ${line}`).join('\n'));
      }
    }
    console.log(`\n${report.summary.passed}/${report.summary.total} passed · ${report.summary.blocked} blocked calls · 0 live tool calls through replay\n`);
  }
  process.exitCode = report.passed ? 0 : 1;
}

main().catch((error) => { console.error(`PlumbCheck: ${error.message}`); process.exitCode = 2; });
