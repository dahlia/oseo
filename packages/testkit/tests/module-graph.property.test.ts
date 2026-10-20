import assert from "node:assert/strict";
import test from "node:test";

import { linkModuleGraph } from "@oseo/compiler";
import type {
  LinkedModule,
  LinkedModuleGraph,
  ModuleDependency,
  ModuleGraph,
  SyntaxExportEntry,
  SyntaxImportEntry,
  SyntaxModuleSpecifier,
} from "@oseo/compiler";
import fc from "fast-check";

import { assertProperty, propertySize } from "./property-support.ts";

const size = propertySize();
const maximumModules = size === "large" ? 16 : 8;
const range = {
  end: { column: 1, line: 1 },
  start: { column: 1, line: 1 },
} as const;

function moduleId(index: number): string {
  return `file:///module-${index}.js`;
}

function dependency(from: number, to: number): ModuleDependency {
  const value = `./module-${to}.js`;
  const specifier: SyntaxModuleSpecifier = {
    byteRange: { end: from + value.length, start: from },
    range,
    value,
  };
  return { canonicalId: moduleId(to), specifier };
}

function graphFromMatrix(matrix: readonly (readonly boolean[])[]): ModuleGraph {
  const modules = matrix.map((row, from) => {
    const targets = new Set<number>();
    if (from + 1 < matrix.length) targets.add(from + 1);
    for (const [to, selected] of row.entries()) {
      if (selected) targets.add(to);
    }
    const dependencies = [...targets].map((to) => dependency(from, to));
    return {
      canonicalId: moduleId(from),
      dependencies,
      resolutions: dependencies,
      sourceHash: `hash-${from}`,
      syntax: {
        body: [],
        exports: [],
        imports: [],
        kind: "module" as const,
        range,
        sourceId: moduleId(from),
        varNames: [],
      },
    };
  });
  return { entryId: moduleId(0), kind: "module-graph", modules };
}

test("generated module graphs retain deterministic SCC order", () => {
  const graphArbitrary = fc
    .integer({ min: 1, max: maximumModules })
    .chain((moduleCount) =>
      fc
        .array(
          fc.array(fc.boolean(), {
            maxLength: moduleCount,
            minLength: moduleCount,
          }),
          { maxLength: moduleCount, minLength: moduleCount },
        )
        .map(graphFromMatrix),
    );
  assertProperty(
    "linked module components partition dependency graphs",
    fc.property(graphArbitrary, (graph) => {
      const first = linkModuleGraph(graph);
      const second = linkModuleGraph(graph);
      assert.deepEqual(second, first);
      assert.equal(first.diagnostics.length, 0);
      assert.ok(first.graph != null);
      const order = new Map(
        first.graph.evaluationOrder.map((id, index) => [id, index]),
      );
      assert.equal(order.size, graph.modules.length);
      const componentByModule = new Map<string, number>();
      for (const component of first.graph.components) {
        for (const id of component.moduleIds) {
          assert.ok(!componentByModule.has(id));
          componentByModule.set(id, component.id);
        }
      }
      assert.equal(componentByModule.size, graph.modules.length);
      for (const module of graph.modules) {
        for (const edge of module.dependencies) {
          if (
            componentByModule.get(module.canonicalId) !==
            componentByModule.get(edge.canonicalId)
          ) {
            assert.ok(
              (order.get(edge.canonicalId) ?? Infinity) <
                (order.get(module.canonicalId) ?? -1),
            );
          }
        }
      }
    }),
    {
      domain: "closed reachable module graphs with arbitrary cycles",
      numRuns: 1_000,
      profile: "M4 static module linking",
      seed: 0x6000_0000,
      sizeLimit: `${maximumModules} modules`,
      timeLimitMilliseconds: 10_000,
    },
  );
});

/**
 * Export names a generated module may use. They include the string names
 * `"*"`, `"default"`, the empty string, and a non-ASCII name, which
 * arbitrary module namespace names admit, so the model checks that none of
 * them is confused with namespace or default handling. The array-index
 * names `"10"` and `"2"` check that the namespace list keeps code-unit
 * order, where an ordinary object would order them numerically.
 */
