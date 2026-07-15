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
  readonly functionId: number;
  readonly functionRootCounts: ReadonlyMap<number, number>;
  readonly lines: string[];
  readonly environmentSlot: number;
  readonly blockParameters: ReadonlyMap<number, readonly number[]>;
  readonly scalarKinds: Map<number, "boolean" | "smi">;
  readonly strict: boolean;
  readonly observeSpecialization: boolean;
  nextRecursiveTarget: number;
  usesAbrupt: boolean;
  usesCompletion: boolean;
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
  line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
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
  const dynamic = target.kind === "dynamic";
  const constructing = operation.kind === "construct";
  const callArguments = dynamic
    ? { ...operation, arguments: operation.arguments.slice(2) }
    : operation;
  const argumentsValue = emitArguments(state, callArguments);
  location(state, operation.range);
  state.usesAbrupt = true;
  if (target.kind === "console-log") {
    line(
      state,
      `result = oseo_console_log(context, ${argumentsValue.count}u, ` +
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
        `${argumentsValue.count}u, ${argumentsValue.name});`,
    );
  } else if (target.kind === "dynamic") {
    const callee = operationArgument(operation, 0);
    const receiver = operationArgument(operation, 1);
    line(state, `size_t dynamic_code_id_${operation.id} = 0u;`);
    line(
      state,
      `result = oseo_function_code_id(` +
        `context, roots[${callee}], &dynamic_code_id_${operation.id});`,
    );
    line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
    line(state, "    result = oseo_call_enter(context);");
    line(state, "}");
    line(state, "if (result.status == OSEO_STATUS_NORMAL) {");
    line(state, `    switch (dynamic_code_id_${operation.id}) {`);
    for (const [functionId, targetRootCount] of state.functionRootCounts) {
      if (functionId < 0) continue;
      line(state, `    case ${functionId}u:`);
      line(
        state,
        `        result = oseo_frame_enter(context, ${targetRootCount}u);`,
      );
      line(state, "        if (result.status == OSEO_STATUS_NORMAL) {");
      line(
        state,
        `            result = oseo_function_${functionId}(` +
          `context, roots[${callee}], roots[${receiver}], ` +
          `${argumentsValue.count}u, ${argumentsValue.name}, ` +
          (constructing ? `roots[${callee}]);` : "oseo_undefined());"),
      );
      line(
        state,
        `            oseo_frame_leave(context, ${targetRootCount}u);`,
      );
      line(state, "        }");
      line(state, "        break;");
    }
    line(state, "    default:");
    line(
      state,
      `        result = oseo_unknown_function(` +
        `context, dynamic_code_id_${operation.id});`,
    );
    line(state, "        break;");
    line(state, "    }");
    line(state, "    oseo_call_leave(context);");
    line(state, "}");
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
    if (operation.kind === "property-get-cached") {
      line(
        state,
        `static OseoPropertyCache property_cache_${operation.id} = ` +
          "{0u, 0u};",
      );
      line(
        state,
        `result = oseo_object_get_cached(context, roots[${object}], ` +
          `roots[${key}], &property_cache_${operation.id});`,
      );
    } else if (operation.kind === "property-get") {
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

function emitFunctionCreate(state: EmitState, operation: MirOperation): void {
  if (operation.functionId == null) {
    throw new Error(`MIR function-create %${operation.id} has no code id.`);
  }
  location(state, operation.range);
  state.usesAbrupt = true;
  line(
    state,
    `result = oseo_function_create(context, ${operation.functionId}u, ` +
      `roots[${state.environmentSlot}]);`,
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
  line(state, "    result = oseo_object_create(context, result.value);");
  line(state, "}");
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
  } else if (operation.kind === "receiver") {
    line(state, `roots[${operation.id}] = receiver;`);
  } else if (operation.kind === "caught") {
    state.usesCompletion = true;
    const slot = operation.completionSlot;
    if (slot == null) {
      throw new Error(`MIR caught %${operation.id} has no completion slot.`);
    }
    line(state, `roots[${operation.id}] = completion_value[${slot}u];`);
    line(
      state,
      `result = (OseoResult){OSEO_STATUS_NORMAL, ` +
        `completion_value[${slot}u]};`,
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
    line(state, `completion_kind[${slot}u] = ${kinds[kind]};`);
    if (operation.arguments[0] != null) {
      line(
        state,
        `completion_value[${slot}u] = roots[${operation.arguments[0]}];`,
      );
    }
    if (operation.completionTarget != null) {
      line(
        state,
        `completion_target[${slot}u] = ${operation.completionTarget}u;`,
      );
    }
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
  } else if (operation.kind === "call" || operation.kind === "construct") {
    emitCall(state, operation);
  } else if (
    operation.kind === "array-create" ||
    operation.kind === "object-create" ||
    operation.kind === "property-key" ||
    operation.kind === "property-delete" ||
    operation.kind === "property-get" ||
    operation.kind === "property-get-cached" ||
    operation.kind === "property-set"
  ) {
    emitObjectOperation(state, operation);
  } else if (operation.kind === "check-status") {
    if (operation.abruptTarget == null) {
      line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    } else {
      state.usesCompletion = true;
      line(state, "if (result.status != OSEO_STATUS_NORMAL) {");
      line(state, "    if (context->has_diagnostic) goto abrupt;");
      line(state, `    completion_kind[${operation.abruptTarget}u] = 2;`);
      line(
        state,
        `    completion_value[${operation.abruptTarget}u] = result.value;`,
      );
      line(state, `    goto bb${operation.abruptTarget};`);
      line(state, "}");
    }
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
  } else if (terminator.kind === "resume-completion") {
    state.usesCompletion = true;
    const slot = terminator.completionSlot;
    if (terminator.outerFinalizer != null) {
      line(state, `if (completion_kind[${slot}u] != 0) {`);
      line(
        state,
        `    completion_kind[${terminator.outerFinalizer}u] = ` +
          `completion_kind[${slot}u];`,
      );
      line(
        state,
        `    completion_value[${terminator.outerFinalizer}u] = ` +
          `completion_value[${slot}u];`,
      );
      line(
        state,
        `    completion_target[${terminator.outerFinalizer}u] = ` +
          `completion_target[${slot}u];`,
      );
      line(state, `    goto bb${terminator.outerFinalizer};`);
      line(state, "}");
    }
    line(state, `if (completion_kind[${slot}u] == 1) {`);
    line(
      state,
      `    result = (OseoResult){OSEO_STATUS_NORMAL, ` +
        `completion_value[${slot}u]};`,
    );
    line(state, "    oseo_roots_release(context, &frame);");
    line(state, "    return result;");
    line(state, "}");
    line(state, `if (completion_kind[${slot}u] == 2) {`);
    line(
      state,
      `    result = (OseoResult){OSEO_STATUS_THROW, ` +
        `completion_value[${slot}u]};`,
    );
    line(state, "    goto abrupt;");
    line(state, "}");
    line(state, `switch (completion_target[${slot}u]) {`);
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
      if (operation.kind === "call" || operation.kind === "construct") {
        maximum = Math.max(maximum, operation.arguments.length);
      }
    }
  }
  return maximum;
}

function rootCount(functionValue: MirFunction): number {
  const blocks = reachableBlocks(functionValue);
  const valueSlotCount = maximumValueId(blocks) + 1;
  const baseRootCount = Math.max(
    functionValue.rootSlotCount,
    valueSlotCount + 2,
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
    } else if (
      block.terminator.kind === "resume-completion" &&
      block.terminator.outerFinalizer != null
    ) {
      pending.push(block.terminator.outerFinalizer);
    }
    for (const operation of block.operations) {
      if (operation.abruptTarget != null) pending.push(operation.abruptTarget);
      if (operation.completionTarget != null) {
        pending.push(operation.completionTarget);
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
  let completionSlotCount = 1;
  for (const block of blocks) {
    completionSlotCount = Math.max(completionSlotCount, block.id + 1);
  }
  const valueSlotCount = maximumValueId(blocks) + 1;
  const parameters = functionValue.parameters;
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
  const functionRootCount = functionRootCounts.get(functionValue.id);
  if (functionRootCount == null) {
    throw new Error(
      `MIR function '${functionValue.name}' has no root frame layout.`,
    );
  }
  const state: EmitState = {
    argumentSlotStart: baseRootCount,
    blockParameters: new Map(
      blocks.map((block) => [block.id, block.parameters ?? []]),
    ),
    functionRootCounts,
    lines: [],
    environmentSlot,
    nextRecursiveTarget: 0,
    observeSpecialization,
    scalarKinds: new Map(),
    strict: functionValue.strict === true,
    usesAbrupt: false,
    usesCompletion: false,
    functionId: functionValue.id,
  };
  state.usesAbrupt = true;
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
    line(
      state,
      `result = ${setter}(context, result.value, ` +
        `(argument_count > ${index}u ? arguments[${index}] : ` +
        "oseo_undefined()));",
    );
    line(state, "if (result.status != OSEO_STATUS_NORMAL) goto abrupt;");
    initializedParameters.add(parameter.bindingId);
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
    (state.usesCompletion
      ? `    int completion_kind[${completionSlotCount}u] = {0};\n` +
        `    size_t completion_target[${completionSlotCount}u] = {0};\n` +
        `    OseoValue completion_value[${completionSlotCount}u] = {0};\n` +
        "    (void)completion_kind;\n" +
        "    (void)completion_target;\n" +
        "    (void)completion_value;\n"
      : "") +
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
        `${definitions}\n` +
        "int main(void) {\n" +
        "    OseoContext context;\n" +
        "    OseoResult result;\n" +
        `${functionReferences}${functionReferences === "" ? "" : "\n"}` +
        `    oseo_context_init(\n` +
        `        &context, "${sourceId}", ${sourceIdByteLength}u);\n` +
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
