/**
 * Generated pattern-extension semantics over the generic matcher.
 *
 * The host engine is an independent oracle for the candidate-edition
 * grammar. Each generated case stays inside the exact extension family it
 * names, so shrinking preserves the class-set operation, modifier scope,
 * capture form, or matching flag under test.
 */

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  buildRegExpMatcher,
  parseRegExpPattern,
  searchRegExpMatcher,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpPatternExtensions,
} from "../../packages/compiler/src/index.ts";

import {
  propertyEscapeSet,
  stringPropertyEscapeSet,
  unicodeMatcherData,
} from "../regexp-matcher-data.ts";

const { assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const extensions: RegExpPatternExtensions = {
  admitted: ["class-set-notation", "modifiers", "unicode-property-escapes"],
  identifierPart: (codePoint) => codePoint === 0x00e9,
  identifierStart: (codePoint) => codePoint === 0x00e9,
  unicodeProperty: (escape) =>
    propertyEscapeSet(escape) != null ||
    stringPropertyEscapeSet(escape) != null,
};

interface PatternCase {
  readonly flags: string;
  readonly input: string;
  readonly source: string;
}

const textArbitrary = fc
  .array(
    fc.constantFrom(
      "a",
      "A",
      "b",
      "c",
      "d",
      "x",
      "y",
      "\n",
      "9",
      "\ufe0f",
      "\u20e3",
    ),
    { maxLength: 8 },
  )
  .map((characters) => characters.join(""));

const caseArbitrary: fc.Arbitrary<PatternCase> = fc.oneof(
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[[a-c]&&[b-d]]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[[a-c]--[b]]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[\\q{ab|cd}x]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[^a]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[a&&A]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[[a-z]--A]",
  })),
  textArbitrary.map((input) => ({
    flags: "iv",
    input,
    source: "[\\q{AB}--\\q{ab}]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "[\\q{|a}]",
  })),
  textArbitrary.map((input) => ({
    flags: "v",
    input,
    source: "\\p{Emoji_Keycap_Sequence}",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?i:a)(?-i:b)",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?s:a.b)",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?m:^b$)",
  })),
  textArbitrary.map((input) => ({
    flags: "u",
    input,
    source: "(?<é>a)\\k<é>",
  })),
  textArbitrary.map((input) => ({
    flags: "",
    input,
    source: "(?<=a)b",
  })),
  textArbitrary.map((input) => ({
    flags: "d",
    input,
    source: "(a)(?<right>b)",
  })),
  textArbitrary.map((input) => ({
    flags: "s",
    input,
    source: "a.b",
  })),
);

function artifact(testCase: PatternCase): RegExpMatcherProgram {
  const parsed = parseRegExpPattern({
    extensions,
    flags: testCase.flags,
    source: testCase.source,
  });
  assert.deepEqual(parsed.errors, []);
  assert.ok(parsed.pattern != null);
  const built = buildRegExpMatcher(parsed.pattern, {
    unicodeData: unicodeMatcherData,
  });
  assert.deepEqual(built.errors, []);
  assert.ok(built.program != null);
  return built.program;
}

interface Observation {
  readonly captures: readonly (string | null)[];
  readonly index: number;
}

function observed(testCase: PatternCase): Observation | undefined {
  const result = searchRegExpMatcher({
    program: artifact(testCase),
    startIndex: 0,
    text: testCase.input,
  });
  if (result.outcome !== "matched") return undefined;
  const whole = result.captures[0];
  assert.ok(whole != null);
  return {
    captures: result.captures.map((span) =>
      span == null ? null : testCase.input.slice(span.start, span.end),
    ),
    index: whole.start,
  };
}

function hostObserved(testCase: PatternCase): Observation | undefined {
  const regexp = new RegExp(testCase.source, testCase.flags);
  const match = regexp.exec(testCase.input);
  if (match == null) return undefined;
  return {
    captures: [...match].map((capture) => capture ?? null),
    index: match.index,
  };
}

test("generated pattern extensions agree with the host", () => {
  assertProperty(
    "class sets, modifiers, captures, lookbehind, indices, and dotAll match",
    fc.property(caseArbitrary, (testCase) => {
      assert.deepEqual(observed(testCase), hostObserved(testCase));
    }),
    {
      domain:
        "one generated input paired with class-set intersection, " +
        "subtraction, a finite string disjunction, a pinned string " +
        "property, scoped i, m, or s modifiers, a non-ASCII named group " +
        "and backreference, lookbehind, match indices, or dotAll matching",
      numRuns: 64,
      profile: "M5 RegExp pattern extensions",
      seed: 0x6000_5d00,
      sizeLimit: "at most eight generated input characters and one pattern",
      timeLimitMilliseconds: 30_000,
    },
  );
});
