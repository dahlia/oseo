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
 * One malformed decoding operand class. Each names a sequence Decode
 * must reject with a URIError, and the generated operand is built from
 * the case's own octets rather than from a fixed string.
 */
type MalformedKind =
  | "continuation-lead"
  | "missing-continuation"
  | "overlong"
  | "short-escape"
  | "surrogate"
  | "too-large"
  | "unpaired-hex";

const malformedKinds: readonly MalformedKind[] = [
  "continuation-lead",
  "missing-continuation",
  "overlong",
  "short-escape",
  "surrogate",
  "too-large",
  "unpaired-hex",
];

interface UriCase {
  /**
   * The code points of the generated operand, drawn so that every UTF-8
   * octet count and both unescaped sets are reachable.
   */
  readonly codePoints: readonly number[];
  /** Which malformed decoding operand this case observes. */
  readonly malformed: MalformedKind;
  /** The lone surrogate an unpaired encoding operand carries. */
  readonly surrogate: number;
  /** The trailing low surrogate of the generated astral code point. */
  readonly trail: number;
}

/*
 * The generated code-point alphabet. It spans the ASCII word characters
 * and marks Encode never escapes, the reserved units only
 * encodeURIComponent escapes, other ASCII, and the two-, three-, and
 * four-octet ranges, so a generated operand exercises every branch of
 * the UTF-8 transformation and both unescaped sets.
 */
const alphabet: readonly number[] = [
  0x00, 0x09, 0x20, 0x25, 0x2d, 0x30, 0x39, 0x3b, 0x3f, 0x41, 0x5a, 0x5f, 0x61,
  0x7a, 0x7e, 0x7f, 0x80, 0xa9, 0xe9, 0x7ff, 0x800, 0x4e2d, 0xd7ff, 0xe000,
  0xfffd, 0xffff, 0x10000, 0x1f600, 0x10ffff,
];

const caseArbitrary: fc.Arbitrary<UriCase> = fc.record({
  codePoints: fc.array(fc.constantFrom(...alphabet), {
    maxLength: 8,
    minLength: 1,
  }),
  malformed: fc.constantFrom(...malformedKinds),
  surrogate: fc.integer({ max: 0xdfff, min: 0xd800 }),
  trail: fc.integer({ max: 0xdfff, min: 0xdc00 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

const hexDigits = "0123456789ABCDEF";

/** The UTF-16 code units of one code point, 11.1.1. */
function codeUnits(codePoint: number): readonly number[] {
  if (codePoint <= 0xffff) return [codePoint];
  const remainder = codePoint - 0x10000;
  return [0xd800 + (remainder >> 10), 0xdc00 + (remainder % 0x400)];
}

/**
 * The UTF-8 octets of one code point, computed from its bits rather
 * than through any host encoder, so the oracle stays independent of the
 * operation under test.
 */
function utf8Octets(codePoint: number): readonly number[] {
  if (codePoint <= 0x7f) return [codePoint];
  if (codePoint <= 0x7ff) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint % 0x40)];
  }
  if (codePoint <= 0xffff) {
    return [
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) % 0x40),
      0x80 | (codePoint % 0x40),
    ];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) % 0x40),
    0x80 | ((codePoint >> 6) % 0x40),
    0x80 | (codePoint % 0x40),
  ];
}

/** One `%XX` escape with the uppercase hexadecimal digits Encode uses. */
function escapeOctet(octet: number): string {
  return `%${hexDigits[octet >> 4]}${hexDigits[octet % 16]}`;
}

const alwaysUnescaped =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789" +
  "-_.!~*'()";
const reservedUnescaped = ";/?:@&=+$,#";

