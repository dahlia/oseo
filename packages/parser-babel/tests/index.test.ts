import assert from "node:assert/strict";
import test from "node:test";

import {
  compileModuleGraph,
  compileSource,
  printHir,
  printMir,
} from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

test("normalizes Babel parse failures", () => {
  const result = babelFrontend.parse({
    source: "function {",
    sourceId: "invalid.ts",
  });
  assert.ok(!result.parsed);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.equal(result.diagnostics[0]?.sourceId, "invalid.ts");
});

test("converts the M1 profile to owned syntax and retains hints", () => {
  const result = babelFrontend.parse({
    source:
      "/** @param {string} left @returns {number} */\n" +
      "function add(left: number, right: any): string {\n" +
      "  return left + right;\n" +
      "}\n" +
      'console.log(add(1, "two"));\n',
    sourceId: "hints.ts",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.program?.kind, "program");
  const declaration = result.program?.body[0];
  assert.equal(declaration?.kind, "function");
  if (declaration?.kind !== "function") return;
  assert.deepEqual(
    declaration.parameters[0]?.hints.map((hint) => hint.provenance),
    ["typescript", "jsdoc"],
  );
  assert.deepEqual(
    declaration.returnHints.map((hint) => hint.provenance),
    ["typescript", "jsdoc"],
  );
});

test("preserves non-strict script parameter bindings", () => {
  for (const name of ["eval", "arguments"]) {
    const result = compileSource(babelFrontend, {
      source:
        `function value(${name}) { return ${name}; } ` +
        "console.log(value(1));",
      sourceId: `non-strict-${name}.ts`,
    });
    assert.deepEqual(result.diagnostics, []);
  }
});

test("retains script and function strictness in owned IR", () => {
  const script = compileSource(babelFrontend, {
    source: '"use strict"; function outer() { function inner() {} }',
    sourceId: "strict-script.ts",
  });
  assert.deepEqual(script.diagnostics, []);
  assert.equal(script.mir?.script.strict, true);
  assert.ok(
    script.mir?.functions.every((functionValue) => functionValue.strict),
  );

  const functionOnly = compileSource(babelFrontend, {
    source: 'function strictFunction() { "use strict"; }',
    sourceId: "strict-function.ts",
  });
  assert.deepEqual(functionOnly.diagnostics, []);
  assert.equal(functionOnly.mir?.script.strict, false);
  assert.equal(functionOnly.mir?.functions[0]?.strict, true);
});

test("rejects top-level this until script receivers exist", () => {
  const script = compileSource(babelFrontend, {
    source: "console.log(this);",
    sourceId: "script-this.ts",
  });
  assert.equal(script.diagnostics[0]?.code, "OSEO1001");
  assert.match(script.diagnostics[0]?.message ?? "", /non-arrow function/u);

  const topLevelArrow = compileSource(babelFrontend, {
    source: "const read = () => this;",
    sourceId: "arrow-this.ts",
  });
  assert.equal(topLevelArrow.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    topLevelArrow.diagnostics[0]?.message ?? "",
    /non-arrow function/u,
  );

  const functionBody = compileSource(babelFrontend, {
    source: "function receiver() { return this; }",
    sourceId: "function-this.ts",
  });
  assert.deepEqual(functionBody.diagnostics, []);

  const nestedArrow = compileSource(babelFrontend, {
    source: "function receiver() { return (() => this)(); }",
    sourceId: "nested-arrow-this.ts",
  });
  assert.deepEqual(nestedArrow.diagnostics, []);
});

test("ignores tag-shaped text outside JSDoc comments", () => {
  const result = babelFrontend.parse({
    source:
      "// @param {number} value @returns {number}\n" +
      "/* @param {string} value @returns {string} */\n" +
      "function identity(value) { return value; }",
    sourceId: "ordinary-comments.ts",
  });
  assert.ok(result.parsed);
  const declaration = result.program?.body[0];
  assert.equal(declaration?.kind, "function");
  if (declaration?.kind !== "function") return;
  assert.deepEqual(declaration.parameters[0]?.hints, []);
  assert.deepEqual(declaration.returnHints, []);
});

test("preserves shadowable primitive global names as identifiers", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function values(undefined, NaN, Infinity) {\n" +
      "  console.log(undefined, NaN, Infinity);\n" +
      "}\n" +
      'values("u", "n", "i");\n',
    sourceId: "shadowed-globals.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  const body = result.hir?.functions[0]?.body;
  const statement = body?.[0];
  assert.equal(statement?.kind, "expression");
  if (statement?.kind !== "expression") return;
  assert.equal(statement.expression.kind, "call");
  if (statement.expression.kind !== "call") return;
  assert.deepEqual(
    statement.expression.arguments.map((argument) => argument.kind),
    ["binding", "binding", "binding"],
  );
});

test("resolves console.log through lexical scope", () => {
  for (const source of [
    "function write(console) { console.log('x'); } " +
      "write({ log: function () {} });",
    "const console = { log: function () {} }; console.log('x');",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "shadowed-console.ts",
    });
    assert.deepEqual(result.diagnostics, []);
  }
});

