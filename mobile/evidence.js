/** Store evidence and its context together, so a quota failure cannot pair a
 * new report with an old contract revision. Legacy reports remain readable. */
export function createEvidenceStore(storage, artifacts, snapshots) {
  function normalize(value) {
    if (value == null || value.report === null) return { storageVersion: 1, report: null, context: null, origin: null };
    const opened = artifacts.open(JSON.stringify(value.report));
    if (opened.kind !== 'report') throw new Error('Expected execution evidence.');
    const origin = value.origin || { kind: 'file' };
    if (!['local', 'file', 'sync'].includes(origin.kind)) throw new Error('Invalid evidence source.');
    const source = { kind: origin.kind };
    if (origin.kind === 'sync') {
      if (typeof origin.deviceName !== 'string' || origin.deviceName.length > 100 || !Number.isSafeInteger(origin.snapshotRevision) || origin.snapshotRevision < 1) throw new Error('Invalid evidence device context.');
      Object.assign(source, { deviceName: origin.deviceName, snapshotRevision: origin.snapshotRevision });
      if (origin.snapshotContractHash !== undefined) { if (!/^[a-f0-9]{64}$/.test(origin.snapshotContractHash)) throw new Error('Invalid snapshot contract hash.'); source.snapshotContractHash = origin.snapshotContractHash; }
    }
    return { storageVersion: 1, report: opened.value, context: snapshots.reportContext(value.context, opened.value), origin: source };
  }
  return {
    read() {
      const current = storage.getItem('plumbcheck-report');
      if (current === null) return normalize(null);
      const value = JSON.parse(current);
      if (value?.storageVersion !== undefined) { if (value.storageVersion !== 1) throw new Error('Unsupported or damaged saved evidence.'); return normalize(value); }
      return normalize({ report: value, origin: { kind: 'file' } });
    },
    write(value) { const next = normalize(value); storage.setItem('plumbcheck-report', JSON.stringify(next)); return next; },
  };
}
