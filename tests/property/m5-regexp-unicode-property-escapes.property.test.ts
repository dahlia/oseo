import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  buildRegExpMatcher,
  matchRegExpMatcher,
  parseRegExpPattern,
} from "../../packages/compiler/src/index.ts";
import type {
  RegExpMatcherProgram,
  RegExpPatternError,
  RegExpPatternExtensions,
} from "../../packages/compiler/src/index.ts";
import {
  binaryPropertyNameAliases,
  canonicalPropertyName,
  generalCategoryValueAliases,
  maxCodePoint,
  nonBinaryPropertyNameAliases,
  scriptValueAliases,
} from "../../packages/unicode/src/index.ts";

import {
  propertyEscapeSet,
  unicodeMatcherData,
} from "../regexp-matcher-data.ts";

const { assertProperty } = await import(
  ["../../packages/testkit/tests/", "property-support.ts"].join("")
);

const propertyExtensions: RegExpPatternExtensions = {
  admitted: ["unicode-property-escapes"],
  unicodeProperty: (escape) => propertyEscapeSet(escape) != null,
};

function artifact(source: string, flags: string): RegExpMatcherProgram {
  const parsed = parseRegExpPattern({
    extensions: propertyExtensions,
    flags,
    source,
  });
  assert.deepEqual(parsed.errors, [], `/${source}/${flags}`);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const built = buildRegExpMatcher(pattern, {
    unicodeData: unicodeMatcherData,
  });
  assert.deepEqual(built.errors, [], `/${source}/${flags}`);
  const program = built.program;
  if (program == null) throw new Error("a built matcher is present");
  return program;
}

function matcherAccepts(
  source: string,
  flags: string,
  codePoint: number,
): boolean {
  const text = String.fromCodePoint(codePoint);
  const result = matchRegExpMatcher({
    program: artifact(source, flags),
    startIndex: 0,
    text,
  });
  return (
    result.outcome === "matched" && result.captures[0]?.end === text.length
  );
}

const codePointArbitrary = fc.oneof(
  fc.integer({ max: maxCodePoint, min: 0 }),
  fc.constantFrom(
    0,
    0x2f,
    0x30,
    0x39,
    0x3a,
    0x40,
    0x41,
    0x5a,
    0x5f,
    0x61,
    0x7a,
    0x7b,
    0xa0,
    0x17f,
    0x212a,
    0x2028,
    0xd7ff,
    0xd800,
    0xdfff,
    0xe000,
    0x1_0400,
    0x1_f600,
    maxCodePoint,
  ),
);

test("generated character class escapes agree with the host", () => {
  const caseArbitrary = fc.constantFrom("u", "iu", "v", "iv").chain((flags) =>
    fc.record({
      codePoint: codePointArbitrary,
      escape: fc.constantFrom("d", "D", "s", "S", "w", "W"),
      flags: fc.constant(flags),
      inClass: flags.includes("v") ? fc.constant(false) : fc.boolean(),
    }),
  );
  assertProperty(
    "character class escapes match the host engine",
    fc.property(caseArbitrary, (entry) => {
      const atom = `\\${entry.escape}`;
      const source = `^${entry.inClass ? `[${atom}]` : atom}$`;
      const text = String.fromCodePoint(entry.codePoint);
      assert.equal(
        matcherAccepts(source, entry.flags, entry.codePoint),
        new RegExp(source, entry.flags).test(text),
        `/${source}/${entry.flags} at U+${entry.codePoint.toString(16)}`,
      );
    }),
    {
      domain:
        "one positive or negative digit, whitespace, or word escape, " +
        "inside or outside a class, under u or v with optional ignore-case, " +
        "and one code point from the whole range or a reviewed boundary",
      numRuns: 160,
      profile: "M5b RegExp character class escapes",
      seed: 0x6000_4e00,
      sizeLimit: "one-code-point inputs<=0x10ffff",
      timeLimitMilliseconds: 60_000,
    },
  );
});

interface PropertyExpression {
  readonly oracle: "empty-set" | "host";
  readonly property: string;
  readonly value?: string;
}

const generalCategoryPropertyNames = nonBinaryPropertyNameAliases.filter(
  (name) => canonicalPropertyName(name) === "General_Category",
);
const scriptPropertyNames = nonBinaryPropertyNameAliases.filter(
  (name) => canonicalPropertyName(name) === "Script",
);
const scriptExtensionsPropertyNames = nonBinaryPropertyNameAliases.filter(
  (name) => canonicalPropertyName(name) === "Script_Extensions",
);
const emptyScriptValueAliases = ["Hrkt", "Katakana_Or_Hiragana"] as const;
const hostScriptValueAliases = scriptValueAliases.filter(
  (value) => !emptyScriptValueAliases.some((alias) => alias === value),
);

const propertyExpressionArbitrary = fc.oneof(
  fc
    .constantFrom(...binaryPropertyNameAliases)
    .map((property): PropertyExpression => ({ oracle: "host", property })),
  fc
    .constantFrom(...generalCategoryValueAliases)
    .map((property): PropertyExpression => ({ oracle: "host", property })),
  fc
    .record({
      property: fc.constantFrom(...generalCategoryPropertyNames),
      value: fc.constantFrom(...generalCategoryValueAliases),
    })
    .map(
      ({ property, value }): PropertyExpression => ({
        oracle: "host",
        property,
        value,
      }),
    ),
  fc
    .record({
      property: fc.constantFrom(
        ...scriptPropertyNames,
        ...scriptExtensionsPropertyNames,
      ),
      value: fc.constantFrom(...hostScriptValueAliases),
    })
    .map(
      ({ property, value }): PropertyExpression => ({
        oracle: "host",
        property,
        value,
      }),
    ),
  fc
    .record({
      property: fc.constantFrom(
        ...scriptPropertyNames,
        ...scriptExtensionsPropertyNames,
      ),
      value: fc.constantFrom(...emptyScriptValueAliases),
    })
    .map(
      ({ property, value }): PropertyExpression => ({
        oracle: "empty-set",
        property,
        value,
      }),
    ),
);

