import type { ByteRange, Diagnostic } from "./source.ts";
import { moduleNodeSyntax } from "./module-builtin.ts";
import { jsonModuleSyntax } from "./module-json.ts";
import type {
  LocatedSyntax,
  ModuleDependency,
  ModuleGraph,
  ModuleGraphNode,
  ModuleGraphOptions,
  ModuleGraphResult,
  ModuleLoadReferrer,
  ModuleLoader,
  ModuleLoadResult,
  ModuleResolution,
  ModuleRequestRecord,
  ModuleRequestReferrer,
  ModuleResolver,
  ModuleSourceFrontend,
  ScriptRequestReferrer,
  ScriptRequestResult,
  SyntaxImportCall,
  SyntaxImportEntry,
  SyntaxModule,
  SyntaxModuleSpecifier,
} from "./syntax.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** Retain each syntactic request once without merging distinct source sites. */
function moduleSpecifiers(
  module: SyntaxModule,
): readonly SyntaxModuleSpecifier[] {
  const specifiers: SyntaxModuleSpecifier[] = [];
  for (const entry of module.imports) specifiers.push(entry.specifier);
  for (const entry of module.exports) {
    if (
      entry.kind === "indirect" ||
      entry.kind === "namespace" ||
      entry.kind === "star"
    ) {
      specifiers.push(entry.specifier);
    }
  }
  const requests = new Set<string>();
  return specifiers
    .toSorted((left, right) => left.byteRange.start - right.byteRange.start)
    .filter((specifier) => {
      const key =
        `${specifier.byteRange.start}:${specifier.byteRange.end}:` +
        specifier.value;
      if (requests.has(key)) return false;
      requests.add(key);
      return true;
    });
}

/** One request site found while parsing a referrer, before resolution. */
interface RequestSite {
  readonly edgeKind: ModuleRequestRecord["edgeKind"];
  readonly location: LocatedSyntax & { readonly byteRange: ByteRange };
  readonly specifier: SyntaxModuleSpecifier;
}

/** The request that first brought a module into the build. */
interface ModuleOrigin {
  readonly edgeKind: ModuleRequestRecord["edgeKind"];
  readonly location: LocatedSyntax;
  readonly referrer: ModuleRequestReferrer;
}

/** A request site whose specifier resolved to a canonical target. */
interface ResolvedSite extends RequestSite {
  readonly canonicalId: string;
}

/** A resolved site waiting for its target to be visited. */
interface PendingRequest {
  readonly origin: ModuleOrigin;
  readonly site: ResolvedSite;
}

function requestSites(
  module: SyntaxModule | undefined,
  importCalls: readonly SyntaxImportCall[] | undefined,
): readonly RequestSite[] {
  const sites: RequestSite[] = [];
  if (module != null) {
    for (const specifier of moduleSpecifiers(module)) {
      sites.push({ edgeKind: "evaluation", location: specifier, specifier });
    }
  }
  for (const call of importCalls ?? []) {
    sites.push({
      edgeKind: "discovery",
      location: {
        byteRange: call.byteRange ?? call.specifier.byteRange,
        range: call.range,
      },
      specifier: call.specifier,
    });
  }
  return sites.toSorted(
    (left, right) =>
      left.location.byteRange.start - right.location.byteRange.start,
  );
}

/** A Script and a module may share an identity, so the key keeps both. */
function referrerKey(referrer: ModuleRequestReferrer): string {
  return `${referrer.kind}:${referrer.id}`;
}

function positionText(sourceId: string, location: LocatedSyntax): string {
  const start = location.range.start;
  return `${sourceId}:${start.line}:${start.column}`;
}

/**
 * The importer chain of a module as diagnostic notes, nearest request
 * first. The chain is reported only when it, or the failing request,
 * crosses a discovery edge, so a static-only graph keeps the diagnostics
 * it reported before `import()` discovery existed.
 */