const exportNames = ["a", "b", "default", "*", "", "☿", "10", "2"] as const;

/** Local binding names a generated module declares. */
const localNames = ["first", "second"] as const;

type GeneratedExport =
  | {
      readonly exportedName: string;
      readonly kind: "local";
      readonly local: number;
    }
  | {
      readonly exportedName: string;
      readonly importedName: string;
      readonly kind: "indirect";
      readonly target: number;
    }
  | {
      readonly exportedName: string;
      readonly kind: "namespace";
      readonly target: number;
    }
  | { readonly kind: "star"; readonly target: number };

/** A named import, or a namespace import when `importedName` is absent. */
interface GeneratedImport {
  readonly importedName?: string;
  readonly target: number;
}

interface GeneratedModule {
  readonly exports: readonly GeneratedExport[];
  readonly imports: readonly GeneratedImport[];
}

/**
 * One ExportEntry Record after ECMA-262 ParseModule: a local export of an
 * imported name or namespace has already become an indirect entry.
 */
type ModelEntry =
  | {
      readonly exportName: string;
      readonly kind: "local";
      readonly localName: string;
    }
  | {
      readonly exportName: string;
      readonly importName: string | undefined;
      readonly kind: "indirect";
      readonly target: number;
    }
  | { readonly kind: "star"; readonly target: number };

/** A ResolvedBinding Record; `binding` is absent for a namespace. */
interface ModelBinding {
  readonly binding?: string;
  readonly module: number;
}

type ModelResolution = ModelBinding | "ambiguous" | null;

function importLocalName(index: number): string {
  return `import${index}`;
}

function modelEntries(module: GeneratedModule): readonly ModelEntry[] {
  return module.exports.map((entry): ModelEntry => {
    if (entry.kind === "star") return entry;
    if (entry.kind === "namespace") {
      return {
        exportName: entry.exportedName,
        importName: undefined,
        kind: "indirect",
        target: entry.target,
      };
    }
    if (entry.kind === "indirect") {
      return {
        exportName: entry.exportedName,
        importName: entry.importedName,
        kind: "indirect",
        target: entry.target,
      };
    }
    const imported = module.imports[entry.local - localNames.length];
    if (imported == null) {
      return {
        exportName: entry.exportedName,
        kind: "local",
        localName: localNames[entry.local] ?? "",
      };
    }
    return {
      exportName: entry.exportedName,
      importName: imported.importedName,
      kind: "indirect",
      target: imported.target,
    };
  });
}

/** An independent transcription of ECMA-262 export resolution. */
class ExportModel {
  readonly #entries: readonly (readonly ModelEntry[])[];

  constructor(modules: readonly GeneratedModule[]) {
    this.#entries = modules.map(modelEntries);
  }

  exportedNames(module: number, starSet = new Set<number>()): string[] {
    if (starSet.has(module)) return [];
    starSet.add(module);
    const names: string[] = [];
    for (const entry of this.#entries[module] ?? []) {
      if (entry.kind !== "star") names.push(entry.exportName);
    }
    for (const entry of this.#entries[module] ?? []) {
      if (entry.kind !== "star") continue;
      for (const name of this.exportedNames(entry.target, starSet)) {
        if (name !== "default" && !names.includes(name)) names.push(name);
      }
    }
    return names;
  }

  resolve(
    module: number,
    name: string,
    resolveSet: { readonly module: number; readonly name: string }[] = [],
  ): ModelResolution {
    if (
      resolveSet.some((item) => item.module === module && item.name === name)
    ) {
      return null;
    }
    resolveSet.push({ module, name });
    const entries = this.#entries[module] ?? [];
    for (const entry of entries) {
      if (entry.kind === "local" && entry.exportName === name) {
        return { binding: entry.localName, module };
      }
    }
    for (const entry of entries) {
      if (entry.kind !== "indirect" || entry.exportName !== name) continue;
      if (entry.importName == null) return { module: entry.target };
      return this.resolve(entry.target, entry.importName, resolveSet);
    }
    if (name === "default") return null;
    let starResolution: ModelBinding | null = null;
    for (const entry of entries) {
      if (entry.kind !== "star") continue;
      const resolution = this.resolve(entry.target, name, resolveSet);
      if (resolution === "ambiguous") return "ambiguous";
      if (resolution == null) continue;
      if (starResolution == null) {
        starResolution = resolution;
      } else if (
        resolution.module !== starResolution.module ||
        resolution.binding !== starResolution.binding
      ) {
        return "ambiguous";
      }
    }
    return starResolution;
  }

