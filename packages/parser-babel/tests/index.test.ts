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
    'function write(console) { console.log("x"); } write(null);',
    'const console = null; console.log("x");',
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "shadowed-console.ts",
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.match(result.diagnostics[0]?.message ?? "", /property/u);
  }
});

test("accepts parenthesized direct call targets", () => {
  const result = compileSource(babelFrontend, {
    source: "function value() { return 42; }\n(console.log)((value)());\n",
    sourceId: "parenthesized-calls.ts",
  });
  assert.deepEqual(result.diagnostics, []);
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
  assert.match(printMir(result.mir), /property-get-cached/u);
  const generic = compileSource(
    babelFrontend,
    {
      source: "const value = { item: 1 }; console.log(value.item);",
      sourceId: "generic-object.ts",
    },
    { specialization: "disabled" },
  );
  assert.ok(generic.mir != null);
  assert.doesNotMatch(printMir(generic.mir), /property-get-cached/u);
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
  ["async", "async function work() {}"],
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
