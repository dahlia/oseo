import assert from "node:assert/strict";
import test from "node:test";

import {
  compileModuleGraph,
  compileSource,
  printHir,
  printMir,
} from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

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

test("rejects var declarations sharing a catch pattern name", () => {
  const result = compileSource(babelFrontend, {
    source:
      "try { throw { value: 1 }; } " +
      "catch ({ value: caught }) { var caught; }",
    sourceId: "var-catch-pattern.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
});

test("converts hoisted var object binding patterns", () => {
  const result = compileSource(babelFrontend, {
    source:
      "console.log(first, second);\n" +
      "var { value: first, missing: second = 2 } = { value: 1 };",
    sourceId: "var-destructuring.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /var write \{"value": %b\d+ first/u);
  assert.match(printMir(result.mir), /write %b\d+ first %\d+/u);
});

test("converts hoisted var array binding patterns", () => {
  const result = compileSource(babelFrontend, {
    source:
      "console.log(first, second, third);\n" +
      "var [first, second = 2] = [1];\n" +
      "var plain = 3, [, third] = [0, 4];\n",
    sourceId: "var-array-bindings.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /var write \[%b\d+ first/u);
  assert.match(printMir(result.mir), /write %b\d+ first %\d+/u);
});

test("supports direct await into a var array binding", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function unpack() {\n" +
      "  var [value, fallback = 2] = await Promise.resolve([1]);\n" +
      "  return value + fallback;\n" +
      "}\n" +
      "unpack();\n",
    sourceId: "await-var-array-binding.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(printMir(result.mir), /write %b\d+ value %\d+/u);
});

test("preserves var writes across top-level await", () => {
  const sourceId = "file:///app/await-var-array-binding.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "console.log(value, fallback);\n" +
      "var [value, fallback = 2] = await Promise.resolve([1]);\n" +
      "console.log(value, fallback);\n",
    sourceId,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "await-var-array-binding",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /write %b\d+ value %\d+/u);
});

test("converts lexical array binding patterns to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const values = [1, 2, undefined, [5], 6];\n" +
      "const [first, , second = 3, [nested] = [4], ...rest] = values;\n" +
      "let [mutable] = rest;\n",
    sourceId: "array-bindings.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /const declare \[%b\d+ first, , %b\d+ second = 3/u);
  assert.match(hir, /\.\.\.%b\d+ rest/u);
  assert.match(mir, /done-state=%\d+/u);
  assert.match(mir, /IteratorClose for array binding/u);
  assert.match(mir, /array binding rest/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|AssignmentPattern/u,
  );
});

test("supports direct await into a lexical array binding", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function unpack() {\n" +
      "  const [first, second = 2] = await Promise.resolve([1]);\n" +
      "  console.log(first, second);\n" +
      "}\n" +
      "unpack();\n",
    sourceId: "await-array-binding.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(printMir(result.mir), /GetIterator sync for array binding/u);
});

test("exports every lexical array binding name", () => {
  const sourceId = "file:///app/array-bindings.js";
  const result = babelModuleFrontend.parseModule({
    source: [
      "export const [first, second = 2] = ",
      "await Promise.resolve([1]);",
    ].join(""),
    sourceId,
  });
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.exports.flatMap((entry) =>
      entry.kind === "star" ? [] : [entry.exportedName],
    ),
    ["first", "second"],
  );
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "array-bindings",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("converts lexical object binding patterns to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const key = 'value';\n" +
      "const { [key]: first, missing: second = 2, nested: { item }, " +
      "array: [head] } = { value: 1, nested: { item: 3 }, array: [4] };\n" +
      "let { mutable } = { mutable: 5 };\n",
    sourceId: "object-bindings.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /const declare \{%b\d+\(key\): %b\d+ first/u);
  assert.match(hir, /"nested": \{"item": %b\d+ item/u);
  assert.match(mir, /RequireObjectCoercible for object binding/u);
  assert.match(mir, /GetV for object binding/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ObjectPattern|ObjectProperty|AssignmentPattern/u,
  );
});

test("supports direct await into an object binding", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function unpack() {\n" +
      "  const { value, missing = 2 } = " +
      "await Promise.resolve({ value: 1 });\n" +
      "  console.log(value, missing);\n" +
      "}\n" +
      "unpack();\n",
    sourceId: "await-object-binding.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(
    printMir(result.mir),
    /RequireObjectCoercible for object binding/u,
  );
});

test("exports every lexical object binding name", () => {
  const sourceId = "file:///app/object-bindings.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "export const { value, missing: fallback = 2 } = " +
      "await Promise.resolve({ value: 1 });",
    sourceId,
  });
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.exports.flatMap((entry) =>
      entry.kind === "star" ? [] : [entry.exportedName],
    ),
    ["value", "fallback"],
  );
});

test("converts object binding rest to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const key = 'picked';\n" +
      "const { [key]: value, ...rest } = " +
      "{ picked: 1, retained: 2 };\n",
    sourceId: "object-binding-rest.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /\.\.\.%b\d+ rest/u);
  assert.match(printMir(result.mir), /object-rest CopyDataProperties/u);
  assert.doesNotMatch(JSON.stringify(result.hir), /RestElement/u);
});

