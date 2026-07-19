/** Stable diagnostic codes owned by the Oseo compiler. */
export type DiagnosticCode = "OSEO0001" | "OSEO1001" | "OSEO2001" | "OSEO3001";

/** A half-open UTF-8 byte range. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** A one-based Unicode scalar-value source position. */
export interface Position {
  readonly line: number;
  readonly column: number;
}

/** A half-open source range with optional retained module identity. */
export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
  readonly sourceId?: string;
}

/** A source-located error independent of a bootstrap parser or host. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly sourceId: string;
  readonly byteRange: ByteRange;
  readonly range: SourceRange;
  readonly message: string;
  readonly notes?: readonly string[];
}

/** Input accepted by a source frontend implementation. */
export interface SourceInput {
  readonly source: string;
  readonly sourceId: string;
}

/** Provenance retained for an optimization hint. */
export type HintProvenance = "jsdoc" | "typescript";

/** Primitive hint names accepted during M1. */
export type HintName =
  | "any"
  | "boolean"
  | "null"
  | "number"
  | "string"
  | "undefined"
  | "unknown";

/** An owned hint that cannot expose a bootstrap-parser node. */
export interface Hint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

interface LocatedSyntax {
  readonly range: SourceRange;
  readonly byteRange?: ByteRange;
}

/** A call target admitted by the M1 language profile. */
export type SyntaxCallTarget =
  | (LocatedSyntax & {
      readonly kind: "console-log";
    })
  | (LocatedSyntax & {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    })
  | (LocatedSyntax & {
      readonly kind: "promise-intrinsic";
      readonly method: "all" | "race" | "reject" | "resolve";
    })
  | (LocatedSyntax & {
      readonly kind: "promise-intrinsic-direct";
      readonly method: "asyncCall" | "awaitThen" | "resolve" | "then";
    })
  | (LocatedSyntax & {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    })
  | (LocatedSyntax & {
      readonly kind: "name";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly callee: SyntaxExpression;
      readonly kind: "dynamic";
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property";
      readonly object: SyntaxExpression;
    });

/** Binary operations selected before native backend lowering. */
export type BinaryOperator =
  | "!="
  | "!=="
  | "%"
  | "&"
  | "*"
  | "**"
  | "+"
  | "-"
  | "/"
  | "<"
  | "<<"
  | "<="
  | "=="
  | "==="
  | ">"
  | ">="
  | ">>"
  | ">>>"
  | "^"
  | "in"
  | "instanceof"
  | "|";

/** Unary operations selected before native backend lowering. */
export type UnaryOperator = "!" | "+" | "-" | "typeof" | "void" | "~";

/** Short-circuit operators lowered through explicit control flow. */
export type LogicalOperator = "&&" | "??" | "||";

/** An expression in the parser-independent M1 syntax tree. */
export type SyntaxExpression =
  | (LocatedSyntax & {
      readonly argument: SyntaxExpression;
      readonly kind: "await";
    })
  | (LocatedSyntax & {
      readonly kind: "binding-set";
      readonly name: string;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly (SyntaxExpression | undefined)[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: SyntaxExpression;
      readonly operator: BinaryOperator;
      readonly right: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxExpression[];
      readonly kind: "call";
      readonly target: SyntaxCallTarget;
    })
  | (LocatedSyntax & {
      readonly alternate: SyntaxExpression;
      readonly consequent: SyntaxExpression;
      readonly kind: "conditional";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "logical";
      readonly left: SyntaxExpression;
      readonly operator: LogicalOperator;
      readonly right: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly expressions: readonly SyntaxExpression[];
      readonly kind: "sequence";
    })
  | (LocatedSyntax & {
      readonly functionValue: SyntaxFunction;
      /** Function name inferred independently from a storage binding. */
      readonly inferredName?: string;
      readonly kind: "function";
    })
  | (LocatedSyntax & {
      readonly kind: "identifier";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxExpression[];
      readonly callee: SyntaxExpression;
      readonly kind: "new";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly SyntaxExpression[];
      readonly kind: "promise-construct";
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: SyntaxExpression;
        readonly value: SyntaxExpression;
      }[];
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-delete";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-get";
      readonly object: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly key: SyntaxExpression;
      readonly kind: "property-set";
      readonly object: SyntaxExpression;
      readonly value: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly kind: "this";
    })
  | (LocatedSyntax & {
      readonly argument: SyntaxExpression;
      readonly kind: "unary";
      readonly operator: UnaryOperator;
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** One plain function parameter and its retained hints. */
export interface SyntaxParameter extends LocatedSyntax {
  readonly hints: readonly Hint[];
  readonly name: string;
}

/** One switch clause; a missing test marks the default clause. */
export interface SyntaxSwitchCase {
  readonly body: readonly SyntaxStatement[];
  readonly range: SourceRange;
  readonly test?: SyntaxExpression;
}

/** One resolved switch clause sharing the case-block scope. */
export interface HirSwitchCase {
  readonly body: readonly HirStatement[];
  readonly range: SourceRange;
  readonly test?: HirExpression;
}

/** One lexical binding declared by a classic for statement head. */
export interface SyntaxForDeclaration {
  readonly hint: Hint | undefined;
  readonly initializer: SyntaxExpression;
  readonly mutable: boolean;
  readonly name: string;
  readonly range: SourceRange;
}

/** One resolved for-head binding copied into each iteration. */
export interface HirForDeclaration {
  readonly bindingId: number;
  readonly hint: Hint | undefined;
  readonly initializer: HirExpression;
  readonly mutable: boolean;
  readonly name: string;
  readonly range: SourceRange;
}

/** Runtime call and construction identity retained for every function. */
export type FunctionKind = "arrow" | "async" | "async-arrow" | "ordinary";

/** A statement in the parser-independent M1 syntax tree. */
export type SyntaxStatement =
  | (LocatedSyntax & {
      readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "do-while";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly declarations?: readonly SyntaxForDeclaration[];
      readonly init?: SyntaxExpression;
      readonly kind: "for";
      readonly test?: SyntaxExpression;
      readonly update?: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly cases: readonly SyntaxSwitchCase[];
      readonly discriminant: SyntaxExpression;
      readonly kind: "switch";
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "binding-init";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly hint: Hint | undefined;
      readonly initializer: SyntaxExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly alternate: SyntaxStatement | undefined;
      readonly consequent: SyntaxStatement;
      readonly kind: "if";
      readonly test: SyntaxExpression;
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly expression: SyntaxExpression;
      readonly kind: "throw";
    })
  | (LocatedSyntax & {
      readonly block: SyntaxStatement;
      readonly handler:
        | {
            readonly body: SyntaxStatement;
            readonly name: string;
            readonly range: SourceRange;
          }
        | undefined;
      readonly finalizer: SyntaxStatement | undefined;
      readonly kind: "try";
    })
  | (LocatedSyntax & {
      readonly body: SyntaxStatement;
      readonly kind: "while";
      readonly test: SyntaxExpression;
    });

/** A top-level function declaration in owned syntax. */
export interface SyntaxFunction extends LocatedSyntax {
  /** Internal declaration binding when it differs from the function name. */
  readonly bindingName?: string;
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly functionKind?: FunctionKind;
  readonly kind: "function";
  readonly name: string | undefined;
  readonly parameters: readonly SyntaxParameter[];
  readonly returnHints: readonly Hint[];
  readonly strict?: boolean;
}

/** One owned M1 script, with no parser-specific values. */
export interface SyntaxProgram extends LocatedSyntax {
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly kind: "program";
  readonly sourceId: string;
  readonly strict?: boolean;
}

/** Production frontend output for owned M1 syntax. */
export interface FrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly parsed: boolean;
  readonly program?: SyntaxProgram;
  readonly sourceId: string;
}

/** Replaceable source frontend boundary owned by compiler core. */
export interface SourceFrontend {
  parse(input: SourceInput): FrontendResult;
}

/** One source-located module specifier retained outside a bootstrap AST. */
export interface SyntaxModuleSpecifier extends LocatedSyntax {
  readonly byteRange: ByteRange;
  readonly value: string;
}

/** One imported binding or side-effect-only dependency. */
export interface SyntaxImportEntry extends LocatedSyntax {
  readonly byteRange: ByteRange;
  readonly importedName: "*" | "default" | string | undefined;
  readonly localName: string | undefined;
  readonly specifier: SyntaxModuleSpecifier;
}

/** One exported name before graph linking. */
export type SyntaxExportEntry =
  | (LocatedSyntax & {
      readonly exportedName: string;
      readonly kind: "local";
      readonly localName: string;
    })
  | (LocatedSyntax & {
      readonly exportedName: string;
      readonly importedName: string;
      readonly kind: "indirect";
      readonly specifier: SyntaxModuleSpecifier;
    })
  | (LocatedSyntax & {
      readonly kind: "star";
      readonly specifier: SyntaxModuleSpecifier;
    })
  | (LocatedSyntax & {
      readonly declaration: SyntaxExpression | SyntaxFunction;
      readonly exportedName: "default";
      readonly kind: "default";
    });

/** Parser-independent syntax for one M4 ECMAScript module. */
export interface SyntaxModule extends LocatedSyntax {
  readonly body: readonly (SyntaxFunction | SyntaxStatement)[];
  readonly exports: readonly SyntaxExportEntry[];
  readonly imports: readonly SyntaxImportEntry[];
  readonly kind: "module";
  readonly sourceId: string;
}

/** Production frontend output for owned module syntax. */
export interface ModuleFrontendResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly module?: SyntaxModule;
  readonly parsed: boolean;
  readonly sourceId: string;
}

/** Replaceable module frontend boundary owned by compiler core. */
export interface ModuleSourceFrontend {
  parseModule(input: SourceInput): ModuleFrontendResult;
}

/** Source and stable content identity supplied by a compiler host. */
export interface LoadedModuleSource extends SourceInput {
  readonly sourceHash: string;
}

/** Owned result of loading one canonical module identifier. */
export interface ModuleLoadResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly source?: LoadedModuleSource;
}

/** Import site that caused a dependency module to be loaded. */
export interface ModuleLoadReferrer {
  readonly importerId: string;
  readonly specifier: SyntaxModuleSpecifier;
}

/** Host-neutral source loader used during graph discovery. */
export interface ModuleLoader {
  load(
    canonicalId: string,
    referrer?: ModuleLoadReferrer,
  ): Promise<ModuleLoadResult>;
}

/** Owned result of resolving one source specifier. */
export interface ModuleResolutionResult {
  readonly canonicalId?: string;
  readonly diagnostics: readonly Diagnostic[];
}

/** Host-neutral module resolution policy. */
export interface ModuleResolver {
  resolve(
    importerId: string,
    specifier: SyntaxModuleSpecifier,
  ): ModuleResolutionResult;
}

/** One resolved dependency edge in source order. */
export interface ModuleDependency {
  readonly canonicalId: string;
  readonly specifier: SyntaxModuleSpecifier;
}

/** One resolved source occurrence before dependency deduplication. */
export interface ModuleResolution extends ModuleDependency {}

/** One uniquely identified node in a closed module graph. */
export interface ModuleGraphNode {
  readonly canonicalId: string;
  readonly dependencies: readonly ModuleDependency[];
  readonly resolutions: readonly ModuleResolution[];
  readonly sourceHash: string;
  readonly syntax: SyntaxModule;
}

/** Deterministic closed graph rooted at one canonical entry. */
export interface ModuleGraph {
  readonly entryId: string;
  readonly kind: "module-graph";
  readonly modules: readonly ModuleGraphNode[];
}

/** Result of host-neutral module graph discovery. */
export interface ModuleGraphResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly graph?: ModuleGraph;
}

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

function importedBinding(
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

/** A resolved call target in HIR. */
export type HirCallTarget =
  | {
      readonly kind: "console-log";
    }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
  | {
      readonly kind: "promise-intrinsic";
      readonly method:
        | "all"
        | "asyncCall"
        | "awaitThen"
        | "race"
        | "reject"
        | "resolve"
        | "then";
    }
  | {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    }
  | {
      readonly callee: HirExpression;
      readonly kind: "dynamic";
    }
  | {
      readonly key: HirExpression;
      readonly kind: "method";
      readonly object: HirExpression;
    };

/** A resolved, normalized HIR expression. */
export type HirExpression =
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "await";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionNameBinding?: boolean;
      readonly kind: "binding-set";
      readonly mutable: boolean;
      readonly name: string;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly elements: readonly (HirExpression | undefined)[];
      readonly kind: "array";
    })
  | (LocatedSyntax & {
      readonly kind: "binary";
      readonly left: HirExpression;
      readonly operator: BinaryOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirExpression[];
      readonly kind: "call";
      readonly target: HirCallTarget;
    })
  | (LocatedSyntax & {
      readonly alternate: HirExpression;
      readonly consequent: HirExpression;
      readonly kind: "conditional";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "logical";
      readonly left: HirExpression;
      readonly operator: LogicalOperator;
      readonly right: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expressions: readonly HirExpression[];
      readonly kind: "sequence";
    })
  | (LocatedSyntax & {
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly kind: "function";
      readonly name: string;
      readonly parameterCount: number;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly kind: "binding";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly kind: "null";
    })
  | (LocatedSyntax & {
      readonly entries: readonly {
        readonly bindingId: number;
        readonly name: string;
      }[];
      readonly kind: "module-namespace";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirExpression[];
      readonly callee: HirExpression;
      readonly kind: "new";
    })
  | (LocatedSyntax & {
      readonly arguments: readonly HirExpression[];
      readonly kind: "promise-construct";
    })
  | (LocatedSyntax & {
      readonly kind: "object";
      readonly properties: readonly {
        readonly key: HirExpression;
        readonly value: HirExpression;
      }[];
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-delete";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-get";
      readonly object: HirExpression;
    })
  | (LocatedSyntax & {
      readonly key: HirExpression;
      readonly kind: "property-set";
      readonly object: HirExpression;
      readonly value: HirExpression;
    })
  | (LocatedSyntax & {
      readonly kind: "number";
      readonly value: number;
    })
  | (LocatedSyntax & {
      readonly kind: "string";
      readonly value: string;
    })
  | (LocatedSyntax & {
      readonly kind: "this";
    })
  | (LocatedSyntax & {
      readonly argument: HirExpression;
      readonly kind: "unary";
      readonly operator: UnaryOperator;
    })
  | (LocatedSyntax & {
      readonly kind: "undefined";
    });

/** A resolved HIR statement with explicit binding identity. */
export type HirStatement =
  | (LocatedSyntax & {
      readonly body: readonly HirStatement[];
      readonly kind: "block";
    })
  | (LocatedSyntax & {
      readonly kind: "break";
    })
  | (LocatedSyntax & {
      readonly kind: "continue";
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "do-while";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly declarations?: readonly HirForDeclaration[];
      readonly init?: HirExpression;
      readonly kind: "for";
      readonly test?: HirExpression;
      readonly update?: HirExpression;
    })
  | (LocatedSyntax & {
      readonly cases: readonly HirSwitchCase[];
      readonly discriminant: HirExpression;
      readonly kind: "switch";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "binding-init";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "const";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly hint: Hint | undefined;
      readonly initializer: HirExpression;
      readonly kind: "let";
      readonly name: string;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "expression";
    })
  | (LocatedSyntax & {
      readonly bindingId: number;
      readonly functionId: number;
      readonly functionKind: FunctionKind;
      readonly functionName: string;
      readonly kind: "function-init";
      readonly name: string;
      readonly parameterCount: number;
    })
  | (LocatedSyntax & {
      readonly alternate: HirStatement | undefined;
      readonly consequent: HirStatement;
      readonly kind: "if";
      readonly test: HirExpression;
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression | undefined;
      readonly kind: "return";
    })
  | (LocatedSyntax & {
      readonly expression: HirExpression;
      readonly kind: "throw";
    })
  | (LocatedSyntax & {
      readonly block: HirStatement;
      readonly handler:
        | {
            readonly bindingId: number;
            readonly body: HirStatement;
            readonly name: string;
            readonly range: SourceRange;
          }
        | undefined;
      readonly finalizer: HirStatement | undefined;
      readonly kind: "try";
    })
  | (LocatedSyntax & {
      readonly body: HirStatement;
      readonly kind: "while";
      readonly test: HirExpression;
    });

/** A resolved function parameter. */
export interface HirParameter extends SyntaxParameter {
  readonly bindingId: number;
}

/** One statically resolved HIR function. */
export interface HirFunction extends LocatedSyntax {
  readonly body: readonly HirStatement[];
  readonly functionKind: FunctionKind;
  readonly id: number;
  readonly kind: "hir-function";
  readonly localBindingIds: readonly number[];
  readonly name: string;
  readonly parameters: readonly HirParameter[];
  readonly returnHints: readonly Hint[];
  readonly selfBindingId?: number;
  readonly strict?: boolean;
}

/** One script environment cell required outside the script statement list. */
export interface HirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** A normalized script and its statically callable functions. */
export interface HirProgram {
  readonly body: readonly HirStatement[];
  readonly functions: readonly HirFunction[];
  readonly globalBindings?: readonly HirGlobalBinding[];
  readonly kind: "hir-program";
  readonly range: SourceRange;
  readonly sourceId: string;
  readonly strict?: boolean;
}

/** Result of profile validation and HIR name resolution. */
export interface HirResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly program?: HirProgram;
}

interface Binding {
  readonly functionId?: number;
  readonly functionNameBinding?: boolean;
  readonly id: number;
  readonly mutable: boolean;
  readonly name: string;
  readonly pendingDeclaration?: boolean;
}

