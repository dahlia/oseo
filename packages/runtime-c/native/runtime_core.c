#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Results, context lifecycle, diagnostics, call limits, frames,
 * root-stack operations, and immediate value constructors.
 */

void oseo_context_init(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length
) {
    context->roots = NULL;
    context->objects = NULL;
    context->function_dispatcher = NULL;
    context->async_call_capability = oseo_undefined();
    context->microtask_head = oseo_undefined();
    context->microtask_tail = oseo_undefined();
    context->pending_rejections = oseo_undefined();
    context->pending_rejection_tail = oseo_undefined();
    context->promise_catch_function = oseo_undefined();
    context->promise_finally_function = oseo_undefined();
    context->promise_then_function = oseo_undefined();
    for (size_t kind = 0u; kind < OSEO_ERROR_KIND_COUNT; kind += 1u) {
        context->error_constructors[kind] = oseo_undefined();
        context->error_prototypes[kind] = oseo_undefined();
    }
    context->timer_head = oseo_undefined();
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    oseo_context_clear_language_error(context);
    context->active_frame_slots = 0u;
    context->call_depth = 0u;
    context->line = 1u;
    context->column = 1u;
    context->guard_hits = 0u;
    context->guard_misses = 0u;
    context->overflow_misses = 0u;
    context->generic_addition_calls = 0u;
    context->next_shape_id = 1u;
    context->allocations = 0u;
    context->allocation_attempts = 0u;
    context->collections = 0u;
    context->rejection_handled_count = 0u;
    context->unhandled_rejection_count = 0u;
    context->clock_milliseconds = 0u;
    context->next_timer_id = 1u;
    context->next_timer_order = 0u;
    context->fail_allocation_at = 0u;
    context->observe_specialization = false;
    context->collect_every_safepoint =
        getenv("OSEO_GC_EVERY_SAFEPOINT") != NULL;
}

void oseo_context_set_function_dispatcher(
    OseoContext *context,
    OseoFunctionDispatcher dispatcher
) {
    context->function_dispatcher = dispatcher;
}

void oseo_context_fail_allocation_at(OseoContext *context, size_t attempt) {
    context->allocation_attempts = 0u;
    context->fail_allocation_at = attempt;
}

void oseo_context_clear_language_error(OseoContext *context) {
    context->error_code = "OSEO2001";
    context->error_message = OSEO_UNHANDLED_THROW_MESSAGE;
    context->has_diagnostic = false;
}

void oseo_context_destroy(OseoContext *context) {
    context->roots = NULL;
    context->async_call_capability = oseo_undefined();
    context->microtask_head = oseo_undefined();
    context->microtask_tail = oseo_undefined();
    context->pending_rejections = oseo_undefined();
    context->pending_rejection_tail = oseo_undefined();
    context->promise_catch_function = oseo_undefined();
    context->promise_finally_function = oseo_undefined();
    context->promise_then_function = oseo_undefined();
    for (size_t kind = 0u; kind < OSEO_ERROR_KIND_COUNT; kind += 1u) {
        context->error_constructors[kind] = oseo_undefined();
        context->error_prototypes[kind] = oseo_undefined();
    }
    context->timer_head = oseo_undefined();
    oseo_collect(context);
}

void oseo_context_location(
    OseoContext *context,
    size_t line,
    size_t column
) {
    context->line = line;
    context->column = column;
}

void oseo_context_source_location(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length,
    size_t line,
    size_t column
) {
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    context->line = line;
    context->column = column;
}

void oseo_context_print_error(const OseoContext *context) {
    (void)fwrite(
        context->source_id,
        1u,
        context->source_id_length,
        stderr
    );
    (void)fprintf(
        stderr,
        ":%zu:%zu: error[%s]: %s\n",
        context->line,
        context->column,
        context->error_code,
        context->error_message
    );
}

void oseo_context_print_observations(const OseoContext *context) {
    (void)fprintf(
        stderr,
        "OSEO_OBSERVATIONS "
        "{\"guardHits\":%zu,\"guardMisses\":%zu,"
        "\"overflowMisses\":%zu,\"genericAdditionCalls\":%zu,"
        "\"allocations\":%zu,\"collections\":%zu}\n",
        context->guard_hits,
        context->guard_misses,
        context->overflow_misses,
        context->generic_addition_calls,
        context->allocations,
        context->collections
    );
}

