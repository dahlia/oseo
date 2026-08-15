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

type CombineFailure = "none" | "resolve" | "then-call" | "then-get";
type CombineOperation = "all" | "race";
type IterableKind = "array" | "custom" | "sparse";

interface HoleEntry {
  readonly kind: "hole";
}

interface ValueEntry {
  readonly kind: "thenable" | "value";
  readonly value: number;
}

type CombineEntry = HoleEntry | ValueEntry;

/** One bounded iterable and thenable schedule for a promise combinator. */
interface PromiseCombineCase {
  readonly entries: readonly CombineEntry[];
  readonly failure: CombineFailure;
  readonly failureIndex: number;
  readonly iterable: IterableKind;
  readonly operation: CombineOperation;
}

const entryArbitrary: fc.Arbitrary<CombineEntry> = fc.oneof(
  fc.constant({ kind: "hole" } as const),
  fc.record({
    kind: fc.constant("value" as const),
    value: fc.integer({ max: 50, min: -50 }),
  }),
  fc.record({
    kind: fc.constant("thenable" as const),
    value: fc.integer({ max: 50, min: -50 }),
  }),
);

const caseArbitrary: fc.Arbitrary<PromiseCombineCase> = fc.record({
  entries: fc.array(entryArbitrary, { maxLength: 4 }),
  failure: fc.constantFrom("none", "resolve", "then-call", "then-get"),
  failureIndex: fc.integer({ max: 3, min: 0 }),
  iterable: fc.constantFrom("array", "custom", "sparse"),
  operation: fc.constantFrom("all", "race"),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function entrySource(entry: CombineEntry, index: number): string {
  if (entry.kind === "hole") return "undefined";
  if (entry.kind === "value") return String(entry.value);
  return `{
  then(resolve) {
    console.log("thenable", ${index});
    resolve(${entry.value});
  },
}`;
}

function inputSource(testCase: PromiseCombineCase): string {
  if (testCase.iterable === "custom") {
    const cases = testCase.entries
      .map(
        (entry, index) =>
          `if (index === ${index}) {
  index = index + 1;
  return { value: ${entrySource(entry, index)}, done: false };
}`,
      )
      .join("\n");
    return `{
  [Symbol.iterator]() {
    let index = 0;
    return {
      next() {
        console.log("next", index);
        ${cases}
        return { value: undefined, done: true };
      },
      return() {
        console.log("close");
        return {};
      },
    };
  },
}`;
  }
  const assignments = testCase.entries
    .map((entry, index) => {
      if (testCase.iterable === "sparse" && entry.kind === "hole") return "";
      return `input[${index}] = ${entrySource(entry, index)};`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
  return `[];
input.length = ${testCase.entries.length};
${assignments}`;
}

function printCase(testCase: PromiseCombineCase): string {
  const failure = JSON.stringify(testCase.failure);
  return `
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("x", 2));
let resolveCalls = 0;
class Combine extends Promise {
  static get resolve() {
    console.log("get resolve");
    return function(value) {
      const index = resolveCalls;
      resolveCalls = resolveCalls + 1;
      console.log("resolve", index, this === Combine);
      if (${failure} === "resolve" && index === ${testCase.failureIndex}) {
        throw new Error("resolve");
      }
      if (${failure} === "then-get" && index === ${testCase.failureIndex}) {
        return Object.defineProperty({}, "then", {
          get() { throw new Error("then-get"); },
        });
      }
      if (${failure} === "then-call" && index === ${testCase.failureIndex}) {
        return { then() { throw new Error("then-call"); } };
      }
      return Promise.resolve(value);
    };
  }
}
let input = ${inputSource(testCase)};
const combined = Combine.${testCase.operation}(input);
console.log("instance", combined instanceof Combine);
combined.then(
  function(values) {
    if (${JSON.stringify(testCase.operation)} === "race") {
      console.log("settled", values === undefined ? "u" : values);
      return;
    }
    let text = "values";
    for (let index = 0; index < values.length; index = index + 1) {
      text = text + " " +
        (values[index] === undefined ? "u" : values[index]);
    }
    console.log(text);
  },
  function(error) { console.log("rejected", error.message); },
);
console.log("sync");
`;
}

function effectiveFailure(testCase: PromiseCombineCase): CombineFailure {
  return testCase.failureIndex < testCase.entries.length
    ? testCase.failure
    : "none";
}

function renderedValue(entry: CombineEntry): string {
  return entry.kind === "hole" ? "u" : String(entry.value);
}

/** Independent schedule model for the generated source above. */
function expected(testCase: PromiseCombineCase): string {
  const lines = ["hint 3 x2", "get resolve"];
  const failure = effectiveFailure(testCase);
  let processed = testCase.entries.length;
  for (let index = 0; index < testCase.entries.length; index += 1) {
    if (testCase.iterable === "custom") lines.push(`next ${index}`);
    lines.push(`resolve ${index} true`);
    if (failure !== "none" && index === testCase.failureIndex) {
      processed = index;
      if (testCase.iterable === "custom") lines.push("close");
      break;
    }
  }
  if (failure === "none" && testCase.iterable === "custom") {
    lines.push(`next ${testCase.entries.length}`);
  }
  lines.push("instance true", "sync");
  for (let index = 0; index < processed; index += 1) {
    if (testCase.entries[index]?.kind === "thenable") {
      lines.push(`thenable ${index}`);
    }
  }
  if (failure !== "none") {
    lines.push(`rejected ${failure}`);
  } else if (testCase.operation === "all") {
    lines.push(
      "values" +
        testCase.entries.map((entry) => ` ${renderedValue(entry)}`).join(""),
    );
  } else if (testCase.entries.length > 0) {
    const firstValue =
      testCase.entries.find((entry) => entry.kind !== "thenable") ??
      testCase.entries[0];
    assert(firstValue != null);
    lines.push(`settled ${renderedValue(firstValue)}`);
  }
  lines.push("");
  return lines.join("\n");
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
    "oseo-promise-combine-property-",
  );
  const sourcePath = `${directory}/case.ts`;
  let succeeded = false;
  try {
    await host.writeTextFile(
      sourcePath,
      `(0, eval)(${JSON.stringify(source)});\n`,
    );
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
  "generated Promise all and race schedules match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Promise all and race iterable and thenable schedules agree",
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
            { source, sourceId: "generated-m5-promise-combine.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-(?:shape|smi)/u);
            assert.match(mir, /generic-fallback/u);
          } else {
            assert.doesNotMatch(mir, /guard-(?:shape|smi)/u);
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
          "zero to four array, sparse-array, or custom-iterator entries; " +
          "plain values, holes, and synchronously resolving thenables; all " +
          "or race; no abrupt completion or a resolve call, then getter, " +
          "or then call abrupt completion at one bounded index; a subclass " +
          "resolve getter and receiver check; and one false number hint",
        numRuns: 16,
        profile: "M5 Promise all and race",
        seed: 0x6000_4500,
        sizeLimit:
          "four iterable entries, four resolve calls, four thenable jobs, " +
          "one abrupt index, one iterator close, and one aggregate reaction",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
