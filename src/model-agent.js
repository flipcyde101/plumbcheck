import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { connectionConfig } from './workspace.js';
import { runModelProject as runPortableModelProject } from './model-runner.js';

export function connectedModel(connection, apiKey, { fetch: transport = fetch } = {}) {
  const c = connectionConfig(connection);
  if (['openai', 'anthropic', 'google'].includes(c.provider) && !apiKey) throw new Error('Add this connection’s API key before running.');
  // Never follow a provider redirect with a credential-bearing request.
  const request = (url, init) => transport(url, { ...init, redirect: 'error' });
  const options = { apiKey: apiKey || 'local', fetch: request };
  if (c.provider === 'anthropic') return createAnthropic(options)(c.model);
  if (c.provider === 'google') return createGoogleGenerativeAI(options)(c.model);
  if (c.baseURL) options.baseURL = c.baseURL;
  const provider = createOpenAI(options);
  return c.provider === 'openai' ? provider(c.model) : provider.chat(c.model);
}

/** Provider wiring for the shared portable model runner. */
export async function runModelProject(args) {
  return runPortableModelProject({ ...args, model: args.model || connectedModel(args.connection, args.apiKey, { fetch: args.fetch }) });
}

export async function discoverModels(connection, apiKey, { fetch: transport = fetch } = {}) {
  const c = connectionConfig(connection);
  const headers = {};
  let url;
  if (c.provider === 'anthropic') { url = 'https://api.anthropic.com/v1/models'; headers['x-api-key'] = apiKey || ''; headers['anthropic-version'] = '2023-06-01'; }
  else if (c.provider === 'google') { url = 'https://generativelanguage.googleapis.com/v1beta/models'; headers['x-goog-api-key'] = apiKey || ''; }
  else { url = `${c.baseURL || 'https://api.openai.com/v1'}/models`; if (apiKey) headers.Authorization = `Bearer ${apiKey}`; }
  const response = await transport(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Connection returned HTTP ${response.status}. Check the URL and credential.`);
  if (!response.body) throw new Error('The server did not return a model list. Enter a known model ID manually.');
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2_000_000) throw new Error('Model list is too large.'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('The server did not return a JSON model list.'); }
  const listed = body?.data || body?.models || [];
  if (!Array.isArray(listed)) throw new Error('The server returned an unsupported model-list format.');
  const models = listed.map(m => typeof m?.id === 'string' ? m.id : typeof m?.name === 'string' ? m.name.replace(/^models\//, '') : null).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200).slice(0, 1000);
  return { models, note: 'Discovery confirms server access. Run a scenario to verify the selected model supports tool calling.' };
}
