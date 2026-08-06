#ifndef OSEO_RUNTIME_H
#define OSEO_RUNTIME_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef uint64_t OseoValue;

typedef enum {
    OSEO_STATUS_NORMAL = 0,
    OSEO_STATUS_THROW = 1,
} OseoStatus;

typedef enum {
    OSEO_FUNCTION_ORDINARY = 0,
    OSEO_FUNCTION_ARROW = 1,
    OSEO_FUNCTION_ASYNC = 2,
    OSEO_FUNCTION_ASYNC_ARROW = 3,
    OSEO_FUNCTION_INTERNAL = 4,
    /* Dynamic `this`, like ordinary, but never constructible and without
     * an own `prototype` property, matching MethodDefinition semantics.
     * Getter and setter closures share this kind: SetFunctionName's
     * "get "/"set " prefix is orthogonal to constructibility and is
     * requested separately through OseoFunctionNamePrefix. */
    OSEO_FUNCTION_METHOD = 5,
    /* Dynamic `this` and never constructible. Calling one runs only the
     * environment and parameter prologue and returns a suspended
     * generator whose `prototype` object reaches the realm-owned
     * %GeneratorPrototype% methods. */
    OSEO_FUNCTION_GENERATOR = 6,
    /* A class constructor: constructible, with a non-writable,
     * non-enumerable, non-configurable `prototype` object that carries
     * the class's methods, and never callable without `new`. */
    OSEO_FUNCTION_CLASS = 7,
    /* Like OSEO_FUNCTION_GENERATOR, but the generator it returns reports
     * every step through a promise and its body suspends to await as
     * well as to yield. Its `prototype` object reaches the realm-owned
     * %AsyncGeneratorPrototype% methods. */
    OSEO_FUNCTION_ASYNC_GENERATOR = 8,
    /* BoundFunction exotic object. Calls prepend the captured arguments and
     * use the captured receiver; construction forwards to a constructible
     * target and substitutes that target for the bound new target. */
    OSEO_FUNCTION_BOUND = 9,
} OseoFunctionKind;

/*
 * The SetFunctionName prefix applied to an accessor closure's `name`
 * after the ordinary static-key or computed-key name resolves, so both
 * paths share one prefixing step.
 */
typedef enum {
    OSEO_FUNCTION_NAME_PREFIX_NONE = 0,
    OSEO_FUNCTION_NAME_PREFIX_GET = 1,
    OSEO_FUNCTION_NAME_PREFIX_SET = 2,
} OseoFunctionNamePrefix;

typedef struct {
    OseoStatus status;
    OseoValue value;
} OseoResult;

typedef struct OseoRootFrame OseoRootFrame;
typedef struct OseoHeapObject OseoHeapObject;
typedef struct OseoContext OseoContext;

typedef OseoResult (*OseoFunctionDispatcher)(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);

/*
 * Enters one generator body at its saved resume point. The runtime
 * never resumes a generator without this dispatcher, which generated
 * code installs alongside the function dispatcher.
 */
typedef OseoResult (*OseoGeneratorDispatcher)(
    OseoContext *context,
    OseoValue generator
);

typedef enum {
    OSEO_PROMISE_PENDING = 0,
    OSEO_PROMISE_FULFILLED = 1,
    OSEO_PROMISE_REJECTED = 2,
    OSEO_PROMISE_INVALID = 3,
} OseoPromiseState;

/*
 * The named error intrinsics owned by the runtime. The enumerators
 * index the per-context constructor and prototype tables, so they
 * must stay contiguous from zero.
 */
typedef enum {
    OSEO_ERROR_ERROR = 0,
    OSEO_ERROR_EVAL = 1,
    OSEO_ERROR_RANGE = 2,
    OSEO_ERROR_REFERENCE = 3,
    OSEO_ERROR_SYNTAX = 4,
    OSEO_ERROR_TYPE = 5,
    OSEO_ERROR_URI = 6,
    OSEO_ERROR_AGGREGATE = 7,
} OseoErrorKind;

/*
 * Realm-owned intrinsic identities. The table is the single permanent
 * collector root for intrinsic objects and functions; component-specific
 * builders fill their assigned slots without creating parallel caches.
 */
