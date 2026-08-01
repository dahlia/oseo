import { anonymousDefinition, errorIntrinsicName } from "./hir.ts";
import type {
  Binding,
  HirArrayElement,
  HirBindingElement,
  HirBindingIdentifier,
  HirBindingPattern,
  HirBindingTarget,
  HirCallArgument,
  HirCallTarget,
  HirClassElement,
  HirClassField,
  HirClassNameBinding,
  HirClassThisBinding,
  HirExpression,
  HirForDeclaration,
  HirForOfTarget,
  HirFunction,
  HirObjectBindingProperty,
  HirObjectProperty,
  HirOptionalChainLink,
  HirParameter,
  HirPrivateName,
  HirPrivateNameKey,
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
  SyntaxClassField,
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

interface NameResolution {
  readonly binding?: Binding;
  readonly objectBindingIds: readonly number[];
}

/**
 * Resolve one name while retaining each intervening `with` object.
 * A lexical binding stops the search, so an outer `with` environment
 * cannot bypass a nearer declarative environment.
 */
function resolveName(
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  name: string,
): NameResolution {
  const objectBindingIds: number[] = [];
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    if (scope == null) continue;
    const binding = scope.get(name);
    if (binding != null) return { binding, objectBindingIds };
    const objectBindingId = state.withScopes.get(scope);
    if (objectBindingId != null) objectBindingIds.push(objectBindingId);
  }
  return { objectBindingIds };
}

/** Allocate the uninitialized fallback behind an unresolved `with` name. */
function withFallbackBinding(name: string, state: ResolveState): Binding {
  const owner = state.withFallbacks.at(-1);
  if (owner == null) {
    throw new Error("A with fallback was requested outside a with statement.");
  }
  const existing = owner.get(name);
  if (existing != null) return existing;
  const binding: Binding = {
    id: state.nextBindingId,
    mutable: true,
    name,
  };
  state.nextBindingId += 1;
  owner.set(name, binding);
  return binding;
}

function bindingExpression(
  binding: Binding,
  range: SourceRange,
): HirExpression {
  return {
    bindingId: binding.id,
    kind: "binding",
    name: binding.name,
    range,
  };
}

/**
 * Build the statically owned fallback for a name read through `with`.
 * An otherwise unresolved name receives an uninitialized hidden cell,
 * preserving the ReferenceError when every object environment misses.
 */
function identifierFallback(
  name: string,
  range: SourceRange,
  binding: Binding | undefined,
  state: ResolveState,
): HirExpression {
  if (binding != null) return bindingExpression(binding, range);
  if (name === "undefined") return { kind: "undefined", range };
  if (name === "NaN" || name === "Infinity") {
    return {
      kind: "number",
      range,
      value: name === "NaN" ? NaN : Infinity,
    };
  }
  const errorName = errorIntrinsicName(name);
  if (errorName != null) return { errorName, kind: "error-intrinsic", range };
  if (name === "Symbol") return { kind: "symbol-intrinsic", range };
  return bindingExpression(withFallbackBinding(name, state), range);
}

/** The source location of one syntax node, without its other fields. */
function locatedOf(value: LocatedSyntax): LocatedSyntax {
  return {
    ...(value.byteRange == null ? {} : { byteRange: value.byteRange }),
    range: value.range,
  };
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

/**
 * Applies NamedEvaluation to an anonymous function or class expression.
 * A class carries its name on the constructor closure, so an anonymous
 * class takes the storage name the same way an anonymous function does.
 */
function inferFunctionName(
  expression: HirExpression,
  name: string,
): HirExpression {
  if (expression.kind === "function" && expression.name === "") {
    return { ...expression, name };
  }
  if (
    expression.kind === "class" &&
    expression.constructorFunction.kind === "function" &&
    expression.constructorFunction.name === ""
  ) {
    return {
      ...expression,
      constructorFunction: { ...expression.constructorFunction, name },
    };
  }
  return expression;
}

/**
 * Resolves one private name against the enclosing class bodies. A class
 * body binds every private name it declares in its own scope under the
 * spelled `#name`, which no identifier can collide with, so an inner
 * class shadows an outer declaration of the same name and a reference
 * outside every declaring body reports an unresolved name.
 */
function resolvePrivateName(
  name: string,
  located: LocatedSyntax,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirPrivateName | undefined {
  const binding = findBinding(scopes, name);
  if (binding == null) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        located,
        `Private name ${name} is not declared in an enclosing class body.`,
      ),
    );
    return undefined;
  }
  return { bindingId: binding.id, name };
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

