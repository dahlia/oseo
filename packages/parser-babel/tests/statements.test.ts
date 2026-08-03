import assert from "node:assert/strict";
import test from "node:test";

import {
  compileModuleGraph,
  compileSource,
  printHir,
  printMir,
} from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

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

test("admits debugger statements in every statement position", () => {
  const result = compileSource(babelFrontend, {
    source:
      "debugger;\n" +
      "{ debugger; }\n" +
      "while (false) debugger;\n" +
      "do debugger; while (false);\n" +
      "for (let i = 0; i < 1; i = i + 1) debugger;\n" +
      "for (const item of [1]) debugger;\n" +
      "switch (1) {\n" +
      "  case 1: debugger; break;\n" +
      "  default: debugger;\n" +
      "}\n" +
      "if (true) debugger; else debugger;\n" +
      "outer: debugger;\n" +
      "with ({}) debugger;\n" +
      "try { debugger; } catch { debugger; } finally { debugger; }\n" +
      "class Sample {\n" +
      "  static { debugger; }\n" +
      "}\n" +
      "function ordinary() { debugger; }\n" +
      "async function asynchronous() {\n" +
      "  debugger;\n" +
      "  await 0;\n" +
      "  for await (const item of []) debugger;\n" +
      "  debugger;\n" +
      "}\n" +
      "function* generator() { debugger; yield 0; debugger; }\n" +
      "async function* asyncGenerator() { debugger; yield 0; debugger; }\n",
    sourceId: "debugger-positions.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
});

test("lowers debugger to the same no-op as an empty statement", () => {
  const result = compileSource(babelFrontend, {
    source: 'console.log("before");\ndebugger;\nconsole.log("after");\n',
    sourceId: "debugger-no-op.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const debuggerStatement = result.hir.body[1];
  assert.equal(debuggerStatement?.kind, "block");
  assert.deepEqual(
    debuggerStatement?.kind === "block" ? debuggerStatement.body : undefined,
    [],
  );
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

test("admits a function declaration in a switch clause", () => {
  const result = compileSource(babelFrontend, {
    source:
      "switch (1) {\n" +
      "  case 1:\n" +
      "    function inner() { return 1; }\n" +
      "    console.log(inner());\n" +
      "    break;\n" +
      "}\n",
    sourceId: "switch-function.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  // The function is instantiated once at CaseBlock entry, ahead of the
  // clause dispatch, rather than inline where it is declared.
  assert.match(hirText, /switch [^\n]*\n\s+function-init %b(\d+) inner/u);
});

test("instantiates a switch function no matter which clause runs", () => {
  const result = compileSource(babelFrontend, {
    source:
      "switch (2) {\n" +
      "  case 1:\n" +
      "    function inner() { return 1; }\n" +
      "    break;\n" +
      "  case 2:\n" +
      "    console.log(inner());\n" +
      "    break;\n" +
      "}\n",
    sourceId: "switch-function-other-clause.ts",
  });
  assert.deepEqual(result.diagnostics, []);
});

test("admits generator and async switch clause functions", () => {
  for (const [keyword, sourceId] of [
    ["function*", "switch-generator-function.ts"],
    ["async function", "switch-async-function.ts"],
    ["async function*", "switch-async-generator-function.ts"],
  ] as const) {
    const result = compileSource(babelFrontend, {
      source: `switch (1) { case 1: ${keyword} inner() {} }`,
      sourceId,
    });
    assert.deepEqual(result.diagnostics, [], sourceId);
  }
});

// The bootstrap parser already implements CaseBlock's own early errors,
// including the LexicallyDeclaredNames/VarDeclaredNames overlap check, so
// a lexical or var conflict surfaces as a parse failure before conversion
// ever runs. Babel's parser admits a duplicate ordinary FunctionDeclaration
// itself, because Annex B.3.2 (Block-Level Function Declarations Web
// Legacy Compatibility Semantics) is a normal browser and Node.js
// capability Babel assumes by default, but this profile's closed
// ahead-of-time runtime does not implement it, so HIR construction
// rejects that duplicate on its own instead.
const rejectedSwitchFunctionConflicts = [
  [
    "a lexical name shared with a switch clause function",
    "switch (1) { case 1: let f; default: function f() {} }",
    "OSEO0001",
  ],
  [
    "mismatched function kinds sharing a switch clause name",
    "switch (1) { case 1: function f() {} default: function* f() {} }",
    "OSEO0001",
  ],
  [
    "a var name shared with a switch clause function",
    "switch (1) { case 1: var f; default: function f() {} }",
    "OSEO0001",
  ],
  [
    "two ordinary switch clause functions sharing a name",
    "switch (1) { case 1: function f() {} default: function f() {} }",
    "OSEO1001",
  ],
] as const;

for (const [name, source, code] of rejectedSwitchFunctionConflicts) {
  test(`rejects ${name}`, () => {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "switch-function-conflict.ts",
    });
    assert.equal(result.diagnostics[0]?.code, code);
  });
}

test("admits a var declaration sharing a disjoint switch function name", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function outer() {\n" +
      "  switch (1) { case 1: function f() { return 1; } }\n" +
      "  var f;\n" +
      "  return typeof f;\n" +
      "}\n",
    sourceId: "switch-function-var-disjoint.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  const outer = /let %b(\d+) f = undefined/u.exec(hirText)?.[1];
  const switchFunction = /function-init %b(\d+) f = @f\d+/u.exec(hirText)?.[1];
  assert.ok(outer != null);
  assert.ok(switchFunction != null);
  assert.notEqual(switchFunction, outer);
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

test("converts classic for binding patterns to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "for (let [index, step = 1] = [0]; index < 2; index += step) {}\n" +
      "for (const { value, ...rest } = { value: 1 }; value < 2;) break;\n" +
      "for (var [retained] = [3]; retained < 4; retained++) {}\n",
    sourceId: "for-binding-patterns.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hir = printHir(result.hir);
  assert.match(hir, /for \(let \[/u);
  assert.match(hir, /for \(const \{/u);
  assert.match(hir, /for \(var \[/u);
});

const unsupportedForForms = [
  ["for-in", "for (const key in {}) console.log(key);"],
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

test("converts for-await-of heads to the asynchronous protocol", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let assigned; const target = {};\n" +
      "async function consume(source) {\n" +
      "  for await (const item of source) console.log(item);\n" +
      "  for await (let item of source) console.log(item);\n" +
      "  for await (var item of source) console.log(item);\n" +
      "  for await (assigned of source) console.log(assigned);\n" +
      "  for await (target.value of source) {}\n" +
      "  for await (const [first] of source) console.log(first);\n" +
      "}\n" +
      "consume([]);\n",
    sourceId: "for-await-of-forms.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /for await \(const %b\d+ item of %b\d+\(source\)\)/u);
  assert.match(hir, /for await \(%b\d+\(target\)\["value"\] of/u);
  assert.match(mir, /GetIterator async/u);
  assert.match(
    mir,
    /iterator-await-start start Await, IteratorStep, and IteratorValue/u,
  );
  assert.match(
    mir,
    /iterator-await-result inspect Await, IteratorStep, and IteratorValue/u,
  );
  assert.match(mir, /value-only=%\d+/u);
  assert.match(mir, /AsyncIteratorClose/u);
  assert.match(mir, /iterator-close-start start AsyncIteratorClose/u);
  assert.match(mir, /close-mode=%\d+/u);
  assert.match(mir, /iterator-close-result complete AsyncIteratorClose/u);
  assert.match(mir, /for-await-of bb\d+/u);
  // Destructuring the awaited value is ordinary array binding, so the
  // pattern head still acquires a synchronous iterator over that value.
  assert.match(mir, /IteratorClose for array binding/u);
});

test("keeps the synchronous protocol for a head without await", () => {
  const result = compileSource(babelFrontend, {
    source: "async function consume() { for (const item of []) item; }\n",
    sourceId: "for-of-in-async.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /for \(const %b\d+ item of \[\]\)/u);
  assert.match(printMir(result.mir), /GetIterator sync/u);
  assert.doesNotMatch(printMir(result.mir), /GetIterator async/u);
});

// `for await` is only valid inside an async function or a module body, so
// the bootstrap parser rejects every other position before conversion.
test("keeps for-await-of outside an async context a parse failure", () => {
  for (const source of [
    "for await (const item of []) {}",
    "function sync() { for await (const item of []) {} }",
    "function* generate() { for await (const item of []) {} }",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "for-await-of-position.ts",
    });
    assert.ok(result.diagnostics.length > 0, source);
    assert.equal(result.mir, undefined);
  }
});

function compileOneModule(source: string, sourceId: string) {
  const parsed = babelModuleFrontend.parseModule({ source, sourceId });
  assert.ok(parsed.parsed, sourceId);
  assert.ok(parsed.module != null);
  return compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: sourceId,
        syntax: parsed.module,
      },
    ],
  });
}

test("admits a debugger statement at a module's top level", () => {
  const compiled = compileOneModule(
    'console.log("before");\n' +
      "debugger;\n" +
      "for (let i = 0; i < 1; i = i + 1) { debugger; }\n" +
      'console.log("after");\n',
    "file:///app/module-debugger.js",
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("lowers a module top-level for-await head", () => {
  const compiled = compileOneModule(
    "for await (const item of [1, 2]) console.log(item);\n",
    "file:///app/module-for-await.js",
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const mir = printMir(compiled.mir);
  assert.match(mir, /GetIterator async/u);
  assert.match(mir, /Await, IteratorStep, and IteratorValue/u);
  assert.match(mir, /iterator-await-start/u);
  assert.match(mir, /iterator-close-start/u);
  assert.match(mir, /iterator-close-result/u);
  assert.match(mir, /generator-await/u);
});

test("suspends an awaited iterable inside a for-await head", () => {
  const compiled = compileOneModule(
    "for await (const item of await Promise.resolve([])) {}\n",
    "file:///app/for-await-awaited-iterable.js",
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const continuation = compiled.mir.functions.find((functionValue) =>
    functionValue.name.startsWith("*module:"),
  );
  assert.ok(
    (continuation?.blocks.filter(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ).length ?? 0) >= 2,
  );
});

test("converts for-of declaration binding patterns to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const readers = [];\n" +
      "let index = 0;\n" +
      "for (const [first, ...rest] of [[1, 2]]) {\n" +
      "  readers[index] = function () { return first + rest[0]; };\n" +
      "  index = index + 1;\n" +
      "}\n" +
      "for (let { value = 3, ...rest } of [{}]) {\n" +
      "  console.log(value, Object.keys(rest).length);\n" +
      "}\n" +
      "for (var [retained] of [[4]]) {}\n" +
      "console.log(readers[0](), retained);\n",
    sourceId: "for-of-binding-patterns.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(hir, /for \(const \[%b\d+ first, \.\.\.%b\d+ rest\] of/u);
  assert.match(hir, /for \(let \{"value": %b\d+ value = 3/u);
  assert.match(hir, /for \(var \[%b\d+ retained\] of/u);
  assert.match(mir, /fresh lexical cell for first/u);
  assert.match(mir, /IteratorClose for array binding/u);
  assert.match(mir, /object-rest CopyDataProperties/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|RestElement/u,
  );
});

test("converts for-of destructuring assignment heads to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let first = 0;\n" +
      "const target = {};\n" +
      "for ([first, target.value] of [[1, 2]]) {}\n" +
      "for ({ value: first, ...target.rest } of " +
      "[{ value: 3, extra: 4 }]) {}\n" +
      "console.log(first, target.value, target.rest.extra);\n",
    sourceId: "for-of-assignment-patterns.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  const hir = printHir(result.hir);
  const mir = printMir(result.mir);
  assert.match(
    hir,
    /for \(\[%b\d+ first, target %b\d+\(target\)\["value"\]\] of/u,
  );
  assert.match(
    hir,
    /for \(\{"value": %b\d+ first, \.\.\.target %b\d+\(target\)\["rest"\]\}/u,
  );
  assert.match(mir, /IteratorClose for array binding/u);
  assert.match(mir, /destructuring member target/u);
  assert.match(mir, /object-rest CopyDataProperties/u);
  assert.doesNotMatch(
    JSON.stringify(result.hir),
    /ArrayPattern|ObjectPattern|RestElement/u,
  );
});

test("converts private for-of assignment targets", () => {
  const result = compileSource(babelFrontend, {
    source:
      "class Box {\n" +
      "  #value = 0;\n" +
      "  assign(values) {\n" +
      "    for (this.#value of values) {}\n" +
      "    return this.#value;\n" +
      "  }\n" +
      "}\n",
    sourceId: "private-for-of-assignment.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.ok(result.mir != null);
  assert.match(printHir(result.hir), /for \(this strict\.%b\d+ #value of/u);
  const mir = printMir(result.mir);
  assert.match(mir, /for-of private target/u);
  assert.match(mir, /private-set for-of private target/u);
});

test("checks for-of assignment member bases before key conversion", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const key = { toString: function () { return 'value'; } };\n" +
      "for ([null[key]] of [[1]]) {}\n",
    sourceId: "for-of-nullish-assignment-member.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const block = result.mir.script.blocks.find((candidate) =>
    candidate.operations.some(
      (operation) =>
        operation.kind === "object-coercible" &&
        operation.detail === "RequireObjectCoercible for assignment target",
    ),
  );
  assert.ok(block != null);
  const coercibleIndex = block.operations.findIndex(
    (operation) => operation.kind === "object-coercible",
  );
  assert.ok(coercibleIndex >= 0);
  const keyOffset = block.operations
    .slice(coercibleIndex + 1)
    .findIndex((operation) => operation.kind === "property-key");
  const setOffset = block.operations
    .slice(coercibleIndex + 1)
    .findIndex(
      (operation) =>
        operation.kind === "property-set" &&
        operation.detail === "destructuring member target",
    );
  const keyIndex = coercibleIndex + 1 + keyOffset;
  const setIndex = coercibleIndex + 1 + setOffset;
  assert.ok(keyOffset >= 0);
  assert.ok(setOffset >= 0);
  assert.ok(keyIndex > coercibleIndex);
  assert.ok(setIndex > keyIndex);
  assert.ok(
    block.operations
      .slice(coercibleIndex, keyIndex)
      .some(
        (operation) =>
          operation.kind === "check-status" && operation.abruptTarget != null,
      ),
  );
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

test("converts tagged templates to calls with owned template objects", () => {
  const result = compileSource(babelFrontend, {
    source:
      "function tag(parts, value) { return value; }\n" +
      "console.log(tag`line\\n${1}tail`);",
    sourceId: "tagged.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const hirText = printHir(result.hir);
  assert.match(hirText, /call %b\d+\(tag\)\(template \["line\\n", "tail"\]/u);
  assert.match(hirText, /raw \["line\\\\n", "tail"\], 1\)/u);
  const operations = result.mir?.script.blocks.flatMap(
    (block) => block.operations,
  );
  const template = operations?.find(
    (operation) => operation.kind === "template-object",
  );
  assert.deepEqual(template?.templateCooked, ["line\n", "tail"]);
  assert.deepEqual(template?.templateRaw, ["line\\n", "tail"]);
  assert.ok(
    operations?.some(
      (operation) =>
        operation.kind === "call" &&
        operation.arguments.includes(template?.id ?? -1),
    ),
  );
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

test("admits await inside logical operands of async functions", () => {
  const result = compileSource(babelFrontend, {
    source: "async function first(input) { return input && (await input); }",
    sourceId: "async-logical.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  const asynchronous = result.mir?.functions.find(
    (functionValue) => functionValue.asyncFunction === true,
  );
  assert.equal(
    asynchronous?.blocks.filter(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ).length,
    1,
  );
});

test("suspends top-level await inside logical operands", () => {
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
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const continuation = compiled.mir.functions.find((functionValue) =>
    functionValue.name.startsWith("*module:"),
  );
  assert.ok(
    continuation?.blocks.some(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ),
  );
});

test("admits direct typeof with an unresolvable name", () => {
  const result = compileSource(babelFrontend, {
    source: "console.log(typeof missing);\nconsole.log(typeof (missing));",
    sourceId: "typeof-unresolved.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  // Both the bare and the parenthesized reference fold to the string the
  // specification's unresolvable-reference step produces, without a
  // binding read or a hidden cell.
  assert.match(printHir(result.hir), /console\.log\("undefined"\)/u);
});

test("admits direct typeof with an unresolvable name in a module", () => {
  const result = babelModuleFrontend.parseModule({
    source: "console.log(typeof missing);",
    sourceId: "file:///app/typeof-module.js",
  });
  assert.ok(result.parsed);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/typeof-module.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/typeof-module.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "typeof-module",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /constant "undefined"/u);
});

test("admits direct typeof with an unresolvable name in strict code", () => {
  const result = compileSource(babelFrontend, {
    source: '"use strict";\nconsole.log(typeof missing);',
    sourceId: "typeof-unresolved-strict.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /console\.log\("undefined"\)/u);
});

test("keeps every non-typeof unresolved reference rejected", () => {
  for (const source of [
    "console.log(missing);",
    "console.log(typeof missing.property);",
    "console.log(typeof (0, missing));",
    "missing = 1;",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "unresolved-read.ts",
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /Unknown binding 'missing'/u,
      source,
    );
  }
});

test("rejects typeof of an unshadowed runtime intrinsic name", () => {
  const result = compileSource(babelFrontend, {
    source: "console.log(typeof Promise);",
    sourceId: "typeof-intrinsic.ts",
  });
  assert.equal(result.diagnostics[0]?.code, "OSEO1001");
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /typeof runtime intrinsic binding 'Promise'/u,
  );
});

test("rejects typeof of an unimplemented standard global name", () => {
  // ECMA-262 clause 19 requires every conforming realm to bind these
  // names, so the unresolvable fold's "undefined" answer would
  // misreport them; each stays a source-located rejection until the
  // profile admits it as a value, inside and outside `with` alike.
  for (const source of [
    "console.log(typeof Math);",
    "console.log(typeof Array);",
    "console.log(typeof Function);",
    "console.log(typeof JSON);",
    "console.log(typeof RegExp);",
    "console.log(typeof BigInt);",
    "console.log(typeof eval);",
    "console.log(typeof globalThis);",
    "console.log(typeof parseInt);",
    "with ({}) { console.log(typeof Math); }",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "typeof-standard-global.ts",
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /typeof standard global binding '\w+' is outside/u,
      source,
    );
  }
});

test("resolves typeof of a shadowed standard global to the binding", () => {
  for (const source of [
    "let Math = 1; console.log(typeof Math);",
    "function Array() {}\nconsole.log(typeof Array);",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "typeof-shadowed-global.ts",
    });
    assert.deepEqual(result.diagnostics, [], source);
    assert.ok(result.hir != null, source);
  }
});

test("keeps the fold for names outside the pinned realm", () => {
  // Annex B additions are excluded from the claim, so an unshadowed
  // `escape` is an ordinary unresolvable name in this profile's realm.
  const result = compileSource(babelFrontend, {
    source: "console.log(typeof escape);",
    sourceId: "typeof-annex-b.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /console\.log\("undefined"\)/u);
});

test("resolves typeof of a shadowed intrinsic name to the binding", () => {
  const result = compileSource(babelFrontend, {
    source: "let Promise = 1;\nconsole.log(typeof Promise);",
    sourceId: "typeof-shadowed-intrinsic.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /typeof %b\d+\(Promise\)/u);
});

test("consults object environments before the typeof fallback", () => {
  const result = compileSource(babelFrontend, {
    source:
      "const environment = { present: 1 };\n" +
      "with (environment) {\n" +
      "  console.log(typeof present);\n" +
      "  console.log(typeof absent);\n" +
      "}\n",
    sourceId: "typeof-with.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  const printed = printHir(result.hir);
  // A hit inspects the object environment's value; a genuinely
  // unresolvable miss falls back to the undefined value rather than a
  // hidden uninitialized cell, so typeof reports "undefined" instead of
  // an uninitialized-cell error.
  assert.match(printed, /typeof with\[%b\d+\] present fallback undefined/u);
  assert.match(printed, /typeof with\[%b\d+\] absent fallback undefined/u);
});

test("rejects typeof of an assigned with fallback name", () => {
  // A hidden fallback cell an unresolved assignment can initialize at
  // run time would make the folded "undefined" answer misreport the
  // materialized value, so the combination stays rejected in every
  // source order and position, including a direct fold outside the
  // assigning region and an assignment only a later iteration or a
  // nested closure performs.
  for (const source of [
    "with ({}) { missing = 1; console.log(typeof missing); }",
    "with ({}) { console.log(typeof missing); missing = 1; }",
    "with ({}) {\n" +
      "  for (let i = 0; i < 2; i = i + 1) {\n" +
      "    console.log(typeof missing);\n" +
      "    missing = 1;\n" +
      "  }\n" +
      "}",
    "with ({}) {\n" +
      "  const f = () => { missing = 1; };\n" +
      "  console.log(typeof missing);\n" +
      "}",
    "with ({}) { missing = 1; }\nconsole.log(typeof missing);",
    "console.log(typeof missing);\nwith ({}) { missing = 1; }",
    "with ({}) { with ({}) { missing = 1; } console.log(typeof missing); }",
    "function assign() { with ({}) { missing = 1; } }\n" +
      "function probe() { return typeof missing; }\n" +
      "console.log(probe());\nassign();",
  ]) {
    const result = compileSource(babelFrontend, {
      source,
      sourceId: "typeof-with-assigned.ts",
    });
    assert.equal(result.diagnostics[0]?.code, "OSEO1001", source);
    assert.match(
      result.diagnostics[0]?.message ?? "",
      /typeof with fallback binding 'missing'/u,
      source,
    );
  }
});

test("keeps typeof beside unrelated with fallback assignments", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let known = 1;\n" +
      "with ({}) {\n" +
      "  other = 1;\n" +
      "  known = 2;\n" +
      "  console.log(typeof missing, typeof known);\n" +
      "}\n",
    sourceId: "typeof-with-unrelated.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
});

test("keeps the lexical fallback for typeof through with", () => {
  const result = compileSource(babelFrontend, {
    source:
      "let shadowable = 1;\n" +
      "const environment = {};\n" +
      "with (environment) {\n" +
      "  console.log(typeof shadowable);\n" +
      "}\n",
    sourceId: "typeof-with-lexical.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(
    printHir(result.hir),
    /typeof with\[%b\d+\] shadowable fallback %b\d+\(shadowable\)/u,
  );
});

test("converts with statements to owned syntax", () => {
  const result = compileSource(babelFrontend, {
    source:
      'let value = "lexical";\n' +
      'const environment = { value: "object" };\n' +
      "with (environment) {\n" +
      '  value = value + "!";\n' +
      "}\n",
    sourceId: "with-statement.ts",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null);
  assert.match(printHir(result.hir), /with \(%b\d+\(environment\)\)/u);
});

const unsupportedForms = [
  ["property", "console.error(1);"],
  ["module", 'import "fixture";'],
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

test("indexes wide structured annotations once per pattern", () => {
  const sizes = [5_000, 15_000] as const;
  const observations = sizes.flatMap((size) => {
    const names = Array.from({ length: size }, (_, index) => `v${index}`);
    const values = names.map(() => "0");
    const cases = [
      [
        "array",
        `const [${names}]: ` +
          `[...[${names.map(() => "number")}]] = [${values}];`,
      ],
      [
        "object",
        `const {${names}}: {${names.map((name) => `${name}: number`)}} = ` +
          `{${names.map((name) => `${name}: 0`)}};`,
      ],
    ] as const;
    return cases.map(([name, source]) => {
      const started = performance.now();
      const result = babelFrontend.parse({
        source,
        sourceId: `wide-${name}-hints.ts`,
      });
      return {
        elapsed: performance.now() - started,
        name,
        result,
        size,
      };
    });
  });
  for (const { name, result, size } of observations) {
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.parsed);
    const statement = result.program?.body[0];
    assert.ok(statement != null && statement.kind === "binding-pattern");
    const pattern = statement.pattern;
    const leaves =
      name === "array" && pattern.kind === "array-binding-pattern"
        ? [pattern.elements[0]?.pattern, pattern.elements.at(-1)?.pattern]
        : name === "object" && pattern.kind === "object-binding-pattern"
          ? [pattern.properties[0]?.pattern, pattern.properties.at(-1)?.pattern]
          : [];
    assert.equal(leaves.length, 2);
    for (const leaf of leaves) {
      assert.ok(leaf != null && leaf.kind === "binding-identifier");
      assert.deepEqual(
        leaf.hints.map(({ name: hintName, provenance }) => ({
          name: hintName,
          provenance,
        })),
        [{ name: "number", provenance: "typescript" }],
        `${name} ${size}-leaf pattern lost an endpoint hint`,
      );
    }
  }
  for (const name of ["array", "object"] as const) {
    const small = observations.find(
      (observation) =>
        observation.name === name && observation.size === sizes[0],
    );
    const large = observations.find(
      (observation) =>
        observation.name === name && observation.size === sizes[1],
    );
    assert.ok(small != null && large != null);
    const ratio = large.elapsed / small.elapsed;
    assert.ok(ratio < 6, `${name} hint scaling ratio was ${ratio.toFixed(2)}`);
  }
});