  /** Whether InitializeEnvironment throws for any module of the graph. */
  linkFails(modules: readonly GeneratedModule[]): boolean {
    return modules.some((module, index) => {
      for (const entry of this.#entries[index] ?? []) {
        if (entry.kind !== "indirect") continue;
        const resolution = this.resolve(index, entry.exportName);
        if (resolution == null || resolution === "ambiguous") return true;
      }
      return module.imports.some((imported) => {
        if (imported.importedName == null) return false;
        const resolution = this.resolve(imported.target, imported.importedName);
        return resolution == null || resolution === "ambiguous";
      });
    });
  }
}

function syntaxGraph(modules: readonly GeneratedModule[]): ModuleGraph {
  return {
    entryId: moduleId(0),
    kind: "module-graph",
    modules: modules.map((module, from) => {
      let offset = 0;
      const resolutions: ModuleDependency[] = [];
      const request = (to: number): SyntaxModuleSpecifier => {
        const resolved = dependency(offset, to);
        offset += resolved.specifier.value.length + 1;
        resolutions.push(resolved);
        return resolved.specifier;
      };
      const imports: SyntaxImportEntry[] = [];
      // Each module requests its successor so the whole graph is reachable.
      if (from + 1 < modules.length) {
        const specifier = request(from + 1);
        imports.push({
          byteRange: specifier.byteRange,
          importedName: undefined,
          localName: undefined,
          range,
          specifier,
        });
      }
      for (const [index, imported] of module.imports.entries()) {
        const specifier = request(imported.target);
        const entry: SyntaxImportEntry = {
          byteRange: specifier.byteRange,
          importedName: imported.importedName ?? "*",
          localName: importLocalName(index),
          range,
          specifier,
        };
        imports.push(
          imported.importedName == null ? { ...entry, namespace: true } : entry,
        );
      }
      const exports = module.exports.map((entry): SyntaxExportEntry => {
        if (entry.kind === "local") {
          return {
            exportedName: entry.exportedName,
            kind: "local",
            localName:
              localNames[entry.local] ??
              importLocalName(entry.local - localNames.length),
            range,
          };
        }
        if (entry.kind === "indirect") {
          return {
            exportedName: entry.exportedName,
            importedName: entry.importedName,
            kind: "indirect",
            range,
            specifier: request(entry.target),
          };
        }
        if (entry.kind === "namespace") {
          return {
            exportedName: entry.exportedName,
            kind: "namespace",
            range,
            specifier: request(entry.target),
          };
        }
        return { kind: "star", range, specifier: request(entry.target) };
      });
      const dependencies = resolutions.filter(
        (item, index) =>
          resolutions.findIndex(
            (other) => other.canonicalId === item.canonicalId,
          ) === index,
      );
      return {
        canonicalId: moduleId(from),
        dependencies,
        resolutions,
        sourceHash: `hash-${from}`,
        syntax: {
          body: [],
          exports,
          imports,
          kind: "module" as const,
          range,
          sourceId: moduleId(from),
          varNames: [],
        },
      };
    }),
  };
}

function modelCell(
  linked: LinkedModuleGraph,
  binding: ModelBinding,
): number | undefined {
  if (binding.binding == null) {
    return linked.modules[binding.module]?.namespaceCellId;
  }
  return linked.cells.find(
    (cell) =>
      cell.moduleId === moduleId(binding.module) &&
      cell.localName === binding.binding,
  )?.id;
}

