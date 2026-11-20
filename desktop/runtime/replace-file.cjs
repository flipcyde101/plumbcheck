'use strict';
// CommonJS twin of src/replace-file.js for the Electron main process; keep the two in step
// (test/replace-file.test.js checks both). Windows refuses to rename over a file that another
// process holds open for a moment (antivirus, search indexer), so retry those codes briefly.
const { rename: fsRename } = require('node:fs/promises');

const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = Object.freeze([20, 50, 100, 200, 400, 800, 1600]);

async function replaceFile(from, to, { rename = fsRename, delays = RETRY_DELAYS_MS, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(from, to); }
    catch (error) {
      if (!TRANSIENT.has(error && error.code) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    }
  }
}

module.exports = { replaceFile, RETRY_DELAYS_MS };
