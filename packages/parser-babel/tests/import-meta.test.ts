import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHir,
  buildModuleGraph,
  compileModuleGraph,
  printHir,
  printMir,
  type HirStatement,
  type ModuleCompilationResult,
} from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

/** Compile a closed graph of Module sources rooted at the first entry. */
async function compileModules(
  sources: Readonly<Record<string, string>>,
): Promise<ModuleCompilationResult> {
  const entryId = Object.keys(sources)[0];
  assert.ok(entryId != null);
  const built = await buildModuleGraph(
    babelModuleFrontend,
    {
      load(canonicalId) {
        const source = sources[canonicalId];
        assert.ok(source != null, canonicalId);
        return Promise.resolve({
          diagnostics: [],
          source: { source, sourceHash: canonicalId, sourceId: canonicalId },
        });
      },
    },
    {
      resolve(importerId, specifier) {
        return {
          canonicalId: new URL(specifier.value, importerId).href,
          diagnostics: [],
        };
      },
    },
    entryId,
  );
  assert.deepEqual(built.diagnostics, []);
  assert.ok(built.graph != null);
  return compileModuleGraph(built.graph);
}

/** The top-level import.meta initializers, in program order. */
function importMetaInitializers(
  result: ModuleCompilationResult,
): readonly (HirStatement & { readonly kind: "const" })[] {
  return (result.hir?.body ?? []).filter(
    (statement): statement is HirStatement & { readonly kind: "const" } =>
      statement.kind === "const" && statement.name === "*import.meta*",
  );
}

/** Every binding id the printed HIR reads under the import.meta name. */
function importMetaReads(printed: string): readonly number[] {
  return [...printed.matchAll(/%b(\d+)\(\*import\.meta\*\)/gu)].map((match) =>
    Number(match[1]),
  );
}

