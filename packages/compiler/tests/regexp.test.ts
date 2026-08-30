import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultRegExpPatternLimits,
  parseRegExpLiteral,
  parseRegExpPattern,
  printRegExpPattern,
  regExpUnicodeMode,
} from "../src/index.ts";
import type {
  RegExpPattern,
  RegExpPatternError,
  RegExpPatternExtensions,
  RegExpPatternLimits,
} from "../src/index.ts";

function accepted(source: string, flags = ""): RegExpPattern {
  const result = parseRegExpPattern({ flags, source });
  assert.deepEqual(result.errors, []);
  assert.equal(result.parsed, true);
  const pattern = result.pattern;
  assert.notEqual(pattern, undefined);
  if (pattern == null) throw new Error("unreachable");
  return pattern;
}

function rejected(
  source: string,
  flags = "",
  options: {
    readonly extensions?: RegExpPatternExtensions;
    readonly limits?: RegExpPatternLimits;
  } = {},
): RegExpPatternError {
  const result = parseRegExpPattern({ flags, source, ...options });
  assert.equal(result.parsed, false);
  assert.equal(result.pattern, undefined);
  const error = result.errors[0];
  if (error == null) throw new Error("a rejected pattern reports an error");
  return error;
}

test("retains the written pattern and flag text", () => {
  const pattern = accepted("a\\u0062", "gimsuy");
  assert.equal(pattern.source, "a\\u0062");
  assert.equal(pattern.flags.text, "gimsuy");
  assert.equal(pattern.flags.global, true);
  assert.equal(pattern.flags.ignoreCase, true);
  assert.equal(pattern.flags.multiline, true);
  assert.equal(pattern.flags.dotAll, true);
  assert.equal(pattern.flags.unicode, true);
  assert.equal(pattern.flags.sticky, true);
  assert.equal(pattern.flags.hasIndices, false);
  assert.equal(pattern.flags.unicodeSets, false);
  assert.equal(regExpUnicodeMode(pattern.flags), true);
  assert.equal(regExpUnicodeMode(accepted("a", "v").flags), true);
  assert.equal(regExpUnicodeMode(accepted("a").flags), false);
});

test("records alternatives in written choice order", () => {
  const pattern = accepted("ab|c|");
  assert.equal(pattern.body.alternatives.length, 3);
  const [first, second, third] = pattern.body.alternatives;
  assert.equal(first?.terms.length, 2);
  assert.equal(second?.terms.length, 1);
  assert.equal(third?.terms.length, 0);
});

test("records quantifier bounds and choice priority", () => {
  const cases: readonly (readonly [string, number, number, boolean])[] = [
    ["a*", 0, Number.POSITIVE_INFINITY, true],
    ["a+?", 1, Number.POSITIVE_INFINITY, false],
    ["a?", 0, 1, true],
    ["a{2}", 2, 2, true],
    ["a{2,}", 2, Number.POSITIVE_INFINITY, true],
    ["a{2,4}?", 2, 4, false],
  ];
  for (const [source, minimum, maximum, greedy] of cases) {
    const term = accepted(source).body.alternatives[0]?.terms[0];
    assert.equal(term?.kind, "quantified");
    if (term?.kind !== "quantified") continue;
    assert.equal(term.quantifier.minimum, minimum);
    assert.equal(term.quantifier.maximum, maximum);
    assert.equal(term.quantifier.greedy, greedy);
  }
});

test("numbers capturing groups by opening parenthesis order", () => {
  const pattern = accepted("((a)(?<name>b))(?:c)");
  assert.deepEqual(
    pattern.captures.map((capture) => capture.index),
    [1, 2, 3],
  );
  assert.deepEqual(
    pattern.captures.map((capture) => capture.name ?? null),
    [null, null, "name"],
  );
  assert.deepEqual(pattern.groupNames, ["name"]);
});

test("resolves numbered and named references after the whole pattern", () => {
  const pattern = accepted("\\1(a)(?<n>b)\\k<n>");
  const terms = pattern.body.alternatives[0]?.terms ?? [];
  assert.equal(terms[0]?.kind, "backreference");
  if (terms[0]?.kind === "backreference") assert.equal(terms[0].index, 1);
  assert.equal(terms[3]?.kind, "named-backreference");
  if (terms[3]?.kind === "named-backreference") {
    assert.deepEqual(terms[3].indices, [2]);
  }
});

