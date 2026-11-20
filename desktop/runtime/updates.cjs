// Opt-out update notice. At most one GitHub Releases request per day; it never downloads or
// installs anything, and every failure is silent (the app keeps working offline).
const { readFile, writeFile, rename, unlink } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

const LATEST = 'https://api.github.com/repos/stepan4002/plumbcheck/releases/latest';
const RELEASE_PAGES = 'https://github.com/stepan4002/plumbcheck/releases/';
const DAY = 24 * 60 * 60 * 1000;
const defaults = Object.freeze({ checkForUpdates: true, lastUpdateCheck: null, latestRelease: null });

/** Parse MAJOR.MINOR.PATCH[-PRERELEASE]; build metadata is not used by PlumbCheck. */
function parse(version) {
  const m = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(String(version));
  return m ? { core: m.slice(1, 4).map(Number), pre: m[4] ? m[4].split('.') : [] } : null;
}

/** SemVer 2.0 precedence: true when `candidate` is newer than `current`. */
function isNewer(candidate, current) {
  const a = parse(candidate), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i];
  if (!a.pre.length || !b.pre.length) return !a.pre.length && b.pre.length > 0; // a release outranks its pre-releases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return !nx; // alphanumeric identifiers outrank numeric ones
    return x > y;
  }
  return false;
}

/** Only stable releases of this repository, with a release page under its /releases/ path. */
function releaseFrom(body) {
  if (!body || typeof body !== 'object' || body.draft || body.prerelease) return null;
  const version = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : '';
  const parsed = parse(version);
  if (!parsed || parsed.pre.length) return null;
  let url;
  try { url = new URL(body.html_url); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.href.startsWith(RELEASE_PAGES)) return null;
  return { version, url: url.href };
}

function createUpdateChecker({ fetch, settingsFile, currentVersion, now = () => Date.now(), timeoutMs = 10_000 }) {
  let pending = null;
  async function load() {
    try {
      const value = JSON.parse(await readFile(settingsFile, 'utf8'));
      return { ...defaults, ...(value && typeof value === 'object' && !Array.isArray(value) ? value : {}) };
    } catch { return { ...defaults }; }
  }
  async function save(settings) {
    const temporary = `${settingsFile}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(settings, null, 2), { flag: 'wx', mode: 0o600 }); await rename(temporary, settingsFile); }
    catch { /* Preferences are best effort; never block startup. */ }
    finally { await unlink(temporary).catch(() => {}); }
  }
  const result = (settings) => {
    const latest = releaseFrom({ tag_name: settings.latestRelease?.version, html_url: settings.latestRelease?.url });
    const available = Boolean(settings.checkForUpdates && latest && isNewer(latest.version, currentVersion));
    return { enabled: settings.checkForUpdates !== false, available, ...(available ? latest : {}) };
  };
  async function check() {
    const settings = await load();
    if (settings.checkForUpdates === false) return result(settings);
    const last = Date.parse(settings.lastUpdateCheck);
    if (Number.isFinite(last) && now() - last >= 0 && now() - last < DAY) return result(settings);
    settings.lastUpdateCheck = new Date(now()).toISOString(); // throttle failures too
    try {
      const response = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `PlumbCheck/${currentVersion}` }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) { const latest = releaseFrom(await response.json()); if (latest) settings.latestRelease = latest; }
    } catch { /* Offline, rate-limited or blocked: stay silent. */ }
    await save(settings);
    return result(settings);
  }
  return {
    /** Concurrent callers share one request. */
    status() { pending ??= check().finally(() => { pending = null; }); return pending; },
    async setEnabled(enabled) {
      if (typeof enabled !== 'boolean') throw new Error('Expected true or false.');
      const settings = await load();
      settings.checkForUpdates = enabled;
      await save(settings);
      return enabled ? this.status() : result(settings);
    },
  };
}

module.exports = { createUpdateChecker, isNewer, releaseFrom, LATEST, RELEASE_PAGES };