interface ResolveState {
  nextBindingId: number;
  readonly diagnostics: Diagnostic[];
  readonly functionInfo: Map<
    SyntaxFunction,
    { readonly bindingId?: number; readonly id: number }
  >;
  readonly hirFunctions: HirFunction[];
  nextFunctionId: number;
  readonly sourceId: string;
}

function sourceDiagnostic(
  sourceId: string,
  node: LocatedSyntax,
  message: string,
): Diagnostic {
  return {
    byteRange: node.byteRange ?? { end: 0, start: 0 },
    code: "OSEO1001",
    message,
    range: node.range,
    sourceId,
  };
}

function findBinding(
  scopes: readonly Map<string, Binding>[],
  name: string,
): Binding | undefined {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const binding = scopes[index]?.get(name);
    if (binding != null) return binding;
  }
  return undefined;
}

function shadowedMethodTarget(
  binding: Binding,
  key: string,
  range: SourceRange,
): HirCallTarget {
  return {
    key: { kind: "string", range, value: key },
    kind: "method",
    object: {
      bindingId: binding.id,
      kind: "binding",
      name: binding.name,
      range,
    },
  };
}

function inferFunctionName(
  expression: HirExpression,
  name: string,
): HirExpression {
  return expression.kind === "function" && expression.name === ""
    ? { ...expression, name }
    : expression;
}

function resolveExpression(
  expression: SyntaxExpression,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  if (expression.kind === "binding-set") {
    const binding = findBinding(scopes, expression.name);
    const value = resolveExpression(expression.value, scopes, state);
    if (binding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    return value == null
      ? undefined
      : {
          ...expression,
          bindingId: binding.id,
          ...(binding.functionNameBinding === true
            ? { functionNameBinding: true }
            : {}),
          mutable: binding.mutable,
          value: inferFunctionName(value, binding.name),
        };
  }
  if (expression.kind === "array") {
    const elements: (HirExpression | undefined)[] = [];
    for (const element of expression.elements) {
      if (element == null) {
        elements.push(undefined);
        continue;
      }
      const resolved = resolveExpression(element, scopes, state);
      if (resolved == null) return undefined;
      elements.push(resolved);
    }
    return { ...expression, elements };
  }
  if (expression.kind === "await") {
    const argument = resolveExpression(expression.argument, scopes, state);
    return argument == null ? undefined : { ...expression, argument };
  }
  if (
    expression.kind === "boolean" ||
    expression.kind === "null" ||
    expression.kind === "number" ||
    expression.kind === "string" ||
    expression.kind === "this" ||
    expression.kind === "undefined"
  ) {
    return expression;
  }
  if (expression.kind === "function") {
    return resolveFunctionExpression(
      expression.functionValue,
      scopes,
      state,
      expression,
    );
  }
  if (expression.kind === "identifier") {
    const binding = findBinding(scopes, expression.name);
    if (binding == null) {
      if (expression.name === "undefined") {
        return { kind: "undefined", range: expression.range };
      }
      if (expression.name === "NaN" || expression.name === "Infinity") {
        return {
          kind: "number",
          range: expression.range,
          value: expression.name === "NaN" ? NaN : Infinity,
        };
      }
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    return {
      bindingId: binding.id,
      kind: "binding",
      name: expression.name,
      range: expression.range,
    };
  }
  if (expression.kind === "unary") {
    if (
      expression.operator === "typeof" &&
      expression.argument.kind === "identifier" &&
      findBinding(scopes, expression.argument.name) == null &&
      expression.argument.name !== "undefined" &&
      expression.argument.name !== "NaN" &&
      expression.argument.name !== "Infinity"
    ) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          "typeof with an unresolved name is outside the admitted " +
            'profile; ECMAScript would evaluate it to "undefined".',
        ),
      );
      return undefined;
    }
    const argument = resolveExpression(expression.argument, scopes, state);
    if (argument == null) return undefined;
    return { ...expression, argument };
  }
  if (expression.kind === "binary" || expression.kind === "logical") {
    const left = resolveExpression(expression.left, scopes, state);
    const right = resolveExpression(expression.right, scopes, state);
    if (left == null || right == null) return undefined;
    return {
      ...expression,
      left,
      right,
    };
  }
  if (expression.kind === "conditional") {
    const test = resolveExpression(expression.test, scopes, state);
    const consequent = resolveExpression(expression.consequent, scopes, state);
    const alternate = resolveExpression(expression.alternate, scopes, state);
    if (test == null || consequent == null || alternate == null) {
      return undefined;
    }
    return { ...expression, alternate, consequent, test };
  }
  if (expression.kind === "sequence") {
    const expressions: HirExpression[] = [];
    for (const element of expression.expressions) {
      const resolved = resolveExpression(element, scopes, state);
      if (resolved == null) return undefined;
      expressions.push(resolved);
    }
    return { ...expression, expressions };
  }
  if (expression.kind === "object") {
    const properties: {
      readonly key: HirExpression;
      readonly value: HirExpression;
    }[] = [];
    for (const property of expression.properties) {
      const key = resolveExpression(property.key, scopes, state);
      const value = resolveExpression(property.value, scopes, state);
      if (key == null || value == null) return undefined;
      properties.push({
        key,
        value:
          key.kind === "string" ? inferFunctionName(value, key.value) : value,
      });
    }
    return { ...expression, properties };
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    return object == null || key == null
      ? undefined
      : { ...expression, key, object };
  }
  if (expression.kind === "property-set") {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    const value = resolveExpression(expression.value, scopes, state);
    return object == null || key == null || value == null
      ? undefined
      : { ...expression, key, object, value };
  }
  if (expression.kind === "new") {
    const argumentsValue: HirExpression[] = [];
    for (const argument of expression.arguments) {
      const resolved = resolveExpression(argument, scopes, state);
      if (resolved == null) return undefined;
      argumentsValue.push(resolved);
    }
    if (
      expression.callee.kind === "identifier" &&
      expression.callee.name === "Promise" &&
      findBinding(scopes, "Promise") == null
    ) {
      return {
        arguments: argumentsValue,
        kind: "promise-construct",
        range: expression.range,
      };
    }
    const callee = resolveExpression(expression.callee, scopes, state);
    return callee == null
      ? undefined
      : { ...expression, arguments: argumentsValue, callee };
  }
  if (expression.kind === "promise-construct") {
    const argumentsValue: HirExpression[] = [];
    for (const argument of expression.arguments) {
      const resolved = resolveExpression(argument, scopes, state);
      if (resolved == null) return undefined;
      argumentsValue.push(resolved);
    }
    return {
      arguments: argumentsValue,
      kind: "promise-construct",
      range: expression.range,
    };
  }
  const argumentValues: HirExpression[] = [];
  for (const argument of expression.arguments) {
    const resolved = resolveExpression(argument, scopes, state);
    if (resolved == null) return undefined;
    argumentValues.push(resolved);
  }
  let target: HirCallTarget;
  if (expression.target.kind === "console-log") {
    const binding = findBinding(scopes, "console");
    target =
      binding == null
        ? { kind: "console-log" }
        : shadowedMethodTarget(binding, "log", expression.target.range);
  } else if (expression.target.kind === "object-intrinsic") {
    const binding = findBinding(scopes, "Object");
    if (binding != null) {
      target = shadowedMethodTarget(
        binding,
        expression.target.method,
        expression.target.range,
      );
    } else if (
      expression.target.method === "create" &&
      expression.arguments.length > 1
    ) {
      const descriptorMap = expression.arguments[1];
      if (descriptorMap == null) {
        throw new Error("Object.create has no second argument.");
      }
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          descriptorMap,
          "Object.create descriptor maps are unsupported in M3.",
        ),
      );
      return undefined;
    } else {
      target = {
        kind: "object-intrinsic",
        method: expression.target.method,
      };
    }
  } else if (expression.target.kind === "promise-intrinsic-direct") {
    target = {
      kind: "promise-intrinsic",
      method: expression.target.method,
    };
  } else if (expression.target.kind === "promise-intrinsic") {
    const binding = findBinding(scopes, "Promise");
    target =
      binding == null
        ? {
            kind: "promise-intrinsic",
            method: expression.target.method,
          }
        : shadowedMethodTarget(
            binding,
            expression.target.method,
            expression.target.range,
          );
  } else if (expression.target.kind === "timer-intrinsic") {
    const binding = findBinding(scopes, expression.target.method);
    target =
      binding == null
        ? {
            kind: "timer-intrinsic",
            method: expression.target.method,
          }
        : {
            callee: {
              bindingId: binding.id,
              kind: "binding",
              name: binding.name,
              range: expression.target.range,
            },
            kind: "dynamic",
          };
  } else if (expression.target.kind === "name") {
    const callee = resolveExpression(
      {
        kind: "identifier",
        name: expression.target.name,
        range: expression.target.range,
      },
      scopes,
      state,
    );
    if (callee == null) return undefined;
    target = { callee, kind: "dynamic" };
  } else if (expression.target.kind === "dynamic") {
    const callee = resolveExpression(expression.target.callee, scopes, state);
    if (callee == null) return undefined;
    target = { callee, kind: "dynamic" };
  } else {
    const object = resolveExpression(expression.target.object, scopes, state);
    const key = resolveExpression(expression.target.key, scopes, state);
    if (object == null || key == null) return undefined;
    target = { key, kind: "method", object };
  }
  return { ...expression, arguments: argumentValues, target };
}

type SyntaxStatementItem = SyntaxFunction | SyntaxStatement;

function predeclareBindings(
  statements: readonly SyntaxStatementItem[],
  scope: Map<string, Binding>,
  state: ResolveState,
): void {
  for (const statement of statements) {
    if (
      statement.kind !== "const" &&
      statement.kind !== "let" &&
      statement.kind !== "function"
    ) {
      continue;
    }
    const name =
      statement.kind === "function"
        ? (statement.bindingName ?? statement.name)
        : statement.name;
    if (name == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          "A function declaration requires a name.",
        ),
      );
      continue;
    }
    const previous = scope.get(name);
    if (
      previous != null &&
      previous.pendingDeclaration !== true &&
      (statement.kind !== "function" || previous.functionId == null)
    ) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          `Duplicate declaration '${name}'.`,
        ),
      );
      continue;
    }
    if (statement.kind === "function") {
      const functionId = state.nextFunctionId;
      state.nextFunctionId += 1;
      const bindingId = previous?.id ?? state.nextBindingId;
      if (previous == null) state.nextBindingId += 1;
      scope.set(name, {
        functionId,
        id: bindingId,
        mutable: true,
        name,
      });
      state.functionInfo.set(statement, { bindingId, id: functionId });
    } else {
      scope.set(name, {
        id: previous?.id ?? state.nextBindingId,
        mutable: statement.kind === "let",
        name,
      });
      if (previous == null) state.nextBindingId += 1;
    }
  }
}

function resolveStatementList(
  statements: readonly SyntaxStatementItem[],
  parentScopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  existingLocal?: Map<string, Binding>,
  loopDepth = 0,
  breakDepth = 0,
): readonly HirStatement[] {
  const local = existingLocal ?? new Map<string, Binding>();
  if (existingLocal == null) predeclareBindings(statements, local, state);
  const scopes = [...parentScopes, local];
  const result: HirStatement[] = [];
  for (const statement of statements) {
    if (statement.kind !== "function" || statement.name == null) continue;
    const bindingName = statement.bindingName ?? statement.name;
    const info = state.functionInfo.get(statement);
    if (info == null) continue;
    if (local.get(bindingName)?.functionId !== info.id) continue;
    const functionValue = resolveFunction(statement, scopes, state, info.id);
    result.push({
      bindingId: info.bindingId ?? -1,
      functionId: info.id,
      functionKind: functionValue.functionKind,
      functionName: functionValue.name,
      kind: "function-init",
      name: bindingName,
      parameterCount: functionValue.parameters.length,
      range: statement.range,
    });
  }
  for (const statement of statements) {
    if (statement.kind === "function") continue;
    const resolved = resolveStatement(
      statement,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    if (resolved != null) result.push(resolved);
  }
  return result;
}

function resolveFunction(
  functionValue: SyntaxFunction,
  outerScopes: readonly Map<string, Binding>[],
  state: ResolveState,
  id: number,
  selfBinding?: Binding,
): HirFunction {
  const parameterScope = new Map<string, Binding>();
  const parameters: HirParameter[] = [];
  for (const parameter of functionValue.parameters) {
    let binding = parameterScope.get(parameter.name);
    if (binding == null) {
      binding = {
        id: state.nextBindingId,
        mutable: true,
        name: parameter.name,
      };
      state.nextBindingId += 1;
      parameterScope.set(parameter.name, binding);
    }
    parameters.push({ ...parameter, bindingId: binding.id });
  }
  const bodyScope = new Map<string, Binding>();
  predeclareBindings(functionValue.body, bodyScope, state);
  const body = resolveStatementList(
    functionValue.body,
    [
      ...outerScopes,
      ...(selfBinding == null
        ? []
        : [new Map([[selfBinding.name, selfBinding]])]),
      parameterScope,
    ],
    state,
    true,
    bodyScope,
  );
  const resolved: HirFunction = {
    ...functionValue,
    body,
    functionKind: functionValue.functionKind ?? "ordinary",
    id,
    kind: "hir-function",
    localBindingIds: [
      ...new Set([
        ...Array.from(parameterScope.values(), (binding) => binding.id),
        ...(selfBinding == null ? [] : [selfBinding.id]),
        ...declaredHirBindingIds(body),
      ]),
    ],
    name: functionValue.name ?? `<anonymous-${id}>`,
    parameters,
    ...(selfBinding == null ? {} : { selfBindingId: selfBinding.id }),
  };
  state.hirFunctions.push(resolved);
  return resolved;
}

function declaredHirBindingIds(
  statements: readonly HirStatement[],
): readonly number[] {
  const result: number[] = [];
  for (const statement of statements) {
    if (
      statement.kind === "const" ||
      statement.kind === "let" ||
      statement.kind === "function-init"
    ) {
      result.push(statement.bindingId);
    } else if (statement.kind === "block") {
      result.push(...declaredHirBindingIds(statement.body));
    } else if (statement.kind === "if") {
      result.push(...declaredHirBindingIds([statement.consequent]));
      if (statement.alternate != null) {
        result.push(...declaredHirBindingIds([statement.alternate]));
      }
    } else if (statement.kind === "while" || statement.kind === "do-while") {
      result.push(...declaredHirBindingIds([statement.body]));
    } else if (statement.kind === "for") {
      for (const declaration of statement.declarations ?? []) {
        result.push(declaration.bindingId);
      }
      result.push(...declaredHirBindingIds([statement.body]));
    } else if (statement.kind === "switch") {
      for (const switchCase of statement.cases) {
        result.push(...declaredHirBindingIds(switchCase.body));
      }
    } else if (statement.kind === "try") {
      result.push(...declaredHirBindingIds([statement.block]));
      if (statement.handler != null) {
        result.push(statement.handler.bindingId);
        result.push(...declaredHirBindingIds([statement.handler.body]));
      }
      if (statement.finalizer != null) {
        result.push(...declaredHirBindingIds([statement.finalizer]));
      }
    }
  }
  return result;
}

function resolveFunctionExpression(
  functionValue: SyntaxFunction,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  expression: LocatedSyntax & { readonly inferredName?: string },
): HirExpression {
  const id = state.nextFunctionId;
  state.nextFunctionId += 1;
  state.functionInfo.set(functionValue, { id });
  const selfBinding =
    functionValue.name == null
      ? undefined
      : {
          functionNameBinding: true,
          id: state.nextBindingId,
          mutable: false,
          name: functionValue.name,
        };
  if (selfBinding != null) state.nextBindingId += 1;
  const resolved = resolveFunction(
    functionValue,
    scopes,
    state,
    id,
    selfBinding,
  );
  return {
    functionId: id,
    functionKind: resolved.functionKind,
    kind: "function",
    name: expression.inferredName ?? functionValue.name ?? "",
    parameterCount: resolved.parameters.length,
    range: expression.range,
  };
}

function resolveStatement(
  statement: SyntaxStatement,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  loopDepth = 0,
  breakDepth = 0,
): HirStatement | undefined {
  if (
    statement.kind === "binding-init" ||
    statement.kind === "const" ||
    statement.kind === "let"
  ) {
    const initializer = resolveExpression(statement.initializer, scopes, state);
    const binding =
      statement.kind === "binding-init"
        ? findBinding(scopes, statement.name)
        : scopes.at(-1)?.get(statement.name);
    if (binding == null || initializer == null) return undefined;
    return {
      ...statement,
      bindingId: binding.id,
      initializer: inferFunctionName(initializer, binding.name),
    };
  }
  if (statement.kind === "expression") {
    const expression = resolveExpression(statement.expression, scopes, state);
    return expression == null ? undefined : { ...statement, expression };
  }
  if (statement.kind === "return") {
    if (!functionBody) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          "A return statement is only valid inside a function.",
        ),
      );
      return undefined;
    }
    const expression =
      statement.expression == null
        ? undefined
        : resolveExpression(statement.expression, scopes, state);
    if (statement.expression != null && expression == null) return undefined;
    return { ...statement, expression };
  }
  if (statement.kind === "throw") {
    const expression = resolveExpression(statement.expression, scopes, state);
    return expression == null ? undefined : { ...statement, expression };
  }
  if (statement.kind === "try") {
    const block = resolveStatement(
      statement.block,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    let handler:
      | {
          readonly bindingId: number;
          readonly body: HirStatement;
          readonly name: string;
          readonly range: SourceRange;
        }
      | undefined;
    if (statement.handler != null) {
      const binding: Binding = {
        id: state.nextBindingId,
        mutable: true,
        name: statement.handler.name,
      };
      state.nextBindingId += 1;
      const catchScope = new Map([[statement.handler.name, binding]]);
      const body = resolveStatement(
        statement.handler.body,
        [...scopes, catchScope],
        state,
        functionBody,
        loopDepth,
        breakDepth,
      );
      if (body == null) return undefined;
      handler = {
        bindingId: binding.id,
        body,
        name: statement.handler.name,
        range: statement.handler.range,
      };
    }
    const finalizer =
      statement.finalizer == null
        ? undefined
        : resolveStatement(
            statement.finalizer,
            scopes,
            state,
            functionBody,
            loopDepth,
            breakDepth,
          );
    if (block == null || (statement.finalizer != null && finalizer == null)) {
      return undefined;
    }
    return { ...statement, block, finalizer, handler };
  }
  if (statement.kind === "break" || statement.kind === "continue") {
    const valid = statement.kind === "break" ? breakDepth > 0 : loopDepth > 0;
    if (!valid) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          statement.kind === "break"
            ? "A break statement requires an enclosing loop or switch."
            : "A continue statement requires an enclosing loop.",
        ),
      );
      return undefined;
    }
    return statement;
  }
  if (statement.kind === "block") {
    return {
      ...statement,
      body: resolveStatementList(
        statement.body,
        scopes,
        state,
        functionBody,
        undefined,
        loopDepth,
        breakDepth,
      ),
    };
  }
  if (statement.kind === "while") {
    const test = resolveExpression(statement.test, scopes, state);
    const body = resolveStatement(
      statement.body,
      scopes,
      state,
      functionBody,
      loopDepth + 1,
      breakDepth + 1,
    );
    return test == null || body == null
      ? undefined
      : { ...statement, body, test };
  }
  if (statement.kind === "do-while") {
    const body = resolveStatement(
      statement.body,
      scopes,
      state,
      functionBody,
      loopDepth + 1,
      breakDepth + 1,
    );
    const test = resolveExpression(statement.test, scopes, state);
    return body == null || test == null
      ? undefined
      : { ...statement, body, test };
  }
  if (statement.kind === "for") {
    const forScope = new Map<string, Binding>();
    const forScopes = [...scopes, forScope];
    let declarations: HirForDeclaration[] | undefined;
    let init: HirExpression | undefined;
    if (statement.declarations != null) {
      for (const declaration of statement.declarations) {
        if (forScope.has(declaration.name)) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement,
              `Duplicate declaration '${declaration.name}'.`,
            ),
          );
          return undefined;
        }
        forScope.set(declaration.name, {
          id: state.nextBindingId,
          mutable: declaration.mutable,
          name: declaration.name,
        });
        state.nextBindingId += 1;
      }
      declarations = [];
      for (const declaration of statement.declarations) {
        const binding = forScope.get(declaration.name);
        const initializer = resolveExpression(
          declaration.initializer,
          forScopes,
          state,
        );
        if (binding == null || initializer == null) return undefined;
        declarations.push({
          bindingId: binding.id,
          hint: declaration.hint,
          initializer: inferFunctionName(initializer, declaration.name),
          mutable: declaration.mutable,
          name: declaration.name,
          range: declaration.range,
        });
      }
    } else if (statement.init != null) {
      init = resolveExpression(statement.init, scopes, state);
      if (init == null) return undefined;
    }
    const test =
      statement.test == null
        ? undefined
        : resolveExpression(statement.test, forScopes, state);
    if (statement.test != null && test == null) return undefined;
    const update =
      statement.update == null
        ? undefined
        : resolveExpression(statement.update, forScopes, state);
    if (statement.update != null && update == null) return undefined;
    const body = resolveStatement(
      statement.body,
      forScopes,
      state,
      functionBody,
      loopDepth + 1,
      breakDepth + 1,
    );
    if (body == null) return undefined;
    return {
      ...(statement.byteRange == null
        ? {}
        : { byteRange: statement.byteRange }),
      body,
      ...(declarations == null ? {} : { declarations }),
      ...(init == null ? {} : { init }),
      kind: "for",
      range: statement.range,
      ...(test == null ? {} : { test }),
      ...(update == null ? {} : { update }),
    };
  }
  if (statement.kind === "switch") {
    const discriminant = resolveExpression(
      statement.discriminant,
      scopes,
      state,
    );
    if (discriminant == null) return undefined;
    // One case-block scope covers every clause, so lexical declarations
    // are shared across clauses and read before their clause runs stay
    // runtime TDZ errors.
    const caseScope = new Map<string, Binding>();
    const caseStatements = statement.cases.flatMap(
      (switchCase) => switchCase.body,
    );
    predeclareBindings(caseStatements, caseScope, state);
    const caseScopes = [...scopes, caseScope];
    let sawDefault = false;
    const cases: HirSwitchCase[] = [];
    for (const switchCase of statement.cases) {
      if (switchCase.test == null) {
        if (sawDefault) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement,
              "A switch statement allows one default clause.",
            ),
          );
          return undefined;
        }
        sawDefault = true;
      }
      const test =
        switchCase.test == null
          ? undefined
          : resolveExpression(switchCase.test, caseScopes, state);
      if (switchCase.test != null && test == null) return undefined;
      const body: HirStatement[] = [];
      for (const child of switchCase.body) {
        const resolved = resolveStatement(
          child,
          caseScopes,
          state,
          functionBody,
          loopDepth,
          breakDepth + 1,
        );
        if (resolved == null) return undefined;
        body.push(resolved);
      }
      cases.push({
        body,
        range: switchCase.range,
        ...(test == null ? {} : { test }),
      });
    }
    return { ...statement, cases, discriminant };
  }
  const test = resolveExpression(statement.test, scopes, state);
  const consequent = resolveStatement(
    statement.consequent,
    scopes,
    state,
    functionBody,
    loopDepth,
    breakDepth,
  );
  const alternate =
    statement.alternate == null
      ? undefined
      : resolveStatement(
          statement.alternate,
          scopes,
          state,
          functionBody,
          loopDepth,
          breakDepth,
        );
  if (test == null || consequent == null) return undefined;
  if (statement.alternate != null && alternate == null) return undefined;
  return { ...statement, alternate, consequent, test };
}