test("resolves a named reference to every group with the name", () => {
  const pattern = accepted("(?<n>a)|(?<n>b)\\k<n>", "u");
  const reference = pattern.body.alternatives[1]?.terms[1];
  assert.equal(reference?.kind, "named-backreference");
  if (reference?.kind !== "named-backreference") return;
  assert.deepEqual(reference.indices, [1, 2]);
  assert.deepEqual(pattern.groupNames, ["n"]);
});

test("decodes every character escape form to one code point", () => {
  const cases: readonly (readonly [string, string, number])[] = [
    ["\\n", "", 0x0a],
    ["\\t", "", 0x09],
    ["\\v", "", 0x0b],
    ["\\f", "", 0x0c],
    ["\\r", "", 0x0d],
    ["\\cJ", "", 0x0a],
    ["\\0", "", 0x00],
    ["\\x41", "", 0x41],
    ["\\u0041", "", 0x41],
    ["\\u{1F600}", "u", 0x1_f600],
    ["\\uD83D\\uDE00", "u", 0x1_f600],
    ["😀", "u", 0x1_f600],
    ["\\$", "", 0x24],
    ["\\/", "u", 0x2f],
  ];
  for (const [source, flags, value] of cases) {
    const term = accepted(source, flags).body.alternatives[0]?.terms[0];
    assert.equal(term?.kind, "character", source);
    if (term?.kind === "character") assert.equal(term.value, value, source);
  }
});

test("reads a supplementary code point as two units without u or v", () => {
  const terms = accepted("😀").body.alternatives[0]?.terms ?? [];
  assert.equal(terms.length, 2);
  assert.equal(terms[0]?.kind === "character" ? terms[0].value : 0, 0xd83d);
  assert.equal(terms[1]?.kind === "character" ? terms[1].value : 0, 0xde00);
});

/*
 * A generated case at seed 0x60004a00 read the two escapes as one
 * supplementary code point without the u flag. RegExpUnicodeEscapeSequence
 * joins a surrogate pair only under UnicodeMode, so the same text is two
 * independent code units otherwise, and a group name always uses the
 * unicode form whatever the flag set says.
 */
test("joins a surrogate escape pair only where the grammar does", () => {
  const joined = accepted("\\ud83d\\ude00", "u").body.alternatives[0]?.terms;
  assert.equal(joined?.length, 1);
  assert.equal(
    joined?.[0]?.kind === "character" ? joined[0].value : 0,
    0x1_f600,
  );
  const separate = accepted("\\ud83d\\ude00").body.alternatives[0]?.terms;
  assert.equal(separate?.length, 2);
  assert.deepEqual(
    separate?.map((term) => (term.kind === "character" ? term.value : 0)),
    [0xd83d, 0xde00],
  );
  const braced = accepted("\\u{d83d}\\u{de00}", "u").body.alternatives[0]
    ?.terms;
  assert.equal(braced?.length, 2);
  const extensions: RegExpPatternExtensions = {
    admitted: [],
    identifierPart: (codePoint) => codePoint === 0x1_f600,
    identifierStart: (codePoint) => codePoint === 0x1_f600,
  };
  const named = parseRegExpPattern({
    extensions,
    flags: "",
    source: "(?<\\ud83d\\ude00>x)",
  });
  assert.deepEqual(named.pattern?.groupNames, ["\u{1F600}"]);
});

test("records class items, ranges, and class escapes", () => {
  const term = accepted("[^a-z\\d\\b-]").body.alternatives[0]?.terms[0];
  assert.equal(term?.kind, "character-class");
  if (term?.kind !== "character-class") return;
  assert.equal(term.negated, true);
  assert.deepEqual(
    term.items.map((item) => item.kind),
    ["range", "class-escape", "character", "character"],
  );
  assert.equal(
    accepted("[\\-a]", "u").body.alternatives[0]?.terms[0]?.kind,
    "character-class",
  );
});

