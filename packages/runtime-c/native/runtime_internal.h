#ifndef OSEO_RUNTIME_INTERNAL_H
#define OSEO_RUNTIME_INTERNAL_H

/*
 * Package-private representations and helpers shared by the Oseo
 * C runtime translation units. Generated C and direct native
 * fixtures include oseo_runtime.h only; nothing outside
 * @oseo/runtime-c may include this header.
 */

#include "oseo_runtime.h"

#include <string.h>

#define OSEO_CANONICAL_NAN UINT64_C(0x7ff8000000000000)
/* 2^53 - 1, the largest integer ToIndex admits. */
#define OSEO_INDEX_LIMIT 9007199254740991.0
#define OSEO_MAX_ACTIVE_FRAME_SLOTS ((size_t)32768u)
#define OSEO_MAX_CALL_DEPTH ((size_t)256u)
/* Node.js and Deno expose this V8 UTF-16 string ceiling. */
#define OSEO_MAX_STRING_LENGTH ((size_t)536870888u)
#define OSEO_PAYLOAD_MASK UINT64_C(0x0000ffffffffffff)
#define OSEO_TAG_SHIFT 48u
#define OSEO_TAG_SMI UINT64_C(1)
#define OSEO_TAG_UNDEFINED UINT64_C(2)
#define OSEO_TAG_NULL UINT64_C(3)
#define OSEO_TAG_BOOLEAN UINT64_C(4)
#define OSEO_TAG_HEAP UINT64_C(5)
#define OSEO_TAG_UNINITIALIZED UINT64_C(6)
#define OSEO_SMI_MIN INT64_C(-140737488355328)
#define OSEO_SMI_MAX INT64_C(140737488355327)
#define OSEO_UNHANDLED_THROW_MESSAGE "Unhandled JavaScript throw."

/*
 * Runtime-owned functions use disjoint, fixed-width code ranges. A
 * component may add entries inside its range without renumbering any
 * other component or extending one shared sequence.
 */
#define OSEO_BUILTIN_CODE_RANGE_SIZE ((size_t)256u)
#define OSEO_BUILTIN_CODE_RANGE_LAST(index) \
    (SIZE_MAX - (index) * OSEO_BUILTIN_CODE_RANGE_SIZE)
#define OSEO_BUILTIN_CODE_RANGE_FIRST(index) \
    (OSEO_BUILTIN_CODE_RANGE_LAST(index) - \
     (OSEO_BUILTIN_CODE_RANGE_SIZE - 1u))

#define OSEO_PROMISE_CODE_ID_RANGE_INDEX ((size_t)0u)
#define OSEO_PROMISE_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_PROMISE_CODE_ID_RANGE_INDEX)
#define OSEO_PROMISE_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_PROMISE_CODE_ID_RANGE_INDEX)
#define OSEO_PROMISE_RESOLVE_CODE_ID OSEO_PROMISE_CODE_ID_RANGE_LAST
#define OSEO_PROMISE_REJECT_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 1u)
#define OSEO_PROMISE_THEN_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 2u)
#define OSEO_PROMISE_CATCH_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 3u)
#define OSEO_PROMISE_FINALLY_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 4u)
#define OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 5u)
#define OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 6u)
#define OSEO_PROMISE_FINALLY_FULFILL_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 7u)
#define OSEO_PROMISE_FINALLY_REJECT_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 8u)
#define OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 9u)
#define OSEO_PROMISE_CONSTRUCTOR_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 10u)
#define OSEO_PROMISE_STATIC_RESOLVE_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 11u)
#define OSEO_PROMISE_STATIC_REJECT_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 12u)
#define OSEO_PROMISE_WITH_RESOLVERS_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 13u)
#define OSEO_PROMISE_TRY_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 14u)
#define OSEO_PROMISE_SPECIES_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 15u)
/* GetCapabilitiesExecutor: the anonymous executor NewPromiseCapability
 * hands to an arbitrary constructor so it can capture that
 * constructor's resolving functions. */
#define OSEO_PROMISE_CAPABILITY_EXECUTOR_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 16u)
#define OSEO_PROMISE_ALL_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 17u)
#define OSEO_PROMISE_RACE_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 18u)
/* The combinators whose graph node has not landed. They exist as
 * function objects so %Promise% carries every own property ECMA-262
 * requires, and calling one reports the owned unadmitted diagnostic. */
#define OSEO_PROMISE_DEFERRED_STATIC_CODE_ID \
    (OSEO_PROMISE_CODE_ID_RANGE_LAST - 19u)

#define OSEO_ERROR_CODE_ID_RANGE_INDEX ((size_t)1u)
#define OSEO_ERROR_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ERROR_CODE_ID_RANGE_INDEX)
#define OSEO_ERROR_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ERROR_CODE_ID_RANGE_INDEX)
/*
 * Error constructor code IDs occupy one contiguous block indexed by
 * OseoErrorKind from the top of the error component's range.
 */
#define OSEO_ERROR_KIND_COUNT ((size_t)8u)
#define OSEO_ERROR_CONSTRUCT_LAST_CODE_ID OSEO_ERROR_CODE_ID_RANGE_LAST
#define OSEO_ERROR_CONSTRUCT_FIRST_CODE_ID \
    (OSEO_ERROR_CODE_ID_RANGE_LAST - (OSEO_ERROR_KIND_COUNT - 1u))
#define OSEO_ERROR_TO_STRING_CODE_ID \
    (OSEO_ERROR_CODE_ID_RANGE_LAST - OSEO_ERROR_KIND_COUNT)

#define OSEO_SYMBOL_CODE_ID_RANGE_INDEX ((size_t)2u)
#define OSEO_SYMBOL_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_SYMBOL_CODE_ID_RANGE_INDEX)
#define OSEO_SYMBOL_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_SYMBOL_CODE_ID_RANGE_INDEX)
#define OSEO_SYMBOL_CONSTRUCT_CODE_ID OSEO_SYMBOL_CODE_ID_RANGE_LAST

#define OSEO_ITERATOR_CODE_ID_RANGE_INDEX ((size_t)3u)
#define OSEO_ITERATOR_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ITERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_ITERATOR_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ITERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_ARRAY_VALUES_CODE_ID OSEO_ITERATOR_CODE_ID_RANGE_LAST
#define OSEO_ARRAY_ITERATOR_NEXT_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 1u)
#define OSEO_ITERATOR_SELF_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 2u)
#define OSEO_ASYNC_FROM_SYNC_FULFILL_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 3u)
#define OSEO_ASYNC_FROM_SYNC_REJECT_CLOSE_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 4u)
#define OSEO_ITERATOR_CONSTRUCTOR_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 5u)
#define OSEO_ITERATOR_FROM_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 6u)
#define OSEO_WRAP_FOR_VALID_ITERATOR_NEXT_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 7u)
#define OSEO_WRAP_FOR_VALID_ITERATOR_RETURN_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 8u)
#define OSEO_ITERATOR_CONSTRUCTOR_GETTER_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 9u)
#define OSEO_ITERATOR_CONSTRUCTOR_SETTER_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 10u)
#define OSEO_ITERATOR_TAG_GETTER_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 11u)
#define OSEO_ITERATOR_TAG_SETTER_CODE_ID \
    (OSEO_ITERATOR_CODE_ID_RANGE_LAST - 12u)

#define OSEO_GENERATOR_CODE_ID_RANGE_INDEX ((size_t)4u)
#define OSEO_GENERATOR_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_GENERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_GENERATOR_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_GENERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_GENERATOR_NEXT_CODE_ID OSEO_GENERATOR_CODE_ID_RANGE_LAST
#define OSEO_GENERATOR_RETURN_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 1u)
#define OSEO_GENERATOR_THROW_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 2u)
#define OSEO_ASYNC_ITERATOR_SELF_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 3u)
/* %AsyncGeneratorFunction%. The intrinsic exists so the asynchronous
 * generator prototype chain and its `constructor` links are complete,
 * but reaching its [[Call]] or [[Construct]] means source text became
 * known only at run time, which ADR 0016 keeps outside the profile. The
 * frontend rejects every dynamic source form it can see, so this entry
 * point reports the same boundary for the one reference a property chain
 * can still reach. */
#define OSEO_ASYNC_GENERATOR_FUNCTION_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 4u)
/* %GeneratorFunction% and %AsyncFunction%. Both exist for the same
 * reason %AsyncGeneratorFunction% does: the prototype chain a generator
 * function, an asynchronous function, and a generator object expose
 * through Object.getPrototypeOf ends at a real constructor whose
 * `constructor` and `prototype` links close. Reaching either one's
 * [[Call]] or [[Construct]] still means source text became known only at
 * run time, which ADR 0016 keeps outside the profile. */
#define OSEO_GENERATOR_FUNCTION_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 5u)
#define OSEO_ASYNC_FUNCTION_CODE_ID \
    (OSEO_GENERATOR_CODE_ID_RANGE_LAST - 6u)

#define OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_INDEX ((size_t)5u)
#define OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_INDEX)
#define OSEO_ASYNC_GENERATOR_NEXT_CODE_ID \
    OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST
#define OSEO_ASYNC_GENERATOR_RETURN_CODE_ID \
    (OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST - 1u)
#define OSEO_ASYNC_GENERATOR_THROW_CODE_ID \
    (OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST - 2u)
/* The two reactions one asynchronous generator await installs on the
 * operand it suspended with. Each carries the generator in slot 0 of its
 * own environment and resumes the body with the settled value. */
#define OSEO_ASYNC_GENERATOR_FULFILL_CODE_ID \
    (OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST - 3u)
#define OSEO_ASYNC_GENERATOR_REJECT_CODE_ID \
    (OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST - 4u)

#define OSEO_ARRAY_CODE_ID_RANGE_INDEX ((size_t)6u)
#define OSEO_ARRAY_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ARRAY_CODE_ID_RANGE_INDEX)
#define OSEO_ARRAY_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ARRAY_CODE_ID_RANGE_INDEX)
#define OSEO_ARRAY_PUSH_CODE_ID OSEO_ARRAY_CODE_ID_RANGE_LAST
#define OSEO_ARRAY_CONSTRUCTOR_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 1u)
#define OSEO_ARRAY_FROM_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 2u)
#define OSEO_ARRAY_IS_ARRAY_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 3u)
#define OSEO_ARRAY_OF_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 4u)
#define OSEO_ARRAY_SPECIES_GETTER_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 5u)
#define OSEO_ARRAY_UNADMITTED_METHOD_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 6u)
#define OSEO_ARRAY_EVERY_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 7u)
#define OSEO_ARRAY_FOR_EACH_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 8u)
#define OSEO_ARRAY_SOME_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 9u)
#define OSEO_ARRAY_FILTER_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 10u)
#define OSEO_ARRAY_MAP_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 11u)
#define OSEO_ARRAY_CONCAT_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 12u)
#define OSEO_ARRAY_FLAT_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 13u)
#define OSEO_ARRAY_FLAT_MAP_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 14u)
#define OSEO_ARRAY_JOIN_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 15u)
#define OSEO_ARRAY_SLICE_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 16u)
#define OSEO_ARRAY_TO_LOCALE_STRING_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 17u)
#define OSEO_ARRAY_TO_STRING_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 18u)
#define OSEO_ARRAY_SORT_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 19u)
#define OSEO_ARRAY_TO_SORTED_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 20u)
#define OSEO_ARRAY_REDUCE_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 21u)
#define OSEO_ARRAY_REDUCE_RIGHT_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 22u)
#define OSEO_ARRAY_AT_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 23u)
#define OSEO_ARRAY_INCLUDES_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 24u)
#define OSEO_ARRAY_INDEX_OF_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 25u)
#define OSEO_ARRAY_LAST_INDEX_OF_CODE_ID \
    (OSEO_ARRAY_CODE_ID_RANGE_LAST - 26u)

