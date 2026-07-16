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

typedef enum {
    OSEO_PROMISE_PENDING = 0,
    OSEO_PROMISE_FULFILLED = 1,
    OSEO_PROMISE_REJECTED = 2,
    OSEO_PROMISE_INVALID = 3,
} OseoPromiseState;

typedef struct {
    bool configurable;
    bool enumerable;
    bool writable;
} OseoPropertyAttributes;

typedef struct {
    size_t shape_id;
    size_t slot;
} OseoPropertyCache;

struct OseoRootFrame {
    OseoRootFrame *previous;
    OseoValue *slots;
    size_t slot_count;
};

struct OseoContext {
    OseoRootFrame *roots;
    OseoHeapObject *objects;
    OseoFunctionDispatcher function_dispatcher;
    OseoValue microtask_head;
    OseoValue microtask_tail;
    OseoValue pending_rejections;
    OseoValue pending_rejection_tail;
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
void oseo_context_destroy(OseoContext *context);
void oseo_context_fail_allocation_at(OseoContext *context, size_t attempt);
void oseo_context_clear_language_error(OseoContext *context);
void oseo_context_location(
    OseoContext *context,
    size_t line,
    size_t column
);
void oseo_context_print_error(const OseoContext *context);
void oseo_context_print_observations(const OseoContext *context);
void oseo_context_set_function_dispatcher(
    OseoContext *context,
    OseoFunctionDispatcher dispatcher
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
OseoResult oseo_function_create(
    OseoContext *context,
    size_t code_id,
    OseoValue environment,
    const uint16_t *name_units,
    size_t name_length,
    size_t parameter_count,
    OseoValue inferred_name
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
OseoResult oseo_array_create(OseoContext *context, size_t length);
OseoResult oseo_object_create(OseoContext *context, OseoValue prototype);
OseoResult oseo_property_key(OseoContext *context, OseoValue value);
OseoResult oseo_object_define(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
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
OseoResult oseo_negate(OseoContext *context, OseoValue value);
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
OseoResult oseo_strict_equal(
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
OseoPromiseState oseo_promise_state(OseoValue promise);
OseoResult oseo_promise_result(
    OseoContext *context,
    OseoValue promise
);
OseoResult oseo_jobs_drain(OseoContext *context);
OseoResult oseo_rejection_checkpoint(OseoContext *context);

#endif
