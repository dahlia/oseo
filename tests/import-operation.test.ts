/*
 * Compiler evidence of the import-operation unit: how literal `import()`
 * sites lower and how the module table covers modules that only those
 * sites reach. Native behavior is in tests/import-operation-native.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  buildScriptRequests,
  compileModuleGraph,
  compileSource,
  importCallProfileMessage,
  type ModuleLoader,
  printMir,
} from "../packages/compiler/src/index.ts";
import {
  fileModuleResolver,
  hashModuleSource,
} from "../packages/host/src/index.ts";
import {
  createBabelFrontend,
  createBabelModuleFrontend,
} from "../packages/parser-babel/src/index.ts";

const scriptFrontend = createBabelFrontend({ staticSpecifierImports: true });
const moduleFrontend = createBabelModuleFrontend({
  staticSpecifierImports: true,
});

function memoryLoader(files: Readonly<Record<string, string>>): ModuleLoader {
  return {
    load(canonicalId) {
      const source = files[canonicalId.slice("file:///app/".length)];
      if (source == null) throw new Error(`missing ${canonicalId}`);
      return Promise.resolve({
        diagnostics: [],
        source: {
          source,
          sourceHash: hashModuleSource(source),
          sourceId: canonicalId,
        },
      });
    },
  };
}

async function compiledGraph(files: Readonly<Record<string, string>>) {
  const graph = await buildModuleGraph(
    moduleFrontend,
    memoryLoader(files),
    fileModuleResolver,
    "file:///app/main.mjs",
  );
  assert.deepEqual(graph.diagnostics, []);
  assert.ok(graph.graph);
  return compileModuleGraph(graph.graph);
}

/** The `number` constants of one MIR function, by value ID. */
function constantsOf(block: string): ReadonlyMap<string, number> {
  return new Map(
    [...block.matchAll(/^\s+%(\d+) = constant (\d+) /gmu)].map((match) => [
      match[1]!,
      Number(match[2]),
    ]),
  );
}

/** The constant arguments of every `module_import` call, in MIR order. */
function importIndices(mir: string): readonly number[] {
  // Value IDs restart in every function, so each one is read alone.
  return mir.split(/^(?=function )/mu).flatMap((block) => {
    const constants = constantsOf(block);
    return [...block.matchAll(/= call module_import %(\d+) /gu)].map((match) =>
      constants.get(match[1]!)!,
    );
  });
}

test("import-only modules follow the static closure in the table", async () => {
  const compiled = await compiledGraph({
    "dep.mjs": "export const dep = 1;",
    "lazy.mjs": 'import "./leaf.mjs";\nexport const lazy = 2;',
    "leaf.mjs": "export {};",
    "main.mjs": 'import "./dep.mjs";\nimport("./lazy.mjs");',
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  const mir = printMir(compiled.mir);
  // dep and main are scheduled; lazy and its static leaf only follow.
  assert.deepEqual(compiled.graph?.evaluationOrder, [
    "file:///app/dep.mjs",
    "file:///app/main.mjs",
  ]);
  assert.match(mir, /function @f\d+ \*module:file:\/\/\/app\/lazy\.mjs\*/u);
  assert.match(mir, /function @f\d+ \*module:file:\/\/\/app\/leaf\.mjs\*/u);
  assert.deepEqual(importIndices(mir), [2]);
  // The target's namespace exists before startup evaluation begins.
  assert.equal(compiled.graph?.modules[2]?.namespaceCellId != null, true);
});

test("sites in nested functions lower to the same operation", async () => {
  const compiled = await compiledGraph({
    "main.mjs": [
      'function load() { return import("./target.mjs"); }',
      'const arrow = () => import("./target.mjs");',
      'class Loader { method() { return import("./target.mjs"); } }',
      'function* generator() { yield import("./target.mjs"); }',
      'async function later() { return await import(("./target.mjs"),); }',
      "export { load, arrow, Loader, generator, later };",
    ].join("\n"),
    "target.mjs": "export const value = 1;",
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  assert.deepEqual(importIndices(printMir(compiled.mir)), [1, 1, 1, 1, 1]);
});

test("import() adds no specialized path", async () => {
  const files = {
    "main.mjs": 'const p = import("./target.mjs");\nexport { p };',
    "target.mjs": "export {};",
  };
  const graph = await buildModuleGraph(
    moduleFrontend,
    memoryLoader(files),
    fileModuleResolver,
    "file:///app/main.mjs",
  );
  assert.ok(graph.graph);
  const lines = (specialization: "disabled" | "enabled") =>
    printMir(compileModuleGraph(graph.graph!, { specialization }).mir!)
      .split("\n")
      .filter((line) => line.includes("module_import"));
  assert.deepEqual(lines("enabled"), lines("disabled"));
  assert.equal(lines("enabled").length, 2);
});

test("a Script with requests installs the table before it runs", async () => {
  const source = 'var p = import("./m.mjs");\nimport("./script.js");';
  const canonicalId = "file:///app/script.js";
  const parsed = scriptFrontend.parse({ source, sourceId: canonicalId });
  assert.ok(parsed.program);
  const requests = await buildScriptRequests(
    moduleFrontend,
    memoryLoader({
      "m.mjs": "export const m = 1;",
      "script.js": "export const asModule = true;",
    }),
    fileModuleResolver,
    [{ canonicalId, program: parsed.program }],
  );
  assert.ok(requests.closure);
  const compiled = compileSource(
    scriptFrontend,
    { source, sourceId: canonicalId },
    {},
    { canonicalId, closure: requests.closure },
  );
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  const mir = printMir(compiled.mir);
  assert.deepEqual(importIndices(mir), [0, 1]);
  // The entry index equals the module count, so startup evaluates no
  // module; the Script's identity is a separate module record.
  const top = mir
    .split(/^(?=function )/mu)
    .find((block) => block.includes("call module_evaluate"));
  assert.ok(top);
  const evaluate = /= call module_evaluate %(\d+), %(\d+),/u.exec(top);
  assert.ok(evaluate);
  const constants = constantsOf(top);
  assert.equal(constants.get(evaluate[1]!), 2);
  assert.equal(constants.get(evaluate[2]!), 2);
  assert.ok(
    mir.indexOf("call module_evaluate") < mir.indexOf("call module_import"),
  );
});

test("a site without a recorded target keeps the profile diagnostic", () => {
  // A Script compiled with the subset enabled but without its request
  // closure has no table entry to name.
  const result = compileSource(scriptFrontend, {
    source: 'import("./m.mjs");',
    sourceId: "file:///app/alone.js",
  });
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => [
      diagnostic.code,
      diagnostic.message,
    ]),
    [["OSEO1001", importCallProfileMessage]],
  );
});