#define OSEO_ARGUMENTS_CODE_ID_RANGE_INDEX ((size_t)7u)
#define OSEO_ARGUMENTS_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ARGUMENTS_CODE_ID_RANGE_INDEX)
#define OSEO_ARGUMENTS_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ARGUMENTS_CODE_ID_RANGE_INDEX)
/* %ThrowTypeError%. CreateUnmappedArgumentsObject installs it as both
 * the [[Get]] and the [[Set]] of the arguments object's non-configurable
 * `callee`, so every read or write of that property throws a TypeError
 * instead of exposing the running function. */
#define OSEO_THROW_TYPE_ERROR_CODE_ID \
    OSEO_ARGUMENTS_CODE_ID_RANGE_LAST

#define OSEO_FUNCTION_CODE_ID_RANGE_INDEX ((size_t)8u)
#define OSEO_FUNCTION_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_FUNCTION_CODE_ID_RANGE_INDEX)
#define OSEO_FUNCTION_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_FUNCTION_CODE_ID_RANGE_INDEX)
#define OSEO_FUNCTION_PROTOTYPE_CODE_ID OSEO_FUNCTION_CODE_ID_RANGE_LAST
#define OSEO_FUNCTION_CONSTRUCTOR_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 1u)
#define OSEO_FUNCTION_APPLY_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 2u)
#define OSEO_FUNCTION_BIND_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 3u)
#define OSEO_FUNCTION_CALL_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 4u)
#define OSEO_FUNCTION_TO_STRING_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 5u)
#define OSEO_FUNCTION_HAS_INSTANCE_CODE_ID \
    (OSEO_FUNCTION_CODE_ID_RANGE_LAST - 6u)

#define OSEO_OBJECT_CODE_ID_RANGE_INDEX ((size_t)9u)
#define OSEO_OBJECT_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_OBJECT_CODE_ID_RANGE_INDEX)
#define OSEO_OBJECT_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_OBJECT_CODE_ID_RANGE_INDEX)
#define OSEO_OBJECT_CONSTRUCTOR_CODE_ID OSEO_OBJECT_CODE_ID_RANGE_LAST
#define OSEO_OBJECT_HAS_OWN_PROPERTY_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 1u)
#define OSEO_OBJECT_IS_PROTOTYPE_OF_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 2u)
#define OSEO_OBJECT_PROPERTY_IS_ENUMERABLE_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 3u)
#define OSEO_OBJECT_TO_STRING_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 4u)
#define OSEO_OBJECT_TO_LOCALE_STRING_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 5u)
#define OSEO_OBJECT_VALUE_OF_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 6u)
#define OSEO_OBJECT_GET_PROTOTYPE_OF_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 7u)
#define OSEO_OBJECT_IS_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 8u)
#define OSEO_OBJECT_SET_PROTOTYPE_OF_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 9u)
#define OSEO_OBJECT_PRIMITIVE_WRAPPER_METHOD_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 10u)
#define OSEO_OBJECT_CREATE_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 11u)
#define OSEO_OBJECT_DEFINE_PROPERTY_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 12u)
#define OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 13u)
#define OSEO_OBJECT_KEYS_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 14u)
#define OSEO_OBJECT_DEFERRED_STATIC_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 15u)
#define OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 16u)
#define OSEO_OBJECT_FREEZE_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 17u)
#define OSEO_OBJECT_IS_EXTENSIBLE_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 18u)
#define OSEO_OBJECT_IS_FROZEN_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 19u)
#define OSEO_OBJECT_IS_SEALED_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 20u)
#define OSEO_OBJECT_PREVENT_EXTENSIONS_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 21u)
#define OSEO_OBJECT_SEAL_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 22u)
#define OSEO_OBJECT_DEFINE_PROPERTIES_CODE_ID \
    (OSEO_OBJECT_CODE_ID_RANGE_LAST - 23u)

#define OSEO_NUMBER_CODE_ID_RANGE_INDEX ((size_t)10u)
#define OSEO_NUMBER_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_NUMBER_CODE_ID_RANGE_INDEX)
#define OSEO_NUMBER_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_NUMBER_CODE_ID_RANGE_INDEX)
#define OSEO_NUMBER_CONSTRUCTOR_CODE_ID OSEO_NUMBER_CODE_ID_RANGE_LAST
#define OSEO_NUMBER_IS_FINITE_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 1u)
#define OSEO_NUMBER_IS_INTEGER_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 2u)
#define OSEO_NUMBER_IS_NAN_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 3u)
#define OSEO_NUMBER_IS_SAFE_INTEGER_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 4u)
#define OSEO_NUMBER_PARSE_FLOAT_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 5u)
#define OSEO_NUMBER_PARSE_INT_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 6u)
#define OSEO_NUMBER_VALUE_OF_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 7u)
#define OSEO_NUMBER_TO_STRING_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 8u)
#define OSEO_NUMBER_TO_FIXED_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 9u)
#define OSEO_NUMBER_TO_EXPONENTIAL_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 10u)
#define OSEO_NUMBER_TO_PRECISION_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 11u)
#define OSEO_NUMBER_TO_LOCALE_STRING_CODE_ID \
    (OSEO_NUMBER_CODE_ID_RANGE_LAST - 12u)

#define OSEO_ARRAY_BUFFER_CODE_ID_RANGE_INDEX ((size_t)11u)
#define OSEO_ARRAY_BUFFER_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_ARRAY_BUFFER_CODE_ID_RANGE_INDEX)
#define OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_ARRAY_BUFFER_CODE_ID_RANGE_INDEX)
#define OSEO_ARRAY_BUFFER_CONSTRUCTOR_CODE_ID \
    OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST
#define OSEO_ARRAY_BUFFER_IS_VIEW_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 1u)
#define OSEO_ARRAY_BUFFER_SPECIES_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 2u)
#define OSEO_ARRAY_BUFFER_BYTE_LENGTH_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 3u)
#define OSEO_ARRAY_BUFFER_DETACHED_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 4u)
#define OSEO_ARRAY_BUFFER_MAX_BYTE_LENGTH_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 5u)
#define OSEO_ARRAY_BUFFER_RESIZABLE_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 6u)
#define OSEO_ARRAY_BUFFER_RESIZE_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 7u)
#define OSEO_ARRAY_BUFFER_SLICE_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 8u)
#define OSEO_ARRAY_BUFFER_TRANSFER_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 9u)
#define OSEO_ARRAY_BUFFER_TRANSFER_TO_FIXED_LENGTH_CODE_ID \
    (OSEO_ARRAY_BUFFER_CODE_ID_RANGE_LAST - 10u)


#define OSEO_STRING_CODE_ID_RANGE_INDEX ((size_t)12u)
#define OSEO_STRING_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_STRING_CODE_ID_RANGE_INDEX)
#define OSEO_STRING_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_STRING_CODE_ID_RANGE_INDEX)
#define OSEO_STRING_CONSTRUCTOR_CODE_ID OSEO_STRING_CODE_ID_RANGE_LAST
#define OSEO_STRING_FROM_CHAR_CODE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 1u)
#define OSEO_STRING_FROM_CODE_POINT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 2u)
#define OSEO_STRING_RAW_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 3u)
#define OSEO_STRING_UNADMITTED_METHOD_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 4u)
#define OSEO_STRING_AT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 5u)
#define OSEO_STRING_CHAR_AT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 6u)
#define OSEO_STRING_CHAR_CODE_AT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 7u)
#define OSEO_STRING_CODE_POINT_AT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 8u)
#define OSEO_STRING_TO_STRING_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 9u)
#define OSEO_STRING_VALUE_OF_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 10u)
#define OSEO_STRING_CONCAT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 11u)
#define OSEO_STRING_INDEX_OF_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 12u)
#define OSEO_STRING_LAST_INDEX_OF_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 13u)
#define OSEO_STRING_INCLUDES_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 14u)
#define OSEO_STRING_STARTS_WITH_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 15u)
#define OSEO_STRING_ENDS_WITH_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 16u)
#define OSEO_STRING_SLICE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 17u)
#define OSEO_STRING_SUBSTRING_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 18u)
#define OSEO_STRING_MATCH_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 19u)
#define OSEO_STRING_MATCH_ALL_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 20u)
#define OSEO_STRING_SEARCH_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 21u)
#define OSEO_STRING_SPLIT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 22u)
#define OSEO_REGEXP_STRING_ITERATOR_NEXT_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 23u)
#define OSEO_STRING_REPLACE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 24u)
#define OSEO_STRING_REPLACE_ALL_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 25u)
#define OSEO_STRING_LOWERCASE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 26u)
#define OSEO_STRING_UPPERCASE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 27u)
#define OSEO_STRING_TRIM_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 28u)
#define OSEO_STRING_TRIM_START_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 29u)
#define OSEO_STRING_TRIM_END_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 30u)
#define OSEO_STRING_NORMALIZE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 31u)
#define OSEO_STRING_LOCALE_COMPARE_CODE_ID \
    (OSEO_STRING_CODE_ID_RANGE_LAST - 32u)

#define OSEO_MAP_CODE_ID_RANGE_INDEX ((size_t)13u)
#define OSEO_MAP_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_MAP_CODE_ID_RANGE_INDEX)
#define OSEO_MAP_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_MAP_CODE_ID_RANGE_INDEX)
#define OSEO_MAP_CONSTRUCTOR_CODE_ID OSEO_MAP_CODE_ID_RANGE_LAST
#define OSEO_MAP_GET_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 1u)
#define OSEO_MAP_SET_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 2u)
#define OSEO_MAP_HAS_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 3u)
#define OSEO_MAP_DELETE_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 4u)
#define OSEO_MAP_CLEAR_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 5u)
#define OSEO_MAP_FOR_EACH_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 6u)
#define OSEO_MAP_ENTRIES_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 7u)
#define OSEO_MAP_KEYS_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 8u)
#define OSEO_MAP_VALUES_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 9u)
#define OSEO_MAP_SIZE_GETTER_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 10u)
#define OSEO_MAP_GROUP_BY_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 11u)
#define OSEO_MAP_SPECIES_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 12u)
#define OSEO_MAP_ITERATOR_NEXT_CODE_ID (OSEO_MAP_CODE_ID_RANGE_LAST - 13u)