test("prints the owned model rather than the written text", () => {
  const pattern = accepted("(?<n>a|\\x62)*?[x-z\\d]\\k<n>(?=q)\\1", "u");
  assert.equal(
    printRegExpPattern(pattern),
    [
      "pattern /(?<n>a|\\x62)*?[x-z\\d]\\k<n>(?=q)\\1/u",
      "  captures 1:n",
      "  disjunction",
      "    alternative",
      "      repeat 0..inf lazy",
      "        capture 1 n",
      "          disjunction",
      "            alternative",
      "              char u+0061 a",
      "            alternative",
      "              char u+0062 b",
      "      class",
      "        range u+0078 x .. u+007a z",
      "        class-escape digit",
      "      backreference n -> 1",
      "      look ahead positive",
      "        disjunction",
      "          alternative",
      "            char u+0071 q",
      "      backreference 1",
      "",
    ].join("\n"),
  );
});

test("prints assertions, dots, groups, and negated class escapes", () => {
  const pattern = accepted("^\\B(?:.)(?<!\\S)$", "s");
  assert.equal(
    printRegExpPattern(pattern),
    [
      "pattern /^\\B(?:.)(?<!\\S)$/s",
      "  captures ",
      "  disjunction",
      "    alternative",
      "      assert start",
      "      assert non-word-boundary",
      "      group",
      "        disjunction",
      "          alternative",
      "            dot",
      "      look behind negative",
      "        disjunction",
      "          alternative",
      "            class-escape not space",
      "      assert end",
      "",
    ].join("\n"),
  );
});

test("reports an invalid quantifier at its own text", () => {
  const error = rejected("ab{2,1}", "u");
  assert.equal(error.kind, "invalid");
  assert.equal(error.section, "pattern");
  assert.deepEqual(error.span, { end: 7, start: 2 });
  assert.equal(
    error.message,
    "A quantifier's lower bound is above its upper bound.",
  );
});

test("reports each early error with its exact message and span", () => {
  const cases: readonly (readonly [string, string, string, number, number])[] =
    [
      ["*a", "u", "A quantifier has no atom to repeat.", 0, 1],
      ["a{2}{3}", "u", "A quantifier has no atom to repeat.", 4, 5],
      ["(a", "u", "A group is unterminated.", 0, 2],
      ["a)", "u", "This character must be escaped.", 1, 2],
      ["]", "u", "This character must be escaped.", 0, 1],
      ["}", "u", "This character must be escaped.", 0, 1],
      ["a{", "u", "An unescaped brace is not a pattern character.", 1, 2],
      ["[a", "u", "A character class is unterminated.", 0, 2],
      ["[z-a]", "u", "A character class range is out of order.", 1, 4],
      [
        "[\\d-a]",
        "u",
        "A character class range bound cannot be a class escape.",
        1,
        5,
      ],
      ["\\", "u", "A pattern cannot end with a backslash.", 0, 1],
      ["\\a", "u", "This identity escape is not allowed.", 0, 2],
      ["\\_", "u", "This identity escape is not allowed.", 0, 2],
      [
        "\\01",
        "u",
        "A legacy octal escape is outside the candidate edition.",
        0,
        3,
      ],
      ["\\c1", "u", "A control escape needs an ASCII letter.", 0, 2],
      ["\\x4", "u", "A hexadecimal escape needs two hexadecimal digits.", 0, 2],
      ["\\u12", "u", "A Unicode escape needs four hexadecimal digits.", 0, 2],
      ["\\u{}", "u", "A braced Unicode escape is incomplete.", 0, 3],
      [
        "\\u{110000}",
        "u",
        "A Unicode escape is above the code point range.",
        0,
        10,
      ],
      ["\\1", "u", "This backreference names no capturing group.", 0, 2],
      ["(a)\\2", "u", "This backreference names no capturing group.", 3, 5],
      [
        "\\k<n>",
        "u",
        "This named backreference names no capturing group.",
        0,
        5,
      ],
      ["(?=a)*", "u", "An assertion cannot be quantified.", 5, 6],
      ["^{2}", "u", "An assertion cannot be quantified.", 1, 2],
      ["^{", "u", "An unescaped brace is not a pattern character.", 1, 2],
      ["^?", "u", "An assertion cannot be quantified.", 1, 2],
      [
        "(?<a b>x)",
        "u",
        "This character is not allowed in a group name.",
        4,
        5,
      ],
      ["(?<>x)", "u", "A group name is incomplete.", 0, 3],
      ["(?#c)", "u", "This group prefix is not a valid group.", 0, 3],
    ];
  for (const [source, flags, message, start, end] of cases) {
    const error = rejected(source, flags);
    assert.equal(error.kind, "invalid", source);
    assert.equal(error.message, message, source);
    assert.deepEqual(error.span, { end, start }, source);
  }
});

