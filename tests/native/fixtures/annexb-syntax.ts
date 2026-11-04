import type { Fixture } from "../fixture.ts";

/*
 * Fixed native fixtures of the annexb-syntax unit, run by
 * tests/annexb-syntax-native.test.ts.
 *
 * The two pattern fixtures share one table of Annex B pattern texts: the
 * literal fixture compiles each as a regular expression literal, so the
 * build-time parser and the generated matcher data decide it, and the
 * dynamic fixture passes the same text to the RegExp constructor and to
 * String methods, so the runtime's own validator and program compiler
 * decide it. Each prints the match, `source`, and split results rather
 * than asserting them, so the reference hosts decide every value. The
 * comment fixture runs as a Script, the only goal with HTML-like
 * comments.
 */

// One Annex B pattern per production of the edition's Regular
// Expressions Patterns section, with an input it should match.
const annexBPatterns: readonly (readonly [string, string, string])[] = [
  ["\\a\\_\\$\\é\\p{L}", "", "a_$ép{L}"],
  ["\\01\\08\\477", "", "\x01\x008'7"],
  ["(a)\\1\\2\\8\\10", "", "aa\x028\b"],
  ["\\c1[\\c1\\c_][\\c]", "", "\\c1\x11c"],
  ["[\\\\c-f]+", "", "x\\cdef-"],
  ["\\x\\x4\\u\\u12\\u{2}", "", "xx4uu12uu"],
  ["\\k<x>\\k", "", "k<x>k"],
  ["a{,2}}]{", "", "a{,2}}]{"],
  ["x{1,a}", "", "x{1,a}"],
  ["[\\d-a]+", "", "x1-a2"],
  ["[a-\\D]+", "", "1a-b"],
  ["[\\s-\\d]+", "", "x 1-"],
  // A class escape range takes its dash and second atom, so neither
  // starts another range.
  ["[\\d--a]+", "", "/-a5"],
  ["[\\d-a-z]+", "", "b5a-z"],
  ["[\\d-z-a]+", "", "b-za5"],
  ["[a-\\d-z]+", "", "q-za5"],
  ["[\\12-\\14]+", "", "line1\n\n\v\fx"],
  ["[\\B\\p\\k\\8]+", "", "Bpk8"],
  ["(?=(a))*a", "", "a"],
  ["(?!b){2}a", "", "ba"],
  ["(?=(\\w))?\\w", "", "ab"],
  ["(?=a)+?a", "", "ba"],
  ["\\k<a>\\1", "", "k<a>\x01"],
  ["\\1(b)\\k<a>", "", "bk<a>"],
  ["\\k<a>(?<=>)a", "", "k<a>a"],
  ["\\k", "i", "K"],
  ["\\a[\\c1]", "i", "A\x11"],
  ["\\x", "g", "axbxc"],
];

// Text that stays an early error under Annex B, and Annex B text under
// `u`, where the edition never admitted it.
const earlyErrors: readonly (readonly [string, string])[] = [
  ["{1}", ""],
  ["a{2,1}", ""],
  ["(?<=a)*", ""],
  ["\\b+", ""],
  ["(?<a>.)\\k", ""],
  ["(?<a>.)[\\k]", ""],
  ["(?<a>x)\\k<b>", ""],
  ["[b-a]", ""],
  ["a)", ""],
  ["\\", ""],
  ["\\c", "u"],
  ["\\a", "u"],
  ["]", "u"],
  ["(?=a)*", "u"],
  ["[\\d-a]", "u"],
  ["\\01", "u"],
];

const patternHelpers = `
function show(pattern, input) {
  var match = pattern.exec(input);
  if (match === null) return "null";
  var parts = [];
  for (var index = 0; index < match.length; index += 1) {
    var part = match[index];
    parts.push(part === undefined ? "<u>" : JSON.stringify(part));
  }
  return parts.join(",") + "@" + match.index;
}
`;

/** The source text of one regular expression literal. */
function literal(pattern: string, flags: string): string {
  return `/${pattern}/${flags}`;
}

