import type {
  BinaryOperator,
  MirBlock,
  MirConstant,
  MirFunction,
  MirGlobalBinding,
  MirOperation,
  MirProgram,
  MirTerminator,
  NativeBackend,
  SourceRange,
} from "@oseo/compiler";

import { emittedC as emittedCSource, type CFragment } from "./emitted-c.ts";

type CInterpolation = boolean | number | string;

type NormalizedCFragment<Fragment extends CFragment> = {
  readonly [Index in keyof Fragment]: string;
};

type CFragmentGroup = Readonly<Record<string, CFragment>>;
type CFragmentCatalog = Readonly<Record<string, CFragmentGroup>>;

type NormalizeCFragment<Value> = Value extends CFragment
  ? NormalizedCFragment<Value>
  : never;

type NormalizedCCatalog<Catalog extends CFragmentCatalog> = {
  readonly [Group in keyof Catalog]: {
    readonly [Name in keyof Catalog[Group]]: NormalizeCFragment<
      Catalog[Group][Name]
    >;
  };
};

function normalizeCCatalog<const Catalog extends CFragmentCatalog>(
  catalog: Catalog,
): NormalizedCCatalog<Catalog> {
  const normalized: Record<string, Record<string, readonly string[]>> = {};
  for (const [groupName, group] of Object.entries(catalog)) {
    const normalizedGroup: Record<string, readonly string[]> = {};
    for (const [fragmentName, fragment] of Object.entries(group)) {
      normalizedGroup[fragmentName] = fragment.map((segment) =>
        segment.join(""),
      );
    }
    normalized[groupName] = normalizedGroup;
  }
  return normalized as NormalizedCCatalog<Catalog>;
}

const emittedC = normalizeCCatalog(emittedCSource);

type RenderedCFragment = readonly [string, ...string[]];

type CInterpolationValues<Fragment extends RenderedCFragment> =
  Fragment extends readonly [string, ...infer Rest]
    ? { [Index in keyof Rest]: CInterpolation }
    : never;

function renderC<const Fragment extends RenderedCFragment>(
  segments: Fragment,
  ...values: CInterpolationValues<Fragment>
): string {
  if (segments.length !== values.length + 1) {
    throw new Error(
      `C fragment needs ${segments.length - 1} values, got ` +
        `${values.length}.`,
    );
  }
  if (values.length === 0) return segments[0] ?? "";
  let result = "";
  for (let index = 0; index < values.length; index += 1) {
    result += segments[index] ?? "";
    result += String(values[index]);
  }
  result += segments.at(-1) ?? "";
  return result;
}

interface EmitState {
  readonly argumentSlotStart: number;
  readonly completionSlotStart: number;
  readonly derivedThisBindingId?: number;
  readonly functionId: number;
  readonly functionRootCounts: ReadonlyMap<number, number>;
  readonly lines: string[];
  readonly environmentSlot: number;
  /**
   * Bindings the global object also exposes as properties. Their
   * assignment path is the one ECMA-262 gives an object environment
   * record binding, so it can fail on a non-writable property where an
   * ordinary declarative binding never can.
   */
  readonly globalObjectBindingIds: ReadonlySet<number>;
  readonly blockParameters: ReadonlyMap<number, readonly number[]>;
  readonly scalarKinds: Map<number, "boolean" | "smi">;
  readonly strict: boolean;
  readonly observeSpecialization: boolean;
  /**
   * True while emitting a generator body. Its root slots belong to the
   * generator record rather than a native frame, so leaving the function
   * must not release a frame that the suspended state still owns.
   */
  readonly generator: boolean;
  /** Call-time generator blocks return before entering this body block. */
  readonly generatorBodyStart?: number;
  nextRecursiveTarget: number;
  usesAbrupt: boolean;
  usesCompletion: boolean;
}

/** Leave a generated function with a normal completion. */
function emitNormalReturn(state: EmitState, value: string, indent = ""): void {
  line(
    state,
    renderC(
      emittedC.normalReturn.resultAssignOseoResultOseoStatusNormal,
      indent,
      value,
    ),
  );
  if (!state.generator) {
    line(state, renderC(emittedC.normalReturn.releaseRoots, indent));
  }
  line(state, renderC(emittedC.normalReturn.returnResult, indent));
}

function escapeCString(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === "\\") result += renderC(emittedC.cString.backslashEscape);
    else if (character === '"') result += renderC(emittedC.cString.quoteEscape);
    else if (character === "?")
      result += renderC(emittedC.cString.questionMarkEscape);
    else if (character === "\n")
      result += renderC(emittedC.cString.newlineEscape);
    else if (codePoint != null && codePoint >= 0x20 && codePoint <= 0x7e) {
      result += character;
    } else if (codePoint != null) {
      const bytes = new TextEncoder().encode(character);
      for (const byte of bytes) {
        result += renderC(
          emittedC.cString.octalEscape,
          byte.toString(8).padStart(3, renderC(emittedC.cString.octalPadding)),
        );
      }
    }
  }
  return result;
}

function line(state: EmitState, source: string): void {
  state.lines.push(renderC(emittedC.line.indentLine, source));
}

function location(state: EmitState, range: SourceRange): void {
  if (range.sourceId != null) {
    const sourceId = escapeCString(range.sourceId);
    const length = new TextEncoder().encode(range.sourceId).length;
    line(
      state,
      renderC(emittedC.location.sourceLocationPrefix, sourceId, length) +
        renderC(
          emittedC.common.sourcePositionSuffix,
          range.start.line,
          range.start.column,
        ),
    );
    return;
  }
  line(
    state,
    renderC(emittedC.location.locationPrefix, range.start.line) +
      renderC(emittedC.common.positionSuffix, range.start.column),
  );
}

function operationArgument(operation: MirOperation, index: number): number {
  const value = operation.arguments[index];
  if (value == null) {
    throw new Error(
      `MIR ${operation.kind} operation %${operation.id} is missing ` +
        `argument ${index}.`,
    );
  }
  return value;
}

function operatorHelper(operator: BinaryOperator): string {
  const helpers: Readonly<Record<BinaryOperator, string>> = {
    "!=": renderC(emittedC.operatorHelper.oseoNotLooseEqual),
    "!==": renderC(emittedC.operatorHelper.oseoNotStrictEqual),
    "%": renderC(emittedC.operatorHelper.oseoRemainder),
    "&": renderC(emittedC.operatorHelper.oseoBitwiseAnd),
    "*": renderC(emittedC.operatorHelper.oseoMultiply),
    "**": renderC(emittedC.operatorHelper.oseoExponentiate),
    "+": renderC(emittedC.operatorHelper.oseoAdd),
    "-": renderC(emittedC.operatorHelper.oseoSubtract),
    "/": renderC(emittedC.operatorHelper.oseoDivide),
    "<": renderC(emittedC.operatorHelper.oseoLessThan),
    "<<": renderC(emittedC.operatorHelper.oseoShiftLeft),
    "<=": renderC(emittedC.operatorHelper.oseoLessEqual),
    "==": renderC(emittedC.operatorHelper.oseoLooseEqual),
    "===": renderC(emittedC.operatorHelper.oseoStrictEqual),
    ">": renderC(emittedC.operatorHelper.oseoGreaterThan),
    ">=": renderC(emittedC.operatorHelper.oseoGreaterEqual),
    ">>": renderC(emittedC.operatorHelper.oseoShiftRight),
    ">>>": renderC(emittedC.operatorHelper.oseoShiftRightUnsigned),
    "^": renderC(emittedC.operatorHelper.oseoBitwiseXor),
    in: renderC(emittedC.operatorHelper.oseoHasProperty),
    instanceof: renderC(emittedC.operatorHelper.oseoInstanceof),
    "|": renderC(emittedC.operatorHelper.oseoBitwiseOr),
  };
  return helpers[operator];
}

function numberLiteral(value: number): string {
  if (Number.isNaN(value)) return renderC(emittedC.numberLiteral.nan);
  if (value === Infinity)
    return renderC(emittedC.numberLiteral.positiveInfinity);
  if (value === -Infinity)
    return renderC(emittedC.numberLiteral.negativeInfinity);
  if (Object.is(value, -0)) return renderC(emittedC.numberLiteral.negativeZero);
  const text = value.toString();
  if (Number.isInteger(value) && !text.includes("e"))
    return renderC(emittedC.numberLiteral.integerAsDouble, text);
  return text;
}

function utf16Units(value: string): readonly number[] {
  const units: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    units.push(value.charCodeAt(index));
  }
  return units;
}