test("resolves shadowed Object methods through lexical scope", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function make(Object) { return Object.create(1, 2); } " +
      "make({ create: function (left, right) { return left + right; } });",
    sourceId: "shadowed-object.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("accepts expression-valued dynamic call targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "(function () { return 42; })(); " +
      "function factory() { return function () { return 43; }; } " +
      "factory()();",
    sourceId: "dynamic-calls.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("marks allocating member lookup as a safepoint", () => {
  const result = compileSource(babelFrontend, {
    source: 'try { "a"[0](); } catch (error) {}',
    sourceId: "member-lookup.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(
    printMir(result.mir),
    /safepoint method lookup[^\n]*\n[^\n]*property-get method lookup/u,
  );
});

test("accepts parenthesized direct call targets", () => {
  const result = compileSource(babelFrontend, {
    source: "function value() { return 42; }\n(console.log)((value)());\n",
    sourceId: "parenthesized-calls.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("retains function name and length metadata in MIR", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "function declared(first, second) {}",
      "const inferred = function (value) {};",
    ].join(" "),
    sourceId: "function-metadata.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const text = printMir(result.mir);
  assert.match(text, /function @f\d+ name="declared" length=2/u);
  assert.match(text, /function @f\d+ name="inferred" length=1/u);
});

test("converts ordinary object operations to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      'const value = { first: 1, ["second"]: undefined };\n' +
      "value.first = 2;\n" +
      'console.log(value.first, value["second"], delete value.first);\n',
    sourceId: "objects.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /object\{/u);
  assert.match(printMir(result.mir), /object-create/u);
  assert.match(printMir(result.mir), /property-(?:get|set|delete)/u);
  const specializedText = printMir(result.mir);
  assert.match(specializedText, /guard-object/u);
  assert.match(specializedText, /guard-shape/u);
  assert.match(specializedText, /load-fixed-slot/u);
  assert.match(specializedText, /property-get generic/u);
  assert.match(specializedText, /join property read/u);
  assert.doesNotMatch(specializedText, /property-get-cached/u);
  const namedRead = compileSource(babelFrontend, {
    source: "function read(value) { return value.item; }",
    sourceId: "named-read.ts",
  });
  assert.ok(namedRead.mir != null);
  const namedReadText = printMir(namedRead.mir);
  const shapeGuard = namedReadText.indexOf("guard-shape");
  const keyConversion = namedReadText.indexOf("property-key");
  assert.notEqual(shapeGuard, -1);
  assert.notEqual(keyConversion, -1);
  assert.ok(shapeGuard < keyConversion);
  const hitCount = namedReadText.indexOf("count-guard-hit");
  const fixedLoad = namedReadText.indexOf("load-fixed-slot");
  const missCount = namedReadText.indexOf("count-guard-miss");
  assert.ok(shapeGuard < hitCount);
  assert.ok(hitCount < fixedLoad);
  assert.ok(fixedLoad < missCount);
  assert.doesNotMatch(
    namedReadText.slice(shapeGuard, missCount),
    /safepoint string allocation|property-key/u,
  );
  const generic = compileSource(
    babelFrontend,
    {
      source: "const value = { item: 1 }; console.log(value.item);",
      sourceId: "generic-object.ts",
    },
    { specialization: "disabled" },
  );
  assert.ok(generic.mir != null);
  const genericText = printMir(generic.mir);
  assert.match(genericText, /property-get property-get/u);
  assert.doesNotMatch(genericText, /guard-(?:object|shape)/u);
});

test("lowers the admitted Object reflection intrinsics", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const value = Object.create(null);\n" +
      'Object.defineProperty(value, "key", { value: 1 });\n' +
      'Object.getOwnPropertyDescriptor(value, "key");\n' +
      "Object.setPrototypeOf(value, null);\n" +
      "Object.keys(value);\n",
    sourceId: "object-reflection.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /intrinsic Object\.create/u);
  assert.match(printHir(result.hir), /intrinsic Object\.defineProperty/u);
  assert.match(printMir(result.mir), /Object\.getOwnPropertyDescriptor/u);
  assert.match(printMir(result.mir), /Object\.setPrototypeOf/u);
  assert.match(printMir(result.mir), /Object\.keys/u);
});

