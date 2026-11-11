import type {
  Binding,
  HirExpression,
  HirFunction,
  HirGlobalBinding,
  HirProgram,
  HirStatement,
} from "./hir.ts";
import {
  buildSeededHir,
  type HirHostOptions,
  hirBindingIdentifiers,
  hirBindingPatternHasAwait,
  hirExpressionHasAwait,
  sourceDiagnostic,
  type SyntaxStatementItem,
} from "./hir-build.ts";
import type { CompilerOptions, MirProgram } from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import {
  builtinModuleExports,
  moduleNodeRange,
  moduleNodeSyntax,
} from "./module-builtin.ts";
import { linkModuleGraph } from "./modules.ts";
import type { LinkedModule, LinkedModuleGraph } from "./modules.ts";
import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  LocatedSyntax,
  ModuleGraph,
  ScriptRequestClosure,
  SyntaxExpression,
  SyntaxModule,
  SyntaxProgram,
} from "./syntax.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

/** Result of the host-neutral compiler pipeline. */
export interface CompilationResult {
  /**
   * The agent programs a Script compiled for the test262 host can start,
   * each linked beside `mir` as a unit of its own.
   */
  readonly agents?: readonly MirProgram[];
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
    let initializer: SyntaxExpression = entry.declaration;
    if (
      entry.declaration.kind === "function" &&
      entry.declaration.functionValue.name == null
    ) {
      initializer = { ...entry.declaration, inferredName: "default" };
    } else if (
      entry.declaration.kind === "class" &&
      entry.declaration.constructorFunction.name == null
    ) {
      initializer = { ...entry.declaration, inferredName: "default" };
    }
    items.push({
      ...includePropertiesWhen(() => {
        if (entry.byteRange == null) return undefined;
        return {
          byteRange: entry.byteRange,
        };
      }),
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

/**
 * The top-level declaration that binds one name, used to locate a
 * duplicate-declaration diagnostic. A lexical declaration list is
 * searched by declarator, so the diagnostic names the declarator rather
 * than the whole module.
 */
function declarationNamed(
  items: readonly SyntaxStatementItem[],
  name: string,
): LocatedSyntax | undefined {
  for (const item of items) {
    if (item.kind === "declaration-list") {
      const declarator = declarationNamed(item.declarations, name);
      if (declarator != null) return declarator;
      continue;
    }
    if (
      (item.kind === "const" ||
        item.kind === "let" ||
        item.kind === "function") &&
      item.name === name
    ) {
      return item;
    }
  }
  return undefined;
}

function isSourceRange<T>(value: T): value is T & SourceRange {
  if (value == null || typeof value !== "object") return false;
  // SAFETY: The object check permits reading only optional range fields here.
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

function isNonNullObject<T>(value: T): value is T & object {
  return value !== null && typeof value === "object";
}

/** Retain module identity on every owned range before graph HIR is merged. */
function retainModuleSource<T>(value: T, sourceId: string): T {
  if (isSourceRange(value)) {
    return (
      // SAFETY: Updating the source ID preserves every other SourceRange field.
      { ...value, sourceId } as T
    );
  }
  if (Array.isArray(value)) {
    return (
      // SAFETY: Recursing element-wise preserves the input array's structure.
      value.map((item) => retainModuleSource(item, sourceId)) as T
    );
  }
  if (!isNonNullObject(value)) return value;
  // SAFETY: Recursing over every entry preserves the input object's structure.
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      retainModuleSource(item, sourceId),
    ]),
  ) as T;
}

/** Whether one statement itself declares an `await using` binding. */
function hirStatementDisposesAsynchronously(statement: HirStatement): boolean {
  if (statement.kind === "const") return statement.disposal === "async";
  if (statement.kind === "for") {
    return (statement.declarations ?? []).some(
      (declaration) =>
        declaration.kind === "binding" && declaration.disposal === "async",
    );
  }
  return (
    statement.kind === "for-of" &&
    statement.target.kind === "declaration" &&
    statement.target.disposal === "async"
  );
}

/**
 * Whether one statement contains an await the module continuation
 * transform can extract. A `for await` head awaits every iteration step
 * without being such a point, because the loop stays in place, so this
 * predicate must not report it: it drives both the extraction search and
 * the rejection of awaits in positions the transform does not own. The
 * `awaitedIteration` variant instead reports whether the statement makes
 * its module's evaluation asynchronous at all, which the scheduler and
 * the cycle check need.
 */
function hirStatementAwaits(
  statement: HirStatement,
  awaitedIteration: boolean,
): boolean {
  const recurse = (child: HirStatement): boolean =>
    hirStatementAwaits(child, awaitedIteration);
  if (
    awaitedIteration &&
    statement.kind === "for-of" &&
    statement.awaited === true
  ) {
    return true;
  }
  // An `await using` scope awaits during its disposal, at the scope's
  // exit rather than at an extractable expression, so like a `for await`
  // head it only makes evaluation asynchronous.
  if (awaitedIteration && hirStatementDisposesAsynchronously(statement)) {
    return true;
  }
  if (statement.kind === "block") {
    return statement.body.some(recurse);
  }
  if (
    statement.kind === "binding-init" ||
    statement.kind === "const" ||
    statement.kind === "let"
  ) {
    return hirExpressionHasAwait(statement.initializer);
  }
  if (statement.kind === "binding-pattern") {
    return (
      hirExpressionHasAwait(statement.initializer) ||
      hirBindingPatternHasAwait(statement.pattern)
    );
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
      recurse(statement.consequent) ||
      (statement.alternate != null && recurse(statement.alternate))
    );
  }
  if (statement.kind === "try") {
    return (
      recurse(statement.block) ||
      (statement.handler != null &&
        ((statement.handler.pattern != null &&
          hirBindingPatternHasAwait(statement.handler.pattern)) ||
          recurse(statement.handler.body))) ||
      (statement.finalizer != null && recurse(statement.finalizer))
    );
  }
  if (statement.kind === "labeled") {
    return recurse(statement.body);
  }
  if (statement.kind === "switch") {
    return (
      hirExpressionHasAwait(statement.discriminant) ||
      statement.cases.some(
        (switchCase) =>
          (switchCase.test != null && hirExpressionHasAwait(switchCase.test)) ||
          switchCase.body.some(recurse),
      )
    );
  }
  if (statement.kind === "for") {
    return (
      (statement.declarations ?? []).some(
        (declaration) =>
          hirExpressionHasAwait(declaration.initializer) ||
          (declaration.kind === "pattern" &&
            hirBindingPatternHasAwait(declaration.pattern)),
      ) ||
      (statement.init != null && hirExpressionHasAwait(statement.init)) ||
      (statement.test != null && hirExpressionHasAwait(statement.test)) ||
      (statement.update != null && hirExpressionHasAwait(statement.update)) ||
      recurse(statement.body)
    );
  }
  if (statement.kind === "for-of") {
    return (
      hirExpressionHasAwait(statement.iterable) ||
      ((statement.target.kind === "pattern-declaration" ||
        statement.target.kind === "assignment-pattern") &&
        hirBindingPatternHasAwait(statement.target.pattern)) ||
      (statement.target.kind === "property" &&
        (hirExpressionHasAwait(statement.target.object) ||
          hirExpressionHasAwait(statement.target.key))) ||
      recurse(statement.body)
    );
  }
  if (statement.kind === "for-in") {
    return (
      hirExpressionHasAwait(statement.subject) ||
      ((statement.target.kind === "pattern-declaration" ||
        statement.target.kind === "assignment-pattern") &&
        hirBindingPatternHasAwait(statement.target.pattern)) ||
      (statement.target.kind === "property" &&
        (hirExpressionHasAwait(statement.target.object) ||
          hirExpressionHasAwait(statement.target.key))) ||
      (statement.target.kind === "private" &&
        hirExpressionHasAwait(statement.target.object)) ||
      recurse(statement.body)
    );
  }
  return (
    (statement.kind === "while" || statement.kind === "do-while") &&
    (hirExpressionHasAwait(statement.test) || recurse(statement.body))
  );
}