test("generated Unicode property escapes follow independent oracles", () => {
  const caseArbitrary = fc.record({
    codePoint: codePointArbitrary,
    expression: propertyExpressionArbitrary,
    flags: fc.constantFrom("u", "iu", "v", "iv"),
    negated: fc.boolean(),
  });
  assertProperty(
    "every generated property expression follows its independent oracle",
    fc.property(caseArbitrary, (entry) => {
      const { property, value } = entry.expression;
      const expression = value == null ? property : `${property}=${value}`;
      const source = `^\\${entry.negated ? "P" : "p"}{${expression}}$`;
      const text = String.fromCodePoint(entry.codePoint);
      /*
       * PropertyValueAliases retains Hrkt for a withdrawn Script value whose
       * pinned Script and Script_Extensions sets are both empty. V8 rejects
       * that otherwise normative spelling, so its independent oracle is the
       * empty-set fact from the pinned source files instead.
       */
      const expected =
        entry.expression.oracle === "empty-set"
          ? entry.negated
          : new RegExp(source, entry.flags).test(text);
      assert.equal(
        matcherAccepts(source, entry.flags, entry.codePoint),
        expected,
        `/${source}/${entry.flags} at U+${entry.codePoint.toString(16)}`,
      );
    }),
    {
      domain:
        "one exact binary property, General_Category value alias, or " +
        "General_Category, Script, or Script_Extensions property and value " +
        "alias, positive or negative, under u or v with optional " +
        "ignore-case, and one code point from the whole range or a reviewed " +
        "boundary, using the host engine except for the retained empty Hrkt " +
        "Script value",
      numRuns: 240,
      profile: "M5b RegExp Unicode property escapes",
      seed: 0x6000_4e01,
      sizeLimit: "one-code-point inputs<=0x10ffff",
      timeLimitMilliseconds: 60_000,
    },
  );
});

interface InvalidPropertyCase {
  readonly flags: "u" | "v";
  readonly message: string;
  readonly source: string;
  readonly span: { readonly end: number; readonly start: number };
}

function invalidCase(
  source: string,
  message: string,
  flags: "u" | "v" = "u",
  start = 0,
  end = source.length,
): InvalidPropertyCase {
  return { flags, message, source, span: { end, start } };
}

const nothingValid = "A Unicode property escape names nothing valid.";
const invalidPropertyCases: readonly InvalidPropertyCase[] = [
  invalidCase(
    "\\p",
    "A Unicode property escape needs a braced name.",
    "u",
    0,
    2,
  ),
  invalidCase("\\p{L", "A Unicode property escape is unterminated."),
  invalidCase("\\p{}", nothingValid),
  invalidCase("\\p{=Latin}", nothingValid),
  invalidCase("\\p{Script=}", nothingValid),
  invalidCase("\\p{Script =Latin}", nothingValid),
  invalidCase("\\p{Script=Lat-in}", nothingValid),
  invalidCase("\\p{Latin}", "This Unicode property is not defined."),
  invalidCase("\\P{ASCII=Y}", "This Unicode property is not defined."),
  invalidCase(
    "\\p{General_Category=Latin}",
    "This Unicode property is not defined.",
  ),
  invalidCase(
    "\\p{general_category=Lu}",
    "This Unicode property is not defined.",
  ),
  invalidCase("\\p{GC=Lu}", "This Unicode property is not defined."),
  invalidCase(
    "\\p{script=Greek}",
    "This Unicode property is not defined.",
    "v",
  ),
  invalidCase(
    "[\\p{Latin}]",
    "This Unicode property is not defined.",
    "u",
    1,
    10,
  ),
];

function onlyError(entry: InvalidPropertyCase): RegExpPatternError {
  const result = parseRegExpPattern({
    extensions: propertyExtensions,
    flags: entry.flags,
    source: entry.source,
  });
  assert.equal(result.parsed, false, `/${entry.source}/${entry.flags}`);
  assert.equal(result.errors.length, 1, `/${entry.source}/${entry.flags}`);
  const error = result.errors[0];
  if (error == null) throw new Error("a rejected pattern reports one error");
  return error;
}

test("generated invalid property escapes keep their exact diagnostics", () => {
  assertProperty(
    "invalid property expressions are source-located early errors",
    fc.property(fc.constantFrom(...invalidPropertyCases), (entry) => {
      const error = onlyError(entry);
      assert.equal(error.kind, "invalid");
      assert.equal(error.section, "pattern");
      assert.equal(error.message, entry.message);
      assert.deepEqual(error.span, entry.span);
      assert.throws(
        () => new RegExp(entry.source, entry.flags),
        SyntaxError,
        `/${entry.source}/${entry.flags}`,
      );
    }),
    {
      domain:
        "one missing brace, empty name or value, invalid name character, " +
        "unknown property, wrong property-value pair, loose spelling, or " +
        "invalid property escape inside a class under u or v",
      numRuns: 80,
      profile: "M5b RegExp Unicode property escape diagnostics",
      seed: 0x6000_4e02,
      sizeLimit: "one controlled invalid mutation",
      timeLimitMilliseconds: 60_000,
    },
  );
});
