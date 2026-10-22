import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  compileModuleGraph,
  linkModuleGraph,
  printHir,
} from "@oseo/compiler";
import type { LinkedModuleGraph, ModuleGraph } from "@oseo/compiler";

import { babelModuleFrontend } from "../src/index.ts";

/** Build a closed graph from in-memory sources under file:///app/. */
async function graphOf(
  sources: Readonly<Record<string, string>>,
  entry = "main.js",
): Promise<ModuleGraph> {
  const result = await buildModuleGraph(
    babelModuleFrontend,
    {
      load(canonicalId) {
        const source = sources[canonicalId.slice("file:///app/".length)];
        return Promise.resolve(
          source == null
            ? { diagnostics: [] }
            : {
                diagnostics: [],
                source: {
                  source,
                  sourceHash: `content:${source}`,
                  sourceId: canonicalId,
                },
              },
        );
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
    `file:///app/${entry}`,
  );
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.graph != null);
  return result.graph;
}

function linkedModule(graph: LinkedModuleGraph, name: string) {
  const found = graph.modules.find(
    (module) => module.canonicalId === `file:///app/${name}`,
  );
  assert.ok(found != null, name);
  return found;
}

function exportCell(
  graph: LinkedModuleGraph,
  name: string,
  exportedName: string,
): number | undefined {
  return linkedModule(graph, name).exports.find(
    (entry) => entry.exportedName === exportedName,
  )?.cellId;
}

function importCell(
  graph: LinkedModuleGraph,
  name: string,
  localName: string,
): number | undefined {
  return linkedModule(graph, name).imports.find(
    (entry) => entry.localName === localName,
  )?.cellId;
}

test("converts var, namespace, and string-named module entries", () => {
  const result = babelModuleFrontend.parseModule({
    source: [
      "export var first = 1, second, { third, fourth: [fifth] } = source;",
      'export * as space from "./dep.js";',
      'export * as "string name" from "./dep.js";',
      'export * as default from "./dep.js";',
      'import { "*" as star, "☿" as mercury } from "./dep.js";',
      'import * as whole from "./dep.js";',
      'export { mercury as "*", "☿" as "" } from "./dep.js";',
      "var hidden;",
      "var source = {};",
      "function declared() {}",
    ].join("\n"),
    sourceId: "file:///app/forms.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.exports.map((entry) => [
      entry.kind,
      "exportedName" in entry ? entry.exportedName : undefined,
      entry.kind === "local"
        ? entry.localName
        : entry.kind === "indirect"
          ? entry.importedName
          : undefined,
    ]),
    [
      ["local", "first", "first"],
      ["local", "second", "second"],
      ["local", "third", "third"],
      ["local", "fifth", "fifth"],
      ["namespace", "space", undefined],
      ["namespace", "string name", undefined],
      ["namespace", "default", undefined],
      ["indirect", "*", "mercury"],
      ["indirect", "", "☿"],
    ],
  );
  assert.deepEqual(
    result.module.imports.map((entry) => [
      entry.importedName,
      entry.localName,
      entry.namespace === true,
    ]),
    [
      ["*", "star", false],
      ["☿", "mercury", false],
      ["*", "whole", true],
    ],
  );
  // A function declaration is lexical in Module code and initialized by
  // its own function-init statement, so it is not a var name.
  assert.deepEqual(result.module.varNames.toSorted(), [
    "fifth",
    "first",
    "hidden",
    "second",
    "source",
    "third",
  ]);
});

test("reports duplicate and ill-formed export names before linking", () => {
  const failures = [
    'var x;\nexport { x as z };\nexport * as z from "./dep.js";\n',
    'var x;\nexport default x;\nexport * as default from "./dep.js";\n',
    "export var repeated;\nexport { repeated };\n",
    'export * as twice from "./a.js";\nexport * as twice from "./b.js";\n',
    'export { Moon as "\\uD83C" };\nfunction Moon() {}\n',
    'import { "\\uD83D" as foo } from "./dep.js";\n',
    'export * as "\\uD83D" from "./dep.js";\n',
    'export { "foo" as "bar" };\nfunction foo() {}\n',
    'export * as space from "./dep.js" null;\n',
  ];
  for (const source of failures) {
    const result = babelModuleFrontend.parseModule({
      source,
      sourceId: "file:///app/invalid.js",
    });
    assert.ok(!result.parsed, source);
    assert.equal(result.diagnostics[0]?.code, "OSEO0001", source);
  }
  const duplicate = babelModuleFrontend.parseModule({
    source: failures[0] ?? "",
    sourceId: "file:///app/duplicate.js",
  });
  assert.match(
    duplicate.diagnostics[0]?.message ?? "",
    /Duplicate export 'z'/u,
  );
});