/** Encode(string, extraUnescaped), 19.2.6.5, over the case's code points. */
function encodeOracle(
  codePoints: readonly number[],
  extraUnescaped: string,
): string {
  let encoded = "";
  for (const codePoint of codePoints) {
    const character = String.fromCodePoint(codePoint);
    if (
      codePoint <= 0x7f &&
      (alwaysUnescaped.includes(character) ||
        extraUnescaped.includes(character))
    ) {
      encoded += character;
      continue;
    }
    for (const octet of utf8Octets(codePoint)) encoded += escapeOctet(octet);
  }
  return encoded;
}

/**
 * The answer `decodeURI(encodeURIComponent(operand))` gives. Decode
 * preserves the escape of every reserved unit and decodes every other
 * sequence, so the result is the operand with each reserved unit
 * replaced by its own uppercase escape.
 */
function preserveOracle(codePoints: readonly number[]): string {
  let preserved = "";
  for (const codePoint of codePoints) {
    const character = String.fromCodePoint(codePoint);
    preserved += reservedUnescaped.includes(character)
      ? escapeOctet(codePoint)
      : character;
  }
  return preserved;
}

/** The source text of one JavaScript string literal for these units. */
function stringLiteral(units: readonly number[]): string {
  let literal = '"';
  for (const unit of units) {
    literal += `\\u${unit.toString(16).padStart(4, "0")}`;
  }
  return `${literal}"`;
}

/** The generated operand's UTF-16 code units. */
function operandUnits(testCase: UriCase): readonly number[] {
  return testCase.codePoints.flatMap((codePoint) => codeUnits(codePoint));
}

/**
 * The malformed decoding operand for one case. Every class is built
 * from explicit octets so shrinking keeps the class the failure names.
 */
function malformedOperand(testCase: UriCase): string {
  const kind = testCase.malformed;
  if (kind === "short-escape") return "%A";
  if (kind === "unpaired-hex") return "%2G";
  if (kind === "continuation-lead") {
    return escapeOctet(0x80 + (testCase.trail % 0x40));
  }
  if (kind === "missing-continuation") {
    return `${escapeOctet(0xc2)}A`;
  }
  if (kind === "overlong") {
    return `${escapeOctet(0xc0)}${escapeOctet(0x80)}`;
  }
  if (kind === "surrogate") {
    const octets = [
      0xed,
      0x80 | ((testCase.surrogate >> 6) % 0x40),
      0x80 | (testCase.surrogate % 0x40),
    ];
    return octets.map((octet) => escapeOctet(octet)).join("");
  }
  return (
    `${escapeOctet(0xf5)}${escapeOctet(0x80)}${escapeOctet(0x80)}` +
    escapeOctet(0x80)
  );
}

