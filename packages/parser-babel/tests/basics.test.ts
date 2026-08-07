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

test("preserves function source and lowers the Function intrinsic", () => {
  const source = `console.log(Function);
function sample(value) { return value; }
`;
  const parsed = babelFrontend.parse({ source, sourceId: "function.ts" });
  assert.ok(parsed.parsed);
  const declaration = parsed.program?.body[1];
  assert.equal(declaration?.kind, "function");
  if (declaration?.kind !== "function") return;
  assert.equal(
    declaration.sourceText,
    "function sample(value) { return value; }",
  );

  const compiled = compileSource(babelFrontend, {
    source,
    sourceId: "function.ts",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.hir != null);
  assert.ok(compiled.mir != null);
  assert.match(printHir(compiled.hir), /intrinsic Function/u);
  assert.match(
    printMir(compiled.mir),
    /function-intrinsic intrinsic Function/u,
  );
  const sample = compiled.mir.script.blocks
    .flatMap((block) => block.operations)
    .find(
      (operation) =>
        operation.kind === "function-create" &&
        operation.functionName === "sample",
    );
  assert.equal(sample?.functionSource, declaration.sourceText);

  for (const dynamicSource of ["Function('return 1')", "new Function()"]) {
    const rejected = compileSource(babelFrontend, {
      source: dynamicSource,
      sourceId: "dynamic-function.ts",
    });
    assert.equal(rejected.mir, undefined);
    assert.match(
      rejected.diagnostics[0]?.message ?? "",
      /Function constructor requires dynamic source/u,
    );
  }
});

test("resolves typeof Function and rejects deleting its binding", () => {
  const typeofResult = compileSource(babelFrontend, {
    source: "console.log(typeof Function);",
    sourceId: "typeof-function.ts",
  });
  assert.deepEqual(typeofResult.diagnostics, []);
  assert.ok(typeofResult.hir != null);
  assert.match(printHir(typeofResult.hir), /intrinsic Function/u);

  const deleteResult = compileSource(babelFrontend, {
    source: "delete Function;",
    sourceId: "delete-function.ts",
  });
  assert.equal(deleteResult.mir, undefined);
  assert.match(
    deleteResult.diagnostics[0]?.message ?? "",
    /Deleting runtime intrinsic binding 'Function'/u,
  );
});

test("lets with object environments shadow the Function intrinsic", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function custom() { return {}; }\n" +
      "with ({ Function: custom }) { Function(); new Function(); }",
    sourceId: "with-function.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.equal(
    printHir(result.hir).match(
      /with\[%b\d+\] Function fallback intrinsic Function/gu,
    )?.length,
    2,
  );
});

