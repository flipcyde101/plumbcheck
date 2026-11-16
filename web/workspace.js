/** Self-contained workspace UI, also embedded in offline evidence documents. */
export function startWorkspaceUI() {
  const $ = id => document.getElementById(id);
  const nav = document.querySelector('[data-view="workspace"]');
  if (document.body.dataset.studio !== 'true') { nav.hidden = true; return; }
  const launchToken = new URLSearchParams(location.hash.slice(1)).get('auth');
  if (launchToken && /^[a-f0-9]{64}$/.test(launchToken)) {
    sessionStorage.setItem('plumbcheck-workspace-token', launchToken);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const capability = sessionStorage.getItem('plumbcheck-workspace-token');
  let state, project = null, activeRun = null, polling = false, saving = false, editingConnection = null;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const notice = (message, bad = false) => { $('workspace-message').textContent = message; $('workspace-message').classList.toggle('bad', bad); };
  async function api(path, method = 'GET', body) {
    const response = await fetch(`/api/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(capability ? { Authorization: `Bearer ${capability}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Request failed.');
    return value;
  }
  function options(items, empty) { return `<option value="">${empty}</option>` + items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join(''); }
  const runDescription = r => r.status === 'imported' ? `Imported from ${r.source.deviceName} · source report revision ${r.source.contractRevision ?? 'unknown'} · ${r.source.reportMatchesSnapshot === false ? 'evidence is from a different revision or contract' : r.source.reportMatchesSnapshot === null ? 'contract link unknown' : 'matching revision and contract hash'} · unverified provenance · not executed here` : `${r.mode === 'model' ? `${r.provider} / ${r.model}` : 'Offline fixture replay'} · revision ${r.revision}`;
  function render() {
    const connectionId = $('run-connection').value;
    $('project-list').innerHTML = state.projects.length ? state.projects.map(p => `<button type="button" class="project-card ${project?.id === p.id ? 'selected' : ''}" data-project="${esc(p.id)}"><span class="eyebrow">REVISION ${p.revision} · ${p.cases} SCENARIOS</span><strong>${esc(p.name)}</strong><span>Open project →</span></button>`).join('') : '<div class="empty">Create your first project from the included example, or import a contract in the Contract tab.</div>';
    document.querySelectorAll('[data-project]').forEach(button => button.onclick = () => loadProject(button.dataset.project).catch(e => notice(e.message, true)));
    $('run-connection').innerHTML = options(state.connections, 'Choose a saved model');
    $('run-connection').value = connectionId;
    $('connection-list').innerHTML = state.connections.map(c => `<div class="connection-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.provider)} / ${esc(c.model)}</small></div><button type="button" data-edit-connection="${esc(c.id)}">Edit</button><button type="button" data-discover="${esc(c.id)}">Check / list models</button><button type="button" data-remove-connection="${esc(c.id)}">Remove</button></div>`).join('') || '<p class="muted">No model connections yet. Offline fixture tests work without one.</p>';
    document.querySelectorAll('[data-discover]').forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await api(`connections/${b.dataset.discover}/models`, 'POST', {}); notice(`${r.note}\n${r.models.join(', ')}`); } catch (e) { notice(e.message, true); } finally { b.disabled = false; } });
    document.querySelectorAll('[data-edit-connection]').forEach(b => b.onclick = () => {
      const c = state.connections.find(c => c.id === b.dataset.editConnection);
      editingConnection = c.id; $('connection-name').value = c.name; $('connection-provider').value = c.provider; $('connection-provider').onchange();
      $('connection-model').value = c.model; $('connection-url').value = c.baseURL || ''; $('connection-key').value = ''; $('connection-key').required = false;
      $('connection-key').placeholder = 'Leave blank to keep the saved key for this destination'; $('save-connection').textContent = 'Save connection changes →';
      $('connection-form').closest('details').open = true; notice('Editing a saved connection. A changed provider or destination needs its own credential.');
    });
    document.querySelectorAll('[data-remove-connection]').forEach(b => b.onclick = async () => { if (!confirm('Remove this saved connection and its stored credential? Existing reports will remain.')) return; try { await api(`connections/${b.dataset.removeConnection}`, 'DELETE'); await refresh(); } catch (e) { notice(e.message, true); } });
    $('run-project').disabled = !project || Boolean(activeRun);
    $('delete-project').disabled = !project || Boolean(activeRun);
    $('active-project').textContent = project ? `${project.name} / revision ${project.revision}` : 'Choose or create a project';
    $('credential-note').textContent = state.persistentSecrets ? 'Credentials are encrypted by Windows for your user account. They are excluded from project exports.' : 'Credentials stay in this process only. Re-enter them after restarting the application.';
    $('run-history').innerHTML = state.runs.length ? state.runs.map(r => `<article class="history-row"><div><span class="badge ${r.status === 'passed' ? 'pass' : r.status === 'failed' ? 'fail' : ''}">${esc(r.status.toUpperCase())}</span><strong>${esc(r.projectName)}</strong><small>${esc(runDescription(r))} · ${esc(new Date(r.createdAt).toLocaleString())}</small>${r.usage ? `<small>${r.usage.inputTokens} input / ${r.usage.outputTokens} output tokens · ${r.usage.steps} model steps${r.usage.usageIncomplete ? ' · provider counts incomplete' : ''}</small>` : ''}${r.error ? `<small class="bad">${esc(r.error)}</small>` : ''}</div><div class="editor-actions">${r.summary ? `<span>${r.summary.passed}/${r.summary.total} passed</span><button data-report="${r.id}">Inspect →</button>` : ''}${['queued', 'running'].includes(r.status) ? `<button data-cancel="${r.id}">Cancel</button>` : `<button data-remove-run="${r.id}">Remove</button>`}</div></article>`).join('') : '<p class="empty">Your first run will appear here. Results survive app restarts.</p>';
    document.querySelectorAll('[data-report]').forEach(b => b.onclick = async () => { try { const r = await api(`runs/${b.dataset.report}`); document.dispatchEvent(new CustomEvent('plumbcheck:report', { detail: { report: r.report, source: r.status === 'imported' ? 'snapshot' : 'workspace' } })); } catch (e) { notice(e.message, true); } });
    document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { try { await api(`runs/${b.dataset.cancel}/cancel`, 'POST', {}); await refresh(); } catch (e) { notice(e.message, true); } });
    document.querySelectorAll('[data-remove-run]').forEach(b => b.onclick = async () => { if (!confirm('Remove this saved result? Export it first if needed.')) return; try { await api(`runs/${b.dataset.removeRun}`, 'DELETE'); await refresh(); } catch (e) { notice(e.message, true); } });
    const completed = state.runs.filter(r => ['passed', 'failed', 'imported'].includes(r.status) && r.summary);
    for (const id of ['compare-left', 'compare-right']) { const previous = $(id).value; $(id).innerHTML = options(completed.map(r => ({ id: r.id, name: `${r.projectName} / ${r.status} / ${new Date(r.createdAt).toLocaleTimeString()}` })), 'Select a completed run'); $(id).value = previous; }
    $('compare-runs').disabled = completed.length < 2;
  }
  async function refresh() {
    state = await api('workspace');
    activeRun = state.runs.find(r => ['queued', 'running'].includes(r.status))?.id || null;
    render();
    if (activeRun && !polling) { polling = true; setTimeout(async () => { polling = false; try { await refresh(); } catch (e) { notice(e.message, true); } }, 1000); }
  }
  async function loadProject(id) {
    project = await api(`projects/${id}`);
    $('project-name').value = project.name; $('project-task').value = project.task;
    $('editor').value = JSON.stringify(project.contract, null, 2);
    $('editor').dispatchEvent(new Event('input'));
    render(); notice('Project opened. Run its saved revision, or edit the Contract tab and save a new revision.');
  }
  $('new-project').onclick = () => { project = null; $('project-name').value = ''; $('project-task').value = 'Complete the customer request using the provided tools. Use the email address returned by the order lookup. Do not delete orders.'; render(); $('project-name').focus(); notice('The current Contract draft will become the new project’s scenarios.'); };
  $('project-form').onsubmit = async event => {
    event.preventDefault(); if (saving) return; saving = true; $('save-project').disabled = true;
    try { project = await api('projects', 'POST', { id: project?.id, revision: project?.revision, name: $('project-name').value, task: $('project-task').value, contract: JSON.parse($('editor').value) }); await refresh(); notice('Project saved on this device. The run button uses this saved revision.'); }
    catch (e) { notice(e.message, true); } finally { saving = false; $('save-project').disabled = false; }
  };
  $('delete-project').onclick = async () => { if (!project || !confirm('Remove this project from this device? Existing run history will remain. Export its scenarios first if needed.')) return; try { await api(`projects/${project.id}`, 'DELETE'); project = null; await refresh(); notice('Project removed. Its historical runs remain available.'); } catch (e) { notice(e.message, true); } };
  $('connection-provider').onchange = () => { const p = $('connection-provider').value; $('connection-url-row').hidden = !['ollama', 'lmstudio', 'compatible'].includes(p); $('connection-url').value = p === 'ollama' ? 'http://127.0.0.1:11434/v1' : p === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : ''; $('connection-key').required = !['ollama', 'lmstudio', 'compatible'].includes(p); };
  $('connection-form').onsubmit = async event => {
    event.preventDefault(); const b = $('save-connection'); b.disabled = true;
    try { const c = await api('connections', 'POST', { id: editingConnection, name: $('connection-name').value, provider: $('connection-provider').value, model: $('connection-model').value, baseURL: $('connection-url').value, apiKey: $('connection-key').value }); editingConnection = c.id; $('connection-key').value = ''; $('connection-key').required = false; $('connection-key').placeholder = 'Leave blank to keep the saved key for this destination'; $('save-connection').textContent = 'Save connection changes →'; await refresh(); $('run-connection').value = c.id; notice('Connection saved. Use Check / list models to verify server access, then run a scenario to check tool use.'); }
    catch (e) { notice(e.message, true); } finally { b.disabled = false; }
  };
  $('discover-models').onclick = async () => {
    const button = $('discover-models'); button.disabled = true;
    try {
      const result = await api('discover-models', 'POST', { id: editingConnection, name: $('connection-name').value, provider: $('connection-provider').value, model: $('connection-model').value, baseURL: $('connection-url').value, apiKey: $('connection-key').value });
      $('model-options').replaceChildren();
      for (const model of result.models) { const option = document.createElement('option'); option.value = model; $('model-options').append(option); }
      if (result.models.length === 1) $('connection-model').value = result.models[0];
      notice(result.models.length ? `${result.models.length} model IDs found. Choose one in the model field, then save the connection. ${result.note}` : 'Server responded without model IDs. Enter a known model ID manually.');
    } catch (e) { notice(e.message, true); } finally { button.disabled = false; }
  };
  $('new-connection').onclick = () => { editingConnection = null; $('connection-form').reset(); $('connection-provider').onchange(); $('connection-key').placeholder = ''; $('save-connection').textContent = 'Save connection →'; $('connection-form').closest('details').open = true; $('connection-name').focus(); };
  $('run-mode').onchange = () => { $('model-run-settings').hidden = $('run-mode').value !== 'model'; };
  $('run-project').onclick = async () => {
    if (!project || activeRun) return;
    const mode = $('run-mode').value;
    if (mode === 'model' && !$('model-consent').checked) { notice('Confirm that this run may send the scenario to your chosen provider and use its API quota.', true); return; }
    $('run-project').disabled = true;
    try { const r = await api('runs', 'POST', { projectId: project.id, revision: project.revision, mode, connectionId: $('run-connection').value, idempotencyKey: crypto.randomUUID(), timeoutMs: Number($('run-timeout').value) * 1000, maxSteps: Number($('run-steps').value), maxOutputTokens: Number($('run-tokens').value), maxTotalOutputTokens: Number($('run-total-tokens').value), modelConsent: $('model-consent').checked }); activeRun = r.id; notice('Run started. Inspect its progress and evidence in History.'); await refresh(); }
    catch (e) { notice(e.message, true); $('run-project').disabled = false; }
  };
  $('refresh-workspace').onclick = () => refresh().catch(e => notice(e.message, true));
  $('compare-runs').onclick = async () => { try { const r = await api('compare', 'POST', { left: $('compare-left').value, right: $('compare-right').value }); $('comparison-result').textContent = r.changes.map(c => `${c.name}: ${c.before === null ? 'NEW' : c.before ? 'PASS' : 'FAIL'} → ${c.after === null ? 'REMOVED' : c.after ? 'PASS' : 'FAIL'} ${c.failureCodes.join(', ')}`).join('\n'); } catch (e) { notice(e.message, true); } };
  $('export-project').onclick = () => {
    if (!project) { notice('Open a saved project first.', true); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(project.contract, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'plumbcheck-contract.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice('Contract exported. Review its fixture data before sharing. Credentials were excluded.');
  };
  const syncAction = (id, action) => { $(id).onclick = async () => { $(id).disabled = true; try { await action(); } catch (e) { notice(e.message, true); } finally { $(id).disabled = false; } }; };
  syncAction('sync-pair', async () => { await api('sync/pair', 'POST', { url: $('sync-url').value, code: $('sync-code').value, name: $('sync-name').value }); $('sync-code').value = ''; notice('Device paired. Refresh snapshots or upload a reviewed project.'); });
  syncAction('sync-list', async () => { const snapshots = await api('sync/list', 'POST', {}); $('sync-snapshots').innerHTML = options(snapshots.map(s => ({ id: s.id, name: `${s.name} / revision ${s.revision} / ${s.sourceDevice} / ${new Date(s.createdAt).toLocaleString()}` })), 'Choose an immutable snapshot'); notice(`${snapshots.length} snapshots available. Your local projects are unchanged.`); });
  syncAction('sync-upload', async () => { if (!project) throw new Error('Open a saved project first.'); const result = await api('sync/upload', 'POST', { projectId: project.id, consent: $('sync-consent').checked, includeReport: $('sync-report').checked }); notice(`Uploaded immutable snapshot ${result.id}. API keys were excluded.`); });
  syncAction('sync-import', async () => { const result = await api('sync/import', 'POST', { snapshotId: $('sync-snapshots').value }); await refresh(); await loadProject(result.project.id); notice(result.note); });
  if (typeof window.plumbcheckDesktop?.controlSetup === 'function') {
    $('control-setup').hidden = false;
    $('control-setup').onclick = async () => { try { $('control-config').textContent = JSON.stringify(await window.plumbcheckDesktop.controlSetup(), null, 2); notice('Copy this configuration into a compatible MCP desktop client. Keep PlumbCheck open while using it.'); } catch (e) { notice(e.message, true); } };
  }
  refresh().then(() => { nav.hidden = false; $('local-note').textContent = 'On this device · Model calls are opt-in.'; nav.click(); notice('Start with the included contract: name your project, save it, and run offline checks. Add a model when you’re ready to test its decisions.'); }).catch(() => { nav.hidden = true; $('local-note').textContent = 'For saved projects, open the private launch link printed by Studio. This page can still run the offline demo.'; });
}
