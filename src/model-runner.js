import { ToolLoopAgent, tool, jsonSchema, isStepCount } from 'ai';
import { runAgentSuite } from './agent-runner.js';
import { fixtureInputSchema } from './mcp-schema.js';
class ModelBudgetError extends Error {}
class ModelCallError extends Error {}

/** Model decisions execute only the supplied replay client. No live tools. */
export async function runModelProject({ project, connection, apiKey, limits, signal, model, onUsage, fetch: transport }) {
  const suite = structuredClone(project.contract);
  for (const c of suite.cases) delete c.calls;
  if (!model) throw new TypeError("A connected model is required.");
  const selectedModel = model;
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
