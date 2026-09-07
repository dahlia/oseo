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
 * One radix operand for parseInt: the source text the generated program
 * passes and the Number value ToNumber gives it, from which the oracle
 * derives ToInt32. An absent operand is the empty source.
 */
interface RadixOperand {
  readonly source: string;
  readonly value: number;
}

const radixOperands: readonly RadixOperand[] = [
  { source: "", value: Number.NaN },
  { source: "undefined", value: Number.NaN },
  { source: "null", value: 0 },
  { source: "true", value: 1 },
  { source: "0", value: 0 },
  { source: "2", value: 2 },
  { source: "8", value: 8 },
  { source: "10", value: 10 },
  { source: "16", value: 16 },
  { source: "16.9", value: 16.9 },
  { source: '"16"', value: 16 },
  { source: "36", value: 36 },
  { source: "1", value: 1 },
  { source: "37", value: 37 },
  { source: "-16", value: -16 },
  { source: "4294967312", value: 4294967312 },
  { source: "NaN", value: Number.NaN },
  { source: "{ valueOf() { return 16; } }", value: 16 },
];

/**
 * The operand kinds the two predicates convert. Each names how the
 * generated program spells the operand and how the oracle converts it.
 */
type PredicateKind =
  | "array"
  | "bigint"
  | "boolean"
  | "null"
  | "number"
  | "object"
  | "string"
  | "symbol"
  | "undefined";

const predicateKinds: readonly PredicateKind[] = [
  "array",
  "bigint",
  "boolean",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
];

interface NumericCase {
  /** Leading StrWhiteSpaceChar units both parsers must skip. */
  readonly whitespace: readonly number[];
  readonly sign: "" | "+" | "-";
  /** Whether the parseInt operand carries a `0x` or `0X` prefix. */
  readonly hexPrefix: boolean;
  readonly hexUpper: boolean;
  /** Digit values from 0 to 35 spelled in the base-36 alphabet. */
  readonly digits: readonly number[];
  readonly upperDigits: boolean;
  readonly radix: RadixOperand;
  readonly trailing: string;
  /** Whether the parseFloat operand spells Infinity instead of digits. */
  readonly infinity: boolean;
  readonly integer: readonly number[];
  readonly dot: boolean;
  readonly fraction: readonly number[];
  readonly exponentMarker: "e" | "E";
  readonly exponentSign: "" | "+" | "-";
  readonly exponent: readonly number[];
  readonly floatTrailing: string;
  readonly predicate: PredicateKind;
}

/*
 * The whitespace alphabet spans every StrWhiteSpaceChar class: the four
 * WhiteSpace units named directly, the no-break and byte-order marks, a
 * Zs unit, and both LineTerminator units the grammar admits.
 */
const whitespaceAlphabet: readonly number[] = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x3000,
  0xfeff,
];

const trailingAlphabet: readonly string[] = [
  "",
  "px",
  " 1",
  ".5",
  "e3",
  "e",
  "e+",
  "_0",
  "᠎",
  "x1",
  "Infinity",
];

const digitArbitrary = fc.integer({ max: 9, min: 0 });

