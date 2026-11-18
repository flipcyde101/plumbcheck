import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOllamaServer, createNativeModelFetch, discoverOllama, runOllama } from '../mobile/ollama.js';
const server = 'http://192.168.1.138:11434';
test('phone addresses normalize pasted model-list URLs and reject unsafe HTTP destinations', () => {
  assert.equal(normalizeOllamaServer(`${server}/api/tags`), server);
  assert.equal(normalizeOllamaServer(`${server}/v1`), server);
  assert.equal(normalizeOllamaServer('http://192.168.1.138'), server);
  for (const url of ['http://example.com', 'http://169.254.169.254', 'http://8.8.8.8', 'https://secret@example.com', `${server}/?key=secret`, `${server}/#secret`, `${server}/arbitrary`, 'file:///etc/passwd']) assert.throws(() => normalizeOllamaServer(url));
});
test('native fetch settles HTTP, malformed-response and cancellation paths without leaking pending work', async () => {
  const target = {}; let last, cancelled;
  const bridge = { requestOllama(id) { last = id; }, cancelOllama(id) { cancelled = id; } };
  const transport = createNativeModelFetch(bridge, target);
  let request = transport(`${server}/api/tags`); target.__plumbcheckModelResponse({ id: last, status: 200, body: '{"models":[]}' });
  assert.deepEqual(await (await request).json(), { models: [] });
  request = transport(`${server}/api/tags`); target.__plumbcheckModelResponse({ id: last, status: -1, body: '' }); await assert.rejects(request, /invalid/);
  const abort = new AbortController(); request = transport(`${server}/api/tags`, { signal: abort.signal }); const id = last; abort.abort(); await assert.rejects(request, { name: 'AbortError' }); assert.equal(cancelled, id);
  target.__plumbcheckModelResponse({ id, status: 200, body: '{}' });
  request = transport(`${server}/api/tags`); target.__plumbcheckModelResponse({ id: last, status: 204, body: '' }); assert.equal((await request).status, 204);
});
test('mobile discovery validates the Ollama response and retains exact user-selected IDs', async () => {
  assert.deepEqual(await discoverOllama(server, async () => Response.json({ models: [{ name: 'qwen3.5:4b' }, { name: 'x'.repeat(201) }] })), ['qwen3.5:4b']);
  await assert.rejects(discoverOllama(server, async () => new Response('private error body', { status: 403 })), /HTTP 403/);
  await assert.rejects(discoverOllama(server, async () => Response.json({ unexpected: [] })), /model IDs/);
});
test('mobile provider executes real SDK tool decisions and catches wrong arguments', async () => {
  const contract = { version: 1, name: 'Phone model', policies: { allow: ['orders.lookup'] }, cases: [{ name: 'Order', input: { id: 'ORD-1' }, fixtures: [{ tool: 'orders.lookup', arguments: { id: 'ORD-1' }, result: { status: 'shipped' } }], expect: { callOrder: ['orders.lookup'] } }] };
  for (const wrong of [false, true]) {
    const requests = []; let steps = 0;
    const transport = async (url, init) => {
      assert.equal(String(url), `${server}/v1/chat/completions`); requests.push(JSON.parse(init.body));
      const first = steps++ === 0;
      return Response.json({ id: 'test', object: 'chat.completion', created: 1, model: 'qwen3.5:4b', choices: [{ index: 0, finish_reason: first ? 'tool_calls' : 'stop', message: first ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'orders_lookup', arguments: JSON.stringify({ id: wrong ? 'WRONG' : 'ORD-1' }) } }] } : { role: 'assistant', content: 'shipped' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    };
    const report = await runOllama({ contract, task: 'Look up the order.', model: 'qwen3.5:4b', server, transport, limits: { maxSteps: 3, maxOutputTokens: 100, maxTotalOutputTokens: 1000 } });
    assert.equal(report.passed, !wrong);
    assert.equal(steps, 2); assert.ok(!JSON.stringify(requests[0].tools).includes('ORD-1'));
    if (wrong) assert.ok(report.cases[0].failures.some(f => f.code === 'ARGUMENT_MISMATCH'));
  }
});