test("lowers the Iterator intrinsic as a replaceable global value", () => {
  const result = compileSource(babelFrontend, {
    source:
      "console.log(typeof Iterator, Iterator.from);\n" +
      "class Local extends Iterator {}",
    sourceId: "iterator-intrinsic.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /intrinsic Iterator/u);
  assert.match(printMir(result.mir), /iterator-intrinsic intrinsic Iterator/u);

  const deleted = compileSource(babelFrontend, {
    source: "delete Iterator;",
    sourceId: "delete-iterator.ts",
  });
  assert.equal(deleted.mir, undefined);
  assert.match(
    deleted.diagnostics[0]?.message ?? "",
    /Deleting runtime intrinsic binding 'Iterator'/u,
  );
});

test("reads the replaceable Number value through its global property", () => {
  const result = compileSource(babelFrontend, {
    source: "console.log(typeof Number, Number.isFinite(1));",
    sourceId: "number-intrinsic.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /\*intrinsic global object\* = this global/u);
  assert.match(hir, /"Number" in %b\d+\(\*intrinsic global object\*\)/u);
  assert.match(hir, /get %b\d+\(\*intrinsic global object\*\)\["Number"\]/u);
  assert.match(mir, /global-this global this/u);
  assert.match(mir, /binary in/u);
  assert.match(mir, /read \*missing intrinsic:Number\*/u);
  assert.doesNotMatch(mir, /number-intrinsic intrinsic Number/u);

  const deleted = compileSource(babelFrontend, {
    source: "delete Number;",
    sourceId: "delete-number.ts",
  });
  assert.equal(deleted.mir, undefined);
  assert.match(
    deleted.diagnostics[0]?.message ?? "",
    /Deleting runtime intrinsic binding 'Number'/u,
  );

  const withWrite = compileSource(babelFrontend, {
    source: "with ({}) { Number = 1; }",
    sourceId: "with-number-write.ts",
  });
  assert.equal(withWrite.mir, undefined);
  assert.match(
    withWrite.diagnostics[0]?.message ?? "",
    /Assigning property-owned intrinsic 'Number' through a with fallback/u,
  );
});

test("reads the replaceable Object value through its global property", () => {
  const result = compileSource(babelFrontend, {
    source:
      "console.log(typeof Object, Object.is(NaN, NaN), " +
      "Object.getPrototypeOf({}) === Object.prototype);",
    sourceId: "object-constructor.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /\*intrinsic global object\* = this global/u);
  assert.match(hir, /"Object" in %b\d+\(\*intrinsic global object\*\)/u);
  assert.match(hir, /get %b\d+\(\*intrinsic global object\*\)\["Object"\]/u);
  assert.match(mir, /global-this global this/u);
  assert.match(mir, /binary in/u);
  assert.match(mir, /read \*missing intrinsic:Object\*/u);
});

test("writes the replaceable Number value through its global property", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const original = Number; Number = 40; Number += 2; " +
      "console.log(Number++, ++Number); Number = original;",
    sourceId: "number-global-write.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(
    hir,
    /set %b\d+\(\*intrinsic global object\*\)\["Number"\] = 40/u,
  );
  assert.match(
    hir,
    /update %b\d+\(\*intrinsic global object\*\)\["Number"\] \+= 2/u,
  );
  assert.match(
    hir,
    /update %b\d+\(\*intrinsic global object\*\)\["Number"\]\+\+/u,
  );
  assert.match(
    hir,
    /\+\+update %b\d+\(\*intrinsic global object\*\)\["Number"\]/u,
  );
  const mir = printMir(result.mir);
  assert.equal(mir.match(/property-set property-set/gu)?.length, 5);
  assert.equal(mir.match(/property-get property-get/gu)?.length, 3);
});

test("writes Number assignment targets through its global property", () => {
  const result = compileSource(babelFrontend, {
    source:
      "({ value: Number } = { value: 1 }); [Number] = [2];\n" +
      "for (Number of [3]) {}\n" +
      "for ({ value: Number } of [{ value: 4 }]) {}\n" +
      "for (Number in { key: true }) {}\n" +
      "for ({ 0: Number } in { key: true }) {}",
    sourceId: "number-global-targets.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.doesNotMatch(hir, /%b\d+ Number/u);
  assert.equal(
    hir.match(/\*intrinsic global object\*\)\["Number"\]/gu)?.length,
    6,
  );
});

test("starts static class method source at the method definition", () => {
  const source = `class C {
  static /* omitted */ plain() {}
  static /* omitted */ get getter() {}
  static /* omitted */ set setter(value) {}
  static /* omitted */ *generator() {}
  static /* omitted */ #privateMethod() {}
  static /* omitted */ get #privateGetter() {}
  static /* omitted */ set #privateSetter(value) {}
  static /* omitted */ *#privateGenerator() {}
}`;
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "static-method-source.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const functionSources = [result.mir.script, ...result.mir.functions]
    .flatMap((functionValue) => functionValue.blocks)
    .flatMap((block) => block.operations)
    .flatMap((operation) =>
      operation.kind === "function-create" ? [operation.functionSource] : [],
    )
    .filter((value): value is string => value != null);
  assert.deepEqual(functionSources.slice(1), [
    "plain() {}",
    "get getter() {}",
    "set setter(value) {}",
    "*generator() {}",
    "#privateMethod() {}",
    "get #privateGetter() {}",
    "set #privateSetter(value) {}",
    "*#privateGenerator() {}",
  ]);
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

test("preserves compound assignment references in owned IR", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let value = 1; const target = { item: 2 };\n" +
      "value += 3;\n" +
      "target.item &&= 4;\n",
    sourceId: "compound-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /value \+= 3/u);
  assert.match(hir, /update .*"item".* &&= 4/u);
  const mir = printMir(result.mir);
  assert.equal(mir.match(/property-get property-get/gu)?.length, 1);
  assert.equal(mir.match(/property-set property-set/gu)?.length, 1);
});

test("preserves prefix and postfix update references in owned IR", () => {
  const result = compileSource(babelFrontend, {
    source:
      'let value = "1"; const target = { item: "4" };\n' +
      "console.log(value++, ++value, target.item--, --target.item);\n",
    sourceId: "update-expression.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /value\+\+/u);
  assert.match(hir, /\+\+%b\d+ value/u);
  assert.match(hir, /target.*"item".*--/u);
  assert.match(hir, /--.*target.*"item"/u);
  const mir = printMir(result.mir);
  assert.equal(mir.match(/property-get property-get/gu)?.length, 2);
  assert.equal(mir.match(/property-set property-set/gu)?.length, 2);
});

test("preserves exact BigInt literals and numeric update lowering", () => {
  const result = compileSource(babelFrontend, {
    source:
      "/** @type {bigint} */ let value: bigint = " +
      "123_456_789_012_345_678_901n;\n" +
      "console.log(0b1010_0101n, 0o765n, 0xdead_beefn, value++);\n",
    sourceId: "bigint-literals.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /123456789012345678901n/u);
  assert.match(hir, /0b10100101n/u);
  assert.match(hir, /0o765n/u);
  assert.match(hir, /0xdeadbeefn/u);
  const mir = printMir(result.mir);
  assert.match(mir, /constant 10:123456789012345678901/u);
  assert.match(mir, /unary to-numeric/u);
  assert.match(mir, /unary numeric-one/u);
});

test("normalizes invalid BigInt literal diagnostics", () => {
  const result = babelFrontend.parse({
    source: "console.log(01n);",
    sourceId: "invalid-bigint.js",
  });
  assert.ok(!result.parsed);
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.equal(result.diagnostics[0]?.sourceId, "invalid-bigint.js");
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

test("binds arguments in every owning function form", () => {
  const admitted = compileSource(babelFrontend, {
    source:
      "function declared() { return arguments; }\n" +
      "const expressed = function () { return arguments.length; };\n" +
      "const object = { method() { return arguments[0]; } };\n" +
      'function strict() { "use strict"; return arguments.length; }\n' +
      "function outer() { return () => arguments.length; }\n" +
      "async function asynchronous() { return arguments.length; }\n" +
      "async function* asyncGenerated() { yield arguments.length; }\n" +
      "function* generated() { yield arguments.length; }\n" +
      "class Value {\n" +
      "  constructor() { this.count = arguments.length; }\n" +
      "  method() { return arguments.length; }\n" +
      "}\n",
    sourceId: "arguments-object.ts",
  });
  assert.deepEqual(admitted.diagnostics, []);
  assert.ok(admitted.hir != null);
  assert.ok(admitted.mir != null);

  // An arrow declares none of its own, so one with no enclosing owning
  // form leaves the name unresolved, exactly as a top-level reference does.
  const rejectedSources = [
    "const lexical = () => arguments;",
    "const asynchronousLexical = async () => arguments;",
    "const nested = () => () => arguments.length;",
    "arguments;",
  ];
  for (const [index, source] of rejectedSources.entries()) {
    const rejected = compileSource(babelFrontend, {
      source,
      sourceId: `unsupported-arguments-${index}.ts`,
    });
    assert.equal(rejected.mir, undefined);
    assert.match(
      rejected.diagnostics[0]?.message ?? "",
      /Unknown binding 'arguments'/u,
    );
  }
});

test("suppresses the implicit binding for every arguments formal", () => {
  // FunctionDeclarationInstantiation tests BoundNames of the formals, so
  // a defaulted or destructured formal named `arguments` suppresses the
  // implicit object even though a parameter environment lowers it to a
  // synthetic parameter name whose own binding a parameter initializer
  // creates. The deterministic list is the regression guard: the observable
  // output cannot see the difference, because the parameter's own binding
  // shadows an implicit one either way.
  const suppressing = [
    "arguments",
    "arguments = 1",
    "{ arguments }",
    "[arguments]",
    "...arguments",
    "first, arguments = first",
  ];
  for (const formals of suppressing) {
    const result = compileSource(babelFrontend, {
      source: `function inspect(${formals}) { return arguments; }\n`,
      sourceId: "arguments-formal.js",
    });
    assert.deepEqual(result.diagnostics, [], formals);
    const inspect = result.hir?.functions.find(
      (functionValue) => functionValue.name === "inspect",
    );
    assert.equal(inspect?.argumentsBindingId, undefined, formals);
    assert.equal(inspect?.argumentsMapped, undefined, formals);
    assert.equal(result.syntax?.body[0]?.kind, "function", formals);
    const declaration = result.syntax?.body[0];
    if (declaration?.kind === "function") {
      assert.equal(declaration.argumentsFormal, true, formals);
    }
  }

  // A formal that does not bind the name leaves the implicit object in
  // place, including when its own default makes the list non-simple.
  for (const formals of ["", "a", "a = 1", "{ a }", "...rest"]) {
    const result = compileSource(babelFrontend, {
      source: `function inspect(${formals}) { return arguments; }\n`,
      sourceId: "ordinary-formal.js",
    });
    assert.deepEqual(result.diagnostics, [], formals);
    const inspect = result.hir?.functions.find(
      (functionValue) => functionValue.name === "inspect",
    );
    assert.ok(inspect?.argumentsBindingId != null, formals);
  }
});

test("converts function binding patterns through owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "/** @param {number} first @param {string} value */\n" +
      "function read([first, second = 2, ...rest], " +
      "{ value, ...remaining }, scale: number) {\n" +
      "  return [first, second, rest, value, remaining, scale];\n" +
      "}\n" +
      "const arrow = ({ value }) => value;\n",
    sourceId: "parameter-patterns.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.equal(result.mir.functions.length, 2);
  const declaration = result.syntax?.body[0];
  assert.equal(declaration?.kind, "function");
  if (declaration?.kind !== "function") return;
  assert.deepEqual(
    declaration.parameters[2]?.hints.map((hint) => hint.provenance),
    ["typescript"],
  );
  const hir = printHir(result.hir);
  assert.match(hir, /\[%b\d+ first hints=\[jsdoc:number\], %b\d+ second = 2/u);
  assert.match(
    hir,
    /\{"value": %b\d+ value hints=\[jsdoc:string\], \.\.\.%b\d+ remaining\}/u,
  );
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|RestElement/u,
  );
});

test("maps structured parameter annotations to binding hints", () => {
  const result = compileSource(babelFrontend, {
    source:
      "/** @param {string} count */\n" +
      "function read(\n" +
      "  [count, { label: renamed }]: [number, { label: string }],\n" +
      "  { enabled, nested: [value] }:\n" +
      "    { enabled: boolean; nested: [number] },\n" +
      "  [first, second]: readonly string[],\n" +
      ") {\n" +
      "  return [count, renamed, enabled, value, first, second];\n" +
      "}\n",
    sourceId: "structured-parameter-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /count hints=\[typescript:number,jsdoc:string\]/u);
  assert.match(hir, /renamed hints=\[typescript:string\]/u);
  assert.match(hir, /enabled hints=\[typescript:boolean\]/u);
  assert.match(hir, /value hints=\[typescript:number\]/u);
  assert.match(hir, /first hints=\[typescript:string\]/u);
  assert.match(hir, /second hints=\[typescript:string\]/u);
});

test("maps tuple rest annotations to following binding elements", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function read(\n" +
      "  [head, middle, tail]: [string, ...number[]],\n" +
      ") {\n" +
      "  return [head, middle, tail];\n" +
      "}\n",
    sourceId: "tuple-rest-parameter-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /head hints=\[typescript:string\]/u);
  assert.match(hir, /middle hints=\[typescript:number\]/u);
  assert.match(hir, /tail hints=\[typescript:number\]/u);
});

test("maps fixed tuple spreads before following binding elements", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [first, second, third]:\n" +
      "  [...[number, string], boolean] = [1, 'two', true];\n" +
      "const [variable, variableSuffix]:\n" +
      "  [...number[], boolean] = [1, true];\n" +
      "const [reference, referenceSuffix]:\n" +
      "  [...Array<number>, boolean] = [1, true];\n" +
      "const [restHead, ...[restMiddle, restTail]]:\n" +
      "  [...[number, string], boolean] = [1, 'two', true];\n" +
      "console.log(\n" +
      "  first, second, third, variable, variableSuffix,\n" +
      "  reference, referenceSuffix, restHead, restMiddle, restTail,\n" +
      ");\n",
    sourceId: "fixed-tuple-spread-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /first hints=\[typescript:number\]/u);
  assert.match(hir, /second hints=\[typescript:string\]/u);
  assert.match(hir, /third hints=\[typescript:boolean\]/u);
  assert.doesNotMatch(hir, /variable hints=/u);
  assert.doesNotMatch(hir, /variableSuffix hints=/u);
  assert.doesNotMatch(hir, /reference hints=/u);
  assert.doesNotMatch(hir, /referenceSuffix hints=/u);
  assert.match(hir, /restHead hints=\[typescript:number\]/u);
  assert.match(hir, /restMiddle hints=\[typescript:string\]/u);
  assert.match(hir, /restTail hints=\[typescript:boolean\]/u);
});

test("rejects unsupported members exposed by fixed tuple spreads", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const input = [1, 'two', true];\n" +
      "const [first, unresolved, third]:\n" +
      "  [...[number, Value], boolean] = input;\n",
    sourceId: "fixed-tuple-spread-unsupported-hints.ts",
  });
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(
    result.diagnostics[0]?.message,
    "This TypeScript type is not an M1 hint.",
  );
});

test("maps structured annotations in declaration binding contexts", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const { top }: { top: number } = { top: 1 };\n" +
      "const { optional }: { optional?: number } = {};\n" +
      "const [maybe]: [number?] = [];\n" +
      "for (\n" +
      "  let [{ flag }]: [{ flag: boolean }] = [{ flag: true }];\n" +
      "  false;\n" +
      ") {}\n",
    sourceId: "structured-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /top hints=\[typescript:number\]/u);
  assert.match(hir, /flag hints=\[typescript:boolean\]/u);
  assert.doesNotMatch(hir, /optional hints=/u);
  assert.doesNotMatch(hir, /maybe hints=/u);
});

test("ignores nested structured annotation shape mismatches", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [[arrayValue], arraySibling]: [number, string] = " +
      "[[1], 'two'];\n" +
      "const [{ propertyValue }]: [number] = [{ propertyValue: 2 }];\n" +
      "const { nested: { objectValue }, objectSibling }:\n" +
      "  { nested: number; objectSibling: string } =\n" +
      "  { nested: { objectValue: 3 }, objectSibling: 'four' };\n" +
      "const { list: [listValue] }: { list: { value: number } } =\n" +
      "  { list: [5] };\n" +
      "console.log(\n" +
      "  arrayValue, arraySibling, propertyValue,\n" +
      "  objectValue, objectSibling, listValue,\n" +
      ");\n",
    sourceId: "nested-annotation-shape-mismatches.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.doesNotMatch(hir, /arrayValue hints=/u);
  assert.match(hir, /arraySibling hints=\[typescript:string\]/u);
  assert.doesNotMatch(hir, /propertyValue hints=/u);
  assert.doesNotMatch(hir, /objectValue hints=/u);
  assert.match(hir, /objectSibling hints=\[typescript:string\]/u);
  assert.doesNotMatch(hir, /listValue hints=/u);
});

test("ignores nested parameter annotation shape mismatches", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function read(\n" +
      "  [[arrayValue], arraySibling]: [number, string],\n" +
      "  { nested: { objectValue }, objectSibling }:\n" +
      "    { nested: number; objectSibling: string },\n" +
      ") {\n" +
      "  return [arrayValue, arraySibling, objectValue, objectSibling];\n" +
      "}\n",
    sourceId: "nested-parameter-annotation-shape-mismatches.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.doesNotMatch(hir, /arrayValue hints=/u);
  assert.match(hir, /arraySibling hints=\[typescript:string\]/u);
  assert.doesNotMatch(hir, /objectValue hints=/u);
  assert.match(hir, /objectSibling hints=\[typescript:string\]/u);
});

test("maps array annotations through nested rest patterns", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [head, ...[middle, tail]]: number[] = [1, 2, 3];\n" +
      "console.log(head, middle, tail);\n",
    sourceId: "nested-rest-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /head hints=\[typescript:number\]/u);
  assert.match(hir, /middle hints=\[typescript:number\]/u);
  assert.match(hir, /tail hints=\[typescript:number\]/u);
});

test("maps tuple annotations through nested rest conservatively", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [first, second, ...[trailing]]:\n" +
      "  [number, ...string[]] = [1, 'two', 'three'];\n" +
      "const [ambiguousHead, ...[ambiguousRest]]:\n" +
      "  [...number[], string] = [1, 2, 'three'];\n" +
      "const [referenceHead, referenceMiddle, ...[referenceRest]]:\n" +
      "  [number, ...Array<string>] = [1, 'two', 'three'];\n" +
      "const [spreadHead, spreadMiddle, ...[spreadRest]]:\n" +
      "  [number, ...[string, boolean]] = [1, 'two', true];\n" +
      "console.log(\n" +
      "  first, second, trailing, ambiguousHead, ambiguousRest,\n" +
      "  referenceHead, referenceMiddle, referenceRest,\n" +
      "  spreadHead, spreadMiddle, spreadRest,\n" +
      ");\n",
    sourceId: "nested-tuple-rest-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /first hints=\[typescript:number\]/u);
  assert.match(hir, /second hints=\[typescript:string\]/u);
  assert.match(hir, /trailing hints=\[typescript:string\]/u);
  assert.doesNotMatch(hir, /ambiguousHead hints=/u);
  assert.doesNotMatch(hir, /ambiguousRest hints=/u);
  assert.match(hir, /referenceHead hints=\[typescript:number\]/u);
  assert.doesNotMatch(hir, /referenceMiddle hints=/u);
  assert.doesNotMatch(hir, /referenceRest hints=/u);
  assert.match(hir, /spreadHead hints=\[typescript:number\]/u);
  assert.match(hir, /spreadMiddle hints=\[typescript:string\]/u);
  assert.match(hir, /spreadRest hints=\[typescript:boolean\]/u);
});

test("keeps object targets in array rest unhinted", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const [head, ...{ length: count }]: number[] = [1, 2, 3];\n" +
      "console.log(head, count);\n",
    sourceId: "object-rest-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /head hints=\[typescript:number\]/u);
  assert.doesNotMatch(hir, /count hints=/u);
});

test("keeps computed object binding keys unhinted", () => {
  const result = compileSource(babelFrontend, {
    source:
      'const { ["value"]: computed }: { value: number } = { value: 1 };\n' +
      "const { value: fixed }: { value: number } = { value: 2 };\n" +
      "console.log(computed, fixed);\n",
    sourceId: "computed-binding-hints.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.doesNotMatch(hir, /computed hints=/u);
  assert.match(hir, /fixed hints=\[typescript:number\]/u);
});

test("rejects pattern annotations that require type resolution", () => {
  for (const [name, source] of [
    [
      "resolved-parameter-hints",
      "function read({ value }: Parameters) { return value; }\n",
    ],
    [
      "resolved-declaration-hints",
      "const input = { value: 1 };\nconst { value }: Parameters = input;\n",
    ],
    [
      "resolved-var-hints",
      "const input = { value: 1 };\nvar { value }: Parameters = input;\n",
    ],
    [
      "resolved-for-hints",
      "const input = { value: 1 };\n" +
        "for (let { value }: Parameters = input; false; ) {}\n",
    ],
    [
      "resolved-array-hints",
      "const input = [1];\nconst [value]: Values = input;\n",
    ],
    [
      "resolved-nested-object-hints",
      "const { nested: { value } }: { nested: Parameters } = " +
        "{ nested: { value: 1 } };\n",
    ],
    ["resolved-nested-array-hints", "const [[value]]: [Values] = [[1]];\n"],
    [
      "resolved-nested-array-query-hints",
      "const values = [1];\nconst [[value]]: [typeof values] = [[1]];\n",
    ],
    [
      "resolved-nested-array-union-hints",
      "const [[value]]: [number | number[]] = [[1]];\n",
    ],
    [
      "resolved-nested-object-union-hints",
      "const { nested: { value } }:\n" +
        "  { nested: number | { value: number } } =\n" +
        "  { nested: { value: 1 } };\n",
    ],
  ] as const) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.equal(
      result.diagnostics[0]?.message,
      name === "resolved-array-hints" ||
        name === "resolved-nested-array-hints" ||
        name === "resolved-nested-array-query-hints" ||
        name === "resolved-nested-array-union-hints"
        ? "An array binding annotation must be an array or tuple type."
        : "An object binding annotation must be an inline object type.",
    );
  }
});

test("rejects root structured annotation shape mismatches", () => {
  for (const [name, source, message] of [
    [
      "array-with-object-annotation",
      "const [value]: { value: number } = [1];\n",
      "An array binding annotation must be an array or tuple type.",
    ],
    [
      "object-with-array-annotation",
      "const { value }: number[] = { value: 1 };\n",
      "An object binding annotation must be an inline object type.",
    ],
    [
      "parameter-array-with-object-annotation",
      "function read([value]: { value: number }) { return value; }\n",
      "An array binding annotation must be an array or tuple type.",
    ],
    [
      "parameter-object-with-array-annotation",
      "function read({ value }: number[]) { return value; }\n",
      "An object binding annotation must be an inline object type.",
    ],
  ] as const) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.equal(result.diagnostics[0]?.message, message);
  }
});

test("rejects annotations outside declaration binding contexts", () => {
  for (const [name, source] of [
    [
      "for-of-pattern-hints",
      "const input = [{ value: 1 }];\n" +
        "for (const { value }: { value: number } of input) {}\n",
    ],
    ["catch-pattern-hints", "try {} catch ({ value }: { value: number }) {}\n"],
  ] as const) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: `${name}.ts`,
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001");
    assert.equal(
      result.diagnostics[0]?.message,
      "TypeScript annotations on binding patterns are unsupported.",
    );
  }
});

test("converts synchronous default parameters through owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "/** @param {number} second */\n" +
      "function read(first, second: number = first + 1, " +
      "{ value } = { value: second + 1 }) {\n" +
      "  return [first, second, value];\n" +
      "}\n" +
      "const zero = (value = 1) => value;\n" +
      "const named = (value = function () {}) => value.name;\n",
    sourceId: "default-parameters.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.syntax != null);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const declaration = result.syntax.body[0];
  assert.equal(declaration?.kind, "function");
  if (declaration?.kind !== "function") return;
  assert.equal(declaration.functionLength, 1);
  assert.equal(declaration.parameters.length, 3);
  assert.deepEqual(
    declaration.parameters[1]?.hints.map((hint) => hint.provenance),
    ["typescript", "jsdoc"],
  );
  assert.equal(result.mir.functions[0]?.functionLength, 1);
  assert.equal(result.mir.functions[0]?.parameterCount, 3);
  assert.equal(result.mir.functions[1]?.functionLength, 0);
  const namedDefault = result.mir.functions.find(
    (functionValue) => functionValue.id === 2,
  );
  assert.ok(namedDefault != null);
  assert.match(
    JSON.stringify(namedDefault),
    /function @f3 name=\\"value\\" length=0/u,
  );
  const hir = printHir(result.hir);
  assert.match(hir, /second = .*first.* \+ 1/u);
  assert.match(
    hir,
    /\{"value": %b\d+ value\} = .*object\{"value": .*second.*\+ 1.*\}/u,
  );
  assert.doesNotMatch(JSON.stringify(result.hir), /AssignmentPattern/u);
});

test("converts synchronous rest parameters through owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function collect(first, ...rest) { return rest; }\n" +
      "const arrow = (...[first, ...rest]) => [first, rest];\n" +
      "function object(...{ 0: first, ...remaining }) {\n" +
      "  return [first, remaining];\n" +
      "}\n",
    sourceId: "rest-parameters.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.equal(result.mir.functions[0]?.functionLength, 1);
  assert.equal(result.mir.functions[0]?.parameterCount, 2);
  assert.equal(result.mir.functions[0]?.parameters[1]?.rest, true);
  assert.equal(result.mir.functions[1]?.functionLength, 0);
  assert.equal(result.mir.functions[1]?.parameters[0]?.rest, true);
  assert.equal(result.mir.functions[2]?.parameters[0]?.rest, true);
  const hir = printHir(result.hir);
  assert.match(hir, /collect\(%b\d+ first, \.\.\.%b\d+ rest\)/u);
  assert.ok(
    hir
      .split("\n")
      .some(
        (line) =>
          line.includes("...%b") && line.includes("\u0000oseo-parameter"),
      ),
  );
  const mir = printMir(result.mir);
  assert.match(mir, /function @f0 collect .* rest=\[\.\.\.1:rest\]/u);
  assert.doesNotMatch(JSON.stringify(result.hir), /RestElement/u);
});

test("separates parameter-expression bindings from body var bindings", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let capture;\n" +
      "function value(input = (capture = () => input, 1)) {\n" +
      "  var input = 2;\n" +
      "  return [input, capture()];\n" +
      "}\n" +
      "function pattern([input]) { var input; return input; }\n" +
      "function rest(...input) { var input; return input.length; }\n" +
      "function declarationOwner(input = 1) {\n" +
      "  function input() { return 9; }\n" +
      "  var input;\n" +
      "  return input();\n" +
      "}\n",
    sourceId: "parameter-var.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /function @f\d+ value/u);
  assert.match(hir, /function @f\d+ declarationOwner/u);
  assert.match(hir, /oseo-parameter-copy/u);
  assert.equal(hir.match(/oseo-parameter-copy/gu)?.length, 2);
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

test("resolves each this expression through its own environment", () => {
  const script = compileSource(babelFrontend, {
    source:
      "console.log(this);\n" +
      "const read = () => this;\n" +
      "function sloppy() { return this; }\n" +
      'function strictly() { "use strict"; return (() => this)(); }\n' +
      "const holder = { method() { return this; } };\n" +
      "class Owner { value() { return this; } }\n" +
      "function defaulted(value = this) { return value; }\n",
    sourceId: "script-this.ts",
  });
  assert.deepEqual(script.diagnostics, []);
  assert.ok(script.hir != null);
  const text = printHir(script.hir);
  // Script top level, a non-strict function, and a non-strict method all
  // resolve through a global this environment, and an arrow keeps the
  // mode of the position it is written in. A strict function and a class
  // body stop the substitution for themselves and their own arrows. A
  // parameter default reads the mode of the function it belongs to, not
  // the mode of the position the call is written in.
  assert.equal(text.match(/this global/gu)?.length, 5);
  assert.equal(text.match(/this strict/gu)?.length, 2);
  assert.doesNotMatch(text, /this module/u);
  assert.ok(script.mir != null);
  const mir = printMir(script.mir);
  assert.equal(mir.match(/global-this global this/gu)?.length, 5);
  assert.equal(mir.match(/= receiver this/gu)?.length, 2);

  const strictScript = compileSource(babelFrontend, {
    source:
      '"use strict";\n' +
      "console.log(this);\n" +
      "const read = () => this;\n" +
      "function defaulted(value = this) { return value; }\n",
    sourceId: "strict-script-this.ts",
  });
  assert.deepEqual(strictScript.diagnostics, []);
  assert.ok(strictScript.hir != null);
  // A Script's this binding lives in the Global Environment Record, so
  // a top-level directive does not turn it into a receiver read, while a
  // function the directive makes strict reads its own receiver.
  const strictText = printHir(strictScript.hir);
  assert.equal(strictText.match(/this global/gu)?.length, 2);
  assert.equal(strictText.match(/this strict/gu)?.length, 1);
});

test("rejects every binding position that declares this", () => {
  // The bootstrap parser accepts TypeScript's `this` parameter spelling
  // wherever a binding identifier is written, so each declaration
  // position raises the ECMA-262 early error itself. A position that
  // routes through binding-pattern conversion and one that reads the
  // declarator identifier directly must both reject, and neither may
  // report the reserved word twice or blame unrelated syntax.
  const sources = [
    "var this = 1;",
    "let this = 1;",
    "const this = 1;",
    "var first = 1, this = 2;",
    "for (var this of [1]);",
    "for (let this = 0; ; ) break;",
    "try {} catch (this) {}",
    "var [this] = [1];",
    // A pattern that names the reserved word is a SyntaxError every
    // engine rejects, so syntax the profile merely does not admit yet
    // must neither add a second diagnostic nor report before it, wherever
    // that syntax sits in the pattern.
    "var [this = /pattern/] = [];",
    "let {[/pattern/]: this} = {};",
    "var [first = /pattern/, [this]] = [];",
    "var {outer: {inner: this}} = {};",
    "var [...this] = [];",
    "try {} catch ({ outer: this }) {}",
    "function patterned([this]) {}",
    // Only a plain first parameter is TypeScript's receiver annotation,
    // so every other parameter shape is a binding position instead.
    "function later(first, this) {}",
    "function rested(...this) {}",
    "function defaulted(this = 1) {}",
  ];
  for (const source of sources) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "this-binding.ts",
    });
    assert.equal(result.diagnostics.length, 1, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /reserved word this cannot be a binding name/u,
      source,
    );
  }

  // The bootstrap parser rejects a destructuring assignment target
  // named `this` itself, before the declarator identifier is read.
  const assignmentTarget = compileSource(babelFrontend, {
    source: "({ value: this } = { value: 1 });",
    sourceId: "this-binding.ts",
  });
  assert.equal(assignmentTarget.diagnostics[0]?.code, "OSEO0001");

  // A plain first parameter named `this` is TypeScript's receiver
  // annotation rather than a binding, so it keeps the unsupported
  // classification that boundary already had.
  const parameter = compileSource(babelFrontend, {
    source: "function receiver(this) {}",
    sourceId: "this-binding.ts",
  });
  assert.equal(parameter.diagnostics.length, 1);
  assert.equal(parameter.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    parameter.diagnostics[0]?.message ?? "",
    /this parameters are unsupported/u,
  );

  // The reserved word check reads binding positions only, so a property
  // key spelled `this` still names an ordinary property, and a pattern
  // that binds no `this` still reports the syntax the profile lacks.
  const keyNamedThis = compileSource(babelFrontend, {
    source: "const { this: named } = { this: 1 };\nconsole.log(named);",
    sourceId: "this-binding.ts",
  });
  assert.deepEqual(keyNamedThis.diagnostics, []);

  const unsupportedDefault = compileSource(babelFrontend, {
    source: "var [first = /pattern/] = [];",
    sourceId: "this-binding.ts",
  });
  assert.equal(unsupportedDefault.diagnostics.length, 1);
  assert.equal(unsupportedDefault.diagnostics[0]?.code, "OSEO1001");
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

test("converts every admitted delete operand to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "let binding = 1;",
      "const object = { item: 2, nested: { kept: 3 } };",
      'function unresolvedKey() { return "item"; }',
      "delete binding;",
      "delete unresolved;",
      "delete (binding + 1);",
      "delete object?.item;",
      'delete object?.nested["kept"];',
      "delete null?.[unresolvedKey()];",
    ].join("\n"),
    sourceId: "delete-operands.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.syntax != null);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const syntaxDeletes = result.syntax.body
    .slice(3)
    .map((statement) =>
      statement.kind === "expression" ? statement.expression.kind : undefined,
    );
  assert.deepEqual(syntaxDeletes, [
    "delete",
    "delete",
    "delete",
    "delete",
    "delete",
    "delete",
  ]);
  const hir = printHir(result.hir);
  assert.match(hir, /\n  false/u);
  assert.match(hir, /\n  true/u);
  assert.match(hir, /delete value/u);
  assert.match(hir, /delete .*\?\./u);
  const mir = printMir(result.mir);
  assert.match(mir, /property-delete property-delete/u);
  assert.match(mir, /join \?\./u);
});

