import { readFile } from 'node:fs/promises';
import { redact } from './redact.js';
import { createArtifactTools } from './artifacts.js';
import { createContractValidator } from './contract.js';
import { createDiffTools } from './diff.js';
import { startWorkbench } from '../web/workbench.js';
import { startWorkspaceUI } from '../web/workspace.js';
import { createScenarioTools } from './scenario-builder.js';
import { mountScenarioBuilder } from '../web/scenario-builder.js';
import { version } from './version.js';

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toJUnit(report) {
  const r = redact(report);
  const diffs = createDiffTools(redact);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="${escapeHtml(r.name)}" tests="${r.summary.total}" failures="${r.summary.failed}" time="${r.durationMs / 1000}">${r.cases.map((c) => `<testcase name="${escapeHtml(c.name)}" classname="PlumbCheck">${c.passed ? '' : `<failure message="${escapeHtml(c.failures[0].message)}">${escapeHtml(c.failures.map((f) => [`${f.code}: ${f.message}`, diffs.format(diffs.forFailure(c, f))].filter(Boolean).join('\n')).join('\n'))}</failure>`}</testcase>`).join('')}</testsuite></testsuites>\n`;
}

export async function toHtml(report) {
  const template = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  // JSON lives in a non-executable script element. Escape < to prevent closing it.
  const payload = JSON.stringify(redact(report)).replace(/</g, '\\u003c');
  const helpers = `(${createArtifactTools.toString()})(${redact.toString()}, (${createContractValidator.toString()})())`;
  const bindings = { REPORT: payload, ARTIFACT_TOOLS: helpers, DIFF_TOOLS: `(${createDiffTools.toString()})(${redact.toString()})`, SCENARIO_TOOLS: `(${createScenarioTools.toString()})(${createContractValidator.toString()}())`, SCENARIO_BUILDER: `(${mountScenarioBuilder.toString()})`, WORKBENCH: `(${startWorkbench.toString()})`, WORKSPACE: `(${startWorkspaceUI.toString()})`, VERSION: escapeHtml(version) };
  // One pass: marker-like strings inside report data must never be reprocessed.
  return template.replace(/\/\*__(REPORT|ARTIFACT_TOOLS|DIFF_TOOLS|SCENARIO_TOOLS|SCENARIO_BUILDER|WORKBENCH|WORKSPACE|VERSION)__\*\/null/g, (_match, key) => bindings[key]);
}
