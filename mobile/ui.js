export function startMobile({ runSuite, redact, safe, regression, artifacts, syncRequest }) {
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
  $('save').onclick = () => { try { const opened = artifacts.open($('contract').value); if (opened.kind !== 'contract') throw new Error('Save a contract, not a report.'); localStorage.setItem('plumbcheck-project', JSON.stringify({ name: $('name').value, task, contract: opened.value })); say('Saved on this phone.'); } catch (e) { say(e.message); } };
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
    sessionStorage.setItem('plumbcheck-before-sync', JSON.stringify({ contract: $('contract').value, name: $('name').value, task }));
    $('contract').value = JSON.stringify(checked.value, null, 2); $('example').value = 'custom'; $('name').value = snapshot.project.name; task = snapshot.project.task;
    if (snapshot.report) { const opened = artifacts.open(JSON.stringify(snapshot.report)); if (opened.kind === 'report') { report = opened.value; render(); } }
    say('Snapshot opened. Review and save it on this phone. Imported evidence was not rerun.');
  });
  action('push', async () => {
    if (!$('sync-consent').checked) throw new Error('Review and authorize uploading this project’s fixture data.');
    const config = settings(), checked = artifacts.open($('contract').value);
    if (checked.kind !== 'contract') throw new Error('Choose a contract.');
    await syncRequest(config.url, '/v1/snapshots', { ...config, method: 'POST', body: { project: { name: $('name').value || checked.value.name, task, revision: 1, contract: checked.value } } });
    say('New immutable project snapshot uploaded. Other device versions were preserved.');
  });
  $('undo-sync').onclick = () => { const source = sessionStorage.getItem('plumbcheck-before-sync'); if (!source) { say('No imported draft to undo.'); return; } const previous = JSON.parse(source); $('contract').value = previous.contract; $('example').value = 'custom'; $('name').value = previous.name; task = previous.task; sessionStorage.removeItem('plumbcheck-before-sync'); say('Restored the draft from before sync import.'); };
  try { const raw = localStorage.getItem('plumbcheck-report'); if (raw) { const opened = artifacts.open(raw); if (opened.kind === 'report') report = opened.value; } render(); if (restore?.contract) say(`Restored your saved project.${report ? ' Last evidence was reopened without rerunning it.' : ' Ready for offline checks.'}`); } catch { say('Saved evidence could not be opened. Import a reviewed copy.'); }
}
