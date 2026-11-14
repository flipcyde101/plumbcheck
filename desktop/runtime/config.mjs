import { isAbsolute } from 'node:path';
import { validateSuite } from '../../src/validation.js';
import { createArtifactTools } from '../../src/artifacts.js';

export function readDesktopContract(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 1_000_000) throw new Error('Choose a contract of at most 1 MB.');
  return validateSuite(createArtifactTools(value => value, validateSuite).parse(source));
}

export function makeMcpSetup(suite, caseName, { executable, runnerScript, contractPath, reportPath } = {}) {
  validateSuite(suite);
  if (!suite.cases.some(c => c.name === caseName)) throw new Error('Choose a case from the current contract.');
  for (const value of [executable, runnerScript, contractPath, reportPath]) {
    if (typeof value !== 'string' || !isAbsolute(value)) throw new Error('MCP setup requires absolute local paths.');
  }
  return { contractPath, reportPath, config: { mcpServers: { plumbcheck: {
    command: executable,
    args: [runnerScript, contractPath, caseName, '--out', reportPath],
  } } } };
}
