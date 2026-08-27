import { specializeAddition } from "./mir-specialize.ts";
import { anonymousDefinition } from "./hir.ts";
import type {
  HirArrayBindingPattern,
  HirArraySpreadElement,
  HirBindingIdentifier,
  HirBindingPattern,
  HirCallArgument,
  HirClassField,
  HirClassMethod,
  HirExpression,
  HirForDeclaration,
  HirForOfTarget,
  HirObjectBindingPattern,
  HirParameter,
  HirPrivateName,
  HirPrivateNameKey,
  HirProgram,
  HirSpreadArgument,
  HirStatement,
  HirWithBindingReference,
  HirWithReference,
} from "./hir.ts";
import { declaredHirBindingIds, hirBindingIdentifiers } from "./hir-build.ts";
import { numberText } from "./hir-print.ts";
import type {
  CompilerOptions,
  MirBuilder,
  MirCallTarget,
  MirConstant,
  MirControlTarget,
  MirFunction,
  MirGlobalObjectBinding,
  MirOperation,
  MirParameter,
  MirProgram,
  MutableMirBlock,
  SpecializationMode,
} from "./mir.ts";
import type { SourceRange } from "./source.ts";
import type {
  AssignmentOperator,
  BinaryOperator,
  BindingPatternMode,
  LogicalOperator,
} from "./syntax.ts";

function includePropertiesWhen<const Properties extends object>(
  properties: () => Properties | undefined,
): Properties | { [Key in keyof Properties]?: never } {
  return properties() ?? {};
}

function controlTarget(builder: MirBuilder, blockId: number): MirControlTarget {
  return { blockId, cleanupDepth: builder.finalizers.length };
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
    ...includePropertiesWhen(() => {
      if (!(kind === "check-status" && abruptTarget != null)) return undefined;
      return { abruptTarget };
    }),
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
  return convertPropertyKey(input, expression.range, builder);
}

function convertPropertyKey(
  input: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "primitive property-key conversion",
    [input],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "ToPropertyKey for admitted primitives",
    id,
    kind: "property-key",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * The `super` operand of a property reference, when the reference is
 * one. A `super` reference keeps its lookup start and its receiver
 * apart, so every property lowering that admits the operand asks for it
 * before it lowers the object as an ordinary expression.
 */
function superOperand(
  object: HirExpression,
): (HirExpression & { readonly kind: "super-base" }) | undefined {
  return object.kind === "super-base" ? object : undefined;
}

/**
 * Lowers the receiver of one `super` operand. The receiver is read
 * before the key expression, because a reference inside a derived
 * constructor observes the `this` temporal dead zone first.
 */
function lowerSuperReceiver(
  operand: HirExpression & { readonly kind: "super-base" },
  builder: MirBuilder,
): number {
  return lowerExpression(operand.receiver, builder);
}

/**
 * Emits the object a `super` lookup starts at, which is the home
 * object's prototype. MakeSuperPropertyReference reads that prototype
 * after the computed key expression has produced its value, so a key
 * that replaces the home object's prototype is observed by the very
 * reference it precedes.
 */
function lowerSuperBase(
  operand: HirExpression & { readonly kind: "super-base" },
  builder: MirBuilder,
): number {
  const base = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "home object prototype",
    id: base,
    kind: "super-base",
    range: operand.range,
  });
  return recordRoot(builder, base, operand.range);
}

/**
 * Lowers the lookup object and the unconverted key of one property
 * reference in specified order. An ordinary reference evaluates its
 * object expression before the key. A `super` reference has already
 * read its receiver and reads the home object's prototype only after
 * the key, so the two orders cannot share one sequence.
 */
function lowerReferenceObject(
  objectExpression: HirExpression,
  keyExpression: HirExpression,
  operand: (HirExpression & { readonly kind: "super-base" }) | undefined,
  builder: MirBuilder,
) {
  if (operand == null) {
    const object = lowerExpression(objectExpression, builder);
    return { keyInput: lowerExpression(keyExpression, builder), object };
  }
  const keyInput = lowerExpression(keyExpression, builder);
  return { keyInput, object: lowerSuperBase(operand, builder) };
}

function lowerSpecializedPropertyGet(
  object: number,
  keyExpression: HirExpression,
  range: SourceRange,
  builder: MirBuilder,
  superReceiver?: number,
): number {
  const cacheBlock = createMirBlock(builder);
  const hitBlock = createMirBlock(builder);
  const genericBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);

  const objectGuard = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object],
    detail: `object -> bb${cacheBlock.id}, miss -> bb${genericBlock.id}`,
    id: objectGuard,
    kind: "guard-object",
    range,
  });
  builder.current.terminator = {
    kind: "branch",
    test: objectGuard,
    whenFalse: genericBlock.id,
    whenTrue: cacheBlock.id,
  };

  builder.current = cacheBlock;
  const cacheGuard = builder.nextValue;
  builder.nextValue += 1;
  cacheBlock.operations.push({
    arguments: [object],
    cacheId: cacheGuard,
    detail: `cached slot -> bb${hitBlock.id}, miss -> bb${genericBlock.id}`,
    id: cacheGuard,
    kind: "guard-shape",
    range,
  });
  cacheBlock.terminator = {
    kind: "branch",
    test: cacheGuard,
    whenFalse: genericBlock.id,
    whenTrue: hitBlock.id,
  };

  builder.current = hitBlock;
  appendMirMetadata(builder, "count-guard-hit", "property read", [], range);
  const hitValue = builder.nextValue;
  builder.nextValue += 1;
  hitBlock.operations.push({
    arguments: [object],
    cacheId: cacheGuard,
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
    arguments:
      superReceiver == null ? [object, key] : [object, key, superReceiver],
    detail: "generic",
    id: genericValue,
    kind: "property-get",
    range,
    ...includePropertiesWhen(() => {
      if (superReceiver == null) return undefined;
      return {
        superReference: true as const,
      };
    }),
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
    { cacheId: cacheGuard },
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

function lowerArrayAppend(
  array: number,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
  failureDetail = "normal -> continue, abrupt -> return without close",
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "array element append",
    [array, value],
    range,
  );
  const result = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [array, value],
    detail: "array element append",
    id: result,
    kind: "array-append",
    range,
  });
  appendMirMetadata(builder, "check-status", failureDetail, [result], range);
  recordRoot(builder, result, range);
}

function lowerArrayHoleAppend(
  array: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  appendMirMetadata(builder, "safepoint", "array hole append", [array], range);
  const result = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [array],
    detail: "array hole append",
    id: result,
    kind: "array-append-hole",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return without close",
    [result],
    range,
  );
  recordRoot(builder, result, range);
}

function lowerArgumentListCreate(
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "dynamic argument list allocation",
    [],
    range,
  );
  const list = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "dynamic argument list",
    id: list,
    kind: "argument-list-create",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> append, abrupt -> return",
    [list],
    range,
  );
  return recordRoot(builder, list, range);
}

function lowerArgumentListAppend(
  list: number,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "call argument append",
    [list, value],
    range,
  );
  const result = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [list, value],
    detail: "call argument append",
    id: result,
    kind: "argument-list-append",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return without close",
    [result],
    range,
  );
  recordRoot(builder, result, range);
}

type SpreadDestination =
  | { readonly kind: "argument-list"; readonly value: number }
  | { readonly kind: "array"; readonly value: number };

function lowerSpreadValues(
  spread: HirArraySpreadElement | HirSpreadArgument,
  destination: SpreadDestination,
  builder: MirBuilder,
): void {
  const label = destination.kind === "array" ? "array" : "call argument";
  const iterable = lowerExpression(spread.argument, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    `get ${label} spread iterator`,
    [iterable],
    spread.range,
  );
  const iterator = builder.nextValue;
  builder.nextValue += 1;
  const nextMethod = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterable],
    detail: "GetIterator sync",
    id: iterator,
    iteratorNextMethodResult: nextMethod,
    kind: "iterator-get",
    range: spread.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> step, abrupt -> return without close",
    [iterator],
    spread.range,
  );
  recordRoot(builder, iterator, spread.range);
  recordRoot(builder, nextMethod, spread.range);

  const stepBlock = createMirBlock(builder);
  const appendBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  builder.current.terminator = { kind: "jump", target: stepBlock.id };

  builder.current = stepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    `step ${label} spread iterator`,
    [iterator, nextMethod],
    spread.range,
  );
  const hasValue = builder.nextValue;
  builder.nextValue += 1;
  const value = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator, nextMethod],
    detail: "IteratorStep and IteratorValue",
    id: hasValue,
    iteratorValueResult: value,
    kind: "iterator-next",
    range: spread.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> return without close",
    [hasValue],
    spread.range,
  );
  recordRoot(builder, value, spread.range);
  builder.current.terminator = {
    kind: "branch",
    test: hasValue,
    whenFalse: exitBlock.id,
    whenTrue: appendBlock.id,
  };

  builder.current = appendBlock;
  if (destination.kind === "array") {
    lowerArrayAppend(destination.value, value, spread.range, builder);
  } else {
    lowerArgumentListAppend(destination.value, value, spread.range, builder);
  }
  builder.current.terminator = { kind: "jump", target: stepBlock.id };

  builder.current = exitBlock;
  appendMirMetadata(
    builder,
    "join",
    `${label} spread bb${stepBlock.id}`,
    [],
    spread.range,
  );
}

function lowerArraySpread(
  element: HirArraySpreadElement,
  array: number,
  builder: MirBuilder,
): void {
  lowerSpreadValues(element, { kind: "array", value: array }, builder);
}

function lowerCallArguments(
  argumentsValue: readonly HirCallArgument[],
  range: SourceRange,
  builder: MirBuilder,
) {
  if (!argumentsValue.some((argument) => argument.kind === "spread")) {
    return {
      ids: argumentsValue.map((argument) => {
        if (argument.kind === "spread") {
          throw new Error("Static call lowering received a spread argument.");
        }
        return lowerExpression(argument, builder);
      }),
    };
  }
  const list = lowerArgumentListCreate(range, builder);
  for (const argument of argumentsValue) {
    if (argument.kind === "spread") {
      lowerSpreadValues(
        argument,
        { kind: "argument-list", value: list },
        builder,
      );
    } else {
      const value = lowerExpression(argument, builder);
      lowerArgumentListAppend(list, value, argument.range, builder);
    }
  }
  return { ids: [], list };
}

interface BindingWrite {
  readonly bindingId: number;
  readonly functionNameBinding?: boolean;
  readonly importedBinding?: boolean;
  readonly mutable: boolean;
  readonly name: string;
  readonly range: SourceRange;
}

function lowerBindingRead(
  bindingId: number,
  name: string,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(builder, "safepoint", "binding read error", [], range);
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    bindingId,
    detail: name,
    id,
    kind: "read",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

function lowerBindingWrite(
  expression: BindingWrite,
  value: number,
  builder: MirBuilder,
): number {
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
    ...includePropertiesWhen(() => {
      if (!(expression.functionNameBinding === true)) return undefined;
      return {
        functionNameBinding: true,
      };
    }),
    ...includePropertiesWhen(() => {
      if (!(expression.importedBinding === true)) return undefined;
      return {
        importedBinding: true,
      };
    }),
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

function lowerPropertyRead(
  object: number,
  key: number,
  range: SourceRange,
  builder: MirBuilder,
  superReceiver?: number,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "generic property lookup",
    [object, key],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments:
      superReceiver == null ? [object, key] : [object, key, superReceiver],
    detail: "property-get",
    id,
    kind: "property-get",
    range,
    ...includePropertiesWhen(() => {
      if (superReceiver == null) return undefined;
      return {
        superReference: true as const,
      };
    }),
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

function lowerObjectCoercible(
  input: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "require assignment target object-coercible",
    [input],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "RequireObjectCoercible for assignment target",
    id,
    kind: "object-coercible",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> convert property key, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/** Reject a nullish property-delete base before converting its key. */
function lowerDeleteObjectCoercible(
  input: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "require delete base object-coercible",
    [input],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "RequireObjectCoercible for property delete",
    id,
    kind: "delete-object-coercible",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> convert delete property key, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * Marks one property assignment or deletion as strict when it is lowered
 * inside a region that is strict regardless of the enclosing function.
 */
function strictCodeFlag(builder: MirBuilder): { readonly strict?: true } {
  return builder.strictCode ? { strict: true } : {};
}

/** Delete one already-evaluated ordinary property reference. */
function lowerPropertyDelete(
  object: number,
  key: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "property deletion error",
    [object, key],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object, key],
    detail: "property-delete",
    id,
    kind: "property-delete",
    range,
    ...strictCodeFlag(builder),
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * Rejects one evaluated `super` property reference used as a `delete`
 * operand. ECMA-262 evaluates the reference first, so the receiver read
 * and the key expression have already run and the key was deliberately
 * left unconverted; the reference's own category is what fails, and it
 * always fails, so the operation takes no argument and never completes
 * normally.
 */
function lowerSuperPropertyDelete(
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "super property deletion error",
    [],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "delete of a super property reference",
    id,
    kind: "super-property-delete",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "always abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

function lowerPropertyWrite(
  object: number,
  key: number,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
  superReceiver?: number,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "property storage growth",
    [object, key, value],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments:
      superReceiver == null
        ? [object, key, value]
        : [object, key, value, superReceiver],
    detail: "property-set",
    id,
    kind: "property-set",
    range,
    ...strictCodeFlag(builder),
    ...includePropertiesWhen(() => {
      if (superReceiver == null) return undefined;
      return {
        superReference: true as const,
      };
    }),
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * Preserve strict global-environment PutValue semantics around an evaluated
 * write value. The binding must exist both when the reference is formed and
 * when the property write occurs.
 */
function lowerStrictGlobalPropertyWrite(
  initialExists: number,
  object: number,
  key: number,
  value: number,
  fallback: { readonly bindingId: number; readonly name: string },
  range: SourceRange,
  builder: MirBuilder,
): number {
  const exists = lowerLogicalValue(
    initialExists,
    "&&",
    () => lowerBinaryValues(key, "in", object, range, builder),
    range,
    builder,
  );
  const writeBlock = createMirBlock(builder);
  const missingBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  builder.current.terminator = {
    kind: "branch",
    test: exists,
    whenFalse: missingBlock.id,
    whenTrue: writeBlock.id,
  };
  builder.current = writeBlock;
  const written = lowerPropertyWrite(object, key, value, range, builder);
  writeBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [written],
  };
  builder.current = missingBlock;
  const missing = lowerBindingRead(
    fallback.bindingId,
    fallback.name,
    range,
    builder,
  );
  missingBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [missing],
  };
  builder.current = joinBlock;
  return recordRoot(builder, result, range);
}

interface LoweredWithReference {
  readonly key: number;
  readonly object: number;
  /** An Oseo boolean naming whether `object` owns the selected reference. */
  readonly property: number;
}

/**
 * Resolve one identifier reference against its active `with` objects.
 * The chosen object is fixed before an assignment evaluates its right
 * operand, matching ResolveBinding and PutValue ordering.
 */
function lowerWithReference(
  reference: Pick<HirWithReference, "name" | "objectBindingIds" | "range">,
  builder: MirBuilder,
): LoweredWithReference {
  const key = lowerPropertyKey(
    { kind: "string", range: reference.range, value: reference.name },
    builder,
  );
  const joinBlock = createMirBlock(builder);
  const selectedObject = builder.nextValue;
  builder.nextValue += 1;
  const selectedProperty = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [selectedObject, selectedProperty];
  for (const bindingId of reference.objectBindingIds) {
    const object = lowerBindingRead(
      bindingId,
      "<with object>",
      reference.range,
      builder,
    );
    const found = lowerBinaryValues(
      key,
      "in",
      object,
      reference.range,
      builder,
    );
    const propertyBlock = createMirBlock(builder);
    const nextBlock = createMirBlock(builder);
    builder.current.terminator = {
      kind: "branch",
      test: found,
      whenFalse: nextBlock.id,
      whenTrue: propertyBlock.id,
    };
    builder.current = propertyBlock;
    propertyBlock.terminator = {
      kind: "jump",
      target: joinBlock.id,
      values: [object, found],
    };
    builder.current = nextBlock;
  }
  const noObject = lowerSyntheticUndefined(reference.range, builder);
  const noProperty = lowerExpression(
    { kind: "boolean", range: reference.range, value: false },
    builder,
  );
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [noObject, noProperty],
  };
  builder.current = joinBlock;
  recordRoot(builder, selectedObject, reference.range);
  recordRoot(builder, selectedProperty, reference.range);
  return { key, object: selectedObject, property: selectedProperty };
}

function lowerWithRead(
  reference: HirWithReference,
  builder: MirBuilder,
  retainReceiver: boolean,
) {
  const selected = lowerWithReference(reference, builder);
  const propertyBlock = createMirBlock(builder);
  const fallbackBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const value = builder.nextValue;
  builder.nextValue += 1;
  const receiver = retainReceiver ? builder.nextValue : undefined;
  if (receiver != null) builder.nextValue += 1;
  joinBlock.parameters = receiver == null ? [value] : [value, receiver];
  builder.current.terminator = {
    kind: "branch",
    test: selected.property,
    whenFalse: fallbackBlock.id,
    whenTrue: propertyBlock.id,
  };
  builder.current = propertyBlock;
  const propertyValue = lowerPropertyRead(
    selected.object,
    selected.key,
    reference.range,
    builder,
  );
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values:
      receiver == null ? [propertyValue] : [propertyValue, selected.object],
  };
  builder.current = fallbackBlock;
  const fallbackValue = lowerExpression(reference.fallback, builder);
  const fallbackReceiver =
    receiver == null
      ? undefined
      : lowerSyntheticUndefined(reference.range, builder);
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values:
      fallbackReceiver == null
        ? [fallbackValue]
        : [fallbackValue, fallbackReceiver],
  };
  builder.current = joinBlock;
  recordRoot(builder, value, reference.range);
  if (receiver != null) recordRoot(builder, receiver, reference.range);
  return {
    ...includePropertiesWhen(() => {
      if (receiver == null) return undefined;
      return { receiver };
    }),
    value,
  };
}

/** Delete the binding selected by one non-strict `with` environment chain. */
function lowerWithDelete(
  reference: Extract<HirExpression, { readonly kind: "with-delete" }>,
  builder: MirBuilder,
): number {
  const selected = lowerWithReference(reference, builder);
  const propertyBlock = createMirBlock(builder);
  const fallbackBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  builder.current.terminator = {
    kind: "branch",
    test: selected.property,
    whenFalse: fallbackBlock.id,
    whenTrue: propertyBlock.id,
  };
  builder.current = propertyBlock;
  const propertyResult = lowerPropertyDelete(
    selected.object,
    selected.key,
    reference.range,
    builder,
  );
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [propertyResult],
  };
  builder.current = fallbackBlock;
  const fallbackResult = lowerExpression(reference.fallback, builder);
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [fallbackResult],
  };
  builder.current = joinBlock;
  return recordRoot(builder, result, reference.range);
}