interface HirSeed {
  readonly bindings?: ReadonlyMap<string, Binding>;
  readonly nextBindingId?: number;
  readonly nextFunctionId?: number;
}

interface SeededHirResult extends HirResult {
  readonly nextBindingId: number;
  readonly nextFunctionId: number;
}

function buildSeededHir(
  program: SyntaxProgram,
  seed: HirSeed = {},
): SeededHirResult {
  const diagnostics: Diagnostic[] = [];
  const state: ResolveState = {
    diagnostics,
    functionInfo: new Map(),
    hirFunctions: [],
    nextBindingId: seed.nextBindingId ?? 0,
    nextFunctionId: seed.nextFunctionId ?? 0,
    sourceId: program.sourceId,
  };
  const scriptScope = new Map(seed.bindings);
  predeclareBindings(program.body, scriptScope, state);
  const body = resolveStatementList(
    program.body,
    [],
    state,
    false,
    scriptScope,
  );
  if (diagnostics.length > 0) {
    return {
      diagnostics,
      nextBindingId: state.nextBindingId,
      nextFunctionId: state.nextFunctionId,
    };
  }
  return {
    diagnostics,
    nextBindingId: state.nextBindingId,
    nextFunctionId: state.nextFunctionId,
    program: {
      body,
      functions: state.hirFunctions,
      kind: "hir-program",
      range: program.range,
      sourceId: program.sourceId,
      strict: program.strict === true,
    },
  };
}

/** Validate owned syntax and resolve all lexical and function identities. */
export function buildHir(program: SyntaxProgram): HirResult {
  return buildSeededHir(program);
}

function rangeText(range: SourceRange): string {
  return (
    `${range.start.line}:${range.start.column}-` +
    `${range.end.line}:${range.end.column}`
  );
}

function hintText(hints: readonly Hint[]): string {
  if (hints.length === 0) return "";
  return ` hints=[${hints
    .map((hint) => `${hint.provenance}:${hint.name}`)
    .join(",")}]`;
}

