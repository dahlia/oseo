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
  readonly completionSlotStart: number;
  readonly functionId: number;
  readonly functionRootCounts: ReadonlyMap<number, number>;
  readonly lines: string[];
  readonly environmentSlot: number;
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
  nextRecursiveTarget: number;
  usesAbrupt: boolean;
  usesCompletion: boolean;
}

/** Leave a generated function with a normal completion. */
function emitNormalReturn(state: EmitState, value: string, indent = ""): void {
  line(state, `${indent}result = (OseoResult){OSEO_STATUS_NORMAL, ${value}};`);
  if (!state.generator) {
    line(state, `${indent}oseo_roots_release(context, &frame);`);
  }
  line(state, `${indent}return result;`);
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
  if (range.sourceId != null) {
    const sourceId = escapeCString(range.sourceId);
    const length = new TextEncoder().encode(range.sourceId).length;
    line(
      state,
      `oseo_context_source_location(context, "${sourceId}", ${length}u, ` +
        `${range.start.line}u, ${range.start.column}u);`,
    );
    return;
  }
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
    "!=": "oseo_not_loose_equal",
    "!==": "oseo_not_strict_equal",
    "%": "oseo_remainder",
    "&": "oseo_bitwise_and",
    "*": "oseo_multiply",
    "**": "oseo_exponentiate",
    "+": "oseo_add",
    "-": "oseo_subtract",
    "/": "oseo_divide",
    "<": "oseo_less_than",
    "<<": "oseo_shift_left",
    "<=": "oseo_less_equal",
    "==": "oseo_loose_equal",
    "===": "oseo_strict_equal",
    ">": "oseo_greater_than",
    ">=": "oseo_greater_equal",
    ">>": "oseo_shift_right",
    ">>>": "oseo_shift_right_unsigned",
    "^": "oseo_bitwise_xor",
    in: "oseo_has_property",
    instanceof: "oseo_instanceof",
    "|": "oseo_bitwise_or",
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
): { readonly count: string; readonly name: string } {
  if (operation.argumentListId != null) {
    const count = `argument_count_${operation.id}`;
    const name = `argument_values_${operation.id}`;
    line(state, `size_t ${count} = 0u;`);
    line(state, `const OseoValue *${name} = NULL;`);
    line(
      state,
      `result = oseo_argument_list_view(context, ` +
        `roots[${operation.argumentListId}], &${count}, &${name});`,
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    return { count, name };
  }
  if (operation.arguments.length === 0) {
    return { count: "0u", name: "NULL" };
  }
  for (let index = 0; index < operation.arguments.length; index += 1) {
    const value = operationArgument(operation, index);
    line(state, `roots[${state.argumentSlotStart + index}] = roots[${value}];`);
  }
  return {
    count: `${operation.arguments.length}u`,
    name: `&roots[${state.argumentSlotStart}]`,
  };
}

function emittedArgument(
  operation: MirOperation,
  emitted: { readonly count: string; readonly name: string },
  index: number,
): string {
  if (operation.argumentListId != null) {
    return (
      `(${emitted.count} > ${index}u ? ` +
      `${emitted.name}[${index}] : oseo_undefined())`
    );
  }
  const value = operation.arguments[index];
  return value == null ? "oseo_undefined()" : `roots[${value}]`;
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
    `result = oseo_environment_get(context, ` +
      `roots[${state.environmentSlot}], ${bindingId}u);`,
  );
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  line(state, "result = oseo_cell_get(context, result.value);");
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitWrite(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR write %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  line(state, `roots[${operation.id}] = roots[${value}];`);
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.mutable === false) {
    if (operation.functionNameBinding === true && !state.strict) {
      line(
        state,
        `result = (OseoResult){OSEO_STATUS_NORMAL, roots[${value}]};`,
      );
      return;
    }
    if (operation.importedBinding === true) {
      line(state, "result = oseo_write_immutable_binding(context);");
      return;
    }
    line(
      state,
      `result = oseo_environment_get(context, ` +
        `roots[${state.environmentSlot}], ${bindingId}u);`,
    );
    line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
    line(state, "    result = oseo_cell_get(context, result.value);");
    line(state, "}");
    line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
    line(state, "    result = oseo_write_immutable_binding(context);");
    line(state, "}");
    return;
  }
  line(
    state,
    `result = oseo_environment_get(context, ` +
      `roots[${state.environmentSlot}], ${bindingId}u);`,
  );
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  line(
    state,
    `result = oseo_cell_set(context, result.value, roots[${value}]);`,
  );
}

function emitInitialize(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR initialize %${operation.id} has no binding identity.`);
  }
  const value = operationArgument(operation, 0);
  line(state, `roots[${operation.id}] = roots[${value}];`);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = oseo_environment_get(context, ` +
      `roots[${state.environmentSlot}], ${bindingId}u);`,
  );
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  line(
    state,
    `result = oseo_cell_initialize(context, result.value, roots[${value}]);`,
  );
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
}