function lowerWithBindingRead(
  selected: LoweredWithReference,
  fallback: HirWithBindingReference,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const propertyBlock = createMirBlock(builder);
  const fallbackBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const value = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [value];
  builder.current.terminator = {
    kind: "branch",
    test: selected.property,
    whenFalse: fallbackBlock.id,
    whenTrue: propertyBlock.id,
  };
  builder.current = propertyBlock;
  const propertyValue = lowerPropertyRead(
    selected.object,
    selected.key,
    range,
    builder,
  );
  propertyBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [propertyValue],
  };
  builder.current = fallbackBlock;
  const fallbackValue = lowerBindingRead(
    fallback.bindingId,
    fallback.name,
    range,
    builder,
  );
  fallbackBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [fallbackValue],
  };
  builder.current = joinBlock;
  return recordRoot(builder, value, range);
}

function lowerWithBindingWrite(
  selected: LoweredWithReference,
  fallback: HirWithBindingReference,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const propertyBlock = createMirBlock(builder);
  const fallbackBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  builder.current.terminator = {
    kind: "branch",
    test: selected.property,
    whenFalse: fallbackBlock.id,
    whenTrue: propertyBlock.id,
  };
  builder.current = propertyBlock;
  const propertyResult = lowerPropertyWrite(
    selected.object,
    selected.key,
    value,
    range,
    builder,
  );
  propertyBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [propertyResult],
  };
  builder.current = fallbackBlock;
  const fallbackResult = lowerBindingWrite(
    { ...fallback, range },
    value,
    builder,
  );
  fallbackBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [fallbackResult],
  };
  builder.current = joinBlock;
  return recordRoot(builder, result, range);
}

function lowerBinaryValues(
  left: number,
  operator: BinaryOperator,
  right: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  if (operator === "+") {
    appendMirMetadata(
      builder,
      "safepoint",
      "string addition fallback",
      [left, right],
      range,
    );
  } else if (operator === "in" || operator === "instanceof") {
    appendMirMetadata(
      builder,
      "safepoint",
      operator === "in"
        ? "property key allocation"
        : "prototype key allocation",
      [left, right],
      range,
    );
  } else if (operator !== "===" && operator !== "!==") {
    appendMirMetadata(
      builder,
      "safepoint",
      "operand coercion",
      [left, right],
      range,
    );
  }
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [left, right],
    detail: String(operator),
    id,
    kind: "binary",
    operator,
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

function lowerLogicalValue(
  left: number,
  operator: LogicalOperator,
  lowerRight: () => number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const rightBlock = createMirBlock(builder);
  const shortBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  if (operator === "??") {
    const nullishTest = (constant: MirConstant): number => {
      const constantId = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [],
        constant,
        detail: constant.kind,
        id: constantId,
        kind: "constant",
        range,
      });
      const testId = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [left, constantId],
        detail: "===",
        id: testId,
        kind: "binary",
        operator: "===",
        range,
      });
      appendMirMetadata(
        builder,
        "check-status",
        "normal -> continue, abrupt -> return",
        [testId],
        range,
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
      range,
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
      range,
    );
    builder.current.terminator = {
      kind: "branch",
      test: isUndefined,
      whenFalse: shortBlock.id,
      whenTrue: rightBlock.id,
    };
  } else {
    const takenBlock = operator === "&&" ? rightBlock.id : shortBlock.id;
    const skippedBlock = operator === "&&" ? shortBlock.id : rightBlock.id;
    appendMirMetadata(
      builder,
      "branch",
      `${operator} true -> bb${takenBlock}, false -> bb${skippedBlock}`,
      [left],
      range,
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
  const right = lowerRight();
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [right],
  };
  builder.current = joinBlock;
  appendMirMetadata(
    builder,
    "join",
    `${operator} bb${shortBlock.id} + bb${rightBlock.id}`,
    [],
    range,
  );
  return recordRoot(builder, result, range);
}

function lowerAssignmentValue(
  current: number,
  operator: AssignmentOperator,
  value: HirExpression,
  write: (assigned: number) => number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  if (operator === "&&" || operator === "??" || operator === "||") {
    return lowerLogicalValue(
      current,
      operator,
      () => write(lowerExpression(value, builder)),
      range,
      builder,
    );
  }
  const right = lowerExpression(value, builder);
  return write(lowerBinaryValues(current, operator, right, range, builder));
}

function lowerUpdateValue(
  current: number,
  operator: "++" | "--",
  prefix: boolean,
  write: (assigned: number) => number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "update operand coercion",
    [current],
    range,
  );
  const numeric = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [current],
    detail: "to-numeric",
    id: numeric,
    kind: "unary",
    operator: "to-numeric",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [numeric],
    range,
  );
  recordRoot(builder, numeric, range);
  appendMirMetadata(
    builder,
    "safepoint",
    "update numeric one",
    [numeric],
    range,
  );
  const one = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [numeric],
    detail: "numeric-one",
    id: one,
    kind: "unary",
    operator: "numeric-one",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [one],
    range,
  );
  recordRoot(builder, one, range);
  const assigned = lowerBinaryValues(
    numeric,
    operator === "++" ? "+" : "-",
    one,
    range,
    builder,
  );
  write(assigned);
  return prefix ? assigned : numeric;
}

/**
 * Raises one already-lowered value as a throw completion, which is what
 * a `throw` statement does at its own position and what an asynchronous
 * generator body does when a resumption delivers a throw completion or
 * an awaited promise rejects. The value reaches the innermost enclosing
 * handler, so every `catch`, `finally`, and iterator close between the
 * position and the body's edge still runs.
 */
function lowerThrowValue(
  value: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  const target = builder.abruptTargets.at(-1);
  setCompletion(builder, "throw", target?.blockId ?? 0, range, value);
  builder.current.terminator =
    target == null
      ? { completionSlot: 0, kind: "resume-completion" }
      : { kind: "jump", target: target.blockId };
}

/**
 * Await inside an asynchronous generator body: the body suspends with
 * the operand instead of draining the scheduler, so the driver returns
 * to whoever resumed it and settles the operand on its own. A fulfilled
 * operand resumes with its value as this expression's result; a rejected
 * one resumes with a throw completion raised at this position.
 */
function lowerAsyncGeneratorAwait(
  operand: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "asynchronous generator await",
    [operand],
    range,
  );
  const sent = builder.nextValue;
  builder.nextValue += 1;
  const resume = createMirBlock(builder);
  const throwResume = createMirBlock(builder);
  builder.current.terminator = {
    awaited: true,
    kind: "generator-yield",
    resume: resume.id,
    sent,
    throwResume: throwResume.id,
    value: operand,
  };
  /* The rejection chain is captured while lowering the await, because
   * the builder's handler stack only describes this point. */
  builder.current = throwResume;
  lowerThrowValue(sent, range, builder);
  builder.current = resume;
  return recordRoot(builder, sent, range);
}

/**
 * One AsyncGeneratorYield: the suspension reports `value` as an
 * iteration step without awaiting it. Only the `yield` operator awaits
 * its operand, which is why `yield*` reports a promise the delegated
 * iterator produced unchanged.
 *
 * The caller owns the three resumptions. `returnResume` receives a
 * return completion, whose value AsyncGeneratorUnwrapYieldResumption
 * awaits before it reaches the block, and `throwResume` receives a throw
 * completion, which is raised unchanged. Both continue with the sent
 * slot this function returns alongside its own resume value.
 */
function appendAsyncGeneratorYield(
  value: number,
  range: SourceRange,
  builder: MirBuilder,
) {
  const yielded = value;
  appendMirMetadata(
    builder,
    "safepoint",
    "generator suspension result allocation",
    [yielded],
    range,
  );
  const sent = builder.nextValue;
  builder.nextValue += 1;
  const resume = createMirBlock(builder);
  const returnResume = createMirBlock(builder);
  const throwResume = createMirBlock(builder);
  builder.current.terminator = {
    kind: "generator-yield",
    resume: resume.id,
    returnResume: returnResume.id,
    sent,
    throwResume: throwResume.id,
    value: yielded,
  };
  builder.current = throwResume;
  lowerThrowValue(sent, range, builder);
  builder.current = resume;
  recordRoot(builder, sent, range);
  return { resume, returnResume, sent, throwResume };
}

/**
 * `yield operand` inside an asynchronous generator body. The operator
 * awaits its operand before the suspension reports it, so a promise
 * reaches the consumer as its settled value. A return resumption leaves
 * the body the way a `return` statement written at the suspension point
 * would, after awaiting the value it delivers.
 */
function lowerAsyncGeneratorYield(
  value: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const awaited = lowerAsyncGeneratorAwait(value, range, builder);
  const suspension = appendAsyncGeneratorYield(awaited, range, builder);
  const resume = builder.current;
  builder.current = suspension.returnResume;
  const returned = lowerAsyncGeneratorAwait(suspension.sent, range, builder);
  if (!enterFinalizer(builder, "return", range, returned)) {
    builder.current.terminator = { kind: "return", value: returned };
  }
  builder.current = resume;
  return suspension.sent;
}

interface AwaitedIteratorStep {
  readonly continues: number;
  readonly value: number;
}

/**
 * Starts one asynchronous iterator operation, suspends the owning frame on
 * its promise, and inspects the settled result only after resumption. The
 * mode slot preserves the one delegation-return path whose awaited result
 * is a direct completion value rather than an iterator result object.
 */
function lowerAwaitedIteratorStep(
  kind: NonNullable<MirOperation["iteratorStepKind"]>,
  arguments_: readonly number[],
  range: SourceRange,
  detail: string,
  valueWhenDone: boolean,
  builder: MirBuilder,
): AwaitedIteratorStep {
  appendMirMetadata(builder, "safepoint", `start ${detail}`, arguments_, range);
  const promise = builder.nextValue;
  builder.nextValue += 1;
  const valueOnly = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: arguments_,
    detail: `start ${detail}`,
    id: promise,
    iteratorStepKind: kind,
    iteratorValueOnlyResult: valueOnly,
    kind: "iterator-await-start",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> suspend, abrupt -> return without close",
    [promise],
    range,
  );
  recordRoot(builder, promise, range);
  recordRoot(builder, valueOnly, range);
  const settled = lowerAsyncGeneratorAwait(promise, range, builder);

  appendMirMetadata(
    builder,
    "safepoint",
    `inspect ${detail}`,
    [settled, valueOnly],
    range,
  );
  const continues = builder.nextValue;
  builder.nextValue += 1;
  const value = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [settled, valueOnly, arguments_[0]!],
    detail: `inspect ${detail}`,
    id: continues,
    iteratorStepKind: kind,
    iteratorValueResult: value,
    ...includePropertiesWhen(() => {
      if (!valueWhenDone) return undefined;
      return {
        iteratorValueWhenDone: true as const,
      };
    }),
    kind: "iterator-await-result",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> return without close",
    [continues],
    range,
  );
  recordRoot(builder, value, range);
  return { continues, value };
}

/**
 * Starts AsyncIteratorClose and suspends only when a present `return` method
 * produced a promise to await. The pending completion remains in its saved
 * slot while the owning frame is suspended, so an in-flight throw keeps its
 * precedence and a never-settling close leaves the operation pending.
 */
function lowerAwaitedIteratorClose(
  iterator: number,
  completionSlot: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "start AsyncIteratorClose",
    [iterator],
    range,
  );
  const needsAwait = builder.nextValue;
  builder.nextValue += 1;
  const promise = builder.nextValue;
  builder.nextValue += 1;
  const ignoreResult = builder.nextValue;
  builder.nextValue += 1;
  const skipValidation = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator],
    completionSlot,
    detail: "start AsyncIteratorClose",
    id: needsAwait,
    iteratorCloseResultMode: skipValidation,
    iteratorValueOnlyResult: ignoreResult,
    iteratorValueResult: promise,
    kind: "iterator-close-start",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> await when required, abrupt -> override completion",
    [needsAwait],
    range,
  );
  recordRoot(builder, promise, range);
  recordRoot(builder, ignoreResult, range);
  recordRoot(builder, skipValidation, range);

  const awaitBlock = createMirBlock(builder);
  const resumeBlock = createMirBlock(builder);
  builder.current.terminator = {
    kind: "branch",
    test: needsAwait,
    whenFalse: resumeBlock.id,
    whenTrue: awaitBlock.id,
  };

  builder.current = awaitBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "await AsyncIteratorClose",
    [promise],
    range,
  );
  const settled = builder.nextValue;
  builder.nextValue += 1;
  const fulfilledBlock = createMirBlock(builder);
  const rejectedBlock = createMirBlock(builder);
  const propagateBlock = createMirBlock(builder);
  builder.current.terminator = {
    awaited: true,
    kind: "generator-yield",
    resume: fulfilledBlock.id,
    sent: settled,
    throwResume: rejectedBlock.id,
    value: promise,
  };
  builder.current = rejectedBlock;
  builder.current.terminator = {
    kind: "branch",
    test: ignoreResult,
    whenFalse: propagateBlock.id,
    whenTrue: resumeBlock.id,
  };
  builder.current = propagateBlock;
  lowerThrowValue(settled, range, builder);
  builder.current = fulfilledBlock;
  recordRoot(builder, settled, range);
  appendMirMetadata(
    builder,
    "safepoint",
    "complete AsyncIteratorClose",
    [settled, ignoreResult, skipValidation],
    range,
  );
  const closed = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [settled, ignoreResult, skipValidation],
    detail: "complete AsyncIteratorClose",
    id: closed,
    kind: "iterator-close-result",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> resume completion, abrupt -> override completion",
    [closed],
    range,
  );
  recordRoot(builder, closed, range);
  builder.current.terminator = { kind: "jump", target: resumeBlock.id };
  builder.current = resumeBlock;
}

/**
 * `yield* operand` inside an asynchronous generator body: acquire the
 * operand's asynchronous iterator once, then forward every resumption of
 * the enclosing generator to it.
 *
 * Unlike the synchronous delegation, each step reports the inner
 * iterator's `value` rather than its whole result object, because
 * AsyncGeneratorYield produces the outer step. That step awaits nothing:
 * only the `yield` operator awaits its operand, so a promise the
 * delegated iterator produced reaches the consumer unchanged.
 * A return resumption steps the inner iterator's `return`, and a throw
 * resumption steps its `throw`; either method reporting a done result
 * ends the delegation, a return ending it leaves the body through the
 * return completion, and a throw ending it completes the delegating
 * expression with the reported value. An inner iterator with no `throw`
 * method is closed and the delegation reports a `TypeError`, which the
 * step operation itself raises.
 */
function lowerAsyncYieldDelegation(
  argument: HirExpression,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const iterable = lowerExpression(argument, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "get delegated asynchronous iterator",
    [iterable],
    range,
  );
  const iterator = builder.nextValue;
  builder.nextValue += 1;
  const nextMethod = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterable],
    detail: "GetIterator async",
    id: iterator,
    iteratorAsync: true,
    iteratorNextMethodResult: nextMethod,
    kind: "iterator-get",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> step, abrupt -> return without close",
    [iterator],
    range,
  );
  recordRoot(builder, iterator, range);
  recordRoot(builder, nextMethod, range);

  const stepBlock = createMirBlock(builder);
  const returnStepBlock = createMirBlock(builder);
  const throwStepBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  const received = builder.nextValue;
  builder.nextValue += 1;
  stepBlock.parameters = [received];
  const returnReceived = builder.nextValue;
  builder.nextValue += 1;
  returnStepBlock.parameters = [returnReceived];
  const throwReceived = builder.nextValue;
  builder.nextValue += 1;
  throwStepBlock.parameters = [throwReceived];
  /* Three step kinds reach the same exit, and each reports its own
   * value, so the join takes the delegating expression's result as a
   * block parameter instead of reading one step's slot. */
  const delegated = builder.nextValue;
  builder.nextValue += 1;
  exitBlock.parameters = [delegated];

  const start = lowerSyntheticUndefined(range, builder);
  builder.current.terminator = {
    kind: "jump",
    target: stepBlock.id,
    values: [start],
  };

  /**
   * One delegation step and the suspension that reports its value. The
   * three step kinds differ only in the operation they run and in what
   * a done result means, so each supplies its own exit.
   */
  const lowerDelegationStep = (
    block: MutableMirBlock,
    kind:
      | "iterator-delegate-next"
      | "iterator-delegate-return"
      | "iterator-delegate-throw",
    sentValue: number,
    detail: string,
    exit: (value: number) => void,
  ): void => {
    builder.current = block;
    const stepArguments =
      kind === "iterator-delegate-next"
        ? [iterator, nextMethod, sentValue]
        : [iterator, sentValue];
    const step = lowerAwaitedIteratorStep(
      kind === "iterator-delegate-next"
        ? "delegate-next"
        : kind === "iterator-delegate-return"
          ? "delegate-return"
          : "delegate-throw",
      stepArguments,
      range,
      detail,
      true,
      builder,
    );
    const yieldBlock = createMirBlock(builder);
    const exitStepBlock = createMirBlock(builder);
    builder.current.terminator = {
      kind: "branch",
      test: step.continues,
      whenFalse: exitStepBlock.id,
      whenTrue: yieldBlock.id,
    };
    builder.current = exitStepBlock;
    exit(step.value);
    builder.current = yieldBlock;
    const suspension = appendAsyncGeneratorYield(step.value, range, builder);
    builder.current.terminator = {
      kind: "jump",
      target: stepBlock.id,
      values: [suspension.sent],
    };
    builder.current = suspension.returnResume;
    const returned = lowerAsyncGeneratorAwait(suspension.sent, range, builder);
    builder.current.terminator = {
      kind: "jump",
      target: returnStepBlock.id,
      values: [returned],
    };
    builder.current = suspension.throwResume;
    builder.current.terminator = {
      kind: "jump",
      target: throwStepBlock.id,
      values: [suspension.sent],
    };
  };

  lowerDelegationStep(
    stepBlock,
    "iterator-delegate-next",
    received,
    "IteratorNext, IteratorComplete, and IteratorValue",
    (value) => {
      builder.current.terminator = {
        kind: "jump",
        target: exitBlock.id,
        values: [value],
      };
    },
  );
  lowerDelegationStep(
    returnStepBlock,
    "iterator-delegate-return",
    returnReceived,
    "GetMethod return, IteratorComplete, and IteratorValue",
    (value) => {
      /* The finalizer chain is captured while lowering the delegation,
       * because the builder's finalizer stack only describes this
       * point. */
      if (!enterFinalizer(builder, "return", range, value)) {
        builder.current.terminator = { kind: "return", value };
      }
    },
  );
  lowerDelegationStep(
    throwStepBlock,
    "iterator-delegate-throw",
    throwReceived,
    "GetMethod throw, IteratorComplete, and IteratorValue",
    (value) => {
      builder.current.terminator = {
        kind: "jump",
        target: exitBlock.id,
        values: [value],
      };
    },
  );

  builder.current = exitBlock;
  appendMirMetadata(builder, "join", `yield* bb${stepBlock.id}`, [], range);
  return recordRoot(builder, delegated, range);
}

