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

test("binds every var-scoped script name on the global object", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function shown() { return 1; }\n" +
      "var counted = 2;\n" +
      "if (counted) { var nested = 3; }\n" +
      "for (var stepped = 0; stepped < 1; stepped += 1) {}\n" +
      "let lexical = 4;\n" +
      "const fixed = 5;\n" +
      "class Named {}\n" +
      "function inner() { var hidden = 6; return hidden; }\n" +
      "console.log(shown(), counted, nested, stepped);\n" +
      "console.log(lexical, fixed, inner(), typeof Named);\n",
    sourceId: "global-object-names.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  // GlobalDeclarationInstantiation creates the function bindings before
  // the var names, and a lexical declaration, a class, and a name
  // declared inside a function are never global-object properties.
  const names = (result.hir.globalObjectBindings ?? []).map(
    (binding) => binding.name,
  );
  assert.deepEqual(names, ["shown", "inner", "counted", "nested", "stepped"]);
  // Each entry names the binding the script statement list writes, so
  // the property and the binding cannot become separate storage.
  const hirText = printHir(result.hir);
  for (const binding of result.hir.globalObjectBindings ?? []) {
    assert.match(
      hirText,
      new RegExp(`global-object %b${binding.id} ${binding.name}\\b`, "u"),
    );
  }
  assert.ok(result.mir != null);
  const mirText = printMir(result.mir);
  assert.match(mirText, /global-object %b\d+ shown/u);
  assert.doesNotMatch(mirText, /global-object %b\d+ lexical/u);
  assert.doesNotMatch(mirText, /global-object %b\d+ hidden/u);
  // Which ECMA-262 operation creates each property reaches MIR, because
  // it is what decides whether this profile's uniform property is the
  // one ECMA-262 would create.
  assert.deepEqual(
    result.mir.globalObjectBindings.map((binding) => [
      binding.name,
      binding.declaration,
    ]),
    [
      ["shown", "function"],
      ["inner", "function"],
      ["counted", "var"],
      ["nested", "var"],
      ["stepped", "var"],
    ],
  );
});

test("replaces a replaceable intrinsic global with a function", () => {
  // CreateGlobalFunctionBinding redefines a configurable intrinsic
  // property whole, which is this profile's writable, enumerable,
  // non-configurable property, so the declaration stays admitted.
  const result = compileSource(babelFrontend, {
    source: "function Symbol() { return 1; }\nconsole.log(typeof Symbol);\n",
    sourceId: "replaceable-global.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.deepEqual(
    result.mir.globalObjectBindings.map((binding) => binding.name),
    ["Symbol"],
  );
});

test("rejects a top-level declaration of an intrinsic global", () => {
  // GlobalDeclarationInstantiation answers each of these with behavior
  // the realm's global object does not carry yet: CreateGlobalVarBinding
  // leaves the existing property and its attributes alone, and
  // CanDeclareGlobalFunction throws a TypeError for a restricted
  // global. Creating this profile's uniform property instead would
  // silently differ, so each is reported where it is written.
  const cases = [
    { column: 5, name: "undefined", source: "var undefined = 1;\n" },
    { column: 5, name: "NaN", source: "var NaN = 1;\n" },
    { column: 1, name: "Infinity", source: "function Infinity() {}\n" },
    { column: 5, name: "Symbol", source: "var Symbol = 1;\n" },
    { column: 5, name: "TypeError", source: "var TypeError = 1;\n" },
  ];
  for (const { column, name, source } of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "intrinsic-global.ts",
    });
    assert.equal(result.hir, undefined);
    assert.equal(result.diagnostics.length, 1);
    const diagnostic = result.diagnostics[0];
    assert.equal(diagnostic?.code, "OSEO1001");
    assert.match(
      diagnostic?.message ?? "",
      new RegExp(`Declaring the intrinsic global '${name}' `, "u"),
    );
    // The diagnostic names the declaration that would create the
    // property rather than the whole program.
    assert.deepEqual(diagnostic?.range.start, { column, line: 1 });
  }
});

