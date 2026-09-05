import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRegExpMatcher,
  defaultRegExpExecutionLimits,
  defaultRegExpMatcherLimits,
  matchRegExpMatcher,
  parseRegExpPattern,
  printRegExpMatcher,
  searchRegExpMatcher,
} from "../src/index.ts";
import type {
  RegExpExecution,
  RegExpExecutionLimits,
  RegExpMatcherLimits,
  RegExpMatcherOptions,
  RegExpMatcherProgram,
  RegExpMatcherUnicodeData,
  RegExpPatternError,
  RegExpPatternExtensions,
} from "../src/index.ts";

/**
 * A double for the Unicode facts the builder asks its caller for.
 *
 * It is the exact truth for ASCII and only for ASCII: the classes hold the
 * twenty-six ASCII letter pairs, and `Space_Separator` holds only U+0020.
 * Every case in this file keeps its pattern and its input inside ASCII,
 * where this double and the pinned tables agree, so a difference here is a
 * matcher defect rather than missing data. The cross-package suite runs
 * the same builder over the real `@oseo/unicode` tables.
 */
const asciiUnicodeData: RegExpMatcherUnicodeData = {
  caseEquivalenceClasses: () =>
    Array.from({ length: 26 }, (_, offset) => [0x41 + offset, 0x61 + offset]),
  spaceSeparators: [0x20, 0x21],
};

function built(
  source: string,
  flags = "",
  options: RegExpMatcherOptions = { unicodeData: asciiUnicodeData },
): RegExpMatcherProgram {
  const parsed = parseRegExpPattern({ flags, source });
  assert.deepEqual(parsed.errors, [], `/${source}/${flags}`);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, options);
  assert.deepEqual(result.errors, [], `/${source}/${flags}`);
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  return program;
}

function refused(
  source: string,
  flags = "",
  options: RegExpMatcherOptions = {},
  extensions: RegExpPatternExtensions = { admitted: [] },
): RegExpPatternError {
  const parsed = parseRegExpPattern({ extensions, flags, source });
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, options);
  assert.equal(result.built, false, `/${source}/${flags}`);
  assert.equal(result.program, undefined);
  const error = result.errors[0];
  if (error == null) throw new Error("a refused pattern reports an error");
  return error;
}

/** Every capture of the first match, as text, with `null` for unset. */
function search(
  source: string,
  flags: string,
  text: string,
  startIndex = 0,
): readonly (string | null)[] | string {
  const program = built(source, flags);
  const result = searchRegExpMatcher({ program, startIndex, text });
  if (result.outcome !== "matched") return result.outcome;
  return result.captures.map((span) =>
    span == null ? null : text.slice(span.start, span.end),
  );
}

/** The first match's text and start, or the failing outcome. */
function found(
  source: string,
  flags: string,
  text: string,
  startIndex = 0,
): string {
  const program = built(source, flags);
  const result = searchRegExpMatcher({ program, startIndex, text });
  if (result.outcome !== "matched") return result.outcome;
  const whole = result.captures[0];
  if (whole == null) throw new Error("a match records its whole span");
  return `${whole.start}:${text.slice(whole.start, whole.end)}`;
}

/** The same search performed by the host engine, as an oracle. */
function hostSearch(
  source: string,
  flags: string,
  text: string,
  startIndex = 0,
): readonly (string | null)[] | string {
  const global = flags.includes("g") || flags.includes("y");
  const probe = new RegExp(source, global ? flags : `${flags}g`);
  probe.lastIndex = startIndex;
  const match = probe.exec(text);
  if (match == null) return "unmatched";
  return [...match].map((value) => value ?? null);
}

test("compiles one pattern into an inspectable instruction listing", () => {
  assert.equal(
    printRegExpMatcher(built("(?<n>a|b)*c", "")),
    [
      "matcher /(?<n>a|b)*c/",
      "  captures 1:n",
      "  registers 6",
      "  sets",
      "    0 u+61",
      "    1 u+62",
      "    2 u+63",
      "  code",
      "    0000 save 0",
      "    0001 repeat-init r4",
      "    0002 repeat r4 0..inf greedy 0003 0011",
      "    0003 repeat-enter r4 r5 clear 2..4 0004",
      "    0004 save 2",
      "    0005 fork 0006 0008",
      "    0006 consume forward set 0",
      "    0007 jump 0009",
      "    0008 consume forward set 1",
      "    0009 save 3",
      "    0010 repeat-end r4 r5 min 0 0002",
      "    0011 consume forward set 2",
      "    0012 save 1",
      "    0013 accept",
      "    0014 fail",
      "",
    ].join("\n"),
  );
});

