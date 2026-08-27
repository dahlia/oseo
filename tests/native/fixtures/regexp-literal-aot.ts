import type { Fixture } from "../fixture.ts";

/**
 * Ahead-of-time compiled regular expression literals.
 *
 * Every observation is printed rather than asserted so the reference
 * hosts decide it. Two contracts this fixture exists for cannot be read
 * from a match alone: every evaluation of one literal is a distinct
 * object with its own `lastIndex`, and a literal and a `new RegExp` over
 * the same source and flags match the same way. Both are printed as
 * comparisons rather than left implicit.
 *
 * The one place the unit deliberately leaves V8 is how a failed attempt
 * advances under `u`, so no case here places a zero-width assertion after
 * a surrogate pair that fails.
 */
export const regexpLiteralAotFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "regexp-literal-aot",
    source: `
function show(match) {
  if (match === null) return "null";
  let text = "[" + match.index + "|";
  for (let index = 0; index < match.length; index = index + 1) {
    text = text + (match[index] === undefined ? "<u>" : match[index]) + "/";
  }
  text = text + "]";
  if (match.groups !== undefined) {
    text = text + "{";
    for (const key of Object.keys(match.groups)) {
      const value = match.groups[key];
      text = text + key + "=" + (value === undefined ? "<u>" : value) + ",";
    }
    text = text + "}";
  }
  if (match.indices !== undefined) {
    text = text + "#";
    for (let index = 0; index < match.indices.length; index = index + 1) {
      const pair = match.indices[index];
      text = text + (pair === undefined
        ? "<u>"
        : "(" + pair[0] + "," + pair[1] + ")");
    }
  }
  return text;
}

// A literal is an ordinary RegExp object with the intrinsic prototype and
// its own writable, non-enumerable, non-configurable lastIndex.
const plain = /ab/;
console.log(
  "shape",
  plain instanceof RegExp,
  Object.getPrototypeOf(plain) === RegExp.prototype,
  plain.constructor === RegExp,
  Object.keys(plain).length,
);
const lastIndexDescriptor = Object.getOwnPropertyDescriptor(
  plain,
  "lastIndex",
);
console.log(
  "lastIndex descriptor",
  lastIndexDescriptor.value,
  lastIndexDescriptor.writable,
  lastIndexDescriptor.enumerable,
  lastIndexDescriptor.configurable,
);

// Every evaluation of one occurrence allocates a distinct object, and two
// equal occurrences never share one either. Mutable state stays separate
// while the compiled artifact behind them is the same.
function make() {
  return /a/g;
}
const first = make();
const second = make();
const third = /a/g;
first.lastIndex = 7;
console.log(
  "identity",
  first === second,
  first === third,
  second === third,
  first.lastIndex,
  second.lastIndex,
  third.lastIndex,
);
const repeated = [];
for (let round = 0; round < 4; round = round + 1) {
  const scanner = /(a)(b)?/g;
  scanner.exec("zab");
  repeated.push(scanner.lastIndex);
}
let repeatedText = "";
for (let index = 0; index < repeated.length; index = index + 1) {
  repeatedText = repeatedText + repeated[index] + "/";
}
console.log("fresh in a loop", repeatedText);

// The descriptor carries the written text, so source, flags, the
// individual accessors, and toString answer without a pattern parse.
const written = /a\\/b[/]c/gimsuy;
console.log(
  "text",
  written.source,
  written.flags,
  String(written),
  written.hasIndices,
  written.global,
  written.ignoreCase,
  written.multiline,
  written.dotAll,
  written.unicode,
  written.unicodeSets,
  written.sticky,
);
console.log("empty", /(?:)/.source, String(/(?:)/), /\\n/.source);

// A literal and a dynamic pattern over the same source and flags agree.
const patterns = [
  ["a(b)c", ""],
  ["(a|ab)(c|bcd)(d*)", ""],
  ["a*?b", ""],
  ["(z)((a+)?(b+)?(c))*", ""],
  ["(a*)b\\\\1+", ""],
  ["(?=(a+))a*b\\\\1", ""],
  ["(?<=a)b", ""],
  ["(?<!a)b", ""],
  ["^ab$", "m"],
  [".", "s"],
  ["\\\\bfoo\\\\b", ""],
  ["A", "i"],
  ["[a-z]+", "i"],
  ["(?<year>\\\\d{4})-(?<month>\\\\d{2})", ""],
  ["(?<a>x)|(?<a>y)", ""],
  ["a{2,3}", ""],
  ["x", "y"],
];
const inputs = [
  "xabcy",
  "abcd",
  "aaab",
  "zaacbbbcac",
  "baaaac",
  "baaabac",
  "ab",
  "cb",
  "x\\nab\\ny",
  "\\n",
  "a foo b",
  "a",
  "ABC",
  "2026-08",
  "y",
  "aaaa",
  "yx",
];
const literals = [
  /a(b)c/,
  /(a|ab)(c|bcd)(d*)/,
  /a*?b/,
  /(z)((a+)?(b+)?(c))*/,
  /(a*)b\\1+/,
  /(?=(a+))a*b\\1/,
  /(?<=a)b/,
  /(?<!a)b/,
  /^ab$/m,
  /./s,
  /\\bfoo\\b/,
  /A/i,
  /[a-z]+/i,
  /(?<year>\\d{4})-(?<month>\\d{2})/,
  /(?<a>x)|(?<a>y)/,
  /a{2,3}/,
  /x/y,
];
for (let index = 0; index < literals.length; index = index + 1) {
  const literal = literals[index];
  const entry = patterns[index];
  const dynamic = new RegExp(entry[0], entry[1]);
  const input = inputs[index];
  const fromLiteral = show(literal.exec(input));
  const fromDynamic = show(dynamic.exec(input));
  console.log(
    "agree",
    literal.source,
    literal.flags,
    fromLiteral,
    fromLiteral === fromDynamic,
    literal.lastIndex === dynamic.lastIndex,
  );
}

// Behavior only a literal reaches today: a Unicode property escape and an
// ignore-case comparison whose class the ahead-of-time table resolves.
console.log("property", show(/\\p{L}+/u.exec("abc\\u00e9123")));
console.log("property negated", show(/\\P{L}+/u.exec("abc123")));
console.log("script", show(/\\p{Script=Greek}+/u.exec("x\\u03b1\\u03b2y")));
console.log("folded", /\\u00e0/i.test("\\u00c0"), /\\u017f/iu.test("s"));
console.log(
  "folded backreference",
  show(/(\\u00e0)\\1/i.exec("\\u00e0\\u00c0")),
);

// A backreference to a duplicated group name is the one place the
// generated encoding is not one instruction per artifact instruction: it
// writes one per candidate capture, so every later branch target shifts.
const duplicates = [
  /(?:(?<a>x)|(?<a>y))\\k<a>/,
  /(?:(?<a>x)|(?<a>y))\\k<a>b|q/,
  /((?:(?<a>x)|(?<a>y))\\k<a>)+z/,
  /(?:(?<a>x)|(?<a>y)|(?<a>w))\\k<a>(?=!)/,
];
const duplicateInputs = ["xx", "yy", "xy", "xxb", "q", "yyxxz", "ww!"];
for (let index = 0; index < duplicates.length; index = index + 1) {
  let line = "duplicate " + duplicates[index].source;
  for (let inner = 0; inner < duplicateInputs.length; inner = inner + 1) {
    line = line + " " + show(duplicates[index].exec(duplicateInputs[inner]));
  }
  console.log(line);
}

// Match indices, iteration over a global literal, and sticky failure.
console.log("indices", show(/(a)(?<x>b)(c)/d.exec("abc")));
const global = /a/g;
console.log(
  "global walk",
  global.exec("aaa").index,
  global.lastIndex,
  global.exec("aaa").index,
  global.lastIndex,
  show(global.exec("aaa")),
  global.lastIndex,
);
const sticky = /b/y;
sticky.lastIndex = 1;
console.log("sticky", show(sticky.exec("ab")), sticky.lastIndex);
console.log("test", /a/.test("bab"), /z/.test("bab"));
// A set the pattern can never match still has to be addressable.
console.log("empty set", /[^\\s\\S]/.test("a"), show(/x|[^\\s\\S]/.exec("x")));

// Many evaluations of one literal survive forced collection while the
// artifact behind them stays shared.
let retained = [];
for (let round = 0; round < 40; round = round + 1) {
  const scanner = /(a+)(b*)/g;
  const matched = scanner.exec("xaabbxaab");
  retained.push(matched[0] + matched[1] + matched[2] + matched.index);
  retained.push(/z(\\d)/.exec("z" + (round % 10))[1]);
}
console.log("retained", retained.length, retained[0], retained[79]);

/** @param {number} value */
function hinted(value) {
  return value + 1;
}
console.log("hints", hinted(3), hinted("miss"));
`,
  },
];
