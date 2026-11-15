import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const server = createServer(async (req, res) => {
  const file = req.url === '/' ? 'index.html' : req.url === '/app.js' ? 'app.js' : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  try { const body = await readFile(new URL(`../android/app/src/main/assets/${file}`, import.meta.url)); res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : 'text/html', 'Cache-Control': 'no-store' }); res.end(body); }
  catch { res.writeHead(500); res.end('Run npm run mobile:build first.'); }
});
server.listen(4182, '127.0.0.1', () => console.log('Android interface preview: http://127.0.0.1:4182'));