function hirStatementIsAsynchronous(statement: HirStatement): boolean {
  return hirStatementAwaits(statement, true);
}

function hirStatementsAreAsynchronous(
  statements: readonly HirStatement[],
): boolean {
  return statements.some(hirStatementIsAsynchronous);
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
    } else if (
      statement.kind === "binding-pattern" &&
      statement.mode === "declare" &&
      statement.declarationKind !== "var"
    ) {
      for (const binding of hirBindingIdentifiers(statement.pattern)) {
        bindings.push({ id: binding.bindingId, name: binding.name });
      }
    } else if (statement.kind === "block") {
      statement.body.forEach(collect);
    } else if (statement.kind === "if") {
      collect(statement.consequent);
      if (statement.alternate != null) collect(statement.alternate);
    } else if (statement.kind === "try") {
      collect(statement.block);
      if (statement.handler != null) {
        if (statement.handler.pattern != null) {
          for (const binding of hirBindingIdentifiers(
            statement.handler.pattern,
          )) {
            bindings.push({ id: binding.bindingId, name: binding.name });
          }
        }
        collect(statement.handler.body);
      }
      if (statement.finalizer != null) collect(statement.finalizer);
    } else if (
      statement.kind === "while" ||
      statement.kind === "do-while" ||
      statement.kind === "labeled"
    ) {
      collect(statement.body);
    } else if (statement.kind === "for") {
      for (const declaration of statement.declarations ?? []) {
        if (declaration.declarationKind === "var") continue;
        if (declaration.kind === "binding") {
          bindings.push({
            id: declaration.bindingId,
            name: declaration.name,
          });
        } else {
          for (const binding of hirBindingIdentifiers(declaration.pattern)) {
            bindings.push({ id: binding.bindingId, name: binding.name });
          }
        }
      }
      collect(statement.body);
    } else if (statement.kind === "for-of") {
      if (
        statement.target.kind === "declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        bindings.push({
          id: statement.target.bindingId,
          name: statement.target.name,
        });
      } else if (
        statement.target.kind === "pattern-declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        for (const binding of hirBindingIdentifiers(statement.target.pattern)) {
          bindings.push({ id: binding.bindingId, name: binding.name });
        }
      }
      collect(statement.body);
    } else if (statement.kind === "for-in") {
      if (
        statement.target.kind === "declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        bindings.push({
          id: statement.target.bindingId,
          name: statement.target.name,
        });
      } else if (
        statement.target.kind === "pattern-declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        for (const binding of hirBindingIdentifiers(statement.target.pattern)) {
          bindings.push({ id: binding.bindingId, name: binding.name });
        }
      }
      collect(statement.body);
    } else if (statement.kind === "switch") {
      (statement.functionInits ?? []).forEach(collect);
      for (const switchCase of statement.cases) {
        switchCase.body.forEach(collect);
      }
    }
  };
  statements.forEach(collect);
  return bindings;
}

