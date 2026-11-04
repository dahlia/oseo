/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
  describeTarget,
  printMir,
  targetForExecutionHost,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { babelFrontend } from "../../packages/parser-babel/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * How one dispose method completes. `reject` returns a rejected promise
 * and only appears on an asynchronous stack, where it is awaited; on a
 * synchronous stack the promise would be discarded unhandled. `fallback`
 * resources of an asynchronous stack have only a Symbol.dispose method.
 */
type Outcome = "ok" | "reject" | "throw";

type Operation =
  | {
      readonly fallback: boolean;
      readonly kind: "use";
      readonly outcome: Outcome;
    }
  | { readonly kind: "adopt"; readonly outcome: Outcome }
  | { readonly kind: "defer"; readonly outcome: Outcome }
  | { readonly kind: "move" }
  | { readonly kind: "null" };

interface DisposalCase {
  readonly async: boolean;
  readonly marker: number;
  readonly operations: readonly Operation[];
}

const outcomeArbitrary = (async: boolean): fc.Arbitrary<Outcome> =>
  async
    ? fc.constantFrom<Outcome>("ok", "reject", "throw")
    : fc.constantFrom<Outcome>("ok", "throw");

const operationArbitrary = (async: boolean): fc.Arbitrary<Operation> =>
  fc.oneof(
    fc.record({
      fallback: async ? fc.boolean() : fc.constant(false),
      kind: fc.constant("use" as const),
      outcome: outcomeArbitrary(async),
    }),
    fc.record({
      kind: fc.constant("adopt" as const),
      outcome: outcomeArbitrary(async),
    }),
    fc.record({
      kind: fc.constant("defer" as const),
      outcome: outcomeArbitrary(async),
    }),
    fc.constant({ kind: "move" as const }),
    fc.constant({ kind: "null" as const }),
  );

const caseArbitrary: fc.Arbitrary<DisposalCase> = fc.boolean().chain((async) =>
  fc.record({
    async: fc.constant(async),
    marker: fc.integer({ max: 1_000, min: 1 }),
    operations: fc.array(operationArbitrary(async), { maxLength: 7 }),
  }),
);

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/* The body of one dispose method; `fallback` methods are synchronous. */
function printBody(index: number, outcome: Outcome, async: boolean): string {
  const record = `log.push("dispose ${index}");`;
  if (outcome === "throw") {
    return `${record} throw new Error("e${index}");`;
  }
  if (outcome === "reject") {
    return `${record} return Promise.reject(new Error("e${index}"));`;
  }
  return async ? `${record} return Promise.resolve(${index});` : record;
}

function printOperation(
  operation: Operation,
  index: number,
  async: boolean,
): string {
  const method = async ? "Symbol.asyncDispose" : "Symbol.dispose";
  switch (operation.kind) {
    case "use":
      return operation.fallback
        ? `stack.use({ [Symbol.dispose]() { ${printBody(
            index,
            operation.outcome === "reject" ? "ok" : operation.outcome,
            false,
          )} } });`
        : `stack.use({ [${method}]() { ${printBody(
            index,
            operation.outcome,
            async,
          )} } });`;
    case "adopt": {
      const body = printBody(index, operation.outcome, async);
      return (
        `log.push("adopted " + ` +
        `stack.adopt(${index}, (value) => { ${body} }));`
      );
    }
    case "defer": {
      const body = printBody(index, operation.outcome, async);
      return `stack.defer(() => { ${body} });`;
    }
    case "move":
      return (
        "{ const previous = stack; stack = stack.move(); " +
        'log.push("moved " + previous.disposed + stack.disposed); }'
      );
    case "null":
      return "stack.use(null);";
  }
}