typedef enum {
    OSEO_INTRINSIC_OBJECT_PROTOTYPE = 0,
    OSEO_INTRINSIC_FUNCTION_PROTOTYPE = 1,
    OSEO_INTRINSIC_ARRAY_PROTOTYPE = 2,
    OSEO_INTRINSIC_PROMISE_PROTOTYPE = 3,
    OSEO_INTRINSIC_ITERATOR_PROTOTYPE = 4,
    OSEO_INTRINSIC_ARRAY_ITERATOR_PROTOTYPE = 5,
    OSEO_INTRINSIC_GENERATOR_PROTOTYPE = 6,
    OSEO_INTRINSIC_ASYNC_ITERATOR_PROTOTYPE = 7,
    OSEO_INTRINSIC_ASYNC_GENERATOR_PROTOTYPE = 8,
    OSEO_INTRINSIC_ASYNC_GENERATOR_FUNCTION_PROTOTYPE = 9,
    OSEO_INTRINSIC_ASYNC_GENERATOR_FUNCTION = 10,
    OSEO_INTRINSIC_SYMBOL_PROTOTYPE = 11,
    OSEO_INTRINSIC_SYMBOL = 12,
    OSEO_INTRINSIC_ERROR_PROTOTYPE = 13,
    OSEO_INTRINSIC_EVAL_ERROR_PROTOTYPE = 14,
    OSEO_INTRINSIC_RANGE_ERROR_PROTOTYPE = 15,
    OSEO_INTRINSIC_REFERENCE_ERROR_PROTOTYPE = 16,
    OSEO_INTRINSIC_SYNTAX_ERROR_PROTOTYPE = 17,
    OSEO_INTRINSIC_TYPE_ERROR_PROTOTYPE = 18,
    OSEO_INTRINSIC_URI_ERROR_PROTOTYPE = 19,
    OSEO_INTRINSIC_AGGREGATE_ERROR_PROTOTYPE = 20,
    OSEO_INTRINSIC_ERROR = 21,
    OSEO_INTRINSIC_EVAL_ERROR = 22,
    OSEO_INTRINSIC_RANGE_ERROR = 23,
    OSEO_INTRINSIC_REFERENCE_ERROR = 24,
    OSEO_INTRINSIC_SYNTAX_ERROR = 25,
    OSEO_INTRINSIC_TYPE_ERROR = 26,
    OSEO_INTRINSIC_URI_ERROR = 27,
    OSEO_INTRINSIC_AGGREGATE_ERROR = 28,
    OSEO_INTRINSIC_THROW_TYPE_ERROR = 29,
    OSEO_INTRINSIC_ARRAY_PUSH = 30,
    OSEO_INTRINSIC_ARRAY_VALUES = 31,
    OSEO_INTRINSIC_ARRAY_ITERATOR_NEXT = 32,
    OSEO_INTRINSIC_ITERATOR_SELF = 33,
    OSEO_INTRINSIC_GENERATOR_NEXT = 34,
    OSEO_INTRINSIC_GENERATOR_RETURN = 35,
    OSEO_INTRINSIC_GENERATOR_THROW = 36,
    OSEO_INTRINSIC_PROMISE_THEN = 37,
    OSEO_INTRINSIC_PROMISE_CATCH = 38,
    OSEO_INTRINSIC_PROMISE_FINALLY = 39,
    OSEO_INTRINSIC_ASYNC_GENERATOR_NEXT = 40,
    OSEO_INTRINSIC_ASYNC_GENERATOR_RETURN = 41,
    OSEO_INTRINSIC_ASYNC_GENERATOR_THROW = 42,
    OSEO_INTRINSIC_ASYNC_ITERATOR_SELF = 43,
    OSEO_INTRINSIC_OBJECT = 44,
    OSEO_INTRINSIC_OBJECT_HAS_OWN_PROPERTY = 45,
    OSEO_INTRINSIC_OBJECT_IS_PROTOTYPE_OF = 46,
    OSEO_INTRINSIC_OBJECT_PROPERTY_IS_ENUMERABLE = 47,
    OSEO_INTRINSIC_OBJECT_TO_STRING = 48,
    OSEO_INTRINSIC_OBJECT_TO_LOCALE_STRING = 49,
    OSEO_INTRINSIC_OBJECT_VALUE_OF = 50,
    OSEO_INTRINSIC_FUNCTION = 51,
    OSEO_INTRINSIC_FUNCTION_APPLY = 52,
    OSEO_INTRINSIC_FUNCTION_BIND = 53,
    OSEO_INTRINSIC_FUNCTION_CALL = 54,
    OSEO_INTRINSIC_FUNCTION_TO_STRING = 55,
    OSEO_INTRINSIC_FUNCTION_HAS_INSTANCE = 56,
    OSEO_INTRINSIC_ARRAY = 57,
    OSEO_INTRINSIC_ARRAY_FROM = 58,
    OSEO_INTRINSIC_ARRAY_IS_ARRAY = 59,
    OSEO_INTRINSIC_ARRAY_OF = 60,
    OSEO_INTRINSIC_ARRAY_SPECIES_GETTER = 61,
    OSEO_INTRINSIC_COUNT = 62,
} OseoIntrinsic;

typedef struct {
    bool configurable;
    bool enumerable;
    /* Meaningless when accessor is true; an accessor descriptor has
     * [[Get]]/[[Set]] instead of [[Writable]]. */
    bool writable;
    bool accessor;
} OseoPropertyAttributes;

typedef struct {
    size_t shape_id;
    size_t slot;
} OseoPropertyCache;

/*
 * One saved abrupt completion of generated code. `kind` is 0 normal,
 * 1 return, 2 throw, and 3 jump; `target` and `depth` name the block
 * and cleanup nesting a jump resumes at, and the remaining fields
 * restore the diagnostic location of a saved throw. The completion's
 * value lives in the owning frame's root slots so the collector traces
 * it. A generator body's records belong to its generator record, so
 * they survive suspension along with the roots they describe.
 */
typedef struct {
    int kind;
    size_t target;
    size_t depth;
    size_t line;
    size_t column;
    const char *source_id;
    size_t source_id_length;
    const char *error_code;
    const char *error_message;
} OseoCompletionRecord;

struct OseoRootFrame {
    OseoRootFrame *previous;
    OseoValue *slots;
    size_t slot_count;
};

