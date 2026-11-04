/* eslint-disable no-await-in-loop -- Native observations are isolated. */

/**
 * Generated evidence for Annex B's regular expression pattern grammar.
 *
 * A pattern is a short sequence of tokens drawn from the text Annex B
 * reads differently from the core grammar: incomplete and legacy escapes,
 * `\c` without a letter, identity escapes over identifier characters,
 * decimal escapes past the capture count, braces and brackets that start
 * nothing, class escapes as range bounds, and quantified lookaheads,
 * mixed with ordinary atoms, groups, quantifiers, and the text that stays
 * an early error. Concatenation reaches the combinations a fixed table
 * would miss, such as a backslash before a following token.
 *
 * The host engine implements Annex B, so it is the oracle in both
 * directions. The first domain compares the owned parser's acceptance
 * with the host's for every flag set and, for an accepted pattern, the
 * owned matcher's result with the host's on generated inputs. The second
 * compiles a batch of accepted patterns as build-time literals and passes
 * the same text, and the rejected ones, to the runtime's own pattern
 * compiler through the RegExp constructor, then compares the native
 * program with Node.js and Deno under both specialization policies and
 * forced collection.
 */

import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import fc from "fast-check";

import { cBackend } from "../../packages/backend-c/src/index.ts";
import { defaultComponents } from "../../packages/cli/src/index.ts";
import { unicodeMatcherData } from "../../packages/cli/src/regexp-unicode.ts";
import {
  buildRegExpMatcher,
  compileSource,
  describeTarget,
  parseRegExpPattern,
  printMir,
  searchRegExpMatcher,
  targetForExecutionHost,
  type RegExpPatternExtensions,
} from "../../packages/compiler/src/index.ts";
import { createNodeHost } from "../../packages/host/src/index.ts";
import { cRuntimeProvider } from "../../packages/runtime-c/src/index.ts";
import {
  assertMatchingObservations,
  withNativeFixture,
} from "../../packages/testkit/src/index.ts";
import {
  ecma262UnicodePropertySet,
  ecma262UnicodeStringPropertySet,
} from "../../packages/unicode/src/index.ts";
import { nativeToolchain } from "../native-toolchain.ts";
import { hostScriptReferences } from "../native/host-script-reference.ts";

const { assertAsyncProperty, assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

/*
 * Pattern tokens. None holds `/` or a line terminator, so every accepted
 * pattern is also the body of a regular expression literal. The trailing
 * lone backslash makes the token after it an escape.
 */
const annexBTokens = [
  "\\a",
  "\\_",
  "\\p",
  "\\k",
  "\\k<n>",
  "\\k<x>",
  "\\c",
  "\\c1",
  "\\c_",
  "\\x",
  "\\x4",
  "\\u",
  "\\u12",
  "\\u{2}",
  "\\0",
  "\\00",
  "\\08",
  "\\1",
  "\\2",
  "\\8",
  "\\10",
  "\\477",
  "[\\d-a]",
  "[a-\\w]",
  "[\\s-\\D]",
  "[\\c1\\c_]",
  "[\\c]",
  "[\\\\c-f]",
  "[\\B\\k]",
  "[\\1-\\7]",
  "[^\\8]",
  "]",
  "}",
  "{",
  "{,1}",
  "(?=a)",
  "(?!b)",
];
const coreTokens = [
  "a",
  "b",
  "c",
  "k",
  "x",
  "u",
  "0",
  "1",
  "-",
  "<",
  ">",
  ".",
  "^",
  "$",
  "|",
  "*",
  "+",
  "?",
  "*?",
  "{2}",
  "{0,1}",
  "{2,1}",
  "(",
  ")",
  "(?:",
  "(?<n>",
  "(?<=a)",
  "(?<!a)",
  "[",
  "[a-c]",
  "[^a]",
  "[z-a]",
  "\\d",
  "\\w",
  "\\s",
  "\\b",
  "\\B",
  "\\-",
  "\\\\",
  "\\",
];

const tokenArbitrary = fc.oneof(
  { arbitrary: fc.constantFrom(...annexBTokens), weight: 3 },
  { arbitrary: fc.constantFrom(...coreTokens), weight: 2 },
);

interface PatternCase {
  readonly flags: string;
  readonly inputs: readonly string[];
  readonly tokens: readonly string[];
}

/** Input text over the characters the token alphabet can match. */
const inputArbitrary = fc
  .array(
    fc.constantFrom(
      "a",
      "b",
      "c",
      "f",
      "k",
      "n",
      "x",
      "u",
      "A",
      "K",
      "_",
      "-",
      "0",
      "1",
      "2",
      "4",
      "7",
      "8",
      "{",
      "}",
      "]",
      "<",
      ">",
      ",",
      "'",
      " ",
      "\\",
      "\x00",
      "\x01",
      "\x02",
      "\b",
      "\x11",
      "\x1f",
    ),
    { maxLength: 8 },
  )
  .map((characters) => characters.join(""));

function patternCase(flags: fc.Arbitrary<string>): fc.Arbitrary<PatternCase> {
  return fc.record({
    flags,
    inputs: fc.array(inputArbitrary, { maxLength: 3, minLength: 1 }),
    tokens: fc.array(tokenArbitrary, { maxLength: 6, minLength: 1 }),
  });
}

/** The extensions a build gives the pattern parser, as the CLI does. */
const patternExtensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  unicodeProperty: (escape) =>
    ecma262UnicodePropertySet(escape.property, escape.value) != null ||
    (escape.value == null &&
      !escape.negated &&
      ecma262UnicodeStringPropertySet(escape.property) != null),
};