function numberText(value: number): string {
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function printHirExpression(expression: HirExpression): string {
  if (expression.kind === "binding-set") {
    return (
      `%b${expression.bindingId} ${expression.name} = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "array") {
    return (
      "[" +
      expression.elements
        .map((element) =>
          element == null ? "<hole>" : printHirExpression(element),
        )
        .join(", ") +
      "]"
    );
  }
  if (expression.kind === "binding") {
    return `%b${expression.bindingId}(${expression.name})`;
  }
  if (expression.kind === "function") {
    return `function @f${expression.functionId} ${expression.name}`;
  }
  if (expression.kind === "this") return "this";
  if (expression.kind === "undefined" || expression.kind === "null") {
    return expression.kind;
  }
  if (expression.kind === "string") return JSON.stringify(expression.value);
  if (expression.kind === "number") return numberText(expression.value);
  if (expression.kind === "boolean") return String(expression.value);
  if (expression.kind === "unary") {
    const spacing = expression.operator.length > 1 ? " " : "";
    return (
      `(${expression.operator}${spacing}` +
      `${printHirExpression(expression.argument)})`
    );
  }
  if (expression.kind === "binary" || expression.kind === "logical") {
    const left = printHirExpression(expression.left);
    const operator = String(expression.operator);
    const right = printHirExpression(expression.right);
    return `(${left} ${operator} ${right})`;
  }
  if (expression.kind === "conditional") {
    const test = printHirExpression(expression.test);
    const consequent = printHirExpression(expression.consequent);
    const alternate = printHirExpression(expression.alternate);
    return `(${test} ? ${consequent} : ${alternate})`;
  }
  if (expression.kind === "sequence") {
    return `(${expression.expressions.map(printHirExpression).join(", ")})`;
  }
  if (expression.kind === "object") {
    return (
      "object{" +
      expression.properties
        .map(
          (property) =>
            `${printHirExpression(property.key)}: ` +
            printHirExpression(property.value),
        )
        .join(", ") +
      "}"
    );
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const operation = expression.kind === "property-get" ? "get" : "delete";
    return (
      `${operation} ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}]`
    );
  }
  if (expression.kind === "property-set") {
    return (
      `set ${printHirExpression(expression.object)}[` +
      `${printHirExpression(expression.key)}] = ` +
      printHirExpression(expression.value)
    );
  }
  if (expression.kind === "module-namespace") {
    return `module-namespace {${expression.entries
      .map((entry) => `${JSON.stringify(entry.name)}: %b${entry.bindingId}`)
      .join(", ")}}`;
  }
  if (expression.kind === "await") {
    return `await ${printHirExpression(expression.argument)}`;
  }
  if (expression.kind === "new") {
    return (
      `new ${printHirExpression(expression.callee)}(` +
      expression.arguments.map(printHirExpression).join(", ") +
      ")"
    );
  }
  if (expression.kind === "promise-construct") {
    return (
      "new intrinsic Promise(" +
      expression.arguments.map(printHirExpression).join(", ") +
      ")"
    );
  }
  const target =
    expression.target.kind === "console-log"
      ? "intrinsic console.log"
      : expression.target.kind === "object-intrinsic"
        ? `intrinsic Object.${expression.target.method}`
        : expression.target.kind === "promise-intrinsic"
          ? `intrinsic Promise.${expression.target.method}`
          : expression.target.kind === "timer-intrinsic"
            ? `intrinsic ${expression.target.method}`
            : expression.target.kind === "dynamic"
              ? printHirExpression(expression.target.callee)
              : `${printHirExpression(expression.target.object)}[` +
                `${printHirExpression(expression.target.key)}]`;
  return (
    `call ${target}(` +
    expression.arguments.map(printHirExpression).join(", ") +
    ")"
  );
}

function appendHirStatement(
  lines: string[],
  statement: HirStatement,
  indent: string,
): void {
  const location = ` @${rangeText(statement.range)}`;
  if (
    statement.kind === "binding-init" ||
    statement.kind === "const" ||
    statement.kind === "let"
  ) {
    lines.push(
      `${indent}${statement.kind} %b${statement.bindingId} ${statement.name}` +
        `${hintText(statement.hint == null ? [] : [statement.hint])} = ` +
        `${printHirExpression(statement.initializer)}${location}`,
    );
  } else if (statement.kind === "expression") {
    lines.push(
      `${indent}${printHirExpression(statement.expression)}${location}`,
    );
  } else if (statement.kind === "function-init") {
    lines.push(
      `${indent}function-init %b${statement.bindingId} ${statement.name} ` +
        `= @f${statement.functionId}${location}`,
    );
  } else if (statement.kind === "return") {
    const value =
      statement.expression == null
        ? "undefined"
        : printHirExpression(statement.expression);
    lines.push(`${indent}return ${value}${location}`);
  } else if (statement.kind === "throw") {
    lines.push(
      `${indent}throw ${printHirExpression(statement.expression)}${location}`,
    );
  } else if (statement.kind === "try") {
    lines.push(`${indent}try${location}`);
    appendHirStatement(lines, statement.block, `${indent}  `);
    if (statement.handler != null) {
      lines.push(
        `${indent}catch %b${statement.handler.bindingId} ` +
          `${statement.handler.name}`,
      );
      appendHirStatement(lines, statement.handler.body, `${indent}  `);
    }
    if (statement.finalizer != null) {
      lines.push(`${indent}finally`);
      appendHirStatement(lines, statement.finalizer, `${indent}  `);
    }
  } else if (statement.kind === "block") {
    lines.push(`${indent}block${location}`);
    for (const child of statement.body) {
      appendHirStatement(lines, child, `${indent}  `);
    }
  } else if (statement.kind === "break" || statement.kind === "continue") {
    lines.push(`${indent}${statement.kind}${location}`);
  } else if (statement.kind === "while") {
    lines.push(
      `${indent}while ${printHirExpression(statement.test)}${location}`,
    );
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "do-while") {
    lines.push(`${indent}do${location}`);
    appendHirStatement(lines, statement.body, `${indent}  `);
    lines.push(`${indent}while ${printHirExpression(statement.test)}`);
  } else if (statement.kind === "for") {
    const head = [
      statement.declarations == null
        ? statement.init == null
          ? ""
          : printHirExpression(statement.init)
        : statement.declarations
            .map(
              (declaration) =>
                `${declaration.mutable ? "let" : "const"} ` +
                `%b${declaration.bindingId} ${declaration.name} = ` +
                printHirExpression(declaration.initializer),
            )
            .join(", "),
      statement.test == null ? "" : printHirExpression(statement.test),
      statement.update == null ? "" : printHirExpression(statement.update),
    ].join("; ");
    lines.push(`${indent}for (${head})${location}`);
    appendHirStatement(lines, statement.body, `${indent}  `);
  } else if (statement.kind === "switch") {
    lines.push(
      `${indent}switch ${printHirExpression(statement.discriminant)}` +
        location,
    );
    for (const switchCase of statement.cases) {
      lines.push(
        switchCase.test == null
          ? `${indent}  default:`
          : `${indent}  case ${printHirExpression(switchCase.test)}:`,
      );
      for (const child of switchCase.body) {
        appendHirStatement(lines, child, `${indent}    `);
      }
    }
  } else {
    lines.push(`${indent}if ${printHirExpression(statement.test)}${location}`);
    appendHirStatement(lines, statement.consequent, `${indent}  `);
    if (statement.alternate != null) {
      lines.push(`${indent}else`);
      appendHirStatement(lines, statement.alternate, `${indent}  `);
    }
  }
}

/** Print deterministic, source-located HIR for review and snapshots. */
export function printHir(program: HirProgram): string {
  const lines = [`hir ${JSON.stringify(program.sourceId)}`];
  for (const functionValue of program.functions) {
    const parameters = functionValue.parameters
      .map(
        (parameter) =>
          `%b${parameter.bindingId} ${parameter.name}` +
          hintText(parameter.hints),
      )
      .join(", ");
    lines.push(
      `function @f${functionValue.id} ${functionValue.name}(${parameters})` +
        `${hintText(functionValue.returnHints)} ` +
        `@${rangeText(functionValue.range)}`,
    );
    for (const statement of functionValue.body) {
      appendHirStatement(lines, statement, "  ");
    }
  }
  lines.push(`script @${rangeText(program.range)}`);
  for (const statement of program.body) {
    appendHirStatement(lines, statement, "  ");
  }
  return `${lines.join("\n")}\n`;
}

/** A primitive constant retained without lossy textual serialization. */
export type MirConstant =
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "undefined" };

/** A direct call target independent of HIR and source syntax. */
export type MirCallTarget =
  | { readonly kind: "await" }
  | { readonly kind: "console-log" }
  | { readonly kind: "dynamic" }
  | {
      readonly kind: "object-intrinsic";
      readonly method:
        | "create"
        | "defineProperty"
        | "getOwnPropertyDescriptor"
        | "keys"
        | "setPrototypeOf";
    }
  | { readonly kind: "promise-constructor" }
  | {
      readonly kind: "promise-intrinsic";
      readonly method:
        | "all"
        | "asyncCall"
        | "awaitThen"
        | "race"
        | "reject"
        | "resolve"
        | "then";
    }
  | {
      readonly kind: "timer-intrinsic";
      readonly method: "clearTimeout" | "setTimeout";
    }
  | { readonly functionId: number; readonly kind: "function" };

/** Hint data copied into MIR without retaining a HIR or syntax object. */
export interface MirHint {
  readonly name: HintName;
  readonly provenance: HintProvenance;
  readonly range: SourceRange;
}

/** Compiler-owned policy for removable guarded specialization. */
export type SpecializationMode = "disabled" | "enabled";

/** Explicit compiler orchestration options, independent of process globals. */
export interface CompilerOptions {
  readonly observeSpecialization?: boolean;
  readonly specialization?: SpecializationMode;
}

/** One MIR-owned function parameter and its specialization hints. */
export interface MirParameter {
  readonly bindingId: number;
  readonly hints: readonly MirHint[];
  readonly name: string;
  readonly range: SourceRange;
}

/** One script-owned lexical binding shared by declared functions. */
export interface MirGlobalBinding {
  readonly id: number;
  readonly name: string;
}

/** One inspectable backend-neutral MIR operation. */
export interface MirOperation {
  readonly arguments: readonly number[];
  readonly arrayLength?: number;
  readonly bindingId?: number;
  readonly cacheId?: number;
  readonly constant?: MirConstant;
  readonly detail: string;
  readonly id: number;
  readonly kind:
    | "add-smi-checked"
    | "array-create"
    | "binary"
    | "binding-reset"
    | "box-smi"
    | "branch"
    | "call"
    | "check-status"
    | "constant"
    | "caught"
    | "completion-set"
    | "construct"
    | "construct-receiver"
    | "count-guard-hit"
    | "count-guard-miss"
    | "count-overflow-miss"
    | "function-create"
    | "guard-object"
    | "guard-shape"
    | "guard-smi"
    | "initialize"
    | "join"
    | "load-fixed-slot"
    | "module-namespace-create"
    | "object-create"
    | "property-key"
    | "property-delete"
    | "property-get"
    | "property-set"
    | "read"
    | "receiver"
    | "root-store"
    | "safepoint"
    | "unbox-smi"
    | "unary"
    | "update-property-cache"
    | "write";
  readonly mutable?: boolean;
  readonly namespaceBindingIds?: readonly number[];
  readonly namespaceNames?: readonly string[];
  readonly checkedResult?: number;
  readonly abruptTarget?: number;
  readonly completionKind?: "jump" | "normal" | "return" | "throw";
  readonly completionSlot?: number;
  readonly completionTarget?: number;
  readonly functionId?: number;
  readonly functionKind?: FunctionKind;
  readonly functionLength?: number;
  readonly functionName?: string;
  readonly functionNameBinding?: boolean;
  readonly hint?: MirHint;
  readonly operator?: BinaryOperator | UnaryOperator;
  readonly range: SourceRange;
  readonly target?: MirCallTarget;
}

/** A MIR block terminator. */
export type MirTerminator =
  | {
      readonly kind: "branch";
      readonly test: number;
      readonly whenFalse: number;
      readonly whenTrue: number;
    }
  | {
      readonly kind: "jump";
      readonly target: number;
      readonly values?: readonly number[];
    }
  | {
      readonly kind: "return";
      readonly value: number;
    }
  | {
      readonly completionSlot: number;
      readonly kind: "resume-completion";
      readonly outerAbrupt?: number;
      readonly outerFinalizer?: number;
    }
  | {
      readonly kind: "unreachable";
    };

/** One deterministic control-flow block. */
export interface MirBlock {
  readonly id: number;
  readonly operations: readonly MirOperation[];
  readonly parameters?: readonly number[];
  readonly terminator: MirTerminator;
}

/** Inspectable identity and control-flow anchors for one specialization. */
export interface MirSpecialization {
  readonly genericBlock: number;
  readonly hints: readonly MirHint[];
  readonly joinBlock: number;
  readonly kind: "smi-add";
  readonly range: SourceRange;
}

/** MIR for one declared function or script. */
export interface MirFunction extends LocatedSyntax {
  readonly blocks: readonly MirBlock[];
  readonly id: number;
  readonly kind: "mir-function";
  readonly localBindingIds?: readonly number[];
  readonly name: string;
  readonly parameterCount: number;
  readonly parameters: readonly MirParameter[];
  readonly rootSlotCount: number;
  readonly selfBindingId?: number;
  readonly specialization?: MirSpecialization;
  readonly strict?: boolean;
}

/** Backend-neutral MIR for one source script. */
export interface MirProgram {
  readonly functions: readonly MirFunction[];
  readonly globalBindings: readonly MirGlobalBinding[];
  readonly kind: "mir-program";
  readonly script: MirFunction;
  readonly sourceId: string;
  readonly specialization: SpecializationMode;
  readonly observeSpecialization: boolean;
}

interface MutableMirBlock {
  readonly id: number;
  readonly operations: MirOperation[];
  parameters?: number[];
  terminator: MirTerminator | undefined;
}

interface MirBuilder {
  readonly abruptTargets: number[];
  readonly blocks: MutableMirBlock[];
  readonly loops: {
    readonly breakTarget: number;
    readonly continueTarget: number;
  }[];
  readonly finalizers: number[];
  current: MutableMirBlock;
  nextValue: number;
  readonly specialization: SpecializationMode;
}

function appendMirMetadata(
  builder: MirBuilder,
  kind: MirOperation["kind"],
  detail: string,
  argumentsValue: readonly number[],
  range: SourceRange,
  extra: Partial<MirOperation> = {},
): void {
  const id = builder.nextValue;
  builder.nextValue += 1;
  const abruptTarget = builder.abruptTargets.at(-1);
  builder.current.operations.push({
    arguments: argumentsValue,
    detail,
    id,
    kind,
    range,
    ...(kind === "check-status" && abruptTarget != null
      ? { abruptTarget }
      : {}),
    ...extra,
  });
}

function recordRoot(
  builder: MirBuilder,
  value: number,
  range: SourceRange,
): number {
  appendMirMetadata(builder, "root-store", `slot %${value}`, [value], range);
  return value;
}

function lowerPropertyKey(
  expression: HirExpression,
  builder: MirBuilder,
): number {
  const input = lowerExpression(expression, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "primitive property-key conversion",
    [input],
    expression.range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "ToPropertyKey for admitted primitives",
    id,
    kind: "property-key",
    range: expression.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    expression.range,
  );
  return recordRoot(builder, id, expression.range);
}

function lowerSpecializedPropertyGet(
  object: number,
  keyExpression: HirExpression,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const shapeBlock = createMirBlock(builder);
  const hitBlock = createMirBlock(builder);
  const genericBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);

  const objectGuard = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object],
    detail: `object -> bb${shapeBlock.id}, miss -> bb${genericBlock.id}`,
    id: objectGuard,
    kind: "guard-object",
    range,
  });
  builder.current.terminator = {
    kind: "branch",
    test: objectGuard,
    whenFalse: genericBlock.id,
    whenTrue: shapeBlock.id,
  };

  builder.current = shapeBlock;
  const shapeGuard = builder.nextValue;
  builder.nextValue += 1;
  shapeBlock.operations.push({
    arguments: [object],
    cacheId: shapeGuard,
    detail: `cached slot -> bb${hitBlock.id}, miss -> bb${genericBlock.id}`,
    id: shapeGuard,
    kind: "guard-shape",
    range,
  });
  shapeBlock.terminator = {
    kind: "branch",
    test: shapeGuard,
    whenFalse: genericBlock.id,
    whenTrue: hitBlock.id,
  };

  builder.current = hitBlock;
  appendMirMetadata(builder, "count-guard-hit", "property read", [], range);
  const hitValue = builder.nextValue;
  builder.nextValue += 1;
  hitBlock.operations.push({
    arguments: [object],
    cacheId: shapeGuard,
    detail: "cached own-property slot",
    id: hitValue,
    kind: "load-fixed-slot",
    range,
  });
  recordRoot(builder, hitValue, range);
  hitBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [hitValue],
  };

  builder.current = genericBlock;
  appendMirMetadata(builder, "count-guard-miss", "property read", [], range);
  const key = lowerPropertyKey(keyExpression, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "generic property lookup",
    [object, key],
    range,
  );
  const genericValue = builder.nextValue;
  builder.nextValue += 1;
  genericBlock.operations.push({
    arguments: [object, key],
    detail: "generic",
    id: genericValue,
    kind: "property-get",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [genericValue],
    range,
  );
  recordRoot(builder, genericValue, range);
  appendMirMetadata(
    builder,
    "update-property-cache",
    "relearn stable own slot",
    [object, key],
    range,
    { cacheId: shapeGuard },
  );
  genericBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [genericValue],
  };

  builder.current = joinBlock;
  const joinValue = builder.nextValue;
  builder.nextValue += 1;
  const joinMarker = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.operations.push({
    arguments: [hitValue, genericValue],
    detail: `property read bb${hitBlock.id} + bb${genericBlock.id}`,
    id: joinMarker,
    kind: "join",
    range,
  });
  joinBlock.parameters = [joinValue];
  return joinValue;
}

function lowerExpression(
  expression: HirExpression,
  builder: MirBuilder,
  inferredFunctionName?: number,
): number {
  if (expression.kind === "module-namespace") {
    appendMirMetadata(
      builder,
      "safepoint",
      "module namespace allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: `${expression.entries.length} live exports`,
      id,
      kind: "module-namespace-create",
      namespaceBindingIds: expression.entries.map((entry) => entry.bindingId),
      namespaceNames: expression.entries.map((entry) => entry.name),
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "binding-set") {
    const value = lowerExpression(expression.value, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "binding assignment error",
      [value],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value],
      bindingId: expression.bindingId,
      detail: `%b${expression.bindingId} ${expression.name}`,
      ...(expression.functionNameBinding === true
        ? { functionNameBinding: true }
        : {}),
      id,
      kind: "write",
      mutable: expression.mutable,
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "function") {
    appendMirMetadata(
      builder,
      "safepoint",
      "function allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: inferredFunctionName == null ? [] : [inferredFunctionName],
      detail:
        `function @f${expression.functionId} ` +
        `name=${JSON.stringify(expression.name)} ` +
        `length=${expression.parameterCount}`,
      functionId: expression.functionId,
      functionKind: expression.functionKind,
      functionLength: expression.parameterCount,
      functionName: expression.name,
      id,
      kind: "function-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "this") {
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "this",
      id,
      kind: "receiver",
      range: expression.range,
    });
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "array") {
    appendMirMetadata(
      builder,
      "safepoint",
      "array allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      arrayLength: expression.elements.length,
      detail: `array length ${expression.elements.length}`,
      id,
      kind: "array-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    recordRoot(builder, id, expression.range);
    for (let index = 0; index < expression.elements.length; index += 1) {
      const element = expression.elements[index];
      if (element == null) continue;
      const keyExpression: HirExpression = {
        kind: "string",
        range: element.range,
        value: String(index),
      };
      const key = lowerPropertyKey(keyExpression, builder);
      const value = lowerExpression(element, builder);
      appendMirMetadata(
        builder,
        "safepoint",
        "array property storage growth",
        [id, key, value],
        expression.range,
      );
      const result = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [id, key, value],
        detail: `array element ${index}`,
        id: result,
        kind: "property-set",
        range: element.range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [result],
        element.range,
      );
      recordRoot(builder, result, element.range);
    }
    return id;
  }
  if (expression.kind === "await") {
    const argument = lowerExpression(expression.argument, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "top-level await checkpoint",
      [argument],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [argument],
      detail: "top-level await",
      id,
      kind: "call",
      range: expression.range,
      target: { kind: "await" },
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "binding") {
    appendMirMetadata(
      builder,
      "safepoint",
      "binding read error",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      bindingId: expression.bindingId,
      detail: expression.name,
      id,
      kind: "read",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (
    expression.kind === "undefined" ||
    expression.kind === "null" ||
    expression.kind === "boolean" ||
    expression.kind === "number" ||
    expression.kind === "string"
  ) {
    if (expression.kind === "string") {
      appendMirMetadata(
        builder,
        "safepoint",
        "string allocation",
        [],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    let constant: MirConstant;
    if (expression.kind === "undefined") {
      constant = { kind: "undefined" };
    } else if (expression.kind === "null") {
      constant = { kind: "null" };
    } else if (expression.kind === "boolean") {
      constant = { kind: "boolean", value: expression.value };
    } else if (expression.kind === "number") {
      constant = { kind: "number", value: expression.value };
    } else {
      constant = { kind: "string", value: expression.value };
    }
    const detail =
      constant.kind === "undefined" || constant.kind === "null"
        ? constant.kind
        : constant.kind === "number"
          ? numberText(constant.value)
          : JSON.stringify(constant.value);
    builder.current.operations.push({
      arguments: [],
      constant,
      detail,
      id,
      kind: "constant",
      range: expression.range,
    });
    if (expression.kind === "string") {
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [id],
        expression.range,
      );
    }
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "unary") {
    const argument = lowerExpression(expression.argument, builder);
    if (expression.operator === "typeof") {
      appendMirMetadata(
        builder,
        "safepoint",
        "typeof string allocation",
        [argument],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [argument],
      detail: expression.operator,
      id,
      kind: "unary",
      operator: expression.operator,
      range: expression.range,
    });
    if (expression.operator !== "!" && expression.operator !== "void") {
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [id],
        expression.range,
      );
    }
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "logical") {
    const left = lowerExpression(expression.left, builder);
    const rightBlock = createMirBlock(builder);
    const shortBlock = createMirBlock(builder);
    const joinBlock = createMirBlock(builder);
    const result = builder.nextValue;
    builder.nextValue += 1;
    joinBlock.parameters = [result];
    if (expression.operator === "??") {
      const nullishTest = (constant: MirConstant): number => {
        const constantId = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [],
          constant,
          detail: constant.kind,
          id: constantId,
          kind: "constant",
          range: expression.range,
        });
        const testId = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [left, constantId],
          detail: "===",
          id: testId,
          kind: "binary",
          operator: "===",
          range: expression.range,
        });
        appendMirMetadata(
          builder,
          "check-status",
          "normal -> continue, abrupt -> return",
          [testId],
          expression.range,
        );
        return testId;
      };
      const undefinedBlock = createMirBlock(builder);
      const isNull = nullishTest({ kind: "null" });
      appendMirMetadata(
        builder,
        "branch",
        `?? null -> bb${rightBlock.id}, other -> bb${undefinedBlock.id}`,
        [isNull],
        expression.range,
      );
      builder.current.terminator = {
        kind: "branch",
        test: isNull,
        whenFalse: undefinedBlock.id,
        whenTrue: rightBlock.id,
      };
      builder.current = undefinedBlock;
      const isUndefined = nullishTest({ kind: "undefined" });
      appendMirMetadata(
        builder,
        "branch",
        `?? undefined -> bb${rightBlock.id}, other -> bb${shortBlock.id}`,
        [isUndefined],
        expression.range,
      );
      builder.current.terminator = {
        kind: "branch",
        test: isUndefined,
        whenFalse: shortBlock.id,
        whenTrue: rightBlock.id,
      };
    } else {
      const takenBlock =
        expression.operator === "&&" ? rightBlock.id : shortBlock.id;
      const skippedBlock =
        expression.operator === "&&" ? shortBlock.id : rightBlock.id;
      appendMirMetadata(
        builder,
        "branch",
        `${expression.operator} true -> bb${takenBlock}, ` +
          `false -> bb${skippedBlock}`,
        [left],
        expression.range,
      );
      builder.current.terminator = {
        kind: "branch",
        test: left,
        whenFalse: skippedBlock,
        whenTrue: takenBlock,
      };
    }
    builder.current = shortBlock;
    shortBlock.terminator = {
      kind: "jump",
      target: joinBlock.id,
      values: [left],
    };
    builder.current = rightBlock;
    const right = lowerExpression(expression.right, builder);
    builder.current.terminator = {
      kind: "jump",
      target: joinBlock.id,
      values: [right],
    };
    builder.current = joinBlock;
    appendMirMetadata(
      builder,
      "join",
      `${expression.operator} bb${shortBlock.id} + bb${rightBlock.id}`,
      [],
      expression.range,
    );
    return recordRoot(builder, result, expression.range);
  }
  if (expression.kind === "sequence") {
    let last: number | undefined;
    for (const element of expression.expressions) {
      last = lowerExpression(element, builder);
    }
    if (last == null) {
      throw new Error("A sequence expression has no expressions.");
    }
    return last;
  }
  if (expression.kind === "conditional") {
    const test = lowerExpression(expression.test, builder);
    const consequentBlock = createMirBlock(builder);
    const alternateBlock = createMirBlock(builder);
    const joinBlock = createMirBlock(builder);
    const result = builder.nextValue;
    builder.nextValue += 1;
    joinBlock.parameters = [result];
    appendMirMetadata(
      builder,
      "branch",
      `? true -> bb${consequentBlock.id}, false -> bb${alternateBlock.id}`,
      [test],
      expression.range,
    );
    builder.current.terminator = {
      kind: "branch",
      test,
      whenFalse: alternateBlock.id,
      whenTrue: consequentBlock.id,
    };
    builder.current = consequentBlock;
    const consequent = lowerExpression(expression.consequent, builder);
    builder.current.terminator = {
      kind: "jump",
      target: joinBlock.id,
      values: [consequent],
    };
    builder.current = alternateBlock;
    const alternate = lowerExpression(expression.alternate, builder);
    builder.current.terminator = {
      kind: "jump",
      target: joinBlock.id,
      values: [alternate],
    };
    builder.current = joinBlock;
    appendMirMetadata(
      builder,
      "join",
      `? bb${consequentBlock.id} + bb${alternateBlock.id}`,
      [],
      expression.range,
    );
    return recordRoot(builder, result, expression.range);
  }
  if (expression.kind === "binary") {
    const left = lowerExpression(expression.left, builder);
    const right = lowerExpression(expression.right, builder);
    if (expression.operator === "+") {
      appendMirMetadata(
        builder,
        "safepoint",
        "string addition fallback",
        [left, right],
        expression.range,
      );
    } else if (
      expression.operator === "in" ||
      expression.operator === "instanceof"
    ) {
      appendMirMetadata(
        builder,
        "safepoint",
        expression.operator === "in"
          ? "property key allocation"
          : "prototype key allocation",
        [left, right],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [left, right],
      detail: String(expression.operator),
      id,
      kind: "binary",
      operator: expression.operator,
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "object") {
    appendMirMetadata(
      builder,
      "safepoint",
      "object allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "ordinary object with null prototype",
      id,
      kind: "object-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    recordRoot(builder, id, expression.range);
    for (const property of expression.properties) {
      const key = lowerPropertyKey(property.key, builder);
      const value = lowerExpression(
        property.value,
        builder,
        property.value.kind === "function" && property.value.name === ""
          ? key
          : undefined,
      );
      appendMirMetadata(
        builder,
        "safepoint",
        "property storage growth",
        [id, key, value],
        expression.range,
      );
      const result = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [id, key, value],
        detail: "create data property",
        id: result,
        kind: "property-set",
        range: expression.range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [result],
        expression.range,
      );
      recordRoot(builder, result, expression.range);
    }
    return id;
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const object = lowerExpression(expression.object, builder);
    if (
      expression.kind === "property-get" &&
      expression.key.kind === "string" &&
      builder.specialization === "enabled"
    ) {
      return lowerSpecializedPropertyGet(
        object,
        expression.key,
        expression.range,
        builder,
      );
    }
    const key = lowerPropertyKey(expression.key, builder);
    if (expression.kind === "property-get") {
      appendMirMetadata(
        builder,
        "safepoint",
        "generic property lookup",
        [object, key],
        expression.range,
      );
    } else {
      appendMirMetadata(
        builder,
        "safepoint",
        "property deletion error",
        [object, key],
        expression.range,
      );
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, key],
      detail: expression.kind,
      id,
      kind: expression.kind,
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "property-set") {
    const object = lowerExpression(expression.object, builder);
    const key = lowerPropertyKey(expression.key, builder);
    const value = lowerExpression(expression.value, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "property storage growth",
      [object, key, value],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, key, value],
      detail: "property-set",
      id,
      kind: "property-set",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "promise-construct") {
    const argumentIds = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    if (argumentIds.length === 0) {
      argumentIds.push(lowerSyntheticUndefined(expression.range, builder));
    }
    appendMirMetadata(
      builder,
      "safepoint",
      "Promise constructor",
      argumentIds,
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: argumentIds,
      detail: "Promise constructor",
      id,
      kind: "call",
      range: expression.range,
      target: { kind: "promise-constructor" },
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "new") {
    const callee = lowerExpression(expression.callee, builder);
    const argumentIds = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    appendMirMetadata(
      builder,
      "safepoint",
      "constructor receiver allocation",
      [callee],
      expression.range,
    );
    const receiver = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [callee],
      detail: "constructor receiver",
      id: receiver,
      kind: "construct-receiver",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [receiver],
      expression.range,
    );
    recordRoot(builder, receiver, expression.range);
    const argumentsValue = [callee, receiver, ...argumentIds];
    appendMirMetadata(
      builder,
      "safepoint",
      "constructor call",
      argumentsValue,
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: argumentsValue,
      detail: "dynamic constructor",
      id,
      kind: "construct",
      range: expression.range,
      target: { kind: "dynamic" },
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [id],
      expression.range,
    );
    return recordRoot(builder, id, expression.range);
  }
  let callArguments: number[];
  let callTarget: MirCallTarget;
  let detail: string;
  if (expression.target.kind === "console-log") {
    callArguments = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    callTarget = { kind: "console-log" };
    detail = "console_log";
  } else if (expression.target.kind === "object-intrinsic") {
    callArguments = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    callTarget = {
      kind: "object-intrinsic",
      method: expression.target.method,
    };
    detail = `Object.${expression.target.method}`;
  } else if (expression.target.kind === "promise-intrinsic") {
    callArguments = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    callTarget = {
      kind: "promise-intrinsic",
      method: expression.target.method,
    };
    detail = `Promise.${expression.target.method}`;
  } else if (expression.target.kind === "timer-intrinsic") {
    callArguments = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    callTarget = {
      kind: "timer-intrinsic",
      method: expression.target.method,
    };
    detail = expression.target.method;
  } else {
    let callee: number;
    let receiver: number;
    if (expression.target.kind === "dynamic") {
      callee = lowerExpression(expression.target.callee, builder);
      receiver = lowerSyntheticUndefined(expression.range, builder);
    } else {
      receiver = lowerExpression(expression.target.object, builder);
      const key = lowerPropertyKey(expression.target.key, builder);
      appendMirMetadata(
        builder,
        "safepoint",
        "method lookup",
        [receiver, key],
        expression.range,
      );
      callee = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [receiver, key],
        detail: "method lookup",
        id: callee,
        kind: "property-get",
        range: expression.range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [callee],
        expression.range,
      );
      recordRoot(builder, callee, expression.range);
    }
    const argumentsValue = expression.arguments.map((argument) =>
      lowerExpression(argument, builder),
    );
    callArguments = [callee, receiver, ...argumentsValue];
    callTarget = { kind: "dynamic" };
    detail = "dynamic function value";
  }
  const safepointId = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: callArguments,
    detail,
    id: safepointId,
    kind: "safepoint",
    range: expression.range,
  });
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: callArguments,
    detail,
    id,
    kind: "call",
    range: expression.range,
    target: callTarget,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    expression.range,
  );
  return recordRoot(builder, id, expression.range);
}

function createMirBlock(builder: MirBuilder): MutableMirBlock {
  const block: MutableMirBlock = {
    id: builder.blocks.length,
    operations: [],
    terminator: undefined,
  };
  builder.blocks.push(block);
  return block;
}

function statementBody(statement: HirStatement): readonly HirStatement[] {
  return statement.kind === "block" ? statement.body : [statement];
}

function resetBinding(
  bindingId: number,
  name: string,
  range: SourceRange,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    `fresh lexical cell for ${name}`,
    [],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    bindingId,
    detail: `${name} cell`,
    id,
    kind: "binding-reset",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  recordRoot(builder, id, range);
}

function resetBlockBindings(
  statements: readonly HirStatement[],
  builder: MirBuilder,
): void {
  for (const statement of statements) {
    if (
      statement.kind === "const" ||
      statement.kind === "let" ||
      statement.kind === "function-init"
    ) {
      resetBinding(
        statement.bindingId,
        statement.name,
        statement.range,
        builder,
      );
    }
  }
}

function lowerStatementBody(
  statement: HirStatement,
  builder: MirBuilder,
): boolean {
  const body = statementBody(statement);
  if (statement.kind === "block") resetBlockBindings(body, builder);
  return lowerStatements(body, builder);
}

function setCompletion(
  builder: MirBuilder,
  kind: NonNullable<MirOperation["completionKind"]>,
  slot: number,
  range: SourceRange,
  value?: number,
  target?: number,
): void {
  appendMirMetadata(
    builder,
    "completion-set",
    kind,
    value == null ? [] : [value],
    range,
    {
      completionKind: kind,
      completionSlot: slot,
      ...(target == null ? {} : { completionTarget: target }),
    },
  );
}

function enterFinalizer(
  builder: MirBuilder,
  kind: NonNullable<MirOperation["completionKind"]>,
  range: SourceRange,
  value?: number,
  target?: number,
): boolean {
  const finalizer = builder.finalizers.at(-1);
  if (finalizer == null) return false;
  setCompletion(builder, kind, finalizer, range, value, target);
  builder.current.terminator = { kind: "jump", target: finalizer };
  return true;
}

function lowerTryStatement(
  statement: HirStatement & { readonly kind: "try" },
  builder: MirBuilder,
): boolean {
  const catchBlock =
    statement.handler == null ? undefined : createMirBlock(builder);
  const finallyBlock =
    statement.finalizer == null ? undefined : createMirBlock(builder);
  const afterBlock = createMirBlock(builder);
  const outerAbrupt = builder.abruptTargets.at(-1);
  const tryAbrupt = catchBlock?.id ?? finallyBlock?.id ?? outerAbrupt;
  if (tryAbrupt != null) builder.abruptTargets.push(tryAbrupt);
  if (finallyBlock != null) builder.finalizers.push(finallyBlock.id);
  const tryTerminated = lowerStatementBody(statement.block, builder);
  if (finallyBlock != null) builder.finalizers.pop();
  if (tryAbrupt != null) builder.abruptTargets.pop();
  if (!tryTerminated) {
    if (finallyBlock == null) {
      builder.current.terminator = { kind: "jump", target: afterBlock.id };
    } else {
      setCompletion(
        builder,
        "normal",
        finallyBlock.id,
        statement.range,
        undefined,
        afterBlock.id,
      );
      builder.current.terminator = {
        kind: "jump",
        target: finallyBlock.id,
      };
    }
  }

  if (catchBlock != null && statement.handler != null) {
    builder.current = catchBlock;
    resetBinding(
      statement.handler.bindingId,
      statement.handler.name,
      statement.handler.range,
      builder,
    );
    const caught = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: statement.handler.name,
      id: caught,
      kind: "caught",
      completionSlot: catchBlock.id,
      range: statement.handler.range,
    });
    recordRoot(builder, caught, statement.handler.range);
    const written = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [caught],
      bindingId: statement.handler.bindingId,
      detail: statement.handler.name,
      id: written,
      kind: "initialize",
      range: statement.handler.range,
    });
    recordRoot(builder, written, statement.handler.range);
    const catchAbrupt = finallyBlock?.id ?? outerAbrupt;
    if (catchAbrupt != null) builder.abruptTargets.push(catchAbrupt);
    if (finallyBlock != null) builder.finalizers.push(finallyBlock.id);
    const catchTerminated = lowerStatementBody(statement.handler.body, builder);
    if (finallyBlock != null) builder.finalizers.pop();
    if (catchAbrupt != null) builder.abruptTargets.pop();
    if (!catchTerminated) {
      if (finallyBlock == null) {
        builder.current.terminator = { kind: "jump", target: afterBlock.id };
      } else {
        setCompletion(
          builder,
          "normal",
          finallyBlock.id,
          statement.range,
          undefined,
          afterBlock.id,
        );
        builder.current.terminator = {
          kind: "jump",
          target: finallyBlock.id,
        };
      }
    }
  }

  if (finallyBlock != null && statement.finalizer != null) {
    builder.current = finallyBlock;
    const finallyTerminated = lowerStatementBody(statement.finalizer, builder);
    if (!finallyTerminated) {
      const outerFinalizer = builder.finalizers.at(-1);
      builder.current.terminator = {
        completionSlot: finallyBlock.id,
        kind: "resume-completion",
        ...(outerAbrupt == null ? {} : { outerAbrupt }),
        ...(outerFinalizer == null ? {} : { outerFinalizer }),
      };
    }
    if (finallyTerminated) {
      for (const block of builder.blocks) {
        for (let index = 0; index < block.operations.length; index += 1) {
          const operation = block.operations[index];
          if (
            operation?.completionSlot === finallyBlock.id &&
            operation.completionTarget === afterBlock.id
          ) {
            const replacement = { ...operation };
            delete replacement.completionTarget;
            block.operations[index] = replacement;
          }
        }
      }
      builder.current = afterBlock;
      return true;
    }
  }
  builder.current = afterBlock;
  return false;
}

function lowerStatements(
  statements: readonly HirStatement[],
  builder: MirBuilder,
): boolean {
  for (const statement of statements) {
    if (
      statement.kind === "binding-init" ||
      statement.kind === "const" ||
      statement.kind === "let"
    ) {
      const value = lowerExpression(statement.initializer, builder);
      const id = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [value],
        bindingId: statement.bindingId,
        detail: `%b${statement.bindingId} ${statement.name}`,
        id,
        kind: "initialize",
        range: statement.range,
      });
      recordRoot(builder, id, statement.range);
    } else if (statement.kind === "function-init") {
      const value = lowerExpression(
        {
          functionId: statement.functionId,
          functionKind: statement.functionKind,
          kind: "function",
          name: statement.functionName,
          parameterCount: statement.parameterCount,
          range: statement.range,
        },
        builder,
      );
      const id = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [value],
        bindingId: statement.bindingId,
        detail: `%b${statement.bindingId} ${statement.name}`,
        id,
        kind: "initialize",
        range: statement.range,
      });
      recordRoot(builder, id, statement.range);
    } else if (statement.kind === "expression") {
      lowerExpression(statement.expression, builder);
    } else if (statement.kind === "return") {
      const value =
        statement.expression == null
          ? lowerSyntheticUndefined(statement.range, builder)
          : lowerExpression(statement.expression, builder);
      if (!enterFinalizer(builder, "return", statement.range, value)) {
        builder.current.terminator = { kind: "return", value };
      }
      return true;
    } else if (statement.kind === "throw") {
      const value = lowerExpression(statement.expression, builder);
      const target = builder.abruptTargets.at(-1);
      setCompletion(builder, "throw", target ?? 0, statement.range, value);
      builder.current.terminator =
        target == null
          ? { completionSlot: 0, kind: "resume-completion" }
          : { kind: "jump", target };
      return true;
    } else if (statement.kind === "try") {
      if (lowerTryStatement(statement, builder)) return true;
    } else if (statement.kind === "block") {
      resetBlockBindings(statement.body, builder);
      if (lowerStatements(statement.body, builder)) return true;
    } else if (statement.kind === "break" || statement.kind === "continue") {
      const loop = builder.loops.at(-1);
      if (loop == null) throw new Error(`${statement.kind} has no MIR loop.`);
      const target =
        statement.kind === "break" ? loop.breakTarget : loop.continueTarget;
      if (
        !enterFinalizer(builder, "jump", statement.range, undefined, target)
      ) {
        builder.current.terminator = { kind: "jump", target };
      }
      return true;
    } else if (statement.kind === "while") {
      const conditionBlock = createMirBlock(builder);
      const bodyBlock = createMirBlock(builder);
      const exitBlock = createMirBlock(builder);
      builder.current.terminator = {
        kind: "jump",
        target: conditionBlock.id,
      };
      builder.current = conditionBlock;
      const test = lowerExpression(statement.test, builder);
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: exitBlock.id,
        whenTrue: bodyBlock.id,
      };
      builder.loops.push({
        breakTarget: exitBlock.id,
        continueTarget: conditionBlock.id,
      });
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      if (!terminated) {
        builder.current.terminator = {
          kind: "jump",
          target: conditionBlock.id,
        };
      }
      builder.current = exitBlock;
      appendMirMetadata(
        builder,
        "join",
        `while bb${conditionBlock.id}`,
        [],
        statement.range,
      );
    } else if (statement.kind === "switch") {
      const discriminant = lowerExpression(statement.discriminant, builder);
      resetBlockBindings(
        statement.cases.flatMap((switchCase) => switchCase.body),
        builder,
      );
      const testedCases = statement.cases
        .map((switchCase, index) => ({ index, switchCase }))
        .filter((entry) => entry.switchCase.test != null);
      const bodyBlocks = statement.cases.map(() => createMirBlock(builder));
      const exitBlock = createMirBlock(builder);
      const defaultIndex = statement.cases.findIndex(
        (switchCase) => switchCase.test == null,
      );
      const unmatchedTarget =
        defaultIndex >= 0 ? bodyBlocks[defaultIndex]!.id : exitBlock.id;
      // Case tests evaluate lazily in source order; the matched clause
      // enters its body and later clauses run through fallthrough.
      for (const [position, entry] of testedCases.entries()) {
        const test = lowerExpression(entry.switchCase.test!, builder);
        const equal = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [discriminant, test],
          detail: "===",
          id: equal,
          kind: "binary",
          operator: "===",
          range: entry.switchCase.range,
        });
        appendMirMetadata(
          builder,
          "check-status",
          "normal -> continue, abrupt -> return",
          [equal],
          entry.switchCase.range,
        );
        const next = testedCases[position + 1];
        const nextBlock = next == null ? undefined : createMirBlock(builder);
        builder.current.terminator = {
          kind: "branch",
          test: equal,
          whenFalse: nextBlock?.id ?? unmatchedTarget,
          whenTrue: bodyBlocks[entry.index]!.id,
        };
        if (nextBlock != null) builder.current = nextBlock;
      }
      if (testedCases.length === 0) {
        builder.current.terminator = {
          kind: "jump",
          target: unmatchedTarget,
        };
      }
      const enclosingLoop = builder.loops.at(-1);
      builder.loops.push({
        breakTarget: exitBlock.id,
        // A continue inside a switch body still targets the enclosing
        // loop; resolution rejects a continue without one.
        continueTarget: enclosingLoop?.continueTarget ?? -1,
      });
      for (const [index, switchCase] of statement.cases.entries()) {
        builder.current = bodyBlocks[index]!;
        const caseTerminated = lowerStatements(switchCase.body, builder);
        if (!caseTerminated) {
          builder.current.terminator = {
            kind: "jump",
            target: bodyBlocks[index + 1]?.id ?? exitBlock.id,
          };
        }
      }
      builder.loops.pop();
      builder.current = exitBlock;
      appendMirMetadata(
        builder,
        "join",
        `switch bb${exitBlock.id}`,
        [],
        statement.range,
      );
    } else if (statement.kind === "for") {
      const declarations = statement.declarations ?? [];
      const initializeBinding = (
        declaration: HirForDeclaration,
        value: number,
      ): void => {
        const id = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [value],
          bindingId: declaration.bindingId,
          detail: `%b${declaration.bindingId} ${declaration.name}`,
          id,
          kind: "initialize",
          range: declaration.range,
        });
        recordRoot(builder, id, declaration.range);
      };
      // CreatePerIterationEnvironment: each iteration reads the current
      // values, gives every mutable for-head binding a fresh cell, and
      // re-initializes it, so closures capture one environment per
      // iteration. A const head has no per-iteration bindings.
      const perIteration = declarations.filter(
        (declaration) => declaration.mutable,
      );
      const copyEnvironment = (): void => {
        for (const declaration of perIteration) {
          const value = lowerExpression(
            {
              bindingId: declaration.bindingId,
              kind: "binding",
              name: declaration.name,
              range: declaration.range,
            },
            builder,
          );
          resetBinding(
            declaration.bindingId,
            declaration.name,
            declaration.range,
            builder,
          );
          initializeBinding(declaration, value);
        }
      };
      for (const declaration of declarations) {
        resetBinding(
          declaration.bindingId,
          declaration.name,
          declaration.range,
          builder,
        );
      }
      for (const declaration of declarations) {
        const value = lowerExpression(declaration.initializer, builder);
        initializeBinding(declaration, value);
      }
      if (statement.init != null) lowerExpression(statement.init, builder);
      if (perIteration.length > 0) copyEnvironment();
      const conditionBlock = createMirBlock(builder);
      const bodyBlock = createMirBlock(builder);
      const updateBlock = createMirBlock(builder);
      const exitBlock = createMirBlock(builder);
      builder.current.terminator = {
        kind: "jump",
        target: conditionBlock.id,
      };
      builder.current = conditionBlock;
      let test: number;
      if (statement.test == null) {
        test = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [],
          constant: { kind: "boolean", value: true },
          detail: "true",
          id: test,
          kind: "constant",
          range: statement.range,
        });
      } else {
        test = lowerExpression(statement.test, builder);
      }
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: exitBlock.id,
        whenTrue: bodyBlock.id,
      };
      builder.loops.push({
        breakTarget: exitBlock.id,
        continueTarget: updateBlock.id,
      });
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      if (!terminated) {
        builder.current.terminator = {
          kind: "jump",
          target: updateBlock.id,
        };
      }
      builder.current = updateBlock;
      if (perIteration.length > 0) copyEnvironment();
      if (statement.update != null) {
        lowerExpression(statement.update, builder);
      }
      builder.current.terminator = {
        kind: "jump",
        target: conditionBlock.id,
      };
      builder.current = exitBlock;
      appendMirMetadata(
        builder,
        "join",
        `for bb${conditionBlock.id}`,
        [],
        statement.range,
      );
    } else if (statement.kind === "do-while") {
      const bodyBlock = createMirBlock(builder);
      const conditionBlock = createMirBlock(builder);
      const exitBlock = createMirBlock(builder);
      builder.current.terminator = { kind: "jump", target: bodyBlock.id };
      builder.loops.push({
        breakTarget: exitBlock.id,
        continueTarget: conditionBlock.id,
      });
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      if (!terminated) {
        builder.current.terminator = {
          kind: "jump",
          target: conditionBlock.id,
        };
      }
      builder.current = conditionBlock;
      const test = lowerExpression(statement.test, builder);
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: exitBlock.id,
        whenTrue: bodyBlock.id,
      };
      builder.current = exitBlock;
      appendMirMetadata(
        builder,
        "join",
        `do-while bb${conditionBlock.id}`,
        [],
        statement.range,
      );
    } else {
      const test = lowerExpression(statement.test, builder);
      const consequentBlock = createMirBlock(builder);
      const alternateBlock = createMirBlock(builder);
      const joinBlock = createMirBlock(builder);
      const branchDetail = [
        `true -> bb${consequentBlock.id}`,
        `false -> bb${alternateBlock.id}`,
      ].join(", ");
      appendMirMetadata(
        builder,
        "branch",
        branchDetail,
        [test],
        statement.range,
      );
      builder.current.terminator = {
        kind: "branch",
        test,
        whenFalse: alternateBlock.id,
        whenTrue: consequentBlock.id,
      };

      builder.current = consequentBlock;
      const consequentReturns = lowerStatementBody(
        statement.consequent,
        builder,
      );
      if (!consequentReturns) {
        builder.current.terminator = { kind: "jump", target: joinBlock.id };
      }

      builder.current = alternateBlock;
      const alternateReturns =
        statement.alternate == null
          ? false
          : lowerStatementBody(statement.alternate, builder);
      if (!alternateReturns) {
        builder.current.terminator = { kind: "jump", target: joinBlock.id };
      }

      builder.current = joinBlock;
      appendMirMetadata(
        builder,
        "join",
        `bb${consequentBlock.id} + bb${alternateBlock.id}`,
        [],
        statement.range,
      );
      if (consequentReturns && alternateReturns) {
        joinBlock.terminator = { kind: "unreachable" };
        return true;
      }
    }
  }
  return false;
}

function lowerSyntheticUndefined(
  range: SourceRange,
  builder: MirBuilder,
): number {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    constant: { kind: "undefined" },
    detail: "undefined",
    id,
    kind: "constant",
    range,
  });
  return recordRoot(builder, id, range);
}

function buildMirFunction(
  id: number,
  name: string,
  body: readonly HirStatement[],
  parameters: readonly HirParameter[],
  localBindingIds: readonly number[],
  selfBindingId: number | undefined,
  range: SourceRange,
  specialization: SpecializationMode,
  strict: boolean,
): MirFunction {
  const entry: MutableMirBlock = {
    id: 0,
    operations: [],
    terminator: undefined,
  };
  const builder: MirBuilder = {
    abruptTargets: [],
    blocks: [entry],
    current: entry,
    loops: [],
    finalizers: [],
    nextValue: 0,
    specialization,
  };
  const returned = lowerStatements(body, builder);
  if (!returned) {
    const value = lowerSyntheticUndefined(range, builder);
    builder.current.terminator = { kind: "return", value };
  }
  const mirParameters: readonly MirParameter[] = parameters.map(
    (parameter) => ({
      bindingId: parameter.bindingId,
      hints: parameter.hints.map((hint) => ({
        name: hint.name,
        provenance: hint.provenance,
        range: {
          end: { ...hint.range.end },
          start: { ...hint.range.start },
        },
      })),
      name: parameter.name,
      range: {
        end: { ...parameter.range.end },
        start: { ...parameter.range.start },
      },
    }),
  );
  return {
    blocks: builder.blocks.map((block) => ({
      id: block.id,
      operations: block.operations,
      ...(block.parameters == null ? {} : { parameters: block.parameters }),
      terminator: block.terminator ?? { kind: "unreachable" },
    })),
    id,
    kind: "mir-function",
    localBindingIds: [...localBindingIds],
    name,
    parameterCount: parameters.length,
    parameters: mirParameters,
    range,
    rootSlotCount: builder.nextValue + parameters.length + 1,
    strict,
    ...(selfBindingId == null ? {} : { selfBindingId }),
  };
}

function maximumMirValue(functionValue: MirFunction): number {
  let maximum = -1;
  for (const block of functionValue.blocks) {
    for (const operation of block.operations) {
      maximum = Math.max(maximum, operation.id);
      if (operation.checkedResult != null) {
        maximum = Math.max(maximum, operation.checkedResult);
      }
    }
  }
  return maximum;
}

function numberHint(parameter: HirParameter): Hint | undefined {
  if (parameter.hints.length === 0) return undefined;
  if (parameter.hints.some((hint) => hint.name !== "number")) {
    return undefined;
  }
  return parameter.hints[0];
}

function eligibleAddition(functionValue: HirFunction):
  | {
      readonly expression: HirExpression & { readonly kind: "binary" };
      readonly hints: readonly [Hint, Hint];
    }
  | undefined {
  const [leftParameter, rightParameter] = functionValue.parameters;
  if (
    functionValue.parameters.length !== 2 ||
    leftParameter == null ||
    rightParameter == null ||
    leftParameter.bindingId === rightParameter.bindingId
  ) {
    return undefined;
  }
  const leftHint = numberHint(leftParameter);
  const rightHint = numberHint(rightParameter);
  if (leftHint == null || rightHint == null) return undefined;
  const statement = functionValue.body[0];
  if (
    functionValue.body.length !== 1 ||
    statement?.kind !== "return" ||
    statement.expression?.kind !== "binary" ||
    statement.expression.operator !== "+" ||
    statement.expression.left.kind !== "binding" ||
    statement.expression.right.kind !== "binding" ||
    statement.expression.left.bindingId !== leftParameter.bindingId ||
    statement.expression.right.bindingId !== rightParameter.bindingId
  ) {
    return undefined;
  }
  return {
    expression: statement.expression,
    hints: [leftHint, rightHint],
  };
}

function copyHint(hint: Hint): MirHint {
  return {
    name: hint.name,
    provenance: hint.provenance,
    range: {
      end: { ...hint.range.end },
      start: { ...hint.range.start },
    },
  };
}

function specializeAddition(
  generic: MirFunction,
  hir: HirFunction,
): MirFunction {
  const eligible = eligibleAddition(hir);
  const original = generic.blocks[0];
  if (
    eligible == null ||
    generic.blocks.length !== 1 ||
    original == null ||
    original.terminator.kind !== "return"
  ) {
    return generic;
  }
  const binaryIndex = original.operations.findIndex(
    (operation) => operation.kind === "binary" && operation.operator === "+",
  );
  const binary = original.operations[binaryIndex];
  const safepoint = original.operations[binaryIndex - 1];
  if (
    binaryIndex < 1 ||
    binary == null ||
    binary.arguments.length !== 2 ||
    safepoint?.kind !== "safepoint"
  ) {
    return generic;
  }
  const leftValue = binary.arguments[0];
  const rightValue = binary.arguments[1];
  if (leftValue == null || rightValue == null) return generic;

  let nextValue = maximumMirValue(generic) + 1;
  const takeValue = (): number => {
    const value = nextValue;
    nextValue += 1;
    return value;
  };
  const leftGuard = takeValue();
  const rightGuard = takeValue();
  const leftRaw = takeValue();
  const rightRaw = takeValue();
  const checked = takeValue();
  const checkedResult = takeValue();
  const hitCounter = takeValue();
  const boxed = takeValue();
  const missCounter = takeValue();
  const overflowCounter = takeValue();
  const joinValue = takeValue();
  const joinMarker = takeValue();
  const range = eligible.expression.range;
  const hints: readonly [MirHint, MirHint] = [
    copyHint(eligible.hints[0]),
    copyHint(eligible.hints[1]),
  ];
  const operation = (
    id: number,
    kind: MirOperation["kind"],
    detail: string,
    argumentsValue: readonly number[],
    extra: Partial<MirOperation> = {},
  ): MirOperation => ({
    arguments: argumentsValue,
    detail,
    id,
    kind,
    range,
    ...extra,
  });
  const prefix = original.operations.slice(0, binaryIndex - 1);
  const genericOperations = original.operations.slice(binaryIndex - 1);
  const blocks: readonly MirBlock[] = [
    {
      id: 0,
      operations: [
        ...prefix,
        operation(
          leftGuard,
          "guard-smi",
          "left -> bb1, miss -> bb4",
          [leftValue],
          { hint: hints[0] },
        ),
      ],
      terminator: {
        kind: "branch",
        test: leftGuard,
        whenFalse: 4,
        whenTrue: 1,
      },
    },
    {
      id: 1,
      operations: [
        operation(
          rightGuard,
          "guard-smi",
          "right -> bb2, miss -> bb4",
          [rightValue],
          { hint: hints[1] },
        ),
      ],
      terminator: {
        kind: "branch",
        test: rightGuard,
        whenFalse: 4,
        whenTrue: 2,
      },
    },
    {
      id: 2,
      operations: [
        operation(leftRaw, "unbox-smi", "left", [leftValue]),
        operation(rightRaw, "unbox-smi", "right", [rightValue]),
        operation(
          checked,
          "add-smi-checked",
          "in-range -> bb3, overflow -> bb5",
          [leftRaw, rightRaw],
          { checkedResult },
        ),
      ],
      terminator: {
        kind: "branch",
        test: checked,
        whenFalse: 5,
        whenTrue: 3,
      },
    },
    {
      id: 3,
      operations: [
        operation(hitCounter, "count-guard-hit", "smi-add", []),
        operation(boxed, "box-smi", "checked result", [checkedResult]),
      ],
      terminator: { kind: "jump", target: 7, values: [boxed] },
    },
    {
      id: 4,
      operations: [
        operation(missCounter, "count-guard-miss", "generic-fallback bb6", []),
      ],
      terminator: { kind: "jump", target: 6 },
    },
    {
      id: 5,
      operations: [
        operation(
          overflowCounter,
          "count-overflow-miss",
          "generic-fallback bb6",
          [],
        ),
      ],
      terminator: { kind: "jump", target: 6 },
    },
    {
      id: 6,
      operations: genericOperations,
      terminator: {
        kind: "jump",
        target: 7,
        values: [original.terminator.value],
      },
    },
    {
      id: 7,
      operations: [
        operation(joinMarker, "join", "specialized bb3 + generic bb6", [
          boxed,
          original.terminator.value,
        ]),
      ],
      parameters: [joinValue],
      terminator: { kind: "return", value: joinValue },
    },
  ];
  return {
    ...generic,
    blocks,
    rootSlotCount: Math.max(generic.rootSlotCount, nextValue + 1),
    specialization: {
      genericBlock: 6,
      hints,
      joinBlock: 7,
      kind: "smi-add",
      range,
    },
  };
}

/** Lower HIR to inspectable MIR under an explicit specialization policy. */
export function buildMir(
  program: HirProgram,
  options: CompilerOptions = {},
): MirProgram {
  const specialization = options.specialization ?? "enabled";
  const explicitGlobals = program.globalBindings ?? [];
  const bodyGlobals = program.body.flatMap((statement) =>
    statement.kind === "const" ||
    statement.kind === "let" ||
    statement.kind === "function-init"
      ? [{ id: statement.bindingId, name: statement.name }]
      : [],
  );
  const globalBindings = [
    ...new Map(
      [...explicitGlobals, ...bodyGlobals].map((binding) => [
        binding.id,
        binding,
      ]),
    ).values(),
  ];
  return {
    functions: program.functions.map((functionValue) => {
      const generic = buildMirFunction(
        functionValue.id,
        functionValue.name,
        functionValue.body,
        functionValue.parameters,
        functionValue.localBindingIds,
        functionValue.selfBindingId,
        functionValue.range,
        specialization,
        functionValue.strict === true,
      );
      return specialization === "enabled"
        ? specializeAddition(generic, functionValue)
        : generic;
    }),
    globalBindings,
    kind: "mir-program",
    observeSpecialization: options.observeSpecialization ?? false,
    script: buildMirFunction(
      -1,
      "<script>",
      program.body,
      [],
      [
        ...new Set([
          ...globalBindings.map((binding) => binding.id),
          ...declaredHirBindingIds(program.body),
        ]),
      ],
      undefined,
      program.range,
      specialization,
      program.strict === true,
    ),
    sourceId: program.sourceId,
    specialization,
  };
}

function printTerminator(terminator: MirTerminator): string {
  if (terminator.kind === "return") return `return %${terminator.value}`;
  if (terminator.kind === "jump") {
    const values = terminator.values?.map((value) => ` %${value}`).join("");
    return `jump bb${terminator.target}${values ?? ""}`;
  }
  if (terminator.kind === "branch") {
    return (
      `branch %${terminator.test} bb${terminator.whenTrue} ` +
      `bb${terminator.whenFalse}`
    );
  }
  if (terminator.kind === "resume-completion") {
    const completion = `resume-completion bb${terminator.completionSlot}`;
    const destinations = [
      terminator.outerAbrupt == null
        ? undefined
        : `throw bb${terminator.outerAbrupt}`,
      terminator.outerFinalizer == null
        ? undefined
        : `finally bb${terminator.outerFinalizer}`,
    ].filter((destination) => destination != null);
    return destinations.length === 0
      ? completion
      : `${completion} via ${destinations.join(", ")}`;
  }
  return "unreachable";
}

function appendMirFunction(lines: string[], functionValue: MirFunction): void {
  lines.push(
    `function @f${functionValue.id} ${functionValue.name} roots=` +
      `${functionValue.rootSlotCount} @${rangeText(functionValue.range)}`,
  );
  if (functionValue.specialization != null) {
    const specialization = functionValue.specialization;
    const hints = specialization.hints
      .map((hint) => `${hint.provenance}:${hint.name}`)
      .join(", ");
    lines.push(
      `  specialize ${specialization.kind} hints=[${hints}] ` +
        `generic-fallback bb${specialization.genericBlock} ` +
        `join bb${specialization.joinBlock}`,
    );
  }
  for (const block of functionValue.blocks) {
    const parameters = block.parameters?.map((value) => `%${value}`).join(", ");
    lines.push(
      `  bb${block.id}${parameters == null ? "" : `(${parameters})`}:`,
    );
    for (const operation of block.operations) {
      const argumentText = operation.arguments
        .map((argument) => `%${argument}`)
        .join(", ");
      const resultText =
        operation.checkedResult == null
          ? `%${operation.id}`
          : `%${operation.id}, %${operation.checkedResult}`;
      const hintTextValue =
        operation.hint == null
          ? ""
          : ` hint=${operation.hint.provenance}:${operation.hint.name}`;
      const cacheText =
        operation.cacheId == null ? "" : ` cache=%${operation.cacheId}`;
      lines.push(
        `    ${resultText} = ${operation.kind} ` +
          `${operation.detail}` +
          `${argumentText === "" ? "" : ` ${argumentText}`} ` +
          `@${rangeText(operation.range)}${hintTextValue}${cacheText}`,
      );
    }
    lines.push(`    ${printTerminator(block.terminator)}`);
  }
}

/** Print deterministic MIR without host paths or object identities. */
export function printMir(program: MirProgram): string {
  const lines = [
    `mir ${JSON.stringify(program.sourceId)} ` +
      `specialization ${program.specialization}`,
  ];
  for (const binding of program.globalBindings) {
    lines.push(`global %b${binding.id} ${binding.name}`);
  }
  for (const functionValue of program.functions) {
    appendMirFunction(lines, functionValue);
  }
  appendMirFunction(lines, program.script);
  return `${lines.join("\n")}\n`;
}

/** Result of the host-neutral compiler pipeline. */
export interface CompilationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly hir?: HirProgram;
  readonly mir?: MirProgram;
  readonly syntax?: SyntaxProgram;
}

/** Whole-graph compilation result for one closed ECMAScript module entry. */
export interface ModuleCompilationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly graph?: LinkedModuleGraph;
  readonly hir?: HirProgram;
  readonly mir?: MirProgram;
}

function moduleProgramBody(
  module: SyntaxModule,
): readonly SyntaxStatementItem[] {
  const items: SyntaxStatementItem[] = [...module.body];
  for (const [index, entry] of module.exports.entries()) {
    if (entry.kind !== "default") continue;
    const bindingName = `*default:${index}*`;
    if ("parameters" in entry.declaration) {
      items.push({ ...entry.declaration, bindingName });
      continue;
    }
    const initializer: SyntaxExpression =
      entry.declaration.kind === "function" &&
      entry.declaration.functionValue.name == null
        ? { ...entry.declaration, inferredName: "default" }
        : entry.declaration;
    items.push({
      ...(entry.byteRange == null ? {} : { byteRange: entry.byteRange }),
      hint: undefined,
      initializer,
      kind: "const",
      name: bindingName,
      range: entry.range,
    });
  }
  return items.toSorted(
    (left, right) =>
      (left.byteRange?.start ?? Number.MAX_SAFE_INTEGER) -
      (right.byteRange?.start ?? Number.MAX_SAFE_INTEGER),
  );
}

function isSourceRange(value: unknown): value is SourceRange {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<SourceRange>;
  return (
    candidate.start != null &&
    typeof candidate.start.line === "number" &&
    typeof candidate.start.column === "number" &&
    candidate.end != null &&
    typeof candidate.end.line === "number" &&
    typeof candidate.end.column === "number"
  );
}

/** Retain module identity on every owned range before graph HIR is merged. */
function retainModuleSource<T>(value: T, sourceId: string): T {
  if (isSourceRange(value)) return { ...value, sourceId } as T;
  if (Array.isArray(value)) {
    return value.map((item) => retainModuleSource(item, sourceId)) as T;
  }
  if (value == null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      retainModuleSource(item, sourceId),
    ]),
  ) as T;
}

function hirExpressionHasAwait(expression: HirExpression): boolean {
  if (expression.kind === "await") return true;
  if (expression.kind === "binding-set") {
    return hirExpressionHasAwait(expression.value);
  }
  if (expression.kind === "array") {
    return expression.elements.some(
      (element) => element != null && hirExpressionHasAwait(element),
    );
  }
  if (expression.kind === "binary") {
    return (
      hirExpressionHasAwait(expression.left) ||
      hirExpressionHasAwait(expression.right)
    );
  }
  if (expression.kind === "call") {
    const targetAwait =
      expression.target.kind === "dynamic"
        ? hirExpressionHasAwait(expression.target.callee)
        : expression.target.kind === "method"
          ? hirExpressionHasAwait(expression.target.object) ||
            hirExpressionHasAwait(expression.target.key)
          : false;
    return targetAwait || expression.arguments.some(hirExpressionHasAwait);
  }
  if (expression.kind === "new") {
    return (
      hirExpressionHasAwait(expression.callee) ||
      expression.arguments.some(hirExpressionHasAwait)
    );
  }
  if (expression.kind === "promise-construct") {
    return expression.arguments.some(hirExpressionHasAwait);
  }
  if (expression.kind === "object") {
    return expression.properties.some(
      (property) =>
        hirExpressionHasAwait(property.key) ||
        hirExpressionHasAwait(property.value),
    );
  }
  if (
    expression.kind === "property-delete" ||
    expression.kind === "property-get"
  ) {
    return (
      hirExpressionHasAwait(expression.object) ||
      hirExpressionHasAwait(expression.key)
    );
  }
  if (expression.kind === "property-set") {
    return (
      hirExpressionHasAwait(expression.object) ||
      hirExpressionHasAwait(expression.key) ||
      hirExpressionHasAwait(expression.value)
    );
  }
  if (expression.kind === "logical") {
    return (
      hirExpressionHasAwait(expression.left) ||
      hirExpressionHasAwait(expression.right)
    );
  }
  if (expression.kind === "conditional") {
    return (
      hirExpressionHasAwait(expression.test) ||
      hirExpressionHasAwait(expression.consequent) ||
      hirExpressionHasAwait(expression.alternate)
    );
  }
  if (expression.kind === "sequence") {
    return expression.expressions.some(hirExpressionHasAwait);
  }
  return (
    expression.kind === "unary" && hirExpressionHasAwait(expression.argument)
  );
}

function hirStatementHasAwait(statement: HirStatement): boolean {
  if (statement.kind === "block") {
    return statement.body.some(hirStatementHasAwait);
  }
  if (
    statement.kind === "binding-init" ||
    statement.kind === "const" ||
    statement.kind === "let"
  ) {
    return hirExpressionHasAwait(statement.initializer);
  }
  if (statement.kind === "expression" || statement.kind === "throw") {
    return hirExpressionHasAwait(statement.expression);
  }
  if (statement.kind === "return") {
    return (
      statement.expression != null &&
      hirExpressionHasAwait(statement.expression)
    );
  }
  if (statement.kind === "if") {
    return (
      hirExpressionHasAwait(statement.test) ||
      hirStatementHasAwait(statement.consequent) ||
      (statement.alternate != null && hirStatementHasAwait(statement.alternate))
    );
  }
  if (statement.kind === "try") {
    return (
      hirStatementHasAwait(statement.block) ||
      (statement.handler != null &&
        hirStatementHasAwait(statement.handler.body)) ||
      (statement.finalizer != null && hirStatementHasAwait(statement.finalizer))
    );
  }
  if (statement.kind === "switch") {
    return (
      hirExpressionHasAwait(statement.discriminant) ||
      statement.cases.some(
        (switchCase) =>
          (switchCase.test != null && hirExpressionHasAwait(switchCase.test)) ||
          switchCase.body.some(hirStatementHasAwait),
      )
    );
  }
  if (statement.kind === "for") {
    return (
      (statement.declarations ?? []).some((declaration) =>
        hirExpressionHasAwait(declaration.initializer),
      ) ||
      (statement.init != null && hirExpressionHasAwait(statement.init)) ||
      (statement.test != null && hirExpressionHasAwait(statement.test)) ||
      (statement.update != null && hirExpressionHasAwait(statement.update)) ||
      hirStatementHasAwait(statement.body)
    );
  }
  return (
    (statement.kind === "while" || statement.kind === "do-while") &&
    (hirExpressionHasAwait(statement.test) ||
      hirStatementHasAwait(statement.body))
  );
}

function hirStatementsHaveAwait(statements: readonly HirStatement[]): boolean {
  return statements.some(hirStatementHasAwait);
}

function collectHirBindings(
  statements: readonly HirStatement[],
): readonly HirGlobalBinding[] {
  const bindings: HirGlobalBinding[] = [];
  const collect = (statement: HirStatement): void => {
    if (
      statement.kind === "const" ||
      statement.kind === "let" ||
      statement.kind === "function-init"
    ) {
      bindings.push({ id: statement.bindingId, name: statement.name });
    } else if (statement.kind === "block") {
      statement.body.forEach(collect);
    } else if (statement.kind === "if") {
      collect(statement.consequent);
      if (statement.alternate != null) collect(statement.alternate);
    } else if (statement.kind === "try") {
      collect(statement.block);
      if (statement.handler != null) {
        bindings.push({
          id: statement.handler.bindingId,
          name: statement.handler.name,
        });
        collect(statement.handler.body);
      }
      if (statement.finalizer != null) collect(statement.finalizer);
    } else if (statement.kind === "while" || statement.kind === "do-while") {
      collect(statement.body);
    } else if (statement.kind === "for") {
      for (const declaration of statement.declarations ?? []) {
        bindings.push({ id: declaration.bindingId, name: declaration.name });
      }
      collect(statement.body);
    } else if (statement.kind === "switch") {
      for (const switchCase of statement.cases) {
        switchCase.body.forEach(collect);
      }
    }
  };
  statements.forEach(collect);
  return bindings;
}

interface ModuleAwaitPoint {
  readonly argument: HirExpression;
  readonly prefix: readonly HirStatement[];
  readonly range: SourceRange;
  resume(value: HirExpression): HirStatement;
}

interface ModuleAsyncLoweringState {
  awaitCount: number;
  readonly diagnostics: Diagnostic[];
  readonly functions: HirFunction[];
  readonly globalBindings: HirGlobalBinding[];
  nextBindingId: number;
  nextFunctionId: number;
  readonly sourceId: string;
}

const maximumModuleContinuationCount = 256;

interface ModuleExpressionParts {
  readonly children: readonly HirExpression[];
  rebuild(children: readonly HirExpression[]): HirExpression;
}

function moduleExpressionParts(
  expression: HirExpression,
): ModuleExpressionParts | undefined {
  if (expression.kind === "await") {
    return {
      children: [expression.argument],
      rebuild: ([argument]) => ({ ...expression, argument: argument! }),
    };
  }
  if (expression.kind === "binding-set") {
    return {
      children: [expression.value],
      rebuild: ([value]) => ({ ...expression, value: value! }),
    };
  }
  if (expression.kind === "array") {
    const indices = expression.elements.flatMap((element, index) =>
      element == null ? [] : [index],
    );
    return {
      children: indices.map((index) => expression.elements[index]!),
      rebuild: (children) => ({
        ...expression,
        elements: expression.elements.map((element, index) => {
          const childIndex = indices.indexOf(index);
          return childIndex < 0 ? element : children[childIndex];
        }),
      }),
    };
  }
  if (expression.kind === "binary") {
    return {
      children: [expression.left, expression.right],
      rebuild: ([left, right]) => ({
        ...expression,
        left: left!,
        right: right!,
      }),
    };
  }
  if (expression.kind === "call") {
    if (expression.target.kind === "dynamic") {
      return {
        children: [expression.target.callee, ...expression.arguments],
        rebuild: ([callee, ...argumentsValue]) => ({
          ...expression,
          arguments: argumentsValue,
          target: { callee: callee!, kind: "dynamic" },
        }),
      };
    }
    if (expression.target.kind === "method") {
      return {
        children: [
          expression.target.object,
          expression.target.key,
          ...expression.arguments,
        ],
        rebuild: ([object, key, ...argumentsValue]) => ({
          ...expression,
          arguments: argumentsValue,
          target: { key: key!, kind: "method", object: object! },
        }),
      };
    }
    return {
      children: expression.arguments,
      rebuild: (argumentsValue) => ({
        ...expression,
        arguments: argumentsValue,
      }),
    };
  }
  if (expression.kind === "new") {
    return {
      children: [expression.callee, ...expression.arguments],
      rebuild: ([callee, ...argumentsValue]) => ({
        ...expression,
        arguments: argumentsValue,
        callee: callee!,
      }),
    };
  }
  if (expression.kind === "promise-construct") {
    return {
      children: expression.arguments,
      rebuild: (argumentsValue) => ({
        ...expression,
        arguments: argumentsValue,
      }),
    };
  }
  if (expression.kind === "object") {
    const children = expression.properties.flatMap((property) => [
      property.key,
      property.value,
    ]);
    return {
      children,
      rebuild: (rebuilt) => ({
        ...expression,
        properties: expression.properties.map((property, index) => ({
          key: rebuilt[index * 2] ?? property.key,
          value: rebuilt[index * 2 + 1] ?? property.value,
        })),
      }),
    };
  }
  if (
    expression.kind === "property-delete" ||
    expression.kind === "property-get"
  ) {
    return {
      children: [expression.object, expression.key],
      rebuild: ([object, key]) => ({
        ...expression,
        key: key!,
        object: object!,
      }),
    };
  }
  if (expression.kind === "property-set") {
    return {
      children: [expression.object, expression.key, expression.value],
      rebuild: ([object, key, value]) => ({
        ...expression,
        key: key!,
        object: object!,
        value: value!,
      }),
    };
  }
  if (expression.kind === "unary") {
    return {
      children: [expression.argument],
      rebuild: ([argument]) => ({ ...expression, argument: argument! }),
    };
  }
  return undefined;
}

interface ExtractedModuleAwait {
  readonly argument: HirExpression;
  readonly prefix: readonly HirStatement[];
  rebuild(value: HirExpression): HirExpression;
}

function stabilizeModuleExpression(
  expression: HirExpression,
  state: ModuleAsyncLoweringState,
): readonly [HirStatement, HirExpression] {
  const bindingId = state.nextBindingId;
  state.nextBindingId += 1;
  const name = `*module-temp:${bindingId}*`;
  state.globalBindings.push({ id: bindingId, name });
  return [
    {
      bindingId,
      hint: undefined,
      initializer: expression,
      kind: "const",
      name,
      range: expression.range,
    },
    { bindingId, kind: "binding", name, range: expression.range },
  ];
}

function extractModuleAwait(
  expression: HirExpression,
  state: ModuleAsyncLoweringState,
): ExtractedModuleAwait | undefined {
  if (
    expression.kind === "await" &&
    !hirExpressionHasAwait(expression.argument)
  ) {
    return {
      argument: expression.argument,
      prefix: [],
      rebuild: (value) => value,
    };
  }
  const parts = moduleExpressionParts(expression);
  if (parts == null) return undefined;
  const childIndex = parts.children.findIndex(hirExpressionHasAwait);
  if (childIndex < 0) return undefined;
  const prefix: HirStatement[] = [];
  const children = [...parts.children];
  for (let index = 0; index < childIndex; index += 1) {
    const [statement, binding] = stabilizeModuleExpression(
      children[index]!,
      state,
    );
    prefix.push(statement);
    children[index] = binding;
  }
  const extracted = extractModuleAwait(children[childIndex]!, state);
  if (extracted == null) return undefined;
  prefix.push(...extracted.prefix);
  return {
    argument: extracted.argument,
    prefix,
    rebuild: (value) => {
      const rebuilt = [...children];
      rebuilt[childIndex] = extracted.rebuild(value);
      return parts.rebuild(rebuilt);
    },
  };
}

function moduleAwaitPoint(
  statement: HirStatement,
  state: ModuleAsyncLoweringState,
): ModuleAwaitPoint | undefined {
  const expression =
    statement.kind === "expression" || statement.kind === "throw"
      ? statement.expression
      : statement.kind === "binding-init" ||
          statement.kind === "const" ||
          statement.kind === "let"
        ? statement.initializer
        : undefined;
  if (expression == null) return undefined;
  const extracted = extractModuleAwait(expression, state);
  if (extracted == null) return undefined;
  return {
    argument: extracted.argument,
    prefix: extracted.prefix,
    range: expression.range,
    resume: (value) => {
      const resumed = extracted.rebuild(value);
      if (
        statement.kind === "binding-init" ||
        statement.kind === "const" ||
        statement.kind === "let"
      ) {
        return {
          ...statement,
          initializer: resumed,
          kind: "binding-init",
        };
      }
      return { ...statement, expression: resumed };
    },
  };
}

function moduleUndefined(range: SourceRange): HirExpression {
  return { kind: "undefined", range };
}

function moduleFunctionExpression(functionValue: HirFunction): HirExpression {
  return {
    functionId: functionValue.id,
    functionKind: functionValue.functionKind,
    kind: "function",
    name: functionValue.name,
    parameterCount: functionValue.parameters.length,
    range: functionValue.range,
  };
}

function modulePromiseCall(
  method: "all" | "asyncCall" | "awaitThen" | "resolve",
  argumentsValue: readonly HirExpression[],
  range: SourceRange,
): HirExpression {
  return {
    arguments: argumentsValue,
    kind: "call",
    range,
    target: { kind: "promise-intrinsic", method },
  };
}

function lowerModuleEvaluationBody(
  statements: readonly HirStatement[],
  range: SourceRange,
  state: ModuleAsyncLoweringState,
): readonly HirStatement[] | undefined {
  const body: HirStatement[] = [];
  for (const [index, statement] of statements.entries()) {
    const point = moduleAwaitPoint(statement, state);
    if (point == null) {
      if (hirStatementHasAwait(statement)) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            statement,
            "Top-level await in this control-flow position is outside M4.",
          ),
        );
        return undefined;
      }
      body.push(statement);
      continue;
    }
    state.awaitCount += 1;
    if (state.awaitCount > maximumModuleContinuationCount) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          `A module may contain at most ` +
            `${maximumModuleContinuationCount} top-level await points.`,
        ),
      );
      return undefined;
    }
    const bindingId = state.nextBindingId;
    state.nextBindingId += 1;
    const functionId = state.nextFunctionId;
    state.nextFunctionId += 1;
    const name = `*module-await:${functionId}*`;
    const parameter: HirParameter = {
      bindingId,
      hints: [],
      name,
      range: point.range,
    };
    const awaitedValue: HirExpression = {
      bindingId,
      kind: "binding",
      name,
      range: point.range,
    };
    const suffix = lowerModuleEvaluationBody(
      [point.resume(awaitedValue), ...statements.slice(index + 1)],
      range,
      state,
    );
    if (suffix == null) return undefined;
    const continuation: HirFunction = {
      body: suffix,
      functionKind: "arrow",
      id: functionId,
      kind: "hir-function",
      localBindingIds: [bindingId],
      name,
      parameters: [parameter],
      range: point.range,
      returnHints: [],
      strict: true,
    };
    state.functions.push(continuation);
    body.push(...point.prefix);
    const resolved = modulePromiseCall(
      "resolve",
      [point.argument],
      point.range,
    );
    body.push({
      expression: modulePromiseCall(
        "awaitThen",
        [resolved, moduleFunctionExpression(continuation)],
        point.range,
      ),
      kind: "return",
      range: point.range,
    });
    return body;
  }
  body.push({
    expression: moduleUndefined(range),
    kind: "return",
    range,
  });
  return body;
}

/** Link and lower a closed module graph to shared-cell scheduled MIR. */
export function compileModuleGraph(
  graph: ModuleGraph,
  options: CompilerOptions = {},
): ModuleCompilationResult {
  const linked = linkModuleGraph(graph);
  if (linked.graph == null) return { diagnostics: linked.diagnostics };
  const nodes = new Map(
    graph.modules.map((module) => [module.canonicalId, module]),
  );
  const linkedModules = new Map(
    linked.graph.modules.map((module) => [module.canonicalId, module]),
  );
  const cells = new Map(linked.graph.cells.map((cell) => [cell.id, cell]));
  const functionInitializers: HirStatement[] = [];
  const functions: HirFunction[] = [];
  const globalBindings: HirGlobalBinding[] = [];
  const moduleBodies = new Map<string, readonly HirStatement[]>();
  let nextBindingId = linked.graph.cells.length;
  let nextFunctionId = 0;
  const namespaceBindings = new Map<string, number>();
  const namespaceInitializers: HirStatement[] = [];

  for (const module of linked.graph.modules) {
    for (const imported of module.imports) {
      const targetId = imported.namespaceModuleId;
      if (targetId == null || namespaceBindings.has(targetId)) continue;
      const target = linkedModules.get(targetId);
      const targetNode = nodes.get(targetId);
      if (target == null || targetNode == null) {
        throw new Error(`Namespace module '${targetId}' is unavailable.`);
      }
      const bindingId = imported.cellId;
      if (bindingId == null) {
        throw new Error("Module namespace cell is unavailable.");
      }
      namespaceBindings.set(targetId, bindingId);
      const targetRange = retainModuleSource(targetNode.syntax.range, targetId);
      namespaceInitializers.push({
        bindingId,
        hint: undefined,
        initializer: {
          entries: target.exports.map((entry) => ({
            bindingId: entry.cellId,
            name: entry.exportedName,
          })),
          kind: "module-namespace",
          range: targetRange,
        },
        kind: "const",
        name: `*namespace:${targetId}*`,
        range: targetRange,
      });
    }
  }

  for (const moduleId of linked.graph.evaluationOrder) {
    const node = nodes.get(moduleId);
    const linkedModule = linkedModules.get(moduleId);
    if (node == null || linkedModule == null) {
      throw new Error(`Linked module '${moduleId}' is unavailable.`);
    }
    const bindings = new Map<string, Binding>();
    for (const imported of linkedModule.imports) {
      if (imported.namespaceModuleId != null) {
        const bindingId = namespaceBindings.get(imported.namespaceModuleId);
        if (bindingId == null) {
          throw new Error("Module namespace binding is unavailable.");
        }
        bindings.set(imported.localName, {
          id: bindingId,
          mutable: false,
          name: imported.localName,
        });
        continue;
      }
      if (imported.cellId == null) continue;
      bindings.set(imported.localName, {
        id: imported.cellId,
        mutable: false,
        name: imported.localName,
      });
    }
    for (const cellId of linkedModule.cellIds) {
      const cell = cells.get(cellId);
      if (cell == null) throw new Error(`Module cell '${cellId}' is missing.`);
      if (bindings.has(cell.localName)) {
        const declaration = node.syntax.body.find(
          (item) =>
            (item.kind === "const" ||
              item.kind === "let" ||
              item.kind === "function") &&
            item.name === cell.localName,
        );
        return {
          diagnostics: [
            sourceDiagnostic(
              moduleId,
              declaration ?? node.syntax,
              `Duplicate declaration '${cell.localName}'.`,
            ),
          ],
          graph: linked.graph,
        };
      }
      bindings.set(cell.localName, {
        id: cell.id,
        mutable: false,
        name: cell.localName,
        pendingDeclaration: true,
      });
    }
    const result = buildSeededHir(
      {
        body: moduleProgramBody(node.syntax),
        kind: "program",
        range: node.syntax.range,
        sourceId: moduleId,
        strict: true,
      },
      { bindings, nextBindingId, nextFunctionId },
    );
    nextBindingId = result.nextBindingId;
    nextFunctionId = result.nextFunctionId;
    if (result.program == null) {
      return { diagnostics: result.diagnostics, graph: linked.graph };
    }
    const moduleBody = retainModuleSource(result.program.body, moduleId);
    globalBindings.push(...collectHirBindings(moduleBody));
    const evaluationBody: HirStatement[] = [];
    for (const statement of moduleBody) {
      if (statement.kind === "function-init") {
        functionInitializers.push(statement);
      } else {
        evaluationBody.push(statement);
      }
    }
    moduleBodies.set(moduleId, evaluationBody);
    functions.push(...retainModuleSource(result.program.functions, moduleId));
  }

  const directlyAsync = new Set(
    linked.graph.evaluationOrder.filter((moduleId) =>
      hirStatementsHaveAwait(moduleBodies.get(moduleId) ?? []),
    ),
  );
  const asyncModules = new Set(directlyAsync);
  let asyncChanged = true;
  while (asyncChanged) {
    asyncChanged = false;
    for (const moduleId of linked.graph.evaluationOrder) {
      if (asyncModules.has(moduleId)) continue;
      const node = nodes.get(moduleId);
      if (
        node?.dependencies.some((dependency) =>
          asyncModules.has(dependency.canonicalId),
        ) !== true
      ) {
        continue;
      }
      asyncModules.add(moduleId);
      asyncChanged = true;
    }
  }
  for (const component of linked.graph.components) {
    if (!component.cyclic) continue;
    const asyncModuleId = component.moduleIds.find((moduleId) =>
      asyncModules.has(moduleId),
    );
    if (asyncModuleId == null) continue;
    const node = nodes.get(asyncModuleId);
    if (node == null) {
      throw new Error(`Asynchronous module '${asyncModuleId}' is missing.`);
    }
    const moduleBody = moduleBodies.get(asyncModuleId) ?? [];
    const awaitStatement = moduleBody.find(hirStatementHasAwait);
    return {
      diagnostics: [
        sourceDiagnostic(
          asyncModuleId,
          awaitStatement ?? node.syntax,
          "Asynchronous module cycles are outside M4.",
        ),
      ],
      graph: linked.graph,
    };
  }

  const evaluators = new Map<string, HirFunction>();
  for (const moduleId of linked.graph.evaluationOrder) {
    const node = nodes.get(moduleId);
    const moduleBody = moduleBodies.get(moduleId);
    if (node == null || moduleBody == null) {
      throw new Error(`Module evaluation '${moduleId}' is unavailable.`);
    }
    const evaluatorId = nextFunctionId;
    nextFunctionId += 1;
    const state: ModuleAsyncLoweringState = {
      awaitCount: 0,
      diagnostics: [],
      functions,
      globalBindings,
      nextBindingId,
      nextFunctionId,
      sourceId: moduleId,
    };
    const evaluatorBody = lowerModuleEvaluationBody(
      moduleBody,
      retainModuleSource(node.syntax.range, moduleId),
      state,
    );
    nextBindingId = state.nextBindingId;
    nextFunctionId = state.nextFunctionId;
    if (evaluatorBody == null) {
      return { diagnostics: state.diagnostics, graph: linked.graph };
    }
    const evaluator: HirFunction = {
      body: evaluatorBody,
      functionKind: "arrow",
      id: evaluatorId,
      kind: "hir-function",
      localBindingIds: [],
      name: `*module:${moduleId}*`,
      parameters: [],
      range: retainModuleSource(node.syntax.range, moduleId),
      returnHints: [],
      strict: true,
    };
    evaluators.set(moduleId, evaluator);
    functions.push(evaluator);
  }

  const moduleInitializers: HirStatement[] = [];
  const promiseBindings = new Map<string, number>();
  for (const moduleId of linked.graph.evaluationOrder) {
    const node = nodes.get(moduleId);
    const evaluator = evaluators.get(moduleId);
    if (node == null || evaluator == null) {
      throw new Error(`Module scheduler '${moduleId}' is unavailable.`);
    }
    const range = retainModuleSource(node.syntax.range, moduleId);
    const evaluatorExpression = moduleFunctionExpression(evaluator);
    const asyncDependencies = [
      ...new Set(
        node.dependencies
          .map((dependency) => dependency.canonicalId)
          .filter((dependencyId) => asyncModules.has(dependencyId)),
      ),
    ];
    let initializer: HirExpression;
    if (asyncDependencies.length > 0) {
      const dependencies = asyncDependencies.map((dependencyId) => {
        const bindingId = promiseBindings.get(dependencyId);
        if (bindingId == null) {
          throw new Error(`Module promise '${dependencyId}' is unavailable.`);
        }
        return {
          bindingId,
          kind: "binding",
          name: `*module-promise:${dependencyId}*`,
          range,
        } satisfies HirExpression;
      });
      const awaited =
        dependencies.length === 1
          ? dependencies[0]!
          : modulePromiseCall(
              "all",
              [{ elements: dependencies, kind: "array", range }],
              range,
            );
      initializer = modulePromiseCall(
        "awaitThen",
        [awaited, evaluatorExpression],
        range,
      );
    } else if (directlyAsync.has(moduleId)) {
      initializer = modulePromiseCall(
        "asyncCall",
        [evaluatorExpression],
        range,
      );
    } else {
      const result: HirExpression = {
        arguments: [],
        kind: "call",
        range,
        target: { callee: evaluatorExpression, kind: "dynamic" },
      };
      initializer = modulePromiseCall("resolve", [result], range);
    }
    const bindingId = nextBindingId;
    nextBindingId += 1;
    promiseBindings.set(moduleId, bindingId);
    moduleInitializers.push({
      bindingId,
      hint: undefined,
      initializer,
      kind: "const",
      name: `*module-promise:${moduleId}*`,
      range,
    });
  }

  const entry = nodes.get(graph.entryId);
  if (entry == null) throw new Error("The module entry is unavailable.");
  const entryPromiseId = promiseBindings.get(graph.entryId);
  if (entryPromiseId == null) {
    throw new Error("The entry module promise is unavailable.");
  }
  const entryRange = retainModuleSource(entry.syntax.range, graph.entryId);
  const hir: HirProgram = {
    body: [
      ...namespaceInitializers,
      ...functionInitializers,
      ...moduleInitializers,
      {
        expression: {
          argument: {
            bindingId: entryPromiseId,
            kind: "binding",
            name: `*module-promise:${graph.entryId}*`,
            range: entryRange,
          },
          kind: "await",
          range: entryRange,
        },
        kind: "expression",
        range: entryRange,
      },
    ],
    functions,
    globalBindings,
    kind: "hir-program",
    range: entryRange,
    sourceId: graph.entryId,
    strict: true,
  };
  return {
    diagnostics: [],
    graph: linked.graph,
    hir,
    mir: buildMir(hir, options),
  };
}

/** Compile source through owned syntax, HIR, and policy-selected MIR. */
export function compileSource(
  frontend: SourceFrontend,
  input: SourceInput,
  options: CompilerOptions = {},
): CompilationResult {
  const frontendResult = frontend.parse(input);
  if (frontendResult.program == null) {
    return { diagnostics: frontendResult.diagnostics };
  }
  const hirResult = buildHir(frontendResult.program);
  if (hirResult.program == null) {
    return {
      diagnostics: hirResult.diagnostics,
      syntax: frontendResult.program,
    };
  }
  return {
    diagnostics: [],
    hir: hirResult.program,
    mir: buildMir(hirResult.program, options),
    syntax: frontendResult.program,
  };
}

/** Architecture facts admitted by Oseo native targets. */
export type NativeArchitecture = "aarch64" | "x86_64";

/** Operating-system facts admitted by Oseo native targets. */
export type NativeOperatingSystem = "linux" | "macos";

/** ABI environments distinguished by Oseo's native Linux targets. */
export type NativeAbi = "gnu" | "musl";

/** Stable Oseo native target IDs in OS-architecture-ABI order. */
export type TargetName =
  | "linux-aarch64-musl"
  | "linux-x86_64-gnu"
  | "macos-aarch64";

/** Normalized host detection, including explicitly unknown reported facts. */
export interface ExecutionHostDescription {
  readonly architecture: NativeArchitecture | "unknown";
  readonly operatingSystem: NativeOperatingSystem | "unknown";
}

/** Toolchain-neutral artifact facts for one explicit Oseo target ID. */
export interface TargetDescription {
  readonly abi?: NativeAbi;
  readonly architecture: NativeArchitecture;
  readonly cStandard: "c11";
  readonly executableFormat: "elf" | "mach-o";
  readonly name: TargetName;
  readonly operatingSystem: NativeOperatingSystem;
  readonly sanitizers: readonly ("address" | "undefined")[];
}

/** Deterministic source emitted by a replaceable native backend. */
export interface EmittedNativeSource {
  readonly source: string;
  readonly sourceName: string;
}

/** Backend boundary that never performs process execution. */
export interface NativeBackend {
  emit(input: MirProgram): EmittedNativeSource;
}

/** One reviewed native asset supplied by a runtime package. */
export interface RuntimeAsset {
  readonly kind: "header" | "source";
  readonly name: string;
  readonly url: URL;
}

/** A versioned set of native runtime inputs. */
export interface RuntimeInput {
  readonly abiVersion: string;
  readonly assets: readonly RuntimeAsset[];
}

/** Provider boundary between runtime selection and backend emission. */
export interface RuntimeInputProvider {
  getRuntimeInput(): RuntimeInput;
}

/** One process request created by a native toolchain adapter. */
export interface ProcessRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
}

/** Host-independent subprocess observation. */
export interface ProcessObservation {
  readonly exitStatus: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Files and commands required for one native build. */
export interface NativeBuildPlan {
  readonly executablePath: string;
  readonly requests: readonly ProcessRequest[];
  readonly target: TargetDescription;
}

/** Explicit inputs used to construct a native build plan. */
export interface NativeBuildInput {
  readonly generatedSourcePath: string;
  readonly runtimeDirectory: string;
  readonly runtimeSourcePath: string;
  readonly target: TargetDescription;
  readonly workingDirectory: string;
}

/** Toolchain boundary that constructs commands without executing them. */
export interface NativeToolchain {
  createBuildPlan(input: NativeBuildInput): NativeBuildPlan;
}

/** Narrow host boundary used by compiler adapters and test infrastructure. */
export interface CompilerHost {
  canonicalizeFile?(path: string): Promise<string>;
  readonly executionHost?: ExecutionHostDescription;
  makeTemporaryDirectory(prefix: string): Promise<string>;
  readTextFile(path: string | URL): Promise<string>;
  remove(path: string): Promise<void>;
  run(request: ProcessRequest): Promise<ProcessObservation>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

/** Render the stable first line of an Oseo diagnostic. */
export function renderDiagnostic(diagnostic: Diagnostic): string {
  const position = diagnostic.range.start;
  return (
    `${diagnostic.sourceId}:${position.line}:${position.column}: ` +
    `error[${diagnostic.code}]: ${diagnostic.message}`
  );
}

/** Return the immutable artifact facts for an explicit native target. */
export function describeTarget(name: TargetName): TargetDescription {
  if (name === "linux-x86_64-gnu") {
    return {
      abi: "gnu",
      architecture: "x86_64",
      cStandard: "c11",
      executableFormat: "elf",
      name,
      operatingSystem: "linux",
      sanitizers: ["address", "undefined"],
    };
  }
  if (name === "macos-aarch64") {
    return {
      architecture: "aarch64",
      cStandard: "c11",
      executableFormat: "mach-o",
      name,
      operatingSystem: "macos",
      sanitizers: ["address", "undefined"],
    };
  }
  if (name === "linux-aarch64-musl") {
    return {
      abi: "musl",
      architecture: "aarch64",
      cStandard: "c11",
      executableFormat: "elf",
      name,
      operatingSystem: "linux",
      sanitizers: [],
    };
  }
  throw new Error(`Unsupported native target '${String(name)}'.`);
}

/** Whether one normalized host may execute an artifact for a target. */
export function canExecuteTarget(
  host: ExecutionHostDescription,
  target: TargetDescription,
): boolean {
  return targetForExecutionHost(host)?.name === target.name;
}

/** Select the supported native target matching one execution host. */
export function targetForExecutionHost(
  host: ExecutionHostDescription,
): TargetDescription | undefined {
  if (host.architecture === "x86_64" && host.operatingSystem === "linux") {
    return describeTarget("linux-x86_64-gnu");
  }
  if (host.architecture === "aarch64" && host.operatingSystem === "macos") {
    return describeTarget("macos-aarch64");
  }
  return undefined;
}
