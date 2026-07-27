#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Promises, capabilities, reactions, thenable jobs, combinators,
 * and rejection tracking.
 */

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
    promise->ordinary.error_data = false;
    promise->ordinary.array_iterator = false;
    promise->ordinary.iterator_array = oseo_undefined();
    promise->ordinary.iterator_index = 0u;
    promise->ordinary.default_intrinsics = true;
    promise->ordinary.generator_prototype = false;
    promise->ordinary.generator = NULL;
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
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
    if (!is_promise(promise_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The settled value is not a promise."
        );
    }
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
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The settled value is not a promise."
    );
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
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The settled value is not a promise."
    );
    if (promise_object(promise_value)->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    if (promise_value == value) {
        OseoResult error = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
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
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
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
    OseoResult result = oseo_roots_allocate(context, &frame, 14u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = iterable;
    result = promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue captured_next = oseo_undefined();
        result = oseo_iterator_get(
            context,
            frame.slots[0],
            &captured_next
        );
        frame.slots[12] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            frame.slots[13] = captured_next;
        }
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[2] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[2]
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result.value = frame.slots[1];
            }
            oseo_roots_release(context, &frame);
            return result;
        }
    }
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, then_units, 4u);
        frame.slots[7] = result.value;
    }
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoValue element = oseo_undefined();
        bool done = false;
        result = oseo_iterator_next(
            context,
            frame.slots[12],
            frame.slots[13],
            &element,
            &done
        );
        /*
         * A throw from IteratorStep leaves the iterator record done, so
         * the specification rejects without calling IteratorClose.
         */
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[4]
            );
            break;
        }
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        frame.slots[4] = element;
        if (!race) aggregate_object(frame.slots[3])->remaining += 1u;
        {
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
            /*
             * A throw after a successful step, such as calling a
             * yielded promise's own throwing then, closes the iterator
             * before rejecting. A non-catchable diagnostic from the
             * return method propagates.
             */
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            OseoResult closed = oseo_iterator_close(
                context,
                frame.slots[12],
                true
            );
            if (closed.status != OSEO_STATUS_NORMAL) {
                result = closed;
                break;
            }
            result = oseo_promise_reject_into(
                context,
                frame.slots[1],
                frame.slots[4]
            );
            if (result.status == OSEO_STATUS_NORMAL) break;
        }
        index += 1u;
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
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
    if (!is_object(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Promise.prototype.finally requires an object."
    );
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
    if (!is_function(executor)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The promise executor is not a function."
    );
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
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The receiver is not a promise."
    );
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
    if (!is_function(execution)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The asynchronous execution is not a function."
    );
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
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The promise has no settled result."
        );
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

bool oseo_internal_jobs_reached_promise(OseoValue promise) {
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

OseoResult oseo_internal_jobs_drain_until(
    OseoContext *context,
    OseoValue promise
) {
    OseoResult result = normal(oseo_undefined());
    while (tag_of(context->microtask_head) != OSEO_TAG_UNDEFINED &&
           !oseo_internal_jobs_reached_promise(promise)) {
        result = jobs_run_next(context);
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    return result;
}

OseoResult oseo_jobs_drain(OseoContext *context) {
    return oseo_internal_jobs_drain_until(context, oseo_undefined());
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
