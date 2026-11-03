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
 * One generated piece of an unescape operand. A `unit` piece is one
 * code unit taken literally; the escape pieces write a `%XX` or
 * `%uXXXX` form with the given digits, which may be valid or not.
 */
type Piece =
  | { readonly kind: "unit"; readonly unit: number }
  | { readonly kind: "short"; readonly digits: string }
  | { readonly kind: "long"; readonly digits: string };

interface EscapeCase {
  /** The code units of the generated escape operand. */
  readonly units: readonly number[];
  /** The pieces of the generated unescape operand. */
  readonly pieces: readonly Piece[];
}

/*
 * The generated code-unit alphabet. It spans the unescaped set, other
 * ASCII including `%` and `u`, the rest of Latin-1, the BMP above it,
 * and both surrogate halves, so an operand reaches all three escape
 * forms and every surrogate arrangement.
 */
const unitArbitrary: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(
    0x00,
    0x20,
    0x25,
    0x2a,
    0x2b,
    0x2d,
    0x2e,
    0x2f,
    0x30,
    0x40,
    0x41,
    0x5f,
    0x75,
    0x7e,
    0x7f,
    0x80,
    0xff,
    0x100,
    0xd7ff,
    0xe000,
    0xffff,
  ),
  fc.integer({ max: 0xffff, min: 0 }),
  fc.integer({ max: 0xdfff, min: 0xd800 }),
);

/*
 * Hexadecimal digits of both cases plus non-digits next to them, so a
 * generated escape form is valid, invalid in one position, or short.
 */
const digitArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  "0",
  "4",
  "9",
  "a",
  "A",
  "f",
  "F",
  "g",
  "G",
  "%",
  "u",
  " ",
);

const pieceArbitrary: fc.Arbitrary<Piece> = fc.oneof(
  fc.record({ kind: fc.constant("unit" as const), unit: unitArbitrary }),
  fc.record({
    digits: fc
      .array(digitArbitrary, { maxLength: 2, minLength: 0 })
      .map((digits) => digits.join("")),
    kind: fc.constant("short" as const),
  }),
  fc.record({
    digits: fc
      .array(digitArbitrary, { maxLength: 4, minLength: 0 })
      .map((digits) => digits.join("")),
    kind: fc.constant("long" as const),
  }),
);

