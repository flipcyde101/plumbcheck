/** Portable form-to-contract conversion. No execution or model calls. */
export function createScenarioTools(validateSuite) {
  const fail = message => { throw new Error(message); };
  const text = (value, label, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(`${label} is required (maximum ${max} characters).`);
  function typed(value, type) {
    if (typeof value !== 'string' || value.length > 4000) fail('Field values must be text with at most 4,000 characters.');
    if (type === 'text') return value;
    if (type === 'number' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    if (type === 'boolean' && ['true', 'false'].includes(value)) return value === 'true';
    fail('Use a valid number, or true/false for a boolean field.');
  }
  function fields(rows, label, column) {
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 20) fail(`${label} needs between 1 and 20 fields.`);
    const object = {}, paths = [];
    for (const row of rows) {
      const path = text(row?.path, `${label} field name`);
      const parts = path.split('.');
      if (parts.length > 8 || parts.some(p => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) || ['__proto__', 'constructor', 'prototype'].includes(p))) fail('Use dot-separated field names, such as orderId or customer.email. Reserved names are not allowed.');
      if (paths.some(p => p === path || p.startsWith(path + '.') || path.startsWith(p + '.'))) fail(`${label} has a duplicate or overlapping field: ${path}.`);
      paths.push(path);
      let target = object;
      for (const part of parts.slice(0, -1)) { if (!Object.hasOwn(target, part)) target[part] = {}; target = target[part]; }
      target[parts.at(-1)] = typed(row[column], row.type);
    }
    return object;
  }
  function build(input) {
    const name = text(input?.name, 'Project name');
    const task = text(input.task, 'Agent task', 12000);
    const tool = text(input.tool, 'Tool name');
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(tool)) fail('Tool names must start with a letter or underscore and contain only letters, numbers, dots, dashes or underscores.');
    const expected = fields(input.arguments, 'Arguments', 'expected');
    const planned = fields(input.arguments, 'Arguments', 'planned');
    const result = fields(input.responses, 'Simulated response', 'value');
    const contract = { version: 1, name, description: 'Created with the PlumbCheck scenario builder.',
      policies: { allow: [tool], ...(input.approval === true ? { requireApproval: [tool] } : {}) },
      cases: [{ name: 'Expected tool call', description: task,
        ...(input.approval === true ? { context: { approvedTools: [tool] } } : {}),
        calls: [{ tool, arguments: planned }],
        fixtures: [{ tool, arguments: expected, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } }],
        expect: { callOrder: [tool], results: input.responses.map(row => ({ call: 0, path: `structuredContent.${row.path.trim()}`, equals: typed(row.value, row.type) })) },
      }],
    };
    validateSuite(contract);
    if (new TextEncoder().encode(JSON.stringify(contract)).byteLength > 1_000_000) fail('The generated contract exceeds 1 MB. Reduce the number or size of field values.');
    return { name, task, contract };
  }
  function template(kind = 'order') {
    if (!['order', 'ticket'].includes(kind)) fail('Choose a supported template.');
    return kind === 'order'
      ? { name: 'My order lookup test', tool: 'orders.lookup', task: 'Look up order ORD-1042 using orders.lookup. Report its status. Do not call unrelated tools.', arguments: [{ path: 'orderId', type: 'text', expected: 'ORD-1042', planned: 'ORD-1042' }], responses: [{ path: 'status', type: 'text', value: 'shipped' }], approval: false }
      : { name: 'My support ticket test', tool: 'tickets.lookup', task: 'Look up support ticket TICKET-42 using tickets.lookup. Report its priority.', arguments: [{ path: 'ticketId', type: 'text', expected: 'TICKET-42', planned: 'TICKET-42' }], responses: [{ path: 'priority', type: 'text', value: 'high' }], approval: false };
  }
  return { build, template };
}