/**
 * `yield* operand`: get the operand's iterator once, then forward every
 * resumption of the enclosing generator to it.
 *
 * A normal resumption steps `next` with the sent value; the first step
 * sends `undefined`, because the resumption that entered the delegating
 * expression is not the one it forwards. A step that is not done
 * suspends with the inner iterator's own result object, which the
 * delegating generator reports unchanged, so a result that omits `done`
 * or carries extra properties reaches the outer consumer intact. Only
 * the step that reports exhaustion reads `value`, and that value is the
 * delegating expression's own result.
 *
 * A return resumption steps the inner iterator's `return` instead. An
 * inner iterator that has no `return` method, or one whose result is
 * done, ends the delegation, and the body then leaves through the return
 * completion so every enclosing `finally` and iterator close still runs.
 * A result that is not done suspends the same way, so a `return` the
 * inner iterator refuses does not end the outer generator.
 *
 * A throw resumption steps the inner iterator's `throw` instead. A done
 * result ends the delegation and completes the delegating expression
 * normally with that result's value; a result that is not done suspends
 * the same way a `next` step does. The step operation itself closes an
 * inner iterator that has no `throw` method and raises the `TypeError`
 * the specification requires.
 *
 * No branch closes the inner iterator on an abrupt completion: every step
 * of the specified delegation loop propagates its own abrupt completion
 * without an `IteratorClose`, because that completion came from the inner
 * iterator itself.
 */
function lowerYieldDelegation(
  argument: HirExpression,
  range: SourceRange,
  builder: MirBuilder,
): number {
  const iterable = lowerExpression(argument, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "get delegated iterator",
    [iterable],
    range,
  );
  const iterator = builder.nextValue;
  builder.nextValue += 1;
  const nextMethod = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterable],
    detail: "GetIterator sync",
    id: iterator,
    iteratorNextMethodResult: nextMethod,
    kind: "iterator-get",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> step, abrupt -> return without close",
    [iterator],
    range,
  );
  recordRoot(builder, iterator, range);
  recordRoot(builder, nextMethod, range);

  const stepBlock = createMirBlock(builder);
  const stepYieldBlock = createMirBlock(builder);
  const stepExitBlock = createMirBlock(builder);
  const suspendBlock = createMirBlock(builder);
  const resumeBlock = createMirBlock(builder);
  const returnResumeBlock = createMirBlock(builder);
  const returnStepBlock = createMirBlock(builder);
  const returnYieldBlock = createMirBlock(builder);
  const returnExitBlock = createMirBlock(builder);
  const throwResumeBlock = createMirBlock(builder);
  const throwStepBlock = createMirBlock(builder);
  const throwYieldBlock = createMirBlock(builder);
  const throwExitBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  // A `branch` carries no argument list, so each side of a step reaches
  // the shared suspension through a jump that passes the yielded value,
  // and each step that can end the delegation reaches the shared exit
  // through a jump that passes its own step's exhaustion value.
  const received = builder.nextValue;
  builder.nextValue += 1;
  stepBlock.parameters = [received];
  const returnReceived = builder.nextValue;
  builder.nextValue += 1;
  returnStepBlock.parameters = [returnReceived];
  const throwReceived = builder.nextValue;
  builder.nextValue += 1;
  throwStepBlock.parameters = [throwReceived];
  const yielded = builder.nextValue;
  builder.nextValue += 1;
  suspendBlock.parameters = [yielded];
  const delegated = builder.nextValue;
  builder.nextValue += 1;
  exitBlock.parameters = [delegated];

  const start = lowerSyntheticUndefined(range, builder);
  builder.current.terminator = {
    kind: "jump",
    target: stepBlock.id,
    values: [start],
  };

  builder.current = stepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "step delegated iterator",
    [iterator, nextMethod, received],
    range,
  );
  const continues = builder.nextValue;
  builder.nextValue += 1;
  /* One slot carries both roles a delegating step reports: the inner
   * result object while the delegation continues, and `IteratorValue`
   * once the inner iterator is done. */
  const stepResult = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator, nextMethod, received],
    detail: "IteratorNext, IteratorComplete, and IteratorValue",
    id: continues,
    iteratorValueResult: stepResult,
    kind: "iterator-delegate-next",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> return without close",
    [continues],
    range,
  );
  recordRoot(builder, stepResult, range);
  builder.current.terminator = {
    kind: "branch",
    test: continues,
    whenFalse: stepExitBlock.id,
    whenTrue: stepYieldBlock.id,
  };

  builder.current = stepYieldBlock;
  builder.current.terminator = {
    kind: "jump",
    target: suspendBlock.id,
    values: [stepResult],
  };

  builder.current = stepExitBlock;
  builder.current.terminator = {
    kind: "jump",
    target: exitBlock.id,
    values: [stepResult],
  };

  builder.current = suspendBlock;
  const sent = builder.nextValue;
  builder.nextValue += 1;
  builder.current.terminator = {
    kind: "generator-yield",
    resume: resumeBlock.id,
    resultObject: true,
    returnResume: returnResumeBlock.id,
    sent,
    throwResume: throwResumeBlock.id,
    value: yielded,
  };

  builder.current = resumeBlock;
  recordRoot(builder, sent, range);
  builder.current.terminator = {
    kind: "jump",
    target: stepBlock.id,
    values: [sent],
  };

  builder.current = returnResumeBlock;
  builder.current.terminator = {
    kind: "jump",
    target: returnStepBlock.id,
    values: [sent],
  };

  builder.current = throwResumeBlock;
  builder.current.terminator = {
    kind: "jump",
    target: throwStepBlock.id,
    values: [sent],
  };

  builder.current = throwStepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "throw delegated iterator",
    [iterator, throwReceived],
    range,
  );
  const throwContinues = builder.nextValue;
  builder.nextValue += 1;
  const throwStepResult = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator, throwReceived],
    detail: "GetMethod throw, IteratorComplete, and IteratorValue",
    id: throwContinues,
    iteratorValueResult: throwStepResult,
    kind: "iterator-delegate-throw",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> throw",
    [throwContinues],
    range,
  );
  recordRoot(builder, throwStepResult, range);
  builder.current.terminator = {
    kind: "branch",
    test: throwContinues,
    whenFalse: throwExitBlock.id,
    whenTrue: throwYieldBlock.id,
  };

  builder.current = throwYieldBlock;
  builder.current.terminator = {
    kind: "jump",
    target: suspendBlock.id,
    values: [throwStepResult],
  };

  builder.current = throwExitBlock;
  builder.current.terminator = {
    kind: "jump",
    target: exitBlock.id,
    values: [throwStepResult],
  };

  builder.current = returnStepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "close delegated iterator",
    [iterator, returnReceived],
    range,
  );
  const returnContinues = builder.nextValue;
  builder.nextValue += 1;
  const returnStepResult = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator, returnReceived],
    detail: "GetMethod return, IteratorComplete, and IteratorValue",
    id: returnContinues,
    iteratorValueResult: returnStepResult,
    kind: "iterator-delegate-return",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> return without close",
    [returnContinues],
    range,
  );
  recordRoot(builder, returnStepResult, range);
  builder.current.terminator = {
    kind: "branch",
    test: returnContinues,
    whenFalse: returnExitBlock.id,
    whenTrue: returnYieldBlock.id,
  };

  builder.current = returnYieldBlock;
  builder.current.terminator = {
    kind: "jump",
    target: suspendBlock.id,
    values: [returnStepResult],
  };

  /* The finalizer chain is captured while lowering the delegation,
   * because the builder's finalizer stack only describes this point. */
  builder.current = returnExitBlock;
  if (!enterFinalizer(builder, "return", range, returnStepResult)) {
    builder.current.terminator = { kind: "return", value: returnStepResult };
  }

  builder.current = exitBlock;
  appendMirMetadata(builder, "join", `yield* bb${stepBlock.id}`, [], range);
  return recordRoot(builder, delegated, range);
}

/**
 * Records the object a class element resolves `super.x` against. A
 * `static` element and the constructor take the constructor itself and
 * the class prototype object respectively, matching the two chains
 * `class-heritage` links, so an instance reference reads through the
 * parent's `prototype` and a static one through the parent constructor.
 * Every element carries the object whether or not the class is derived,
 * because the binding describes the function rather than the reference.
 */
function lowerHomeObjectBind(
  functionValue: number,
  home: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [functionValue, home],
    detail: "home object",
    id,
    kind: "home-object-bind",
    range,
  });
}

/**
 * The dynamic `this` of the running strict function, taken from its
 * receiver without substitution.
 */
function lowerReceiver(range: SourceRange, builder: MirBuilder): number {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "this",
    id,
    kind: "receiver",
    range,
  });
  return recordRoot(builder, id, range);
}

/**
 * The `this` of Script top level or of a running non-strict function,
 * which resolves a nullish receiver to the realm's global this value.
 * The runtime creates that one object on first use, so the read is an
 * allocating operation with an abrupt result.
 */
function lowerGlobalThis(range: SourceRange, builder: MirBuilder): number {
  appendMirMetadata(builder, "safepoint", "global this allocation", [], range);
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "global this",
    id,
    kind: "global-this",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * Module top-level `this`. A Module Environment Record's this binding is
 * `undefined`, so the value is a constant rather than a receiver read.
 */
function lowerModuleThis(range: SourceRange, builder: MirBuilder): number {
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    constant: { kind: "undefined" },
    detail: "module this",
    id,
    kind: "constant",
    range,
  });
  return recordRoot(builder, id, range);
}

/**
 * Runs the running constructor's instance field initializers against
 * one instance, which is ECMA-262's InitializeInstanceElements. The
 * constructor is the running function itself, so the operation names
 * only the instance: a base constructor reaches its own field list, and
 * a derived one reaches its own rather than the parent's, which the
 * parent's own constructor already ran.
 */
function lowerInstanceElementsInit(
  instance: number,
  range: SourceRange,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "instance field initialization",
    [instance],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [instance],
    detail: "initialize instance fields",
    id,
    kind: "instance-elements-init",
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

/**
 * Reads the private name value one class evaluation created, which is
 * the identity every element and reference in that body shares. The
 * binding is an ordinary class-scope cell, so a closure that outlives
 * the definition keeps the identity it captured and a second evaluation
 * of the same class produces a name no earlier instance carries.
 */
function lowerPrivateName(
  privateName: HirPrivateName,
  range: SourceRange,
  builder: MirBuilder,
): number {
  return lowerBindingRead(
    privateName.bindingId,
    privateName.name,
    range,
    builder,
  );
}

/**
 * PrivateGet: the value the object carries under one private name. A
 * method element yields its function, an accessor element runs its
 * getter against the object, and an object whose class never installed
 * the element reports a `TypeError` rather than `undefined`, because a
 * private name is not a property key that can be absent.
 */
function lowerPrivateRead(
  object: number,
  privateNameValue: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "private element lookup",
    [object, privateNameValue],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object, privateNameValue],
    detail: "private-get",
    id,
    kind: "private-get",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * PrivateBrandCheck: reports whether one object carries the private
 * element named by the enclosing class. An unbranded object produces
 * false, while a non-object operand throws a `TypeError`.
 */
function lowerPrivateBrandCheck(
  object: number,
  privateNameValue: number,
  range: SourceRange,
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "private brand check",
    [object, privateNameValue],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object, privateNameValue],
    detail: "private-in",
    id,
    kind: "private-in",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * PrivateSet: replaces the value the object carries under one private
 * name. Only a field element is writable, so a method element and a
 * getter-only accessor both report a `TypeError`, as does an object
 * whose class never installed the element.
 */
function lowerPrivateWrite(
  object: number,
  privateNameValue: number,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
  detail = "private-set",
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "private element assignment",
    [object, privateNameValue, value],
    range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object, privateNameValue, value],
    detail,
    id,
    kind: "private-set",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [id],
    range,
  );
  return recordRoot(builder, id, range);
}

/**
 * The value naming the anonymous definition a class field initializer
 * returns, which is ECMA-262's [[ClassFieldInitializerName]]. It is the
 * field key the class body already evaluated, read from the cell the
 * initializer's closure captured; every other body returns no name.
 */
function lowerFieldInitializerName(
  expression: HirExpression,
  builder: MirBuilder,
): number | undefined {
  if (builder.fieldKeyBindingId == null || !anonymousDefinition(expression)) {
    return undefined;
  }
  return lowerBindingRead(
    builder.fieldKeyBindingId,
    "field key",
    expression.range,
    builder,
  );
}

/**
 * The evaluated halves of one field element: the key and the closure
 * that produces the value. ClassDefinitionEvaluation evaluates both in
 * class-body order but defines a `static` field only once the whole
 * body is in place, so a static field carries its halves as MIR values
 * from the element loop to the definition that follows it.
 */
interface ClassFieldDefinition {
  readonly initializer: number;
  readonly key: number;
  readonly kind: "field";
  readonly privateElement: boolean;
  readonly range: SourceRange;
}

/**
 * The evaluated closure of one `static { ... }` block, carried from the
 * element loop to the run that follows it for the same reason a static
 * field carries its halves.
 */
interface ClassStaticBlockDefinition {
  readonly body: number;
  readonly kind: "static-block";
  readonly range: SourceRange;
}

/**
 * One deferred static element. ECMA-262 collects static fields and
 * static blocks into a single source-ordered list and runs it once the
 * class is otherwise complete, so the two share one list rather than
 * running in separate passes.
 */
type ClassStaticElement = ClassFieldDefinition | ClassStaticBlockDefinition;

/**
 * Lowers the definition half of one field element: the key evaluated
 * here, in class-body order, and the closure that produces the value.
 * The closure carries the object the field is defined on as its home
 * object, exactly like a method of the same placement, so `super.x`
 * inside an initializer starts at the parent's `prototype` for an
 * instance field and at the parent constructor for a `static` one.
 *
 * A computed key that names an anonymous initializer is also stored in
 * a fresh cell the closure captures, because NamedEvaluation applies
 * where the initializer runs while the key exists only here.
 *
 * A private field evaluates no key at all: its name is the value the
 * class evaluation created, read from its class-scope binding, so what
 * it produces is a private element rather than a property.
 */
function lowerClassFieldDefinition(
  element: HirClassField,
  home: number,
  builder: MirBuilder,
): ClassFieldDefinition {
  const privateElement = element.key.kind === "private-name";
  let key: number;
  if (element.key.kind === "private-name") {
    key = lowerPrivateName(element.key.privateName, element.range, builder);
  } else {
    // A computed element key is class-body code, so it is strict even
    // when the enclosing function or script is not.
    const enclosingStrictCode = builder.strictCode;
    builder.strictCode = true;
    key = lowerPropertyKey(element.key, builder);
    builder.strictCode = enclosingStrictCode;
  }
  if (element.keyNameBindingId != null) {
    resetBinding(element.keyNameBindingId, "field key", element.range, builder);
    const stored = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [key],
      bindingId: element.keyNameBindingId,
      detail: `%b${element.keyNameBindingId} field key`,
      id: stored,
      kind: "initialize",
      range: element.range,
    });
    recordRoot(builder, stored, element.range);
  }
  const initializer =
    element.initializer == null
      ? lowerSyntheticUndefined(element.range, builder)
      : lowerExpression(element.initializer, builder);
  if (element.initializer != null) {
    lowerHomeObjectBind(initializer, home, element.range, builder);
  }
  return {
    initializer,
    key,
    kind: "field",
    privateElement,
    range: element.range,
  };
}

/**
 * Records one instance field definition on the constructor rather than
 * defining a property now, because the initializer runs once per
 * instance while the key was evaluated once for the whole class.
 */
function lowerInstanceFieldRecord(
  field: ClassFieldDefinition,
  constructorValue: number,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    field.privateElement
      ? "private field record growth"
      : "instance field record growth",
    [constructorValue, field.key, field.initializer],
    field.range,
  );
  const recorded = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [constructorValue, field.key, field.initializer],
    detail: field.privateElement
      ? "record private instance field"
      : "record instance field",
    id: recorded,
    kind: field.privateElement
      ? "class-private-field-define"
      : "class-field-define",
    range: field.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [recorded],
    field.range,
  );
  recordRoot(builder, recorded, field.range);
}

/**
 * Runs one `static` field's initializer against the constructor and
 * defines the result on it, which is DefineField with the constructor
 * as the receiver. A public field becomes an own writable, enumerable,
 * configurable data property through CreateDataProperty, so it replaces
 * a configurable own property such as `name` rather than assigning
 * through it, and a private one becomes a private element the
 * constructor carries.
 */
function lowerStaticFieldDefine(
  field: ClassFieldDefinition,
  constructorValue: number,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    field.privateElement
      ? "static private field initialization"
      : "static field initialization",
    [constructorValue, field.key, field.initializer],
    field.range,
  );
  const defined = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [constructorValue, field.key, field.initializer],
    detail: field.privateElement
      ? "define static private field"
      : "define static field",
    id: defined,
    kind: field.privateElement
      ? "class-static-private-field-define"
      : "class-static-field-define",
    range: field.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [defined],
    field.range,
  );
  recordRoot(builder, defined, field.range);
}

