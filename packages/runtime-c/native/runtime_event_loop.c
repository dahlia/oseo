#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Timer conversion, timer queues, task checkpoints, top-level
 * await progress, and shutdown.
 *
 * Deadlines are whole milliseconds in the realm's monotonic domain. A
 * task computes every deadline from the scheduler time cached when it
 * started, and a timer turn waits through the clock adapter until the
 * earliest live deadline has elapsed before it caches the new time. The
 * deterministic test adapter's wait advances straight to the deadline,
 * which reproduces the logical clock of ADR 0012 exactly; a platform
 * adapter's wait blocks for the elapsed time instead. Neither changes
 * the order of timers with known deadlines or the microtask checkpoint
 * after each task.
 */

static uint64_t timer_delay(OseoValue value) {
    double delay = number_value(value);
    if (!isfinite(delay) || delay <= 0.0) return 0u;
    if (delay >= (double)UINT32_MAX) return UINT32_MAX;
    return (uint64_t)delay;
}

/* Links one published timer into the deadline-ordered queue. */
static void timer_link(OseoContext *context, OseoValue timer_value) {
    OseoTimer *timer = timer_object(timer_value);
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
    *link = timer_value;
}

OseoResult oseo_set_timeout(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count == 0u || !is_callable(arguments[0])) {
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
    result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
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
        timer->waiter = oseo_undefined();
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
        timer_link(context, frame.slots[2]);
        result.value = oseo_number((double)timer->id);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Enqueues the EnqueueAtomicsWaitAsyncTimeoutJob of one waiter at an
 * absolute monotonic deadline, with the same FIFO tie order as
 * `setTimeout`, so a waiter timeout and a timer due at the same time run
 * in the order they were enqueued. The job is a host timeout job like any
 * other and keeps the event loop running until it is due or canceled.
 */
OseoResult oseo_internal_atomics_timeout_enqueue(
    OseoContext *context,
    OseoValue waiter,
    uint64_t deadline
) {
    OseoValue slots[2] = {waiter, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoTimer *timer = oseo_internal_allocate_heap_bytes(
        context,
        sizeof(*timer)
    );
    if (timer == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Timer allocation failed.");
    }
    timer->next = oseo_undefined();
    timer->callback = oseo_undefined();
    timer->arguments = oseo_undefined();
    timer->waiter = frame.slots[0];
    timer->deadline = deadline;
    timer->id = 0u;
    timer->order = context->next_timer_order;
    context->next_timer_order += 1u;
    timer->argument_count = 0u;
    timer->canceled = false;
    OseoResult result = oseo_internal_publish_heap(
        context,
        &timer->header,
        OSEO_HEAP_TIMER
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        timer_link(context, frame.slots[1]);
    }
    oseo_roots_pop(context, &frame);
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
        if (timer->id != 0u && (double)timer->id == requested) {
            timer->canceled = true;
            break;
        }
        current = timer->next;
    }
    return normal(oseo_undefined());
}

/*
 * Waits until the earliest live timer is due and caches that monotonic
 * observation as the scheduler time of the turn that runs it. Canceled
 * timers at the head are unlinked first, so a canceled deadline never
 * extends a wait and a queue of canceled timers alone ends without one.
 * An early wakeup only rereads the clock. The wait is not a safepoint:
 * no allocation happens between reading the head and running it.
 */
static OseoResult wait_for_due_timer(OseoContext *context) {
    while (tag_of(context->timer_head) != OSEO_TAG_UNDEFINED) {
        OseoTimer *timer = timer_object(context->timer_head);
        if (timer->canceled) {
            context->timer_head = timer->next;
            timer->next = oseo_undefined();
            continue;
        }
        uint64_t now = 0u;
        OseoResult result = oseo_internal_clock_now(context, &now);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        if (timer->deadline <= now) {
            context->clock_milliseconds = now;
            break;
        }
        result = oseo_internal_clock_wait_until(context, timer->deadline);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    return normal(oseo_undefined());
}

static OseoResult run_timer_turn(
    OseoContext *context,
    OseoValue awaited_promise
) {
    OseoResult result = wait_for_due_timer(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 3u);
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
        if (tag_of(timer->waiter) != OSEO_TAG_UNDEFINED) {
            /* A waiter timeout job runs no user code itself, so it can
             * only fail with a host diagnostic; its promise reactions
             * run in the checkpoint below like a callback's. */
            result = oseo_internal_atomics_waiter_timeout(
                context,
                timer->waiter
            );
        } else {
            frame.slots[1] = timer->arguments;
            result = oseo_call_function(
                context,
                timer->callback,
                oseo_undefined(),
                timer->argument_count,
                environment_object(frame.slots[1])->slots,
                oseo_undefined()
            );
        }
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

/*
 * An internal compatibility checkpoint for iterator adapter operations that
 * do not yet own a traced frame. Module top-level await and `for await` never
 * use this path. A body that can make no further progress reports a host
 * diagnostic naming the stalled operation.
 */
static OseoResult await_settled_value(
    OseoContext *context,
    OseoValue value,
    const char *stall_message
) {
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
            result = failure(context, "OSEO3001", stall_message);
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

OseoResult oseo_internal_await_step(OseoContext *context, OseoValue value) {
    return await_settled_value(
        context,
        value,
        "An asynchronous iteration step cannot make progress."
    );
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

static OseoResult entry_promise_completion(
    OseoContext *context,
    OseoValue entry_promise
) {
    if (!is_promise(entry_promise)) return normal(oseo_undefined());
    OseoPromise *promise = promise_object(entry_promise);
    if (promise->state == OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    if (promise->state == OSEO_PROMISE_FULFILLED) {
        return normal(promise->result);
    }
    context->source_id = promise->rejection_source_id;
    context->source_id_length = promise->rejection_source_id_length;
    context->line = promise->rejection_line;
    context->column = promise->rejection_column;
    return (OseoResult){OSEO_STATUS_THROW, promise->result};
}

OseoResult oseo_event_loop_run(
    OseoContext *context,
    OseoValue entry_promise
) {
    OseoValue slots[1] = {entry_promise};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    if (is_promise(frame.slots[0])) {
        OseoPromise *promise = promise_object(frame.slots[0]);
        promise->handled = true;
        promise->pending_report = false;
    }
    OseoResult result = oseo_jobs_drain(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_rejection_checkpoint(context);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = entry_promise_completion(context, frame.slots[0]);
    }
    while (result.status == OSEO_STATUS_NORMAL &&
           tag_of(context->timer_head) != OSEO_TAG_UNDEFINED) {
        result = run_timer_turn(context, oseo_undefined());
        if (result.status == OSEO_STATUS_NORMAL) {
            result = entry_promise_completion(context, frame.slots[0]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_promise(frame.slots[0]) &&
        promise_object(frame.slots[0])->state == OSEO_PROMISE_PENDING) {
        result = failure(
            context,
            "OSEO3001",
            "Top-level await cannot make progress."
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}