const literalSource = `${patternHelpers}
var cases = [
${annexBPatterns
  .map(
    ([pattern, flags, input]) =>
      `  [${literal(pattern, flags)}, ${JSON.stringify(input)}],`,
  )
  .join("\n")}
];
for (var index = 0; index < cases.length; index += 1) {
  var pattern = cases[index][0];
  console.log(
    "literal",
    JSON.stringify(pattern.source),
    pattern.flags,
    show(pattern, cases[index][1]),
    pattern.lastIndex,
  );
}
// The four patterns of String/prototype/split/separator-regexp.js that
// only Annex B admits.
console.log("split", JSON.stringify("x".split(/\\XA0/)));
console.log("split", JSON.stringify("aXA0b".split(/\\XA0/)));
console.log("split", JSON.stringify("axb".split(/\\x/)));
console.log("split", JSON.stringify("aXb".split(/\\X/)));
console.log("split", JSON.stringify("ak<x>b".split(/\\k<x>/)));
console.log("replace", "axbxc".replace(/\\x/g, "-"));
console.log("match", JSON.stringify("k<a>k".match(/\\k/g)));
`;

const dynamicSource = `${patternHelpers}
var cases = ${JSON.stringify(annexBPatterns)};
for (var index = 0; index < cases.length; index += 1) {
  var pattern = new RegExp(cases[index][0], cases[index][1]);
  console.log(
    "dynamic",
    JSON.stringify(pattern.source),
    pattern.flags,
    show(pattern, cases[index][2]),
    String(pattern) === "/" + pattern.source + "/" + pattern.flags,
  );
}
var errors = ${JSON.stringify(earlyErrors)};
for (var index = 0; index < errors.length; index += 1) {
  try {
    new RegExp(errors[index][0], errors[index][1]);
    console.log("error", JSON.stringify(errors[index][0]), "accepted");
  } catch (error) {
    console.log(
      "error",
      JSON.stringify(errors[index][0]),
      errors[index][1],
      error instanceof SyntaxError,
    );
  }
}
// RegExpCreate reaches the runtime pattern compiler from a String method.
console.log("string", JSON.stringify("axb".match("\\\\x")));
console.log("string", "a\\\\cb".search("\\\\c"));
console.log("string", JSON.stringify("k<x>".match("\\\\k<x>")));
console.log("string", JSON.stringify(Array.from("a]b]".matchAll("]"), String)));
console.log("split", JSON.stringify("aXA0b".split(new RegExp("\\\\XA0"))));
// One reader sees two shapes: a RegExp first and a plain object last, so
// the specialized read misses its guard and takes the generic path.
function sourceOf(value) {
  return value.source;
}
var readers = [new RegExp("\\\\c"), /\\k/, { source: "plain" }];
var read = [];
for (var index = 0; index < readers.length; index += 1) {
  read.push(sourceOf(readers[index]));
}
console.log("guard", JSON.stringify(read));
`;

/*
 * The HTML-like comments of Annex B's Comments section. `<!--` starts a
 * single-line comment anywhere. `-->` does at the start of the source,
 * after a line terminator with only white space and comments before it,
 * and after a multi-line comment that holds a line terminator, U+2028 and
 * U+2029 included. Elsewhere `-->` is a decrement followed by a greater
 * than comparison.
 */
const commentSource = [
  "--> the first line is a comment",
  "var counter = 0;",
  "counter += 1; <!-- the rest of this line is a comment",
  "<!-- counter = 100;",
  "-->",
  "counter += 1;",
  "   --> counter = 100;",
  "counter += 1;",
  "/* delimited */ /**/ --> counter = 100;",
  "counter += 1;",
  "/*",
  "*/ --> counter = 100;",
  "counter += 1;",
  "0/*",
  "*/--> counter = 100;",
  "counter += 1;",
  "/*\u2028*/--> counter = 100;",
  "counter += 1;",
  "counter \u2029--> counter = 100;",
  "counter += 1;",
  "var arrow = 3;",
  "var compared = arrow-->2;",
  "console.log('comments', counter, compared, arrow);",
  "var foo = [23]",
  "-->[0];",
  "console.log('asi', foo[0], foo.length);",
].join("\n");

export const annexBSyntaxFixtures: readonly Fixture[] = [
  { name: "annexb-regexp-literals", source: literalSource },
  { name: "annexb-regexp-dynamic", source: dynamicSource },
  { name: "annexb-html-comments", source: commentSource },
];

/** The comment fixture's Annex B text, which a module must reject. */
export const moduleRejectedComments: readonly string[] = [
  "<!-- comment\nexport {};",
  "-->\nexport {};",
  "/*\n*/ -->\nexport {};",
];