/** The link-time initializer of one module's namespace object cell. */
function moduleNamespaceInitializer(
  target: LinkedModule,
  bindingId: number,
  range: SourceRange,
): HirStatement {
  return {
    bindingId,
    hint: undefined,
    initializer: {
      entries: target.exports.map((entry) => ({
        bindingId: entry.cellId,
        name: entry.exportedName,
      })),
      kind: "module-namespace",
      range,
    },
    kind: "const",
    name: `*namespace:${target.canonicalId}*`,
    range,
  };
}

function moduleUndefined(range: SourceRange): HirExpression {
  return { kind: "undefined", range };
}

function moduleNumber(value: number, range: SourceRange): HirExpression {
  return { kind: "number", range, value };
}

function moduleFunctionExpression(functionValue: HirFunction): HirExpression {
  return {
    functionId: functionValue.id,
    functionKind: functionValue.functionKind,
    functionLength: functionValue.functionLength,
    kind: "function",
    name: functionValue.name,
    range: functionValue.range,
    ...includePropertiesWhen(() => {
      if (functionValue.sourceText == null) return undefined;
      return {
        sourceText: functionValue.sourceText,
      };
    }),
  };
}

/**
 * The resolved Script a host evaluates in the realm before the graph, as
 * the test262 harness is. Its bindings seed every module's outer scope
 * the way the global Environment Record would answer them.
 */
interface ModulePrelude {
  readonly hir: HirProgram;
  readonly bindings: ReadonlyMap<string, Binding>;
  readonly globalObjectBindingIds: readonly number[];
}

/** A resolved prelude, or the diagnostics that rejected it. */
interface ModulePreludeResolution {
  readonly diagnostics: readonly Diagnostic[];
  readonly nextBindingId: number;
  readonly nextFunctionId: number;
  readonly prelude?: ModulePrelude;
}

/**
 * A module reading a name that a Script's `with` statement may initialize
 * could not observe the hidden fallback cell the Script writes.
 */
