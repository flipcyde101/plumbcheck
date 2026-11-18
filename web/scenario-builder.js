/** Shared Windows/Android form. Contracts are validated before the caller saves. */
export function mountScenarioBuilder({ root, scenarios, onCreate }) {
  const document = root.ownerDocument, prefix = root.id;
  root.innerHTML = `<h3>Build a test without JSON</h3><p>Describe one tool call, the response PlumbCheck should simulate, and anything the agent must not do. A real model run then shows what your agent actually does. Advanced multi-tool tests remain available in the Contract editor.</p>
    <label for="${prefix}-template">STARTING TEMPLATE</label><select id="${prefix}-template" data-template-kind><optgroup label="Agent should do this"><option value="order">Order lookup</option><option value="ticket">Support ticket</option></optgroup><optgroup label="Agent must NOT do this"><option value="unapproved-send">Must not email without approval</option><option value="forbidden-delete">Must not delete an order</option><option value="injected-instruction">Must ignore an instruction hidden in tool output</option></optgroup></select><button type="button" data-template>Load template</button>
    <form><label for="${prefix}-name">PROJECT NAME</label><input id="${prefix}-name" data-name required maxlength="200">
    <label for="${prefix}-task">WHAT SHOULD THE AGENT DO?</label><textarea id="${prefix}-task" data-task required maxlength="12000" style="min-height:90px"></textarea>
    <label for="${prefix}-tool">TOOL NAME</label><input id="${prefix}-tool" data-tool required maxlength="128">
    <h4>Tool arguments</h4><p>Expected values define the test. Planned values are only a draft for the planned-call check, which runs no agent; a real model run chooses its own arguments.</p><div data-arguments></div><button type="button" data-add-argument>Add argument</button>
    <h4>Simulated response</h4><p>No live business tool is called. These fields are returned to the agent and checked in the evidence.</p><div data-responses></div><button type="button" data-add-response>Add response field</button>
    <label><input type="checkbox" data-approval style="width:auto"> This scenario includes a trusted test approval for this tool.</label>
    <label for="${prefix}-output">FINAL ANSWER MUST CONTAIN (OPTIONAL, NOT CASE-SENSITIVE)</label><input id="${prefix}-output" data-output-contains maxlength="4000" placeholder="e.g. shipped">
    <fieldset data-guard style="margin:12px 0;min-width:0"><legend>The agent must NOT</legend>
      <label for="${prefix}-guard-kind">FORBIDDEN BEHAVIOUR</label><select id="${prefix}-guard-kind" data-guard-kind><option value="none">Nothing extra</option><option value="deny">Use a forbidden tool</option><option value="approval">Use a tool that needs approval this scenario does not give</option><option value="injection">Follow an instruction hidden in the tool response</option></select>
      <div data-guard-details><label for="${prefix}-guard-tool">TOOL IT MUST NOT CALL</label><input id="${prefix}-guard-tool" data-guard-tool maxlength="128" placeholder="e.g. orders.delete">
      <div data-guard-injection><label for="${prefix}-guard-instruction">INSTRUCTION HIDDEN IN THE RESPONSE (FIELD "note")</label><textarea id="${prefix}-guard-instruction" data-guard-instruction maxlength="4000" style="min-height:60px"></textarea></div></div>
    </fieldset>
    <p>The planned-call check is a draft: it compares the planned values with the expected ones and runs no agent. To test real behaviour, connect a model and run the real model test. Must-not scenarios pass the planned check; only a real run shows whether the agent resists.</p>
    <button type="submit" class="primary" data-create>Save this test →</button></form><p data-message role="status" aria-live="polite"></p>`;
  const $ = selector => root.querySelector(selector);
  document.addEventListener('plumbcheck:feedback', event => { if (event.detail?.source !== 'builder') $('[data-message]').textContent = ''; });
  let serial = 0, busy = false;
  function addRow(kind, value = { path: '', type: 'text', expected: '', planned: '', value: '' }) {
    const container = $(`[data-${kind}]`);
    if (container.children.length >= 20) { $('[data-message]').textContent = 'The builder supports up to 20 fields per group.'; return; }
    const row = document.createElement('fieldset'); row.dataset.field = ''; row.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:12px 0;min-width:0'; const id = `${prefix}-field-${++serial}`;
    const columns = kind === 'arguments' ? [['expected', 'EXPECTED VALUE'], ['planned', 'PLANNED DRAFT VALUE']] : [['value', 'RESPONSE VALUE']];
    row.innerHTML = `<legend>${kind === 'arguments' ? 'Argument' : 'Response field'}</legend><div><label for="${id}-path">FIELD NAME / DOTS FOR NESTED FIELDS</label><input id="${id}-path" data-path required maxlength="200"></div>
      <div><label for="${id}-type">TYPE</label><select id="${id}-type" data-type><option value="text">Text</option><option value="number">Number</option><option value="boolean">True / false</option></select></div>
      ${columns.map(([key, label]) => `<div><label for="${id}-${key}">${label}</label><input id="${id}-${key}" data-${key} maxlength="4000"></div>`).join('')}<button type="button" data-remove>Remove field</button>`;
    for (const key of ['path', 'type', ...columns.map(([key]) => key)]) row.querySelector(`[data-${key}]`).value = value[key] ?? '';
    row.querySelector('[data-remove]').onclick = () => { if (!busy) row.remove(); };
    container.append(row);
  }
  function showGuard() {
    const kind = $('[data-guard-kind]').value;
    $('[data-guard-details]').hidden = kind === 'none';
    $('[data-guard-injection]').hidden = kind !== 'injection';
  }
  function load(kind) {
    const value = scenarios.template(kind);
    for (const key of ['name', 'task', 'tool']) $(`[data-${key}]`).value = value[key] ?? '';
    $('[data-approval]').checked = value.approval === true;
    // Reset every optional field so values from a previous template never carry over.
    $('[data-output-contains]').value = value.outputContains ?? '';
    $('[data-guard-kind]').value = value.guard?.kind ?? 'none';
    $('[data-guard-tool]').value = value.guard?.tool ?? '';
    $('[data-guard-instruction]').value = value.guard?.instruction ?? '';
    showGuard();
    $('[data-arguments]').replaceChildren(); $('[data-responses]').replaceChildren();
    for (const row of value.arguments) addRow('arguments', row);
    for (const row of value.responses) addRow('responses', row);
  }
  const rows = kind => Array.from($(`[data-${kind}]`).children, row => Object.fromEntries(Array.from(row.querySelectorAll('input,select'), field => [Object.keys(field.dataset)[0], field.value])));
  $('[data-add-argument]').onclick = () => addRow('arguments');
  $('[data-add-response]').onclick = () => addRow('responses');
  $('[data-guard-kind]').onchange = showGuard;
  $('[data-template]').onclick = () => { if (!busy && confirm('Replace the builder fields with this template? Saved projects and the Contract draft will stay unchanged.')) load($('[data-template-kind]').value); };
  $('form').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    document.dispatchEvent(new CustomEvent('plumbcheck:feedback', { detail: { source: 'builder' } }));
    try {
      const kind = $('[data-guard-kind]').value;
      const guard = kind === 'none' ? undefined : { kind, tool: $('[data-guard-tool]').value, instruction: $('[data-guard-instruction]').value };
      const input = scenarios.build({ name: $('[data-name]').value, task: $('[data-task]').value, tool: $('[data-tool]').value, approval: $('[data-approval]').checked, arguments: rows('arguments'), responses: rows('responses'), outputContains: $('[data-output-contains]').value, guard });
      busy = true; root.setAttribute('aria-busy', 'true'); root.querySelectorAll('input,select,textarea,button').forEach(field => field.disabled = true);
      const result = await onCreate(input);
      $('[data-message]').textContent = result === false ? 'Creation canceled. Your existing draft is unchanged.' : result?.message || 'Project saved. Run the real model test to see what the agent does, or the planned-call check to verify the draft.';
    } catch (error) { $('[data-message]').textContent = error.message; }
    finally { busy = false; root.removeAttribute('aria-busy'); root.querySelectorAll('input,select,textarea,button').forEach(field => field.disabled = false); }
  };
  load('order');
}