test("preserves array elements and holes in owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source: "const values = [1, , 3]; console.log(values.length);",
    sourceId: "arrays.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /\[1, <hole>, 3\]/u);
  assert.match(printMir(result.mir), /array-create array length 3/u);
});

test("accepts uninitialized let as undefined", () => {
  const result = compileSource(babelFrontend, {
    source: "let value; console.log(value);",
    sourceId: "uninitialized-let.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.match(
    result.hir == null ? "" : printHir(result.hir),
    /let .*undefined/u,
  );
});

test("rejects only noncomputed __proto__ literals", () => {
  const rejected = compileSource(babelFrontend, {
    source: "const value = { __proto__: null };",
    sourceId: "proto-literal.ts",
  });
  assert.equal(rejected.diagnostics[0]?.code, "OSEO1001");
  assert.match(rejected.diagnostics[0]?.message ?? "", /__proto__/u);

  const quoted = compileSource(babelFrontend, {
    source: 'const value = { "__proto__": null };',
    sourceId: "quoted-proto.ts",
  });
  assert.equal(quoted.diagnostics[0]?.code, "OSEO1001");
  assert.match(quoted.diagnostics[0]?.message ?? "", /__proto__/u);

  const accepted = compileSource(babelFrontend, {
    source: 'const value = { ["__proto__"]: null };',
    sourceId: "computed-proto.ts",
  });
  assert.deepEqual(accepted.diagnostics, []);
});

test("rejects the smallest syntax form outside the profile", () => {
  const result = babelFrontend.parse({
    source: "const value = class {};",
    sourceId: "class.ts",
  });
  assert.ok(!result.parsed);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 15,
    line: 1,
  });
});

test("converts synchronous arrow functions to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const double = (value) => value * 2;\n" +
      "const add = (left, right) => { return left + right; };\n" +
      "const chain = (a) => (b) => a + b;\n" +
      "console.log(double(21), add(1, 2), chain(1)(2));\n",
    sourceId: "sync-arrows.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
});

test("converts typeof, void, and remainder to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const value = 1;\n" +
      "console.log(typeof value, void value, value % 2);\n",
    sourceId: "m5-operators.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /\(typeof /u);
  assert.match(hirText, /\(void /u);
  assert.match(hirText, /% 2/u);
});

test("converts numeric, bitwise, and exponent operators", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const value = 6;\n" +
      "console.log(value ** 2, value & 3, value | 8, value ^ 1);\n" +
      "console.log(value << 1, value >> 1, value >>> 1, ~value, +value);\n",
    sourceId: "numeric-operators.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /\*\*/u);
  assert.match(hirText, />>>/u);
  assert.match(hirText, /\(~/u);
  assert.match(hirText, /\(\+/u);
});

test("converts logical, conditional, and do-while to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let value = 0;\n" +
      "do { value = value + 1; } while (value < 3);\n" +
      'console.log(value && "kept", value || "fallback");\n' +
      'console.log(value === 3 ? "three" : "other");\n',
    sourceId: "control-flow.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /do @/u);
  assert.match(hirText, /&&/u);
  assert.match(hirText, /\|\|/u);
  assert.match(hirText, /\? "three" : "other"/u);
});

