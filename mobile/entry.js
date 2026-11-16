import { runSuite } from '../src/runner.js';
import { redact } from '../src/redact.js';
import { createContractValidator } from '../src/contract.js';
import safe from '../examples/customer-support/safe.json';
import regression from '../examples/customer-support/regression.json';
import { startMobile } from './ui.js';
import { createArtifactTools } from '../src/artifacts.js';
import { syncRequest } from '../src/sync-client.js';
import { createNativeModelFetch, normalizeOllamaServer, discoverOllama, runOllama } from './ollama.js';
import { createSnapshotTools } from '../src/snapshot.js';
import { createEvidenceStore } from './evidence.js';

window.PlumbCheckMobile = { runSuite, redact, validateSuite: createContractValidator(), normalizeOllamaServer, discoverOllama, runOllama, createNativeModelFetch };
if (typeof document !== 'undefined') {
  const artifacts = createArtifactTools(redact, createContractValidator()), snapshots = createSnapshotTools(artifacts);
  startMobile({ runSuite, redact, safe, regression, artifacts, snapshots, evidenceStore: createEvidenceStore(localStorage, artifacts, snapshots), syncRequest, model: { createNativeModelFetch, normalizeOllamaServer, discoverOllama, runOllama } });
}