function emitStringConstant(
  state: EmitState,
  operation: MirOperation,
  value: string,
): void {
  const units = utf16Units(value);
  let input = renderC(emittedC.stringConstant.nullU);
  if (units.length > 0) {
    const name = renderC(emittedC.stringConstant.stringUnits, operation.id);
    line(
      state,
      renderC(
        emittedC.common.staticConstUint16TAssignStatement,
        name,
        units.join(renderC(emittedC.common.commaSpace)),
      ),
    );
    input = renderC(
      emittedC.stringConstant.unitsWithLength,
      name,
      units.length,
    );
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.stringConstant.resultAssignOseoStringFromUnitsContext,
      input,
    ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitConstant(
  state: EmitState,
  operation: MirOperation,
  constant: MirConstant,
): void {
  if (constant.kind === "string") {
    emitStringConstant(state, operation, constant.value);
  } else if (constant.kind === "bigint") {
    const digitPatterns = {
      2: /^[01]+$/u,
      8: /^[0-7]+$/u,
      10: /^[0-9]+$/u,
      16: /^[0-9a-f]+$/u,
    } as const;
    if (!digitPatterns[constant.radix].test(constant.digits)) {
      throw new Error(
        `MIR constant %${operation.id} has invalid BigInt digits.`,
      );
    }
    location(state, operation.range);
    state.usesAbrupt = true;
    line(
      state,
      renderC(
        emittedC.constant.resultAssignBigIntLiteral,
        constant.digits,
        constant.radix,
      ),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
  } else if (constant.kind === "undefined") {
    line(
      state,
      renderC(emittedC.common.rootsAssignOseoUndefinedStatement, operation.id),
    );
  } else if (constant.kind === "null") {
    line(
      state,
      renderC(emittedC.constant.rootsAssignOseoNullStatement, operation.id),
    );
  } else if (constant.kind === "boolean") {
    const value = constant.value
      ? renderC(emittedC.common.trueValue)
      : renderC(emittedC.common.falseValue);
    line(
      state,
      renderC(
        emittedC.common.rootsAssignOseoBooleanStatement,
        operation.id,
        value,
      ),
    );
  } else {
    const value = numberLiteral(constant.value);
    line(
      state,
      renderC(
        emittedC.constant.rootsAssignOseoNumberStatement,
        operation.id,
        value,
      ),
    );
  }
}

function emitTemplateObject(state: EmitState, operation: MirOperation): void {
  const cooked = operation.templateCooked;
  const raw = operation.templateRaw;
  if (
    cooked == null ||
    raw == null ||
    cooked.length === 0 ||
    cooked.length !== raw.length
  ) {
    throw new Error(
      `MIR template-object %${operation.id} has invalid strings.`,
    );
  }
  const suffix = String(operation.id);
  const site = `template_site_${suffix}`;
  const cookedPointers = `template_cooked_${suffix}`;
  const cookedLengths = `template_cooked_lengths_${suffix}`;
  const cookedDefined = `template_cooked_defined_${suffix}`;
  const rawPointers = `template_raw_${suffix}`;
  const rawLengths = `template_raw_lengths_${suffix}`;
  const cookedInputs: string[] = [];
  const rawInputs: string[] = [];
  const emitUnits = (
    kind: "cooked" | "raw",
    value: string,
    index: number,
  ): string => {
    const units = utf16Units(value);
    if (units.length === 0) return renderC(emittedC.common.nullPointer);
    const name = `template_${kind}_units_${suffix}_${index}`;
    line(
      state,
      renderC(
        emittedC.common.staticConstUint16TAssignStatement,
        name,
        units.join(renderC(emittedC.common.commaSpace)),
      ),
    );
    return name;
  };
  for (let index = 0; index < cooked.length; index += 1) {
    const cookedPiece = cooked[index];
    cookedInputs.push(
      cookedPiece == null
        ? renderC(emittedC.common.nullPointer)
        : emitUnits("cooked", cookedPiece, index),
    );
    rawInputs.push(emitUnits("raw", raw[index]!, index));
  }
  const comma = renderC(emittedC.common.commaSpace);
  line(state, renderC(emittedC.templateObject.siteDeclaration, site));
  line(
    state,
    renderC(
      emittedC.templateObject.pointerArrayDeclaration,
      cookedPointers,
      cookedInputs.join(comma),
    ),
  );
  line(
    state,
    renderC(
      emittedC.templateObject.sizeArrayDeclaration,
      cookedLengths,
      cooked.map((piece) => `${piece?.length ?? 0}u`).join(comma),
    ),
  );
  line(
    state,
    renderC(
      emittedC.templateObject.boolArrayDeclaration,
      cookedDefined,
      cooked
        .map((piece) =>
          piece == null
            ? renderC(emittedC.common.falseValue)
            : renderC(emittedC.common.trueValue),
        )
        .join(comma),
    ),
  );
  line(
    state,
    renderC(
      emittedC.templateObject.pointerArrayDeclaration,
      rawPointers,
      rawInputs.join(comma),
    ),
  );
  line(
    state,
    renderC(
      emittedC.templateObject.sizeArrayDeclaration,
      rawLengths,
      raw.map((piece) => `${piece.length}u`).join(comma),
    ),
  );
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.templateObject.resultAssign,
      site,
      cooked.length,
      cookedPointers,
      cookedLengths,
      cookedDefined,
      rawPointers,
      rawLengths,
    ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitArguments(
  state: EmitState,
  operation: MirOperation,
): { readonly count: string; readonly name: string } {
  if (operation.argumentListId != null) {
    const count = renderC(emittedC.arguments.argumentCount, operation.id);
    const name = renderC(emittedC.arguments.argumentValues, operation.id);
    line(state, renderC(emittedC.arguments.sizeTAssignUStatement, count));
    line(
      state,
      renderC(
        emittedC.arguments.constOseoValuePointerAssignNullStatement,
        name,
      ),
    );
    line(
      state,
      renderC(emittedC.arguments.resultAssignOseoArgumentListViewContext) +
        renderC(
          emittedC.arguments.rootsAddressAddressStatement,
          operation.argumentListId,
          count,
          name,
        ),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    return { count, name };
  }
  if (operation.arguments.length === 0) {
    return {
      count: renderC(emittedC.arguments.zeroUnsigned),
      name: renderC(emittedC.common.nullPointer),
    };
  }
  for (let index = 0; index < operation.arguments.length; index += 1) {
    const value = operationArgument(operation, index);
    line(
      state,
      renderC(
        emittedC.common.rootAssignRoot,
        state.argumentSlotStart + index,
        value,
      ),
    );
  }
  return {
    count: renderC(
      emittedC.arguments.unsignedCount,
      operation.arguments.length,
    ),
    name: renderC(emittedC.arguments.addressOfRoot, state.argumentSlotStart),
  };
}

function emittedArgument(
  operation: MirOperation,
  emitted: { readonly count: string; readonly name: string },
  index: number,
): string {
  if (operation.argumentListId != null) {
    return (
      renderC(emittedC.argument.boundedArgumentCount, emitted.count, index) +
      renderC(emittedC.argument.oseoUndefined, emitted.name, index)
    );
  }
  const value = operation.arguments[index];
  return value == null
    ? renderC(emittedC.common.undefinedValue)
    : renderC(emittedC.common.root, value);
}

function emitRead(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR read %${operation.id} has no bound value.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
      renderC(
        emittedC.common.rootsUStatement,
        state.environmentSlot,
        bindingId,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  line(state, renderC(emittedC.read.resultAssignOseoCellGetContextResultValue));
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitWrite(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR write %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  line(state, renderC(emittedC.common.rootAssignRoot, operation.id, value));
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.mutable === false) {
    if (operation.functionNameBinding === true && !state.strict) {
      line(
        state,
        renderC(emittedC.write.resultAssignOseoResultOseoStatusNormal, value),
      );
      return;
    }
    if (operation.importedBinding === true) {
      line(
        state,
        renderC(emittedC.write.resultAssignOseoWriteImmutableBinding),
      );
      return;
    }
    line(
      state,
      renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
        renderC(
          emittedC.common.rootsUStatement,
          state.environmentSlot,
          bindingId,
        ),
    );
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(
      state,
      renderC(emittedC.write.resultAssignOseoCellGetContextResultValue),
    );
    line(state, renderC(emittedC.common.closeBlock));
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(state, renderC(emittedC.write.indentedWriteImmutableBinding));
    line(state, renderC(emittedC.common.closeBlock));
    return;
  }
  line(
    state,
    renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
      renderC(
        emittedC.common.rootsUStatement,
        state.environmentSlot,
        bindingId,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  if (state.globalObjectBindingIds.has(bindingId)) {
    // The global object exposes this binding as a property, so the
    // runtime owns the [[Writable]] check the property carries and the
    // assignment strictness ECMA-262 takes from this code.
    line(
      state,
      renderC(
        emittedC.write.resultAssignOseoGlobalBindingSet,
        value,
        state.strict
          ? renderC(emittedC.common.trueValue)
          : renderC(emittedC.common.falseValue),
      ),
    );
    return;
  }
  line(
    state,
    renderC(emittedC.write.resultAssignOseoCellSetContextResultValue, value),
  );
}

function emitInitialize(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR initialize %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  line(state, renderC(emittedC.common.rootAssignRoot, operation.id, value));
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
      renderC(
        emittedC.common.rootsUStatement,
        state.environmentSlot,
        bindingId,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  line(
    state,
    renderC(emittedC.initialize.resultAssignOseoCellInitializeContext, value),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
}

function emitBindingReset(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR binding-reset %${operation.id} has no identity.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, renderC(emittedC.common.resultAssignOseoCellCreateContextOseo));
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
  line(state, renderC(emittedC.common.statusNormalOpen));
  line(
    state,
    renderC(emittedC.bindingReset.resultAssignOseoEnvironmentSetContext) +
      renderC(emittedC.common.rootsU, state.environmentSlot, bindingId) +
      renderC(emittedC.common.rootCallSuffix, operation.id),
  );
  line(state, renderC(emittedC.common.closeBlock));
}

function emitUnary(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  if (operation.operator === "!") {
    line(
      state,
      renderC(emittedC.common.rootsAssign, operation.id) +
        renderC(
          emittedC.unary.oseoBooleanOseoToBooleanRootsStatement,
          argument,
        ),
    );
    return;
  }
  if (operation.operator === "void") {
    line(
      state,
      renderC(emittedC.common.rootsAssignOseoUndefinedStatement, operation.id),
    );
    return;
  }
  const helpers = {
    "+": renderC(emittedC.common.unaryToNumber),
    "-": renderC(emittedC.common.unaryNegate),
    "numeric-one": renderC(emittedC.common.unaryNumericOne),
    "to-numeric": renderC(emittedC.common.unaryToNumeric),
    "to-string": renderC(emittedC.common.unaryToString),
    typeof: renderC(emittedC.common.unaryTypeof),
    "~": renderC(emittedC.common.unaryBitwiseNot),
  } as const;
  const operator = operation.operator;
  if (operator == null || !(operator in helpers)) {
    throw new Error(`MIR unary %${operation.id} has no valid operator.`);
  }
  const helper = helpers[operator as keyof typeof helpers];
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.unary.resultAssignContextRootsStatement, helper, argument),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitBinary(state: EmitState, operation: MirOperation): void {
  const operator = operation.operator;
  if (
    operator == null ||
    operator === "!" ||
    operator === "numeric-one" ||
    operator === "to-numeric" ||
    operator === "to-string" ||
    operator === "typeof" ||
    operator === "void" ||
    operator === "~" ||
    ((operator === "-" || operator === "+") && operation.arguments.length !== 2)
  ) {
    throw new Error(`MIR binary %${operation.id} has no valid operator.`);
  }
  const left = operationArgument(operation, 0);
  const right = operationArgument(operation, 1);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.binary.resultAssign, operatorHelper(operator)) +
      renderC(emittedC.binary.contextRootsRootsStatement, left, right),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitGuardSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "boolean");
  line(
    state,
    renderC(
      emittedC.guardSmi.boolFastAssignOseoValueIsSmiRootsStatement,
      operation.id,
      argument,
    ),
  );
}

function emitUnboxSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "smi");
  line(
    state,
    renderC(emittedC.unboxSmi.int64TFastAssign, operation.id) +
      renderC(emittedC.unboxSmi.oseoValueUnboxSmiRootsStatement, argument),
  );
}

function emitCheckedAdd(state: EmitState, operation: MirOperation): void {
  const left = operationArgument(operation, 0);
  const right = operationArgument(operation, 1);
  const result = operation.checkedResult;
  if (
    result == null ||
    state.scalarKinds.get(left) !== "smi" ||
    state.scalarKinds.get(right) !== "smi"
  ) {
    throw new Error(`MIR checked add %${operation.id} has invalid inputs.`);
  }
  state.scalarKinds.set(operation.id, "boolean");
  state.scalarKinds.set(result, "smi");
  line(state, renderC(emittedC.checkedAdd.int64TFastStatement, result));
  line(
    state,
    renderC(emittedC.checkedAdd.boolFastAssignOseoSmiTryAdd, operation.id) +
      renderC(
        emittedC.checkedAdd.fastFastAddressFastStatement,
        left,
        right,
        result,
      ),
  );
}

function emitBoxSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  if (state.scalarKinds.get(argument) !== "smi") {
    throw new Error(`MIR box %${operation.id} has no small integer input.`);
  }
  line(
    state,
    renderC(
      emittedC.boxSmi.rootsAssignOseoValueBoxSmiFastStatement,
      operation.id,
      argument,
    ),
  );
}

/**
 * The C expression reading one iterator's done flag.
 *
 * A generator body may suspend while an iterator operation is still in
 * progress, and every resumption runs in a fresh C invocation, so an
 * automatic local would read indeterminate state. Such a body keeps the
 * flag in the root slot the MIR reserved for it instead.
 */
function iteratorDoneRead(state: EmitState, doneState: number): string {
  return state.generator
    ? renderC(emittedC.common.oseoToBooleanRoots, doneState)
    : renderC(emittedC.common.iteratorDone, doneState);
}

function emitIteratorOperation(
  state: EmitState,
  operation: MirOperation,
): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  // An asynchronous step reaches a distinct runtime entry point that
  // awaits its own result; the emitted control flow is otherwise the
  // synchronous protocol's, so only the called name changes.
  const asynchronous =
    operation.iteratorAsync === true
      ? renderC(emittedC.iteratorOperation.asyncPrefix)
      : renderC(emittedC.common.empty);
  if (operation.kind === "iterator-close-start") {
    const promise = operation.iteratorValueResult;
    const ignoreResult = operation.iteratorValueOnlyResult;
    const skipValidation = operation.iteratorCloseResultMode;
    const slot = operation.completionSlot;
    if (
      promise == null ||
      ignoreResult == null ||
      skipValidation == null ||
      slot == null
    ) {
      throw new Error(
        `MIR iterator close start %${operation.id} is incomplete.`,
      );
    }
    state.usesCompletion = true;
    state.scalarKinds.set(operation.id, "boolean");
    line(
      state,
      renderC(
        emittedC.iteratorOperation.rootsAssignCompletionKindThrowStatement,
        ignoreResult,
        slot,
      ),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation.boolIteratorCloseAwaitAssignFalseStatement,
        operation.id,
      ),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation
          .resultAssignOseoAsyncIteratorCloseStartContext,
        operationArgument(operation, 0),
        slot,
        skipValidation,
        operation.id,
      ),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, promise));
    line(
      state,
      renderC(
        emittedC.iteratorOperation.boolFastAssignIteratorCloseAwaitStatement,
        operation.id,
        operation.id,
      ),
    );
    line(state, renderC(emittedC.common.voidFastStatement, operation.id));
    return;
  }
  if (operation.kind === "iterator-close-result") {
    line(
      state,
      renderC(
        emittedC.iteratorOperation
          .resultAssignOseoAsyncIteratorCloseResultContext,
        operationArgument(operation, 0),
        operationArgument(operation, 1),
        operationArgument(operation, 2),
      ),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
    return;
  }
  if (operation.kind === "iterator-await-start") {
    const stepKind = operation.iteratorStepKind;
    const valueOnly = operation.iteratorValueOnlyResult;
    if (stepKind == null || valueOnly == null) {
      throw new Error(
        `MIR iterator await start %${operation.id} is incomplete.`,
      );
    }
    line(
      state,
      renderC(
        emittedC.iteratorOperation.rootsAssignOseoBooleanFalseStatement,
        valueOnly,
      ),
    );
    if (stepKind === "next") {
      line(
        state,
        renderC(
          emittedC.iteratorOperation
            .resultAssignOseoAsyncIteratorNextStartContext,
          operationArgument(operation, 0),
          operationArgument(operation, 1),
        ),
      );
    } else {
      const step =
        stepKind === "delegate-next"
          ? renderC(emittedC.common.iteratorDelegateNext)
          : stepKind === "delegate-return"
            ? renderC(emittedC.common.iteratorDelegateReturn)
            : renderC(emittedC.common.iteratorDelegateThrow);
      const iterator = operationArgument(operation, 0);
      const trailing =
        stepKind === "delegate-next"
          ? renderC(
              emittedC.iteratorOperation.rootsRootsAddressRootsStatementSuffix,
              operationArgument(operation, 1),
              operationArgument(operation, 2),
              valueOnly,
            )
          : renderC(
              emittedC.iteratorOperation.rootsAddressRootsStatementSuffix,
              operationArgument(operation, 1),
              valueOnly,
            );
      line(
        state,
        renderC(
          emittedC.iteratorOperation
            .resultAssignOseoAsyncIteratorDelegateStartContext,
          step,
          iterator,
        ) + trailing,
      );
    }
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
    return;
  }
  if (operation.kind === "iterator-await-result") {
    const value = operation.iteratorValueResult;
    if (value == null) {
      throw new Error(
        `MIR iterator await result %${operation.id} has no value.`,
      );
    }
    state.scalarKinds.set(operation.id, "boolean");
    line(
      state,
      renderC(
        emittedC.iteratorOperation.boolIteratorDoneAssignTrueStatement,
        operation.id,
      ),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation.resultAssignOseoAsyncIteratorResultContext,
        operationArgument(operation, 0),
        operationArgument(operation, 1),
        operation.iteratorValueWhenDone === true,
        operationArgument(operation, 2),
        operation.iteratorStepKind === "delegate-throw",
        value,
        operation.id,
      ),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation.boolFastAssignIteratorDoneStatement,
        operation.id,
        operation.id,
      ),
    );
    line(state, renderC(emittedC.common.voidFastStatement, operation.id));
    return;
  }
  if (operation.kind === "iterator-get") {
    const iterable = operationArgument(operation, 0);
    const nextMethod = operation.iteratorNextMethodResult;
    if (nextMethod == null) {
      throw new Error(`MIR iterator get %${operation.id} has no next method.`);
    }
    line(
      state,
      renderC(
        emittedC.iteratorOperation.resultAssignOseoIteratorGetContext,
        asynchronous,
      ) +
        renderC(
          emittedC.iteratorOperation.rootsAddressRootsStatement,
          iterable,
          nextMethod,
        ),
    );
    if (operation.iteratorDoneState != null) {
      const doneState = operation.iteratorDoneState;
      line(
        state,
        state.generator
          ? renderC(
              emittedC.iteratorOperation.rootsAssignOseoBooleanFalseStatement,
              doneState,
            )
          : renderC(
              emittedC.iteratorOperation.boolIteratorDoneAssignFalseStatement,
              doneState,
            ),
      );
    }
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
    return;
  }
  if (
    operation.kind === "iterator-delegate-next" ||
    operation.kind === "iterator-delegate-return" ||
    operation.kind === "iterator-delegate-throw"
  ) {
    // A delegating step reports the inner iterator's value even when the
    // result is done, because `yield*` reports that value as its own.
    const delegatingNext = operation.kind === "iterator-delegate-next";
    const step = delegatingNext
      ? renderC(emittedC.common.iteratorDelegateNext)
      : operation.kind === "iterator-delegate-return"
        ? renderC(emittedC.common.iteratorDelegateReturn)
        : renderC(emittedC.common.iteratorDelegateThrow);
    const value = operation.iteratorValueResult;
    if (value == null) {
      throw new Error(`MIR iterator delegation %${operation.id} has no value.`);
    }
    state.scalarKinds.set(operation.id, "boolean");
    const done = renderC(emittedC.common.iteratorDone, operation.id);
    const inner = delegatingNext
      ? renderC(
          emittedC.common.rootWithComma,
          operationArgument(operation, 1),
        ) + renderC(emittedC.common.root, operationArgument(operation, 2))
      : renderC(emittedC.common.root, operationArgument(operation, 1));
    line(
      state,
      renderC(emittedC.iteratorOperation.boolAssignTrueStatement, done),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation.resultAssignOseoIteratorDelegateContext,
        asynchronous,
        step,
      ) +
        renderC(
          emittedC.common.twoRootsWithComma,
          operationArgument(operation, 0),
          inner,
        ) +
        renderC(
          emittedC.iteratorOperation.addressRootsAddressStatement,
          value,
          done,
        ),
    );
    line(
      state,
      renderC(emittedC.common.boolFastAssignStatement, operation.id, done),
    );
    line(state, renderC(emittedC.common.voidFastStatement, operation.id));
    return;
  }
  if (operation.kind === "iterator-next") {
    const iterator = operationArgument(operation, 0);
    const nextMethod = operationArgument(operation, 1);
    const value = operation.iteratorValueResult;
    if (value == null) {
      throw new Error(`MIR iterator next %${operation.id} has no value.`);
    }
    state.scalarKinds.set(operation.id, "boolean");
    const doneState = operation.iteratorDoneState;
    if (doneState == null) {
      // A step with no tracked done state owns the flag for this operation
      // alone, so it never has to outlive the call that writes it.
      line(
        state,
        renderC(
          emittedC.iteratorOperation.boolIteratorDoneAssignTrueStatement,
          operation.id,
        ),
      );
      line(
        state,
        renderC(
          emittedC.iteratorOperation.resultAssignOseoIteratorNextContext,
          asynchronous,
        ) +
          renderC(
            emittedC.common.rootsRootsAddressRoots,
            iterator,
            nextMethod,
            value,
          ) +
          renderC(
            emittedC.iteratorOperation.addressIteratorDoneStatement,
            operation.id,
          ),
      );
      line(
        state,
        renderC(
          emittedC.iteratorOperation.boolFastAssignIteratorDoneStatement,
          operation.id,
          operation.id,
        ),
      );
      line(state, renderC(emittedC.common.voidFastStatement, operation.id));
      return;
    }
    // `oseo_iterator_next` writes the flag through a pointer, so a body that
    // keeps the state in a root slot steps a local copy and stores it back.
    const step = state.generator
      ? renderC(emittedC.iteratorOperation.iteratorStepDone, operation.id)
      : renderC(emittedC.common.iteratorDone, doneState);
    if (state.generator) {
      line(
        state,
        renderC(
          emittedC.iteratorOperation.boolAssignStatement,
          step,
          iteratorDoneRead(state, doneState),
        ),
      );
    }
    line(state, renderC(emittedC.common.ifOpen, step));
    line(
      state,
      renderC(emittedC.common.resultAssignOseoResultOseoStatusNormalOseo),
    );
    line(
      state,
      renderC(
        emittedC.iteratorOperation.rootsAssignOseoUndefinedStatement,
        value,
      ),
    );
    line(state, renderC(emittedC.common.elseOpen));
    line(
      state,
      renderC(emittedC.iteratorOperation.indentedIteratorNext, asynchronous) +
        renderC(
          emittedC.common.rootsRootsAddressRoots,
          iterator,
          nextMethod,
          value,
        ) +
        renderC(emittedC.common.addressStatement, step),
    );
    line(state, renderC(emittedC.common.closeBlock));
    if (state.generator) {
      line(
        state,
        renderC(
          emittedC.common.rootsAssignOseoBooleanStatement,
          doneState,
          step,
        ),
      );
    }
    line(
      state,
      renderC(emittedC.common.boolFastAssignStatement, operation.id, step),
    );
    line(state, renderC(emittedC.common.voidFastStatement, operation.id));
    return;
  }
  const iterator = operationArgument(operation, 0);
  const slot = operation.completionSlot;
  if (slot == null) {
    throw new Error(`MIR iterator close %${operation.id} has no completion.`);
  }
  state.usesCompletion = true;
  if (operation.iteratorDoneState == null) {
    line(
      state,
      renderC(
        emittedC.iteratorOperation.resultAssignOseoIteratorCloseContext,
        asynchronous,
      ) +
        renderC(
          emittedC.common.rootsCompletionUKindEqualStatement,
          iterator,
          slot,
        ),
    );
  } else {
    const done = iteratorDoneRead(state, operation.iteratorDoneState);
    line(state, renderC(emittedC.common.ifOpen, done));
    line(
      state,
      renderC(emittedC.common.resultAssignOseoResultOseoStatusNormalOseo),
    );
    line(state, renderC(emittedC.common.elseOpen));
    line(
      state,
      renderC(emittedC.iteratorOperation.indentedIteratorClose, asynchronous) +
        renderC(
          emittedC.common.rootsCompletionUKindEqualStatement,
          iterator,
          slot,
        ),
    );
    line(state, renderC(emittedC.common.closeBlock));
  }
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitCall(state: EmitState, operation: MirOperation): void {
  const target = operation.target;
  if (target == null) {
    throw new Error(`MIR call %${operation.id} has no target.`);
  }
  const dynamic = target.kind === "dynamic";
  const constructing = operation.kind === "construct";
  const callArguments = dynamic
    ? { ...operation, arguments: operation.arguments.slice(2) }
    : target.kind === "super"
      ? { ...operation, arguments: operation.arguments.slice(1) }
      : operation;
  location(state, operation.range);
  state.usesAbrupt = true;
  const argumentsValue = emitArguments(state, callArguments);
  if (target.kind === "console-log") {
    line(
      state,
      renderC(
        emittedC.call.resultAssignOseoConsoleLogContext,
        argumentsValue.count,
      ) + renderC(emittedC.common.callSuffix, argumentsValue.name),
    );
  } else if (target.kind === "object-intrinsic") {
    const names = {
      create: renderC(emittedC.call.oseoObjectBuiltinCreate),
      defineProperty: renderC(emittedC.call.oseoObjectBuiltinDefineProperty),
      getOwnPropertyDescriptor: renderC(
        emittedC.call.oseoObjectBuiltinGetOwnPropertyDescriptor,
      ),
      keys: renderC(emittedC.call.oseoObjectBuiltinKeys),
      setPrototypeOf: renderC(emittedC.call.oseoObjectBuiltinSetPrototypeOf),
    } as const;
    line(
      state,
      renderC(emittedC.common.resultAssignContext, names[target.method]) +
        renderC(
          emittedC.common.twoValuesCallSuffix,
          argumentsValue.count,
          argumentsValue.name,
        ),
    );
  } else if (target.kind === "promise-constructor") {
    const executor = emittedArgument(callArguments, argumentsValue, 0);
    line(
      state,
      renderC(emittedC.call.resultAssignOseoPromiseConstructContext, executor),
    );
  } else if (target.kind === "promise-intrinsic") {
    if (target.method === "asyncCall") {
      const execution = emittedArgument(callArguments, argumentsValue, 0);
      line(
        state,
        renderC(
          emittedC.call.resultAssignOseoPromiseAsyncCallContext,
          execution,
        ),
      );
    } else if (target.method === "awaitThen") {
      const promise = emittedArgument(callArguments, argumentsValue, 0);
      const onFulfilled = emittedArgument(callArguments, argumentsValue, 1);
      line(
        state,
        renderC(emittedC.call.resultAssignOseoPromiseAwaitThenContext) +
          renderC(emittedC.common.twoValuesCallSuffix, promise, onFulfilled),
      );
    } else if (target.method === "then") {
      const promise = emittedArgument(callArguments, argumentsValue, 0);
      const onFulfilled = emittedArgument(callArguments, argumentsValue, 1);
      const onRejected = emittedArgument(callArguments, argumentsValue, 2);
      line(
        state,
        renderC(emittedC.call.resultAssignOseoPromiseThenContext) +
          renderC(
            emittedC.call.threeValuesCallSuffix,
            promise,
            onFulfilled,
            onRejected,
          ),
      );
    } else {
      const names = {
        all: renderC(emittedC.call.oseoPromiseAll),
        race: renderC(emittedC.call.oseoPromiseRace),
        reject: renderC(emittedC.call.oseoPromiseReject),
        resolve: renderC(emittedC.call.oseoPromiseResolve),
      } as const;
      const value = emittedArgument(callArguments, argumentsValue, 0);
      line(
        state,
        renderC(
          emittedC.call.resultAssignContextStatement,
          names[target.method],
          value,
        ),
      );
    }
  } else if (target.kind === "timer-intrinsic") {
    if (target.method === "setTimeout") {
      line(
        state,
        renderC(
          emittedC.call.resultAssignOseoSetTimeoutContext,
          argumentsValue.count,
        ) + renderC(emittedC.common.callSuffix, argumentsValue.name),
      );
    } else {
      const handle = emittedArgument(callArguments, argumentsValue, 0);
      line(
        state,
        renderC(emittedC.call.resultAssignOseoClearTimeoutContext, handle),
      );
    }
  } else if (target.kind === "dynamic") {
    const callee = operationArgument(operation, 0);
    const receiver = operationArgument(operation, 1);
    line(
      state,
      renderC(emittedC.call.callFunctionWithDynamicReceiverPrefix, callee) +
        renderC(
          emittedC.common.twoRootsWithComma,
          receiver,
          argumentsValue.count,
        ) +
        renderC(emittedC.common.valueWithComma, argumentsValue.name) +
        (constructing
          ? renderC(emittedC.common.rootCallSuffix, callee)
          : renderC(emittedC.common.undefinedFinalArgumentCallSuffix)),
    );
    if (constructing) {
      line(state, renderC(emittedC.common.statusNormalOpen));
      line(
        state,
        renderC(emittedC.call.resultAssignOseoConstructorResult) +
          renderC(emittedC.call.contextResultValueRootsStatement, receiver),
      );
      line(state, renderC(emittedC.common.closeBlock));
    }
  } else if (target.kind === "super") {
    // Each super() call allocates a fresh receiver from new.target's
    // prototype and invokes the super constructor with that receiver.
    const parent = operationArgument(operation, 0);
    const newTarget = renderC(emittedC.functionCreate.newTarget);
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoFunctionPrototypeContextValue,
        newTarget,
      ),
    );
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(
      state,
      renderC(
        emittedC.constructReceiver.resultAssignOseoConstructorReceiverContext,
      ),
    );
    line(
      state,
      renderC(
        emittedC.common.rootsAssignResultValueIfStatusNormal,
        operation.id,
      ),
    );
    line(state, renderC(emittedC.common.closeBlock));
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(
      state,
      renderC(
        emittedC.call.callFunctionWithRootReceiverPrefix,
        parent,
        operation.id,
      ) +
        renderC(
          emittedC.call.newTargetStatement,
          argumentsValue.count,
          argumentsValue.name,
        ),
    );
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(
      state,
      renderC(
        emittedC.call.resultAssignOseoConstructorResultContextValueRoot,
        operation.id,
      ),
    );
    line(state, renderC(emittedC.common.closeBlock));
    line(state, renderC(emittedC.common.closeBlock));
  } else {
    const targetRootCount = state.functionRootCounts.get(target.functionId);
    if (targetRootCount == null) {
      throw new Error(
        `MIR call %${operation.id} targets unknown function ` +
          `'${target.functionId}'.`,
      );
    }
    let functionName = renderC(emittedC.call.oseoFunction, target.functionId);
    if (target.functionId === state.functionId) {
      functionName = renderC(
        emittedC.call.recursiveTarget,
        state.nextRecursiveTarget,
      );
      state.nextRecursiveTarget += 1;
      line(
        state,
        renderC(emittedC.call.oseoFunctionEntryVolatileAssign, functionName) +
          renderC(emittedC.call.oseoFunctionStatement, target.functionId),
      );
    }
    line(
      state,
      renderC(emittedC.call.resultAssignOseoCallEnterContextStatement),
    );
    line(state, renderC(emittedC.common.statusNormalOpen));
    line(
      state,
      renderC(
        emittedC.call.resultAssignOseoFrameEnterContextU,
        targetRootCount,
      ),
    );
    line(state, renderC(emittedC.call.ifResultStatusEqualOseoStatusNormalOpen));
    line(
      state,
      renderC(emittedC.call.resultAssign, functionName) +
        renderC(emittedC.call.contextOseoUndefinedOseoUndefined) +
        renderC(
          emittedC.common.twoValuesWithComma,
          argumentsValue.count,
          argumentsValue.name,
        ) +
        renderC(emittedC.common.undefinedFinalArgumentCallSuffix),
    );
    line(
      state,
      renderC(emittedC.call.oseoFrameLeaveContextUStatement, targetRootCount),
    );
    line(state, renderC(emittedC.common.indentedCloseBlock));
    line(state, renderC(emittedC.call.oseoCallLeaveContextStatement));
    line(state, renderC(emittedC.common.closeBlock));
  }
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitObjectOperation(state: EmitState, operation: MirOperation): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.kind === "array-create") {
    if (operation.arrayLength == null) {
      throw new Error(`MIR array-create %${operation.id} has no length.`);
    }
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoArrayCreateContextU,
        operation.arrayLength,
      ),
    );
  } else if (operation.kind === "array-append") {
    const array = operationArgument(operation, 0);
    const value = operationArgument(operation, 1);
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoArrayAppendContextRoots,
        array,
      ) + renderC(emittedC.common.rootCallSuffix, value),
    );
  } else if (operation.kind === "array-append-hole") {
    const array = operationArgument(operation, 0);
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoArrayAppendHoleContext,
        array,
      ),
    );
  } else if (operation.kind === "object-create") {
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoObjectLiteralCreateContext,
      ),
    );
  } else if (
    operation.kind === "object-coercible" ||
    operation.kind === "delete-object-coercible"
  ) {
    const input = operationArgument(operation, 0);
    line(
      state,
      renderC(
        operation.kind === "delete-object-coercible"
          ? emittedC.objectOperation
              .resultAssignOseoRequireDeleteObjectCoercible
          : emittedC.objectOperation.resultAssignOseoRequireObjectCoercible,
        input,
      ),
    );
  } else if (operation.kind === "object-rest") {
    const object = operationArgument(operation, 0);
    const excluded = operation.arguments.slice(1);
    const excludedName = renderC(
      emittedC.objectOperation.objectRestExcluded,
      operation.id,
    );
    if (excluded.length > 0) {
      line(
        state,
        renderC(
          emittedC.objectOperation.oseoValueUAssignOpen,
          excludedName,
          excluded.length,
        ) +
          excluded
            .map((id) => renderC(emittedC.common.root, id))
            .join(renderC(emittedC.common.commaSpace)) +
          renderC(emittedC.objectOperation.initializerSuffix),
      );
    }
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoObjectRestContextRoots,
        object,
      ) +
        renderC(emittedC.common.unsignedWithComma, excluded.length) +
        (excluded.length === 0
          ? renderC(emittedC.objectOperation.nullStatement)
          : renderC(emittedC.common.callSuffix, excludedName)),
    );
  } else if (operation.kind === "object-spread") {
    const object = operationArgument(operation, 0);
    const source = operationArgument(operation, 1);
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoObjectSpreadContextRoots,
        object,
      ) + renderC(emittedC.common.rootCallSuffix, source),
    );
  } else if (operation.kind === "object-set-prototype") {
    const object = operationArgument(operation, 0);
    const prototypeValue = operationArgument(operation, 1);
    line(
      state,
      renderC(
        emittedC.objectOperation
          .resultAssignOseoObjectLiteralSetPrototypeContextRoots,
        object,
      ) + renderC(emittedC.common.rootCallSuffix, prototypeValue),
    );
  } else if (operation.kind === "property-key") {
    const input = operationArgument(operation, 0);
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoPropertyKeyContextRoots,
        input,
      ),
    );
  } else if (operation.kind === "property-define-data") {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    const value = operationArgument(operation, 2);
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoObjectDefineContextRoots,
        object,
      ) +
        renderC(emittedC.common.rootsRoots, key, value) +
        renderC(
          emittedC.objectOperation.oseoPropertyAttributesTrueTrueTrueFalse,
        ),
    );
  } else if (operation.kind === "property-define-method") {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    const value = operationArgument(operation, 2);
    // A class prototype method is writable and configurable but not
    // enumerable, unlike an object literal's method definition.
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoObjectDefineContextRoots,
        object,
      ) +
        renderC(emittedC.common.rootsRoots, key, value) +
        renderC(
          emittedC.objectOperation.oseoPropertyAttributesTrueFalseTrueFalse,
        ),
    );
  } else if (operation.kind === "property-define-accessor") {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    const value = operationArgument(operation, 2);
    const isSetter = operation.accessorKind === "set";
    // A class body's accessor is non-enumerable, unlike an object
    // literal's accessor clause; both stay configurable.
    const enumerable = operation.enumerable !== false;
    line(
      state,
      renderC(
        emittedC.objectOperation.resultAssignOseoObjectDefineAccessor,
        object,
      ) +
        renderC(emittedC.common.rootWithComma, key) +
        renderC(
          emittedC.common.valueWithComma,
          isSetter
            ? renderC(emittedC.common.undefinedValue)
            : renderC(emittedC.common.root, value),
        ) +
        renderC(
          emittedC.common.valueWithComma,
          isSetter
            ? renderC(emittedC.common.root, value)
            : renderC(emittedC.common.undefinedValue),
        ) +
        renderC(
          emittedC.common.twoValuesWithComma,
          isSetter
            ? renderC(emittedC.common.falseValue)
            : renderC(emittedC.common.trueValue),
          isSetter
            ? renderC(emittedC.common.trueValue)
            : renderC(emittedC.common.falseValue),
        ) +
        renderC(
          emittedC.objectOperation.oseoPropertyAttributesTrueFalseTrue,
          enumerable,
        ),
    );
  } else {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    // A class body's computed keys are strict even inside a non-strict
    // function, so the operation may raise the function's strictness.
    const strict = state.strict || operation.strict === true;
    // A `super` reference looks the key up through `object` while a
    // getter, setter, or receiver-side assignment observes the separate
    // receiver the operation carries as its last argument.
    const superReference = operation.superReference === true;
    if (operation.kind === "property-get") {
      if (superReference) {
        const receiver = operationArgument(operation, 2);
        line(
          state,
          renderC(
            emittedC.objectOperation.resultAssignOseoSuperGetContextRoots,
            object,
          ) + renderC(emittedC.common.rootsRootsStatement, key, receiver),
        );
      } else {
        line(
          state,
          renderC(
            emittedC.objectOperation.resultAssignOseoObjectGetContextRoots,
            object,
          ) + renderC(emittedC.common.rootCallSuffix, key),
        );
      }
    } else if (operation.kind === "property-delete") {
      line(
        state,
        renderC(
          emittedC.objectOperation.resultAssignOseoObjectDeleteContextRoots,
          object,
        ) +
          renderC(
            emittedC.common.rootsStatement,
            key,
            strict
              ? renderC(emittedC.common.trueValue)
              : renderC(emittedC.common.falseValue),
          ),
      );
    } else {
      const value = operationArgument(operation, 2);
      if (superReference) {
        const receiver = operationArgument(operation, 3);
        line(
          state,
          renderC(
            emittedC.objectOperation.resultAssignOseoSuperSetContextRoots,
            object,
          ) +
            renderC(
              emittedC.objectOperation.rootsRootsRoots,
              key,
              value,
              receiver,
            ) +
            renderC(
              emittedC.common.callSuffix,
              strict
                ? renderC(emittedC.common.trueValue)
                : renderC(emittedC.common.falseValue),
            ),
        );
      } else {
        line(
          state,
          renderC(
            emittedC.objectOperation.resultAssignOseoObjectSetContextRoots,
            object,
          ) +
            renderC(emittedC.common.rootsRoots, key, value) +
            renderC(
              emittedC.common.callSuffix,
              strict
                ? renderC(emittedC.common.trueValue)
                : renderC(emittedC.common.falseValue),
            ),
        );
      }
    }
  }
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitArgumentListOperation(
  state: EmitState,
  operation: MirOperation,
): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.kind === "argument-list-create") {
    line(
      state,
      renderC(
        emittedC.argumentListOperation
          .resultAssignOseoArgumentListCreateContext,
      ),
    );
  } else {
    const list = operationArgument(operation, 0);
    const value = operationArgument(operation, 1);
    line(
      state,
      renderC(
        emittedC.argumentListOperation
          .resultAssignOseoArgumentListAppendContext,
        list,
      ) + renderC(emittedC.common.rootCallSuffix, value),
    );
  }
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function propertyCacheName(operation: MirOperation): string {
  if (operation.cacheId == null) {
    throw new Error(`MIR ${operation.kind} %${operation.id} has no cache.`);
  }
  return renderC(emittedC.propertyCacheName.propertyCache, operation.cacheId);
}