test("records lookaround framing and backreference direction", () => {
  assert.equal(
    printRegExpMatcher(built("(?<=(a))\\1(?!b)$", "m")),
    [
      "matcher /(?<=(a))\\1(?!b)$/m",
      "  captures 1",
      "  registers 6",
      "  sets",
      "    0 u+61",
      "    1 u+62",
      "  code",
      "    0000 save 0",
      "    0001 look-start positive r4 0002 0013",
      "    0002 save 3",
      "    0003 consume backward set 0",
      "    0004 save 2",
      "    0005 look-end positive r4 0006",
      "    0006 backreference forward slots 2",
      "    0007 look-start negative r5 0008 0010",
      "    0008 consume forward set 1",
      "    0009 look-end negative r5 0010",
      "    0010 edge end multiline",
      "    0011 save 1",
      "    0012 accept",
      "    0013 fail",
      "",
    ].join("\n"),
  );
});

test("keeps one artifact immutable and free of match state", () => {
  const program = built("(a)b", "");
  assert.equal(Object.isFrozen(program), true);
  assert.equal(Object.isFrozen(program.instructions), true);
  assert.equal(Object.isFrozen(program.sets), true);
  for (const instruction of program.instructions) {
    assert.equal(Object.isFrozen(instruction), true);
  }
  const again = built("(a)b", "");
  assert.notEqual(program, again);
  assert.deepEqual(program.instructions, again.instructions);
  const first = searchRegExpMatcher({ program, startIndex: 0, text: "ab" });
  const second = searchRegExpMatcher({ program, startIndex: 0, text: "zab" });
  assert.equal(first.outcome, "matched");
  assert.equal(second.outcome, "matched");
  assert.deepEqual(
    searchRegExpMatcher({ program, startIndex: 0, text: "ab" }),
    first,
  );
});

test("owns its metadata rather than aliasing the pattern's", () => {
  const parsed = parseRegExpPattern({ flags: "y", source: "(?<n>a)" });
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: asciiUnicodeData,
  });
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  assert.notEqual(program.flags, pattern.flags);
  assert.notEqual(program.captures, pattern.captures);
  assert.notEqual(program.captures[0], pattern.captures[0]);
  assert.equal(Object.isFrozen(program.flags), true);
  assert.equal(Object.isFrozen(program.captures), true);
  assert.equal(Object.isFrozen(program.captures[0]), true);
  assert.equal(Object.isFrozen(program.groupNames), true);
  assert.equal(Object.isFrozen(pattern.captures), false);
  const before = searchRegExpMatcher({ program, startIndex: 1, text: "ba" });
  Object.assign(pattern.flags, { sticky: false });
  assert.deepEqual(
    searchRegExpMatcher({ program, startIndex: 1, text: "ba" }),
    before,
  );
  assert.equal(program.flags.sticky, true);
});

test("owns every set it stores rather than the caller's table", () => {
  const table: readonly number[] = [0x61, 0x62];
  const parsed = parseRegExpPattern({
    extensions: {
      admitted: ["unicode-property-escapes"],
      unicodeProperty: () => true,
    },
    flags: "u",
    source: "\\p{Letter}",
  });
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: { propertySet: () => table },
  });
  assert.equal(Object.isFrozen(table), false);
  assert.notEqual(result.program?.sets[0], table);
  assert.deepEqual(result.program?.sets[0], table);
  assert.equal(Object.isFrozen(result.program?.sets[0]), true);
});

