import type { Diagnostic } from "./source.ts";
import type {
  LocatedSyntax,
  ModuleDependency,
  ModuleGraph,
  ModuleGraphNode,
  ModuleGraphResult,
  ModuleLoadReferrer,
  ModuleLoader,
  ModuleResolution,
  ModuleResolver,
  ModuleSourceFrontend,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxModuleSpecifier,
} from "./syntax.ts";
function moduleSpecifiers(
  module: SyntaxModule,
): readonly SyntaxModuleSpecifier[] {
  const specifiers: SyntaxModuleSpecifier[] = [];
  for (const entry of module.imports) specifiers.push(entry.specifier);
  for (const entry of module.exports) {
    if (entry.kind === "indirect" || entry.kind === "star") {
      specifiers.push(entry.specifier);
    }
  }
  return specifiers.toSorted(
    (left, right) => left.byteRange.start - right.byteRange.start,
  );
}

/**
 * Discover and parse one closed module graph without evaluating its modules.
 */
export async function buildModuleGraph(
  frontend: ModuleSourceFrontend,
  loader: ModuleLoader,
  resolver: ModuleResolver,
  entryId: string,
): Promise<ModuleGraphResult> {
  const diagnostics: Diagnostic[] = [];
  const modules: ModuleGraphNode[] = [];
  const discovered = new Set<string>();

  const visit = async (
    canonicalId: string,
    referrer?: ModuleLoadReferrer,
  ): Promise<void> => {
    if (discovered.has(canonicalId)) return;
    discovered.add(canonicalId);
    const loaded = await loader.load(canonicalId, referrer);
    diagnostics.push(...loaded.diagnostics);
    if (loaded.source == null || loaded.diagnostics.length > 0) return;
    const parsed = frontend.parseModule({
      source: loaded.source.source,
      sourceId: canonicalId,
    });
    diagnostics.push(...parsed.diagnostics);
    if (parsed.module == null || parsed.diagnostics.length > 0) return;
    const dependencies: ModuleDependency[] = [];
    const resolutions: ModuleResolution[] = [];
    const dependencyIds = new Set<string>();
    for (const specifier of moduleSpecifiers(parsed.module)) {
      const resolved = resolver.resolve(canonicalId, specifier);
      diagnostics.push(...resolved.diagnostics);
      if (resolved.canonicalId == null || resolved.diagnostics.length > 0) {
        continue;
      }
      resolutions.push({
        canonicalId: resolved.canonicalId,
        specifier,
      });
      if (!dependencyIds.has(resolved.canonicalId)) {
        dependencyIds.add(resolved.canonicalId);
        dependencies.push({
          canonicalId: resolved.canonicalId,
          specifier,
        });
      }
    }
    modules.push({
      canonicalId,
      dependencies,
      resolutions,
      sourceHash: loaded.source.sourceHash,
      syntax: parsed.module,
    });
    for (const dependency of dependencies) {
      // eslint-disable-next-line no-await-in-loop -- Preserve source order.
      await visit(dependency.canonicalId, {
        importerId: canonicalId,
        specifier: dependency.specifier,
      });
    }
  };

  await visit(entryId);
  return diagnostics.length > 0
    ? { diagnostics }
    : {
        diagnostics,
        graph: { entryId, kind: "module-graph", modules },
      };
}

/** One runtime cell allocated during module instantiation. */
export interface LinkedModuleCell {
  readonly id: number;
  readonly localName: string;
  readonly moduleId: string;
}

/** One linked imported binding or namespace reference. */
export interface LinkedModuleImport {
  readonly cellId?: number;
  readonly importedName: string;
  readonly localName: string;
  readonly namespaceModuleId?: string;
}

/** One export resolved to the cell that provides its live value. */
export interface LinkedModuleExport {
  readonly cellId: number;
  readonly exportedName: string;
  readonly sourceModuleId: string;
}

/** One module after import and export name resolution. */
export interface LinkedModule {
  readonly canonicalId: string;
  readonly cellIds: readonly number[];
  readonly componentId: number;
  readonly exports: readonly LinkedModuleExport[];
  readonly imports: readonly LinkedModuleImport[];
  readonly namespaceNames: readonly string[];
}

/** One deterministic strongly connected module component. */
export interface ModuleComponent {
  readonly cyclic: boolean;
  readonly id: number;
  /** Module IDs in evaluation order, ending with the component root. */
  readonly moduleIds: readonly string[];
}

/** Closed graph with live-cell and evaluation identities fixed. */
export interface LinkedModuleGraph {
  readonly cells: readonly LinkedModuleCell[];
  readonly components: readonly ModuleComponent[];
  readonly entryId: string;
  readonly evaluationOrder: readonly string[];
  readonly kind: "linked-module-graph";
  readonly modules: readonly LinkedModule[];
}

