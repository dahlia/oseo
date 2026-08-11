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
#define OSEO_MAX_ACTIVE_FRAME_SLOTS ((size_t)32768u)
#define OSEO_MAX_CALL_DEPTH ((size_t)256u)
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
 * The preferred-type hint passed to the generic ToPrimitive. The
 * numeric variant orders methods like the number hint but belongs to
 * consumers that immediately apply ToNumber, so unsupported function
 * and promise text degrades to NaN instead of a diagnostic.
 */
typedef enum {
    OSEO_TO_PRIMITIVE_DEFAULT = 0,
    OSEO_TO_PRIMITIVE_NUMBER = 1,
    OSEO_TO_PRIMITIVE_STRING = 2,
    OSEO_TO_PRIMITIVE_NUMERIC = 3,
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
} OseoHeapKind;

struct OseoHeapObject {
    OseoHeapObject *next;
    OseoHeapObject *trace_next;
    OseoHeapKind kind;
    bool marked;
};

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
    /* Array iterator state: a flagged object backs a default array's
     * values iterator, tracing the array and stepping the index. */
    bool array_iterator;
    OseoValue iterator_array;
    size_t iterator_index;
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
static inline bool is_object(OseoValue value) {
    if (tag_of(value) != OSEO_TAG_HEAP) return false;
    OseoHeapKind kind = heap_object(value)->kind;
    return kind == OSEO_HEAP_OBJECT || kind == OSEO_HEAP_ARRAY ||
        kind == OSEO_HEAP_FUNCTION || kind == OSEO_HEAP_PROMISE ||
        kind == OSEO_HEAP_ARRAY_BUFFER;
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
OseoResult oseo_internal_allocate_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
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
OseoResult oseo_internal_to_number(OseoContext *context, OseoValue value);
OseoResult oseo_internal_to_primitive(
    OseoContext *context,
    OseoValue value,
    OseoToPrimitiveHint hint
);
bool oseo_internal_same_value(OseoValue left, OseoValue right);
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
/* The lazily created, permanently rooted %GeneratorPrototype%. */
OseoResult oseo_internal_generator_prototype(OseoContext *context);
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
