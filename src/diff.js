/** Presentation-only differences. The self-contained factory also runs offline. */
export function createDiffTools(mask) {
  const own = (value, key) => Object.hasOwn(value, key);
  const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const segment = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
  const labels = { changed: 'Changed', type: 'Type changed', missing: 'Missing', added: 'Unexpected' };
  const limit = 20;

  function compare(expected, actual, { actualMissing = false } = {}) {
    // Mask whole values first: an ancestor credential key must protect all of
    // its descendants, even after a changed leaf becomes a standalone row.
    const left = mask(expected), right = mask(actual);
    const changes = [];
    let visited = 0, truncated = false;
    function visit(a, b, path, depth, hasLeft = true, hasRight = true) {
      if (truncated) return;
      if (++visited > 20_000 || depth > 64) { truncated = true; return; }
      if (hasLeft && hasRight && Object.is(a, b)) return;
      const leftType = type(a), rightType = type(b);
      if (hasLeft && hasRight && leftType === rightType && (leftType === 'object' || leftType === 'array')) {
        const keys = leftType === 'array'
          ? Array.from({ length: Math.max(a.length, b.length) }, (_, index) => String(index))
          : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
        for (const key of keys) {
          visit(a[key], b[key], `${path}/${segment(key)}`, depth + 1, own(a, key), own(b, key));
          if (truncated) break;
        }
        return;
      }
      if (changes.length === limit) { truncated = true; return; }
      changes.push({ path, kind: !hasRight ? 'missing' : !hasLeft ? 'added' : leftType !== rightType ? 'type' : 'changed',
        ...(hasLeft ? { expected: a } : {}), ...(hasRight ? { actual: b } : {}) });
    }
    visit(left, right, '', 0, true, !actualMissing);
    return { changes, truncated };
  }

  function forFailure(c, failure) {
    const event = Number.isInteger(failure.call) ? c.events[failure.call] : null;
    if (failure.code === 'ARGUMENT_MISMATCH' && event && own(event, 'expectedArguments')) {
      return { label: 'Tool arguments', ...compare(event.expectedArguments, event.arguments) };
    }
    if (!own(failure, 'expected') || (!own(failure, 'actual') && !failure.actualMissing)) return null;
    const label = { EXPECTED_ORDER: 'Tool order', RESULT_MISMATCH: 'Result assertion', OUTPUT_MISMATCH: 'Agent output' }[failure.code] || 'Expected and actual';
    return { label, ...compare(failure.expected, failure.actual, { actualMissing: failure.actualMissing === true }) };
  }

  function preview(value) {
    const json = Object.is(value, -0) ? '-0' : JSON.stringify(value);
    const text = json === undefined ? 'undefined' : json;
    return text.length > 240 ? text.slice(0, 240) + '…' : text;
  }
  function note(detail) {
    if (detail.truncated) return 'Comparison limited to 20 differences, 20,000 visited values, and 64 levels. Inspect the full evidence for more.';
    if (!detail.changes.length) return 'No visible difference after masking or JSON conversion. The original check still failed.';
    return '';
  }
  function format(detail) {
    if (!detail) return '';
    return [...detail.changes.map(change => `${JSON.stringify(change.path || '(root)')} · ${labels[change.kind]} · expected ${own(change, 'expected') ? preview(change.expected) : '<missing>'} · actual ${own(change, 'actual') ? preview(change.actual) : '<missing>'}`), note(detail)].filter(Boolean).join('\n');
  }
  function html(detail, escape) {
    if (!detail) return '';
    const cell = (change, key) => own(change, key) ? `<pre>${escape(preview(change[key]))}</pre>` : '<span class="diff-missing">Missing</span>';
    const message = note(detail);
    return `<div class="field-diff">${detail.changes.length ? `<div class="diff-scroll" tabindex="0" role="region" aria-label="${escape(detail.label)} field differences"><table class="diff-table"><caption>${escape(detail.label)} / field differences</caption><thead><tr><th scope="col">Field path</th><th scope="col">Change</th><th scope="col">Expected</th><th scope="col">Actual</th></tr></thead><tbody>${detail.changes.map(change => `<tr><th scope="row"><code>${escape(change.path || '(root)')}</code></th><td class="diff-kind">${labels[change.kind]}</td><td class="diff-expected">${cell(change, 'expected')}</td><td class="diff-actual">${cell(change, 'actual')}</td></tr>`).join('')}</tbody></table></div>` : ''}${message ? `<p class="diff-note">${escape(message)}</p>` : ''}</div>`;
  }
  return { compare, forFailure, format, html };
}
