import { errorIntrinsicName } from "./hir.ts";
import type {
  Binding,
  HirArrayElement,
  HirBindingElement,
  HirBindingIdentifier,
  HirBindingPattern,
  HirBindingTarget,
  HirCallArgument,
  HirCallTarget,
  HirExpression,
  HirForDeclaration,
  HirForOfTarget,
  HirFunction,
  HirObjectBindingProperty,
  HirParameter,
  HirResult,
  HirStatement,
  HirSwitchCase,
  ResolveState,
} from "./hir.ts";
import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  BindingPatternMode,
  LocatedSyntax,
  SyntaxAssignmentPattern,
  SyntaxCallArgument,
  SyntaxExpression,
  SyntaxFunction,
  SyntaxProgram,
  SyntaxStatement,
} from "./syntax.ts";
export function sourceDiagnostic(
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

function resolveCallArgument(
  argument: SyntaxCallArgument,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirCallArgument | undefined {
  if (argument.kind === "spread") {
    const resolved = resolveExpression(argument.argument, scopes, state);
    return resolved == null ? undefined : { ...argument, argument: resolved };
  }
  return resolveExpression(argument, scopes, state);
}

function resolveExpression(
  expression: SyntaxExpression,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  if (
    expression.kind === "binding-set" ||
    expression.kind === "binding-update"
  ) {
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
          ...(binding.importedBinding === true
            ? { importedBinding: true }
            : {}),
          mutable: binding.mutable,
          value:
            expression.kind === "binding-set" ||
            expression.operator === "&&" ||
            expression.operator === "??" ||
            expression.operator === "||"
              ? inferFunctionName(value, binding.name)
              : value,
        };
  }
  if (expression.kind === "binding-step") {
    const binding = findBinding(scopes, expression.name);
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
    return {
      ...expression,
      bindingId: binding.id,
      ...(binding.functionNameBinding === true
        ? { functionNameBinding: true }
        : {}),
      ...(binding.importedBinding === true ? { importedBinding: true } : {}),
      mutable: binding.mutable,
    };
  }
  if (expression.kind === "destructuring-set") {
    const value = resolveExpression(expression.value, scopes, state);
    const pattern = resolveBindingPattern(
      expression.pattern,
      scopes,
      state,
      "write",
      true,
    );
    return value == null || pattern == null
      ? undefined
      : { ...expression, pattern, value };
  }
  if (expression.kind === "array") {
    const elements: HirArrayElement[] = [];
    for (const element of expression.elements) {
      if (element == null) {
        elements.push(undefined);
        continue;
      }
      if (element.kind === "spread") {
        const argument = resolveExpression(element.argument, scopes, state);
        if (argument == null) return undefined;
        elements.push({ ...element, argument });
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
      const errorName = errorIntrinsicName(expression.name);
      if (errorName != null) {
        return {
          errorName,
          kind: "error-intrinsic",
          range: expression.range,
        };
      }
      if (expression.name === "Symbol") {
        return { kind: "symbol-intrinsic", range: expression.range };
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
      expression.argument.name !== "Infinity" &&
      expression.argument.name !== "Symbol" &&
      errorIntrinsicName(expression.argument.name) == null
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
  if (expression.kind === "property-update") {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    const value = resolveExpression(expression.value, scopes, state);
    return object == null || key == null || value == null
      ? undefined
      : { ...expression, key, object, value };
  }
  if (expression.kind === "property-step") {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    return object == null || key == null
      ? undefined
      : { ...expression, key, object };
  }
  if (expression.kind === "new") {
    const argumentsValue: HirCallArgument[] = [];
    for (const argument of expression.arguments) {
      const resolved = resolveCallArgument(argument, scopes, state);
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
    const argumentsValue: HirCallArgument[] = [];
    for (const argument of expression.arguments) {
      const resolved = resolveCallArgument(argument, scopes, state);
      if (resolved == null) return undefined;
      argumentsValue.push(resolved);
    }
    return {
      arguments: argumentsValue,
      kind: "promise-construct",
      range: expression.range,
    };
  }
  const argumentValues: HirCallArgument[] = [];
  for (const argument of expression.arguments) {
    const resolved = resolveCallArgument(argument, scopes, state);
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
      expression.arguments.length > 1 &&
      !expression.arguments.some((argument) => argument.kind === "spread")
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

export type SyntaxStatementItem = SyntaxFunction | SyntaxStatement;

function syntaxBindingNames(
  pattern: SyntaxAssignmentPattern,
): readonly string[] {
  if (pattern.kind === "assignment-member") return [];
  if (pattern.kind === "binding-identifier") return [pattern.name];
  if (pattern.kind === "object-binding-pattern") {
    return [
      ...pattern.properties.flatMap((property) =>
        syntaxBindingNames(property.pattern),
      ),
      ...(pattern.rest == null ? [] : syntaxBindingNames(pattern.rest)),
    ];
  }
  return [
    ...pattern.elements.flatMap((element) =>
      element == null ? [] : syntaxBindingNames(element.pattern),
    ),
    ...(pattern.rest == null ? [] : syntaxBindingNames(pattern.rest)),
  ];
}

function predeclareBindings(
  statements: readonly SyntaxStatementItem[],
  scope: Map<string, Binding>,
  state: ResolveState,
): void {
  for (const statement of statements) {
    if (
      statement.kind === "binding-pattern" &&
      statement.mode === "declare" &&
      statement.declarationKind !== "var"
    ) {
      for (const name of syntaxBindingNames(statement.pattern)) {
        const previous = scope.get(name);
        if (previous != null && previous.pendingDeclaration !== true) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement,
              `Duplicate declaration '${name}'.`,
            ),
          );
          continue;
        }
        scope.set(name, {
          id: previous?.id ?? state.nextBindingId,
          mutable: statement.declarationKind === "let",
          name,
        });
        if (previous == null) state.nextBindingId += 1;
      }
      continue;
    }
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
      functionLength: functionValue.functionLength,
      kind: "function-init",
      name: bindingName,
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
  // Labels never cross a function boundary.
  const outerLabels = state.labels.splice(0);
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
  state.labels.push(...outerLabels);
  const resolved: HirFunction = {
    ...functionValue,
    body,
    functionLength: functionValue.functionLength ?? parameters.length,
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

export function hirBindingIdentifiers(
  pattern: HirBindingPattern,
): readonly HirBindingIdentifier[] {
  if (pattern.kind === "assignment-member") return [];
  if (pattern.kind === "binding-identifier") return [pattern];
  if (pattern.kind === "object-binding-pattern") {
    return [
      ...pattern.properties.flatMap((property) =>
        hirBindingIdentifiers(property.pattern),
      ),
      ...(pattern.rest == null ? [] : hirBindingIdentifiers(pattern.rest)),
    ];
  }
  return [
    ...pattern.elements.flatMap((element) =>
      element == null ? [] : hirBindingIdentifiers(element.pattern),
    ),
    ...(pattern.rest == null ? [] : hirBindingIdentifiers(pattern.rest)),
  ];
}

function hirCallArgumentHasAwait(argument: HirCallArgument): boolean {
  return hirExpressionHasAwait(
    argument.kind === "spread" ? argument.argument : argument,
  );
}

export function hirExpressionHasAwait(expression: HirExpression): boolean {
  if (expression.kind === "await") return true;
  if (
    expression.kind === "binding-set" ||
    expression.kind === "binding-update"
  ) {
    return hirExpressionHasAwait(expression.value);
  }
  if (expression.kind === "destructuring-set") {
    return (
      hirExpressionHasAwait(expression.value) ||
      hirBindingPatternHasAwait(expression.pattern)
    );
  }
  if (expression.kind === "array") {
    return expression.elements.some(
      (element) =>
        element != null &&
        hirExpressionHasAwait(
          element.kind === "spread" ? element.argument : element,
        ),
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
    return targetAwait || expression.arguments.some(hirCallArgumentHasAwait);
  }
  if (expression.kind === "new") {
    return (
      hirExpressionHasAwait(expression.callee) ||
      expression.arguments.some(hirCallArgumentHasAwait)
    );
  }
  if (expression.kind === "promise-construct") {
    return expression.arguments.some(hirCallArgumentHasAwait);
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
    expression.kind === "property-get" ||
    expression.kind === "property-step"
  ) {
    return (
      hirExpressionHasAwait(expression.object) ||
      hirExpressionHasAwait(expression.key)
    );
  }
  if (
    expression.kind === "property-set" ||
    expression.kind === "property-update"
  ) {
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

export function hirBindingPatternHasAwait(pattern: HirBindingPattern): boolean {
  if (pattern.kind === "assignment-member") {
    return (
      hirExpressionHasAwait(pattern.object) ||
      hirExpressionHasAwait(pattern.key)
    );
  }
  if (pattern.kind === "binding-identifier") return false;
  if (pattern.kind === "object-binding-pattern") {
    return (
      pattern.properties.some(
        (property) =>
          hirExpressionHasAwait(property.key) ||
          (property.initializer != null &&
            hirExpressionHasAwait(property.initializer)) ||
          hirBindingPatternHasAwait(property.pattern),
      ) ||
      (pattern.rest != null && hirBindingPatternHasAwait(pattern.rest))
    );
  }
  return (
    pattern.elements.some(
      (element) =>
        element != null &&
        ((element.initializer != null &&
          hirExpressionHasAwait(element.initializer)) ||
          hirBindingPatternHasAwait(element.pattern)),
    ) ||
    (pattern.rest != null && hirBindingPatternHasAwait(pattern.rest))
  );
}

export function declaredHirBindingIds(
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
    } else if (
      statement.kind === "binding-pattern" &&
      statement.mode === "declare" &&
      statement.declarationKind !== "var"
    ) {
      result.push(
        ...hirBindingIdentifiers(statement.pattern).map(
          (item) => item.bindingId,
        ),
      );
    } else if (statement.kind === "block") {
      result.push(...declaredHirBindingIds(statement.body));
    } else if (statement.kind === "if") {
      result.push(...declaredHirBindingIds([statement.consequent]));
      if (statement.alternate != null) {
        result.push(...declaredHirBindingIds([statement.alternate]));
      }
    } else if (
      statement.kind === "while" ||
      statement.kind === "do-while" ||
      statement.kind === "labeled"
    ) {
      result.push(...declaredHirBindingIds([statement.body]));
    } else if (statement.kind === "for") {
      for (const declaration of statement.declarations ?? []) {
        if (declaration.declarationKind === "var") continue;
        if (declaration.kind === "binding") {
          result.push(declaration.bindingId);
        } else {
          result.push(
            ...hirBindingIdentifiers(declaration.pattern).map(
              (item) => item.bindingId,
            ),
          );
        }
      }
      result.push(...declaredHirBindingIds([statement.body]));
    } else if (statement.kind === "for-of") {
      if (
        statement.target.kind === "declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        result.push(statement.target.bindingId);
      } else if (
        statement.target.kind === "pattern-declaration" &&
        statement.target.declarationKind !== "var"
      ) {
        result.push(
          ...hirBindingIdentifiers(statement.target.pattern).map(
            (item) => item.bindingId,
          ),
        );
      }
      result.push(...declaredHirBindingIds([statement.body]));
    } else if (statement.kind === "switch") {
      for (const switchCase of statement.cases) {
        result.push(...declaredHirBindingIds(switchCase.body));
      }
    } else if (statement.kind === "try") {
      result.push(...declaredHirBindingIds([statement.block]));
      if (statement.handler != null) {
        result.push(
          ...hirBindingIdentifiers(statement.handler.pattern).map(
            (item) => item.bindingId,
          ),
        );
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
    functionLength: resolved.functionLength,
    kind: "function",
    name: expression.inferredName ?? functionValue.name ?? "",
    range: expression.range,
  };
}

function resolveBindingPattern(
  pattern: SyntaxAssignmentPattern,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  mode: BindingPatternMode,
  allowAssignmentTargets: boolean,
): HirBindingPattern | undefined {
  if (pattern.kind === "assignment-member") {
    if (!allowAssignmentTargets) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          pattern,
          "Member targets are valid only in assignment patterns.",
        ),
      );
      return undefined;
    }
    const object = resolveExpression(pattern.object, scopes, state);
    const key = resolveExpression(pattern.key, scopes, state);
    return object == null || key == null
      ? undefined
      : { ...pattern, key, object };
  }
  if (pattern.kind === "binding-identifier") {
    const binding =
      mode === "declare"
        ? scopes.at(-1)?.get(pattern.name)
        : findBinding(scopes, pattern.name);
    if (binding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          pattern,
          `Unknown binding '${pattern.name}'.`,
        ),
      );
      return undefined;
    }
    return {
      ...pattern,
      bindingId: binding.id,
      ...(binding.functionNameBinding === true
        ? { functionNameBinding: true as const }
        : {}),
      ...(binding.importedBinding === true
        ? { importedBinding: true as const }
        : {}),
      mutable: binding.mutable,
    };
  }
  if (pattern.kind === "object-binding-pattern") {
    const properties: HirObjectBindingProperty[] = [];
    for (const property of pattern.properties) {
      const key = resolveExpression(property.key, scopes, state);
      const resolvedPattern = resolveBindingPattern(
        property.pattern,
        scopes,
        state,
        mode,
        allowAssignmentTargets,
      );
      let initializer =
        property.initializer == null
          ? undefined
          : resolveExpression(property.initializer, scopes, state);
      if (
        initializer != null &&
        resolvedPattern?.kind === "binding-identifier"
      ) {
        initializer = inferFunctionName(initializer, resolvedPattern.name);
      }
      if (
        key == null ||
        resolvedPattern == null ||
        (property.initializer != null && initializer == null)
      ) {
        return undefined;
      }
      properties.push({
        ...(property.byteRange == null
          ? {}
          : { byteRange: property.byteRange }),
        ...(initializer == null ? {} : { initializer }),
        key,
        pattern: resolvedPattern,
        range: property.range,
      });
    }
    let rest: HirBindingTarget | undefined;
    if (pattern.rest != null) {
      const resolvedRest = resolveBindingPattern(
        pattern.rest,
        scopes,
        state,
        mode,
        allowAssignmentTargets,
      );
      if (
        resolvedRest?.kind !== "binding-identifier" &&
        resolvedRest?.kind !== "assignment-member"
      ) {
        return undefined;
      }
      rest = resolvedRest;
    }
    return {
      ...(pattern.byteRange == null ? {} : { byteRange: pattern.byteRange }),
      kind: "object-binding-pattern",
      properties,
      ...(rest == null ? {} : { rest }),
      range: pattern.range,
    };
  }
  const elements: (HirBindingElement | undefined)[] = [];
  for (const element of pattern.elements) {
    if (element == null) {
      elements.push(undefined);
      continue;
    }
    const resolvedPattern = resolveBindingPattern(
      element.pattern,
      scopes,
      state,
      mode,
      allowAssignmentTargets,
    );
    let initializer =
      element.initializer == null
        ? undefined
        : resolveExpression(element.initializer, scopes, state);
    if (initializer != null && resolvedPattern?.kind === "binding-identifier") {
      initializer = inferFunctionName(initializer, resolvedPattern.name);
    }
    if (
      resolvedPattern == null ||
      (element.initializer != null && initializer == null)
    ) {
      return undefined;
    }
    elements.push({
      ...(element.byteRange == null ? {} : { byteRange: element.byteRange }),
      ...(initializer == null ? {} : { initializer }),
      pattern: resolvedPattern,
      range: element.range,
    });
  }
  const rest =
    pattern.rest == null
      ? undefined
      : resolveBindingPattern(
          pattern.rest,
          scopes,
          state,
          mode,
          allowAssignmentTargets,
        );
  if (pattern.rest != null && rest == null) return undefined;
  return {
    ...(pattern.byteRange == null ? {} : { byteRange: pattern.byteRange }),
    elements,
    kind: "array-binding-pattern",
    ...(rest == null ? {} : { rest }),
    range: pattern.range,
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
  if (statement.kind === "binding-pattern") {
    const initializer = resolveExpression(statement.initializer, scopes, state);
    const pattern = resolveBindingPattern(
      statement.pattern,
      scopes,
      state,
      statement.mode,
      false,
    );
    return initializer == null || pattern == null
      ? undefined
      : { ...statement, initializer, pattern };
  }
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
          readonly body: HirStatement;
          readonly pattern: HirBindingPattern;
          readonly range: SourceRange;
        }
      | undefined;
    if (statement.handler != null) {
      const catchScope = new Map<string, Binding>();
      for (const name of syntaxBindingNames(statement.handler.pattern)) {
        if (catchScope.has(name)) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement.handler.pattern,
              `Duplicate catch binding '${name}'.`,
            ),
          );
          return undefined;
        }
        catchScope.set(name, {
          id: state.nextBindingId,
          mutable: true,
          name,
        });
        state.nextBindingId += 1;
      }
      const pattern = resolveBindingPattern(
        statement.handler.pattern,
        [...scopes, catchScope],
        state,
        "declare",
        false,
      );
      if (pattern == null) return undefined;
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
        body,
        pattern,
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
    if (statement.label != null) {
      const label = state.labels.findLast(
        (entry) => entry.name === statement.label,
      );
      const valid = label != null && (statement.kind === "break" || label.loop);
      if (!valid) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            statement,
            label == null
              ? `Undefined label '${statement.label}'.`
              : `A continue label must reference an enclosing loop.`,
          ),
        );
        return undefined;
      }
      return statement;
    }
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
  if (statement.kind === "labeled") {
    if (state.labels.some((entry) => entry.name === statement.label)) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          statement,
          `Duplicate label '${statement.label}'.`,
        ),
      );
      return undefined;
    }
    let terminal: SyntaxStatement = statement.body;
    while (terminal.kind === "labeled") terminal = terminal.body;
    const loop =
      terminal.kind === "while" ||
      terminal.kind === "do-while" ||
      terminal.kind === "for" ||
      terminal.kind === "for-of";
    state.labels.push({ loop, name: statement.label });
    const body = resolveStatement(
      statement.body,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    state.labels.pop();
    return body == null ? undefined : { ...statement, body };
  }
  if (statement.kind === "for") {
    const forScope = new Map<string, Binding>();
    const forScopes = [...scopes, forScope];
    let declarations: HirForDeclaration[] | undefined;
    let init: HirExpression | undefined;
    if (statement.declarations != null) {
      for (const declaration of statement.declarations) {
        if (declaration.declarationKind === "var") continue;
        const names =
          declaration.kind === "binding"
            ? [declaration.name]
            : syntaxBindingNames(declaration.pattern);
        for (const name of names) {
          if (forScope.has(name)) {
            state.diagnostics.push(
              sourceDiagnostic(
                state.sourceId,
                statement,
                `Duplicate declaration '${name}'.`,
              ),
            );
            return undefined;
          }
          forScope.set(name, {
            id: state.nextBindingId,
            mutable: declaration.declarationKind === "let",
            name,
          });
          state.nextBindingId += 1;
        }
      }
      declarations = [];
      for (const declaration of statement.declarations) {
        const declarationScopes =
          declaration.declarationKind === "var" ? scopes : forScopes;
        const initializer = resolveExpression(
          declaration.initializer,
          declarationScopes,
          state,
        );
        if (initializer == null) return undefined;
        if (declaration.kind === "binding") {
          const binding =
            declaration.declarationKind === "var"
              ? findBinding(scopes, declaration.name)
              : forScope.get(declaration.name);
          if (binding == null) return undefined;
          declarations.push({
            bindingId: binding.id,
            declarationKind: declaration.declarationKind,
            hint: declaration.hint,
            initializer: inferFunctionName(initializer, declaration.name),
            kind: "binding",
            name: declaration.name,
            range: declaration.range,
          });
          continue;
        }
        const pattern = resolveBindingPattern(
          declaration.pattern,
          declarationScopes,
          state,
          declaration.declarationKind === "var" ? "write" : "declare",
          false,
        );
        if (pattern == null) return undefined;
        declarations.push({
          declarationKind: declaration.declarationKind,
          initializer,
          kind: "pattern",
          pattern,
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
  if (statement.kind === "for-of") {
    let forScopes = scopes;
    let declaredBinding: Binding | undefined;
    let patternScope: Map<string, Binding> | undefined;
    if (
      statement.target.kind === "declaration" &&
      statement.target.declarationKind !== "var"
    ) {
      declaredBinding = {
        id: state.nextBindingId,
        mutable: statement.target.declarationKind === "let",
        name: statement.target.name,
      };
      state.nextBindingId += 1;
      forScopes = [
        ...scopes,
        new Map([[statement.target.name, declaredBinding]]),
      ];
    } else if (
      statement.target.kind === "pattern-declaration" &&
      statement.target.declarationKind !== "var"
    ) {
      patternScope = new Map<string, Binding>();
      for (const name of syntaxBindingNames(statement.target.pattern)) {
        if (patternScope.has(name)) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement.target.pattern,
              `Duplicate for-of binding '${name}'.`,
            ),
          );
          return undefined;
        }
        patternScope.set(name, {
          id: state.nextBindingId,
          mutable: statement.target.declarationKind === "let",
          name,
        });
        state.nextBindingId += 1;
      }
      forScopes = [...scopes, patternScope];
    }
    const iterable = resolveExpression(statement.iterable, forScopes, state);
    let target: HirForOfTarget | undefined;
    if (statement.target.kind === "declaration") {
      const binding =
        declaredBinding ?? findBinding(scopes, statement.target.name);
      if (binding == null) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            statement.target,
            `Unknown binding '${statement.target.name}'.`,
          ),
        );
      } else {
        target = {
          ...statement.target,
          bindingId: binding.id,
          mutable: binding.mutable,
        };
      }
    } else if (statement.target.kind === "pattern-declaration") {
      const lexical = statement.target.declarationKind !== "var";
      const pattern = resolveBindingPattern(
        statement.target.pattern,
        lexical ? forScopes : scopes,
        state,
        lexical ? "declare" : "write",
        false,
      );
      if (pattern != null) {
        target = { ...statement.target, pattern };
      }
    } else if (statement.target.kind === "assignment-pattern") {
      const pattern = resolveBindingPattern(
        statement.target.pattern,
        scopes,
        state,
        "write",
        true,
      );
      if (pattern != null) {
        target = { ...statement.target, pattern };
      }
    } else if (statement.target.kind === "binding") {
      const binding = findBinding(scopes, statement.target.name);
      if (binding == null) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            statement.target,
            `Unknown binding '${statement.target.name}'.`,
          ),
        );
      } else {
        target = {
          ...statement.target,
          bindingId: binding.id,
          ...(binding.functionNameBinding === true
            ? { functionNameBinding: true as const }
            : {}),
          ...(binding.importedBinding === true
            ? { importedBinding: true as const }
            : {}),
          mutable: binding.mutable,
        };
      }
    } else {
      const object = resolveExpression(statement.target.object, scopes, state);
      const key = resolveExpression(statement.target.key, scopes, state);
      if (object != null && key != null) {
        target = { ...statement.target, key, object };
      }
    }
    const body = resolveStatement(
      statement.body,
      forScopes,
      state,
      functionBody,
      loopDepth + 1,
      breakDepth + 1,
    );
    if (iterable == null || target == null || body == null) return undefined;
    return { ...statement, body, iterable, target };
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

export function buildSeededHir(
  program: SyntaxProgram,
  seed: HirSeed = {},
): SeededHirResult {
  const diagnostics: Diagnostic[] = [];
  const state: ResolveState = {
    diagnostics,
    functionInfo: new Map(),
    hirFunctions: [],
    labels: [],
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