test("hoists var declarations to initialized bindings", () => {
  const result = compileSource(babelFrontend, {
    source:
      "console.log(typeof hoisted);\n" +
      "var hoisted = 1;\n" +
      "if (hoisted) { var nested = 2, second; }\n" +
      "console.log(hoisted, nested, second);\n",
    sourceId: "var-hoisting.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  const hoistedIndex = hirText.indexOf("let %b");
  const useIndex = hirText.indexOf("typeof");
  assert.ok(hoistedIndex >= 0 && hoistedIndex < useIndex);
});

test("keeps var assignments on parameters and declared functions", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function keep(value) { var value; return value; }\n" +
      "function pick() { var chosen; function chosen() {} " +
      "return typeof chosen; }\n" +
      "console.log(keep(1), pick());\n",
    sourceId: "var-existing.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("supports awaited var initializers in async functions", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function wait(input) {\n" +
      "  var value = await input;\n" +
      "  if (value) { var flag = 1; }\n" +
      "  return value + flag;\n" +
      "}\n",
    sourceId: "var-async.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("supports awaited top-level var initializers in modules", () => {
  const result = babelModuleFrontend.parseModule({
    source:
      "var ready = await Promise.resolve(41);\n" +
      "export const value = ready + 1;\n",
    sourceId: "file:///app/var-await.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/var-await.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/var-await.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "var-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
});

const varConflicts = [
  ["var after let", "let value = 1; var value = 2;"],
  ["var before let", "var value = 1; let value = 2;"],
  ["var under enclosing let", "let value = 1; { var value = 2; }"],
  ["var beside block let", "{ let value = 1; var value = 2; }"],
] as const;

// The bootstrap parser reports var and lexical redeclarations as parse
// failures, which the frontend converts to owned OSEO0001 diagnostics.
for (const [name, source] of varConflicts) {
  test(`rejects ${name}`, () => {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  });
}

test("rejects var sharing a block-level function name", () => {
  const result = compileSource(babelFrontend, {
    source: "function outer() { { function inner() {} } var inner; }",
    sourceId: "var-block-function.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /block-level function name/u,
  );
});

test("keeps block-scoped let clear of later var declarations", () => {
  const result = compileSource(babelFrontend, {
    source: "{ let value = 1; console.log(value); } var value = 2;",
    sourceId: "var-disjoint.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("rejects var declarations sharing a catch parameter name", () => {
  const result = compileSource(babelFrontend, {
    source: "try { console.log(1); } catch (caught) { var caught; }",
    sourceId: "var-catch.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /catch parameter/u);
});

test("rejects var destructuring explicitly", () => {
  const result = compileSource(babelFrontend, {
    source: "var { value } = { value: 1 };",
    sourceId: "var-destructuring.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /var destructuring/u);
});

test("rejects ambient declare declarations", () => {
  const result = compileSource(babelFrontend, {
    source: "declare var ambient: number;",
    sourceId: "declare-var.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Ambient declarations/u);
});

test("keeps module var hoisting ahead of earlier assignments", () => {
  const result = babelModuleFrontend.parseModule({
    source: "x = 1;\nvar x;\nexport const done = x;\n",
    sourceId: "file:///app/var-order.js",
  });
  assert.ok(result.parsed);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/var-order.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/var-order.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "var-order",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
});

test("reports duplicate exports as entry parse failures", () => {
  const result = babelModuleFrontend.parseModule({
    source: "var x;\nexport { x };\nexport { x };\n",
    sourceId: "file:///app/dup-export.js",
  });
  assert.ok(!result.parsed);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.match(result.diagnostics[0]?.message ?? "", /Duplicate export/u);
});

test("rejects var exports explicitly", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export var value = 1;",
    sourceId: "file:///app/export-var.js",
  });
  assert.ok(!result.parsed);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
});

test("converts labeled statements to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "outer: for (let i = 0; i < 3; i = i + 1) {\n" +
      "  inner: while (true) { if (i === 1) continue outer; break inner; }\n" +
      "}\n" +
      "block: { break block; }\n",
    sourceId: "labeled-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /outer:/u);
  assert.match(hirText, /continue outer/u);
  assert.match(hirText, /break block/u);
});

// The bootstrap parser validates label references, so undefined labels
// and continue targets that are not loops stay parse failures.
test("keeps invalid label references as parse failures", () => {
  for (const source of [
    "a: { break b; }",
    "a: { continue a; }",
    "a: a: while (true) break a;",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "invalid-label.ts",
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  }
});

test("converts switch statements to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "switch (1 + 1) {\n" +
      '  case 1: console.log("one"); break;\n' +
      '  default: console.log("other");\n' +
      '  case 2: console.log("two");\n' +
      "}\n",
    sourceId: "switch-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /switch /u);
  assert.match(hirText, /default:/u);
});

test("keeps break valid inside if consequents", () => {
  const result = compileSource(babelFrontend, {
    source:
      "while (true) { if (1) break; }\n" +
      "switch (1) { case 1: if (1) break; }\n" +
      "do { if (1) continue; } while (false);\n",
    sourceId: "guarded-break.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

// The bootstrap parser already rejects continue outside a loop, so the
// rejection arrives as an owned OSEO0001 parse diagnostic.
test("rejects continue without an enclosing loop", () => {
  const result = compileSource(babelFrontend, {
    source: "switch (1) { case 1: continue; }",
    sourceId: "switch-continue.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
});

test("rejects function declarations in switch clauses", () => {
  const result = compileSource(babelFrontend, {
    source: "switch (1) { case 1: function inner() {} }",
    sourceId: "switch-function.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /Function declarations in switch/u,
  );
});

test("converts classic for statements to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "for (let i = 0, limit = 3; i < limit; i = i + 1) console.log(i);\n" +
      "for (var counted = 0; counted < 2; counted = counted + 1);\n" +
      "let started = 0;\n" +
      "for (started = 1; started < 2; started = started + 1) {}\n" +
      "for (;;) break;\n",
    sourceId: "for-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /for \(let %b/u);
});

const unsupportedForForms = [
  ["for-in", "for (const key in {}) console.log(key);"],
  ["for-await-of", "async function f() { for await (const x of []) {} }"],
  ["for-of destructuring", "for (const [item] of []) console.log(item);"],
  ["for const without initializer", "for (const item; ;) break;"],
] as const;

for (const [name, source] of unsupportedForForms) {
  test(`rejects ${name} statements`, () => {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.mir, undefined);
  });
}

test("converts synchronous for-of heads to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let assigned; const target = {}; const key = 'value';\n" +
      "for (const item of []) console.log(item);\n" +
      "for (let item of []) console.log(item);\n" +
      "for (var item of []) console.log(item);\n" +
      "for (assigned of []) console.log(assigned);\n" +
      "for (target.value of []) {}\n" +
      "for (target[key] of []) {}\n",
    sourceId: "for-of-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /for \(const %b\d+ item of \[\]\)/u);
});

test("keeps a lexical for-of binding in the iterable TDZ", () => {
  const result = compileSource(babelFrontend, {
    source: "for (let item of item) {}",
    sourceId: "for-of-tdz.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(printMir(result.mir), /read item/u);
});

test("converts in and instanceof to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function Box(value) { this.value = value; }\n" +
      "const box = new Box(1);\n" +
      'console.log("value" in box, box instanceof Box);\n',
    sourceId: "relational-operators.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, / in /u);
  assert.match(hirText, / instanceof /u);
});

test("converts untagged template literals to concatenation", () => {
  const result = compileSource(babelFrontend, {
    source:
      'const name = "world";\n' +
      "console.log(`hello ${name}${1 + 1}!`, ``, `plain`);\n",
    sourceId: "templates.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /"hello " \+/u);
  assert.match(hirText, /\+ "!"/u);
  // Substitutions convert with ToString's string preference instead of
  // the addition operator's default ToPrimitive hint.
  assert.match(hirText, /to-string %b\d+\(name\)/u);
  assert.match(hirText, /to-string \(1 \+ 1\)/u);
});

test("rejects tagged template expressions", () => {
  const result = compileSource(babelFrontend, {
    source: "function tag(parts) { return parts; } console.log(tag`x`);",
    sourceId: "tagged.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Tagged template/u);
});

test("converts loose equality to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source: 'console.log(1 == "1", null != undefined);',
    sourceId: "loose-equality.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /==/u);
  assert.match(hirText, /!=/u);
});

test("converts comma sequences and nullish coalescing", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const chosen = null ?? (1, 2);\n" +
      "console.log(chosen ?? 0, (chosen, chosen + 1));\n",
    sourceId: "sequence-nullish.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /\?\?/u);
  assert.match(hirText, /\(1, 2\)/u);
});

test("rejects await inside logical operands of async functions", () => {
  const result = compileSource(babelFrontend, {
    source: "async function first(input) { return input && (await input); }",
    sourceId: "async-logical.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Await is supported/u);
});

test("rejects top-level await inside logical operands", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export const ready = (await Promise.resolve(1)) && 2;",
    sourceId: "file:///app/logical-await.js",
  });
  assert.ok(result.parsed);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/logical-await.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/logical-await.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "logical-await",
        syntax: result.module,
      },
    ],
  });
  assert.equal(compiled.mir, undefined);
  assert.match(
    compiled.diagnostics[0]?.message ?? "",
    /control-flow position/u,
  );
});

test("rejects typeof with an unresolved name explicitly", () => {
  const result = compileSource(babelFrontend, {
    source: "console.log(typeof missing);",
    sourceId: "typeof-unresolved.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /typeof with an unresolved name/u,
  );
});

const unsupportedForms = [
  ["compound assignment", "let value = 1; value += 1;"],
  ["update expression", "let value = 1; value++;"],
  ["exponent assignment", "let value = 2; value **= 2;"],
  ["logical assignment", "let value = null; value ||= 1;"],
  ["nullish assignment", "let value = null; value ??= 1;"],
  ["property", "console.error(1);"],
  ["with statement", "with ({}) { console.log(1); }"],
  ["module", 'import "fixture";'],
  ["default parameter", "function value(input = 1) {}"],
  ["optional parameter", "function value(input?: number) {}"],
  [
    "TypeScript this parameter",
    "function value(this: any, input: number) { return input; }",
  ],
  [
    "generic function",
    "function identity<T>(value: number): number { return value; }",
  ],
  [
    "call type arguments",
    "function identity(value: number) { return value; } identity<number>(1);",
  ],
  ["console.log type arguments", 'console.log<string>("value");'],
] as const;

for (const [name, source] of unsupportedForms) {
  test(`rejects unsupported ${name} syntax`, () => {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  });
}

test("rejects constructor type arguments instead of erasing them", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "function Box(value: number) { return value; }",
      "new Box<number>(1);",
    ].join(" "),
    sourceId: "constructor-type-arguments.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Constructor type/u);
});

const lineTerminators = [
  ["LF", "\n"],
  ["CR", "\r"],
  ["CRLF", "\r\n"],
  ["line separator", "\u2028"],
  ["paragraph separator", "\u2029"],
] as const;

for (const [name, terminator] of lineTerminators) {
  test(`locates failures after ${name}`, () => {
    const result = babelFrontend.parse({
      source: `const value = 1;${terminator}@`,
      sourceId: "invalid.ts",
    });

    assert.deepEqual(result.diagnostics[0]?.range.start, {
      column: 1,
      line: 2,
    });
  });
}

test("records UTF-8 byte offsets after non-ASCII source", () => {
  const source = 'console.log("😀");\n@';
  const result = babelFrontend.parse({ source, sourceId: "unicode.ts" });
  const sourceOffset = source.indexOf("@");
  const byteOffset = new TextEncoder().encode(
    source.slice(0, sourceOffset),
  ).length;
  assert.equal(result.diagnostics[0]?.byteRange.start, byteOffset);
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 1,
    line: 2,
  });
});

test("converts large files without rescanning every source prefix", () => {
  const source = Array.from(
    { length: 4_000 },
    (_, index) => `console.log(${index});`,
  ).join("\n");
  const started = performance.now();
  const result = babelFrontend.parse({ source, sourceId: "large.ts" });
  const elapsed = performance.now() - started;
  assert.ok(result.parsed);
  assert.ok(elapsed < 1_500, `frontend conversion took ${elapsed} ms`);
});

test("converts M4 imports and exports to owned module syntax", () => {
  const result = babelModuleFrontend.parseModule({
    source: `
      import main, { value as renamed } from "./a.js";
      import * as namespace from "./b.js";
      import "./side.js";
      export const local = 1;
      export { local as shown };
      export { other as remote } from "./c.js";
      export * from "./star.js";
      export default local;
    `,
    sourceId: "file:///app/main.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(
    result.module?.imports.map((entry) => ({
      imported: entry.importedName,
      local: entry.localName,
      specifier: entry.specifier.value,
    })),
    [
      { imported: "default", local: "main", specifier: "./a.js" },
      { imported: "value", local: "renamed", specifier: "./a.js" },
      { imported: "*", local: "namespace", specifier: "./b.js" },
      { imported: undefined, local: undefined, specifier: "./side.js" },
    ],
  );
  assert.deepEqual(
    result.module?.exports.map((entry) => entry.kind),
    ["local", "local", "indirect", "star", "default"],
  );
  assert.doesNotMatch(JSON.stringify(result.module), /ImportDeclaration/u);
});

test("keeps empty indirect exports as requested dependencies", () => {
  const result = babelModuleFrontend.parseModule({
    source: 'export {} from "./requested.js";\nimport {} from "./empty.js";',
    sourceId: "file:///app/empty-clauses.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.module?.exports, []);
  assert.deepEqual(
    result.module?.imports.map((entry) => ({
      imported: entry.importedName,
      local: entry.localName,
      specifier: entry.specifier.value,
    })),
    [
      { imported: undefined, local: undefined, specifier: "./requested.js" },
      { imported: undefined, local: undefined, specifier: "./empty.js" },
    ],
  );
});

test("retains default export order and anonymous function names", () => {
  const result = babelModuleFrontend.parseModule({
    source: `
      export default function () {}
      console.log("after");
    `,
    sourceId: "file:///app/default.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  const exported = result.module?.exports[0];
  assert.equal(exported?.kind, "default");
  assert.ok(exported?.byteRange != null);
  if (exported?.kind !== "default") return;
  assert.equal(
    "parameters" in exported.declaration
      ? exported.declaration.name
      : undefined,
    "default",
  );
  assert.ok(
    exported.byteRange.start <
      (result.module?.body[0]?.byteRange?.start ?? Number.MAX_SAFE_INTEGER),
  );
});

test("names anonymous default export expressions", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export default (function () {});",
    sourceId: "file:///app/default-expression.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/default-expression.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/default-expression.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "default-expression",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /name="default"/u);
  assert.doesNotMatch(printMir(compiled.mir), /name="\*default:/u);
});

test("lowers top-level await to an owned scheduler checkpoint", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export const answer = 1 + await Promise.resolve(41);",
    sourceId: "file:///app/answer.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/answer.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/answer.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "answer",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(
    compiled.mir?.script.blocks
      .flatMap((block) => block.operations)
      .some((operation) => operation.target?.kind === "await"),
  );
  assert.doesNotMatch(JSON.stringify(result.module), /AwaitExpression/u);
});

test("diagnoses excessive top-level await depth", () => {
  const sourceId = "file:///app/deep-await.js";
  const accepted = babelModuleFrontend.parseModule({
    source: "await 0;\n".repeat(256),
    sourceId,
  });
  assert.ok(accepted.module != null);
  const acceptedCompilation = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "accepted-await",
        syntax: accepted.module,
      },
    ],
  });
  assert.deepEqual(acceptedCompilation.diagnostics, []);
  assert.ok(acceptedCompilation.mir != null);

  const result = babelModuleFrontend.parseModule({
    source: "await 0;\n".repeat(15_000),
    sourceId,
  });
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "deep-await",
        syntax: result.module,
      },
    ],
  });
  assert.equal(compiled.mir, undefined);
  assert.equal(compiled.diagnostics[0]?.code, "OSEO1001");
  assert.match(compiled.diagnostics[0]?.message ?? "", /at most 256/u);
  assert.equal(compiled.diagnostics[0]?.range.start.line, 257);
});

test("lowers M4 promise construction and static methods", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "function settle(resolve) { resolve(1); }",
      "function observe(value) { console.log(value); }",
      "new Promise(settle).then(observe);",
      "Promise.resolve(2).then(observe);",
      "Promise.reject(3).catch(observe);",
      "Promise.all([4, 5]).then(observe);",
      "Promise.race([6, 7]).then(observe);",
    ].join("\n"),
    sourceId: "promises.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const targets = result.mir.script.blocks
    .flatMap((block) => block.operations)
    .flatMap((operation) =>
      operation.target == null ? [] : [operation.target],
    );
  assert.ok(targets.some((target) => target.kind === "promise-constructor"));
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "resolve",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "reject",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "all",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "race",
    ),
  );
});

