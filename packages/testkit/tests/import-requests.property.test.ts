import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModuleGraph,
  compileModuleGraph,
  importCallProfileMessage,
  linkModuleGraph,
  printMir,
} from "@oseo/compiler";
import type {
  Diagnostic,
  ModuleGraph,
  ScriptRequestReferrer,
  SyntaxImportCall,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxModuleSpecifier,
  SyntaxStatement,
} from "@oseo/compiler";
import fc from "fast-check";

import { assertAsyncProperty, propertySize } from "./property-support.ts";

const size = propertySize();
const maximumModules = size === "large" ? 16 : 8;
const maximumRequests = size === "large" ? 6 : 4;
const range = {
  end: { column: 1, line: 1 },
  start: { column: 1, line: 1 },
} as const;

/**
 * One generated request site. `target` names a module index, or a
 * missing module when it equals the module count. `alias` spells the
 * specifier through a redundant path segment, which canonicalizes to the
 * same identity.
 */
interface GeneratedRequest {
  readonly alias: boolean;
  readonly dynamic: boolean;
  readonly target: number;
}

interface GeneratedProgram {
  readonly modules: readonly (readonly GeneratedRequest[])[];
  /** A Script referrer's dynamic requests, absent when there is none. */
  readonly script?: {
    readonly identity: number;
    readonly requests: readonly GeneratedRequest[];
  };
}

function moduleId(index: number): string {
  return `file:///app/m${index}.js`;
}

function specifierText(request: GeneratedRequest, count: number): string {
  const name = request.target === count ? "missing" : `m${request.target}`;
  return request.alias ? `./alias/../${name}.js` : `./${name}.js`;
}

function specifierAt(value: string, offset: number): SyntaxModuleSpecifier {
  return {
    byteRange: { end: offset + value.length + 2, start: offset },
    range,
    value,
  };
}

/**
 * An expression statement that evaluates one `import()` site, so the
 * site reaches HIR construction as well as request discovery.
 */
function importCallStatement(call: SyntaxImportCall): SyntaxStatement {
  const statement = { expression: call, kind: "expression" as const, range };
  return call.byteRange == null
    ? statement
    : { ...statement, byteRange: call.byteRange };
}

/**
 * Hand-built module syntax with each request at its own byte offset, so
 * source order is the generated order. Static requests become
 * side-effect-only imports and dynamic ones `import-call` sites that the
 * body also evaluates.
 */
function moduleSyntax(
  index: number,
  requests: readonly GeneratedRequest[],
  count: number,
): SyntaxModule {
  const imports: SyntaxImportEntry[] = [];
  const importCalls: SyntaxImportCall[] = [];
  for (const [position, request] of requests.entries()) {
    const specifier = specifierAt(specifierText(request, count), position * 40);
    if (request.dynamic) {
      importCalls.push({
        byteRange: {
          end: specifier.byteRange.end + 1,
          start: specifier.byteRange.start,
        },
        kind: "import-call",
        range,
        specifier,
      });
    } else {
      imports.push({
        byteRange: specifier.byteRange,
        importedName: undefined,
        localName: undefined,
        range,
        specifier,
      });
    }
  }
  const module: SyntaxModule = {
    body: importCalls.map(importCallStatement),
    exports: [],
    imports,
    kind: "module",
    range,
    sourceId: moduleId(index),
    varNames: [],
  };
  return importCalls.length === 0 ? module : { ...module, importCalls };
}

function scriptReferrer(
  program: GeneratedProgram,
): ScriptRequestReferrer | undefined {
  if (program.script == null) return undefined;
  const count = program.modules.length;
  const importCalls = program.script.requests.map((request, position) => {
    const specifier = specifierAt(specifierText(request, count), position * 40);
    return {
      byteRange: specifier.byteRange,
      kind: "import-call" as const,
      range,
      specifier,
    };
  });
  return {
    canonicalId: moduleId(program.script.identity),
    program: {
      body: importCalls.map(importCallStatement),
      importCalls,
      kind: "program",
      range,
      sourceId: moduleId(program.script.identity),
    },
  };
}

