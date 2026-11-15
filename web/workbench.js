/** Self-contained browser runtime, inlined into both Studio and saved reports. */
export function startWorkbench(artifacts, diffs) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = artifacts.escapeHtml;
  const studio = document.body.dataset.studio === 'true';
  const desktop = studio && typeof window.plumbcheckDesktop?.createMcpSetup === 'function';
  let report = JSON.parse($('report-data').textContent);
  let lastLocalReport = report;
  let selected = report?.cases.findIndex(c => !c.passed) ?? 0;
  let examples = null;
  let currentSuite = null;
  let busy = false;
  let viewingSavedReport = !studio;
  let sourceName = studio ? 'Local checks' : 'Saved report';
  let previousDraft = null;
  let activeView = 'overview';

  function showError(message) { $('error').textContent = message; $('error').hidden = false; }
  function clearError() { $('error').hidden = true; }
  function announce(message) { $('announcement').textContent = message; }
  function draftInfo() {
    try { return artifacts.contract(artifacts.parse($('editor').value)); }
    catch { return null; }
  }
  function updateControls() {
    const draft = draftInfo();
    const agent = draft?.runner === 'agent';
    for (const id of ['open-json', 'open-pasted', 'artifact-file', 'close-import', 'example', 'download-contract', 'undo-import', 'resume-local']) $(id).disabled = busy;
    $('rerun').disabled = busy || !studio || !currentSuite || agent;
    $('run-editor').disabled = busy || !studio || agent;
    $('fix').disabled = busy || !examples;
    $('fix').hidden = !studio || viewingSavedReport;
    $('rerun').hidden = !studio || viewingSavedReport;
    $('resume-local').hidden = !studio || !viewingSavedReport;
    $('undo-import').hidden = previousDraft === null;
    $('draft-note').classList.toggle('agent', agent);
    $('draft-note').textContent = agent
      ? 'AGENT-CODE CONTRACT / Edit and download here. Run it from the CLI with --agent; Studio does not execute JavaScript modules.'
      : 'Contract downloads include your fixture data. Review it before sharing.';
    $('mcp-connect').hidden = !desktop;
    const caseName = $('mcp-case').value;
    $('mcp-case').innerHTML = draft && !agent ? draft.value.cases.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('') : '';
    if (draft?.value.cases.some(c => c.name === caseName)) $('mcp-case').value = caseName;
    $('mcp-case').disabled = busy || !draft || agent;
    $('create-mcp').disabled = busy || !draft || agent;
    $('artifact-source').textContent = activeView === 'contract' ? `CONTRACT DRAFT / ${agent ? 'AGENT CODE · CLI RUNNER' : 'PLANNED TOOL CALLS'}` : viewingSavedReport ? `${sourceName} / READ ONLY · NOT RERUN` : 'LOCAL CHECKS / FIXTURE REPLAY';
    $('artifact-source').classList.toggle('saved-report', viewingSavedReport && activeView !== 'contract');
  }
  function setBusy(value) { busy = value; updateControls(); }
  function syncEditor(suite) {
    currentSuite = suite;
    const serialized = JSON.stringify(suite);
    $('example').value = Object.keys(examples || {}).find(key => JSON.stringify(examples[key]) === serialized) || 'custom';
    const pretty = JSON.stringify(suite, null, 2);
    $('editor').value = new TextEncoder().encode(pretty).byteLength <= artifacts.maxBytes ? pretty : serialized;
    updateControls();
  }
  function showView(name) {
    activeView = name;
    document.querySelector('.hero').hidden = name === 'workspace';
    document.querySelector('.hero-side').hidden = name === 'workspace';
    document.querySelector('.artifact-bar').hidden = name === 'workspace';
    for (const view of ['overview', 'contract', 'guide', 'workspace']) if ($(view)) $(view).hidden = view !== name;
    document.querySelectorAll('nav button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    updateControls();
  }
  function setImportPanel(open) {
    $('import-panel').hidden = !open;
    $('open-json').setAttribute('aria-expanded', String(open));
    if (open) $('import-text').focus();
  }
  function evidence(value, title) {
    return `<div class="event-body"><div class="eyebrow">${esc(title)}</div><pre>${esc(JSON.stringify(value, null, 2))}</pre></div>`;
  }
  function failureHtml(failure, c) {
    const raw = `${Object.hasOwn(failure, 'expected') ? evidence(failure.expected, 'Expected') : ''}${failure.actualMissing ? '<p class="muted">Actual value was missing.</p>' : Object.hasOwn(failure, 'actual') ? evidence(failure.actual, 'Actual') : ''}`;
    return `<section class="failure-detail"><p><code>${esc(failure.code)}</code><br>${esc(failure.message)}</p>${diffs.html(diffs.forFailure(c, failure), esc)}${raw ? `<details class="raw-evidence"><summary>Full expected / actual JSON</summary>${raw}</details>` : ''}</section>`;
  }
  function resetSelection() {
    selected = report.cases.findIndex(c => !c.passed);
    if (selected < 0) selected = 0;
    $('search').value = ''; $('filter').value = 'all';
  }
  function render() {
    updateControls();
    if (!report) { $('inspector').textContent = 'No report loaded. Open a report or run a contract to get started.'; return; }
    $('suite-name').textContent = report.name;
    $('mode-label').textContent = report.execution ? `MODEL / ${report.execution.provider} / ${report.execution.model}` : report.mode === 'agent-replay' ? 'AGENT CODE / REPLAY' : report.mode === 'mcp-replay' ? 'MCP CLIENT / REPLAY' : 'FIXTURE REPLAY';
    $('run-meta').textContent = `${report.passed ? 'PASSED' : 'FAILED'} · ${report.summary.total} check${report.summary.total === 1 ? '' : 's'} · ${report.durationMs} ms · ${new Date(report.createdAt).toLocaleString()}${report.execution ? ` · contract revision ${report.execution.contractRevision}` : ''}`;
    $('passed-count').innerHTML = `${report.summary.passed}<small> / ${report.summary.total}</small>`;
    $('failed-count').textContent = report.summary.failed;
    $('failed-count').style.color = report.summary.failed ? 'var(--red)' : 'var(--ink)';
    $('blocked-count').textContent = report.summary.blocked;
    const query = $('search').value.toLowerCase();
    const filter = $('filter').value;
    const visible = report.cases.map((c, i) => ({ c, i })).filter(({ c }) => (c.name + ' ' + c.description).toLowerCase().includes(query) && (filter === 'all' || c.passed === (filter === 'passed')));
    if (!visible.some(({ i }) => i === selected)) selected = visible[0]?.i ?? -1;
    $('cases').innerHTML = visible.length ? visible.map(({ c, i }) => artifacts.caseButton(c, i, selected)).join('') : '<div class="empty">No checks match these filters.<br>Try another search or status.</div>';
    document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => { selected = Number(button.dataset.case); render(); }));
    const c = report.cases[selected];
    if (!c) { $('inspector').innerHTML = '<p class="empty">Select a matching check to inspect its execution evidence.</p>'; return; }
    $('inspector').innerHTML = `<div class="inspector-heading"><h3>${esc(c.name)}</h3><span class="badge ${c.passed ? 'pass' : 'fail'}">${c.passed ? 'PASSED' : 'FAILED'}</span></div><p class="description">${esc(c.description)}</p>
      ${c.passed ? '' : `<div class="failures">${c.failures.map(failure => failureHtml(failure, c)).join('')}</div>`}
      <div class="timeline-label eyebrow"><span>Tool-call timeline</span><span class="muted">${c.events.length} intercepted</span></div>
      ${c.events.map(event => `<details class="event ${esc(event.status)}" ${event.status !== 'replayed' ? 'open' : ''}><summary><span class="status-icon ${event.status === 'replayed' ? 'pass' : ''}">${event.status === 'replayed' ? '✓' : '×'}</span><span class="tool">${esc(event.tool)}</span><span class="event-state">${esc(event.status)}</span><span class="expand" aria-hidden="true">+</span></summary><div class="event-body">${event.message ? `<p class="error">${esc(event.code)}: ${esc(event.message)}</p>` : ''}<div class="eyebrow">Attempted arguments</div><pre>${esc(JSON.stringify(event.arguments, null, 2))}</pre>${event.expectedArguments ? `<div class="eyebrow">Expected arguments</div><pre>${esc(JSON.stringify(event.expectedArguments, null, 2))}</pre>` : ''}${Object.hasOwn(event, 'result') ? `<div class="eyebrow">Fixture response</div><pre>${esc(JSON.stringify(event.result, null, 2))}</pre>` : ''}</div></details>`).join('')}
      ${Object.hasOwn(c, 'output') ? evidence(c.output, 'Agent output') : ''}
      ${c.passed ? '<div class="complete">All calls matched their fixtures and policies.<br>No live tools were invoked through replay.</div>' : ''}`;
  }
  function download(value, filename) {
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function run(suite) {
    if (busy) return;
    clearError(); setBusy(true); announce('Running local checks…');
    try {
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suite) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'The suite could not run.');
      viewingSavedReport = false; sourceName = 'Local checks';
      syncEditor(suite); report = value; lastLocalReport = value;
      resetSelection(); render(); showView('overview');
      announce(`${report.summary.passed} of ${report.summary.total} checks passed. ${report.summary.failed} failed. Zero live tool calls through replay.`);
      $('fix').textContent = JSON.stringify(currentSuite) === JSON.stringify(examples?.safe) ? 'Try the regression ↗' : 'Try the fixed agent ↗';
    } catch (error) { showError(error.message); announce('Contract could not run. Fix the error and retry.'); }
    finally { setBusy(false); }
  }
  function runDraft() {
    try {
      const info = artifacts.exportContract($('editor').value);
      if (info.runner === 'agent') throw new Error('This is an agent-code contract. Download it and run the CLI with --agent.');
      run(info.value);
    } catch (error) { showError(error.message); }
  }
  function applyImport(source, name) {
    const item = artifacts.open(source);
    if (item.kind === 'report') {
      report = item.value; viewingSavedReport = true; sourceName = name;
      resetSelection(); render(); showView('overview');
      announce(`Opened ${name}. This report is read-only and has not been rerun.`);
    } else {
      if (!studio) throw new Error('Start Studio with npm start to edit contracts. Saved HTML reports can open other reports.');
      const incoming = JSON.stringify(item.value);
      if ($('editor').value.trim() && incoming !== JSON.stringify(draftInfo()?.value)) previousDraft = $('editor').value;
      syncEditor(item.value); showView('contract');
      announce(`Opened ${name}. ${item.runner === 'agent' ? 'Agent-code contract: edit or download, then run from the CLI.' : 'Review it, then run or download the contract.'}`);
    }
    clearError(); setImportPanel(false); updateControls();
  }
  function importPasted() {
    if (busy) return;
    try { applyImport($('import-text').value, 'Pasted JSON'); }
    catch (error) { showError(error.message); announce('JSON was not opened. Your current report and draft are unchanged.'); }
  }
  async function importFile(file) {
    if (!file || busy) return;
    setBusy(true); clearError(); announce(`Opening ${file.name}…`);
    try {
      if (file.size > artifacts.maxBytes) throw new Error('File exceeds the 1 MB import limit.');
      applyImport(await file.text(), file.name);
    } catch (error) { showError(error.message); announce('File was not opened. Your current report and draft are unchanged.'); }
    finally { $('artifact-file').value = ''; setBusy(false); }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); showView('overview'); });
  $('open-json').addEventListener('click', () => setImportPanel($('import-panel').hidden));
  $('close-import').addEventListener('click', () => setImportPanel(false));
  $('open-pasted').addEventListener('click', importPasted);
  $('artifact-file').addEventListener('change', () => importFile($('artifact-file').files[0]));
  $('resume-local').addEventListener('click', () => { clearError(); report = lastLocalReport; viewingSavedReport = false; resetSelection(); render(); showView('overview'); announce('Returned to the last local check result.'); });
  $('search').addEventListener('input', render); $('filter').addEventListener('change', render);
  $('rerun').addEventListener('click', runDraft); $('run-editor').addEventListener('click', runDraft);
  $('fix').addEventListener('click', () => run(JSON.stringify(currentSuite) === JSON.stringify(examples.safe) ? examples.regression : examples.safe));
  $('example').addEventListener('change', () => { if (examples[$('example').value]) syncEditor(examples[$('example').value]); });
  $('editor').addEventListener('input', () => { $('example').value = 'custom'; updateControls(); });
  $('undo-import').addEventListener('click', () => { $('editor').value = previousDraft; previousDraft = null; $('example').value = 'custom'; updateControls(); clearError(); announce('Restored the draft from before the last contract import.'); });
  $('download-contract').addEventListener('click', () => {
    try { const item = artifacts.exportContract($('editor').value); download(item.json, 'plumbcheck-contract.json'); clearError(); announce('Contract downloaded. It contains the current fixture data.'); }
    catch (error) { showError(error.message); }
  });
  $('create-mcp').addEventListener('click', async () => {
    if (!desktop || busy) return;
    clearError(); setBusy(true);
    try {
      const setup = await window.plumbcheckDesktop.createMcpSetup($('editor').value, $('mcp-case').value);
      if (setup.canceled) { announce('Contract save canceled. Your draft is unchanged.'); return; }
      $('mcp-config').value = JSON.stringify(setup.config, null, 2);
      $('mcp-output').textContent = `Contract: ${setup.contractPath}\nReports after clean agent disconnect: ${setup.reportPath}`;
      $('mcp-result').hidden = false;
      announce('Contract saved. Copy the configuration into your MCP client, then run your agent against these fixture tools.');
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  });
  $('export').addEventListener('click', () => download(JSON.stringify(report, null, 2), 'plumbcheck-report.json'));
  document.addEventListener('plumbcheck:report', event => {
    try { const checked = artifacts.open(JSON.stringify(event.detail)); report = checked.value; viewingSavedReport = true; sourceName = 'Saved workspace run'; resetSelection(); render(); showView('overview'); }
    catch (error) { showError(error.message); }
  });
  render();
  if (studio) {
    setBusy(true);
    fetch('/api/examples').then(async response => { if (!response.ok) throw new Error('Could not load examples.'); return response.json(); }).then(value => {
      examples = value; syncEditor(examples.regression); setBusy(false);
    }).catch(error => { setBusy(false); showError(error.message); });
  } else {
    document.querySelector('[data-view="contract"]').hidden = true;
    $('local-note').textContent = 'SAVED REPORT / Read-only execution evidence';
  }
}