/*
 * Annex B is outside the candidate claim, so a construct only Annex B
 * admits is rejected in every mode. Which rejection it is depends on the
 * flag set: `u` and `v` never admitted the construct, so the edition
 * itself requires the early error, while without them the text is one a
 * web browser accepts and the rejection is this profile's own boundary.
 */
test("separates an Annex B boundary from an edition early error", () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ["\\c", "A control escape needs an ASCII letter.", "A control escape"],
    ["\\01", "A legacy octal escape is outside the candidate edition.", "A"],
    ["\\x", "A hexadecimal escape needs two hexadecimal digits.", "An"],
    ["\\u", "A Unicode escape needs four hexadecimal digits.", "An"],
    ["\\_", "This identity escape is not allowed.", "This identity escape"],
    ["[\\k]", "This identity escape is not allowed.", "This identity escape"],
    ["[\\d-a]", "A character class range bound cannot be a class escape.", "A"],
    ["]", "This character must be escaped.", "This unescaped character"],
    ["}", "This character must be escaped.", "This unescaped character"],
    ["a{", "An unescaped brace is not a pattern character.", "An unescaped"],
    ["(?=a)*", "An assertion cannot be quantified.", "A quantified lookahead"],
    ["\\2", "This backreference names no capturing group.", "A backreference"],
    ["\\k<n>", "This named backreference names no capturing group.", "A named"],
  ];
  for (const [source, editionMessage, subject] of cases) {
    const boundary = rejected(source, "");
    assert.equal(boundary.kind, "unsupported", source);
    assert.ok(boundary.message.startsWith(subject), source);
    assert.equal(
      boundary.message.endsWith(
        "is admitted only by Annex B, which is outside the profile.",
      ),
      true,
      source,
    );
    const early = rejected(source, "u");
    assert.equal(early.kind, "invalid", source);
    assert.equal(early.message, editionMessage, source);
    /*
     * Both report the construct that was rejected, so both start at it.
     * They can end apart: `\k<n>` stops at the escape without a group
     * specifier, where the grammar never reads the name that follows.
     */
    assert.equal(early.span.start, boundary.span.start, source);
  }
});

/*
 * Whether a pattern declares a group name decides how `\k` reads, so the
 * scan that answers it must see `(?<` as an introducer only where the
 * grammar does. A class member, an escaped parenthesis, and a lookbehind
 * are all ordinary text there.
 */
test("finds a group specifier without mistaking text for one", () => {
  const references: readonly string[] = [
    "[(?<a]\\k",
    "\\(?<a\\k",
    "(?<=a)\\k",
    "(?<!a)\\k",
    "[(?<a]\\k<n>",
    // The grammar never enters its named-reference production here, so
    // the shape of the text after the escape is never looked at.
    "\\k<@>",
    "\\k<1>",
    "\\k< >",
    "\\k<>",
    // Many references share one scan, so the answer holds at any length.
    "\\k<n>".repeat(64),
  ];
  for (const source of references) {
    const error = rejected(source, "");
    assert.equal(error.kind, "unsupported", source);
    assert.ok(error.message.includes("Annex B"), source);
  }
  const declared: readonly string[] = [
    "(?<a>x)[(?<b]\\k",
    "(?<a>x)[\\k]",
    "(?<a>x)\\k",
    "(?<a>x)\\k<b>",
    "(?<a>x)\\k<@>",
  ];
  for (const source of declared) {
    const error = rejected(source, "");
    assert.equal(error.kind, "invalid", source);
  }
});

/*
 * Annex B quantifies a lookahead alone, and it reads `\k` as an identity
 * escape only in a pattern that declares no group name, so these keep the
 * edition's early error in every mode.
 */
