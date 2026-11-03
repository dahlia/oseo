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

/**
 * One substr position operand. Numbers cover integers on both sides of
 * the string, fractions, signed zero, NaN, and both infinities; the
 * other kinds reach ToIntegerOrInfinity through a conversion.
 */
type Position =
  | { readonly kind: "absent" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: number }
  | { readonly kind: "undefined" };

/** The HTML methods of B.2.2.2 through B.2.2.14 with their markup. */
const htmlMethods: readonly {
  readonly attribute: string;
  readonly name: string;
  readonly tag: string;
}[] = [
  { attribute: "name", name: "anchor", tag: "a" },
  { attribute: "", name: "big", tag: "big" },
  { attribute: "", name: "blink", tag: "blink" },
  { attribute: "", name: "bold", tag: "b" },
  { attribute: "", name: "fixed", tag: "tt" },
  { attribute: "color", name: "fontcolor", tag: "font" },
  { attribute: "size", name: "fontsize", tag: "font" },
  { attribute: "", name: "italics", tag: "i" },
  { attribute: "href", name: "link", tag: "a" },
  { attribute: "", name: "small", tag: "small" },
  { attribute: "", name: "strike", tag: "strike" },
  { attribute: "", name: "sub", tag: "sub" },
  { attribute: "", name: "sup", tag: "sup" },
];

interface StringCase {
  /** The code units of the receiver string. */
  readonly units: readonly number[];
  readonly start: Position;
  readonly length: Position;
  /** Index into `htmlMethods`. */
  readonly method: number;
  /** The code units of the HTML attribute value. */
  readonly value: readonly number[];
}

/*
 * Code units for both strings: ASCII letters, the quotation mark the
 * attribute escaping replaces, the markup characters it leaves alone,
 * whitespace that trimming removes, and both surrogate halves.
 */
const unitArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(
    0x09,
    0x20,
    0x22,
    0x26,
    0x27,
    0x3c,
    0x3e,
    0x41,
    0x61,
    0x7a,
    0xa0,
    0x2028,
    0xfeff,
    0x4e2d,
  ),
  fc.integer({ max: 0xdfff, min: 0xd800 }),
  fc.integer({ max: 0xffff, min: 0 }),
);

const numberArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ max: 12, min: -12 }),
  fc.constantFrom(-0, 0.5, -0.5, 1.9, -1.9, NaN, Infinity, -Infinity),
);

const positionArbitrary: fc.Arbitrary<Position> = fc.oneof(
  fc.constant({ kind: "absent" as const }),
  fc.constant({ kind: "undefined" as const }),
  fc.record({ kind: fc.constant("number" as const), value: numberArbitrary }),
  fc.record({
    kind: fc.constant("string" as const),
    value: fc.integer({ max: 12, min: -12 }),
  }),
);