test("accepts a surrogate pair as a namespace export name", () => {
  const result = babelModuleFrontend.parseModule({
    source: 'export * as "\\uD83D\\uDE00" from "./dep.js";\n',
    sourceId: "file:///app/pair.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  assert.deepEqual(
    result.module.exports.map((entry) => [
      entry.kind,
      "exportedName" in entry ? entry.exportedName : undefined,
    ]),
    [["namespace", "\u{1F600}"]],
  );
});

test("links namespace exports to the one namespace cell", async () => {
  const graph = await graphOf({
    "dep.js": "export let value = 1;\nexport default 2;\n",
    "main.js": [
      'import * as direct from "./dep.js";',
      'import { space, "string name" as named } from "./re.js";',
      'import { value, default as fallback } from "./shadow.js";',
    ].join("\n"),
    "re.js": [
      'export * as space from "./dep.js";',
      'export * as "string name" from "./dep.js";',
    ].join("\n"),
    // An explicit `export * as` name wins over the same name reached
    // through a star export, and a namespace may be exported as default.
    "shadow.js": [
      'export * as value from "./dep.js";',
      'export * as default from "./dep.js";',
      'export * from "./dep.js";',
    ].join("\n"),
  });
  const linked = linkModuleGraph(graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph != null);
  const namespaceCell = linkedModule(linked.graph, "dep.js").namespaceCellId;
  assert.notEqual(namespaceCell, undefined);
  assert.equal(importCell(linked.graph, "main.js", "direct"), namespaceCell);
  assert.equal(importCell(linked.graph, "main.js", "space"), namespaceCell);
  assert.equal(importCell(linked.graph, "main.js", "named"), namespaceCell);
  assert.equal(importCell(linked.graph, "main.js", "value"), namespaceCell);
  assert.equal(importCell(linked.graph, "main.js", "fallback"), namespaceCell);
  assert.notEqual(exportCell(linked.graph, "dep.js", "value"), namespaceCell);
  assert.deepEqual(linkedModule(linked.graph, "re.js").namespaceNames, [
    "space",
    "string name",
  ]);
  assert.equal(linkedModule(linked.graph, "re.js").namespaceCellId, undefined);
});

test("keeps star ambiguity for distinct exported namespaces", async () => {
  const sources = {
    "a.js": 'export * as space from "./x.js";',
    "b.js": 'export * as space from "./y.js";',
    "c.js": 'export * from "./a.js";\nexport * from "./b.js";',
    "main.js": 'import { space } from "./c.js";',
    "same.js": 'export * from "./a.js";\nexport * from "./a2.js";',
    "a2.js": 'export * as space from "./x.js";',
    "x.js": "export const x = 1;",
    "y.js": "export const y = 2;",
  };
  const ambiguous = linkModuleGraph(await graphOf(sources));
  assert.equal(ambiguous.graph, undefined);
  assert.deepEqual(
    ambiguous.diagnostics.map((item) => item.message),
    ["Import 'space' is ambiguous."],
  );
  // Two star paths to the same module's namespace resolve to one binding.
  const same = linkModuleGraph(
    await graphOf({
      ...sources,
      "main.js": 'import { space } from "./same.js";',
    }),
  );
  assert.deepEqual(same.diagnostics, []);
  assert.ok(same.graph != null);
  assert.equal(
    importCell(same.graph, "main.js", "space"),
    linkedModule(same.graph, "x.js").namespaceCellId,
  );
});

test("separates the string export name * from namespace imports", async () => {
  const graph = await graphOf({
    "dep.js": 'const value = 1;\nexport { value as "*" };\n',
    "main.js": [
      'import { "*" as star } from "./dep.js";',
      'import * as whole from "./dep.js";',
      'import { again } from "./re.js";',
    ].join("\n"),
    "re.js": 'export { "*" as again } from "./dep.js";',
  });
  const linked = linkModuleGraph(graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph != null);
  const valueCell = exportCell(linked.graph, "dep.js", "*");
  const namespaceCell = linkedModule(linked.graph, "dep.js").namespaceCellId;
  assert.notEqual(valueCell, undefined);
  assert.notEqual(valueCell, namespaceCell);
  assert.equal(importCell(linked.graph, "main.js", "star"), valueCell);
  assert.equal(importCell(linked.graph, "main.js", "again"), valueCell);
  assert.equal(importCell(linked.graph, "main.js", "whole"), namespaceCell);
  const missing = linkModuleGraph(
    await graphOf({
      "dep.js": "export const value = 1;",
      "main.js": 'import { "*" as star } from "./dep.js";',
    }),
  );
  assert.deepEqual(
    missing.diagnostics.map((item) => item.message),
    ["Module has no export '*'."],
  );
});

test("creates a namespace that is only re-exported while linking", async () => {
  const graph = await graphOf({
    "dep.js": 'export let value = 1;\nexport { value as "☿" };\n',
    "main.js": 'import { space } from "./re.js";\nconsole.log(space.value);\n',
    "re.js": 'export * as space from "./dep.js";',
  });
  const compiled = compileModuleGraph(graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.hir != null);
  const script = printHir(compiled.hir).split("\nscript ")[1] ?? "";
  const lines = script.split("\n");
  const namespaceLine = lines.findIndex((line) =>
    line.includes("*namespace:file:///app/dep.js* = module-namespace"),
  );
  const firstEvaluation = lines.findIndex((line) =>
    line.includes("*module-promise:"),
  );
  assert.ok(namespaceLine > 0, script);
  assert.ok(namespaceLine < firstEvaluation, script);
  assert.match(lines[namespaceLine] ?? "", /"value": %b\d+, "☿": %b\d+/u);
});

test("keeps integer-like namespace names in code-unit order", async () => {
  const graph = await graphOf({
    "dep.js": [
      "export let value = 1;",
      'export { value as "2", value as "4294967294", value as "01" };',
      'export * as "10" from "./other.js";',
      'export * as "" from "./other.js";',
    ].join("\n"),
    "main.js": 'import * as names from "./dep.js";\nconsole.log(names);\n',
    "other.js": "export const other = 0;",
  });
  // ECMA-262 sorts [[Exports]] by code units, so "10" precedes "2" and
  // the array-index names are not moved ahead of the empty name.
  const ordered = ["", "01", "10", "2", "4294967294", "value"];
  const linked = linkModuleGraph(graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.ok(linked.graph != null);
  assert.deepEqual(
    linkedModule(linked.graph, "dep.js").namespaceNames,
    ordered,
  );
  const compiled = compileModuleGraph(graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.hir != null);
  const namespaceLine =
    printHir(compiled.hir)
      .split("\n")
      .find((line) =>
        line.includes("*namespace:file:///app/dep.js* = module-namespace"),
      ) ?? "";
  assert.deepEqual(
    [...namespaceLine.matchAll(/"([^"]*)": %b\d+/gu)].map((match) => match[1]),
    ordered,
  );
});

test("initializes module var cells while linking", async () => {
  const graph = await graphOf({
    // b.js evaluates first and observes a.js before a.js evaluates: the
    // var cells must already hold undefined, while lexical cells stay in
    // their temporal dead zones until a.js runs its declarations.
    "a.js": [
      'import "./b.js";',
      "export var early = 1;",
      "export let lexical = 2;",
      "export const fixed = 3;",
      "var hidden = 4;",
      "export function peek() { return hidden; }",
    ].join("\n"),
    "b.js": [
      'import { early, lexical, fixed, peek } from "./a.js";',
      "console.log(early, peek());",
      "export const later = () => [lexical, fixed];",
    ].join("\n"),
    "main.js": 'import "./a.js";',
  });
  const compiled = compileModuleGraph(graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.hir != null);
  const hir = printHir(compiled.hir);
  const [functionsText, script = ""] = hir.split("\nscript ");
  const evaluator =
    functionsText
      ?.split("\nfunction ")
      .find((text) => text.includes("*module:file:///app/a.js*")) ?? "";
  const scriptLines = script.split("\n");
  const position = (pattern: RegExp): number =>
    scriptLines.findIndex((line) => pattern.test(line));
  const earlyInit = position(/^ {2}let %b\d+ early = undefined /u);
  const hiddenInit = position(/^ {2}let %b\d+ hidden = undefined /u);
  const functionInit = position(/^ {2}function-init %b\d+ peek /u);
  const firstEvaluation = position(/\*module-promise:/u);
  assert.ok(earlyInit >= 0, script);
  assert.ok(hiddenInit >= 0, script);
  assert.ok(earlyInit < functionInit && hiddenInit < functionInit, script);
  assert.ok(functionInit < firstEvaluation, script);
  // Each source initializer keeps its evaluation position, and lexical
  // declarations are not moved out of the evaluator.
  assert.doesNotMatch(evaluator, /let %b\d+ (?:early|hidden) /u);
  assert.match(evaluator, /^ {2}%b\d+ early = 1 /mu);
  assert.match(evaluator, /^ {2}%b\d+ hidden = 4 /mu);
  assert.match(evaluator, /^ {2}let %b\d+ lexical = 2 /mu);
  assert.match(evaluator, /^ {2}const %b\d+ fixed = 3 /mu);
  assert.doesNotMatch(script, /(?:lexical|fixed) = /u);
});