function importerChainNotes(
  origins: ReadonlyMap<string, ModuleOrigin>,
  referrer: ModuleRequestReferrer,
  failing?: ModuleRequestRecord["edgeKind"],
): readonly string[] | undefined {
  const notes: string[] = [];
  let crossesDiscovery = failing === "discovery";
  const seen = new Set<string>();
  // A Script is a root: a module with the same identity is a different
  // record whose chain does not describe the Script.
  let origin =
    referrer.kind === "module" ? origins.get(referrer.id) : undefined;
  while (origin != null && !seen.has(referrerKey(origin.referrer))) {
    seen.add(referrerKey(origin.referrer));
    if (origin.edgeKind === "discovery") crossesDiscovery = true;
    const where = positionText(origin.referrer.id, origin.location);
    const script = origin.referrer.kind === "script" ? " (Script)" : "";
    notes.push(
      origin.edgeKind === "discovery"
        ? `requested by import() at ${where}${script}`
        : `imported by a static request at ${where}${script}`,
    );
    origin =
      origin.referrer.kind === "module"
        ? origins.get(origin.referrer.id)
        : undefined;
  }
  return crossesDiscovery && notes.length > 0 ? notes : undefined;
}

function withNotes(
  diagnostic: Diagnostic,
  notes: readonly string[] | undefined,
): Diagnostic {
  return notes == null
    ? diagnostic
    : { ...diagnostic, notes: [...(diagnostic.notes ?? []), ...notes] };
}

/** The origin of each module, recovered from a discovered graph. */
function graphOrigins(graph: ModuleGraph): ReadonlyMap<string, ModuleOrigin> {
  const origins = new Map<string, ModuleOrigin>();
  const requests = graph.requests ?? [];
  for (const module of graph.modules) {
    const request =
      module.discoveredBy == null ? undefined : requests[module.discoveredBy];
    if (request == null) continue;
    origins.set(module.canonicalId, {
      edgeKind: request.edgeKind,
      location: request,
      referrer: request.referrer,
    });
  }
  return origins;
}

/**
 * Add the importer chain of each referrer to the diagnostic located in
 * it, when that chain crosses an `import()` edge. Other diagnostics are
 * returned unchanged.
 */
function withReferrerChains(
  graph: ModuleGraph,
  located: readonly {
    readonly diagnostic: Diagnostic;
    readonly referrer: ModuleRequestReferrer;
  }[],
): readonly Diagnostic[] {
  if (
    !(graph.requests ?? []).some((request) => request.edgeKind === "discovery")
  ) {
    return located.map(({ diagnostic }) => diagnostic);
  }
  const origins = graphOrigins(graph);
  return located.map(({ diagnostic, referrer }) =>
    withNotes(diagnostic, importerChainNotes(origins, referrer)),
  );
}

/** {@link withReferrerChains} for diagnostics located in modules. */
function withImporterChains(
  graph: ModuleGraph,
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  return withReferrerChains(
    graph,
    diagnostics.map((diagnostic) => ({
      diagnostic,
      referrer: { id: diagnostic.sourceId, kind: "module" },
    })),
  );
}

interface DiscoveryResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly modules: readonly ModuleGraphNode[];
  readonly requests: readonly ModuleRequestRecord[];
}

/**
 * Discover, load, and parse every module the entry's static closure and
 * the literal `import()` requests reach, without evaluating anything.
 *
 * The entry's static closure is visited first, depth first in source
 * order, exactly as a graph without `import()` is. Script referrers'
 * requests and every `import()` request found along the way join one
 * first-in, first-out queue, and each dequeued target contributes its own
 * static closure the same way. A module is parsed once however many
 * requests reach it.
 */
function pendingRequest(
  referrer: ModuleRequestReferrer,
  site: ResolvedSite,
): PendingRequest {
  return {
    origin: { edgeKind: site.edgeKind, location: site.location, referrer },
    site,
  };
}

