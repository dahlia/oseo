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
    OseoResult result = oseo_internal_to_number(context, delay_value);
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