test("rejects a start position or a boundary that is not a count", () => {
  const program = built("a", "");
  for (const startIndex of [Number.NaN, 0.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => matchRegExpMatcher({ program, startIndex, text: "a" }),
      RangeError,
      `start ${startIndex}`,
    );
    assert.throws(
      () => searchRegExpMatcher({ program, startIndex, text: "a" }),
      RangeError,
      `start ${startIndex}`,
    );
  }
  for (const steps of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () =>
        matchRegExpMatcher({
          limits: { ...defaultRegExpExecutionLimits, steps },
          program,
          startIndex: 0,
          text: "a",
        }),
      RangeError,
      `steps ${steps}`,
    );
  }
  const parsed = parseRegExpPattern({ flags: "", source: "a" });
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  assert.throws(
    () =>
      buildRegExpMatcher(pattern, {
        limits: { instructions: Number.NaN, registers: 8 },
      }),
    RangeError,
  );
  assert.throws(
    () =>
      buildRegExpMatcher(pattern, {
        limits: { instructions: 8, registers: -1 },
      }),
    RangeError,
  );
});

test("shares one set entry between equal character sets", () => {
  const program = built("a[a]a", "");
  assert.deepEqual(program.sets, [[0x61, 0x62]]);
  assert.deepEqual(
    program.instructions.flatMap((instruction) =>
      instruction.kind === "consume" ? [instruction.set] : [],
    ),
    [0, 0, 0],
  );
});

test("selects the first alternative that matches, not the longest", () => {
  assert.deepEqual(search("a|ab", "", "ab"), ["a"]);
  assert.deepEqual(search("ab|a", "", "ab"), ["ab"]);
  assert.deepEqual(search("(?:a|ab)c", "", "abc"), ["abc"]);
  assert.deepEqual(search("(?:ab|a)$", "", "ab"), ["ab"]);
});

test("orders a greedy and a lazy quantifier the way the edition does", () => {
  assert.deepEqual(search("a*", "", "aaa"), ["aaa"]);
  assert.deepEqual(search("a*?", "", "aaa"), [""]);
  assert.deepEqual(search("a*?b", "", "aaab"), ["aaab"]);
  assert.deepEqual(search("a{2,3}", "", "aaaa"), ["aaa"]);
  assert.deepEqual(search("a{2,3}?", "", "aaaa"), ["aa"]);
  assert.deepEqual(search("<(.*)>", "", "<a><b>"), ["<a><b>", "a><b"]);
  assert.deepEqual(search("<(.*?)>", "", "<a><b>"), ["<a>", "a"]);
});

test("clears a repetition's captures at every iteration", () => {
  assert.deepEqual(search("(?:(a)|(b))*", "", "ab"), ["ab", null, "b"]);
  assert.deepEqual(search("(?:(a)|(b))*", "", "ba"), ["ba", "a", null]);
  assert.deepEqual(search("(z)((a+)?(b+)?(c))*", "", "zaacbbbcac"), [
    "zaacbbbcac",
    "z",
    "ac",
    "a",
    null,
    "c",
  ]);
  assert.deepEqual(search("(a*)*", "", "b"), ["", null]);
  assert.deepEqual(search("(a*)+", "", "b"), ["", ""]);
});

test("restores a capture a failed branch had already written", () => {
  assert.deepEqual(search("(?:(a)x|ab)", "", "ab"), ["ab", null]);
  assert.deepEqual(search("(?:(a)b|(a)c)", "", "ac"), ["ac", null, "a"]);
});

test("keeps a positive lookaround's captures and drops a negative one", () => {
  assert.deepEqual(search("(?=(a))a", "", "a"), ["a", "a"]);
  assert.deepEqual(search("(?!(b))a", "", "a"), ["a", null]);
  assert.deepEqual(search("(?<=(a))b", "", "ab"), ["b", "a"]);
  assert.deepEqual(search("(?<!(b))a", "", "a"), ["a", null]);
});

test("commits a lookaround to its first match", () => {
  assert.deepEqual(search("(?=(a*))a", "", "aa"), ["a", "aa"]);
  assert.deepEqual(search("(?=(a|ab))ab", "", "ab"), ["ab", "a"]);
});

test("evaluates a lookbehind body from right to left", () => {
  assert.deepEqual(search("(?<=(a)(b))c", "", "abc"), ["c", "a", "b"]);
  assert.deepEqual(search("(?<=ab)c", "", "abc"), ["c"]);
  assert.equal(found("(?<=ab)c", "", "xbc"), "unmatched");
  assert.deepEqual(search("(?<=a(?=b))bc", "", "abc"), ["bc"]);
  assert.deepEqual(search("(?<=(a+))b", "", "aaab"), ["b", "aaa"]);
});

