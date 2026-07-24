import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printHir, printMir } from "@oseo/compiler";

import { babelFrontend } from "../src/index.ts";

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

test("accepts parenthesized assignment targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let value = 0;\n" +
      "const target = { value: 0 };\n" +
      "(value) = 1;\n" +
      "(target.value) = 2;\n" +
      "for ((value) of []) {}\n" +
      "for ((target.value) of []) {}\n",
    sourceId: "parenthesized-assignment-targets.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /= safepoint binding assignment error/u);
  assert.match(mir, /property-set property-set/u);
  assert.match(mir, /property-set for-of property target/u);
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
      'console.log(value.first, value["second"], delete value.first, ' +
      'delete (value["second"]));\n',
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

test("lowers array spread through dynamic accumulation", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const values = [1, 2];\n" +
      "const result = [0, ...values, , 3];\n" +
      "console.log(result.length);",
    sourceId: "array-spread.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(
    printHir(result.hir),
    /\[0, \.\.\.%b\d+\(values\), <hole>, 3\]/u,
  );
  const mir = printMir(result.mir);
  assert.match(mir, /array-create array length 0/u);
  assert.match(mir, /array-append array element append/u);
  assert.match(mir, /array-append-hole array hole append/u);
  assert.match(mir, /iterator-get GetIterator sync/u);
  assert.match(mir, /iterator-next IteratorStep and IteratorValue/u);
  assert.doesNotMatch(mir, /iterator-close/u);
});

test("lowers call spread through dynamic argument accumulation", () => {
  const call = compileSource(babelFrontend, {
    source: `const values = [1, 2];
console.log(0, ...values, 3);`,
    sourceId: "call-spread.ts",
  });
  assert.deepEqual(call.diagnostics, []);
  assert.ok(call.hir != null);
  assert.ok(call.mir != null);
  assert.match(
    printHir(call.hir),
    /call intrinsic console\.log\(0, \.\.\.%b\d+\(values\), 3\)/u,
  );
  const mir = printMir(call.mir);
  assert.match(mir, /argument-list-create dynamic argument list/u);
  assert.match(mir, /argument-list-append call argument append/u);
  assert.match(mir, /iterator-get GetIterator sync/u);
  assert.match(mir, /iterator-next IteratorStep and IteratorValue/u);
  assert.match(mir, /call console_log .*argument-list=%\d+/u);
  assert.doesNotMatch(mir, /iterator-close/u);
});

test("lowers constructor spread through dynamic argument accumulation", () => {
  const construct = compileSource(babelFrontend, {
    source: `function Box(first, second, third, fourth) {}
const values = [1, 2];
new Box(0, ...values, 3);`,
    sourceId: "constructor-spread.ts",
  });
  assert.deepEqual(construct.diagnostics, []);
  assert.ok(construct.hir != null);
  assert.ok(construct.mir != null);
  assert.match(
    printHir(construct.hir),
    /new %b\d+\(Box\)\(0, \.\.\.%b\d+\(values\), 3\)/u,
  );
  const mir = printMir(construct.mir);
  assert.match(mir, /argument-list-create dynamic argument list/u);
  assert.match(mir, /argument-list-append call argument append/u);
  assert.match(mir, /iterator-get GetIterator sync/u);
  assert.match(mir, /iterator-next IteratorStep and IteratorValue/u);
  assert.match(mir, /construct dynamic constructor .*argument-list=%\d+/u);
  assert.doesNotMatch(mir, /iterator-close/u);
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