#define OSEO_BIGINT_CODE_ID_RANGE_INDEX ((size_t)14u)
#define OSEO_BIGINT_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_BIGINT_CODE_ID_RANGE_INDEX)
#define OSEO_BIGINT_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_BIGINT_CODE_ID_RANGE_INDEX)
#define OSEO_BIGINT_CONSTRUCTOR_CODE_ID OSEO_BIGINT_CODE_ID_RANGE_LAST
#define OSEO_BIGINT_AS_INT_N_CODE_ID (OSEO_BIGINT_CODE_ID_RANGE_LAST - 1u)
#define OSEO_BIGINT_AS_UINT_N_CODE_ID (OSEO_BIGINT_CODE_ID_RANGE_LAST - 2u)
#define OSEO_BIGINT_TO_STRING_CODE_ID (OSEO_BIGINT_CODE_ID_RANGE_LAST - 3u)
#define OSEO_BIGINT_TO_LOCALE_STRING_CODE_ID \
    (OSEO_BIGINT_CODE_ID_RANGE_LAST - 4u)
#define OSEO_BIGINT_VALUE_OF_CODE_ID (OSEO_BIGINT_CODE_ID_RANGE_LAST - 5u)

#define OSEO_DATA_VIEW_CODE_ID_RANGE_INDEX ((size_t)15u)
#define OSEO_DATA_VIEW_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_DATA_VIEW_CODE_ID_RANGE_INDEX)
#define OSEO_DATA_VIEW_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_DATA_VIEW_CODE_ID_RANGE_INDEX)
#define OSEO_DATA_VIEW_CONSTRUCTOR_CODE_ID OSEO_DATA_VIEW_CODE_ID_RANGE_LAST
#define OSEO_DATA_VIEW_BUFFER_CODE_ID \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 1u)
#define OSEO_DATA_VIEW_BYTE_LENGTH_CODE_ID \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 2u)
#define OSEO_DATA_VIEW_BYTE_OFFSET_CODE_ID \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 3u)
/*
 * The eleven get and eleven set accessors keep the element-type order of
 * `OseoDataViewElement`, so a code ID is the range last minus four or
 * fifteen plus that element index and dispatch needs no table.
 */
#define OSEO_DATA_VIEW_GET_CODE_ID_FIRST \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 14u)
#define OSEO_DATA_VIEW_GET_CODE_ID_LAST \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 4u)
#define OSEO_DATA_VIEW_SET_CODE_ID_FIRST \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 25u)
#define OSEO_DATA_VIEW_SET_CODE_ID_LAST \
    (OSEO_DATA_VIEW_CODE_ID_RANGE_LAST - 15u)

#define OSEO_REGEXP_CODE_ID_RANGE_INDEX ((size_t)16u)
#define OSEO_REGEXP_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_REGEXP_CODE_ID_RANGE_INDEX)
#define OSEO_REGEXP_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_REGEXP_CODE_ID_RANGE_INDEX)
#define OSEO_REGEXP_CONSTRUCTOR_CODE_ID OSEO_REGEXP_CODE_ID_RANGE_LAST
#define OSEO_REGEXP_SPECIES_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 1u)
#define OSEO_REGEXP_EXEC_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 2u)
#define OSEO_REGEXP_TEST_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 3u)
#define OSEO_REGEXP_TO_STRING_CODE_ID \
    (OSEO_REGEXP_CODE_ID_RANGE_LAST - 4u)
#define OSEO_REGEXP_FLAGS_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 5u)
#define OSEO_REGEXP_SOURCE_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 6u)
/*
 * The eight individual flag accessors keep the order `flags` prints, so a
 * code ID is the range last minus seven minus that flag's index and the
 * dispatch needs no table.
 */
#define OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_LAST \
    (OSEO_REGEXP_CODE_ID_RANGE_LAST - 7u)
#define OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_FIRST \
    (OSEO_REGEXP_CODE_ID_RANGE_LAST - 14u)
/*
 * The five well-known symbol methods occupy one contiguous block that
 * ends at the `escape` static, so the dispatcher routes the whole block
 * to the symbol-method component with one range test.
 */
#define OSEO_REGEXP_MATCH_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 15u)
#define OSEO_REGEXP_MATCH_ALL_CODE_ID \
    (OSEO_REGEXP_CODE_ID_RANGE_LAST - 16u)
#define OSEO_REGEXP_SEARCH_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 17u)
#define OSEO_REGEXP_SPLIT_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 18u)
#define OSEO_REGEXP_REPLACE_CODE_ID \
    (OSEO_REGEXP_CODE_ID_RANGE_LAST - 19u)
#define OSEO_REGEXP_ESCAPE_CODE_ID (OSEO_REGEXP_CODE_ID_RANGE_LAST - 20u)

#define OSEO_MATH_CODE_ID_RANGE_INDEX ((size_t)17u)
#define OSEO_MATH_CODE_ID_RANGE_FIRST \
    OSEO_BUILTIN_CODE_RANGE_FIRST(OSEO_MATH_CODE_ID_RANGE_INDEX)
#define OSEO_MATH_CODE_ID_RANGE_LAST \
    OSEO_BUILTIN_CODE_RANGE_LAST(OSEO_MATH_CODE_ID_RANGE_INDEX)
/*
 * The Math function properties keep one dense order, so a code ID is
 * the range last minus that function's index in `math_functions` and
 * the dispatch needs no separate table. The first and last IDs bound
 * the range the builder and the dispatcher both walk.
 */
#define OSEO_MATH_FUNCTION_COUNT ((size_t)36u)
#define OSEO_MATH_FUNCTION_CODE_ID_LAST OSEO_MATH_CODE_ID_RANGE_LAST
#define OSEO_MATH_FUNCTION_CODE_ID_FIRST \
    (OSEO_MATH_CODE_ID_RANGE_LAST - (OSEO_MATH_FUNCTION_COUNT - 1u))

/* Well-known symbol table indexes shared with the public context. */
#define OSEO_WELL_KNOWN_ASYNC_ITERATOR ((size_t)0u)
#define OSEO_WELL_KNOWN_HAS_INSTANCE ((size_t)1u)
#define OSEO_WELL_KNOWN_IS_CONCAT_SPREADABLE ((size_t)2u)
#define OSEO_WELL_KNOWN_ITERATOR ((size_t)3u)
#define OSEO_WELL_KNOWN_MATCH ((size_t)4u)
#define OSEO_WELL_KNOWN_MATCH_ALL ((size_t)5u)
#define OSEO_WELL_KNOWN_REPLACE ((size_t)6u)
#define OSEO_WELL_KNOWN_SEARCH ((size_t)7u)
#define OSEO_WELL_KNOWN_SPECIES ((size_t)8u)
#define OSEO_WELL_KNOWN_SPLIT ((size_t)9u)
#define OSEO_WELL_KNOWN_TO_PRIMITIVE ((size_t)10u)
#define OSEO_WELL_KNOWN_TO_STRING_TAG ((size_t)11u)
#define OSEO_WELL_KNOWN_UNSCOPABLES ((size_t)12u)
#define OSEO_WELL_KNOWN_SYMBOL_COUNT ((size_t)13u)

/*
 * The preferred-type hint passed to the generic ToPrimitive. It is the
 * specification's PreferredType with its three values, and the hint
 * string a @@toPrimitive method receives names the same three.
 */
typedef enum {
    OSEO_TO_PRIMITIVE_DEFAULT = 0,
    OSEO_TO_PRIMITIVE_NUMBER = 1,
    OSEO_TO_PRIMITIVE_STRING = 2,
} OseoToPrimitiveHint;

typedef enum {
    OSEO_HEAP_STRING = 1,
    OSEO_HEAP_ENVIRONMENT = 2,
    OSEO_HEAP_OBJECT = 3,
    OSEO_HEAP_ARRAY = 4,
    OSEO_HEAP_CELL = 5,
    OSEO_HEAP_FUNCTION = 6,
    OSEO_HEAP_PROMISE = 7,
    OSEO_HEAP_PROMISE_REACTION = 8,
    OSEO_HEAP_JOB = 9,
    OSEO_HEAP_PROMISE_AGGREGATE = 10,
    OSEO_HEAP_TIMER = 11,
    OSEO_HEAP_SYMBOL = 12,
    OSEO_HEAP_ARGUMENT_LIST = 13,
    OSEO_HEAP_PRIVATE_NAME = 14,
    OSEO_HEAP_ASYNC_GENERATOR_REQUEST = 15,
    OSEO_HEAP_BIGINT = 16,
    OSEO_HEAP_ENUMERATION = 17,
    OSEO_HEAP_ARRAY_BUFFER = 18,
    OSEO_HEAP_MAP = 19,
    OSEO_HEAP_MAP_ITERATOR = 20,
    OSEO_HEAP_DATA_VIEW = 21,
    OSEO_HEAP_REGEXP_MATCHER = 22,
    OSEO_HEAP_REGEXP = 23,
} OseoHeapKind;

struct OseoHeapObject {
    OseoHeapObject *next;
    OseoHeapObject *trace_next;
    OseoHeapKind kind;
    bool marked;
};

/* Active native array stringification across user-code re-entry. */
typedef struct OseoArrayStringAncestor {
    OseoValue value;
    const struct OseoArrayStringAncestor *previous;
} OseoArrayStringAncestor;

typedef struct {
    OseoHeapObject header;
    size_t length;
    uint16_t units[];
} OseoString;

/* One normalized, immutable arbitrary-precision integer. */
typedef struct {
    OseoHeapObject header;
    bool negative;
    size_t length;
    uint32_t limbs[];
} OseoBigInt;

typedef struct {
    OseoHeapObject header;
    size_t slot_count;
    OseoValue slots[];
} OseoEnvironment;

typedef struct {
    OseoHeapObject header;
    OseoValue value;
    /*
     * An existing global-object property remains the storage selected by
     * Object Environment Record operations. These two roots make this cell
     * a live reference to that property instead of a copied value.
     */
    OseoValue object;
    OseoValue key;
    bool object_environment;
    /*
     * False only after [[DefineOwnProperty]] made the global-object
     * property this cell backs non-writable. A global var or function
     * binding and its property share this one storage location, so the
     * property's [[Writable]] attribute has to reach the binding's own
     * assignment path as well.
     */
    bool writable;
} OseoCell;

typedef struct {
    OseoHeapObject header;
    /* The description string, or undefined for a bare Symbol(). */
    OseoValue description;
} OseoSymbol;

/*
 * One Private Name. Identity is the allocation itself and nothing else,
 * so two names one class body spells the same way never match. A
 * private name is never a property key, and no expression in this
 * profile yields one to source code, so it carries no description: the
 * spelled `#name` stays in the inspectable MIR instead.
 */
typedef struct {
    OseoHeapObject header;
} OseoPrivateName;

typedef struct {
    OseoHeapObject header;
    OseoValue *values;
    size_t length;
    size_t capacity;
} OseoArgumentList;

/*
 * One EnumerateObjectProperties (14.7.5.9) record. It is never reachable
 * from ECMAScript code, so it has no prototype, no `next` property, and
 * no close: a for-in head steps it directly.
 *
 * `keys` is the ordered enumerable string key list collected once, when
 * the enumeration was acquired, across the whole prototype chain with
 * every nearer own key suppressing the same name behind it. `receiver`
 * is the value that chain was collected from, kept so each step can
 * check that the key it is about to report is still reachable, which is
 * what makes a property deleted before it is processed ignored. A string
 * receiver stands for the String exotic object ToObject would create,
 * whose own index properties the string itself describes.
 */
