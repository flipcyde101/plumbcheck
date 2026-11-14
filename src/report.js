import { readFile } from 'node:fs/promises';
import { redact } from './redact.js';

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toJUnit(report) {
  const r = redact(report);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="${escapeHtml(r.name)}" tests="${r.summary.total}" failures="${r.summary.failed}" time="${r.durationMs / 1000}">${r.cases.map((c) => `<testcase name="${escapeHtml(c.name)}" classname="PlumbCheck">${c.passed ? '' : `<failure message="${escapeHtml(c.failures[0].message)}">${escapeHtml(c.failures.map((f) => `${f.code}: ${f.message}`).join('\n'))}</failure>`}</testcase>`).join('')}</testsuite></testsuites>\n`;
}

export async function toHtml(report) {
  const template = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  // JSON lives in a non-executable script element. Escape < to prevent closing it.
  const payload = JSON.stringify(redact(report)).replace(/</g, '\\u003c');
  return template.replace('/*__REPORT__*/null', () => payload);
}
