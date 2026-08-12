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

interface StringIntrinsicCase {
  /** One astral code point, so the wrapper observes a surrogate pair. */
  readonly astral: number;
  /** One in-range code unit the `fromCharCode` oracle rounds through. */
  readonly codeUnit: number;
  readonly literals: readonly string[];
  /** One code point outside the Unicode range, so `fromCodePoint` throws. */
  readonly outOfRange: number;
  readonly substitution: number;
  /** One `fromCharCode` argument outside the ToUint16 range. */
  readonly wideCharCode: number;
}

const caseArbitrary: fc.Arbitrary<StringIntrinsicCase> = fc.record({
  astral: fc.integer({ max: 0x10_ffff, min: 0x1_0000 }),
  codeUnit: fc.integer({ max: 0xd7ff, min: 0x21 }),
  literals: fc.array(fc.constantFrom("a", "bc", "", "d"), {
    maxLength: 4,
    minLength: 1,
  }),
  outOfRange: fc.integer({ max: 0x20_0000, min: 0x11_0000 }),
  substitution: fc.integer({ max: 9999, min: -9999 }),
  wideCharCode: fc.integer({ max: 0x1_0000 + 0xffff, min: 0x1_0000 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** UTF16EncodeCodePoint, transcribed independently of the runtime. */
function surrogatePair(codePoint: number): readonly [number, number] {
  const rest = codePoint - 0x1_0000;
  return [0xd800 + (rest >> 10), 0xdc00 + (rest % 0x400)];
}

/** The `String.raw` result the specified algorithm produces. */
function rawExpectation(testCase: StringIntrinsicCase): string {
  const substitutions = [String(testCase.substitution)];
  let result = "";
  for (let index = 0; index < testCase.literals.length; index += 1) {
    result += testCase.literals[index] ?? "";
    if (index + 1 === testCase.literals.length) break;
    if (index < substitutions.length) result += substitutions[index] ?? "";
  }
  return result;
}

function printCase(testCase: StringIntrinsicCase): string {
  const literals = JSON.stringify(testCase.literals);
  const [lead, trail] = surrogatePair(testCase.astral);
  return `
const astral = String.fromCodePoint(${testCase.astral});
const wrapper = new String(astral);
console.log(
  "wrapper",
  wrapper.length,
  wrapper[0] === String.fromCharCode(${lead}),
  wrapper[1] === String.fromCharCode(${trail}),
  wrapper[2],
  wrapper instanceof String,
  String.prototype.isPrototypeOf(wrapper),
);
const indexDescriptor = Object.getOwnPropertyDescriptor(wrapper, "0");
const lengthDescriptor = Object.getOwnPropertyDescriptor(wrapper, "length");
console.log(
  "exotic",
  indexDescriptor.writable,
  indexDescriptor.enumerable,
  indexDescriptor.configurable,
  lengthDescriptor.value,
  lengthDescriptor.writable,
  lengthDescriptor.enumerable,
  lengthDescriptor.configurable,
);
console.log("tag", ({}).toString.call(wrapper), typeof wrapper);
console.log(
  "units",
  String.fromCharCode(${testCase.codeUnit}).length,
  String.fromCharCode(${testCase.wideCharCode}) ===
    String.fromCharCode(${testCase.wideCharCode % 0x10000}),
  String.fromCharCode(-${testCase.codeUnit}) ===
    String.fromCharCode(${(0x10000 - testCase.codeUnit) % 0x10000}),
  String.fromCodePoint(${testCase.codeUnit}) ===
    String.fromCharCode(${testCase.codeUnit}),
);
try { String.fromCodePoint(${testCase.outOfRange}); } catch (error) {
  console.log("out of range", error instanceof RangeError);
}
try { String.fromCodePoint(${testCase.codeUnit}.5); } catch (error) {
  console.log("not integral", error instanceof RangeError);
}
console.log("raw", String.raw({ raw: ${literals} }, ${testCase.substitution}));
console.log(
  "call",
  String(${testCase.substitution}),
  String(astral) === astral,
  String(),
);
const symbol = Symbol("s${testCase.codeUnit}");
console.log("symbol", String(symbol));
try { new String(symbol); } catch (error) {
  console.log("symbol construct", error instanceof TypeError);
}
/** @param {string} value */
function hinted(value) { return value + "!"; }
console.log("hint", hinted(astral) === astral + "!", hinted(1));
const originalRaw = String.raw;
let turn = 0;
while (turn < 2) {
  console.log("guard", String.raw === originalRaw);
  if (turn === 0) String.marker = ${testCase.substitution};
  turn = turn + 1;
}
const originalString = String;
const stringGlobalObject = this;
({ value: String } = { value: ${testCase.substitution} });
console.log("object target", String, this.String === String);
[String] = [${testCase.substitution} + 1];
console.log("array target", String, this.String === String);
for (String of [${testCase.substitution} + 2]) {}
console.log("for-of target", String, this.String === String);
for (String in { loopKey: true }) {}
console.log("for-in target", String, this.String === String);
String = originalString;
console.log("target restore", String === originalString);
this.String = ${testCase.substitution};
console.log("global write", this.String === String);
this.String = originalString;
console.log("global restore", this.String === String);
console.log("global delete", delete this.String, typeof String);
try { String; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedStringSet() { "use strict"; String = 1; }
try { strictDeletedStringSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: String } = { value: originalString });
console.log("global deleted pattern restore", this.String === String);
function strictDeleteDuringStringSet() {
  "use strict";
  String = (delete stringGlobalObject.String, 5);
}
try { strictDeleteDuringStringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
String = originalString;
console.log("global race restore", this.String === String);
`;
}

function expected(testCase: StringIntrinsicCase): string {
  const substitution = testCase.substitution;
  return [
    "wrapper 2 true true undefined true true",
    "exotic false true false 2 false false false",
    "tag [object String] object",
    "units 1 true true true",
    "out of range true",
    "not integral true",
    `raw ${rawExpectation(testCase)}`,
    `call ${substitution} true `,
    `symbol Symbol(s${testCase.codeUnit})`,
    "symbol construct true",
    "hint true 1!",
    "guard true",
    "guard true",
    `object target ${substitution} true`,
    `array target ${substitution + 1} true`,
    `for-of target ${substitution + 2} true`,
    "for-in target loopKey true",
    "target restore true",
    "global write true",
    "global restore true",
    "global delete true undefined",
    "global deleted read true",
    "global deleted strict set true",
    "global deleted pattern restore true",
    "global strict set race true",
    "global race restore true",
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
    "oseo-string-intrinsic-property-",
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
  "generated String operations and global identity match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String conversions, wrappers, and statics agree",
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
            { source, sourceId: "generated-m5-string-intrinsic.ts" },
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
          "one astral code point, one basic-plane code unit, one code unit " +
          "beyond the ToUint16 range, one code point beyond the Unicode " +
          "range, one raw literal list of one to four segments, one " +
          "signed substitution, a false string hint, one constructor " +
          "shape-guard miss, and one global String write, restore, " +
          "delete, assignment-target, and strict missing-property sequence",
        numRuns: 12,
        profile: "M5 String intrinsic",
        seed: 0x6000_4000,
        sizeLimit:
          "one bounded astral code point, two bounded code units, one " +
          "bounded out-of-range code point, at most four raw literal " +
          "segments, one bounded substitution, one wrapper, two repeated " +
          "intrinsic property observations, and one identifier, " +
          "assignment-target, and global mutation sequence",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
