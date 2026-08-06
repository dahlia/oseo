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

interface FunctionPrototypeCase {
  readonly base: number;
  readonly bound: number;
  readonly final: number;
  readonly marker: number;
}

const caseArbitrary: fc.Arbitrary<FunctionPrototypeCase> = fc.record({
  base: fc.integer({ max: 20, min: -20 }),
  bound: fc.integer({ max: 20, min: -20 }),
  final: fc.integer({ max: 20, min: -20 }),
  marker: fc.integer({ max: 20, min: -20 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function printCase(testCase: FunctionPrototypeCase): string {
  return `
function calculate(left, right) {
  return this.base + left + right;
}
console.log("identity", Function.prototype.constructor === Function);
console.log("call", calculate.call(
  { base: ${testCase.base} },
  ${testCase.bound},
  ${testCase.final},
));
console.log("apply", calculate.apply(
  { base: ${testCase.base} },
  { 0: ${testCase.bound}, 1: ${testCase.final}, length: 2 },
));
function readMarker(value) { return value.marker; }
console.log(
  "apply accessor",
  readMarker.apply(null, {
    get 0() { return { marker: ${testCase.marker} }; },
    length: 1,
  }),
);
const bound = calculate.bind(
  { base: ${testCase.base} },
  ${testCase.bound},
);
console.log("bind", bound(${testCase.final}), bound.length, bound.name);
const matcher = {
  [Symbol.hasInstance]: function (candidate) {
    return candidate.marker === ${testCase.marker};
  },
};
console.log(
  "hasInstance",
  { marker: ${testCase.marker} } instanceof matcher,
  { marker: ${testCase.marker + 1} } instanceof matcher,
);
console.log(
  "source",
  calculate.toString() ===
    "function calculate(left, right) {\\n" +
      "  return this.base + left + right;\\n" +
      "}",
  bound.toString(),
);
let turn = 0;
while (turn < 2) {
  console.log(
    "guard",
    calculate.call({ base: turn }, ${testCase.bound}, ${testCase.final}),
  );
  if (turn === 0) calculate.marker = ${testCase.marker};
  turn = turn + 1;
}
`;
}

function expected(testCase: FunctionPrototypeCase): string {
  const result = testCase.base + testCase.bound + testCase.final;
  return [
    "identity true",
    `call ${result}`,
    `apply ${result}`,
    `apply accessor ${testCase.marker}`,
    `bind ${result} 1 bound calculate`,
    "hasInstance true false",
    "source true function () { [native code] }",
    `guard ${testCase.bound + testCase.final}`,
    `guard ${1 + testCase.bound + testCase.final}`,
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
    "oseo-function-prototype-property-",
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
  "generated Function.prototype methods match the M5 property model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Function.prototype preserves calls, binding, and has-instance",
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
            { source, sourceId: "generated-m5-function-prototype.ts" },
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
          "bounded receiver and argument integers, one bound prefix, one " +
          "custom has-instance marker, and a function shape guard miss",
        numRuns: 12,
        profile: "M5 Function.prototype methods",
        seed: 0x6000_3300,
        sizeLimit:
          "one binary function, two supplied arguments, one bound prefix, " +
          "one custom has-instance predicate, and two guarded calls",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