function printCase(testCase: UriCase): string {
  const units = operandUnits(testCase);
  const operand = stringLiteral(units);
  const preserved = stringLiteral(
    [...preserveOracle(testCase.codePoints)].flatMap((character) =>
      codeUnits(character.codePointAt(0) ?? 0),
    ),
  );
  const malformed = JSON.stringify(malformedOperand(testCase));
  const unpaired = stringLiteral([testCase.surrogate]);
  return `
const uriGlobalObject = this;
const originalEncodeURI = encodeURI;
const operand = ${operand};
console.log(
  "encode",
  encodeURI(operand),
  encodeURIComponent(operand),
);
console.log(
  "round trip",
  decodeURI(encodeURI(operand)) === operand,
  decodeURIComponent(encodeURIComponent(operand)) === operand,
  decodeURIComponent(encodeURI(operand)) === operand,
);
console.log(
  "preserved",
  decodeURI(encodeURIComponent(operand)) === ${preserved},
);
try {
  decodeURI(${malformed});
  console.log("malformed", "no throw");
} catch (error) {
  console.log("malformed", error instanceof URIError, error.name);
}
try {
  decodeURIComponent(${malformed});
  console.log("malformed component", "no throw");
} catch (error) {
  console.log("malformed component", error instanceof URIError);
}
try {
  encodeURI(${unpaired});
  console.log("unpaired", "no throw");
} catch (error) {
  console.log("unpaired", error instanceof URIError);
}
try {
  encodeURIComponent(${unpaired});
  console.log("unpaired component", "no throw");
} catch (error) {
  console.log("unpaired component", error instanceof URIError);
}
try {
  encodeURI({ toString() { throw new RangeError("abrupt"); } });
} catch (error) {
  console.log("abrupt", error instanceof RangeError);
}
try {
  new decodeURI("a");
} catch (error) {
  console.log("not a constructor", error instanceof TypeError);
}
/** @param {number} operand @param {number} addend */
function hinted(operand, addend) { return operand + addend; }
console.log("hint", hinted(2, 1), hinted(encodeURI("a"), 1));
let turn = 0;
while (turn < 2) {
  console.log("guard", encodeURI("a"), decodeURI("a"));
  if (turn === 0) uriGlobalObject.marker = 1;
  turn = turn + 1;
}
console.log("marker", uriGlobalObject.marker, delete uriGlobalObject.marker);
({ value: encodeURI } = { value: 7 });
console.log("object target", encodeURI, this.encodeURI === encodeURI);
[encodeURI] = [8];
console.log("array target", encodeURI, this.encodeURI === encodeURI);
for (encodeURI of [9]) {}
console.log("for-of target", encodeURI, this.encodeURI === encodeURI);
encodeURI = originalEncodeURI;
console.log("target restore", encodeURI === originalEncodeURI);
this.encodeURI = 10;
console.log("global write", this.encodeURI === encodeURI, encodeURI);
this.encodeURI = originalEncodeURI;
console.log("global restore", this.encodeURI === encodeURI);
console.log("global delete", delete this.encodeURI, typeof encodeURI);
try { encodeURI; } catch (error) {
  console.log("global deleted read", error instanceof ReferenceError);
}
function strictDeletedSet() { "use strict"; encodeURI = 1; }
try { strictDeletedSet(); } catch (error) {
  console.log("global deleted strict set", error instanceof ReferenceError);
}
({ value: encodeURI } = { value: originalEncodeURI });
console.log("global deleted pattern restore", this.encodeURI === encodeURI);
function strictDeleteDuringSet() {
  "use strict";
  encodeURI = (delete uriGlobalObject.encodeURI, 11);
}
try { strictDeleteDuringSet(); } catch (error) {
  console.log("global strict set race", error instanceof ReferenceError);
}
encodeURI = originalEncodeURI;
console.log("global race restore", this.encodeURI === encodeURI);
`;
}

function expected(testCase: UriCase): string {
  const encodedUri = encodeOracle(testCase.codePoints, reservedUnescaped);
  const encodedComponent = encodeOracle(testCase.codePoints, "");
  return [
    `encode ${encodedUri} ${encodedComponent}`,
    "round trip true true true",
    "preserved true",
    "malformed true URIError",
    "malformed component true",
    "unpaired true",
    "unpaired component true",
    "abrupt true",
    "not a constructor true",
    "hint 3 a1",
    "guard a a",
    "guard a a",
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
    "oseo-uri-handling-property-",
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
  "generated URI encoding, decoding, and rejection match the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "URI escaping, UTF-8 round trips, and URIError operands agree",
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
            { source, sourceId: "generated-m5-uri-handling.ts" },
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
          "one operand of one to eight code points drawn from the ASCII " +
          "word characters, the unreserved marks, the reserved units, " +
          "other ASCII, and the two-, three-, and four-octet ranges, one " +
          "malformed decoding operand from seven rejection classes, one " +
          "unpaired surrogate, a false number hint, one global-object " +
          "shape guard miss, and one global encodeURI write, restore, " +
          "delete, assignment-target, and strict missing-property sequence",
        numRuns: 12,
        profile: "M5 URI handling functions",
        seed: 0x6000_5f00,
        sizeLimit:
          "one operand of at most eight code points, one malformed " +
          "operand of at most four escape sequences, one lone surrogate, " +
          "two repeated global property observations, and one global " +
          "assignment-target and deletion sequence",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
