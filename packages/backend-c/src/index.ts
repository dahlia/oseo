import type {
  BinaryOperator,
  MirBlock,
  MirConstant,
  MirFunction,
  MirOperation,
  MirProgram,
  MirTerminator,
  NativeBackend,
  SourceRange,
} from "@oseo/compiler";

interface EmitState {
  readonly argumentSlotStart: number;
  readonly bindings: Map<number, number>;
  readonly functionId: number;
  readonly functionRootCounts: ReadonlyMap<number, number>;
  readonly globalBindings: ReadonlyMap<number, number>;
  readonly lines: string[];
  readonly blockParameters: ReadonlyMap<number, readonly number[]>;
  readonly scalarKinds: Map<number, "boolean" | "smi">;
  readonly observeSpecialization: boolean;
  nextRecursiveTarget: number;
  usesAbrupt: boolean;
}

function escapeCString(value: string): string {
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === "\\") result += "\\\\";
    else if (character === '"') result += '\\"';
    else if (character === "?") result += "\\?";
    else if (character === "\n") result += "\\n";
    else if (codePoint != null && codePoint >= 0x20 && codePoint <= 0x7e) {
      result += character;
    } else if (codePoint != null) {
      const bytes = new TextEncoder().encode(character);
      for (const byte of bytes) {
        result += `\\${byte.toString(8).padStart(3, "0")}`;
      }
    }
  }
  return result;
}

function line(state: EmitState, source: string): void {
  state.lines.push(`    ${source}`);
}

function location(state: EmitState, range: SourceRange): void {
  line(
    state,
    `oseo_context_location(context, ${range.start.line}u, ` +
      `${range.start.column}u);`,
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
    "!==": "oseo_not_strict_equal",
    "*": "oseo_multiply",
    "+": "oseo_add",
    "-": "oseo_subtract",
    "/": "oseo_divide",
    "<": "oseo_less_than",
    "<=": "oseo_less_equal",
    "===": "oseo_strict_equal",
    ">": "oseo_greater_than",
    ">=": "oseo_greater_equal",
  };
  return helpers[operator];
}

function numberLiteral(value: number): string {
  if (Number.isNaN(value)) return "NAN";
  if (value === Infinity) return "INFINITY";
  if (value === -Infinity) return "-INFINITY";
  if (Object.is(value, -0)) return "-0.0";
  const text = value.toString();
  if (Number.isInteger(value) && !text.includes("e")) return `${text}.0`;
  return text;
}

function emitStringConstant(
  state: EmitState,
  operation: MirOperation,
  value: string,
): void {
  const units: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    units.push(value.charCodeAt(index));
  }
  let input = "NULL, 0u";
  if (units.length > 0) {
    const name = `string_units_${operation.id}`;
    line(state, `static const uint16_t ${name}[] = {${units.join(", ")}};`);
    input = `${name}, ${units.length}u`;
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, `result = oseo_string_from_units(context, ${input});`);
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitConstant(
  state: EmitState,
  operation: MirOperation,
  constant: MirConstant,
): void {
  if (constant.kind === "string") {
    emitStringConstant(state, operation, constant.value);
  } else if (constant.kind === "undefined") {
    line(state, `roots[${operation.id}] = oseo_undefined();`);
  } else if (constant.kind === "null") {
    line(state, `roots[${operation.id}] = oseo_null();`);
  } else if (constant.kind === "boolean") {
    const value = constant.value ? "true" : "false";
    line(state, `roots[${operation.id}] = oseo_boolean(${value});`);
  } else {
    const value = numberLiteral(constant.value);
    line(state, `roots[${operation.id}] = oseo_number(${value});`);
  }
}

function emitArguments(
  state: EmitState,
  operation: MirOperation,
): { readonly count: number; readonly name: string } {
  if (operation.arguments.length === 0) {
    return { count: 0, name: "NULL" };
  }
  for (let index = 0; index < operation.arguments.length; index += 1) {
    const value = operationArgument(operation, index);
    line(state, `roots[${state.argumentSlotStart + index}] = roots[${value}];`);
  }
  return {
    count: operation.arguments.length,
    name: `&roots[${state.argumentSlotStart}]`,
  };
}