function withInitializingDiagnostic(
  script: SyntaxProgram,
  names: readonly string[],
  role: string,
): Diagnostic {
  return sourceDiagnostic(
    script.sourceId,
    script,
    `A ${role}Script whose with statement may initialize ` +
      `${names.toSorted().join(", ")} is unsupported before ` +
      "a module graph.",
  );
}

/**
 * Resolve the prelude Script after the graph's cells, so its IDs never
 * collide with a module binding. A top-level `with` assignment that may
 * write a hidden fallback cell is rejected, because a module reading the
 * same name could not observe that cell.
 */
function resolveModulePrelude(
  prelude: SyntaxProgram,
  nextBindingId: number,
): ModulePreludeResolution {
  // The prelude runs before the module table exists, so an `import()` in
  // it names no target and keeps the profile diagnostic.
  const resolved = buildSeededHir(prelude, {
    fragmentMetadata: true,
    nextBindingId,
  });
  const failed = {
    diagnostics: resolved.diagnostics,
    nextBindingId: resolved.nextBindingId,
    nextFunctionId: resolved.nextFunctionId,
  };
  if (resolved.program == null || resolved.scriptBindings == null) {
    return failed;
  }
  const initializing = resolved.initializingWithNames ?? [];
  if (initializing.length > 0) {
    return {
      ...failed,
      diagnostics: [
        withInitializingDiagnostic(prelude, initializing, "prelude "),
      ],
    };
  }
  return {
    ...failed,
    prelude: {
      bindings: resolved.scriptBindings,
      globalObjectBindingIds: (resolved.program.globalObjectBindings ?? []).map(
        (binding) => binding.id,
      ),
      // Every range names the Script, as each module's ranges name the
      // module, so a runtime location never falls back to the entry's.
      hir: retainModuleSource(resolved.program, prelude.sourceId),
    },
  };
}

/**
 * The module table order: the entry's static closure in startup
 * evaluation order, then every module that only `import()` reaches, in
 * discovery order. Startup never evaluates the latter; the driver
 * evaluates each on its first request.
 */
function moduleTableOrder(linked: LinkedModuleGraph): readonly string[] {
  const scheduled = new Set(linked.evaluationOrder);
  return [
    ...linked.evaluationOrder,
    ...linked.modules
      .map((module) => module.canonicalId)
      .filter((moduleId) => !scheduled.has(moduleId)),
  ];
}

/**
 * The module table index of every `import()` site one referrer makes,
 * keyed by the call's start byte, as the HIR builder expects.
 */
function importCallTargetsFor(
  graph: ModuleGraph,
  moduleIndices: ReadonlyMap<string, number>,
  referrerId: string,
  referrerKind: "module" | "script",
): ReadonlyMap<number, number> {
  const targets = new Map<number, number>();
  for (const request of graph.requests ?? []) {
    if (
      request.edgeKind !== "discovery" ||
      request.referrer.id !== referrerId ||
      request.referrer.kind !== referrerKind
    ) {
      continue;
    }
    const index = moduleIndices.get(request.targetId);
    if (index == null) {
      throw new Error(`Import target '${request.targetId}' is unavailable.`);
    }
    targets.set(request.byteRange.start, index);
  }
  return targets;
}

/** The instantiated module environments and the table that names them. */
interface ModuleTableParts {
  readonly functions: readonly HirFunction[];
  readonly globalBindings: readonly HirGlobalBinding[];
  /**
   * Statements that instantiate every module environment, which run no
   * user code, in the order a program must run them.
   */
  readonly instantiation: readonly HirStatement[];
  readonly nextBindingId: number;
  readonly nextFunctionId: number;
  /** Per module: evaluator, await flag, namespace, and requests. */
  readonly tableArguments: readonly HirExpression[];
}

/**
 * Resolve every module body of a linked graph and build its table. The
 * `outer` Script's global declarations enclose each module environment.
 */
