import { specializeAddition } from "./mir-specialize.ts";
import type {
  HirArrayBindingPattern,
  HirArraySpreadElement,
  HirBindingIdentifier,
  HirBindingPattern,
  HirCallArgument,
  HirExpression,
  HirForDeclaration,
  HirForOfTarget,
  HirObjectBindingPattern,
  HirParameter,
  HirProgram,
  HirSpreadArgument,
  HirStatement,
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
): { readonly ids: readonly number[]; readonly list?: number } {
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
    ...(expression.functionNameBinding === true
      ? { functionNameBinding: true }
      : {}),
    ...(expression.importedBinding === true ? { importedBinding: true } : {}),
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
    arguments: [object, key],
    detail: "property-get",
    id,
    kind: "property-get",
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

function lowerPropertyWrite(
  object: number,
  key: number,
  value: number,
  range: SourceRange,
  builder: MirBuilder,
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
    arguments: [object, key, value],
    detail: "property-set",
    id,
    kind: "property-set",
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
    detail: "+",
    id: numeric,
    kind: "unary",
    operator: "+",
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
  const one = lowerExpression({ kind: "number", range, value: 1 }, builder);
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
 * A throw resumption cannot reach a body in this profile, because
 * `%GeneratorPrototype%.throw` is not admitted, so no branch reads the
 * inner iterator's `throw` method.
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
  const suspendBlock = createMirBlock(builder);
  const resumeBlock = createMirBlock(builder);
  const returnResumeBlock = createMirBlock(builder);
  const returnStepBlock = createMirBlock(builder);
  const returnYieldBlock = createMirBlock(builder);
  const returnExitBlock = createMirBlock(builder);
  const exitBlock = createMirBlock(builder);
  // A `branch` carries no argument list, so each side of a step reaches
  // the shared suspension through a jump that passes the yielded value.
  const received = builder.nextValue;
  builder.nextValue += 1;
  stepBlock.parameters = [received];
  const returnReceived = builder.nextValue;
  builder.nextValue += 1;
  returnStepBlock.parameters = [returnReceived];
  const yielded = builder.nextValue;
  builder.nextValue += 1;
  suspendBlock.parameters = [yielded];

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
    whenFalse: exitBlock.id,
    whenTrue: stepYieldBlock.id,
  };

  builder.current = stepYieldBlock;
  builder.current.terminator = {
    kind: "jump",
    target: suspendBlock.id,
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
  return recordRoot(builder, stepResult, range);
}

function lowerExpression(
  expression: HirExpression,
  builder: MirBuilder,
  inferredFunctionName?: number,
  accessorNamePrefix?: "get" | "set",
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
      ...(accessorNamePrefix == null
        ? {}
        : { accessorKind: accessorNamePrefix }),
      arguments: inferredFunctionName == null ? [] : [inferredFunctionName],
      detail:
        `function @f${expression.functionId} ` +
        `name=${JSON.stringify(expression.name)} ` +
        `length=${expression.functionLength}`,
      functionId: expression.functionId,
      functionKind: expression.functionKind,
      functionLength: expression.functionLength,
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
      return lowerYieldDelegation(
        expression.argument,
        expression.range,
        builder,
      );
    }
    const value =
      expression.argument == null
        ? lowerSyntheticUndefined(expression.range, builder)
        : lowerExpression(expression.argument, builder);
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
    builder.current.terminator = {
      kind: "generator-yield",
      resume: resume.id,
      returnResume: returnResume.id,
      sent,
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
      const key = lowerPropertyKey(property.key, builder);
      const value = lowerExpression(
        property.value,
        builder,
        property.value.kind === "function" && property.value.name === ""
          ? key
          : undefined,
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
  if (expression.kind === "property-update") {
    const object = lowerExpression(expression.object, builder);
    const keyInput = lowerExpression(expression.key, builder);
    const readKey = convertPropertyKey(keyInput, expression.key.range, builder);
    const current = lowerPropertyRead(
      object,
      readKey,
      expression.range,
      builder,
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
        return lowerPropertyWrite(
          object,
          writeKey,
          value,
          expression.range,
          builder,
        );
      },
      expression.range,
      builder,
    );
  }
  if (expression.kind === "property-step") {
    const objectInput = lowerExpression(expression.object, builder);
    const keyInput = lowerExpression(expression.key, builder);
    const object = lowerObjectCoercible(
      objectInput,
      expression.object.range,
      builder,
    );
    const readKey = convertPropertyKey(keyInput, expression.key.range, builder);
    const current = lowerPropertyRead(
      object,
      readKey,
      expression.range,
      builder,
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
        return lowerPropertyWrite(
          object,
          writeKey,
          value,
          expression.range,
          builder,
        );
      },
      expression.range,
      builder,
    );
  }
  if (expression.kind === "promise-construct") {
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    const argumentIds = [...lowered.ids];
    if (lowered.list == null && argumentIds.length === 0) {
      argumentIds.push(lowerSyntheticUndefined(expression.range, builder));
    }
    const safepointArguments =
      lowered.list == null ? argumentIds : [...argumentIds, lowered.list];
    appendMirMetadata(
      builder,
      "safepoint",
      "Promise constructor",
      safepointArguments,
      expression.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      ...(lowered.list == null ? {} : { argumentListId: lowered.list }),
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
      ...(lowered.list == null ? {} : { argumentListId: lowered.list }),
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
  } else if (expression.target.kind === "object-intrinsic") {
    const lowered = lowerCallArguments(
      expression.arguments,
      expression.range,
      builder,
    );
    callArguments = [...lowered.ids];
    argumentListId = lowered.list;
    callTarget = {
      kind: "object-intrinsic",
      method: expression.target.method,
    };
    detail = `Object.${expression.target.method}`;
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
    ...(argumentListId == null ? {} : { argumentListId }),
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
      ...(target == null ? {} : { completionTarget: target }),
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
    for (const binding of hirBindingIdentifiers(statement.handler.pattern)) {
      resetBinding(binding.bindingId, binding.name, binding.range, builder);
    }
    const caught = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [],
      detail: "catch parameter",
      id: caught,
      kind: "caught",
      completionSlot: catchBlock.id,
      range: statement.handler.range,
    });
    recordRoot(builder, caught, statement.handler.range);
    const catchAbrupt = finallyTarget ?? outerAbrupt;
    if (catchAbrupt != null) builder.abruptTargets.push(catchAbrupt);
    if (finallyTarget != null) builder.finalizers.push(finallyTarget);
    lowerBindingTarget(
      statement.handler.pattern,
      caught,
      "initialize",
      builder,
    );
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

function lowerForOfTarget(
  target: HirForOfTarget,
  value: number,
  builder: MirBuilder,
): void {
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
  if (target.kind === "binding" || target.kind === "declaration") {
    appendMirMetadata(
      builder,
      "safepoint",
      "for-of binding assignment error",
      [value],
      target.range,
    );
    const id = builder.nextValue;
    builder.nextValue += 1;
    builder.current.operations.push({
      arguments: [value],
      bindingId: target.bindingId,
      detail: `%b${target.bindingId} ${target.name}`,
      ...(target.kind === "binding" && target.functionNameBinding === true
        ? { functionNameBinding: true }
        : {}),
      ...(target.kind === "binding" && target.importedBinding === true
        ? { importedBinding: true }
        : {}),
      id,
      kind: "write",
      mutable: target.mutable,
      range: target.range,
    });
    appendMirMetadata(
      builder,
      "check-status",
      "normal -> continue, abrupt -> close iterator",
      [id],
      target.range,
    );
    recordRoot(builder, id, target.range);
    return;
  }
  const object = lowerExpression(target.object, builder);
  const key = lowerPropertyKey(target.key, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "for-of property storage growth",
    [object, key, value],
    target.range,
  );
  const id = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [object, key, value],
    detail: "for-of property target",
    id,
    kind: "property-set",
    range: target.range,
  });
  appendMirMetadata(
    builder,
    "check-status",
    "normal -> continue, abrupt -> close iterator",
    [id],
    target.range,
  );
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
  const iterable = lowerExpression(statement.iterable, builder);
  appendMirMetadata(
    builder,
    "safepoint",
    "get synchronous iterator",
    [iterable],
    statement.iterable.range,
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
    "step synchronous iterator",
    [iterator, nextMethod],
    statement.range,
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
  lowerForOfTarget(statement.target, value, builder);
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
    "close synchronous iterator",
    [iterator],
    statement.range,
  );
  const closed = builder.nextValue;
  builder.nextValue += 1;
  builder.current.operations.push({
    arguments: [iterator],
    completionSlot: closeBlock.id,
    detail: "IteratorClose",
    id: closed,
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
  builder.current.terminator = {
    completionSlot: closeBlock.id,
    kind: "resume-completion",
    ...(outerAbrupt == null ? {} : { outerAbrupt }),
    ...(outerFinalizer == null ? {} : { outerFinalizer }),
  };

  builder.current = exitBlock;
  appendMirMetadata(
    builder,
    "join",
    `for-of bb${stepBlock.id}`,
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
): { readonly hasValue: number; readonly value: number } {
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
    if (reference == null) {
      throw new Error("Assignment member target was not prepared.");
    }
    const prepared = reference;
    const object = lowerObjectCoercible(
      prepared.object,
      pattern.object.range,
      builder,
    );
    const key = convertPropertyKey(prepared.key, pattern.key.range, builder);
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
      arguments: [object, key, value],
      detail: "destructuring member target",
      id,
      kind: "property-set",
      range: pattern.range,
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
  if (pattern.kind === "array-binding-pattern") {
    lowerArrayBindingPattern(pattern, value, mode, builder);
    return;
  }
  if (pattern.kind === "object-binding-pattern") {
    lowerObjectBindingPattern(pattern, value, mode, builder);
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
    ...(pattern.functionNameBinding === true
      ? { functionNameBinding: true }
      : {}),
    ...(pattern.importedBinding === true ? { importedBinding: true } : {}),
    id,
    kind: mode === "write" ? "write" : "initialize",
    ...(mode === "write" ? { mutable: pattern.mutable } : {}),
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

interface LoweredAssignmentReference {
  readonly key: number;
  readonly object: number;
}

function lowerAssignmentReference(
  pattern: HirBindingPattern,
  mode: BindingPatternMode,
  builder: MirBuilder,
): LoweredAssignmentReference | undefined {
  if (pattern.kind !== "assignment-member" || mode !== "write") {
    return undefined;
  }
  const object = lowerExpression(pattern.object, builder);
  const key = lowerExpression(pattern.key, builder);
  return { key, object };
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
    ...(outerAbrupt == null ? {} : { outerAbrupt }),
    ...(outerFinalizer == null ? {} : { outerFinalizer }),
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
      setCompletion(
        builder,
        "throw",
        target?.blockId ?? 0,
        statement.range,
        value,
      );
      builder.current.terminator =
        target == null
          ? { completionSlot: 0, kind: "resume-completion" }
          : { kind: "jump", target: target.blockId };
      return true;
    } else if (statement.kind === "try") {
      if (lowerTryStatement(statement, builder)) return true;
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
    labels: [],
    loops: [],
    finalizers: [],
    generator,
    nextValue: 0,
    pendingLabels: [],
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
      ...(parameter.rest === true ? { rest: true as const } : {}),
    }),
  );
  return {
    blocks: builder.blocks.map((block) => ({
      id: block.id,
      operations: block.operations,
      ...(block.parameters == null ? {} : { parameters: block.parameters }),
      terminator: block.terminator ?? { kind: "unreachable" },
    })),
    functionLength,
    ...(generator ? { generator: true as const } : {}),
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
        functionValue.functionKind === "generator",
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