test("scopes inline modifiers to their group", () => {
  const parsed = parseRegExpPattern({
    extensions: { admitted: ["modifiers"] },
    flags: "",
    source: "(?i:a)(?-i:B)(?s:.)(?-s:.)\\n(?m:^x$)",
  });
  assert.deepEqual(parsed.errors, []);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: asciiUnicodeData,
  });
  assert.deepEqual(result.errors, []);
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  const matched = searchRegExpMatcher({
    program,
    startIndex: 0,
    text: "aB\nq\nx\n",
  });
  assert.equal(matched.outcome, "matched");
});

test("matches a backreference, including one that never participated", () => {
  assert.deepEqual(search("(a)\\1", "", "aa"), ["aa", "a"]);
  assert.deepEqual(search("(a)?\\1b", "", "b"), ["b", null]);
  assert.deepEqual(search("(?:(a)|b)\\1c", "", "bc"), ["bc", null]);
  assert.deepEqual(search("(a)\\1", "i", "aA"), ["aA", "a"]);
  assert.deepEqual(search("(?<=(a)\\1)b", "", "aab"), ["b", "a"]);
  assert.equal(found("(a)\\1", "", "ab"), "unmatched");
});

test("resolves a named reference to whichever group participated", () => {
  assert.deepEqual(search("(?<n>a)|(?<n>b)\\k<n>", "", "bb"), [
    "bb",
    null,
    "b",
  ]);
  assert.deepEqual(search("(?:(?<n>a)|(?<n>b))\\k<n>", "", "aa"), [
    "aa",
    "a",
    null,
  ]);
});

test("stops an empty repetition without stopping an empty bound", () => {
  assert.deepEqual(search("(?:)*", "", "a"), [""]);
  assert.deepEqual(search("(|a)*", "", "aa"), ["aa", "a"]);
  assert.deepEqual(search("(?:a?)*", "", "aa"), ["aa"]);
  assert.deepEqual(search("(?:a?){2,}", "", "a"), ["a"]);
  assert.deepEqual(search("(?:){3}", "", ""), [""]);
  assert.deepEqual(search("a{0}b", "", "b"), ["b"]);
  assert.deepEqual(search("(a){0}", "", "a"), ["", null]);
});

test("iterates code units without u and code points with it", () => {
  assert.deepEqual(search(".", "", "\u{1F600}"), ["\ud83d"]);
  assert.deepEqual(search(".", "u", "\u{1F600}"), ["\u{1F600}"]);
  assert.equal(found(".", "u", "a\u{1F600}b", 2), "1:\u{1F600}");
  assert.equal(found(".", "", "a\u{1F600}b", 2), "2:\ude00");
  assert.deepEqual(search("^.$", "u", "\u{1F600}"), ["\u{1F600}"]);
  assert.equal(found("(?<=\u{1F600})b", "u", "\u{1F600}b"), "2:b");
  assert.deepEqual(search("\\ud83d", "", "\u{1F600}"), ["\ud83d"]);
});

test("closes a set under case folding before it negates the class", () => {
  assert.deepEqual(search("[a]", "i", "A"), ["A"]);
  assert.equal(found("[^a]", "i", "A"), "unmatched");
  assert.deepEqual(search("[^a]", "i", "B"), ["B"]);
  assert.deepEqual(search("a", "i", "A"), ["A"]);
  assert.equal(found("a", "", "A"), "unmatched");
  assert.deepEqual(search("[a-c]+", "i", "ABCD"), ["ABC"]);
  assert.deepEqual(search("\\w+", "i", "aZ_0"), ["aZ_0"]);
});

test("matches the dot, anchors, and boundaries the edition defines", () => {
  assert.equal(found(".", "", "\na"), "1:a");
  assert.deepEqual(search(".", "s", "\na"), ["\n"]);
  assert.equal(found("^a", "", "b\na"), "unmatched");
  assert.equal(found("^a", "m", "b\na"), "2:a");
  assert.equal(found("a$", "", "a\nb"), "unmatched");
  assert.equal(found("a$", "m", "a\nb"), "0:a");
  assert.equal(found("\\bfoo\\b", "", "a foo b"), "2:foo");
  assert.equal(found("\\bfoo\\b", "", "afoo b"), "unmatched");
  assert.deepEqual(search("\\B.", "", "ab"), ["b"]);
  assert.deepEqual(search("\\d+", "", "ab12"), ["12"]);
  assert.deepEqual(search("\\s", "", "a b"), [" "]);
  assert.deepEqual(search("\\S+", "", " ab "), ["ab"]);
  assert.deepEqual(search("[\\d\\s]+", "", "a1 2b"), ["1 2"]);
});

