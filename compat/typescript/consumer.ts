import {
  ReplaySession, ContractError, createRecorder, runSuite, runAgentSuite,
  validateSuite, redact, toHtml, toJUnit,
  type AgentSuite, type PlannedSuite, type ToolRequest, type Fixture,
} from 'plumbcheck';

const planned = {
  version: 1, name: 'Typed planned contract', policies: { allow: ['read'] },
  cases: [{ name: 'Read', calls: [{ tool: 'read', arguments: { id: 1 } }], fixtures: [{ tool: 'read', arguments: { id: 1 }, result: { status: 'ready' } }] }],
} as const satisfies PlannedSuite;
const plan = await runSuite(planned);
const plannedMode: 'fixture-replay' = plan.mode;
const passed: boolean = plan.passed;
const html: string = await toHtml(plan);
const junit: string = toJUnit(plan);
const masked: unknown = redact(plan);
const code: string = new ContractError('EXAMPLE', 'An example').code;

const session = new ReplaySession({ fixtures: [{ tool: 'read', arguments: {}, result: { status: 'ready' } }], policies: { allow: ['read'] } });
const response = await session.callTool({ name: 'read' });
const status: string = response.status;
session.verifyComplete();

interface Input { orderId: string }
interface ToolResponse { structuredContent: { status: string } }
const suite: AgentSuite<Input, ToolResponse> = {
  version: 1, name: 'Typed agent', policies: { allow: ['read'] }, cases: [{ name: 'Read', input: { orderId: 'ORD-1' },
    fixtures: [{ tool: 'read', arguments: { id: 'ORD-1' }, result: { structuredContent: { status: 'ready' } } }], expect: { output: { status: 'ready' } } }],
};
const agentReport = await runAgentSuite(suite, async (client, { input, name }) => {
  const request = { name: 'read', arguments: { id: input.orderId } } satisfies ToolRequest;
  const result = await client.callTool(request);
  const typedStatus: string = result.structuredContent.status;
  return { status: typedStatus, caseName: name };
});
const agentMode: 'agent-replay' = agentReport.mode;
const returnedStatus: string | undefined = agentReport.cases[0]?.output?.status;

const noInput: AgentSuite<undefined> = { version: 1, name: 'No input', policies: {}, cases: [{ name: 'Output only', fixtures: [], expect: { output: false } }] };
await runAgentSuite(noInput, (_client, { input }) => { const missing: undefined = input; return missing === undefined; });

const recorder = createRecorder({ async callTool(_request: ToolRequest) { return { ready: true }; } });
await recorder.callTool({ name: 'read', arguments: {} });
const fixtures = await recorder.snapshot();
const replay = new ReplaySession({ fixtures, policies: { allow: ['read'] } });
const recorded = await replay.callTool({ name: 'read' });
if ('ready' in recorded) { const ready: boolean = recorded.ready; }
const genericFixtures: readonly Fixture[] = fixtures;
const dynamic: unknown = planned;
await runSuite(validateSuite(dynamic));
await runAgentSuite(validateSuite(noInput, { mode: 'agent' }), (_client, { input }) => typeof input);

// These must remain errors: catching API mistakes is part of the consumer check.
// @ts-expect-error A tool name is required.
session.callTool({ arguments: {} });
// @ts-expect-error Policy lists contain tool-name strings.
const invalidPolicy: PlannedSuite = { version: 1, name: 'Bad', policies: { allow: [false] }, cases: [] };
// @ts-expect-error Agent cases cannot contain a planned calls list.
const mixedMode: AgentSuite = { version: 1, name: 'Bad', policies: {}, cases: [{ name: 'Bad', fixtures: [], calls: [] }] };
// @ts-expect-error An explicitly typed input is required in each case.
const missingInput: AgentSuite<Input> = { version: 1, name: 'Bad', policies: {}, cases: [{ name: 'Bad', fixtures: [] }] };
// @ts-expect-error The agent output type is inferred, not any.
const wrongOutput: number = agentReport.cases[0]!.output!.status;
// @ts-expect-error Planned-call reports have no agent output object.
plan.cases[0]!.output.status;
// @ts-expect-error Result assertions use numeric call indexes.
const invalidIndex: PlannedSuite = { version: 1, name: 'Bad', policies: {}, cases: [{ name: 'Bad', calls: [], fixtures: [], expect: { results: [{ call: 'zero', path: '', equals: true }] } }] };
// @ts-expect-error Redaction can change value types and returns unknown.
redact(plan).passed;
// @ts-expect-error Pending raw recording entries are not completed fixtures.
const incompleteFixtures: readonly Fixture[] = recorder.fixtures;
// @ts-expect-error Attempted argument evidence may be malformed and needs narrowing.
plan.cases[0]!.events[0]!.arguments.orderId;
