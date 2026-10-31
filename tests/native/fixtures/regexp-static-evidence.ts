import type { Fixture } from "../fixture.ts";

// Each pair fixes the literal at build time. The accompanying grammar suite
// compiles the exact text emitted by .source, so matching is not inferred
// from spelling alone. No eval or Function is used by the native program.
export const regexpStaticEvidenceFixtures: readonly Fixture[] = [
  {
    name: "regexp-static-evidence",
    source: String.raw`
function check(value) {
  if (!value) throw new Error("static regexp evidence failed");
}
function same(actual, expected) {
  check(Object.is(actual, expected));
}
let mutationsRejected = 0;
const mutations = [
  [1, "1"], [undefined, "undefined"], [42, "42"],
  [true, "true"], [false, "false"], [0, -0],
];
for (let i = 0; i < mutations.length; i++) {
  try { same(mutations[i][0], mutations[i][1]); }
  catch (error) { mutationsRejected = mutationsRejected + 1; }
}
same(mutationsRejected, mutations.length);
same(NaN, NaN);
let rejected = false;
try { new RegExp("", "migr"); }
catch (error) { rejected = error instanceof SyntaxError; }
same(rejected, true);
const math = new RegExp(Math, "g");
same(math.ignoreCase, false);
same(math.multiline, false);
same(math.global, true);
same(math.lastIndex, 0);
check(typeof math.source !== "undefined");
const pairs = [
  [new RegExp(""), /(?:)/, [""], "(?:)"],
  [new RegExp("\n"), /\n/, ["\n", "_\n_", "\\n", "\r", "n"], "\\n"],
  [new RegExp("/"), /\//, ["/", "_/_", "\\"], "\\/"],
  [/\ud834\udf06/u, /\ud834\udf06/u, ["\ud834\udf06", "𝌆"],
    "\\ud834\\udf06"],
  [/\u{1d306}/u, /\u{1d306}/u, ["\ud834\udf06", "𝌆"], "\\u{1d306}"],
  [/ab{2,4}c$/, /ab{2,4}c$/,
    ["abbc", "abbbc", "abbbbc", "xabbc", "xabbbc", "xabbbbc",
     "ac", "abc", "abbcx", "bbc", "abb", "abbbbbc"], "ab{2,4}c$"],
];
const expected = [
  [true], [true, true, false, false, false], [true, true, false],
  [true, true], [true, true],
  [true, true, true, true, true, true,
   false, false, false, false, false, false],
];
for (let i = 0; i < pairs.length; i++) {
  const original = pairs[i][0];
  const literal = pairs[i][1];
  const inputs = pairs[i][2];
  same(original.source, pairs[i][3]);
  same(literal.source, original.source);
  same(literal.flags, original.flags);
  for (let j = 0; j < inputs.length; j++) {
    same(original.test(inputs[j]), expected[i][j]);
    same(literal.test(inputs[j]), expected[i][j]);
  }
}
console.log("regexp static evidence passed");
`,
  },
];
