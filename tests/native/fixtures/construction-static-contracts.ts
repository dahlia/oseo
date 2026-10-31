import type { Fixture } from "../fixture.ts";

/** Ordinary grammar/results; no constructor ordering or subclass claim. */
export const constructionStaticFixture: Fixture = {
  name: "construction-static-contracts",
  nonStrictScript: true,
  source: `
function separated(a, b, a) { return a; }
function adjacent(a, a) { return a; }
function triple(a, a, a) { return a; }
function namedEval(eval) { return eval; }
function namedArguments(arguments) { return arguments; }
function ordinary() { return arguments[0]; }
function truth() { return true; }
function empty() {}
function sum(arg1, arg2, arg3) { return arg1 + arg2 + arg3; }
// Object.is checks primitive type/value before console formatting loses it.
function sameValue(actual, expected) {
  if (!Object.is(actual, expected)) {
    throw new Error("construction result mismatch");
  }
  return actual;
}
console.log("duplicates", sameValue(separated(1, 2, 3), 3),
  sameValue(adjacent(1, 2), 2), sameValue(triple(1, 2, 3), 3));
console.log("names", sameValue(namedEval(4), 4),
  sameValue(namedArguments(5), 5));
console.log("identity", sameValue(ordinary(1), 1),
  sameValue(ordinary("A"), "A"));
console.log("function", sameValue(ordinary instanceof Function, true),
  sameValue(ordinary.constructor === Function, true),
  sameValue(truth.constructor === Function, true),
  sameValue(empty.constructor === Function, true),
  sameValue(sum instanceof Function, true));
console.log("results", sameValue(truth(), true),
  sameValue(empty(), undefined));
console.log("sums", sameValue(sum(1, 2, 3), 6),
  sameValue(sum("AB", "BA", 1), "ABBA1"),
  sameValue(sum(1, 1, "ABBA"), "2ABBA"));
`,
};

/** ECMA-262 ordinary bindings, arguments and left-associative addition. */
export const constructionStaticExpected: string = [
  "duplicates 3 2 3",
  "names 4 5",
  "identity 1 A",
  "function true true true true true",
  "results true undefined",
  "sums 6 ABBA1 2ABBA",
  "",
].join("\n");