typedef struct {
    OseoHeapObject header;
    OseoValue receiver;
    OseoValue keys;
    size_t index;
} OseoEnumeration;

typedef struct {
    OseoPropertyAttributes attributes;
    OseoValue key;
    /* Unused, and left undefined, when attributes.accessor is true. */
    OseoValue value;
    /* [[Get]] and [[Set]], each undefined when absent. Unused, and left
     * undefined, when attributes.accessor is false. */
    OseoValue getter;
    OseoValue setter;
} OseoProperty;

/*
 * The [[GeneratorState]] values this profile can observe. A suspended
 * generator leaves through a next, a return, or a throw resumption, or
 * stays suspended; `%GeneratorPrototype%.throw` delivers the throw
 * resumption to a synchronous generator.
 *
 * An asynchronous generator adds `OSEO_GENERATOR_AWAITING`, which is
 * [[AsyncGeneratorState]] `executing` with the body parked on a settled
 * promise rather than running: the driver has returned to its caller and
 * a queued reaction owns the next resumption.
 */
typedef enum {
    OSEO_GENERATOR_SUSPENDED_START = 0,
    OSEO_GENERATOR_SUSPENDED_YIELD = 1,
    OSEO_GENERATOR_EXECUTING = 2,
    OSEO_GENERATOR_COMPLETED = 3,
    OSEO_GENERATOR_AWAITING = 4,
} OseoGeneratorState;

/*
 * One AsyncGeneratorRequest: the promise capability that reports the
 * step this request asked for, the value it delivers, and which
 * completion the resumption carries. Requests form a singly linked
 * first-in queue on the generator record, so a `next` that arrives while
 * the body is running waits instead of reaching a running body.
 */
typedef struct {
    OseoHeapObject header;
    OseoValue next;
    OseoValue capability;
    OseoValue value;
    size_t resume_kind;
} OseoAsyncGeneratorRequest;

/*
 * [[GeneratorContext]]: the suspended body frame of one generator.
 * `slots` and `completions` point into the same allocation as the
 * record, so a generator has one stable interior address for the whole
 * of its life and generated code can reacquire `roots` after any
 * safepoint. The collector traces every slot through the owning object.
 */
typedef struct {
    OseoValue callee;
    OseoValue receiver;
    /* The value the pending resumption delivers as the yield result. */
    OseoValue sent;
    /*
     * The promise capability owned by an ordinary asynchronous function
     * frame. Generator records leave it undefined.
     */
    OseoValue async_function_capability;
    /* The pending AsyncGeneratorRequest queue, empty on a synchronous
     * generator. The head request owns the running or parked step. */
    OseoValue request_head;
    OseoValue request_tail;
    OseoValue *slots;
    OseoCompletionRecord *completions;
    size_t slot_count;
    size_t completion_count;
    size_t resume_point;
    /*
     * OSEO_GENERATOR_RESUME_NEXT, OSEO_GENERATOR_RESUME_RETURN, or
     * OSEO_GENERATOR_RESUME_THROW: how the pending resumption delivers
     * `sent`. Generated code reads it at the resume point, so it stays
     * valid for exactly one resumption.
     */
    size_t resume_kind;
    /*
     * OSEO_GENERATOR_SUSPEND_YIELD or OSEO_GENERATOR_SUSPEND_AWAIT: what
     * the pending suspension asked its driver for. Only an asynchronous
     * body suspends to await, and the reason stays valid until the
     * suspension it describes is resumed.
     */
    size_t suspend_reason;
    OseoGeneratorState state;
    /*
     * True for a body created from an asynchronous generator function,
     * whose steps are reported through promises and whose `await`
     * operands suspend the same frame.
     */
    bool asynchronous;
    /*
     * True when this internal frame belongs to an ordinary asynchronous
     * function. The object carrying the frame is never exposed.
     */
    bool async_function;
    /*
     * True while the generator is parked on AsyncGeneratorAwaitReturn:
     * `return` reached a body that never started or already completed,
     * so no frame is entered and the settled value becomes the head
     * request's own final step.
     */
    bool awaiting_return;
    /*
     * True when the pending suspension already yielded a complete
     * iterator result object, as `yield*` does by forwarding the inner
     * iterator's own result. The resumption then reports that object
     * unchanged instead of creating a fresh one.
     */
    bool yielded_result_object;
} OseoGenerator;

/* Which slot of one object's [[PrivateElements]] entry is live. */
typedef enum {
    OSEO_PRIVATE_ELEMENT_FIELD = 0,
    OSEO_PRIVATE_ELEMENT_METHOD = 1,
    OSEO_PRIVATE_ELEMENT_ACCESSOR = 2,
} OseoPrivateElementKind;

/*
 * One entry of an object's [[PrivateElements]]. `key` is a private name,
 * so no string or symbol can name the entry and no property
 * enumeration, descriptor, or prototype walk reaches it.
 */
typedef struct {
    OseoValue key;
    /* The field value or the method function; undefined otherwise. */
    OseoValue value;
    /* [[Get]] and [[Set]] of an accessor element, each possibly
     * undefined; undefined for every other kind. */
    OseoValue getter;
    OseoValue setter;
    OseoPrivateElementKind kind;
} OseoPrivateElement;

typedef struct {
    OseoHeapObject header;
    OseoValue prototype;
    OseoProperty *properties;
    size_t property_capacity;
    size_t property_count;
    /*
     * [[PrivateElements]], in the order one class installed them. It is
     * not property storage: it grows only through the class that
     * declared the names, and only a private reference reads it.
     */
    OseoPrivateElement *private_elements;
    size_t private_element_capacity;
    size_t private_element_count;
    size_t shape_id;
    uint32_t array_length;
    bool dictionary;
    bool length_writable;
    /* [[Extensible]], false for frozen arrays and module namespaces. */
    bool extensible;
    bool module_namespace;
    /*
     * The realm's global this value, whose var-scoped Script bindings
     * are own properties storing the binding cell instead of the value.
     * Every operation that reads or writes such a property goes through
     * the cell, so a binding and its property never diverge.
     */
    bool global_object;
    /* The [[ErrorData]] brand Object.prototype.toString observes. */
    bool error_data;
    /* [[NumberData]] exists exactly when number_data is true, and this slot
     * always contains an immediate Number value. */
    bool number_data;
    OseoValue number_value;
    /* [[BooleanData]], [[StringData]], [[SymbolData]], or [[BigIntData]].
     * Number wrappers retain their existing dedicated brand above. */
    bool primitive_data;
    OseoValue primitive_value;
    /* Internal installation state independent of mutable own properties. */
    bool primitive_wrapper_methods_initialized;
    /* True only while %String.prototype%'s virtual iterator is untouched. */
    bool virtual_string_iterator;
    /* Descriptor state retained while the iterator remains virtual. */
    bool virtual_string_iterator_configurable;
    bool virtual_string_iterator_enumerable;
    bool virtual_string_iterator_writable;
    /* Array iterator state: a flagged object backs a default array's
     * values iterator, tracing the array and stepping the index. */
    bool array_iterator;
    OseoValue iterator_array;
    size_t iterator_index;
    /*
     * RegExp String Iterator state (22.2.9.1). The iterating RegExp object
     * and the iterated String are collector-traced. The cursor itself lives
     * in the RegExp object's own `lastIndex`, so the record holds only the
     * [[Global]] and [[Unicode]] decisions CreateRegExpStringIterator froze
     * and the [[Done]] flag.
     */
    bool regexp_string_iterator;
    OseoValue regexp_iterator_regexp;
    OseoValue regexp_iterator_subject;
    bool regexp_iterator_global;
    bool regexp_iterator_unicode;
    bool regexp_iterator_complete;
    /*
     * AsyncFromSyncIterator state. A `for await` head whose iterable has
     * no Symbol.asyncIterator method wraps the synchronous iterator in a
     * flagged object, which is the only representation of that wrapper:
     * it never reaches user code, so it carries no prototype and no
     * `next` property, and the asynchronous step and close entry points
     * read the wrapped iterator from here instead.
     */
    bool async_from_sync;
    OseoValue async_sync_iterator;
    /* Iterator.from wrappers retain the direct iterator record. */
    bool wrap_for_valid_iterator;
    OseoValue wrapped_iterator;
    OseoValue wrapped_next;
    /* Both mapped and unmapped arguments objects carry the Arguments tag. */
    bool arguments_object;
    /*
     * A mapped arguments exotic object (10.4.4). Each own index property
     * this unit maps stores its parameter's own binding cell as the
     * property's slot value, so cell_backed_property recognizes it and
     * routes [[Get]]/[[Set]]/[[GetOwnProperty]] through the cell the
     * same way it already does for a global or namespace binding.
     * [[DefineOwnProperty]] additionally severs the alias here: an
     * explicit non-writable redefinition, or a redefinition into an
     * accessor, replaces the slot with a plain snapshot so the index and
     * the parameter stop observing each other.
     */
    bool mapped_arguments;
    /* Non-NULL exactly on a generator object, which owns the record. */
    OseoGenerator *generator;
} OseoOrdinaryObject;

/* One realm-local GetTemplateObject cache entry, keyed by a generated site. */
typedef struct {
    const void *site;
    OseoValue object;
} OseoTemplateCacheEntry;

/*
 * One realm-local ahead-of-time literal artifact, keyed by its generated
 * descriptor. The entry is what makes every evaluation of one literal
 * share one immutable matcher while allocating a fresh object.
 *
 * The entries form an open-addressed table whose capacity is a power of
 * two, and a null `literal` marks an unused slot. Keying by address makes
 * one evaluation's lookup independent of how many literal sites the
 * program has, which a linear scan would make quadratic in that count.
 */
typedef struct {
    const OseoRegExpLiteral *literal;
    OseoValue matcher;
} OseoRegExpLiteralCacheEntry;

/* Which instance element one class constructor record describes. */
typedef enum {
    OSEO_CLASS_ELEMENT_FIELD = 0,
    OSEO_CLASS_ELEMENT_PRIVATE_FIELD = 1,
    OSEO_CLASS_ELEMENT_PRIVATE_METHOD = 2,
    OSEO_CLASS_ELEMENT_PRIVATE_ACCESSOR = 3,
} OseoClassElementKind;

/*
 * One entry of a class constructor's [[Fields]] and [[PrivateMethods]].
 * `key` is the property key the class body evaluated for a public
 * field, and the private name the class evaluation created otherwise.
 * `value` is the closure that produces one instance's field value,
 * undefined for a field declared without an initializer, or the
 * function of a private method; `getter` and `setter` carry the two
 * halves of a private accessor, each possibly undefined.
 */
typedef struct {
    OseoValue key;
    OseoValue value;
    OseoValue getter;
    OseoValue setter;
    OseoClassElementKind kind;
} OseoClassElement;

typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue environment;
    OseoValue lexical_this;
    /*
     * Arrows capture the construction target and the function that
     * supplies their `super()` context. Non-arrows keep both undefined.
     */
    OseoValue lexical_new_target;
    OseoValue lexical_super;
    OseoValue prototype_object;
    /*
     * The object a `super.x` reference in this function's body looks
     * through: the class prototype object for an instance element and
     * the constructor itself for a static one. It stays undefined for
     * every function a class definition does not claim, and a class
     * definition sets it before it defines the element's property.
     */
    OseoValue home_object;
    /* Initial SetFunctionName result, independent of later property changes. */
    OseoValue initial_name;
    /* Original source, or undefined for built-in and bound functions. */
    OseoValue source_text;
    /* BoundFunction exotic state, undefined outside OSEO_FUNCTION_BOUND. */
    OseoValue bound_target;
    OseoValue bound_this;
    OseoValue bound_arguments;
    /*
     * [[Fields]] and [[PrivateMethods]], in class-body order and
     * non-NULL only on a class constructor whose body declared instance
     * elements. The list is complete before the class definition
     * finishes, so an instance can never observe it growing.
     */
    OseoClassElement *elements;
    size_t element_count;
    size_t element_capacity;
    size_t code_id;
    OseoFunctionKind function_kind;
    bool prototype_writable;
    /*
     * Where the synthetic `prototype` sits in OrdinaryOwnPropertyKeys
     * order: it is created after `length` and `name`, so it follows
     * exactly this many of the object's leading non-index string keys.
     * The property vector does not store `prototype`, and removal keeps
     * the surviving properties in creation order, so the count is two
     * at creation and drops by one whenever one of those two original
     * properties is deleted. A property later recreated under the same
     * name is appended instead, and the unchanged count keeps it after
     * `prototype` the way its later creation requires.
     */
    size_t prototype_key_position;
} OseoFunction;

typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue result;
    OseoValue reaction_head;
    OseoValue reaction_tail;
    OseoValue unhandled_next;
    const char *rejection_source_id;
    size_t rejection_source_id_length;
    size_t rejection_line;
    size_t rejection_column;
    OseoPromiseState state;
    bool handled;
    bool pending_report;
    bool reported;
} OseoPromise;

/*
 * One ArrayBuffer. The Data Block lives outside the traced heap because
 * it holds bytes rather than values, so `data` is plain host memory that
 * exactly one buffer owns for the whole of its life: nothing else stores
 * the pointer, `array_buffer_detach` is the only operation that releases
 * it early, and the collector releases whatever survives when the object
 * dies. Every operation that hands the block to a copy allocates a
 * second block instead of sharing this one, which is what keeps transfer
 * free of both a stale pointer and a second owner.
 *
 * `data` is NULL exactly when no block is held, which is the detached
 * state and also the zero-byte allocation, so `detached` rather than the
 * pointer decides which of the two an operation observes.
 * `byte_length` is [[ArrayBufferByteLength]] and is 0 once detached. A
 * resizable buffer allocates `max_byte_length` bytes up front, as
 * AllocateArrayBuffer specifies, so `resize` moves `byte_length` inside
 * one stable block and never reallocates.
 */
typedef struct {
    OseoOrdinaryObject ordinary;
    uint8_t *data;
    size_t byte_length;
    /* [[ArrayBufferMaxByteLength]], present only when resizable. */
    size_t max_byte_length;
    bool resizable;
    bool detached;
} OseoArrayBuffer;

/*
 * The eleven DataView element types, in the order the prototype's get and
 * set accessors are created and dispatched. `OSEO_DATA_VIEW_ELEMENT_COUNT`
 * closes the range; nothing else may be appended without moving the code
 * IDs derived from these indexes.
 */
typedef enum {
    OSEO_DATA_VIEW_INT8 = 0,
    OSEO_DATA_VIEW_UINT8 = 1,
    OSEO_DATA_VIEW_INT16 = 2,
    OSEO_DATA_VIEW_UINT16 = 3,
    OSEO_DATA_VIEW_INT32 = 4,
    OSEO_DATA_VIEW_UINT32 = 5,
    OSEO_DATA_VIEW_FLOAT16 = 6,
    OSEO_DATA_VIEW_FLOAT32 = 7,
    OSEO_DATA_VIEW_FLOAT64 = 8,
    OSEO_DATA_VIEW_BIGINT64 = 9,
    OSEO_DATA_VIEW_BIGUINT64 = 10,
    OSEO_DATA_VIEW_ELEMENT_COUNT = 11,
} OseoDataViewElement;

/*
 * One DataView. `buffer` is [[ViewedArrayBuffer]] and is always an
 * ArrayBuffer value, so the collector traces it as an ordinary field and
 * the view keeps its buffer, and therefore that buffer's Data Block,
 * alive. A view never owns, allocates, or releases a Data Block: it holds
 * no pointer into one, and every access rereads the buffer's current
 * `data`, `byte_length`, and `detached` state through this reference.
 *
 * `byte_offset` is [[ByteOffset]]. `byte_length` is [[ByteLength]] when
 * `track_length` is false; when `track_length` is true, [[ByteLength]] is
 * the specification's `auto` and `byte_length` is meaningless, so every
 * read goes through `data_view_byte_length` instead of this field. A
 * length-tracking view exists only over a resizable buffer, but a later
 * transfer can detach that buffer, so neither flag implies the buffer's
 * current state.
 */
typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue buffer;
    size_t byte_offset;
    size_t byte_length;
    bool track_length;
} OseoDataView;

/*
 * The outcome of validating or compiling one dynamic pattern.
 *
 * `INVALID` is the specified catchable `SyntaxError`, `UNSUPPORTED` is a
 * construct a later graph node owns and reports as a located `OSEO2001`
 * boundary, and `LIMIT` is one of the reviewed owned resource bounds.
 */
typedef enum {
    OSEO_REGEXP_VALID = 0,
    OSEO_REGEXP_INVALID = 1,
    OSEO_REGEXP_UNSUPPORTED = 2,
    OSEO_REGEXP_LIMIT = 3,
    OSEO_REGEXP_ALLOCATION_FAILURE = 4,
} OseoRegExpValidation;

/* The outcome of one match attempt over one program. */
typedef enum {
    OSEO_REGEXP_EXECUTION_MATCHED = 0,
    OSEO_REGEXP_EXECUTION_UNMATCHED = 1,
    OSEO_REGEXP_EXECUTION_LIMIT = 2,
    OSEO_REGEXP_EXECUTION_ALLOCATION = 3,
} OseoRegExpExecution;

/*
 * One immutable matcher artifact over one compiled program. The
 * generic matcher consumes UTF-16 source and the normalized flag mask;
 * keeping both as traced values makes the artifact independent from the
 * RegExp wrapper that owns it and lets a later executor allocate only its
 * mutable work area. `program` is native memory this artifact alone
 * owns unless `owns_program` is false, which is how every artifact
 * built from one ahead-of-time literal descriptor shares its static
 * program.
 */
typedef struct {
    OseoHeapObject header;
    OseoValue source;
    OseoValue flags;
    OseoRegExpProgram *program;
    size_t capture_count;
    size_t instruction_count;
    uint16_t flag_mask;
    bool owns_program;
} OseoRegExpMatcher;

/*
 * One initialized RegExp object. `matcher` is undefined only between
 * RegExpAlloc and a successful RegExpInitialize; no such partial object is
 * returned to source code. `lastIndex` is ordinary own property storage so
 * every generic property operation observes its specified descriptor.
 */
typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue matcher;
} OseoRegExp;

typedef enum {
    OSEO_REACTION_NORMAL = 0,
    OSEO_REACTION_ALL = 1,
    OSEO_REACTION_RACE = 2,
} OseoReactionKind;

typedef struct {
    OseoHeapObject header;
    OseoValue next;
    OseoValue on_fulfilled;
    OseoValue on_rejected;
    OseoValue capability;
    OseoValue aggregate;
    size_t index;
    OseoReactionKind kind;
} OseoPromiseReaction;

typedef struct {
    OseoHeapObject header;
    OseoValue capability;
    OseoValue values;
    size_t remaining;
} OseoPromiseAggregate;

typedef enum {
    OSEO_JOB_REACTION = 1,
    OSEO_JOB_THENABLE = 2,
} OseoJobKind;

typedef struct {
    OseoHeapObject header;
    OseoValue next;
    OseoValue primary;
    OseoValue secondary;
    OseoValue argument;
    OseoJobKind kind;
    bool fulfilled;
} OseoJob;

typedef struct {
    OseoHeapObject header;
    OseoValue next;
    OseoValue callback;
    OseoValue arguments;
    uint64_t deadline;
    uint64_t id;
    uint64_t order;
    size_t argument_count;
    bool canceled;
} OseoTimer;

/*
 * One [[MapData]] record. A deleted entry becomes a tombstone in place
 * (`live` false, both values cleared) instead of being removed, because
 * %MapIteratorPrototype%.next holds a plain index into this array and a
 * removal that shifted later entries would skip or misalign a
 * concurrently live iterator over the same map.
 */
typedef struct {
    OseoValue key;
    OseoValue value;
    bool live;
} OseoMapEntry;

typedef struct {
    OseoOrdinaryObject ordinary;
    OseoMapEntry *entries;
    size_t entry_count;
    size_t entry_capacity;
    /* The live record count, kept incrementally so
     * Map.prototype.size never scans past tombstones. */
    size_t live_count;
} OseoMap;

/* [[MapIterationKind]]. */
typedef enum {
    OSEO_MAP_ITERATION_KEY = 0,
    OSEO_MAP_ITERATION_VALUE = 1,
    OSEO_MAP_ITERATION_KEY_VALUE = 2,
} OseoMapIterationKind;

typedef struct {
    OseoOrdinaryObject ordinary;
    /*
     * [[Map]]. Undefined once exhausted, matching
     * %MapIteratorPrototype%.next's specified step of setting it to
     * undefined after the entries list is exhausted, so a repeated call
     * takes the same short return without re-deriving that state.
     */
    OseoValue target;
    /* [[MapNextIndex]]. */
    size_t index;
    OseoMapIterationKind kind;
} OseoMapIterator;