function emitRead(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  const globalSlot =
    bindingId == null ? undefined : state.globalBindings.get(bindingId);
  const bindingSlot =
    bindingId == null ? undefined : state.bindings.get(bindingId);
  if (globalSlot == null && bindingSlot == null) {
    throw new Error(`MIR read %${operation.id} has no bound value.`);
  }
  const value =
    globalSlot == null
      ? `roots[${String(bindingSlot)}]`
      : `oseo_global_bindings[${globalSlot}]`;
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, `result = oseo_read_binding(context, ${value});`);
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitWrite(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR write %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  const globalSlot = state.globalBindings.get(bindingId);
  const bindingSlot = state.bindings.get(bindingId);
  if (globalSlot == null && bindingSlot == null) {
    throw new Error(`MIR write %${operation.id} has no binding slot.`);
  }
  line(state, `roots[${operation.id}] = roots[${value}];`);
  if (globalSlot == null) {
    line(state, `roots[${String(bindingSlot)}] = roots[${value}];`);
  } else {
    line(state, `oseo_global_bindings[${globalSlot}] = roots[${value}];`);
  }
}

function emitUnary(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  if (operation.operator === "!") {
    line(
      state,
      `roots[${operation.id}] = ` +
        `oseo_boolean(!oseo_to_boolean(roots[${argument}]));`,
    );
    return;
  }
  if (operation.operator !== "-") {
    throw new Error(`MIR unary %${operation.id} has no valid operator.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, `result = oseo_negate(context, roots[${argument}]);`);
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitBinary(state: EmitState, operation: MirOperation): void {
  const operator = operation.operator;
  if (
    operator == null ||
    operator === "!" ||
    (operator === "-" && operation.arguments.length !== 2)
  ) {
    throw new Error(`MIR binary %${operation.id} has no valid operator.`);
  }
  const left = operationArgument(operation, 0);
  const right = operationArgument(operation, 1);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = ${operatorHelper(operator)}` +
      `(context, roots[${left}], roots[${right}]);`,
  );
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitGuardSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "boolean");
  line(
    state,
    `bool fast_${operation.id} = oseo_value_is_smi(roots[${argument}]);`,
  );
}

function emitUnboxSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "smi");
  line(
    state,
    `int64_t fast_${operation.id} = ` +
      `oseo_value_unbox_smi(roots[${argument}]);`,
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
  line(state, `int64_t fast_${result};`);
  line(
    state,
    `bool fast_${operation.id} = oseo_smi_try_add(` +
      `fast_${left}, fast_${right}, &fast_${result});`,
  );
}

function emitBoxSmi(state: EmitState, operation: MirOperation): void {
  const argument = operationArgument(operation, 0);
  if (state.scalarKinds.get(argument) !== "smi") {
    throw new Error(`MIR box %${operation.id} has no small integer input.`);
  }
  line(state, `roots[${operation.id}] = oseo_value_box_smi(fast_${argument});`);
}