test("keeps a rejection Annex B shares as an edition early error", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["(?<=a)*", "An assertion cannot be quantified."],
    ["(?<!a)*", "An assertion cannot be quantified."],
    ["^*", "An assertion cannot be quantified."],
    ["\\b*", "An assertion cannot be quantified."],
    ["(?<a>x)[\\k]", "This identity escape is not allowed."],
    ["(?<a>x)\\k<b>", "This named backreference names no capturing group."],
    ["a)", "This character must be escaped."],
    ["(a", "A group is unterminated."],
    ["[z-a]", "A character class range is out of order."],
    ["a{2,1}", "A quantifier's lower bound is above its upper bound."],
    ["*a", "A quantifier has no atom to repeat."],
    ["\\", "A pattern cannot end with a backslash."],
  ];
  for (const [source, message] of cases) {
    for (const flags of ["", "u"]) {
      const error = rejected(source, flags);
      assert.equal(error.kind, "invalid", `/${source}/${flags}`);
      assert.equal(error.message, message, `/${source}/${flags}`);
    }
  }
});

test("rejects a repeated group name that can participate in one match", () => {
  const error = rejected("(?<a>x)(?:(?<a>y))", "u");
  assert.equal(error.kind, "invalid");
  assert.deepEqual(error.span, { end: 15, start: 10 });
  assert.equal(
    error.message,
    "This group name repeats one that can participate in the same match.",
  );
  assert.equal(
    parseRegExpPattern({ flags: "u", source: "(?<a>x)|(?<a>y)" }).parsed,
    true,
  );
  assert.equal(
    parseRegExpPattern({ flags: "u", source: "((?<a>x)|(?:(?<a>y)))" }).parsed,
    true,
  );
});

test("reports every unresolved reference in one pattern", () => {
  const result = parseRegExpPattern({ flags: "u", source: "\\k<b>(a)\\3" });
  assert.equal(result.parsed, false);
  assert.deepEqual(
    result.errors.map((error) => error.span.start),
    [0, 8],
  );
});

test("rejects an invalid or repeated flag at its own offset", () => {
  const unknown = rejected("a", "gq");
  assert.equal(unknown.section, "flags");
  assert.equal(unknown.kind, "invalid");
  assert.deepEqual(unknown.span, { end: 2, start: 1 });
  assert.equal(unknown.message, "This regular expression flag is not defined.");
  const repeated = rejected("a", "gg");
  assert.equal(repeated.section, "flags");
  assert.deepEqual(repeated.span, { end: 2, start: 1 });
  assert.equal(repeated.message, "This regular expression flag is repeated.");
  const combined = rejected("a", "uv");
  assert.equal(combined.section, "flags");
  assert.deepEqual(combined.span, { end: 2, start: 0 });
  assert.equal(combined.message, "The u and v flags cannot be combined.");
});

test("refuses a construct a later unit owns without calling it invalid", () => {
  const cases: readonly (readonly [string, string, string])[] = [
    ["[a]", "v", "Class set notation is not admitted yet."],
    ["\\p{L}", "u", "A Unicode property escape is not admitted yet."],
    ["\\P{L}", "v", "A Unicode property escape is not admitted yet."],
    ["(?i:a)", "u", "An inline modifier group is not admitted yet."],
  ];
  for (const [source, flags, message] of cases) {
    const error = rejected(source, flags);
    assert.equal(error.kind, "unsupported", source);
    assert.equal(error.message, message, source);
    assert.equal(error.span.start, 0, source);
  }
});

test("parses an admitted extension point and keeps its written name", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["unicode-property-escapes"],
    unicodeProperty: () => true,
  };
  const result = parseRegExpPattern({
    extensions,
    flags: "u",
    source: "\\P{Script=Greek}",
  });
  assert.equal(result.parsed, true);
  const term = result.pattern?.body.alternatives[0]?.terms[0];
  assert.equal(term?.kind, "unicode-property");
  if (term?.kind !== "unicode-property") return;
  assert.equal(term.negated, true);
  assert.equal(term.property, "Script");
  assert.equal(term.value, "Greek");
});

