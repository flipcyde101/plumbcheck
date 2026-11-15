/** A JSON-compatible value. Types describe contracts; they do not validate data. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ToolArguments = Record<string, unknown>;

export interface ToolRequest {
  name: string;
  arguments?: ToolArguments;
}

export interface ToolClient<TResult = unknown> {
  callTool(request: ToolRequest): Promise<TResult>;
}

export interface ToolCall {
  tool: string;
  arguments: ToolArguments;
}

export interface Fixture<TResult = unknown> extends ToolCall {
  result: TResult;
}

export interface Policies {
  allow?: readonly string[];
  deny?: readonly string[];
  requireApproval?: readonly string[];
}

/** A trusted test fixture, not authentication of a human approval. */
export interface TestContext {
  approvedTools?: readonly string[];
}

export interface ResultAssertion {
  /** Zero-based index of the attempted call. */
  call: number;
  /** Own-property dotted path; an empty path selects the entire result. */
  path: string;
  equals: unknown;
}

export interface Expectations {
  callOrder?: readonly string[];
  never?: readonly string[];
  results?: readonly ResultAssertion[];
}

interface CaseBase<TResult> {
  name: string;
  description?: string;
  fixtures: readonly Fixture<TResult>[];
  context?: TestContext;
}

export interface PlannedCase<TResult = unknown> extends CaseBase<TResult> {
  calls: readonly ToolCall[];
  input?: never;
  expect?: Expectations & { output?: never };
}

export type AgentCase<TInput = unknown, TResult = unknown> = CaseBase<TResult> & {
  calls?: never;
  expect?: Expectations & { output?: unknown };
} & (undefined extends TInput ? { input?: TInput } : { input: TInput });

interface SuiteBase {
  version: 1;
  name: string;
  description?: string;
  policies: Policies;
}

export interface PlannedSuite<TResult = unknown> extends SuiteBase {
  cases: readonly PlannedCase<TResult>[];
}

export interface AgentSuite<TInput = unknown, TResult = unknown> extends SuiteBase {
  cases: readonly AgentCase<TInput, TResult>[];
}

export interface AgentContext<TInput = unknown> {
  input: TInput;
  name: string;
}

/** Trusted local code. The client is fixture-only; other agent I/O is not sandboxed. */
export type Agent<TInput = unknown, TOutput = unknown, TResult = unknown> = (
  client: Readonly<ToolClient<TResult>>,
  context: AgentContext<TInput>,
) => TOutput | Promise<TOutput>;

export interface ToolEvent<TResult = unknown> {
  index: number;
  tool: string;
  /** Failed attempts can contain malformed argument data; narrow before access. */
  arguments: unknown;
  status: 'replayed' | 'blocked' | 'failed';
  result?: TResult;
  expectedArguments?: ToolArguments;
  code?: string;
  message?: string;
  durationMs: number;
}

export interface TestFailure {
  code: string;
  message: string;
  call?: number;
  expected?: unknown;
  actual?: unknown;
  actualMissing?: true;
}

export interface CaseReport<TOutput = unknown> {
  name: string;
  description: string;
  passed: boolean;
  events: ToolEvent[];
  failures: TestFailure[];
  output?: TOutput;
}

export interface TestReport<TOutput = unknown> {
  version: 1;
  name: string;
  description: string;
  mode: 'fixture-replay' | 'agent-replay' | 'mcp-replay';
  scope: 'intercepted-tool-calls';
  createdAt: string;
  durationMs: number;
  passed: boolean;
  /** Optional app-recorded provenance; an imported report is not authenticated. */
  execution?: {
    runner: 'builtin-model';
    provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio' | 'compatible';
    model: string;
    connectionName: string;
    contractRevision: number;
    contractHash: string;
    limits: { timeoutMs: number; maxSteps: number; maxOutputTokens: number; maxTotalOutputTokens: number };
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number; steps: number; usageIncomplete: boolean };
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    calls: number;
    blocked: number;
    /** Counts only calls mediated by replay, not an agent's independent I/O. */
    liveToolCalls: 0;
  };
  cases: CaseReport<TOutput>[];
}

export interface PlannedReport extends TestReport<never> { mode: 'fixture-replay' }
export interface AgentReport<TOutput = unknown> extends TestReport<TOutput> { mode: 'agent-replay' }

export class ContractError extends Error {
  constructor(code: string, message: string);
  code: string;
}

export class ReplaySession<TResult = unknown> implements ToolClient<TResult> {
  constructor(options: { fixtures: readonly Fixture<TResult>[]; policies: Policies; context?: TestContext });
  readonly fixtures: readonly Fixture<TResult>[];
  readonly policies: Policies;
  readonly context: TestContext;
  readonly cursor: number;
  readonly events: readonly ToolEvent<TResult>[];
  callTool(request: ToolRequest): Promise<TResult>;
  verifyComplete(): void;
}

export interface RecordedToolError {
  isError: true;
  content: { type: 'text'; text: string }[];
}

export interface PendingFixture<TResult = unknown> extends ToolCall {
  result?: TResult;
}

export interface Recorder<TResult = unknown> extends ToolClient<TResult> {
  /** Live in-memory entries may still be pending; use snapshot() before saving. */
  readonly fixtures: readonly PendingFixture<TResult | RecordedToolError>[];
  /** Waits for calls present at invocation; validates JSON and returns a separate copy. */
  snapshot(): Promise<Fixture<TResult | RecordedToolError>[]>;
}

/** Recording DOES execute the supplied client. Never supply an untrusted live client. */
export function createRecorder<TResult>(client: ToolClient<TResult>): Recorder<TResult>;
export function runSuite(suite: PlannedSuite): Promise<PlannedReport>;
export function runAgentSuite<TInput, TOutput, TResult = unknown>(suite: AgentSuite<TInput, TResult>, agent: Agent<TInput, TOutput, TResult>): Promise<AgentReport<TOutput>>;
export function validateSuite(input: unknown, options?: { mode?: 'planned' }): PlannedSuite;
export function validateSuite(input: unknown, options: { mode: 'agent' }): AgentSuite;
export function validateSuite(input: unknown, options: { mode: 'planned' | 'agent' }): PlannedSuite | AgentSuite;
/** Credential-key masking may change value types; free-text secrets are not detected. */
export function redact(value: unknown): unknown;
export function toHtml(report: TestReport): Promise<string>;
export function toJUnit(report: TestReport): string;