test("keeps an intrinsic global name usable inside module code", () => {
  // A module's var-scoped names are Module Environment Record bindings
  // and add nothing to the global object, so no collision exists.
  const sourceId = "file:///app/module-intrinsic-global.js";
  const parsed = babelModuleFrontend.parseModule({
    source: "var Symbol = 1;\nconsole.log(Symbol);\n",
    sourceId,
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "module-intrinsic-global",
        syntax: parsed.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.deepEqual(compiled.mir.globalObjectBindings, []);
});

test("keeps module code clear of global object bindings", () => {
  const sourceId = "file:///app/module-global-object.js";
  const parsed = babelModuleFrontend.parseModule({
    source:
      "var moduleVar = 1;\n" +
      "function moduleFunction() { return moduleVar; }\n" +
      "console.log(moduleFunction());\n",
    sourceId,
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "module-global-object",
        syntax: parsed.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  // Module code adds nothing to the global object, so a module's
  // var-scoped names stay ordinary module-level bindings.
  assert.deepEqual(compiled.mir.globalObjectBindings, []);
  assert.doesNotMatch(printMir(compiled.mir), /global-object %b/u);
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

test("admits a var declaration sharing a disjoint block function name", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function outer() {\n" +
      '  var inner = "outer";\n' +
      "  const readOuter = function () { return inner; };\n" +
      "  {\n" +
      '    function inner() { return "block"; }\n' +
      "  }\n" +
      "  return [readOuter(), inner];\n" +
      "}\n",
    sourceId: "var-block-function.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  const outer = /let %b(\d+) inner = undefined/u.exec(hir)?.[1];
  const blockFunction = /function-init %b(\d+) inner = @f\d+/u.exec(hir)?.[1];
  assert.ok(outer != null);
  assert.ok(blockFunction != null);
  assert.notEqual(blockFunction, outer);
});

test("admits a disjoint block generator or async function var name", () => {
  const cases = [
    ["function*", "generator-block-function.ts"],
    ["async function", "async-block-function.ts"],
    ["async function*", "async-generator-block-function.ts"],
  ] as const;
  for (const [keyword, sourceId] of cases) {
    const result = compileSource(babelFrontend, {
      source:
        "function outer() {\n" +
        "  var inner;\n" +
        `  { ${keyword} inner() {} }\n` +
        "  return inner;\n" +
        "}\n",
      sourceId,
    });
    assert.deepEqual(result.diagnostics, [], sourceId);
  }
});

test("admits a block function name sharing a sibling block var name", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function outer() {\n" +
      "  { function inner() {} }\n" +
      "  { var inner; }\n" +
      "  return inner;\n" +
      "}\n",
    sourceId: "var-block-function-sibling.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("admits a var sharing a block function name in a module", () => {
  const result = babelModuleFrontend.parseModule({
    source:
      'var inner = "outer";\n' +
      "let readOuter;\n" +
      "{\n" +
      "  readOuter = function () { return inner; };\n" +
      '  function inner() { return "block"; }\n' +
      "}\n" +
      "export const retained = [readOuter(), inner];\n",
    sourceId: "file:///app/var-block-function.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/var-block-function.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/var-block-function.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "var-block-function",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
});

test("rejects a var declaration sharing its own block's function name", () => {
  const result = compileSource(babelFrontend, {
    source: "function outer() { { var inner; function inner() {} } }",
    sourceId: "var-block-function-same-scope.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
});

test("rejects a var nested under its block function's own block", () => {
  const result = compileSource(babelFrontend, {
    source: "function outer() { { function inner() {} { var inner; } } }",
    sourceId: "var-block-function-nested.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
});

test("keeps block-scoped let clear of later var declarations", () => {
  const result = compileSource(babelFrontend, {
    source: "{ let value = 1; console.log(value); } var value = 2;",
    sourceId: "var-disjoint.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("admits var declarations sharing a simple catch parameter name", () => {
  const result = compileSource(babelFrontend, {
    source:
      'var caught = "outer";\n' +
      'try { throw "inner"; } catch (caught) {\n' +
      '  var caught = "catch";\n' +
      "  console.log(caught);\n" +
      "}\n" +
      "console.log(caught);\n",
    sourceId: "var-catch.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  const outer = /let %b(\d+) caught = undefined/u.exec(hir)?.[1];
  const caught = /catch %b(\d+) caught/u.exec(hir)?.[1];
  assert.ok(outer != null);
  assert.ok(caught != null);
  assert.notEqual(caught, outer);
  assert.match(hir, new RegExp(`%b${caught} caught = "catch"`, "u"));
});

test("admits a same-name catch var initializer in a module", () => {
  const result = babelModuleFrontend.parseModule({
    source:
      'var caught = "outer";\n' +
      'try { throw "inner"; } catch (caught) {\n' +
      '  var caught = "catch";\n' +
      "}\n" +
      "export const retained = caught;\n",
    sourceId: "file:///app/var-catch.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/var-catch.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/var-catch.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "var-catch",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
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

test("keeps a catch parameter distinct from body lexical declarations", () => {
  const result = compileSource(babelFrontend, {
    source: "try { throw 1; } catch (caught) { let caught = 2; }",
    sourceId: "lexical-catch.ts",
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
  assert.match(hir, /target this strict\.%b\d+ #first/u);
  assert.match(hir, /target this strict\.%b\d+ #rest/u);
  assert.match(mir, /destructuring private target/u);
  assert.match(mir, /private-set destructuring private target/u);
});

// The assignment reference is prepared before the iterator step that
// selects its value, so an `await` in the target's own base suspends
// the traced frame before the step and resumes holding the reference.
test("admits await inside destructuring assignment targets", () => {
  for (const [sourceId, target] of [
    ["await-destructuring-target.ts", "(await target).value"],
    ["await-parenthesized-destructuring-target.ts", "((await target).value)"],
    ["await-computed-destructuring-target.ts", "target[await key]"],
  ] as const) {
    const result = compileSource(babelFrontend, {
      source:
        "async function assign(target, key, input) {\n" +
        `  [${target}] = input;\n` +
        "}\n",
      sourceId,
    });
    assert.deepEqual(result.diagnostics, [], sourceId);
    assert.ok(result.mir != null, sourceId);
    const assign = result.mir.functions.find(
      (candidate) => candidate.name === "assign",
    );
    assert.ok(assign != null, sourceId);
    const suspensions = assign.blocks.filter(
      (block) => block.terminator.kind === "generator-yield",
    );
    assert.equal(suspensions.length, 1, sourceId);
    const printed = printMir(result.mir);
    assert.match(printed, /destructuring member target/u);
    // The suspension precedes the step that selects the stored value.
    const suspensionIndex = printed.indexOf("generator-await");
    const stepIndex = printed.indexOf("IteratorStepValue for array binding");
    assert.ok(suspensionIndex >= 0 && suspensionIndex < stepIndex, sourceId);
  }
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

/* Module top level suspends through the module continuation transform,
 * which splits statements around whole `await` expressions rather than
 * around the steps of a pattern. Each pattern position therefore keeps a
 * source-located rejection there, while an asynchronous function written
 * in the same module admits every one of them. */
test("rejects module top-level pattern await at its statement", () => {
  const rejected: readonly string[] = [
    "const { value = await 1 } = {};\n",
    "const [value = await 1] = [];\n",
    "const { [await 'k']: value } = {};\n",
    "const target = {};\n[target[await 'k']] = [1];\n",
    "try { throw {}; } catch ({ value = await 1 }) { value; }\n",
    "const target = {};\nfor ([target[await 'k']] of [[1]]) target;\n",
  ];
  for (const source of rejected) {
    const sourceId = "file:///app/module-pattern-await.js";
    const parsed = babelModuleFrontend.parseModule({ source, sourceId });
    assert.deepEqual(parsed.diagnostics, [], source);
    assert.ok(parsed.module != null, source);
    const compiled = compileModuleGraph({
      entryId: sourceId,
      kind: "module-graph",
      modules: [
        {
          canonicalId: sourceId,
          dependencies: [],
          resolutions: [],
          sourceHash: "module-pattern-await",
          syntax: parsed.module,
        },
      ],
    });
    assert.equal(compiled.mir, undefined, source);
    const diagnostic = compiled.diagnostics[0];
    assert.equal(diagnostic?.code, "OSEO1001", source);
    assert.match(
      diagnostic?.message ?? "",
      /await inside a module top-level binding or assignment pattern/iu,
      source,
    );
    assert.equal(diagnostic?.sourceId, sourceId, source);
    assert.ok((diagnostic?.range.start.line ?? 0) >= 1, source);
  }
});

test("admits pattern await inside a module's async function", () => {
  const sourceId = "file:///app/module-async-pattern-await.js";
  const parsed = babelModuleFrontend.parseModule({
    source:
      "export async function unpack(input, key) {\n" +
      "  const { [await key]: first = await input } = {};\n" +
      "  const target = {};\n" +
      "  [target[await key]] = [first];\n" +
      "  return target;\n" +
      "}\n",
    sourceId,
  });
  assert.deepEqual(parsed.diagnostics, []);
  assert.ok(parsed.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "module-async-pattern-await",
        syntax: parsed.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const unpack = compiled.mir.functions.find(
    (candidate) => candidate.name === "unpack",
  );
  assert.equal(unpack?.asyncFunction, true);
  assert.equal(
    unpack?.blocks.filter(
      (block) => block.terminator.kind === "generator-yield",
    ).length,
    3,
  );
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
  const asynchronous = result.mir.functions.find(
    (functionValue) => functionValue.asyncFunction === true,
  );
  assert.equal(
    asynchronous?.blocks.filter(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
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

test("converts an optional catch binding to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let handled = false;\n" +
      'try { throw new RangeError("discarded"); } catch { handled = true; }\n' +
      "try { console.log(handled); } catch {} finally {\n" +
      '  console.log("finally", handled);\n' +
      "}\n",
    sourceId: "optional-catch-binding.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.syntax != null);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const first = result.syntax.body[1];
  assert.equal(first?.kind, "try");
  if (first?.kind !== "try") return;
  assert.ok(first.handler != null);
  assert.equal(first.handler?.pattern, undefined);
  const second = result.syntax.body[2];
  assert.equal(second?.kind, "try");
  if (second?.kind !== "try") return;
  assert.equal(second.handler?.pattern, undefined);
  assert.ok(second.finalizer != null);
  const hir = printHir(result.hir);
  assert.match(hir, /^\s*catch$/mu);
  const mir = printMir(result.mir);
  assert.match(mir, /caught discarded catch value/u);
  assert.doesNotMatch(mir, /caught catch parameter/u);
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

test("admits a multi-declarator lexical declaration list", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let first = 1, second = first + 1;\n" +
      "const third = second + 1, fourth = third + 1;\n" +
      "console.log(first, second, third, fourth);\n",
    sourceId: "lexical-declaration-list.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  // Every declarator is a sibling of the statement list that contains
  // the declaration, so the list never introduces its own scope.
  const declarations = hirText
    .split("\n")
    .filter((line) => /^ {2}(?:const|let) %b\d+ /u.test(line))
    .map((line) => line.replace(/^ {2}(const|let) %b\d+ (\w+).*$/u, "$1 $2"));
  assert.deepEqual(declarations, [
    "let first",
    "let second",
    "const third",
    "const fourth",
  ]);
  assert.doesNotMatch(hirText, /^\s*block/mu);
});

test("gives each declaration-list name exactly one lexical cell", () => {
  const result = compileSource(babelFrontend, {
    source:
      "{\n" +
      "  let first = 1, second = 2;\n" +
      "  console.log(first, second);\n" +
      "}\n",
    sourceId: "declaration-list-cells.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const mirText = printMir(result.mir);
  // A false nested block would reset the same cells twice and break the
  // identity of a closure captured between the two resets.
  for (const name of ["first", "second"]) {
    assert.equal(
      mirText.split(`fresh lexical cell for ${name}`).length - 1,
      1,
      `expected exactly one cell reset for ${name}`,
    );
  }
});

test("predeclares every list name before the first initializer", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let outcome = 'none';\n" +
      "try {\n" +
      "  const read = () => later;\n" +
      "  let first = read(), later = 2;\n" +
      "  console.log(first, later);\n" +
      "} catch (error) {\n" +
      "  outcome = error.name;\n" +
      "}\n" +
      "console.log(outcome);\n",
    sourceId: "declaration-list-tdz.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  // The closure the first initializer calls reads the binding the second
  // declarator declares, rather than an outer or unresolved name, so the
  // read reaches that binding's temporal dead zone.
  const declared = /let %b(\d+) later = 2/u.exec(hirText)?.[1];
  assert.ok(declared != null);
  assert.match(hirText, new RegExp(`return %b${declared}\\(later\\)`, "u"));
  // Both declarators of the list are siblings inside the try block, so
  // the first one is resolved before the second one is written.
  const firstIndex = hirText.indexOf("let %b2 first = call");
  const laterIndex = hirText.indexOf(`let %b${declared} later = 2`);
  assert.ok(firstIndex >= 0 && firstIndex < laterIndex);
});

test("admits patterns and bare names inside a lexical declaration list", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [first, second] = [1, 2], { third } = { third: 3 };\n" +
      "let fourth, fifth = first + second + third;\n" +
      "console.log(first, second, third, fourth, fifth);\n",
    sourceId: "declaration-list-patterns.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /const declare \[%b\d+ first/u);
  assert.match(hirText, /const declare \{"third": %b\d+ third\}/u);
  assert.match(hirText, /let %b\d+ fourth = undefined/u);
});

test("keeps a declaration list out of a nested lexical scope", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let captured;\n" +
      "{\n" +
      "  let counter = 0, reader = () => counter;\n" +
      "  counter = counter + 1;\n" +
      "  captured = reader;\n" +
      "}\n" +
      "console.log(captured());\n",
    sourceId: "declaration-list-closure.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const mirText = printMir(result.mir);
  assert.equal(
    mirText.split("fresh lexical cell for counter").length - 1,
    1,
    "the captured cell is created once for the block",
  );
});

test("admits a declaration list in a switch clause and a static block", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class Holder {\n" +
      "  static value;\n" +
      "  static {\n" +
      "    let first = 1, second = first + 1;\n" +
      "    Holder.value = first + second;\n" +
      "  }\n" +
      "}\n" +
      "switch (Holder.value) {\n" +
      "  case 3: {\n" +
      "    let inner = 1, other = inner + 1;\n" +
      "    console.log(inner, other);\n" +
      "    break;\n" +
      "  }\n" +
      "  default:\n" +
      "    let fallback = 0, spare = fallback;\n" +
      "    console.log(fallback, spare);\n" +
      "}\n",
    sourceId: "declaration-list-positions.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /let %b\d+ second/u);
  assert.match(hirText, /let %b\d+ other/u);
  assert.match(hirText, /let %b\d+ spare/u);
});

test("admits awaited initializers in a declaration list", () => {
  const result = compileSource(babelFrontend, {
    source:
      "async function run() {\n" +
      "  let first = await Promise.resolve(1), second = first + 1;\n" +
      "  const third = await Promise.resolve(second), fourth = third + 1;\n" +
      "  return fourth;\n" +
      "}\n" +
      "run().then(function (value) { console.log(value); });\n",
    sourceId: "declaration-list-await.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const asynchronous = result.mir.functions.find(
    (functionValue) => functionValue.asyncFunction === true,
  );
  assert.equal(
    asynchronous?.blocks.filter(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ).length,
    2,
  );
});

test("exports every name of a module lexical declaration list", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export let first = 1, second = first + 1;\n",
    sourceId: "file:///app/export-list.js",
  });
  assert.ok(result.parsed);
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.exports.map((entry) =>
      entry.kind === "local" ? entry.exportedName : entry.kind,
    ),
    ["first", "second"],
  );
});

test("awaits a module declaration list initializer at top level", () => {
  const result = babelModuleFrontend.parseModule({
    source:
      "let first = await Promise.resolve(1), second = first + 1;\n" +
      "console.log(first, second);\n",
    sourceId: "file:///app/module-list-await.js",
  });
  assert.ok(result.parsed);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/module-list-await.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/module-list-await.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "module-list-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
});

test("keeps lexical declaration list early errors", () => {
  const rejected = [
    ["duplicate-in-list.ts", "let first = 1, first = 2;\n"],
    ["duplicate-const-in-list.ts", "const first = 1, first = 2;\n"],
    [
      "duplicate-across-lists.ts",
      "let first = 1;\nlet second = 2, first = 3;\n",
    ],
    ["const-without-initializer.ts", "const first = 1, second;\n"],
    ["var-redeclares-list.ts", "let first = 1, second = 2;\nvar second = 3;\n"],
    ["list-in-if-body.ts", "if (1) let first = 1, second = 2;\n"],
    ["list-in-label-body.ts", "outer: let first = 1, second = 2;\n"],
  ] as const;
  for (const [sourceId, source] of rejected) {
    const result = compileSource(babelFrontend, { source, sourceId });
    assert.equal(result.diagnostics.length, 1, sourceId);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", sourceId);
  }
});
