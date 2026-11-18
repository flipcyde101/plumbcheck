import { isAbsolute } from 'node:path';
import { validateSuite } from '../../src/validation.js';
import { createArtifactTools } from '../../src/artifacts.js';

// Same rule as the MCP fixture server: agent-mode contracts (no `calls`) are servable.
const modeOf = suite => Array.isArray(suite?.cases) && suite.cases.every(c => c && typeof c === 'object' && !Object.hasOwn(c, 'calls')) ? 'agent' : 'planned';

export function readDesktopContract(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 1_000_000) throw new Error('Choose a contract of at most 1 MB.');
  const suite = createArtifactTools(value => value, validateSuite).parse(source);
  return validateSuite(suite, { mode: modeOf(suite) });
}

export function makeMcpSetup(suite, caseName, { executable, runnerScript, contractPath, reportPath } = {}) {
  validateSuite(suite, { mode: modeOf(suite) });
  if (!suite.cases.some(c => c.name === caseName)) throw new Error('Choose a case from the current contract.');
  for (const value of [executable, runnerScript, contractPath, reportPath]) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('MCP setup requires absolute local paths.');
  }
  return { contractPath, reportPath, config: { mcpServers: { plumbcheck: {
    command: executable,
    args: [runnerScript, contractPath, caseName, '--out', reportPath],
  } } } };
}
