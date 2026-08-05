import assert from "node:assert/strict";
import test from "node:test";

import { linkModuleGraph } from "@oseo/compiler";
import type {
  ModuleDependency,
  ModuleGraph,
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
