import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printMir } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

/** One HasCallInTailPosition case and the tail calls it must lower. */
interface TailCase {
  readonly name: string;
  readonly source: string;
  /** Printed details of every `call tail` the program lowers, in order. */
  readonly tails: readonly string[];
}

/** Bindings every case reads, so no case depends on a missing global. */
const prelude =
  "var g = function () {}, h = g, x = 0, k = 'm', xs = [];\n" +
  "var o = { m: g, t: g };\n" +
  "class B { m() {} }\n";

function tailCalls(source: string): readonly string[] {
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "tail-calls.js",
  });
  assert.deepEqual(result.diagnostics, [], source);
  assert.ok(result.mir != null);
  return [
    ...printMir(result.mir).matchAll(/= call (tail (?:this=%b\d+ )?[^@]*)@/gu),
  ].map((match) => match[1]!.replace(/(?: %\d+,?)+\s*$/u, "").trim());
}

const dynamic = "tail dynamic function value";
const optional = "tail optional chain function value";
const derived = /^tail this=%b\d+ dynamic function value/u;

// The statement and expression rules of ECMA-262 15.10.2, each in the
// position that makes its call a tail call.
const positive: readonly TailCase[] = [
  { name: "return", source: "function f() { return g(); }", tails: [dynamic] },
  {
    name: "block and statement list",
    source: "function f() { g(); { h(); return g(); } }",
    tails: [dynamic],
  },
  {
    name: "if and else arms",
    source: "function f() { if (x) return g(); else return h(); }",
    tails: [dynamic, dynamic],
  },
  {
    name: "do-while body",
    source: "function f() { do { return g(); } while (x); }",
    tails: [dynamic],
  },
  {
    name: "while body",
    source: "function f() { while (x) return g(); }",
    tails: [dynamic],
  },
  {
    name: "for bodies",
    source:
      "function f() { for (;;) return g(); }\n" +
      "function f2() { for (var i = 0; i < 1; i++) return g(); }\n" +
      "function f3() { for (let i = 0; i < 1; i++) return g(); }",
    tails: [dynamic, dynamic, dynamic],
  },
  {
    name: "for-in body",
    source: "function f() { for (const key in o) return g(key); }",
    tails: [dynamic],
  },
  {
    name: "labeled statement",
    source: "function f() { label: { return g(); } }",
    tails: [dynamic],
  },
  {
    name: "switch case and default clauses",
    source:
      "function f() { switch (x) { case 1: return g(); default: " +
      "return h(); case 2: return g(); } }",
    tails: [dynamic, dynamic, dynamic],
  },
  {
    name: "catch of a try-catch",
    source: "function f() { try { h(); } catch (e) { return g(); } }",
    tails: [dynamic],
  },
  {
    name: "finally of a try-finally",
    source: "function f() { try { h(); } finally { return g(); } }",
    tails: [dynamic],
  },
  {
    name: "only the finally of a try-catch-finally",
    source:
      "function f() { try { return h(); } catch (e) { return h(); } " +
      "finally { return g(); } }",
    tails: [dynamic],
  },
  {
    name: "a try statement nested in a catch",
    source:
      "function f() { try { h(); } catch (e) { try { h(); } " +
      "finally { return g(); } } }",
    tails: [dynamic],
  },
  {
    name: "comma operator",
    source: "function f() { return (h(), g()); }",
    tails: [dynamic],
  },
  {
    name: "conditional arms",
    source: "function f() { return x ? g() : h(); }",
    tails: [dynamic, dynamic],
  },
  {
    name: "nested conditional and logical operands",
    source: "function f() { return x ? (x && g()) : (x ?? (x || h())); }",
    tails: [dynamic, dynamic],
  },
  {
    name: "logical and coalesce right operands",
    source:
      "function f() { return x && g(); }\n" +
      "function f2() { return x || g(); }\n" +
      "function f3() { return x ?? g(); }",
    tails: [dynamic, dynamic, dynamic],
  },
  {
    name: "parenthesized call",
    source: "function f() { return (g()); }",
    tails: [dynamic],
  },
  {
    name: "member and computed member calls",
    source: "function f() { return o.m(); }\nfunction f2() { return o[k](); }",
    tails: [dynamic, dynamic],
  },
  {
    name: "optional calls",
    source:
      "function f() { return o?.m(); }\n" +
      "function f2() { return g?.(); }\n" +
      "function f3() { return o?.m.call(o); }\n" +
      "function f4() { return (o?.m)(); }",
    tails: [optional, optional, optional, optional],
  },
  {
    name: "tagged templates",
    source:
      "function f() { return g`a${x}b`; }\n" +
      "function f2() { return o.t`a`; }\n" +
      "function f3() { return h()`a`; }",
    tails: [dynamic, dynamic, dynamic],
  },
  {
    name: "built-in PrepareForTailCall callers",
    source:
      "function f() { return g.call(null, 1); }\n" +
      "function f2() { return g.apply(null, []); }\n" +
      "function f3() { return Reflect.apply(g, null, []); }\n" +
      "function f4() { return Promise.resolve(1); }",
    tails: [dynamic, dynamic, dynamic, dynamic],
  },
  {
    name: "spread arguments",
    source: "function f() { return g(...xs); }",
    tails: [dynamic],
  },
  {
    name: "arrow concise and block bodies",
    source: "var f = () => g(); var f2 = () => { return g(); };",
    tails: [dynamic, dynamic],
  },
  {
    name: "arrow body inside a generator",
    source: "function* outer() { const f = () => g(); yield f; }",
    tails: [dynamic],
  },
  {
    name: "methods and accessors",
    source:
      "var object = { f() { return g(); }, get p() { return g(); }, " +
      "set p(value) { return g(value); } };\n" +
      "class C { f() { return g(); } static s() { return g(); } }",
    tails: [dynamic, dynamic, dynamic, dynamic, dynamic],
  },
  {
    name: "private and super method calls",
    source:
      "class C extends B { #m() {} f() { return this.#m(); } " +
      "s() { return super.m(); } }",
    tails: [dynamic, dynamic],
  },
  {
    name: "clearTimeout, including absent, extra, and spread arguments",
    source:
      "function f() { return clearTimeout(x); }\n" +
      "function f2() { return clearTimeout(); }\n" +
      "function f3() { return clearTimeout(x, g()); }\n" +
      "function f4() { return clearTimeout(...xs); }",
    tails: Array.from({ length: 4 }, () => "tail clearTimeout"),
  },
  {
    name: "host intrinsic calls with user code",
    source:
      "function f() { return console.log(x); }\n" +
      "function f2() { return setTimeout(g, 0); }",
    tails: ["tail console_log", "tail setTimeout"],
  },
];