struct OseoContext {
    OseoRootFrame *roots;
    OseoHeapObject *objects;
    OseoFunctionDispatcher function_dispatcher;
    OseoGeneratorDispatcher generator_dispatcher;
    OseoValue async_call_capability;
    OseoValue microtask_head;
    OseoValue microtask_tail;
    OseoValue pending_rejections;
    OseoValue pending_rejection_tail;
    /* The realm's single intrinsic graph, indexed by OseoIntrinsic. */
    OseoValue intrinsics[OSEO_INTRINSIC_COUNT];
    /* The realm's well-known symbols are a separate edition-fixed table. */
    OseoValue well_known_symbols[13];
    /*
     * The realm's global this value, which is the [[GlobalThisValue]] a
     * Global Environment Record binds. It is created on first use and
     * permanently rooted afterwards so every Script top-level `this` and
     * every non-strict nullish receiver observe one identity.
     */
    OseoValue global_this;
    /*
     * Realm-local GetTemplateObject cache. The private entry layout stays
     * behind this public generated-code boundary.
     */
    void *template_cache;
    size_t template_cache_count;
    size_t template_cache_capacity;
    OseoValue timer_head;
    const char *source_id;
    size_t source_id_length;
    const char *error_code;
    const char *error_message;
    bool has_diagnostic;
    size_t active_frame_slots;
    size_t call_depth;
    size_t line;
    size_t column;
    size_t guard_hits;
    size_t guard_misses;
    size_t overflow_misses;
    size_t generic_addition_calls;
    size_t next_shape_id;
    size_t allocations;
    size_t allocation_attempts;
    size_t collections;
    size_t rejection_handled_count;
    size_t unhandled_rejection_count;
    uint64_t clock_milliseconds;
    uint64_t next_timer_id;
    uint64_t next_timer_order;
    size_t fail_allocation_at;
    bool observe_specialization;
    bool collect_every_safepoint;
};

/* Private inline primitives used by generated guarded native paths. */
static inline bool oseo_value_is_smi(OseoValue value) {
    return (value & UINT64_C(0x7fff000000000000)) ==
        UINT64_C(0x7ff9000000000000);
}

static inline int64_t oseo_value_unbox_smi(OseoValue value) {
    uint64_t payload = value & UINT64_C(0x0000ffffffffffff);
    if ((payload & UINT64_C(0x0000800000000000)) == 0u) {
        return (int64_t)payload;
    }
    uint64_t magnitude =
        ((~payload) & UINT64_C(0x0000ffffffffffff)) + UINT64_C(1);
    return -(int64_t)magnitude;
}

static inline bool oseo_smi_try_add(
    int64_t left,
    int64_t right,
    int64_t *result
) {
    const int64_t minimum = INT64_C(-140737488355328);
    const int64_t maximum = INT64_C(140737488355327);
    if (left < minimum || left > maximum ||
        right < minimum || right > maximum) {
        return false;
    }
    if ((right > 0 && left > maximum - right) ||
        (right < 0 && left < minimum - right)) {
        return false;
    }
    *result = left + right;
    return true;
}

static inline OseoValue oseo_value_box_smi(int64_t value) {
    return UINT64_C(0x7ff9000000000000) |
        ((uint64_t)value & UINT64_C(0x0000ffffffffffff));
}

void oseo_context_init(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length
);
/* Materializes and returns one realm-owned intrinsic identity. */
OseoResult oseo_intrinsic(OseoContext *context, OseoIntrinsic intrinsic);
void oseo_context_destroy(OseoContext *context);
void oseo_context_fail_allocation_at(OseoContext *context, size_t attempt);
void oseo_context_clear_language_error(OseoContext *context);
void oseo_context_location(
    OseoContext *context,
    size_t line,
    size_t column
);
void oseo_context_source_location(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length,
    size_t line,
    size_t column
);
void oseo_context_print_error(const OseoContext *context);
void oseo_context_print_thrown(OseoContext *context, OseoValue thrown);
void oseo_context_print_observations(const OseoContext *context);
void oseo_context_set_function_dispatcher(
    OseoContext *context,
    OseoFunctionDispatcher dispatcher
);
void oseo_context_set_generator_dispatcher(
    OseoContext *context,
    OseoGeneratorDispatcher dispatcher
);

OseoResult oseo_call_enter(OseoContext *context);
void oseo_call_leave(OseoContext *context);
OseoResult oseo_frame_enter(OseoContext *context, size_t slot_count);
void oseo_frame_leave(OseoContext *context, size_t slot_count);

void oseo_roots_push(OseoContext *context, OseoRootFrame *frame);
void oseo_roots_pop(OseoContext *context, OseoRootFrame *frame);
OseoResult oseo_roots_allocate(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t slot_count
);
void oseo_roots_release(OseoContext *context, OseoRootFrame *frame);
void oseo_collect(OseoContext *context);

OseoValue oseo_undefined(void);
OseoValue oseo_uninitialized(void);
OseoResult oseo_read_binding(OseoContext *context, OseoValue value);
OseoResult oseo_write_immutable_binding(OseoContext *context);
OseoValue oseo_null(void);
OseoValue oseo_boolean(bool value);
OseoValue oseo_number(double value);
bool oseo_to_boolean(OseoValue value);

OseoResult oseo_string_from_units(
    OseoContext *context,
    const uint16_t *units,
    size_t length
);
OseoResult oseo_environment_create(OseoContext *context, size_t slot_count);
OseoResult oseo_environment_clone(
    OseoContext *context,
    OseoValue environment
);
OseoResult oseo_environment_get(
    OseoContext *context,
    OseoValue environment,
    size_t index
);
OseoResult oseo_environment_set(
    OseoContext *context,
    OseoValue environment,
    size_t index,
    OseoValue value
);
OseoResult oseo_cell_create(OseoContext *context, OseoValue value);
OseoResult oseo_cell_get(OseoContext *context, OseoValue cell);
OseoResult oseo_cell_initialize(
    OseoContext *context,
    OseoValue cell,
    OseoValue value
);
OseoResult oseo_cell_set(
    OseoContext *context,
    OseoValue cell,
    OseoValue value
);
OseoResult oseo_module_namespace_create(
    OseoContext *context,
    OseoValue environment,
    size_t count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_ids
);
/*
 * GlobalDeclarationInstantiation's binding creation for one Script.
 * Every named entry becomes a writable, enumerable, non-configurable
 * own property of the realm's global this value whose stored value is
 * the binding cell in `environment`, so the property and the binding
 * are one storage location: an assignment through either is visible
 * through the other, and no value is ever copied between them. The
 * caller passes the names in ECMA-262's creation order, and the cells
 * must already exist. Module code never calls this; it adds no global
 * object property.
 */