/**
 * Runs one `static { ... }` block: an ordinary call of the block's
 * closure with the constructor as its receiver, whose completion value
 * is discarded. The block needs no runtime entry point of its own,
 * because ECMA-262 defines it as exactly that call.
 */
function lowerStaticBlockRun(
  block: ClassStaticBlockDefinition,
  constructorValue: number,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "static initialization block",
    [block.body, constructorValue],
    block.range,
  );
  const called = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [block.body, constructorValue],
    detail: "static initialization block",
    id: called,
    kind: "call",
    range: block.range,
    target: { kind: "dynamic" },
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [called],
    block.range,
  );
  recordRoot(builder, called, block.range);
}

/**
 * Lowers one private method or accessor definition. It defines no
 * property. An instance element is recorded on the constructor so each
 * instance receives it before its field initializers run. A `static`
 * element is installed directly on the constructor while the class body
 * is evaluated. A getter and its setter share one private name, so the
 * runtime merges the two halves into the accessor element that name
 * reaches.
 *
 * The closure carries the placement's ordinary home object, the class
 * prototype for an instance element and the constructor for a static
 * one, so `super.x` resolves exactly as it does in a public method.
 */
function lowerClassPrivateMethod(
  element: HirClassMethod,
  key: HirPrivateNameKey,
  constructorValue: number,
  prototype: number,
  builder: MirBuilder,
): void {
  const staticPlacement = element.staticPlacement === true;
  const home = staticPlacement ? constructorValue : prototype;
  const privateNameValue = lowerPrivateName(
    key.privateName,
    element.range,
    builder,
  );
  const value = lowerExpression(
    element.value,
    builder,
    undefined,
    element.accessorKind,
  );
  lowerHomeObjectBind(value, home, element.range, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    element.accessorKind == null
      ? staticPlacement
        ? "static private method definition"
        : "private method record growth"
      : staticPlacement
        ? "static private accessor definition"
        : "private accessor record growth",
    [constructorValue, privateNameValue, value],
    element.range,
  );
  const recorded = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    ...includePropertiesWhen(() => {
      if (element.accessorKind == null) return undefined;
      return {
        accessorKind: element.accessorKind,
      };
    }),
    arguments: [constructorValue, privateNameValue, value],
    detail:
      element.accessorKind == null
        ? staticPlacement
          ? "define static private method"
          : "record private method"
        : staticPlacement
          ? `define static private ${element.accessorKind} accessor`
          : `record private ${element.accessorKind} accessor`,
    id: recorded,
    kind: staticPlacement
      ? "class-static-private-method-define"
      : "class-private-method-define",
    range: element.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [recorded],
    element.range,
  );
  recordRoot(builder, recorded, element.range);
}

/**
 * Lowers one class expression in ClassDefinitionEvaluation order: the
 * class-scope cell is created first so every closure the body allocates
 * shares it, then the constructor closure and its prototype object,
 * then each method as a non-enumerable data property and each getter or
 * setter as a non-enumerable accessor property, and the class-scope
 * binding is initialized last. Initializing it last is observable: a
 * computed key that reads the class name reaches the binding in its
 * temporal dead zone.
 *
 * Static and prototype elements share one source-ordered loop, because
 * ClassDefinitionEvaluation defines every element in source order and
 * only chooses a different target for each: a `static` element is
 * defined on the constructor itself, every other element on the
 * prototype object.
 *
 * A derived class evaluates its heritage operand first, inside the
 * class-scope environment, and links both prototype chains before any
 * element is defined: the constructor inherits from the parent
 * constructor, and the prototype object from the parent's `prototype`.
 *
 * A `static` field takes part in that one loop only with its key and
 * its initializer closure, and a `static { ... }` block only with its
 * closure. Both run after the loop and after the class-scope binding is
 * initialized, interleaved in source order, because
 * ClassDefinitionEvaluation collects every static element into one list
 * it defers until the class is otherwise complete.
 */
function lowerClassExpression(
  expression: HirExpression & { readonly kind: "class" },
  builder: MirBuilder,
  inferredFunctionName?: number,
): number {
  const nameBinding = expression.nameBinding;
  if (nameBinding != null) {
    resetBinding(
      nameBinding.bindingId,
      nameBinding.name,
      expression.range,
      builder,
    );
  }
  const heritage =
    expression.heritage == null
      ? undefined
      : lowerExpression(expression.heritage, builder);
  // Every private name the body declares exists before the constructor
  // closure does, so the closure captures the cells already holding the
  // identities this evaluation created. A second evaluation of the same
  // class resets the cells and creates fresh names, which is why an
  // instance of one evaluation fails the brand check of the other.
  for (const privateName of expression.privateNames ?? []) {
    resetBinding(
      privateName.bindingId,
      privateName.name,
      expression.range,
      builder,
    );
    const created = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: `private name ${privateName.name}`,
      id: created,
      kind: "private-name-create",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [created],
      expression.range,
    );
    recordRoot(builder, created, expression.range);
    const initialized = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [created],
      bindingId: privateName.bindingId,
      detail: `%b${privateName.bindingId} ${privateName.name}`,
      id: initialized,
      kind: "initialize",
      range: expression.range,
    });
    recordRoot(builder, initialized, expression.range);
  }
  const constructorValue = lowerExpression(
    expression.constructorFunction,
    builder,
    inferredFunctionName,
  );
  if (heritage != null) {
    const linked = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [constructorValue, heritage],
      detail: "class heritage",
      id: linked,
      kind: "class-heritage",
      range: expression.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [linked],
      expression.range,
    );
    recordRoot(builder, linked, expression.range);
  }
  appendMirMetadata(
    builder,
    "safepoint",
    "class prototype lookup",
    [constructorValue],
    expression.range,
  );
  const prototype = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [constructorValue],
    detail: "class prototype object",
    id: prototype,
    kind: "class-prototype",
    range: expression.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [prototype],
    expression.range,
  );
  recordRoot(builder, prototype, expression.range);
  lowerHomeObjectBind(constructorValue, prototype, expression.range, builder);
  const staticElements: ClassStaticElement[] = [];
  for (const element of expression.elements) {
    if (element.kind === "field") {
      const staticPlacement = element.staticPlacement === true;
      const field = lowerClassFieldDefinition(
        element,
        staticPlacement ? constructorValue : prototype,
        builder,
      );
      if (staticPlacement) staticElements.push(field);
      else lowerInstanceFieldRecord(field, constructorValue, builder);
      continue;
    }
    if (element.kind === "static-block") {
      // The closure exists where the block appears and carries the
      // constructor as its home object, exactly like a static field's
      // initializer; only the call itself waits for the class.
      const body = lowerExpression(element.body, builder);
      lowerHomeObjectBind(body, constructorValue, element.range, builder);
      staticElements.push({
        body,
        kind: "static-block",
        range: element.range,
      });
      continue;
    }
    if (element.key.kind === "private-name") {
      lowerClassPrivateMethod(
        element,
        element.key,
        constructorValue,
        prototype,
        builder,
      );
      continue;
    }
    const staticPlacement = element.staticPlacement === true;
    const target = staticPlacement ? constructorValue : prototype;
    const placement = staticPlacement ? "static" : "prototype";
    // A computed element key is class-body code, so it is strict even
    // when the enclosing function or script is not.
    const enclosingStrictCode = builder.strictCode;
    builder.strictCode = true;
    const key = lowerPropertyKey(element.key, builder);
    builder.strictCode = enclosingStrictCode;
    const value = lowerExpression(
      element.value,
      builder,
      anonymousDefinition(element.value) ? key : undefined,
      element.accessorKind,
    );
    lowerHomeObjectBind(value, target, element.range, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      element.accessorKind == null
        ? `${placement} method storage growth`
        : `${placement} accessor storage growth`,
      [target, key, value],
      element.range,
    );
    const defined = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push(
      element.accessorKind == null
        ? {
            arguments: [target, key, value],
            detail: `define non-enumerable ${placement} method`,
            id: defined,
            kind: "property-define-method",
            range: element.range,
          }
        : {
            accessorKind: element.accessorKind,
            arguments: [target, key, value],
            detail:
              `define non-enumerable ${placement} ` +
              `${element.accessorKind} accessor property`,
            enumerable: false,
            id: defined,
            kind: "property-define-accessor",
            range: element.range,
          },
    );
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [defined],
      element.range,
    );
    recordRoot(builder, defined, element.range);
  }
  if (nameBinding != null) {
    const initialized = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [constructorValue],
      bindingId: nameBinding.bindingId,
      detail: `%b${nameBinding.bindingId} ${nameBinding.name}`,
      id: initialized,
      kind: "initialize",
      range: expression.range,
    });
    recordRoot(builder, initialized, expression.range);
  }
  // The static field initializers and static blocks run last, in source
  // order among each other, after every element is in place and after
  // the class-scope binding is initialized. One therefore reaches a
  // method declared later in the body and reads the class through its
  // own name rather than in a temporal dead zone.
  for (const staticElement of staticElements) {
    if (staticElement.kind === "static-block") {
      lowerStaticBlockRun(staticElement, constructorValue, builder);
      continue;
    }
    lowerStaticFieldDefine(staticElement, constructorValue, builder);
  }
  return constructorValue;
}

/**
 * Branches to `shortBlock` when `value` is null or undefined, otherwise
 * leaves the builder in a new continuation block.
 */
function lowerOptionalNullishGuard(
  value: number,
  shortBlock: MutableMirBlock,
  range: SourceRange,
  builder: MirBuilder,
): void {
  const undefinedCheckBlock = createMirBlock(builder);
  const continueBlock = createMirBlock(builder);
  const strictConstantTest = (constant: MirConstant): number => {
    const constantId = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      constant,
      detail: constant.kind,
      id: constantId,
      kind: "constant",
      range,
    });
    const test = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value, constantId],
      detail: "===",
      id: test,
      kind: "binary",
      operator: "===",
      range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [test],
      range,
    );
    return test;
  };
  const isNull = strictConstantTest({ kind: "null" });
  appendMirMetadata(
    builder,
    "branch",
    `?. null -> bb${shortBlock.id}, other -> bb${undefinedCheckBlock.id}`,
    [isNull],
    range,
  );
  builder.current.terminator = {
    kind: "branch",
    test: isNull,
    whenFalse: undefinedCheckBlock.id,
    whenTrue: shortBlock.id,
  };
  builder.current = undefinedCheckBlock;
  const isUndefined = strictConstantTest({ kind: "undefined" });
  appendMirMetadata(
    builder,
    "branch",
    `?. undefined -> bb${shortBlock.id}, other -> bb${continueBlock.id}`,
    [isUndefined],
    range,
  );
  builder.current.terminator = {
    kind: "branch",
    test: isUndefined,
    whenFalse: continueBlock.id,
    whenTrue: shortBlock.id,
  };
  builder.current = continueBlock;
}

/** Lowers one optional chain without re-evaluating its base or references. */
function lowerOptionalChain(
  expression: Extract<HirExpression, { readonly kind: "optional-chain" }>,
  builder: MirBuilder,
): number {
  const shortBlock = createMirBlock(builder);
  let pendingSuper = superOperand(expression.base);
  let value =
    pendingSuper == null
      ? lowerExpression(expression.base, builder)
      : lowerSuperReceiver(pendingSuper, builder);
  let receiver: number | undefined;
  let shortConsumed = false;
  for (const [index, link] of expression.links.entries()) {
    if (pendingSuper != null && link.kind !== "member") {
      throw new Error(
        "An optional-chain super base must precede a property reference.",
      );
    }
    if (link.optional) {
      if (pendingSuper != null) {
        throw new Error("An optional-chain super property cannot be optional.");
      }
      lowerOptionalNullishGuard(value, shortBlock, link.range, builder);
    }
    if (link.kind === "member") {
      if (pendingSuper != null) {
        receiver = value;
        if (
          link.key.kind === "string" &&
          builder.specialization === "enabled"
        ) {
          value = lowerSpecializedPropertyGet(
            lowerSuperBase(pendingSuper, builder),
            link.key,
            link.range,
            builder,
            receiver,
          );
        } else {
          const keyInput = lowerExpression(link.key, builder);
          const lookup = lowerSuperBase(pendingSuper, builder);
          const key = convertPropertyKey(keyInput, link.key.range, builder);
          value = lowerPropertyRead(lookup, key, link.range, builder, receiver);
        }
        pendingSuper = undefined;
        continue;
      }
      receiver = value;
      if (expression.delete === true && index === expression.links.length - 1) {
        const keyInput = lowerExpression(link.key, builder);
        const object = lowerDeleteObjectCoercible(
          receiver,
          link.range,
          builder,
        );
        const key = convertPropertyKey(keyInput, link.key.range, builder);
        value = lowerPropertyDelete(object, key, link.range, builder);
        continue;
      }
      if (link.key.kind === "string" && builder.specialization === "enabled") {
        value = lowerSpecializedPropertyGet(
          receiver,
          link.key,
          link.range,
          builder,
        );
      } else {
        const keyInput = lowerExpression(link.key, builder);
        const key = convertPropertyKey(keyInput, link.key.range, builder);
        value = lowerPropertyRead(receiver, key, link.range, builder);
      }
      continue;
    }
    if (link.kind === "private-member") {
      receiver = value;
      const privateNameValue = lowerPrivateName(
        link.privateName,
        link.range,
        builder,
      );
      value = lowerPrivateRead(receiver, privateNameValue, link.range, builder);
      continue;
    }
    let callReceiver: number;
    if (link.chainBoundary === true) {
      if (index !== expression.links.length - 1) {
        throw new Error("An optional-chain boundary call must be last.");
      }
      const boundaryBlock = createMirBlock(builder);
      const boundaryCallee = builder.nextValue;
      builder.nextValue += 1;
      const boundaryReceiver = builder.nextValue;
      builder.nextValue += 1;
      boundaryBlock.parameters = [boundaryCallee, boundaryReceiver];
      const liveReceiver =
        receiver ?? lowerSyntheticUndefined(link.range, builder);
      builder.current.terminator = {
        kind: "jump",
        target: boundaryBlock.id,
        values: [value, liveReceiver],
      };
      builder.current = shortBlock;
      const undefinedValue = lowerSyntheticUndefined(link.range, builder);
      shortBlock.terminator = {
        kind: "jump",
        target: boundaryBlock.id,
        values: [undefinedValue, undefinedValue],
      };
      builder.current = boundaryBlock;
      value = recordRoot(builder, boundaryCallee, link.range);
      callReceiver = recordRoot(builder, boundaryReceiver, link.range);
      shortConsumed = true;
    } else {
      callReceiver = receiver ?? lowerSyntheticUndefined(link.range, builder);
    }
    const lowered = lowerCallArguments(link.arguments, link.range, builder);
    const callArguments = [value, callReceiver, ...lowered.ids];
    const safepointArguments =
      lowered.list == null ? callArguments : [...callArguments, lowered.list];
    appendMirMetadata(
      builder,
      "safepoint",
      "optional chain call",
      safepointArguments,
      link.range,
    );
    const called = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      ...includePropertiesWhen(() => {
        if (lowered.list == null) return undefined;
        return {
          argumentListId: lowered.list,
        };
      }),
      arguments: callArguments,
      detail: "optional chain function value",
      id: called,
      kind: "call",
      range: link.range,
      target: { kind: "dynamic" },
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> return",
      [called],
      link.range,
    );
    value = recordRoot(builder, called, link.range);
    receiver = undefined;
  }
  if (
    expression.delete === true &&
    expression.links.at(-1)?.kind !== "member"
  ) {
    value = lowerExpression(
      { kind: "boolean", range: expression.range, value: true },
      builder,
    );
  }
  if (shortConsumed) return value;
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [value],
  };
  builder.current = shortBlock;
  const shortValue =
    expression.delete === true
      ? lowerExpression(
          { kind: "boolean", range: expression.range, value: true },
          builder,
        )
      : lowerSyntheticUndefined(expression.range, builder);
  shortBlock.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [shortValue],
  };
  builder.current = joinBlock;
  appendMirMetadata(
    builder,
    "join",
    `?. bb${shortBlock.id}`,
    [],
    expression.range,
  );
  return recordRoot(builder, result, expression.range);
}