function compileModuleTable(
  graph: ModuleGraph,
  linked: LinkedModuleGraph,
  tableOrder: readonly string[],
  moduleIndices: ReadonlyMap<string, number>,
  ids: { readonly nextBindingId: number; readonly nextFunctionId: number },
  outer: ModulePrelude | undefined,
): ModuleTableParts | { readonly diagnostics: readonly Diagnostic[] } {
  const nodes = new Map(
    graph.modules.map((module) => [module.canonicalId, module]),
  );
  const linkedModules = new Map(
    linked.modules.map((module) => [module.canonicalId, module]),
  );
  const cells = new Map(linked.cells.map((cell) => [cell.id, cell]));
  const functionInitializers: HirStatement[] = [];
  const functions: HirFunction[] = [];
  const globalBindings: HirGlobalBinding[] = [];
  const intrinsicInitializers: HirStatement[] = [];
  const importMetaInitializers: HirStatement[] = [];
  const jsonInitializers: HirStatement[] = [];
  const moduleBodies = new Map<string, readonly HirStatement[]>();
  const varInitializers: HirStatement[] = [];
  let { nextBindingId, nextFunctionId } = ids;
  const namespaceBindings = new Map<string, number>();
  const namespaceInitializers: HirStatement[] = [];

  for (const module of linked.modules) {
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
      const targetRange = retainModuleSource(
        moduleNodeRange(targetNode),
        targetId,
      );
      namespaceInitializers.push(
        moduleNamespaceInitializer(target, bindingId, targetRange),
      );
    }
  }
  // An `export * as` entry can name a namespace that no module imports.
  for (const target of linked.modules) {
    const bindingId = target.namespaceCellId;
    if (bindingId == null || namespaceBindings.has(target.canonicalId)) {
      continue;
    }
    const targetNode = nodes.get(target.canonicalId);
    if (targetNode == null) {
      throw new Error(
        `Namespace module '${target.canonicalId}' is unavailable.`,
      );
    }
    namespaceBindings.set(target.canonicalId, bindingId);
    namespaceInitializers.push(
      moduleNamespaceInitializer(
        target,
        bindingId,
        retainModuleSource(moduleNodeRange(targetNode), target.canonicalId),
      ),
    );
  }

  for (const moduleId of tableOrder) {
    const node = nodes.get(moduleId);
    const linkedModule = linkedModules.get(moduleId);
    if (node == null || linkedModule == null) {
      throw new Error(`Linked module '${moduleId}' is unavailable.`);
    }
    if (node.moduleKind === "builtin") {
      const range = moduleNodeRange(node);
      for (const cellId of linkedModule.cellIds) {
        const cell = cells.get(cellId);
        if (cell == null) throw new Error("Missing builtin export cell.");
        const names: readonly string[] = builtinModuleExports[node.builtin];
        const exportIndex = names.indexOf(cell.localName);
        if (exportIndex < 0) continue;
        globalBindings.push({ id: cellId, name: cell.localName });
        intrinsicInitializers.push({
          kind: "const",
          hint: undefined,
          bindingId: cellId,
          name: cell.localName,
          range,
          initializer: {
            kind: "call",
            target: { kind: "builtin-export" },
            arguments: [
              moduleNumber(node.builtin === "node:process" ? 0 : 1, range),
              moduleNumber(exportIndex, range),
            ],
            range,
          },
        });
      }
      moduleBodies.set(moduleId, []);
      continue;
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
          importedBinding: true,
          mutable: false,
          name: imported.localName,
        });
        continue;
      }
      if (imported.cellId == null) continue;
      bindings.set(imported.localName, {
        id: imported.cellId,
        importedBinding: true,
        mutable: false,
        name: imported.localName,
      });
    }
    for (const cellId of linkedModule.cellIds) {
      const cell = cells.get(cellId);
      if (cell == null) throw new Error(`Module cell '${cellId}' is missing.`);
      if (bindings.has(cell.localName)) {
        const declaration = declarationNamed(
          moduleNodeSyntax(node).body,
          cell.localName,
        );
        return {
          diagnostics: [
            sourceDiagnostic(
              moduleId,
              declaration ?? { range: moduleNodeRange(node) },
              `Duplicate declaration '${cell.localName}'.`,
            ),
          ],
        };
      }
      bindings.set(cell.localName, {
        id: cell.id,
        mutable: false,
        name: cell.localName,
        pendingDeclaration: true,
      });
    }
    // The prelude's global names enclose the module environment, so a
    // module's own declarations and imports shadow them.
    const result = buildSeededHir(
      {
        body: moduleProgramBody(moduleNodeSyntax(node)),
        kind: "program",
        range: moduleNodeRange(node),
        sourceId: moduleId,
        strict: true,
      },
      {
        bindings,
        globalObjectBindingIds: outer?.globalObjectBindingIds ?? [],
        importCallTargets: importCallTargetsFor(
          graph,
          moduleIndices,
          moduleId,
          "module",
        ),
        moduleBody: true,
        nextBindingId,
        nextFunctionId,
        ...includePropertiesWhen(() => {
          if (outer == null) return undefined;
          return { outerBindings: outer.bindings };
        }),
      },
    );
    nextBindingId = result.nextBindingId;
    nextFunctionId = result.nextFunctionId;
    if (result.program == null) return { diagnostics: result.diagnostics };
    const moduleBody = retainModuleSource(result.program.body, moduleId);
    globalBindings.push(...(result.program.globalBindings ?? []));
    globalBindings.push(...collectHirBindings(moduleBody));
    const evaluationBody: HirStatement[] = [];
    const varNames = new Set(moduleNodeSyntax(node).varNames);
    for (const statement of moduleBody) {
      if (statement.kind === "let" && varNames.has(statement.name)) {
        // InitializeEnvironment creates each var binding as undefined
        // while linking; the source initializers stay in evaluation.
        if (statement.initializer.kind !== "undefined") {
          throw new Error(`Module var '${statement.name}' is not hoisted.`);
        }
        varInitializers.push(statement);
      } else if (
        statement.kind === "const" &&
        statement.bindingId === result.program.intrinsicGlobalObjectBindingId
      ) {
        intrinsicInitializers.push(statement);
      } else if (
        statement.kind === "const" &&
        statement.bindingId === result.program.importMetaBindingId
      ) {
        importMetaInitializers.push(statement);
      } else if (statement.kind === "function-init") {
        functionInitializers.push(statement);
      } else {
        evaluationBody.push(statement);
      }
    }
    // Asynchronous module evaluators use the same traced frames as async
    // functions, including suspension inside binding and assignment steps.
    if (node.moduleKind === "json") {
      const declaration = evaluationBody[0];
      if (evaluationBody.length !== 1 || declaration?.kind !== "const") {
        throw new Error("JSON module must construct one default value.");
      }
      const dataId = nextBindingId;
      nextBindingId += 1;
      const dataName = `*json-data:${moduleId}*`;
      globalBindings.push({ id: dataId, name: dataName });
      // Prepare parsed data before realm code can modify its construction.
      // Synthetic Link initializes the export to undefined; only its
      // scheduled Evaluate publishes the prepared value, including cycles.
      jsonInitializers.push(
        { ...declaration, bindingId: dataId, name: dataName },
        {
          ...declaration,
          initializer: moduleUndefined(declaration.range),
          kind: "let",
        },
      );
      moduleBodies.set(moduleId, [
        {
          expression: {
            bindingId: declaration.bindingId,
            kind: "binding-set",
            mutable: true,
            name: declaration.name,
            range: declaration.range,
            value: {
              bindingId: dataId,
              kind: "binding",
              name: dataName,
              range: declaration.range,
            },
          },
          kind: "expression",
          range: declaration.range,
        },
      ]);
    } else {
      moduleBodies.set(moduleId, evaluationBody);
    }
    functions.push(...retainModuleSource(result.program.functions, moduleId));
  }

  // Each table entry passes the evaluator, a top-level await flag, the
  // namespace object an `import()` resolves with, and the requested
  // modules in source order; the runtime driver keeps every other Cyclic
  // Module Record field.
  const tableArguments: HirExpression[] = [];
  for (const moduleId of tableOrder) {
    const node = nodes.get(moduleId);
    const moduleBody = moduleBodies.get(moduleId);
    if (node == null || moduleBody == null) {
      throw new Error(`Module evaluation '${moduleId}' is unavailable.`);
    }
    const range = retainModuleSource(moduleNodeRange(node), moduleId);
    // Asynchronous module evaluators use the same traced frames as async
    // functions, including suspension inside binding and assignment
    // steps.
    const hasTopLevelAwait = hirStatementsAreAsynchronous(moduleBody);
    const evaluator: HirFunction = {
      body: [
        ...moduleBody,
        { expression: moduleUndefined(range), kind: "return", range },
      ],
      functionLength: 0,
      functionKind: hasTopLevelAwait ? "async-arrow" : "arrow",
      id: nextFunctionId,
      kind: "hir-function",
      localBindingIds: [],
      name: `*module:${moduleId}*`,
      parameters: [],
      range,
      returnHints: [],
      strict: true,
    };
    nextFunctionId += 1;
    functions.push(evaluator);
    const requested = node.dependencies.map((dependency) => {
      const index = moduleIndices.get(dependency.canonicalId);
      if (index == null) {
        throw new Error(
          `Module dependency '${dependency.canonicalId}' is unavailable.`,
        );
      }
      return index;
    });
    const namespaceBinding = namespaceBindings.get(moduleId);
    tableArguments.push(
      moduleFunctionExpression(evaluator),
      moduleNumber(hasTopLevelAwait ? 1 : 0, range),
      namespaceBinding == null
        ? moduleUndefined(range)
        : {
            bindingId: namespaceBinding,
            kind: "binding",
            name: `*namespace:${moduleId}*`,
            range,
          },
      moduleNumber(requested.length, range),
      ...requested.map((index) => moduleNumber(index, range)),
    );
  }

  return {
    functions,
    globalBindings,
    instantiation: [
      ...intrinsicInitializers,
      // Each module's import.meta object exists before any function
      // initializer, so a hoisted function that a cyclic dependency calls
      // before its own module evaluates still reads that module's object.
      ...importMetaInitializers,
      ...namespaceInitializers,
      ...jsonInitializers,
      ...varInitializers,
      ...functionInitializers,
    ],
    nextBindingId,
    nextFunctionId,
    tableArguments,
  };
}

