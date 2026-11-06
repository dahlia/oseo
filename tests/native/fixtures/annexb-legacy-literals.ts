import type { Fixture } from "../fixture.ts";

/*
 * The legacy numeric and string literals that the edition's lexical
 * grammar keeps for sloppy Script code: LegacyOctalIntegerLiteral,
 * NonOctalDecimalIntegerLiteral, LegacyOctalEscapeSequence, and
 * NonOctalDecimalEscapeSequence.
 *
 * The native fixture prints each value, a string as its length and code
 * units. Its first lines come from a hand-written table with the expected
 * text beside each spelling, so a mistake shared by both reference hosts
 * and the compiler still fails. The lines after them cover the whole escape
 * and integer domains and leave every value to the reference hosts.
 *
 * Every entry below is source text, so `\\1` is one backslash in the
 * compiled literal.
 */

/** A source expression and the line the fixture must print for it. */
const fixedLines: readonly (readonly [string, string])[] = [
  // LegacyOctalIntegerLiteral.
  ["00", "0"],
  ["000", "0"],
  ["07", "7"],
  ["010", "8"],
  ["0377", "255"],
  ["0777", "511"],
  ["-010", "-8"],
  ["010 + 1", "9"],
  ["typeof 010", "number"],
  ["07.toString()", "7"],
  ['010["toString"](2)', "1000"],
  ["01777777777777777777777", "18446744073709552000"],
  [`0${"7".repeat(400)}`, "Infinity"],
  // NonOctalDecimalIntegerLiteral keeps the decimal literal's tail.
  ["08", "8"],
  ["09", "9"],
  ["019", "19"],
  ["0189", "189"],
  ["0789", "789"],
  ["08.", "8"],
  ["08.5", "8.5"],
  ["09.5", "9.5"],
  ["08e1", "80"],
  ["09E-1", "0.9"],
  ["08.5e1", "85"],
  ["08..toString()", "8"],
  ["09 .toString()", "9"],
  ["09007199254740993", "9007199254740992"],
  [`0${"9".repeat(400)}`, "Infinity"],
  // NonOctalDecimalEscapeSequence.
  ['"\\8"', "1:38"],
  ['"\\9"', "1:39"],
  ['"a\\8b\\9c"', "5:61,38,62,39,63"],
  // LegacyOctalEscapeSequence, whose longest match stops at \377.
  ['"\\0"', "1:0"],
  ['"\\0a"', "2:0,61"],
  ['"\\00"', "1:0"],
  ['"\\000"', "1:0"],
  ['"\\0000"', "2:0,30"],
  ['"\\08"', "2:0,38"],
  ['"\\09"', "2:0,39"],
  ['"\\1"', "1:1"],
  ['"\\7"', "1:7"],
  ['"\\18"', "2:1,38"],
  ['"\\19"', "2:1,39"],
  ['"\\101"', "1:41"],
  ["'\\101'", "1:41"],
  ['"\\377"', "1:ff"],
  ['"\\3777"', "2:ff,37"],
  ['"\\400"', "2:20,30"],
  ['"\\477"', "2:27,37"],
  ['"\\1\\2\\3"', "3:1,2,3"],
  ['"\\u0041\\101\\x41"', "3:41,41,41"],
  // The same grammar in the positions that keep a literal's value.
  ['({ 010: "a" })[8]', "a"],
  ['({ 08: "a" })[8]', "a"],
  ['({ 09.5: "a" })["9.5"]', "a"],
  ['({ "\\101": "a" }).A', "a"],
  ['({ get 010() { return "a"; } })[8]', "a"],
  ['Object.keys({ 011: 1, 08: 2, "\\102": 3 }).join()', "8,9,B"],
  ['((a = 010, b = "\\101") => a + b)()', "8A"],
  // A tagged template keeps these escapes in its raw strings alone.
  ["tagged`\\0`", "cooked:\\0"],
  ["tagged`\\00`", "undefined:\\00"],
  ["tagged`\\01`", "undefined:\\01"],
  ["tagged`\\08`", "undefined:\\08"],
  ["tagged`\\1`", "undefined:\\1"],
  ["tagged`\\377`", "undefined:\\377"],
  ["tagged`\\8`", "undefined:\\8"],
  ["tagged`\\9`", "undefined:\\9"],
  // Strictness follows the directive, not the literals around it.
  ["legacyDirectives()", "false"],
  ["escapedUseStrict()", "8:false"],
  ["strictNeighbor()", "1:0:8:true"],
];

const octal = (value: number, width: number): string =>
  value.toString(8).padStart(width, "0");

const range = (end: number): readonly number[] =>
  Array.from({ length: end }, (_, value) => value);

/*
 * Every three-digit spelling, which reaches past \377 into the two-digit
 * escape followed by a digit, and every shorter spelling cut off by each
 * non-octal digit.
 */
const domainStrings: readonly string[] = [
  ...range(0o1000).map((value) => `"\\${octal(value, 3)}"`),
  ...range(0o100).flatMap((value) =>
    ["8", "9"].map((next) => `"\\${octal(value, 2)}${next}"`),
  ),
  ...range(0o10).flatMap((value) =>
    ["8", "9"].map((next) => `"\\${octal(value, 1)}${next}"`),
  ),
];