test("checks a Unicode property escape's name characters", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["unicode-property-escapes"],
    unicodeProperty: () => true,
  };
  for (const source of [
    "\\p{}",
    "\\p{a b}",
    "\\p{=x}",
    "\\p{9=x}",
    "\\p{a=}",
  ]) {
    const error = rejected(source, "u", { extensions });
    assert.equal(error.kind, "invalid", source);
    assert.equal(
      error.message,
      "A Unicode property escape names nothing valid.",
      source,
    );
  }
  const missing = rejected("\\p", "u", { extensions });
  assert.equal(
    missing.message,
    "A Unicode property escape needs a braced name.",
  );
  const open = rejected("\\p{Any", "u", { extensions });
  assert.equal(open.message, "A Unicode property escape is unterminated.");
});

test("delegates Unicode property resolution to the admitting caller", () => {
  const withoutData = rejected("\\p{Letter}", "u", {
    extensions: { admitted: ["unicode-property-escapes"] },
  });
  assert.equal(withoutData.kind, "unsupported");
  assert.equal(
    withoutData.message,
    "A Unicode property escape needs property data that is not linked.",
  );
  const extensions: RegExpPatternExtensions = {
    admitted: ["unicode-property-escapes"],
    unicodeProperty: (escape) => escape.property === "Letter",
  };
  assert.equal(
    parseRegExpPattern({ extensions, flags: "u", source: "\\p{Letter}" })
      .parsed,
    true,
  );
  const error = rejected("\\p{Missing}", "u", { extensions });
  assert.equal(error.kind, "invalid");
  assert.equal(error.message, "This Unicode property is not defined.");
});

test("distinguishes unadmitted properties of strings from early errors", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["unicode-property-escapes"],
    unicodeProperty: () => false,
  };
  const unsupported = rejected("\\p{RGI_Emoji}", "v", { extensions });
  assert.equal(unsupported.kind, "unsupported");
  assert.equal(
    unsupported.message,
    "A Unicode property of strings is not admitted yet.",
  );
  for (const [source, flags, message] of [
    [
      "\\p{RGI_Emoji}",
      "u",
      "A Unicode property of strings requires the v flag.",
    ],
    ["\\P{RGI_Emoji}", "v", "This Unicode property is not defined."],
  ] as const) {
    const error = rejected(source, flags, { extensions });
    assert.equal(error.kind, "invalid", `${source}/${flags}`);
    assert.equal(error.message, message, `${source}/${flags}`);
  }
});

test("admits inline modifiers only through the extension point", () => {
  const extensions: RegExpPatternExtensions = { admitted: ["modifiers"] };
  const result = parseRegExpPattern({
    extensions,
    flags: "u",
    source: "(?im-s:a)",
  });
  assert.equal(result.parsed, true);
  const term = result.pattern?.body.alternatives[0]?.terms[0];
  assert.equal(term?.kind, "modifier-group");
  if (term?.kind !== "modifier-group") return;
  assert.deepEqual(term.enabled, ["i", "m"]);
  assert.deepEqual(term.disabled, ["s"]);
  const cases: readonly (readonly [string, string])[] = [
    ["(?i-i:a)", "A modifier group both adds and removes a flag."],
    ["(?-:a)", "A modifier group names no flag."],
    ["(?ii:a)", "A modifier group repeats a flag."],
  ];
  for (const [source, message] of cases) {
    const error = rejected(source, "u", { extensions });
    assert.equal(error.kind, "invalid", source);
    assert.equal(error.message, message, source);
  }
});