static inline OseoValue tagged(uint64_t tag, uint64_t payload) {
    return OSEO_CANONICAL_NAN | (tag << OSEO_TAG_SHIFT) |
        (payload & OSEO_PAYLOAD_MASK);
}
static inline uint64_t tag_of(OseoValue value) {
    if ((value & OSEO_CANONICAL_NAN) != OSEO_CANONICAL_NAN) {
        return 0u;
    }
    return (value >> OSEO_TAG_SHIFT) & UINT64_C(7);
}
static inline OseoHeapObject *heap_object(OseoValue value) {
    uintptr_t address = (uintptr_t)(value & OSEO_PAYLOAD_MASK);
    return (OseoHeapObject *)address;
}
static inline OseoString *string_object(OseoValue value) {
    return (OseoString *)heap_object(value);
}
static inline OseoEnvironment *environment_object(OseoValue value) {
    return (OseoEnvironment *)heap_object(value);
}
static inline OseoOrdinaryObject *ordinary_object(OseoValue value) {
    return (OseoOrdinaryObject *)heap_object(value);
}
static inline OseoCell *cell_object(OseoValue value) {
    return (OseoCell *)heap_object(value);
}
static inline OseoPrivateName *private_name_object(OseoValue value) {
    return (OseoPrivateName *)heap_object(value);
}
static inline OseoSymbol *symbol_object(OseoValue value) {
    return (OseoSymbol *)heap_object(value);
}
static inline OseoFunction *function_object(OseoValue value) {
    return (OseoFunction *)heap_object(value);
}
static inline OseoPromise *promise_object(OseoValue value) {
    return (OseoPromise *)heap_object(value);
}
static inline OseoPromiseReaction *reaction_object(OseoValue value) {
    return (OseoPromiseReaction *)heap_object(value);
}
static inline OseoPromiseAggregate *aggregate_object(OseoValue value) {
    return (OseoPromiseAggregate *)heap_object(value);
}
static inline OseoJob *job_object(OseoValue value) {
    return (OseoJob *)heap_object(value);
}
static inline OseoAsyncGeneratorRequest *request_object(OseoValue value) {
    return (OseoAsyncGeneratorRequest *)heap_object(value);
}
static inline OseoTimer *timer_object(OseoValue value) {
    return (OseoTimer *)heap_object(value);
}
static inline OseoMap *map_object(OseoValue value) {
    return (OseoMap *)heap_object(value);
}
static inline OseoMapIterator *map_iterator_object(OseoValue value) {
    return (OseoMapIterator *)heap_object(value);
}
static inline OseoResult normal(OseoValue value) {
    OseoResult result = {OSEO_STATUS_NORMAL, value};
    return result;
}
static inline OseoResult failure(
    OseoContext *context,
    const char *code,
    const char *message
) {
    context->error_code = code;
    context->error_message = message;
    context->has_diagnostic = true;
    OseoResult result = {OSEO_STATUS_THROW, oseo_undefined()};
    return result;
}
static inline uint64_t double_bits(double value) {
    uint64_t bits;
    memcpy(&bits, &value, sizeof(bits));
    return bits;
}
static inline double bits_double(uint64_t bits) {
    double value;
    memcpy(&value, &bits, sizeof(value));
    return value;
}
static inline bool is_number(OseoValue value) {
    return tag_of(value) == 0u || tag_of(value) == OSEO_TAG_SMI;
}
static inline bool is_string(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_STRING;
}
static inline bool is_bigint(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_BIGINT;
}
static inline OseoBigInt *bigint_object(OseoValue value) {
    return (OseoBigInt *)heap_object(value);
}
static inline bool is_environment(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ENVIRONMENT;
}
static inline bool is_cell(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_CELL;
}
static inline bool is_symbol(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_SYMBOL;
}
static inline bool is_private_name(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_PRIVATE_NAME;
}
static inline bool is_array_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->array_iterator;
}
static inline bool is_regexp_string_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->regexp_string_iterator;
}
static inline bool is_async_from_sync_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->async_from_sync;
}
static inline bool is_wrap_for_valid_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->wrap_for_valid_iterator;
}
static inline bool is_function(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_FUNCTION;
}
static inline bool function_is_constructible(OseoValue value) {
    if (!is_function(value)) return false;
    OseoFunctionKind kind;
    while (true) {
        kind = function_object(value)->function_kind;
        if (kind != OSEO_FUNCTION_BOUND) break;
        value = function_object(value)->bound_target;
        if (!is_function(value)) return false;
    }
    return kind == OSEO_FUNCTION_ORDINARY || kind == OSEO_FUNCTION_CLASS;
}
/*
 * True for the functions that own a synthetic `prototype` data
 * property. A generator function is not constructible yet still exposes
 * the object that serves %GeneratorPrototype% to its generators, and a
 * class constructor exposes the object that carries its methods.
 * `prototype_writable` distinguishes the writable ordinary and generator
 * property from a class's read-only one.
 */
static inline bool function_has_prototype_property(OseoValue value) {
    if (!is_function(value)) return false;
    OseoFunctionKind kind = function_object(value)->function_kind;
    return kind == OSEO_FUNCTION_ORDINARY ||
        kind == OSEO_FUNCTION_GENERATOR ||
        kind == OSEO_FUNCTION_ASYNC_GENERATOR ||
        kind == OSEO_FUNCTION_CLASS;
}
static inline bool is_generator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->generator != NULL;
}
/* True for the generator record an asynchronous generator function
 * created, which reports every step through a promise. */
static inline bool is_async_generator(OseoValue value) {
    return is_generator(value) &&
        ordinary_object(value)->generator->asynchronous &&
        !ordinary_object(value)->generator->async_function;
}
static inline bool function_has_lexical_this(OseoValue value) {
    if (!is_function(value)) return false;
    OseoFunctionKind kind = function_object(value)->function_kind;
    return kind == OSEO_FUNCTION_ARROW ||
        kind == OSEO_FUNCTION_ASYNC_ARROW;
}
static inline bool is_promise(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_PROMISE;
}
static inline bool is_array_buffer(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ARRAY_BUFFER;
}
static inline OseoArrayBuffer *array_buffer_object(OseoValue value) {
    return (OseoArrayBuffer *)heap_object(value);
}
static inline bool is_data_view(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_DATA_VIEW;
}
static inline OseoDataView *data_view_object(OseoValue value) {
    return (OseoDataView *)heap_object(value);
}
static inline bool is_regexp(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_REGEXP;
}
static inline OseoRegExp *regexp_object(OseoValue value) {
    return (OseoRegExp *)heap_object(value);
}
static inline OseoRegExpMatcher *regexp_matcher_object(OseoValue value) {
    return (OseoRegExpMatcher *)heap_object(value);
}
static inline bool is_map(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_MAP;
}
static inline bool is_map_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_MAP_ITERATOR;
}
static inline bool is_object(OseoValue value) {
    if (tag_of(value) != OSEO_TAG_HEAP) return false;
    OseoHeapKind kind = heap_object(value)->kind;
    return kind == OSEO_HEAP_OBJECT || kind == OSEO_HEAP_ARRAY ||
        kind == OSEO_HEAP_FUNCTION || kind == OSEO_HEAP_PROMISE ||
        kind == OSEO_HEAP_ARRAY_BUFFER || kind == OSEO_HEAP_MAP ||
        kind == OSEO_HEAP_MAP_ITERATOR || kind == OSEO_HEAP_DATA_VIEW ||
        kind == OSEO_HEAP_REGEXP;
}
static inline bool is_enumeration(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ENUMERATION;
}
static inline OseoEnumeration *enumeration_object(OseoValue value) {
    return (OseoEnumeration *)heap_object(value);
}
static inline bool is_array(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ARRAY;
}
static inline int64_t smi_value(OseoValue value) {
    uint64_t payload = value & OSEO_PAYLOAD_MASK;
    if ((payload & UINT64_C(0x0000800000000000)) != 0u) {
        payload |= UINT64_C(0xffff000000000000);
    }
    return (int64_t)payload;
}
static inline double number_value(OseoValue value) {
    if (tag_of(value) == OSEO_TAG_SMI) return (double)smi_value(value);
    return bits_double(value);
}
static inline bool is_nullish(OseoValue value) {
    uint64_t tag = tag_of(value);
    return tag == OSEO_TAG_NULL || tag == OSEO_TAG_UNDEFINED;
}
/*
 * Cross-component helpers. Each is defined in exactly one
 * runtime translation unit.
 */