OseoResult oseo_global_object_create(
    OseoContext *context,
    OseoValue environment,
    size_t count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_ids
);
/*
 * SetMutableBinding for a binding the global object also exposes as a
 * property. It writes the cell unless [[DefineOwnProperty]] made that
 * property non-writable, in which case the assignment fails the way the
 * equivalent property assignment fails: with a TypeError in strict code
 * and silently outside it.
 */
OseoResult oseo_global_binding_set(
    OseoContext *context,
    OseoValue cell,
    OseoValue value,
    bool strict
);
OseoResult oseo_function_create(
    OseoContext *context,
    size_t code_id,
    OseoValue environment,
    const uint16_t *name_units,
    size_t name_length,
    size_t parameter_count,
    OseoFunctionKind function_kind,
    OseoValue lexical_this,
    OseoValue inferred_name,
    OseoFunctionNamePrefix name_prefix
);
/** Retains the original ECMAScript source text for callable reflection. */
OseoResult oseo_function_set_source(
    OseoContext *context,
    OseoValue function_value,
    const uint16_t *source_units,
    size_t source_length
);
OseoResult oseo_function_environment(
    OseoContext *context,
    OseoValue function
);
OseoResult oseo_function_code_id(
    OseoContext *context,
    OseoValue function,
    size_t *code_id
);
OseoResult oseo_unknown_function(OseoContext *context, size_t code_id);
OseoResult oseo_call_function(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
/*
 * Creates one suspended generator for a call to `callee`. The record
 * owns `slot_count` collector-traced root slots and `completion_count`
 * saved completion records, so the generator body's frame survives every
 * suspension. The generator's [[Prototype]] is the function's
 * `prototype` object when that is an object, and null otherwise.
 */
OseoResult oseo_generator_create(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t slot_count,
    size_t completion_count
);
/*
 * The generator record's stable interior pointers and saved state.
 * Generated body code reacquires each on entry; the collector never
 * moves a generator, so the pointers stay valid across safepoints.
 */
OseoValue *oseo_generator_slots(OseoValue generator);
OseoCompletionRecord *oseo_generator_completions(OseoValue generator);
OseoValue oseo_generator_callee(OseoValue generator);
OseoValue oseo_generator_receiver(OseoValue generator);
OseoValue oseo_generator_sent(OseoValue generator);
size_t oseo_generator_resume_point(OseoValue generator);
/*
 * How the pending resumption delivers `sent`. A normal resumption
 * continues at the suspension's resume block; a return resumption leaves
 * the body from the suspension point, so generated code branches to the
 * block that runs the enclosing `finally` and iterator-close chain; a
 * throw resumption raises `sent` at the suspension point. The prototype
 * throw methods deliver a throw resumption to either body kind, and an
 * awaited rejection delivers one to an asynchronous body.
 */
#define OSEO_GENERATOR_RESUME_NEXT ((size_t)0u)
#define OSEO_GENERATOR_RESUME_RETURN ((size_t)1u)
#define OSEO_GENERATOR_RESUME_THROW ((size_t)2u)
size_t oseo_generator_resume_kind(OseoValue generator);
/*
 * What a pending suspension asked its driver for. A yield leaves an
 * iteration step; an await leaves an operand the driver settles before
 * it resumes the body, and no consumer observes it. Only an asynchronous
 * generator body suspends to await.
 */
#define OSEO_GENERATOR_SUSPEND_YIELD ((size_t)0u)
#define OSEO_GENERATOR_SUSPEND_AWAIT ((size_t)1u)
/*
 * Records the block that the next resumption continues at and marks the
 * generator suspended. Generated code calls this immediately before
 * leaving a body with a yielded or awaited value. `result_object` is
 * true when that value already is a complete iterator result object, as
 * it is for a synchronous `yield*`, which forwards the inner iterator's
 * own result unchanged.
 */
void oseo_generator_suspend(
    OseoContext *context,
    OseoValue generator,
    size_t resume_point,
    bool result_object,
    size_t suspend_reason
);
/*
 * %GeneratorPrototype%.next: resumes a suspended generator with `sent`
 * and returns a fresh { value, done } object. A completed generator
 * returns { undefined, true } without entering the body, and a running
 * one throws a TypeError.
 */
OseoResult oseo_generator_next(
    OseoContext *context,
    OseoValue generator,
    OseoValue sent
);
/*
 * %GeneratorPrototype%.return: resumes a suspended generator with a
 * return completion so every enclosing `finally` and iterator close in
 * the body runs, then returns a fresh { value, done } object. A body
 * that yields again from a `finally` reports { yielded, false }. A
 * generator suspended at its start or already completed returns
 * { value, true } without entering the body, and a running one throws a
 * TypeError. `IteratorClose` reaches this through the `return` method.
 */
OseoResult oseo_generator_return(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
);
/*
 * %GeneratorPrototype%.throw: resumes a suspended generator with a
 * throw completion. An unstarted or completed generator completes
 * immediately and re-throws the value. A running generator throws a
 * TypeError.
 */
OseoResult oseo_generator_throw(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
);
/*
 * %AsyncGeneratorPrototype%.next, .return, and .throw. Each enqueues one
 * AsyncGeneratorRequest and returns its promise immediately: the step
 * runs only while the queue's head owns it, so a call that arrives while
 * the body is running or awaiting waits its turn instead of reaching a
 * running body. A completed generator reports { undefined, true } from
 * `next`, awaits the value it reports done from `return`, and rejects
 * from `throw`. A receiver that is not an asynchronous generator rejects
 * with a TypeError rather than throwing it.
 */
OseoResult oseo_async_generator_next(
    OseoContext *context,
    OseoValue generator,
    OseoValue sent
);
OseoResult oseo_async_generator_return(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
);
OseoResult oseo_async_generator_throw(
    OseoContext *context,
    OseoValue generator,
    OseoValue reason
);
/*
 * Starts the hidden traced frame of an ordinary asynchronous function, or
 * converts an abrupt parameter prologue into its returned rejection.
 */
OseoResult oseo_async_function_start(
    OseoContext *context,
    OseoValue frame
);
OseoResult oseo_async_function_reject(
    OseoContext *context,
    OseoValue reason
);
OseoResult oseo_argument_list_create(OseoContext *context);
OseoResult oseo_argument_list_append(
    OseoContext *context,
    OseoValue list,
    OseoValue value
);
OseoResult oseo_argument_list_view(
    OseoContext *context,
    OseoValue list,
    size_t *count,
    const OseoValue **arguments
);
OseoResult oseo_function_prototype(
    OseoContext *context,
    OseoValue function
);
OseoResult oseo_constructor_result(
    OseoContext *context,
    OseoValue returned,
    OseoValue receiver
);
OseoResult oseo_constructor_receiver(
    OseoContext *context,
    OseoValue prototype
);
/*
 * Links a derived class to its `extends` operand. `heritage` must be
 * null or a constructor whose `prototype` is an object or null;
 * otherwise this throws a TypeError. On success the constructor's
 * [[Prototype]] becomes `heritage` and the class `prototype` object's
 * [[Prototype]] becomes the parent's `prototype`, so static and instance
 * lookups both walk into the parent. A null heritage leaves both null,
 * which is what an ordinary function's [[Prototype]] already is here,
 * and leaves `super()` with no constructor to reach.
 */
OseoResult oseo_class_heritage(
    OseoContext *context,
    OseoValue constructor,
    OseoValue heritage
);
/*
 * Appends one instance field to a class constructor's [[Fields]]: the
 * key the class body evaluated and the closure that produces the value,
 * or `undefined` for a field declared without an initializer. Fields
 * are recorded in class-body order and run in that order.
 */
OseoResult oseo_class_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer
);
/*
 * Creates one Private Name. Identity is the allocation itself, so a
 * class body evaluated twice produces names that never match and an
 * instance of one evaluation fails the other's brand check.
 */