test("converts destructuring assignments to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let first; let fallback; let nested; let rest;\n" +
      "let picked; let other;\n" +
      "const values = [1, undefined, [3], 4];\n" +
      "const result = " +
      "([first, fallback = 2, [nested], ...rest] = values);\n" +
      "({ picked, missing: fallback = 5, ...other } = " +
      "{ picked: 6, kept: 7 });\n" +
      "console.log(result === values, first, fallback, nested, " +
      "rest[0], picked, other.kept);\n",
    sourceId: "destructuring-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /write \[%b\d+ first, %b\d+ fallback = 2/u);
  assert.match(hir, /write \{"picked": %b\d+ picked/u);
  assert.match(mir, /IteratorClose for array binding/u);
  assert.match(mir, /object-rest CopyDataProperties/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|AssignmentPattern|RestElement/u,
  );
});

test("converts destructuring assignment member targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const target = { values: [0], rest: undefined };\n" +
      "let index = 0;\n" +
      "[target.values[index], ...target.rest] = [1, 2];\n" +
      "({ value: target.values[0], ...target.rest } = " +
      "{ value: 3, kept: 4 });\n",
    sourceId: "destructuring-assignment-members.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /write \[target /u);
  assert.match(hir, /target .*\["rest"\]/u);
  assert.match(mir, /destructuring member target/u);
  assert.match(mir, /property-set/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|AssignmentPattern|RestElement/u,
  );
});

test("converts parenthesized destructuring assignment member targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const target = { first: 0, second: 0 };\n" +
      "[(target.first)] = [1];\n" +
      "({ value: (target.second) } = { value: 2 });\n",
    sourceId: "parenthesized-destructuring-assignment-members.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /target .*\["first"\]/u);
  assert.match(hir, /target .*\["second"\]/u);
  assert.match(mir, /destructuring member target/u);
  assert.match(mir, /property-set/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|AssignmentPattern|RestElement/u,
  );
  assert.doesNotMatch(JSON.stringify(result.hir), /ParenthesizedExpression/u);
});

test("converts private destructuring assignment targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class Box {\n" +
      "  #first = 0;\n" +
      "  #rest;\n" +
      "  assign(input) {\n" +
      "    ({ value: this.#first, ...this.#rest } = input);\n" +
      "    return this.#first + this.#rest.extra;\n" +
      "  }\n" +
      "}\n",
    sourceId: "private-destructuring-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /target this\.%b\d+ #first/u);
  assert.match(hir, /target this\.%b\d+ #rest/u);
  assert.match(mir, /destructuring private target/u);
  assert.match(mir, /private-set destructuring private target/u);
});

test("rejects await inside destructuring assignment targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function assign(target, input) {\n" +
      "  [(await target).value] = input;\n" +
      "}\n",
    sourceId: "await-destructuring-target.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(result.mir, undefined);
});

test("rejects await inside parenthesized assignment targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function assign(target, input) {\n" +
      "  [((await target).value)] = input;\n" +
      "}\n",
    sourceId: "await-parenthesized-destructuring-target.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(result.mir, undefined);
});

test("supports awaited destructuring assignment in modules", () => {
  const sourceId = "file:///app/await-destructuring-assignment.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "let value;\n" +
      "[value] = await Promise.resolve([1]);\n" +
      "console.log(value);\n",
    sourceId,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "await-destructuring-assignment",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /GetIterator sync for array binding/u);
});

test("supports awaited destructuring assignment in async functions", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function unpack(input) {\n" +
      "  const target = {};\n" +
      "  [target.value] = await input;\n" +
      "  return target.value;\n" +
      "}\n" +
      "unpack(Promise.resolve([1]));\n",
    sourceId: "await-destructuring-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /GetIterator sync for array binding/u);
  assert.match(mir, /destructuring member target/u);
});

test("supports parenthesized awaited object assignments", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function unpack(input) {\n" +
      "  let value;\n" +
      "  ({ value } = (await input));\n" +
      "  return value;\n" +
      "}\n" +
      "unpack(Promise.resolve({ value: 1 }));\n",
    sourceId: "await-object-destructuring-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.match(printMir(result.mir), /GetV for object binding/u);
});

test("supports parenthesized direct await points", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function settle(input) {\n" +
      "  const value = (await input);\n" +
      "  (await input);\n" +
      "  return (await value);\n" +
      "}\n" +
      "settle(Promise.resolve(Promise.resolve(1)));\n",
    sourceId: "parenthesized-direct-await.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = [
    ...result.mir.script.blocks,
    ...result.mir.functions.flatMap((functionValue) => functionValue.blocks),
  ].flatMap((block) => block.operations);
  assert.equal(
    operations.filter(
      (operation) =>
        operation.target?.kind === "promise-intrinsic" &&
        operation.target.method === "awaitThen",
    ).length,
    3,
  );
});

test("converts catch binding patterns to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "try { throw { values: [1, 2], kept: 3 }; } " +
      "catch ({ values: [first, ...rest], ...other }) { " +
      "console.log(first, rest[0], other.kept); }",
    sourceId: "catch-bindings.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /catch \{"values": \[%b\d+ first/u);
  assert.match(hir, /\.\.\.%b\d+ other/u);
  assert.match(mir, /caught catch parameter/u);
  assert.match(mir, /IteratorClose for array binding/u);
  assert.match(mir, /object-rest CopyDataProperties/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|RestElement/u,
  );
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
