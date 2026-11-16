import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function createControlServer(call) {
  const server = new McpServer({ name: 'PlumbCheck testing control', version: '0.2.0-preview.5' }, { maxToolInputElements: 20000 });
  const id = z.string().uuid();
  const specs = [
    ['plumbcheck_list_projects', 'List saved projects and their current revision. No credentials or raw fixtures.', {}],
    ['plumbcheck_validate_contract', 'Validate a proposed test contract without saving or running it.', { contract: z.record(z.string(), z.unknown()), mode: z.enum(['planned', 'agent']).optional() }],
    ['plumbcheck_run_suite', 'Run offline checks for a saved project revision. This cannot spend model credits or execute arbitrary code. Reuse the same idempotencyKey when retrying.', { projectId: id, revision: z.number().int().positive(), idempotencyKey: z.string().min(1).max(128) }],
    ['plumbcheck_get_run', 'Read actual job status and masked evidence. Only passed means the checks passed.', { runId: id }],
    ['plumbcheck_cancel_run', 'Cancel a queued or active run. Finished jobs are immutable.', { runId: id }],
    ['plumbcheck_compare_runs', 'Compare two completed runs from the same saved project.', { left: id, right: id }],
  ];
  for (const [name, description, shape] of specs) {
    const readOnly = ['plumbcheck_list_projects', 'plumbcheck_validate_contract', 'plumbcheck_get_run', 'plumbcheck_compare_runs'].includes(name);
    server.registerTool(name, { description, inputSchema: z.object(shape).strict(), annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async args => {
      try { const result = await call(name, args); return { content: [{ type: 'text', text: JSON.stringify(result) }], ...(result && typeof result === 'object' && !Array.isArray(result) ? { structuredContent: result } : {}) }; }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error.message || 'The requested operation failed.' }] }; }
    });
  }
  return server;
}