OseoResult oseo_private_name_create(OseoContext *context);
/*
 * Appends one private field to a class constructor's element list: the
 * private name and the closure that produces the value, or `undefined`
 * for a field declared without an initializer.
 */
OseoResult oseo_class_private_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue initializer
);
/* Which half of a private element one class body definition supplies. */
typedef enum {
    OSEO_PRIVATE_METHOD = 0,
    OSEO_PRIVATE_GETTER = 1,
    OSEO_PRIVATE_SETTER = 2,
} OseoPrivateMethodKind;
/*
 * Appends one private method or accessor half to a class constructor's
 * element list. A getter and a setter recorded under the same private
 * name merge into the one accessor element that name reaches, whichever
 * order the class body defines them in.
 */
OseoResult oseo_class_private_method_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue value,
    OseoPrivateMethodKind kind
);
/*
 * Installs one static private method or accessor half directly on
 * the class constructor. A getter and setter under the same private
 * name merge into one accessor element, whichever order defines them.
 */
OseoResult oseo_class_static_private_method_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue value,
    OseoPrivateMethodKind kind
);
/*
 * PrivateGet: the value `object` carries under one private name. A
 * field or method element yields its value, an accessor element runs
 * its getter against the object, and an object whose class never
 * installed the element throws a TypeError, because a private name
 * cannot be an absent property key.
 */
OseoResult oseo_private_get(
    OseoContext *context,
    OseoValue object,
    OseoValue name
);
/*
 * PrivateBrandCheck: reports whether `object` carries an element under
 * one private name. An object with another brand returns false. A
 * non-object operand throws a TypeError.
 */
OseoResult oseo_private_in(
    OseoContext *context,
    OseoValue object,
    OseoValue name
);
/*
 * PrivateSet: replaces the value `object` carries under one private
 * name and reports the assigned value. Only a field element and an
 * accessor element with a setter accept a write; a method element, a
 * getter-only accessor, and an object without the element all throw a
 * TypeError.
 */
OseoResult oseo_private_set(
    OseoContext *context,
    OseoValue object,
    OseoValue name,
    OseoValue value
);
/*
 * InitializeInstanceElements: installs `constructor`'s recorded private
 * methods and accessors on `instance`, then runs its field
 * initializers in class-body order. Each public field result becomes an
 * own writable, enumerable, configurable data property and each private
 * field result becomes a private element. Every initializer is called
 * with the instance as its receiver and no arguments, and an abrupt
 * completion stops the remaining elements.
 */
OseoResult oseo_initialize_instance_elements(
    OseoContext *context,
    OseoValue constructor,
    OseoValue instance
);
/*
 * DefineField with a class constructor as the receiver, which is how a
 * `static` field is initialized. The initializer, or `undefined` for a
 * field declared without one, is called with the constructor as its
 * receiver and no arguments, and the result becomes an own writable,
 * enumerable, configurable data property of the constructor.
 */