/** Whether the host engine accepts one pattern and flag text. */
function hostAccepts(source: string, flags: string): boolean {
  try {
    return new RegExp(source, flags) instanceof RegExp;
  } catch (error) {
    assert.ok(error instanceof SyntaxError);
    return false;
  }
}

/** The host's match of one input as capture spans, or null. */
function hostMatch(source: string, flags: string, input: string) {
  const match = new RegExp(source, flags).exec(input);
  if (match == null) return null;
  return {
    groups: Array.from(match, (value) => value ?? null),
    index: match.index,
  };
}

/** The owned matcher's match of one input in the host's shape, or null. */
function ownedMatch(
  program: NonNullable<ReturnType<typeof buildRegExpMatcher>["program"]>,
  input: string,
) {
  const execution = searchRegExpMatcher({
    program,
    startIndex: 0,
    text: input,
  });
  assert.notEqual(execution.outcome, "limit");
  if (execution.outcome !== "matched") return null;
  const whole = execution.captures[0];
  assert.ok(whole != null);
  return {
    groups: execution.captures.map((capture) =>
      capture == null ? null : input.slice(capture.start, capture.end),
    ),
    index: whole.start,
  };
}

test("generated Annex B patterns parse and match as the host", () => {
  assertProperty(
    "owned parser and matcher agree with the host on Annex B patterns",
    fc.property(
      patternCase(fc.constantFrom("", "i", "g", "m", "s", "y", "u", "v")),
      (testCase) => {
        const source = testCase.tokens.join("");
        const label = `/${source}/${testCase.flags}`;
        const parsed = parseRegExpPattern({
          extensions: patternExtensions,
          flags: testCase.flags,
          source,
        });
        const accepted = hostAccepts(source, testCase.flags);
        if (!parsed.parsed) {
          assert.equal(accepted, false, label);
          // Annex B leaves only the edition's own early errors.
          for (const error of parsed.errors) {
            assert.equal(error.kind, "invalid", label);
          }
          return;
        }
        assert.equal(accepted, true, label);
        assert.ok(parsed.pattern != null);
        const built = buildRegExpMatcher(parsed.pattern, {
          unicodeData: unicodeMatcherData,
        });
        assert.deepEqual(built.errors, [], label);
        assert.ok(built.program != null);
        for (const input of testCase.inputs) {
          assert.deepEqual(
            ownedMatch(built.program, input),
            hostMatch(source, testCase.flags, input),
            `${label} on ${JSON.stringify(input)}`,
          );
        }
      },
    ),
    {
      domain:
        "one to six tokens of Annex B and core pattern text, one flag set " +
        "with or without u or v, and one to three ASCII and control inputs",
      numRuns: 5000,
      profile: "Annex B regular expression pattern grammar",
      seed: 0x6000_a000,
      sizeLimit: "six tokens, three inputs of at most eight characters",
      timeLimitMilliseconds: 60_000,
    },
  );
});

