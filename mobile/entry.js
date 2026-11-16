import { runSuite } from '../src/runner.js';
import { redact } from '../src/redact.js';
import { createContractValidator } from '../src/contract.js';
import safe from '../examples/customer-support/safe.json';
import regression from '../examples/customer-support/regression.json';
import { startMobile } from './ui.js';
import { createArtifactTools } from '../src/artifacts.js';
import { syncRequest } from '../src/sync-client.js';
import { createNativeModelFetch, normalizeOllamaServer, discoverOllama, runOllama } from './ollama.js';

window.PlumbCheckMobile = { runSuite, redact, validateSuite: createContractValidator(), normalizeOllamaServer, discoverOllama, runOllama, createNativeModelFetch };
if (typeof document !== 'undefined') startMobile({ runSuite, redact, safe, regression, artifacts: createArtifactTools(redact, createContractValidator()), syncRequest, model: { createNativeModelFetch, normalizeOllamaServer, discoverOllama, runOllama } });