async function discoverModules(
  frontend: ModuleSourceFrontend,
  loader: ModuleLoader,
  resolver: ModuleResolver,
  entryId: string | undefined,
  scripts: readonly ScriptRequestReferrer[],
): Promise<DiscoveryResult> {
  const diagnostics: Diagnostic[] = [];
  const modules: ModuleGraphNode[] = [];
  const discovered = new Set<string>();
  const loadedSources = new Map<string, ModuleLoadResult>();
  const origins = new Map<string, ModuleOrigin>();
  const originSites = new Map<string, ResolvedSite>();
  const moduleSites = new Map<string, readonly ResolvedSite[]>();
  const queue: PendingRequest[] = [];

  /** Resolve a referrer's sites in source order, reporting failures. */
  const resolveSites = (
    referrer: ModuleRequestReferrer,
    sites: readonly RequestSite[],
  ): readonly ResolvedSite[] => {
    const resolved: ResolvedSite[] = [];
    for (const site of sites) {
      const notes = importerChainNotes(origins, referrer, site.edgeKind);
      const unsupportedAttribute = site.specifier.attributes?.find(
        (attribute) => attribute.key !== "type" || attribute.value !== "json",
      );
      if (unsupportedAttribute != null) {
        diagnostics.push(
          withNotes(
            linkDiagnostic(
              referrer.id,
              unsupportedAttribute,
              "Unsupported static import attribute.",
            ),
            notes,
          ),
        );
        continue;
      }
      const result = resolver.resolve(referrer.id, site.specifier);
      diagnostics.push(
        ...result.diagnostics.map((diagnostic) => withNotes(diagnostic, notes)),
      );
      if (result.canonicalId == null || result.diagnostics.length > 0) {
        continue;
      }
      resolved.push({ ...site, canonicalId: result.canonicalId });
    }
    return resolved;
  };

  const visit = async (
    canonicalId: string,
    request?: PendingRequest,
  ): Promise<void> => {
    const referrer: ModuleLoadReferrer | undefined =
      request == null
        ? undefined
        : {
            importerId: request.origin.referrer.id,
            specifier: request.site.specifier,
          };
    const failingNotes =
      request == null
        ? undefined
        : importerChainNotes(
            origins,
            request.origin.referrer,
            request.origin.edgeKind,
          );
    let loaded = loadedSources.get(canonicalId);
    if (loaded == null) {
      loaded = await loader.load(canonicalId, referrer);
      loadedSources.set(canonicalId, loaded);
      diagnostics.push(
        ...loaded.diagnostics.map((diagnostic) =>
          withNotes(diagnostic, failingNotes),
        ),
      );
    }
    if (loaded.diagnostics.length > 0) return;
    if (loaded.builtin != null) {
      if (canonicalId !== loaded.builtin.specifier) {
        diagnostics.push(
          linkDiagnostic(
            canonicalId,
            {
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
              },
            },
            "A builtin module must use its canonical specifier identity.",
          ),
        );
        return;
      }
      if (referrer?.specifier.attributes?.length) {
        diagnostics.push(
          linkDiagnostic(
            referrer.importerId,
            referrer.specifier,
            "A builtin module does not accept import attributes.",
          ),
        );
        return;
      }
      if (discovered.has(canonicalId)) return;
      discovered.add(canonicalId);
      if (request != null) {
        origins.set(canonicalId, request.origin);
        originSites.set(canonicalId, request.site);
      }
      modules.push({
        canonicalId,
        moduleKind: "builtin",
        builtin: loaded.builtin.specifier,
        sourceHash: loaded.builtin.sourceHash,
        dependencies: [],
        resolutions: [],
      });
      return;
    }
    if (loaded.source == null) return;
    if (referrer == null && loaded.source.kind === "json") {
      diagnostics.push(
        linkDiagnostic(
          canonicalId,
          {
            range: {
              start: { line: 1, column: 1 },
              end: { line: 1, column: 1 },
            },
          },
          "A JSON module cannot be the entry module.",
        ),
      );
      return;
    }
    const requestedJson =
      referrer?.specifier.attributes?.some(
        (attribute) => attribute.key === "type" && attribute.value === "json",
      ) ?? false;
    if (requestedJson !== (loaded.source.kind === "json")) {
      diagnostics.push(
        withNotes(
          linkDiagnostic(
            referrer?.importerId ?? canonicalId,
            referrer?.specifier ?? {
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
              },
            },
            "The module kind does not match its import attributes.",
          ),
          failingNotes,
        ),
      );
      return;
    }
    if (discovered.has(canonicalId)) return;
    discovered.add(canonicalId);
    if (request != null) {
      origins.set(canonicalId, request.origin);
      originSites.set(canonicalId, request.site);
    }
    const moduleNotes = importerChainNotes(origins, {
      id: canonicalId,
      kind: "module",
    });
    let parsed;
    if (loaded.source.kind === "json") {
      try {
        parsed = { diagnostics: [], module: jsonModuleSyntax(loaded.source) };
      } catch (error) {
        const diagnostic = withNotes(
          linkDiagnostic(
            referrer?.importerId ?? canonicalId,
            referrer?.specifier ?? {
              range: {
                start: { line: 1, column: 1 },
                end: { line: 1, column: 1 },
              },
            },
            error instanceof SyntaxError
              ? "Invalid JSON module source."
              : "JSON module construction exceeds compiler limits.",
          ),
          failingNotes,
        );
        diagnostics.push(
          error instanceof SyntaxError
            ? diagnostic
            : { ...diagnostic, code: "OSEO1001" },
        );
        return;
      }
    } else {
      parsed = frontend.parseModule({
        source: loaded.source.source,
        sourceId: canonicalId,
      });
    }
    diagnostics.push(
      ...parsed.diagnostics.map((diagnostic) =>
        withNotes(diagnostic, moduleNotes),
      ),
    );
    if (parsed.module == null || parsed.diagnostics.length > 0) return;
    const moduleReferrer: ModuleRequestReferrer = {
      id: canonicalId,
      kind: "module",
    };
    const sites = resolveSites(
      moduleReferrer,
      requestSites(parsed.module, parsed.module.importCalls),
    );
    moduleSites.set(canonicalId, sites);
    const dependencies: ModuleDependency[] = [];
    const resolutions: ModuleResolution[] = [];
    const dependencyIds = new Set<string>();
    for (const site of sites) {
      if (site.edgeKind !== "evaluation") continue;
      resolutions.push({
        canonicalId: site.canonicalId,
        specifier: site.specifier,
      });
      if (!dependencyIds.has(site.canonicalId)) {
        dependencyIds.add(site.canonicalId);
        dependencies.push({
          canonicalId: site.canonicalId,
          specifier: site.specifier,
        });
      }
    }
    modules.push({
      canonicalId,
      dependencies,
      resolutions,
      sourceHash: loaded.source.sourceHash,
      syntax: parsed.module,
      moduleKind: loaded.source.kind ?? "javascript",
    });
    for (const site of sites) {
      const pending = pendingRequest(moduleReferrer, site);
      if (site.edgeKind === "discovery") {
        queue.push(pending);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- Preserve source order.
      await visit(site.canonicalId, pending);
    }
  };

  // Script requests resolve first, and their targets are visited after
  // the entry's static closure and before any module's `import()` target.
  const scriptSites = scripts.map((script) => {
    const referrer: ModuleRequestReferrer = {
      id: script.canonicalId,
      kind: "script",
    };
    return {
      referrer,
      sites: resolveSites(
        referrer,
        requestSites(undefined, script.program.importCalls),
      ),
    };
  });
  if (entryId != null) await visit(entryId);
  queue.unshift(
    ...scriptSites.flatMap(({ referrer, sites }) =>
      sites.map((site) => pendingRequest(referrer, site)),
    ),
  );
  for (let index = 0; index < queue.length; index += 1) {
    const pending = queue[index]!;
    // eslint-disable-next-line no-await-in-loop -- Preserve discovery order.
    await visit(pending.site.canonicalId, pending);
  }

  const requests: ModuleRequestRecord[] = [];
  const siteIndices = new Map<ResolvedSite, number>();
  const record = (
    referrer: ModuleRequestReferrer,
    sites: readonly ResolvedSite[],
  ): void => {
    for (const site of sites) {
      siteIndices.set(site, requests.length);
      requests.push({
        byteRange: site.location.byteRange,
        edgeKind: site.edgeKind,
        index: requests.length,
        range: site.location.range,
        referrer,
        specifier: site.specifier,
        targetId: site.canonicalId,
      });
    }
  };
  for (const { referrer, sites } of scriptSites) record(referrer, sites);
  for (const module of modules) {
    record(
      { id: module.canonicalId, kind: "module" },
      moduleSites.get(module.canonicalId) ?? [],
    );
  }
  const discoveredModules: ModuleGraphNode[] = [];
  for (const module of modules) {
    const site = originSites.get(module.canonicalId);
    const discoveredBy = site == null ? undefined : siteIndices.get(site);
    discoveredModules.push(
      discoveredBy == null ? module : { ...module, discoveredBy },
    );
  }
  return { diagnostics, modules: discoveredModules, requests };
}