function lowerExpression(
  expression: HirExpression,
  builder: MirBuilder,
  inferredFunctionName?: number,
  accessorNamePrefix?: "get" | "set",
): number {
  if (expression.kind === "delete-value") {
    lowerExpression(expression.argument, builder);
    return lowerExpression(
      { kind: "boolean", range: expression.range, value: true },
      builder,
    );
  }
  if (expression.kind === "with-delete") {
    return lowerWithDelete(expression, builder);
  }
  if (expression.kind === "with-get") {
    return lowerWithRead(expression, builder, false).value;
  }
  if (expression.kind === "with-set") {
    const selected = lowerWithReference(expression, builder);
    const value = lowerExpression(expression.value, builder);
    return lowerWithBindingWrite(
      selected,
      expression.fallback,
      value,
      expression.range,
      builder,
    );
  }
  if (expression.kind === "with-update") {
    const selected = lowerWithReference(expression, builder);
    const current = lowerWithBindingRead(
      selected,
      expression.fallback,
      expression.range,
      builder,
    );
    return lowerAssignmentValue(
      current,
      expression.operator,
      expression.value,
      (value) =>
        lowerWithBindingWrite(
          selected,
          expression.fallback,
          value,
          expression.range,
          builder,
        ),
      expression.range,
      builder,
    );
  }
  if (expression.kind === "with-step") {
    const selected = lowerWithReference(expression, builder);
    const current = lowerWithBindingRead(
      selected,
      expression.fallback,
      expression.range,
      builder,
    );
    return lowerUpdateValue(
      current,
      expression.operator,
      expression.prefix,
      (value) =>
        lowerWithBindingWrite(
          selected,
          expression.fallback,
          value,
          expression.range,
          builder,
        ),
      expression.range,
      builder,
    );
  }
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
    return lowerBindingWrite(expression, value, builder);
  }
  if (expression.kind === "binding-update") {
    const current = lowerBindingRead(
      expression.bindingId,
      expression.name,
      expression.range,
      builder,
    );
    return lowerAssignmentValue(
      current,
      expression.operator,
      expression.value,
      (value) => lowerBindingWrite(expression, value, builder),
      expression.range,
      builder,
    );
  }
  if (expression.kind === "binding-step") {
    const current = lowerBindingRead(
      expression.bindingId,
      expression.name,
      expression.range,
      builder,
    );
    return lowerUpdateValue(
      current,
      expression.operator,
      expression.prefix,
      (value) => lowerBindingWrite(expression, value, builder),
      expression.range,
      builder,
    );
  }
  if (expression.kind === "destructuring-set") {
    const value = lowerExpression(expression.value, builder);
    lowerBindingTarget(expression.pattern, value, "write", builder);
    return value;
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
      ...includePropertiesWhen(() => {
        if (accessorNamePrefix == null) return undefined;
        return {
          accessorKind: accessorNamePrefix,
        };
      }),
      arguments: inferredFunctionName == null ? [] : [inferredFunctionName],
      detail:
        `function @f${expression.functionId} ` +
        `name=${JSON.stringify(expression.name)} ` +
        `length=${expression.functionLength}`,
      functionId: expression.functionId,
      functionKind: expression.functionKind,
      functionLength: expression.functionLength,
      functionName: expression.name,
      ...includePropertiesWhen(() => {
        if (expression.sourceText == null) return undefined;
        return {
          functionSource: expression.sourceText,
        };
      }),
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
    return expression.thisMode === "strict"
      ? lowerReceiver(expression.range, builder)
      : expression.thisMode === "module"
        ? lowerModuleThis(expression.range, builder)
        : lowerGlobalThis(expression.range, builder);
  }
  if (expression.kind === "new-target") {
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "new.target",
      id,
      kind: "new-target",
      range: expression.range,
    });
    return recordRoot(builder, id, expression.range);
  }
  if (expression.kind === "super-base") {
    // Every admitted position pairs the operand with the receiver it
    // belongs to, so one that reaches ordinary expression lowering has
    // lost the receiver a getter, setter, or method call needs.
    throw new Error(
      "A super operand reached MIR outside a property reference.",
    );
  }
  if (expression.kind === "array") {
    const hasSpread = expression.elements.some(
      (element) => element?.kind === "spread",
    );
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
      arrayLength: hasSpread ? 0 : expression.elements.length,
      detail: `array length ${hasSpread ? 0 : expression.elements.length}`,
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
    if (hasSpread) {
      for (const element of expression.elements) {
        if (element == null) {
          lowerArrayHoleAppend(id, expression.range, builder);
        } else if (element.kind === "spread") {
          lowerArraySpread(element, id, builder);
        } else {
          const value = lowerExpression(element, builder);
          lowerArrayAppend(id, value, element.range, builder);
        }
      }
      return id;
    }
    for (let index = 0; index < expression.elements.length; index += 1) {
      const element = expression.elements[index];
      if (element == null) continue;
      if (element.kind === "spread") {
        throw new Error("Static array lowering received a spread element.");
      }
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
        kind: "property-define-data",
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
  if (expression.kind === "regexp") {
    appendMirMetadata(
      builder,
      "safepoint",
      "regular expression literal allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail:
        `regexp literal /${expression.matcher.source}/` +
        `${expression.matcher.flags.text} with ` +
        `${expression.matcher.instructions.length} instructions`,
      id,
      kind: "regexp-literal",
      range: expression.range,
      regexpProgram: expression.matcher,
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
  if (expression.kind === "template-object") {
    appendMirMetadata(
      builder,
      "safepoint",
      "template object allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: `template object with ${expression.cooked.length} strings`,
      id,
      kind: "template-object",
      range: expression.range,
      templateCooked: expression.cooked,
      templateRaw: expression.raw,
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
  if (expression.kind === "await") {
    const argument = lowerExpression(expression.argument, builder);
    if (builder.asyncGenerator || builder.asyncFunction) {
      return lowerAsyncGeneratorAwait(argument, expression.range, builder);
    }
    throw new Error(
      "Await reached a MIR body without a traced asynchronous owner.",
    );
  }
  if (expression.kind === "yield") {
    if (!builder.generator) {
      throw new Error(
        "HIR yield reached a function that is not a generator body.",
      );
    }
    if (expression.delegate === true) {
      if (expression.argument == null) {
        throw new Error("HIR yield* reached MIR without an operand.");
      }
      return builder.asyncGenerator
        ? lowerAsyncYieldDelegation(
            expression.argument,
            expression.range,
            builder,
          )
        : lowerYieldDelegation(expression.argument, expression.range, builder);
    }
    const value =
      expression.argument == null
        ? lowerSyntheticUndefined(expression.range, builder)
        : lowerExpression(expression.argument, builder);
    if (builder.asyncGenerator) {
      return lowerAsyncGeneratorYield(value, expression.range, builder);
    }
    appendMirMetadata(
      builder,
      "safepoint",
      "generator suspension result allocation",
      [value],
      expression.range,
    );
    const sent = builder.nextValue;
    builder.nextValue += 1;
    const resume = createMirBlock(builder);
    const returnResume = createMirBlock(builder);
    const throwResume = createMirBlock(builder);
    builder.current.terminator = {
      kind: "generator-yield",
      resume: resume.id,
      returnResume: returnResume.id,
      sent,
      throwResume: throwResume.id,
      value,
    };
    /* A return resumption leaves the body from the suspension point, so it
     * runs the same finalizer and iterator-close chain a `return` statement
     * written there would. The chain is captured while lowering the yield,
     * because the builder's finalizer stack only describes this point. */
    builder.current = returnResume;
    if (!enterFinalizer(builder, "return", expression.range, sent)) {
      builder.current.terminator = { kind: "return", value: sent };
    }
    builder.current = throwResume;
    lowerThrowValue(sent, expression.range, builder);
    builder.current = resume;
    return recordRoot(builder, sent, expression.range);
  }
  if (expression.kind === "error-intrinsic") {
    appendMirMetadata(
      builder,
      "safepoint",
      "error intrinsic allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: `intrinsic ${expression.errorName}`,
      errorName: expression.errorName,
      id,
      kind: "error-intrinsic",
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
  if (expression.kind === "symbol-intrinsic") {
    appendMirMetadata(
      builder,
      "safepoint",
      "symbol intrinsic allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "intrinsic Symbol",
      id,
      kind: "symbol-intrinsic",
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
  if (expression.kind === "function-intrinsic") {
    appendMirMetadata(
      builder,
      "safepoint",
      "function intrinsic allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "intrinsic Function",
      id,
      kind: "function-intrinsic",
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
  if (expression.kind === "iterator-intrinsic") {
    appendMirMetadata(
      builder,
      "safepoint",
      "iterator intrinsic allocation",
      [],
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "intrinsic Iterator",
      id,
      kind: "iterator-intrinsic",
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
  if (expression.kind === "binding") {
    return lowerBindingRead(
      expression.bindingId,
      expression.name,
      expression.range,
      builder,
    );
  }
  if (
    expression.kind === "undefined" ||
    expression.kind === "null" ||
    expression.kind === "boolean" ||
    expression.kind === "bigint" ||
    expression.kind === "number" ||
    expression.kind === "string"
  ) {
    if (expression.kind === "string" || expression.kind === "bigint") {
      appendMirMetadata(
        builder,
        "safepoint",
        expression.kind === "string"
          ? "string allocation"
          : "BigInt literal allocation",
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
    } else if (expression.kind === "bigint") {
      constant = {
        digits: expression.digits,
        kind: "bigint",
        radix: expression.radix,
      };
    } else {
      constant = { kind: "string", value: expression.value };
    }
    const detail =
      constant.kind === "undefined" || constant.kind === "null"
        ? constant.kind
        : constant.kind === "number"
          ? numberText(constant.value)
          : constant.kind === "bigint"
            ? `${constant.radix}:${constant.digits}`
            : JSON.stringify(constant.value);
    builder.current.operations.push({
      arguments: [],
      constant,
      detail,
      id,
      kind: "constant",
      range: expression.range,
    });
    if (expression.kind === "string" || expression.kind === "bigint") {
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
    if (expression.operator === "to-string") {
      appendMirMetadata(
        builder,
        "safepoint",
        "string conversion allocation",
        [argument],
        expression.range,
      );
    }
    if (
      expression.operator === "+" ||
      expression.operator === "-" ||
      expression.operator === "~"
    ) {
      // Numeric and bitwise unary operators coerce their operand through
      // generic ToPrimitive, which allocates and can call user
      // functions, so they declare a collection safepoint.
      appendMirMetadata(
        builder,
        "safepoint",
        "operand coercion",
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
    return lowerLogicalValue(
      left,
      expression.operator,
      () => lowerExpression(expression.right, builder),
      expression.range,
      builder,
    );
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
    return lowerBinaryValues(
      left,
      expression.operator,
      right,
      expression.range,
      builder,
    );
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
      if (property.kind === "spread") {
        const source = lowerExpression(property.argument, builder);
        appendMirMetadata(
          builder,
          "safepoint",
          "object spread copy",
          [id, source],
          property.range,
        );
        const copied = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [id, source],
          detail: "CopyDataProperties for object literal spread",
          id: copied,
          kind: "object-spread",
          range: property.range,
        });
        appendMirMetadata(
          builder,
          "check-status",
          "normal -> continue, abrupt -> return",
          [copied],
          property.range,
        );
        recordRoot(builder, copied, property.range);
        continue;
      }
      if (property.prototypeSetter === true) {
        const value = lowerExpression(property.value, builder);
        appendMirMetadata(
          builder,
          "safepoint",
          "object literal prototype setter",
          [id, value],
          expression.range,
        );
        const result = builder.nextValue;
        builder.nextValue += 1;
        builder.current.operations.push({
          arguments: [id, value],
          detail: "set object literal prototype",
          id: result,
          kind: "object-set-prototype",
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
        continue;
      }
      const key = lowerPropertyKey(property.key, builder);
      const value = lowerExpression(
        property.value,
        builder,
        anonymousDefinition(property.value) ? key : undefined,
        property.accessorKind,
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
      builder.current.operations.push(
        property.accessorKind == null
          ? {
              arguments: [id, key, value],
              detail: "create data property",
              id: result,
              kind: "property-define-data",
              range: expression.range,
            }
          : {
              accessorKind: property.accessorKind,
              arguments: [id, key, value],
              detail: `define ${property.accessorKind} accessor property`,
              id: result,
              kind: "property-define-accessor",
              range: expression.range,
            },
      );
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
  if (expression.kind === "optional-chain") {
    return lowerOptionalChain(expression, builder);
  }
  if (expression.kind === "class") {
    return lowerClassExpression(expression, builder, inferredFunctionName);
  }
  if (
    expression.kind === "property-get" ||
    expression.kind === "property-delete"
  ) {
    const operand = superOperand(expression.object);
    const superReceiver =
      operand == null ? undefined : lowerSuperReceiver(operand, builder);
    if (expression.kind === "property-delete" && operand != null) {
      // The reference is evaluated whole before the delete evaluation
      // rejects it: the receiver read above observes the `this`
      // temporal dead zone, the key expression runs for its value and
      // its abrupt completion, and ToPropertyKey is never reached. The
      // home object's prototype is read by an internal method that
      // cannot be observed, so no lookup object is materialized.
      lowerExpression(expression.key, builder);
      return lowerSuperPropertyDelete(expression.range, builder);
    }
    if (
      expression.kind === "property-get" &&
      expression.key.kind === "string" &&
      builder.specialization === "enabled"
    ) {
      // A literal key runs no user code, so reading the home object's
      // prototype before it stays unobservable.
      const object =
        operand == null
          ? lowerExpression(expression.object, builder)
          : lowerSuperBase(operand, builder);
      return lowerSpecializedPropertyGet(
        object,
        expression.key,
        expression.range,
        builder,
        superReceiver,
      );
    }
    const reference = lowerReferenceObject(
      expression.object,
      expression.key,
      operand,
      builder,
    );
    const object =
      expression.kind === "property-delete"
        ? lowerDeleteObjectCoercible(
            reference.object,
            expression.object.range,
            builder,
          )
        : reference.object;
    const key = convertPropertyKey(
      reference.keyInput,
      expression.key.range,
      builder,
    );
    if (expression.kind === "property-get") {
      appendMirMetadata(
        builder,
        "safepoint",
        "generic property lookup",
        [object, key],
        expression.range,
      );
    } else {
      return lowerPropertyDelete(object, key, expression.range, builder);
    }
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments:
        superReceiver == null ? [object, key] : [object, key, superReceiver],
      detail: expression.kind,
      id,
      kind: expression.kind,
      range: expression.range,
      ...includePropertiesWhen(() => {
        if (superReceiver == null) return undefined;
        return {
          superReference: true as const,
        };
      }),
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
    const operand = superOperand(expression.object);
    const superReceiver =
      operand == null ? undefined : lowerSuperReceiver(operand, builder);
    const { keyInput, object } = lowerReferenceObject(
      expression.object,
      expression.key,
      operand,
      builder,
    );
    const initialExists =
      expression.strictGlobalFallback == null
        ? undefined
        : lowerBinaryValues(keyInput, "in", object, expression.range, builder);
    // PutValue converts the key, so an assignment holds the key
    // expression's raw value until the right side has been evaluated.
    const value = lowerExpression(expression.value, builder);
    const key = convertPropertyKey(keyInput, expression.key.range, builder);
    if (initialExists != null && expression.strictGlobalFallback != null) {
      return lowerStrictGlobalPropertyWrite(
        initialExists,
        object,
        key,
        value,
        expression.strictGlobalFallback,
        expression.range,
        builder,
      );
    }
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
      arguments:
        superReceiver == null
          ? [object, key, value]
          : [object, key, value, superReceiver],
      detail: "property-set",
      id,
      kind: "property-set",
      range: expression.range,
      ...strictCodeFlag(builder),
      ...includePropertiesWhen(() => {
        if (superReceiver == null) return undefined;
        return {
          superReference: true as const,
        };
      }),
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
  if (expression.kind === "property-update") {
    const operand = superOperand(expression.object);
    const superReceiver =
      operand == null ? undefined : lowerSuperReceiver(operand, builder);
    const { keyInput, object } = lowerReferenceObject(
      expression.object,
      expression.key,
      operand,
      builder,
    );
    const initialExists =
      expression.strictGlobalFallback == null
        ? undefined
        : lowerBinaryValues(keyInput, "in", object, expression.range, builder);
    const readKey = convertPropertyKey(keyInput, expression.key.range, builder);
    const current = lowerPropertyRead(
      object,
      readKey,
      expression.range,
      builder,
      superReceiver,
    );
    return lowerAssignmentValue(
      current,
      expression.operator,
      expression.value,
      (value) => {
        const writeKey = convertPropertyKey(
          keyInput,
          expression.key.range,
          builder,
        );
        return initialExists != null && expression.strictGlobalFallback != null
          ? lowerStrictGlobalPropertyWrite(
              initialExists,
              object,
              writeKey,
              value,
              expression.strictGlobalFallback,
              expression.range,
              builder,
            )
          : lowerPropertyWrite(
              object,
              writeKey,
              value,
              expression.range,
              builder,
              superReceiver,
            );
      },
      expression.range,
      builder,
    );
  }
  if (expression.kind === "property-step") {
    const operand = superOperand(expression.object);
    const superReceiver =
      operand == null ? undefined : lowerSuperReceiver(operand, builder);
    const { keyInput, object: objectInput } = lowerReferenceObject(
      expression.object,
      expression.key,
      operand,
      builder,
    );
    const initialExists =
      expression.strictGlobalFallback == null
        ? undefined
        : lowerBinaryValues(
            keyInput,
            "in",
            objectInput,
            expression.range,
            builder,
          );
    // A `super` operand is the home object's prototype, which needs no
    // RequireObjectCoercible: a nullish one reports its own TypeError
    // from the read that follows, as the specified GetValue does.
    const object =
      operand == null
        ? lowerObjectCoercible(objectInput, expression.object.range, builder)
        : objectInput;
    const readKey = convertPropertyKey(keyInput, expression.key.range, builder);
    const current = lowerPropertyRead(
      object,
      readKey,
      expression.range,
      builder,
      superReceiver,
    );
    return lowerUpdateValue(
      current,
      expression.operator,
      expression.prefix,
      (value) => {
        const writeKey = convertPropertyKey(
          keyInput,
          expression.key.range,
          builder,
        );
        return initialExists != null && expression.strictGlobalFallback != null
          ? lowerStrictGlobalPropertyWrite(
              initialExists,
              object,
              writeKey,
              value,
              expression.strictGlobalFallback,
              expression.range,
              builder,
            )
          : lowerPropertyWrite(
              object,
              writeKey,
              value,
              expression.range,
              builder,
              superReceiver,
            );
      },
      expression.range,
      builder,
    );
  }
  if (expression.kind === "private-get" || expression.kind === "private-in") {
    const object = lowerExpression(expression.object, builder);
    const privateNameValue = lowerPrivateName(
      expression.privateName,
      expression.range,
      builder,
    );
    return expression.kind === "private-get"
      ? lowerPrivateRead(object, privateNameValue, expression.range, builder)
      : lowerPrivateBrandCheck(
          object,
          privateNameValue,
          expression.range,
          builder,
        );
  }
  if (expression.kind === "private-set") {
    const object = lowerExpression(expression.object, builder);
    const privateNameValue = lowerPrivateName(
      expression.privateName,
      expression.range,
      builder,
    );
    const value = lowerExpression(expression.value, builder);
    return lowerPrivateWrite(
      object,
      privateNameValue,
      value,
      expression.range,
      builder,
    );
  }
  if (expression.kind === "private-update") {
    const object = lowerExpression(expression.object, builder);
    // One private name reaches both halves: the name is an identity the
    // class evaluation fixed, so re-reading its cell could observe
    // nothing new.
    const privateNameValue = lowerPrivateName(
      expression.privateName,
      expression.range,
      builder,
    );
    const current = lowerPrivateRead(
      object,
      privateNameValue,
      expression.range,
      builder,
    );
    return lowerAssignmentValue(
      current,
      expression.operator,
      expression.value,
      (value) =>
        lowerPrivateWrite(
          object,
          privateNameValue,
          value,
          expression.range,
          builder,
        ),
      expression.range,
      builder,
    );
  }
  if (expression.kind === "private-step") {
    const object = lowerExpression(expression.object, builder);
    const privateNameValue = lowerPrivateName(
      expression.privateName,
      expression.range,
      builder,
    );
    const current = lowerPrivateRead(
      object,
      privateNameValue,
      expression.range,
      builder,
    );
    return lowerUpdateValue(
      current,
      expression.operator,
      expression.prefix,
      (value) =>
        lowerPrivateWrite(
          object,
          privateNameValue,
          value,
          expression.range,
          builder,
        ),
      expression.range,
      builder,
    );
  }
  if (expression.kind === "new") {
    const callee = lowerExpression(expression.callee, builder);
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
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
    const argumentsValue = [callee, receiver, ...lowered.ids];
    const safepointArguments =
      lowered.list == null ? argumentsValue : [...argumentsValue, lowered.list];
    appendMirMetadata(
      builder,
      "safepoint",
      "constructor call",
      safepointArguments,
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      ...includePropertiesWhen(() => {
        if (lowered.list == null) return undefined;
        return {
          argumentListId: lowered.list,
        };
      }),
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
  let argumentListId: number | undefined;
  let callTarget: MirCallTarget;
  let detail: string;
  if (expression.target.kind === "console-log") {
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    callArguments = [...lowered.ids];
    argumentListId = lowered.list;
    callTarget = { kind: "console-log" };
    detail = "console_log";
  } else if (expression.target.kind === "promise-intrinsic") {
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    callArguments = [...lowered.ids];
    argumentListId = lowered.list;
    callTarget = {
      kind: "promise-intrinsic",
      method: expression.target.method,
    };
    detail = `Promise.${expression.target.method}`;
  } else if (expression.target.kind === "timer-intrinsic") {
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    callArguments = [...lowered.ids];
    argumentListId = lowered.list;
    callTarget = {
      kind: "timer-intrinsic",
      method: expression.target.method,
    };
    detail = expression.target.method;
  } else if (expression.target.kind === "super") {
    return lowerSuperCall(expression, expression.target.thisBinding, builder);
  } else {
    let callee: number;
    let receiver: number;
    if (expression.target.kind === "dynamic") {
      if (expression.target.callee.kind === "with-get") {
        const reference = lowerWithRead(
          expression.target.callee,
          builder,
          true,
        );
        callee = reference.value;
        receiver =
          reference.receiver ??
          lowerSyntheticUndefined(expression.range, builder);
      } else {
        callee = lowerExpression(expression.target.callee, builder);
        receiver = lowerSyntheticUndefined(expression.range, builder);
      }
    } else if (expression.target.kind === "private-method") {
      // PrivateGet already resolves the element the object carries, so
      // a private method call needs no lookup of its own: it calls that
      // value with the same object as its receiver.
      receiver = lowerExpression(expression.target.object, builder);
      const privateNameValue = lowerPrivateName(
        expression.target.privateName,
        expression.range,
        builder,
      );
      callee = lowerPrivateRead(
        receiver,
        privateNameValue,
        expression.range,
        builder,
      );
    } else {
      // A `super` method call looks the callee up through the home
      // object's prototype and still calls it with the enclosing
      // element's `this`, so the lookup object and the receiver differ.
      const operand = superOperand(expression.target.object);
      let lookup: number;
      let keyInput: number;
      if (operand == null) {
        receiver = lowerExpression(expression.target.object, builder);
        lookup = receiver;
        keyInput = lowerExpression(expression.target.key, builder);
      } else {
        receiver = lowerSuperReceiver(operand, builder);
        keyInput = lowerExpression(expression.target.key, builder);
        lookup = lowerSuperBase(operand, builder);
      }
      const key = convertPropertyKey(
        keyInput,
        expression.target.key.range,
        builder,
      );
      appendMirMetadata(
        builder,
        "safepoint",
        "method lookup",
        [lookup, key],
        expression.range,
      );
      callee = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: operand == null ? [lookup, key] : [lookup, key, receiver],
        detail: "method lookup",
        id: callee,
        kind: "property-get",
        range: expression.range,
        ...includePropertiesWhen(() => {
          if (operand == null) return undefined;
          return {
            superReference: true as const,
          };
        }),
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
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    callArguments = [callee, receiver, ...lowered.ids];
    argumentListId = lowered.list;
    callTarget = { kind: "dynamic" };
    detail = "dynamic function value";
  }
  const safepointArguments =
    argumentListId == null ? callArguments : [...callArguments, argumentListId];
  const safepointId = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: safepointArguments,
    detail,
    id: safepointId,
    kind: "safepoint",
    range: expression.range,
  });
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    ...includePropertiesWhen(() => {
      if (argumentListId == null) return undefined;
      return {
        argumentListId,
      };
    }),
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

/**
 * Lowers one `super()` call. The parent constructor is the running
 * constructor's own [[Prototype]], so it is read from the callee rather
 * than from any expression. Each call constructs that parent with the
 * running `new.target`, which allocates a fresh receiver from the new
 * target's prototype. Whatever the parent produced then initializes the
 * derived constructor's `this` binding, which a second `super()` cannot
 * rebind.
 */
function lowerSuperCall(
  expression: HirExpression & { readonly kind: "call" },
  thisBinding: { readonly bindingId: number },
  builder: MirBuilder,
): number {
  appendMirMetadata(
    builder,
    "safepoint",
    "super constructor lookup",
    [],
    expression.range,
  );
  const parent = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    detail: "super constructor",
    id: parent,
    kind: "super-constructor",
    range: expression.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [parent],
    expression.range,
  );
  recordRoot(builder, parent, expression.range);
  const lowered = lowerCallArguments(
    expression.arguments,
    expression.range,
    builder,
  );
  const callArguments = [parent, ...lowered.ids];
  appendMirMetadata(
    builder,
    "safepoint",
    "super constructor call",
    lowered.list == null ? callArguments : [...callArguments, lowered.list],
    expression.range,
  );
  const constructed = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    ...includePropertiesWhen(() => {
      if (lowered.list == null) return undefined;
      return {
        argumentListId: lowered.list,
      };
    }),
    arguments: callArguments,
    detail: "super constructor",
    id: constructed,
    kind: "construct",
    range: expression.range,
    target: { kind: "super" },
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [constructed],
    expression.range,
  );
  recordRoot(builder, constructed, expression.range);
  const bound = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [constructed],
    bindingId: thisBinding.bindingId,
    detail: `%b${thisBinding.bindingId} this`,
    id: bound,
    kind: "this-bind",
    range: expression.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> return",
    [bound],
    expression.range,
  );
  recordRoot(builder, bound, expression.range);
  // SuperCall initializes the derived class's own fields on the receiver
  // the parent produced, after the binding a second `super()` rejects.
  if (builder.initializesInstanceElements) {
    lowerInstanceElementsInit(constructed, expression.range, builder);
  }
  return bound;
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
    } else if (
      statement.kind === "binding-pattern" &&
      statement.mode === "declare" &&
      statement.declarationKind !== "var"
    ) {
      for (const binding of hirBindingIdentifiers(statement.pattern)) {
        resetBinding(binding.bindingId, binding.name, binding.range, builder);
      }
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
  target?: MirControlTarget,
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
      ...includePropertiesWhen(() => {
        if (target == null) return undefined;
        return {
          completionTarget: target,
        };
      }),
    },
  );
}

function enterFinalizer(
  builder: MirBuilder,
  kind: NonNullable<MirOperation["completionKind"]>,
  range: SourceRange,
  value?: number,
  target?: MirControlTarget,
): boolean {
  const finalizer = builder.finalizers.at(-1);
  if (finalizer == null) return false;
  if (target != null && target.cleanupDepth > finalizer.cleanupDepth) {
    return false;
  }
  const destination = target ?? { blockId: 0, cleanupDepth: 0 };
  setCompletion(builder, kind, finalizer.blockId, range, value, destination);
  builder.current.terminator = {
    kind: "jump",
    target: finalizer.blockId,
  };
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
  const finallyTarget =
    finallyBlock == null ? undefined : controlTarget(builder, finallyBlock.id);
  if (finallyTarget != null) builder.finalizers.push(finallyTarget);
  const tryAbrupt =
    catchBlock == null
      ? (finallyTarget ?? outerAbrupt)
      : controlTarget(builder, catchBlock.id);
  if (tryAbrupt != null) builder.abruptTargets.push(tryAbrupt);
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
        controlTarget(builder, afterBlock.id),
      );
      builder.current.terminator = {
        kind: "jump",
        target: finallyBlock.id,
      };
    }
  }

  if (catchBlock != null && statement.handler != null) {
    builder.current = catchBlock;
    const handlerPattern = statement.handler.pattern;
    if (handlerPattern != null) {
      for (const binding of hirBindingIdentifiers(handlerPattern)) {
        resetBinding(binding.bindingId, binding.name, binding.range, builder);
      }
    }
    // The caught operation both clears the pending language error
    // context and consumes the completion slot's thrown value, so the
    // optional catch binding form still emits it and simply leaves the
    // value unused.
    const caught = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail:
        handlerPattern == null ? "discarded catch value" : "catch parameter",
      id: caught,
      kind: "caught",
      completionSlot: catchBlock.id,
      range: statement.handler.range,
    });
    recordRoot(builder, caught, statement.handler.range);
    const catchAbrupt = finallyTarget ?? outerAbrupt;
    if (catchAbrupt != null) builder.abruptTargets.push(catchAbrupt);
    if (finallyTarget != null) builder.finalizers.push(finallyTarget);
    if (handlerPattern != null) {
      lowerBindingTarget(handlerPattern, caught, "initialize", builder);
    }
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
          controlTarget(builder, afterBlock.id),
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
        ...includePropertiesWhen(() => {
          if (outerAbrupt == null) return undefined;
          return {
            outerAbrupt,
          };
        }),
        ...includePropertiesWhen(() => {
          if (outerFinalizer == null) return undefined;
          return {
            outerFinalizer,
          };
        }),
      };
    }
    if (finallyTerminated) {
      for (const block of builder.blocks) {
        for (let index = 0; index < block.operations.length; index += 1) {
          const operation = block.operations[index];
          if (
            operation?.completionSlot === finallyBlock.id &&
            operation.completionTarget?.blockId === afterBlock.id
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

/**
 * Lower one for-of or for-in head target and store `value` through it.
 *
 * ForIn/OfBodyEvaluation gives both heads the same per-iteration
 * reference evaluation and PutValue, so the store is shared. `head`
 * names the statement in printed evidence and selects what an abrupt
 * store transfers to: an iterate head closes its iterator, while an
 * enumerate head has none to close.
 */
function lowerForHeadTarget(
  target: HirForOfTarget,
  value: number,
  builder: MirBuilder,
  head: "for-in" | "for-of" = "for-of",
): void {
  const abruptNote =
    head === "for-of"
      ? "normal -> continue, abrupt -> close iterator"
      : "normal -> continue, abrupt -> transfer";
  if (target.kind === "assignment-pattern") {
    lowerBindingTarget(target.pattern, value, "write", builder);
    return;
  }
  if (target.kind === "pattern-declaration") {
    if (target.declarationKind !== "var") {
      for (const binding of hirBindingIdentifiers(target.pattern)) {
        resetBinding(binding.bindingId, binding.name, binding.range, builder);
      }
    }
    lowerBindingTarget(
      target.pattern,
      value,
      target.declarationKind === "var" ? "write" : "initialize",
      builder,
    );
    return;
  }
  if (target.kind === "declaration" && target.declarationKind !== "var") {
    resetBinding(target.bindingId, target.name, target.range, builder);
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value],
      bindingId: target.bindingId,
      detail: `%b${target.bindingId} ${target.name}`,
      id,
      kind: "initialize",
      range: target.range,
    });
    recordRoot(builder, id, target.range);
    return;
  }
  if (
    target.kind === "binding" &&
    target.withObjectBindingIds != null &&
    target.withObjectBindingIds.length > 0
  ) {
    const selected = lowerWithReference(
      {
        name: target.name,
        objectBindingIds: target.withObjectBindingIds,
        range: target.range,
      },
      builder,
    );
    lowerWithBindingWrite(selected, target, value, target.range, builder);
    return;
  }
  if (target.kind === "binding" || target.kind === "declaration") {
    appendMirMetadata(
      builder,
      "safepoint",
      `${head} binding assignment error`,
      [value],
      target.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value],
      bindingId: target.bindingId,
      detail: `%b${target.bindingId} ${target.name}`,
      ...includePropertiesWhen(() => {
        if (!(target.kind === "binding" && target.functionNameBinding === true))
          return undefined;
        return { functionNameBinding: true };
      }),
      ...includePropertiesWhen(() => {
        if (!(target.kind === "binding" && target.importedBinding === true))
          return undefined;
        return { importedBinding: true };
      }),
      id,
      kind: "write",
      mutable: target.mutable,
      range: target.range,
    });
    appendMirMetadata(builder, "check-status", abruptNote, [id], target.range);
    recordRoot(builder, id, target.range);
    return;
  }
  if (target.kind === "private") {
    const object = lowerExpression(target.object, builder);
    const privateNameValue = lowerPrivateName(
      target.privateName,
      target.range,
      builder,
    );
    lowerPrivateWrite(
      object,
      privateNameValue,
      value,
      target.range,
      builder,
      `${head} private target`,
    );
    return;
  }
  // ForIn/OfBodyEvaluation evaluates the head reference once per
  // iteration, after the iterator produced this value and before
  // PutValue stores it, so a `super` head reads its receiver and its key
  // here and an abrupt one closes the iterator like any other step.
  const operand = superOperand(target.object);
  const superReceiver =
    operand == null ? undefined : lowerSuperReceiver(operand, builder);
  const { keyInput, object } = lowerReferenceObject(
    target.object,
    target.key,
    operand,
    builder,
  );
  const initialExists =
    target.strictGlobalFallback == null
      ? undefined
      : lowerBinaryValues(keyInput, "in", object, target.range, builder);
  const key = convertPropertyKey(keyInput, target.key.range, builder);
  if (initialExists != null && target.strictGlobalFallback != null) {
    lowerStrictGlobalPropertyWrite(
      initialExists,
      object,
      key,
      value,
      target.strictGlobalFallback,
      target.range,
      builder,
    );
    return;
  }
  appendMirMetadata(
    builder,
    "safepoint",
    `${head} property storage growth`,
    [object, key, value],
    target.range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments:
      superReceiver == null
        ? [object, key, value]
        : [object, key, value, superReceiver],
    detail: `${head} property target`,
    id,
    kind: "property-set",
    range: target.range,
    ...strictCodeFlag(builder),
    ...includePropertiesWhen(() => {
      if (superReceiver == null) return undefined;
      return {
        superReference: true as const,
      };
    }),
  });
  appendMirMetadata(builder, "check-status", abruptNote, [id], target.range);
  recordRoot(builder, id, target.range);
}

function lowerForOfStatement(
  statement: HirStatement & { readonly kind: "for-of" },
  builder: MirBuilder,
): void {
  if (
    statement.target.kind === "declaration" &&
    statement.target.declarationKind !== "var"
  ) {
    // ForIn/OfHeadEvaluation creates the lexical environment before
    // evaluating the iterable, so a same-name read observes the TDZ.
    resetBinding(
      statement.target.bindingId,
      statement.target.name,
      statement.target.range,
      builder,
    );
  } else if (
    statement.target.kind === "pattern-declaration" &&
    statement.target.declarationKind !== "var"
  ) {
    for (const binding of hirBindingIdentifiers(statement.target.pattern)) {
      // ForIn/OfHeadEvaluation creates every lexical pattern binding before
      // evaluating the iterable, so same-name reads observe the TDZ.
      resetBinding(binding.bindingId, binding.name, binding.range, builder);
    }
  }
  // A `for await` head reaches the same loop shape as a synchronous one;
  // only the three iterator operations change protocol, so break,
  // continue, return, and the conditional close keep one lowering.
  const awaited = statement.awaited === true;
  const kind = awaited ? "asynchronous" : "synchronous";
  const asynchronous = awaited ? { iteratorAsync: true as const } : {};
  const iterable = lowerExpression(statement.iterable, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    `get ${kind} iterator`,
    [iterable],
    statement.iterable.range,
  );
  const iterator = builder.nextValue;
  builder.nextValue += 1;
  const nextMethod = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterable],
    detail: `GetIterator ${awaited ? "async" : "sync"}`,
    id: iterator,
    ...asynchronous,
    iteratorNextMethodResult: nextMethod,
    kind: "iterator-get",
    range: statement.iterable.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> step, abrupt -> return without close",
    [iterator],
    statement.iterable.range,
  );
  recordRoot(builder, iterator, statement.iterable.range);
  recordRoot(builder, nextMethod, statement.iterable.range);

  const stepBlock = createMirBlock(builder);
  const bodyBlock = createMirBlock(builder);
  const closeBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  const closeTarget = controlTarget(builder, closeBlock.id);
  const exitTarget = controlTarget(builder, exitBlock.id);
  builder.current.terminator = { kind: "jump", target: stepBlock.id };

  builder.current = stepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    `step ${kind} iterator`,
    [iterator, nextMethod],
    statement.range,
  );
  let value: number;
  if (awaited && (builder.asyncFunction || builder.asyncGenerator)) {
    const step = lowerAwaitedIteratorStep(
      "next",
      [iterator, nextMethod],
      statement.range,
      "Await, IteratorStep, and IteratorValue",
      false,
      builder,
    );
    value = step.value;
    builder.current.terminator = {
      kind: "branch",
      test: step.continues,
      whenFalse: exitBlock.id,
      whenTrue: bodyBlock.id,
    };
  } else {
    const hasValue = builder.nextValue;
    builder.nextValue += 1;
    value = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [iterator, nextMethod],
      detail: awaited
        ? "Await, IteratorStep, and IteratorValue"
        : "IteratorStep and IteratorValue",
      id: hasValue,
      ...asynchronous,
      iteratorValueResult: value,
      kind: "iterator-next",
      range: statement.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> branch, abrupt -> return without close",
      [hasValue],
      statement.range,
    );
    recordRoot(builder, value, statement.range);
    builder.current.terminator = {
      kind: "branch",
      test: hasValue,
      whenFalse: exitBlock.id,
      whenTrue: bodyBlock.id,
    };
  }

  builder.finalizers.push(closeTarget);
  builder.abruptTargets.push(closeTarget);
  const continueTarget = controlTarget(builder, stepBlock.id);
  builder.loops.push({ breakTarget: exitTarget, continueTarget });
  const claimed = builder.pendingLabels.splice(0);
  for (const name of claimed) {
    builder.labels.push({
      breakTarget: exitTarget,
      continueTarget,
      name,
    });
  }
  builder.current = bodyBlock;
  lowerForHeadTarget(statement.target, value, builder);
  const terminated = lowerStatementBody(statement.body, builder);
  builder.labels.length -= claimed.length;
  builder.loops.pop();
  builder.abruptTargets.pop();
  builder.finalizers.pop();
  if (!terminated) {
    builder.current.terminator = { kind: "jump", target: stepBlock.id };
  }

  const outerAbrupt = builder.abruptTargets.at(-1);
  const outerFinalizer = builder.finalizers.at(-1);
  builder.current = closeBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    `close ${kind} iterator`,
    [iterator],
    statement.range,
  );
  if (awaited && (builder.asyncFunction || builder.asyncGenerator)) {
    lowerAwaitedIteratorClose(
      iterator,
      closeBlock.id,
      statement.range,
      builder,
    );
  } else {
    const closed = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [iterator],
      completionSlot: closeBlock.id,
      detail: awaited ? "AsyncIteratorClose" : "IteratorClose",
      id: closed,
      ...asynchronous,
      kind: "iterator-close",
      range: statement.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> resume completion, abrupt -> override completion",
      [closed],
      statement.range,
    );
    recordRoot(builder, closed, statement.range);
  }
  builder.current.terminator = {
    completionSlot: closeBlock.id,
    kind: "resume-completion",
    ...includePropertiesWhen(() => {
      if (outerAbrupt == null) return undefined;
      return { outerAbrupt };
    }),
    ...includePropertiesWhen(() => {
      if (outerFinalizer == null) return undefined;
      return {
        outerFinalizer,
      };
    }),
  };

  builder.current = exitBlock;
  appendMirMetadata(
    builder,
    "join",
    `for${awaited ? "-await" : ""}-of bb${stepBlock.id}`,
    [],
    statement.range,
  );
}

function lowerForInStatement(
  statement: HirStatement & { readonly kind: "for-in" },
  builder: MirBuilder,
): void {
  if (
    statement.target.kind === "declaration" &&
    statement.target.declarationKind !== "var"
  ) {
    // ForIn/OfHeadEvaluation creates the lexical environment before
    // evaluating the subject, so a same-name read observes the TDZ.
    resetBinding(
      statement.target.bindingId,
      statement.target.name,
      statement.target.range,
      builder,
    );
  } else if (
    statement.target.kind === "pattern-declaration" &&
    statement.target.declarationKind !== "var"
  ) {
    for (const binding of hirBindingIdentifiers(statement.target.pattern)) {
      // Every lexical pattern binding is created before the subject runs,
      // so a same-name read in the subject observes the TDZ.
      resetBinding(binding.bindingId, binding.name, binding.range, builder);
    }
  }
  const subject = lowerExpression(statement.subject, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "enumerate object properties",
    [subject],
    statement.subject.range,
  );
  const enumerating = builder.nextValue;
  builder.nextValue += 1;
  const enumeration = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [subject],
    detail: "EnumerateObjectProperties",
    enumerateRecordResult: enumeration,
    id: enumerating,
    kind: "enumerate-get",
    range: statement.subject.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> transfer",
    [enumerating],
    statement.subject.range,
  );
  recordRoot(builder, enumeration, statement.subject.range);

  const stepBlock = createMirBlock(builder);
  const bodyBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  // A nullish subject makes ForIn/OfHeadEvaluation report a break
  // completion, which skips the whole statement without an error.
  builder.current.terminator = {
    kind: "branch",
    test: enumerating,
    whenFalse: exitBlock.id,
    whenTrue: stepBlock.id,
  };

  builder.current = stepBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "step enumeration",
    [enumeration],
    statement.range,
  );
  const hasKey = builder.nextValue;
  builder.nextValue += 1;
  const key = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [enumeration],
    detail: "enumeration step",
    enumerateKeyResult: key,
    id: hasKey,
    kind: "enumerate-next",
    range: statement.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> branch, abrupt -> transfer",
    [hasKey],
    statement.range,
  );
  recordRoot(builder, key, statement.range);
  builder.current.terminator = {
    kind: "branch",
    test: hasKey,
    whenFalse: exitBlock.id,
    whenTrue: bodyBlock.id,
  };

  // An enumerate head has no iterator to close, so no finalizer or
  // abrupt target is pushed: a break, continue, return, or throw leaves
  // the loop through the enclosing transfer unchanged.
  const exitTarget = controlTarget(builder, exitBlock.id);
  const continueTarget = controlTarget(builder, stepBlock.id);
  builder.loops.push({ breakTarget: exitTarget, continueTarget });
  const claimed = builder.pendingLabels.splice(0);
  for (const name of claimed) {
    builder.labels.push({ breakTarget: exitTarget, continueTarget, name });
  }
  builder.current = bodyBlock;
  lowerForHeadTarget(statement.target, key, builder, "for-in");
  const terminated = lowerStatementBody(statement.body, builder);
  builder.labels.length -= claimed.length;
  builder.loops.pop();
  if (!terminated) {
    builder.current.terminator = { kind: "jump", target: stepBlock.id };
  }

  builder.current = exitBlock;
  appendMirMetadata(
    builder,
    "join",
    `for-in bb${stepBlock.id}`,
    [],
    statement.range,
  );
}

function lowerBindingIteratorNext(
  iterator: number,
  nextMethod: number,
  doneState: number,
  range: SourceRange,
  builder: MirBuilder,
) {
  appendMirMetadata(
    builder,
    "safepoint",
    "step array binding iterator",
    [iterator, nextMethod],
    range,
  );
  const hasValue = builder.nextValue;
  builder.nextValue += 1;
  const value = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator, nextMethod],
    detail: "IteratorStepValue for array binding",
    id: hasValue,
    iteratorDoneState: doneState,
    iteratorValueResult: value,
    kind: "iterator-next",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> close unfinished outer iterators",
    [hasValue],
    range,
  );
  recordRoot(builder, value, range);
  return { hasValue, value };
}

