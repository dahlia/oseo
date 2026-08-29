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
import {
  fullLowercase,
  fullUppercase,
} from "../../packages/unicode/src/index.ts";

const { assertAsyncProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

type ReceiverKind = "object" | "primitive" | "wrapper";

interface CaseToken {
  readonly input: string;
  readonly lower: string;
  readonly upper: string;
}

interface NormalizationCase {
  readonly input: string;
  readonly nfc: string;
  readonly nfd: string;
  readonly nfkc: string;
  readonly nfkd: string;
}

interface StringCaseTestCase {
  readonly caseTokens: readonly CaseToken[];
  readonly content: string;
  readonly leftTrim: readonly string[];
  readonly normalization: NormalizationCase;
  readonly receiver: ReceiverKind;
  readonly rightTrim: readonly string[];
}

const caseTokens: readonly CaseToken[] = [
  { input: "AbC", lower: "abc", upper: "ABC" },
  { input: "\u00df", lower: "\u00df", upper: "SS" },
  { input: "\u0130", lower: "i\u0307", upper: "\u0130" },
  { input: "\ufb03", lower: "\ufb03", upper: "FFI" },
  { input: "\u1c89", lower: "\u1c8a", upper: "\u1c89" },
  { input: "\u039f\u03a3", lower: "\u03bf\u03c2", upper: "\u039f\u03a3" },
  {
    input: "\u039f\u03a3\u0391",
    lower: "\u03bf\u03c3\u03b1",
    upper: "\u039f\u03a3\u0391",
  },
  {
    input: "A\u180e\u03a3",
    lower: "a\u180e\u03c2",
    upper: "A\u180e\u03a3",
  },
  {
    input: "\ud801\udc00\ud801\udc28",
    lower: "\ud801\udc28\ud801\udc28",
    upper: "\ud801\udc00\ud801\udc00",
  },
  { input: "\ud800", lower: "\ud800", upper: "\ud800" },
];

const caseTokenArbitrary: fc.Arbitrary<CaseToken> = fc.oneof(
  fc.constantFrom(...caseTokens),
  fc.integer({ max: 0x10_ffff, min: 0 }).map((codePoint) => ({
    input: String.fromCodePoint(codePoint),
    lower: String.fromCodePoint(...fullLowercase(codePoint)),
    upper: String.fromCodePoint(...fullUppercase(codePoint)),
  })),
);

const normalizationCases: readonly NormalizationCase[] = [
  {
    input: "o\u0308",
    nfc: "\u00f6",
    nfd: "o\u0308",
    nfkc: "\u00f6",
    nfkd: "o\u0308",
  },
  {
    input: "\u212b",
    nfc: "\u00c5",
    nfd: "A\u030a",
    nfkc: "\u00c5",
    nfkd: "A\u030a",
  },
  {
    input: "\ufb03",
    nfc: "\ufb03",
    nfd: "\ufb03",
    nfkc: "ffi",
    nfkd: "ffi",
  },
  {
    input: "\u1100\u1161",
    nfc: "\uac00",
    nfd: "\u1100\u1161",
    nfkc: "\uac00",
    nfkd: "\u1100\u1161",
  },
  {
    input: "q\u0307\u0323",
    nfc: "q\u0323\u0307",
    nfd: "q\u0323\u0307",
    nfkc: "q\u0323\u0307",
    nfkd: "q\u0323\u0307",
  },
];

const trimCharacters = [
  "\u0009",
  "\u000a",
  "\u0020",
  "\u00a0",
  "\u1680",
  "\u2007",
  "\u2028",
  "\u202f",
  "\u3000",
  "\ufeff",
] as const;

const testCaseArbitrary: fc.Arbitrary<StringCaseTestCase> = fc.record({
  caseTokens: fc.array(caseTokenArbitrary, { maxLength: 4 }),
  content: fc
    .array(fc.constantFrom("a", "B", "0", "_", "\u180e", "\u200b"), {
      maxLength: 6,
      minLength: 1,
    })
    .map((values) => values.join("")),
  leftTrim: fc.array(fc.constantFrom(...trimCharacters), { maxLength: 4 }),
  normalization: fc.constantFrom(...normalizationCases),
  receiver: fc.constantFrom<ReceiverKind>("primitive", "wrapper", "object"),
  rightTrim: fc.array(fc.constantFrom(...trimCharacters), { maxLength: 4 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

function receiverExpression(kind: ReceiverKind, value: string): string {
  const source = JSON.stringify(value);
  if (kind === "primitive") return source;
  if (kind === "wrapper") return `new String(${source})`;
  return `({ toString() { return ${source}; } })`;
}

/**
 * Print observations against literal Unicode answers carried by the generated
 * tokens. Case answers come from the independently decoded `@oseo/unicode`
 * tables, not the C header or runtime algorithm, and the oracle never calls a
 * host case, trim, normalization, or collation method while constructing the
 * expected result.
 */
function printCase(testCase: StringCaseTestCase): string {
  const separator = "|";
  const subject = testCase.caseTokens
    .map((token) => token.input)
    .join(separator);
  const lower = testCase.caseTokens.map((token) => token.lower).join(separator);
  const upper = testCase.caseTokens.map((token) => token.upper).join(separator);
  const left = testCase.leftTrim.join("");
  const right = testCase.rightTrim.join("");
  const trimSubject = left + testCase.content + right;
  const normalization = testCase.normalization;
  return `
const caseReceiver = ${receiverExpression(testCase.receiver, subject)};
const trimReceiver = ${receiverExpression(testCase.receiver, trimSubject)};
const normalizeReceiver = ${receiverExpression(
    testCase.receiver,
    normalization.input,
  )};
console.log(
  "case",
  String.prototype.toLowerCase.call(caseReceiver) === ${JSON.stringify(lower)},
  String.prototype.toUpperCase.call(caseReceiver) === ${JSON.stringify(upper)},
  String.prototype.toLocaleLowerCase.call(caseReceiver) ===
    ${JSON.stringify(lower)},
  String.prototype.toLocaleUpperCase.call(caseReceiver) ===
    ${JSON.stringify(upper)},
);
console.log(
  "trim",
  String.prototype.trim.call(trimReceiver) ===
    ${JSON.stringify(testCase.content)},
  String.prototype.trimStart.call(trimReceiver) ===
    ${JSON.stringify(testCase.content + right)},
  String.prototype.trimEnd.call(trimReceiver) ===
    ${JSON.stringify(left + testCase.content)},
);
console.log(
  "normalize",
  String.prototype.normalize.call(normalizeReceiver) ===
    ${JSON.stringify(normalization.nfc)},
  String.prototype.normalize.call(normalizeReceiver, "NFC") ===
    ${JSON.stringify(normalization.nfc)},
  String.prototype.normalize.call(normalizeReceiver, "NFD") ===
    ${JSON.stringify(normalization.nfd)},
  String.prototype.normalize.call(normalizeReceiver, "NFKC") ===
    ${JSON.stringify(normalization.nfkc)},
  String.prototype.normalize.call(normalizeReceiver, "NFKD") ===
    ${JSON.stringify(normalization.nfkd)},
);
console.log(
  "compare",
  String.prototype.localeCompare.call(
    normalizeReceiver,
    ${JSON.stringify(normalization.nfd)},
  ) === 0,
  "a".localeCompare("b") < 0 && "b".localeCompare("a") > 0,
);
/** @param {string} value */
function hinted(value) { return value.toLowerCase(); }
console.log(
  "hint",
  hinted(${JSON.stringify(subject)}) === ${JSON.stringify(lower)},
);
console.log(
  "false hint",
  hinted(new String(${JSON.stringify(subject)})) === ${JSON.stringify(lower)},
);
console.log(
  "guard",
  hinted(${JSON.stringify(subject)}) === ${JSON.stringify(lower)},
);
String.prototype.caseMarker = 1;
console.log(
  "guard",
  hinted(${JSON.stringify(subject)}) === ${JSON.stringify(lower)},
);
`;
}

const expectedObservation = {
  exitStatus: 0,
  stderr: "",
  stdout: [
    "case true true true true",
    "trim true true true",
    "normalize true true true true true",
    "compare true true",
    "hint true",
    "false hint true",
    "guard true",
    "guard true",
    "",
  ].join("\n"),
};

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
    "oseo-string-case-property-",
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
  "generated String case, trim, and normalization agree with the M5 model",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    await assertAsyncProperty(
      "String case, trim, normalization, and comparison agree",
      fc.asyncProperty(testCaseArbitrary, async (testCase) => {
        const source = printCase(testCase);
        assertMatchingObservations([
          expectedObservation,
          ...(await references(source)),
        ]);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            babelFrontend,
            { source, sourceId: "generated-m5-string-case.ts" },
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
          "zero to four pinned-table case tokens across the full Unicode " +
          "range, weighted toward ASCII, expanding, Greek contextual, " +
          "Unicode 17, supplementary, and unpaired-surrogate mappings; " +
          "zero to four leading and trailing ECMAScript whitespace code " +
          "points; five canonical or compatibility normalization examples; " +
          "primitive, wrapper, and generic receivers; both specialization " +
          "policies, a false hint, and a deliberate prototype-shape miss",
        numRuns: 8,
        profile: "M5 String prototype case and trimming",
        seed: 0x6000_5800,
        sizeLimit:
          "at most four case tokens, nine content code units, eight trim " +
          "code points, one normalization example, nine method observations, " +
          "two hint classes, and one prototype shape change",
        timeLimitMilliseconds: 180_000,
      },
    );
  },
);