const caseArbitrary: fc.Arbitrary<EscapeCase> = fc.record({
  pieces: fc.array(pieceArbitrary, { maxLength: 6, minLength: 0 }),
  units: fc.array(unitArbitrary, { maxLength: 8, minLength: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const hexDigits = "0123456789ABCDEF";
const unescapedSet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@*_+-./";

/** Uppercase hexadecimal digits of `value`, padded to `width`. */
function hex(value: number, width: number): string {
  let text = "";
  for (let position = width - 1; position >= 0; position -= 1) {
    text += hexDigits[Math.floor(value / 16 ** position) % 16];
  }
  return text;
}

/** escape(string), B.2.1.1, computed from each unit's own bits. */
function escapeOracle(units: readonly number[]): string {
  let escaped = "";
  for (const unit of units) {
    const character = String.fromCharCode(unit);
    if (unit < 0x80 && unescapedSet.includes(character)) {
      escaped += character;
    } else if (unit < 256) {
      escaped += `%${hex(unit, 2)}`;
    } else {
      escaped += `%u${hex(unit, 4)}`;
    }
  }
  return escaped;
}

/** The value of `text` as hexadecimal digits, or undefined. */
function hexValue(text: string): number | undefined {
  let value = 0;
  for (const character of text) {
    const digit = "0123456789abcdef".indexOf(character.toLowerCase());
    if (digit < 0) return undefined;
    value = value * 16 + digit;
  }
  return value;
}

/** The code units of the generated unescape operand. */
function unescapeOperand(pieces: readonly Piece[]): readonly number[] {
  const units: number[] = [];
  for (const piece of pieces) {
    const text =
      piece.kind === "unit"
        ? String.fromCharCode(piece.unit)
        : piece.kind === "short"
          ? `%${piece.digits}`
          : `%u${piece.digits}`;
    for (let index = 0; index < text.length; index += 1) {
      units.push(text.charCodeAt(index));
    }
  }
  return units;
}

/**
 * unescape(string), B.2.1.2, over code units. Like the clause, it reads
 * each `%` against the whole operand, so a form that spans two
 * generated pieces decodes the same way the runtime decodes it.
 */
function unescapeOracle(units: readonly number[]): readonly number[] {
  const text = String.fromCharCode(...units);
  const result: number[] = [];
  let index = 0;
  while (index < units.length) {
    let unit = units[index]!;
    let consumed = 1;
    if (unit === 0x25) {
      const long =
        index + 6 <= units.length && text[index + 1] === "u"
          ? hexValue(text.slice(index + 2, index + 6))
          : undefined;
      const short =
        index + 3 <= units.length
          ? hexValue(text.slice(index + 1, index + 3))
          : undefined;
      if (long != null) {
        unit = long;
        consumed = 6;
      } else if (short != null) {
        unit = short;
        consumed = 3;
      }
    }
    result.push(unit);
    index += consumed;
  }
  return result;
}

/** The source text of one JavaScript string literal for these units. */
function stringLiteral(units: readonly number[]): string {
  let literal = '"';
  for (const unit of units) literal += `\\u${hex(unit, 4)}`;
  return `${literal}"`;
}

/** The code units of `text`, as the generated program prints them. */
function unitList(units: readonly number[]): string {
  return units.join(",");
}

function printCase(testCase: EscapeCase): string {
  const operand = stringLiteral(testCase.units);
  const encoded = stringLiteral(unescapeOperand(testCase.pieces));
  return `
const escapeGlobalObject = this;
const originalEscape = escape;
function units(text) {
  let list = "";
  for (let index = 0; index < text.length; index = index + 1) {
    list = list + (index === 0 ? "" : ",") + text.charCodeAt(index);
  }
  return list;
}
const operand = ${operand};
const escaped = escape(operand);
console.log("escape", escaped);
console.log("round trip", unescape(escaped) === operand);
console.log("unescape", units(unescape(${encoded})));
console.log("escape twice", unescape(unescape(escape(escaped))) === operand);
const order = [];
try {
  unescape({ toString() { order.push("called"); throw new RangeError("x"); } });
} catch (error) {
  console.log("abrupt", error instanceof RangeError, order.join(","));
}
try {
  new unescape("a");
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(escape("a"), 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", escape("a b"), unescape("%41"));
  if (turn === 0) escapeGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log(
  "marker",
  escapeGlobalObject.marker,
  delete escapeGlobalObject.marker,
);
[escape] = [7];
console.log("array target", escape, this.escape === escape);
escape = originalEscape;
console.log("target restore", escape === originalEscape);
console.log("global delete", delete this.escape, typeof escape);
try { escape; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
({ value: escape } = { value: originalEscape });
console.log("global deleted pattern restore", this.escape === escape);
`;
}

function expected(testCase: EscapeCase): string {
  return [
    `escape ${escapeOracle(testCase.units)}`,
    "round trip true",
    `unescape ${unitList(unescapeOracle(unescapeOperand(testCase.pieces)))}`,
    "escape twice true",
    "abrupt true called",
    "not a constructor true",
    "hint 3 a1",
    "guard a%20b A",
    "guard a%20b A",
    "marker 1 true",
    "array target 7 true",
    "target restore true",
    "global delete true undefined",
    "global deleted read true",
    "global deleted pattern restore true",
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
    "oseo-annexb-escape-property-",
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
  "generated escape and unescape operands match the Annex B model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "escape forms, unescape forms, and round trips agree",
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
            { source, sourceId: "generated-m5-annexb-escape.ts" },
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
          "one escape operand of up to eight code units drawn from the " +
          "unescaped set, other ASCII, Latin-1, the BMP, and both " +
          "surrogate halves, one unescape operand of up to six literal " +
          "units and valid, invalid, or short %XX and %uXXXX forms, a " +
          "false number hint, one global-object shape guard miss, and one " +
          "global escape write, restore, and delete sequence",
        numRuns: 12,
        profile: "Annex B escape functions",
        seed: 0x6000_9d00,
        sizeLimit:
          "one escape operand of at most eight code units, one unescape " +
          "operand of at most six pieces of at most six units each, two " +
          "repeated global property observations, and one global " +
          "assignment-target and deletion sequence",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
