import assert from "node:assert/strict";
import test from "node:test";

import { compileSource, printHir, printMir } from "@oseo/compiler";

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
  assert.match(script.diagnostics[0]?.message ?? "", /function bodies/u);

  const functionBody = compileSource(babelFrontend, {
    source: "function receiver() { return this; }",
    sourceId: "function-this.ts",
  });
  assert.deepEqual(functionBody.diagnostics, []);
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

test("rejects the smallest syntax form outside the M3 profile", () => {
  const result = babelFrontend.parse({
    source: "const value = () => 1;",
    sourceId: "arrow.ts",
  });
  assert.ok(!result.parsed);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 15,
    line: 1,
  });
});

const unsupportedForms = [
  ["compound assignment", "let value = 1; value += 1;"],
  ["property", "console.error(1);"],
  ["loose equality", "console.log(1 == true);"],
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
      (operation) => operation.target?.kind === "promise-constructor",
    ),
  );
  assert.ok(
    operations.some(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "resolve",
    ),
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