test("advances a search by one character unless the pattern is sticky", () => {
  assert.equal(found("b", "", "ab"), "1:b");
  assert.equal(found("b", "y", "ab"), "unmatched");
  assert.equal(found("b", "y", "ab", 1), "1:b");
  assert.equal(found("a", "", "aa", 1), "1:a");
  assert.equal(found("", "", "ab", 2), "2:");
  assert.equal(found("a", "", "aa", 3), "unmatched");
  assert.equal(found("b", "u", "a\u{1F600}b"), "3:b");
});

test("refuses a pattern whose Unicode facts the caller did not supply", () => {
  const folding = refused("a", "i");
  assert.equal(folding.kind, "unsupported");
  assert.equal(
    folding.message,
    "An ignore-case pattern needs case folding data that is not linked.",
  );
  const space = refused("\\s", "");
  assert.equal(space.kind, "unsupported");
  assert.deepEqual(space.span, { end: 2, start: 0 });
  assert.equal(
    space.message,
    "A whitespace class escape needs Unicode category data that is not " +
      "linked.",
  );
  const property = refused(
    "\\p{L}",
    "u",
    { unicodeData: { caseEquivalenceClasses: () => [] } },
    { admitted: ["unicode-property-escapes"], unicodeProperty: () => true },
  );
  assert.equal(property.kind, "unsupported");
  assert.equal(
    property.message,
    "A Unicode property escape needs property data that is not linked.",
  );
});

test("admits a property escape once its caller resolves the set", () => {
  const parsed = parseRegExpPattern({
    extensions: {
      admitted: ["unicode-property-escapes"],
      unicodeProperty: (escape) => escape.property === "Letter",
    },
    flags: "u",
    source: "\\p{Letter}+",
  });
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: { propertySet: () => [0x61, 0x7b] },
  });
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  const letters = searchRegExpMatcher({
    program,
    startIndex: 0,
    text: "1abc2",
  });
  assert.equal(letters.outcome, "matched");
  assert.deepEqual(
    letters.outcome === "matched" ? letters.captures[0] : undefined,
    { end: 4, start: 1 },
  );
  const missing = buildRegExpMatcher(pattern, {
    unicodeData: { propertySet: () => undefined },
  });
  assert.equal(missing.built, false);
  assert.equal(
    missing.errors[0]?.message,
    "This Unicode property names no code-point set.",
  );
});

test("reports an owned artifact limit rather than emitting an artifact", () => {
  const limits: RegExpMatcherLimits = { instructions: 6, registers: 64 };
  const instructions = refused("abcdefgh", "", {
    limits,
    unicodeData: asciiUnicodeData,
  });
  assert.equal(instructions.kind, "limit");
  assert.equal(
    instructions.message,
    "A pattern needs more matcher instructions than the reviewed limit.",
  );
  const registers = refused("(a)(b)(c)", "", {
    limits: { instructions: 4096, registers: 4 },
    unicodeData: asciiUnicodeData,
  });
  assert.equal(registers.kind, "limit");
  assert.equal(
    registers.message,
    "A pattern needs more matcher registers than the reviewed limit.",
  );
  assert.equal(defaultRegExpMatcherLimits.instructions, 0x10_0000);
  assert.equal(defaultRegExpMatcherLimits.registers, 0x4_0000);
});

/*
 * A resource boundary must be an owned failure rather than a wrong
 * answer, so each case reports its exact limit and the pattern still
 * matches once the same limit is raised.
 */