test("lowers async functions into owned continuations", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function add(value) {",
      "  const first = await Promise.resolve(value);",
      "  const second = await 2;",
      "  return first + second;",
      "}",
      "const expression = async function (value) { return await value; };",
      "const arrow = async (value) => await value;",
      "function observe(value) { console.log(value); }",
      "add(1).then(observe);",
      "expression(2).then(observe);",
      "arrow(3).then(observe);",
    ].join("\n"),
    sourceId: "async.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.ok(result.mir.functions.length >= 9);
  const operations = [
    ...result.mir.script.blocks,
    ...result.mir.functions.flatMap((functionValue) => functionValue.blocks),
  ].flatMap((block) => block.operations);
  assert.ok(
    operations.some(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "asyncCall",
    ),
  );
  assert.ok(
    operations.some(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "awaitThen",
    ),
  );
  const functionKinds = new Set(
    operations.flatMap((operation) =>
      operation.kind === "function-create" ? [operation.functionKind] : [],
    ),
  );
  assert.ok(functionKinds.has("async"));
  assert.ok(functionKinds.has("async-arrow"));
  assert.ok(functionKinds.has("arrow"));
});

test("diagnoses excessive async continuation depth", () => {
  const accepted = compileSource(babelFrontend, {
    source: `async function deep() {\n${"await 0;\n".repeat(256)}}`,
    sourceId: "accepted-async.js",
  });
  assert.deepEqual(accepted.diagnostics, []);
  assert.ok(accepted.mir != null);

  const result = compileSource(babelFrontend, {
    source: `async function deep() {\n${"await 0;\n".repeat(1_200)}}`,
    sourceId: "deep-async.js",
  });
  assert.equal(result.mir, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /at most 256/u);
  assert.equal(result.diagnostics[0]?.range.start.line, 258);
});