function emitCall(state: EmitState, operation: MirOperation): void {
  const target = operation.target;
  if (target == null) {
    throw new Error(`MIR call %${operation.id} has no target.`);
  }
  const argumentsValue = emitArguments(state, operation);
  location(state, operation.range);
  state.usesAbrupt = true;
  if (target.kind === "console-log") {
    line(
      state,
      `result = oseo_console_log(context, ${argumentsValue.count}u, ` +
        `${argumentsValue.name});`,
    );
  } else {
    const targetRootCount = state.functionRootCounts.get(target.functionId);
    if (targetRootCount == null) {
      throw new Error(
        `MIR call %${operation.id} targets unknown function ` +
          `'${target.functionId}'.`,
      );
    }
    let functionName = `oseo_function_${target.functionId}`;
    if (target.functionId === state.functionId) {
      functionName = `recursive_target_${state.nextRecursiveTarget}`;
      state.nextRecursiveTarget += 1;
      line(
        state,
        `OseoFunctionEntry volatile ${functionName} = ` +
          `oseo_function_${target.functionId};`,
      );
    }
    line(state, "result = oseo_call_enter(context);");
    line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
    line(state, `    result = oseo_frame_enter(context, ${targetRootCount}u);`);
    line(state, "    if (result.status == OSEO_STATUS_NORMAL) {");
    line(
      state,
      `        result = ${functionName}` +
        `(context, oseo_undefined(), oseo_undefined(), ` +
        `${argumentsValue.count}u, ${argumentsValue.name}, ` +
        "oseo_undefined());",
    );
    line(state, `        oseo_frame_leave(context, ${targetRootCount}u);`);
    line(state, "    }");
    line(state, "    oseo_call_leave(context);");
    line(state, "}");
  }
  line(state, `roots[${operation.id}] = result.value;`);
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
      `result = oseo_array_create(context, ${operation.arrayLength}u);`,
    );
  } else if (operation.kind === "object-create") {
    line(state, "result = oseo_object_create(context, oseo_null());");
  } else if (operation.kind === "property-key") {
    const input = operationArgument(operation, 0);
    line(state, `result = oseo_property_key(context, roots[${input}]);`);
  } else {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    if (operation.kind === "property-get") {
      line(
        state,
        `result = oseo_object_get(context, roots[${object}], ` +
          `roots[${key}]);`,
      );
    } else if (operation.kind === "property-delete") {
      line(
        state,
        `result = oseo_object_delete(context, roots[${object}], ` +
          `roots[${key}]);`,
      );
    } else {
      const value = operationArgument(operation, 2);
      line(
        state,
        `result = oseo_object_set(context, roots[${object}], ` +
          `roots[${key}], roots[${value}]);`,
      );
    }
  }
  line(state, `roots[${operation.id}] = result.value;`);
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
  } else if (operation.kind === "unary") {
    emitUnary(state, operation);
  } else if (operation.kind === "binary") {
    emitBinary(state, operation);
  } else if (operation.kind === "guard-smi") {
    emitGuardSmi(state, operation);
  } else if (operation.kind === "unbox-smi") {
    emitUnboxSmi(state, operation);
  } else if (operation.kind === "add-smi-checked") {
    emitCheckedAdd(state, operation);
  } else if (operation.kind === "box-smi") {
    emitBoxSmi(state, operation);
  } else if (operation.kind === "count-guard-hit") {
    if (state.observeSpecialization) {
      line(state, "context->guard_hits += 1u;");
    }
  } else if (operation.kind === "count-guard-miss") {
    if (state.observeSpecialization) {
      line(state, "context->guard_misses += 1u;");
    }
  } else if (operation.kind === "count-overflow-miss") {
    if (state.observeSpecialization) {
      line(state, "context->overflow_misses += 1u;");
    }
  } else if (operation.kind === "call") {
    emitCall(state, operation);
  } else if (
    operation.kind === "array-create" ||
    operation.kind === "object-create" ||
    operation.kind === "property-key" ||
    operation.kind === "property-delete" ||
    operation.kind === "property-get" ||
    operation.kind === "property-set"
  ) {
    emitObjectOperation(state, operation);
  } else if (operation.kind === "check-status") {
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  }
}

function emitTerminator(state: EmitState, terminator: MirTerminator): void {
  if (terminator.kind === "return") {
    line(
      state,
      `result = (OseoResult){OSEO_STATUS_NORMAL, ` +
        `roots[${terminator.value}]};`,
    );
    line(state, "oseo_roots_release(context, &frame);");
    line(state, "return result;");
  } else if (terminator.kind === "jump") {
    const parameters = state.blockParameters.get(terminator.target) ?? [];
    const values = terminator.values ?? [];
    if (parameters.length !== values.length) {
      throw new Error(
        `MIR jump to bb${terminator.target} has ${values.length} values ` +
          `for ${parameters.length} parameters.`,
      );
    }
    for (let index = 0; index < parameters.length; index += 1) {
      line(state, `roots[${parameters[index]}] = roots[${values[index]}];`);
    }
    line(state, `goto bb${terminator.target};`);
  } else if (terminator.kind === "branch") {
    const test =
      state.scalarKinds.get(terminator.test) === "boolean"
        ? `fast_${terminator.test}`
        : `oseo_to_boolean(roots[${terminator.test}])`;
    line(state, `if (${test}) goto bb${terminator.whenTrue};`);
    line(state, `goto bb${terminator.whenFalse};`);
  } else {
    line(state, "abort();");
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
      if (operation.kind === "call") {
        maximum = Math.max(maximum, operation.arguments.length);
      }
    }
  }
  return maximum;
}

function rootCount(
  functionValue: MirFunction,
  globalBindings: ReadonlyMap<number, number>,
): number {
  const blocks = reachableBlocks(functionValue);
  const valueSlotCount = maximumValueId(blocks) + 1;
  const localBindingCount = bindingIds(
    functionValue,
    blocks,
    globalBindings,
  ).length;
  const baseRootCount = Math.max(
    functionValue.rootSlotCount,
    valueSlotCount + localBindingCount,
    32,
  );
  return baseRootCount + maximumArgumentCount(blocks);
}