test("reads one null-prototype import.meta object per module", async () => {
  const entry = "file:///app/entry.js";
  const result = await compileModules({
    [entry]:
      'import { dependencyMeta } from "./dependency.js";\n' +
      "const direct = import.meta;\n" +
      "const arrow = () => import.meta;\n" +
      "function nested() { return import.meta; }\n" +
      "class Reader { static field = import.meta; read() { " +
      "return import.meta; } }\n" +
      "function* generate() { yield import.meta; }\n" +
      "async function later() { await 0; return import.meta; }\n" +
      "const laterArrow = async () => { await 0; return import.meta; };\n" +
      "async function* stream() { await 0; yield import.meta; }\n" +
      "await later();\n" +
      "console.log(direct === import.meta, dependencyMeta, arrow, " +
      "nested, Reader, generate, laterArrow, stream);\n",
    "file:///app/dependency.js":
      "export const dependencyMeta = import.meta;\n" +
      "export function read() { return import.meta; }\n",
    "file:///app/plain.js": "export const plain = 1;\n",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.hir != null && result.mir != null);
  const initializers = importMetaInitializers(result);
  // One object per module that reads import.meta, never one per read.
  assert.equal(initializers.length, 2);
  const ids = initializers.map((statement) => statement.bindingId);
  assert.notEqual(ids[0], ids[1]);
  for (const initializer of initializers) {
    // An ordinary object literal whose only entry sets [[Prototype]] to
    // null: extensible, with no own properties.
    assert.deepEqual(
      {
        kind: initializer.initializer.kind,
        properties:
          initializer.initializer.kind === "object"
            ? initializer.initializer.properties.map((property) =>
                property.kind === "definition"
                  ? {
                      key: property.key.kind,
                      prototypeSetter: property.prototypeSetter,
                      value: property.value.kind,
                    }
                  : property.kind,
              )
            : undefined,
      },
      {
        kind: "object",
        properties: [{ key: "string", prototypeSetter: true, value: "null" }],
      },
    );
  }
  const printed = printHir(result.hir);
  const reads = importMetaReads(printed);
  // The entry reads its object ten times and the dependency twice;
  // every read names one of the two initialized cells.
  assert.equal(reads.length, 12);
  assert.deepEqual(new Set(reads), new Set(ids));
  assert.ok(
    result.hir.globalBindings?.some(
      (binding) => binding.id === ids[0] && binding.name === "*import.meta*",
    ),
  );
  assert.doesNotMatch(printed, /import-meta/u);
  assert.match(printMir(result.mir), /object-set-prototype/u);
});

test("creates import.meta before any module function initializer", async () => {
  // The dependency evaluates first and calls the entry's hoisted function
  // before the entry body runs, which must already see the entry object.
  const entry = "file:///app/cycle-entry.js";
  const result = await compileModules({
    [entry]:
      'import { early } from "./cycle-dependency.js";\n' +
      "export function entryMeta() { return import.meta; }\n" +
      "console.log(early === import.meta);\n",
    "file:///app/cycle-dependency.js":
      'import { entryMeta } from "./cycle-entry.js";\n' +
      "export const early = entryMeta();\n",
  });
  assert.deepEqual(result.diagnostics, []);
  const body = result.hir?.body ?? [];
  const initializer = body.findIndex(
    (statement) =>
      statement.kind === "const" && statement.name === "*import.meta*",
  );
  const firstFunction = body.findIndex(
    (statement) => statement.kind === "function-init",
  );
  assert.ok(initializer >= 0);
  assert.ok(firstFunction > initializer);
  assert.equal(importMetaInitializers(result).length, 1);
});

test("adds no import.meta object to a module that never reads it", async () => {
  const result = await compileModules({
    "file:///app/no-meta.js":
      "const meta = { import: 1 };\nconsole.log(meta.import);\n",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(importMetaInitializers(result).length, 0);
  assert.equal(
    result.hir?.globalBindings?.some(
      (binding) => binding.name === "*import.meta*",
    ),
    false,
  );
});

test("admits every non-target use of import.meta in Module code", async () => {
  const sources = [
    "import.meta.added = 1;",
    "import.meta.count += 1;",
    "import.meta.count++;",
    "delete import.meta.added;",
    "delete import.meta;",
    "typeof import.meta;",
    "import.meta?.missing;",
    'import.meta["computed"];',
    "import.meta();",
    "new import.meta();",
    "import.meta`tag`;",
    "[import.meta.slot] = [1];",
    "({ slot: import.meta.slot } = { slot: 1 });",
    "for (import.meta.slot of [1]);",
    "for (import.meta.key in { a: 1 });",
    "const { ...rest } = import.meta;",
    "Object.setPrototypeOf(import.meta, {});",
    "if (import.meta) {}",
    "label: { import.meta; }",
  ];
  const results = await Promise.all(
    sources.map((source) => compileModules({ "file:///app/use.js": source })),
  );
  for (const [index, result] of results.entries()) {
    assert.deepEqual(result.diagnostics, [], sources[index]);
    assert.equal(importMetaInitializers(result).length, 1, sources[index]);
  }
});

test("rejects import.meta outside Module code at its location", () => {
  for (const source of [
    "import.meta;",
    "function f() { return import.meta; }",
    "() => import.meta;",
    "class C { m() { return import.meta; } }",
    "if (true) { import.meta.x; }",
  ]) {
    const result = babelFrontend.parse({
      source,
      sourceId: "file:///app/script.js",
    });
    assert.equal(result.parsed, false, source);
    assert.equal(result.diagnostics.length, 1, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
    assert.equal(
      result.diagnostics[0]?.byteRange.start,
      source.indexOf("import.meta"),
      source,
    );
  }
});

test("rejects escaped spellings and import.meta assignment targets", () => {
  for (const [source, offset] of [
    ["im\\u0070ort.meta;", 0],
    ["import.m\\u0065ta;", 7],
    ["import.foo;", 7],
    ["import.meta = 0;", 0],
    ["import.meta += 0;", 0],
    ["import.meta &&= 0;", 0],
    ["import.meta ??= 0;", 0],
    ["(import.meta) = 0;", 0],
    ["import.meta++;", 0],
    ["--import.meta;", 2],
    ["[import.meta] = [];", 1],
    ["[...import.meta] = [];", 4],
    ["({ a: import.meta } = {});", 6],
    ["({ ...import.meta } = {});", 6],
    ["for (import.meta in null);", 5],
    ["for (import.meta of null);", 5],
    ["async function* f() { for await (import.meta of null); }", 33],
  ] as const) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "file:///app/module.js",
    });
    assert.equal(result.parsed, false, source);
    assert.ok(result.diagnostics.length > 0, source);
    assert.ok(
      result.diagnostics.every((entry) => entry.code === "OSEO0001"),
      source,
    );
    assert.equal(result.diagnostics[0]?.byteRange.start, offset, source);
  }
});

test("keeps owned import.meta syntax out of a Script resolution", () => {
  const range = {
    end: { column: 12, line: 1 },
    start: { column: 1, line: 1 },
  };
  const result = buildHir({
    body: [
      {
        expression: {
          byteRange: { end: 11, start: 0 },
          kind: "import-meta",
          range,
        },
        kind: "expression",
        range,
      },
    ],
    kind: "program",
    range,
    sourceId: "file:///app/owned.js",
  });
  assert.equal(result.program, undefined);
  assert.deepEqual(
    result.diagnostics.map((entry) => [
      entry.code,
      entry.message,
      entry.byteRange,
    ]),
    [
      [
        "OSEO0001",
        "import.meta is only valid in Module code.",
        { end: 11, start: 0 },
      ],
    ],
  );
});