const host = createNodeHost();
const nativeTarget = targetForExecutionHost(
  host.executionHost ?? {
    architecture: "unknown",
    operatingSystem: "unknown",
  },
);

/**
 * One native program over a batch of patterns. An accepted pattern runs as
 * a literal and through the constructor on the same inputs; a rejected
 * one reaches only the constructor, which must throw a SyntaxError.
 */
function batchSource(cases: readonly PatternCase[]): string {
  const lines = [
    "function show(pattern, input) {",
    "  var match = pattern.exec(input);",
    '  if (match === null) return "null";',
    "  var parts = [];",
    "  for (var index = 0; index < match.length; index += 1) {",
    '    parts.push(match[index] === undefined ? "<u>" : ' +
      "JSON.stringify(match[index]));",
    "  }",
    '  return parts.join(",") + "@" + match.index;',
    "}",
    "function dynamic(source, flags, inputs) {",
    "  try {",
    "    var pattern = new RegExp(source, flags);",
    "  } catch (error) {",
    '    return error instanceof SyntaxError ? "SyntaxError" : "other";',
    "  }",
    "  var results = [pattern.source, pattern.flags];",
    "  for (var index = 0; index < inputs.length; index += 1) {",
    "    pattern.lastIndex = 0;",
    "    results.push(show(pattern, inputs[index]));",
    "  }",
    '  return results.join(" ");',
    "}",
  ];
  for (const [index, testCase] of cases.entries()) {
    const source = testCase.tokens.join("");
    const inputs = JSON.stringify(testCase.inputs);
    lines.push(
      `console.log(${index}, "dynamic", dynamic(${JSON.stringify(source)}, ` +
        `${JSON.stringify(testCase.flags)}, ${inputs}));`,
    );
    if (!hostAccepts(source, testCase.flags)) continue;
    lines.push(
      `(function () {`,
      `  var pattern = /${source}/${testCase.flags};`,
      `  var inputs = ${inputs};`,
      `  var results = [pattern.source, pattern.flags];`,
      `  for (var index = 0; index < inputs.length; index += 1) {`,
      `    pattern.lastIndex = 0;`,
      `    results.push(show(pattern, inputs[index]));`,
      `  }`,
      `  console.log(${index}, "literal", results.join(" "));`,
      `})();`,
    );
  }
  return lines.join("\n");
}

test(
  "generated Annex B patterns compile and match natively",
  { skip: nativeTarget == null ? "requires a supported native host" : false },
  async () => {
    // The runtime links no case-folding tables, so the batch leaves `i` to
    // the build-time domain above and to the fixed fixtures.
    const batch = fc.array(patternCase(fc.constantFrom("", "g", "m", "y")), {
      maxLength: 24,
      minLength: 8,
    });
    await assertAsyncProperty(
      "build-time literals and the runtime pattern compiler match the hosts",
      fc.asyncProperty(batch, async (cases) => {
        const source = batchSource(cases);
        const references = await hostScriptReferences(host, source);
        assertMatchingObservations(references);
        const reference = references[0]!;
        assert.equal(reference.exitStatus, 0, reference.stderr);
        for (const specialization of ["disabled", "enabled"] as const) {
          const compiled = compileSource(
            defaultComponents.frontend,
            { source, sourceId: "generated-m5-annexb-regexp-syntax.js" },
            { observeSpecialization: true, specialization },
          );
          assert.deepEqual(compiled.diagnostics, []);
          assert.ok(compiled.mir != null);
          if (specialization === "disabled") {
            assert.doesNotMatch(printMir(compiled.mir), /guard-shape/u);
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
                assertMatchingObservations([reference, native]);
                assert.ok(native.counters != null);
                assert.ok(native.counters.collections > 0);
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
          "eight to twenty-four generated patterns of one to six Annex B " +
          "and core tokens without i, u, or v, each with one to three " +
          "inputs, run as literals when the host accepts them and always " +
          "through the RegExp constructor",
        numRuns: 6,
        profile: "Annex B regular expression pattern grammar",
        seed: 0x6000_a001,
        sizeLimit:
          "twenty-four patterns of six tokens, three inputs of at most " +
          "eight characters each",
        timeLimitMilliseconds: 300_000,
      },
    );
  },
);
