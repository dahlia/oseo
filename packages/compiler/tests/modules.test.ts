import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  compileModuleGraph,
  printMir,
  linkModuleGraph,
} from "../src/index.ts";
import type {
  Diagnostic,
  ModuleGraph,
  SourceRange,
  SyntaxModule,
  SyntaxModuleSpecifier,
} from "../src/index.ts";

const diagnostic: Diagnostic = {
  byteRange: { end: 0, start: 0 },
  code: "OSEO1001",
  message: "Unsupported syntax.",
  range: {
    end: { column: 1, line: 1 },
    start: { column: 1, line: 1 },
  },
  sourceId: "fixture.ts",
};

const range: SourceRange = {
  end: { column: 2, line: 1 },
  start: { column: 1, line: 1 },
};

const moduleRange: SourceRange = {
  end: { column: 1, line: 1 },
  start: { column: 1, line: 1 },
};

function testModule(sourceId: string, source: string): SyntaxModule {
  return {
    body: [],
    exports: [],
    imports:
      source === ""
        ? []
        : source.split(",").map((value) => ({
            byteRange: { end: value.length, start: 0 },
            importedName: undefined,
            localName: undefined,
            range: moduleRange,
            specifier: {
              byteRange: { end: value.length, start: 0 },
              range: moduleRange,
              value,
            },
          })),
    kind: "module",
    range: moduleRange,
    sourceId,
  };
}

