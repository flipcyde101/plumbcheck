import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { runSuite } from './runner.js';
import { toHtml } from './report.js';
import { redact } from './redact.js';

export async function loadExamples() {
  const load = async (name) => JSON.parse(await readFile(new URL(`../examples/customer-support/${name}.json`, import.meta.url), 'utf8'));
  return { regression: await load('regression'), safe: await load('safe') };
}

/** Local JSON-only runner: no command execution, uploads, telemetry, or live clients. */
export async function startStudio({ port = 4173, workspaceDirectory, vault, modelRunner, fetch: transport } = {}) {
  const examples = await loadExamples();
  const initial = await runSuite(examples.regression);
  const html = (await toHtml(initial)).replace('data-studio="false"', 'data-studio="true"');
  const service = workspaceDirectory ? await (await import('./workspace-http.js')).workspaceService(workspaceDirectory, { vault, modelRunner, fetch: transport }) : null;
  const server = createServer(async (req, res) => {
    const address = server.address();
    const expectedHost = `127.0.0.1:${address.port}`;
    const expectedOrigin = `http://${expectedHost}`;
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== expectedOrigin)) {
      return json(403, { error: 'Studio accepts its own loopback origin only.' });
    }
    try {
      if (service && await service.handle(req, res, json)) return;
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (req.method === 'GET' && req.url === '/api/examples') return json(200, examples);
      if (req.method === 'POST' && req.url === '/api/run') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Use application/json.' });
        let bytes = 0;
        const chunks = [];
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 1_000_000) { json(413, { error: 'Suite exceeds the 1 MB limit.' }); return; }
          chunks.push(chunk);
        }
        const suite = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return json(200, redact(await runSuite(suite)));
      }
      return json(404, { error: 'Not found.' });
    } catch (error) { return json(error.status || 400, { error: error.message }); }
  });
  server.requestTimeout = 10_000;
  try { await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  }); } catch (error) { await service?.close(); throw error; }
  try { if (service) await service.listen(server.address().port); }
  catch (error) { await service?.close(); await new Promise(resolve => server.close(resolve)); throw error; }
  server.workspace = service?.workspace;
  server.workspaceToken = service?.token;
  server.uiURL = `http://127.0.0.1:${server.address().port}/${service ? `#auth=${service.token}` : ''}`;
  server.shutdown = async () => { await service?.close(); await new Promise(resolve => server.close(resolve)); };
  return server;
}