async function discover(program: GeneratedProgram) {
  const count = program.modules.length;
  const syntax = new Map(
    program.modules.map((requests, index) => [
      moduleId(index),
      moduleSyntax(index, requests, count),
    ]),
  );
  const script = scriptReferrer(program);
  return buildModuleGraph(
    {
      parseModule(input) {
        const module = syntax.get(input.sourceId);
        assert.ok(module, `unexpected parse of ${input.sourceId}`);
        return {
          diagnostics: [],
          module,
          parsed: true,
          sourceId: input.sourceId,
        };
      },
    },
    {
      load(canonicalId) {
        assert.ok(syntax.has(canonicalId), `unexpected load ${canonicalId}`);
        return Promise.resolve({
          diagnostics: [],
          source: {
            source: "",
            sourceHash: `hash:${canonicalId}`,
            sourceId: canonicalId,
          },
        });
      },
    },
    {
      resolve(importerId, specifier) {
        const resolved = new URL(specifier.value, importerId).href;
        if (resolved.endsWith("/missing.js")) {
          return {
            diagnostics: [
              {
                byteRange: specifier.byteRange,
                code: "OSEO2001",
                message: `Cannot resolve '${specifier.value}'.`,
                range: specifier.range,
                sourceId: importerId,
              },
            ],
          };
        }
        return { canonicalId: resolved, diagnostics: [] };
      },
    },
    moduleId(0),
    script == null ? {} : { scripts: [script] },
  );
}

interface ModelRequest extends GeneratedRequest {
  readonly position: number;
  readonly referrer: { readonly id: string; readonly kind: string };
}

/** The request sites of one referrer, with their source positions. */
function sites(
  referrer: { id: string; kind: string },
  requests: readonly GeneratedRequest[],
): ModelRequest[] {
  return requests.map((request, position) => ({
    ...request,
    position,
    referrer,
  }));
}

/**
 * The independent oracle. It computes the entry's static closure with a
 * plain recursive depth-first walk, the set every edge reaches, and the
 * request sites in each reachable referrer, without the queue that graph
 * discovery uses.
 */
function model(program: GeneratedProgram) {
  const count = program.modules.length;
  const staticOrder: number[] = [];
  const walk = (index: number): void => {
    if (staticOrder.includes(index)) return;
    staticOrder.push(index);
    for (const request of program.modules[index] ?? []) {
      if (!request.dynamic && request.target < count) walk(request.target);
    }
  };
  walk(0);
  const reachable = new Set<number>([0]);
  const pending = [0];
  for (const request of program.script?.requests ?? []) {
    if (request.target < count && !reachable.has(request.target)) {
      reachable.add(request.target);
      pending.push(request.target);
    }
  }
  while (pending.length > 0) {
    const index = pending.pop()!;
    for (const request of program.modules[index] ?? []) {
      if (request.target < count && !reachable.has(request.target)) {
        reachable.add(request.target);
        pending.push(request.target);
      }
    }
  }
  const failing: ModelRequest[] = [];
  const scriptSites =
    program.script == null
      ? []
      : sites(
          { id: moduleId(program.script.identity), kind: "script" },
          program.script.requests,
        );
  for (const site of scriptSites) {
    if (site.target === count) failing.push(site);
  }
  for (const index of reachable) {
    for (const site of sites(
      { id: moduleId(index), kind: "module" },
      program.modules[index] ?? [],
    )) {
      if (site.target === count) failing.push(site);
    }
  }
  return { failing, reachable, scriptSites, staticOrder };
}

const requestArbitrary = (count: number) =>
  fc.record({
    alias: fc.boolean(),
    dynamic: fc.boolean(),
    target: fc.integer({ min: 0, max: count }),
  });