function exportArbitrary(moduleCount: number) {
  const name = fc.constantFrom(...exportNames);
  const target = fc.nat({ max: moduleCount - 1 });
  // Every indirect entry or named import that names a missing export
  // makes linking fail, so those forms are rarer to keep most graphs
  // linkable while still generating every failure.
  return fc.oneof(
    {
      arbitrary: fc.record({
        exportedName: name,
        kind: fc.constant("local" as const),
        local: fc.nat({ max: localNames.length + 2 }),
      }),
      weight: 6,
    },
    {
      arbitrary: fc.record({
        exportedName: name,
        importedName: name,
        kind: fc.constant("indirect" as const),
        target,
      }),
      weight: 1,
    },
    {
      arbitrary: fc.record({
        exportedName: name,
        kind: fc.constant("namespace" as const),
        target,
      }),
      weight: 3,
    },
    {
      arbitrary: fc.record({ kind: fc.constant("star" as const), target }),
      weight: 3,
    },
  );
}

function moduleArbitrary(moduleCount: number) {
  const target = fc.nat({ max: moduleCount - 1 });
  return fc
    .record({
      exports: fc.array(exportArbitrary(moduleCount), { maxLength: 5 }),
      imports: fc.array(
        fc.oneof(
          { arbitrary: fc.record({ target }), weight: 4 },
          {
            arbitrary: fc.record({
              importedName: fc.constantFrom(...exportNames),
              target,
            }),
            weight: 1,
          },
        ),
        { maxLength: 3 },
      ),
    })
    .map(({ exports, imports }): GeneratedModule => {
      // Duplicate export names are early errors, and a local export names
      // a declared local or an existing import, so both are normalized
      // here rather than filtered away.
      const seen = new Set<string>();
      const unique: GeneratedExport[] = [];
      for (const entry of exports) {
        if (entry.kind !== "star") {
          if (seen.has(entry.exportedName)) continue;
          seen.add(entry.exportedName);
        }
        unique.push(
          entry.kind === "local"
            ? {
                ...entry,
                local: entry.local % (localNames.length + imports.length),
              }
            : entry,
        );
      }
      return { exports: unique, imports };
    });
}

test("generated export forms resolve like ECMA-262 ResolveExport", () => {
  const graphArbitrary = fc
    .integer({ min: 1, max: maximumModules })
    .chain((moduleCount) =>
      fc.array(moduleArbitrary(moduleCount), {
        maxLength: moduleCount,
        minLength: moduleCount,
      }),
    );
  assertProperty(
    "linked exports, namespaces, and errors match the export model",
    fc.property(graphArbitrary, (modules) => {
      const model = new ExportModel(modules);
      const linked = linkModuleGraph(syntaxGraph(modules));
      if (model.linkFails(modules)) {
        assert.notEqual(linked.diagnostics.length, 0);
        assert.equal(linked.graph, undefined);
        return;
      }
      assert.deepEqual(linked.diagnostics, []);
      const graph: LinkedModuleGraph | undefined = linked.graph;
      assert.ok(graph != null);
      for (const [index, module] of modules.entries()) {
        const linkedModule: LinkedModule | undefined = graph.modules[index];
        assert.ok(linkedModule != null);
        const expected = model
          .exportedNames(index)
          .flatMap((name) => {
            const resolution = model.resolve(index, name);
            return resolution == null || resolution === "ambiguous"
              ? []
              : [{ cellId: modelCell(graph, resolution), name }];
          })
          .toSorted((left, right) =>
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
          );
        assert.deepEqual(
          linkedModule.exports.map((entry) => ({
            cellId: entry.cellId,
            name: entry.exportedName,
          })),
          expected,
        );
        assert.deepEqual(
          linkedModule.namespaceNames,
          expected.map((entry) => entry.name),
        );
        assert.deepEqual(
          linkedModule.imports.map((entry) => entry.cellId),
          module.imports.map((imported) => {
            if (imported.importedName == null) {
              return graph.modules[imported.target]?.namespaceCellId;
            }
            const resolution = model.resolve(
              imported.target,
              imported.importedName,
            );
            assert.ok(resolution != null && resolution !== "ambiguous");
            return modelCell(graph, resolution);
          }),
        );
      }
    }),
    {
      domain: "export entries with arbitrary names, namespaces, and stars",
      numRuns: 1_000,
      profile: "M5 module export forms",
      seed: 0x6000_0001,
      sizeLimit: `${maximumModules} modules, 5 exports, 3 imports each`,
      timeLimitMilliseconds: 10_000,
    },
  );
});
