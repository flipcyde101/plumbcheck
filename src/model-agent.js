import { ToolLoopAgent, tool, jsonSchema, isStepCount } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { runAgentSuite } from './agent-runner.js';
import { fixtureInputSchema } from './mcp-schema.js';
import { connectionConfig } from './workspace.js';
class ModelBudgetError extends Error {}
class ModelCallError extends Error {}

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

/** Model decisions execute only the supplied replay client. No live tools. */
export async function runModelProject({ project, connection, apiKey, limits, signal, model, onUsage, fetch: transport }) {
  const suite = structuredClone(project.contract);
  for (const c of suite.cases) delete c.calls;
  const selectedModel = model || connectedModel(connection, apiKey, { fetch: transport });
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, steps: 0, usageIncomplete: false };
  let accountedOutput = 0;
  let reservedStep = limits.maxOutputTokens;
  const totalBudget = limits.maxTotalOutputTokens ?? 10000;
  return runAgentSuite(suite, async (client, context) => {
    signal?.throwIfAborted();
    const c = suite.cases.find(c => c.name === context.name);
    const names = [...new Set(c.fixtures.map(f => f.tool))];
    let calls = 0;
    const executed = new Set();
    let invalidToolCall = false, providerExceededBudget = false, toolBudgetExceeded = false;
    const tools = Object.fromEntries(names.map((name, i) => [`tool_${i}`, tool({
      description: `Test tool: ${name}. Uses simulated responses.`,
      inputSchema: jsonSchema(fixtureInputSchema(c.fixtures.filter(f => f.tool === name))),
      execute: async (arguments_, { toolCallId }) => {
        signal?.throwIfAborted();
        executed.add(toolCallId);
        if (++calls > 100) { toolBudgetExceeded = true; throw new ModelBudgetError('Per-case tool-call budget exceeded.'); }
        return client.callTool({ name, arguments: arguments_ });
      },
    })]));
    const agent = new ToolLoopAgent({
      model: selectedModel, tools, maxRetries: 0,
      maxOutputTokens: limits.maxOutputTokens,
      stopWhen: isStepCount(limits.maxSteps),
      prepareStep: () => {
        if (toolBudgetExceeded) throw new ModelBudgetError('Per-case tool-call budget exceeded.');
        if (invalidToolCall) throw new ModelCallError('The model attempted an unknown or schema-invalid tool call. The run cannot pass.');
        if (providerExceededBudget) throw new ModelBudgetError('The provider exceeded the requested output-token budget. The run stopped.');
        if (accountedOutput >= totalBudget) throw new ModelBudgetError('Run output-token budget exhausted. Start a new authorized run with a reviewed limit.');
        reservedStep = Math.min(limits.maxOutputTokens, totalBudget - accountedOutput);
        return { maxOutputTokens: reservedStep };
      },
      onStepEnd: step => {
        const current = step.usage || {};
        const input = Number.isSafeInteger(current.inputTokens) && current.inputTokens >= 0 ? current.inputTokens : null;
        const output = Number.isSafeInteger(current.outputTokens) && current.outputTokens >= 0 ? current.outputTokens : null;
        usage.inputTokens += input ?? 0;
        usage.outputTokens += output ?? 0;
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
        usage.steps++;
        usage.usageIncomplete ||= output === null || input === null;
        accountedOutput += output ?? reservedStep;
        // SDK lifecycle callbacks are observers: their exceptions are ignored.
        // Enforce these flags in prepareStep and after generate resolves instead.
        invalidToolCall ||= step.toolCalls.some(call => call.invalid || !Object.hasOwn(tools, call.toolName) || !executed.has(call.toolCallId));
        providerExceededBudget ||= accountedOutput > totalBudget;
        onUsage?.({ ...usage });
      },
      instructions: project.task + '\nUse only the provided test tools. Never invent tool results. If the task asks for JSON, return only JSON.',
    });
    let result;
    try {
      result = await agent.generate({ prompt: JSON.stringify({ scenario: c.name, description: c.description || '', input: context.input ?? null }), abortSignal: signal });
      if (toolBudgetExceeded) throw new ModelBudgetError('Per-case tool-call budget exceeded.');
      if (invalidToolCall) throw new ModelCallError('The model attempted an unknown or schema-invalid tool call. The run cannot pass.');
      if (providerExceededBudget) throw new ModelBudgetError('The provider exceeded the requested output-token budget. The run stopped.');
    }
    catch (error) { if (error instanceof ModelBudgetError || error instanceof ModelCallError) throw error; throw new Error('Model execution failed. Verify model tool support, credentials, server availability, and run limits. Provider response bodies are excluded from reports.'); }
    const output = result.text.trim();
    try { return JSON.parse(output); } catch { return output; }
  });
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