OseoResult oseo_call_enter(OseoContext *context) {
    if (context->call_depth >= OSEO_MAX_CALL_DEPTH) {
        return failure(
            context,
            "OSEO2001",
            "Maximum call depth exceeded."
        );
    }
    context->call_depth += 1u;
    return normal(oseo_undefined());
}

void oseo_call_leave(OseoContext *context) {
    if (context->call_depth > 0u) context->call_depth -= 1u;
}

OseoResult oseo_frame_enter(OseoContext *context, size_t slot_count) {
    if (slot_count >
        OSEO_MAX_ACTIVE_FRAME_SLOTS - context->active_frame_slots) {
        return failure(
            context,
            "OSEO2001",
            "Maximum active native frame budget exceeded."
        );
    }
    context->active_frame_slots += slot_count;
    return normal(oseo_undefined());
}

void oseo_frame_leave(OseoContext *context, size_t slot_count) {
    if (slot_count <= context->active_frame_slots) {
        context->active_frame_slots -= slot_count;
    } else {
        context->active_frame_slots = 0u;
    }
}

void oseo_roots_push(OseoContext *context, OseoRootFrame *frame) {
    frame->previous = context->roots;
    context->roots = frame;
}

void oseo_roots_pop(OseoContext *context, OseoRootFrame *frame) {
    if (context->roots == frame) context->roots = frame->previous;
}

OseoResult oseo_roots_allocate(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t slot_count
) {
    OseoValue *slots = NULL;
    if (slot_count > 0u) {
        if (slot_count > SIZE_MAX / sizeof(OseoValue)) {
            return failure(
                context,
                "OSEO2001",
                "Root frame allocation is too large."
            );
        }
        slots = calloc(slot_count, sizeof(OseoValue));
        if (slots == NULL) {
            return failure(
                context,
                "OSEO2001",
                "Root frame allocation failed."
            );
        }
    }
    frame->previous = NULL;
    frame->slots = slots;
    frame->slot_count = slot_count;
    oseo_roots_push(context, frame);
    return normal(oseo_undefined());
}

void oseo_roots_release(OseoContext *context, OseoRootFrame *frame) {
    oseo_roots_pop(context, frame);
    free(frame->slots);
    frame->previous = NULL;
    frame->slots = NULL;
    frame->slot_count = 0u;
}

OseoValue oseo_undefined(void) {
    return tagged(OSEO_TAG_UNDEFINED, 0u);
}

OseoValue oseo_uninitialized(void) {
    return tagged(OSEO_TAG_UNINITIALIZED, 0u);
}

OseoResult oseo_read_binding(OseoContext *context, OseoValue value) {
    if (tag_of(value) == OSEO_TAG_UNINITIALIZED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_REFERENCE,
            "Binding is read before initialization."
        );
    }
    return normal(value);
}

OseoResult oseo_write_immutable_binding(OseoContext *context) {
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Cannot assign to an immutable binding."
    );
}

OseoValue oseo_null(void) {
    return tagged(OSEO_TAG_NULL, 0u);
}

OseoValue oseo_boolean(bool value) {
    return tagged(OSEO_TAG_BOOLEAN, value ? 1u : 0u);
}

OseoValue oseo_number(double value) {
    if (isnan(value)) return OSEO_CANONICAL_NAN;
    if (value == 0.0 && signbit(value)) return double_bits(value);
    if (isfinite(value) && trunc(value) == value &&
        value >= (double)OSEO_SMI_MIN && value <= (double)OSEO_SMI_MAX) {
        int64_t integer = (int64_t)value;
        return tagged(OSEO_TAG_SMI, (uint64_t)integer);
    }
    return double_bits(value);
}

bool oseo_to_boolean(OseoValue value) {
    uint64_t tag = tag_of(value);
    if (tag == OSEO_TAG_UNDEFINED || tag == OSEO_TAG_NULL) return false;
    if (tag == OSEO_TAG_BOOLEAN) return (value & 1u) != 0u;
    if (is_number(value)) {
        double number = number_value(value);
        return number != 0.0 && !isnan(number);
    }
    if (is_string(value)) return string_object(value)->length != 0u;
    return tag == OSEO_TAG_HEAP;
}
