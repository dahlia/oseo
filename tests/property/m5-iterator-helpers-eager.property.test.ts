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
import { zigToolchain } from "../../packages/toolchain-zig/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type EagerMethod = "every" | "find" | "forEach" | "reduce" | "some" | "toArray";

/** One generated eager-helper drain under test. */
interface EagerCase {
  /** Make the source iterator's `return` throw, so a close is observable. */
  readonly closeThrows: boolean;
  /** Supply reduce with an initial value; ignored by the other methods. */
  readonly hasInitial: boolean;
  readonly method: EagerMethod;
  /** The divisor the predicates test, which decides where they stop. */
  readonly modulus: number;
  /** Wrap the callback in a transparent callable Proxy. */
  readonly proxyCallback: boolean;
  readonly source: readonly number[];
  /** The callback counter at which the callback throws, or -1 for never. */
  readonly throwAt: number;
}

const caseArbitrary: fc.Arbitrary<EagerCase> = fc.record({
  closeThrows: fc.boolean(),
  hasInitial: fc.boolean(),
  method: fc.constantFrom<EagerMethod>(
    "every",
    "find",
    "forEach",
    "reduce",
    "some",
    "toArray",
  ),
  modulus: fc.integer({ max: 3, min: 1 }),
  proxyCallback: fc.boolean(),
  source: fc.array(fc.integer({ max: 5, min: 0 }), {
    maxLength: 5,
    minLength: 0,
  }),
  throwAt: fc.integer({ max: 4, min: -1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The callback expression the printed program passes to its method. */
function callbackSource(testCase: EagerCase): string {
  const record = `trace.push(v + ":" + i);
    if (i === ${testCase.throwAt}) throw new RangeError("callback");`;
  if (testCase.method === "reduce") {
    return `(a, v, i) => {
    ${record}
    return a + v;
  }`;
  }
  if (testCase.method === "forEach") {
    return `(v, i) => {
    ${record}
  }`;
  }
  return `(v, i) => {
    ${record}
    return v % ${testCase.modulus} === 0;
  }`;
}

/** The method call the printed program measures. */
function callSource(testCase: EagerCase): string {
  if (testCase.method === "toArray") return 'iterator.toArray().join(",")';
  // A transparent callable Proxy is callable but is not a function object,
  // so it proves the callback check accepts every callable the specification
  // admits rather than only ordinary function objects.
  const callback = testCase.proxyCallback
    ? `new Proxy(${callbackSource(testCase)}, {})`
    : callbackSource(testCase);
  if (testCase.method === "reduce") {
    const initial = testCase.hasInitial ? ", 0" : "";
    return `String(iterator.reduce(${callback}${initial}))`;
  }
  return `String(iterator.${testCase.method}(${callback}))`;
}

function printCase(testCase: EagerCase): string {
  return `
const values = [${testCase.source.join(", ")}];
let cursor = 0;
let returnCalls = 0;
const trace = [];
const iterator = {
  __proto__: Iterator.prototype,
  next() {
    if (cursor >= values.length) return { done: true, value: undefined };
    const value = values[cursor];
    cursor = cursor + 1;
    return { done: false, value };
  },
  return() {
    returnCalls = returnCalls + 1;
    if (${testCase.closeThrows}) throw new EvalError("close");
    return {};
  },
};
let outcome;
try {
  outcome = "value " + ${callSource(testCase)};
} catch (error) {
  outcome = "error " + error.constructor.name;
}
console.log("outcome", outcome);
console.log("trace", trace.join(","));
console.log("returns", returnCalls);
let turn = 0;
while (turn < 2) {
  const same = Iterator.prototype.toArray === Iterator.prototype.toArray;
  console.log("guard", same);
  if (turn === 0) Iterator.prototype.marker = ${testCase.source.length};
  turn = turn + 1;
}
delete Iterator.prototype.marker;
`;
}

/** The observation the independent model predicts for one case. */
interface Prediction {
  readonly outcome: string;
  readonly returnCalls: number;
  readonly trace: readonly string[];
}

/**
 * The independent drain model the generated program is measured against.
 *
 * It is a hand-written transcription of the specified loops rather than a
 * second use of a host's eager helpers: it walks the value list itself and
 * decides, at each step, whether the callback runs, whether the record is
 * closed, and which completion survives. A callback throw closes the record
 * and keeps its own error, so a close that also throws is swallowed there;
 * an early stop closes with a normal completion, so a close that throws
 * replaces the answer.
 */
function predict(testCase: EagerCase): Prediction {
  const trace: string[] = [];
  const values = testCase.source;
  let returnCalls = 0;
  let cursor = 0;
  let counter = 0;

  function close(): boolean {
    returnCalls += 1;
    return testCase.closeThrows;
  }

  function report(outcome: string): Prediction {
    return { outcome, returnCalls, trace };
  }

  /** One callback invocation, or undefined when it threw. */
  function invoke(value: number, accumulator: number): number | undefined {
    trace.push(`${value}:${counter}`);
    if (counter === testCase.throwAt) {
      close();
      return undefined;
    }
    counter += 1;
    return accumulator + value;
  }

  if (testCase.method === "toArray") {
    return report(`value ${values.join(",")}`);
  }
  if (testCase.method === "reduce") {
    let accumulator = 0;
    if (!testCase.hasInitial) {
      const first = values[cursor];
      if (first == null) return report("error TypeError");
      accumulator = first;
      cursor += 1;
      counter = 1;
    }
    while (cursor < values.length) {
      const value = values[cursor];
      assert.ok(value != null, "modeled value");
      cursor += 1;
      const next = invoke(value, accumulator);
      if (next == null) return report("error RangeError");
      accumulator = next;
    }
    return report(`value ${accumulator}`);
  }
  while (cursor < values.length) {
    const value = values[cursor];
    assert.ok(value != null, "modeled value");
    cursor += 1;
    trace.push(`${value}:${counter}`);
    if (counter === testCase.throwAt) {
      close();
      return report("error RangeError");
    }
    counter += 1;
    if (testCase.method === "forEach") continue;
    const truthy = value % testCase.modulus === 0;
    const stops = testCase.method === "every" ? !truthy : truthy;
    if (!stops) continue;
    if (close()) return report("error EvalError");
    if (testCase.method === "find") return report(`value ${value}`);
    return report(`value ${testCase.method === "some"}`);
  }
  if (testCase.method === "forEach") return report("value undefined");
  if (testCase.method === "find") return report("value undefined");
  return report(`value ${testCase.method === "every"}`);
}

function expected(testCase: EagerCase): string {
  const prediction = predict(testCase);
  return [
    `outcome ${prediction.outcome}`,
    `trace ${prediction.trace.join(",")}`,
    `returns ${prediction.returnCalls}`,
    "guard true",
    "guard true",
    "",
  ].join("\n");
}

async function references(source: string): Promise<
  readonly [
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
    {
      readonly exitStatus: number;
      readonly stderr: string;
      readonly stdout: string;
    },
  ]
> {
  const directory = await host.makeTemporaryDirectory(
    "oseo-iterator-helpers-eager-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(sourcePath, source);
    const observations = [
      await host.run({
        args: [sourcePath],
        command: process.execPath,
        cwd: directory,
      }),
      await host.run({
        args: ["run", "--quiet", sourcePath],
        command: "deno",
        cwd: directory,
      }),
    ] as const;
    succeeded = true;
    return observations;
  } finally {
    if (succeeded) await host.remove(directory);
  }
}

test(
  "generated eager iterator helper drains match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "an eager helper drains the record and closes it exactly once",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase),
        };
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-iterator-helpers-eager.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-object/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /property-get generic/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:object|shape)/u);
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
                toolchain: zigToolchain,
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
          "one eager helper method over at most five source values, an " +
          "optional reduce initial value, a predicate divisor, a callback " +
          "that throws at a generated counter, an ordinary or " +
          "Proxy-wrapped callback, a source close that throws, and a " +
          "deliberate prototype shape-guard miss",
        numRuns: 10,
        profile: "M5 eager iterator helpers",
        seed: 0x6000_6700,
        sizeLimit:
          "at most five source values, one helper method, one callback " +
          "throw, and one close per drain",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
