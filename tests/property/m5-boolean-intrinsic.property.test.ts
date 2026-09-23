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

type InputKind =
  | "empty"
  | "false"
  | "nan"
  | "nonzero"
  | "null"
  | "object"
  | "symbol"
  | "text"
  | "undefined"
  | "zero";

interface BooleanIntrinsicCase {
  readonly inputKind: InputKind;
  readonly magnitude: number;
  readonly text: string;
}

const caseArbitrary: fc.Arbitrary<BooleanIntrinsicCase> = fc.record({
  inputKind: fc.constantFrom<InputKind>(
    "empty",
    "false",
    "nan",
    "nonzero",
    "null",
    "object",
    "symbol",
    "text",
    "undefined",
    "zero",
  ),
  magnitude: fc.integer({ max: 10_000, min: 1 }),
  text: fc.string({ maxLength: 12, minLength: 1 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function inputSource(testCase: BooleanIntrinsicCase): string {
  switch (testCase.inputKind) {
    case "empty":
      return '""';
    case "false":
      return "false";
    case "nan":
      return "NaN";
    case "nonzero":
      return String(testCase.magnitude);
    case "null":
      return "null";
    case "object":
      return "{}";
    case "symbol":
      return 'Symbol("generated")';
    case "text":
      return JSON.stringify(testCase.text);
    case "undefined":
      return "undefined";
    case "zero":
      return "0";
  }
}

function expectedValue(kind: InputKind): boolean {
  return !["empty", "false", "nan", "null", "undefined", "zero"].includes(kind);
}

function printCase(testCase: BooleanIntrinsicCase): string {
  const input = inputSource(testCase);
  return `
const input = ${input};
const converted = Boolean(input);
const boxed = new Boolean(input);
console.log("call", converted);
console.log(
  "wrapper",
  boxed instanceof Boolean,
  Boolean.prototype.isPrototypeOf(boxed),
  boxed.valueOf(),
  boxed.toString(),
  ({}).toString.call(boxed),
);
console.log(
  "detached",
  Boolean.prototype.valueOf.call(boxed),
  Boolean.prototype.toString.call(boxed),
);
let coercions = 0;
const objectInput = {
  valueOf() {
    coercions = coercions + 1;
    return false;
  },
};
console.log("object", Boolean(objectInput), coercions);
try { Boolean.prototype.valueOf.call({}); } catch (error) {
  console.log("brand", error instanceof TypeError);
}
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(converted ? 1 : 0, 1), hinted("1", 1));
const originalValueOf = Boolean.prototype.valueOf;
let turn = 0;
while (turn < 2) {
  console.log("guard", Boolean.prototype.valueOf === originalValueOf);
  if (turn === 0) Boolean.marker = ${testCase.magnitude};
  turn = turn + 1;
}
`;
}

function expected(testCase: BooleanIntrinsicCase): string {
  const value = expectedValue(testCase.inputKind);
  return [
    `call ${value}`,
    `wrapper true true ${value} ${value} [object Boolean]`,
    `detached ${value} ${value}`,
    "object true 0",
    "brand true",
    `hint ${value ? 2 : 1} 11`,
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
    "oseo-boolean-intrinsic-property-",
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
  "generated Boolean conversions and wrappers match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "Boolean calls, wrappers, brands, and strings agree",
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
            { source, sourceId: "generated-m5-boolean-intrinsic.ts" },
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
          "one of ten primitive or object input classes, one bounded " +
          "integer and nonempty string, a branded wrapper, an unbranded " +
          "receiver, a false number hint, and one constructor shape miss",
        numRuns: 12,
        profile: "M5 Boolean intrinsic",
        seed: 0x6000_7b00,
        sizeLimit:
          "one bounded input, one wrapper, one brand error, two repeated " +
          "intrinsic property observations, and one guarded addition",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
