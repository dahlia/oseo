#include "runtime_internal.h"

/*
 * Asynchronous generator objects: the AsyncGeneratorRequest queue, the
 * driver that runs one request at a time, and the two reactions that
 * resume a body parked on an awaited operand.
 *
 * An asynchronous generator reuses the synchronous generator record for
 * its suspended frame. The difference is who owns a step: a synchronous
 * consumer calls `next` and receives the step it produced, while an
 * asynchronous one receives a promise and the driver reports the step
 * into it whenever the body reaches one. A body that awaits leaves the
 * same frame with OSEO_GENERATOR_SUSPEND_AWAIT, so the driver returns to
 * its caller and a promise reaction resumes the body later.
 */

static OseoGenerator *generator_state(OseoValue value) {
    return ordinary_object(value)->generator;
}

/*
 * One of the two reactions an await installs. Unlike the virtualized
 * prototype methods below, a reaction is created fresh per suspension,
 * because each carries the generator it resumes in its environment.
 */
static OseoResult await_reaction_create(
    OseoContext *context,
    OseoValue environment,
    size_t code_id
) {
    return oseo_function_create(
        context,
        code_id,
        environment,
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_INTERNAL,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
}

/*
 * The virtualized %AsyncGeneratorPrototype% methods, cached on the
 * context so each stays permanently rooted the way the synchronous
 * iterator methods are. `next`, `return`, and `throw` each declare one
 * parameter, and `Symbol.asyncIterator` declares none.
 */
OseoResult oseo_internal_async_generator_method(
    OseoContext *context,
    size_t code_id
) {
    OseoValue *cache;
    static const uint16_t next_units[] = {'n', 'e', 'x', 't'};
    static const uint16_t return_units[] = {
        'r', 'e', 't', 'u', 'r', 'n'
    };
    static const uint16_t throw_units[] = {'t', 'h', 'r', 'o', 'w'};
    static const uint16_t symbol_units[] = {
        '[', 'S', 'y', 'm', 'b', 'o', 'l', '.', 'a', 's', 'y', 'n', 'c',
        'I', 't', 'e', 'r', 'a', 't', 'o', 'r', ']'
    };
    const uint16_t *name;
    size_t name_length;
    size_t parameter_count = 1u;
    if (code_id == OSEO_ASYNC_GENERATOR_NEXT_CODE_ID) {
        cache = &context->async_generator_next_function;
        name = next_units;
        name_length = sizeof(next_units) / sizeof(*next_units);
    } else if (code_id == OSEO_ASYNC_GENERATOR_RETURN_CODE_ID) {
        cache = &context->async_generator_return_function;
        name = return_units;
        name_length = sizeof(return_units) / sizeof(*return_units);
    } else if (code_id == OSEO_ASYNC_GENERATOR_THROW_CODE_ID) {
        cache = &context->async_generator_throw_function;
        name = throw_units;
        name_length = sizeof(throw_units) / sizeof(*throw_units);
    } else {
        cache = &context->async_iterator_self_function;
        name = symbol_units;
        name_length = sizeof(symbol_units) / sizeof(*symbol_units);
        parameter_count = 0u;
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
            name,
            name_length,
            parameter_count,
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

/* Appends one AsyncGeneratorRequest to the generator's queue. */
static OseoResult request_enqueue(
    OseoContext *context,
    OseoValue generator,
    OseoValue capability,
    OseoValue value,
    size_t resume_kind
) {
    OseoAsyncGeneratorRequest *request =
        oseo_internal_allocate_heap_bytes(context, sizeof(*request));
    if (request == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Asynchronous generator request allocation failed."
        );
    }
    request->next = oseo_undefined();
    request->capability = capability;
    request->value = value;
    request->resume_kind = resume_kind;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &request->header,
        OSEO_HEAP_ASYNC_GENERATOR_REQUEST
    );
    if (published.status != OSEO_STATUS_NORMAL) return published;
    OseoGenerator *state = generator_state(generator);
    if (tag_of(state->request_tail) == OSEO_TAG_UNDEFINED) {
        state->request_head = published.value;
    } else {
        request_object(state->request_tail)->next = published.value;
    }
    state->request_tail = published.value;
    return normal(oseo_undefined());
}

/* Drops the head request once its step has been reported. */
static void request_dequeue(OseoValue generator) {
    OseoGenerator *state = generator_state(generator);
    OseoValue head = state->request_head;
    if (tag_of(head) == OSEO_TAG_UNDEFINED) return;
    state->request_head = request_object(head)->next;
    if (tag_of(state->request_head) == OSEO_TAG_UNDEFINED) {
        state->request_tail = oseo_undefined();
    }
}

/*
 * AsyncGeneratorCompleteStep: reports one step into the head request's
 * promise and drops the request. A normal completion reports a fresh
 * { value, done } object and a throw completion rejects instead.
 */
static OseoResult complete_step(
    OseoContext *context,
    OseoValue generator,
    OseoValue value,
    bool done,
    bool rejected
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = value;
    OseoValue head = generator_state(frame.slots[0])->request_head;
    if (tag_of(head) == OSEO_TAG_UNDEFINED) {
        oseo_roots_release(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "An asynchronous generator step has no pending request."
        );
    }
    frame.slots[2] = request_object(head)->capability;
    request_dequeue(frame.slots[0]);
    if (rejected) {
        result = oseo_promise_reject_into(
            context,
            frame.slots[2],
            frame.slots[1]
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_internal_iterator_result(context, frame.slots[1], done);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[2],
            frame.slots[1]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Installs the two reactions one suspension's awaited operand needs. The
 * generator is left parked, so the driver returns to its caller and the
 * settled operand resumes the body from a promise job.
 *
 * The promise `then` derives is never observed: only these two reactions
 * settle it, and a body throw becomes the pending request's rejection
 * rather than this promise's, so it is marked handled the way every
 * other internal await marks its own.
 */
static OseoResult install_await_reactions(
    OseoContext *context,
    OseoValue generator,
    OseoValue operand
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = operand;
    result = oseo_environment_create(context, 1u);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[2],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = await_reaction_create(
            context,
            frame.slots[2],
            OSEO_ASYNC_GENERATOR_FULFILL_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = await_reaction_create(
            context,
            frame.slots[2],
            OSEO_ASYNC_GENERATOR_REJECT_CODE_ID
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve(context, frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_then(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && is_promise(result.value)) {
        OseoPromise *derived = promise_object(result.value);
        derived->handled = true;
        derived->pending_report = false;
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * AsyncGeneratorAwaitReturn: `return` reached a generator that never
 * started or already completed, so the requested value is awaited and
 * becomes that request's own final step without entering a body.
 */
static OseoResult park_awaiting_return(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
) {
    OseoGenerator *state = generator_state(generator);
    state->state = OSEO_GENERATOR_AWAITING;
    state->awaiting_return = true;
    OseoResult result = install_await_reactions(context, generator, value);
    if (result.status != OSEO_STATUS_NORMAL) {
        state = generator_state(generator);
        state->state = OSEO_GENERATOR_COMPLETED;
        state->awaiting_return = false;
    }
    return result;
}

/*
 * AsyncGeneratorDrainQueue and AsyncGeneratorResume together: run the
 * head request against the body until the body parks on an await or the
 * queue empties. Every exit from the body reports one step, so the loop
 * always makes progress or returns with the generator parked.
 */
static OseoResult drain_queue(
    OseoContext *context,
    OseoValue generator,
    bool resumed,
    OseoValue resumption_value,
    size_t resumption_kind
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = resumption_value;
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoGenerator *state = generator_state(frame.slots[0]);
        if (state->state == OSEO_GENERATOR_EXECUTING ||
            state->state == OSEO_GENERATOR_AWAITING) {
            break;
        }
        OseoValue head = state->request_head;
        if (tag_of(head) == OSEO_TAG_UNDEFINED) break;
        /* An awaited operand resumes the step the head request already
         * owns, so its value and completion replace that request's for
         * this one entry into the body. */
        size_t resume_kind =
            resumed ? resumption_kind : request_object(head)->resume_kind;
        if (!resumed) frame.slots[1] = request_object(head)->value;
        bool unstarted = state->state == OSEO_GENERATOR_SUSPENDED_START;
        bool completed = state->state == OSEO_GENERATOR_COMPLETED;
        /* A return or a throw delivered before the body ever ran
         * completes the generator without entering it, so no `finally`
         * in a body that never started runs. */
        if (!resumed && (completed || (unstarted &&
            resume_kind != OSEO_GENERATOR_RESUME_NEXT))) {
            if (!completed) oseo_internal_generator_complete(frame.slots[0]);
            if (resume_kind == OSEO_GENERATOR_RESUME_RETURN) {
                result = park_awaiting_return(
                    context,
                    frame.slots[0],
                    frame.slots[1]
                );
                break;
            }
            bool throwing = resume_kind == OSEO_GENERATOR_RESUME_THROW;
            result = complete_step(
                context,
                frame.slots[0],
                throwing ? frame.slots[1] : oseo_undefined(),
                true,
                throwing
            );
            continue;
        }
        if (context->generator_dispatcher == NULL) {
            oseo_internal_generator_complete(frame.slots[0]);
            result = failure(
                context,
                "OSEO2001",
                "No generated generator dispatcher is installed."
            );
            break;
        }
        state->sent = frame.slots[1];
        state->resume_kind = resume_kind;
        state->state = OSEO_GENERATOR_EXECUTING;
        resumed = false;
        result = oseo_call_enter(context);
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_internal_generator_complete(frame.slots[0]);
            break;
        }
        result = context->generator_dispatcher(context, frame.slots[0]);
        oseo_call_leave(context);
        state = generator_state(frame.slots[0]);
        state->sent = oseo_undefined();
        state->resume_kind = OSEO_GENERATOR_RESUME_NEXT;
        /* The completion value only lives in `result` until it is rooted,
         * and a step reports it after allocations of its own. */
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            /* A host diagnostic is terminal, so it reaches the caller
             * instead of becoming one step's rejection. */
            if (context->has_diagnostic) break;
            oseo_context_clear_language_error(context);
            oseo_internal_generator_complete(frame.slots[0]);
            result = complete_step(
                context,
                frame.slots[0],
                frame.slots[1],
                true,
                true
            );
            continue;
        }
        if (state->state == OSEO_GENERATOR_SUSPENDED_YIELD) {
            if (state->suspend_reason == OSEO_GENERATOR_SUSPEND_AWAIT) {
                state->state = OSEO_GENERATOR_AWAITING;
                result = install_await_reactions(
                    context,
                    frame.slots[0],
                    frame.slots[1]
                );
                break;
            }
            result = complete_step(
                context,
                frame.slots[0],
                frame.slots[1],
                false,
                false
            );
            continue;
        }
        oseo_internal_generator_complete(frame.slots[0]);
        result = complete_step(
            context,
            frame.slots[0],
            frame.slots[1],
            true,
            false
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = oseo_undefined();
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The shared body of the three prototype methods. Every path reports
 * through the promise this creates, including the receiver check, so a
 * misapplied method rejects instead of throwing, which is what the
 * specification's IfAbruptRejectPromise does for each of them.
 */
static OseoResult async_generator_request(
    OseoContext *context,
    OseoValue generator,
    OseoValue value,
    size_t resume_kind
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = value;
    result = oseo_internal_promise_create(context);
    frame.slots[2] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    if (!is_async_generator(frame.slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "An asynchronous generator method requires an asynchronous "
            "generator receiver."
        );
        OseoValue reason = result.value;
        if (context->has_diagnostic) {
            oseo_roots_release(context, &frame);
            return result;
        }
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(context, frame.slots[2], reason);
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
        oseo_roots_release(context, &frame);
        return result;
    }
    result = request_enqueue(
        context,
        frame.slots[0],
        frame.slots[2],
        frame.slots[1],
        resume_kind
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = drain_queue(
            context,
            frame.slots[0],
            false,
            oseo_undefined(),
            OSEO_GENERATOR_RESUME_NEXT
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_async_generator_next(
    OseoContext *context,
    OseoValue generator,
    OseoValue sent
) {
    return async_generator_request(
        context,
        generator,
        sent,
        OSEO_GENERATOR_RESUME_NEXT
    );
}

OseoResult oseo_async_generator_return(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
) {
    return async_generator_request(
        context,
        generator,
        value,
        OSEO_GENERATOR_RESUME_RETURN
    );
}

OseoResult oseo_async_generator_throw(
    OseoContext *context,
    OseoValue generator,
    OseoValue reason
) {
    return async_generator_request(
        context,
        generator,
        reason,
        OSEO_GENERATOR_RESUME_THROW
    );
}

OseoResult oseo_internal_async_generator_awaited(
    OseoContext *context,
    OseoValue generator,
    OseoValue value,
    bool rejected
) {
    if (!is_async_generator(generator)) {
        return failure(
            context,
            "OSEO2001",
            "An await resumption reached a value that is not an "
            "asynchronous generator."
        );
    }
    OseoGenerator *state = generator_state(generator);
    if (state->state != OSEO_GENERATOR_AWAITING) {
        return failure(
            context,
            "OSEO2001",
            "An await resumption reached a generator that is not awaiting."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = value;
    if (state->awaiting_return) {
        state->awaiting_return = false;
        state->state = OSEO_GENERATOR_COMPLETED;
        result = complete_step(
            context,
            frame.slots[0],
            frame.slots[1],
            true,
            rejected
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = drain_queue(
                context,
                frame.slots[0],
                false,
                oseo_undefined(),
                OSEO_GENERATOR_RESUME_NEXT
            );
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    /* The parked suspension becomes resumable again, and the resumption
     * carries the settled operand: a fulfilled one delivers its value at
     * the await position, and a rejected one delivers a throw completion
     * the body raises there. The head request keeps owning the step. */
    state->state = OSEO_GENERATOR_SUSPENDED_YIELD;
    state->suspend_reason = OSEO_GENERATOR_SUSPEND_YIELD;
    result = drain_queue(
        context,
        frame.slots[0],
        true,
        frame.slots[1],
        rejected ? OSEO_GENERATOR_RESUME_THROW : OSEO_GENERATOR_RESUME_NEXT
    );
    oseo_roots_release(context, &frame);
    return result;
}