test("admits Unicode class sets only through the extension point", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["class-set-notation", "unicode-property-escapes"],
    unicodeProperty: (escape) => escape.property === "RGI_Emoji",
  };
  const result = parseRegExpPattern({
    extensions,
    flags: "v",
    source: "[[a-c]--[b]]",
  });
  assert.equal(result.parsed, true);
  const term = result.pattern?.body.alternatives[0]?.terms[0];
  assert.equal(term?.kind, "class-set");
  if (term?.kind !== "class-set") return;
  assert.equal(term.operation, "subtraction");
  assert.equal(term.operands.length, 2);
  assert.equal(
    parseRegExpPattern({
      extensions,
      flags: "v",
      source: "[\\q{xy|z}\\p{RGI_Emoji}]",
    }).parsed,
    true,
  );
  for (const source of ["[\\&]", "[\\!]", "[\\q{\\-|\\&}]", "[\\q{\\b}]"]) {
    assert.equal(
      parseRegExpPattern({ extensions, flags: "v", source }).parsed,
      true,
      source,
    );
  }

  const unsupported = rejected("[a&&b]", "v");
  assert.equal(unsupported.kind, "unsupported");
  assert.equal(unsupported.message, "Class set notation is not admitted yet.");

  const strings = rejected("[^\\q{ab}]", "v", { extensions });
  assert.equal(strings.kind, "invalid");
  assert.equal(
    strings.message,
    "A negated character class may contain strings.",
  );
  const unicodeModeString = rejected("\\p{RGI_Emoji}", "u", {
    extensions,
  });
  assert.equal(unicodeModeString.kind, "invalid");
  assert.equal(
    unicodeModeString.message,
    "A Unicode property of strings requires the v flag.",
  );
  assert.equal(
    parseRegExpPattern({
      extensions,
      flags: "v",
      source: "[^\\q{ab}&&_]",
    }).parsed,
    true,
  );
  for (const [source, message] of [
    ["[|]", "A class set syntax character must be escaped."],
    ["[!!]", "A doubled class set punctuator must be escaped."],
    ["[&&a]", "A class set operator needs an operand."],
    ["[a&&&]", "A class set operator needs an operand."],
    ["[a-[]", "A nested class set cannot be a range bound."],
    [
      "[a-b&&c]",
      "A class set range cannot be an intersection or subtraction operand.",
    ],
    [
      "[a&&b-c]",
      "A class set range cannot be an intersection or subtraction operand.",
    ],
    [
      "[a-b--c]",
      "A class set range cannot be an intersection or subtraction operand.",
    ],
    ["[\\q{a-b}]", "A class set syntax character must be escaped."],
    ["[\\q{(}]", "A class set syntax character must be escaped."],
    ["[\\q{[}]", "A class set syntax character must be escaped."],
    ["[\\q{]}]", "A class set operator needs an operand."],
    ["[\\q{&&}]", "A class set operator needs an operand."],
  ] as const) {
    const error = rejected(source, "v", { extensions });
    assert.equal(error.kind, "invalid", source);
    assert.equal(error.message, message, source);
  }
});

test("refuses a group name outside ASCII without a classifier", () => {
  const error = rejected("(?<é>x)", "u");
  assert.equal(error.kind, "unsupported");
  assert.equal(
    error.message,
    "A group name outside ASCII needs Unicode identifier data that is not " +
      "linked.",
  );
  const extensions: RegExpPatternExtensions = {
    admitted: [],
    identifierPart: (codePoint) => codePoint === 0x00e9,
    identifierStart: (codePoint) => codePoint === 0x00e9,
  };
  const result = parseRegExpPattern({
    extensions,
    flags: "u",
    source: "(?<é>x)\\k<é>",
  });
  assert.equal(result.parsed, true);
  assert.deepEqual(result.pattern?.groupNames, ["é"]);
});

test("accepts an escaped and a written group name as one name", () => {
  const pattern = accepted("(?<\\u0061b>x)\\k<ab>");
  assert.deepEqual(pattern.groupNames, ["ab"]);
});

test("rejects identity escapes outside ASCII without a classifier", () => {
  for (const [source, span] of [
    ["\\é", { end: 2, start: 0 }],
    ["[\\é]", { end: 3, start: 1 }],
  ] as const) {
    const error = rejected(source, "");
    assert.equal(error.kind, "unsupported", source);
    assert.deepEqual(error.span, span, source);
    assert.equal(
      error.message,
      "An identity escape outside ASCII needs Unicode identifier data that " +
        "is not linked.",
      source,
    );
  }
});

/*
 * A quantifier that no atom precedes is an early error whatever its
 * bounds say, and a decimal escape too large to represent exactly still
 * names no group, so neither reaches a resource limit first.
 */
