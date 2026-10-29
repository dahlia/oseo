import assert from "node:assert/strict";
import test from "node:test";

import type { Diagnostic } from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

/** A `new` operand that an unparenthesized ImportCall begins. */
const invalidOperands: readonly string[] = [
  "new import('').prop",
  "new import('')[0]",
  "new import('')`tag`",
  "new import('').a.b",
  "new import('').prop()",
  "new import('').prop(1, 2)",
  "new import('x', {}).prop",
  "new new import('').prop",
];

/** Every enclosing syntax used by test262's ImportCall templates. */
const contexts: readonly (readonly [string, string])[] = [
  ["", ";"],
  ["{ ", "; }"],
  ["label: { ", "; }"],
  ["let f = () => ", ";"],
  ["let f = () => { ", "; };"],
  ["let f = async () => await ", ";"],
  ["let f = async () => { return await ", "; };"],
  ["function f() { ", "; }"],
  ["function f() { return ", "; }"],
  ["async function f() { await ", "; }"],
  ["async function* f() { await ", "; }"],
  ["function* f() { yield ", "; }"],
  ["if (true) ", ";"],
  ["if (true) { ", "; }"],
  ["if (false) {} else ", ";"],
  ["while (false) { ", "; }"],
  ["do { ", "; } while (false);"],
  ["class C { m() { ", "; } }"],
  ["let x = 1 + ", ";"],
];

/** Script-only enclosing syntax. */
const scriptContexts: readonly (readonly [string, string])[] = [
  ["with ({}) ", ";"],
  ["with ({}) { ", "; }"],
  ["with (", ") {}"],
];

/** ImportCall forms the grammar admits; each keeps its profile diagnostic. */
const validOperands: readonly string[] = [
  "import('').prop",
  "new (import('')).prop",
  "new (import('').prop)",
  "new (import(''))[0]",
  "new value(import(''))",
  "new value[import('')]",
  "new value.prop(import('')).other",
  "new (import(''))`tag`",
];

function assertImportCallEarlyError(
  diagnostics: readonly Diagnostic[],
  source: string,
  sourceId: string,
): void {
  assert.equal(diagnostics.length, 1, source);
  const diagnostic = diagnostics[0];
  assert.ok(diagnostic != null);
  assert.equal(diagnostic.code, "OSEO0001", source);
  assert.equal(
    diagnostic.message,
    "An import() call cannot be the operand of new.",
    source,
  );
  assert.equal(diagnostic.sourceId, sourceId);
  // Every case is ASCII on one line, so byte and column offsets coincide.
  const start = source.indexOf("import(");
  const end = source.indexOf(")", start) + 1;
  assert.deepEqual(diagnostic.byteRange, { end, start });
  assert.deepEqual(diagnostic.range, {
    end: { column: end + 1, line: 1 },
    start: { column: start + 1, line: 1 },
  });
}

test("an ImportCall that begins a new operand is an early error", () => {
  for (const operand of invalidOperands) {
    for (const [before, after] of [...contexts, ...scriptContexts]) {
      const source = `${before}${operand}${after}`;
      const sourceId = "new-import-call.js";
      const result = babelFrontend.parse({ source, sourceId });
      assert.equal(result.parsed, false, source);
      assertImportCallEarlyError(result.diagnostics, source, sourceId);
    }
    for (const [before, after] of contexts) {
      const source = `${before}${operand}${after}`;
      const sourceId = "new-import-call.mjs";
      const result = babelModuleFrontend.parseModule({ source, sourceId });
      assert.equal(result.parsed, false, source);
      assertImportCallEarlyError(result.diagnostics, source, sourceId);
    }
  }
});

test("the early error precedes an earlier profile diagnostic", () => {
  const source = "class Example<T> {} import(''); new import('').prop;";
  const sourceId = "new-import-call-order.ts";
  for (const result of [
    babelFrontend.parse({ source, sourceId }),
    babelModuleFrontend.parseModule({ source, sourceId }),
  ]) {
    assert.equal(result.parsed, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001");
    assert.equal(result.diagnostics[0]?.byteRange.start, 36);
  }
});

test("each ImportCall that begins a new operand is reported in order", () => {
  const source = "new import('a')[0];\nnew import('b').c;";
  const result = babelFrontend.parse({ source, sourceId: "two.js" });
  assert.equal(result.parsed, false);
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.range.start),
    [
      { column: 5, line: 1 },
      { column: 5, line: 2 },
    ],
  );
});

test("admitted ImportCall grammar keeps its profile diagnostic", () => {
  for (const operand of validOperands) {
    const source = `let value; ${operand};`;
    for (const result of [
      babelFrontend.parse({ source, sourceId: "valid.js" }),
      babelModuleFrontend.parseModule({ source, sourceId: "valid.mjs" }),
    ]) {
      assert.equal(result.parsed, false, source);
      assert.ok(result.diagnostics.length > 0, source);
      for (const diagnostic of result.diagnostics) {
        assert.equal(diagnostic.code, "OSEO1001", source);
        assert.equal(
          diagnostic.message,
          "ImportExpression is outside the M1 profile.",
          source,
        );
      }
    }
  }
});

test("new over import.meta and ordinary members stays valid", () => {
  const module = babelModuleFrontend.parseModule({
    source: "let C = class {}; new C.constructor; new import.meta.constructor;",
    sourceId: "meta.mjs",
  });
  assert.equal(
    module.diagnostics.some((diagnostic) => diagnostic.code === "OSEO0001"),
    false,
  );
  const script = babelFrontend.parse({
    source: "let o = { C: class {} }; new o.C; new o['C']();",
    sourceId: "member.js",
  });
  assert.deepEqual(script.diagnostics, []);
  assert.equal(script.parsed, true);
});
