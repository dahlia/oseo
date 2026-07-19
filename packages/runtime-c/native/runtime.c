#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static OseoResult promise_create(OseoContext *context) {
    OseoPromise *promise =
        oseo_internal_allocate_heap_bytes(context, sizeof(*promise));
    if (promise == NULL) {
        return failure(context, "OSEO2001", "Promise allocation failed.");
    }
    promise->ordinary.prototype = oseo_null();
    promise->ordinary.properties = NULL;
    promise->ordinary.property_capacity = 0u;
    promise->ordinary.property_count = 0u;
    promise->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    promise->ordinary.array_length = 0u;
    promise->ordinary.dictionary = false;
    promise->ordinary.length_writable = false;
    promise->ordinary.module_namespace = false;
    promise->ordinary.default_intrinsics = true;
    promise->result = oseo_undefined();
    promise->reaction_head = oseo_undefined();
    promise->reaction_tail = oseo_undefined();
    promise->unhandled_next = oseo_undefined();
    promise->rejection_source_id = context->source_id;
    promise->rejection_source_id_length = context->source_id_length;
    promise->rejection_line = context->line;
    promise->rejection_column = context->column;
    promise->state = OSEO_PROMISE_PENDING;
    promise->handled = false;
    promise->pending_report = false;
    promise->reported = false;
    return oseo_internal_publish_heap(
        context,
        &promise->ordinary.header,
        OSEO_HEAP_PROMISE
    );
}

OseoResult oseo_internal_promise_method_function(
    OseoContext *context,
    const char *name
) {
    OseoValue *cache;
    size_t code_id;
    const uint16_t *units;
    size_t length;
    static const uint16_t catch_units[] = {'c', 'a', 't', 'c', 'h'};
    static const uint16_t finally_units[] = {
        'f', 'i', 'n', 'a', 'l', 'l', 'y'
    };
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    if (strcmp(name, "then") == 0) {
        cache = &context->promise_then_function;
        code_id = OSEO_PROMISE_THEN_CODE_ID;
        units = then_units;
        length = sizeof(then_units) / sizeof(*then_units);
    } else if (strcmp(name, "catch") == 0) {
        cache = &context->promise_catch_function;
        code_id = OSEO_PROMISE_CATCH_CODE_ID;
        units = catch_units;
        length = sizeof(catch_units) / sizeof(*catch_units);
    } else if (strcmp(name, "finally") == 0) {
        cache = &context->promise_finally_function;
        code_id = OSEO_PROMISE_FINALLY_CODE_ID;
        units = finally_units;
        length = sizeof(finally_units) / sizeof(*finally_units);
    } else {
        return failure(context, "OSEO2001", "Unknown promise method.");
    }
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_environment_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[0],
            units,
            length,
            code_id == OSEO_PROMISE_THEN_CODE_ID ? 2u : 1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined()
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) *cache = result.value;
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult reaction_create(
    OseoContext *context,
    OseoValue on_fulfilled,
    OseoValue on_rejected,
    OseoValue capability
) {
    OseoPromiseReaction *reaction =
        oseo_internal_allocate_heap_bytes(context, sizeof(*reaction));
    if (reaction == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Promise reaction allocation failed."
        );
    }
    reaction->next = oseo_undefined();
    reaction->on_fulfilled = on_fulfilled;
    reaction->on_rejected = on_rejected;
    reaction->capability = capability;
    reaction->aggregate = oseo_undefined();
    reaction->index = 0u;
    reaction->kind = OSEO_REACTION_NORMAL;
    return oseo_internal_publish_heap(
        context,
        &reaction->header,
        OSEO_HEAP_PROMISE_REACTION
    );
}

static OseoResult enqueue_job(
    OseoContext *context,
    OseoJobKind kind,
    OseoValue primary,
    OseoValue secondary,
    OseoValue argument,
    bool fulfilled
) {
    OseoJob *job = oseo_internal_allocate_heap_bytes(context, sizeof(*job));
    if (job == NULL) {
        return failure(context, "OSEO2001", "Promise job allocation failed.");
    }
    job->next = oseo_undefined();
    job->primary = primary;
    job->secondary = secondary;
    job->argument = argument;
    job->kind = kind;
    job->fulfilled = fulfilled;
    OseoResult published =
        oseo_internal_publish_heap(context, &job->header, OSEO_HEAP_JOB);
    if (published.status != OSEO_STATUS_NORMAL) return published;
    if (tag_of(context->microtask_tail) == OSEO_TAG_UNDEFINED) {
        context->microtask_head = published.value;
    } else {
        job_object(context->microtask_tail)->next = published.value;
    }
    context->microtask_tail = published.value;
    return normal(oseo_undefined());
}

static OseoResult promise_attach_reaction(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue reaction_value
) {
    OseoPromise *promise = promise_object(promise_value);
    if (promise->reported && !promise->handled) {
        context->rejection_handled_count += 1u;
    }
    promise->handled = true;
    promise->pending_report = false;
    if (promise->state == OSEO_PROMISE_PENDING) {
        if (tag_of(promise->reaction_tail) == OSEO_TAG_UNDEFINED) {
            promise->reaction_head = reaction_value;
        } else {
            reaction_object(promise->reaction_tail)->next = reaction_value;
        }
        promise->reaction_tail = reaction_value;
        return normal(oseo_undefined());
    }
    return enqueue_job(
        context,
        OSEO_JOB_REACTION,
        reaction_value,
        promise_value,
        promise->result,
        promise->state == OSEO_PROMISE_FULFILLED
    );
}