const programArbitrary = fc
  .integer({ min: 1, max: maximumModules })
  .chain((count) =>
    fc.record(
      {
        modules: fc.array(
          fc.array(requestArbitrary(count), { maxLength: maximumRequests }),
          { maxLength: count, minLength: count },
        ),
        script: fc.record({
          identity: fc.integer({ min: 0, max: count - 1 }),
          requests: fc.array(
            fc.record({
              alias: fc.boolean(),
              dynamic: fc.constant(true),
              target: fc.integer({ min: 0, max: count }),
            }),
            { maxLength: maximumRequests },
          ),
        }),
      },
      { requiredKeys: ["modules"] },
    ),
  );

function moduleIndex(id: string): number {
  return Number(id.slice("file:///app/m".length, -".js".length));
}

function assertFailures(
  expected: ReturnType<typeof model>,
  diagnostics: readonly Diagnostic[],
): void {
  // A chain is reported only for a non-entry module referrer, and only
  // when the failing request is an `import()` or the referrer lies
  // outside the entry's static closure, so that its first discovery
  // crossed an `import()` edge.
  const expectedRows = expected.failing.map((site) => {
    const chained =
      site.referrer.kind === "module" &&
      site.referrer.id !== moduleId(0) &&
      (site.dynamic ||
        !expected.staticOrder.includes(moduleIndex(site.referrer.id)));
    return `${site.referrer.id}@${site.position * 40}:${chained}`;
  });
  const actualRows = diagnostics.map(
    (diagnostic) =>
      `${diagnostic.sourceId}@${diagnostic.byteRange.start}:` +
      `${diagnostic.notes != null}`,
  );
  assert.deepEqual(actualRows.toSorted(), expectedRows.toSorted());
}

function assertGraph(
  program: GeneratedProgram,
  expected: ReturnType<typeof model>,
  graph: ModuleGraph,
): void {
  const count = program.modules.length;
  const ids = graph.modules.map((module) => module.canonicalId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    new Set(ids),
    new Set([...expected.reachable].map((index) => moduleId(index))),
  );
  // The entry's static closure keeps its old order as a prefix.
  assert.deepEqual(
    ids.slice(0, expected.staticOrder.length),
    expected.staticOrder.map((index) => moduleId(index)),
  );
  const requests = graph.requests ?? [];
  const referrers = [
    ...(program.script == null
      ? []
      : [{ id: moduleId(program.script.identity), kind: "script" }]),
    ...ids.map((id) => ({ id, kind: "module" })),
  ];
  let next = 0;
  for (const referrer of referrers) {
    const generated =
      referrer.kind === "script"
        ? (program.script?.requests ?? [])
        : (program.modules[moduleIndex(referrer.id)] ?? []);
    for (const [position, request] of generated.entries()) {
      const record = requests[next];
      assert.ok(record, "a request record is missing");
      assert.equal(record.index, next);
      assert.deepEqual(record.referrer, referrer);
      assert.equal(
        record.edgeKind,
        request.dynamic ? "discovery" : "evaluation",
      );
      assert.equal(record.targetId, moduleId(request.target));
      assert.equal(record.specifier.value, specifierText(request, count));
      assert.equal(record.byteRange.start, position * 40);
      next += 1;
    }
  }
  assert.equal(requests.length, next);
  for (const module of graph.modules) {
    const index = moduleIndex(module.canonicalId);
    // Only static requests are evaluation dependencies.
    const dependencies: string[] = [];
    for (const request of program.modules[index] ?? []) {
      const target = moduleId(request.target);
      if (!request.dynamic && !dependencies.includes(target)) {
        dependencies.push(target);
      }
    }
    assert.deepEqual(
      module.dependencies.map((dependency) => dependency.canonicalId),
      dependencies,
    );
    if (index === 0) {
      assert.equal(module.discoveredBy, undefined);
      continue;
    }
    const origin = requests[module.discoveredBy ?? -1];
    assert.ok(origin, `${module.canonicalId} has no origin request`);
    assert.equal(origin.targetId, module.canonicalId);
    if (origin.referrer.kind === "module") {
      assert.ok(
        ids.indexOf(origin.referrer.id) < ids.indexOf(module.canonicalId),
      );
    }
  }
  const linked = linkModuleGraph(graph);
  assert.deepEqual(linked.diagnostics, []);
  assert.deepEqual(
    new Set(linked.graph?.evaluationOrder),
    new Set(expected.staticOrder.map((index) => moduleId(index))),
  );
  // The module table lists the static evaluation order, then every
  // module only `import()` edges reach, in discovery order.
  const scheduled = linked.graph?.evaluationOrder ?? [];
  const table = [...scheduled, ...ids.filter((id) => !scheduled.includes(id))];
  const compiled = compileModuleGraph(graph);
  assert.deepEqual(compiled.diagnostics, []);
  assert.ok(compiled.mir);
  // Each module's `import()` sites lower, in source order, to the runtime
  // import operation with their target's constant table index. A module
  // without sites contributes no call.
  const expectedCalls = ids
    .map((id) =>
      (program.modules[moduleIndex(id)] ?? [])
        .filter((request) => request.dynamic)
        .map((request) => table.indexOf(moduleId(request.target))),
    )
    .filter((calls) => calls.length > 0);
  assert.deepEqual(
    sortedCalls(moduleImportCalls(printMir(compiled.mir))),
    sortedCalls(expectedCalls),
  );
  const script = scriptReferrer(program);
  if (script == null || script.program.importCalls?.length === 0) return;
  // A prelude Script runs before the module table exists, so each of its
  // `import()` sites keeps the profile refusal without a chain.
  const refused = compileModuleGraph(graph, {}, script.program);
  assert.deepEqual(
    refused.diagnostics.map((diagnostic) => [
      diagnostic.code,
      diagnostic.message,
      diagnostic.sourceId,
      diagnostic.byteRange.start,
      diagnostic.notes != null,
    ]),
    (program.script?.requests ?? []).map((_, position) => [
      "OSEO1001",
      importCallProfileMessage,
      script.canonicalId,
      position * 40,
      false,
    ]),
  );
  assert.equal(refused.mir, undefined);
}