function lowerBindingDefault(
  value: number,
  initializer: HirExpression | undefined,
  range: SourceRange,
  builder: MirBuilder,
): number {
  if (initializer == null) return value;
  const undefinedValue = lowerSyntheticUndefined(range, builder);
  const useDefault = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [value, undefinedValue],
    detail: "=== undefined",
    id: useDefault,
    kind: "binary",
    operator: "===",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> select binding default, abrupt -> transfer",
    [useDefault],
    range,
  );
  const defaultBlock = createMirBlock(builder);
  const valueBlock = createMirBlock(builder);
  const joinBlock = createMirBlock(builder);
  const result = builder.nextValue;
  builder.nextValue += 1;
  joinBlock.parameters = [result];
  builder.current.terminator = {
    kind: "branch",
    test: useDefault,
    whenFalse: valueBlock.id,
    whenTrue: defaultBlock.id,
  };
  builder.current = defaultBlock;
  const defaultValue = lowerExpression(initializer, builder);
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [defaultValue],
  };
  builder.current = valueBlock;
  builder.current.terminator = {
    kind: "jump",
    target: joinBlock.id,
    values: [value],
  };
  builder.current = joinBlock;
  appendMirMetadata(
    builder,
    "join",
    `binding default bb${defaultBlock.id} + bb${valueBlock.id}`,
    [],
    range,
  );
  return recordRoot(builder, result, range);
}