/**
 * Discover and parse one closed module graph without evaluating its modules.
 *
 * Literal `import()` sites, which a module frontend produces only when
 * static-specifier imports are enabled, add discovery edges: their
 * targets and those targets' closures join {@link ModuleGraph.modules},
 * but never a module's `dependencies`. A target that cannot be resolved,
 * loaded, or parsed fails discovery with its source location and its
 * importer chain in the diagnostic notes.
 */
export async function buildModuleGraph(
  frontend: ModuleSourceFrontend,
  loader: ModuleLoader,
  resolver: ModuleResolver,
  entryId: string,
  options: ModuleGraphOptions = {},
): Promise<ModuleGraphResult> {
  const result = await discoverModules(
    frontend,
    loader,
    resolver,
    entryId,
    options.scripts ?? [],
  );
  return result.diagnostics.length > 0
    ? { diagnostics: result.diagnostics }
    : {
        diagnostics: result.diagnostics,
        graph: {
          entryId,
          kind: "module-graph",
          modules: result.modules,
          requests: result.requests,
        },
      };
}

/**
 * Discover the modules that Script referrers reach through `import()`,
 * for a Script program with no module entry. Each Script resolves its
 * requests against its own canonical identity, and a module with the same
 * identity is a separate record.
 */
export async function buildScriptRequests(
  frontend: ModuleSourceFrontend,
  loader: ModuleLoader,
  resolver: ModuleResolver,
  scripts: readonly ScriptRequestReferrer[],
): Promise<ScriptRequestResult> {
  const result = await discoverModules(
    frontend,
    loader,
    resolver,
    undefined,
    scripts,
  );
  return result.diagnostics.length > 0
    ? { diagnostics: result.diagnostics }
    : {
        closure: {
          kind: "script-request-closure",
          modules: result.modules,
          requests: result.requests,
        },
        diagnostics: result.diagnostics,
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
  /**
   * The cell holding this module's namespace object, present when an
   * import or an `export * as` names that namespace. Every such reference
   * shares the one cell, so namespace identity is per module.
   */
  readonly namespaceCellId?: number;
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
  /**
   * Startup evaluation order. A discovered graph lists only the entry's
   * static closure; modules that only `import()` reaches are linked but
   * not scheduled.
   */
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
  return moduleNodeSyntax(module).imports.find(
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
  // A Script's request closure has no entry module.
  if (nodes.has(graph.entryId)) visit(graph.entryId);
  // Graph discovery records its requests, and every module it finds
  // outside the entry's static closure is one that only `import()`
  // reaches. Such a module evaluates on request, never at startup. A
  // hand-built graph without request records keeps ordering every
  // module.
  if (graph.requests != null) return order;
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

  const strongConnect = (root: string): void => {
    begin(root);
    const frames: { dependencyIndex: number; moduleId: string }[] = [
      { dependencyIndex: 0, moduleId: root },
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
  };
  // The entry's static closure comes first. Modules that only `import()`
  // reaches are linked too, each from the first one not yet indexed, so
  // their components follow the entry's in graph order.
  const roots = [
    graph.entryId,
    ...graph.modules.map((module) => module.canonicalId),
  ];
  for (const root of roots) {
    if (indices.has(root)) continue;
    strongConnect(root);
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
    for (const [index, entry] of moduleNodeSyntax(module).exports.entries()) {
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
      } else if (entry.kind === "namespace") {
        // ResolveExport answers an `export * as` entry with the requested
        // module's namespace directly, so it never waits on star
        // resolution and no star export can shadow or make it ambiguous.
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
        moduleExports.set(entry.exportedName, {
          cellId: namespaceCellFor(targetId),
          sourceModuleId: targetId,
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
      for (const entry of moduleNodeSyntax(module).exports) {
        if (entry.kind === "local") {
          const imported = importedBinding(module, entry.localName);
          if (imported == null) continue;
          const targetId = resolvedModuleId(module, imported.specifier);
          const candidate =
            targetId == null || imported.importedName == null
              ? undefined
              : imported.namespace === true
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
    for (const entry of moduleNodeSyntax(module).exports) {
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
    for (const entry of moduleNodeSyntax(module).imports) {
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
      if (entry.namespace === true) {
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
  if (diagnostics.length > 0) {
    return { diagnostics: withImporterChains(graph, diagnostics) };
  }

  // Every `import()` target resolves with its one namespace object, so
  // the target gets the namespace cell an `import * as` would share.
  for (const request of graph.requests ?? []) {
    if (request.edgeKind === "discovery") namespaceCellFor(request.targetId);
  }
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
      ...includePropertiesWhen(() => {
        const cellId = namespaceCells.get(module.canonicalId);
        return cellId == null ? undefined : { namespaceCellId: cellId };
      }),
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