/** Resolves one optional chain without inflating the recursive dispatcher. */
function resolveOptionalChain(
  expression: Extract<SyntaxExpression, { readonly kind: "optional-chain" }>,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): Extract<HirExpression, { readonly kind: "optional-chain" }> | undefined {
  const base = resolveExpression(expression.base, scopes, state);
  if (base == null) return undefined;
  const links: HirOptionalChainLink[] = [];
  for (const link of expression.links) {
    if (link.kind === "member") {
      const key = resolveExpression(link.key, scopes, state);
      if (key == null) return undefined;
      links.push({ ...link, key });
      continue;
    }
    if (link.kind === "private-member") {
      const privateName = resolvePrivateName(link.name, link, scopes, state);
      if (privateName == null) return undefined;
      links.push({
        ...locatedOf(link),
        kind: "private-member",
        optional: link.optional,
        privateName,
      });
      continue;
    }
    const argumentsValue: HirCallArgument[] = [];
    for (const argument of link.arguments) {
      const resolved = resolveCallArgument(argument, scopes, state);
      if (resolved == null) return undefined;
      argumentsValue.push(resolved);
    }
    links.push({ ...link, arguments: argumentsValue });
  }
  return { ...expression, base, links };
}

/** Whether a global name is implemented without a deletable global object. */
function isRuntimeOwnedIntrinsicName(name: string): boolean {
  return (
    name === "console" ||
    name === "Object" ||
    name === "Promise" ||
    name === "Symbol" ||
    name === "setTimeout" ||
    name === "clearTimeout" ||
    errorIntrinsicName(name) != null
  );
}

/**
 * Resolve an identifier delete without reading the selected binding. The
 * closed-world profile can decide declarative and unresolvable references
 * statically. Runtime-owned intrinsic globals stay invalid until deleting a
 * global property can also affect later name resolution.
 */
function resolveIdentifierDelete(
  expression: Extract<SyntaxExpression, { readonly kind: "delete" }>,
  argument: Extract<SyntaxExpression, { readonly kind: "identifier" }>,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  const resolution = resolveName(scopes, state, argument.name);
  let fallbackResult: boolean;
  if (resolution.binding != null) {
    fallbackResult = false;
  } else if (
    argument.name === "undefined" ||
    argument.name === "NaN" ||
    argument.name === "Infinity"
  ) {
    fallbackResult = false;
  } else if (isRuntimeOwnedIntrinsicName(argument.name)) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        argument,
        `Deleting runtime intrinsic binding '${argument.name}' is outside ` +
          "the admitted global-object profile.",
      ),
    );
    return undefined;
  } else if (argument.name === "arguments") {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        argument,
        "Deleting an unavailable 'arguments' binding is outside the " +
          "admitted function profile.",
      ),
    );
    return undefined;
  } else {
    fallbackResult = true;
  }
  if (resolution.objectBindingIds.length > 0) {
    if (state.withFallbacks.some((owner) => owner.has(argument.name))) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          argument,
          `Deleting with fallback binding '${argument.name}' is outside ` +
            "the admitted global-object profile.",
        ),
      );
      return undefined;
    }
    return {
      ...locatedOf(expression),
      fallbackResult,
      kind: "with-delete",
      name: argument.name,
      objectBindingIds: resolution.objectBindingIds,
    };
  }
  return {
    kind: "boolean",
    range: expression.range,
    value: fallbackResult,
  };
}

