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
    source: "const value = class extends Base {};",
    sourceId: "class-extends.ts",
  });
  assert.ok(!result.parsed);
  assert.equal(result.program, undefined);
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.deepEqual(result.diagnostics[0]?.range.start, {
    column: 15,
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
    ["class C { static m() {} }", /Static class elements/u],
    ["class C { static get x() { return 1; } }", /Static class elements/u],
    ["class C { static set x(v) {} }", /Static class elements/u],
    ["class C { get #hidden() {} }", /class element is unsupported/u],
    ["class C { set #hidden(v) {} }", /class element is unsupported/u],
    ["class C extends Base {}", /Class inheritance/u],
    ["class C { field = 1; }", /class element is unsupported/u],
    ["class C { #hidden() {} }", /class element is unsupported/u],
    ["class C { static {} }", /class element is unsupported/u],
    ["class C { *step() {} }", /method generator functions/u],
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