test("checks grammar before the reviewed resource limits", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["{9007199254740992}", "A quantifier has no atom to repeat."],
    ["^{9007199254740992}", "An assertion cannot be quantified."],
    ["\\99999999999999999999", "This backreference names no capturing group."],
  ];
  for (const [source, message] of cases) {
    const error = rejected(source, "u");
    assert.equal(error.kind, "invalid", source);
    assert.equal(error.message, message, source);
  }
  const bound = rejected("a{9007199254740992}", "u");
  assert.equal(bound.kind, "limit");
  assert.equal(
    bound.message,
    "A quantifier bound is above the reviewed limit.",
  );
  /*
   * Two bounds can round to one double, and a reviewed limit must not
   * hide an early error, so the written digits decide the order first.
   */
  const rounded = rejected("a{9007199254740993,9007199254740992}", "u");
  assert.equal(rounded.kind, "invalid");
  assert.equal(
    rounded.message,
    "A quantifier's lower bound is above its upper bound.",
  );
  const limits: RegExpPatternLimits = {
    ...defaultRegExpPatternLimits,
    quantifierBound: 5,
  };
  const ordered = rejected("a{9,1}", "u", { limits });
  assert.equal(ordered.kind, "invalid");
  assert.equal(
    ordered.message,
    "A quantifier's lower bound is above its upper bound.",
  );
  assert.equal(
    parseRegExpPattern({ flags: "u", limits, source: "a{01,5}" }).parsed,
    true,
  );
});

test("keeps a reported span inside the text it addresses", () => {
  for (const source of ["(?", "(?-", "(?<", "(?<a", "\\", "\\u{", "[a-"]) {
    const error = rejected(source, "u");
    assert.ok(error.span.start >= 0, source);
    assert.ok(error.span.end <= source.length, source);
    assert.ok(error.span.start <= error.span.end, source);
  }
  const flags = rejected("a", "gq");
  assert.ok(flags.span.end <= 2);
});

test("reports an owned limit rather than exhausting a host", () => {
  const limits: RegExpPatternLimits = {
    capturingGroups: 2,
    nestingDepth: 3,
    quantifierBound: 8,
    sourceLength: 32,
  };
  const cases: readonly (readonly [string, string])[] = [
    ["(a)(b)(c)", "A pattern declares too many capturing groups."],
    ["(?:(?:(?:a)))", "A pattern nests above the reviewed depth limit."],
    ["a{9}", "A quantifier bound is above the reviewed limit."],
    ["a{0,9}", "A quantifier bound is above the reviewed limit."],
    [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "A pattern is longer than the reviewed limit.",
    ],
  ];
  for (const [source, message] of cases) {
    const error = rejected(source, "u", { limits });
    assert.equal(error.kind, "limit", source);
    assert.equal(error.message, message, source);
  }
  assert.equal(
    parseRegExpPattern({ flags: "u", limits, source: "(a)(b)" }).parsed,
    true,
  );
});

test("keeps the reviewed default limits within one pattern", () => {
  assert.equal(defaultRegExpPatternLimits.capturingGroups, 0xffff);
  assert.equal(defaultRegExpPatternLimits.nestingDepth, 256);
  assert.equal(
    defaultRegExpPatternLimits.quantifierBound,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(defaultRegExpPatternLimits.sourceLength, 0x10_0000);
  const deep = `${"(".repeat(300)}a${")".repeat(300)}`;
  const error = rejected(deep, "u");
  assert.equal(error.kind, "limit");
  assert.equal(
    parseRegExpPattern({
      flags: "u",
      source: `${"(?:".repeat(200)}a${")".repeat(200)}`,
    }).parsed,
    true,
  );
});

test("parses one literal record without a bootstrap parser node", () => {
  const range = {
    end: { column: 6, line: 1 },
    start: { column: 1, line: 1 },
  } as const;
  const result = parseRegExpLiteral({
    byteRange: { end: 5, start: 0 },
    flags: "u",
    kind: "regexp-literal",
    pattern: "(a)",
    range,
  });
  assert.equal(result.parsed, true);
  assert.equal(result.pattern?.source, "(a)");
  assert.equal(result.pattern?.flags.text, "u");
  const invalid = parseRegExpLiteral({
    byteRange: { end: 5, start: 0 },
    flags: "u",
    kind: "regexp-literal",
    pattern: "(a",
    range,
  });
  assert.equal(invalid.parsed, false);
  assert.deepEqual(invalid.errors[0]?.span, { end: 2, start: 0 });
});