function emitGuardObject(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "boolean");
  line(
    state,
    renderC(
      emittedC.guardObject.boolFastAssignOseoValueIsObjectRoots,
      operation.id,
      object,
    ),
  );
}

function emitGuardShape(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const cache = propertyCacheName(operation);
  state.scalarKinds.set(operation.id, "boolean");
  line(
    state,
    renderC(
      emittedC.guardShape.staticOseoPropertyCacheAssignUUStatement,
      cache,
    ),
  );
  line(
    state,
    renderC(
      emittedC.guardShape.boolFastAssignOseoPropertyCacheMatches,
      operation.id,
    ) + renderC(emittedC.guardShape.rootsAddressStatement, object, cache),
  );
}

function emitLoadFixedSlot(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const cache = propertyCacheName(operation);
  line(
    state,
    renderC(emittedC.common.rootsAssign, operation.id) +
      renderC(
        emittedC.loadFixedSlot.oseoPropertyCacheLoadRootsAddressStatement,
        object,
        cache,
      ),
  );
}

function emitUpdatePropertyCache(
  state: EmitState,
  operation: MirOperation,
): void {
  const object = operationArgument(operation, 0);
  const key = operationArgument(operation, 1);
  const cache = propertyCacheName(operation);
  line(
    state,
    renderC(
      emittedC.updatePropertyCache.oseoPropertyCacheUpdateRootsRoots,
      object,
      key,
    ) + renderC(emittedC.common.addressStatement, cache),
  );
}