for (const testCase of positive) {
  test(`lowers a strict tail call: ${testCase.name}`, () => {
    assert.deepEqual(
      tailCalls(`"use strict";\n${prelude}${testCase.source}\n`),
      testCase.tails,
    );
  });
  // IsInTailPosition step 1: only strict code has tail calls. A class
  // body is always strict, so those cases have no non-strict form.
  if (testCase.source.includes("class ")) continue;
  test(`keeps a non-strict call ordinary: ${testCase.name}`, () => {
    assert.deepEqual(tailCalls(`${prelude}${testCase.source}\n`), []);
  });
}

test("a function-level directive admits tail calls in sloppy code", () => {
  assert.deepEqual(
    tailCalls(`${prelude}function f() { "use strict"; return g(); }\n`),
    [dynamic],
  );
});

test("constructor tail calls carry the derived this binding", () => {
  const tails = tailCalls(
    `"use strict";\n${prelude}` +
      "class C { constructor() { return g(); } }\n" +
      "class D extends B { constructor() { super(); return g(); } }\n" +
      "function F() { return g(); }\n",
  );
  // Hoisted declarations take earlier function identities, so only the
  // multiset of lowered calls is fixed.
  assert.equal(tails.length, 3);
  assert.equal(tails.filter((tail) => derived.test(tail)).length, 1);
  assert.equal(tails.filter((tail) => tail === dynamic).length, 2);
});

// Calls the rules leave out of tail position: no IsInTailPosition body,
// a body kind it excludes, or a production that returns false.
const negative: readonly TailCase[] = [
  {
    name: "generator, async, and async generator bodies",
    source:
      "function* f() { return g(); }\n" +
      "async function f2() { return g(); }\n" +
      "async function* f3() { return g(); }\n" +
      "var f4 = async () => g(); var f5 = async () => { return g(); };",
    tails: [],
  },
  {
    name: "try blocks",
    source:
      "function f() { try { return g(); } catch (e) {} }\n" +
      "function f2() { try { return g(); } finally {} }",
    tails: [],
  },
  {
    name: "a catch with a finally",
    source: "function f() { try {} catch (e) { return g(); } finally {} }",
    tails: [],
  },
  {
    name: "finally and catch nested in a try block",
    source:
      "function f() { try { try {} finally { return g(); } } finally {} }\n" +
      "function f2() { try { try {} catch (e) { return g(); } } " +
      "catch (e) {} }\n" +
      "function f3() { try {} catch (e) { try {} finally { return g(); } } " +
      "finally {} }",
    tails: [],
  },
  {
    name: "for-of bodies",
    source:
      "function f() { for (const value of xs) return g(value); }\n" +
      "function f2() { for (const value of xs) { if (value) { " +
      "return g(); } } }\n" +
      "function f3() { for (const value of xs) { try {} finally { " +
      "return g(); } } }",
    tails: [],
  },
  {
    name: "operands with work after the call",
    source:
      "function f() { return g() + 1; }\n" +
      "function f2() { return !g(); }\n" +
      "function f3() { return void g(); }\n" +
      "function f4() { return typeof g(); }\n" +
      "function f5() { return g() || x; }\n" +
      "function f6() { return g() ?? x; }\n" +
      "function f7() { return x ? 1 : g() + 1; }\n" +
      "function f8() { return (g(), x); }\n" +
      "function f9() { return [g()]; }\n" +
      "function f10() { return (x = g()); }\n" +
      "function f11() { return h(g()); }\n" +
      "function f12() { return o?.m().t; }",
    // Only the outer call of f11 is in tail position.
    tails: [dynamic],
  },
  {
    name: "constructions and super calls",
    source:
      "function f() { return new g(); }\n" +
      "class D extends B { constructor() { return super(); } }",
    tails: [],
  },
  {
    name: "statements other than return",
    source: "function f() { g(); }\nfunction f2() { var value = g(); }",
    tails: [],
  },
  {
    name: "field initializers, static blocks, and parameter defaults",
    source:
      "class C { field = g(); static other = g(); static { g(); } }\n" +
      "function f(value = g()) { return value; }",
    tails: [],
  },
];

for (const testCase of negative) {
  test(`keeps calls out of tail position: ${testCase.name}`, () => {
    assert.deepEqual(
      tailCalls(`"use strict";\n${prelude}${testCase.source}\n`),
      testCase.tails,
    );
  });
}
