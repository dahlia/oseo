import {
  anonymousDefinition,
  errorIntrinsicName,
  isStandardGlobalName,
} from "./hir.ts";
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
  HirArrayBindingPattern,
  HirAssignmentMemberTarget,
  HirExpression,
  HirForDeclaration,
  HirForInTarget,
  HirForOfTarget,
  HirFunction,
  HirGlobalObjectBinding,
  HirObjectBindingPattern,
  HirObjectBindingProperty,
  HirObjectProperty,
  HirOptionalChainLink,
  HirParameter,
  HirPrivateName,
  HirPrivateNameKey,
  HirResult,
  HirStatement,
  HirStrictGlobalFallback,
  HirSwitchCase,
  ResolveState,
} from "./hir.ts";
import type { Diagnostic, SourceRange } from "./source.ts";
import type {
  BindingPatternMode,
  LocatedSyntax,
  SyntaxAssignmentPattern,
  SyntaxCallArgument,
  SyntaxCallTarget,
  SyntaxClassField,
  SyntaxExpression,
  SyntaxForInTarget,
  SyntaxFunction,
  SyntaxLexicalDeclarator,
  SyntaxProgram,
  SyntaxStatement,
} from "./syntax.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

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

/**
 * Allocate the uninitialized fallback behind an unresolved `with` name.
 * An `initializing` use is one whose all-miss path reaches PutValue
 * without a prior GetValue, so it can actually write the hidden cell: a
 * simple assignment or a destructuring or loop assignment target. A
 * compound or logical assignment and an update expression read first
 * and throw ReferenceError on the uninitialized cell before any write,
 * so they never initialize it. Recording the initializing names lets
 * the program reject a folded `typeof` of the same name instead of
 * misreporting the materialized value as `"undefined"`.
 */
