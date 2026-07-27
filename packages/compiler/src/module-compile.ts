import type {
  Binding,
  HirCallArgument,
  HirExpression,
  HirFunction,
  HirGlobalBinding,
  HirObjectProperty,
  HirObjectSpreadProperty,
  HirParameter,
  HirProgram,
  HirStatement,
} from "./hir.ts";
import {
  buildSeededHir,
  hirBindingIdentifiers,
  hirBindingPatternHasAwait,
  hirExpressionHasAwait,
  sourceDiagnostic,
  type SyntaxStatementItem,
} from "./hir-build.ts";
import type { CompilerOptions, MirProgram } from "./mir.ts";
import { buildMir } from "./mir-build.ts";
import { linkModuleGraph } from "./modules.ts";
import type { LinkedModuleGraph } from "./modules.ts";
import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  ModuleGraph,
  SyntaxExpression,
  SyntaxModule,
  SyntaxProgram,
} from "./syntax.ts";
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
      (statement.handler != null && recurse(statement.handler.body)) ||
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
      (statement.declarations ?? []).some((declaration) =>
        hirExpressionHasAwait(declaration.initializer),
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
  return (
    (statement.kind === "while" || statement.kind === "do-while") &&
    (hirExpressionHasAwait(statement.test) || recurse(statement.body))
  );
}