test("deduplicates module instances across cycles and aliases", async () => {
  const sources = new Map([
    ["file:///app/a.js", "./main.js"],
    ["file:///app/main.js", "./a.js,././a.js"],
  ]);
  const result = await buildModuleGraph(
    {
      parseModule(input) {
        return {
          diagnostics: [],
          module: testModule(input.sourceId, input.source),
          parsed: true,
          sourceId: input.sourceId,
        };
      },
    },
    {
      load(canonicalId) {
        const source = sources.get(canonicalId);
        return Promise.resolve(
          source == null
            ? { diagnostics: [diagnostic] }
            : {
                diagnostics: [],
                source: {
                  source,
                  sourceHash: `hash:${source}`,
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
    "file:///app/main.js",
  );
  assert.deepEqual(
    result.graph?.modules.map((module) => ({
      dependencies: module.dependencies.map((item) => item.canonicalId),
      id: module.canonicalId,
      sourceHash: module.sourceHash,
    })),
    [
      {
        dependencies: ["file:///app/a.js"],
        id: "file:///app/main.js",
        sourceHash: "hash:./a.js,././a.js",
      },
      {
        dependencies: ["file:///app/main.js"],
        id: "file:///app/a.js",
        sourceHash: "hash:./main.js",
      },
    ],
  );
});

test("keeps dependency order and canonical parser identity", async () => {
  const seenSourceIds: string[] = [];
  const seenReferrers: (string | undefined)[] = [];
  const specifier = (value: string, start: number) => ({
    byteRange: { end: start + value.length, start },
    range: moduleRange,
    value,
  });
  const result = await buildModuleGraph(
    {
      parseModule(input) {
        seenSourceIds.push(input.sourceId);
        const syntax = testModule(input.sourceId, "");
        return {
          diagnostics: [],
          module:
            input.source === "entry"
              ? {
                  ...syntax,
                  exports: [
                    {
                      exportedName: "value",
                      importedName: "value",
                      kind: "indirect",
                      range: moduleRange,
                      specifier: specifier("./first.js", 5),
                    },
                  ],
                  imports: [
                    {
                      byteRange: { end: 31, start: 20 },
                      importedName: undefined,
                      localName: undefined,
                      range: moduleRange,
                      specifier: specifier("./second.js", 20),
                    },
                  ],
                }
              : syntax,
          parsed: true,
          sourceId: input.sourceId,
        };
      },
    },
    {
      load(canonicalId, referrer) {
        seenReferrers.push(
          referrer == null
            ? undefined
            : `${referrer.importerId}:${referrer.specifier.value}`,
        );
        return Promise.resolve({
          diagnostics: [],
          source: {
            source: canonicalId.endsWith("entry.js") ? "entry" : "leaf",
            sourceHash: canonicalId,
            sourceId: "loader-alias",
          },
        });
      },
    },
    {
      resolve(importerId, sourceSpecifier) {
        return {
          canonicalId: new URL(sourceSpecifier.value, importerId).href,
          diagnostics: [],
        };
      },
    },
    "file:///app/entry.js",
  );
  assert.deepEqual(
    result.graph?.modules[0]?.dependencies.map((item) => item.canonicalId),
    ["file:///app/first.js", "file:///app/second.js"],
  );
  assert.deepEqual(seenSourceIds, [
    "file:///app/entry.js",
    "file:///app/first.js",
    "file:///app/second.js",
  ]);
  assert.deepEqual(seenReferrers, [
    undefined,
    "file:///app/entry.js:./first.js",
    "file:///app/entry.js:./second.js",
  ]);
});

test("keeps module loader failures as owned graph diagnostics", async () => {
  const result = await buildModuleGraph(
    { parseModule: () => ({ diagnostics: [], parsed: false, sourceId: "x" }) },
    {
      load: () => Promise.resolve({ diagnostics: [diagnostic] }),
    },
    { resolve: () => ({ diagnostics: [] }) },
    "file:///missing.js",
  );
  assert.equal(result.graph, undefined);
  assert.deepEqual(result.diagnostics, [diagnostic]);
});

function graphSpecifier(value: string, start: number): SyntaxModuleSpecifier {
  return {
    byteRange: { end: start + value.length, start },
    range: moduleRange,
    value,
  };
}

test("links live cells, namespaces, cycles, and evaluation order", () => {
  const fromA = graphSpecifier("./a.js", 0);
  const fromB = graphSpecifier("./b.js", 0);
  const a = {
    canonicalId: "file:///a.js",
    dependencies: [{ canonicalId: "file:///b.js", specifier: fromB }],
    resolutions: [{ canonicalId: "file:///b.js", specifier: fromB }],
    sourceHash: "a",
    syntax: {
      ...testModule("file:///a.js", ""),
      exports: [
        {
          exportedName: "value",
          kind: "local" as const,
          localName: "value",
          range: moduleRange,
        },
        {
          exportedName: "beta",
          kind: "local" as const,
          localName: "beta",
          range: moduleRange,
        },
      ],
      imports: [
        {
          byteRange: fromB.byteRange,
          importedName: undefined,
          localName: undefined,
          range: moduleRange,
          specifier: fromB,
        },
      ],
    },
  };
  const b = {
    canonicalId: "file:///b.js",
    dependencies: [{ canonicalId: "file:///a.js", specifier: fromA }],
    resolutions: [{ canonicalId: "file:///a.js", specifier: fromA }],
    sourceHash: "b",
    syntax: {
      ...testModule("file:///b.js", ""),
      exports: [
        {
          exportedName: "forwarded",
          importedName: "value",
          kind: "indirect" as const,
          range: moduleRange,
          specifier: fromA,
        },
        { kind: "star" as const, range: moduleRange, specifier: fromA },
      ],
      imports: [
        {
          byteRange: fromA.byteRange,
          importedName: "value",
          localName: "alias",
          range: moduleRange,
          specifier: fromA,
        },
        {
          byteRange: fromA.byteRange,
          importedName: "*",
          localName: "namespace",
          range: moduleRange,
          specifier: fromA,
        },
      ],
    },
  };
  const result = linkModuleGraph({
    entryId: "file:///b.js",
    kind: "module-graph",
    modules: [b, a],
  });
  assert.equal(result.diagnostics.length, 0);
  const linkedA = result.graph?.modules.find(
    (module) => module.canonicalId === "file:///a.js",
  );
  const linkedB = result.graph?.modules.find(
    (module) => module.canonicalId === "file:///b.js",
  );
  const valueCell = linkedA?.exports.find(
    (entry) => entry.exportedName === "value",
  )?.cellId;
  assert.equal(
    linkedB?.imports.find((entry) => entry.localName === "alias")?.cellId,
    valueCell,
  );
  assert.equal(
    linkedB?.exports.find((entry) => entry.exportedName === "forwarded")
      ?.cellId,
    valueCell,
  );
  assert.deepEqual(linkedA?.namespaceNames, ["beta", "value"]);
  assert.deepEqual(linkedB?.namespaceNames, ["beta", "forwarded", "value"]);
  assert.deepEqual(result.graph?.components, [
    {
      cyclic: true,
      id: 0,
      moduleIds: ["file:///a.js", "file:///b.js"],
    },
  ]);
  assert.deepEqual(result.graph?.evaluationOrder, [
    "file:///a.js",
    "file:///b.js",
  ]);
});

test("preserves dependency order within a cyclic component", () => {
  const fromA = graphSpecifier("./a.js", 0);
  const fromB = graphSpecifier("./b.js", 0);
  const fromC = graphSpecifier("./c.js", 10);
  const node = (
    canonicalId: string,
    dependencies: readonly {
      readonly canonicalId: string;
      readonly specifier: SyntaxModuleSpecifier;
    }[],
  ) => ({
    canonicalId,
    dependencies,
    resolutions: dependencies,
    sourceHash: canonicalId,
    syntax: testModule(canonicalId, ""),
  });
  const a = node("file:///a.js", [
    { canonicalId: "file:///b.js", specifier: fromB },
    { canonicalId: "file:///c.js", specifier: fromC },
  ]);
  const b = node("file:///b.js", [
    { canonicalId: "file:///a.js", specifier: fromA },
  ]);
  const c = node("file:///c.js", [
    { canonicalId: "file:///a.js", specifier: fromA },
  ]);
  const result = linkModuleGraph({
    entryId: a.canonicalId,
    kind: "module-graph",
    modules: [a, b, c],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.graph?.components[0]?.moduleIds, [
    "file:///b.js",
    "file:///c.js",
    "file:///a.js",
  ]);
  assert.deepEqual(result.graph?.evaluationOrder, [
    "file:///b.js",
    "file:///c.js",
    "file:///a.js",
  ]);
});

test("links deep module graphs without using the host stack", () => {
  const moduleCount = 5_000;
  const modules = Array.from({ length: moduleCount }, (_, index) => {
    const canonicalId = `file:///${index}.js`;
    const dependencyId =
      index + 1 < moduleCount ? `file:///${index + 1}.js` : undefined;
    const specifier =
      dependencyId == null ? undefined : graphSpecifier(`./${index + 1}.js`, 0);
    const dependencies =
      dependencyId == null || specifier == null
        ? []
        : [{ canonicalId: dependencyId, specifier }];
    return {
      canonicalId,
      dependencies,
      resolutions: dependencies,
      sourceHash: String(index),
      syntax: testModule(canonicalId, ""),
    };
  });
  const result = linkModuleGraph({
    entryId: modules[0]!.canonicalId,
    kind: "module-graph",
    modules,
  });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.graph?.components.length, moduleCount);
  assert.equal(result.graph?.evaluationOrder.length, moduleCount);
  assert.equal(result.graph?.evaluationOrder[0], modules.at(-1)?.canonicalId);
  assert.equal(result.graph?.evaluationOrder.at(-1), modules[0]?.canonicalId);
});

test("reports ambiguous star exports only when a binding requests them", () => {
  const left = graphSpecifier("./left.js", 0);
  const right = graphSpecifier("./right.js", 10);
  const root = graphSpecifier("./root.js", 0);
  const leaf = (canonicalId: string, localName: string) => ({
    canonicalId,
    dependencies: [],
    resolutions: [],
    sourceHash: localName,
    syntax: {
      ...testModule(canonicalId, ""),
      exports: [
        {
          exportedName: "shared",
          kind: "local" as const,
          localName,
          range: moduleRange,
        },
      ],
    },
  });
  const graph: ModuleGraph = {
    entryId: "file:///consumer.js",
    kind: "module-graph",
    modules: [
      {
        canonicalId: "file:///consumer.js",
        dependencies: [{ canonicalId: "file:///root.js", specifier: root }],
        resolutions: [{ canonicalId: "file:///root.js", specifier: root }],
        sourceHash: "consumer",
        syntax: {
          ...testModule("file:///consumer.js", ""),
          imports: [
            {
              byteRange: root.byteRange,
              importedName: "shared",
              localName: "shared",
              range: moduleRange,
              specifier: root,
            },
          ],
        },
      },
      {
        canonicalId: "file:///root.js",
        dependencies: [
          { canonicalId: "file:///left.js", specifier: left },
          { canonicalId: "file:///right.js", specifier: right },
        ],
        resolutions: [
          { canonicalId: "file:///left.js", specifier: left },
          { canonicalId: "file:///right.js", specifier: right },
        ],
        sourceHash: "root",
        syntax: {
          ...testModule("file:///root.js", ""),
          exports: [
            { kind: "star", range: moduleRange, specifier: left },
            { kind: "star", range: moduleRange, specifier: right },
          ],
        },
      },
      leaf("file:///left.js", "leftShared"),
      leaf("file:///right.js", "rightShared"),
    ],
  };
  const result = linkModuleGraph(graph);
  assert.equal(result.graph, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /ambiguous/u);
});

test("lowers linked modules through shared live binding identities", () => {
  const dependencySpecifier = graphSpecifier("./dependency.js", 0);
  const dependency = {
    canonicalId: "file:///dependency.js",
    dependencies: [],
    resolutions: [],
    sourceHash: "dependency",
    syntax: {
      ...testModule("file:///dependency.js", ""),
      body: [
        {
          byteRange: { end: 22, start: 0 },
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 41 },
          kind: "let" as const,
          name: "answer",
          range,
        },
      ],
      exports: [
        {
          exportedName: "answer",
          kind: "local" as const,
          localName: "answer",
          range,
        },
      ],
    },
  };
  const entry = {
    canonicalId: "file:///entry.js",
    dependencies: [
      {
        canonicalId: dependency.canonicalId,
        specifier: dependencySpecifier,
      },
    ],
    resolutions: [
      {
        canonicalId: dependency.canonicalId,
        specifier: dependencySpecifier,
      },
    ],
    sourceHash: "entry",
    syntax: {
      ...testModule("file:///entry.js", ""),
      body: [
        {
          byteRange: { end: 40, start: 20 },
          expression: {
            arguments: [{ kind: "identifier" as const, name: "value", range }],
            kind: "call" as const,
            range,
            target: { kind: "console-log" as const, range },
          },
          kind: "expression" as const,
          range,
        },
        {
          expression: {
            kind: "binding-set" as const,
            name: "value",
            range,
            value: { kind: "number" as const, range, value: 42 },
          },
          kind: "expression" as const,
          range,
        },
        {
          expression: {
            kind: "destructuring-set" as const,
            pattern: {
              elements: [
                {
                  pattern: {
                    hints: [],
                    kind: "binding-identifier" as const,
                    name: "value",
                    range,
                  },
                  range,
                },
              ],
              kind: "array-binding-pattern" as const,
              range,
            },
            range,
            value: {
              elements: [{ kind: "number" as const, range, value: 43 }],
              kind: "array" as const,
              range,
            },
          },
          kind: "expression" as const,
          range,
        },
      ],
      imports: [
        {
          byteRange: dependencySpecifier.byteRange,
          importedName: "answer",
          localName: "value",
          range,
          specifier: dependencySpecifier,
        },
      ],
      exports: [
        {
          exportedName: "value",
          kind: "local" as const,
          localName: "value",
          range,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: entry.canonicalId,
    kind: "module-graph",
    modules: [entry, dependency],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  assert.deepEqual(
    result.mir.globalBindings.filter(
      (binding) => !binding.name.startsWith("*module-promise:"),
    ),
    [{ id: 0, name: "answer" }],
  );
  const text = printMir(result.mir);
  assert.ok(text.indexOf("initialize answer") < text.indexOf("read value"));
  assert.match(text, /initialize %b0 answer/u);
  const operations = [...result.mir.functions, result.mir.script]
    .flatMap((functionValue) => functionValue.blocks)
    .flatMap((block) => block.operations);
  const importedRead = operations.find(
    (operation) =>
      operation.kind === "read" && operation.detail.includes("value"),
  );
  assert.equal(importedRead?.bindingId, 0);
  assert.equal(importedRead?.range.sourceId, entry.canonicalId);
  const importedWrites = operations.filter(
    (operation) =>
      operation.kind === "write" && operation.detail.includes("value"),
  );
  assert.equal(importedWrites.length, 2);
  assert.ok(
    importedWrites.every(
      (operation) =>
        operation.bindingId === 0 &&
        operation.importedBinding === true &&
        operation.range.sourceId === entry.canonicalId,
    ),
  );
  const dependencyInitialize = operations.find(
    (operation) => operation.kind === "initialize" && operation.bindingId === 0,
  );
  assert.equal(dependencyInitialize?.range.sourceId, dependency.canonicalId);
  assert.equal(result.graph?.modules[0]?.exports[0]?.cellId, 0);
});

test("creates one live namespace binding for imports and re-exports", () => {
  const specifier = graphSpecifier("./values.js", 0);
  const values = {
    canonicalId: "file:///values.js",
    dependencies: [],
    resolutions: [],
    sourceHash: "values",
    syntax: {
      ...testModule("file:///values.js", ""),
      body: [
        {
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 1 },
          kind: "let" as const,
          name: "zeta",
          range,
        },
        {
          hint: undefined,
          initializer: { kind: "number" as const, range, value: 2 },
          kind: "const" as const,
          name: "alpha",
          range,
        },
      ],
      exports: [
        {
          exportedName: "zeta",
          kind: "local" as const,
          localName: "zeta",
          range,
        },
        {
          exportedName: "alpha",
          kind: "local" as const,
          localName: "alpha",
          range,
        },
      ],
    },
  };
  const imports = ["first", "second"].map((localName) => ({
    byteRange: specifier.byteRange,
    importedName: "*",
    localName,
    range,
    specifier,
  }));
  const entry = {
    canonicalId: "file:///namespace.js",
    dependencies: [{ canonicalId: values.canonicalId, specifier }],
    resolutions: [{ canonicalId: values.canonicalId, specifier }],
    sourceHash: "namespace",
    syntax: {
      ...testModule("file:///namespace.js", ""),
      body: [],
      exports: [
        {
          exportedName: "namespace",
          kind: "local" as const,
          localName: "first",
          range,
        },
      ],
      imports,
    },
  };
  const result = compileModuleGraph({
    entryId: entry.canonicalId,
    kind: "module-graph",
    modules: [entry, values],
  });
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.mir != null);
  const operations = result.mir.script.blocks.flatMap(
    (block) => block.operations,
  );
  const namespaces = operations.filter(
    (operation) => operation.kind === "module-namespace-create",
  );
  assert.equal(namespaces.length, 1);
  assert.deepEqual(namespaces[0]?.namespaceNames, ["alpha", "zeta"]);
  assert.deepEqual(namespaces[0]?.namespaceBindingIds, [1, 0]);
  assert.equal(
    result.mir.globalBindings.filter((binding) =>
      binding.name.startsWith("*namespace:"),
    ).length,
    1,
  );
  const linkedEntry = result.graph?.modules.find(
    (module) => module.canonicalId === entry.canonicalId,
  );
  assert.equal(
    linkedEntry?.exports.find(
      (exported) => exported.exportedName === "namespace",
    )?.cellId,
    linkedEntry?.imports.find((imported) => imported.localName === "first")
      ?.cellId,
  );
});

test("rejects asynchronous module cycles before scheduling", () => {
  const canonicalId = "file:///cycle.js";
  const specifier = graphSpecifier("./cycle.js", 0);
  const module = {
    canonicalId,
    dependencies: [{ canonicalId, specifier }],
    resolutions: [{ canonicalId, specifier }],
    sourceHash: "cycle",
    syntax: {
      ...testModule(canonicalId, ""),
      body: [
        {
          expression: {
            argument: { kind: "number" as const, range, value: 0 },
            kind: "await" as const,
            range,
          },
          kind: "expression" as const,
          range,
        },
      ],
      imports: [
        {
          byteRange: specifier.byteRange,
          importedName: undefined,
          localName: undefined,
          range,
          specifier,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: canonicalId,
    kind: "module-graph",
    modules: [module],
  });
  assert.equal(result.mir, undefined);
  assert.match(result.diagnostics[0]?.message ?? "", /asynchronous module/iu);
});

test("rejects await in object-rest assignment member targets", () => {
  const canonicalId = "file:///object-rest-await.js";
  const module = {
    canonicalId,
    dependencies: [],
    resolutions: [],
    sourceHash: "object-rest-await",
    syntax: {
      ...testModule(canonicalId, ""),
      body: [
        {
          expression: {
            kind: "destructuring-set" as const,
            pattern: {
              kind: "object-binding-pattern" as const,
              properties: [],
              range,
              rest: {
                key: {
                  argument: { kind: "string" as const, range, value: "key" },
                  kind: "await" as const,
                  range,
                },
                kind: "assignment-member" as const,
                object: { kind: "object" as const, properties: [], range },
                range,
              },
            },
            range,
            value: { kind: "object" as const, properties: [], range },
          },
          kind: "expression" as const,
          range,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: canonicalId,
    kind: "module-graph",
    modules: [module],
  });
  assert.equal(result.mir, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /top-level await.*outside M4/iu,
  );
});

test("rejects await in top-level binding-pattern keys", () => {
  const canonicalId = "file:///binding-pattern-await.js";
  const module = {
    canonicalId,
    dependencies: [],
    resolutions: [],
    sourceHash: "binding-pattern-await",
    syntax: {
      ...testModule(canonicalId, ""),
      body: [
        {
          declarationKind: "const" as const,
          initializer: { kind: "object" as const, properties: [], range },
          kind: "binding-pattern" as const,
          mode: "declare" as const,
          pattern: {
            kind: "object-binding-pattern" as const,
            properties: [
              {
                key: {
                  argument: { kind: "string" as const, range, value: "key" },
                  kind: "await" as const,
                  range,
                },
                pattern: {
                  hints: [],
                  kind: "binding-identifier" as const,
                  name: "value",
                  range,
                },
                range,
              },
            ],
            range,
          },
          range,
        },
      ],
    },
  };
  const result = compileModuleGraph({
    entryId: canonicalId,
    kind: "module-graph",
    modules: [module],
  });
  assert.equal(result.mir, undefined);
  assert.match(
    result.diagnostics[0]?.message ?? "",
    /top-level await.*outside M4/iu,
  );
});