function emitBindingReset(state: EmitState, operation: MirOperation): void {
  const bindingId = operation.bindingId;
  if (bindingId == null) {
    throw new Error(`MIR binding-reset %${operation.id} has no identity.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, "result = oseo_cell_create(context, oseo_uninitialized());");
  line(state, `roots[${operation.id}] = result.value;`);
  line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
  line(
    state,
    `    result = oseo_environment_set(context, ` +
      `roots[${state.environmentSlot}], ${bindingId}u, ` +
      `roots[${operation.id}]);`,
  );
  line(state, "}");
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
  if (operation.operator === "void") {
    line(state, `roots[${operation.id}] = oseo_undefined();`);
    return;
  }
  const helpers = {
    "+": "oseo_to_number",
    "-": "oseo_negate",
    "to-string": "oseo_to_string",
    typeof: "oseo_typeof",
    "~": "oseo_bitwise_not",
  } as const;
  const operator = operation.operator;
  if (operator == null || !(operator in helpers)) {
    throw new Error(`MIR unary %${operation.id} has no valid operator.`);
  }
  const helper = helpers[operator as keyof typeof helpers];
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, `result = ${helper}(context, roots[${argument}]);`);
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitBinary(state: EmitState, operation: MirOperation): void {
  const operator = operation.operator;
  if (
    operator == null ||
    operator === "!" ||
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

function emitIteratorOperation(
  state: EmitState,
  operation: MirOperation,
): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.kind === "iterator-get") {
    const iterable = operationArgument(operation, 0);
    const nextMethod = operation.iteratorNextMethodResult;
    if (nextMethod == null) {
      throw new Error(`MIR iterator get %${operation.id} has no next method.`);
    }
    line(
      state,
      `result = oseo_iterator_get(context, roots[${iterable}], ` +
        `&roots[${nextMethod}]);`,
    );
    if (operation.iteratorDoneState != null) {
      line(state, `bool iterator_done_${operation.iteratorDoneState} = false;`);
    }
    line(state, `roots[${operation.id}] = result.value;`);
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
    const doneState = operation.iteratorDoneState ?? operation.id;
    if (operation.iteratorDoneState == null) {
      line(state, `bool iterator_done_${doneState} = true;`);
    }
    if (operation.iteratorDoneState != null) {
      line(state, `if (iterator_done_${doneState}) {`);
      line(
        state,
        `    result = (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};`,
      );
      line(state, `    roots[${value}] = oseo_undefined();`);
      line(state, "} else {");
      line(
        state,
        `    result = oseo_iterator_next(context, roots[${iterator}], ` +
          `roots[${nextMethod}], &roots[${value}], ` +
          `&iterator_done_${doneState});`,
      );
      line(state, "}");
    } else {
      line(
        state,
        `result = oseo_iterator_next(context, roots[${iterator}], ` +
          `roots[${nextMethod}], &roots[${value}], ` +
          `&iterator_done_${doneState});`,
      );
    }
    line(state, `bool fast_${operation.id} = !iterator_done_${doneState};`);
    line(state, `(void)fast_${operation.id};`);
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
      `result = oseo_iterator_close(context, roots[${iterator}], ` +
        `completion[${slot}u].kind == 2);`,
    );
  } else {
    line(state, `if (iterator_done_${operation.iteratorDoneState}) {`);
    line(
      state,
      `    result = (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};`,
    );
    line(state, "} else {");
    line(
      state,
      `    result = oseo_iterator_close(context, roots[${iterator}], ` +
        `completion[${slot}u].kind == 2);`,
    );
    line(state, "}");
  }
  line(state, `roots[${operation.id}] = result.value;`);
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
    : operation;
  location(state, operation.range);
  state.usesAbrupt = true;
  const argumentsValue = emitArguments(state, callArguments);
  if (target.kind === "await") {
    const value = operationArgument(operation, 0);
    line(state, `result = oseo_await_value(context, roots[${value}]);`);
  } else if (target.kind === "console-log") {
    line(
      state,
      `result = oseo_console_log(context, ${argumentsValue.count}, ` +
        `${argumentsValue.name});`,
    );
  } else if (target.kind === "object-intrinsic") {
    const names = {
      create: "oseo_object_builtin_create",
      defineProperty: "oseo_object_builtin_define_property",
      getOwnPropertyDescriptor:
        "oseo_object_builtin_get_own_property_descriptor",
      keys: "oseo_object_builtin_keys",
      setPrototypeOf: "oseo_object_builtin_set_prototype_of",
    } as const;
    line(
      state,
      `result = ${names[target.method]}(context, ` +
        `${argumentsValue.count}, ${argumentsValue.name});`,
    );
  } else if (target.kind === "promise-constructor") {
    const executor = emittedArgument(callArguments, argumentsValue, 0);
    line(state, `result = oseo_promise_construct(context, ${executor});`);
  } else if (target.kind === "promise-intrinsic") {
    if (target.method === "asyncCall") {
      const execution = emittedArgument(callArguments, argumentsValue, 0);
      line(state, `result = oseo_promise_async_call(context, ${execution});`);
    } else if (target.method === "awaitThen") {
      const promise = emittedArgument(callArguments, argumentsValue, 0);
      const onFulfilled = emittedArgument(callArguments, argumentsValue, 1);
      line(
        state,
        "result = oseo_promise_await_then(context, " +
          `${promise}, ${onFulfilled});`,
      );
    } else if (target.method === "then") {
      const promise = emittedArgument(callArguments, argumentsValue, 0);
      const onFulfilled = emittedArgument(callArguments, argumentsValue, 1);
      const onRejected = emittedArgument(callArguments, argumentsValue, 2);
      line(
        state,
        "result = oseo_promise_then(context, " +
          `${promise}, ${onFulfilled}, ${onRejected});`,
      );
    } else {
      const names = {
        all: "oseo_promise_all",
        race: "oseo_promise_race",
        reject: "oseo_promise_reject",
        resolve: "oseo_promise_resolve",
      } as const;
      const value = emittedArgument(callArguments, argumentsValue, 0);
      line(state, `result = ${names[target.method]}(context, ${value});`);
    }
  } else if (target.kind === "timer-intrinsic") {
    if (target.method === "setTimeout") {
      line(
        state,
        `result = oseo_set_timeout(context, ${argumentsValue.count}, ` +
          `${argumentsValue.name});`,
      );
    } else {
      const handle = emittedArgument(callArguments, argumentsValue, 0);
      line(state, `result = oseo_clear_timeout(context, ${handle});`);
    }
  } else if (target.kind === "dynamic") {
    const callee = operationArgument(operation, 0);
    const receiver = operationArgument(operation, 1);
    line(
      state,
      `result = oseo_call_function(context, roots[${callee}], ` +
        `roots[${receiver}], ${argumentsValue.count}, ` +
        `${argumentsValue.name}, ` +
        (constructing ? `roots[${callee}]);` : "oseo_undefined());"),
    );
    if (constructing) {
      line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
      line(
        state,
        `    result = oseo_constructor_result(` +
          `context, result.value, roots[${receiver}]);`,
      );
      line(state, "}");
    }
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
        `${argumentsValue.count}, ${argumentsValue.name}, ` +
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
  } else if (operation.kind === "array-append") {
    const array = operationArgument(operation, 0);
    const value = operationArgument(operation, 1);
    line(
      state,
      `result = oseo_array_append(context, roots[${array}], ` +
        `roots[${value}]);`,
    );
  } else if (operation.kind === "array-append-hole") {
    const array = operationArgument(operation, 0);
    line(state, `result = oseo_array_append_hole(context, roots[${array}]);`);
  } else if (operation.kind === "object-create") {
    line(state, "result = oseo_object_literal_create(context);");
  } else if (operation.kind === "object-coercible") {
    const input = operationArgument(operation, 0);
    line(
      state,
      `result = oseo_require_object_coercible(context, roots[${input}]);`,
    );
  } else if (operation.kind === "object-rest") {
    const object = operationArgument(operation, 0);
    const excluded = operation.arguments.slice(1);
    const excludedName = `object_rest_excluded_${operation.id}`;
    if (excluded.length > 0) {
      line(
        state,
        `OseoValue ${excludedName}[${excluded.length}u] = {` +
          excluded.map((id) => `roots[${id}]`).join(", ") +
          "};",
      );
    }
    line(
      state,
      `result = oseo_object_rest(context, roots[${object}], ` +
        `${excluded.length}u, ` +
        (excluded.length === 0 ? "NULL);" : `${excludedName});`),
    );
  } else if (operation.kind === "object-spread") {
    const object = operationArgument(operation, 0);
    const source = operationArgument(operation, 1);
    line(
      state,
      `result = oseo_object_spread(context, roots[${object}], ` +
        `roots[${source}]);`,
    );
  } else if (operation.kind === "property-key") {
    const input = operationArgument(operation, 0);
    line(state, `result = oseo_property_key(context, roots[${input}]);`);
  } else if (operation.kind === "property-define-data") {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    const value = operationArgument(operation, 2);
    line(
      state,
      `result = oseo_object_define(context, roots[${object}], ` +
        `roots[${key}], roots[${value}], ` +
        "(OseoPropertyAttributes){true, true, true, false});",
    );
  } else if (operation.kind === "property-define-accessor") {
    const object = operationArgument(operation, 0);
    const key = operationArgument(operation, 1);
    const value = operationArgument(operation, 2);
    const isSetter = operation.accessorKind === "set";
    line(
      state,
      `result = oseo_object_define_accessor(context, roots[${object}], ` +
        `roots[${key}], ` +
        `${isSetter ? "oseo_undefined()" : `roots[${value}]`}, ` +
        `${isSetter ? `roots[${value}]` : "oseo_undefined()"}, ` +
        `${isSetter ? "false" : "true"}, ${isSetter ? "true" : "false"}, ` +
        "(OseoPropertyAttributes){true, true, false, true});",
    );
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
          `roots[${key}], ${state.strict ? "true" : "false"});`,
      );
    } else {
      const value = operationArgument(operation, 2);
      line(
        state,
        `result = oseo_object_set(context, roots[${object}], ` +
          `roots[${key}], roots[${value}], ` +
          `${state.strict ? "true" : "false"});`,
      );
    }
  }
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitArgumentListOperation(
  state: EmitState,
  operation: MirOperation,
): void {
  location(state, operation.range);
  state.usesAbrupt = true;
  if (operation.kind === "argument-list-create") {
    line(state, "result = oseo_argument_list_create(context);");
  } else {
    const list = operationArgument(operation, 0);
    const value = operationArgument(operation, 1);
    line(
      state,
      `result = oseo_argument_list_append(context, roots[${list}], ` +
        `roots[${value}]);`,
    );
  }
  line(state, `roots[${operation.id}] = result.value;`);
}

function propertyCacheName(operation: MirOperation): string {
  if (operation.cacheId == null) {
    throw new Error(`MIR ${operation.kind} %${operation.id} has no cache.`);
  }
  return `property_cache_${operation.cacheId}`;
}

function emitGuardObject(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  state.scalarKinds.set(operation.id, "boolean");
  line(
    state,
    `bool fast_${operation.id} = oseo_value_is_object(roots[${object}]);`,
  );
}

function emitGuardShape(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const cache = propertyCacheName(operation);
  state.scalarKinds.set(operation.id, "boolean");
  line(state, `static OseoPropertyCache ${cache} = {0u, 0u};`);
  line(
    state,
    `bool fast_${operation.id} = oseo_property_cache_matches(` +
      `roots[${object}], &${cache});`,
  );
}

function emitLoadFixedSlot(state: EmitState, operation: MirOperation): void {
  const object = operationArgument(operation, 0);
  const cache = propertyCacheName(operation);
  line(
    state,
    `roots[${operation.id}] = ` +
      `oseo_property_cache_load(roots[${object}], &${cache});`,
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
    `oseo_property_cache_update(roots[${object}], roots[${key}], ` +
      `&${cache});`,
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
    arrow: "OSEO_FUNCTION_ARROW",
    async: "OSEO_FUNCTION_ASYNC",
    "async-arrow": "OSEO_FUNCTION_ASYNC_ARROW",
    generator: "OSEO_FUNCTION_GENERATOR",
    method: "OSEO_FUNCTION_METHOD",
    ordinary: "OSEO_FUNCTION_ORDINARY",
  } as const;
  const units = utf16Units(operation.functionName);
  let nameInput = "NULL";
  if (units.length > 0) {
    const name = `function_name_units_${operation.id}`;
    line(state, `static const uint16_t ${name}[] = {${units.join(", ")}};`);
    nameInput = name;
  }
  const inferredName =
    operation.arguments[0] == null
      ? "oseo_undefined()"
      : `roots[${operation.arguments[0]}]`;
  const namePrefixes = {
    get: "OSEO_FUNCTION_NAME_PREFIX_GET",
    set: "OSEO_FUNCTION_NAME_PREFIX_SET",
  } as const;
  const namePrefix =
    operation.accessorKind == null
      ? "OSEO_FUNCTION_NAME_PREFIX_NONE"
      : namePrefixes[operation.accessorKind];
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = oseo_function_create(context, ${operation.functionId}u, ` +
      `roots[${state.environmentSlot}], ${nameInput}, ${units.length}u, ` +
      `${operation.functionLength}u, ` +
      `${functionKinds[operation.functionKind]}, receiver, ${inferredName}, ` +
      `${namePrefix});`,
  );
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitErrorIntrinsic(state: EmitState, operation: MirOperation): void {
  const errorKinds = {
    Error: "OSEO_ERROR_ERROR",
    EvalError: "OSEO_ERROR_EVAL",
    RangeError: "OSEO_ERROR_RANGE",
    ReferenceError: "OSEO_ERROR_REFERENCE",
    SyntaxError: "OSEO_ERROR_SYNTAX",
    TypeError: "OSEO_ERROR_TYPE",
    URIError: "OSEO_ERROR_URI",
  } as const;
  if (operation.errorName == null) {
    throw new Error(`MIR error-intrinsic %${operation.id} has no name.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = oseo_error_intrinsic(context, ` +
      `${errorKinds[operation.errorName]});`,
  );
  line(state, `roots[${operation.id}] = result.value;`);
}

function emitConstructReceiver(
  state: EmitState,
  operation: MirOperation,
): void {
  const callee = operationArgument(operation, 0);
  location(state, operation.range);
  state.usesAbrupt = true;
  line(state, `result = oseo_function_prototype(context, roots[${callee}]);`);
  line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
  line(state, "    result = oseo_constructor_receiver(context, result.value);");
  line(state, "}");
  line(state, `roots[${operation.id}] = result.value;`);
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
      `result = oseo_module_namespace_create(context, ` +
        `roots[${state.environmentSlot}], 0u, NULL, NULL, NULL);`,
    );
    line(state, `roots[${operation.id}] = result.value;`);
    return;
  }
  const pointers: string[] = [];
  const lengths: number[] = [];
  for (const [index, name] of names.entries()) {
    const units = utf16Units(name);
    lengths.push(units.length);
    if (units.length === 0) {
      pointers.push("NULL");
      continue;
    }
    const constantName = `namespace_units_${operation.id}_${index}`;
    line(
      state,
      `static const uint16_t ${constantName}[] = {${units.join(", ")}};`,
    );
    pointers.push(constantName);
  }
  const prefix = `namespace_${operation.id}`;
  line(
    state,
    `static const uint16_t *const ${prefix}_names[] = ` +
      `{${pointers.join(", ")}};`,
  );
  line(
    state,
    `static const size_t ${prefix}_lengths[] = {${lengths.join(", ")}};`,
  );
  line(
    state,
    `static const size_t ${prefix}_bindings[] = ` +
      `{${namespaceBindingIds.join(", ")}};`,
  );
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = oseo_module_namespace_create(context, ` +
      `roots[${state.environmentSlot}], ${names.length}u, ` +
      `${prefix}_names, ${prefix}_lengths, ${prefix}_bindings);`,
  );
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
  } else if (operation.kind === "initialize") {
    emitInitialize(state, operation);
  } else if (operation.kind === "binding-reset") {
    emitBindingReset(state, operation);
  } else if (operation.kind === "function-create") {
    emitFunctionCreate(state, operation);
  } else if (operation.kind === "construct-receiver") {
    emitConstructReceiver(state, operation);
  } else if (operation.kind === "error-intrinsic") {
    emitErrorIntrinsic(state, operation);
  } else if (operation.kind === "symbol-intrinsic") {
    location(state, operation.range);
    state.usesAbrupt = true;
    line(state, "result = oseo_symbol_intrinsic(context);");
    line(state, `roots[${operation.id}] = result.value;`);
  } else if (operation.kind === "module-namespace-create") {
    emitModuleNamespace(state, operation);
  } else if (operation.kind === "receiver") {
    line(state, `roots[${operation.id}] = receiver;`);
  } else if (operation.kind === "caught") {
    state.usesCompletion = true;
    const slot = operation.completionSlot;
    if (slot == null) {
      throw new Error(`MIR caught %${operation.id} has no completion slot.`);
    }
    line(state, "oseo_context_clear_language_error(context);");
    line(
      state,
      `roots[${operation.id}] = roots[${state.completionSlotStart + slot}u];`,
    );
    line(
      state,
      `result = (OseoResult){OSEO_STATUS_NORMAL, ` +
        `roots[${state.completionSlotStart + slot}u]};`,
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
    line(state, `completion[${slot}u].kind = ${kinds[kind]};`);
    if (kind === "throw") {
      location(state, operation.range);
      line(state, "oseo_context_clear_language_error(context);");
      line(state, `completion[${slot}u].line = context->line;`);
      line(state, `completion[${slot}u].column = context->column;`);
      line(state, `completion[${slot}u].source_id = context->source_id;`);
      line(
        state,
        `completion[${slot}u].source_id_length = ` +
          "context->source_id_length;",
      );
      line(state, `completion[${slot}u].error_code = context->error_code;`);
      line(
        state,
        `completion[${slot}u].error_message = context->error_message;`,
      );
    }
    if (operation.arguments[0] != null) {
      line(
        state,
        `roots[${state.completionSlotStart + slot}u] = ` +
          `roots[${operation.arguments[0]}];`,
      );
    }
    if (operation.completionTarget != null) {
      line(
        state,
        `completion[${slot}u].target = ` +
          `${operation.completionTarget.blockId}u;`,
      );
      line(
        state,
        `completion[${slot}u].depth = ` +
          `${operation.completionTarget.cleanupDepth}u;`,
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
    operation.kind === "iterator-get" ||
    operation.kind === "iterator-next" ||
    operation.kind === "iterator-close"
  ) {
    emitIteratorOperation(state, operation);
  } else if (operation.kind === "load-fixed-slot") {
    emitLoadFixedSlot(state, operation);
  } else if (operation.kind === "update-property-cache") {
    emitUpdatePropertyCache(state, operation);
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
  } else if (operation.kind === "call" || operation.kind === "construct") {
    emitCall(state, operation);
  } else if (
    operation.kind === "argument-list-append" ||
    operation.kind === "argument-list-create"
  ) {
    emitArgumentListOperation(state, operation);
  } else if (
    operation.kind === "array-append" ||
    operation.kind === "array-append-hole" ||
    operation.kind === "array-create" ||
    operation.kind === "object-coercible" ||
    operation.kind === "object-create" ||
    operation.kind === "object-rest" ||
    operation.kind === "object-spread" ||
    operation.kind === "property-key" ||
    operation.kind === "property-define-accessor" ||
    operation.kind === "property-define-data" ||
    operation.kind === "property-delete" ||
    operation.kind === "property-get" ||
    operation.kind === "property-set"
  ) {
    emitObjectOperation(state, operation);
  } else if (operation.kind === "check-status") {
    if (operation.abruptTarget == null) {
      line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    } else {
      const target = operation.abruptTarget.blockId;
      state.usesCompletion = true;
      line(state, "if (result.status != OSEO_STATUS_NORMAL) {");
      line(state, "    if (context->has_diagnostic) goto abrupt;");
      line(state, `    completion[${target}u].kind = 2;`);
      line(
        state,
        `    roots[${state.completionSlotStart + target}u] = ` +
          "result.value;",
      );
      line(state, `    completion[${target}u].line = context->line;`);
      line(state, `    completion[${target}u].column = context->column;`);
      line(state, `    completion[${target}u].source_id = context->source_id;`);
      line(
        state,
        `    completion[${target}u].source_id_length = ` +
          "context->source_id_length;",
      );
      line(
        state,
        `    completion[${target}u].error_code = context->error_code;`,
      );
      line(
        state,
        `    completion[${target}u].error_message = ` +
          "context->error_message;",
      );
      line(state, `    goto bb${target};`);
      line(state, "}");
    }
  }
}

function emitCompletionCopy(
  state: EmitState,
  source: number,
  target: number,
): void {
  line(state, `    completion[${target}u] = completion[${source}u];`);
  line(
    state,
    `    roots[${state.completionSlotStart + target}u] = ` +
      `roots[${state.completionSlotStart + source}u];`,
  );
}

function emitTerminator(state: EmitState, terminator: MirTerminator): void {
  if (terminator.kind === "return") {
    emitNormalReturn(state, `roots[${terminator.value}]`);
  } else if (terminator.kind === "generator-yield") {
    line(
      state,
      `oseo_generator_suspend(context, generator, ${terminator.resume}u);`,
    );
    line(
      state,
      `result = (OseoResult){OSEO_STATUS_NORMAL, ` +
        `roots[${terminator.value}]};`,
    );
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
  } else if (terminator.kind === "resume-completion") {
    state.usesCompletion = true;
    const slot = terminator.completionSlot;
    if (terminator.outerAbrupt != null) {
      const target = terminator.outerAbrupt.blockId;
      line(state, `if (completion[${slot}u].kind == 2) {`);
      emitCompletionCopy(state, slot, target);
      line(state, `    goto bb${target};`);
      line(state, "}");
    }
    if (terminator.outerFinalizer != null) {
      const target = terminator.outerFinalizer;
      line(
        state,
        `if (completion[${slot}u].kind != 0 && ` +
          `completion[${slot}u].depth <= ${target.cleanupDepth}u) {`,
      );
      emitCompletionCopy(state, slot, target.blockId);
      line(state, `    goto bb${target.blockId};`);
      line(state, "}");
    }
    line(state, `if (completion[${slot}u].kind == 1) {`);
    emitNormalReturn(
      state,
      `roots[${state.completionSlotStart + slot}u]`,
      "    ",
    );
    line(state, "}");
    line(state, `if (completion[${slot}u].kind == 2) {`);
    line(state, `    context->line = completion[${slot}u].line;`);
    line(state, `    context->column = completion[${slot}u].column;`);
    line(state, `    context->source_id = completion[${slot}u].source_id;`);
    line(
      state,
      `    context->source_id_length = ` +
        `completion[${slot}u].source_id_length;`,
    );
    line(state, `    context->error_code = completion[${slot}u].error_code;`);
    line(
      state,
      `    context->error_message = completion[${slot}u].error_message;`,
    );
    line(state, "    context->has_diagnostic = false;");
    line(
      state,
      `    result = (OseoResult){OSEO_STATUS_THROW, ` +
        `roots[${state.completionSlotStart + slot}u]};`,
    );
    line(state, "    goto abrupt;");
    line(state, "}");
    line(state, `switch (completion[${slot}u].target) {`);
    for (const target of state.blockParameters.keys()) {
      if (target === 0) continue;
      line(state, `case ${target}u: goto bb${target};`);
    }
    line(state, "default: abort();");
    line(state, "}");
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
      if (operation.iteratorNextMethodResult != null) {
        maximum = Math.max(maximum, operation.iteratorNextMethodResult);
      }
      if (operation.iteratorValueResult != null) {
        maximum = Math.max(maximum, operation.iteratorValueResult);
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
    } else if (block.terminator.kind === "generator-yield") {
      pending.push(block.terminator.resume);
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

/** Resume block identifiers paired with the slot receiving `next`'s value. */
function yieldResumePoints(
  blocks: readonly MirBlock[],
): ReadonlyMap<number, number> {
  const points = new Map<number, number>();
  for (const block of blocks) {
    if (block.terminator.kind !== "generator-yield") continue;
    points.set(block.terminator.resume, block.terminator.sent);
  }
  return points;
}

function emitPrologue(
  state: EmitState,
  functionValue: MirFunction,
  bindingIdValues: readonly number[],
  totalBindingCount: number,
  temporarySlot: number,
): void {
  const environmentSlot = state.environmentSlot;
  if (functionValue.id < 0) {
    line(
      state,
      `result = oseo_environment_create(context, ${totalBindingCount}u);`,
    );
  } else {
    line(state, "result = oseo_function_environment(context, callee);");
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    line(state, "result = oseo_environment_clone(context, result.value);");
  }
  line(state, `roots[${environmentSlot}] = result.value;`);
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  for (const bindingId of bindingIdValues) {
    line(state, "result = oseo_cell_create(context, oseo_uninitialized());");
    line(state, `roots[${temporarySlot}] = result.value;`);
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    line(
      state,
      `result = oseo_environment_set(context, roots[${environmentSlot}], ` +
        `${bindingId}u, roots[${temporarySlot}]);`,
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  }
  if (functionValue.selfBindingId != null) {
    line(
      state,
      `result = oseo_environment_get(context, roots[${environmentSlot}], ` +
        `${functionValue.selfBindingId}u);`,
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    line(
      state,
      "result = oseo_cell_initialize(context, result.value, callee);",
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
  }
  const parameters = functionValue.parameters;
  const initializedParameters = new Set<number>();
  for (let index = 0; index < parameters.length; index += 1) {
    const parameter = parameters[index];
    if (parameter == null) continue;
    line(
      state,
      `result = oseo_environment_get(context, roots[${environmentSlot}], ` +
        `${parameter.bindingId}u);`,
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    const setter = initializedParameters.has(parameter.bindingId)
      ? "oseo_cell_set"
      : "oseo_cell_initialize";
    if (parameter.rest === true) {
      line(state, `roots[${temporarySlot}] = result.value;`);
      line(state, "result = oseo_array_create(context, 0u);");
      line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
      line(
        state,
        `result = ${setter}(context, roots[${temporarySlot}], result.value);`,
      );
      line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
      line(
        state,
        `for (size_t rest_index_${index} = ${index}u; ` +
          `rest_index_${index} < argument_count; rest_index_${index} += 1u) {`,
      );
      line(
        state,
        `    result = oseo_array_append(context, result.value, ` +
          `arguments[rest_index_${index}]);`,
      );
      line(state, "    if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
      line(state, "}");
      initializedParameters.add(parameter.bindingId);
      continue;
    }
    line(
      state,
      `result = ${setter}(context, result.value, ` +
        `(argument_count > ${index}u ? arguments[${index}] : ` +
        "oseo_undefined()));",
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    initializedParameters.add(parameter.bindingId);
  }
}

function emitBlocks(
  state: EmitState,
  blocks: readonly MirBlock[],
  resumePoints: ReadonlyMap<number, number>,
): void {
  for (const block of blocks) {
    if (block.id !== 0 || state.generator) line(state, `bb${block.id}:;`);
    const sent = resumePoints.get(block.id);
    if (sent != null) {
      line(state, `roots[${sent}] = oseo_generator_sent(generator);`);
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
  if (!state.usesCompletion) return "";
  if (state.generator) {
    return (
      "    OseoCompletionRecord *completion =\n" +
      "        oseo_generator_completions(generator);\n" +
      "    (void)completion;\n"
    );
  }
  return (
    `    OseoCompletionRecord completion[${completionSlots}u] = ` +
    "{{0, 0u, 0u, 0u, 0u, NULL, 0u, NULL, NULL}};\n" +
    "    (void)completion;\n"
  );
}

/** The C identifier holding one MIR function's generated body code. */
function generatorBodyName(functionValue: MirFunction): string {
  return `oseo_generator_body_${functionValue.id}`;
}

function emitGeneratorBody(
  functionValue: MirFunction,
  blocks: readonly MirBlock[],
  completionSlots: number,
  base: Omit<EmitState, "generator" | "lines">,
): string {
  const state: EmitState = {
    ...base,
    generator: true,
    lines: [],
    scalarKinds: new Map(),
  };
  const resumePoints = yieldResumePoints(blocks);
  line(state, "switch (oseo_generator_resume_point(generator)) {");
  for (const resume of [0, ...resumePoints.keys()]) {
    line(state, `case ${resume}u: goto bb${resume};`);
  }
  line(state, "default: abort();");
  line(state, "}");
  emitBlocks(state, blocks, resumePoints);
  if (state.usesAbrupt) {
    line(state, "abrupt:");
    line(state, "return result;");
  }
  return (
    `static OseoResult ${generatorBodyName(functionValue)}(\n` +
    "    OseoContext *context,\n" +
    "    OseoValue generator\n" +
    ") {\n" +
    "    OseoValue *roots = oseo_generator_slots(generator);\n" +
    "    OseoValue callee = oseo_generator_callee(generator);\n" +
    "    OseoValue receiver = oseo_generator_receiver(generator);\n" +
    "    OseoResult result = {OSEO_STATUS_NORMAL, oseo_undefined()};\n" +
    completionDeclaration(state, completionSlots) +
    "    (void)context;\n" +
    "    (void)callee;\n" +
    "    (void)receiver;\n" +
    `${state.lines.join("\n")}\n` +
    "}\n"
  );
}

function emitFunction(
  functionValue: MirFunction,
  functionRootCounts: ReadonlyMap<number, number>,
  totalBindingCount: number,
  observeSpecialization: boolean,
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
  const base: Omit<EmitState, "generator" | "lines"> = {
    argumentSlotStart: baseRootCount,
    blockParameters: new Map(
      blocks.map((block) => [block.id, block.parameters ?? []]),
    ),
    completionSlotStart: baseRootCount + argumentSlots,
    functionRootCounts,
    environmentSlot,
    nextRecursiveTarget: 0,
    observeSpecialization,
    scalarKinds: new Map(),
    strict: functionValue.strict === true,
    usesAbrupt: false,
    usesCompletion: false,
    functionId: functionValue.id,
  };
  const state: EmitState = { ...base, generator: false, lines: [] };
  state.usesAbrupt = true;
  if (generator) {
    line(
      state,
      `result = oseo_generator_create(context, callee, receiver, ` +
        `${functionRootCount}u, ${completionSlots}u);`,
    );
    line(state, "frame.slots[0] = result.value;");
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    line(state, "roots = oseo_generator_slots(frame.slots[0]);");
  }
  emitPrologue(
    state,
    functionValue,
    bindingIdValues,
    totalBindingCount,
    temporarySlot,
  );
  if (generator) {
    line(state, "result = (OseoResult){OSEO_STATUS_NORMAL, frame.slots[0]};");
  } else {
    emitBlocks(state, blocks, new Map<number, number>());
  }
  if (state.usesAbrupt) {
    line(state, "abrupt:");
    line(state, "oseo_roots_release(context, &frame);");
    line(state, "return result;");
  }
  const id = functionValue.id < 0 ? "script" : String(functionValue.id);
  const entry =
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
    completionDeclaration(state, completionSlots) +
    "    (void)callee;\n" +
    "    (void)receiver;\n" +
    "    (void)argument_count;\n" +
    "    (void)arguments;\n" +
    "    (void)new_target;\n" +
    `    result = oseo_roots_allocate(` +
    `context, &frame, ${generator ? 1 : functionRootCount}u);\n` +
    "    if (result.status != OSEO_STATUS_NORMAL) return result;\n" +
    "    roots = frame.slots;\n" +
    `${state.lines.join("\n")}\n` +
    "}\n";
  if (!generator) return entry;
  return `${entry}\n${emitGeneratorBody(
    functionValue,
    blocks,
    completionSlots,
    base,
  )}`;
}

function prototype(functionValue: MirFunction): string {
  const id = functionValue.id < 0 ? "script" : String(functionValue.id);
  const entry =
    `static OseoResult oseo_function_${id}(` +
    "OseoContext *, OseoValue, OseoValue, size_t, " +
    "const OseoValue *, OseoValue);";
  return functionValue.generator === true
    ? `${entry}\nstatic OseoResult ${generatorBodyName(functionValue)}(` +
        "OseoContext *, OseoValue);"
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
  return [
    "static OseoResult oseo_dispatch_generator(",
    "    OseoContext *context,",
    "    OseoValue generator",
    ") {",
    "    size_t code_id = 0u;",
    "    OseoResult result = oseo_function_code_id(",
    "        context, oseo_generator_callee(generator), &code_id);",
    "    if (result.status != OSEO_STATUS_NORMAL) return result;",
    "    switch (code_id) {",
    ...generators.flatMap((functionValue) => [
      `    case ${functionValue.id}u:`,
      `        return ${generatorBodyName(functionValue)}(context, generator);`,
    ]),
    "    default:",
    "        return oseo_unknown_function(context, code_id);",
    "    }",
    "}",
  ].join("\n");
}

function emitFunctionDispatcher(
  functions: readonly MirFunction[],
  functionRootCounts: ReadonlyMap<number, number>,
): string {
  const lines = [
    "static OseoResult oseo_dispatch_function(",
    "    OseoContext *context,",
    "    OseoValue callee,",
    "    OseoValue receiver,",
    "    size_t argument_count,",
    "    const OseoValue *arguments,",
    "    OseoValue new_target",
    ") {",
    "    size_t code_id = 0u;",
    "    OseoResult result = oseo_function_code_id(",
    "        context, callee, &code_id);",
    "    if (result.status != OSEO_STATUS_NORMAL) return result;",
    "    (void)receiver;",
    "    (void)argument_count;",
    "    (void)arguments;",
    "    (void)new_target;",
    "    switch (code_id) {",
  ];
  for (const functionValue of functions) {
    const count = functionRootCounts.get(functionValue.id);
    if (count == null) {
      throw new Error(
        `MIR function '${functionValue.name}' has no root frame layout.`,
      );
    }
    lines.push(
      `    case ${functionValue.id}u:`,
      `        result = oseo_frame_enter(context, ${count}u);`,
      "        if (result.status == OSEO_STATUS_NORMAL) {",
      `            result = oseo_function_${functionValue.id}(`,
      "                context, callee, receiver, argument_count,",
      "                arguments, new_target);",
      `            oseo_frame_leave(context, ${count}u);`,
      "        }",
      "        return result;",
    );
  }
  lines.push(
    "    default:",
    "        return oseo_unknown_function(context, code_id);",
    "    }",
    "}",
  );
  return lines.join("\n");
}

/** Deterministic C11 lowering whose only semantic input is MIR. */
export const cBackend: NativeBackend = {
  emit(input) {
    const declaredFunctions = reachableFunctions(input);
    const functions = [...declaredFunctions, input.script];
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
    }
    for (const binding of input.globalBindings) {
      totalBindingCount = Math.max(totalBindingCount, binding.id + 1);
    }
    const declarations = functions.map(prototype).join("\n");
    const dispatcher = emitFunctionDispatcher(
      declaredFunctions,
      functionRootCounts,
    );
    const generatorDispatcher = emitGeneratorDispatcher(declaredFunctions);
    const functionReferences = declaredFunctions
      .map((functionValue) => `    (void)oseo_function_${functionValue.id};`)
      .join("\n");
    const definitions = functions
      .map((functionValue) =>
        emitFunction(
          functionValue,
          functionRootCounts,
          totalBindingCount,
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
        `${declarations}\n\n` +
        `${dispatcher}\n\n` +
        (generatorDispatcher == null ? "" : `${generatorDispatcher}\n\n`) +
        `${definitions}\n` +
        "int main(void) {\n" +
        "    OseoContext context;\n" +
        "    OseoResult result;\n" +
        `${functionReferences}${functionReferences === "" ? "" : "\n"}` +
        `    oseo_context_init(\n` +
        `        &context, "${sourceId}", ${sourceIdByteLength}u);\n` +
        "    oseo_context_set_function_dispatcher(\n" +
        "        &context, oseo_dispatch_function);\n" +
        (generatorDispatcher == null
          ? ""
          : "    oseo_context_set_generator_dispatcher(\n" +
            "        &context, oseo_dispatch_generator);\n") +
        (input.observeSpecialization === true
          ? "    context.observe_specialization = true;\n"
          : "") +
        `    result = oseo_frame_enter(\n` +
        `        &context, ${scriptRootCount}u);\n` +
        "    if (result.status == OSEO_STATUS_NORMAL) {\n" +
        "        result = oseo_function_script(\n" +
        "            &context, oseo_undefined(), oseo_undefined(), 0u,\n" +
        "            NULL, oseo_undefined());\n" +
        `        oseo_frame_leave(\n` +
        `            &context, ${scriptRootCount}u);\n` +
        "    }\n" +
        "    if (result.status == OSEO_STATUS_NORMAL) {\n" +
        "        result = oseo_event_loop_run(&context);\n" +
        "    } else {\n" +
        "        result = oseo_entry_task_checkpoint(&context, result);\n" +
        "    }\n" +
        "    if (result.status != OSEO_STATUS_NORMAL) {\n" +
        "        oseo_context_print_thrown(&context, result.value);\n" +
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
