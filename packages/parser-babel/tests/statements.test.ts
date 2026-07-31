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
  assert.doesNotMatch(mir, /iterator-await-start/u);
});

// The loop stays in place instead of splitting into continuations, so an
// awaited iterable would reach a position the module transform does not
// own; it keeps the existing rejection rather than approximating one.
test("rejects an awaited iterable inside a for-await head", () => {
  const compiled = compileOneModule(
    "for await (const item of await Promise.resolve([])) {}\n",
    "file:///app/for-await-awaited-iterable.js",
  );
  assert.equal(compiled.mir, undefined);
  assert.match(
    compiled.diagnostics[0]?.message ?? "",
    /control-flow position/u,
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
  assert.match(printHir(result.hir), /for \(this\.%b\d+ #value of/u);
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