test("preserves async returns and bindings across await", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "async function choose(value) {",
      "  if (value) return 1;",
      "  return 2;",
      "}",
      "async function returnedDeclaration() {",
      "  return later();",
      "  function later() { return 3; }",
      "}",
      "async function thrownDeclaration() {",
      "  throw later();",
      '  function later() { return "reason"; }',
      "}",
      "async function lexicalAfterReturn() {",
      "  return later;",
      "  let later = 4;",
      "}",
      "async function hoisted() {",
      "  const value = later();",
      "  await 0;",
      "  function later() { return 5; }",
      "  return value;",
      "}",
      "async function lexical() {",
      "  console.log(later);",
      "  await 0;",
      "  let later = 6;",
      "  return later;",
      "}",
      "async function finalValue() {",
      "  try { return 1; } finally { return 2; }",
      "}",
      "const promise = Promise.resolve(3);",
      "promise.then = function () { return 4; };",
      "async function internalAwait() { return await promise; }",
    ].join("\n"),
    sourceId: "async-scope.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
});

test("validates unreachable async statements", () => {
  const loop = compileSource(babelFrontend, {
    source: "async function invalid() { return 1; class Later {} }",
    sourceId: "async-unreachable-loop.js",
  });
  assert.equal(loop.mir, undefined);
  assert.match(loop.diagnostics[0]?.message ?? "", /ClassDeclaration/u);

  const awaitValue = compileSource(babelFrontend, {
    source: "async function invalid() { throw 1; if (true) await 0; }",
    sourceId: "async-unreachable-await.js",
  });
  assert.equal(awaitValue.mir, undefined);
  assert.match(awaitValue.diagnostics[0]?.message ?? "", /Await/u);

  const continuation = compileSource(babelFrontend, {
    source: "async function invalid() { await 0; return 1; class Later {} }",
    sourceId: "async-unreachable-continuation.js",
  });
  assert.equal(continuation.mir, undefined);
  assert.match(continuation.diagnostics[0]?.message ?? "", /ClassDeclaration/u);
});

