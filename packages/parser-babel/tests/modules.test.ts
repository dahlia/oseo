import assert from "node:assert/strict";
import test from "node:test";

import { compileModuleGraph, compileSource, printMir } from "@oseo/compiler";

import { babelFrontend, babelModuleFrontend } from "../src/index.ts";

test("converts M4 imports and exports to owned module syntax", () => {
  const result = babelModuleFrontend.parseModule({
    source: `
      import main, { value as renamed } from "./a.js";
      import * as namespace from "./b.js";
      import "./side.js";
      export const local = 1;
      export { local as shown };
      export { other as remote } from "./c.js";
      export * from "./star.js";
      export default local;
    `,
    sourceId: "file:///app/main.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(
    result.module?.imports.map((entry) => ({
      imported: entry.importedName,
      local: entry.localName,
      specifier: entry.specifier.value,
    })),
    [
      { imported: "default", local: "main", specifier: "./a.js" },
      { imported: "value", local: "renamed", specifier: "./a.js" },
      { imported: "*", local: "namespace", specifier: "./b.js" },
      { imported: undefined, local: undefined, specifier: "./side.js" },
    ],
  );
  assert.deepEqual(
    result.module?.exports.map((entry) => entry.kind),
    ["local", "local", "indirect", "star", "default"],
  );
  assert.doesNotMatch(JSON.stringify(result.module), /ImportDeclaration/u);
});

test("keeps empty indirect exports as requested dependencies", () => {
  const result = babelModuleFrontend.parseModule({
    source: 'export {} from "./requested.js";\nimport {} from "./empty.js";',
    sourceId: "file:///app/empty-clauses.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.module?.exports, []);
  assert.deepEqual(
    result.module?.imports.map((entry) => ({
      imported: entry.importedName,
      local: entry.localName,
      specifier: entry.specifier.value,
    })),
    [
      { imported: undefined, local: undefined, specifier: "./requested.js" },
      { imported: undefined, local: undefined, specifier: "./empty.js" },
    ],
  );
});

test("retains default export order and anonymous function names", () => {
  const result = babelModuleFrontend.parseModule({
    source: `
      export default function () {}
      console.log("after");
    `,
    sourceId: "file:///app/default.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  const exported = result.module?.exports[0];
  assert.equal(exported?.kind, "default");
  assert.ok(exported?.byteRange != null);
  if (exported?.kind !== "default") return;
  assert.equal(
    "parameters" in exported.declaration
      ? exported.declaration.name
      : undefined,
    "default",
  );
  assert.ok(
    exported.byteRange.start <
      (result.module?.body[0]?.byteRange?.start ?? Number.MAX_SAFE_INTEGER),
  );
});

test("names anonymous default export expressions", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export default (function () {});",
    sourceId: "file:///app/default-expression.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/default-expression.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/default-expression.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "default-expression",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /name="default"/u);
  assert.doesNotMatch(printMir(compiled.mir), /name="\*default:/u);
});

test("links a named default class through its declaration binding", () => {
  const sourceId = "file:///app/default-named-class.js";
  const result = babelModuleFrontend.parseModule({
    source: "export default class Named {}",
    sourceId,
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  assert.equal(result.module.body[0]?.kind, "let");
  assert.equal(
    result.module.body[0]?.kind === "let"
      ? result.module.body[0].name
      : undefined,
    "Named",
  );
  assert.deepEqual(
    result.module.exports.map((entry) => ({
      exportedName: entry.kind === "star" ? undefined : entry.exportedName,
      kind: entry.kind,
      localName: entry.kind === "local" ? entry.localName : undefined,
    })),
    [{ exportedName: "default", kind: "local", localName: "Named" }],
  );
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "default-named-class",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const exported = compiled.graph?.modules[0]?.exports[0];
  assert.equal(exported?.exportedName, "default");
  assert.equal(
    compiled.graph?.cells.find((cell) => cell.id === exported?.cellId)
      ?.localName,
    "Named",
  );
  assert.match(printMir(compiled.mir), /name="Named"/u);
});

test("names an anonymous default class during module lowering", () => {
  const sourceId = "file:///app/default-anonymous-class.js";
  const result = babelModuleFrontend.parseModule({
    source: "export default class {}",
    sourceId,
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const exported = result.module.exports[0];
  assert.equal(exported?.kind, "default");
  if (exported?.kind !== "default") return;
  assert.equal(exported.declaration.kind, "class");
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "default-anonymous-class",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  assert.match(printMir(compiled.mir), /name="default"/u);
  assert.doesNotMatch(printMir(compiled.mir), /name="\*default:/u);
});

test("lowers top-level await to a traced module continuation", () => {
  const result = babelModuleFrontend.parseModule({
    source: "export const answer = 1 + await Promise.resolve(41);",
    sourceId: "file:///app/answer.js",
  });
  assert.ok(result.parsed);
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: "file:///app/answer.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///app/answer.js",
        dependencies: [],
        resolutions: [],
        sourceHash: "answer",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  const continuation = compiled.mir?.functions.find((functionValue) =>
    functionValue.name.startsWith("*module:"),
  );
  assert.equal(continuation?.asyncFunction, true);
  assert.ok(
    continuation?.blocks.some(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ),
  );
  assert.doesNotMatch(JSON.stringify(result.module), /AwaitExpression/u);
});

test("suspends top-level await inside compound assignment", () => {
  const sourceId = "file:///app/compound-assignment-await.js";
  const result = babelModuleFrontend.parseModule({
    source: "let answer = 1;\nanswer += await Promise.resolve(41);",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "compound-assignment-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const continuation = compiled.mir.functions.find((functionValue) =>
    functionValue.name.startsWith("*module:"),
  );
  assert.equal(continuation?.asyncFunction, true);
  assert.ok(
    continuation?.blocks.some(
      (block) =>
        block.terminator.kind === "generator-yield" &&
        block.terminator.awaited === true,
    ),
  );
});

test("suspends top-level await inside an update member target", () => {
  const sourceId = "file:///app/update-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      'const holder = { value: "4" };\n' +
      "export const previous = " +
      "(await Promise.resolve(holder)).value++;\n" +
      "export const current = holder.value;\n",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "update-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
  const operations = [...compiled.mir.functions, compiled.mir.script]
    .flatMap((functionValue) => functionValue.blocks)
    .flatMap((block) => block.operations);
  assert.ok(
    compiled.mir.functions.some((functionValue) =>
      functionValue.blocks.some(
        (block) =>
          block.terminator.kind === "generator-yield" &&
          block.terminator.awaited === true,
      ),
    ),
  );
  assert.ok(operations.some((operation) => operation.kind === "property-get"));
  assert.ok(operations.some((operation) => operation.kind === "property-set"));
});

test("suspends after array spread before a top-level await point", () => {
  const sourceId = "file:///app/array-spread-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "const items = [1, 2];\n" +
      "export const values = [...items, await Promise.resolve(3)];",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "array-spread-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("suspends after object spread before a top-level await point", () => {
  const sourceId = "file:///app/object-spread-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "const base = { a: 1 };\n" +
      "export const value = { ...base, b: await Promise.resolve(3) };",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "object-spread-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("accepts object spread after a top-level await point", () => {
  const sourceId = "file:///app/object-spread-after-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "const base = { a: 1 };\n" +
      "export const value = { b: await Promise.resolve(3), ...base };",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "object-spread-after-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("suspends after call spread before a top-level await point", () => {
  const sourceId = "file:///app/call-spread-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "const items = [1, 2];\n" +
      "console.log(...items, await Promise.resolve(3));",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "call-spread-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("suspends after constructor spread before a top-level await point", () => {
  const sourceId = "file:///app/constructor-spread-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "function Box() {}\n" +
      "const items = [1, 2];\n" +
      "new Box(...items, await Promise.resolve(3));",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "constructor-spread-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("suspends after Promise spread before a top-level await point", () => {
  const sourceId = "file:///app/promise-spread-await.js";
  const result = babelModuleFrontend.parseModule({
    source:
      "function settle(resolve) { resolve(1); }\n" +
      "new Promise(...[settle], await Promise.resolve(3));",
    sourceId,
  });
  assert.ok(result.parsed);
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
        sourceHash: "promise-spread-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("does not impose the former continuation count limit", () => {
  const sourceId = "file:///app/deep-await.js";
  const accepted = babelModuleFrontend.parseModule({
    source: "await 0;\n".repeat(256),
    sourceId,
  });
  assert.ok(accepted.module != null);
  const acceptedCompilation = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "accepted-await",
        syntax: accepted.module,
      },
    ],
  });
  assert.deepEqual(acceptedCompilation.diagnostics, []);
  assert.ok(acceptedCompilation.mir != null);

  const result = babelModuleFrontend.parseModule({
    source: "await 0;\n".repeat(15_000),
    sourceId,
  });
  assert.ok(result.module != null);
  const compiled = compileModuleGraph({
    entryId: sourceId,
    kind: "module-graph",
    modules: [
      {
        canonicalId: sourceId,
        dependencies: [],
        resolutions: [],
        sourceHash: "deep-await",
        syntax: result.module,
      },
    ],
  });
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir != null);
});

test("lowers M4 promise construction and static methods", () => {
  const result = compileSource(babelFrontend, {
    source: [
      "function settle(resolve) { resolve(1); }",
      "function observe(value) { console.log(value); }",
      "new Promise(settle).then(observe);",
      "new Promise(...[settle]).then(observe);",
      "Promise.resolve(2).then(observe);",
      "Promise.reject(3).catch(observe);",
      "Promise.all([4, 5]).then(observe);",
      "Promise.race([6, 7]).then(observe);",
    ].join("\n"),
    sourceId: "promises.js",
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const targets = result.mir.script.blocks
    .flatMap((block) => block.operations)
    .flatMap((operation) =>
      operation.target == null ? [] : [operation.target],
    );
  assert.ok(targets.some((target) => target.kind === "promise-constructor"));
  assert.ok(
    result.mir.script.blocks
      .flatMap((block) => block.operations)
      .some(
        (operation) =>
          operation.target?.kind === "promise-constructor" &&
          operation.argumentListId != null,
      ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "resolve",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "reject",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "all",
    ),
  );
  assert.ok(
    targets.some(
      (target) =>
        target.kind === "promise-intrinsic" && target.method === "race",
    ),
  );
});