function reachableBlocks(functionValue: MirFunction): readonly MirBlock[] {
  const blocks = new Map(
    functionValue.blocks.map((block) => [block.id, block]),
  );
  const pending = [0];
  const reachable = new Set<number>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id == null || reachable.has(id)) continue;
    const block = blocks.get(id);
    if (block == null) {
      throw new Error(
        `MIR function '${functionValue.name}' has no block bb${id}.`,
      );
    }
    reachable.add(id);
    if (block.terminator.kind === "jump") {
      pending.push(block.terminator.target);
    } else if (block.terminator.kind === "branch") {
      pending.push(block.terminator.whenFalse, block.terminator.whenTrue);
    }
  }
  return functionValue.blocks.filter((block) => reachable.has(block.id));
}

function calledFunctionIds(functionValue: MirFunction): readonly number[] {
  return reachableBlocks(functionValue).flatMap((block) =>
    block.operations.flatMap((operation) =>
      operation.kind === "call" && operation.target?.kind === "function"
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

function emitFunction(
  functionValue: MirFunction,
  globalBindings: ReadonlyMap<number, number>,
  functionRootCounts: ReadonlyMap<number, number>,
  observeSpecialization: boolean,
): string {
  if (functionValue.blocks.length === 0) {
    throw new Error(`MIR function '${functionValue.name}' has no blocks.`);
  }
  const blocks = reachableBlocks(functionValue);
  const valueSlotCount = maximumValueId(blocks) + 1;
  const parameters = functionValue.parameters;
  const bindingIdValues = bindingIds(functionValue, blocks, globalBindings);
  const baseRootCount = Math.max(
    functionValue.rootSlotCount,
    valueSlotCount + bindingIdValues.length,
    32,
  );
  const functionRootCount = functionRootCounts.get(functionValue.id);
  if (functionRootCount == null) {
    throw new Error(
      `MIR function '${functionValue.name}' has no root frame layout.`,
    );
  }
  const state: EmitState = {
    argumentSlotStart: baseRootCount,
    bindings: new Map(
      bindingIdValues.map((bindingId, index) => [
        bindingId,
        valueSlotCount + index,
      ]),
    ),
    blockParameters: new Map(
      blocks.map((block) => [block.id, block.parameters ?? []]),
    ),
    functionRootCounts,
    globalBindings,
    lines: [],
    nextRecursiveTarget: 0,
    observeSpecialization,
    scalarKinds: new Map(),
    usesAbrupt: false,
    functionId: functionValue.id,
  };
  const parameterBindingIds = new Set(
    parameters.map((parameter) => parameter.bindingId),
  );
  for (const bindingId of bindingIdValues) {
    if (parameterBindingIds.has(bindingId)) continue;
    const bindingSlot = state.bindings.get(bindingId);
    if (bindingSlot == null) continue;
    line(state, `roots[${bindingSlot}] = oseo_uninitialized();`);
  }
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter == null) continue;
    const parameterSlot = state.bindings.get(parameter.bindingId);
    if (parameterSlot == null) continue;
    line(
      state,
      `roots[${parameterSlot}] = argument_count > ${index}u ` +
        `? arguments[${index}] : oseo_undefined();`,
    );
  }
  for (const block of blocks) {
    if (block.id !== 0) line(state, `bb${block.id}:;`);
    for (const operation of block.operations) {
      emitOperation(state, operation);
    }
    emitTerminator(state, block.terminator);
  }
  if (state.usesAbrupt) {
    line(state, "abrupt:");
    line(state, "oseo_roots_release(context, &frame);");
    line(state, "return result;");
  }
  const id = functionValue.id < 0 ? "script" : String(functionValue.id);
  return (
    `static OseoResult oseo_function_${id}(\n` +
    "    OseoContext *context,\n" +
    "    OseoValue callee,\n" +
    "    OseoValue receiver,\n" +
    "    size_t argument_count,\n" +
    "    const OseoValue *arguments,\n" +
    "    OseoValue new_target\n" +
    ") {\n" +
    "    OseoRootFrame frame = {NULL, NULL, 0u};\n" +
    "    OseoValue *roots;\n" +
    "    OseoResult result;\n" +
    "    (void)callee;\n" +
    "    (void)receiver;\n" +
    "    (void)argument_count;\n" +
    "    (void)arguments;\n" +
    "    (void)new_target;\n" +
    `    result = oseo_roots_allocate(` +
    `context, &frame, ${functionRootCount}u);\n` +
    "    if (result.status != OSEO_STATUS_NORMAL) return result;\n" +
    "    roots = frame.slots;\n" +
    `${state.lines.join("\n")}\n` +
    "}\n"
  );
}

function prototype(functionValue: MirFunction): string {
  const id = functionValue.id < 0 ? "script" : String(functionValue.id);
  return (
    `static OseoResult oseo_function_${id}(` +
    "OseoContext *, OseoValue, OseoValue, size_t, " +
    "const OseoValue *, OseoValue);"
  );
}

/** Deterministic C11 lowering whose only semantic input is MIR. */
export const cBackend: NativeBackend = {
  emit(input) {
    const declaredFunctions = reachableFunctions(input);
    const functions = [...declaredFunctions, input.script];
    const globalBindings = new Map(
      input.globalBindings.map((binding, index) => [binding.id, index]),
    );
    const functionRootCounts = new Map(
      functions.map((functionValue) => [
        functionValue.id,
        rootCount(functionValue, globalBindings),
      ]),
    );
    const scriptRootCount = functionRootCounts.get(input.script.id);
    if (scriptRootCount == null) {
      throw new Error("MIR script has no root frame layout.");
    }
    const globalDeclaration =
      input.globalBindings.length === 0
        ? ""
        : `static OseoValue ` +
          `oseo_global_bindings[${input.globalBindings.length}];\n\n`;
    const globalInitialization = input.globalBindings
      .map(
        (_, index) =>
          `    oseo_global_bindings[${index}] = oseo_uninitialized();`,
      )
      .join("\n");
    const declarations = functions.map(prototype).join("\n");
    const definitions = functions
      .map((functionValue) =>
        emitFunction(
          functionValue,
          globalBindings,
          functionRootCounts,
          input.observeSpecialization === true,
        ),
      )
      .join("\n");
    const sourceId = escapeCString(input.sourceId);
    const sourceIdByteLength = new TextEncoder().encode(input.sourceId).length;
    const functionEntryType = declaredFunctions.some(hasSelfCall)
      ? "typedef OseoResult (*OseoFunctionEntry)(\n" +
        "    OseoContext *, OseoValue, OseoValue, size_t,\n" +
        "    const OseoValue *, OseoValue);\n\n"
      : "";
    return {
      source:
        '#include "oseo_runtime.h"\n\n' +
        "#include <math.h>\n" +
        "#include <stddef.h>\n" +
        "#include <stdint.h>\n" +
        "#include <stdlib.h>\n\n" +
        functionEntryType +
        globalDeclaration +
        `${declarations}\n\n` +
        `${definitions}\n` +
        "int main(void) {\n" +
        "    OseoContext context;\n" +
        "    OseoResult result;\n" +
        `    oseo_context_init(\n` +
        `        &context, "${sourceId}", ${sourceIdByteLength}u);\n` +
        (input.observeSpecialization === true
          ? "    context.observe_specialization = true;\n"
          : "") +
        `${globalInitialization}${globalInitialization === "" ? "" : "\n"}` +
        `    result = oseo_frame_enter(\n` +
        `        &context, ${scriptRootCount}u);\n` +
        "    if (result.status == OSEO_STATUS_NORMAL) {\n" +
        "        result = oseo_function_script(\n" +
        "            &context, oseo_undefined(), oseo_undefined(), 0u,\n" +
        "            NULL, oseo_undefined());\n" +
        `        oseo_frame_leave(\n` +
        `            &context, ${scriptRootCount}u);\n` +
        "    }\n" +
        "    if (result.status != OSEO_STATUS_NORMAL) {\n" +
        "        oseo_context_print_error(&context);\n" +
        "        oseo_context_destroy(&context);\n" +
        "        return 1;\n" +
        "    }\n" +
        (input.observeSpecialization === true
          ? "    oseo_context_print_observations(&context);\n"
          : "") +
        "    oseo_context_destroy(&context);\n" +
        "    return 0;\n" +
        "}\n",
      sourceName: "generated.c",
    };
  },
};