test("rejects nested async await operands", () => {
  for (const source of [
    "async function nested(ready) { return await (await ready); }",
    "async function nested(ready) { await (await ready); }",
    "async function nested(ready) { const value = await (await ready); }",
    "async function nested(ready) { return 1; return await (await ready); }",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "nested-await.js",
    });
    assert.equal(result.mir, undefined);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(result.diagnostics[0]?.message ?? "", /Nested await/u);
  }
});

test("lowers timer globals while preserving lexical shadowing", () => {
  const direct = compileSource(babelFrontend, {
    source: [
      "function task() {}",
      "const handle = setTimeout(task, 0);",
      "clearTimeout(handle);",
    ].join("\n"),
    sourceId: "timers.js",
  });
  assert.deepEqual(direct.diagnostics, []);
  const targets = direct.mir?.script.blocks
    .flatMap((block) => block.operations)
    .flatMap((operation) =>
      operation.target == null ? [] : [operation.target],
    );
  assert.ok(
    targets?.some(
      (target) =>
        target.kind === "timer-intrinsic" && target.method === "setTimeout",
    ),
  );
  assert.ok(
    targets?.some(
      (target) =>
        target.kind === "timer-intrinsic" && target.method === "clearTimeout",
    ),
  );

  const shadowed = compileSource(babelFrontend, {
    source: "function call(setTimeout, task) { return setTimeout(task, 0); }",
    sourceId: "shadowed-timer.js",
  });
  assert.deepEqual(shadowed.diagnostics, []);
  assert.ok(
    shadowed.mir?.functions
      .flatMap((functionValue) => functionValue.blocks)
      .flatMap((block) => block.operations)
      .some((operation) => operation.target?.kind === "dynamic"),
  );
});

test("rejects type-only imports instead of creating runtime bindings", () => {
  const result = babelModuleFrontend.parseModule({
    source: 'import type { Model } from "./types.ts";',
    sourceId: "file:///app/main.ts",
  });
  assert.equal(result.parsed, false);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(result.diagnostics[0]?.message ?? "", /Type-only imports/u);
});

test("rejects module attributes before lowering module entries", () => {
  for (const source of [
    'import data from "./data.json" with { type: "json" };',
    'import data from "./data.json" with {};',
    'export { value } from "./data.js" with { type: "json" };',
    'export * from "./data.js" with { type: "json" };',
  ]) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "file:///app/main.js",
    });
    assert.equal(result.parsed, false);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(result.diagnostics[0]?.message ?? "", /attributes/u);
    assert.deepEqual(result.diagnostics[0]?.range.start, {
      column: 1,
      line: 1,
    });
  }

  const comment = babelModuleFrontend.parseModule({
    source: 'import data from "./data.js" /* with {} */;',
    sourceId: "file:///app/comment.js",
  });
  assert.ok(comment.parsed);
  assert.deepEqual(comment.diagnostics, []);
});
