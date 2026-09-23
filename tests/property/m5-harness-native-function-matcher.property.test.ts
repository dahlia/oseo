/* eslint-disable no-await-in-loop -- Native observations are isolated. */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import {
  compileSource,
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

type Accessor = "get" | "none" | "set";
type Mutation =
  | "close-bracket"
  | "extra-paren"
  | "none"
  | "open-bracket"
  | "quoted-native"
  | "trailing"
  | "unterminated-comment";
type NameKind = "computed" | "identifier" | "none";

/** One generated call to the reviewed nativeFunctionMatcher.js helper. */
interface MatcherCase {
  readonly accessor: Accessor;
  readonly decoration: number;
  readonly mutation: Mutation;
  readonly name: NameKind;
  readonly parameters: number;
  readonly whitespace: number;
}

const accessors: readonly Accessor[] = ["get", "none", "set"];

const parameterLists: readonly string[] = [
  "",
  "a",
  "a, b",
  "a = function() { [] }",
  "a = [1, [2]]",
  'a = ")"',
  'a = "]"',
  "a = { b: [1] }",
];

const nameSources = {
  computed: "[Symbol.iterator]",
  identifier: "value",
  none: "",
} satisfies Record<NameKind, string>;

const whitespaceChoices: readonly string[] = [
  "",
  " ",
  "  ",
  "\n  ",
  " /* gap */ ",
  " // gap\n  ",
];

const prefixes: readonly string[] = [
  "",
  "/* before */ ",
  "\n  ",
  "// before\n",
];

const suffixes: readonly string[] = ["", " ", " /* after */", "\n"];

const caseArbitrary: fc.Arbitrary<MatcherCase> = fc.record({
  accessor: fc.constantFrom(...accessors),
  decoration: fc.integer({
    max: prefixes.length * suffixes.length - 1,
    min: 0,
  }),
  mutation: fc.constantFrom(
    "close-bracket" as const,
    "extra-paren" as const,
    "none" as const,
    "open-bracket" as const,
    "quoted-native" as const,
    "trailing" as const,
    "unterminated-comment" as const,
  ),
  name: fc.constantFrom("computed", "identifier", "none"),
  parameters: fc.integer({ max: parameterLists.length - 1, min: 0 }),
  whitespace: fc.integer({ max: whitespaceChoices.length - 1, min: 0 }),
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);
const baseHarness = await readFile(
  new URL("../test262/harness/base.js", import.meta.url),
  "utf8",
);
const matcherHarness = await readFile(
  new URL("../test262/harness/nativeFunctionMatcher.js", import.meta.url),
  "utf8",
);

function harnessProgram(body: string): string {
  return `${baseHarness}\n${matcherHarness}\n${body}\n`;
}

function pick<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  assert(value != null);
  return value;
}

/**
 * Build one NativeFunction source from the generated fields. A mutation of
 * `none` yields a source the grammar accepts; every other mutation violates
 * exactly one production, so the expected verdict is decided by construction
 * rather than by reimplementing the helper.
 */
function sourceFor(testCase: MatcherCase): string {
  const whitespace = pick(whitespaceChoices, testCase.whitespace);
  // `native` and `code` are separate tokens, so they need a separator even
  // when the generated run itself is empty.
  const separator = whitespace === "" ? " " : whitespace;
  const accessor =
    testCase.accessor === "none" ? "" : `${testCase.accessor}${whitespace}`;
  const name = nameSources[testCase.name];
  const parameters = pick(parameterLists, testCase.parameters);
  const prefix = pick(prefixes, testCase.decoration % prefixes.length);
  const suffix = pick(
    suffixes,
    Math.floor(testCase.decoration / prefixes.length) % suffixes.length,
  );
  const clause =
    testCase.mutation === "quoted-native"
      ? '"native code"'
      : testCase.mutation === "open-bracket"
        ? `${whitespace}native${separator}code${whitespace}]`
        : testCase.mutation === "close-bracket"
          ? `[${whitespace}native${separator}code${whitespace}`
          : `[${whitespace}native${separator}code${whitespace}]`;
  const core =
    `function ${accessor}${name}(${parameters})${whitespace}` +
    `{${whitespace}${clause}${whitespace}}`;
  const base = `${prefix}${core}${suffix}`;
  if (testCase.mutation === "trailing") return `${base}x`;
  if (testCase.mutation === "extra-paren") return `${base})`;
  if (testCase.mutation === "unterminated-comment") return `${base} /*`;
  return base;
}

function printCase(testCase: MatcherCase): string {
  const source = JSON.stringify(sourceFor(testCase));
  return harnessProgram(`
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("x", 2));
try {
  validateNativeFunctionSource(${source});
  console.log("verdict accept");
} catch (error) {
  console.log("verdict reject", error.name);
}
`);
}

/** Independent verdict for the generated source, decided by construction. */
function expected(testCase: MatcherCase): string {
  return testCase.mutation === "none"
    ? "hint 3 x2\nverdict accept\n"
    : "hint 3 x2\nverdict reject SyntaxError\n";
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
    "oseo-native-function-matcher-property-",
  );
  const sourcePath = `${directory}/case.js`;
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

async function assertNativeObservation(
  source: string,
  expectedObservation: {
    readonly exitStatus: number;
    readonly stderr: string;
    readonly stdout: string;
  },
  target: NonNullable<typeof nativeTarget>,
): Promise<void> {
  assertMatchingObservations([
    expectedObservation,
    ...(await references(source)),
  ]);
  for (const specialization of ["disabled", "enabled"] as const) {
    const compiled = compileSource(
      babelFrontend,
      { source, sourceId: "generated-m5-harness-native-function-matcher.js" },
      { observeSpecialization: true, specialization },
    );
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.mir != null);
    const mir = printMir(compiled.mir);
    if (specialization === "enabled") {
      assert.match(mir, /guard-(?:shape|smi)/u);
      assert.match(mir, /generic-fallback/u);
    } else {
      assert.doesNotMatch(mir, /guard-(?:shape|smi)/u);
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
          target,
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
}

const fixedSource = harnessProgram(`
/** @param {number} left @param {number} right */
function hinted(left, right) { return left + right; }
console.log("hint", hinted(1, 2), hinted("x", 2));
function report(label, source) {
  try {
    validateNativeFunctionSource(source);
    console.log(label, "accept");
  } catch (error) {
    console.log(label, "reject", error.name);
  }
}
report("plain", "function(){[native code]}");
report("spaced", "function ( ) { [ native code ] }");
report("getter", "function get value() { [native code] }");
report("setter", "function set [Symbol.value](next) { [native code] }");
report("unicode", "function λ(a, b = function() { []; }) { [native code] }");
report("comments", "/* before */ function() { [native code] } // after");
report("near-empty", "function() {}");
report("near-string", 'function(){ "native code" }');
report("near-extra", "function(){ [] native code }");
report("near-paren", "function()) { [native code] }");
report("near-trailing", "function() { [native code] } trailing");
report("near-comment", "// function() { [native code] }");
`);

const fixedExpected = [
  "hint 3 x2",
  "plain accept",
  "spaced accept",
  "getter accept",
  "setter accept",
  "unicode accept",
  "comments accept",
  "near-empty reject SyntaxError",
  "near-string reject SyntaxError",
  "near-extra reject SyntaxError",
  "near-paren reject SyntaxError",
  "near-trailing reject SyntaxError",
  "near-comment reject SyntaxError",
  "",
].join("\n");

test(
  "fixed native matcher verdicts match the reviewed include",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    if (nativeTarget == null) return;
    await assertNativeObservation(
      fixedSource,
      { exitStatus: 0, stderr: "", stdout: fixedExpected },
      nativeTarget,
    );
  },
);

test(
  "generated native matcher verdicts match the NativeFunction grammar",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    if (nativeTarget == null) return;
    await assertAsyncProperty(
      "native matcher accepts valid sources and rejects near misses",
      fc.asyncProperty(caseArbitrary, async (testCase) => {
        await assertNativeObservation(
          printCase(testCase),
          { exitStatus: 0, stderr: "", stdout: expected(testCase) },
          nativeTarget,
        );
      }),
      {
        context:
          host.executionHost == null
            ? ["target=unsupported host=unknown"]
            : [
                `target=${nativeTarget.name}`,
                `host=${host.executionHost.operatingSystem}/` +
                  host.executionHost.architecture,
                `sanitizers=${nativeTarget.sanitizers.join(",")}`,
                "replay=OSEO_PROPERTY_SEED and OSEO_PROPERTY_PATH",
              ],
        domain:
          "none, get, or set accessor; no name, an identifier name, or a " +
          "computed name; eight balanced parameter lists including strings " +
          "with unbalanced brackets; six whitespace and comment runs; four " +
          "prefix and four suffix decorations; and a valid source or one " +
          "of six single-step mutations; with one false number hint",
        numRuns: 12,
        profile: "M5 nativeFunctionMatcher.js harness include",
        seed: 0x6000_7c00,
        sizeLimit:
          "one generated source, one deliberate mutation, one assertion " +
          "throw, and one false hint",
        timeLimitMilliseconds: 240_000,
      },
    );
  },
);
