/** Shared validation for untrusted relay snapshots. No network or storage access. */
export function createSnapshotTools(artifacts) {
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (v, max) => typeof v === 'string' && v.length <= max;
  function reportContext(value, report) {
    if (value === undefined || value === null) return report?.execution ? { contractRevision: report.execution.contractRevision, contractHash: report.execution.contractHash } : null;
    check(value && Number.isSafeInteger(value.contractRevision) && value.contractRevision > 0 && typeof value.contractHash === 'string' && /^[a-f0-9]{64}$/.test(value.contractHash), 'Invalid report contract context.');
    if (report?.execution) check(value.contractRevision === report.execution.contractRevision && value.contractHash === report.execution.contractHash, 'Report context disagrees with model execution metadata.');
    return { contractRevision: value.contractRevision, contractHash: value.contractHash };
  }
  function snapshot(value) {
    check(value && value.version === 1 && typeof value.id === 'string' && /^[a-f0-9-]{36}$/.test(value.id), 'Invalid snapshot identity.');
    check(text(value.createdAt, 100) && Number.isFinite(Date.parse(value.createdAt)), 'Invalid snapshot timestamp.');
    check(text(value.sourceDevice, 100) && value.sourceDevice.trim(), 'Invalid snapshot device name.');
    const p = value.project;
    check(p && text(p.name, 200) && p.name.trim() && text(p.task, 12000) && Number.isSafeInteger(p.revision) && p.revision > 0, 'Invalid project snapshot.');
    const opened = artifacts.open(JSON.stringify(p.contract));
    check(opened.kind === 'contract', 'Snapshot must contain a contract.');
    const project = { name: p.name, task: p.task, revision: p.revision, contract: opened.value };
    let report, context;
    if (value.report !== undefined) {
      const evidence = artifacts.open(JSON.stringify(value.report));
      check(evidence.kind === 'report', 'Execution evidence must be a report.');
      report = evidence.value; context = reportContext(value.reportContext, report);
    } else check(value.reportContext === undefined, 'Report context requires execution evidence.');
    const result = { version: 1, id: value.id, createdAt: value.createdAt, sourceDevice: value.sourceDevice, project, ...(report ? { report, ...(context ? { reportContext: context } : {}) } : {}) };
    check(new TextEncoder().encode(JSON.stringify(result)).length <= 2_000_000, 'Snapshot exceeds the 2 MB limit.');
    return result;
  }
  return { snapshot, reportContext };
}
