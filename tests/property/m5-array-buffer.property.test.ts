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

/**
 * One generated ArrayBuffer program. `resizable` selects whether the
 * buffer carries [[ArrayBufferMaxByteLength]], `species` selects which
 * SpeciesConstructor outcome `slice` reaches, and `transfer` selects
 * which of the two detaching copies runs, or neither.
 */
interface ArrayBufferCase {
  readonly length: number;
  readonly maximumDelta: number;
  readonly resizable: boolean;
  readonly resizeTarget: number;
  readonly sliceEnd: number | undefined;
  readonly sliceStart: number;
  readonly species: "custom" | "default" | "non-constructor" | "throwing";
  readonly transfer: "fixed" | "none" | "preserve";
  readonly transferLength: number | undefined;
}

const caseArbitrary: fc.Arbitrary<ArrayBufferCase> = fc.record({
  length: fc.integer({ max: 32, min: 0 }),
  maximumDelta: fc.integer({ max: 16, min: 0 }),
  resizable: fc.boolean(),
  resizeTarget: fc.integer({ max: 48, min: 0 }),
  sliceEnd: fc.option(fc.integer({ max: 40, min: -8 }), { nil: undefined }),
  sliceStart: fc.integer({ max: 40, min: -8 }),
  species: fc.constantFrom("custom", "default", "non-constructor", "throwing"),
  transfer: fc.constantFrom("fixed", "none", "preserve"),
  transferLength: fc.option(fc.integer({ max: 40, min: 0 }), {
    nil: undefined,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The buffer's declared maximum, which is always at least its length. */
function maximumOf(testCase: ArrayBufferCase): number {
  return testCase.length + testCase.maximumDelta;
}

/** RelativeIndex clamping, shared by the model's slice bounds. */
function clampIndex(relative: number, length: number): number {
  if (relative < 0) return length + relative > 0 ? length + relative : 0;
  return relative < length ? relative : length;
}

/** The species constructor expression `slice` reads through. */
function speciesSetup(testCase: ArrayBufferCase): string {
  if (testCase.species === "default") return "";
  if (testCase.species === "non-constructor") {
    return "buffer.constructor = { [Symbol.species]: 5 };";
  }
  if (testCase.species === "throwing") {
    return `Object.defineProperty(buffer, "constructor", {
  configurable: true,
  get() { throw new EvalError("species"); },
});`;
  }
  return `buffer.constructor = {
  [Symbol.species]: function (size) { return new ArrayBuffer(size + 4); },
};`;
}

function printCase(testCase: ArrayBufferCase): string {
  const maximum = maximumOf(testCase);
  const creation = testCase.resizable
    ? `new ArrayBuffer(${testCase.length}, { maxByteLength: ${maximum} })`
    : `new ArrayBuffer(${testCase.length})`;
  const sliceCall =
    testCase.sliceEnd === undefined
      ? `buffer.slice(${testCase.sliceStart})`
      : `buffer.slice(${testCase.sliceStart}, ${testCase.sliceEnd})`;
  const transferMethod =
    testCase.transfer === "fixed"
      ? "buffer.transferToFixedLength"
      : "buffer.transfer";
  const transferArgument =
    testCase.transferLength === undefined ? "" : testCase.transferLength;
  const transferCall =
    testCase.transfer === "none"
      ? ""
      : `${transferMethod}(${transferArgument})`;
  return `
const buffer = ${creation};
console.log(
  "created",
  buffer.byteLength,
  buffer.maxByteLength,
  buffer.resizable,
  buffer.detached,
  Object.getPrototypeOf(buffer) === ArrayBuffer.prototype,
  Object.prototype.toString.call(buffer),
);
let resizeOutcome = "none";
try {
  buffer.resize(${testCase.resizeTarget});
  resizeOutcome = "ok";
} catch (error) {
  resizeOutcome = error instanceof TypeError
    ? "type-error"
    : error instanceof RangeError
      ? "range-error"
      : "unexpected";
}
console.log("resize", resizeOutcome, buffer.byteLength, buffer.maxByteLength);
${speciesSetup(testCase)}
let sliceOutcome = "none";
let sliceLength = -1;
try {
  const sliced = ${sliceCall};
  sliceOutcome = sliced === buffer ? "same" : "ok";
  sliceLength = sliced.byteLength;
} catch (error) {
  sliceOutcome = error instanceof EvalError
    ? "eval-error"
    : error instanceof TypeError
      ? "type-error"
      : "unexpected";
}
console.log("slice", sliceOutcome, sliceLength, buffer.byteLength);
${
  testCase.transfer === "none"
    ? 'console.log(\n  "transfer",\n  "skipped",\n  buffer.detached,\n' +
      "  buffer.byteLength,\n);"
    : `let transferOutcome = "none";
let transferLength = -1;
let transferMaximum = -1;
let transferResizable = false;
try {
  const moved = ${transferCall};
  transferOutcome = "ok";
  transferLength = moved.byteLength;
  transferMaximum = moved.maxByteLength;
  transferResizable = moved.resizable;
} catch (error) {
  transferOutcome = error instanceof RangeError
    ? "range-error"
    : error instanceof TypeError
      ? "type-error"
      : "unexpected";
}
console.log(
  "transfer",
  transferOutcome,
  transferLength,
  transferMaximum,
  transferResizable,
  buffer.detached,
  buffer.byteLength,
);`
}
try {
  new ArrayBuffer(${testCase.length + 1}, {
    maxByteLength: ${testCase.length},
  });
} catch (error) {
  console.log("length beyond maximum", error instanceof RangeError);
}
console.log(
  "isView",
  ArrayBuffer.isView(buffer),
  ArrayBuffer[Symbol.species] === ArrayBuffer,
);
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log(
  "hint",
  hinted(${testCase.length}, 1),
  hinted("${testCase.length}", 1),
);
const originalArrayBuffer = ArrayBuffer;
console.log("global read", ArrayBuffer === originalArrayBuffer);
ArrayBuffer = ${testCase.length};
console.log("global write", ArrayBuffer, this.ArrayBuffer === ArrayBuffer);
ArrayBuffer = originalArrayBuffer;
console.log("global delete", delete this.ArrayBuffer, "ArrayBuffer" in this);
try { ArrayBuffer; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
this.ArrayBuffer = originalArrayBuffer;
console.log("global reinstall", ArrayBuffer === originalArrayBuffer);
`;
}

function expected(testCase: ArrayBufferCase): string {
  const maximum = maximumOf(testCase);
  const lines = [
    `created ${testCase.length} ` +
      `${testCase.resizable ? maximum : testCase.length} ` +
      `${String(testCase.resizable)} false true [object ArrayBuffer]`,
  ];
  let length = testCase.length;
  let resizeOutcome: string;
  if (!testCase.resizable) {
    resizeOutcome = "type-error";
  } else if (testCase.resizeTarget > maximum) {
    resizeOutcome = "range-error";
  } else {
    resizeOutcome = "ok";
    length = testCase.resizeTarget;
  }
  lines.push(
    `resize ${resizeOutcome} ${length} ` +
      `${testCase.resizable ? maximum : length}`,
  );

  const first = clampIndex(testCase.sliceStart, length);
  const final = clampIndex(testCase.sliceEnd ?? length, length);
  const sliceLength = final - first > 0 ? final - first : 0;
  if (testCase.species === "throwing") {
    lines.push(`slice eval-error -1 ${length}`);
  } else if (testCase.species === "non-constructor") {
    lines.push(`slice type-error -1 ${length}`);
  } else {
    const reported =
      testCase.species === "custom" ? sliceLength + 4 : sliceLength;
    lines.push(`slice ok ${reported} ${length}`);
  }

  if (testCase.transfer === "none") {
    lines.push(`transfer skipped false ${length}`);
  } else {
    const requested = testCase.transferLength ?? length;
    const preserved = testCase.transfer === "preserve" && testCase.resizable;
    if (preserved && requested > maximum) {
      lines.push(`transfer range-error -1 -1 false false ${length}`);
    } else {
      const reportedMaximum = preserved ? maximum : requested;
      lines.push(
        `transfer ok ${requested} ${reportedMaximum} ${String(preserved)} ` +
          "true 0",
      );
    }
  }
  lines.push(
    "length beyond maximum true",
    "isView false true",
    `hint ${testCase.length + 1} ${testCase.length}1`,
    "global read true",
    `global write ${testCase.length} true`,
    "global delete true false",
    "global deleted read true",
    "global reinstall true",
    "",
  );
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
    "oseo-array-buffer-property-",
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
  "generated ArrayBuffer observations match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "ArrayBuffer allocation, resize, transfer, and slice agree",
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
            { source, sourceId: "generated-m5-array-buffer.ts" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          const mir = printMir(compiled.mir);
          if (specialization === "enabled") {
            assert.match(mir, /guard-smi/u);
            assert.match(mir, /guard-shape/u);
            assert.match(mir, /add-smi-checked/u);
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
          "one byte length from 0 to 32, one fixed or resizable allocation " +
          "with a maximum up to 16 bytes above it, one resize target from " +
          "0 to 48 that may exceed that maximum, one slice range whose " +
          "bounds run from -8 to 40 with an absent or present end, one " +
          "default, custom, non-constructor, or throwing species outcome, " +
          "one absent transfer, resizability-preserving transfer, or " +
          "fixed-length transfer with an absent or explicit new length, a " +
          "false number hint, and one global ArrayBuffer write, delete, " +
          "and reinstall sequence",
        numRuns: 12,
        profile: "M5 ArrayBuffer",
        seed: 0x6000_3a00,
        sizeLimit:
          "one bounded byte length, one bounded maximum, one bounded " +
          "resize target, one bounded slice range, one species outcome, " +
          "one transfer mode, one false hint, and one global rebinding " +
          "sequence",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
