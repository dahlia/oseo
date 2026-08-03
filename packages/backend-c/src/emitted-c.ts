/**
 * Fixed C templates incorporated into generated user programs.
 *
 * Groups name the C construct that owns each template. Shared templates
 * live under `common`. Callers retain MIR lowering and interpolation.
 */

export type CFragment = readonly [readonly string[], ...(readonly string[])[]];

export const emittedC = {
  normalReturn: {
    resultAssignOseoResultOseoStatusNormal: [
      [""],
      ["result = (OseoResult){OSEO_STATUS_NORMAL, "],
      ["};"],
    ],
    releaseRoots: [[""], ["oseo_roots_release(context, &frame);"]],
    returnResult: [[""], ["return result;"]],
  },
  cString: {
    backslashEscape: [["\\\\"]],
    quoteEscape: [['\\"']],
    questionMarkEscape: [["\\?"]],
    newlineEscape: [["\\n"]],
    octalEscape: [["\\"], [""]],
    octalPadding: [["0"]],
  },
  line: {
    indentLine: [["    "], [""]],
  },
  location: {
    sourceLocationPrefix: [
      ['oseo_context_source_location(context, "'],
      ['", '],
      ["u, "],
    ],
    locationPrefix: [["oseo_context_location(context, "], ["u, "]],
  },
  common: {
    sourcePositionSuffix: [[""], ["u, "], ["u);"]],
    positionSuffix: [[""], ["u);"]],
    staticConstUint16TAssignStatement: [
      ["static const uint16_t "],
      ["[] = {"],
      ["};"],
    ],
    staticConstSizeTArrayAssignStatement: [
      ["static const size_t "],
      ["[] = {"],
      ["};"],
    ],
    commaSpace: [[", "]],
    rootAssignResultValue: [["roots["], ["] = result.value;"]],
    rootsAssignOseoUndefinedStatement: [["roots["], ["] = oseo_undefined();"]],
    trueValue: [["true"]],
    falseValue: [["false"]],
    rootsAssignOseoBooleanStatement: [
      ["roots["],
      ["] = oseo_boolean("],
      [");"],
    ],
    gotoAbruptUnlessNormal: [
      ["if (result.status != OSEO_STATUS_NORMAL) goto ab", "rupt;"],
    ],
    nullPointer: [["NULL"]],
    rootAssignRoot: [["roots["], ["] = roots["], ["];"]],
    undefinedValue: [["oseo_undefined()"]],
    root: [["roots["], ["]"]],
    resultAssignOseoEnvironmentGetContext: [
      ["result = oseo_environment_get(context, "],
    ],
    rootsUStatement: [["roots["], ["], "], ["u);"]],
    statusNormalOpen: [["if (result.status == OSEO_STATUS_NORMAL) {"]],
    closeBlock: [["}"]],
    resultAssignOseoCellCreateContextOseo: [
      ["result = oseo_cell_create(context, oseo_uninitia", "lized());"],
    ],
    rootsU: [["roots["], ["], "], ["u, "]],
    rootCallSuffix: [["roots["], ["]);"]],
    rootsAssign: [["roots["], ["] = "]],
    unaryToNumber: [["oseo_to_number"]],
    unaryToNumeric: [["oseo_to_numeric"]],
    unaryNumericOne: [["oseo_numeric_one"]],
    unaryNegate: [["oseo_negate"]],
    unaryToString: [["oseo_to_string"]],
    unaryTypeof: [["oseo_typeof"]],
    unaryBitwiseNot: [["oseo_bitwise_not"]],
    oseoToBooleanRoots: [["oseo_to_boolean(roots["], ["])"]],
    iteratorDone: [["iterator_done_"], [""]],
    empty: [[""]],
    iteratorDelegateNext: [["next"]],
    iteratorDelegateReturn: [["return"]],
    iteratorDelegateThrow: [["throw"]],
    rootWithComma: [["roots["], ["], "]],
    twoRootsWithComma: [["roots["], ["], "], [", "]],
    boolFastAssignStatement: [["bool fast_"], [" = !"], [";"]],
    voidFastStatement: [["(void)fast_"], [";"]],
    rootsRootsAddressRoots: [
      ["roots["],
      ["], roots["],
      ["], &roots["],
      ["], "],
    ],
    ifOpen: [["if ("], [") {"]],
    resultAssignOseoResultOseoStatusNormalOseo: [
      [
        "    result = (OseoResult){OSEO_STATUS_NORMAL, os",
        "eo_undef",
        "ined()};",
      ],
    ],
    elseOpen: [["} else {"]],
    addressStatement: [["&"], [");"]],
    rootsCompletionUKindEqualStatement: [
      ["roots["],
      ["], completion["],
      ["u].kind == 2);"],
    ],
    callSuffix: [[""], [");"]],
    resultAssignContext: [["result = "], ["(context, "]],
    twoValuesCallSuffix: [[""], [", "], [");"]],
    valueWithComma: [[""], [", "]],
    undefinedFinalArgumentCallSuffix: [["oseo_undefined());"]],
    twoValuesWithComma: [[""], [", "], [", "]],
    indentedCloseBlock: [["    }"]],
    unsignedWithComma: [[""], ["u, "]],
    resultAssignOseoObjectDefineContextRoots: [
      ["result = oseo_object_define(context, roots["],
      ["], "],
    ],
    rootsRoots: [["roots["], ["], roots["], ["], "]],
    rootsRootsStatement: [["roots["], ["], roots["], ["]);"]],
    rootsStatement: [["roots["], ["], "], [");"]],
    resultAssignOseoFunctionPrototypeContext: [
      ["result = oseo_function_prototype(context, roots["],
      ["]);"],
    ],
    resultAssignOseoFunctionPrototypeContextValue: [
      ["result = oseo_function_prototype(context, "],
      [");"],
    ],
    rootsAssignResultValueIfStatusNormal: [
      ["if (result.status == OSEO_STATUS_NORMAL) roots["],
      ["] = result.value;"],
    ],
    rootsRootsRootsStatement: [
      ["roots["],
      ["], roots["],
      ["], roots["],
      ["]);"],
    ],
    privateGetterKind: [["OSEO_PRIVATE_GETTER"]],
    privateSetterKind: [["OSEO_PRIVATE_SETTER"]],
    privateMethodKind: [["OSEO_PRIVATE_METHOD"]],
    resultAssignOseoModuleNamespaceCreate: [
      ["result = oseo_module_namespace_create(context, "],
    ],
    bracedInitializer: [["{"], ["};"]],
    oseoContextClearLanguageErrorContext: [
      ["oseo_context_clear_language_error(context);"],
    ],
    resultAssignOseoResultOseoStatusNormal: [
      ["result = (OseoResult){OSEO_STATUS_NORMAL, "],
    ],
    rootUnsignedInitializerSuffix: [["roots["], ["u]};"]],
    contextMemberSourceIdLengthStatement: [["context->source_id_length;"]],
    uStatement: [[""], ["u;"]],
    rootsUAssign: [["    roots["], ["u] = "]],
    gotoBbStatement: [["    goto bb"], [";"]],
    returnResult: [["return result;"]],
    gotoBlock: [["goto bb"], [";"]],
    ifCompletionKindThrowOpen: [["if (completion["], ["u].kind == 2) {"]],
    rootUnsigned: [["roots["], ["u]"]],
    indent: [["    "]],
    caseUGotoBbStatement: [["case "], ["u: goto bb"], [";"]],
    defaultAbortStatement: [["default: abort();"]],
    resultAssignOseoEnvironmentGetContextRoots: [
      ["result = oseo_environment_get(context, roots["],
      ["], "],
    ],
    ifOseoGeneratorResumeKindGeneratorEqual: [
      ["if (oseo_generator_resume_kind(generator) == "],
    ],
    voidCompletionLine: [["    (void)completion;\n"]],
    abruptLabel: [["abrupt:"]],
    oseoContextPointerContextLine: [["    OseoContext *context,\n"]],
    functionBodyOpenLine: [[") {\n"]],
    voidCalleeLine: [["    (void)callee;\n"]],
    voidReceiverLine: [["    (void)receiver;\n"]],
    valueThenNewline: [[""], ["\n"]],
    newline: [["\n"]],
    closeBlockLine: [["}\n"]],
    script: [["script"]],
    oseoResultResultLine: [["    OseoResult result;\n"]],
    valueThenBlankLine: [[""], ["\n\n"]],
  },
  operatorHelper: {
    oseoNotLooseEqual: [["oseo_not_loose_equal"]],
    oseoNotStrictEqual: [["oseo_not_strict_equal"]],
    oseoRemainder: [["oseo_remainder"]],
    oseoBitwiseAnd: [["oseo_bitwise_and"]],
    oseoMultiply: [["oseo_multiply"]],
    oseoExponentiate: [["oseo_exponentiate"]],
    oseoAdd: [["oseo_add"]],
    oseoSubtract: [["oseo_subtract"]],
    oseoDivide: [["oseo_divide"]],
    oseoLessThan: [["oseo_less_than"]],
    oseoShiftLeft: [["oseo_shift_left"]],
    oseoLessEqual: [["oseo_less_equal"]],
    oseoLooseEqual: [["oseo_loose_equal"]],
    oseoStrictEqual: [["oseo_strict_equal"]],
    oseoGreaterThan: [["oseo_greater_than"]],
    oseoGreaterEqual: [["oseo_greater_equal"]],
    oseoShiftRight: [["oseo_shift_right"]],
    oseoShiftRightUnsigned: [["oseo_shift_right_unsigned"]],
    oseoBitwiseXor: [["oseo_bitwise_xor"]],
    oseoHasProperty: [["oseo_has_property"]],
    oseoInstanceof: [["oseo_instanceof"]],
    oseoBitwiseOr: [["oseo_bitwise_or"]],
  },
  numberLiteral: {
    nan: [["NAN"]],
    positiveInfinity: [["INFINITY"]],
    negativeInfinity: [["-INFINITY"]],
    negativeZero: [["-0.0"]],
    integerAsDouble: [[""], [".0"]],
  },
  stringConstant: {
    nullU: [["NULL, 0u"]],
    stringUnits: [["string_units_"], [""]],
    unitsWithLength: [[""], [", "], ["u"]],
    resultAssignOseoStringFromUnitsContext: [
      ["result = oseo_string_from_units(context, "],
      [");"],
    ],
  },
  templateObject: {
    siteDeclaration: [["static const char "], [" = 0;"]],
    pointerArrayDeclaration: [
      ["static const uint16_t *const "],
      ["[] = {"],
      ["};"],
    ],
    sizeArrayDeclaration: [["static const size_t "], ["[] = {"], ["};"]],
    boolArrayDeclaration: [["static const bool "], ["[] = {"], ["};"]],
    resultAssign: [
      ["result = oseo_template_object(context, &"],
      [", "],
      ["u, "],
      [", "],
      [", "],
      [", "],
      [", "],
      [");"],
    ],
  },
  constant: {
    resultAssignBigIntLiteral: [
      ['result = oseo_bigint_literal(context, "'],
      ['", '],
      ["u);"],
    ],
    rootsAssignOseoNullStatement: [["roots["], ["] = oseo_null();"]],
    rootsAssignOseoNumberStatement: [["roots["], ["] = oseo_number("], [");"]],
  },
  arguments: {
    argumentCount: [["argument_count_"], [""]],
    argumentValues: [["argument_values_"], [""]],
    sizeTAssignUStatement: [["size_t "], [" = 0u;"]],
    constOseoValuePointerAssignNullStatement: [
      ["const OseoValue *"],
      [" = NULL;"],
    ],
    resultAssignOseoArgumentListViewContext: [
      ["result = oseo_argument_list_view(context, "],
    ],
    rootsAddressAddressStatement: [["roots["], ["], &"], [", &"], [");"]],
    zeroUnsigned: [["0u"]],
    unsignedCount: [[""], ["u"]],
    addressOfRoot: [["&roots["], ["]"]],
  },
  argument: {
    boundedArgumentCount: [["("], [" > "], ["u ? "]],
    oseoUndefined: [[""], ["["], ["] : oseo_undefined())"]],
  },
  read: {
    resultAssignOseoCellGetContextResultValue: [
      ["result = oseo_cell_get(context, result.value);"],
    ],
  },
  write: {
    resultAssignOseoResultOseoStatusNormal: [
      ["result = (OseoResult){OSEO_STATUS_NORMAL, roots["],
      ["]};"],
    ],
    resultAssignOseoWriteImmutableBinding: [
      ["result = oseo_write_immutable_binding(context);"],
    ],
    resultAssignOseoCellGetContextResultValue: [
      ["    result = oseo_cell_get(context, result.value", ");"],
    ],
    indentedWriteImmutableBinding: [
      ["    result = oseo_write_immutable_binding(contex", "t);"],
    ],
    resultAssignOseoCellSetContextResultValue: [
      ["result = oseo_cell_set(context, result.value, ro", "ots["],
      ["]);"],
    ],
    resultAssignOseoGlobalBindingSet: [
      [
        "result = oseo_global_binding_set(context, result.",
        "value, ro",
        "ots[",
      ],
      ["], "],
      [");"],
    ],
  },
  initialize: {
    resultAssignOseoCellInitializeContext: [
      ["result = oseo_cell_initialize(context, result.va", "lue, roo", "ts["],
      ["]);"],
    ],
  },
  bindingReset: {
    resultAssignOseoEnvironmentSetContext: [
      ["    result = oseo_environment_set(context, "],
    ],
  },
  unary: {
    oseoBooleanOseoToBooleanRootsStatement: [
      ["oseo_boolean(!oseo_to_boolean(roots["],
      ["]));"],
    ],
    resultAssignContextRootsStatement: [
      ["result = "],
      ["(context, roots["],
      ["]);"],
    ],
  },
  binary: {
    resultAssign: [["result = "], [""]],
    contextRootsRootsStatement: [["(context, roots["], ["], roots["], ["]);"]],
  },
  guardSmi: {
    boolFastAssignOseoValueIsSmiRootsStatement: [
      ["bool fast_"],
      [" = oseo_value_is_smi(roots["],
      ["]);"],
    ],
  },
  unboxSmi: {
    int64TFastAssign: [["int64_t fast_"], [" = "]],
    oseoValueUnboxSmiRootsStatement: [["oseo_value_unbox_smi(roots["], ["]);"]],
  },
  checkedAdd: {
    int64TFastStatement: [["int64_t fast_"], [";"]],
    boolFastAssignOseoSmiTryAdd: [["bool fast_"], [" = oseo_smi_try_add("]],
    fastFastAddressFastStatement: [
      ["fast_"],
      [", fast_"],
      [", &fast_"],
      [");"],
    ],
  },
  boxSmi: {
    rootsAssignOseoValueBoxSmiFastStatement: [
      ["roots["],
      ["] = oseo_value_box_smi(fast_"],
      [");"],
    ],
  },
  iteratorOperation: {
    asyncPrefix: [["async_"]],
    resultAssignOseoIteratorGetContext: [
      ["result = oseo_"],
      ["iterator_get(context, "],
    ],
    rootsAddressRootsStatement: [["roots["], ["], &roots["], ["]);"]],
    rootsAssignOseoBooleanFalseStatement: [
      ["roots["],
      ["] = oseo_boolean(false);"],
    ],
    rootsAssignCompletionKindThrowStatement: [
      ["roots["],
      ["] = oseo_boolean(completion["],
      ["u].kind == 2);"],
    ],
    boolIteratorCloseAwaitAssignFalseStatement: [
      ["bool iterator_close_await_"],
      [" = false;"],
    ],
    boolFastAssignIteratorCloseAwaitStatement: [
      ["bool fast_"],
      [" = iterator_close_await_"],
      [";"],
    ],
    resultAssignOseoAsyncIteratorCloseStartContext: [
      ["result = oseo_async_iterator_close_start(context, roots["],
      ["], completion["],
      ["u].kind == 2, &roots["],
      ["], &iterator_close_await_"],
      [");"],
    ],
    resultAssignOseoAsyncIteratorCloseResultContext: [
      ["result = oseo_async_iterator_close_result(context, roots["],
      ["], oseo_to_boolean(roots["],
      ["]), oseo_to_boolean(roots["],
      ["]));"],
    ],
    resultAssignOseoAsyncIteratorNextStartContext: [
      ["result = oseo_async_iterator_next_start(context, roots["],
      ["], roots["],
      ["]);"],
    ],
    resultAssignOseoAsyncIteratorDelegateStartContext: [
      ["result = oseo_async_iterator_delegate_"],
      ["_start(context, roots["],
      ["], "],
    ],
    rootsRootsAddressRootsStatementSuffix: [
      ["roots["],
      ["], roots["],
      ["], &roots["],
      ["]);"],
    ],
    rootsAddressRootsStatementSuffix: [["roots["], ["], &roots["], ["]);"]],
    resultAssignOseoAsyncIteratorResultContext: [
      ["result = oseo_async_iterator_result(context, roots["],
      ["], oseo_to_boolean(roots["],
      ["]), "],
      [", roots["],
      ["], "],
      [", &roots["],
      ["], &iterator_done_"],
      [");"],
    ],
    boolIteratorDoneAssignFalseStatement: [
      ["bool iterator_done_"],
      [" = false;"],
    ],
    boolAssignTrueStatement: [["bool "], [" = true;"]],
    resultAssignOseoIteratorDelegateContext: [
      ["result = oseo_"],
      ["iterator_delegate_"],
      ["(context, "],
    ],
    addressRootsAddressStatement: [["&roots["], ["], &"], [");"]],
    boolIteratorDoneAssignTrueStatement: [
      ["bool iterator_done_"],
      [" = true;"],
    ],
    resultAssignOseoIteratorNextContext: [
      ["result = oseo_"],
      ["iterator_next(context, "],
    ],
    addressIteratorDoneStatement: [["&iterator_done_"], [");"]],
    boolFastAssignIteratorDoneStatement: [
      ["bool fast_"],
      [" = !iterator_done_"],
      [";"],
    ],
    iteratorStepDone: [["iterator_step_done_"], [""]],
    boolAssignStatement: [["bool "], [" = "], [";"]],
    rootsAssignOseoUndefinedStatement: [
      ["    roots["],
      ["] = oseo_undefined();"],
    ],
    indentedIteratorNext: [["    result = oseo_"], ["iterator_next(context, "]],
    resultAssignOseoIteratorCloseContext: [
      ["result = oseo_"],
      ["iterator_close(context, "],
    ],
    indentedIteratorClose: [
      ["    result = oseo_"],
      ["iterator_close(context, "],
    ],
  },
  call: {
    resultAssignOseoConsoleLogContext: [
      ["result = oseo_console_log(context, "],
      [", "],
    ],
    oseoObjectBuiltinCreate: [["oseo_object_builtin_create"]],
    oseoObjectBuiltinDefineProperty: [["oseo_object_builtin_define_property"]],
    oseoObjectBuiltinGetOwnPropertyDescriptor: [
      ["oseo_object_builtin_get_own_property_descriptor"],
    ],
    oseoObjectBuiltinKeys: [["oseo_object_builtin_keys"]],
    oseoObjectBuiltinSetPrototypeOf: [["oseo_object_builtin_set_prototype_of"]],
    resultAssignOseoPromiseConstructContext: [
      ["result = oseo_promise_construct(context, "],
      [");"],
    ],
    resultAssignOseoPromiseAsyncCallContext: [
      ["result = oseo_promise_async_call(context, "],
      [");"],
    ],
    resultAssignOseoPromiseAwaitThenContext: [
      ["result = oseo_promise_await_then(context, "],
    ],
    resultAssignOseoPromiseThenContext: [
      ["result = oseo_promise_then(context, "],
    ],
    threeValuesCallSuffix: [[""], [", "], [", "], [");"]],
    oseoPromiseAll: [["oseo_promise_all"]],
    oseoPromiseRace: [["oseo_promise_race"]],
    oseoPromiseReject: [["oseo_promise_reject"]],
    oseoPromiseResolve: [["oseo_promise_resolve"]],
    resultAssignContextStatement: [["result = "], ["(context, "], [");"]],
    resultAssignOseoSetTimeoutContext: [
      ["result = oseo_set_timeout(context, "],
      [", "],
    ],
    resultAssignOseoClearTimeoutContext: [
      ["result = oseo_clear_timeout(context, "],
      [");"],
    ],
    callFunctionWithDynamicReceiverPrefix: [
      ["result = oseo_call_function(context, roots["],
      ["], "],
    ],
    resultAssignOseoConstructorResult: [
      ["    result = oseo_constructor_result("],
    ],
    contextResultValueRootsStatement: [
      ["context, result.value, roots["],
      ["]);"],
    ],
    callFunctionWithReceiverPrefix: [
      ["result = oseo_call_function(context, roots["],
      ["], receiver, "],
    ],
    callFunctionWithRootReceiverPrefix: [
      ["result = oseo_call_function(context, roots["],
      ["], roots["],
      ["], "],
    ],
    newTargetStatement: [[""], [", "], [", new_target);"]],
    resultAssignOseoConstructorResultContext: [
      [
        "    result = oseo_constructor_result(context, re",
        "sult.value, receiver);",
      ],
    ],
    resultAssignOseoConstructorResultContextValueRoot: [
      ["    result = oseo_constructor_result(context, result.value, roots["],
      ["]);"],
    ],
    oseoFunction: [["oseo_function_"], [""]],
    recursiveTarget: [["recursive_target_"], [""]],
    oseoFunctionEntryVolatileAssign: [["OseoFunctionEntry volatile "], [" = "]],
    oseoFunctionStatement: [["oseo_function_"], [";"]],
    resultAssignOseoCallEnterContextStatement: [
      ["result = oseo_call_enter(context);"],
    ],
    resultAssignOseoFrameEnterContextU: [
      ["    result = oseo_frame_enter(context, "],
      ["u);"],
    ],
    ifResultStatusEqualOseoStatusNormalOpen: [
      ["    if (result.status == OSEO_STATUS_NORMAL) {"],
    ],
    resultAssign: [["        result = "], [""]],
    contextOseoUndefinedOseoUndefined: [
      ["(context, oseo_undefined(), oseo_undefined(), "],
    ],
    oseoFrameLeaveContextUStatement: [
      ["        oseo_frame_leave(context, "],
      ["u);"],
    ],
    oseoCallLeaveContextStatement: [["    oseo_call_leave(context);"]],
  },
  objectOperation: {
    resultAssignOseoArrayCreateContextU: [
      ["result = oseo_array_create(context, "],
      ["u);"],
    ],
    resultAssignOseoArrayAppendContextRoots: [
      ["result = oseo_array_append(context, roots["],
      ["], "],
    ],
    resultAssignOseoArrayAppendHoleContext: [
      ["result = oseo_array_append_hole(context, roots["],
      ["]);"],
    ],
    resultAssignOseoObjectLiteralCreateContext: [
      ["result = oseo_object_literal_create(context);"],
    ],
    resultAssignOseoRequireObjectCoercible: [
      ["result = oseo_require_object_coercible(context, ", "roots["],
      ["]);"],
    ],
    resultAssignOseoRequireDeleteObjectCoercible: [
      ["result = oseo_require_delete_object_coercible(context, ", "roots["],
      ["]);"],
    ],
    objectRestExcluded: [["object_rest_excluded_"], [""]],
    oseoValueUAssignOpen: [["OseoValue "], ["["], ["u] = {"]],
    initializerSuffix: [["};"]],
    resultAssignOseoObjectRestContextRoots: [
      ["result = oseo_object_rest(context, roots["],
      ["], "],
    ],
    resultAssignOseoObjectLiteralSetPrototypeContextRoots: [
      ["result = oseo_object_literal_set_prototype(con", "text, roots["],
      ["], "],
    ],
    nullStatement: [["NULL);"]],
    resultAssignOseoObjectSpreadContextRoots: [
      ["result = oseo_object_spread(context, roots["],
      ["], "],
    ],
    resultAssignOseoPropertyKeyContextRoots: [
      ["result = oseo_property_key(context, roots["],
      ["]);"],
    ],
    oseoPropertyAttributesTrueTrueTrueFalse: [
      ["(OseoPropertyAttributes){true, true, true, false", "});"],
    ],
    oseoPropertyAttributesTrueFalseTrueFalse: [
      ["(OseoPropertyAttributes){true, false, true, fals", "e});"],
    ],
    resultAssignOseoObjectDefineAccessor: [
      ["result = oseo_object_define_accessor(context, ro", "ots["],
      ["], "],
    ],
    oseoPropertyAttributesTrueFalseTrue: [
      ["(OseoPropertyAttributes){true, "],
      [", false, true});"],
    ],
    resultAssignOseoSuperGetContextRoots: [
      ["result = oseo_super_get(context, roots["],
      ["], "],
    ],
    resultAssignOseoObjectGetContextRoots: [
      ["result = oseo_object_get(context, roots["],
      ["], "],
    ],
    resultAssignOseoObjectDeleteContextRoots: [
      ["result = oseo_object_delete(context, roots["],
      ["], "],
    ],
    resultAssignOseoSuperSetContextRoots: [
      ["result = oseo_super_set(context, roots["],
      ["], "],
    ],
    rootsRootsRoots: [["roots["], ["], roots["], ["], roots["], ["], "]],
    resultAssignOseoObjectSetContextRoots: [
      ["result = oseo_object_set(context, roots["],
      ["], "],
    ],
  },
  argumentListOperation: {
    resultAssignOseoArgumentListCreateContext: [
      ["result = oseo_argument_list_create(context);"],
    ],
    resultAssignOseoArgumentListAppendContext: [
      ["result = oseo_argument_list_append(context, roots["],
      ["], "],
    ],
  },
  propertyCacheName: {
    propertyCache: [["property_cache_"], [""]],
  },
  guardObject: {
    boolFastAssignOseoValueIsObjectRoots: [
      ["bool fast_"],
      [" = oseo_value_is_object(roots["],
      ["]);"],
    ],
  },
  guardShape: {
    staticOseoPropertyCacheAssignUUStatement: [
      ["static OseoPropertyCache "],
      [" = {0u, 0u};"],
    ],
    boolFastAssignOseoPropertyCacheMatches: [
      ["bool fast_"],
      [" = oseo_property_cache_matches("],
    ],
    rootsAddressStatement: [["roots["], ["], &"], [");"]],
  },
  loadFixedSlot: {
    oseoPropertyCacheLoadRootsAddressStatement: [
      ["oseo_property_cache_load(roots["],
      ["], &"],
      [");"],
    ],
  },
  updatePropertyCache: {
    oseoPropertyCacheUpdateRootsRoots: [
      ["oseo_property_cache_update(roots["],
      ["], roots["],
      ["], "],
    ],
  },
  functionCreate: {
    oseoFunctionArrow: [["OSEO_FUNCTION_ARROW"]],
    oseoFunctionAsync: [["OSEO_FUNCTION_ASYNC"]],
    oseoFunctionAsyncArrow: [["OSEO_FUNCTION_ASYNC_ARROW"]],
    oseoFunctionAsyncGenerator: [["OSEO_FUNCTION_ASYNC_GENERATOR"]],
    oseoFunctionClass: [["OSEO_FUNCTION_CLASS"]],
    oseoFunctionGenerator: [["OSEO_FUNCTION_GENERATOR"]],
    oseoFunctionMethod: [["OSEO_FUNCTION_METHOD"]],
    oseoFunctionOrdinary: [["OSEO_FUNCTION_ORDINARY"]],
    functionNameUnits: [["function_name_units_"], [""]],
    oseoFunctionNamePrefixGet: [["OSEO_FUNCTION_NAME_PREFIX_GET"]],
    oseoFunctionNamePrefixSet: [["OSEO_FUNCTION_NAME_PREFIX_SET"]],
    oseoFunctionNamePrefixNone: [["OSEO_FUNCTION_NAME_PREFIX_NONE"]],
    resultAssignOseoFunctionCreateContextU: [
      ["result = oseo_function_create(context, "],
      ["u, "],
    ],
    rootsU: [["roots["], ["], "], [", "], ["u, "]],
    receiver: [[""], [", receiver, "], [", "]],
    bindArrowContext: [
      ["oseo_bind_arrow_context(roots["],
      ["], callee, "],
      [");"],
    ],
    newTarget: [["new_target"]],
  },
  errorIntrinsic: {
    oseoErrorError: [["OSEO_ERROR_ERROR"]],
    oseoErrorEval: [["OSEO_ERROR_EVAL"]],
    oseoErrorRange: [["OSEO_ERROR_RANGE"]],
    oseoErrorReference: [["OSEO_ERROR_REFERENCE"]],
    oseoErrorSyntax: [["OSEO_ERROR_SYNTAX"]],
    oseoErrorType: [["OSEO_ERROR_TYPE"]],
    oseoErrorUri: [["OSEO_ERROR_URI"]],
    resultAssignOseoErrorIntrinsicContext: [
      ["result = oseo_error_intrinsic(context, "],
    ],
  },
  constructReceiver: {
    resultAssignOseoConstructorReceiverContext: [
      ["    result = oseo_constructor_receiver(context, ", "result.value);"],
    ],
  },
  classHeritage: {
    resultAssignOseoClassHeritageContextRoots: [
      ["result = oseo_class_heritage(context, roots["],
      ["], "],
    ],
  },
  classFieldDefine: {
    resultAssignOseoClassFieldDefineContext: [
      ["result = oseo_class_field_define(context, "],
    ],
  },
  classStaticFieldDefine: {
    oseoClassStaticPrivateFieldDefine: [
      ["oseo_class_static_private_field_define"],
    ],
    oseoClassStaticFieldDefine: [["oseo_class_static_field_define"]],
  },
  privateNameCreate: {
    resultAssignOseoPrivateNameCreateContext: [
      ["result = oseo_private_name_create(context);"],
    ],
  },
  classPrivateFieldDefine: {
    resultAssignOseoClassPrivateFieldDefine: [
      ["result = oseo_class_private_field_define(context", ", "],
    ],
  },
  classPrivateMethodDefine: {
    resultAssignOseoClassPrivateMethodDefine: [
      ["result = oseo_class_private_method_define(context, "],
    ],
    resultAssignOseoClassStaticPrivateMethodDefine: [
      ["result = oseo_class_static_private_method_define(context, "],
    ],
  },
  privateGet: {
    resultAssignOseoPrivateGetContextRoots: [
      ["result = oseo_private_get(context, roots["],
      ["], "],
    ],
  },
  privateIn: {
    resultAssignOseoPrivateInContextRoots: [
      ["result = oseo_private_in(context, roots["],
      ["], "],
    ],
  },
  privateSet: {
    resultAssignOseoPrivateSetContextRoots: [
      ["result = oseo_private_set(context, roots["],
      ["], "],
    ],
  },
  instanceElementsInit: {
    resultAssignOseoInitializeInstanceElements: [
      ["result = oseo_initialize_instance_elements(conte", "xt, call", "ee, "],
    ],
  },
  homeObjectBind: {
    oseoBindHomeObjectRootsRootsStatement: [
      ["oseo_bind_home_object(roots["],
      ["], roots["],
      ["]);"],
    ],
  },
  superBase: {
    rootsAssignOseoSuperBaseCalleeStatement: [
      ["roots["],
      ["] = oseo_super_base(callee);"],
    ],
  },
  superConstructor: {
    resultAssignOseoSuperConstructorContext: [
      ["result = oseo_super_constructor(context, callee)", ";"],
    ],
  },
  thisBind: {
    resultAssignOseoBindThisContextResultValue: [
      ["result = oseo_bind_this(context, result.value, r", "oots["],
      ["]);"],
    ],
  },
  derivedReturn: {
    resultAssignOseoDerivedConstructorResult: [
      ["result = oseo_derived_constructor_result(context", ", roots["],
      ["], "],
    ],
    resultValueStatement: [["result.value);"]],
  },
  moduleNamespace: {
    rootsUNullNullNullStatement: [["roots["], ["], 0u, NULL, NULL, NULL);"]],
    namespaceUnits: [["namespace_units_"], ["_"], [""]],
    namespace: [["namespace_"], [""]],
    staticConstUint16TPointerConstNamesAssign: [
      ["static const uint16_t *const "],
      ["_names[] = "],
    ],
    staticConstSizeTLengthsAssignStatement: [
      ["static const size_t "],
      ["_lengths[] = {"],
      ["};"],
    ],
    staticConstSizeTBindingsAssign: [
      ["static const size_t "],
      ["_bindings[] = "],
    ],
    namesLengthsBindingsStatement: [
      [""],
      ["_names, "],
      ["_lengths, "],
      ["_bindings);"],
    ],
  },
  globalObject: {
    units: [["global_object_units_"], [""]],
    prefix: [["global_object"]],
    resultAssignOseoGlobalObjectCreate: [
      ["result = oseo_global_object_create(context, "],
    ],
  },
  mappedArguments: {
    indicesName: [["mapped_arguments_indices_"], [""]],
    bindingIdsName: [["mapped_arguments_binding_ids_"], [""]],
  },
  operation: {
    resultAssignOseoSymbolIntrinsicContext: [
      ["result = oseo_symbol_intrinsic(context);"],
    ],
    rootsAssignReceiverStatement: [["roots["], ["] = receiver;"]],
    resultAssignOseoThisValueContextReceiver: [
      ["result = oseo_this_value(context, receiver);"],
    ],
    undefinedExpressionStatement: [["oseo_undefined();"]],
    newTargetStatement: [["new_target;"]],
    rootsAssignRootsUStatement: [["roots["], ["] = roots["], ["u];"]],
    completionUKindAssignStatement: [["completion["], ["u].kind = "], [";"]],
    completionULineAssignContextMemberLine: [
      ["completion["],
      ["u].line = context->line;"],
    ],
    completionUColumnAssignContextMemberColumn: [
      ["completion["],
      ["u].column = context->column;"],
    ],
    completionUSourceIdAssignContextMember: [
      ["completion["],
      ["u].source_id = context->source_id;"],
    ],
    completionUSourceIdLengthAssign: [
      ["completion["],
      ["u].source_id_length = "],
    ],
    completionUErrorCodeAssignContextMember: [
      ["completion["],
      ["u].error_code = context->error_code;"],
    ],
    completionUErrorMessageAssignContextMember: [
      ["completion["],
      ["u].error_message = context->error_message;"],
    ],
    rootsUAssign: [["roots["], ["u] = "]],
    rootsStatement: [["roots["], ["];"]],
    completionUTargetAssign: [["completion["], ["u].target = "]],
    completionUDepthAssign: [["completion["], ["u].depth = "]],
    contextMemberGuardHitsPlusAssignUStatement: [
      ["context->guard_hits += 1u;"],
    ],
    contextMemberGuardMissesPlusAssignU: [["context->guard_misses += 1u;"]],
    contextMemberOverflowMissesPlusAssignU: [
      ["context->overflow_misses += 1u;"],
    ],
    ifResultStatusNotEqualOseoStatusNormalOpen: [
      ["if (result.status != OSEO_STATUS_NORMAL) {"],
    ],
    ifContextMemberHasDiagnosticGotoAbrupt: [
      ["    if (context->has_diagnostic) goto abrupt;"],
    ],
    setThrowKind: [["    completion["], ["u].kind = 2;"]],
    resultValueStatement: [["result.value;"]],
    setThrowLine: [["    completion["], ["u].line = context->line;"]],
    setThrowColumn: [["    completion["], ["u].column = context->column;"]],
    setThrowSourceId: [
      ["    completion["],
      ["u].source_id = context->source_id;"],
    ],
    setThrowSourceIdLength: [["    completion["], ["u].source_id_length = "]],
    setThrowErrorCode: [
      ["    completion["],
      ["u].error_code = context->error_code;"],
    ],
    completionUErrorMessageAssign: [
      ["    completion["],
      ["u].error_message = "],
    ],
    contextMemberErrorMessageStatement: [["context->error_message;"]],
  },
  completionCopy: {
    completionUAssignCompletionUStatement: [
      ["    completion["],
      ["u] = completion["],
      ["u];"],
    ],
    rootsUStatement: [["roots["], ["u];"]],
  },
  terminator: {
    oseoGeneratorSuspendAwait: [["OSEO_GENERATOR_SUSPEND_AWAIT"]],
    oseoGeneratorSuspendYield: [["OSEO_GENERATOR_SUSPEND_YIELD"]],
    oseoGeneratorSuspendContextGeneratorU: [
      ["oseo_generator_suspend(context, generator, "],
      ["u, "],
    ],
    rootsStatement: [["roots["], ["]};"]],
    fast: [["fast_"], [""]],
    ifGotoBbStatement: [["if ("], [") goto bb"], [";"]],
    ifCompletionUKindNotEqualAddressAddress: [
      ["if (completion["],
      ["u].kind != 0 && "],
    ],
    completionUDepthAssignUOpen: [["completion["], ["u].depth <= "], ["u) {"]],
    ifCompletionKindReturnOpen: [["if (completion["], ["u].kind == 1) {"]],
    contextMemberLineAssignCompletionULine: [
      ["    context->line = completion["],
      ["u].line;"],
    ],
    contextMemberColumnAssignCompletionUColumn: [
      ["    context->column = completion["],
      ["u].column;"],
    ],
    contextMemberSourceIdAssignCompletionU: [
      ["    context->source_id = completion["],
      ["u].source_id;"],
    ],
    contextMemberSourceIdLengthAssign: [["    context->source_id_length = "]],
    completionUSourceIdLengthStatement: [
      ["completion["],
      ["u].source_id_length;"],
    ],
    contextMemberErrorCodeAssignCompletionU: [
      ["    context->error_code = completion["],
      ["u].error_code;"],
    ],
    contextMemberErrorMessageAssignCompletionU: [
      ["    context->error_message = completion["],
      ["u].error_message;"],
    ],
    contextMemberHasDiagnosticAssignFalse: [
      ["    context->has_diagnostic = false;"],
    ],
    resultAssignOseoResultOseoStatusThrow: [
      ["    result = (OseoResult){OSEO_STATUS_THROW, "],
    ],
    gotoAbruptStatement: [["    goto abrupt;"]],
    switchCompletionUTargetOpen: [["switch (completion["], ["u].target) {"]],
    abortStatement: [["abort();"]],
  },
  prologue: {
    resultAssignOseoEnvironmentCreateContextU: [
      ["result = oseo_environment_create(context, "],
      ["u);"],
    ],
    resultAssignOseoFunctionEnvironmentContext: [
      ["result = oseo_function_environment(context, call", "ee);"],
    ],
    resultAssignOseoEnvironmentCloneContext: [
      ["result = oseo_environment_clone(context, result.", "value);"],
    ],
    resultAssignOseoEnvironmentSetContextRoots: [
      ["result = oseo_environment_set(context, roots["],
      ["], "],
    ],
    uRootsStatement: [[""], ["u, roots["], ["]);"]],
    resultAssignOseoCellInitializeContext: [
      ["result = oseo_cell_initialize(context, result.va", "lue, callee);"],
    ],
    resultAssignOseoArgumentsCreate: [
      [
        "result = oseo_arguments_create(context, callee, argument_count, ",
        "arguments);",
      ],
    ],
    resultAssignOseoMappedArgumentsCreate: [
      ["result = oseo_mapped_arguments_create(context, roo", "ts["],
      ["], callee, argument_count, arguments, "],
      [", "],
      [", "],
      ["u);"],
    ],
    oseoCellSet: [["oseo_cell_set"]],
    oseoCellInitialize: [["oseo_cell_initialize"]],
    resultAssignOseoArrayCreateContextU: [
      ["result = oseo_array_create(context, 0u);"],
    ],
    resultAssignContextRootsResultValue: [
      ["result = "],
      ["(context, roots["],
      ["], result.value);"],
    ],
    forSizeTRestIndexAssignU: [["for (size_t rest_index_"], [" = "], ["u; "]],
    restIndexArgumentCountRestIndexPlusAssignU: [
      ["rest_index_"],
      [" < argument_count; rest_index_"],
      [" += 1u) {"],
    ],
    resultAssignOseoArrayAppendContextResult: [
      ["    result = oseo_array_append(context, result.v", "alue, "],
    ],
    argumentsRestIndexStatement: [["arguments[rest_index_"], ["]);"]],
    ifResultStatusNotEqualOseoStatusNormalGoto: [
      ["    if (result.status != OSEO_STATUS_NORMAL) got", "o abrupt;"],
    ],
    resultAssignContextResultValue: [
      ["result = "],
      ["(context, result.value, "],
    ],
    argumentCountUArguments: [
      ["(argument_count > "],
      ["u ? arguments["],
      ["] : "],
    ],
    undefinedDefaultArgumentCallSuffix: [["oseo_undefined()));"]],
  },
  blocks: {
    bbStatement: [["bb"], [":;"]],
    rootsAssignOseoGeneratorSentGenerator: [
      ["roots["],
      ["] = oseo_generator_sent(generator);"],
    ],
    oseoGeneratorResumeReturnGotoBbStatement: [
      ["OSEO_GENERATOR_RESUME_RETURN) goto bb"],
      [";"],
    ],
    oseoGeneratorResumeThrowGotoBbStatement: [
      ["OSEO_GENERATOR_RESUME_THROW) goto bb"],
      [";"],
    ],
  },
  completionDeclaration: {
    oseoCompletionRecordPointerCompletion: [
      ["    OseoCompletionRecord *completion =\n"],
    ],
    oseoGeneratorCompletionsGeneratorLine: [
      ["        oseo_generator_completions(generator);\n"],
    ],
    oseoCompletionRecordCompletionUAssign: [
      ["    OseoCompletionRecord completion["],
      ["u] = "],
    ],
    uUUUNullUNullNullLine: [["{{0, 0u, 0u, 0u, 0u, NULL, 0u, NULL, NULL}};\n"]],
  },
  generatorBodyName: {
    oseoGeneratorBody: [["oseo_generator_body_"], [""]],
  },
  generatorBody: {
    switchOseoGeneratorResumePointGenerator: [
      ["switch (oseo_generator_resume_point(generator)) ", "{"],
    ],
    staticOseoResultLine: [["static OseoResult "], ["(\n"]],
    oseoValueGeneratorLine: [["    OseoValue generator\n"]],
    oseoValuePointerRootsAssignOseoGenerator: [
      ["    OseoValue *roots = oseo_generator_slots(gene", "rator);\n"],
    ],
    oseoValueCalleeAssignOseoGeneratorCallee: [
      ["    OseoValue callee = oseo_generator_callee(gen", "erator);\n"],
    ],
    oseoValueReceiverAssignOseoGenerator: [
      ["    OseoValue receiver = oseo_generator_receiver", "(generator);\n"],
    ],
    oseoResultResultAssignOseoStatusNormalOseo: [
      ["    OseoResult result = {OSEO_STATUS_NORMAL, ose", "o_undefined()};\n"],
    ],
    voidContextLine: [["    (void)context;\n"]],
  },
  function: {
    resultAssignOseoGeneratorCreateContext: [
      ["result = oseo_generator_create(context, callee, ", "receiver", ", "],
    ],
    frameSlotsAssignResultValueStatement: [["frame.slots[0] = result.value;"]],
    frameSlotsZero: [["frame.slots[0]"]],
    rootsAssignOseoGeneratorSlotsFrameSlots: [
      ["roots = oseo_generator_slots(frame.slots[0]);"],
    ],
    resultAssignOseoResultOseoStatusNormal: [
      ["result = (OseoResult){OSEO_STATUS_NORMAL, frame.", "slots[0]};"],
    ],
    oseoRootsReleaseContextAddressFrame: [
      ["oseo_roots_release(context, &frame);"],
    ],
    staticOseoResultOseoFunctionLine: [
      ["static OseoResult oseo_function_"],
      ["(\n"],
    ],
    oseoValueCalleeLine: [["    OseoValue callee,\n"]],
    oseoValueReceiverLine: [["    OseoValue receiver,\n"]],
    sizeTArgumentCountLine: [["    size_t argument_count,\n"]],
    constOseoValuePointerArgumentsLine: [["    const OseoValue *arguments,\n"]],
    oseoValueNewTargetLine: [["    OseoValue new_target\n"]],
    oseoRootFrameFrameAssignNullNullULine: [
      ["    OseoRootFrame frame = {NULL, NULL, 0u};\n"],
    ],
    oseoValuePointerRootsLine: [["    OseoValue *roots;\n"]],
    voidArgumentCountLine: [["    (void)argument_count;\n"]],
    voidArgumentsLine: [["    (void)arguments;\n"]],
    voidNewTargetLine: [["    (void)new_target;\n"]],
    resultAssignOseoRootsAllocate: [["    result = oseo_roots_allocate("]],
    contextAddressFrameULine: [["context, &frame, "], ["u);\n"]],
    ifResultStatusNotEqualOseoStatusNormal: [
      ["    if (result.status != OSEO_STATUS_NORMAL) ret", "urn result;\n"],
    ],
    rootsAssignFrameSlotsLine: [["    roots = frame.slots;\n"]],
    newline: [[""], ["\n"], [""]],
  },
  prototype: {
    staticOseoResultOseoFunction: [["static OseoResult oseo_function_"], ["("]],
    oseoContextPointerOseoValueOseoValueSizeT: [
      ["OseoContext *, OseoValue, OseoValue, size_t, "],
    ],
    constOseoValuePointerOseoValueStatement: [
      ["const OseoValue *, OseoValue);"],
    ],
    staticOseoResult: [[""], ["\nstatic OseoResult "], ["("]],
    oseoContextPointerOseoValueStatement: [["OseoContext *, OseoValue);"]],
  },
  generatorDispatcher: {
    source: [
      [
        "static OseoResult oseo_dispatch_generator(\n    O",
        "seoContext *context,\n    OseoValue generator\n) {",
        "\n    size_t code_id = 0u;\n    OseoResult result ",
        "= oseo_function_code_id(\n        context, oseo_g",
        "enerator_callee(generator), &code_id);\n    if (r",
        "esult.status != OSEO_STATUS_NORMAL) return resul",
        "t;\n    switch (code_id) {\n",
      ],
      [
        "\n    default:\n        return oseo_unknown_functi",
        "on(context, code_id);\n    }\n}",
      ],
    ],
    caseClause: [
      ["    case "],
      ["u:\n        return "],
      ["(context, generator);"],
    ],
  },
  functionDispatcher: {
    source: [
      [
        "static OseoResult oseo_dispatch_function(\n    Os",
        "eoContext *context,\n    OseoValue callee,\n    Os",
        "eoValue receiver,\n    size_t argument_count,\n   ",
        " const OseoValue *arguments,\n    OseoValue new_t",
        "arget\n) {\n    size_t code_id = 0u;\n    OseoResul",
        "t result = oseo_function_code_id(\n        contex",
        "t, callee, &code_id);\n    if (result.status != O",
        "SEO_STATUS_NORMAL) return result;\n    (void)rece",
        "iver;\n    (void)argument_count;\n    (void)argume",
        "nts;\n    (void)new_target;\n    switch (code_id) ",
        "{\n",
      ],
      [
        "    default:\n        return oseo_unknown_functio",
        "n(context, code_id);\n    }\n}",
      ],
    ],
    caseClause: [
      ["    case "],
      ["u:\n        result = oseo_frame_enter(context, "],
      [
        "u);\n        if (result.status == OSEO_STATUS_NOR",
        "MAL) {\n            result = oseo_function_",
      ],
      [
        "(\n                context, callee, receiver, arg",
        "ument_count,\n                arguments, new_targ",
        "et);\n            oseo_frame_leave(context, ",
      ],
      ["u);\n        }\n        return result;"],
    ],
  },
  program: {
    voidOseoFunctionStatement: [["    (void)oseo_function_"], [";"]],
    typedefOseoResultPointerOseoFunctionEntry: [
      ["typedef OseoResult (*OseoFunctionEntry)(\n"],
    ],
    oseoContextPointerOseoValueOseoValueSizeT: [
      ["    OseoContext *, OseoValue, OseoValue, size_t,", "\n"],
    ],
    constOseoValuePointerOseoValueLine: [
      ["    const OseoValue *, OseoValue);\n\n"],
    ],
    oseoContextSetGeneratorDispatcherLine: [
      ["    oseo_context_set_generator_dispatcher(\n"],
    ],
    addressContextOseoDispatchGeneratorLine: [
      ["        &context, oseo_dispatch_generator);\n"],
    ],
    contextObserveSpecializationAssignTrueLine: [
      ["    context.observe_specialization = true;\n"],
    ],
    oseoContextPrintObservationsAddressContext: [
      ["    oseo_context_print_observations(&context);\n"],
    ],
    source: [
      [
        '#include "oseo_runtime.h"\n\n#include <math.h>\n#in',
        "clude <stddef.h>\n#include <stdint.h>\n#include <s",
        "tdlib.h>\n\n",
      ],
      [""],
      ["\n\n"],
      ["\n\n"],
      [""],
      [
        "\nint main(void) {\n    OseoContext context;\n    O",
        "seoResult result;\n",
      ],
      [""],
      ['    oseo_context_init(\n        &context, "'],
      ['", '],
      [
        "u);\n    oseo_context_set_function_dispatcher(\n  ",
        "      &context, oseo_dispatch_function);\n",
      ],
      [""],
      ["    result = oseo_frame_enter(\n        &context,", " "],
      [
        "u);\n    if (result.status == OSEO_STATUS_NORMAL)",
        " {\n        result = oseo_function_script(\n      ",
        "      &context, oseo_undefined(), oseo_undefined",
        "(), 0u,\n            NULL, oseo_undefined());\n   ",
        "     oseo_frame_leave(\n            &context, ",
      ],
      [
        "u);\n    }\n    if (result.status == OSEO_STATUS_N",
        "ORMAL) {\n        result = oseo_event_loop_run(\n  ",
        "          &context, result.value);\n    } else {\n",
        "        result = oseo_entr",
        "y_task_checkpoint(&context, result);\n    }\n    i",
        "f (result.status != OSEO_STATUS_NORMAL) {\n      ",
        "  oseo_context_print_thrown(&context, result.val",
        "ue);\n        oseo_context_destroy(&context);\n   ",
        "     return 1;\n    }\n",
      ],
      ["    oseo_context_destroy(&context);\n    return 0", ";\n}\n"],
    ],
  },
} as const;