/** Result of static module linking and instantiation planning. */
export interface ModuleLinkResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly graph?: LinkedModuleGraph;
}

interface ExportCandidate {
  readonly cellId: number;
  readonly sourceModuleId: string;
}

function linkDiagnostic(
  sourceId: string,
  locationValue: LocatedSyntax,
  message: string,
): Diagnostic {
  return {
    byteRange: locationValue.byteRange ?? { end: 0, start: 0 },
    code: "OSEO2001",
    message,
    range: locationValue.range,
    sourceId,
  };
}

function resolvedModuleId(
  module: ModuleGraphNode,
  specifier: SyntaxModuleSpecifier,
): string | undefined {
  return module.resolutions.find(
    (resolution) =>
      resolution.specifier === specifier ||
      (resolution.specifier.value === specifier.value &&
        resolution.specifier.byteRange.start === specifier.byteRange.start &&
        resolution.specifier.byteRange.end === specifier.byteRange.end),
  )?.canonicalId;
}

export function importedBinding(
  module: ModuleGraphNode,
  localName: string,
): SyntaxImportEntry | undefined {
  return module.syntax.imports.find(
    (entry) => entry.localName === localName && entry.importedName != null,
  );
}

function sameExport(left: ExportCandidate, right: ExportCandidate): boolean {
  return left.cellId === right.cellId;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function moduleDepthFirstOrder(graph: ModuleGraph): readonly string[] {
  const nodes = new Map(
    graph.modules.map((module) => [module.canonicalId, module]),
  );
  const visited = new Set<string>();
  const order: string[] = [];
  const visit = (rootId: string): void => {
    if (visited.has(rootId)) return;
    visited.add(rootId);
    const frames: { dependencyIndex: number; moduleId: string }[] = [
      { dependencyIndex: 0, moduleId: rootId },
    ];
    while (frames.length > 0) {
      const frame = frames.at(-1)!;
      const dependencies = nodes.get(frame.moduleId)?.dependencies ?? [];
      const dependency = dependencies[frame.dependencyIndex];
      if (dependency != null) {
        frame.dependencyIndex += 1;
        if (visited.has(dependency.canonicalId)) continue;
        visited.add(dependency.canonicalId);
        frames.push({
          dependencyIndex: 0,
          moduleId: dependency.canonicalId,
        });
        continue;
      }
      order.push(frame.moduleId);
      frames.pop();
    }
  };
  visit(graph.entryId);
  for (const moduleId of [...nodes.keys()].toSorted(compareCodeUnits)) {
    visit(moduleId);
  }
  return order;
}

function moduleComponents(graph: ModuleGraph): readonly ModuleComponent[] {
  const nodes = new Map(
    graph.modules.map((module) => [module.canonicalId, module]),
  );
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const stacked = new Set<string>();
  const found: string[][] = [];
  let nextIndex = 0;

  const begin = (moduleId: string): void => {
    const index = nextIndex;
    nextIndex += 1;
    indices.set(moduleId, index);
    lowLinks.set(moduleId, index);
    stack.push(moduleId);
    stacked.add(moduleId);
  };

  begin(graph.entryId);
  const frames: { dependencyIndex: number; moduleId: string }[] = [
    { dependencyIndex: 0, moduleId: graph.entryId },
  ];
  while (frames.length > 0) {
    const frame = frames.at(-1)!;
    const index = indices.get(frame.moduleId)!;
    const dependencies = nodes.get(frame.moduleId)?.dependencies ?? [];
    const dependency = dependencies[frame.dependencyIndex];
    if (dependency != null) {
      frame.dependencyIndex += 1;
      if (!indices.has(dependency.canonicalId)) {
        begin(dependency.canonicalId);
        frames.push({
          dependencyIndex: 0,
          moduleId: dependency.canonicalId,
        });
      } else if (stacked.has(dependency.canonicalId)) {
        lowLinks.set(
          frame.moduleId,
          Math.min(
            lowLinks.get(frame.moduleId) ?? index,
            indices.get(dependency.canonicalId) ?? index,
          ),
        );
      }
      continue;
    }
    if (lowLinks.get(frame.moduleId) === index) {
      const component: string[] = [];
      for (;;) {
        const member = stack.pop();
        if (member == null) {
          throw new Error("Module component stack underflow.");
        }
        stacked.delete(member);
        component.push(member);
        if (member === frame.moduleId) break;
      }
      found.push(component);
    }
    frames.pop();
    const parent = frames.at(-1);
    if (parent != null) {
      lowLinks.set(
        parent.moduleId,
        Math.min(
          lowLinks.get(parent.moduleId) ?? index,
          lowLinks.get(frame.moduleId) ?? index,
        ),
      );
    }
  }
  const evaluationOrder = moduleDepthFirstOrder(graph);
  const evaluationIndex = new Map(
    evaluationOrder.map((moduleId, index) => [moduleId, index]),
  );
  return found
    .map((moduleIds) =>
      moduleIds.toSorted(
        (left, right) =>
          (evaluationIndex.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (evaluationIndex.get(right) ?? Number.MAX_SAFE_INTEGER),
      ),
    )
    .toSorted(
      (left, right) =>
        (evaluationIndex.get(left[0] ?? "") ?? Number.MAX_SAFE_INTEGER) -
        (evaluationIndex.get(right[0] ?? "") ?? Number.MAX_SAFE_INTEGER),
    )
    .map((moduleIds, id) => {
      const first = nodes.get(moduleIds[0] ?? "");
      const selfCycle = first?.dependencies.some(
        (dependency) => dependency.canonicalId === first.canonicalId,
      );
      return {
        cyclic: moduleIds.length > 1 || selfCycle === true,
        id,
        moduleIds,
      };
    });
}

/** Resolve live imports, exports, namespace keys, and cyclic graph order. */
export function linkModuleGraph(graph: ModuleGraph): ModuleLinkResult {
  const diagnostics: Diagnostic[] = [];
  const nodes = new Map(
    graph.modules.map((module) => [module.canonicalId, module]),
  );
  const cells: LinkedModuleCell[] = [];
  const cellIds = new Map<string, number>();
  const exportsByModule = new Map<string, Map<string, ExportCandidate>>();
  const explicitNames = new Map<string, Set<string>>();
  const ambiguousNames = new Map<string, Set<string>>();
  const namespaceCells = new Map<string, number>();

  const cellFor = (moduleId: string, localName: string): number => {
    const key = `${moduleId}\0${localName}`;
    const existing = cellIds.get(key);
    if (existing != null) return existing;
    const id = cells.length;
    cells.push({ id, localName, moduleId });
    cellIds.set(key, id);
    return id;
  };

  const namespaceCellFor = (moduleId: string): number => {
    const existing = namespaceCells.get(moduleId);
    if (existing != null) return existing;
    const cellId = cellFor(moduleId, `*namespace:${moduleId}*`);
    namespaceCells.set(moduleId, cellId);
    return cellId;
  };

  for (const module of graph.modules) {
    const moduleExports = new Map<string, ExportCandidate>();
    const names = new Set<string>();
    exportsByModule.set(module.canonicalId, moduleExports);
    explicitNames.set(module.canonicalId, names);
    ambiguousNames.set(module.canonicalId, new Set());
    for (const [index, entry] of module.syntax.exports.entries()) {
      if (entry.kind === "star") continue;
      if (names.has(entry.exportedName)) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Duplicate export '${entry.exportedName}'.`,
          ),
        );
        continue;
      }
      names.add(entry.exportedName);
      if (entry.kind === "local") {
        if (importedBinding(module, entry.localName) == null) {
          moduleExports.set(entry.exportedName, {
            cellId: cellFor(module.canonicalId, entry.localName),
            sourceModuleId: module.canonicalId,
          });
        }
      } else if (entry.kind === "default") {
        moduleExports.set("default", {
          cellId: cellFor(module.canonicalId, `*default:${index}*`),
          sourceModuleId: module.canonicalId,
        });
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const module of graph.modules) {
      const moduleExports = exportsByModule.get(module.canonicalId);
      const moduleAmbiguous = ambiguousNames.get(module.canonicalId);
      const moduleExplicit = explicitNames.get(module.canonicalId);
      if (
        moduleExports == null ||
        moduleAmbiguous == null ||
        moduleExplicit == null
      ) {
        throw new Error("Module link state is incomplete.");
      }
      for (const entry of module.syntax.exports) {
        if (entry.kind === "local") {
          const imported = importedBinding(module, entry.localName);
          if (imported == null) continue;
          const targetId = resolvedModuleId(module, imported.specifier);
          const candidate =
            targetId == null || imported.importedName == null
              ? undefined
              : imported.importedName === "*"
                ? {
                    cellId: namespaceCellFor(targetId),
                    sourceModuleId: targetId,
                  }
                : exportsByModule.get(targetId)?.get(imported.importedName);
          const existing = moduleExports.get(entry.exportedName);
          if (
            candidate != null &&
            (existing == null || !sameExport(existing, candidate))
          ) {
            moduleExports.set(entry.exportedName, candidate);
            changed = true;
          }
          continue;
        }
        if (entry.kind === "indirect") {
          const targetId = resolvedModuleId(module, entry.specifier);
          const candidate =
            targetId == null
              ? undefined
              : exportsByModule.get(targetId)?.get(entry.importedName);
          if (
            candidate != null &&
            !moduleExports.has(entry.exportedName) &&
            !moduleAmbiguous.has(entry.exportedName)
          ) {
            moduleExports.set(entry.exportedName, candidate);
            changed = true;
          }
          continue;
        }
        if (entry.kind !== "star") continue;
        const targetId = resolvedModuleId(module, entry.specifier);
        if (targetId == null) continue;
        const targetExports = exportsByModule.get(targetId);
        const targetAmbiguous = ambiguousNames.get(targetId);
        if (targetExports == null || targetAmbiguous == null) continue;
        for (const name of targetAmbiguous) {
          if (name !== "default" && !moduleExplicit.has(name)) {
            if (!moduleAmbiguous.has(name)) changed = true;
            moduleAmbiguous.add(name);
            moduleExports.delete(name);
          }
        }
        for (const [name, candidate] of targetExports) {
          if (
            name === "default" ||
            moduleExplicit.has(name) ||
            moduleAmbiguous.has(name)
          ) {
            continue;
          }
          const existing = moduleExports.get(name);
          if (existing == null) {
            moduleExports.set(name, candidate);
            changed = true;
          } else if (!sameExport(existing, candidate)) {
            moduleExports.delete(name);
            moduleAmbiguous.add(name);
            changed = true;
          }
        }
      }
    }
  }

  const linkedImports = new Map<string, LinkedModuleImport[]>();
  for (const module of graph.modules) {
    const imports: LinkedModuleImport[] = [];
    linkedImports.set(module.canonicalId, imports);
    for (const entry of module.syntax.exports) {
      if (entry.kind !== "indirect") continue;
      const targetId = resolvedModuleId(module, entry.specifier);
      const targetAmbiguous =
        targetId == null ? undefined : ambiguousNames.get(targetId);
      const candidate =
        targetId == null
          ? undefined
          : exportsByModule.get(targetId)?.get(entry.importedName);
      if (targetAmbiguous?.has(entry.importedName) === true) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Export '${entry.importedName}' is ambiguous.`,
          ),
        );
      } else if (candidate == null) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Module has no export '${entry.importedName}'.`,
          ),
        );
      }
    }
    for (const entry of module.syntax.imports) {
      if (entry.localName == null || entry.importedName == null) continue;
      const targetId = resolvedModuleId(module, entry.specifier);
      if (targetId == null || !nodes.has(targetId)) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Module '${entry.specifier.value}' was not resolved.`,
          ),
        );
        continue;
      }
      if (entry.importedName === "*") {
        imports.push({
          cellId: namespaceCellFor(targetId),
          importedName: "*",
          localName: entry.localName,
          namespaceModuleId: targetId,
        });
        continue;
      }
      const targetAmbiguous = ambiguousNames.get(targetId);
      const candidate = exportsByModule.get(targetId)?.get(entry.importedName);
      if (targetAmbiguous?.has(entry.importedName) === true) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Import '${entry.importedName}' is ambiguous.`,
          ),
        );
      } else if (candidate == null) {
        diagnostics.push(
          linkDiagnostic(
            module.canonicalId,
            entry,
            `Module has no export '${entry.importedName}'.`,
          ),
        );
      } else {
        imports.push({
          cellId: candidate.cellId,
          importedName: entry.importedName,
          localName: entry.localName,
        });
      }
    }
  }
  if (diagnostics.length > 0) return { diagnostics };

  const components = moduleComponents(graph);
  const componentByModule = new Map<string, number>();
  for (const component of components) {
    for (const moduleId of component.moduleIds) {
      componentByModule.set(moduleId, component.id);
    }
  }
  const linkedModules = graph.modules.map((module): LinkedModule => {
    const moduleExports = exportsByModule.get(module.canonicalId);
    const componentId = componentByModule.get(module.canonicalId);
    if (moduleExports == null || componentId == null) {
      throw new Error("Linked module state is incomplete.");
    }
    const exports = [...moduleExports]
      .toSorted(([left], [right]) => compareCodeUnits(left, right))
      .map(([exportedName, candidate]) => ({
        cellId: candidate.cellId,
        exportedName,
        sourceModuleId: candidate.sourceModuleId,
      }));
    return {
      canonicalId: module.canonicalId,
      cellIds: cells
        .filter((cell) => cell.moduleId === module.canonicalId)
        .map((cell) => cell.id),
      componentId,
      exports,
      imports: linkedImports.get(module.canonicalId) ?? [],
      namespaceNames: exports.map((entry) => entry.exportedName),
    };
  });
  return {
    diagnostics,
    graph: {
      cells,
      components,
      entryId: graph.entryId,
      evaluationOrder: moduleDepthFirstOrder(graph),
      kind: "linked-module-graph",
      modules: linkedModules,
    },
  };
}