static OseoResult enqueue_reactions(
    OseoContext *context,
    OseoValue promise_value
) {
    OseoPromise *promise = promise_object(promise_value);
    OseoValue current = promise->reaction_head;
    while (tag_of(current) != OSEO_TAG_UNDEFINED) {
        OseoPromiseReaction *reaction = reaction_object(current);
        OseoValue next = reaction->next;
        OseoResult queued = enqueue_job(
            context,
            OSEO_JOB_REACTION,
            current,
            promise_value,
            promise_object(promise_value)->result,
            promise_object(promise_value)->state == OSEO_PROMISE_FULFILLED
        );
        if (queued.status != OSEO_STATUS_NORMAL) return queued;
        current = next;
    }
    promise = promise_object(promise_value);
    promise->reaction_head = oseo_undefined();
    promise->reaction_tail = oseo_undefined();
    return normal(oseo_undefined());
}

static OseoResult promise_fulfill(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue value
) {
    if (!is_promise(promise_value)) return language_failure(context);
    OseoPromise *promise = promise_object(promise_value);
    if (promise->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    promise->state = OSEO_PROMISE_FULFILLED;
    promise->result = value;
    return enqueue_reactions(context, promise_value);
}

OseoResult oseo_promise_reject_into(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue reason
) {
    if (!is_promise(promise_value)) return language_failure(context);
    OseoPromise *promise = promise_object(promise_value);
    if (promise->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    promise->state = OSEO_PROMISE_REJECTED;
    promise->result = reason;
    promise->rejection_source_id = context->source_id;
    promise->rejection_source_id_length = context->source_id_length;
    promise->rejection_line = context->line;
    promise->rejection_column = context->column;
    if (!promise->handled) {
        promise->pending_report = true;
        if (tag_of(context->pending_rejection_tail) == OSEO_TAG_UNDEFINED) {
            context->pending_rejections = promise_value;
        } else {
            promise_object(context->pending_rejection_tail)->unhandled_next =
                promise_value;
        }
        context->pending_rejection_tail = promise_value;
    }
    return enqueue_reactions(context, promise_value);
}

static OseoResult resolving_environment_create(
    OseoContext *context,
    OseoValue promise
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_cell_create(context, oseo_boolean(false));
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult resolving_function_create(
    OseoContext *context,
    OseoValue environment,
    size_t code_id
) {
    if (!is_environment(environment)) {
        return failure(context, "OSEO2001", "Invalid resolving environment.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = environment;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[0],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_resolve_into(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue value
) {
    if (!is_promise(promise_value)) return language_failure(context);
    if (promise_object(promise_value)->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    if (promise_value == value) {
        OseoResult error = language_failure_message(
            context,
            "A promise cannot resolve to itself."
        );
        if (error.status != OSEO_STATUS_THROW || context->has_diagnostic) {
            return error;
        }
        oseo_context_clear_language_error(context);
        return oseo_promise_reject_into(context, promise_value, error.value);
    }
    if (!is_object(value)) {
        return promise_fulfill(context, promise_value, value);
    }

    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = value;
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    result = oseo_string_from_units(
        context,
        then_units,
        sizeof(then_units) / sizeof(*then_units)
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[1], frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(
            context,
            frame.slots[0],
            result.value
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_function(frame.slots[2])) {
        result = enqueue_job(
            context,
            OSEO_JOB_THENABLE,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            true
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_fulfill(context, frame.slots[0], frame.slots[1]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_resolve(
    OseoContext *context,
    OseoValue value
) {
    if (is_promise(value)) return normal(value);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[1],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_reject(
    OseoContext *context,
    OseoValue reason
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = reason;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_reject_into(
            context,
            frame.slots[1],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_aggregate_create(
    OseoContext *context,
    OseoValue capability,
    OseoValue values,
    size_t remaining
) {
    OseoPromiseAggregate *aggregate =
        oseo_internal_allocate_heap_bytes(context, sizeof(*aggregate));
    if (aggregate == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Promise aggregate allocation failed."
        );
    }
    aggregate->capability = capability;
    aggregate->values = values;
    aggregate->remaining = remaining;
    return oseo_internal_publish_heap(
        context,
        &aggregate->header,
        OSEO_HEAP_PROMISE_AGGREGATE
    );
}

static OseoResult promise_aggregate_environment_create(
    OseoContext *context,
    OseoValue reaction
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = reaction;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            oseo_boolean(false)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_aggregate_function_create(
    OseoContext *context,
    OseoValue environment,
    size_t code_id
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = environment;
    result = oseo_function_create(
        context,
        code_id,
        frame.slots[0],
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_INTERNAL,
        oseo_undefined(),
        oseo_undefined()
    );
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_aggregate_settle(
    OseoContext *context,
    OseoValue reaction_value,
    OseoValue argument,
    bool fulfilled
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = reaction_value;
    OseoPromiseReaction *reaction = reaction_object(frame.slots[0]);
    frame.slots[1] = reaction->aggregate;
    OseoPromiseAggregate *aggregate = aggregate_object(frame.slots[1]);
    frame.slots[2] = aggregate->capability;
    frame.slots[3] = aggregate->values;
    frame.slots[4] = argument;
    size_t index = reaction->index;
    OseoReactionKind kind = reaction->kind;
    if (promise_object(frame.slots[2])->state != OSEO_PROMISE_PENDING) {
        result = normal(oseo_undefined());
    } else if (kind == OSEO_REACTION_RACE || !fulfilled) {
        result = fulfilled
            ? oseo_promise_resolve_into(
                context,
                frame.slots[2],
                frame.slots[4]
            )
            : oseo_promise_reject_into(
                context,
                frame.slots[2],
                frame.slots[4]
            );
    } else {
        result = oseo_property_key(context, oseo_number((double)index));
        frame.slots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_set(
                context,
                frame.slots[3],
                frame.slots[0],
                frame.slots[4],
                true
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            aggregate = aggregate_object(frame.slots[1]);
            aggregate->remaining -= 1u;
            if (aggregate->remaining == 0u) {
                result = oseo_promise_resolve_into(
                    context,
                    frame.slots[2],
                    frame.slots[3]
                );
            }
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_combine(
    OseoContext *context,
    OseoValue iterable,
    bool race
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 12u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = iterable;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_array(frame.slots[0])) {
        result = language_failure(context);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            oseo_context_clear_language_error(context);
            result = oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
        oseo_roots_release(context, &frame);
        return result;
    }
    size_t initial_length = result.status == OSEO_STATUS_NORMAL
        ? ordinary_object(frame.slots[0])->array_length
        : 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = race
            ? normal(oseo_undefined())
            : oseo_array_create(context, 0u);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_aggregate_create(
            context,
            frame.slots[1],
            frame.slots[2],
            1u
        );
        frame.slots[3] = result.value;
    }
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    if (result.status == OSEO_STATUS_NORMAL && initial_length > 0u) {
        result = oseo_string_from_units(context, then_units, 4u);
        frame.slots[7] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < ordinary_object(frame.slots[0])->array_length;
         index += 1u) {
        if (!race) aggregate_object(frame.slots[3])->remaining += 1u;
        result = oseo_property_key(context, oseo_number((double)index));
        frame.slots[11] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[0],
                frame.slots[11]
            );
            frame.slots[4] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, frame.slots[4]);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = reaction_create(
                context,
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined()
            );
            frame.slots[6] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoPromiseReaction *reaction =
                reaction_object(frame.slots[6]);
            reaction->aggregate = frame.slots[3];
            reaction->index = index;
            reaction->kind = race
                ? OSEO_REACTION_RACE
                : OSEO_REACTION_ALL;
            result = promise_aggregate_environment_create(
                context,
                frame.slots[6]
            );
            frame.slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = promise_aggregate_function_create(
                context,
                frame.slots[8],
                OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID
            );
            frame.slots[9] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = promise_aggregate_function_create(
                context,
                frame.slots[8],
                OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID
            );
            frame.slots[10] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[5],
                frame.slots[7]
            );
            frame.slots[11] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_call_function(
                context,
                frame.slots[11],
                frame.slots[5],
                2u,
                &frame.slots[9],
                oseo_undefined()
            );
        }
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[4]
            );
            if (result.status == OSEO_STATUS_NORMAL) break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !race) {
        OseoPromiseAggregate *aggregate = aggregate_object(frame.slots[3]);
        aggregate->remaining -= 1u;
        if (aggregate->remaining == 0u) {
            result = oseo_promise_resolve_into(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_all(
    OseoContext *context,
    OseoValue iterable
) {
    return promise_combine(context, iterable, false);
}

OseoResult oseo_promise_race(
    OseoContext *context,
    OseoValue iterable
) {
    return promise_combine(context, iterable, true);
}

OseoResult oseo_internal_promise_invoke_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected
) {
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_fulfilled;
    frame.slots[2] = on_rejected;
    result = oseo_string_from_units(context, then_units, 4u);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[3]
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[4],
            frame.slots[0],
            2u,
            &frame.slots[1],
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_finally_function_create(
    OseoContext *context,
    OseoValue on_finally,
    size_t code_id
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = on_finally;
    result = oseo_environment_create(context, 1u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[1],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_finally_continuation_create(
    OseoContext *context,
    OseoValue preserved,
    bool fulfilled
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = preserved;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            oseo_boolean(fulfilled)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID,
            frame.slots[1],
            NULL,
            0u,
            0u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_finally_invoke(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_finally
) {
    if (!is_object(promise_value)) return language_failure(context);
    if (!is_function(on_finally)) {
        return oseo_internal_promise_invoke_then(
            context,
            promise_value,
            on_finally,
            on_finally
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_finally;
    result = promise_finally_function_create(
        context,
        frame.slots[1],
        OSEO_PROMISE_FINALLY_FULFILL_CODE_ID
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_finally_function_create(
            context,
            frame.slots[1],
            OSEO_PROMISE_FINALLY_REJECT_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_promise_invoke_then(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[3]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_construct(
    OseoContext *context,
    OseoValue executor
) {
    if (!is_function(executor)) return language_failure(context);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = executor;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_environment_create(context, frame.slots[1]);
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[4],
            OSEO_PROMISE_RESOLVE_CODE_ID
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[4],
            OSEO_PROMISE_REJECT_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[0],
            oseo_undefined(),
            2u,
            &frame.slots[2],
            oseo_undefined()
        );
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_call_function(
                context,
                frame.slots[3],
                oseo_undefined(),
                1u,
                &frame.slots[4],
                oseo_undefined()
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_then_with_capability(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected,
    OseoValue capability
) {
    if (!is_promise(promise_value)) return language_failure(context);
    if (tag_of(on_fulfilled) != OSEO_TAG_UNDEFINED &&
        !is_function(on_fulfilled)) {
        on_fulfilled = oseo_undefined();
    }
    if (tag_of(on_rejected) != OSEO_TAG_UNDEFINED &&
        !is_function(on_rejected)) {
        on_rejected = oseo_undefined();
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_fulfilled;
    frame.slots[2] = on_rejected;
    frame.slots[3] = capability;
    if (tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED) {
        result = promise_create(context);
        frame.slots[3] = result.value;
    } else if (!is_promise(frame.slots[3])) {
        result = failure(
            context,
            "OSEO2001",
            "Invalid promise reaction capability."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = reaction_create(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3]
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_attach_reaction(
            context,
            frame.slots[0],
            frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[3];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected
) {
    return promise_then_with_capability(
        context,
        promise_value,
        on_fulfilled,
        on_rejected,
        oseo_undefined()
    );
}

OseoResult oseo_promise_await_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled
) {
    OseoValue capability = context->async_call_capability;
    context->async_call_capability = oseo_undefined();
    return promise_then_with_capability(
        context,
        promise_value,
        on_fulfilled,
        oseo_undefined(),
        capability
    );
}

OseoResult oseo_promise_async_call(
    OseoContext *context,
    OseoValue execution
) {
    if (!is_function(execution)) return language_failure(context);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = execution;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[3] = context->async_call_capability;
        context->async_call_capability = frame.slots[1];
        result = oseo_call_function(
            context,
            frame.slots[0],
            oseo_undefined(),
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[2] = result.value;
        context->async_call_capability = frame.slots[3];
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        frame.slots[2] == frame.slots[1]) {
        result.value = frame.slots[1];
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[1],
            frame.slots[2]
        );
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    } else if (result.status == OSEO_STATUS_THROW &&
               !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(
            context,
            frame.slots[1],
            frame.slots[2]
        );
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_finally(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_finally
) {
    return oseo_internal_promise_finally_invoke(
        context, promise_value, on_finally);
}

OseoPromiseState oseo_promise_state(OseoValue promise) {
    return is_promise(promise)
        ? promise_object(promise)->state
        : OSEO_PROMISE_INVALID;
}

OseoResult oseo_promise_result(
    OseoContext *context,
    OseoValue promise
) {
    if (!is_promise(promise) ||
        promise_object(promise)->state == OSEO_PROMISE_PENDING) {
        return language_failure(context);
    }
    return normal(promise_object(promise)->result);
}

static OseoResult run_reaction_job(
    OseoContext *context,
    OseoValue job_value
) {
    OseoPromiseReaction *selected = reaction_object(
        job_object(job_value)->primary
    );
    if (selected->kind == OSEO_REACTION_ALL ||
        selected->kind == OSEO_REACTION_RACE) {
        OseoJob *job = job_object(job_value);
        return oseo_internal_promise_aggregate_settle(
            context,
            job->primary,
            job->argument,
            job->fulfilled
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoJob *job = job_object(job_value);
    OseoPromiseReaction *reaction = reaction_object(job->primary);
    frame.slots[0] = job->fulfilled
        ? reaction->on_fulfilled
        : reaction->on_rejected;
    frame.slots[1] = reaction->capability;
    frame.slots[2] = job->argument;
    bool fulfilled = job->fulfilled;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    if (!fulfilled && is_promise(job->secondary)) {
        OseoPromise *source = promise_object(job->secondary);
        context->source_id = source->rejection_source_id;
        context->source_id_length = source->rejection_source_id_length;
        context->line = source->rejection_line;
        context->column = source->rejection_column;
    }
    if (tag_of(frame.slots[0]) == OSEO_TAG_UNDEFINED) {
        result = fulfilled
            ? oseo_promise_resolve_into(
                context,
                frame.slots[1],
                frame.slots[2]
            )
            : oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        if (!context->has_diagnostic) {
            context->source_id = source_id;
            context->source_id_length = source_id_length;
            context->line = line;
            context->column = column;
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_call_function(
        context,
        frame.slots[0],
        oseo_undefined(),
        1u,
        &frame.slots[2],
        oseo_undefined()
    );
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(
            context,
            frame.slots[1],
            frame.slots[3]
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[1],
            frame.slots[3]
        );
    }
    if (!context->has_diagnostic) {
        context->source_id = source_id;
        context->source_id_length = source_id_length;
        context->line = line;
        context->column = column;
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult run_thenable_job(
    OseoContext *context,
    OseoValue job_value
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoJob *job = job_object(job_value);
    frame.slots[0] = job->primary;
    frame.slots[1] = job->secondary;
    frame.slots[2] = job->argument;
    result = resolving_environment_create(context, frame.slots[0]);
    frame.slots[5] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[5],
            OSEO_PROMISE_RESOLVE_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[5],
            OSEO_PROMISE_REJECT_CODE_ID
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[1],
            frame.slots[2],
            2u,
            &frame.slots[3],
            oseo_undefined()
        );
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[5] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_call_function(
                context,
                frame.slots[4],
                oseo_undefined(),
                1u,
                &frame.slots[5],
                oseo_undefined()
            );
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static bool jobs_reached_promise(OseoValue promise) {
    return is_promise(promise) &&
        promise_object(promise)->state != OSEO_PROMISE_PENDING;
}

static OseoResult jobs_run_next(OseoContext *context) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (tag_of(context->microtask_head) != OSEO_TAG_UNDEFINED) {
        frame.slots[0] = context->microtask_head;
        OseoValue next = job_object(frame.slots[0])->next;
        context->microtask_head = next;
        if (tag_of(next) == OSEO_TAG_UNDEFINED) {
            context->microtask_tail = oseo_undefined();
        }
        result = job_object(frame.slots[0])->kind == OSEO_JOB_REACTION
            ? run_reaction_job(context, frame.slots[0])
            : run_thenable_job(context, frame.slots[0]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult jobs_drain_until(
    OseoContext *context,
    OseoValue promise
) {
    OseoResult result = normal(oseo_undefined());
    while (tag_of(context->microtask_head) != OSEO_TAG_UNDEFINED &&
           !jobs_reached_promise(promise)) {
        result = jobs_run_next(context);
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    return result;
}

OseoResult oseo_jobs_drain(OseoContext *context) {
    return jobs_drain_until(context, oseo_undefined());
}

OseoResult oseo_rejection_checkpoint(OseoContext *context) {
    OseoValue current = context->pending_rejections;
    OseoValue first = oseo_undefined();
    const char *first_source_id = context->source_id;
    size_t first_source_id_length = context->source_id_length;
    size_t first_line = context->line;
    size_t first_column = context->column;
    bool found = false;
    context->pending_rejections = oseo_undefined();
    context->pending_rejection_tail = oseo_undefined();
    while (tag_of(current) != OSEO_TAG_UNDEFINED) {
        OseoPromise *promise = promise_object(current);
        OseoValue next = promise->unhandled_next;
        promise->unhandled_next = oseo_undefined();
        if (promise->pending_report && !promise->handled &&
            promise->state == OSEO_PROMISE_REJECTED) {
            promise->pending_report = false;
            promise->reported = true;
            context->unhandled_rejection_count += 1u;
            if (!found) {
                first = promise->result;
                first_source_id = promise->rejection_source_id;
                first_source_id_length =
                    promise->rejection_source_id_length;
                first_line = promise->rejection_line;
                first_column = promise->rejection_column;
                found = true;
            }
        }
        current = next;
    }
    if (!found) {
        return normal(oseo_undefined());
    }
    context->error_code = "OSEO2001";
    context->error_message = "Unhandled promise rejection.";
    context->has_diagnostic = false;
    context->source_id = first_source_id;
    context->source_id_length = first_source_id_length;
    context->line = first_line;
    context->column = first_column;
    return (OseoResult){OSEO_STATUS_THROW, first};
}

static uint64_t timer_delay(OseoValue value) {
    double delay = number_value(value);
    if (!isfinite(delay) || delay <= 0.0) return 0u;
    if (delay >= (double)UINT32_MAX) return UINT32_MAX;
    return (uint64_t)delay;
}

static bool timer_conversion_property_exists(
    OseoValue object_value,
    OseoValue key
) {
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoValue property_value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false};
        if (oseo_internal_own_descriptor(
                current,
                key,
                &property_value,
                &attributes
            )) {
            return true;
        }
        current = ordinary_object(current)->prototype;
    }
    return false;
}

typedef struct TimerArrayAncestor {
    OseoValue value;
    const struct TimerArrayAncestor *previous;
} TimerArrayAncestor;


static bool timer_has_default_array_string(OseoValue value) {
    OseoValue current = value;
    while (is_object(current)) {
        OseoOrdinaryObject *object = ordinary_object(current);
        if (is_array(current) && object->default_intrinsics) return true;
        current = object->prototype;
    }
    return false;
}

static bool timer_has_default_object_conversion(OseoValue value) {
    OseoValue current = value;
    while (is_object(current)) {
        if (ordinary_object(current)->default_intrinsics) return true;
        current = ordinary_object(current)->prototype;
    }
    return false;
}

static OseoResult timer_array_string(
    OseoContext *context,
    OseoValue array_value,
    const TimerArrayAncestor *previous
);

static OseoResult timer_delay_number(
    OseoContext *context,
    OseoValue value
);

static OseoResult timer_default_array_string(
    OseoContext *context,
    OseoValue array_value,
    const TimerArrayAncestor *previous
);

static OseoResult timer_string_hint_primitive(
    OseoContext *context,
    OseoValue value,
    const TimerArrayAncestor *previous
) {
    static const uint16_t to_string_units[] = {
        't', 'o', 'S', 't', 'r', 'i', 'n', 'g'
    };
    static const uint16_t value_of_units[] = {
        'v', 'a', 'l', 'u', 'e', 'O', 'f'
    };
    static const uint16_t default_units[] = {
        '[', 'o', 'b', 'j', 'e', 'c', 't', ' ',
        'O', 'b', 'j', 'e', 'c', 't', ']'
    };
    const uint16_t *names[] = {to_string_units, value_of_units};
    const size_t lengths[] = {8u, 7u};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    bool converted = false;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = oseo_string_from_units(
            context,
            names[index],
            lengths[index]
        );
        frame.slots[1] = result.value;
        bool property_exists = result.status == OSEO_STATUS_NORMAL &&
            timer_conversion_property_exists(
                frame.slots[0],
                frame.slots[1]
            );
        if (result.status == OSEO_STATUS_NORMAL && !property_exists) {
            if (index == 0u) {
                if (timer_has_default_array_string(frame.slots[0])) {
                    result = timer_default_array_string(
                        context,
                        frame.slots[0],
                        previous
                    );
                } else if (timer_has_default_object_conversion(
                               frame.slots[0]
                           )) {
                    result = oseo_string_from_units(
                        context,
                        default_units,
                        15u
                    );
                } else {
                    continue;
                }
                if (result.status == OSEO_STATUS_NORMAL &&
                    is_object(result.value)) {
                    continue;
                }
                converted = result.status == OSEO_STATUS_NORMAL;
                break;
            }
            continue;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[0],
                frame.slots[1]
            );
            frame.slots[2] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL ||
            !is_function(frame.slots[2])) {
            continue;
        }
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            !is_object(frame.slots[3])) {
            result.value = frame.slots[3];
            converted = true;
            break;
        }
        if (result.status == OSEO_STATUS_NORMAL && index == 1u) {
            result = language_failure(context);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !converted) {
        result = language_failure(context);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static bool timer_array_is_ancestor(
    OseoValue value,
    const TimerArrayAncestor *ancestor
) {
    for (const TimerArrayAncestor *current = ancestor;
         current != NULL;
         current = current->previous) {
        if (current->value == value) return true;
    }
    return false;
}

static OseoResult timer_array_string(
    OseoContext *context,
    OseoValue array_value,
    const TimerArrayAncestor *previous
) {
    if (timer_array_is_ancestor(array_value, previous)) {
        return oseo_string_from_units(context, NULL, 0u);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = array_value;
    TimerArrayAncestor current = {frame.slots[0], previous};
    uint16_t *units = NULL;
    size_t length = 0u;
    static const uint16_t length_units[] = {
        'l', 'e', 'n', 'g', 't', 'h'
    };
    result = oseo_string_from_units(context, length_units, 6u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = timer_delay_number(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    uint32_t array_length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        double numeric_length = number_value(frame.slots[2]);
        if (isfinite(numeric_length) && numeric_length > 0.0) {
            array_length = numeric_length >= (double)UINT32_MAX
                ? UINT32_MAX
                : (uint32_t)floor(numeric_length);
        }
    }
    for (uint32_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < array_length;
        index += 1u) {
        if (index > 0u) {
            if (length == SIZE_MAX / sizeof(uint16_t)) {
                result = failure(
                    context,
                    "OSEO2001",
                    "String allocation is too large."
                );
                break;
            }
            uint16_t *grown = realloc(
                units,
                (length + 1u) * sizeof(uint16_t)
            );
            if (grown == NULL) {
                result = failure(
                    context,
                    "OSEO2001",
                    "String allocation failed."
                );
                break;
            }
            units = grown;
            units[length] = ',';
            length += 1u;
        }
        result = oseo_property_key(context, oseo_number((double)index));
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[0],
                frame.slots[1]
            );
            frame.slots[2] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (is_nullish(frame.slots[2])) {
            continue;
        }
        if (is_object(frame.slots[2])) {
            result = timer_string_hint_primitive(
                context,
                frame.slots[2],
                &current
            );
            frame.slots[3] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_value_string(context, frame.slots[3]);
            }
        } else {
            result = oseo_internal_value_string(context, frame.slots[2]);
        }
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        OseoString *element = string_object(frame.slots[3]);
        if (element->length > SIZE_MAX - length ||
            length + element->length >
                SIZE_MAX / sizeof(uint16_t)) {
            result = failure(
                context,
                "OSEO2001",
                "String allocation is too large."
            );
            break;
        }
        size_t next_length = length + element->length;
        uint16_t *grown = realloc(
            units,
            next_length * sizeof(uint16_t)
        );
        if (grown == NULL && next_length > 0u) {
            result = failure(
                context,
                "OSEO2001",
                "String allocation failed."
            );
            break;
        }
        units = grown;
        if (element->length > 0u) {
            memcpy(
                units + length,
                element->units,
                element->length * sizeof(uint16_t)
            );
        }
        length = next_length;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, units, length);
    }
    free(units);
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult timer_default_array_string(
    OseoContext *context,
    OseoValue array_value,
    const TimerArrayAncestor *previous
) {
    static const uint16_t join_units[] = {'j', 'o', 'i', 'n'};
    static const uint16_t array_units[] = {
        '[', 'o', 'b', 'j', 'e', 'c', 't', ' ',
        'A', 'r', 'r', 'a', 'y', ']'
    };
    static const uint16_t object_units[] = {
        '[', 'o', 'b', 'j', 'e', 'c', 't', ' ',
        'O', 'b', 'j', 'e', 'c', 't', ']'
    };
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = array_value;
    result = oseo_string_from_units(context, join_units, 4u);
    frame.slots[1] = result.value;
    bool property_exists = result.status == OSEO_STATUS_NORMAL &&
        timer_conversion_property_exists(
            frame.slots[0],
            frame.slots[1]
        );
    if (result.status == OSEO_STATUS_NORMAL && property_exists) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            is_function(frame.slots[2])) {
            result = oseo_call_function(
                context,
                frame.slots[2],
                frame.slots[0],
                0u,
                NULL,
                oseo_undefined()
            );
            frame.slots[2] = result.value;
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_string_from_units(
                context,
                is_array(frame.slots[0]) ? array_units : object_units,
                is_array(frame.slots[0]) ? 14u : 15u
            );
            frame.slots[2] = result.value;
        }
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = timer_array_string(
            context,
            frame.slots[0],
            previous
        );
        frame.slots[2] = result.value;
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult timer_delay_number(
    OseoContext *context,
    OseoValue value
) {
    if (!is_object(value)) return oseo_internal_to_number(context, value);
    static const uint16_t value_of_units[] = {
        'v', 'a', 'l', 'u', 'e', 'O', 'f'
    };
    static const uint16_t to_string_units[] = {
        't', 'o', 'S', 't', 'r', 'i', 'n', 'g'
    };
    const uint16_t *names[] = {value_of_units, to_string_units};
    const size_t lengths[] = {7u, 8u};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = oseo_string_from_units(
            context,
            names[index],
            lengths[index]
        );
        frame.slots[1] = result.value;
        bool property_exists = result.status == OSEO_STATUS_NORMAL &&
            timer_conversion_property_exists(
                frame.slots[0],
                frame.slots[1]
            );
        if (result.status == OSEO_STATUS_NORMAL && !property_exists) {
            if (index == 1u) {
                if (timer_has_default_array_string(frame.slots[0])) {
                    result = timer_default_array_string(
                        context,
                        frame.slots[0],
                        NULL
                    );
                    frame.slots[3] = result.value;
                    if (result.status == OSEO_STATUS_NORMAL) {
                        result = is_object(frame.slots[3])
                            ? language_failure(context)
                            : oseo_internal_to_number(context, frame.slots[3]);
                    }
                } else if (timer_has_default_object_conversion(
                               frame.slots[0]
                           )) {
                    result = normal(oseo_number(NAN));
                } else {
                    result = language_failure(context);
                }
                oseo_roots_release(context, &frame);
                return result;
            }
            continue;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[0],
                frame.slots[1]
            );
            frame.slots[2] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL ||
            !is_function(frame.slots[2])) {
            continue;
        }
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            !is_object(frame.slots[3])) {
            result = oseo_internal_to_number(context, frame.slots[3]);
            oseo_roots_release(context, &frame);
            return result;
        }
        if (result.status == OSEO_STATUS_NORMAL && index == 1u) {
            result = language_failure(context);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = language_failure(context);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_set_timeout(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count == 0u || !is_function(arguments[0])) {
        return language_failure(context);
    }
    OseoValue delay_value = argument_count > 1u
        ? arguments[1]
        : oseo_number(0.0);
    OseoResult result = timer_delay_number(context, delay_value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint64_t delay = timer_delay(result.value);
    size_t callback_argument_count = argument_count > 2u
        ? argument_count - 2u
        : 0u;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = arguments[0];
    result = oseo_environment_create(context, callback_argument_count);
    frame.slots[1] = result.value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < callback_argument_count;
         index += 1u) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            index,
            arguments[index + 2u]
        );
    }
    OseoTimer *timer = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        timer = oseo_internal_allocate_heap_bytes(context, sizeof(*timer));
        if (timer == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Timer allocation failed."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && timer != NULL) {
        timer->next = oseo_undefined();
        timer->callback = frame.slots[0];
        timer->arguments = frame.slots[1];
        timer->deadline = UINT64_MAX - context->clock_milliseconds < delay
            ? UINT64_MAX
            : context->clock_milliseconds + delay;
        timer->id = context->next_timer_id;
        context->next_timer_id += 1u;
        timer->order = context->next_timer_order;
        context->next_timer_order += 1u;
        timer->argument_count = callback_argument_count;
        timer->canceled = false;
        result = oseo_internal_publish_heap(
            context, &timer->header, OSEO_HEAP_TIMER);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue *link = &context->timer_head;
        while (tag_of(*link) != OSEO_TAG_UNDEFINED) {
            OseoTimer *current = timer_object(*link);
            if (current->deadline > timer->deadline ||
                (current->deadline == timer->deadline &&
                 current->order > timer->order)) {
                break;
            }
            link = &current->next;
        }
        timer->next = *link;
        *link = frame.slots[2];
        result.value = oseo_number((double)timer->id);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_clear_timeout(
    OseoContext *context,
    OseoValue handle
) {
    if (!is_number(handle)) return normal(oseo_undefined());
    double requested = number_value(handle);
    OseoValue current = context->timer_head;
    while (tag_of(current) != OSEO_TAG_UNDEFINED) {
        OseoTimer *timer = timer_object(current);
        if ((double)timer->id == requested) {
            timer->canceled = true;
            break;
        }
        current = timer->next;
    }
    return normal(oseo_undefined());
}

static OseoResult run_timer_turn(
    OseoContext *context,
    OseoValue awaited_promise
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    while (tag_of(context->timer_head) != OSEO_TAG_UNDEFINED) {
        frame.slots[0] = context->timer_head;
        OseoTimer *timer = timer_object(frame.slots[0]);
        context->timer_head = timer->next;
        timer->next = oseo_undefined();
        if (timer->canceled) {
            frame.slots[0] = oseo_undefined();
            continue;
        }
        context->clock_milliseconds = timer->deadline;
        frame.slots[1] = timer->arguments;
        result = oseo_call_function(
            context,
            timer->callback,
            oseo_undefined(),
            timer->argument_count,
            environment_object(frame.slots[1])->slots,
            oseo_undefined()
        );
        OseoResult callback_result = result;
        const char *callback_error_code = context->error_code;
        const char *callback_error_message = context->error_message;
        const char *callback_source_id = context->source_id;
        size_t callback_source_id_length = context->source_id_length;
        size_t callback_line = context->line;
        size_t callback_column = context->column;
        bool callback_threw = result.status == OSEO_STATUS_THROW &&
            !context->has_diagnostic;
        if (callback_threw) {
            frame.slots[2] = result.value;
            result = jobs_drain_until(context, awaited_promise);
            if (result.status == OSEO_STATUS_NORMAL &&
                !jobs_reached_promise(awaited_promise)) {
                result = oseo_rejection_checkpoint(context);
            }
            if (result.status == OSEO_STATUS_NORMAL ||
                !context->has_diagnostic) {
                context->error_code = callback_error_code;
                context->error_message = callback_error_message;
                context->has_diagnostic = false;
                context->source_id = callback_source_id;
                context->source_id_length = callback_source_id_length;
                context->line = callback_line;
                context->column = callback_column;
                callback_result.value = frame.slots[2];
                result = callback_result;
            }
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = jobs_drain_until(context, awaited_promise);
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            !jobs_reached_promise(awaited_promise)) {
            result = oseo_rejection_checkpoint(context);
        }
        frame.slots[0] = oseo_undefined();
        frame.slots[1] = oseo_undefined();
        frame.slots[2] = oseo_undefined();
        break;
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_await_value(OseoContext *context, OseoValue value) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = oseo_promise_resolve(context, frame.slots[0]);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_then(
            context,
            frame.slots[0],
            oseo_undefined(),
            oseo_undefined()
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPromise *awaited = promise_object(frame.slots[1]);
        awaited->handled = true;
        awaited->pending_report = false;
        result = jobs_drain_until(context, frame.slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        promise_object(frame.slots[1])->state == OSEO_PROMISE_PENDING) {
        result = oseo_rejection_checkpoint(context);
    }
    while (result.status == OSEO_STATUS_NORMAL &&
           promise_object(frame.slots[1])->state == OSEO_PROMISE_PENDING) {
        if (tag_of(context->timer_head) == OSEO_TAG_UNDEFINED) {
            result = failure(
                context,
                "OSEO3001",
                "Top-level await cannot make progress."
            );
            break;
        }
        result = run_timer_turn(context, frame.slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPromise *awaited = promise_object(frame.slots[1]);
        result.value = awaited->result;
        if (awaited->state == OSEO_PROMISE_REJECTED) {
            context->source_id = awaited->rejection_source_id;
            context->source_id_length =
                awaited->rejection_source_id_length;
            context->line = awaited->rejection_line;
            context->column = awaited->rejection_column;
            result.status = OSEO_STATUS_THROW;
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_entry_task_checkpoint(
    OseoContext *context,
    OseoResult completion
) {
    if (completion.status != OSEO_STATUS_THROW ||
        context->has_diagnostic) {
        return completion;
    }
    const char *error_code = context->error_code;
    const char *error_message = context->error_message;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = completion.value;
    result = oseo_jobs_drain(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_rejection_checkpoint(context);
    }
    if (result.status == OSEO_STATUS_NORMAL || !context->has_diagnostic) {
        context->error_code = error_code;
        context->error_message = error_message;
        context->has_diagnostic = false;
        context->source_id = source_id;
        context->source_id_length = source_id_length;
        context->line = line;
        context->column = column;
        completion.value = frame.slots[0];
        result = completion;
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_event_loop_run(OseoContext *context) {
    OseoResult result = oseo_jobs_drain(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_rejection_checkpoint(context);
    }
    while (result.status == OSEO_STATUS_NORMAL &&
           tag_of(context->timer_head) != OSEO_TAG_UNDEFINED) {
        result = run_timer_turn(context, oseo_undefined());
    }
    return result;
}
