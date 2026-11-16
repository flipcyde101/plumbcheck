export function startMobile({ runSuite, redact, safe, regression, artifacts, syncRequest, model }) {
  const $ = id => document.getElementById(id);
  let current = regression, report = null;
  let task = 'Complete the scenario using the provided tools.';
  let syncSettings = null;
  try { syncSettings = JSON.parse(window.AndroidApp?.getSyncSettings() || 'null'); } catch { /* Pair explicitly when a credential is unavailable. */ }
  const say = message => { $('message').textContent = message; };
  const saved = () => { try { return JSON.parse(localStorage.getItem('plumbcheck-project') || 'null'); } catch { return null; } };
  const custom = document.createElement('option'); custom.value = 'custom'; custom.textContent = 'Your saved or edited contract'; custom.hidden = true; $('example').append(custom);
  const restore = saved();
  if (restore?.contract) { current = restore.contract; $('name').value = restore.name || ''; task = restore.task || task; $('example').value = 'custom'; }
  $('contract').value = JSON.stringify(current, null, 2);
  $('contract').oninput = () => { $('example').value = 'custom'; };
  $('example').onchange = () => { if ($('example').value === 'custom') return; current = $('example').value === 'safe' ? safe : regression; $('contract').value = JSON.stringify(current, null, 2); };
  function saveProject() {
    const opened = artifacts.open($('contract').value); if (opened.kind !== 'contract') throw new Error('Save a contract, not a report.');
    const previous = saved(), next = { name: $('name').value || opened.value.name, task: $('model-task').value, contract: opened.value };
    const unchanged = previous && JSON.stringify([previous.name, previous.task, previous.contract]) === JSON.stringify([next.name, next.task, next.contract]);
    next.revision = unchanged ? previous.revision || 1 : (previous?.revision || 0) + 1;
    localStorage.setItem('plumbcheck-project', JSON.stringify(next)); task = next.task; return next;
  }
  $('save').onclick = () => { try { saveProject(); say('Saved on this phone.'); } catch (e) { say(e.message); } };
  $('run').onclick = async () => {
    $('run').disabled = true;
    try {
      const source = $('contract').value; if (new TextEncoder().encode(source).length > 1_000_000) throw new Error('Contract exceeds 1 MB.');
      const value = JSON.parse(source);
      if (value.cases?.some(c => !Array.isArray(c.calls))) throw new Error('This contract needs an agent runner. Phone offline mode checks planned tool calls.');
      report = redact(await runSuite(value)); localStorage.setItem('plumbcheck-report', JSON.stringify(report));
      render(); say(`${report.summary.passed}/${report.summary.total} passed. Executed offline on this phone.`);
    } catch (e) { say(e.message); } finally { $('run').disabled = false; }
  };
  function render() {
    $('results').replaceChildren();
    if (!report) return;
    for (const c of report.cases) {
      const card = document.createElement('article');
      const heading = document.createElement('h3'); heading.textContent = `${c.passed ? '✓ PASS' : '× FAIL'} / ${c.name}`; card.append(heading);
      for (const f of c.failures) { const p = document.createElement('p'); p.textContent = `${f.code}: ${f.message}`; card.append(p); }
      const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
      summary.textContent = 'Execution evidence'; pre.textContent = JSON.stringify(c, null, 2); details.append(summary, pre); card.append(details); $('results').append(card);
    }
  }
  const native = window.OllamaNative;
  $('licenses').onclick = async () => { try { const [own, third] = await Promise.all([fetch('LICENSE.txt').then(r => r.text()), fetch('THIRD_PARTY_NOTICES.txt').then(r => r.text())]); $('license-text').textContent = own + '\n\n' + third; } catch { $('license-text').textContent = 'License notices are bundled with the Android application.'; } };
  const transport = model.createNativeModelFetch(native);
  let activeModel = null, connecting = false;
  $('model-task').value = task;
  try { const connection = JSON.parse(localStorage.getItem('plumbcheck-ollama') || 'null'); if (connection) { $('model-server').value = connection.server; $('model-id').value = connection.model; } } catch { /* Reconnect explicitly. */ }
  const modelNotice = message => { $('model-message').textContent = message; };
  function configureModel() {
    if (!native?.configure) throw new Error('Ollama connections require the installed Android app.');
    const server = model.normalizeOllamaServer($('model-server').value);
    if (server.startsWith('http:') && !$('model-http-consent').checked) throw new Error('Authorize unencrypted traffic to this trusted local server first.');
    const configured = JSON.parse(native.configure(server, $('model-http-consent').checked));
    if (!configured.ok) throw new Error(configured.error);
    $('model-server').value = server;
    return server;
  }
  function busyModel(value) { for (const id of ['run', 'save', 'model-discover', 'model-run', 'model-server', 'model-id', 'model-task', 'import', 'pull', 'undo-sync']) $(id).disabled = value; $('model-cancel').disabled = !value || !activeModel; }
  $('model-discover').onclick = async () => {
    if (activeModel || connecting) return; connecting = true; busyModel(true);
    try {
      const server = configureModel(); modelNotice('Checking the server through Android native networking…');
      const models = await model.discoverOllama(server, transport, AbortSignal.timeout(15000));
      $('model-options').replaceChildren(); for (const id of models) { const option = document.createElement('option'); option.value = id; $('model-options').append(option); }
      if (models.length === 1) $('model-id').value = models[0];
      localStorage.setItem('plumbcheck-ollama', JSON.stringify({ server, model: $('model-id').value }));
      modelNotice(`Connected. Installed models: ${models.join(', ') || '(none)'}. Run a scenario to verify tool support.`);
    } catch (e) { modelNotice(e.message); } finally { connecting = false; busyModel(false); }
  };
  $('model-network').onclick = () => { try { modelNotice(native?.diagnostics ? JSON.stringify(JSON.parse(native.diagnostics()), null, 2) : 'Network diagnostics are available in the installed Android app.'); } catch { modelNotice('Network diagnostics are unavailable.'); } };
  $('model-cancel').onclick = () => activeModel?.abort();
  window.addEventListener('plumbcheck:model-interrupted', () => activeModel?.abort());
  $('model-run').onclick = async () => {
    if (activeModel || connecting) return;
    if (!$('model-consent').checked) { modelNotice('Authorize sending this scenario and fixture responses to your selected Ollama server.'); return; }
    let controller, timer;
    try {
      const server = configureModel(), selected = $('model-id').value.trim(), snapshot = saveProject();
      const limits = { timeoutMs: 180000, maxSteps: 4, maxOutputTokens: 1024, maxTotalOutputTokens: 4000 };
      controller = new AbortController(); activeModel = controller; busyModel(true); timer = setTimeout(() => controller.abort(), limits.timeoutMs);
      localStorage.setItem('plumbcheck-ollama', JSON.stringify({ server, model: selected })); localStorage.setItem('plumbcheck-model-status', 'running');
      modelNotice(`Running ${selected}. Keep this app open; leaving it cancels the model connection. Tool responses are simulated.`);
      let usage;
      const result = await model.runOllama({ contract: snapshot.contract, task: snapshot.task, model: selected, server, transport, signal: controller.signal, limits, onUsage: value => { usage = value; modelNotice(`${selected}: ${value.steps} model steps · ${value.inputTokens} input / ${value.outputTokens} output tokens`); } });
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot.contract)))), b => b.toString(16).padStart(2, '0')).join('');
      result.execution = { runner: 'builtin-model', provider: 'ollama', model: selected, connectionName: 'Android Ollama', contractRevision: snapshot.revision, contractHash: hash, limits, ...(usage ? { usage } : {}) };
      controller.signal.throwIfAborted();
      const masked = redact(result); artifacts.report(masked);
      if (new TextEncoder().encode(JSON.stringify(masked)).length > 1000000) throw new Error('Report exceeds the 1 MB export limit. Reduce the scenario size.');
      localStorage.setItem('plumbcheck-report', JSON.stringify(masked)); report = masked; render(); localStorage.setItem('plumbcheck-model-status', result.passed ? 'passed' : 'failed');
      modelNotice(`${result.summary.passed}/${result.summary.total} passed on ${selected}. Saved revision ${snapshot.revision}. This was an actual model run with fixture tools.`);
    } catch (e) { localStorage.setItem('plumbcheck-model-status', controller?.signal.aborted ? 'cancelled' : 'failed'); modelNotice(controller?.signal.aborted ? 'Model run cancelled or interrupted. No new passing report was saved.' : e.message); }
    finally { clearTimeout(timer); activeModel = null; busyModel(false); }
  };
  if (localStorage.getItem('plumbcheck-model-status') === 'running') { localStorage.setItem('plumbcheck-model-status', 'interrupted'); modelNotice('The previous model run was interrupted. Any displayed evidence is from an earlier completed run.'); }
  $('import').onchange = async () => { try { const f = $('import').files[0]; if (!f) return; if (f.size > 1_000_000) throw new Error('File exceeds 1 MB.'); const opened = artifacts.open(await f.text()); if (opened.kind === 'report') { report = opened.value; render(); say('Opened saved evidence. It was not rerun on this phone.'); } else { $('contract').value = JSON.stringify(opened.value, null, 2); $('example').value = 'custom'; say('Contract imported. Review before running.'); } } catch (e) { say(e.message); } finally { $('import').value = ''; } };
  function exportJson(value, filename) {
    if (window.AndroidApp?.exportJson) { window.AndroidApp.exportJson(filename, JSON.stringify(value, null, 2)); say('Choose where to save the JSON file.'); }
    else { const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  $('export-contract').onclick = () => { try { exportJson(JSON.parse($('contract').value), 'plumbcheck-contract.json'); } catch (e) { say(e.message); } };
  $('export-report').onclick = () => { if (report) exportJson(report, 'plumbcheck-report.json'); else say('Run or import a report first.'); };
  const action = (id, run) => { $(id).onclick = async () => { $(id).disabled = true; try { await run(); } catch (e) { say(e.message); } finally { $(id).disabled = false; } }; };
  const settings = () => { if (!syncSettings) throw new Error('Pair this phone first.'); return syncSettings; };
  action('pair', async () => {
    const url = $('relay-url').value.replace(/\/$/, '');
    if (new URL(url).protocol !== 'https:') throw new Error('Phone pairing requires an HTTPS relay.');
    const result = await syncRequest(url, '/v1/pair', { method: 'POST', body: { code: $('pair-code').value, name: $('device-name').value } });
    syncSettings = { url, token: result.token };
    if (window.AndroidApp?.saveSyncSettings) { if (!window.AndroidApp.saveSyncSettings(JSON.stringify(syncSettings))) throw new Error('The phone could not securely save its device credential. Pair again.'); }
    $('pair-code').value = ''; say('Phone paired. Refresh snapshots to see projects uploaded from Windows.');
  });
  action('snapshots', async () => {
    const config = settings(), list = await syncRequest(config.url, '/v1/snapshots', config);
    $('snapshot-list').replaceChildren();
    for (const s of list) { const option = document.createElement('option'); option.value = s.id; option.textContent = `${s.name} / r${s.revision} / ${s.sourceDevice}`; $('snapshot-list').append(option); }
    say(`${list.length} project snapshots available. Local edits are unchanged.`);
  });
  action('pull', async () => {
    const config = settings(), id = $('snapshot-list').value;
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Choose a snapshot.');
    const snapshot = await syncRequest(config.url, `/v1/snapshots/${id}`, config);
    const checked = artifacts.open(JSON.stringify(snapshot.project.contract));
    if (checked.kind !== 'contract') throw new Error('Snapshot does not contain a contract.');
    sessionStorage.setItem('plumbcheck-before-sync', JSON.stringify({ contract: $('contract').value, name: $('name').value, task: $('model-task').value }));
    $('contract').value = JSON.stringify(checked.value, null, 2); $('example').value = 'custom'; $('name').value = snapshot.project.name; task = snapshot.project.task; $('model-task').value = task;
    if (snapshot.report) { const opened = artifacts.open(JSON.stringify(snapshot.report)); if (opened.kind === 'report') { report = opened.value; render(); } }
    say('Snapshot opened. Review and save it on this phone. Imported evidence was not rerun.');
  });
  action('push', async () => {
    if (!$('sync-consent').checked) throw new Error('Review and authorize uploading this project’s fixture data.');
    const config = settings(), checked = artifacts.open($('contract').value);
    if (checked.kind !== 'contract') throw new Error('Choose a contract.');
    await syncRequest(config.url, '/v1/snapshots', { ...config, method: 'POST', body: { project: { name: $('name').value || checked.value.name, task: $('model-task').value, revision: 1, contract: checked.value } } });
    say('New immutable project snapshot uploaded. Other device versions were preserved.');
  });
  $('undo-sync').onclick = () => { const source = sessionStorage.getItem('plumbcheck-before-sync'); if (!source) { say('No imported draft to undo.'); return; } const previous = JSON.parse(source); $('contract').value = previous.contract; $('example').value = 'custom'; $('name').value = previous.name; task = previous.task; $('model-task').value = task; sessionStorage.removeItem('plumbcheck-before-sync'); say('Restored the draft from before sync import.'); };
  try { const raw = localStorage.getItem('plumbcheck-report'); if (raw) { const opened = artifacts.open(raw); if (opened.kind === 'report') report = opened.value; } render(); if (restore?.contract) say(`Restored your saved project.${report ? ' Last evidence was reopened without rerunning it.' : ' Ready for offline checks.'}`); } catch { say('Saved evidence could not be opened. Import a reviewed copy.'); }
}