/**
 * Link and lower a closed module graph to shared-cell scheduled MIR.
 * A `prelude` Script runs to completion in the same realm before any
 * module links or evaluates; modules resolve its global declarations as
 * names of their outer global environment. The table does not exist
 * while the prelude runs, so an `import()` in it keeps the profile
 * diagnostic.
 *
 * The table holds every discovered module. A literal `import()` site
 * lowers to the runtime import operation with its target's constant
 * table index; modules that only such sites reach are linked and
 * instantiated at startup but evaluate only on request.
 */
export function compileModuleGraph(
  graph: ModuleGraph,
  options: CompilerOptions = {},
  prelude?: SyntaxProgram,
): ModuleCompilationResult {
  const linked = linkModuleGraph(graph);
  if (linked.graph == null) return { diagnostics: linked.diagnostics };
  const tableOrder = moduleTableOrder(linked.graph);
  const moduleIndices = new Map(
    tableOrder.map((moduleId, index) => [moduleId, index]),
  );
  const entryIndex = moduleIndices.get(graph.entryId);
  if (entryIndex == null) {
    throw new Error("The module entry has no evaluation index.");
  }
  let nextBindingId = linked.graph.cells.length;
  let nextFunctionId = 0;
  let resolvedPrelude: ModulePrelude | undefined;
  if (prelude != null) {
    const result = resolveModulePrelude(prelude, nextBindingId);
    if (result.prelude == null) {
      return { diagnostics: result.diagnostics, graph: linked.graph };
    }
    resolvedPrelude = result.prelude;
    nextBindingId = result.nextBindingId;
    nextFunctionId = result.nextFunctionId;
  }
  const parts = compileModuleTable(
    graph,
    linked.graph,
    tableOrder,
    moduleIndices,
    { nextBindingId, nextFunctionId },
    resolvedPrelude,
  );
  if ("diagnostics" in parts) {
    return { diagnostics: parts.diagnostics, graph: linked.graph };
  }

  const entry = graph.modules.find(
    (module) => module.canonicalId === graph.entryId,
  );
  if (entry == null) throw new Error("The module entry is unavailable.");
  const entryRange = retainModuleSource(moduleNodeRange(entry), graph.entryId);
  const preludeHir = resolvedPrelude?.hir;
  const hir: HirProgram = {
    body: [
      // The prelude Script completes before any module environment exists.
      ...(preludeHir?.body ?? []),
      ...parts.instantiation,
      // Evaluate the entry through the runtime driver. The returned
      // top-level capability promise is the entry task's completion.
      {
        expression: {
          arguments: [
            moduleNumber(entryIndex, entryRange),
            moduleNumber(tableOrder.length, entryRange),
            ...parts.tableArguments,
          ],
          kind: "call",
          range: entryRange,
          target: { kind: "module-evaluate" },
        },
        kind: "return",
        range: entryRange,
      },
    ],
    functions: [...(preludeHir?.functions ?? []), ...parts.functions],
    globalBindings: [
      ...(preludeHir?.globalBindings ?? []),
      ...parts.globalBindings,
    ],
    ...includePropertiesWhen(() => {
      if (preludeHir == null) return undefined;
      return {
        globalLexicalNames: preludeHir.globalLexicalNames ?? [],
        globalObjectBindings: preludeHir.globalObjectBindings ?? [],
      };
    }),
    kind: "hir-program",
    range: entryRange,
    sourceId: graph.entryId,
    // Every module body is its own strict evaluator function, so the
    // top-level statement list keeps the prelude Script's strictness.
    strict: preludeHir == null || preludeHir.strict === true,
  };
  return {
    diagnostics: [],
    graph: linked.graph,
    hir,
    mir: buildMir(hir, options),
  };
}