function withFallbackBinding(
  name: string,
  state: ResolveState,
  initializing: boolean,
): Binding {
  const owner = state.withFallbacks.at(-1);
  if (owner == null) {
    throw new Error("A with fallback was requested outside a with statement.");
  }
  if (initializing) state.withInitializingFallbackNames.add(name);
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

/**
 * Reject a strict-code write to a `with` fallback. A strict all-miss
 * PutValue throws ReferenceError instead of creating a sloppy global,
 * while this profile's fallback lowering would initialize the hidden
 * cell, so the write stays outside the admitted global-object profile
 * until the strict throw is lowered; it consequently never records an
 * initializing name that could poison the typeof fold.
 */
function rejectStrictWithFallbackWrite(
  name: string,
  located: LocatedSyntax,
  state: ResolveState,
): void {
  state.diagnostics.push(
    sourceDiagnostic(
      state.sourceId,
      located,
      `Assigning with fallback binding '${name}' in strict code is ` +
        "outside the admitted global-object profile; a strict PutValue " +
        "on an unresolvable reference throws instead of creating a " +
        "global.",
    ),
  );
}

/**
 * Reject a `with` fallback write that would bypass a mutable intrinsic's
 * global property. Object-environment hits remain admitted, but the compiler
 * cannot let an all-miss path create a separate hidden cell for the same name.
 */
function rejectPropertyOwnedIntrinsicWithFallbackWrite(
  name: string,
  located: LocatedSyntax,
  state: ResolveState,
): boolean {
  if (!isPropertyOwnedIntrinsicName(name)) return false;
  state.diagnostics.push(
    sourceDiagnostic(
      state.sourceId,
      located,
      `Assigning property-owned intrinsic '${name}' through a with ` +
        "fallback is outside the admitted global-object profile.",
    ),
  );
  return true;
}

/** Whether the mutable global object property owns this intrinsic value. */
function isPropertyOwnedIntrinsicName(name: string): boolean {
  return (
    name === "AggregateError" ||
    name === "Array" ||
    name === "ArrayBuffer" ||
    name === "Error" ||
    name === "EvalError" ||
    name === "Function" ||
    name === "Infinity" ||
    name === "Iterator" ||
    name === "Map" ||
    name === "NaN" ||
    name === "Number" ||
    name === "Object" ||
    name === "Promise" ||
    name === "RangeError" ||
    name === "ReferenceError" ||
    name === "String" ||
    name === "Symbol" ||
    name === "SyntaxError" ||
    name === "TypeError" ||
    name === "URIError" ||
    name === "undefined"
  );
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

/** Read the realm global object captured before the source body executes. */
function intrinsicGlobalObjectRead(
  range: SourceRange,
  state: ResolveState,
): HirExpression {
  let binding = state.intrinsicGlobalObjectBinding;
  if (binding == null) {
    binding = {
      id: state.nextBindingId,
      mutable: false,
      name: "*intrinsic global object*",
    };
    state.nextBindingId += 1;
    state.intrinsicGlobalObjectBinding = binding;
  }
  return bindingExpression(binding, range);
}

/** Read one mutable intrinsic through the realm's global object property. */
function intrinsicGlobalPropertyRead(
  name: string,
  range: SourceRange,
  state: ResolveState,
): Extract<HirExpression, { readonly kind: "property-get" }> {
  return {
    key: { kind: "string", range, value: name },
    kind: "property-get",
    object: intrinsicGlobalObjectRead(range, state),
    range,
  };
}

/** Test whether one mutable intrinsic still exists on the global object. */
function intrinsicGlobalPropertyExists(
  name: string,
  range: SourceRange,
  state: ResolveState,
): HirExpression {
  return {
    kind: "binary",
    left: { kind: "string", range, value: name },
    operator: "in",
    range,
    right: intrinsicGlobalObjectRead(range, state),
  };
}

/** Return the uninitialized fallback for one absent mutable intrinsic. */
function missingIntrinsicBinding(name: string, state: ResolveState): Binding {
  let fallback = state.intrinsicReadFallbacks.get(name);
  if (fallback == null) {
    fallback = {
      id: state.nextBindingId,
      mutable: false,
      name: `*missing intrinsic:${name}*`,
    };
    state.nextBindingId += 1;
    state.intrinsicReadFallbacks.set(name, fallback);
  }
  return fallback;
}

/** Read the uninitialized fallback for one absent mutable intrinsic. */
function missingIntrinsicRead(
  name: string,
  range: SourceRange,
  state: ResolveState,
): HirExpression {
  return bindingExpression(missingIntrinsicBinding(name, state), range);
}

/** Return the missing-binding check required by a strict global write. */
function strictIntrinsicGlobalFallback(
  name: string,
  state: ResolveState,
): HirStrictGlobalFallback | undefined {
  if (!state.strict) return undefined;
  const fallback = missingIntrinsicBinding(name, state);
  return { bindingId: fallback.id, name: fallback.name };
}

/** Resolve one assignment-pattern leaf to a mutable intrinsic property. */
function intrinsicGlobalPatternTarget(
  name: string,
  located: LocatedSyntax,
  state: ResolveState,
): HirAssignmentMemberTarget {
  const reference = intrinsicGlobalPropertyRead(name, located.range, state);
  const strictGlobalFallback = strictIntrinsicGlobalFallback(name, state);
  return {
    ...includePropertiesWhen(() => {
      if (located.byteRange == null) return undefined;
      return {
        byteRange: located.byteRange,
      };
    }),
    inferredName: name,
    key: reference.key,
    kind: "assignment-member",
    object: reference.object,
    range: located.range,
    ...includePropertiesWhen(() => {
      if (strictGlobalFallback == null) return undefined;
      return {
        strictGlobalFallback,
      };
    }),
  };
}

/** Resolve one direct loop target to a mutable intrinsic property. */
function intrinsicGlobalLoopTarget(
  name: string,
  range: SourceRange,
  state: ResolveState,
): Extract<HirForOfTarget, { readonly kind: "property" }> {
  const reference = intrinsicGlobalPropertyRead(name, range, state);
  const strictGlobalFallback = strictIntrinsicGlobalFallback(name, state);
  return {
    key: reference.key,
    kind: "property",
    object: reference.object,
    range,
    ...includePropertiesWhen(() => {
      if (strictGlobalFallback == null) return undefined;
      return {
        strictGlobalFallback,
      };
    }),
  };
}

/**
 * Read a mutable intrinsic global with ordinary identifier semantics.
 * The property owns the value, while an absent property reaches one hidden
 * uninitialized cell so GetValue throws ReferenceError instead of returning
 * the `undefined` that an ordinary property read would produce.
 */
function intrinsicGlobalIdentifierRead(
  name: string,
  range: SourceRange,
  state: ResolveState,
): HirExpression {
  return {
    alternate: missingIntrinsicRead(name, range, state),
    consequent: intrinsicGlobalPropertyRead(name, range, state),
    kind: "conditional",
    range,
    test: intrinsicGlobalPropertyExists(name, range, state),
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
  if (isPropertyOwnedIntrinsicName(name)) {
    return intrinsicGlobalIdentifierRead(name, range, state);
  }
  return bindingExpression(withFallbackBinding(name, state, false), range);
}

/** The source location of one syntax node, without its other fields. */
function locatedOf(value: LocatedSyntax): LocatedSyntax {
  return {
    ...includePropertiesWhen(() => {
      if (value.byteRange == null) return undefined;
      return {
        byteRange: value.byteRange,
      };
    }),
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

/**
 * Whether this call target reaches the unshadowed dynamic Function boundary.
 */
function callsDynamicFunctionConstructor(
  target: SyntaxCallTarget,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): boolean {
  const name =
    target.kind === "name"
      ? target.name
      : target.kind === "dynamic" && target.callee.kind === "identifier"
        ? target.callee.name
        : undefined;
  if (name !== "Function") return false;
  const resolution = resolveName(scopes, state, name);
  return resolution.binding == null && resolution.objectBindingIds.length === 0;
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

/** Whether identifier deletion needs an owned intrinsic diagnostic. */
function isRuntimeOwnedIntrinsicName(name: string): boolean {
  return (
    name === "console" ||
    name === "Array" ||
    name === "ArrayBuffer" ||
    name === "Function" ||
    name === "Iterator" ||
    name === "Map" ||
    name === "Number" ||
    name === "Object" ||
    name === "Promise" ||
    name === "String" ||
    name === "Symbol" ||
    name === "setTimeout" ||
    name === "clearTimeout" ||
    errorIntrinsicName(name) != null
  );
}

/**
 * Resolve an identifier delete without reading the selected binding. The
 * closed-world profile can decide declarative and unresolvable references
 * statically. Property-owned intrinsic globals delete the same configurable
 * property that their later identifier reads observe.
 */
function resolveIdentifierDelete(
  expression: Extract<SyntaxExpression, { readonly kind: "delete" }>,
  argument: Extract<SyntaxExpression, { readonly kind: "identifier" }>,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  const resolution = resolveName(scopes, state, argument.name);
  const globalObjectBinding =
    resolution.binding != null &&
    state.globalObjectBindingIds.has(resolution.binding.id);
  let fallback: HirExpression;
  if (globalObjectBinding) {
    fallback = {
      key: { kind: "string", range: argument.range, value: argument.name },
      kind: "property-delete",
      object: intrinsicGlobalObjectRead(argument.range, state),
      range: expression.range,
    };
  } else if (resolution.binding != null) {
    fallback = {
      kind: "boolean",
      range: expression.range,
      value: false,
    };
  } else if (
    argument.name === "undefined" ||
    argument.name === "NaN" ||
    argument.name === "Infinity"
  ) {
    fallback = {
      kind: "boolean",
      range: expression.range,
      value: false,
    };
  } else if (isPropertyOwnedIntrinsicName(argument.name)) {
    fallback = {
      key: { kind: "string", range: argument.range, value: argument.name },
      kind: "property-delete",
      object: intrinsicGlobalObjectRead(argument.range, state),
      range: expression.range,
    };
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
  } else {
    fallback = {
      kind: "boolean",
      range: expression.range,
      value: true,
    };
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
      fallback,
      kind: "with-delete",
      name: argument.name,
      objectBindingIds: resolution.objectBindingIds,
    };
  }
  return fallback;
}

/**
 * Resolve a direct `typeof` applied to an identifier. ECMA-262 answers
 * `"undefined"` for an unresolvable reference instead of throwing, and the
 * closed-world profile can decide resolvability statically the same way
 * `resolveIdentifierDelete` does, so a name with no binding, no admitted
 * intrinsic value, and no enclosing object environment folds to that
 * string without reading or creating any binding. Every other expression
 * keeps the ordinary unresolved-name rejection. Runtime-owned call-target
 * intrinsics stay rejected: ECMA-262 resolves them to real global values
 * this profile does not admit as values, so `"undefined"` would misreport
 * them.
 */
function resolveTypeofIdentifier(
  expression: Extract<SyntaxExpression, { readonly kind: "unary" }>,
  argument: Extract<SyntaxExpression, { readonly kind: "identifier" }>,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): HirExpression | undefined {
  const resolution = resolveName(scopes, state, argument.name);
  if (
    resolution.binding != null &&
    state.globalObjectBindingIds.has(resolution.binding.id)
  ) {
    const fallback = intrinsicGlobalPropertyRead(
      argument.name,
      argument.range,
      state,
    );
    const resolved =
      resolution.objectBindingIds.length === 0
        ? fallback
        : {
            fallback,
            kind: "with-get" as const,
            name: argument.name,
            objectBindingIds: resolution.objectBindingIds,
            range: argument.range,
          };
    return {
      ...expression,
      argument: resolved,
    };
  }
  if (
    isPropertyOwnedIntrinsicName(argument.name) &&
    resolution.binding == null
  ) {
    const fallback = intrinsicGlobalPropertyRead(
      argument.name,
      argument.range,
      state,
    );
    const resolved =
      resolution.objectBindingIds.length === 0
        ? fallback
        : {
            fallback,
            kind: "with-get" as const,
            name: argument.name,
            objectBindingIds: resolution.objectBindingIds,
            range: argument.range,
          };
    return { ...expression, argument: resolved };
  }
  const resolvesValue =
    resolution.binding != null ||
    argument.name === "undefined" ||
    argument.name === "NaN" ||
    argument.name === "Infinity";
  if (resolvesValue) {
    const resolved = resolveExpression(argument, scopes, state);
    return resolved == null ? undefined : { ...expression, argument: resolved };
  }
  if (isRuntimeOwnedIntrinsicName(argument.name)) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        argument,
        `typeof runtime intrinsic binding '${argument.name}' is outside ` +
          "the admitted global-object profile.",
      ),
    );
    return undefined;
  }
  // A clause 19 standard global is never unresolvable in a conforming
  // realm of the pinned edition, so folding it to "undefined" would
  // misreport a required global value this profile has simply not
  // admitted yet. Annex B additions stay excluded from the claim and
  // remain ordinary unresolvable names.
  if (isStandardGlobalName(argument.name)) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        argument,
        `typeof standard global binding '${argument.name}' is outside ` +
          "the admitted global-object profile.",
      ),
    );
    return undefined;
  }
  // Both folded shapes are re-checked against the program's unresolved
  // `with` assignment targets after resolution completes, because a
  // hidden fallback cell such an assignment initializes at run time
  // would make the folded answer misreport the materialized value.
  state.foldedTypeofReferences.push({
    located: locatedOf(argument),
    name: argument.name,
  });
  if (resolution.objectBindingIds.length > 0) {
    // Every active object environment is consulted first; when all of
    // them miss, the reference is unresolvable, so the fallback is the
    // `undefined` value `typeof` reports rather than the hidden
    // uninitialized cell an ordinary read preserves for its
    // ReferenceError.
    return {
      ...expression,
      argument: {
        ...locatedOf(argument),
        fallback: { kind: "undefined", range: argument.range },
        kind: "with-get",
        name: argument.name,
        objectBindingIds: resolution.objectBindingIds,
      },
    };
  }
  return { kind: "string", range: expression.range, value: "undefined" };
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
      isPropertyOwnedIntrinsicName(expression.name) &&
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      if (value == null) return undefined;
      const inferred =
        expression.kind === "binding-set" ||
        expression.operator === "&&" ||
        expression.operator === "??" ||
        expression.operator === "||"
          ? inferFunctionName(value, expression.name)
          : value;
      const reference = intrinsicGlobalPropertyRead(
        expression.name,
        expression.range,
        state,
      );
      const strictGlobalFallback = state.strict
        ? missingIntrinsicBinding(expression.name, state)
        : undefined;
      const write: HirExpression =
        expression.kind === "binding-set"
          ? {
              ...locatedOf(expression),
              key: reference.key,
              kind: "property-set",
              object: reference.object,
              ...includePropertiesWhen(() => {
                if (strictGlobalFallback == null) return undefined;
                return {
                  strictGlobalFallback: {
                    bindingId: strictGlobalFallback.id,
                    name: strictGlobalFallback.name,
                  },
                };
              }),
              value: inferred,
            }
          : {
              ...locatedOf(expression),
              key: reference.key,
              kind: "property-update",
              object: reference.object,
              operator: expression.operator,
              ...includePropertiesWhen(() => {
                if (strictGlobalFallback == null) return undefined;
                return {
                  strictGlobalFallback: {
                    bindingId: strictGlobalFallback.id,
                    name: strictGlobalFallback.name,
                  },
                };
              }),
              value: inferred,
            };
      if (expression.kind === "binding-set") return write;
      return {
        alternate: missingIntrinsicRead(
          expression.name,
          expression.range,
          state,
        ),
        consequent: write,
        kind: "conditional",
        range: expression.range,
        test: intrinsicGlobalPropertyExists(
          expression.name,
          expression.range,
          state,
        ),
      };
    }
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
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      rejectPropertyOwnedIntrinsicWithFallbackWrite(
        expression.name,
        expression,
        state,
      )
    ) {
      return undefined;
    }
    if (
      resolution.binding == null &&
      state.strict &&
      expression.kind === "binding-set"
    ) {
      rejectStrictWithFallbackWrite(expression.name, expression, state);
      return undefined;
    }
    // Only a non-strict simple assignment reaches PutValue on an
    // all-miss chain; a compound or logical assignment performs
    // GetValue first, which throws ReferenceError on the uninitialized
    // fallback cell before any write, so it can never initialize the
    // hidden cell.
    const binding =
      resolution.binding ??
      withFallbackBinding(
        expression.name,
        state,
        expression.kind === "binding-set",
      );
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
        ...includePropertiesWhen(() => {
          if (!(binding.functionNameBinding === true)) return undefined;
          return {
            functionNameBinding: true as const,
          };
        }),
        ...includePropertiesWhen(() => {
          if (!(binding.importedBinding === true)) return undefined;
          return {
            importedBinding: true as const,
          };
        }),
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
      ...includePropertiesWhen(() => {
        if (!(binding.functionNameBinding === true)) return undefined;
        return {
          functionNameBinding: true,
        };
      }),
      ...includePropertiesWhen(() => {
        if (!(binding.importedBinding === true)) return undefined;
        return {
          importedBinding: true,
        };
      }),
      mutable: binding.mutable,
      value: inferred,
    };
  }
  if (expression.kind === "binding-step") {
    const resolution = resolveName(scopes, state, expression.name);
    if (
      isPropertyOwnedIntrinsicName(expression.name) &&
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      const reference = intrinsicGlobalPropertyRead(
        expression.name,
        expression.range,
        state,
      );
      const strictGlobalFallback = state.strict
        ? missingIntrinsicBinding(expression.name, state)
        : undefined;
      const step: HirExpression = {
        ...locatedOf(expression),
        key: reference.key,
        kind: "property-step",
        object: reference.object,
        operator: expression.operator,
        prefix: expression.prefix,
        ...includePropertiesWhen(() => {
          if (strictGlobalFallback == null) return undefined;
          return {
            strictGlobalFallback: {
              bindingId: strictGlobalFallback.id,
              name: strictGlobalFallback.name,
            },
          };
        }),
      };
      return {
        alternate: missingIntrinsicRead(
          expression.name,
          expression.range,
          state,
        ),
        consequent: step,
        kind: "conditional",
        range: expression.range,
        test: intrinsicGlobalPropertyExists(
          expression.name,
          expression.range,
          state,
        ),
      };
    }
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
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      rejectPropertyOwnedIntrinsicWithFallbackWrite(
        expression.name,
        expression,
        state,
      )
    ) {
      return undefined;
    }
    // An update expression performs GetValue before its write, so an
    // all-miss chain throws ReferenceError on the uninitialized
    // fallback cell and can never initialize it.
    const binding =
      resolution.binding ?? withFallbackBinding(expression.name, state, false);
    if (resolution.objectBindingIds.length > 0) {
      return {
        ...expression,
        fallback: {
          bindingId: binding.id,
          ...includePropertiesWhen(() => {
            if (!(binding.functionNameBinding === true)) return undefined;
            return { functionNameBinding: true };
          }),
          ...includePropertiesWhen(() => {
            if (!(binding.importedBinding === true)) return undefined;
            return {
              importedBinding: true,
            };
          }),
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
      ...includePropertiesWhen(() => {
        if (!(binding.functionNameBinding === true)) return undefined;
        return {
          functionNameBinding: true,
        };
      }),
      ...includePropertiesWhen(() => {
        if (!(binding.importedBinding === true)) return undefined;
        return {
          importedBinding: true,
        };
      }),
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
        ...includePropertiesWhen(() => {
          if (expression.byteRange == null) return undefined;
          return {
            byteRange: expression.byteRange,
          };
        }),
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
      // Every admitted `super` property reference sits in a class body,
      // which is strict code, so its receiver is the call-site receiver.
      { kind: "this", range: expression.range, thisMode: "strict" },
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
      if (isPropertyOwnedIntrinsicName(expression.name)) {
        return intrinsicGlobalIdentifierRead(
          expression.name,
          expression.range,
          state,
        );
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
      expression.argument.kind === "identifier"
    ) {
      return resolveTypeofIdentifier(
        expression,
        expression.argument,
        scopes,
        state,
      );
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
    let foundPrototypeSetter = false;
    for (const property of expression.properties) {
      if (property.kind !== "definition" || property.prototypeSetter !== true) {
        continue;
      }
      if (foundPrototypeSetter) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            property.key,
            "An object literal cannot contain multiple prototype setters.",
          ),
        );
        return undefined;
      }
      foundPrototypeSetter = true;
    }
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
        ...includePropertiesWhen(() => {
          if (property.accessorKind == null) return undefined;
          return {
            accessorKind: property.accessorKind,
          };
        }),
        key,
        kind: "definition",
        ...includePropertiesWhen(() => {
          if (!(property.prototypeSetter === true)) return undefined;
          return {
            prototypeSetter: true as const,
          };
        }),
        value:
          key.kind === "string" && property.prototypeSetter !== true
            ? inferFunctionName(value, key.value)
            : value,
      });
    }
    return { ...expression, properties };
  }
  if (expression.kind === "optional-chain") {
    return resolveOptionalChain(expression, scopes, state);
  }
  if (expression.kind === "class") {
    // A ClassDefinition is strict code in its entirety, including the
    // heritage operand, computed keys, and field initializers resolved
    // in the enclosing context.
    const outerStrict = state.strict;
    state.strict = true;
    const resolved = resolveClassExpression(expression, scopes, state);
    state.strict = outerStrict;
    return resolved;
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
    if (object == null || key == null || value == null) return undefined;
    return { ...expression, key, object, value };
  }
  if (expression.kind === "property-update") {
    const object = resolveExpression(expression.object, scopes, state);
    const key = resolveExpression(expression.key, scopes, state);
    const value = resolveExpression(expression.value, scopes, state);
    if (object == null || key == null || value == null) return undefined;
    return { ...expression, key, object, value };
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
    const functionResolution =
      expression.callee.kind === "identifier" &&
      expression.callee.name === "Function"
        ? resolveName(scopes, state, "Function")
        : undefined;
    if (
      functionResolution != null &&
      functionResolution.binding == null &&
      functionResolution.objectBindingIds.length === 0
    ) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          expression,
          "The Function constructor requires dynamic source and is " +
            "unsupported in M5.",
        ),
      );
      return undefined;
    }
    const argumentsValue: HirCallArgument[] = [];
    for (const argument of expression.arguments) {
      const resolved = resolveCallArgument(argument, scopes, state);
      if (resolved == null) return undefined;
      argumentsValue.push(resolved);
    }
    const callee = resolveExpression(expression.callee, scopes, state);
    return callee == null
      ? undefined
      : { ...expression, arguments: argumentsValue, callee };
  }
  if (callsDynamicFunctionConstructor(expression.target, scopes, state)) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        expression,
        "The Function constructor requires dynamic source and is " +
          "unsupported in M5.",
      ),
    );
    return undefined;
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
    const object = resolveExpression(
      {
        kind: "identifier",
        name: "Object",
        range: expression.target.range,
      },
      scopes,
      state,
    );
    if (object == null) return undefined;
    target = {
      key: {
        kind: "string",
        range: expression.target.range,
        value: expression.target.method,
      },
      kind: "method",
      object,
    };
  } else if (expression.target.kind === "promise-intrinsic-direct") {
    target = {
      kind: "promise-intrinsic",
      method: expression.target.method,
    };
  } else if (expression.target.kind === "promise-intrinsic") {
    // %Promise% is a materialized value, so a static call is an ordinary
    // method call on whatever `Promise` resolves to, whether that is the
    // realm's global property or a shadowing binding.
    const object = resolveExpression(
      {
        kind: "identifier",
        name: "Promise",
        range: expression.target.range,
      },
      scopes,
      state,
    );
    if (object == null) return undefined;
    target = {
      key: {
        kind: "string",
        range: expression.target.range,
        value: expression.target.method,
      },
      kind: "method",
      object,
    };
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

/**
 * The declaration kind one declarator of a lexical declaration list
 * binds. A binding pattern names its kind directly, while an identifier
 * declarator is discriminated by its own statement kind.
 */
function declaratorKind(declarator: SyntaxLexicalDeclarator): "const" | "let" {
  return declarator.kind === "binding-pattern"
    ? declarator.declarationKind
    : declarator.kind;
}

/**
 * True when a declaration list mixes `const` and `let` declarators. One
 * LetOrConst covers a whole BindingList, so no source can produce such a
 * list, and resolving one would have to invent a mutability for it.
 */
function mixedDeclarationList(
  declarations: readonly SyntaxLexicalDeclarator[],
): boolean {
  const first = declarations[0];
  return (
    first != null &&
    declarations.some(
      (declarator) => declaratorKind(declarator) !== declaratorKind(first),
    )
  );
}

/**
 * Predeclares every lexical, function, and pattern-declared name of one
 * statement list into `scope`.
 *
 * `lexicalScope` distinguishes a Block, CaseBlock, or module top level's
 * own LexicallyDeclaredNames from a Script or FunctionBody's top-level
 * declarations. ECMA-262 treats a Script or FunctionBody's top-level
 * function declaration as a hoistable, var-like declaration that any
 * later declaration of the same name freely replaces regardless of its
 * kind or the code's strictness, because its LexicallyDeclaredNames
 * excludes function and var bindings entirely. A Block, CaseBlock, or
 * module top level's FunctionDeclarations are LexicallyDeclaredNames
 * instead, and ECMA-262 exempts a duplicate entry there only for a host
 * that implements Annex B.3.2 (Block-Level Function Declarations Web
 * Legacy Compatibility Semantics), which this closed ahead-of-time
 * profile does not, so every duplicate function name there is always an
 * early error, regardless of a matching ordinary kind or the code's
 * strictness.
 */
function predeclareBindings(
  statements: readonly SyntaxStatementItem[],
  scope: Map<string, Binding>,
  state: ResolveState,
  lexicalScope: boolean,
  reuseScope?: ReadonlyMap<string, Binding>,
): void {
  for (const statement of statements) {
    // Every declarator of a lexical declaration list is predeclared in
    // the scope that contains the list, so the whole list shares one
    // temporal dead zone and duplicate names inside it are still an
    // early error against their siblings.
    if (statement.kind === "declaration-list") {
      // A mixed list is rejected where it is resolved, but its names are
      // still predeclared here, each with the mutability its own
      // declarator asks for. Leaving them undeclared would make every
      // later reference report an unrelated unknown binding, so the one
      // diagnostic the invalid list deserves would arrive with a cascade
      // of misleading ones. No mutability is invented: the list produces
      // no statement, so nothing reads the recovery bindings.
      predeclareBindings(statement.declarations, scope, state, lexicalScope);
      continue;
    }
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
    // A Script or FunctionBody's top-level function declaration is
    // var-like: any later declaration of the same name, of any kind,
    // freely replaces it, because the LexicallyDeclaredNames of a
    // ScriptBody or FunctionBody excludes function and var bindings
    // entirely. A Block or CaseBlock's FunctionDeclarations are
    // LexicallyDeclaredNames instead, and ECMA-262 exempts a duplicate
    // entry there only when the host supports Block-Level Function
    // Declarations Web Legacy Compatibility Semantics (Annex B.3.2),
    // which this profile's closed ahead-of-time runtime does not
    // implement, so a Block or CaseBlock never admits a duplicate
    // function name, regardless of its kind or the code's strictness.
    const duplicateFunctions =
      statement.kind === "function" && previous?.functionId != null;
    if (
      previous != null &&
      previous.pendingDeclaration !== true &&
      !(duplicateFunctions && !lexicalScope)
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
      // FunctionDeclarationInstantiation instantiates a FunctionBody's own
      // top-level function declarations into varEnv, which is the same
      // environment as the parameters themselves whenever the parameter
      // list has no parameter expressions: a name already bound by a
      // parameter (or by the implicit `arguments` binding) is not a fresh
      // declaration but an ordinary write to that existing binding, the
      // same reuse `var` already gets by resolving through the whole
      // scope chain instead of being predeclared here. `reuseScope` is
      // only ever the enclosing function's own parameter scope, passed by
      // the sole caller that predeclares a FunctionBody's own top level,
      // so a genuinely nested block's function declaration never reuses a
      // parameter's binding: it keeps its own lexically shadowing one.
      // A same-name earlier declaration in this same body scope reuses
      // `previous` instead of `reuseScope`, but when that earlier
      // declaration itself already reused an outer binding, this one
      // targets the very same already-initialized id: `alreadyInitialized`
      // carries forward from `previous` so it survives even though
      // `buildFunctionInits` keeps only the last declaration's statement.
      const reusedFromOuterScope =
        previous == null ? reuseScope?.get(name) : undefined;
      const reused = previous ?? reusedFromOuterScope;
      const bindingId = reused?.id ?? state.nextBindingId;
      if (reused == null) state.nextBindingId += 1;
      const alreadyInitialized =
        reusedFromOuterScope != null || previous?.alreadyInitialized === true;
      scope.set(name, {
        ...includePropertiesWhen(() => {
          if (!alreadyInitialized) return undefined;
          return {
            alreadyInitialized: true,
          };
        }),
        functionId,
        id: bindingId,
        mutable: true,
        name,
      });
      state.functionInfo.set(statement, {
        bindingId,
        id: functionId,
        ...includePropertiesWhen(() => {
          if (!alreadyInitialized) return undefined;
          return {
            alreadyInitialized: true,
          };
        }),
      });
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

/**
 * Builds the `function-init` HIR statement for every function declaration
 * directly in `statements` whose binding still owns `scope`, in source
 * order. A block runs these before any other statement in its body,
 * which is InstantiateFunctionObject inside its own
 * BlockDeclarationInstantiation; a switch CaseBlock shares one such list
 * across every clause instead of giving each clause its own.
 */
function buildFunctionInits(
  statements: readonly SyntaxStatementItem[],
  scope: Map<string, Binding>,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
): readonly HirStatement[] {
  const result: HirStatement[] = [];
  for (const statement of statements) {
    if (statement.kind !== "function" || statement.name == null) continue;
    const bindingName = statement.bindingName ?? statement.name;
    const info = state.functionInfo.get(statement);
    if (info == null) continue;
    if (scope.get(bindingName)?.functionId !== info.id) continue;
    const functionValue = resolveFunction(statement, scopes, state, info.id);
    result.push({
      ...includePropertiesWhen(() => {
        if (!(info.alreadyInitialized === true)) return undefined;
        return {
          alreadyInitialized: true,
        };
      }),
      bindingId: info.bindingId ?? -1,
      functionId: info.id,
      functionKind: functionValue.functionKind,
      functionName: functionValue.name,
      functionLength: functionValue.functionLength,
      ...includePropertiesWhen(() => {
        if (functionValue.sourceText == null) return undefined;
        return {
          sourceText: functionValue.sourceText,
        };
      }),
      kind: "function-init",
      name: bindingName,
      range: statement.range,
    });
  }
  return result;
}

function resolveStatementList(
  statements: readonly SyntaxStatementItem[],
  parentScopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  existingLocal?: Map<string, Binding>,
  lexicalScope = true,
  loopDepth = 0,
  breakDepth = 0,
): readonly HirStatement[] {
  const local = existingLocal ?? new Map<string, Binding>();
  // `resolveStatementList` predeclares its own scope only when it owns a
  // genuine nested Block, whose FunctionDeclarations are
  // LexicallyDeclaredNames (`lexicalScope` true, the default a real
  // Block's own caller relies on); a caller that already predeclared
  // `existingLocal` owns a Script, module, or FunctionBody top level
  // instead and already chose that scope's own policy: var-like for a
  // Script or FunctionBody, lexical for a module. A parameter-environment
  // function's synthetic body wrapper is a Block in shape only: it is not
  // a source Block, so its caller passes `lexicalScope` false to keep its
  // FunctionDeclarations the FunctionBody's own var-like ones.
  if (existingLocal == null) {
    predeclareBindings(statements, local, state, lexicalScope);
  }
  const scopes = [...parentScopes, local];
  const result: HirStatement[] = [
    ...buildFunctionInits(statements, local, scopes, state),
  ];
  for (const statement of statements) {
    if (statement.kind === "function") continue;
    const resolved = resolveStatementItems(
      statement,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    if (resolved != null) result.push(...resolved);
  }
  return result;
}

/**
 * Resolves one statement of a statement list, expanding a lexical
 * declaration list into its declarators.
 *
 * The declarators join the enclosing list rather than a nested block.
 * ECMAScript gives them the scope that contains the declaration, and a
 * block would reset their cells a second time and break the identity a
 * closure captured between the two resets.
 */
function resolveStatementItems(
  statement: SyntaxStatement,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  loopDepth: number,
  breakDepth: number,
): readonly HirStatement[] | undefined {
  if (statement.kind !== "declaration-list") {
    const resolved = resolveStatement(
      statement,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    return resolved == null ? undefined : [resolved];
  }
  if (mixedDeclarationList(statement.declarations)) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        statement,
        "A lexical declaration list declares one kind of binding.",
      ),
    );
    return undefined;
  }
  const resolved: HirStatement[] = [];
  for (const declarator of statement.declarations) {
    const item = resolveStatement(
      declarator,
      scopes,
      state,
      functionBody,
      loopDepth,
      breakDepth,
    );
    if (item == null) return undefined;
    resolved.push(item);
  }
  return resolved;
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
 * True when ECMA-262 gives the function form its own `arguments` binding.
 * FunctionDeclarationInstantiation creates one for every function except
 * an arrow, whose `arguments` reference resolves lexically in the
 * enclosing function instead. Strictness selects the object's shape, not
 * whether the binding exists.
 */
function admitsArgumentsObject(functionValue: SyntaxFunction): boolean {
  const kind = functionValue.functionKind ?? "ordinary";
  return kind !== "arrow" && kind !== "async-arrow";
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
  // The frontend records each function's effective strictness, so the
  // body resolves under its own mode and restores the enclosing one.
  const outerStrict = state.strict;
  state.strict = functionValue.strict === true;
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
    functionValue.argumentsFormal !== true &&
    !parameterScope.has("arguments")
  ) {
    argumentsBinding = {
      id: state.nextBindingId,
      mutable: true,
      name: "arguments",
    };
    state.nextBindingId += 1;
    parameterScope.set("arguments", argumentsBinding);
  }
  const bodyScope = new Map<string, Binding>();
  predeclareBindings(
    functionValue.body,
    bodyScope,
    state,
    false,
    parameterScope,
  );
  // Labels never cross a function boundary.
  const outerLabels = state.labels.splice(0);
  const body = resolveStatementList(
    functionValue.body,
    [
      // An arrow declares no `arguments` of its own, so the enclosing
      // function's binding stays visible through `outerScopes` and its
      // reference resolves lexically.
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
  state.thisBinding = outerThisBinding;
  state.strict = outerStrict;
  // CreateMappedArgumentsObject is reachable only from
  // FunctionDeclarationInstantiation's non-strict, simple-parameter-list
  // branch; every other eligible form takes the unmapped snapshot.
  const argumentsMapped =
    argumentsBinding != null &&
    functionValue.strict !== true &&
    functionValue.simpleParameterList === true;
  const resolved: HirFunction = {
    ...functionValue,
    ...includePropertiesWhen(() => {
      if (argumentsBinding == null) return undefined;
      return {
        argumentsBindingId: argumentsBinding.id,
      };
    }),
    ...includePropertiesWhen(() => {
      if (!argumentsMapped) return undefined;
      return {
        argumentsMapped: true,
      };
    }),
    body,
    ...includePropertiesWhen(() => {
      if (derivedThisBinding == null) return undefined;
      return {
        derivedThisBindingId: derivedThisBinding.bindingId,
      };
    }),
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
    ...includePropertiesWhen(() => {
      if (selfBinding == null) return undefined;
      return {
        selfBindingId: selfBinding.id,
      };
    }),
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
    } else if (statement.kind === "for-in") {
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
      result.push(...declaredHirBindingIds(statement.functionInits ?? []));
      for (const switchCase of statement.cases) {
        result.push(...declaredHirBindingIds(switchCase.body));
      }
    } else if (statement.kind === "try") {
      result.push(...declaredHirBindingIds([statement.block]));
      if (statement.handler != null) {
        if (statement.handler.pattern != null) {
          result.push(
            ...hirBindingIdentifiers(statement.handler.pattern).map(
              (item) => item.bindingId,
            ),
          );
        }
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
    ...includePropertiesWhen(() => {
      if (resolved.sourceText == null) return undefined;
      return {
        sourceText: resolved.sourceText,
      };
    }),
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
    ...includePropertiesWhen(() => {
      if (keyNameBindingId == null) return undefined;
      return {
        fieldKeyBindingId: keyNameBindingId,
      };
    }),
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
    ...includePropertiesWhen(() => {
      if (keyNameBindingId == null) return undefined;
      return {
        keyNameBindingId,
      };
    }),
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
    ...includePropertiesWhen(() => {
      if (resolvedConstructor.sourceText == null) return undefined;
      return {
        sourceText: resolvedConstructor.sourceText,
      };
    }),
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
          ...includePropertiesWhen(() => {
            if (resolvedBlock.sourceText == null) return undefined;
            return {
              sourceText: resolvedBlock.sourceText,
            };
          }),
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
      ...includePropertiesWhen(() => {
        if (resolvedMethod.sourceText == null) return undefined;
        return {
          sourceText: resolvedMethod.sourceText,
        };
      }),
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
    ...includePropertiesWhen(() => {
      if (byteRange == null) return undefined;
      return { byteRange };
    }),
    constructorFunction,
    elements,
    ...includePropertiesWhen(() => {
      if (heritage == null) return undefined;
      return { heritage };
    }),
    kind: "class",
    ...includePropertiesWhen(() => {
      if (nameBinding == null) return undefined;
      return { nameBinding };
    }),
    ...includePropertiesWhen(() => {
      if (privateNames.length === 0) return undefined;
      return {
        privateNames,
      };
    }),
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
    if (
      mode === "write" &&
      isPropertyOwnedIntrinsicName(pattern.name) &&
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      return intrinsicGlobalPatternTarget(pattern.name, pattern, state);
    }
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      rejectPropertyOwnedIntrinsicWithFallbackWrite(
        pattern.name,
        pattern,
        state,
      )
    ) {
      return undefined;
    }
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      state.strict
    ) {
      rejectStrictWithFallbackWrite(pattern.name, pattern, state);
      return undefined;
    }
    const binding =
      resolution.binding ??
      (resolution.objectBindingIds.length === 0
        ? undefined
        : withFallbackBinding(pattern.name, state, true));
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
      ...includePropertiesWhen(() => {
        if (!(binding.functionNameBinding === true)) return undefined;
        return {
          functionNameBinding: true as const,
        };
      }),
      ...includePropertiesWhen(() => {
        if (!(binding.importedBinding === true)) return undefined;
        return {
          importedBinding: true as const,
        };
      }),
      mutable: binding.mutable,
      ...includePropertiesWhen(() => {
        if (resolution.objectBindingIds.length === 0) return undefined;
        return { withObjectBindingIds: resolution.objectBindingIds };
      }),
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
      const inferredName =
        resolvedPattern?.kind === "binding-identifier"
          ? resolvedPattern.name
          : resolvedPattern?.kind === "assignment-member"
            ? resolvedPattern.inferredName
            : undefined;
      if (initializer != null && inferredName != null) {
        initializer = inferFunctionName(initializer, inferredName);
      }
      if (
        key == null ||
        resolvedPattern == null ||
        (property.initializer != null && initializer == null)
      ) {
        return undefined;
      }
      properties.push({
        ...includePropertiesWhen(() => {
          if (property.byteRange == null) return undefined;
          return {
            byteRange: property.byteRange,
          };
        }),
        ...includePropertiesWhen(() => {
          if (initializer == null) return undefined;
          return {
            initializer,
          };
        }),
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
      ...includePropertiesWhen(() => {
        if (pattern.byteRange == null) return undefined;
        return {
          byteRange: pattern.byteRange,
        };
      }),
      kind: "object-binding-pattern",
      properties,
      ...includePropertiesWhen(() => {
        if (rest == null) return undefined;
        return { rest };
      }),
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
    const inferredName =
      resolvedPattern?.kind === "binding-identifier"
        ? resolvedPattern.name
        : resolvedPattern?.kind === "assignment-member"
          ? resolvedPattern.inferredName
          : undefined;
    if (initializer != null && inferredName != null) {
      initializer = inferFunctionName(initializer, inferredName);
    }
    if (
      resolvedPattern == null ||
      (element.initializer != null && initializer == null)
    ) {
      return undefined;
    }
    elements.push({
      ...includePropertiesWhen(() => {
        if (element.byteRange == null) return undefined;
        return {
          byteRange: element.byteRange,
        };
      }),
      ...includePropertiesWhen(() => {
        if (initializer == null) return undefined;
        return { initializer };
      }),
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
    ...includePropertiesWhen(() => {
      if (pattern.byteRange == null) return undefined;
      return {
        byteRange: pattern.byteRange,
      };
    }),
    elements,
    kind: "array-binding-pattern",
    ...includePropertiesWhen(() => {
      if (rest == null) return undefined;
      return { rest };
    }),
    range: pattern.range,
  };
}

/**
 * The first array pattern anywhere inside a resolved for-in head pattern.
 *
 * An object pattern's rest target is a leaf, so only a property's own
 * pattern can nest another pattern.
 */
function forInArrayPattern(
  pattern: HirBindingPattern,
): HirArrayBindingPattern | undefined {
  if (pattern.kind === "array-binding-pattern") return pattern;
  if (pattern.kind !== "object-binding-pattern") return undefined;
  for (const property of pattern.properties) {
    const found = forInArrayPattern(property.pattern);
    if (found != null) return found;
  }
  return undefined;
}

/**
 * Narrow a resolved for-in head pattern to the array-free object pattern
 * the head admits.
 *
 * Owned syntax keeps the head's own array pattern form unrepresentable,
 * but a nested one stays representable because it is an ordinary
 * recursive leaf of the object pattern. ForIn/OfBodyEvaluation always
 * supplies a String key and this realm creates no string iterator, so an
 * array pattern reached from a for-in head could only report a
 * `TypeError` where ECMA-262 destructures the key's code units. The
 * bootstrap frontend rejects both forms while converting; this boundary
 * repeats the rejection for any frontend, so no admitted head lowers to a
 * divergence.
 */
function forInHeadPattern(
  pattern: HirBindingPattern | undefined,
  located: LocatedSyntax,
  state: ResolveState,
): { readonly pattern: HirObjectBindingPattern } | undefined {
  if (pattern == null) return undefined;
  if (pattern.kind !== "object-binding-pattern") {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        located,
        "A for-in head pattern must be an object pattern.",
      ),
    );
    return undefined;
  }
  const nested = forInArrayPattern(pattern);
  if (nested != null) {
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        nested,
        "A for-in array pattern target is unsupported.",
      ),
    );
    return undefined;
  }
  return { pattern };
}

/**
 * Resolve a for-in head target against the scopes outside the head's own
 * lexical environment.
 *
 * ForIn/OfBodyEvaluation evaluates an assignment or `var` head reference
 * once per iteration in the surrounding environment, so only a `let` or
 * `const` head sees the fresh binding `declaredBinding` names or the
 * `headScopes` a lexical pattern head declares. The subject expression is
 * resolved by the caller, because the head environment exists while it
 * runs and these references do not.
 */
function resolveForInTarget(
  target: SyntaxForInTarget,
  scopes: readonly Map<string, Binding>[],
  headScopes: readonly Map<string, Binding>[],
  declaredBinding: Binding | undefined,
  state: ResolveState,
): HirForInTarget | undefined {
  if (target.kind === "pattern-declaration") {
    // A lexical pattern head initializes the cells its own head
    // environment declares; a `var` pattern head writes the hoisted cells
    // of the surrounding environment instead.
    const lexical = target.declarationKind !== "var";
    const pattern = resolveBindingPattern(
      target.pattern,
      lexical ? headScopes : scopes,
      state,
      lexical ? "declare" : "write",
      false,
    );
    const narrowed = forInHeadPattern(pattern, target.pattern, state);
    return narrowed == null ? undefined : { ...target, ...narrowed };
  }
  if (target.kind === "assignment-pattern") {
    const pattern = resolveBindingPattern(
      target.pattern,
      scopes,
      state,
      "write",
      true,
    );
    const narrowed = forInHeadPattern(pattern, target.pattern, state);
    return narrowed == null ? undefined : { ...target, ...narrowed };
  }
  if (target.kind === "declaration") {
    const binding = declaredBinding ?? findBinding(scopes, target.name);
    if (binding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          target,
          `Unknown binding '${target.name}'.`,
        ),
      );
      return undefined;
    }
    return { ...target, bindingId: binding.id, mutable: binding.mutable };
  }
  if (target.kind === "binding") {
    const resolution = resolveName(scopes, state, target.name);
    if (
      isPropertyOwnedIntrinsicName(target.name) &&
      resolution.binding == null &&
      resolution.objectBindingIds.length === 0
    ) {
      return intrinsicGlobalLoopTarget(target.name, target.range, state);
    }
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      rejectPropertyOwnedIntrinsicWithFallbackWrite(target.name, target, state)
    ) {
      return undefined;
    }
    if (
      resolution.binding == null &&
      resolution.objectBindingIds.length > 0 &&
      state.strict
    ) {
      rejectStrictWithFallbackWrite(target.name, target, state);
      return undefined;
    }
    const binding =
      resolution.binding ??
      (resolution.objectBindingIds.length === 0
        ? undefined
        : withFallbackBinding(target.name, state, true));
    if (binding == null) {
      state.diagnostics.push(
        sourceDiagnostic(
          state.sourceId,
          target,
          `Unknown binding '${target.name}'.`,
        ),
      );
      return undefined;
    }
    return {
      ...target,
      bindingId: binding.id,
      ...includePropertiesWhen(() => {
        if (!(binding.functionNameBinding === true)) return undefined;
        return {
          functionNameBinding: true as const,
        };
      }),
      ...includePropertiesWhen(() => {
        if (!(binding.importedBinding === true)) return undefined;
        return {
          importedBinding: true as const,
        };
      }),
      mutable: binding.mutable,
      ...includePropertiesWhen(() => {
        if (resolution.objectBindingIds.length === 0) return undefined;
        return { withObjectBindingIds: resolution.objectBindingIds };
      }),
    };
  }
  if (target.kind === "property") {
    const object = resolveExpression(target.object, scopes, state);
    const key = resolveExpression(target.key, scopes, state);
    return object == null || key == null
      ? undefined
      : { ...target, key, object };
  }
  const object = resolveExpression(target.object, scopes, state);
  const privateName = resolvePrivateName(target.name, target, scopes, state);
  return object == null || privateName == null
    ? undefined
    : { ...locatedOf(target), kind: "private", object, privateName };
}

function resolveStatement(
  statement: SyntaxStatement,
  scopes: readonly Map<string, Binding>[],
  state: ResolveState,
  functionBody: boolean,
  loopDepth = 0,
  breakDepth = 0,
): HirStatement | undefined {
  if (statement.kind === "declaration-list") {
    // ECMAScript admits a lexical declaration only where a StatementList
    // is admitted, so a list that reaches a single-statement position
    // means a frontend produced owned syntax the grammar does not have.
    state.diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        statement,
        "A lexical declaration list requires a statement list.",
      ),
    );
    return undefined;
  }
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
          readonly pattern: HirBindingPattern | undefined;
          readonly range: SourceRange;
        }
      | undefined;
    if (statement.handler != null) {
      // A nullish handler body is not constructible from the grammar,
      // but a frontend that builds owned syntax directly can omit it;
      // recover with one located diagnostic instead of resolving a
      // clause that has no block to run.
      // SAFETY: Direct frontends may omit this statically required field.
      if ((statement.handler.body as SyntaxStatement | undefined) == null) {
        state.diagnostics.push(
          sourceDiagnostic(
            state.sourceId,
            statement,
            "A catch clause requires a block body.",
          ),
        );
        return undefined;
      }
      const syntaxPattern = statement.handler.pattern;
      // Optional catch binding discards the thrown value, so no
      // catch-parameter scope exists and the body block owns its own
      // lexical scope.
      const catchScope =
        syntaxPattern == null ? undefined : new Map<string, Binding>();
      if (syntaxPattern != null && catchScope != null) {
        for (const name of syntaxBindingNames(syntaxPattern)) {
          if (catchScope.has(name)) {
            state.diagnostics.push(
              sourceDiagnostic(
                state.sourceId,
                syntaxPattern,
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
      }
      const handlerScopes =
        catchScope == null ? scopes : [...scopes, catchScope];
      const pattern =
        syntaxPattern == null
          ? undefined
          : resolveBindingPattern(
              syntaxPattern,
              handlerScopes,
              state,
              "declare",
              false,
            );
      if (syntaxPattern != null && pattern == null) return undefined;
      const body = resolveStatement(
        statement.handler.body,
        handlerScopes,
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
        statement.parameterEnvironmentBody !== true,
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
      terminal.kind === "for-in" ||
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
      ...includePropertiesWhen(() => {
        if (statement.byteRange == null) return undefined;
        return {
          byteRange: statement.byteRange,
        };
      }),
      body,
      ...includePropertiesWhen(() => {
        if (declarations == null) return undefined;
        return {
          declarations,
        };
      }),
      ...includePropertiesWhen(() => {
        if (init == null) return undefined;
        return { init };
      }),
      kind: "for",
      range: statement.range,
      ...includePropertiesWhen(() => {
        if (test == null) return undefined;
        return { test };
      }),
      ...includePropertiesWhen(() => {
        if (update == null) return undefined;
        return { update };
      }),
    };
  }
  if (statement.kind === "for-in") {
    // ForIn/OfHeadEvaluation creates the head's lexical environment
    // before the subject expression runs, so a same-name read in the
    // subject observes the temporal dead zone rather than an outer
    // binding.
    let forScopes = scopes;
    let declaredBinding: Binding | undefined;
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
      const patternScope = new Map<string, Binding>();
      for (const name of syntaxBindingNames(statement.target.pattern)) {
        if (patternScope.has(name)) {
          state.diagnostics.push(
            sourceDiagnostic(
              state.sourceId,
              statement.target.pattern,
              `Duplicate for-in binding '${name}'.`,
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
    const subject = resolveExpression(statement.subject, forScopes, state);
    const target = resolveForInTarget(
      statement.target,
      scopes,
      forScopes,
      declaredBinding,
      state,
    );
    const body = resolveStatement(
      statement.body,
      forScopes,
      state,
      functionBody,
      loopDepth + 1,
      breakDepth + 1,
    );
    if (subject == null || target == null || body == null) return undefined;
    return { ...statement, body, subject, target };
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
      if (
        isPropertyOwnedIntrinsicName(statement.target.name) &&
        resolution.binding == null &&
        resolution.objectBindingIds.length === 0
      ) {
        target = intrinsicGlobalLoopTarget(
          statement.target.name,
          statement.target.range,
          state,
        );
      } else if (
        resolution.binding == null &&
        resolution.objectBindingIds.length > 0 &&
        rejectPropertyOwnedIntrinsicWithFallbackWrite(
          statement.target.name,
          statement.target,
          state,
        )
      ) {
        return undefined;
      } else if (
        resolution.binding == null &&
        resolution.objectBindingIds.length > 0 &&
        state.strict
      ) {
        rejectStrictWithFallbackWrite(
          statement.target.name,
          statement.target,
          state,
        );
        return undefined;
      } else {
        const binding =
          resolution.binding ??
          (resolution.objectBindingIds.length === 0
            ? undefined
            : withFallbackBinding(statement.target.name, state, true));
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
            ...includePropertiesWhen(() => {
              if (!(binding.functionNameBinding === true)) return undefined;
              return { functionNameBinding: true as const };
            }),
            ...includePropertiesWhen(() => {
              if (!(binding.importedBinding === true)) return undefined;
              return {
                importedBinding: true as const,
              };
            }),
            mutable: binding.mutable,
            ...includePropertiesWhen(() => {
              if (resolution.objectBindingIds.length === 0) return undefined;
              return { withObjectBindingIds: resolution.objectBindingIds };
            }),
          };
        }
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
    predeclareBindings(caseStatements, caseScope, state, true);
    const caseScopes = [...scopes, caseScope];
    // Every clause's function declaration is instantiated once, here,
    // rather than where it appears in its own clause: ECMA-262 runs
    // BlockDeclarationInstantiation for the whole CaseBlock before
    // CaseBlockEvaluation selects a clause, so the binding exists and
    // holds a callable function no matter which clause runs first.
    const functionInits = buildFunctionInits(
      caseStatements,
      caseScope,
      caseScopes,
      state,
    );
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
        if (child.kind === "function") continue;
        const resolved = resolveStatementItems(
          child,
          caseScopes,
          state,
          functionBody,
          loopDepth,
          breakDepth + 1,
        );
        if (resolved == null) return undefined;
        body.push(...resolved);
      }
      cases.push({
        body,
        range: switchCase.range,
        ...includePropertiesWhen(() => {
          if (test == null) return undefined;
          return { test };
        }),
      });
    }
    return {
      ...statement,
      cases,
      discriminant,
      ...includePropertiesWhen(() => {
        if (functionInits.length === 0) return undefined;
        return {
          functionInits,
        };
      }),
    };
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
  /**
   * True when `program` is one module's body rather than a Script or
   * FunctionBody. A module's top-level function declarations are
   * LexicallyDeclaredNames, unlike a Script's or a FunctionBody's, which
   * treat them as hoistable, var-like declarations that any later
   * declaration of the same name freely replaces.
   */
  readonly moduleBody?: boolean;
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
    foldedTypeofReferences: [],
    globalObjectBindingIds: new Set(),
    functionInfo: new Map(),
    hirFunctions: [],
    intrinsicGlobalObjectBinding: undefined,
    intrinsicReadFallbacks: new Map(),
    labels: [],
    nextBindingId: seed.nextBindingId ?? 0,
    nextFunctionId: seed.nextFunctionId ?? 0,
    sourceId: program.sourceId,
    strict: program.strict === true,
    withFallbacks: [],
    withInitializingFallbackNames: new Set(),
    withScopes: new Map(),
  };
  const scriptScope = new Map(seed.bindings);
  predeclareBindings(
    program.body,
    scriptScope,
    state,
    seed.moduleBody === true,
  );
  for (const entry of program.globalObjectNames ?? []) {
    const binding = scriptScope.get(entry.name);
    if (binding != null) state.globalObjectBindingIds.add(binding.id);
  }
  const body = resolveStatementList(
    program.body,
    [],
    state,
    false,
    scriptScope,
  );
  // A hidden fallback cell an unresolved `with` assignment initializes
  // at run time materializes its name the way ECMA-262's sloppy global
  // write does, so every `typeof` the program folded to "undefined" for
  // such a name is rejected rather than misreported. The check runs
  // after the whole program resolves, so it holds regardless of where
  // the assignment and the fold occur relative to each other.
  for (const reference of state.foldedTypeofReferences) {
    if (!state.withInitializingFallbackNames.has(reference.name)) continue;
    diagnostics.push(
      sourceDiagnostic(
        state.sourceId,
        reference.located,
        `typeof with fallback binding '${reference.name}' is outside ` +
          "the admitted global-object profile.",
      ),
    );
  }
  if (diagnostics.length > 0) {
    return {
      diagnostics,
      nextBindingId: state.nextBindingId,
      nextFunctionId: state.nextFunctionId,
    };
  }
  // A var-scoped top-level name reaches its global-object property
  // through the binding the script scope already resolved, so the
  // property and the binding can never drift apart. A name the frontend
  // reports without a script binding would silently drop that property,
  // which is a frontend contract violation rather than a source error.
  const globalObjectBindings: HirGlobalObjectBinding[] = [];
  for (const entry of program.globalObjectNames ?? []) {
    const binding = scriptScope.get(entry.name);
    if (binding == null) {
      throw new Error(
        `Global object name '${entry.name}' has no script binding.`,
      );
    }
    globalObjectBindings.push({
      declaration: entry.declaration,
      id: binding.id,
      name: entry.name,
      range: entry.range,
    });
  }
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
      body:
        state.intrinsicGlobalObjectBinding == null
          ? body
          : [
              {
                bindingId: state.intrinsicGlobalObjectBinding.id,
                hint: undefined,
                initializer: {
                  kind: "this",
                  range: program.range,
                  thisMode: "global",
                },
                kind: "const",
                name: state.intrinsicGlobalObjectBinding.name,
                range: program.range,
              },
              ...body,
            ],
      functions: state.hirFunctions,
      globalLexicalNames: (program.globalLexicalNames ?? []).map((entry) => ({
        name: entry.name,
        range: entry.range,
      })),
      globalBindings: [
        ...(state.intrinsicGlobalObjectBinding == null
          ? []
          : [state.intrinsicGlobalObjectBinding]),
        ...state.intrinsicReadFallbacks.values(),
      ],
      globalObjectBindings,
      ...includePropertiesWhen(() => {
        if (state.intrinsicGlobalObjectBinding == null) return undefined;
        return {
          intrinsicGlobalObjectBindingId: state.intrinsicGlobalObjectBinding.id,
        };
      }),
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
