# TypeScript and package usage

PlumbCheck ships ESM JavaScript and declarations in the same package. The `types` export resolves under NodeNext and Bundler module resolution. The runtime remains **Node.js 22+**; a Bundler type check does not imply browser runtime support.

The canonical package/commands are `plumbcheck` and `plumbcheck-mcp`, matching the repository and product name. The earlier `plumcheck` / `plumcheck-mcp` command aliases and original entry files continue to work. The package has not been published to npm or reserved there: use this repository or a locally packed archive, not an assumed registry installation.

## Import from an installed local package

```sh
# From this repository
npm pack

# In a consumer project, install the generated archive by its absolute path
npm install /absolute/path/plumbcheck-0.1.0-alpha.1.tgz
```

```ts
import { runSuite, type PlannedSuite } from 'plumbcheck';

const contract = {
  version: 1,
  name: 'Typed order lookup',
  policies: { allow: ['orders.lookup'] },
  cases: [{
    name: 'Read order',
    calls: [{ tool: 'orders.lookup', arguments: { orderId: 'ORD-1' } }],
    fixtures: [{
      tool: 'orders.lookup',
      arguments: { orderId: 'ORD-1' },
      result: { status: 'shipped' }
    }]
  }]
} as const satisfies PlannedSuite;

const report = await runSuite(contract);
console.log(report.passed);
```

When working directly in this repository, importing `./src/index.js` also resolves the adjacent declarations. No TypeScript runtime dependency or separate `@types` package is needed.

## Typed inputs, tool responses, and final outputs

```ts
import { runAgentSuite, type AgentSuite } from 'plumbcheck';

interface Input { orderId: string }
interface ToolResponse { status: string }

const contract: AgentSuite<Input, ToolResponse> = {
  version: 1,
  name: 'Actual agent',
  policies: { allow: ['orders.lookup'] },
  cases: [{
    name: 'Return shipping status',
    input: { orderId: 'ORD-1' },
    fixtures: [{ tool: 'orders.lookup', arguments: { orderId: 'ORD-1' }, result: { status: 'shipped' } }],
    expect: { output: { status: 'shipped' } }
  }]
};

const report = await runAgentSuite(contract, async (client, { input }) => {
  const result = await client.callTool({ name: 'orders.lookup', arguments: { orderId: input.orderId } });
  return { status: result.status };
});
// The callback's return type is retained on case.output.
console.log(report.cases[0]?.output?.status);
```

An explicitly typed input must be present in each case. `AgentSuite<undefined>` supports cases with no input. Without an explicit tool-response type, results remain `unknown` and need a real runtime guard before accessing fields. The declarations do not turn arbitrary tool responses into validated objects.

`validateSuite(unknown)` validates the built-in contract structure, not your custom input or response schema. `redact()` returns `unknown` because masking a credential key can change a value's type. Agent outputs still need to be finite JSON data at runtime.

## Snapshot recordings before saving or replaying them

```ts
import { createRecorder, ReplaySession } from 'plumbcheck';

const recorder = createRecorder(yourTrustedClient);
await recorder.callTool({ name: 'orders.lookup', arguments: { orderId: 'ORD-1' } });
const fixtures = await recorder.snapshot();
const replay = new ReplaySession({ fixtures, policies: { allow: ['orders.lookup'] } });
```

**Recording executes the supplied client.** `snapshot()` waits for the calls present when it is invoked, preserves invocation order, rejects incomplete/non-JSON entries, and returns an independent copy. Calls started later belong to a later snapshot. Original call errors still reject; their completed error fixtures are included in the snapshot. Error fixtures fail replay contracts by default.

Raw `recorder.fixtures` entries may still be pending, so their `result` is optional in the declarations. Snapshot results are completed fixtures. Snapshots are **not redacted**; review sensitive values before persisting or sharing them.

## Reproduce consumer compatibility checks

```sh
npm ci --prefix compat/typescript --ignore-scripts
npm run test:types
```

The harness packs the actual repository, installs the archive into a temporary consumer project, and compiles positive and intentionally invalid usage with pinned **TypeScript 5.9.3 and 7.0.2**, each under NodeNext and Bundler resolution. It also runs both installed CLI spellings and imports the installed runtime to verify that the declared exports and snapshot method really exist. Compiler dependencies are isolated test tooling and are excluded from the shipped runtime.

Reference: [TypeScript declaration publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html).