/** The value domain of the escapes, as integers with and without padding. */
const domainIntegers: readonly string[] = range(0o400).flatMap((value) => [
  `0${value.toString(8)}`,
  `0${octal(value, 3)}`,
]);

const fixtureSource = `"use\\040strict";
"\\01";
"\\8";
function units(value) {
  if (typeof value !== "string") return String(value);
  var codes = [];
  for (var index = 0; index < value.length; index += 1) {
    codes.push(value.charCodeAt(index).toString(16));
  }
  return value.length + ":" + codes.join();
}
function tagged(strings) {
  var cooked = strings[0];
  return (cooked === undefined ? "undefined" : "cooked") + ":" + strings.raw[0];
}
function legacyDirectives() {
  "\\01";
  "\\8";
  return this === undefined;
}
function escapedUseStrict() {
  "use\\040strict";
  return 010 + ":" + (this === undefined);
}
function strictNeighbor() {
  "use strict";
  return units("\\0") + ":" + 0o10 + ":" + (this === undefined);
}
${fixedLines
  .map(([text]) => `console.log(${renderedExpression(text)});`)
  .join("\n")}
var strings = [
${domainStrings.join(",\n")}
];
for (var index = 0; index < strings.length; index += 1) {
  console.log(units(strings[index]));
}
var integers = [${domainIntegers.join(", ")}];
console.log(integers.join());
`;

/** A string literal's code units; every other expression's plain value. */
function renderedExpression(text: string): string {
  return /^["']/u.test(text) ? `units(${text})` : `String(${text})`;
}

export const annexBLegacyLiteralFixtures: readonly Fixture[] = [
  {
    globalScriptReference: true,
    name: "annexb-legacy-literals",
    source: fixtureSource,
  },
];

/** The lines the fixture prints first, ahead of the host-decided domains. */
export const annexBLegacyLiteralFixedOutput: string = fixedLines
  .map(([, line]) => `${line}\n`)
  .join("");

/** A source text and, when rejected, the literal the diagnostic points at. */
export interface LegacyLiteralCase {
  readonly at: string;
  readonly source: string;
}

const literalCase = (at: string, source = `${at};`): LegacyLiteralCase => ({
  at,
  source,
});

/** Text sloppy Script admits and strict Script and Module code reject. */
export const sloppyScriptOnly: readonly LegacyLiteralCase[] = [
  ...[
    "00",
    "07",
    "010",
    "0377",
    "08",
    "09",
    "019",
    "08.5",
    "08e1",
    '"\\00"',
    '"\\08"',
    '"\\1"',
    '"\\7"',
    '"\\18"',
    '"\\101"',
    '"\\377"',
    '"\\400"',
    '"\\8"',
    '"\\9"',
  ].map((text) => literalCase(text)),
  literalCase("010", "({ 010: 1 });"),
  literalCase("08", "({ 08: 1 });"),
  literalCase('"\\101"', '({ "\\101": 1 });'),
  literalCase('"use\\040strict"; 010'),
];

/** Text no goal admits, because strictness or the grammar rules it out. */
export const rejectedInEveryGoal: readonly LegacyLiteralCase[] = [
  // A directive makes its function strict, including an earlier directive
  // and code that follows.
  literalCase("010", 'function f() { "use strict"; return 010; }'),
  literalCase("08", 'function f() { "use strict"; return 08; }'),
  literalCase('"\\01"', 'function f() { "use strict"; return "\\01"; }'),
  literalCase('"\\8"', 'function f() { "use strict"; return "\\8"; }'),
  literalCase('"\\01"', 'function f() { "\\01"; "use strict"; }'),
  literalCase('"\\9"', 'function f() { "\\9"; "use strict"; }'),
  literalCase('"\\01"', '"\\01"; "use strict";'),
  literalCase('"\\8"', '"\\8"; "use strict";'),
  // A class body is strict.
  literalCase("010", "class C { m() { return 010; } }"),
  literalCase("08", "class C { m() { return 08; } }"),
  literalCase('"\\1"', 'class C { m() { return "\\1"; } }'),
  literalCase('"\\9"', 'class C { m() { return "\\9"; } }'),
  literalCase('"\\07"', 'class C { static x = "\\07"; }'),
  // An untagged template admits none of these escapes in any mode.
  ...[
    "`\\00`",
    "`\\01`",
    "`\\08`",
    "`\\1`",
    "`\\7`",
    "`\\377`",
    "`\\8`",
    "`\\9`",
  ].map((text) => literalCase(text)),
  literalCase("`${1}\\1`"),
  literalCase("`\\1${1}`"),
  // Neither legacy integer form continues as a BigInt, a separator, a
  // fraction after octal digits, or a member name after a decimal point.
  ...["010n", "08n", "07_1", "08_1", "0_7", "07.5", "07..toString()"].map(
    (text) => literalCase(text),
  ),
  literalCase("08.toString", "08.toString();"),
];

/** Neighboring forms the core grammar admits, so every goal accepts them. */
export const acceptedInEveryGoal: readonly string[] = [
  "0;",
  "0o10;",
  "0b11;",
  "0x1f;",
  '"\\0";',
  '"\\0a";',
  "`\\0`;",
  "(s => s)`\\01`;",
  "(s => s)`\\8`;",
  'function f() { "use strict"; return "\\0"; }',
];