function printCase(testCase: DisposalCase): string {
  const constructor = testCase.async
    ? "AsyncDisposableStack"
    : "DisposableStack";
  const dispose = testCase.async
    ? "await stack.disposeAsync()"
    : "stack.dispose()";
  const operations = testCase.operations
    .map((operation, index) => printOperation(operation, index, testCase.async))
    .join("\n");
  return `
const log = [];
function describe(error) {
  if (error instanceof SuppressedError) {
    return "S(" + describe(error.error) + "," +
      describe(error.suppressed) + ")";
  }
  return error instanceof Error ? error.message : "?" + String(error);
}
async function main() {
  let stack = new ${constructor}();
  ${operations}
  console.log("built", log.join(","), stack.disposed);
  log.length = 0;
  let outcome = "normal";
  try {
    const result = ${dispose};
    outcome = "normal " + result;
  } catch (error) {
    outcome = "error " + describe(error);
  }
  console.log("disposed", log.join(","), outcome, stack.disposed);
  log.length = 0;
  console.log("again", String(${dispose}), log.length);
  let turn = 0;
  while (turn < 2) {
    const each = new ${constructor}();
    each.defer(() => log.push(${testCase.marker}));
    ${dispose.replace("stack", "each")};
    console.log("guard", log.pop(), each.disposed);
    if (turn === 0) ${constructor}.prototype.marker = turn;
    turn = turn + 1;
  }
  /** @param {number} left @param {number} right */
  function hinted(left, right) { return left + right; }
  console.log(
    "hint",
    hinted(${testCase.marker}, 1),
    hinted("${testCase.marker}", 1),
  );
}
main();
`;
}

/**
 * The independent model: adding records each resource in order, `move`
 * keeps the list on the new stack, disposal visits the list in reverse,
 * and each failure after the first becomes a SuppressedError whose
 * `error` is the new failure and whose `suppressed` is the earlier
 * completion. A synchronous fallback method discards its result.
 */
function expected(testCase: DisposalCase): string {
  const built: string[] = [];
  const resources: { index: number; fails: boolean }[] = [];
  testCase.operations.forEach((operation, index) => {
    switch (operation.kind) {
      case "use":
        resources.push({
          fails: operation.fallback
            ? operation.outcome === "throw"
            : operation.outcome !== "ok",
          index,
        });
        break;
      case "adopt":
        built.push(`adopted ${index}`);
        resources.push({ fails: operation.outcome !== "ok", index });
        break;
      case "defer":
        resources.push({ fails: operation.outcome !== "ok", index });
        break;
      case "move":
        built.push("moved truefalse");
        break;
      case "null":
        break;
    }
  });
  const disposed: string[] = [];
  let completion: string | undefined;
  for (const resource of resources.toReversed()) {
    disposed.push(`dispose ${resource.index}`);
    if (!resource.fails) continue;
    const error = `e${resource.index}`;
    completion = completion == null ? error : `S(${error},${completion})`;
  }
  const outcome =
    completion == null ? "normal undefined" : `error ${completion}`;
  return [
    `built ${built.join(",")} false`,
    `disposed ${disposed.join(",")} ${outcome} true`,
    "again undefined 0",
    `guard ${testCase.marker} true`,
    `guard ${testCase.marker} true`,
    `hint ${testCase.marker + 1} ${testCase.marker}1`,
    "",
  ].join("\n");
}

/* Node.js runs the same program as the differential reference. */
async function reference(source: string): Promise<{
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-disposal-intrinsics-property-",
  );
  const sourcePath = `${directory}/case.js`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observation = await host.run({
      args: [sourcePath],
      command: process.execPath,
      cwd: directory,
    });
    succeeded = true;
    return observation;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated disposable stacks match the disposal model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "stacks dispose in reverse order and chain SuppressedError",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          await reference(source),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-disposal-intrinsics.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:smi|shape)/u);
          }
          process.env.OSEO_GC_EVERY_SAFEPOINT = "1";
          try {
            await withNativeFixture(
              {
                backend: cBackend,
                host,
                input: compiled.mir,
                operation: "execute",
                runtime: cRuntimeProvider,
                target: nativeTarget ?? describeTarget("linux-x86_64-gnu"),
                toolchain: nativeToolchain,
              },
              (native) => {
                assertMatchingObservations([expectedObservation, native]);
                assert.ok(native.counters?.collections != null);
                assert.ok(native.counters.collections > 0);
                if (specialization === "enabled") {
                  assert.ok(native.counters.guardMisses > 0);
                }
              },
            );
          } finally {
            delete process.env.OSEO_GC_EVERY_SAFEPOINT;
          }
        }
      }),
      {
        context:
          nativeTarget == null || host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
              ],
        domain:
          "a DisposableStack or AsyncDisposableStack built by zero to " +
          "seven use, adopt, defer, null-use, and move operations whose " +
          "dispose methods return, throw, or reject, with Symbol.dispose " +
          "fallbacks on the asynchronous stack, then disposed twice, plus " +
          "one prototype shape guard miss and one false number hint",
        numRuns: 12,
        profile: "explicit resource management stacks",
        seed: 0x6000_a900,
        sizeLimit:
          "at most seven operations, two disposals, and one prototype " +
          "property write",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