test("resolves top-level delete arguments as an unresolvable reference", () => {
  const result = compileSource(babelFrontend, {
    source: "delete arguments;",
    sourceId: "delete-top-level-arguments.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.syntax != null);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /\n  true/u);

  // An arrow with no enclosing owning form reaches the same unresolvable
  // reference, while every owning form resolves its own binding and
  // answers false without reading the cell.
  const arrow = compileSource(babelFrontend, {
    source: "const read = () => delete arguments;\n",
    sourceId: "delete-arrow-arguments.js",
  });
  assert.deepEqual(arrow.diagnostics, []);
  assert.ok(arrow.hir != null);
  assert.match(printHir(arrow.hir), /\n {2}return true/u);

  const asynchronous = compileSource(babelFrontend, {
    source: "async function owner() { return delete arguments; }\n",
    sourceId: "delete-async-arguments.js",
  });
  assert.deepEqual(asynchronous.diagnostics, []);
  assert.ok(asynchronous.hir != null);
  assert.match(printHir(asynchronous.hir), /\n {2}return false/u);
});

test("retains closed-world and early-error delete boundaries", () => {
  const cases: readonly (readonly [string, string, RegExp])[] = [
    [
      '"use strict"; delete binding;',
      "OSEO0001",
      /Source could not be parsed/u,
    ],
    [
      '"use strict"; delete ((binding));',
      "OSEO0001",
      /identifier cannot be deleted in strict code/u,
    ],
    [
      "delete Error;",
      "OSEO1001",
      /outside the admitted global-object profile/u,
    ],
    [
      "delete console;",
      "OSEO1001",
      /outside the admitted global-object profile/u,
    ],
    [
      "with ({}) { unavailable = 1; delete unavailable; }",
      "OSEO1001",
      /Deleting with fallback binding/u,
    ],
    [
      "const o = { m() { delete super.x; } };",
      "OSEO1001",
      /only valid in the body of a class element whose class has an/u,
    ],
  ];
  for (const [source, code, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "invalid-delete.js",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, code, source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
    assert.ok((result.diagnostics[0]?.range.start.column ?? 0) > 0, source);
  }
});

test("keeps legacy Object helpers direct and reads real statics", () => {
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
  assert.match(printMir(result.mir), /"setPrototypeOf"/u);
  assert.match(printMir(result.mir), /property-get method lookup/u);
  assert.match(printMir(result.mir), /call dynamic function value/u);
  assert.match(printMir(result.mir), /Object\.keys/u);
});

test("rejects Object statics owned by later M5b nodes", () => {
  const result = compileSource(babelFrontend, {
    source: "Object.getOwnPropertyNames(Object);",
    sourceId: "later-object-static.ts",
  });
  assert.equal(result.hir, undefined);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.equal(
    result.diagnostics[0]?.message,
    "Object.getOwnPropertyNames is not admitted in this M5b node.",
  );
  assert.deepEqual(result.diagnostics[0]?.byteRange, { end: 26, start: 0 });
});

test("defers Object helper recognition to with environments", () => {
  const result = compileSource(babelFrontend, {
    source:
      "with ({ Object: { assign() {}, create() {} } }) {\n" +
      "  Object.assign(); Object.create();\n" +
      "}",
    sourceId: "with-object-helpers.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /with\[%b\d+\] Object fallback/u);
  assert.doesNotMatch(hir, /intrinsic Object\.create/u);
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

test("lowers object literal spread through CopyDataProperties", () => {
  const result = compileSource(babelFrontend, {
    source: `const base = { a: 1 };
const value = { ...base, b: 2 };`,
    sourceId: "object-spread.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /object\{\.\.\.%b\d+\(base\), "b": 2\}/u);
  const mir = printMir(result.mir);
  assert.match(mir, /object-create ordinary object with null prototype/u);
  assert.match(mir, /safepoint object spread copy/u);
  assert.match(
    mir,
    /object-spread CopyDataProperties for object literal spread/u,
  );
  assert.match(mir, /property-define-data create data property/u);
});

test("lowers only colon-form __proto__ as a prototype setter", () => {
  const result = compileSource(babelFrontend, {
    source: `const __proto__ = 1;
const prototype = {};
const value = {
  __proto__: prototype,
  ["__proto__"]: 2,
  __proto__,
  __proto__() {},
  get __proto__() {},
  set __proto__(value) {},
};`,
    sourceId: "proto-literal.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /proto-set "__proto__": %b\d+\(prototype\)/u);
  assert.match(hir, /"__proto__": 2/u);
  assert.match(hir, /"__proto__": %b\d+\(__proto__\)/u);
  const mir = printMir(result.mir);
  assert.match(mir, /safepoint object literal prototype setter/u);
  assert.match(mir, /object-set-prototype set object literal prototype/u);
  assert.match(mir, /property-define-data create data property/u);
  assert.match(mir, /property-define-accessor define get accessor property/u);
  assert.match(mir, /property-define-accessor define set accessor property/u);

  const setterOnly = compileSource(babelFrontend, {
    source: "({ __proto__: null });",
    sourceId: "proto-literal-only.js",
  });
  assert.deepEqual(setterOnly.diagnostics, []);
  assert.ok(setterOnly.mir != null);
  assert.doesNotMatch(printMir(setterOnly.mir), /property-key/u);
});

test("keeps duplicate object prototype setters as an early error", () => {
  const result = compileSource(babelFrontend, {
    source: `({
  __proto__: null,
  ["__proto__"]: 1,
  __proto__() {},
  "__proto__": {},
});`,
    sourceId: "duplicate-proto-literal.js",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO0001");
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 3,
    line: 5,
  });
});

test("rejects the smallest syntax form outside the profile", () => {
  const result = babelFrontend.parse({
    source: "const value = class extends Base { declare field: number; };",
    sourceId: "class-static-private-generator.ts",
  });
  assert.ok(!result.parsed);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 36,
    line: 1,
  });
});

test("lowers a class body to a constructor and prototype methods", () => {
  const result = compileSource(babelFrontend, {
    source: `class Point {
  constructor(x) {
    this.x = x;
  }
  read() {
    return this.x;
  }
}
const origin = new Point(0);`,
    sourceId: "class-body.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(
    printHir(result.hir),
    /class Point\{constructor: function @f\d+ Point, /u,
  );
  assert.match(printHir(result.hir), /"read": function @f\d+ read\}/u);
  const mir = printMir(result.mir);
  assert.match(mir, /binding-reset Point cell/u);
  assert.match(mir, /class-prototype class prototype object/u);
  assert.match(
    mir,
    /property-define-method define non-enumerable prototype method/u,
  );
});

test("lowers class accessors to non-enumerable accessor properties", () => {
  const result = compileSource(babelFrontend, {
    source: `class Box {
  get item() {
    return this.stored;
  }
  set item(value) {
    this.stored = value;
  }
  read() {
    return this.stored;
  }
}
const box = new Box();`,
    sourceId: "class-accessors.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /get "item": function @f\d+ item/u);
  assert.match(hir, /set "item": function @f\d+ item/u);
  assert.match(hir, /"read": function @f\d+ read/u);
  const mir = printMir(result.mir);
  assert.match(
    mir,
    /property-define-accessor define non-enumerable prototype get accessor/u,
  );
  assert.match(
    mir,
    /property-define-accessor define non-enumerable prototype set accessor/u,
  );
  assert.match(
    mir,
    /property-define-method define non-enumerable prototype method/u,
  );
});

test("rejects accessor definitions with an unusable parameter list", () => {
  const cases: readonly string[] = [
    "class C { get x(value) { return value; } }",
    "class C { set x() {} }",
    "class C { set x(first, second) {} }",
    "class C { set x(...rest) {} }",
    "class C { get constructor() { return 1; } }",
  ];
  for (const source of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "class-accessor-rejection.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    assert.equal(result.diagnostics[0]?.range.start.line, 1, source);
  }
});

test("targets the constructor for static class elements", () => {
  const result = compileSource(babelFrontend, {
    source: `class Registry {
  static create() {
    return new Registry();
  }
  static get total() {
    return 0;
  }
  static set total(value) {}
  read() {
    return 1;
  }
}
console.log(Registry.create(), Registry.total, Registry.prototype.read);`,
    sourceId: "class-static.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /static "create": function @f\d+ create/u);
  assert.match(hir, /static get "total": function @f\d+ total/u);
  assert.match(hir, /static set "total": function @f\d+ total/u);
  assert.match(hir, /, "read": function @f\d+ read/u);
  const mir = printMir(result.mir);
  assert.match(
    mir,
    /property-define-method define non-enumerable static method/u,
  );
  assert.match(
    mir,
    /property-define-accessor define non-enumerable static get accessor/u,
  );
  assert.match(
    mir,
    /property-define-accessor define non-enumerable static set accessor/u,
  );
  assert.match(
    mir,
    /property-define-method define non-enumerable prototype method/u,
  );
});

test("binds a class name only inside its own class body", () => {
  const result = compileSource(babelFrontend, {
    source: `const Named = class Inner {
  self() {
    return Inner;
  }
};
const outer = Named;`,
    sourceId: "class-name-binding.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /class Inner\{/u);

  const escaped = compileSource(babelFrontend, {
    source: "const Named = class Inner {};\nconst leaked = Inner;",
    sourceId: "class-name-escape.ts",
  });
  assert.equal(escaped.diagnostics[0]?.code, "OSEO1001");
  assert.match(escaped.diagnostics[0]?.message ?? "", /Unknown binding/u);
});

test("rejects class elements outside the admitted profile", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    ["class C { declare field: number; }", /class field modifiers/u],
    ["class C { readonly field = 1; }", /class field modifiers/u],
    ["class C { field?: number; }", /class field modifiers/u],
    ["class C { constructor() {} constructor() {} }", /one constructor/u],
  ];
  for (const [source, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "class-rejection.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
});

test("lowers a derived class to a heritage operand and super call", () => {
  const result = compileSource(babelFrontend, {
    source: `class Base {}
class Derived extends Base {
  constructor(x) {
    super();
    this.x = x;
  }
}
class Implicit extends Base {}
console.log(new Derived(1).x, new Implicit() instanceof Base);
`,
    sourceId: "class-extends.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  assert.match(text, /class Derived extends %b\d+\(Base\)\{/u);
  assert.match(text, /call super -> %b\d+ this\(\)/u);
  // The implicit derived constructor forwards every argument through one
  // synthetic rest parameter, so it is a spread super call.
  assert.match(text, /call super -> %b\d+ this\(\.\.\.%b\d+\(/u);
  assert.ok(result.mir != null);
});

test("lowers a super property reference to its base and receiver", () => {
  const result = compileSource(babelFrontend, {
    source: `class Base {
  describe() {
    return "base";
  }
}
class Derived extends Base {
  describe() {
    return super.describe();
  }
  rename(key) {
    super[key] = super.describe;
    return super.describe;
  }
  static of() {
    return super.of;
  }
}
console.log(new Derived().describe(), Derived.of());
`,
    sourceId: "class-super-property.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  // Every reference names the receiver it carries, so a static element
  // and an instance element are distinguishable only by the home object
  // lowering records, not by the reference itself.
  assert.match(text, /call super -> this strict\["describe"\]\(\)/u);
  assert.match(text, /set super -> this strict\[%b\d+\(key\)\]/u);
  assert.match(text, /get super -> this strict\["describe"\]/u);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /super-base home object prototype/u);
  assert.match(mir, /home-object-bind home object/u);
});

test("lowers lexical super and new.target through arrows", () => {
  const result = compileSource(babelFrontend, {
    source: `class Base {
  value() {
    return 1;
  }
}
class Derived extends Base {
  constructor() {
    const initialize = () => super();
    initialize();
    this.target = () => new.target;
  }
  value() {
    return (() => super.value())();
  }
  async asyncValue() {
    return super.value();
  }
}
const instance = new Derived();
console.log(instance.value(), instance.target() === Derived);
instance.asyncValue().then((value) => console.log(value));
`,
    sourceId: "class-lexical-super.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  assert.match(text, /call super -> %b\d+ this\(\)/u);
  assert.match(text, /call super -> this strict\["value"\]\(\)/u);
  assert.match(text, /new\.target/u);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /super-base home object prototype/u);
  assert.match(mir, /new-target new\.target/u);
});

test("lowers static class fields to definitions on the constructor", () => {
  const result = compileSource(babelFrontend, {
    source: `class Registry {
  static count = 0;
  static missing;
  static #secret = 1;
  instance = 2;
  static reveal() {
    return this.#secret;
  }
}
console.log(Registry.count, Registry.missing, Registry.reveal());
`,
    sourceId: "class-static-field.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  assert.match(text, /static field "count" = /u);
  assert.match(text, /static field "missing"[,}]/u);
  assert.match(text, /static field %b\d+ #secret = /u);
  assert.match(text, /, field "instance" = /u);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /class-static-field-define define static field/u);
  assert.match(
    mir,
    /class-static-private-field-define define static private field/u,
  );
  // The static initializers run after the class body is otherwise
  // complete, so every instance record precedes every static define.
  const record = mir.indexOf("class-field-define record instance field");
  const define = mir.indexOf("class-static-field-define");
  assert.ok(record !== -1 && define !== -1 && record < define);
});

test("lowers static blocks to calls against the constructor", () => {
  const result = compileSource(babelFrontend, {
    source: `class Setup {
  static first = 1;
  static {
    this.second = this.first + 1;
  }
  static third = Setup.second + 1;
  static {
    var scoped = this.third;
    this.fourth = scoped + 1;
  }
  instance = 0;
}
console.log(Setup.second, Setup.fourth);
`,
    sourceId: "class-static-block.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  assert.equal(text.match(/static block function @f\d+/gu)?.length, 2);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.equal(
    mir.match(/call static initialization block/gu)?.length,
    2,
    "each block becomes one call",
  );
  // Every static element is deferred until the class body is otherwise
  // complete, so the instance record precedes them, and the blocks
  // interleave with the static fields in source order.
  const record = mir.indexOf("class-field-define record instance field");
  const runs = [...mir.matchAll(/(class-static-field-define|call static)/gu)];
  assert.ok(record !== -1 && record < (runs[0]?.index ?? -1));
  assert.deepEqual(
    runs.map((run) => run[0]),
    [
      "class-static-field-define",
      "call static",
      "class-static-field-define",
      "call static",
    ],
  );
});

test("lowers private class elements to per-evaluation names", () => {
  const result = compileSource(babelFrontend, {
    source: `class Counter {
  #count = 0;
  #step;
  static #total = 0;
  constructor(step) {
    this.#step = step;
  }
  #bump() {
    this.#count += this.#step;
  }
  get #doubled() {
    return this.#count * 2;
  }
  set #doubled(value) {
    this.#count = value / 2;
  }
  static #addTotal() {
    Counter.#total++;
  }
  static get #summary() {
    return Counter.#total;
  }
  static set #summary(value) {
    Counter.#total = value;
  }
  next() {
    this.#bump();
    this.#count++;
    this.#doubled = 8;
    return this.#doubled;
  }
  read(other) {
    return other.#count;
  }
  has(other) {
    return #count in other;
  }
  static hasStatic(other) {
    return #total in other;
  }
  static run() {
    Counter.#summary = 3;
    Counter.#addTotal();
    return Counter.#summary;
  }
}
const counter = new Counter(1);
console.log(counter.next(), counter.read(new Counter(2)), Counter.run());
`,
    sourceId: "class-private.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const text = printHir(result.hir);
  // A private element carries the binding holding its name, never a
  // property key, and the getter and setter share the one binding.
  assert.match(text, /field %b\d+ #count = /u);
  assert.match(text, /get %b(\d+) #doubled: .*set %b\1 #doubled: /su);
  assert.match(text, /private get this strict\.%b\d+ #count/u);
  assert.match(text, /private set this strict\.%b\d+ #step = /u);
  assert.match(text, /private update this strict\.%b\d+ #count \+= /u);
  assert.match(text, /private update this strict\.%b\d+ #count\+\+/u);
  assert.match(text, /call this strict\.%b\d+ #bump\(\)/u);
  assert.match(text, /private get %b\d+\(other\)\.%b\d+ #count/u);
  assert.match(text, /%b\d+ #count in %b\d+\(other\)/u);
  assert.match(text, /%b\d+ #total in %b\d+\(other\)/u);
  assert.match(text, /private set %b\d+\(Counter\)\.%b\d+ #summary = /u);
  assert.match(text, /call %b\d+\(Counter\)\.%b\d+ #addTotal\(\)/u);
  assert.ok(result.mir != null);
  const mir = printMir(result.mir);
  assert.match(mir, /private-name-create private name #count/u);
  assert.match(mir, /class-private-field-define record private instance/u);
  assert.match(mir, /class-private-method-define record private method/u);
  assert.match(mir, /class-private-method-define record private get/u);
  assert.match(
    mir,
    /class-static-private-method-define define static private method/u,
  );
  assert.match(
    mir,
    /class-static-private-method-define define static private get/u,
  );
  assert.match(mir, /private-get private-get/u);
  assert.match(mir, /private-in private-in/u);
  assert.match(mir, /private-set private-set/u);
});

test("locates the early errors a private name reports at parse time", () => {
  // Every one of these is an ECMA-262 early error, so the bootstrap
  // parser reports it before conversion; the profile still owes each a
  // diagnostic located at the offending name.
  const cases: readonly (readonly [string, number, number])[] = [
    ["class D { m() { return this.#x; } }", 1, 29],
    ["class C { #x = 1; }\nclass D { m() { return this.#x; } }", 2, 29],
    ["class C {}\nclass D extends C { #x = 1; m() { super.#x; } }", 2, 35],
    ["class C { #x = 1; m() { delete this.#x; } }", 1, 25],
    ["class C { #x; #x; }", 1, 15],
    ["class C { #constructor = 1; }", 1, 11],
  ];
  for (const [source, line, column] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "private-early-error.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    assert.deepEqual(result.diagnostics[0]?.range.start, { column, line });
  }
});

test("rejects super outside its lexical class context", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    [
      "class A { m() { return super.m; } }",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "const o = { m() { return super.m; } };",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "class A { m() { [super.m] = [1]; } }",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "const o = { m(it) { for (super.m of it) {} } };",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "class A { m() { delete super.m; } }",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "const o = { m() { delete super[key()]; } };",
      /only valid in the body of a class element whose class has an/u,
    ],
  ];
  for (const [source, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-rejection.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
});

test("admits a super property reference as a delete operand", () => {
  const cases: readonly string[] = [
    "class A {}\nclass B extends A { m() { return delete super.m; } }",
    "class A {}\nclass B extends A { m(k) { return delete super[k()]; } }",
    "class A {}\nclass B extends A { m() { return delete ((super.m)); } }",
    "class A {}\nclass B extends A { m() { const f = () => delete super.m;" +
      " return f(); } }",
    "class A {}\nclass B extends A { static m() { return delete super.m; } }",
    "class A {}\nclass B extends A { constructor() { delete super.m; } }",
    "class A {}\nclass B extends A { async m() { return delete super.m; } }",
    "class A {}\nclass B extends A { *m() { yield delete super.m; } }",
    "class A {}\nclass B extends A { async *m() { yield delete super.m; } }",
    "class A {}\nclass B extends A { static { delete super.m; } }",
    "class A {}\nclass B extends A { get g() { return delete super.m; } }",
    "class A {}\nclass B extends A { set s(v) { delete super.m; } }",
    "class A {}\nclass B extends A { static get g() { return delete super.m;" +
      " } }",
    "class A {}\nclass B extends A { f = delete super.m; }",
    "class A {}\nclass B extends A { static f = delete super.m; }",
    "class A {}\nclass B extends A { #p() { return delete super.m; } }",
    "class A {}\nclass B extends A { [Symbol.iterator]() { return delete" +
      " super.m; } }",
  ];
  for (const source of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-delete.ts",
    });
    assert.deepEqual(result.diagnostics, [], source);
    assert.ok(result.mir != null, source);
    const text = printMir(result.mir);
    assert.match(text, /super-property-delete/u, source);
    // The reference is rejected before any lookup, so no home object
    // prototype is read and no property deletion is attempted.
    assert.doesNotMatch(text, /super-base/u, source);
    assert.doesNotMatch(text, /= property-delete/u, source);
    assert.doesNotMatch(text, /delete-object-coercible/u, source);
  }
});

test("evaluates a deleted super reference before rejecting it", () => {
  // ECMA-262 evaluates SuperProperty whole before the delete evaluation
  // rejects it: the receiver is read first, so a derived constructor
  // observes the `this` temporal dead zone before the key expression
  // runs, and ToPropertyKey is never reached for the produced value.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  constructor(k) {\n" +
    "    delete super[k()];\n" +
    "    super();\n" +
    "  }\n" +
    "}\n";
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "super-delete-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const derived = result.mir.functions.find((item) => item.name === "B");
    assert.ok(derived != null);
    const operations = derived.blocks.flatMap((block) => block.operations);
    const receiverIndex = operations.findIndex(
      (operation) => operation.kind === "read" && operation.detail === "this",
    );
    const keyIndex = operations.findIndex(
      (operation) => operation.kind === "call",
    );
    const rejectIndex = operations.findIndex(
      (operation) => operation.kind === "super-property-delete",
    );
    assert.ok(receiverIndex >= 0, "receiver read");
    assert.ok(keyIndex > receiverIndex, "key after receiver");
    assert.ok(rejectIndex > keyIndex, "rejection after key");
    // The produced key value is deliberately left unconverted.
    assert.ok(
      !operations
        .slice(0, rejectIndex)
        .some((operation) => operation.kind === "property-key"),
      "no ToPropertyKey before the rejection",
    );
  }
});

test("admits a super property as a destructuring assignment target", () => {
  // Every pattern position the grammar admits a DestructuringAssignment
  // Target in, in every class element form that carries a home object.
  const cases: readonly string[] = [
    "class A {}\nclass B extends A { m() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { m(k) { [super[k()]] = [1]; } }",
    "class A {}\nclass B extends A { m() { [(super.x)] = [1]; } }",
    "class A {}\nclass B extends A { m() { ({ p: super.x } = { p: 1 }); } }",
    "class A {}\nclass B extends A { m(k) { ({ [k()]: super.x } = {}); } }",
    "class A {}\nclass B extends A { m() { [[super.x]] = [[1]]; } }",
    "class A {}\nclass B extends A { m() { ({ p: { q: super.x } } = " +
      "{ p: { q: 1 } }); } }",
    "class A {}\nclass B extends A { m() { [super.x = 1] = []; } }",
    "class A {}\nclass B extends A { m() { ({ p: super.x = 1 } = {}); } }",
    "class A {}\nclass B extends A { m() { [...super.x] = [1]; } }",
    "class A {}\nclass B extends A { m() { ({ ...super.x } = { r: 1 }); } }",
    "class A {}\nclass B extends A { m() { const f = () => { [super.x] = " +
      "[1]; }; f(); } }",
    "class A {}\nclass B extends A { static m() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { constructor() { super(); [super.x] = " +
      "[1]; } }",
    "class A {}\nclass B extends A { async m() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { *m() { [super.x] = [yield 1]; } }",
    "class A {}\nclass B extends A { async *m() { [super.x] = [await 1]; } }",
    "class A {}\nclass B extends A { static { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { get g() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { set s(v) { [super.x] = [v]; } }",
    "class A {}\nclass B extends A { static get g() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { f = (() => { [super.x] = [1]; })(); }",
    "class A {}\nclass B extends A { static f = (() => { [super.x] = " +
      "[1]; })(); }",
    "class A {}\nclass B extends A { #p() { [super.x] = [1]; } }",
    "class A {}\nclass B extends A { [Symbol.iterator]() { [super.x] = " +
      "[1]; } }",
  ];
  for (const source of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-target.ts",
    });
    assert.deepEqual(result.diagnostics, [], source);
    assert.ok(result.mir != null, source);
    const text = printMir(result.mir);
    // The store reuses the ordinary `super` property set: a lookup that
    // starts at the home object's prototype and a fourth receiver
    // argument the assignment stores through.
    assert.match(text, /super-base home object prototype/u, source);
    assert.match(
      text,
      /property-set destructuring member target %\d+, %\d+, %\d+, %\d+/u,
      source,
    );
    // The super base is not an evaluated object expression, so PutValue
    // reports its own TypeError instead of RequireObjectCoercible.
    assert.doesNotMatch(
      text,
      /RequireObjectCoercible for assignment target/u,
      source,
    );
  }
});

test("admits a super property as a for-of head assignment target", () => {
  const cases: readonly string[] = [
    "class A {}\nclass B extends A { m(it) { for (super.x of it) {} } }",
    "class A {}\nclass B extends A { m(it, k) { for (super[k()] of it) {} } }",
    "class A {}\nclass B extends A { m(it) { for ((super.x) of it) {} } }",
    "class A {}\nclass B extends A { static m(it) { for (super.x of it) {} } }",
    "class A {}\nclass B extends A { constructor(it) { super(); for " +
      "(super.x of it) {} } }",
    "class A {}\nclass B extends A { m(it) { const f = () => { for " +
      "(super.x of it) {} }; f(); } }",
    "class A {}\nclass B extends A { async m(it) { for await (super.x of it)" +
      " {} } }",
    "class A {}\nclass B extends A { async *m(it) { for await (super.x of it)" +
      " {} } }",
    "class A {}\nclass B extends A { *m(it) { for (super.x of it) { yield 1;" +
      " } } }",
    "class A {}\nclass B extends A { static { for (super.x of []) {} } }",
    "class A {}\nclass B extends A { get g() { for (super.x of []) {} } }",
  ];
  for (const source of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-head.ts",
    });
    assert.deepEqual(result.diagnostics, [], source);
    assert.ok(result.mir != null, source);
    const text = printMir(result.mir);
    assert.match(text, /super-base home object prototype/u, source);
    assert.match(
      text,
      /property-set for-of property target %\d+, %\d+, %\d+, %\d+/u,
      source,
    );
  }
});

test("admits a super property inside a for-of head pattern", () => {
  const source =
    "class A {}\nclass B extends A { m(it) { for ([super.x] of it) {} } }";
  const result = compileSource(babelFrontend, {
    source,
    sourceId: "super-head-pattern.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const text = printMir(result.mir);
  assert.match(
    text,
    /property-set destructuring member target %\d+, %\d+, %\d+, %\d+/u,
  );
});

test("orders a super destructuring target's reference before its value", () => {
  // AssignmentElement evaluates its DestructuringAssignmentTarget before
  // the iterator step that supplies the value, and PutValue converts the
  // key only after that value exists. Inside the reference, ECMA-262
  // reads the receiver first and GetSuperBase last.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  m(k, it) {\n" +
    "    [super[k()]] = it;\n" +
    "  }\n" +
    "}\n";
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "super-target-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const method = result.mir.functions.find((item) =>
      item.blocks.some((block) =>
        block.operations.some(
          (operation) => operation.detail === "destructuring member target",
        ),
      ),
    );
    assert.ok(method != null);
    const operations = method.blocks.flatMap((block) => block.operations);
    const indexOf = (predicate: (kind: string, detail: string) => boolean) =>
      operations.findIndex((operation) =>
        predicate(operation.kind, operation.detail ?? ""),
      );
    const receiverIndex = indexOf((kind) => kind === "receiver");
    const keyIndex = indexOf((kind) => kind === "call");
    const baseIndex = indexOf((kind) => kind === "super-base");
    const stepIndex = indexOf(
      (kind, detail) =>
        kind === "iterator-next" && detail.includes("array binding"),
    );
    const convertIndex = indexOf((kind) => kind === "property-key");
    const storeIndex = indexOf(
      (kind, detail) =>
        kind === "property-set" && detail === "destructuring member target",
    );
    assert.ok(receiverIndex >= 0, "receiver read");
    assert.ok(keyIndex > receiverIndex, "key expression after receiver");
    assert.ok(baseIndex > keyIndex, "GetSuperBase after the key expression");
    assert.ok(stepIndex > baseIndex, "iterator step after the reference");
    assert.ok(convertIndex > stepIndex, "ToPropertyKey after the value");
    assert.ok(storeIndex > convertIndex, "store last");
    const store = operations[storeIndex];
    assert.equal(store?.superReference, true);
    assert.equal(store?.arguments.length, 4);
  }
});

test("orders a super object-pattern target between its name and GetV", () => {
  // AssignmentProperty evaluates its PropertyName, then the
  // DestructuringAssignmentTarget, then GetV; PutValue converts the
  // target's own key only after that value exists.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  m(k, source) {\n" +
    "    ({ p: super[k()] } = source);\n" +
    "  }\n" +
    "}\n";
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "super-property-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const method = result.mir.functions.find((item) =>
      item.blocks.some((block) =>
        block.operations.some(
          (operation) => operation.detail === "destructuring member target",
        ),
      ),
    );
    assert.ok(method != null);
    const operations = method.blocks.flatMap((block) => block.operations);
    const indexOf = (predicate: (kind: string, detail: string) => boolean) =>
      operations.findIndex((operation) =>
        predicate(operation.kind, operation.detail ?? ""),
      );
    const nameIndex = indexOf((kind) => kind === "property-key");
    const receiverIndex = indexOf((kind) => kind === "receiver");
    const keyIndex = indexOf((kind) => kind === "call");
    const baseIndex = indexOf((kind) => kind === "super-base");
    const readIndex = indexOf(
      (kind, detail) =>
        kind === "property-get" && detail === "GetV for object binding",
    );
    const storeIndex = indexOf(
      (kind, detail) =>
        kind === "property-set" && detail === "destructuring member target",
    );
    // The source property name is converted before the target runs, and
    // the target's own key is converted only after GetV.
    const convertIndex = operations.findIndex(
      (operation, index) =>
        index > readIndex && operation.kind === "property-key",
    );
    assert.ok(nameIndex >= 0, "property name");
    assert.ok(receiverIndex > nameIndex, "receiver read after the name");
    assert.ok(keyIndex > receiverIndex, "key expression after receiver");
    assert.ok(baseIndex > keyIndex, "GetSuperBase after the key expression");
    assert.ok(readIndex > baseIndex, "GetV after the target reference");
    assert.ok(convertIndex > readIndex, "ToPropertyKey after the value");
    assert.ok(storeIndex > convertIndex, "store last");
    const store = operations[storeIndex];
    assert.equal(store?.superReference, true);
    assert.equal(store?.arguments.length, 4);
  }
});

test("orders a super for-of head's reference after each iterator step", () => {
  // ForIn/OfBodyEvaluation obtains the next value first and evaluates the
  // head reference once per iteration, so the receiver read and the key
  // expression follow the step and precede the store.
  const source =
    "class A {}\n" +
    "class B extends A {\n" +
    "  m(k, it) {\n" +
    "    for (super[k()] of it) {}\n" +
    "  }\n" +
    "}\n";
  for (const specialization of ["disabled", "enabled"] as const) {
    const result = compileSource(
      babelFrontend,
      { source, sourceId: "super-head-order.ts" },
      { specialization },
    );
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.mir != null);
    const method = result.mir.functions.find((item) =>
      item.blocks.some((block) =>
        block.operations.some(
          (operation) => operation.detail === "for-of property target",
        ),
      ),
    );
    assert.ok(method != null);
    const operations = method.blocks.flatMap((block) => block.operations);
    const kinds = operations.map((operation) => operation.kind);
    const stepIndex = kinds.indexOf("iterator-next");
    const receiverIndex = kinds.indexOf("receiver");
    const keyIndex = kinds.indexOf("call");
    const baseIndex = kinds.indexOf("super-base");
    const convertIndex = kinds.indexOf("property-key");
    const storeIndex = operations.findIndex(
      (operation) =>
        operation.kind === "property-set" &&
        operation.detail === "for-of property target",
    );
    assert.ok(stepIndex >= 0, "iterator step");
    assert.ok(receiverIndex > stepIndex, "receiver read after the step");
    assert.ok(keyIndex > receiverIndex, "key expression after receiver");
    assert.ok(baseIndex > keyIndex, "GetSuperBase after the key expression");
    assert.ok(convertIndex > baseIndex, "ToPropertyKey after the reference");
    assert.ok(storeIndex > convertIndex, "store last");
    const store = operations[storeIndex];
    assert.equal(store?.superReference, true);
    assert.equal(store?.arguments.length, 4);
  }
});

test("keeps every super target composition this unit does not admit", () => {
  const cases: readonly (readonly [string, RegExp])[] = [
    // A class body without `extends` and an object literal method have no
    // home object prototype this runtime can reach.
    [
      "class A { m() { ({ p: super.x } = {}); } }",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "const o = { m() { [...super.x] = [1]; } };",
      /only valid in the body of a class element whose class has an/u,
    ],
    [
      "class A { static m(it) { for (super.x of it) {} } }",
      /only valid in the body of a class element whose class has an/u,
    ],
    // M5a Unit 8.5m admits the same `super` target inside an enumerate
    // head's object pattern; an array pattern position keeps its own
    // boundary there.
    [
      "class A {}\nclass B extends A { m(o) { for ([super.x] in o) {} } }",
      /for-in array pattern target is unsupported/u,
    ],
  ];
  for (const [source, message] of cases) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-target-boundary.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(result.diagnostics[0]?.message ?? "", message, source);
  }
  // A private member in a target position stays an early error, and an
  // optional `super` reference stays a parse error.
  const earlyErrors: readonly string[] = [
    "class A {}\nclass B extends A { m() { [super.#x] = [1]; } }",
    "class A {}\nclass B extends A { m(it) { for (super?.x of it) {} } }",
    "class A {}\nclass B extends A { m(it) { for (const [super.x] of it)" +
      " {} } }",
  ];
  for (const source of earlyErrors) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "super-target-early.ts",
    });
    assert.equal(result.mir, undefined, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
  }
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

test("converts optional member and call chains to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      'function key() { return "method"; }\n' +
      "function argument() { return 2; }\n" +
      "const object = { method(value) { return value; } };\n" +
      "console.log(object?.method(argument()));\n" +
      "console.log(object?.[key()]?.(argument()));\n" +
      "console.log((object?.missing).value?.());\n",
    sourceId: "optional-chain.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.syntax != null);
  const firstCall = result.syntax.body[3];
  assert.equal(firstCall?.kind, "expression");
  if (firstCall?.kind !== "expression") return;
  assert.equal(firstCall.expression.kind, "call");
  if (
    firstCall.expression.kind !== "call" ||
    firstCall.expression.arguments[0]?.kind !== "optional-chain"
  ) {
    return;
  }
  assert.deepEqual(
    firstCall.expression.arguments[0].links.map((link) => [
      link.kind,
      link.optional,
    ]),
    [
      ["member", true],
      ["call", false],
    ],
  );
  const boundaryCall = result.syntax.body[5];
  assert.equal(boundaryCall?.kind, "expression");
  if (
    boundaryCall?.kind !== "expression" ||
    boundaryCall.expression.kind !== "call" ||
    boundaryCall.expression.arguments[0]?.kind !== "optional-chain"
  ) {
    return;
  }
  assert.equal(
    boundaryCall.expression.arguments[0].base.kind,
    "optional-chain",
  );
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /object\)\?\.\["method"\]\(/u);
  assert.match(hirText, /object\)\?\.\[call %b0\(key\)\(\)\]\?\.\(/u);
  assert.match(hirText, /\(object\)\?\.\["missing"\]\)\["value"\]\?\.\(/u);
});

test("converts an optional call through a super property", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class Base { method() { return this.value; } }\n" +
      "class Derived extends Base {\n" +
      "  method() { return super.method?.(); }\n" +
      "}\n",
    sourceId: "optional-super-call.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(
    printHir(result.hir),
    /super -> this strict\["method"\]\?\.\(\)/u,
  );
  assert.ok(result.mir != null);
  assert.match(printMir(result.mir), /super-base home object prototype/u);
  assert.match(printMir(result.mir), /property-get generic %\d+, %\d+, %\d+/u);
});

test("converts optional private member chains to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class Box {\n" +
      "  #value = 1;\n" +
      "  #method() { return this.#value; }\n" +
      "  read(object) { return object?.#value; }\n" +
      "  call(object) { return object?.#method(); }\n" +
      "}\n",
    sourceId: "optional-private-chain.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /\?\.\[%b\d+ #value\]/u);
  assert.match(hir, /\?\.\[%b\d+ #method\]\(\)/u);
  assert.match(mir, /private-get private-get/u);
  assert.match(mir, /optional chain function value/u);
});