/**
 * The constant arguments of every `module_import` call, one list per
 * printed MIR function that makes any. Value IDs restart in every
 * function, so each function's constants are read alone.
 */
function moduleImportCalls(mir: string): readonly (readonly number[])[] {
  return mir
    .split(/^(?=function )/mu)
    .map((block) => {
      const constants = new Map(
        [...block.matchAll(/^\s+%(\d+) = constant (\d+) /gmu)].map((match) => [
          match[1]!,
          Number(match[2]),
        ]),
      );
      return [...block.matchAll(/= call module_import %(\d+) /gu)].map(
        (match) => {
          const value = constants.get(match[1]!);
          assert.ok(value != null, `no constant for %${match[1]}`);
          return value;
        },
      );
    })
    .filter((calls) => calls.length > 0);
}

/** Per-function call lists in a canonical order, for comparison. */
function sortedCalls(calls: readonly (readonly number[])[]): readonly string[] {
  return calls.map((list) => list.join(",")).toSorted();
}

test("generated import() graphs keep deterministic requests", async () => {
  await assertAsyncProperty(
    "import() discovery matches the closure model",
    fc.asyncProperty(programArbitrary, async (program) => {
      const expected = model(program);
      const first = await discover(program);
      const second = await discover(program);
      assert.deepEqual(second, first);
      if (expected.failing.length > 0) {
        assert.equal(first.graph, undefined);
        assertFailures(expected, first.diagnostics);
        return;
      }
      assert.deepEqual(first.diagnostics, []);
      assert.ok(first.graph);
      assertGraph(program, expected, first.graph);
    }),
    {
      domain:
        "module graphs with static and literal import() edges, aliases, " +
        "missing targets, and an optional Script referrer",
      numRuns: 500,
      profile: "post-M5 static-specifier import requests",
      seed: 0x6000_9700,
      sizeLimit: `${maximumModules} modules, ${maximumRequests} requests each`,
      timeLimitMilliseconds: 10_000,
    },
  );
});
