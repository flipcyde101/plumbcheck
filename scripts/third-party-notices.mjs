import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function writeNotices(destination) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const sections = [];
  for (const [location, info] of Object.entries(lock.packages)) {
    if (!location.startsWith('node_modules/') || info.dev) continue;
    const directory = resolve(root, location);
    if (!directory.startsWith(resolve(root, 'node_modules') + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Invalid dependency location.');
    const files = (await readdir(directory)).filter(name => /^(licen[cs]e|copying)([._-].*)?$/i.test(name));
    const notices = [];
    for (const name of files) { try { notices.push(await readFile(join(directory, name), 'utf8')); } catch (e) { if (e.code !== 'EISDIR') throw e; } }
    sections.push(`${location} @ ${info.version}\nLicense: ${info.license || 'See upstream package'}\n${notices.join('\n') || 'See the upstream package license metadata and source distribution.'}`);
  }
  await writeFile(destination, 'PlumbCheck third-party notices\n\nThis distribution may include the following pinned dependencies. Their licenses apply to their respective code.\n\n' + sections.join('\n\n' + '='.repeat(72) + '\n\n'));
  return sections.length;
}
