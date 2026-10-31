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
console.log("duplicates", separated(1, 2, 3), adjacent(1, 2),
  triple(1, 2, 3));
console.log("names", namedEval(4), namedArguments(5));
console.log("identity", ordinary(1), ordinary("A"));
console.log("function", ordinary instanceof Function,
  ordinary.constructor === Function, truth.constructor === Function,
  empty.constructor === Function, sum instanceof Function);
console.log("results", truth(), empty());
console.log("sums", sum(1, 2, 3), sum("AB", "BA", 1), sum(1, 1, "ABBA"));
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