function lowerBindingTarget(
  pattern: HirBindingPattern,
  value: number,
  mode: BindingPatternMode,
  builder: MirBuilder,
  reference?: LoweredAssignmentReference,
): void {
  if (pattern.kind === "assignment-member") {
    if (reference?.kind !== "property") {
      throw new Error("Assignment member target was not prepared.");
    }
    const prepared = reference;
    const superReceiver = prepared.superReceiver;
    // A `super` reference starts at the home object's prototype, which
    // PutValue hands to ToObject itself, so a nullish one reports the
    // TypeError the store raises instead of a separate
    // RequireObjectCoercible.
    const object =
      superReceiver == null
        ? lowerObjectCoercible(prepared.object, pattern.object.range, builder)
        : prepared.object;
    const key = convertPropertyKey(prepared.key, pattern.key.range, builder);
    if (
      prepared.initialExists != null &&
      prepared.strictGlobalFallback != null
    ) {
      lowerStrictGlobalPropertyWrite(
        prepared.initialExists,
        object,
        key,
        value,
        prepared.strictGlobalFallback,
        pattern.range,
        builder,
      );
      return;
    }
    appendMirMetadata(
      builder,
      "safepoint",
      "destructuring member target storage growth",
      [object, key, value],
      pattern.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments:
        superReceiver == null
          ? [object, key, value]
          : [object, key, value, superReceiver],
      detail: "destructuring member target",
      id,
      kind: "property-set",
      range: pattern.range,
      ...strictCodeFlag(builder),
      ...includePropertiesWhen(() => {
        if (superReceiver == null) return undefined;
        return {
          superReference: true as const,
        };
      }),
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> transfer",
      [id],
      pattern.range,
    );
    recordRoot(builder, id, pattern.range);
    return;
  }
  if (pattern.kind === "assignment-private") {
    if (reference?.kind !== "private") {
      throw new Error("Assignment private target was not prepared.");
    }
    lowerPrivateWrite(
      reference.object,
      reference.privateName,
      value,
      pattern.range,
      builder,
      "destructuring private target",
    );
    return;
  }
  if (pattern.kind === "array-binding-pattern") {
    lowerArrayBindingPattern(pattern, value, mode, builder);
    return;
  }
  if (pattern.kind === "object-binding-pattern") {
    lowerObjectBindingPattern(pattern, value, mode, builder);
    return;
  }
  if (
    mode === "write" &&
    pattern.withObjectBindingIds != null &&
    pattern.withObjectBindingIds.length > 0
  ) {
    const selected = lowerWithReference(
      {
        name: pattern.name,
        objectBindingIds: pattern.withObjectBindingIds,
        range: pattern.range,
      },
      builder,
    );
    lowerWithBindingWrite(selected, pattern, value, pattern.range, builder);
    return;
  }
  if (mode === "write") {
    appendMirMetadata(
      builder,
      "safepoint",
      "binding pattern write error",
      [value],
      pattern.range,
    );
  }
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [value],
    bindingId: pattern.bindingId,
    detail: `%b${pattern.bindingId} ${pattern.name}`,
    ...includePropertiesWhen(() => {
      if (!(pattern.functionNameBinding === true)) return undefined;
      return {
        functionNameBinding: true,
      };
    }),
    ...includePropertiesWhen(() => {
      if (!(pattern.importedBinding === true)) return undefined;
      return {
        importedBinding: true,
      };
    }),
    id,
    kind: mode === "write" ? "write" : "initialize",
    ...includePropertiesWhen(() => {
      if (!(mode === "write")) return undefined;
      return {
        mutable: pattern.mutable,
      };
    }),
    range: pattern.range,
  });
  if (mode === "write") {
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> transfer",
      [id],
      pattern.range,
    );
  }
  recordRoot(builder, id, pattern.range);
}

/**
 * One destructuring assignment leaf's evaluated reference, held from the
 * point the pattern evaluates it until PutValue stores through it.
 * `superReceiver` is present exactly when the leaf named a `super`
 * property: the lookup then starts at the home object's prototype while
 * the stored value reaches the enclosing element's `this`.
 */
type LoweredAssignmentReference =
  | {
      readonly key: number;
      readonly kind: "property";
      readonly object: number;
      readonly superReceiver?: number;
      readonly initialExists?: number;
      readonly strictGlobalFallback?: {
        readonly bindingId: number;
        readonly name: string;
      };
    }
  | {
      readonly kind: "private";
      readonly object: number;
      readonly privateName: number;
    };

function lowerAssignmentReference(
  pattern: HirBindingPattern,
  mode: BindingPatternMode,
  builder: MirBuilder,
): LoweredAssignmentReference | undefined {
  if (mode !== "write") return undefined;
  if (pattern.kind === "assignment-member") {
    const operand = superOperand(pattern.object);
    const superReceiver =
      operand == null ? undefined : lowerSuperReceiver(operand, builder);
    const { keyInput, object } = lowerReferenceObject(
      pattern.object,
      pattern.key,
      operand,
      builder,
    );
    const initialExists =
      pattern.strictGlobalFallback == null
        ? undefined
        : lowerBinaryValues(keyInput, "in", object, pattern.range, builder);
    return {
      key: keyInput,
      kind: "property",
      object,
      ...includePropertiesWhen(() => {
        if (superReceiver == null) return undefined;
        return {
          superReceiver,
        };
      }),
      ...includePropertiesWhen(() => {
        if (initialExists == null) return undefined;
        return {
          initialExists,
        };
      }),
      ...includePropertiesWhen(() => {
        if (pattern.strictGlobalFallback == null) return undefined;
        return {
          strictGlobalFallback: pattern.strictGlobalFallback,
        };
      }),
    };
  }
  if (pattern.kind === "assignment-private") {
    const object = lowerExpression(pattern.object, builder);
    const privateName = lowerPrivateName(
      pattern.privateName,
      pattern.range,
      builder,
    );
    return { kind: "private", object, privateName };
  }
  return undefined;
}

function lowerObjectBindingPattern(
  pattern: HirObjectBindingPattern,
  input: number,
  mode: BindingPatternMode,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "require object-coercible binding input",
    [input],
    pattern.range,
  );
  const object = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [input],
    detail: "RequireObjectCoercible for object binding",
    id: object,
    kind: "object-coercible",
    range: pattern.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> read binding properties, abrupt -> transfer",
    [object],
    pattern.range,
  );
  recordRoot(builder, object, pattern.range);
  const excludedKeys: number[] = [];
  for (const property of pattern.properties) {
    const key = lowerPropertyKey(property.key, builder);
    excludedKeys.push(key);
    const target = lowerAssignmentReference(property.pattern, mode, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "object binding property lookup",
      [object, key],
      property.range,
    );
    const propertyValue = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, key],
      detail: "GetV for object binding",
      id: propertyValue,
      kind: "property-get",
      range: property.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> select binding value, abrupt -> transfer",
      [propertyValue],
      property.range,
    );
    recordRoot(builder, propertyValue, property.range);
    const value = lowerBindingDefault(
      propertyValue,
      property.initializer,
      property.range,
      builder,
    );
    lowerBindingTarget(property.pattern, value, mode, builder, target);
  }
  if (pattern.rest != null) {
    const target = lowerAssignmentReference(pattern.rest, mode, builder);
    appendMirMetadata(
      builder,
      "safepoint",
      "object binding rest copy",
      [object, ...excludedKeys],
      pattern.rest.range,
    );
    const rest = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [object, ...excludedKeys],
      detail: "CopyDataProperties for object binding rest",
      id: rest,
      kind: "object-rest",
      range: pattern.rest.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> bind rest object, abrupt -> transfer",
      [rest],
      pattern.rest.range,
    );
    recordRoot(builder, rest, pattern.rest.range);
    lowerBindingTarget(pattern.rest, rest, mode, builder, target);
  }
}

function lowerArrayBindingRest(
  pattern: HirBindingPattern,
  iterator: number,
  nextMethod: number,
  doneState: number,
  mode: BindingPatternMode,
  range: SourceRange,
  builder: MirBuilder,
): void {
  const target = lowerAssignmentReference(pattern, mode, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "array binding rest allocation",
    [],
    range,
  );
  const array = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [],
    arrayLength: 0,
    detail: "array binding rest",
    id: array,
    kind: "array-create",
    range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> drain iterator, abrupt -> close iterator",
    [array],
    range,
  );
  recordRoot(builder, array, range);
  const stepBlock = createMirBlock(builder);
  const appendBlock = createMirBlock(builder);
  const bindBlock = createMirBlock(builder);
  builder.current.terminator = { kind: "jump", target: stepBlock.id };
  builder.current = stepBlock;
  const next = lowerBindingIteratorNext(
    iterator,
    nextMethod,
    doneState,
    range,
    builder,
  );
  builder.current.terminator = {
    kind: "branch",
    test: next.hasValue,
    whenFalse: bindBlock.id,
    whenTrue: appendBlock.id,
  };
  builder.current = appendBlock;
  lowerArrayAppend(
    array,
    next.value,
    range,
    builder,
    "normal -> continue, abrupt -> close iterator",
  );
  builder.current.terminator = { kind: "jump", target: stepBlock.id };
  builder.current = bindBlock;
  lowerBindingTarget(pattern, array, mode, builder, target);
}

function lowerArrayBindingPattern(
  pattern: HirArrayBindingPattern,
  iterable: number,
  mode: BindingPatternMode,
  builder: MirBuilder,
): void {
  appendMirMetadata(
    builder,
    "safepoint",
    "get array binding iterator",
    [iterable],
    pattern.range,
  );
  const iterator = builder.nextValue;
  builder.nextValue += 1;
  const nextMethod = builder.nextValue;
  builder.nextValue += 1;
  const doneState = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterable],
    detail: "GetIterator sync for array binding",
    id: iterator,
    iteratorDoneState: doneState,
    iteratorNextMethodResult: nextMethod,
    kind: "iterator-get",
    range: pattern.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> bind, abrupt -> return without close",
    [iterator],
    pattern.range,
  );
  recordRoot(builder, iterator, pattern.range);
  recordRoot(builder, nextMethod, pattern.range);

  const closeBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  const closeTarget = controlTarget(builder, closeBlock.id);
  builder.finalizers.push(closeTarget);
  builder.abruptTargets.push(closeTarget);
  for (const element of pattern.elements) {
    const target =
      element == null
        ? undefined
        : lowerAssignmentReference(element.pattern, mode, builder);
    const next = lowerBindingIteratorNext(
      iterator,
      nextMethod,
      doneState,
      element?.range ?? pattern.range,
      builder,
    );
    if (element == null) continue;
    const value = lowerBindingDefault(
      next.value,
      element.initializer,
      element.range,
      builder,
    );
    lowerBindingTarget(element.pattern, value, mode, builder, target);
  }
  if (pattern.rest != null) {
    lowerArrayBindingRest(
      pattern.rest,
      iterator,
      nextMethod,
      doneState,
      mode,
      pattern.range,
      builder,
    );
  }
  builder.abruptTargets.pop();
  builder.finalizers.pop();
  setCompletion(
    builder,
    "normal",
    closeBlock.id,
    pattern.range,
    undefined,
    controlTarget(builder, exitBlock.id),
  );
  builder.current.terminator = { kind: "jump", target: closeBlock.id };

  const outerAbrupt = builder.abruptTargets.at(-1);
  const outerFinalizer = builder.finalizers.at(-1);
  builder.current = closeBlock;
  appendMirMetadata(
    builder,
    "safepoint",
    "close array binding iterator",
    [iterator],
    pattern.range,
  );
  const closed = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator],
    completionSlot: closeBlock.id,
    detail: "IteratorClose for array binding",
    id: closed,
    iteratorDoneState: doneState,
    kind: "iterator-close",
    range: pattern.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> resume completion, abrupt -> override normal completion",
    [closed],
    pattern.range,
  );
  recordRoot(builder, closed, pattern.range);
  builder.current.terminator = {
    completionSlot: closeBlock.id,
    kind: "resume-completion",
    ...includePropertiesWhen(() => {
      if (outerAbrupt == null) return undefined;
      return { outerAbrupt };
    }),
    ...includePropertiesWhen(() => {
      if (outerFinalizer == null) return undefined;
      return {
        outerFinalizer,
      };
    }),
  };
  builder.current = exitBlock;
  appendMirMetadata(
    builder,
    "join",
    `array binding bb${closeBlock.id}`,
    [],
    pattern.range,
  );
}

