import { rename as fsRename } from 'node:fs/promises';

// Windows refuses to rename over a file that another process holds open for a moment
// (antivirus scanners, the search indexer, backup tools). Those locks clear within
// milliseconds to a few seconds, so retry these codes with a growing delay. Any other
// error, or the same error after the last attempt, is thrown unchanged.
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const RETRY_DELAYS_MS = Object.freeze([20, 50, 100, 200, 400, 800, 1600]);

/** Atomically replace `to` with `from` (same directory), retrying transient Windows locks. */
export async function replaceFile(from, to, { rename = fsRename, delays = RETRY_DELAYS_MS, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(from, to); }
    catch (error) {
      if (!TRANSIENT.has(error?.code) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    }
  }
}