const caseArbitrary: fc.Arbitrary<NumericCase> = fc.record({
  digits: fc.array(fc.integer({ max: 35, min: 0 }), {
    maxLength: 12,
    minLength: 1,
  }),
  dot: fc.boolean(),
  exponent: fc.array(digitArbitrary, { maxLength: 3, minLength: 0 }),
  exponentMarker: fc.constantFrom("e", "E"),
  exponentSign: fc.constantFrom("", "+", "-"),
  floatTrailing: fc.constantFrom(...trailingAlphabet),
  fraction: fc.array(digitArbitrary, { maxLength: 6, minLength: 0 }),
  hexPrefix: fc.boolean(),
  hexUpper: fc.boolean(),
  infinity: fc.boolean(),
  integer: fc.array(digitArbitrary, { maxLength: 6, minLength: 0 }),
  predicate: fc.constantFrom(...predicateKinds),
  radix: fc.constantFrom(...radixOperands),
  sign: fc.constantFrom("", "+", "-"),
  trailing: fc.constantFrom(...trailingAlphabet),
  upperDigits: fc.boolean(),
  whitespace: fc.array(fc.constantFrom(...whitespaceAlphabet), {
    maxLength: 2,
    minLength: 0,
  }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const digitAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz";

/** The source text of one JavaScript string literal for these units. */
function stringLiteral(codeUnits: readonly number[]): string {
  let literal = '"';
  for (const unit of codeUnits) {
    literal += `\\u${unit.toString(16).padStart(4, "0")}`;
  }
  return `${literal}"`;
}

function units(text: string): readonly number[] {
  return [...text].map((character) => character.charCodeAt(0));
}

/** The parseInt operand after its generated whitespace. */
function integerText(testCase: NumericCase): string {
  let text = testCase.sign;
  if (testCase.hexPrefix) text += testCase.hexUpper ? "0X" : "0x";
  for (const digit of testCase.digits) {
    const character = digitAlphabet[digit] ?? "0";
    text += testCase.upperDigits ? character.toUpperCase() : character;
  }
  return text + testCase.trailing;
}

/** The parseFloat operand after its generated whitespace. */
function floatText(testCase: NumericCase): string {
  let text = testCase.sign;
  if (testCase.infinity) return `${text}Infinity${testCase.floatTrailing}`;
  text += testCase.integer.join("");
  if (testCase.dot) text += `.${testCase.fraction.join("")}`;
  if (testCase.exponent.length > 0) {
    text +=
      testCase.exponentMarker +
      testCase.exponentSign +
      testCase.exponent.join("");
  }
  return text + testCase.floatTrailing;
}

function whitespaceText(testCase: NumericCase): string {
  return String.fromCharCode(...testCase.whitespace);
}

/** The value of one base-36 digit unit, or 36 for a unit that is none. */
function digitValue(unit: string): number {
  const index = digitAlphabet.indexOf(unit.toLowerCase());
  return index < 0 ? 36 : index;
}

/**
 * parseInt, 19.2.5, transcribed over the operand text with the radix
 * already converted by ToNumber. The mathematical value is accumulated
 * exactly as a BigInt so the Number conversion rounds once.
 */
function parseIntOracle(operand: string, radixNumber: number): number {
  let text = operand;
  let sign = 1;
  if (text.startsWith("-")) sign = -1;
  if (text.startsWith("-") || text.startsWith("+")) text = text.slice(1);
  // ToInt32 over a Number is the host's own operator, not the function
  // under test.
  let radix = radixNumber | 0;
  let stripPrefix = true;
  if (radix !== 0) {
    if (radix < 2 || radix > 36) return Number.NaN;
    if (radix !== 16) stripPrefix = false;
  } else {
    radix = 10;
  }
  if (stripPrefix && /^0[xX]/u.test(text)) {
    text = text.slice(2);
    radix = 16;
  }
  let end = 0;
  while (end < text.length && digitValue(text[end] ?? "") < radix) end += 1;
  if (end === 0) return Number.NaN;
  let value = 0n;
  for (const unit of text.slice(0, end)) {
    value = value * BigInt(radix) + BigInt(digitValue(unit));
  }
  if (value === 0n) return sign < 0 ? -0 : 0;
  return sign * Number(value);
}

/**
 * parseFloat, 19.2.4: the longest StrDecimalLiteral prefix of the
 * operand, converted by the host's own StringToNumber rather than by
 * the function under test.
 */
function parseFloatOracle(operand: string): number {
  const match = operand.match(
    /^[+-]?(?:Infinity|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/u,
  );
  if (match == null) return Number.NaN;
  return Number(match[0]);
}

/**
 * The predicate operand's source and the Number ToNumber gives it, or
 * `undefined` when the conversion throws a TypeError instead.
 */
interface PredicateOperand {
  readonly source: string;
  readonly value: number | undefined;
}

function predicateOperand(testCase: NumericCase): PredicateOperand {
  const text = whitespaceText(testCase) + floatText(testCase);
  const literal = stringLiteral(units(text));
  // The host's own StringToNumber is the oracle for a String operand.
  const stringValue = Number(text);
  const numberValue = parseFloatOracle(floatText(testCase));
  const numberSource = Number.isNaN(numberValue)
    ? "NaN"
    : Object.is(numberValue, -0)
      ? "-0"
      : String(numberValue);
  const kind = testCase.predicate;
  if (kind === "undefined") return { source: "undefined", value: Number.NaN };
  if (kind === "null") return { source: "null", value: 0 };
  if (kind === "boolean") {
    return {
      source: testCase.dot ? "true" : "false",
      value: testCase.dot ? 1 : 0,
    };
  }
  if (kind === "number") return { source: numberSource, value: numberValue };
  if (kind === "string") return { source: literal, value: stringValue };
  if (kind === "array") return { source: `[${literal}]`, value: stringValue };
  if (kind === "object") {
    return {
      source: `{ valueOf() { return ${numberSource}; } }`,
      value: numberValue,
    };
  }
  if (kind === "bigint") return { source: "1n", value: undefined };
  return { source: 'Symbol("x")', value: undefined };
}

function printCase(testCase: NumericCase): string {
  const integerOperand = stringLiteral(
    units(whitespaceText(testCase) + integerText(testCase)),
  );
  const floatOperand = stringLiteral(
    units(whitespaceText(testCase) + floatText(testCase)),
  );
  const radixArgument =
    testCase.radix.source === "" ? "" : `, ${testCase.radix.source}`;
  const operand = predicateOperand(testCase);
  return `
const numericGlobalObject = this;
const originalIsNaN = isNaN;
const parsedInteger = parseInt(${integerOperand}${radixArgument});
console.log("parseInt", String(parsedInteger), Object.is(parsedInteger, -0));
const parsedDefault = parseInt(${integerOperand});
console.log(
  "parseInt default",
  String(parsedDefault),
  Object.is(parsedDefault, -0),
);
const parsedFloat = parseFloat(${floatOperand});
console.log("parseFloat", String(parsedFloat), Object.is(parsedFloat, -0));
console.log("identity", parseInt === Number.parseInt);
try {
  console.log(
    "predicate",
    isNaN(${operand.source}),
    isFinite(${operand.source}),
  );
} catch (error) {
  console.log("predicate throws", error instanceof TypeError);
}
try {
  isNaN({ valueOf() { throw new RangeError("abrupt"); } });
} catch (error) {
  console.log("abrupt", error instanceof RangeError);
}
try {
  new isFinite(1);
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
class SuperBase { constructor() { this.tag = "captured"; } }
class SuperOther { constructor() { this.tag = "switched"; } }
class SuperSwitch extends SuperBase {
  constructor() {
    super(Object.setPrototypeOf(SuperSwitch, SuperOther));
  }
}
console.log("super capture", new SuperSwitch().tag);
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(parseInt("7"), 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", isNaN("a"), parseFloat("1"));
  if (turn === 0) numericGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  numericGlobalObject.marker,
  delete numericGlobalObject.marker,
);
({ value: isNaN } = { value: 7 });
console.log("object target", isNaN, this.isNaN === isNaN);
[isNaN] = [8];
console.log("array target", isNaN, this.isNaN === isNaN);
for (isNaN of [9]) {}
console.log("for-of target", isNaN, this.isNaN === isNaN);
isNaN = originalIsNaN;
console.log("target restore", isNaN === originalIsNaN);
this.isNaN = 10;
console.log("global write", this.isNaN === isNaN, isNaN);
this.isNaN = originalIsNaN;
console.log("global restore", this.isNaN === isNaN);
console.log("global delete", delete this.isNaN, typeof isNaN);
try { isNaN; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; isNaN = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: isNaN } = { value: originalIsNaN });
console.log("global deleted pattern restore", this.isNaN === isNaN);
function strictDeleteDuringSet() {
  "use strict";
  isNaN = (delete numericGlobalObject.isNaN, 11);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
isNaN = originalIsNaN;
console.log("global race restore", this.isNaN === isNaN);
`;
}

/**
 * The generated program prints each parsed Number through `String`, so a
 * negative zero reads as `0` on every host and the separate `Object.is`
 * flag is what observes its sign.
 */
function observed(value: number): string {
  return `${String(value)} ${String(Object.is(value, -0))}`;
}

/**
 * Which super constructor a `super(...)` call whose argument replaces
 * the derived class's [[Prototype]] invokes. ECMA-262 13.3.7.1 reads the
 * super constructor at step 3, before the arguments at step 4, so the
 * native answer is the captured one. V8 reads it after the arguments,
 * so both reference hosts answer with the replacement; that recorded
 * divergence is the one line on which the references and the native
 * expectation differ.
 */
type SuperCapture = "captured" | "switched";

function expected(testCase: NumericCase, superCapture: SuperCapture): string {
  const parsedInteger = parseIntOracle(
    integerText(testCase),
    testCase.radix.value,
  );
  const parsedDefault = parseIntOracle(integerText(testCase), Number.NaN);
  const parsedFloat = parseFloatOracle(floatText(testCase));
  const operand = predicateOperand(testCase);
  const predicate =
    operand.value === undefined
      ? "predicate throws true"
      : `predicate ${String(Number.isNaN(operand.value))} ` +
        String(Number.isFinite(operand.value));
  return [
    `parseInt ${observed(parsedInteger)}`,
    `parseInt default ${observed(parsedDefault)}`,
    `parseFloat ${observed(parsedFloat)}`,
    "identity true",
    predicate,
    "abrupt true",
    "not a constructor true",
    `super capture ${superCapture}`,
    "hint 3 8",
    "guard true 1",
    "guard true 1",
    "marker 1 true",
    "object target 7 true",
    "array target 8 true",
    "for-of target 9 true",
    "target restore true",
    "global write true 10",
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
    "oseo-global-numeric-property-",
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
  "generated global numeric parsing and predicates match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "parseInt, parseFloat, isNaN, and isFinite agree with the oracle",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        const expectedObservation = {
          exitStatus: 0,
          stderr: "",
          stdout: expected(testCase, "captured"),
        };
        assertMatchingObservations([
          { ...expectedObservation, stdout: expected(testCase, "switched") },
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-global-numeric.ts" },
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
          "one parseInt operand of leading whitespace, a sign, an optional " +
          "hexadecimal prefix, one to twelve base-36 digits, and trailing " +
          "text, with one of eighteen radix operands; one parseFloat " +
          "operand of a sign, Infinity or integer, fraction, and exponent " +
          "digits, and trailing text; one predicate operand from nine " +
          "conversion kinds; a false number hint; one global-object shape " +
          "guard miss; and one global isNaN write, restore, delete, " +
          "assignment-target, and strict missing-property sequence",
        numRuns: 12,
        profile: "M5 global numeric functions",
        seed: 0x6000_6200,
        sizeLimit:
          "one parseInt operand of at most two whitespace units, twelve " +
          "digits, and one trailing fragment, one parseFloat operand of at " +
          "most six integer, six fraction, and three exponent digits, one " +
          "predicate operand, two repeated global property observations, " +
          "and one global assignment-target and deletion sequence",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