OseoResult oseo_class_static_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer
);
/*
 * The same definition for a `static #name` field, whose result becomes
 * a private element the constructor itself carries rather than a
 * property. A private reference whose lexical environment resolves the
 * name reaches it only when its selected object has that element.
 */
OseoResult oseo_class_static_private_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue initializer
);
/*
 * Records one class element's [[HomeObject]]: the class prototype
 * object for an instance element and the constructor for a static one.
 * A value that is not a function is ignored, because only a function
 * carries the slot.
 */
void oseo_bind_home_object(OseoValue function, OseoValue home);
/*
 * Captures an arrow function's lexical execution context. The receiver
 * is already supplied to function creation; this adds the enclosing
 * function's home object and super-constructor context plus new.target.
 */
void oseo_bind_arrow_context(
    OseoValue function,
    OseoValue enclosing,
    OseoValue new_target
);
/*
 * GetSuperBase: the [[Prototype]] of the running function's home
 * object, where a `super` property reference starts its lookup. A
 * function without a home object, or a home object without a prototype,
 * yields a nullish value that the reference itself rejects, so this
 * reports no completion of its own.
 */
OseoValue oseo_super_base(OseoValue callee);
/*
 * A `super.x` read. The lookup starts at `base` while a getter runs
 * against `receiver`, which is the `this` of the class element holding
 * the reference.
 */
OseoResult oseo_super_get(
    OseoContext *context,
    OseoValue base,
    OseoValue key,
    OseoValue receiver
);
/*
 * A `super.x = v` write, which is Set with a receiver distinct from the
 * object the lookup walks. A setter found on `base` or its prototype
 * chain runs against `receiver`; otherwise the assignment creates or
 * updates an own property of `receiver` and never reaches a setter that
 * only `receiver`'s own chain would find. A read-only property on
 * either side reports a TypeError in strict code and is ignored
 * otherwise.
 */
OseoResult oseo_super_set(
    OseoContext *context,
    OseoValue base,
    OseoValue key,
    OseoValue value,
    OseoValue receiver,
    bool strict
);
/*
 * The `delete` evaluation's rejection of a `super` property reference.
 * The receiver and the key expression have already been evaluated and
 * the key was deliberately not converted, so this only raises the
 * ReferenceError that step and reports no normal completion.
 */
OseoResult oseo_super_property_delete(OseoContext *context);
/*
 * GetSuperConstructor: the running constructor's own [[Prototype]].
 * Throws a TypeError when that is not a constructor, which is how
 * `class C extends null {}` rejects `super()`.
 */
OseoResult oseo_super_constructor(
    OseoContext *context,
    OseoValue callee
);
/*
 * BindThisValue. A derived constructor's `this` cell starts
 * uninitialized, so a second `super()` in the same invocation throws a
 * ReferenceError rather than replacing the receiver.
 */
OseoResult oseo_bind_this(
    OseoContext *context,
    OseoValue cell,
    OseoValue value
);
/*
 * A derived constructor's completion value. An object stands as
 * written, `undefined` yields the bound `this` and therefore throws a
 * ReferenceError when `super()` never ran, and any other value is a
 * TypeError.
 */
OseoResult oseo_derived_constructor_result(
    OseoContext *context,
    OseoValue returned,
    OseoValue cell
);
OseoResult oseo_array_create(OseoContext *context, size_t length);
/*
 * Append operations are for monotonic generated array accumulation. The
 * array must not already own the property named by its current length.
 */
OseoResult oseo_array_append(
    OseoContext *context,
    OseoValue array,
    OseoValue value
);
OseoResult oseo_array_append_hole(
    OseoContext *context,
    OseoValue array
);
/*
 * Returns the frozen template object for one generated parse site, creating
 * its frozen raw array and realm-local cache entry on first evaluation.
 */
OseoResult oseo_template_object(
    OseoContext *context,
    const void *site,
    size_t count,
    const uint16_t *const *cooked,
    const size_t *cooked_lengths,
    const bool *cooked_defined,
    const uint16_t *const *raw,
    const size_t *raw_lengths
);
OseoResult oseo_object_create(OseoContext *context, OseoValue prototype);
OseoResult oseo_object_literal_create(OseoContext *context);
/*
 * CreateUnmappedArgumentsObject (10.4.4.6) for one admitted function
 * invocation that is strict, has a non-simple parameter list, or both.
 * Indexed properties snapshot the call arguments and `length` records
 * their count; `callee` is the non-configurable poisoned accessor whose
 * [[Get]] and [[Set]] are both %ThrowTypeError%, so the object never
 * exposes the running function. A non-strict function with a simple
 * parameter list instead calls oseo_mapped_arguments_create, which is
 * the only shape that keeps `callee` an ordinary data property.
 */
OseoResult oseo_arguments_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
/*
 * Creates the mapped arguments exotic object (10.4.4.7) for one
 * admitted non-strict function invocation whose parameter list is
 * simple. Indexed properties snapshot the call arguments the same way
 * oseo_arguments_create does; `mapped_indices` then names, in
 * ascending order, the `mapped_count` indices that alias their
 * parameter's own binding cell in `environment`, keyed by
 * `mapped_binding_ids` at the same position. `length` and `callee`
 * match the unmapped object's own attributes and values.
 */
