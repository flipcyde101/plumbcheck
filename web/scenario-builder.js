/** Shared Windows/Android form. Contracts are validated before the caller saves. */
export function mountScenarioBuilder({ root, scenarios, onCreate }) {
  const document = root.ownerDocument, prefix = root.id;
  root.innerHTML = `<h3>Build a test without JSON</h3><p>Describe one tool call and the response PlumbCheck should simulate. Your model can choose the actual call later. Advanced multi-tool tests remain available in the Contract editor.</p>
    <label for="${prefix}-template">STARTING TEMPLATE</label><select id="${prefix}-template"><option value="order">Order lookup</option><option value="ticket">Support ticket</option></select><button type="button" data-template>Load template</button>
    <form><label for="${prefix}-name">PROJECT NAME</label><input id="${prefix}-name" data-name required maxlength="200">
    <label for="${prefix}-task">WHAT SHOULD THE AGENT DO?</label><textarea id="${prefix}-task" data-task required maxlength="12000" style="min-height:90px"></textarea>
    <label for="${prefix}-tool">TOOL NAME</label><input id="${prefix}-tool" data-tool required maxlength="128">
    <h4>Tool arguments</h4><p>Expected values define the test. Planned values are used only by offline checks; a model run chooses its own arguments.</p><div data-arguments></div><button type="button" data-add-argument>Add argument</button>
    <h4>Simulated response</h4><p>No live business tool is called. These fields are returned to the agent and checked in the evidence.</p><div data-responses></div><button type="button" data-add-response>Add response field</button>
    <label><input type="checkbox" data-approval style="width:auto"> This scenario includes a trusted test approval for this tool.</label>
    <p>To demonstrate a failure, change a planned argument while keeping its expected value. Save and run offline; then correct the planned value and rerun the same scenario.</p>
    <button type="submit" class="primary" data-create>Save this test →</button></form><p data-message role="status" aria-live="polite"></p>`;
  const $ = selector => root.querySelector(selector);
  document.addEventListener('plumbcheck:feedback', event => { if (event.detail?.source !== 'builder') $('[data-message]').textContent = ''; });
  let serial = 0, busy = false;
  function addRow(kind, value = { path: '', type: 'text', expected: '', planned: '', value: '' }) {
    const container = $(`[data-${kind}]`);
    if (container.children.length >= 20) { $('[data-message]').textContent = 'The builder supports up to 20 fields per group.'; return; }
    const row = document.createElement('fieldset'); row.dataset.field = ''; row.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:12px 0;min-width:0'; const id = `${prefix}-field-${++serial}`;
    const columns = kind === 'arguments' ? [['expected', 'EXPECTED VALUE'], ['planned', 'PLANNED OFFLINE VALUE']] : [['value', 'RESPONSE VALUE']];
    row.innerHTML = `<legend>${kind === 'arguments' ? 'Argument' : 'Response field'}</legend><div><label for="${id}-path">FIELD NAME / DOTS FOR NESTED FIELDS</label><input id="${id}-path" data-path required maxlength="200"></div>
      <div><label for="${id}-type">TYPE</label><select id="${id}-type" data-type><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option></select></div>
      ${columns.map(([key, label]) => `<div><label for="${id}-${key}">${label}</label><input id="${id}-${key}" data-${key} maxlength="4000"></div>`).join('')}<button type="button" data-remove>Remove field</button>`;
    for (const key of ['path', 'type', ...columns.map(([key]) => key)]) row.querySelector(`[data-${key}]`).value = value[key] ?? '';
    row.querySelector('[data-remove]').onclick = () => { if (!busy) row.remove(); };
    container.append(row);
  }
  function load(kind) {
    const value = scenarios.template(kind);
    for (const key of ['name', 'task', 'tool', 'approval']) { const field = $(`[data-${key}]`); if (key === 'approval') field.checked = value[key]; else field.value = value[key]; }
    $('[data-arguments]').replaceChildren(); $('[data-responses]').replaceChildren();
    for (const row of value.arguments) addRow('arguments', row);
    for (const row of value.responses) addRow('responses', row);
  }
  const rows = kind => Array.from($(`[data-${kind}]`).children, row => Object.fromEntries(Array.from(row.querySelectorAll('input,select'), field => [Object.keys(field.dataset)[0], field.value])));
  $('[data-add-argument]').onclick = () => addRow('arguments');
  $('[data-add-response]').onclick = () => addRow('responses');
  $('[data-template]').onclick = () => { if (!busy && confirm('Replace the builder fields with this template? Saved projects and the Contract draft will stay unchanged.')) load($('select').value); };
  $('form').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    document.dispatchEvent(new CustomEvent('plumbcheck:feedback', { detail: { source: 'builder' } }));
    try {
      const input = scenarios.build({ name: $('[data-name]').value, task: $('[data-task]').value, tool: $('[data-tool]').value, approval: $('[data-approval]').checked, arguments: rows('arguments'), responses: rows('responses') });
      busy = true; root.setAttribute('aria-busy', 'true'); root.querySelectorAll('input,select,textarea,button').forEach(field => field.disabled = true);
      const result = await onCreate(input);
      $('[data-message]').textContent = result === false ? 'Creation canceled. Your existing draft is unchanged.' : result?.message || 'Project saved. Run offline checks, or select a model and authorize its run.';
    } catch (error) { $('[data-message]').textContent = error.message; }
    finally { busy = false; root.removeAttribute('aria-busy'); root.querySelectorAll('input,select,textarea,button').forEach(field => field.disabled = false); }
  };
  load('order');
}
