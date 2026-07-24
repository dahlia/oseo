import type { HirExpression, HirFunction, HirParameter } from "./hir.ts";
import type { MirBlock, MirFunction, MirHint, MirOperation } from "./mir.ts";
import type { Hint } from "./syntax.ts";

function maximumMirValue(functionValue: MirFunction): number {
  let maximum = -1;
  for (const block of functionValue.blocks) {
    for (const operation of block.operations) {
      maximum = Math.max(maximum, operation.id);
      if (operation.checkedResult != null) {
        maximum = Math.max(maximum, operation.checkedResult);
      }
      if (operation.argumentListId != null) {
        maximum = Math.max(maximum, operation.argumentListId);
      }
      if (operation.iteratorNextMethodResult != null) {
        maximum = Math.max(maximum, operation.iteratorNextMethodResult);
      }
      if (operation.iteratorDoneState != null) {
        maximum = Math.max(maximum, operation.iteratorDoneState);
      }
      if (operation.iteratorValueResult != null) {
        maximum = Math.max(maximum, operation.iteratorValueResult);
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

export function specializeAddition(
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