function resolveExpression(
  expression: SyntaxExpression,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  if (expression.kind === "delete") {
    if (expression.argument.kind === "identifier") {
      return resolveIdentifierDelete(
        expression,
        expression.argument,
        scopes,
        state,
      );
    }
    if (expression.argument.kind === "optional-chain") {
      const chain = resolveOptionalChain(expression.argument, scopes, state);
      return chain == null ? undefined : { ...chain, delete: true };
    }
    const argument = resolveExpression(expression.argument, scopes, state);
    return argument == null
      ? undefined
      : { ...expression, argument, kind: "delete-value" };
  }
  if (
    expression.kind === "binding-set" ||
    expression.kind === "binding-update"
  ) {
    const resolution = resolveName(scopes, state, expression.name);
    const value = resolveExpression(expression.value, scopes, state);
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    if (value == null) return undefined;
    const binding =
      resolution.binding ?? withFallbackBinding(expression.name, state);
    const inferred =
      expression.kind === "binding-set" ||
      expression.operator === "&&" ||
      expression.operator === "??" ||
      expression.operator === "||"
        ? inferFunctionName(value, binding.name)
        : value;
    if (resolution.objectBindingIds.length > 0) {
      const fallback = {
        bindingId: binding.id,
        ...(binding.functionNameBinding === true
          ? { functionNameBinding: true as const }
          : {}),
        ...(binding.importedBinding === true
          ? { importedBinding: true as const }
          : {}),
        mutable: binding.mutable,
        name: binding.name,
      };
      if (expression.kind === "binding-set") {
        return {
          ...expression,
          fallback,
          kind: "with-set",
          objectBindingIds: resolution.objectBindingIds,
          value: inferred,
        };
      }
      return {
        ...expression,
        fallback,
        kind: "with-update",
        objectBindingIds: resolution.objectBindingIds,
        value: inferred,
      };
    }
    return {
      ...expression,
      bindingId: binding.id,
      ...(binding.functionNameBinding === true
        ? { functionNameBinding: true }
        : {}),
      ...(binding.importedBinding === true ? { importedBinding: true } : {}),
      mutable: binding.mutable,
      value: inferred,
    };
  }
  if (expression.kind === "binding-step") {
    const resolution = resolveName(scopes, state, expression.name);
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          `Unknown binding '${expression.name}'.`,
        ),
      );
      return undefined;
    }
    const binding =
      resolution.binding ?? withFallbackBinding(expression.name, state);
    if (resolution.objectBindingIds.length > 0) {
      return {
        ...expression,
        fallback: {
          bindingId: binding.id,
          ...(binding.functionNameBinding === true
            ? { functionNameBinding: true }
            : {}),
          ...(binding.importedBinding === true
            ? { importedBinding: true }
            : {}),
          mutable: binding.mutable,
          name: binding.name,
        },
        kind: "with-step",
        objectBindingIds: resolution.objectBindingIds,
      };
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
  if (expression.kind === "template-object") return expression;
  if (expression.kind === "await") {
    const argument = resolveExpression(expression.argument, scopes, state);
    return argument == null ? undefined : { ...expression, argument };
  }
  if (expression.kind === "yield") {
    if (expression.argument == null) {
      return {
        ...(expression.byteRange == null
          ? {}
          : { byteRange: expression.byteRange }),
        kind: "yield",
        range: expression.range,
      };
    }
    const argument = resolveExpression(expression.argument, scopes, state);
    return argument == null ? undefined : { ...expression, argument };
  }
  if (expression.kind === "super-base") {
    // The receiver is the enclosing element's own `this`, so a reference
    // inside a derived constructor reads the binding `super()`
    // initializes and observes its temporal dead zone before then.
    const receiver = resolveExpression(
      { kind: "this", range: expression.range },
      scopes,
      state,
    );
    return receiver == null ? undefined : { ...expression, receiver };
  }
  if (expression.kind === "this" && state.thisBinding != null) {
    // A derived constructor reaches `this` through a binding that stays
    // uninitialized until `super()` runs, so reading it early throws.
    return {
      bindingId: state.thisBinding.bindingId,
      kind: "binding",
      name: "this",
      range: expression.range,
    };
  }
  if (
    expression.kind === "boolean" ||
    expression.kind === "bigint" ||
    expression.kind === "new-target" ||
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
    const resolution = resolveName(scopes, state, expression.name);
    if (resolution.objectBindingIds.length > 0) {
      return {
        fallback: identifierFallback(
          expression.name,
          expression.range,
          resolution.binding,
          state,
        ),
        kind: "with-get",
        name: expression.name,
        objectBindingIds: resolution.objectBindingIds,
        range: expression.range,
      };
    }
    const binding = resolution.binding;
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
    const typeofResolution =
      expression.operator === "typeof" &&
      expression.argument.kind === "identifier"
        ? resolveName(scopes, state, expression.argument.name)
        : undefined;
    if (
      expression.operator === "typeof" &&
      expression.argument.kind === "identifier" &&
      typeofResolution?.binding == null &&
      typeofResolution?.objectBindingIds.length === 0 &&
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
    const properties: HirObjectProperty[] = [];
    for (const property of expression.properties) {
      if (property.kind === "spread") {
        const argument = resolveExpression(property.argument, scopes, state);
        if (argument == null) return undefined;
        properties.push({ ...property, argument });
        continue;
      }
      const key = resolveExpression(property.key, scopes, state);
      const value = resolveExpression(property.value, scopes, state);
      if (key == null || value == null) return undefined;
      properties.push({
        ...(property.accessorKind == null
          ? {}
          : { accessorKind: property.accessorKind }),
        key,
        kind: "definition",
        value:
          key.kind === "string" ? inferFunctionName(value, key.value) : value,
      });
    }
    return { ...expression, properties };
  }
  if (expression.kind === "optional-chain") {
    return resolveOptionalChain(expression, scopes, state);
  }
  if (expression.kind === "class") {
    return resolveClassExpression(expression, scopes, state);
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
  if (
    expression.kind === "private-get" ||
    expression.kind === "private-in" ||
    expression.kind === "private-set" ||
    expression.kind === "private-step" ||
    expression.kind === "private-update"
  ) {
    const located = locatedOf(expression);
    const object = resolveExpression(expression.object, scopes, state);
    const privateName = resolvePrivateName(
      expression.name,
      expression,
      scopes,
      state,
    );
    if (object == null || privateName == null) return undefined;
    if (expression.kind === "private-get" || expression.kind === "private-in") {
      return { ...located, kind: expression.kind, object, privateName };
    }
    if (expression.kind === "private-step") {
      return {
        ...located,
        kind: "private-step",
        object,
        operator: expression.operator,
        prefix: expression.prefix,
        privateName,
      };
    }
    const value = resolveExpression(expression.value, scopes, state);
    if (value == null) return undefined;
    return expression.kind === "private-set"
      ? { ...located, kind: "private-set", object, privateName, value }
      : {
          ...located,
          kind: "private-update",
          object,
          operator: expression.operator,
          privateName,
          value,
        };
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
  } else if (expression.target.kind === "super") {
    // The frontend admits `super()` only in a derived class constructor,
    // which is exactly where a `this` binding is in scope.
    const thisBinding = state.thisBinding;
    if (thisBinding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          "super() is only valid in a derived class constructor.",
        ),
      );
      return undefined;
    }
    target = { kind: "super", thisBinding };
  } else if (expression.target.kind === "private-method") {
    const object = resolveExpression(expression.target.object, scopes, state);
    const privateName = resolvePrivateName(
      expression.target.name,
      expression.target,
      scopes,
      state,
    );
    if (object == null || privateName == null) return undefined;
    target = { kind: "private-method", object, privateName };
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
  if (
    pattern.kind === "assignment-member" ||
    pattern.kind === "assignment-private"
  ) {
    return [];
  }
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

/**
 * True for a function that takes `this` and `new.target` from the
 * function that encloses it instead of from its own invocation.
 */
function lexicalReceiver(functionValue: SyntaxFunction): boolean {
  return (
    functionValue.functionKind === "arrow" ||
    functionValue.functionKind === "async-arrow"
  );
}

/**
 * True when this unit admits an implicit `arguments` object for the
 * function. Strict, arrow, class, and asynchronous functions deliberately
 * leave the name unresolved.
 */
function admitsArgumentsObject(functionValue: SyntaxFunction): boolean {
  const kind = functionValue.functionKind ?? "ordinary";
  return (
    functionValue.strict !== true &&
    kind !== "arrow" &&
    kind !== "async" &&
    kind !== "async-arrow" &&
    kind !== "async-generator" &&
    kind !== "class"
  );
}

/**
 * Prevents an ineligible nested function from capturing an enclosing
 * function's implicit `arguments` binding. Explicit bindings with that name
 * remain ordinary lexical references.
 */
function withoutArgumentsObjectBindings(
  scopes: readonly Map<string, Binding>[],
): readonly Map<string, Binding>[] {
  return scopes.map((scope) => {
    if (scope.get("arguments")?.argumentsObject !== true) return scope;
    const filtered = new Map(scope);
    filtered.delete("arguments");
    return filtered;
  });
}

function resolveFunction(
  functionValue: SyntaxFunction,
  outerScopes: readonly Map<string, Binding>[],
  state: ResolveState,
  id: number,
  selfBinding?: Binding,
  derivedThisBinding?: HirClassThisBinding,
): HirFunction {
  const outerThisBinding = state.thisBinding;
  if (derivedThisBinding != null) {
    state.thisBinding = derivedThisBinding;
  } else if (!lexicalReceiver(functionValue)) {
    state.thisBinding = undefined;
  }
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
  let argumentsBinding: Binding | undefined;
  if (
    admitsArgumentsObject(functionValue) &&
    !parameterScope.has("arguments")
  ) {
    argumentsBinding = {
      argumentsObject: true,
      id: state.nextBindingId,
      mutable: true,
      name: "arguments",
    };
    state.nextBindingId += 1;
    parameterScope.set("arguments", argumentsBinding);
  }
  const bodyScope = new Map<string, Binding>();
  predeclareBindings(functionValue.body, bodyScope, state);
  // Labels never cross a function boundary.
  const outerLabels = state.labels.splice(0);
  const body = resolveStatementList(
    functionValue.body,
    [
      ...(admitsArgumentsObject(functionValue)
        ? outerScopes
        : withoutArgumentsObjectBindings(outerScopes)),
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
  state.thisBinding = outerThisBinding;
  const resolved: HirFunction = {
    ...functionValue,
    ...(argumentsBinding == null
      ? {}
      : { argumentsBindingId: argumentsBinding.id }),
    body,
    ...(derivedThisBinding == null
      ? {}
      : { derivedThisBindingId: derivedThisBinding.bindingId }),
    functionLength: functionValue.functionLength ?? parameters.length,
    functionKind: functionValue.functionKind ?? "ordinary",
    id,
    kind: "hir-function",
    localBindingIds: [
      ...new Set([
        ...Array.from(parameterScope.values(), (binding) => binding.id),
        ...(selfBinding == null ? [] : [selfBinding.id]),
        ...(derivedThisBinding == null ? [] : [derivedThisBinding.bindingId]),
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
  if (
    pattern.kind === "assignment-member" ||
    pattern.kind === "assignment-private"
  ) {
    return [];
  }
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

/** Finds an await in an optional chain outside the recursive dispatcher. */
function hirOptionalChainHasAwait(
  expression: Extract<HirExpression, { readonly kind: "optional-chain" }>,
): boolean {
  return (
    hirExpressionHasAwait(expression.base) ||
    expression.links.some((link) =>
      link.kind === "member"
        ? hirExpressionHasAwait(link.key)
        : link.kind === "private-member"
          ? false
          : link.arguments.some(hirCallArgumentHasAwait),
    )
  );
}

export function hirExpressionHasAwait(expression: HirExpression): boolean {
  if (expression.kind === "await") return true;
  if (expression.kind === "delete-value") {
    return hirExpressionHasAwait(expression.argument);
  }
  if (
    expression.kind === "binding-set" ||
    expression.kind === "binding-update" ||
    expression.kind === "with-set" ||
    expression.kind === "with-update"
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
          : expression.target.kind === "private-method"
            ? hirExpressionHasAwait(expression.target.object)
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
    return expression.properties.some((property) =>
      property.kind === "spread"
        ? hirExpressionHasAwait(property.argument)
        : hirExpressionHasAwait(property.key) ||
          hirExpressionHasAwait(property.value),
    );
  }
  if (expression.kind === "optional-chain") {
    return hirOptionalChainHasAwait(expression);
  }
  if (expression.kind === "class") {
    // Only the heritage operand and a computed element key evaluate in
    // the enclosing context; the constructor and method bodies are
    // separate functions.
    return (
      (expression.heritage != null &&
        hirExpressionHasAwait(expression.heritage)) ||
      // A private name is created by the class evaluation itself, and a
      // static block is a function body, so only a key expression can
      // carry an await.
      expression.elements.some(
        (element) =>
          element.kind !== "static-block" &&
          element.key.kind !== "private-name" &&
          hirExpressionHasAwait(element.key),
      )
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
  if (
    expression.kind === "private-get" ||
    expression.kind === "private-in" ||
    expression.kind === "private-step"
  ) {
    return hirExpressionHasAwait(expression.object);
  }
  if (
    expression.kind === "private-set" ||
    expression.kind === "private-update"
  ) {
    return (
      hirExpressionHasAwait(expression.object) ||
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
  if (pattern.kind === "assignment-private") {
    return hirExpressionHasAwait(pattern.object);
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
      statement.kind === "labeled" ||
      statement.kind === "with"
    ) {
      if (statement.kind === "with") {
        result.push(statement.objectBindingId);
        result.push(
          ...statement.fallbackBindings.map((binding) => binding.bindingId),
        );
      }
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

/**
 * Resolves one class element key. A private name resolves to the class
 * binding that holds the private name value rather than to a property
 * key expression, so the element it names is recorded under an identity
 * no property observation can produce.
 */
function resolveClassElementKey(
  key: SyntaxClassField["key"],
  classScopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | HirPrivateNameKey | undefined {
  if (key.kind !== "private-name") {
    return resolveExpression(key, classScopes, state);
  }
  const privateName = resolvePrivateName(key.name, key, classScopes, state);
  return privateName == null
    ? undefined
    : { ...locatedOf(key), kind: "private-name", privateName };
}

/**
 * The name a class element key gives an anonymous definition it holds.
 * ECMA-262 names a private element after its declared `#name`, exactly
 * as a static string key names an ordinary one; every other key names
 * its definition only where the evaluated key value exists.
 */
function classElementStaticName(
  key: HirExpression | HirPrivateNameKey,
): string | undefined {
  if (key.kind === "private-name") return key.privateName.name;
  return key.kind === "string" ? key.value : undefined;
}

/**
 * Resolves one field definition. The key belongs to the class body and
 * is evaluated where the element appears, while the initializer becomes
 * a separate function that runs once per instance, or once for the
 * whole class when the field is `static`. That function is built here
 * rather than resolved from a synthesized syntax function, because its
 * body is exactly one `return` of the initializer expression and it
 * declares nothing of its own.
 *
 * The initializer's scope is the class scope, so it never reaches the
 * constructor's parameters, and it provides its own receiver, so a
 * derived constructor's `this` binding stops at it and an arrow
 * function inside it captures the object being initialized.
 */
function resolveClassField(
  element: SyntaxClassField,
  classScopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirClassField | undefined {
  const key = resolveClassElementKey(element.key, classScopes, state);
  if (key == null) return undefined;
  const located = locatedOf(element);
  const placement =
    element.staticPlacement === true ? { staticPlacement: true as const } : {};
  if (element.initializer == null) {
    return { ...located, key, kind: "field", ...placement };
  }
  const initializerId = state.nextFunctionId;
  state.nextFunctionId += 1;
  const outerThisBinding = state.thisBinding;
  state.thisBinding = undefined;
  // Labels never cross a function boundary, and the initializer is one.
  const outerLabels = state.labels.splice(0);
  const resolved = resolveExpression(element.initializer, classScopes, state);
  state.labels.push(...outerLabels);
  state.thisBinding = outerThisBinding;
  if (resolved == null) return undefined;
  const range = element.initializer.range;
  const staticName = classElementStaticName(key);
  const named =
    staticName == null ? resolved : inferFunctionName(resolved, staticName);
  // A key that names nothing statically still names an anonymous
  // initializer, so it travels to the closure through a cell the class
  // body fills once, rather than being evaluated again per instance.
  const keyNameBindingId =
    staticName != null || !anonymousDefinition(named)
      ? undefined
      : state.nextBindingId;
  if (keyNameBindingId != null) state.nextBindingId += 1;
  state.hirFunctions.push({
    body: [{ expression: named, kind: "return", range }],
    ...(keyNameBindingId == null
      ? {}
      : { fieldKeyBindingId: keyNameBindingId }),
    functionKind: "method",
    functionLength: 0,
    id: initializerId,
    kind: "hir-function",
    localBindingIds: [],
    name: "",
    parameters: [],
    range,
    returnHints: [],
    strict: true,
  });
  return {
    ...located,
    initializer: {
      functionId: initializerId,
      functionKind: "method",
      functionLength: 0,
      kind: "function",
      name: "",
      range,
    },
    key,
    ...(keyNameBindingId == null ? {} : { keyNameBindingId }),
    kind: "field",
    ...placement,
  };
}

/**
 * Resolves one class expression inside its own lexical environment. A
 * named class binds its name immutably in that environment, so the
 * constructor and every method reach the class through a binding that
 * an outer assignment cannot replace. The constructor is resolved
 * without a function self-binding, because the class-scope binding
 * already covers the name it would provide.
 *
 * A derived class resolves its heritage operand in that same
 * environment, before anything else, and gives its constructor a `this`
 * binding that only `super()` initializes.
 */
function resolveClassExpression(
  expression: SyntaxExpression & { readonly kind: "class" },
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  const classScope = new Map<string, Binding>();
  let nameBinding: HirClassNameBinding | undefined;
  if (expression.nameBinding != null) {
    nameBinding = {
      bindingId: state.nextBindingId,
      name: expression.nameBinding,
    };
    state.nextBindingId += 1;
    classScope.set(nameBinding.name, {
      id: nameBinding.bindingId,
      mutable: false,
      name: nameBinding.name,
    });
  }
  const classScopes = [...scopes, classScope];
  let heritage: HirExpression | undefined;
  if (expression.heritage != null) {
    heritage = resolveExpression(expression.heritage, classScopes, state);
    if (heritage == null) return undefined;
  }
  // The private names are bound after the heritage operand resolves,
  // because ECMA-262 evaluates ClassHeritage under the enclosing private
  // environment: a class cannot reach its own private names from the
  // expression it extends.
  const privateNames: HirPrivateName[] = [];
  for (const element of expression.elements) {
    if (element.kind === "static-block") continue;
    if (element.key.kind !== "private-name") continue;
    // A getter and its setter declare one name between them.
    if (classScope.has(element.key.name)) continue;
    const name = element.key.name;
    const bindingId = state.nextBindingId;
    state.nextBindingId += 1;
    classScope.set(name, { id: bindingId, mutable: false, name });
    privateNames.push({ bindingId, name });
  }
  let thisBinding: HirClassThisBinding | undefined;
  if (expression.heritage != null) {
    thisBinding = { bindingId: state.nextBindingId };
    state.nextBindingId += 1;
  }
  const constructorId = state.nextFunctionId;
  state.nextFunctionId += 1;
  state.functionInfo.set(expression.constructorFunction, { id: constructorId });
  const resolvedConstructor = resolveFunction(
    expression.constructorFunction,
    classScopes,
    state,
    constructorId,
    undefined,
    thisBinding,
  );
  const constructorFunction: HirExpression = {
    functionId: constructorId,
    functionKind: resolvedConstructor.functionKind,
    functionLength: resolvedConstructor.functionLength,
    kind: "function",
    name: expression.inferredName ?? expression.constructorFunction.name ?? "",
    range: expression.range,
  };
  const elements: HirClassElement[] = [];
  for (const element of expression.elements) {
    if (element.kind === "field") {
      const field = resolveClassField(element, classScopes, state);
      if (field == null) return undefined;
      elements.push(field);
      continue;
    }
    if (element.kind === "static-block") {
      // The block resolves like an element function: it reaches the
      // class scope, including the private names and the class name,
      // and provides its own receiver rather than inheriting one.
      const blockId = state.nextFunctionId;
      state.nextFunctionId += 1;
      state.functionInfo.set(element.body, { id: blockId });
      const resolvedBlock = resolveFunction(
        element.body,
        classScopes,
        state,
        blockId,
      );
      elements.push({
        ...element,
        body: {
          functionId: blockId,
          functionKind: resolvedBlock.functionKind,
          functionLength: resolvedBlock.functionLength,
          kind: "function",
          name: "",
          range: element.range,
        },
      });
      continue;
    }
    const key = resolveClassElementKey(element.key, classScopes, state);
    const methodId = state.nextFunctionId;
    state.nextFunctionId += 1;
    state.functionInfo.set(element.value, { id: methodId });
    const resolvedMethod = resolveFunction(
      element.value,
      classScopes,
      state,
      methodId,
    );
    if (key == null) return undefined;
    const value: HirExpression = {
      functionId: methodId,
      functionKind: resolvedMethod.functionKind,
      functionLength: resolvedMethod.functionLength,
      kind: "function",
      name: element.value.name ?? "",
      range: element.range,
    };
    const staticName = classElementStaticName(key);
    elements.push({
      ...element,
      key,
      value: staticName == null ? value : inferFunctionName(value, staticName),
    });
  }
  const byteRange = expression.byteRange;
  return {
    ...(byteRange == null ? {} : { byteRange }),
    constructorFunction,
    elements,
    ...(heritage == null ? {} : { heritage }),
    kind: "class",
    ...(nameBinding == null ? {} : { nameBinding }),
    ...(privateNames.length === 0 ? {} : { privateNames }),
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
  if (pattern.kind === "assignment-private") {
    if (!allowAssignmentTargets) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          pattern,
          "Private targets are valid only in assignment patterns.",
        ),
      );
      return undefined;
    }
    const object = resolveExpression(pattern.object, scopes, state);
    const privateName = resolvePrivateName(
      pattern.name,
      pattern,
      scopes,
      state,
    );
    return object == null || privateName == null
      ? undefined
      : {
          ...locatedOf(pattern),
          kind: "assignment-private",
          object,
          privateName,
        };
  }
  if (pattern.kind === "binding-identifier") {
    const resolution =
      mode === "declare"
        ? {
            binding: scopes.at(-1)?.get(pattern.name),
            objectBindingIds: [],
          }
        : resolveName(scopes, state, pattern.name);
    const binding =
      resolution.binding ??
      (resolution.objectBindingIds.length === 0
        ? undefined
        : withFallbackBinding(pattern.name, state));
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
      ...(resolution.objectBindingIds.length === 0
        ? {}
        : { withObjectBindingIds: resolution.objectBindingIds }),
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
        resolvedRest?.kind !== "assignment-member" &&
        resolvedRest?.kind !== "assignment-private"
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
      const resolution = resolveName(scopes, state, statement.target.name);
      const binding =
        resolution.binding ??
        (resolution.objectBindingIds.length === 0
          ? undefined
          : withFallbackBinding(statement.target.name, state));
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
          ...(resolution.objectBindingIds.length === 0
            ? {}
            : { withObjectBindingIds: resolution.objectBindingIds }),
        };
      }
    } else if (statement.target.kind === "property") {
      const object = resolveExpression(statement.target.object, scopes, state);
      const key = resolveExpression(statement.target.key, scopes, state);
      if (object != null && key != null) {
        target = { ...statement.target, key, object };
      }
    } else {
      const object = resolveExpression(statement.target.object, scopes, state);
      const privateName = resolvePrivateName(
        statement.target.name,
        statement.target,
        scopes,
        state,
      );
      if (object != null && privateName != null) {
        target = {
          ...locatedOf(statement.target),
          kind: "private",
          object,
          privateName,
        };
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
  if (statement.kind === "with") {
    const object = resolveExpression(statement.object, scopes, state);
    if (object == null) return undefined;
    const objectBindingId = state.nextBindingId;
    state.nextBindingId += 1;
    const withScope = new Map<string, Binding>();
    const fallbackBindings = new Map<string, Binding>();
    state.withScopes.set(withScope, objectBindingId);
    state.withFallbacks.push(fallbackBindings);
    const body = resolveStatement(
      statement.body,
      [...scopes, withScope],
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    state.withFallbacks.pop();
    state.withScopes.delete(withScope);
    if (body == null) return undefined;
    return {
      ...statement,
      body,
      fallbackBindings: [...fallbackBindings.values()].map((binding) => ({
        bindingId: binding.id,
        name: binding.name,
      })),
      object,
      objectBindingId,
    };
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
    withFallbacks: [],
    withScopes: new Map(),
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