const caseArbitrary: fc.Arbitrary<StringCase> = fc.record({
  length: positionArbitrary,
  method: fc.integer({ max: htmlMethods.length - 1, min: 0 }),
  start: positionArbitrary,
  units: fc.array(unitArbitrary, { maxLength: 8, minLength: 0 }),
  value: fc.array(unitArbitrary, { maxLength: 6, minLength: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/** The source text of one JavaScript string literal for these units. */
function stringLiteral(units: readonly number[]): string {
  let literal = '"';
  for (const unit of units) {
    literal += `\\u${unit.toString(16).padStart(4, "0")}`;
  }
  return `${literal}"`;
}

/** The source text of one position operand. */
function positionSource(position: Position): string {
  if (position.kind === "number") {
    if (Number.isNaN(position.value)) return "NaN";
    if (position.value === Infinity) return "Infinity";
    if (position.value === -Infinity) return "-Infinity";
    if (Object.is(position.value, -0)) return "-0";
    return String(position.value);
  }
  if (position.kind === "string") return JSON.stringify(String(position.value));
  return "undefined";
}

/** The argument list of one substr call; absent operands are omitted. */
function substrArguments(testCase: StringCase): string {
  if (testCase.length.kind !== "absent") {
    const start =
      testCase.start.kind === "absent"
        ? "undefined"
        : positionSource(testCase.start);
    return `${start}, ${positionSource(testCase.length)}`;
  }
  if (testCase.start.kind === "absent") return "";
  return positionSource(testCase.start);
}

/** ToIntegerOrInfinity of one generated operand, computed directly. */
function integerOrInfinity(position: Position): number {
  if (position.kind === "absent" || position.kind === "undefined") return 0;
  const value = position.value;
  if (Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return value;
  return Math.trunc(value) === 0 ? 0 : Math.trunc(value);
}

/** String.prototype.substr, B.2.2.1, over code units. */
function substrOracle(testCase: StringCase): readonly number[] {
  const size = testCase.units.length;
  const intStart = integerOrInfinity(testCase.start);
  let start: number;
  if (intStart === -Infinity) start = 0;
  else if (intStart < 0) start = Math.max(size + intStart, 0);
  else start = Math.min(intStart, size);
  const intLength =
    testCase.length.kind === "absent" || testCase.length.kind === "undefined"
      ? size
      : integerOrInfinity(testCase.length);
  const length = Math.min(Math.max(intLength, 0), size);
  const end = Math.min(start + length, size);
  return start < end ? testCase.units.slice(start, end) : [];
}

/** The code units of ASCII `text`. */
function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

/** CreateHTML, B.2.2.2.1, over code units. */
function htmlOracle(testCase: StringCase): readonly number[] {
  const method = htmlMethods[testCase.method]!;
  const units = [...ascii(`<${method.tag}`)];
  if (method.attribute !== "") {
    units.push(...ascii(` ${method.attribute}="`));
    for (const unit of testCase.value) {
      if (unit === 0x22) units.push(...ascii("&quot;"));
      else units.push(unit);
    }
    units.push(0x22);
  }
  units.push(0x3e, ...testCase.units, ...ascii(`</${method.tag}>`));
  return units;
}

/** The WhiteSpace and LineTerminator code units of 12.2 and 12.3. */
function isTrimmed(unit: number): boolean {
  return (
    unit === 0x09 ||
    unit === 0x0a ||
    unit === 0x0b ||
    unit === 0x0c ||
    unit === 0x0d ||
    unit === 0x20 ||
    unit === 0xa0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000 ||
    unit === 0xfeff
  );
}

function trimLeftOracle(units: readonly number[]): readonly number[] {
  let start = 0;
  while (start < units.length && isTrimmed(units[start]!)) start += 1;
  return units.slice(start);
}

function trimRightOracle(units: readonly number[]): readonly number[] {
  let end = units.length;
  while (end > 0 && isTrimmed(units[end - 1]!)) end -= 1;
  return units.slice(0, end);
}

function printCase(testCase: StringCase): string {
  const method = htmlMethods[testCase.method]!;
  const receiver = stringLiteral(testCase.units);
  const value = stringLiteral(testCase.value);
  return `
function units(text) {
  let list = "";
  for (let index = 0; index < text.length; index = index + 1) {
    list = list + (index === 0 ? "" : ",") + text.charCodeAt(index);
  }
  return list;
}
const receiver = ${receiver};
const value = ${value};
console.log("substr", units(receiver.substr(${substrArguments(testCase)})));
console.log(
  "substr generic",
  units(String.prototype.substr.call(
    { toString() { return receiver; } },
    ${substrArguments(testCase) || "undefined"},
  )) === units(receiver.substr(${substrArguments(testCase) || "undefined"})),
);
console.log("html", units(receiver.${method.name}(value)));
console.log(
  "html wrapped",
  units(String.prototype.${method.name}.call(new String(receiver), value)),
);
console.log("trimLeft", units(receiver.trimLeft()));
console.log("trimRight", units(receiver.trimRight()));
console.log(
  "aliases",
  String.prototype.trimLeft === String.prototype.trimStart,
  String.prototype.trimRight === String.prototype.trimEnd,
);
const order = [];
String.prototype.${method.name}.call(
  { toString() { order.push("this"); return "t"; } },
  { toString() { order.push("value"); return "v"; } },
);
console.log("order", order.join(","));
try {
  String.prototype.substr.call(null, 0);
} catch (error) {
  console.log("nullish", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted("x".sub(), 1));
const holder = { text: receiver };
let turn = 0;
while (turn < 2) {
  console.log("guard", units(holder.text.substr(0, 1)), holder.text.length);
  if (turn === 0) holder.marker = 1;
  turn = turn + 1;
}
`;
}

function unitText(units: readonly number[]): string {
  return units.join(",");
}

function expected(testCase: StringCase): string {
  const method = htmlMethods[testCase.method]!;
  const html = unitText(htmlOracle(testCase));
  const first = unitText(testCase.units.slice(0, 1));
  return [
    `substr ${unitText(substrOracle(testCase))}`,
    "substr generic true",
    `html ${html}`,
    `html wrapped ${html}`,
    `trimLeft ${unitText(trimLeftOracle(testCase.units))}`,
    `trimRight ${unitText(trimRightOracle(testCase.units))}`,
    "aliases true true",
    `order ${method.attribute === "" ? "this" : "this,value"}`,
    "nullish true",
    "hint 3 <sub>x</sub>1",
    `guard ${first} ${testCase.units.length}`,
    `guard ${first} ${testCase.units.length}`,
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
    "oseo-annexb-string-property-",
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
  "generated substr, HTML, and trim alias calls match the Annex B model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "substr positions, CreateHTML escaping, and trim aliases agree",
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
            { source, sourceId: "generated-m5-annexb-string-methods.ts" },
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
          "one receiver of up to eight code units drawn from ASCII, the " +
          "quotation mark and markup characters, trimmed whitespace, the " +
          "BMP, and both surrogate halves, substr start and length " +
          "operands that are absent, undefined, integers on both sides of " +
          "the string, fractions, signed zero, NaN, infinities, or numeric " +
          "strings, one of the thirteen HTML methods with an attribute " +
          "value of up to six code units, a false number hint, and one " +
          "object shape guard miss",
        numRuns: 12,
        profile: "Annex B String methods",
        seed: 0x6000_9e00,
        sizeLimit:
          "one receiver of at most eight code units, one attribute value " +
          "of at most six code units, two substr operands, and two " +
          "repeated property reads",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
