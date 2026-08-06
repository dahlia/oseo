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

interface IteratorIntrinsicCase {
  readonly base: number;
  readonly count: number;
  readonly iterable: boolean;
  readonly returnPresent: boolean;
  readonly step: number;
}

const caseArbitrary: fc.Arbitrary<IteratorIntrinsicCase> = fc.record({
  base: fc.integer({ max: 20, min: -20 }),
  count: fc.integer({ max: 4, min: 1 }),
  iterable: fc.boolean(),
  returnPresent: fc.boolean(),
  step: fc.integer({ max: 5, min: -5 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: IteratorIntrinsicCase): string {
  const returnProperty = testCase.returnPresent
    ? `
  get return() {
    returnGets = returnGets + 1;
    return function () {
      returnCalls = returnCalls + 1;
      return { value: ${testCase.base - testCase.step}, done: true };
    };
  },`
    : "";
  const input = testCase.iterable
    ? `{ [Symbol.iterator]: function () { return direct; } }`
    : "direct";
  return `
let nextGets = 0;
let nextCalls = 0;
let returnGets = 0;
let returnCalls = 0;
const direct = {
  get next() {
    nextGets = nextGets + 1;
    return function () {
      const index = nextCalls;
      nextCalls = nextCalls + 1;
      return {
        value: ${testCase.base} + index * ${testCase.step},
        done: index === ${testCase.count},
      };
    };
  },${returnProperty}
};
const input = ${input};
const iterator = Iterator.from(input);
console.log("wrapped", iterator !== direct, nextGets, returnGets);
let index = 0;
while (index < ${testCase.count}) {
  const result = iterator.next();
  console.log("step", result.value, result.done);
  index = index + 1;
}
console.log("done", iterator.next().done, nextCalls);
if (${testCase.returnPresent}) {
  const result = iterator.return();
  console.log(
    "return",
    result.value,
    result.done,
    returnGets,
    returnCalls,
  );
} else {
  const result = iterator.return();
  console.log("return", result.value, result.done, returnGets, returnCalls);
}
const originalFrom = Iterator.from;
let turn = 0;
while (turn < 2) {
  console.log("guard", Iterator.from === originalFrom);
  if (turn === 0) Iterator.marker = ${testCase.base};
  turn = turn + 1;
}
`;
}

function expected(testCase: IteratorIntrinsicCase): string {
  const lines = ["wrapped true 1 0"];
  for (let index = 0; index < testCase.count; index += 1) {
    lines.push(`step ${testCase.base + index * testCase.step} false`);
  }
  lines.push(`done true ${testCase.count + 1}`);
  lines.push(
    testCase.returnPresent
      ? `return ${testCase.base - testCase.step} true 1 1`
      : "return undefined true 0 0",
  );
  lines.push("guard true", "guard true", "");
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
    "oseo-iterator-intrinsic-property-",
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
  "generated Iterator.from wrappers match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Iterator.from captures next and forwards return at call time",
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
            { source, sourceId: "generated-m5-iterator-intrinsic.ts" },
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
          "one direct iterator or iterable wrapper, one to four bounded " +
          "integer values, an optional return method, and a constructor " +
          "shape guard miss",
        numRuns: 12,
        profile: "M5 Iterator.from wrapper",
        seed: 0x6000_3400,
        sizeLimit:
          "one iterator record, at most four yielded values, one optional " +
          "return call, and two repeated intrinsic property observations",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