function hirStatementHasAwait(statement: HirStatement): boolean {
  return hirStatementAwaits(statement, false);
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
        for (const binding of hirBindingIdentifiers(
          statement.handler.pattern,
        )) {
          bindings.push({ id: binding.bindingId, name: binding.name });
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

function hirArgumentExpressions(
  argumentsValue: readonly HirCallArgument[],
): readonly HirExpression[] {
  return argumentsValue.map((argument) =>
    argument.kind === "spread" ? argument.argument : argument,
  );
}

function rebuildHirArguments(
  original: readonly HirCallArgument[],
  rebuilt: readonly HirExpression[],
): readonly HirCallArgument[] {
  return original.map((argument, index) =>
    argument.kind === "spread"
      ? { ...argument, argument: rebuilt[index]! }
      : rebuilt[index]!,
  );
}

/**
 * Maps each object literal property to the index of its first flattened
 * child, since a spread contributes one child and every other property kind
 * contributes a key and a value.
 */
function objectPropertyChildOffsets(
  properties: readonly HirObjectProperty[],
): readonly number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const property of properties) {
    offsets.push(cursor);
    cursor += property.kind === "spread" ? 1 : 2;
  }
  return offsets;
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
  if (
    expression.kind === "binding-set" ||
    expression.kind === "binding-update"
  ) {
    return {
      children: [expression.value],
      rebuild: ([value]) => ({ ...expression, value: value! }),
    };
  }
  if (expression.kind === "destructuring-set") {
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
      children: indices.map((index) => {
        const element = expression.elements[index]!;
        return element.kind === "spread" ? element.argument : element;
      }),
      rebuild: (children) => ({
        ...expression,
        elements: expression.elements.map((element, index) => {
          const childIndex = indices.indexOf(index);
          if (childIndex < 0 || element == null) return element;
          const child = children[childIndex]!;
          return element.kind === "spread"
            ? { ...element, argument: child }
            : child;
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
    const argumentChildren = hirArgumentExpressions(expression.arguments);
    const rebuildArguments = (argumentsValue: readonly HirExpression[]) =>
      rebuildHirArguments(expression.arguments, argumentsValue);
    if (expression.target.kind === "dynamic") {
      return {
        children: [expression.target.callee, ...argumentChildren],
        rebuild: ([callee, ...argumentsValue]) => ({
          ...expression,
          arguments: rebuildArguments(argumentsValue),
          target: { callee: callee!, kind: "dynamic" },
        }),
      };
    }
    if (expression.target.kind === "method") {
      return {
        children: [
          expression.target.object,
          expression.target.key,
          ...argumentChildren,
        ],
        rebuild: ([object, key, ...argumentsValue]) => ({
          ...expression,
          arguments: rebuildArguments(argumentsValue),
          target: { key: key!, kind: "method", object: object! },
        }),
      };
    }
    return {
      children: argumentChildren,
      rebuild: (argumentsValue) => ({
        ...expression,
        arguments: rebuildArguments(argumentsValue),
      }),
    };
  }
  if (expression.kind === "new") {
    const argumentChildren = hirArgumentExpressions(expression.arguments);
    return {
      children: [expression.callee, ...argumentChildren],
      rebuild: ([callee, ...argumentsValue]) => ({
        ...expression,
        arguments: rebuildHirArguments(expression.arguments, argumentsValue),
        callee: callee!,
      }),
    };
  }
  if (expression.kind === "promise-construct") {
    return {
      children: hirArgumentExpressions(expression.arguments),
      rebuild: (argumentsValue) => ({
        ...expression,
        arguments: rebuildHirArguments(expression.arguments, argumentsValue),
      }),
    };
  }
  if (expression.kind === "object") {
    const offsets = objectPropertyChildOffsets(expression.properties);
    const children = expression.properties.flatMap((property) =>
      property.kind === "spread"
        ? [property.argument]
        : [property.key, property.value],
    );
    return {
      children,
      rebuild: (rebuilt) => ({
        ...expression,
        properties: expression.properties.map((property, index) => {
          const offset = offsets[index]!;
          return property.kind === "spread"
            ? { ...property, argument: rebuilt[offset] ?? property.argument }
            : {
                ...property,
                key: rebuilt[offset] ?? property.key,
                value: rebuilt[offset + 1] ?? property.value,
              };
        }),
      }),
    };
  }
  if (
    expression.kind === "property-delete" ||
    expression.kind === "property-get" ||
    expression.kind === "property-step"
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
  if (
    expression.kind === "property-set" ||
    expression.kind === "property-update"
  ) {
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
    (expression.kind === "binding-update" ||
      expression.kind === "property-update") &&
    hirExpressionHasAwait(expression)
  ) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        expression,
        "Await inside a compound assignment is unsupported.",
      ),
    );
    return undefined;
  }
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
  if (expression.kind === "array") {
    const preceding = expression.elements
      .filter((element) => element != null)
      .slice(0, childIndex)
      .find((element) => element.kind === "spread");
    if (preceding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          preceding,
          "Array spread before a top-level await point is unsupported.",
        ),
      );
      return undefined;
    }
  }
  if (expression.kind === "call") {
    const targetChildren =
      expression.target.kind === "dynamic"
        ? 1
        : expression.target.kind === "method"
          ? 2
          : 0;
    const argumentIndex = childIndex - targetChildren;
    const preceding =
      argumentIndex < 0
        ? undefined
        : expression.arguments
            .slice(0, argumentIndex)
            .find((argument) => argument.kind === "spread");
    if (preceding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          preceding,
          "Call argument spread before a top-level await point is " +
            "unsupported.",
        ),
      );
      return undefined;
    }
  }
  if (expression.kind === "object") {
    const offsets = objectPropertyChildOffsets(expression.properties);
    const preceding = expression.properties.find(
      (property, index): property is HirObjectSpreadProperty =>
        property.kind === "spread" && offsets[index]! < childIndex,
    );
    if (preceding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          preceding,
          "Object spread before a top-level await point is unsupported.",
        ),
      );
      return undefined;
    }
  }
  if (expression.kind === "new" || expression.kind === "promise-construct") {
    const targetChildren = expression.kind === "new" ? 1 : 0;
    const argumentIndex = childIndex - targetChildren;
    const preceding =
      argumentIndex < 0
        ? undefined
        : expression.arguments
            .slice(0, argumentIndex)
            .find((argument) => argument.kind === "spread");
    if (preceding != null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          preceding,
          "Constructor argument spread before a top-level await point is " +
            "unsupported.",
        ),
      );
      return undefined;
    }
  }
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
          statement.kind === "let" ||
          statement.kind === "binding-pattern"
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
      if (statement.kind === "binding-pattern") {
        return {
          ...statement,
          initializer: resumed,
          mode: statement.declarationKind === "var" ? "write" : "initialize",
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
    functionLength: functionValue.functionLength,
    kind: "function",
    name: functionValue.name,
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
    const diagnosticCount = state.diagnostics.length;
    const point = moduleAwaitPoint(statement, state);
    if (point == null) {
      if (state.diagnostics.length > diagnosticCount) return undefined;
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
      functionLength: 1,
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
      hirStatementsAreAsynchronous(moduleBodies.get(moduleId) ?? []),
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
    const awaitStatement = moduleBody.find(hirStatementIsAsynchronous);
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
      functionLength: 0,
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