test("reports an owned execution limit rather than a wrong match", () => {
  const program = built("(a+)+b", "");
  const text = `${"a".repeat(24)}c`;
  const steps: RegExpExecutionLimits = {
    ...defaultRegExpExecutionLimits,
    steps: 50_000,
  };
  const limited = matchRegExpMatcher({
    limits: steps,
    program,
    startIndex: 0,
    text,
  });
  assert.equal(limited.outcome, "limit");
  assert.equal(limited.outcome === "limit" ? limited.limit : "", "steps");
  const backtrack = matchRegExpMatcher({
    limits: { ...defaultRegExpExecutionLimits, backtrackEntries: 8 },
    program,
    startIndex: 0,
    text,
  });
  assert.equal(backtrack.outcome, "limit");
  assert.equal(
    backtrack.outcome === "limit" ? backtrack.limit : "",
    "backtrack-entries",
  );
  const trail = matchRegExpMatcher({
    limits: { ...defaultRegExpExecutionLimits, trailEntries: 4 },
    program,
    startIndex: 0,
    text,
  });
  assert.equal(trail.outcome, "limit");
  assert.equal(trail.outcome === "limit" ? trail.limit : "", "trail-entries");
  const matched = matchRegExpMatcher({
    program,
    startIndex: 0,
    text: `${"a".repeat(24)}b`,
  });
  assert.equal(matched.outcome, "matched");
  assert.equal(defaultRegExpExecutionLimits.steps, 0x100_0000);
});

/*
 * A backreference to a duplicated group name is the one instruction a
 * native lowering writes more than once, so the reviewed step limit has
 * to bound the candidates rather than the artifact's array length. The
 * limit therefore has to be able to cut through one expansion.
 */
test("charges one step per candidate of a duplicate-name reference", () => {
  const program = built("(?:(?<a>x)|(?<a>y))\\k<a>", "");
  const single = built("(?<a>x)\\k<a>", "");
  const request = { program, startIndex: 0, text: "yy" } as const;
  const matched = matchRegExpMatcher(request);
  assert.equal(matched.outcome, "matched");
  const one = matchRegExpMatcher({
    program: single,
    startIndex: 0,
    text: "xx",
  });
  assert.equal(one.outcome, "matched");
  // The duplicated name adds a second candidate, and its alternation
  // adds the fork and jump that separate the two groups.
  assert.equal(matched.steps, one.steps + 4);
  for (let steps = 1; steps < matched.steps; steps += 1) {
    const limited = matchRegExpMatcher({
      limits: { ...defaultRegExpExecutionLimits, steps },
      program,
      startIndex: 0,
      text: "yy",
    });
    assert.equal(limited.outcome, "limit", `steps=${steps}`);
    assert.equal(limited.steps, steps, `steps=${steps}`);
  }
  const exact = matchRegExpMatcher({
    limits: { ...defaultRegExpExecutionLimits, steps: matched.steps },
    program,
    startIndex: 0,
    text: "yy",
  });
  assert.equal(exact.outcome, "matched");
});

test("reports the same work for the same artifact, input, and limits", () => {
  const program = built("(a|aa)+b", "");
  const request = { program, startIndex: 0, text: "aaaaaaac" } as const;
  const first: RegExpExecution = matchRegExpMatcher(request);
  const second: RegExpExecution = matchRegExpMatcher(request);
  assert.deepEqual(first, second);
  assert.equal(first.outcome, "unmatched");
  assert.ok(first.steps > 0);
});

/*
 * The host engine implements the same matching semantics for every
 * pattern this grammar admits, so it is an independent oracle. The corpus
 * stays inside ASCII, which is exactly where the test double above and
 * the pinned tables agree, and it runs unchanged under both hosts.
 */