OseoResult oseo_mapped_arguments_create(
    OseoContext *context,
    OseoValue environment,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments,
    const size_t *mapped_indices,
    const size_t *mapped_binding_ids,
    size_t mapped_count
);
OseoResult oseo_require_object_coercible(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_require_delete_object_coercible(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_object_rest(
    OseoContext *context,
    OseoValue source,
    size_t excluded_count,
    const OseoValue *excluded_keys
);
OseoResult oseo_object_spread(
    OseoContext *context,
    OseoValue target,
    OseoValue source
);
OseoResult oseo_property_key(OseoContext *context, OseoValue value);
OseoResult oseo_object_define(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
);
/*
 * Defines an accessor property descriptor, generalizing
 * PropertyDefinitionEvaluation for an object literal getter or setter
 * clause (has_getter xor has_setter, attributes always
 * {true, true, false, true}) and Object.defineProperty's accessor
 * descriptors (either slot present, explicit attributes). When the
 * existing own property is already an accessor, an absent slot is
 * preserved from it; otherwise, including when converting an existing
 * data property, an absent slot starts undefined. attributes.accessor
 * must be true and attributes.writable is ignored.
 */
OseoResult oseo_object_define_accessor(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue getter,
    OseoValue setter,
    bool has_getter,
    bool has_setter,
    OseoPropertyAttributes attributes
);
OseoResult oseo_object_delete(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    bool strict
);
OseoResult oseo_object_get(
    OseoContext *context,
    OseoValue object,
    OseoValue key
);
bool oseo_value_is_object(OseoValue value);
bool oseo_property_cache_matches(
    OseoValue object,
    const OseoPropertyCache *cache
);
OseoValue oseo_property_cache_load(
    OseoValue object,
    const OseoPropertyCache *cache
);
void oseo_property_cache_update(
    OseoValue object,
    OseoValue key,
    OseoPropertyCache *cache
);
OseoResult oseo_object_has_own(
    OseoContext *context,
    OseoValue object,
    OseoValue key
);
OseoResult oseo_object_set(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
    bool strict
);
OseoResult oseo_object_set_prototype(
    OseoContext *context,
    OseoValue object,
    OseoValue prototype
);
/** Implements the object-literal prototype setter while leaving the existing
 * object prototype mutation path authoritative for object and null values. */
OseoResult oseo_object_literal_set_prototype(
    OseoContext *context,
    OseoValue object,
    OseoValue prototype
);
OseoResult oseo_object_builtin_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_object_builtin_define_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_object_builtin_get_own_property_descriptor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_object_builtin_keys(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_object_builtin_set_prototype_of(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
/*
 * EnumerateObjectProperties (14.7.5.9), the only consumer of which is a
 * for-in head. It is not the iterator protocol: acquisition reads no
 * `Symbol.iterator` and no `next` method, no step runs user code, and
 * the record is never closed, so an abrupt head target or body leaves
 * the loop without a cleanup call.
 *
 * `oseo_enumerate_get` reports `done` for a nullish subject and leaves
 * `record` undefined, which is the break completion
 * ForIn/OfHeadEvaluation returns before ToObject runs.
 * `oseo_enumerate_next` reports `done` once every own and inherited
 * enumerable string key has been reported at most once.
 */
OseoResult oseo_enumerate_get(
    OseoContext *context,
    OseoValue subject,
    OseoValue *record,
    bool *done
);
OseoResult oseo_enumerate_next(
    OseoContext *context,
    OseoValue record,
    OseoValue *key,
    bool *done
);
OseoResult oseo_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
);
OseoResult oseo_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
);
OseoResult oseo_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
);
/*
 * The asynchronous iterator protocol a `for await` head consumes. It is
 * the synchronous protocol's three entry points with an Await on every
 * result: acquisition reads Symbol.asyncIterator and wraps the
 * synchronous iterator when that method is absent, and the step and
 * close entry points accept either an asynchronous iterator or that
 * wrapper. Each one reports the same `next_method`, `value`, and `done`
 * contract as its synchronous counterpart, so one loop lowering serves
 * both heads.
 */
OseoResult oseo_async_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
);
OseoResult oseo_async_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
);
/*
 * Start one asynchronous iterator step without draining jobs. The returned
 * promise is awaited by generated traced-frame code, then inspected through
 * oseo_async_iterator_result after the frame resumes.
 */
OseoResult oseo_async_iterator_next_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method
);
OseoResult oseo_async_iterator_result(
    OseoContext *context,
    OseoValue settled,
    bool value_only,
    bool value_when_done,
    OseoValue iterator,
    bool throw_on_value_only,
    OseoValue *value,
    bool *done
);
OseoResult oseo_async_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
);
/*
 * Start and finish AsyncIteratorClose around a traced-frame suspension.
 * `needs_await` is false when no asynchronous return result exists.
 * The saved throw mode preserves an in-flight throw, while
 * `skip_validation` records result validation already owned by a wrapper.
 */
OseoResult oseo_async_iterator_close_start(
    OseoContext *context,
    OseoValue iterator,
    bool from_error,
    OseoValue *skip_validation,
    bool *needs_await
);
OseoResult oseo_async_iterator_close_result(
    OseoContext *context,
    OseoValue settled,
    bool ignore_result,
    bool skip_validation
);
/*
 * One `yield*` delegation step over a normal resumption: call the
 * iterator record's captured next method with `sent`, then read `done`
 * and `value` from the result. Unlike oseo_iterator_next, `value`
 * receives IteratorValue even when the result is done, because the
 * delegating expression reports that value as its own.
 */
OseoResult oseo_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value,
    bool *done
);
/*
 * One `yield*` delegation step over a return resumption: read the
 * iterator's `return` method and, when it exists, call it with `sent`
 * and report the result's `done` and `value`. An iterator with no
 * `return` method reports done with `sent` itself, which is the return
 * completion the delegating body then leaves through.
 */
