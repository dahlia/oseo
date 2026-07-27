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
#define OSEO_PROMISE_RESOLVE_CODE_ID SIZE_MAX
#define OSEO_PROMISE_REJECT_CODE_ID (SIZE_MAX - 1u)
#define OSEO_PROMISE_THEN_CODE_ID (SIZE_MAX - 2u)
#define OSEO_PROMISE_CATCH_CODE_ID (SIZE_MAX - 3u)
#define OSEO_PROMISE_FINALLY_CODE_ID (SIZE_MAX - 4u)
#define OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID (SIZE_MAX - 5u)
#define OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID (SIZE_MAX - 6u)
#define OSEO_PROMISE_FINALLY_FULFILL_CODE_ID (SIZE_MAX - 7u)
#define OSEO_PROMISE_FINALLY_REJECT_CODE_ID (SIZE_MAX - 8u)
#define OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID (SIZE_MAX - 9u)
/*
 * Error constructor code IDs occupy one contiguous block indexed by
 * OseoErrorKind: SIZE_MAX - 10u - kind.
 */
#define OSEO_ERROR_KIND_COUNT ((size_t)7u)
#define OSEO_ERROR_CONSTRUCT_LAST_CODE_ID (SIZE_MAX - 10u)
#define OSEO_ERROR_CONSTRUCT_FIRST_CODE_ID \
    (SIZE_MAX - 9u - OSEO_ERROR_KIND_COUNT)
#define OSEO_ERROR_TO_STRING_CODE_ID \
    (SIZE_MAX - 10u - OSEO_ERROR_KIND_COUNT)
#define OSEO_SYMBOL_CONSTRUCT_CODE_ID \
    (SIZE_MAX - 11u - OSEO_ERROR_KIND_COUNT)
#define OSEO_ARRAY_VALUES_CODE_ID \
    (SIZE_MAX - 12u - OSEO_ERROR_KIND_COUNT)
#define OSEO_ARRAY_ITERATOR_NEXT_CODE_ID \
    (SIZE_MAX - 13u - OSEO_ERROR_KIND_COUNT)
#define OSEO_ITERATOR_SELF_CODE_ID \
    (SIZE_MAX - 14u - OSEO_ERROR_KIND_COUNT)
#define OSEO_GENERATOR_NEXT_CODE_ID \
    (SIZE_MAX - 15u - OSEO_ERROR_KIND_COUNT)
#define OSEO_GENERATOR_RETURN_CODE_ID \
    (SIZE_MAX - 16u - OSEO_ERROR_KIND_COUNT)
/* Well-known symbol table indexes shared with the public context. */
#define OSEO_WELL_KNOWN_ITERATOR ((size_t)0u)
#define OSEO_WELL_KNOWN_TO_PRIMITIVE ((size_t)1u)
#define OSEO_WELL_KNOWN_TO_STRING_TAG ((size_t)2u)
#define OSEO_WELL_KNOWN_SYMBOL_COUNT ((size_t)3u)

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

typedef struct {
    OseoHeapObject header;
    size_t slot_count;
    OseoValue slots[];
} OseoEnvironment;

typedef struct {
    OseoHeapObject header;
    OseoValue value;
} OseoCell;

typedef struct {
    OseoHeapObject header;
    /* The description string, or undefined for a bare Symbol(). */
    OseoValue description;
} OseoSymbol;

typedef struct {
    OseoHeapObject header;
    OseoValue *values;
    size_t length;
    size_t capacity;
} OseoArgumentList;

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

/* The [[GeneratorState]] values this profile can observe. A suspended
 * generator leaves through a next or a return resumption, or stays
 * suspended; `%GeneratorPrototype%.throw` is not admitted yet. */
typedef enum {
    OSEO_GENERATOR_SUSPENDED_START = 0,
    OSEO_GENERATOR_SUSPENDED_YIELD = 1,
    OSEO_GENERATOR_EXECUTING = 2,
    OSEO_GENERATOR_COMPLETED = 3,
} OseoGeneratorState;

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
    OseoValue *slots;
    OseoCompletionRecord *completions;
    size_t slot_count;
    size_t completion_count;
    size_t resume_point;
    /*
     * OSEO_GENERATOR_RESUME_NEXT or OSEO_GENERATOR_RESUME_RETURN: how the
     * pending resumption delivers `sent`. Generated code reads it at the
     * resume point, so it stays valid for exactly one resumption.
     */
    size_t resume_kind;
    OseoGeneratorState state;
    /*
     * True when the pending suspension already yielded a complete
     * iterator result object, as `yield*` does by forwarding the inner
     * iterator's own result. The resumption then reports that object
     * unchanged instead of creating a fresh one.
     */
    bool yielded_result_object;
} OseoGenerator;

