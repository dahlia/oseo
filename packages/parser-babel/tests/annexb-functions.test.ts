import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printHir } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

/*
 * Frontend and HIR shape of the Annex B function declaration and
 * statement forms. Native behavior is covered by
 * tests/annexb-function-declarations-native.test.ts and the property
 * suite; these tests pin which declarations get a var-scoped copy and
 * which forms stay early errors.
 */

function hir(source: string): string {
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "annexb-functions.js",
  });
  assert.deepEqual(result.diagnostics, [], source);
  assert.ok(result.hir != null, source);
  return printHir(result.hir);
}

function rejected(source: string): string {
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "annexb-functions.js",
  });
  assert.equal(result.mir, undefined, source);
  assert.ok(result.diagnostics.length > 0, source);
  return result.diagnostics.map((diagnostic) => diagnostic.message).join("\n");
}

/** The number of B.3.2 copies of `name` in printed HIR. */
function copies(text: string, name: string): number {
  return (
    text.match(new RegExp(`%b\\d+ ${name} = %b\\d+\\(${name}\\)`, "gu"))
      ?.length ?? 0
  );
}

test("copies a qualifying block function to its var binding", () => {
  const text = hir("function outer() { { function f() {} } return f; }");
  assert.match(text, /let %b\d+ f = undefined/u);
  assert.equal(copies(text, "f"), 1);
});

test("copies if-clause functions as if each were in a Block", () => {
  const text = hir(
    "function outer(x) {\n" +
      "  if (x) function a() {} else function b() {}\n" +
      "  if (x) ; else function c() {}\n" +
      "  return [a, b, c];\n" +
      "}\n",
  );
  for (const name of ["a", "b", "c"]) assert.equal(copies(text, name), 1);
});

test("copies switch clause functions where the clause runs", () => {
  const text = hir(
    "function outer(x) {\n" +
      "  switch (x) { case 1: function a() {} default: function b() {} }\n" +
      "  return [a, b];\n" +
      "}\n",
  );
  assert.equal(copies(text, "a"), 1);
  assert.equal(copies(text, "b"), 1);
});

for (const [name, source] of [
  ["a parameter", "function outer(f) { { function f() {} } }"],
  ["a default parameter", "function outer(f = 1) { { function f() {} } }"],
  ["a top-level let", "function outer() { let f; { function f() {} } }"],
  [
    "a let in an enclosing block",
    "function outer() { { let f; { function f() {} } } }",
  ],
  [
    "a for-let head",
    "function outer() { for (let f; ;) { function f() {} break; } }",
  ],
  [
    "a for-of let head",
    "function outer() { for (let f of []) { function f() {} } }",
  ],
  [
    "a destructured catch parameter",
    "function outer() { try {} catch ({ f }) { { function f() {} } } }",
  ],
  [
    "a second declaration in the same Block",
    "function outer() { { function f() {} function f() {} } }",
  ],
  [
    "the implicit arguments object",
    "function outer() { { function arguments() {} } }",
  ],
] as const) {
  test(`skips the copy for ${name}`, () => {
    assert.equal(
      copies(hir(source), "f") + copies(hir(source), "arguments"),
      0,
    );
  });
}

for (const [name, source] of [
  ["a generator", "function outer() { { function* f() {} } }"],
  ["an async function", "function outer() { { async function f() {} } }"],
  ["a labelled function", "function outer() { { l: function f() {} } }"],
  ["strict code", '"use strict"; function outer() { { function f() {} } }'],
  [
    "a strict function body",
    'function outer() { "use strict"; { function f() {} } }',
  ],
] as const) {
  test(`never copies ${name}`, () => {
    const text = hir(source);
    assert.equal(copies(text, "f"), 0);
    assert.doesNotMatch(text, /let %b\d+ f = undefined/u);
  });
}

test("copies only the outer of two nested block functions", () => {
  const text = hir(
    "function outer() { { function f() {} { function f() {} } } }",
  );
  assert.equal(copies(text, "f"), 1);
});

test("copies past a simple catch parameter of the same name", () => {
  const text = hir(
    "function outer() { try {} catch (f) { { function f() {} } } return f; }",
  );
  assert.match(text, /let %b\d+ f = undefined/u);
  assert.equal(copies(text, "f"), 1);
});

test("keeps the arguments object when it is not needed", () => {
  // A top-level function named `arguments` removes the object, so the
  // block function copies into that function's binding instead.
  const text = hir(
    "function outer() { function arguments() {} { function arguments() {} } }",
  );
  assert.equal(copies(text, "arguments"), 1);
});

test("reports a block arguments function in an arrow", () => {
  assert.match(
    rejected("() => { { function arguments() {} } };"),
    /named 'arguments' in an arrow function/u,
  );
  hir("() => { var arguments; { function arguments() {} } };");
});

test("hoists a labelled top-level function like a plain one", () => {
  const text = hir("function outer() { return f(); l1: l2: function f() {} }");
  assert.match(text, /function-init %b\d+ f = @f\d+/u);
  assert.doesNotMatch(text, /labeled/u);
});

test("keeps strict labelled and if-clause functions early errors", () => {
  rejected('"use strict"; l: function f() {}');
  rejected('"use strict"; if (true) function f() {}');
  rejected("if (true) l: function f() {}");
  rejected("while (false) function f() {}");
  rejected("if (true) function* f() {}");
});

test("binds Script block functions as Annex B global entries first", () => {
  const text = hir(
    "var v; function g() {}\n" +
      "{ function b() {} function g() {} }\n" +
      "{ function v() {} }\n",
  );
  const first = text.split("\n").find((line) => line.startsWith("global-"));
  assert.match(first ?? "", /^global-object %b\d+ b/u);
  assert.equal(copies(text, "b"), 1);
  assert.equal(copies(text, "g"), 1);
  assert.equal(copies(text, "v"), 1);
});

test("skips a Script block function that a top-level let shadows", () => {
  const text = hir("let b; { function b() {} }");
  assert.equal(copies(text, "b"), 0);
});

test("runs a for-in var initializer once ahead of the loop", () => {
  const text = hir(
    "function outer(o) { l: for (var k = 1 in o) continue l; return k; }",
  );
  assert.match(text, /%b\d+ k = 1/u);
  assert.match(text, /^ {4}l: @/mu);
  rejected('"use strict"; for (var k = 1 in {});');
  rejected("for (let k = 1 in {});");
  rejected("for (var [k] = [] in {});");
});

test("turns a non-strict call assignment target into a run-time error", () => {
  for (const source of [
    "f() = 1;",
    "f() += 1;",
    "f()++;",
    "--f();",
    "(f()) = 1;",
    "for (f() in {});",
    "for (f() of []);",
  ]) {
    assert.match(
      hir(`function f() {}\n${source}`),
      /invalid-assignment-target/u,
      source,
    );
  }
  for (const source of [
    '"use strict"; f() = 1;',
    "f() &&= 1;",
    "[f()] = [];",
  ]) {
    rejected(`${source}\nfunction f() {}`);
  }
});