OseoResult oseo_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value,
    bool *done
);
/*
 * One `yield*` delegation step over a throw resumption: read the
 * iterator's `throw` method and, when it exists, call it with `sent`
 * and report the result's `done` and `value`. An iterator with no
 * `throw` method closes the iterator and throws a TypeError.
 */
OseoResult oseo_iterator_delegate_throw(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value,
    bool *done
);
/*
 * The three delegation steps a `yield*` inside an asynchronous generator
 * takes. Each awaits the inner iterator's result before reading `done`
 * and `value`, and each accepts either an asynchronous iterator or the
 * wrapper `oseo_async_iterator_get` builds over a synchronous one.
 *
 * A return step over an iterator with no `return` method reports done
 * with `sent`, which is the return completion the delegating body then
 * leaves through. A throw step over an iterator with no `throw` method
 * closes that iterator and reports a TypeError, because the delegating
 * body has no way to deliver the throw completion it received.
 */
OseoResult oseo_async_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value,
    bool *done
);
OseoResult oseo_async_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value,
    bool *done
);
OseoResult oseo_async_iterator_delegate_throw(
    OseoContext *context,
    OseoValue iterator,
    OseoValue reason,
    OseoValue *value,
    bool *done
);
/*
 * Start asynchronous yield-delegation steps without draining their result
 * promises. `value_only` is true only when a native asynchronous iterator
 * has no `return` method and the returned promise directly awaits the
 * delivered completion value.
 */
OseoResult oseo_async_iterator_delegate_next_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value_only
);
OseoResult oseo_async_iterator_delegate_return_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value_only
);
OseoResult oseo_async_iterator_delegate_throw_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue reason,
    OseoValue *value_only
);
OseoResult oseo_error_intrinsic(OseoContext *context, OseoErrorKind kind);
OseoResult oseo_symbol_intrinsic(OseoContext *context);
/*
 * ResolveThisBinding for a this environment whose [[ThisMode]] is
 * global. A nullish receiver resolves to the realm's global this value,
 * which this call creates on first use and then keeps permanently
 * rooted; any other receiver stands unchanged. Script top level reaches
 * the same value through its own undefined receiver, so one entry point
 * serves both positions. The value is an ordinary extensible object
 * whose own properties are the var-scoped bindings
 * `oseo_global_object_create` installed for the running Script. It is
 * not yet the complete global object: the standard globals and
 * `globalThis` remain a later unit.
 */
OseoResult oseo_this_value(OseoContext *context, OseoValue receiver);
OseoResult oseo_negate(OseoContext *context, OseoValue value);
OseoResult oseo_typeof(OseoContext *context, OseoValue value);
OseoResult oseo_bigint_literal(
    OseoContext *context,
    const char *digits,
    uint32_t radix
);
OseoResult oseo_to_number(OseoContext *context, OseoValue value);
OseoResult oseo_to_numeric(OseoContext *context, OseoValue value);
OseoResult oseo_numeric_one(OseoContext *context, OseoValue value);
OseoResult oseo_to_string(OseoContext *context, OseoValue value);
OseoResult oseo_bitwise_not(OseoContext *context, OseoValue value);
OseoResult oseo_add(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_subtract(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_multiply(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_divide(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_remainder(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_exponentiate(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_bitwise_and(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_bitwise_or(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_bitwise_xor(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_shift_left(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_shift_right(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_shift_right_unsigned(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_loose_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_not_loose_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_has_property(
    OseoContext *context,
    OseoValue key,
    OseoValue object_value
);
OseoResult oseo_instanceof(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_not_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_less_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_less_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_greater_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_greater_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_console_log(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);

OseoResult oseo_promise_construct(
    OseoContext *context,
    OseoValue executor
);
OseoResult oseo_promise_resolve(
    OseoContext *context,
    OseoValue value
);
OseoResult oseo_promise_reject(
    OseoContext *context,
    OseoValue reason
);
OseoResult oseo_promise_all(
    OseoContext *context,
    OseoValue iterable
);
OseoResult oseo_promise_race(
    OseoContext *context,
    OseoValue iterable
);
OseoResult oseo_promise_resolve_into(
    OseoContext *context,
    OseoValue promise,
    OseoValue value
);
OseoResult oseo_promise_reject_into(
    OseoContext *context,
    OseoValue promise,
    OseoValue reason
);
OseoResult oseo_promise_then(
    OseoContext *context,
    OseoValue promise,
    OseoValue on_fulfilled,
    OseoValue on_rejected
);
OseoResult oseo_promise_async_call(
    OseoContext *context,
    OseoValue execution
);
OseoResult oseo_promise_await_then(
    OseoContext *context,
    OseoValue promise,
    OseoValue on_fulfilled
);
OseoResult oseo_promise_finally(
    OseoContext *context,
    OseoValue promise,
    OseoValue on_finally
);
OseoPromiseState oseo_promise_state(OseoValue promise);
OseoResult oseo_promise_result(
    OseoContext *context,
    OseoValue promise
);
OseoResult oseo_jobs_drain(OseoContext *context);
OseoResult oseo_rejection_checkpoint(OseoContext *context);
OseoResult oseo_set_timeout(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
OseoResult oseo_clear_timeout(
    OseoContext *context,
    OseoValue handle
);
OseoResult oseo_entry_task_checkpoint(
    OseoContext *context,
    OseoResult completion
);
OseoResult oseo_event_loop_run(
    OseoContext *context,
    OseoValue entry_promise
);

#endif