typedef struct {
    OseoHeapObject header;
    OseoValue prototype;
    OseoProperty *properties;
    size_t property_capacity;
    size_t property_count;
    size_t shape_id;
    uint32_t array_length;
    bool dictionary;
    bool length_writable;
    bool module_namespace;
    bool default_intrinsics;
    /* The [[ErrorData]] brand Object.prototype.toString observes. */
    bool error_data;
    /* Array iterator state: a flagged object backs a default array's
     * values iterator, tracing the array and stepping the index. */
    bool array_iterator;
    OseoValue iterator_array;
    size_t iterator_index;
    /* A generator function's `prototype` object, which serves the
     * virtualized %GeneratorPrototype% methods to the generators created
     * from it. Replacing the object drops the brand with it. */
    bool generator_prototype;
    /* Non-NULL exactly on a generator object, which owns the record. */
    OseoGenerator *generator;
} OseoOrdinaryObject;

/*
 * One entry of a class constructor's [[Fields]]: the key its class body
 * evaluated once and the closure that produces the value for each
 * instance. `initializer` is undefined for a field declared without
 * one, whose value is undefined.
 */
typedef struct {
    OseoValue key;
    OseoValue initializer;
} OseoClassField;

typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue environment;
    OseoValue lexical_this;
    OseoValue prototype_object;
    /*
     * The object a `super.x` reference in this function's body looks
     * through: the class prototype object for an instance element and
     * the constructor itself for a static one. It stays undefined for
     * every function a class definition does not claim, and a class
     * definition sets it before it defines the element's property.
     */
    OseoValue home_object;
    /*
     * [[Fields]], in class-body order and non-NULL only on a class
     * constructor whose body declared instance fields. The list is
     * complete before the class definition finishes, so an instance can
     * never observe it growing.
     */
    OseoClassField *fields;
    size_t field_count;
    size_t field_capacity;
    size_t code_id;
    OseoFunctionKind function_kind;
    bool prototype_writable;
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
static inline bool is_array_iterator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->array_iterator;
}
static inline bool is_function(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_FUNCTION;
}
static inline bool function_is_constructible(OseoValue value) {
    if (!is_function(value)) return false;
    OseoFunctionKind kind = function_object(value)->function_kind;
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
        kind == OSEO_FUNCTION_CLASS;
}
static inline bool is_generator(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_OBJECT &&
        ordinary_object(value)->generator != NULL;
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
static inline bool is_object(OseoValue value) {
    if (tag_of(value) != OSEO_TAG_HEAP) return false;
    OseoHeapKind kind = heap_object(value)->kind;
    return kind == OSEO_HEAP_OBJECT || kind == OSEO_HEAP_ARRAY ||
        kind == OSEO_HEAP_FUNCTION || kind == OSEO_HEAP_PROMISE;
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
 * Reads the own property descriptor named by key, including the
 * synthetic `prototype`, array `length`, and module namespace cell
 * descriptors. *value is the data value, or undefined for an accessor
 * property; *getter and *setter are each undefined unless the
 * property is an accessor with that slot present.
 */
bool oseo_internal_own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
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
OseoResult oseo_internal_promise_method_function(
    OseoContext *context,
    const char *name
);
bool oseo_internal_string_is_ascii(OseoValue value, const char *text);
OseoResult oseo_internal_to_number(OseoContext *context, OseoValue value);
OseoResult oseo_internal_to_primitive(
    OseoContext *context,
    OseoValue value,
    OseoToPrimitiveHint hint
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
OseoResult oseo_internal_value_string(OseoContext *context, OseoValue value);
OseoResult oseo_internal_jobs_drain_until(
    OseoContext *context,
    OseoValue promise
);
bool oseo_internal_jobs_reached_promise(OseoValue promise);

#endif