typedef OseoResult (*OseoBuiltinDispatcher)(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_function_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/* OrdinaryHasInstance, shared by instanceof and @@hasInstance dispatch. */
OseoResult oseo_internal_ordinary_has_instance(
    OseoContext *context,
    OseoValue target,
    OseoValue value
);
OseoResult oseo_internal_promise_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_error_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_symbol_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_iterator_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_generator_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_async_generator_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_array_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_arguments_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_object_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_number_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_math_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_array_buffer_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/*
 * Releases one ArrayBuffer's Data Block. The collector calls it for a
 * buffer it is about to destroy, and DetachArrayBuffer calls it while
 * the buffer stays alive; both leave the object in the detached state,
 * so the block is freed exactly once either way.
 */
void oseo_internal_array_buffer_release(OseoHeapObject *object);
/* Materializes %ArrayBuffer% with its prototype, accessors, prototype
 * methods, `isView`, and species accessor, and returns the constructor. */
OseoResult oseo_internal_array_buffer_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_array_buffer_global(
    OseoContext *context,
    OseoValue global
);
void *oseo_internal_allocate_heap_bytes(OseoContext *context, size_t size);
OseoResult oseo_internal_error_construct(
    OseoContext *context,
    OseoValue callee,
    OseoValue new_target,
    size_t code_id,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_internal_error_prototype(
    OseoContext *context,
    OseoErrorKind kind
);
OseoResult oseo_internal_error_to_string(
    OseoContext *context,
    OseoValue receiver
);
OseoResult oseo_internal_throw_error(
    OseoContext *context,
    OseoErrorKind kind,
    const char *message
);
OseoResult oseo_internal_publish_heap(
    OseoContext *context,
    OseoHeapObject *object,
    OseoHeapKind kind
);
/*
 * Unmanaged allocation for a component's own work area, routed through the
 * same deterministic allocation-attempt counter the managed allocator
 * uses so an allocation sweep can fail it once and observe the cleanup.
 *
 * It never collects. A caller holds raw interior pointers across these
 * calls, and the block it returns is owned by that caller rather than by
 * the collector, so the caller releases it with free.
 */
void *oseo_internal_allocate_work_bytes(OseoContext *context, size_t size);
void *oseo_internal_reallocate_work_bytes(
    OseoContext *context,
    void *block,
    size_t size
);
OseoResult oseo_internal_allocate_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
);
/* Reject a string length before a component allocates a staging buffer. */
OseoResult oseo_internal_validate_string_length(
    OseoContext *context,
    size_t length
);
/*
 * Number::toString's radix-10 algorithm (6.1.6.1.20), owned by
 * runtime_primitive.c because the generic ToString conversion path uses it
 * for every primitive-to-string coercion. runtime_number.c reuses it for
 * Number.prototype.toString() and toLocaleString's no-radix formatting.
 */
size_t oseo_internal_number_text(double value, char *output, size_t capacity);
/*
 * Extracts the shortest round-trip decimal significant digits of a finite,
 * nonzero, non-negative double, with no sign and no decimal point: value ==
 * 0.d[0]d[1]...d[*digit_count - 1] * 10^*decimal_exponent. Shared by
 * Number::toString(x, 10) and Number.prototype.toExponential's
 * free-precision (fractionDigits undefined) branch.
 */
void oseo_internal_number_shortest_digits(
    double value,
    char digits[18],
    size_t *digit_count,
    int *decimal_exponent
);
/*
 * String and property-key helpers owned by runtime_string.c. A string
 * property key names a property by content rather than by identity, so
 * key equality, ASCII name matching, canonical array-index recognition,
 * and the own properties a String exotic object exposes all resolve
 * here rather than in each component that asks about a key.
 */
OseoResult oseo_internal_ascii_string(OseoContext *context, const char *text);
bool oseo_internal_string_equal(OseoValue left, OseoValue right);
bool oseo_internal_property_key_equal(OseoValue left, OseoValue right);
bool oseo_internal_array_index(OseoValue key, uint32_t *result);
/*
 * True when key names an own property of the String exotic object
 * string_value stands for, which is `length` or an in-range code unit
 * index. *index receives the index when the key is one, and is left
 * alone otherwise.
 */
bool oseo_internal_string_own_property(
    OseoValue string_value,
    OseoValue key,
    uint32_t *index
);
/*
 * True for a String exotic object, meaning an ordinary object whose
 * [[StringData]] slot holds a String value. The wrapper brand shares
 * the primitive slot every non-Number wrapper uses, so the string case
 * is recognized here rather than by a second dedicated flag.
 */
bool oseo_internal_string_data(OseoValue value);
/*
 * Defines the own properties StringCreate gives one String exotic
 * object: one non-writable, non-configurable, enumerable index property
 * per code unit and a non-writable, non-enumerable, non-configurable
 * `length`. `wrapper` must already carry the [[StringData]] slot the
 * properties describe, and both values stay rooted through the caller's
 * frame slots while the definitions allocate.
 */
OseoResult oseo_internal_string_wrapper_properties(
    OseoContext *context,
    OseoValue string_value,
    OseoValue wrapper
);
OseoResult oseo_internal_string_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/* Implements String.prototype match, matchAll, search, and split after
 * their component-owned built-in dispatcher selects one of their code IDs. */
OseoResult oseo_internal_string_protocol_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
/* The dedicated iterator prototype and next operation used by matchAll. */
OseoResult oseo_internal_regexp_string_iterator_prototype(
    OseoContext *context
);
/*
 * CreateRegExpStringIterator (22.2.9.1). The iterator freezes the
 * `global` and `unicode` decisions its creator already read from
 * `flags`, and every step afterwards reads and writes `lastIndex` on
 * `regexp` itself.
 */
OseoResult oseo_internal_regexp_string_iterator_create(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject,
    bool global,
    bool unicode
);
/*
 * A growable UTF-16 buffer for a result the runtime assembles in pieces.
 * The units are plain host memory rather than a heap value, so user code
 * running between two appends may collect without invalidating the
 * partial result. The owner zero-initializes it, releases it on every
 * exit path, and an append validates the runtime's string ceiling before
 * it grows.
 */
typedef struct {
    uint16_t *units;
    size_t length;
    size_t capacity;
} OseoStringBuilder;
OseoResult oseo_internal_string_builder_append(
    OseoContext *context,
    OseoStringBuilder *builder,
    const uint16_t *units,
    size_t length
);
void oseo_internal_string_builder_release(OseoStringBuilder *builder);
/*
 * GetSubstitution (22.1.3.19.1), appended into `builder`. `captures` is
 * either undefined or a private Array whose elements are the capture
 * strings and undefined for a capture that did not participate, and
 * `named_captures` is either undefined or the object `$<name>` reads.
 * Substituted text is never rescanned.
 */
OseoResult oseo_internal_get_substitution(
    OseoContext *context,
    OseoStringBuilder *builder,
    OseoValue matched,
    OseoValue subject,
    size_t position,
    OseoValue captures,
    OseoValue named_captures,
    OseoValue replacement
);
/* Materializes %String% together with %String.prototype% and its
 * fromCharCode, fromCodePoint, and raw statics, and returns the
 * constructor. */
OseoResult oseo_internal_string_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_string_global(
    OseoContext *context,
    OseoValue global
);

typedef enum {
    OSEO_BIGINT_ADD,
    OSEO_BIGINT_SUBTRACT,
    OSEO_BIGINT_MULTIPLY,
    OSEO_BIGINT_DIVIDE,
    OSEO_BIGINT_REMAINDER,
    OSEO_BIGINT_EXPONENTIATE,
    OSEO_BIGINT_AND,
    OSEO_BIGINT_OR,
    OSEO_BIGINT_XOR,
    OSEO_BIGINT_SHIFT_LEFT,
    OSEO_BIGINT_SHIFT_RIGHT,
} OseoBigIntOperator;

OseoResult oseo_internal_bigint_binary(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    OseoBigIntOperator operator
);
OseoResult oseo_internal_bigint_negate(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_internal_bigint_not(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_internal_bigint_string(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_internal_string_to_bigint(
    OseoContext *context,
    const OseoString *string,
    bool *valid
);
int oseo_internal_bigint_compare(OseoValue left, OseoValue right);
int oseo_internal_bigint_compare_number(OseoValue integer, double number);
bool oseo_internal_bigint_equal(OseoValue left, OseoValue right);
bool oseo_internal_bigint_is_zero(OseoValue value);
double oseo_internal_bigint_to_number(OseoValue value);
double oseo_internal_integer_digits_to_number(
    const uint16_t *units,
    size_t length,
    uint32_t radix
);
/*
 * NumberToBigInt over an already integral finite double. The caller
 * rejects NaN, an infinity, and a fractional value with the specified
 * RangeError before reaching this exact conversion.
 */
OseoResult oseo_internal_bigint_from_integral_number(
    OseoContext *context,
    double number
);
/*
 * The BigInt text in one radix from 2 through 36, using the lowercase
 * letters a through z for the digit values 10 through 35. Radix 10
 * produces exactly the ToString(BigInt) spelling.
 */
OseoResult oseo_internal_bigint_radix_string(
    OseoContext *context,
    OseoValue value,
    uint32_t radix
);
/*
 * BigInt.asIntN and BigInt.asUintN: the exact value modulo 2**bits,
 * interpreted as signed when `signed_result` is true. `bits` is the
 * already converted ToIndex result, so it may exceed the reviewed
 * magnitude ceiling; a request whose result would cross that ceiling
 * throws the same catchable RangeError as every other oversized
 * BigInt operation.
 */
OseoResult oseo_internal_bigint_as_width(
    OseoContext *context,
    OseoValue value,
    double bits,
    bool signed_result
);
/*
 * The exact 64-bit two's-complement image of one BigInt, which is
 * ToBigUint64 and, reinterpreted, ToBigInt64. The result is a plain
 * integer rather than a BigInt, so a caller that stores raw bytes never
 * reads a limb and no allocation can fail on the way.
 */
uint64_t oseo_internal_bigint_to_raw_uint64(OseoValue value);
/*
 * One BigInt whose value is `magnitude`, negated when `negative` is true.
 * The caller supplies the sign separately because the magnitude is an
 * unsigned 64-bit integer, so -2**63 is expressible.
 */
OseoResult oseo_internal_bigint_from_uint64(
    OseoContext *context,
    uint64_t magnitude,
    bool negative
);
/*
 * Reads the own property descriptor named by key, including the
 * synthetic `prototype` and array `length` descriptors. A module
 * namespace export returns its stored cell, while namespace metadata
 * returns its plain value. *value is the data value, or undefined for
 * an accessor property; *getter and *setter are each undefined unless
 * the property is an accessor with that slot present.
 */
bool oseo_internal_own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
);
/*
 * Reads the descriptor state of %String.prototype%'s virtual iterator.
 * Its value remains an Array.from implementation detail until the separate
 * string-iterator node lands, so ordinary reflective lookup stays unchanged.
 */
bool oseo_internal_virtual_string_iterator_descriptor(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoPropertyAttributes *attributes
);
/*
 * Ordinary object layout helpers owned by runtime_object.c. The
 * property vector is the one storage location for an object's own
 * properties, so every component that finds, adds, or removes one goes
 * through these instead of walking the vector itself.
 */
size_t oseo_internal_own_property_index(
    const OseoOrdinaryObject *object,
    OseoValue key
);
bool oseo_internal_remove_property(OseoOrdinaryObject *object, size_t index);
/*
 * Reserves room for one more own property. The call is a safepoint and
 * moves the property vector, so a caller reacquires both the object and
 * any property pointer afterward.
 */
OseoResult oseo_internal_grow_properties(
    OseoContext *context,
    OseoValue object_value
);
/*
 * Appends one own data property, skipping the duplicate-key scan
 * [[DefineOwnProperty]] begins with. It exists for one caller shape:
 * an object the caller created empty and is filling with keys it knows
 * are pairwise distinct, where that scan would make defining n
 * properties quadratic without changing any observable result.
 *
 * The caller must have established, for the whole run of appends, that
 * object_value is an extensible ordinary object with no own property,
 * no module-namespace or array-exotic behavior, and no synthetic
 * `prototype`, and that no key repeats. Every other definition,
 * including one on an object user code has already touched, belongs to
 * oseo_object_define.
 */
OseoResult oseo_internal_append_own_property(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
);
/*
 * True when one own property of object_value keeps its value in the
 * binding cell `stored` instead of the property slot. Namespace
 * exports, realm global bindings, and mapped arguments indices use
 * this representation; namespace metadata does not.
 */
bool oseo_internal_cell_backed_property(
    OseoValue object_value,
    OseoValue stored
);
/*
 * Rejects a key that is neither a string nor a symbol as a host
 * diagnostic. Every property operation applies it before it looks at
 * the object.
 */
OseoResult oseo_internal_require_property_key(
    OseoContext *context,
    OseoValue key
);
/*
 * The array `length` property's shared [[Set]] and [[DefineOwnProperty]]
 * body, including the descending truncation that stops at the first
 * non-configurable element. `allow_same_value` admits a redefinition
 * that leaves a non-writable length unchanged, and *valid_length reports
 * whether the requested value was a valid array length at all.
 */
OseoResult oseo_internal_set_array_length(
    OseoContext *context,
    OseoOrdinaryObject *array,
    OseoValue value,
    bool strict,
    bool allow_same_value,
    bool *valid_length
);
/* Materializes Array together with its prototype, statics, and species. */
OseoResult oseo_internal_array_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_array_global(
    OseoContext *context,
    OseoValue global
);
/* Runs ArraySetLength's separate ToUint32 and ToNumber observations. */
OseoResult oseo_internal_to_array_length(
    OseoContext *context,
    OseoValue value,
    uint32_t *requested
);
OseoResult oseo_internal_promise_aggregate_settle(
    OseoContext *context,
    OseoValue reaction_value,
    OseoValue argument,
    bool fulfilled
);
OseoResult oseo_internal_promise_finally_continuation_create(
    OseoContext *context,
    OseoValue preserved,
    bool fulfilled
);
OseoResult oseo_internal_promise_finally_invoke(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_finally
);
OseoResult oseo_internal_promise_invoke_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected
);
/* One fresh pending promise with no resolving functions, which is the
 * capability every internal await and asynchronous generator step
 * reports through. */
OseoResult oseo_internal_promise_create(OseoContext *context);
OseoResult oseo_internal_promise_prototype(OseoContext *context);
/* Materializes %Promise% together with its prototype, statics, and
 * species accessor, and returns the constructor. */
OseoResult oseo_internal_promise_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_promise_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_map_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
OseoResult oseo_internal_map_prototype(OseoContext *context);
/* Materializes %Map%, %Map.prototype%, and %MapIteratorPrototype%
 * together with every own property ECMA-262 gives them, and returns the
 * constructor. */
OseoResult oseo_internal_map_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_map_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_bigint_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/*
 * ToBigInt(argument), 7.1.13. An Object first reaches ToPrimitive with
 * the number hint; a Number is the specified TypeError rather than the
 * callable intrinsic's NumberToBigInt branch.
 */
OseoResult oseo_internal_to_bigint(OseoContext *context, OseoValue value);
/* Materializes %BigInt% together with %BigInt.prototype% and every own
 * property ECMA-262 gives them, and returns the intrinsic. */
OseoResult oseo_internal_bigint_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_bigint_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_data_view_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/* Materializes %DataView% together with %DataView.prototype% and every
 * own property ECMA-262 gives them, and returns the constructor. */
OseoResult oseo_internal_data_view_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_data_view_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_regexp_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/* Materializes %RegExp% and its initialization-only prototype surface. */
OseoResult oseo_internal_regexp_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_regexp_global(
    OseoContext *context,
    OseoValue global
);
/* IsRegExp, shared by the constructor and String predicate methods. */
OseoResult oseo_internal_is_regexp(
    OseoContext *context,
    OseoValue value,
    bool *regexp
);
/*
 * Implements the RegExp.prototype well-known symbol methods and the
 * `RegExp.escape` static after the RegExp built-in dispatcher selects
 * one of their code IDs.
 */
OseoResult oseo_internal_regexp_symbol_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
/*
 * RegExpExec (22.2.7.1): an own or inherited callable `exec` is called
 * with the receiver and its non-object, non-null result is a TypeError;
 * otherwise built-in execution runs and a receiver without the internal
 * slot is a TypeError.
 */
OseoResult oseo_internal_regexp_exec(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject
);
/*
 * RegExpCreate (22.2.4.1) over %RegExp.prototype%, which is what
 * RegExpAlloc(%RegExp%) reaches because the constructor's `prototype`
 * property is neither writable nor configurable.
 */
OseoResult oseo_internal_regexp_create(
    OseoContext *context,
    OseoValue pattern,
    OseoValue flags
);
/*
 * The iteration step @@match, @@replace, and the RegExp String iterator
 * share once a global execution produced a match: an empty match advances
 * `lastIndex` on the RegExp itself by one code unit, or by one code point
 * when `unicode` is true, so the next execution cannot repeat it.
 */
OseoResult oseo_internal_regexp_iteration_step(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject,
    OseoValue match,
    bool unicode
);
/*
 * Compile one already validated pattern into an owned matcher program,
 * or report the first construct the generic matcher cannot lower. The
 * result is native memory the caller owns and must release with
 * oseo_internal_regexp_program_release.
 */
OseoRegExpProgram *oseo_internal_regexp_program_build(
    OseoContext *context,
    const OseoString *source,
    uint16_t flag_mask,
    size_t capture_count,
    OseoRegExpValidation *status
);
void oseo_internal_regexp_program_release(OseoRegExpProgram *program);
/*
 * Search for the first match at or after `start_index`, writing the
 * half-open capture spans into `captures`, which holds
 * `2 * (capture_count + 1)` entries and uses -1 for a capture that did
 * not participate. A sticky search attempts only the given position.
 * The search allocates only an unmanaged work area, so it reaches no
 * safepoint and observes no managed state.
 */
OseoRegExpExecution oseo_internal_regexp_program_search(
    OseoContext *context,
    const OseoRegExpProgram *program,
    const OseoString *subject,
    size_t start_index,
    bool sticky,
    int64_t *captures
);
/* The lazily created, permanently rooted %AsyncGeneratorPrototype%
 * methods and its `Symbol.asyncIterator`, selected by code id. */
OseoResult oseo_internal_async_generator_method(
    OseoContext *context,
    size_t code_id
);
/* Discards one generator's [[GeneratorContext]] and marks it completed,
 * which both drivers do on every path that leaves a body for good. */
void oseo_internal_generator_complete(OseoValue generator);
OseoResult oseo_internal_promise_method_function(
    OseoContext *context,
    const char *name
);
bool oseo_internal_string_is_ascii(OseoValue value, const char *text);
/* Materializes one slot of the realm-owned intrinsic graph. */
OseoResult oseo_internal_intrinsic(
    OseoContext *context,
    OseoIntrinsic intrinsic
);
/* Completes the realm root object with the Object.prototype methods. */
OseoResult oseo_internal_object_prototype(OseoContext *context);
OseoResult oseo_internal_to_object(OseoContext *context, OseoValue value);
OseoResult oseo_internal_to_object_for_property(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_internal_install_primitive_wrapper_methods(
    OseoContext *context,
    OseoValue prototype,
    bool include_index_of
);
/* Materializes one realm-owned primitive wrapper prototype. */
OseoResult oseo_internal_primitive_wrapper_prototype(
    OseoContext *context,
    OseoIntrinsic intrinsic
);
OseoResult oseo_internal_install_object_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_number_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_number_global(
    OseoContext *context,
    OseoValue global
);
/* The realm's lazily created Math namespace object. */
OseoResult oseo_internal_math_intrinsic(OseoContext *context);
OseoResult oseo_internal_install_math_global(
    OseoContext *context,
    OseoValue global
);
OseoResult oseo_internal_to_number(OseoContext *context, OseoValue value);
/*
 * Number::exponentiate over two already converted Numbers, 6.1.6.1.3.
 * The `**` operator and Math.pow share it so the two cases where C
 * `pow` disagrees with the specification are decided in one place.
 */
double oseo_internal_number_exponentiate(double base, double exponent);
/* ToUint32 over an already converted Number, 7.1.7. */
uint32_t oseo_internal_number_to_uint32(double number);
/*
 * ToIndex(value), 7.1.22, reporting the admitted integer through
 * `index`. `description` is the complete RangeError message a rejected
 * value receives, so a caller names its own argument.
 */
OseoResult oseo_internal_to_index(
    OseoContext *context,
    OseoValue value,
    const char *description,
    double *index
);
OseoResult oseo_internal_to_primitive(
    OseoContext *context,
    OseoValue value,
    OseoToPrimitiveHint hint
);
bool oseo_internal_same_value(OseoValue left, OseoValue right);
/* SameValueZero: SameValue, but +0 and -0 compare equal. */
bool oseo_internal_same_value_zero(OseoValue left, OseoValue right);
OseoResult oseo_internal_object_define_data(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes,
    bool has_value
);
OseoResult oseo_internal_symbol_create(
    OseoContext *context,
    OseoValue description
);
OseoResult oseo_internal_symbol_text(
    OseoContext *context,
    OseoValue symbol
);
OseoResult oseo_internal_symbol_name(
    OseoContext *context,
    OseoValue symbol
);
OseoResult oseo_internal_well_known_symbol(
    OseoContext *context,
    size_t index
);
/* The lazily created, permanently rooted %GeneratorPrototype%.
 * Reaching it creates the whole synchronous generator intrinsic
 * cluster, because %GeneratorPrototype%, %GeneratorFunction.prototype%,
 * and %GeneratorFunction% name one another. */
OseoResult oseo_internal_generator_prototype(OseoContext *context);
/* %GeneratorFunction.prototype%, the object every generator function
 * has as its [[Prototype]]. */
OseoResult oseo_internal_generator_function_intrinsic(OseoContext *context);
/* %AsyncFunction.prototype%, the object every asynchronous function and
 * asynchronous arrow function has as its [[Prototype]]. Reaching it
 * creates %AsyncFunction% with it, because the two name each other. */
OseoResult oseo_internal_async_function_intrinsic(OseoContext *context);
/*
 * OrdinaryCreateFromConstructor for one generator object, applied where
 * EvaluateBody reaches it: after FunctionDeclarationInstantiation. The
 * prologue has to allocate the record before it instantiates parameters,
 * because a parameter is initialized into the record's traced slots, so
 * a parameter initializer that replaces its own function's `prototype`
 * would otherwise be read one step too early. Relinking when the call
 * returns is unobservable, because that result is the first time the
 * object reaches the program.
 */
OseoResult oseo_internal_generator_created(
    OseoContext *context,
    OseoValue callee,
    OseoValue generator
);
OseoResult oseo_internal_array_prototype(OseoContext *context);
OseoResult oseo_internal_array_iterator_prototype(OseoContext *context);
/* The same for %AsyncGeneratorPrototype%. Reaching it creates the whole
 * asynchronous generator intrinsic cluster, because its `constructor`
 * and the chain above it are circular. */
OseoResult oseo_internal_async_generator_prototype(OseoContext *context);
/* %AsyncGeneratorFunction.prototype%, the object every asynchronous
 * generator function has as its [[Prototype]]. */
OseoResult oseo_internal_async_generator_intrinsic(OseoContext *context);
/*
 * Resumes one asynchronous generator parked on an awaited operand. The
 * two await reactions call this with the settled value and the
 * completion the settlement carries, and it drives the request queue
 * from there.
 */
OseoResult oseo_internal_async_generator_awaited(
    OseoContext *context,
    OseoValue generator,
    OseoValue value,
    bool rejected
);
/* Builds one fresh { value, done } iterator result object. */
OseoResult oseo_internal_iterator_result(
    OseoContext *context,
    OseoValue value,
    bool done
);
OseoResult oseo_internal_array_values(
    OseoContext *context,
    OseoValue array
);
OseoResult oseo_internal_array_iterator_next(
    OseoContext *context,
    OseoValue iterator
);
bool oseo_internal_iterator_key_matches(
    OseoContext *context,
    OseoValue key
);
OseoResult oseo_internal_iterator_method(
    OseoContext *context,
    size_t code_id
);
OseoResult oseo_internal_async_from_sync_fulfilled(
    OseoContext *context,
    OseoValue callee,
    OseoValue value
);
OseoResult oseo_internal_async_from_sync_rejected(
    OseoContext *context,
    OseoValue callee,
    OseoValue reason
);
/*
 * The realm's single %ThrowTypeError% intrinsic, created on first use
 * and cached afterwards so every unmapped arguments object's `callee`
 * accessor observes one function identity, as 10.2.4.1 requires.
 */
OseoResult oseo_internal_throw_type_error_function(OseoContext *context);
/* The realm-owned %Array.prototype%.push function and its generic
 * body. The body deliberately uses ordinary Get and Set so borrowed calls
 * preserve accessors, abrupt completion, and array length semantics. */
OseoResult oseo_internal_array_push_function(OseoContext *context);
OseoResult oseo_internal_array_push(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_internal_value_string(OseoContext *context, OseoValue value);
OseoResult oseo_internal_array_join_element_string(
    OseoContext *context,
    OseoValue value,
    OseoValue array
);
OseoResult oseo_internal_jobs_drain_until(
    OseoContext *context,
    OseoValue promise
);
bool oseo_internal_jobs_reached_promise(OseoValue promise);
/*
 * Await one value from a position the frontend did not split into
 * continuations, which is one step of a `for await` head. It runs the
 * scheduler until the awaited promise settles and reports a stalled
 * asynchronous iteration as a host diagnostic.
 */
OseoResult oseo_internal_await_step(OseoContext *context, OseoValue value);
/* The well-known Symbol.asyncIterator identity. */
bool oseo_internal_async_iterator_key_matches(
    OseoContext *context,
    OseoValue key
);

#endif