function emitFunctionCreate(state: EmitState, operation: MirOperation): void {
  if (operation.functionId == null) {
    throw new Error(`MIR function-create %${operation.id} has no code id.`);
  }
  if (operation.functionName == null || operation.functionLength == null) {
    throw new Error(
      `MIR function-create %${operation.id} has no function metadata.`,
    );
  }
  if (operation.functionKind == null) {
    throw new Error(
      `MIR function-create %${operation.id} has no callable kind.`,
    );
  }
  const functionKinds = {
    arrow: renderC(emittedC.functionCreate.oseoFunctionArrow),
    async: renderC(emittedC.functionCreate.oseoFunctionAsync),
    "async-arrow": renderC(emittedC.functionCreate.oseoFunctionAsyncArrow),
    "async-generator": renderC(
      emittedC.functionCreate.oseoFunctionAsyncGenerator,
    ),
    class: renderC(emittedC.functionCreate.oseoFunctionClass),
    generator: renderC(emittedC.functionCreate.oseoFunctionGenerator),
    method: renderC(emittedC.functionCreate.oseoFunctionMethod),
    ordinary: renderC(emittedC.functionCreate.oseoFunctionOrdinary),
  } as const;
  const units = utf16Units(operation.functionName);
  let nameInput = renderC(emittedC.common.nullPointer);
  if (units.length > 0) {
    const name = renderC(
      emittedC.functionCreate.functionNameUnits,
      operation.id,
    );
    line(
      state,
      renderC(
        emittedC.common.staticConstUint16TAssignStatement,
        name,
        units.join(renderC(emittedC.common.commaSpace)),
      ),
    );
    nameInput = name;
  }
  const inferredName =
    operation.arguments[0] == null
      ? renderC(emittedC.common.undefinedValue)
      : renderC(emittedC.common.root, operation.arguments[0]);
  const namePrefixes = {
    get: renderC(emittedC.functionCreate.oseoFunctionNamePrefixGet),
    set: renderC(emittedC.functionCreate.oseoFunctionNamePrefixSet),
  } as const;
  const namePrefix =
    operation.accessorKind == null
      ? renderC(emittedC.functionCreate.oseoFunctionNamePrefixNone)
      : namePrefixes[operation.accessorKind];
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.functionCreate.resultAssignOseoFunctionCreateContextU,
      operation.functionId,
    ) +
      renderC(
        emittedC.functionCreate.rootsU,
        state.environmentSlot,
        nameInput,
        units.length,
      ) +
      renderC(emittedC.common.unsignedWithComma, operation.functionLength) +
      renderC(
        emittedC.functionCreate.receiver,
        functionKinds[operation.functionKind],
        inferredName,
      ) +
      renderC(emittedC.common.callSuffix, namePrefix),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
  if (
    operation.functionKind === "arrow" ||
    operation.functionKind === "async-arrow"
  ) {
    const newTarget = state.generator
      ? renderC(emittedC.common.undefinedValue)
      : renderC(emittedC.functionCreate.newTarget);
    line(
      state,
      renderC(
        emittedC.functionCreate.bindArrowContext,
        operation.id,
        newTarget,
      ),
    );
  }
}