function forDeclarationBindings(
  declaration: HirForDeclaration,
): readonly HirBindingIdentifier[] {
  if (declaration.kind === "pattern") {
    return hirBindingIdentifiers(declaration.pattern);
  }
  return [
    {
      bindingId: declaration.bindingId,
      hints: [],
      kind: "binding-identifier",
      mutable: declaration.declarationKind !== "const",
      name: declaration.name,
      range: declaration.range,
    },
  ];
}

function lowerStatements(
  statements: readonly HirStatement[],
  builder: MirBuilder,
): boolean {
  for (const statement of statements) {
    if (statement.kind === "binding-pattern") {
      const value = lowerExpression(statement.initializer, builder);
      lowerBindingTarget(statement.pattern, value, statement.mode, builder);
    } else if (
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
          functionLength: statement.functionLength,
          kind: "function",
          name: statement.functionName,
          range: statement.range,
          ...includePropertiesWhen(() => {
            if (statement.sourceText == null) return undefined;
            return {
              sourceText: statement.sourceText,
            };
          }),
        },
        builder,
      );
      // A parameter or the implicit `arguments` binding this declaration
      // shares a name with is already initialized by the time
      // FunctionDeclarationInstantiation reaches its own function
      // declarations, so this instantiation writes through that existing
      // binding instead of initializing a fresh one.
      const writesThroughOuterBinding = statement.alreadyInitialized === true;
      if (writesThroughOuterBinding) {
        appendMirMetadata(
          builder,
          "safepoint",
          "binding assignment error",
          [value],
          statement.range,
        );
      }
      const id = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [value],
        bindingId: statement.bindingId,
        detail: `%b${statement.bindingId} ${statement.name}`,
        id,
        kind: writesThroughOuterBinding ? "write" : "initialize",
        ...includePropertiesWhen(() => {
          if (!writesThroughOuterBinding) return undefined;
          return {
            mutable: true,
          };
        }),
        range: statement.range,
      });
      if (writesThroughOuterBinding) {
        appendMirMetadata(
          builder,
          "check-status",
          "normal -> continue, abrupt -> return",
          [id],
          statement.range,
        );
      }
      recordRoot(builder, id, statement.range);
    } else if (statement.kind === "expression") {
      lowerExpression(statement.expression, builder);
    } else if (statement.kind === "return") {
      const returned =
        statement.expression == null
          ? lowerSyntheticUndefined(statement.range, builder)
          : lowerExpression(
              statement.expression,
              builder,
              lowerFieldInitializerName(statement.expression, builder),
            );
      /* `return expr` inside an asynchronous generator awaits its
       * operand, so a returned promise reports its settled value as the
       * final step. A bare `return` names no operand and awaits
       * nothing. */
      const value =
        builder.asyncGenerator && statement.expression != null
          ? lowerAsyncGeneratorAwait(returned, statement.range, builder)
          : returned;
      if (!enterFinalizer(builder, "return", statement.range, value)) {
        builder.current.terminator = { kind: "return", value };
      }
      return true;
    } else if (statement.kind === "throw") {
      const value = lowerExpression(statement.expression, builder);
      lowerThrowValue(value, statement.range, builder);
      return true;
    } else if (statement.kind === "try") {
      if (lowerTryStatement(statement, builder)) return true;
    } else if (statement.kind === "with") {
      const input = lowerExpression(statement.object, builder);
      const object = lowerObjectCoercible(input, statement.range, builder);
      resetBinding(
        statement.objectBindingId,
        "<with object>",
        statement.range,
        builder,
      );
      for (const fallback of statement.fallbackBindings) {
        resetBinding(
          fallback.bindingId,
          `<with fallback ${fallback.name}>`,
          statement.range,
          builder,
        );
      }
      const initialized = builder.nextValue;
      builder.nextValue += 1;
      builder.current.operations.push({
        arguments: [object],
        bindingId: statement.objectBindingId,
        detail: `%b${statement.objectBindingId} <with object>`,
        id: initialized,
        kind: "initialize",
        range: statement.range,
      });
      recordRoot(builder, initialized, statement.range);
      if (lowerStatementBody(statement.body, builder)) return true;
    } else if (statement.kind === "block") {
      resetBlockBindings(statement.body, builder);
      if (lowerStatements(statement.body, builder)) return true;
    } else if (statement.kind === "break" || statement.kind === "continue") {
      let target: MirControlTarget;
      if (statement.label != null) {
        const label = builder.labels.findLast(
          (entry) => entry.name === statement.label,
        );
        const labelTarget =
          statement.kind === "break"
            ? label?.breakTarget
            : label?.continueTarget;
        if (labelTarget == null) {
          throw new Error(`${statement.kind} has no MIR label target.`);
        }
        target = labelTarget;
      } else {
        const loop = builder.loops.at(-1);
        if (loop == null) {
          throw new Error(`${statement.kind} has no MIR loop.`);
        }
        target =
          statement.kind === "break" ? loop.breakTarget : loop.continueTarget;
      }
      if (
        !enterFinalizer(builder, "jump", statement.range, undefined, target)
      ) {
        builder.current.terminator = { kind: "jump", target: target.blockId };
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
        breakTarget: controlTarget(builder, exitBlock.id),
        continueTarget: controlTarget(builder, conditionBlock.id),
      });
      const claimed = builder.pendingLabels.splice(0);
      for (const name of claimed) {
        builder.labels.push({
          breakTarget: controlTarget(builder, exitBlock.id),
          continueTarget: controlTarget(builder, conditionBlock.id),
          name,
        });
      }
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      builder.labels.length -= claimed.length;
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
    } else if (statement.kind === "labeled") {
      const names: string[] = [];
      let inner: HirStatement = statement;
      while (inner.kind === "labeled") {
        names.push(inner.label);
        inner = inner.body;
      }
      if (
        inner.kind === "while" ||
        inner.kind === "do-while" ||
        inner.kind === "for" ||
        inner.kind === "for-in" ||
        inner.kind === "for-of"
      ) {
        // The loop lowering claims these names and binds them to its
        // own break and continue targets.
        builder.pendingLabels.push(...names);
        if (lowerStatements([inner], builder)) return true;
      } else {
        const exitBlock = createMirBlock(builder);
        for (const name of names) {
          builder.labels.push({
            breakTarget: controlTarget(builder, exitBlock.id),
            name,
          });
        }
        const terminated = lowerStatements([inner], builder);
        builder.labels.length -= names.length;
        if (!terminated) {
          builder.current.terminator = {
            kind: "jump",
            target: exitBlock.id,
          };
        }
        builder.current = exitBlock;
        appendMirMetadata(
          builder,
          "join",
          `label ${names.join(" ")}`,
          [],
          statement.range,
        );
      }
    } else if (statement.kind === "switch") {
      const discriminant = lowerExpression(statement.discriminant, builder);
      const functionInits = statement.functionInits ?? [];
      resetBlockBindings(
        [
          ...functionInits,
          ...statement.cases.flatMap((switchCase) => switchCase.body),
        ],
        builder,
      );
      // BlockDeclarationInstantiation instantiates every CaseBlock
      // function once, here, before CaseBlockEvaluation tests or enters
      // any clause, so the binding is callable no matter which clause is
      // selected or reached through fallthrough.
      lowerStatements(functionInits, builder);
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
        breakTarget: controlTarget(builder, exitBlock.id),
        // A continue inside a switch body still targets the enclosing
        // loop; resolution rejects a continue without one.
        continueTarget:
          enclosingLoop?.continueTarget ?? controlTarget(builder, -1),
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
    } else if (statement.kind === "for-of") {
      lowerForOfStatement(statement, builder);
    } else if (statement.kind === "for-in") {
      lowerForInStatement(statement, builder);
    } else if (statement.kind === "for") {
      const declarations = statement.declarations ?? [];
      // CreatePerIterationEnvironment: each iteration reads the current
      // values, gives every let-bound for-head name a fresh cell, and
      // re-initializes it, so closures capture one environment per
      // iteration. A const head has no per-iteration bindings.
      const perIteration = declarations.flatMap((declaration) =>
        declaration.declarationKind === "let"
          ? forDeclarationBindings(declaration)
          : [],
      );
      const copyEnvironment = (): void => {
        for (const binding of perIteration) {
          const value = lowerExpression(
            {
              bindingId: binding.bindingId,
              kind: "binding",
              name: binding.name,
              range: binding.range,
            },
            builder,
          );
          resetBinding(binding.bindingId, binding.name, binding.range, builder);
          lowerBindingTarget(binding, value, "initialize", builder);
        }
      };
      for (const declaration of declarations) {
        if (declaration.declarationKind === "var") continue;
        for (const binding of forDeclarationBindings(declaration)) {
          resetBinding(binding.bindingId, binding.name, binding.range, builder);
        }
      }
      for (const declaration of declarations) {
        const value = lowerExpression(declaration.initializer, builder);
        const mode =
          declaration.declarationKind === "var" ? "write" : "initialize";
        if (declaration.kind === "binding") {
          lowerBindingTarget(
            forDeclarationBindings(declaration)[0]!,
            value,
            mode,
            builder,
          );
        } else {
          lowerBindingTarget(declaration.pattern, value, mode, builder);
        }
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
        breakTarget: controlTarget(builder, exitBlock.id),
        continueTarget: controlTarget(builder, updateBlock.id),
      });
      const claimed = builder.pendingLabels.splice(0);
      for (const name of claimed) {
        builder.labels.push({
          breakTarget: controlTarget(builder, exitBlock.id),
          continueTarget: controlTarget(builder, updateBlock.id),
          name,
        });
      }
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      builder.labels.length -= claimed.length;
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
        breakTarget: controlTarget(builder, exitBlock.id),
        continueTarget: controlTarget(builder, conditionBlock.id),
      });
      const claimed = builder.pendingLabels.splice(0);
      for (const name of claimed) {
        builder.labels.push({
          breakTarget: controlTarget(builder, exitBlock.id),
          continueTarget: controlTarget(builder, conditionBlock.id),
          name,
        });
      }
      builder.current = bodyBlock;
      const terminated = lowerStatementBody(statement.body, builder);
      builder.loops.pop();
      builder.labels.length -= claimed.length;
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

/**
 * Routes every `return` of a derived class constructor through the
 * `this` binding `super()` initializes. An object result stands as the
 * constructor's value, `undefined` becomes the bound `this`, and any
 * other value is a `TypeError`. Rewriting the terminators after the body
 * is built keeps a `return` inside `try` on the path its `finally`
 * already defines.
 */
function routeDerivedReturns(
  blocks: readonly MutableMirBlock[],
  derivedThisBindingId: number,
  builder: MirBuilder,
  range: SourceRange,
): void {
  for (const block of blocks) {
    const terminator = block.terminator;
    if (terminator?.kind !== "return") continue;
    const id = builder.nextValue;
    builder.nextValue += 1;
    block.operations.push({
      arguments: [terminator.value],
      bindingId: derivedThisBindingId,
      detail: `%b${derivedThisBindingId} this`,
      id,
      kind: "derived-return",
      range,
    });
    block.terminator = { kind: "return", value: id };
  }
}

function buildMirFunction(
  id: number,
  name: string,
  body: readonly HirStatement[],
  parameters: readonly HirParameter[],
  functionLength: number,
  localBindingIds: readonly number[],
  selfBindingId: number | undefined,
  range: SourceRange,
  specialization: SpecializationMode,
  strict: boolean,
  generator = false,
  derivedThisBindingId?: number,
  initializesInstanceElements = false,
  fieldKeyBindingId?: number,
  asyncGenerator = false,
  asyncFunction = false,
  argumentsBindingId?: number,
  generatorCallStatementCount = 0,
  argumentsMapped = false,
): MirFunction {
  const entry: MutableMirBlock = {
    id: 0,
    operations: [],
    terminator: undefined,
  };
  const builder: MirBuilder = {
    abruptTargets: [],
    asyncFunction,
    asyncGenerator,
    blocks: [entry],
    current: entry,
    ...includePropertiesWhen(() => {
      if (fieldKeyBindingId == null) return undefined;
      return {
        fieldKeyBindingId,
      };
    }),
    labels: [],
    loops: [],
    finalizers: [],
    generator,
    initializesInstanceElements,
    nextValue: 0,
    pendingLabels: [],
    specialization,
    strictCode: strict,
  };
  // A base constructor initializes its class's fields before its body
  // runs, which is where [[Construct]] performs InitializeInstanceElements
  // for it; a derived one waits for the receiver `super()` produces.
  if (initializesInstanceElements && derivedThisBindingId == null) {
    lowerInstanceElementsInit(lowerReceiver(range, builder), range, builder);
  }
  let generatorBodyStart: number | undefined;
  let returned = false;
  if (generator && generatorCallStatementCount > 0) {
    returned = lowerStatements(
      body.slice(0, generatorCallStatementCount),
      builder,
    );
    if (!returned) {
      const bodyStart = createMirBlock(builder);
      builder.current.terminator = {
        kind: "jump",
        target: bodyStart.id,
      };
      builder.current = bodyStart;
      generatorBodyStart = bodyStart.id;
      returned = lowerStatements(
        body.slice(generatorCallStatementCount),
        builder,
      );
    }
  } else {
    returned = lowerStatements(body, builder);
  }
  if (!returned) {
    const value = lowerSyntheticUndefined(range, builder);
    builder.current.terminator = { kind: "return", value };
  }
  if (derivedThisBindingId != null) {
    routeDerivedReturns(builder.blocks, derivedThisBindingId, builder, range);
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
      ...includePropertiesWhen(() => {
        if (!(parameter.rest === true)) return undefined;
        return {
          rest: true as const,
        };
      }),
    }),
  );
  return {
    ...includePropertiesWhen(() => {
      if (argumentsBindingId == null) return undefined;
      return {
        argumentsBindingId,
      };
    }),
    ...includePropertiesWhen(() => {
      if (!argumentsMapped) return undefined;
      return {
        argumentsMapped: true as const,
      };
    }),
    blocks: builder.blocks.map((block) => ({
      id: block.id,
      operations: block.operations,
      ...includePropertiesWhen(() => {
        if (block.parameters == null) return undefined;
        return {
          parameters: block.parameters,
        };
      }),
      terminator: block.terminator ?? { kind: "unreachable" },
    })),
    ...includePropertiesWhen(() => {
      if (!asyncGenerator) return undefined;
      return {
        asyncGenerator: true as const,
      };
    }),
    ...includePropertiesWhen(() => {
      if (!asyncFunction) return undefined;
      return {
        asyncFunction: true as const,
      };
    }),
    ...includePropertiesWhen(() => {
      if (derivedThisBindingId == null) return undefined;
      return {
        derivedThisBindingId,
      };
    }),
    functionLength,
    ...includePropertiesWhen(() => {
      if (!generator) return undefined;
      return { generator: true as const };
    }),
    ...includePropertiesWhen(() => {
      if (generatorBodyStart == null) return undefined;
      return {
        generatorBodyStart,
      };
    }),
    id,
    kind: "mir-function",
    localBindingIds: [...localBindingIds],
    name,
    parameterCount: parameters.length,
    parameters: mirParameters,
    range,
    rootSlotCount: builder.nextValue + parameters.length + 1,
    strict,
    ...includePropertiesWhen(() => {
      if (selfBindingId == null) return undefined;
      return {
        selfBindingId,
      };
    }),
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
      : statement.kind === "binding-pattern" &&
          statement.mode === "declare" &&
          statement.declarationKind !== "var"
        ? hirBindingIdentifiers(statement.pattern).map((binding) => ({
            id: binding.bindingId,
            name: binding.name,
          }))
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
  // Every global-object property names a script binding, so the entries
  // stay inside the script environment the backend already creates.
  const globalObjectBindings = (program.globalObjectBindings ?? []).map(
    (binding): MirGlobalObjectBinding => ({
      declaration: binding.declaration,
      id: binding.id,
      name: binding.name,
      range: binding.range,
    }),
  );
  return {
    functions: program.functions.map((functionValue) => {
      const generic = buildMirFunction(
        functionValue.id,
        functionValue.name,
        functionValue.body,
        functionValue.parameters,
        functionValue.functionLength,
        functionValue.localBindingIds,
        functionValue.selfBindingId,
        functionValue.range,
        specialization,
        functionValue.strict === true,
        functionValue.functionKind === "generator" ||
          functionValue.functionKind === "async-generator" ||
          functionValue.functionKind === "async" ||
          functionValue.functionKind === "async-arrow",
        functionValue.derivedThisBindingId,
        functionValue.initializesInstanceElements === true,
        functionValue.fieldKeyBindingId,
        functionValue.functionKind === "async-generator",
        functionValue.functionKind === "async" ||
          functionValue.functionKind === "async-arrow",
        functionValue.argumentsBindingId,
        functionValue.generatorCallStatementCount,
        functionValue.argumentsMapped === true,
      );
      return specialization === "enabled"
        ? specializeAddition(generic, functionValue)
        : generic;
    }),
    globalBindings,
    globalLexicalNames: program.globalLexicalNames ?? [],
    globalObjectBindings,
    kind: "mir-program",
    observeSpecialization: options.observeSpecialization ?? false,
    script: buildMirFunction(
      -1,
      "<script>",
      program.body,
      [],
      0,
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