/** The modules a Script's `import()` calls reach, keyed for its build. */
export interface ScriptModuleRequests {
  /** The canonical identity the Script's requests resolved against. */
  readonly canonicalId: string;
  readonly closure: ScriptRequestClosure;
}

/** A Script's HIR with every module it requests instantiated first. */
export interface ScriptGraphHirResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly nextBindingId: number;
  readonly nextFunctionId: number;
  readonly program?: HirProgram;
}

/**
 * Resolve a Script whose `import()` calls name modules of `requests`.
 * The program instantiates every module environment and installs the
 * module table without evaluating any module, then runs the Script; each
 * module evaluates on its first request. The modules resolve the
 * Script's global declarations as names of their outer environment.
 */
export function buildScriptGraphHir(
  script: SyntaxProgram,
  requests: ScriptModuleRequests,
  seed: HirHostOptions = {},
): ScriptGraphHirResult {
  // A Script graph has no entry module, so startup schedules nothing.
  const graph: ModuleGraph = {
    entryId: "",
    kind: "module-graph",
    modules: requests.closure.modules,
    requests: requests.closure.requests,
  };
  const linked = linkModuleGraph(graph);
  if (linked.graph == null) {
    return {
      diagnostics: linked.diagnostics,
      nextBindingId: 0,
      nextFunctionId: 0,
    };
  }
  const tableOrder = moduleTableOrder(linked.graph);
  // A Script whose closure is empty has no table to install.
  if (tableOrder.length === 0) return buildSeededHir(script, seed);
  const moduleIndices = new Map(
    tableOrder.map((moduleId, index) => [moduleId, index]),
  );
  const resolved = buildSeededHir(script, {
    ...seed,
    fragmentMetadata: true,
    importCallTargets: importCallTargetsFor(
      graph,
      moduleIndices,
      requests.canonicalId,
      "script",
    ),
    nextBindingId: linked.graph.cells.length,
  });
  if (resolved.program == null || resolved.scriptBindings == null) {
    return resolved;
  }
  const initializing = resolved.initializingWithNames ?? [];
  if (initializing.length > 0) {
    return {
      diagnostics: [withInitializingDiagnostic(script, initializing, "")],
      nextBindingId: resolved.nextBindingId,
      nextFunctionId: resolved.nextFunctionId,
    };
  }
  const parts = compileModuleTable(
    graph,
    linked.graph,
    tableOrder,
    moduleIndices,
    {
      nextBindingId: resolved.nextBindingId,
      nextFunctionId: resolved.nextFunctionId,
    },
    {
      bindings: resolved.scriptBindings,
      globalObjectBindingIds: (resolved.program.globalObjectBindings ?? []).map(
        (binding) => binding.id,
      ),
      hir: resolved.program,
    },
  );
  if ("diagnostics" in parts) {
    return {
      diagnostics: parts.diagnostics,
      nextBindingId: resolved.nextBindingId,
      nextFunctionId: resolved.nextFunctionId,
    };
  }
  const range = script.range;
  return {
    diagnostics: [],
    nextBindingId: parts.nextBindingId,
    nextFunctionId: parts.nextFunctionId,
    program: {
      ...resolved.program,
      body: [
        // Instantiation runs no user code, and installing the table
        // evaluates nothing, so both may precede the Script.
        ...parts.instantiation,
        {
          expression: {
            arguments: [
              moduleNumber(tableOrder.length, range),
              moduleNumber(tableOrder.length, range),
              ...parts.tableArguments,
            ],
            kind: "call",
            range,
            target: { kind: "module-evaluate" },
          },
          kind: "expression",
          range,
        },
        ...resolved.program.body,
      ],
      functions: [...resolved.program.functions, ...parts.functions],
      globalBindings: [
        ...(resolved.program.globalBindings ?? []),
        ...parts.globalBindings,
      ],
    },
  };
}