function emitErrorIntrinsic(state: EmitState, operation: MirOperation): void {
  const errorKinds = {
    Error: renderC(emittedC.errorIntrinsic.oseoErrorError),
    EvalError: renderC(emittedC.errorIntrinsic.oseoErrorEval),
    RangeError: renderC(emittedC.errorIntrinsic.oseoErrorRange),
    ReferenceError: renderC(emittedC.errorIntrinsic.oseoErrorReference),
    SyntaxError: renderC(emittedC.errorIntrinsic.oseoErrorSyntax),
    TypeError: renderC(emittedC.errorIntrinsic.oseoErrorType),
    URIError: renderC(emittedC.errorIntrinsic.oseoErrorUri),
  } as const;
  if (operation.errorName == null) {
    throw new Error(`MIR error-intrinsic %${operation.id} has no name.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.errorIntrinsic.resultAssignOseoErrorIntrinsicContext) +
      renderC(emittedC.common.callSuffix, errorKinds[operation.errorName]),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitConstructReceiver(
  state: EmitState,
  operation: MirOperation,
): void {
  const callee = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoFunctionPrototypeContext, callee),
  );
  line(state, renderC(emittedC.common.statusNormalOpen));
  line(
    state,
    renderC(
      emittedC.constructReceiver.resultAssignOseoConstructorReceiverContext,
    ),
  );
  line(state, renderC(emittedC.common.closeBlock));
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Links a derived class to its heritage: the constructor inherits from
 * the parent constructor and the class prototype object from the
 * parent's `prototype`, so both static and instance lookups walk into
 * the parent.
 */
function emitClassHeritage(state: EmitState, operation: MirOperation): void {
  const constructorValue = operationArgument(operation, 0);
  const heritage = operationArgument(operation, 1);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.classHeritage.resultAssignOseoClassHeritageContextRoots,
      constructorValue,
    ) + renderC(emittedC.common.rootCallSuffix, heritage),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Records one instance field on the constructor: the key evaluated by
 * the class body and the closure that produces the value, or
 * `undefined` for a field declared without an initializer.
 */
function emitClassFieldDefine(state: EmitState, operation: MirOperation): void {
  const constructorValue = operationArgument(operation, 0);
  const key = operationArgument(operation, 1);
  const initializer = operationArgument(operation, 2);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.classFieldDefine.resultAssignOseoClassFieldDefineContext) +
      renderC(
        emittedC.common.rootsRootsRootsStatement,
        constructorValue,
        key,
        initializer,
      ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Runs one `static` field initializer against the constructor and
 * defines the result on it. The public form creates an own writable,
 * enumerable, configurable data property, and the private form adds a
 * private element the constructor carries.
 */
function emitClassStaticFieldDefine(
  state: EmitState,
  operation: MirOperation,
  privateElement: boolean,
): void {
  const constructorValue = operationArgument(operation, 0);
  const key = operationArgument(operation, 1);
  const initializer = operationArgument(operation, 2);
  const entryPoint = privateElement
    ? renderC(emittedC.classStaticFieldDefine.oseoClassStaticPrivateFieldDefine)
    : renderC(emittedC.classStaticFieldDefine.oseoClassStaticFieldDefine);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignContext, entryPoint) +
      renderC(
        emittedC.common.rootsRootsRootsStatement,
        constructorValue,
        key,
        initializer,
      ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Creates one private name: the identity a class evaluation gives one
 * declared `#name`. The name itself carries nothing, so the operation
 * takes no operand and the spelled name stays in the MIR detail.
 */
function emitPrivateNameCreate(
  state: EmitState,
  operation: MirOperation,
): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.privateNameCreate.resultAssignOseoPrivateNameCreateContext,
    ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Records one private field on the constructor: the private name the
 * class evaluation created and the closure that produces the value, or
 * `undefined` for a field declared without an initializer.
 */
function emitClassPrivateFieldDefine(
  state: EmitState,
  operation: MirOperation,
): void {
  const constructorValue = operationArgument(operation, 0);
  const privateName = operationArgument(operation, 1);
  const initializer = operationArgument(operation, 2);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.classPrivateFieldDefine.resultAssignOseoClassPrivateFieldDefine,
    ) +
      renderC(emittedC.common.rootsRoots, constructorValue, privateName) +
      renderC(emittedC.common.rootCallSuffix, initializer),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Records one instance private method or accessor half, or installs one
 * static half directly on the constructor. A getter and a setter under
 * one private name merge into the single accessor element that name
 * reaches.
 */
function emitClassPrivateMethodDefine(
  state: EmitState,
  operation: MirOperation,
): void {
  const constructorValue = operationArgument(operation, 0);
  const privateName = operationArgument(operation, 1);
  const value = operationArgument(operation, 2);
  const kind =
    operation.accessorKind === "get"
      ? renderC(emittedC.common.privateGetterKind)
      : operation.accessorKind === "set"
        ? renderC(emittedC.common.privateSetterKind)
        : renderC(emittedC.common.privateMethodKind);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      operation.kind === "class-static-private-method-define"
        ? emittedC.classPrivateMethodDefine
            .resultAssignOseoClassStaticPrivateMethodDefine
        : emittedC.classPrivateMethodDefine
            .resultAssignOseoClassPrivateMethodDefine,
    ) +
      renderC(emittedC.common.rootsRoots, constructorValue, privateName) +
      renderC(emittedC.common.rootsStatement, value, kind),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/** PrivateGet: the element the object carries under one private name. */
function emitPrivateGet(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const privateName = operationArgument(operation, 1);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.privateGet.resultAssignOseoPrivateGetContextRoots,
      object,
    ) + renderC(emittedC.common.rootCallSuffix, privateName),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/** PrivateBrandCheck: whether one object carries one private name. */
function emitPrivateIn(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const privateName = operationArgument(operation, 1);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.privateIn.resultAssignOseoPrivateInContextRoots, object) +
      renderC(emittedC.common.rootCallSuffix, privateName),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/** PrivateSet: replaces the value one private field element holds. */
function emitPrivateSet(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const privateName = operationArgument(operation, 1);
  const value = operationArgument(operation, 2);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.privateSet.resultAssignOseoPrivateSetContextRoots,
      object,
    ) + renderC(emittedC.common.rootsRootsStatement, privateName, value),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Runs the running constructor's instance element records against one
 * instance: it installs the private methods and accessors, then runs
 * the field initializers. The constructor is the callee, so a base
 * constructor reaches its own class's records and a derived one reaches
 * only the records its own class declared.
 */
function emitInstanceElementsInit(
  state: EmitState,
  operation: MirOperation,
): void {
  const instance = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.instanceElementsInit.resultAssignOseoInitializeInstanceElements,
    ) + renderC(emittedC.common.rootCallSuffix, instance),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Records the object a class element's `super.x` references look
 * through. The binding is the only way the element's function object
 * reaches its class again, because a method value can be called through
 * any receiver.
 */
function emitHomeObjectBind(state: EmitState, operation: MirOperation): void {
  const functionValue = operationArgument(operation, 0);
  const home = operationArgument(operation, 1);
  location(state, operation.range);
  line(
    state,
    renderC(
      emittedC.homeObjectBind.oseoBindHomeObjectRootsRootsStatement,
      functionValue,
      home,
    ),
  );
}

/**
 * Reads the [[Prototype]] of the running function's home object, which
 * is where a `super` property reference starts its lookup. It reads
 * runtime state that a class definition already established, so it runs
 * no user code and reports no abrupt completion; a home object whose
 * chain ends leaves the nullish value for the reference itself to
 * reject.
 */
function emitSuperBase(state: EmitState, operation: MirOperation): void {
  location(state, operation.range);
  line(
    state,
    renderC(
      emittedC.superBase.rootsAssignOseoSuperBaseCalleeStatement,
      operation.id,
    ),
  );
}

/**
 * Reads the running constructor's own [[Prototype]], which is the
 * constructor `super()` invokes.
 */
function emitSuperConstructor(state: EmitState, operation: MirOperation): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.superConstructor.resultAssignOseoSuperConstructorContext),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/** Binds what `super()` produced to the derived constructor's `this`. */
function emitThisBind(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR this-bind %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
      renderC(
        emittedC.common.rootsUStatement,
        state.environmentSlot,
        bindingId,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  line(
    state,
    renderC(
      emittedC.thisBind.resultAssignOseoBindThisContextResultValue,
      value,
    ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

/**
 * Resolves a derived constructor's completion value: an object stands as
 * written, `undefined` becomes the bound `this`, and any other value is
 * a `TypeError`.
 */
function emitDerivedReturn(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(
      `MIR derived-return %${operation.id} has no binding identity.`,
    );
  }
  const value = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
      renderC(
        emittedC.common.rootsUStatement,
        state.environmentSlot,
        bindingId,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  line(
    state,
    renderC(
      emittedC.derivedReturn.resultAssignOseoDerivedConstructorResult,
      value,
    ) + renderC(emittedC.derivedReturn.resultValueStatement),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitClassPrototype(state: EmitState, operation: MirOperation): void {
  const constructorValue = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(
      emittedC.common.resultAssignOseoFunctionPrototypeContext,
      constructorValue,
    ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitModuleNamespace(state: EmitState, operation: MirOperation): void {
  const names = operation.namespaceNames;
  const namespaceBindingIds = operation.namespaceBindingIds;
  if (
    names == null ||
    namespaceBindingIds == null ||
    names.length !== namespaceBindingIds.length
  ) {
    throw new Error(`MIR namespace %${operation.id} has invalid entries.`);
  }
  if (names.length === 0) {
    location(state, operation.range);
    state.usesAbrupt = true;
    line(
      state,
      renderC(emittedC.common.resultAssignOseoModuleNamespaceCreate) +
        renderC(
          emittedC.moduleNamespace.rootsUNullNullNullStatement,
          state.environmentSlot,
        ),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
    return;
  }
  const pointers: string[] = [];
  const lengths: number[] = [];
  for (const [index, name] of names.entries()) {
    const units = utf16Units(name);
    lengths.push(units.length);
    if (units.length === 0) {
      pointers.push(renderC(emittedC.common.nullPointer));
      continue;
    }
    const constantName = renderC(
      emittedC.moduleNamespace.namespaceUnits,
      operation.id,
      index,
    );
    line(
      state,
      renderC(
        emittedC.common.staticConstUint16TAssignStatement,
        constantName,
        units.join(renderC(emittedC.common.commaSpace)),
      ),
    );
    pointers.push(constantName);
  }
  const prefix = renderC(emittedC.moduleNamespace.namespace, operation.id);
  line(
    state,
    renderC(
      emittedC.moduleNamespace.staticConstUint16TPointerConstNamesAssign,
      prefix,
    ) +
      renderC(
        emittedC.common.bracedInitializer,
        pointers.join(renderC(emittedC.common.commaSpace)),
      ),
  );
  line(
    state,
    renderC(
      emittedC.moduleNamespace.staticConstSizeTLengthsAssignStatement,
      prefix,
      lengths.join(renderC(emittedC.common.commaSpace)),
    ),
  );
  line(
    state,
    renderC(emittedC.moduleNamespace.staticConstSizeTBindingsAssign, prefix) +
      renderC(
        emittedC.common.bracedInitializer,
        namespaceBindingIds.join(renderC(emittedC.common.commaSpace)),
      ),
  );
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    renderC(emittedC.common.resultAssignOseoModuleNamespaceCreate) +
      renderC(emittedC.common.rootsU, state.environmentSlot, names.length) +
      renderC(
        emittedC.moduleNamespace.namesLengthsBindingsStatement,
        prefix,
        prefix,
        prefix,
      ),
  );
  line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
}

function emitOperation(state: EmitState, operation: MirOperation): void {
  if (operation.kind === "constant") {
    if (operation.constant == null) {
      throw new Error(`MIR constant %${operation.id} has no value.`);
    }
    emitConstant(state, operation, operation.constant);
  } else if (operation.kind === "read") {
    emitRead(state, operation);
  } else if (operation.kind === "write") {
    emitWrite(state, operation);
  } else if (operation.kind === "initialize") {
    emitInitialize(state, operation);
  } else if (operation.kind === "binding-reset") {
    emitBindingReset(state, operation);
  } else if (operation.kind === "function-create") {
    emitFunctionCreate(state, operation);
  } else if (operation.kind === "construct-receiver") {
    emitConstructReceiver(state, operation);
  } else if (operation.kind === "class-prototype") {
    emitClassPrototype(state, operation);
  } else if (operation.kind === "class-heritage") {
    emitClassHeritage(state, operation);
  } else if (operation.kind === "class-field-define") {
    emitClassFieldDefine(state, operation);
  } else if (operation.kind === "private-name-create") {
    emitPrivateNameCreate(state, operation);
  } else if (operation.kind === "class-private-field-define") {
    emitClassPrivateFieldDefine(state, operation);
  } else if (operation.kind === "class-private-method-define") {
    emitClassPrivateMethodDefine(state, operation);
  } else if (operation.kind === "class-static-private-method-define") {
    emitClassPrivateMethodDefine(state, operation);
  } else if (operation.kind === "class-static-field-define") {
    emitClassStaticFieldDefine(state, operation, false);
  } else if (operation.kind === "class-static-private-field-define") {
    emitClassStaticFieldDefine(state, operation, true);
  } else if (operation.kind === "private-get") {
    emitPrivateGet(state, operation);
  } else if (operation.kind === "private-in") {
    emitPrivateIn(state, operation);
  } else if (operation.kind === "private-set") {
    emitPrivateSet(state, operation);
  } else if (operation.kind === "instance-elements-init") {
    emitInstanceElementsInit(state, operation);
  } else if (operation.kind === "home-object-bind") {
    emitHomeObjectBind(state, operation);
  } else if (operation.kind === "super-base") {
    emitSuperBase(state, operation);
  } else if (operation.kind === "super-constructor") {
    emitSuperConstructor(state, operation);
  } else if (operation.kind === "this-bind") {
    emitThisBind(state, operation);
  } else if (operation.kind === "derived-return") {
    emitDerivedReturn(state, operation);
  } else if (operation.kind === "error-intrinsic") {
    emitErrorIntrinsic(state, operation);
  } else if (operation.kind === "symbol-intrinsic") {
    location(state, operation.range);
    state.usesAbrupt = true;
    line(
      state,
      renderC(emittedC.operation.resultAssignOseoSymbolIntrinsicContext),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
  } else if (operation.kind === "module-namespace-create") {
    emitModuleNamespace(state, operation);
  } else if (operation.kind === "receiver") {
    line(
      state,
      renderC(emittedC.operation.rootsAssignReceiverStatement, operation.id),
    );
  } else if (operation.kind === "global-this") {
    // The runtime owns the nullish-receiver substitution and the one
    // global this object it resolves to, so generated C never decides
    // which receiver a non-strict function or Script top level observes.
    location(state, operation.range);
    state.usesAbrupt = true;
    line(
      state,
      renderC(emittedC.operation.resultAssignOseoThisValueContextReceiver),
    );
    line(state, renderC(emittedC.common.rootAssignResultValue, operation.id));
  } else if (operation.kind === "new-target") {
    // A generator body resumes outside any construction, and a generator
    // function is not a constructor, so its new.target is undefined.
    line(
      state,
      renderC(emittedC.common.rootsAssign, operation.id) +
        (state.generator
          ? renderC(emittedC.operation.undefinedExpressionStatement)
          : renderC(emittedC.operation.newTargetStatement)),
    );
  } else if (operation.kind === "caught") {
    state.usesCompletion = true;
    const slot = operation.completionSlot;
    if (slot == null) {
      throw new Error(`MIR caught %${operation.id} has no completion slot.`);
    }
    line(state, renderC(emittedC.common.oseoContextClearLanguageErrorContext));
    line(
      state,
      renderC(
        emittedC.operation.rootsAssignRootsUStatement,
        operation.id,
        state.completionSlotStart + slot,
      ),
    );
    line(
      state,
      renderC(emittedC.common.resultAssignOseoResultOseoStatusNormal) +
        renderC(
          emittedC.common.rootUnsignedInitializerSuffix,
          state.completionSlotStart + slot,
        ),
    );
  } else if (operation.kind === "completion-set") {
    state.usesCompletion = true;
    const kinds = { jump: 3, normal: 0, return: 1, throw: 2 } as const;
    const kind = operation.completionKind;
    if (kind == null) {
      throw new Error(`MIR completion-set %${operation.id} has no kind.`);
    }
    const slot = operation.completionSlot;
    if (slot == null) {
      throw new Error(
        `MIR completion-set %${operation.id} has no completion slot.`,
      );
    }
    line(
      state,
      renderC(
        emittedC.operation.completionUKindAssignStatement,
        slot,
        kinds[kind],
      ),
    );
    if (kind === "throw") {
      location(state, operation.range);
      line(
        state,
        renderC(emittedC.common.oseoContextClearLanguageErrorContext),
      );
      line(
        state,
        renderC(
          emittedC.operation.completionULineAssignContextMemberLine,
          slot,
        ),
      );
      line(
        state,
        renderC(
          emittedC.operation.completionUColumnAssignContextMemberColumn,
          slot,
        ),
      );
      line(
        state,
        renderC(
          emittedC.operation.completionUSourceIdAssignContextMember,
          slot,
        ),
      );
      line(
        state,
        renderC(emittedC.operation.completionUSourceIdLengthAssign, slot) +
          renderC(emittedC.common.contextMemberSourceIdLengthStatement),
      );
      line(
        state,
        renderC(
          emittedC.operation.completionUErrorCodeAssignContextMember,
          slot,
        ),
      );
      line(
        state,
        renderC(
          emittedC.operation.completionUErrorMessageAssignContextMember,
          slot,
        ),
      );
    }
    if (operation.arguments[0] != null) {
      line(
        state,
        renderC(
          emittedC.operation.rootsUAssign,
          state.completionSlotStart + slot,
        ) + renderC(emittedC.operation.rootsStatement, operation.arguments[0]),
      );
    }
    if (operation.completionTarget != null) {
      line(
        state,
        renderC(emittedC.operation.completionUTargetAssign, slot) +
          renderC(
            emittedC.common.uStatement,
            operation.completionTarget.blockId,
          ),
      );
      line(
        state,
        renderC(emittedC.operation.completionUDepthAssign, slot) +
          renderC(
            emittedC.common.uStatement,
            operation.completionTarget.cleanupDepth,
          ),
      );
    }
  } else if (operation.kind === "unary") {
    emitUnary(state, operation);
  } else if (operation.kind === "binary") {
    emitBinary(state, operation);
  } else if (operation.kind === "guard-object") {
    emitGuardObject(state, operation);
  } else if (operation.kind === "guard-shape") {
    emitGuardShape(state, operation);
  } else if (operation.kind === "guard-smi") {
    emitGuardSmi(state, operation);
  } else if (operation.kind === "unbox-smi") {
    emitUnboxSmi(state, operation);
  } else if (operation.kind === "add-smi-checked") {
    emitCheckedAdd(state, operation);
  } else if (operation.kind === "box-smi") {
    emitBoxSmi(state, operation);
  } else if (
    operation.kind === "iterator-await-result" ||
    operation.kind === "iterator-await-start" ||
    operation.kind === "iterator-get" ||
    operation.kind === "iterator-next" ||
    operation.kind === "iterator-delegate-next" ||
    operation.kind === "iterator-delegate-return" ||
    operation.kind === "iterator-delegate-throw" ||
    operation.kind === "iterator-close" ||
    operation.kind === "iterator-close-result" ||
    operation.kind === "iterator-close-start"
  ) {
    emitIteratorOperation(state, operation);
  } else if (operation.kind === "load-fixed-slot") {
    emitLoadFixedSlot(state, operation);
  } else if (operation.kind === "update-property-cache") {
    emitUpdatePropertyCache(state, operation);
  } else if (operation.kind === "count-guard-hit") {
    if (state.observeSpecialization) {
      line(
        state,
        renderC(emittedC.operation.contextMemberGuardHitsPlusAssignUStatement),
      );
    }
  } else if (operation.kind === "count-guard-miss") {
    if (state.observeSpecialization) {
      line(
        state,
        renderC(emittedC.operation.contextMemberGuardMissesPlusAssignU),
      );
    }
  } else if (operation.kind === "count-overflow-miss") {
    if (state.observeSpecialization) {
      line(
        state,
        renderC(emittedC.operation.contextMemberOverflowMissesPlusAssignU),
      );
    }
  } else if (operation.kind === "call" || operation.kind === "construct") {
    emitCall(state, operation);
  } else if (
    operation.kind === "argument-list-append" ||
    operation.kind === "argument-list-create"
  ) {
    emitArgumentListOperation(state, operation);
  } else if (operation.kind === "template-object") {
    emitTemplateObject(state, operation);
  } else if (
    operation.kind === "array-append" ||
    operation.kind === "array-append-hole" ||
    operation.kind === "array-create" ||
    operation.kind === "delete-object-coercible" ||
    operation.kind === "object-coercible" ||
    operation.kind === "object-create" ||
    operation.kind === "object-rest" ||
    operation.kind === "object-set-prototype" ||
    operation.kind === "object-spread" ||
    operation.kind === "property-key" ||
    operation.kind === "property-define-accessor" ||
    operation.kind === "property-define-data" ||
    operation.kind === "property-define-method" ||
    operation.kind === "property-delete" ||
    operation.kind === "property-get" ||
    operation.kind === "property-set"
  ) {
    emitObjectOperation(state, operation);
  } else if (operation.kind === "check-status") {
    if (operation.abruptTarget == null) {
      line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    } else {
      const target = operation.abruptTarget.blockId;
      state.usesCompletion = true;
      line(
        state,
        renderC(emittedC.operation.ifResultStatusNotEqualOseoStatusNormalOpen),
      );
      line(
        state,
        renderC(emittedC.operation.ifContextMemberHasDiagnosticGotoAbrupt),
      );
      line(state, renderC(emittedC.operation.setThrowKind, target));
      line(
        state,
        renderC(
          emittedC.common.rootsUAssign,
          state.completionSlotStart + target,
        ) + renderC(emittedC.operation.resultValueStatement),
      );
      line(state, renderC(emittedC.operation.setThrowLine, target));
      line(state, renderC(emittedC.operation.setThrowColumn, target));
      line(state, renderC(emittedC.operation.setThrowSourceId, target));
      line(
        state,
        renderC(emittedC.operation.setThrowSourceIdLength, target) +
          renderC(emittedC.common.contextMemberSourceIdLengthStatement),
      );
      line(state, renderC(emittedC.operation.setThrowErrorCode, target));
      line(
        state,
        renderC(emittedC.operation.completionUErrorMessageAssign, target) +
          renderC(emittedC.operation.contextMemberErrorMessageStatement),
      );
      line(state, renderC(emittedC.common.gotoBbStatement, target));
      line(state, renderC(emittedC.common.closeBlock));
    }
  }
}

function emitCompletionCopy(
  state: EmitState,
  source: number,
  target: number,
): void {
  line(
    state,
    renderC(
      emittedC.completionCopy.completionUAssignCompletionUStatement,
      target,
      source,
    ),
  );
  line(
    state,
    renderC(emittedC.common.rootsUAssign, state.completionSlotStart + target) +
      renderC(
        emittedC.completionCopy.rootsUStatement,
        state.completionSlotStart + source,
      ),
  );
}

function emitTerminator(state: EmitState, terminator: MirTerminator): void {
  if (terminator.kind === "return") {
    emitNormalReturn(state, renderC(emittedC.common.root, terminator.value));
  } else if (terminator.kind === "generator-yield") {
    // `yield*` suspends with the inner iterator's own result object, so
    // the resumption reports it instead of creating a fresh one. An
    // awaited suspension leaves no iteration step at all, so the driver
    // settles the value instead of reporting it.
    const resultObject =
      terminator.resultObject === true
        ? renderC(emittedC.common.trueValue)
        : renderC(emittedC.common.falseValue);
    const reason =
      terminator.awaited === true
        ? renderC(emittedC.terminator.oseoGeneratorSuspendAwait)
        : renderC(emittedC.terminator.oseoGeneratorSuspendYield);
    line(
      state,
      renderC(
        emittedC.terminator.oseoGeneratorSuspendContextGeneratorU,
        terminator.resume,
      ) + renderC(emittedC.common.twoValuesCallSuffix, resultObject, reason),
    );
    line(
      state,
      renderC(emittedC.common.resultAssignOseoResultOseoStatusNormal) +
        renderC(emittedC.terminator.rootsStatement, terminator.value),
    );
    line(state, renderC(emittedC.common.returnResult));
  } else if (terminator.kind === "jump") {
    if (!state.generator && state.generatorBodyStart === terminator.target) {
      emitNormalReturn(state, renderC(emittedC.function.frameSlotsZero));
      return;
    }
    const parameters = state.blockParameters.get(terminator.target) ?? [];
    const values = terminator.values ?? [];
    if (parameters.length !== values.length) {
      throw new Error(
        `MIR jump to bb${terminator.target} has ${values.length} values ` +
          `for ${parameters.length} parameters.`,
      );
    }
    for (let index = 0; index < parameters.length; index += 1) {
      line(
        state,
        renderC(
          emittedC.common.rootAssignRoot,
          parameters[index]!,
          values[index]!,
        ),
      );
    }
    line(state, renderC(emittedC.common.gotoBlock, terminator.target));
  } else if (terminator.kind === "branch") {
    const test =
      state.scalarKinds.get(terminator.test) === "boolean"
        ? renderC(emittedC.terminator.fast, terminator.test)
        : renderC(emittedC.common.oseoToBooleanRoots, terminator.test);
    line(
      state,
      renderC(emittedC.terminator.ifGotoBbStatement, test, terminator.whenTrue),
    );
    line(state, renderC(emittedC.common.gotoBlock, terminator.whenFalse));
  } else if (terminator.kind === "resume-completion") {
    state.usesCompletion = true;
    // The saved-throw branch below always emits `goto abrupt`, so the label
    // must exist even when no other operation in the body can be abrupt.
    state.usesAbrupt = true;
    const slot = terminator.completionSlot;
    if (terminator.outerAbrupt != null) {
      const target = terminator.outerAbrupt.blockId;
      line(state, renderC(emittedC.common.ifCompletionKindThrowOpen, slot));
      emitCompletionCopy(state, slot, target);
      line(state, renderC(emittedC.common.gotoBbStatement, target));
      line(state, renderC(emittedC.common.closeBlock));
    }
    if (terminator.outerFinalizer != null) {
      const target = terminator.outerFinalizer;
      line(
        state,
        renderC(
          emittedC.terminator.ifCompletionUKindNotEqualAddressAddress,
          slot,
        ) +
          renderC(
            emittedC.terminator.completionUDepthAssignUOpen,
            slot,
            target.cleanupDepth,
          ),
      );
      emitCompletionCopy(state, slot, target.blockId);
      line(state, renderC(emittedC.common.gotoBbStatement, target.blockId));
      line(state, renderC(emittedC.common.closeBlock));
    }
    line(state, renderC(emittedC.terminator.ifCompletionKindReturnOpen, slot));
    if (state.derivedThisBindingId != null) {
      line(
        state,
        renderC(emittedC.common.resultAssignOseoEnvironmentGetContext) +
          renderC(
            emittedC.common.rootsUStatement,
            state.environmentSlot,
            state.derivedThisBindingId,
          ),
      );
      line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
      line(
        state,
        renderC(
          emittedC.derivedReturn.resultAssignOseoDerivedConstructorResult,
          state.completionSlotStart + slot,
        ) + renderC(emittedC.derivedReturn.resultValueStatement),
      );
      line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
      emitNormalReturn(state, "result.value", renderC(emittedC.common.indent));
    } else {
      emitNormalReturn(
        state,
        renderC(emittedC.common.rootUnsigned, state.completionSlotStart + slot),
        renderC(emittedC.common.indent),
      );
    }
    line(state, renderC(emittedC.common.closeBlock));
    line(state, renderC(emittedC.common.ifCompletionKindThrowOpen, slot));
    line(
      state,
      renderC(emittedC.terminator.contextMemberLineAssignCompletionULine, slot),
    );
    line(
      state,
      renderC(
        emittedC.terminator.contextMemberColumnAssignCompletionUColumn,
        slot,
      ),
    );
    line(
      state,
      renderC(emittedC.terminator.contextMemberSourceIdAssignCompletionU, slot),
    );
    line(
      state,
      renderC(emittedC.terminator.contextMemberSourceIdLengthAssign) +
        renderC(emittedC.terminator.completionUSourceIdLengthStatement, slot),
    );
    line(
      state,
      renderC(
        emittedC.terminator.contextMemberErrorCodeAssignCompletionU,
        slot,
      ),
    );
    line(
      state,
      renderC(
        emittedC.terminator.contextMemberErrorMessageAssignCompletionU,
        slot,
      ),
    );
    line(
      state,
      renderC(emittedC.terminator.contextMemberHasDiagnosticAssignFalse),
    );
    line(
      state,
      renderC(emittedC.terminator.resultAssignOseoResultOseoStatusThrow) +
        renderC(
          emittedC.common.rootUnsignedInitializerSuffix,
          state.completionSlotStart + slot,
        ),
    );
    line(state, renderC(emittedC.terminator.gotoAbruptStatement));
    line(state, renderC(emittedC.common.closeBlock));
    line(state, renderC(emittedC.terminator.switchCompletionUTargetOpen, slot));
    for (const target of state.blockParameters.keys()) {
      if (target === 0) continue;
      line(
        state,
        renderC(emittedC.common.caseUGotoBbStatement, target, target),
      );
    }
    line(state, renderC(emittedC.common.defaultAbortStatement));
    line(state, renderC(emittedC.common.closeBlock));
  } else {
    line(state, renderC(emittedC.terminator.abortStatement));
  }
}

function maximumValueId(blocks: readonly MirBlock[]): number {
  let maximum = -1;
  for (const block of blocks) {
    for (const parameter of block.parameters ?? []) {
      maximum = Math.max(maximum, parameter);
    }
    for (const operation of block.operations) {
      maximum = Math.max(maximum, operation.id);
      if (operation.checkedResult != null) {
        maximum = Math.max(maximum, operation.checkedResult);
      }
      if (operation.iteratorNextMethodResult != null) {
        maximum = Math.max(maximum, operation.iteratorNextMethodResult);
      }
      // A generator body keeps its iterator done flags in root slots, so the
      // flag state survives a suspension taken mid-iteration.
      if (operation.iteratorDoneState != null) {
        maximum = Math.max(maximum, operation.iteratorDoneState);
      }
      if (operation.iteratorCloseResultMode != null) {
        maximum = Math.max(maximum, operation.iteratorCloseResultMode);
      }
      if (operation.iteratorValueResult != null) {
        maximum = Math.max(maximum, operation.iteratorValueResult);
      }
      if (operation.iteratorValueOnlyResult != null) {
        maximum = Math.max(maximum, operation.iteratorValueOnlyResult);
      }
      for (const argument of operation.arguments) {
        maximum = Math.max(maximum, argument);
      }
    }
    const terminator = block.terminator;
    if (terminator.kind === "return")
      maximum = Math.max(maximum, terminator.value);
    if (terminator.kind === "branch")
      maximum = Math.max(maximum, terminator.test);
    if (terminator.kind === "jump") {
      for (const value of terminator.values ?? []) {
        maximum = Math.max(maximum, value);
      }
    }
    if (terminator.kind === "generator-yield") {
      maximum = Math.max(maximum, terminator.sent, terminator.value);
    }
  }
  return maximum;
}

function bindingIds(
  functionValue: MirFunction,
  blocks: readonly MirBlock[],
  globalBindings: ReadonlyMap<number, number>,
): readonly number[] {
  const ids = new Set(
    functionValue.parameters.map((parameter) => parameter.bindingId),
  );
  for (const block of blocks) {
    for (const operation of block.operations) {
      if (operation.bindingId != null) ids.add(operation.bindingId);
    }
  }
  return [...ids]
    .filter((id) => !globalBindings.has(id))
    .toSorted((left, right) => left - right);
}

function maximumArgumentCount(blocks: readonly MirBlock[]): number {
  let maximum = 0;
  for (const block of blocks) {
    for (const operation of block.operations) {
      if (operation.kind === "call" || operation.kind === "construct") {
        if (operation.argumentListId != null) continue;
        maximum = Math.max(maximum, operation.arguments.length);
      }
    }
  }
  return maximum;
}

function completionSlotCount(blocks: readonly MirBlock[]): number {
  const usesCompletion = blocks.some(
    (block) =>
      block.terminator.kind === "resume-completion" ||
      block.operations.some(
        (operation) =>
          operation.kind === "caught" ||
          operation.kind === "completion-set" ||
          (operation.kind === "iterator-close" &&
            operation.completionSlot != null) ||
          (operation.kind === "iterator-close-start" &&
            operation.completionSlot != null) ||
          (operation.kind === "check-status" && operation.abruptTarget != null),
      ),
  );
  if (!usesCompletion) return 0;
  let count = 1;
  for (const block of blocks) count = Math.max(count, block.id + 1);
  return count;
}

function rootCount(functionValue: MirFunction): number {
  const blocks = reachableBlocks(functionValue);
  const valueSlotCount = maximumValueId(blocks) + 1;
  const baseRootCount = Math.max(
    functionValue.rootSlotCount,
    valueSlotCount + 2,
    32,
  );
  return (
    baseRootCount + maximumArgumentCount(blocks) + completionSlotCount(blocks)
  );
}

function reachableBlocksFrom(
  functionValue: MirFunction,
  start: number,
  excluded: ReadonlySet<number> = new Set<number>(),
): readonly MirBlock[] {
  const blocks = new Map(
    functionValue.blocks.map((block) => [block.id, block]),
  );
  const pending = [start];
  const reachable = new Set<number>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id == null || reachable.has(id) || excluded.has(id)) continue;
    const block = blocks.get(id);
    if (block == null) {
      throw new Error(
        `MIR function '${functionValue.name}' has no block bb${id}.`,
      );
    }
    reachable.add(id);
    if (block.terminator.kind === "jump") {
      pending.push(block.terminator.target);
    } else if (block.terminator.kind === "generator-yield") {
      pending.push(block.terminator.resume);
      if (block.terminator.returnResume != null) {
        pending.push(block.terminator.returnResume);
      }
      if (block.terminator.throwResume != null) {
        pending.push(block.terminator.throwResume);
      }
    } else if (block.terminator.kind === "branch") {
      pending.push(block.terminator.whenFalse, block.terminator.whenTrue);
    } else if (
      block.terminator.kind === "resume-completion" &&
      (block.terminator.outerAbrupt != null ||
        block.terminator.outerFinalizer != null)
    ) {
      if (block.terminator.outerAbrupt != null) {
        pending.push(block.terminator.outerAbrupt.blockId);
      }
      if (block.terminator.outerFinalizer != null) {
        pending.push(block.terminator.outerFinalizer.blockId);
      }
    }
    for (const operation of block.operations) {
      if (operation.abruptTarget != null) {
        pending.push(operation.abruptTarget.blockId);
      }
      if (operation.completionTarget != null) {
        pending.push(operation.completionTarget.blockId);
      }
    }
  }
  return functionValue.blocks.filter((block) => reachable.has(block.id));
}

function reachableBlocks(functionValue: MirFunction): readonly MirBlock[] {
  return reachableBlocksFrom(functionValue, 0);
}

function calledFunctionIds(functionValue: MirFunction): readonly number[] {
  return reachableBlocks(functionValue).flatMap((block) =>
    block.operations.flatMap((operation) =>
      operation.kind === "function-create" && operation.functionId != null
        ? [operation.functionId]
        : operation.kind === "call" && operation.target?.kind === "function"
          ? [operation.target.functionId]
          : [],
    ),
  );
}

function reachableFunctions(input: MirProgram): readonly MirFunction[] {
  const functions = new Map(
    input.functions.map((functionValue) => [functionValue.id, functionValue]),
  );
  const pending = [...calledFunctionIds(input.script)];
  const reachable = new Set<number>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id == null || reachable.has(id)) continue;
    const functionValue = functions.get(id);
    if (functionValue == null) {
      throw new Error(`MIR has no declared function @f${id}.`);
    }
    reachable.add(id);
    pending.push(...calledFunctionIds(functionValue));
  }
  return input.functions.filter((functionValue) =>
    reachable.has(functionValue.id),
  );
}

function hasSelfCall(functionValue: MirFunction): boolean {
  return calledFunctionIds(functionValue).includes(functionValue.id);
}

/** Where one suspension continues, by the kind of resumption it receives. */
interface ResumePoint {
  /** The block a return completion continues at instead of the resume block. */
  readonly returnResume?: number;
  /** The slot receiving the value the resumption delivers. */
  readonly sent: number;
  /** The block a throw completion continues at instead of the resume block. */
  readonly throwResume?: number;
}

/** Resume block identifiers paired with their resumption continuations. */
function yieldResumePoints(
  blocks: readonly MirBlock[],
): ReadonlyMap<number, ResumePoint> {
  const points = new Map<number, ResumePoint>();
  for (const block of blocks) {
    if (block.terminator.kind !== "generator-yield") continue;
    const terminator = block.terminator;
    points.set(terminator.resume, {
      ...(terminator.returnResume == null
        ? {}
        : { returnResume: terminator.returnResume }),
      sent: terminator.sent,
      ...(terminator.throwResume == null
        ? {}
        : { throwResume: terminator.throwResume }),
    });
  }
  return points;
}

/**
 * GlobalDeclarationInstantiation's global-object bindings, installed
 * once at the start of the script after every binding cell exists and
 * before any statement runs. Each property stores the cell itself, so
 * the property and the binding are one storage location for the whole
 * execution and no initial value is copied between them.
 */
function emitGlobalObject(
  state: EmitState,
  bindings: readonly MirGlobalBinding[],
): void {
  if (bindings.length === 0) return;
  const pointers: string[] = [];
  const lengths: number[] = [];
  for (const [index, binding] of bindings.entries()) {
    const units = utf16Units(binding.name);
    lengths.push(units.length);
    if (units.length === 0) {
      pointers.push(renderC(emittedC.common.nullPointer));
      continue;
    }
    const constantName = renderC(emittedC.globalObject.units, index);
    line(
      state,
      renderC(
        emittedC.common.staticConstUint16TAssignStatement,
        constantName,
        units.join(renderC(emittedC.common.commaSpace)),
      ),
    );
    pointers.push(constantName);
  }
  const prefix = renderC(emittedC.globalObject.prefix);
  line(
    state,
    renderC(
      emittedC.moduleNamespace.staticConstUint16TPointerConstNamesAssign,
      prefix,
    ) +
      renderC(
        emittedC.common.bracedInitializer,
        pointers.join(renderC(emittedC.common.commaSpace)),
      ),
  );
  line(
    state,
    renderC(
      emittedC.moduleNamespace.staticConstSizeTLengthsAssignStatement,
      prefix,
      lengths.join(renderC(emittedC.common.commaSpace)),
    ),
  );
  line(
    state,
    renderC(emittedC.moduleNamespace.staticConstSizeTBindingsAssign, prefix) +
      renderC(
        emittedC.common.bracedInitializer,
        bindings
          .map((binding) => binding.id)
          .join(renderC(emittedC.common.commaSpace)),
      ),
  );
  line(
    state,
    renderC(emittedC.globalObject.resultAssignOseoGlobalObjectCreate) +
      renderC(emittedC.common.rootsU, state.environmentSlot, bindings.length) +
      renderC(
        emittedC.moduleNamespace.namesLengthsBindingsStatement,
        prefix,
        prefix,
        prefix,
      ),
  );
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
}

function emitPrologue(
  state: EmitState,
  functionValue: MirFunction,
  bindingIdValues: readonly number[],
  totalBindingCount: number,
  temporarySlot: number,
  globalObjectBindings: readonly MirGlobalBinding[],
): void {
  const environmentSlot = state.environmentSlot;
  if (functionValue.id < 0) {
    line(
      state,
      renderC(
        emittedC.prologue.resultAssignOseoEnvironmentCreateContextU,
        totalBindingCount,
      ),
    );
  } else {
    line(
      state,
      renderC(emittedC.prologue.resultAssignOseoFunctionEnvironmentContext),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(
      state,
      renderC(emittedC.prologue.resultAssignOseoEnvironmentCloneContext),
    );
  }
  line(state, renderC(emittedC.common.rootAssignResultValue, environmentSlot));
  line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  for (const bindingId of bindingIdValues) {
    line(state, renderC(emittedC.common.resultAssignOseoCellCreateContextOseo));
    line(state, renderC(emittedC.common.rootAssignResultValue, temporarySlot));
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(
      state,
      renderC(
        emittedC.prologue.resultAssignOseoEnvironmentSetContextRoots,
        environmentSlot,
      ) + renderC(emittedC.prologue.uRootsStatement, bindingId, temporarySlot),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  }
  if (functionValue.id < 0) emitGlobalObject(state, globalObjectBindings);
  if (functionValue.selfBindingId != null) {
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoEnvironmentGetContextRoots,
        environmentSlot,
      ) + renderC(emittedC.common.positionSuffix, functionValue.selfBindingId),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(
      state,
      renderC(emittedC.prologue.resultAssignOseoCellInitializeContext),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  }
  if (functionValue.argumentsBindingId != null) {
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoEnvironmentGetContextRoots,
        environmentSlot,
      ) +
        renderC(
          emittedC.common.positionSuffix,
          functionValue.argumentsBindingId,
        ),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(state, renderC(emittedC.common.rootAssignResultValue, temporarySlot));
    line(state, renderC(emittedC.prologue.resultAssignOseoArgumentsCreate));
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(
      state,
      renderC(
        emittedC.prologue.resultAssignContextRootsResultValue,
        renderC(emittedC.prologue.oseoCellInitialize),
        temporarySlot,
      ),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
  }
  const parameters = functionValue.parameters;
  const initializedParameters = new Set<number>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter == null) continue;
    line(
      state,
      renderC(
        emittedC.common.resultAssignOseoEnvironmentGetContextRoots,
        environmentSlot,
      ) + renderC(emittedC.common.positionSuffix, parameter.bindingId),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    const setter = initializedParameters.has(parameter.bindingId)
      ? renderC(emittedC.prologue.oseoCellSet)
      : renderC(emittedC.prologue.oseoCellInitialize);
    if (parameter.rest === true) {
      line(
        state,
        renderC(emittedC.common.rootAssignResultValue, temporarySlot),
      );
      line(
        state,
        renderC(emittedC.prologue.resultAssignOseoArrayCreateContextU),
      );
      line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
      line(
        state,
        renderC(
          emittedC.prologue.resultAssignContextRootsResultValue,
          setter,
          temporarySlot,
        ),
      );
      line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
      line(
        state,
        renderC(emittedC.prologue.forSizeTRestIndexAssignU, index, index) +
          renderC(
            emittedC.prologue.restIndexArgumentCountRestIndexPlusAssignU,
            index,
            index,
          ),
      );
      line(
        state,
        renderC(emittedC.prologue.resultAssignOseoArrayAppendContextResult) +
          renderC(emittedC.prologue.argumentsRestIndexStatement, index),
      );
      line(
        state,
        renderC(emittedC.prologue.ifResultStatusNotEqualOseoStatusNormalGoto),
      );
      line(state, renderC(emittedC.common.closeBlock));
      initializedParameters.add(parameter.bindingId);
      continue;
    }
    line(
      state,
      renderC(emittedC.prologue.resultAssignContextResultValue, setter) +
        renderC(emittedC.prologue.argumentCountUArguments, index, index) +
        renderC(emittedC.prologue.undefinedDefaultArgumentCallSuffix),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    initializedParameters.add(parameter.bindingId);
  }
}

function emitBlocks(
  state: EmitState,
  blocks: readonly MirBlock[],
  resumePoints: ReadonlyMap<number, ResumePoint>,
): void {
  for (const block of blocks) {
    if (block.id !== 0 || state.generator)
      line(state, renderC(emittedC.blocks.bbStatement, block.id));
    const resume = resumePoints.get(block.id);
    if (resume != null) {
      line(
        state,
        renderC(
          emittedC.blocks.rootsAssignOseoGeneratorSentGenerator,
          resume.sent,
        ),
      );
      // A return completion leaves the body from this suspension point, so
      // it runs every enclosing `finally` and iterator close on the way out,
      // and a throw completion raises the sent value there. Only a driver
      // that can deliver a resumption emits its branch: a synchronous body
      // receives no throw completion, and an awaited suspension receives no
      // return completion.
      if (resume.returnResume != null) {
        line(
          state,
          renderC(emittedC.common.ifOseoGeneratorResumeKindGeneratorEqual) +
            renderC(
              emittedC.blocks.oseoGeneratorResumeReturnGotoBbStatement,
              resume.returnResume,
            ),
        );
      }
      if (resume.throwResume != null) {
        line(
          state,
          renderC(emittedC.common.ifOseoGeneratorResumeKindGeneratorEqual) +
            renderC(
              emittedC.blocks.oseoGeneratorResumeThrowGotoBbStatement,
              resume.throwResume,
            ),
        );
      }
    }
    for (const operation of block.operations) {
      emitOperation(state, operation);
    }
    emitTerminator(state, block.terminator);
  }
}

function completionDeclaration(
  state: EmitState,
  completionSlots: number,
): string {
  if (!state.usesCompletion) return renderC(emittedC.common.empty);
  if (state.generator) {
    return (
      renderC(
        emittedC.completionDeclaration.oseoCompletionRecordPointerCompletion,
      ) +
      renderC(
        emittedC.completionDeclaration.oseoGeneratorCompletionsGeneratorLine,
      ) +
      renderC(emittedC.common.voidCompletionLine)
    );
  }
  return (
    renderC(
      emittedC.completionDeclaration.oseoCompletionRecordCompletionUAssign,
      completionSlots,
    ) +
    renderC(emittedC.completionDeclaration.uUUUNullUNullNullLine) +
    renderC(emittedC.common.voidCompletionLine)
  );
}

/** The C identifier holding one MIR function's generated body code. */
function generatorBodyName(functionValue: MirFunction): string {
  return renderC(
    emittedC.generatorBodyName.oseoGeneratorBody,
    functionValue.id,
  );
}

function emitGeneratorBody(
  functionValue: MirFunction,
  blocks: readonly MirBlock[],
  completionSlots: number,
  base: Omit<EmitState, "generator" | "lines">,
): string {
  const state: EmitState = {
    ...base,
    blockParameters: new Map(
      blocks.map((block) => [block.id, block.parameters ?? []]),
    ),
    generator: true,
    lines: [],
    scalarKinds: new Map(),
  };
  const resumePoints = yieldResumePoints(blocks);
  line(
    state,
    renderC(emittedC.generatorBody.switchOseoGeneratorResumePointGenerator),
  );
  const bodyStart = functionValue.generatorBodyStart ?? 0;
  line(state, renderC(emittedC.common.caseUGotoBbStatement, 0, bodyStart));
  for (const resume of resumePoints.keys()) {
    line(state, renderC(emittedC.common.caseUGotoBbStatement, resume, resume));
  }
  line(state, renderC(emittedC.common.defaultAbortStatement));
  line(state, renderC(emittedC.common.closeBlock));
  emitBlocks(state, blocks, resumePoints);
  if (state.usesAbrupt) {
    line(state, renderC(emittedC.common.abruptLabel));
    line(state, renderC(emittedC.common.returnResult));
  }
  return (
    renderC(
      emittedC.generatorBody.staticOseoResultLine,
      generatorBodyName(functionValue),
    ) +
    renderC(emittedC.common.oseoContextPointerContextLine) +
    renderC(emittedC.generatorBody.oseoValueGeneratorLine) +
    renderC(emittedC.common.functionBodyOpenLine) +
    renderC(emittedC.generatorBody.oseoValuePointerRootsAssignOseoGenerator) +
    renderC(emittedC.generatorBody.oseoValueCalleeAssignOseoGeneratorCallee) +
    renderC(emittedC.generatorBody.oseoValueReceiverAssignOseoGenerator) +
    renderC(emittedC.generatorBody.oseoResultResultAssignOseoStatusNormalOseo) +
    completionDeclaration(state, completionSlots) +
    renderC(emittedC.generatorBody.voidContextLine) +
    renderC(emittedC.common.voidCalleeLine) +
    renderC(emittedC.common.voidReceiverLine) +
    renderC(
      emittedC.common.valueThenNewline,
      state.lines.join(renderC(emittedC.common.newline)),
    ) +
    renderC(emittedC.common.closeBlockLine)
  );
}

function emitFunction(
  functionValue: MirFunction,
  functionRootCounts: ReadonlyMap<number, number>,
  totalBindingCount: number,
  observeSpecialization: boolean,
  globalObjectBindings: readonly MirGlobalBinding[],
): string {
  if (functionValue.blocks.length === 0) {
    throw new Error(`MIR function '${functionValue.name}' has no blocks.`);
  }
  const blocks = reachableBlocks(functionValue);
  const completionSlots = completionSlotCount(blocks);
  const valueSlotCount = maximumValueId(blocks) + 1;
  const bindingIdValues =
    functionValue.localBindingIds ??
    bindingIds(functionValue, blocks, new Map<number, number>());
  const environmentSlot = valueSlotCount;
  const temporarySlot = valueSlotCount + 1;
  const baseRootCount = Math.max(
    functionValue.rootSlotCount,
    valueSlotCount + 2,
    32,
  );
  const argumentSlots = maximumArgumentCount(blocks);
  const functionRootCount = functionRootCounts.get(functionValue.id);
  if (functionRootCount == null) {
    throw new Error(
      `MIR function '${functionValue.name}' has no root frame layout.`,
    );
  }
  const generator = functionValue.generator === true;
  const generatorBodyStart = functionValue.generatorBodyStart;
  const entryBlocks =
    generatorBodyStart == null
      ? blocks
      : reachableBlocksFrom(functionValue, 0, new Set([generatorBodyStart]));
  const bodyBlocks =
    generatorBodyStart == null
      ? blocks
      : reachableBlocksFrom(functionValue, generatorBodyStart);
  const base: Omit<EmitState, "generator" | "lines"> = {
    argumentSlotStart: baseRootCount,
    blockParameters: new Map(
      blocks.map((block) => [block.id, block.parameters ?? []]),
    ),
    completionSlotStart: baseRootCount + argumentSlots,
    ...(functionValue.derivedThisBindingId == null
      ? {}
      : { derivedThisBindingId: functionValue.derivedThisBindingId }),
    functionRootCounts,
    environmentSlot,
    globalObjectBindingIds: new Set(
      globalObjectBindings.map((binding) => binding.id),
    ),
    nextRecursiveTarget: 0,
    observeSpecialization,
    scalarKinds: new Map(),
    strict: functionValue.strict === true,
    usesAbrupt: false,
    usesCompletion: false,
    functionId: functionValue.id,
  };
  const state: EmitState = {
    ...base,
    blockParameters: new Map(
      (generatorBodyStart == null ? blocks : entryBlocks).map((block) => [
        block.id,
        block.parameters ?? [],
      ]),
    ),
    generator: false,
    ...(generatorBodyStart == null ? {} : { generatorBodyStart }),
    lines: [],
  };
  state.usesAbrupt = true;
  if (generator) {
    line(
      state,
      renderC(emittedC.function.resultAssignOseoGeneratorCreateContext) +
        renderC(
          emittedC.common.sourcePositionSuffix,
          functionRootCount,
          completionSlots,
        ),
    );
    line(
      state,
      renderC(emittedC.function.frameSlotsAssignResultValueStatement),
    );
    line(state, renderC(emittedC.common.gotoAbruptUnlessNormal));
    line(
      state,
      renderC(emittedC.function.rootsAssignOseoGeneratorSlotsFrameSlots),
    );
  }
  emitPrologue(
    state,
    functionValue,
    bindingIdValues,
    totalBindingCount,
    temporarySlot,
    globalObjectBindings,
  );
  if (generator) {
    if (generatorBodyStart == null) {
      line(
        state,
        renderC(emittedC.function.resultAssignOseoResultOseoStatusNormal),
      );
    } else {
      emitBlocks(state, entryBlocks, new Map<number, ResumePoint>());
    }
  } else {
    emitBlocks(state, blocks, new Map<number, ResumePoint>());
  }
  if (state.usesAbrupt) {
    line(state, renderC(emittedC.common.abruptLabel));
    line(state, renderC(emittedC.function.oseoRootsReleaseContextAddressFrame));
    line(state, renderC(emittedC.common.returnResult));
  }
  const id =
    functionValue.id < 0
      ? renderC(emittedC.common.script)
      : String(functionValue.id);
  const entry =
    renderC(emittedC.function.staticOseoResultOseoFunctionLine, id) +
    renderC(emittedC.common.oseoContextPointerContextLine) +
    renderC(emittedC.function.oseoValueCalleeLine) +
    renderC(emittedC.function.oseoValueReceiverLine) +
    renderC(emittedC.function.sizeTArgumentCountLine) +
    renderC(emittedC.function.constOseoValuePointerArgumentsLine) +
    renderC(emittedC.function.oseoValueNewTargetLine) +
    renderC(emittedC.common.functionBodyOpenLine) +
    renderC(emittedC.function.oseoRootFrameFrameAssignNullNullULine) +
    renderC(emittedC.function.oseoValuePointerRootsLine) +
    renderC(emittedC.common.oseoResultResultLine) +
    completionDeclaration(state, completionSlots) +
    renderC(emittedC.common.voidCalleeLine) +
    renderC(emittedC.common.voidReceiverLine) +
    renderC(emittedC.function.voidArgumentCountLine) +
    renderC(emittedC.function.voidArgumentsLine) +
    renderC(emittedC.function.voidNewTargetLine) +
    renderC(emittedC.function.resultAssignOseoRootsAllocate) +
    renderC(
      emittedC.function.contextAddressFrameULine,
      generator ? 1 : functionRootCount,
    ) +
    renderC(emittedC.function.ifResultStatusNotEqualOseoStatusNormal) +
    renderC(emittedC.function.rootsAssignFrameSlotsLine) +
    renderC(
      emittedC.common.valueThenNewline,
      state.lines.join(renderC(emittedC.common.newline)),
    ) +
    renderC(emittedC.common.closeBlockLine);
  if (!generator) return entry;
  return renderC(
    emittedC.function.newline,
    entry,
    emitGeneratorBody(functionValue, bodyBlocks, completionSlots, base),
  );
}

function prototype(functionValue: MirFunction): string {
  const id =
    functionValue.id < 0
      ? renderC(emittedC.common.script)
      : String(functionValue.id);
  const entry =
    renderC(emittedC.prototype.staticOseoResultOseoFunction, id) +
    renderC(emittedC.prototype.oseoContextPointerOseoValueOseoValueSizeT) +
    renderC(emittedC.prototype.constOseoValuePointerOseoValueStatement);
  return functionValue.generator === true
    ? renderC(
        emittedC.prototype.staticOseoResult,
        entry,
        generatorBodyName(functionValue),
      ) + renderC(emittedC.prototype.oseoContextPointerOseoValueStatement)
    : entry;
}

/** Route a resumed generator to the body code its function identity owns. */
function emitGeneratorDispatcher(
  functions: readonly MirFunction[],
): string | undefined {
  const generators = functions.filter(
    (functionValue) => functionValue.generator === true,
  );
  if (generators.length === 0) return undefined;
  const cases = generators
    .map((functionValue) =>
      renderC(
        emittedC.generatorDispatcher.caseClause,
        functionValue.id,
        generatorBodyName(functionValue),
      ),
    )
    .join(renderC(emittedC.common.newline));
  return renderC(emittedC.generatorDispatcher.source, cases);
}

function emitFunctionDispatcher(
  functions: readonly MirFunction[],
  functionRootCounts: ReadonlyMap<number, number>,
): string {
  const cases: string[] = [];
  for (const functionValue of functions) {
    const count = functionRootCounts.get(functionValue.id);
    if (count == null) {
      throw new Error(
        `MIR function '${functionValue.name}' has no root frame layout.`,
      );
    }
    cases.push(
      renderC(
        emittedC.functionDispatcher.caseClause,
        functionValue.id,
        count,
        functionValue.id,
        count,
      ),
    );
  }
  const casesSection =
    cases.length === 0
      ? renderC(emittedC.common.empty)
      : renderC(
          emittedC.common.valueThenNewline,
          cases.join(renderC(emittedC.common.newline)),
        );
  return renderC(emittedC.functionDispatcher.source, casesSection);
}

/**
 * The global this value is reachable only through the operation that
 * resolves it, so a program that never resolves one cannot observe the
 * global object, its properties, or their descriptors. Such a program
 * installs nothing and keeps the ordinary binding assignment path.
 */
function observesGlobalThis(functions: readonly MirFunction[]): boolean {
  return functions.some((functionValue) =>
    functionValue.blocks.some((block) =>
      block.operations.some((operation) => operation.kind === "global-this"),
    ),
  );
}

/** Deterministic C11 lowering whose only semantic input is MIR. */
export const cBackend: NativeBackend = {
  emit(input) {
    const declaredFunctions = reachableFunctions(input);
    const functions = [...declaredFunctions, input.script];
    const globalObjectBindings = observesGlobalThis(functions)
      ? input.globalObjectBindings
      : [];
    const functionRootCounts = new Map(
      functions.map((functionValue) => [
        functionValue.id,
        rootCount(functionValue),
      ]),
    );
    const scriptRootCount = functionRootCounts.get(input.script.id);
    if (scriptRootCount == null) {
      throw new Error("MIR script has no root frame layout.");
    }
    let totalBindingCount = 0;
    for (const functionValue of functions) {
      for (const bindingId of functionValue.localBindingIds ?? []) {
        totalBindingCount = Math.max(totalBindingCount, bindingId + 1);
      }
      for (const parameter of functionValue.parameters) {
        totalBindingCount = Math.max(
          totalBindingCount,
          parameter.bindingId + 1,
        );
      }
      // A class-scope name binding creates its cell where the class
      // expression evaluates rather than in a declaration prologue, so
      // the environment must still reserve its slot.
      for (const block of functionValue.blocks) {
        for (const operation of block.operations) {
          if (operation.bindingId == null) continue;
          totalBindingCount = Math.max(
            totalBindingCount,
            operation.bindingId + 1,
          );
        }
      }
    }
    for (const binding of input.globalBindings) {
      totalBindingCount = Math.max(totalBindingCount, binding.id + 1);
    }
    for (const binding of input.globalObjectBindings) {
      totalBindingCount = Math.max(totalBindingCount, binding.id + 1);
    }
    const declarations = functions
      .map(prototype)
      .join(renderC(emittedC.common.newline));
    const dispatcher = emitFunctionDispatcher(
      declaredFunctions,
      functionRootCounts,
    );
    const generatorDispatcher = emitGeneratorDispatcher(declaredFunctions);
    const functionReferences = declaredFunctions
      .map((functionValue) =>
        renderC(emittedC.program.voidOseoFunctionStatement, functionValue.id),
      )
      .join(renderC(emittedC.common.newline));
    const definitions = functions
      .map((functionValue) =>
        emitFunction(
          functionValue,
          functionRootCounts,
          totalBindingCount,
          input.observeSpecialization === true,
          globalObjectBindings,
        ),
      )
      .join(renderC(emittedC.common.newline));
    const sourceId = escapeCString(input.sourceId);
    const sourceIdByteLength = new TextEncoder().encode(input.sourceId).length;
    const empty = renderC(emittedC.common.empty);
    const functionEntryType = declaredFunctions.some(hasSelfCall)
      ? renderC(emittedC.program.typedefOseoResultPointerOseoFunctionEntry) +
        renderC(emittedC.program.oseoContextPointerOseoValueOseoValueSizeT) +
        renderC(emittedC.program.constOseoValuePointerOseoValueLine)
      : empty;
    const generatorDispatcherSection =
      generatorDispatcher == null
        ? empty
        : renderC(emittedC.common.valueThenBlankLine, generatorDispatcher);
    const generatorRegistration =
      generatorDispatcher == null
        ? empty
        : renderC(emittedC.program.oseoContextSetGeneratorDispatcherLine) +
          renderC(emittedC.program.addressContextOseoDispatchGeneratorLine);
    const specializationObservation =
      input.observeSpecialization === true
        ? renderC(emittedC.program.contextObserveSpecializationAssignTrueLine)
        : empty;
    const observations =
      input.observeSpecialization === true
        ? renderC(emittedC.program.oseoContextPrintObservationsAddressContext)
        : empty;
    return {
      source: renderC(
        emittedC.program.source,
        functionEntryType,
        declarations,
        dispatcher,
        generatorDispatcherSection,
        definitions,
        functionReferences,
        functionReferences === empty ? empty : renderC(emittedC.common.newline),
        sourceId,
        sourceIdByteLength,
        generatorRegistration,
        specializationObservation,
        scriptRootCount,
        scriptRootCount,
        observations,
      ),
      sourceName: "generated.c",
    };
  },
};
