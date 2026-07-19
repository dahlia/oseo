#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Timer conversion, timer queues, task checkpoints, top-level
 * await progress, and shutdown.
 */

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
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Cannot convert an object to a primitive value."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !converted) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot convert an object to a primitive value."
        );
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
                            ? oseo_internal_throw_error(
                                context,
                                OSEO_ERROR_TYPE,
                                "Cannot convert an object to a primitive value."
                            )
                            : oseo_internal_to_number(context, frame.slots[3]);
                    }
                } else if (timer_has_default_object_conversion(
                               frame.slots[0]
                           )) {
                    result = normal(oseo_number(NAN));
                } else {
                    result = oseo_internal_throw_error(
                        context,
                        OSEO_ERROR_TYPE,
                        "Cannot convert an object to a primitive value."
                    );
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
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Cannot convert an object to a primitive value."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot convert an object to a primitive value."
        );
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
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The timer callback is not a function."
        );
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
            result = oseo_internal_jobs_drain_until(context, awaited_promise);
            if (result.status == OSEO_STATUS_NORMAL &&
                !oseo_internal_jobs_reached_promise(awaited_promise)) {
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
            result = oseo_internal_jobs_drain_until(context, awaited_promise);
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            !oseo_internal_jobs_reached_promise(awaited_promise)) {
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
        result = oseo_internal_jobs_drain_until(context, frame.slots[1]);
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