test("agrees with the host engine over a reviewed ASCII corpus", () => {
  const patterns: readonly (readonly [string, string])[] = [
    ["a|ab", ""],
    ["(a)(b)?", ""],
    ["a*b", ""],
    ["a+?b", ""],
    ["(a|b)*c", ""],
    ["^a.*z$", ""],
    ["^a", "m"],
    ["a$", "m"],
    ["\\bword\\b", ""],
    ["\\B[a-z]", ""],
    ["(?=ab)a.", ""],
    ["(?!ab)a.", ""],
    ["(?<=ab)c+", ""],
    ["(?<!x)b", ""],
    ["(a)\\1", ""],
    ["(?<n>a)\\k<n>", ""],
    ["[^a-c]+", ""],
    ["[a-c]{2,3}", ""],
    ["\\w+\\s\\d+", ""],
    ["(a+)+$", ""],
    ["a", "i"],
    ["[a-f]+", "i"],
    ["(?:x|y)?z", "y"],
    [".+", "s"],
    ["(z)((a+)?(b+)?(c))*", ""],
    ["(|a)*", ""],
    ["(a*)*b", ""],
  ];
  const inputs: readonly string[] = [
    "",
    "a",
    "ab",
    "abc",
    "aab",
    "word",
    "a word z",
    "abcabc",
    "aaaab",
    "xyz",
    "A",
    "ABCDEF",
    "a\nz",
    "a 12",
    "zaacbbbcac",
    "aaaaac",
  ];
  let compared = 0;
  for (const [source, flags] of patterns) {
    for (const text of inputs) {
      for (const startIndex of [0, 1]) {
        if (startIndex > text.length) continue;
        assert.deepEqual(
          search(source, flags, text, startIndex),
          hostSearch(source, flags, text, startIndex),
          `/${source}/${flags} at ${startIndex} on ${JSON.stringify(text)}`,
        );
        compared += 1;
      }
    }
  }
  assert.ok(compared > 500, `only ${compared} comparisons ran`);
});

/*
 * A class string lowers to a shared-prefix trie, and the trie is as deep as
 * the longest alternative, so emitting it through host recursion spent one
 * frame per code point. The reviewed source and instruction limits both
 * admit a twenty-thousand-character alternative, so that pattern reached the
 * host stack rather than any owned boundary. Emission carries its own work
 * list now, which this pins at a depth the recursion could not survive.
 */
test("emits a deep class string without host recursion", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["class-set-notation"],
  };
  const length = 20_000;
  const alternative = "a".repeat(length);
  const parsed = parseRegExpPattern({
    extensions,
    flags: "v",
    source: `^[\\q{${alternative}}]$`,
  });
  assert.deepEqual(parsed.errors, []);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const result = buildRegExpMatcher(pattern, {
    unicodeData: asciiUnicodeData,
  });
  assert.deepEqual(result.errors, []);
  const program = result.program;
  if (program == null) throw new Error("a built artifact is present");
  assert.equal(program.instructions.length, length + 6);
  const matched = searchRegExpMatcher({
    program,
    startIndex: 0,
    text: alternative,
  });
  assert.equal(matched.outcome, "matched");
  const missed = searchRegExpMatcher({
    program,
    startIndex: 0,
    text: `${alternative}a`,
  });
  assert.equal(missed.outcome, "unmatched");
});

/*
 * A lone `\p{...}` escape keeps its exact code points through `v`-mode set
 * algebra only when it names a General_Category value, so the builder has to
 * know which spelling it holds. It asks the caller, because a category table
 * in the compiler core would cross the package boundary.
 *
 * The caller answers that question directly. Inferring it from whether some
 * other spelling resolves would let a provider that answers the escape but
 * not the classification fold an operand the edition keeps exact, and match
 * nothing at all, without saying so. Every other unlinked Unicode fact
 * reports an owned refusal, and so does this one.
 */
test("refuses a lone property escape without category classification", () => {
  const extensions: RegExpPatternExtensions = {
    admitted: ["class-set-notation", "unicode-property-escapes"],
    unicodeProperty: () => true,
  };
  const parsed = parseRegExpPattern({
    extensions,
    flags: "iv",
    source: "[\\p{Ll}--\\p{Lu}]",
  });
  assert.deepEqual(parsed.errors, []);
  const pattern = parsed.pattern;
  if (pattern == null) throw new Error("a parsed pattern is present");
  const partial = buildRegExpMatcher(pattern, {
    unicodeData: {
      caseEquivalenceClasses: () => [[0x61, 0x41]],
      propertySet: () => [0x61, 0x62],
    },
  });
  assert.equal(partial.built, false);
  assert.equal(
    partial.errors[0]?.message,
    "A lone Unicode property escape needs the General_Category value " +
      "classification that is not linked.",
  );
  /*
   * The same provider builds once it can answer, and the answer decides
   * whether the operands stay exact rather than fold.
   */
  const classified = buildRegExpMatcher(pattern, {
    unicodeData: {
      caseEquivalenceClasses: () => [[0x61, 0x41]],
      generalCategoryValue: () => true,
      propertySet: () => [0x61, 0x62],
    },
  });
  assert.deepEqual(classified.errors, []);
  assert.notEqual(classified.program, undefined);
});
