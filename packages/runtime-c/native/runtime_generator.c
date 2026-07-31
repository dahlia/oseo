#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * Generator objects: the suspended body frame shared by both generator
 * kinds, its collector-traced root slots and saved completion records,
 * and the %GeneratorPrototype% resumptions that drive a synchronous one.
 * The asynchronous driver lives in *runtime_async_generator.c* and
 * reuses the same record.
 *
 * A generator's roots live in the generator record rather than on the
 * native root stack, so no C frame of a suspended body stays alive. The
 * record is allocated once, is never resized, and the collector never
 * moves it, so generated code can hold `roots` across every safepoint
 * in the resumed body.
 */

static OseoGenerator *generator_state(OseoValue value) {
    return ordinary_object(value)->generator;
}

/*
 * %GeneratorPrototype%, created once per context and permanently rooted.
 * It carries the brand that serves the virtualized `next` and
 * `Symbol.iterator`, and every generator function's own `prototype`
 * object inherits from it, so the specified lookup order and the shared
 * identity both hold without materializing the rest of the intrinsic.
 */
OseoResult oseo_internal_generator_prototype(OseoContext *context) {
    if (tag_of(context->generator_prototype) != OSEO_TAG_UNDEFINED) {
        return normal(context->generator_prototype);
    }
    OseoResult result = oseo_object_create(context, oseo_null());
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoOrdinaryObject *object = ordinary_object(result.value);
    object->default_intrinsics = true;
    object->generator_prototype = true;
    context->generator_prototype = result.value;
    return result;
}

static OseoResult ascii_generator_string(
    OseoContext *context,
    const char *text
) {
    size_t length = strlen(text);
    uint16_t *units = NULL;
    if (length > 0u) {
        units = malloc(length * sizeof(uint16_t));
        if (units == NULL) {
            return failure(context, "OSEO2001", "String allocation failed.");
        }
        for (size_t index = 0u; index < length; index += 1u) {
            units[index] = (uint16_t)(unsigned char)text[index];
        }
    }
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    free(units);
    return result;
}

/* Define one ASCII-named data property; object and value stay rooted. */
static OseoResult define_ascii_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_generator_string(context, name);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[2] = result.value;
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The same for a well-known symbol key; object and value stay rooted. */
static OseoResult define_symbol_property(
    OseoContext *context,
    OseoValue object,
    size_t well_known,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_internal_well_known_symbol(context, well_known);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[2] = result.value;
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The same for `Symbol.toStringTag` and an ASCII tag value. */
static OseoResult define_to_string_tag(
    OseoContext *context,
    OseoValue object,
    const char *tag,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[1] = {object};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_generator_string(context, tag);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_symbol_property(
            context,
            slots[0],
            OSEO_WELL_KNOWN_TO_STRING_TAG,
            result.value,
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Install one built-in method. Every method is cached on the context, so
 * the value this defines is permanently rooted and two generators created
 * from different functions share one method identity.
 */
static OseoResult define_method(
    OseoContext *context,
    OseoValue object,
    const char *name,
    size_t code_id
) {
    /* A built-in method is writable, non-enumerable, and configurable. */
    const OseoPropertyAttributes method = {true, false, true, false};
    OseoValue slots[1] = {object};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_internal_async_generator_method(context, code_id);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_property(
            context,
            slots[0],
            name,
            result.value,
            method
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * The asynchronous generator intrinsics, created as one cluster because
 * their links are circular: %AsyncGeneratorFunction% names
 * %AsyncGeneratorFunction.prototype% as its `prototype`, that object
 * names the constructor back and %AsyncGeneratorPrototype% as its own
 * `prototype`, and %AsyncGeneratorPrototype% names it as `constructor`.
 * Every method is an ordinary own property of the object the
 * specification places it on rather than a brand the property read
 * synthesizes, so a descriptor read, a deletion, and an assignment all
 * observe the same set a read does, and a generator function whose
 * `prototype` is replaced reaches exactly the methods the replacement's
 * chain still retains.
 *
 * The cluster reaches the context only after every property is defined,
 * so a failed allocation leaves no partially wired intrinsic behind and
 * the next reference rebuilds it. Its allocations are restored the way
 * the error intrinsics restore theirs, because an intrinsic created on
 * first use is not one the observed program performed.
 *
 * Three of the cluster's [[Prototype]] links stay null because this
 * profile materializes neither %Object.prototype% nor the Function
 * intrinsics: %AsyncIteratorPrototype% is specified to inherit from
 * %Object.prototype%, %AsyncGeneratorFunction.prototype% from
 * %Function.prototype%, and %AsyncGeneratorFunction% from %Function%.
 */
static OseoResult async_generator_intrinsics(OseoContext *context) {
    if (tag_of(context->async_generator_prototype) != OSEO_TAG_UNDEFINED) {
        return normal(context->async_generator_prototype);
    }
    size_t entry_allocations = context->allocations;
    const OseoPropertyAttributes hidden = {true, false, false, false};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_create(context, oseo_null());
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])->default_intrinsics = true;
        result = oseo_internal_async_generator_method(
            context,
            OSEO_ASYNC_ITERATOR_SELF_CODE_ID
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes method = {true, false, true, false};
        result = define_symbol_property(
            context,
            frame.slots[0],
            OSEO_WELL_KNOWN_ASYNC_ITERATOR,
            result.value,
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[1])->default_intrinsics = true;
        result = define_method(
            context,
            frame.slots[1],
            "next",
            OSEO_ASYNC_GENERATOR_NEXT_CODE_ID
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_method(
            context,
            frame.slots[1],
            "return",
            OSEO_ASYNC_GENERATOR_RETURN_CODE_ID
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_method(
            context,
            frame.slots[1],
            "throw",
            OSEO_ASYNC_GENERATOR_THROW_CODE_ID
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[2])->default_intrinsics = true;
        result = oseo_environment_create(context, 0u);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        static const uint16_t constructor_units[] = {
            'A', 's', 'y', 'n', 'c', 'G', 'e', 'n', 'e', 'r', 'a', 't',
            'o', 'r', 'F', 'u', 'n', 'c', 't', 'i', 'o', 'n'
        };
        result = oseo_function_create(
            context,
            OSEO_ASYNC_GENERATOR_FUNCTION_CODE_ID,
            frame.slots[3],
            constructor_units,
            sizeof(constructor_units) / sizeof(*constructor_units),
            1u,
            OSEO_FUNCTION_ORDINARY,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoFunction *constructor = function_object(frame.slots[3]);
        constructor->prototype_object = frame.slots[2];
        constructor->prototype_writable = false;
        constructor->ordinary.default_intrinsics = true;
        result = define_ascii_property(
            context,
            frame.slots[2],
            "constructor",
            frame.slots[3],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_property(
            context,
            frame.slots[2],
            "prototype",
            frame.slots[1],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_to_string_tag(
            context,
            frame.slots[2],
            "AsyncGeneratorFunction",
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[2],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_to_string_tag(
            context,
            frame.slots[1],
            "AsyncGenerator",
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->async_iterator_prototype = frame.slots[0];
        context->async_generator_prototype = frame.slots[1];
        context->async_generator_intrinsic = frame.slots[2];
        context->async_generator_function = frame.slots[3];
        result.value = frame.slots[1];
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_async_generator_prototype(OseoContext *context) {
    OseoResult result = async_generator_intrinsics(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->async_generator_prototype);
}

OseoResult oseo_internal_async_generator_intrinsic(OseoContext *context) {
    OseoResult result = async_generator_intrinsics(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->async_generator_intrinsic);
}

OseoResult oseo_generator_create(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t slot_count,
    size_t completion_count
) {
    if (!is_function(callee)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A suspension frame requires an asynchronous or generator "
            "function."
        );
    }
    OseoFunctionKind function_kind = function_object(callee)->function_kind;
    if (function_kind != OSEO_FUNCTION_GENERATOR &&
        function_kind != OSEO_FUNCTION_ASYNC_GENERATOR &&
        function_kind != OSEO_FUNCTION_ASYNC &&
        function_kind != OSEO_FUNCTION_ASYNC_ARROW) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A suspension frame requires an asynchronous or generator "
            "function."
        );
    }
    bool async_function = function_kind == OSEO_FUNCTION_ASYNC ||
        function_kind == OSEO_FUNCTION_ASYNC_ARROW;
    bool asynchronous =
        function_kind == OSEO_FUNCTION_ASYNC_GENERATOR || async_function;
    if (slot_count > (SIZE_MAX - sizeof(OseoGenerator)) / sizeof(OseoValue)) {
        return failure(context, "OSEO2001", "Generator frame is too large.");
    }
    size_t slot_bytes = slot_count * sizeof(OseoValue);
    size_t remaining = SIZE_MAX - sizeof(OseoGenerator) - slot_bytes;
    if (completion_count > remaining / sizeof(OseoCompletionRecord)) {
        return failure(context, "OSEO2001", "Generator frame is too large.");
    }
    size_t completion_bytes = completion_count * sizeof(OseoCompletionRecord);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = callee;
    frame.slots[1] = receiver;
    frame.slots[2] = async_function
        ? oseo_null()
        : function_object(callee)->prototype_object;
    /* GetPrototypeFromConstructor falls back to the intrinsic whenever
     * the function's `prototype` is not an object. */
    if (!async_function && !is_object(frame.slots[2])) {
        result = asynchronous
            ? oseo_internal_async_generator_prototype(context)
            : oseo_internal_generator_prototype(context);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[2]);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    frame.slots[2] = result.value;
    OseoValue generator = frame.slots[2];
    /* The record is published only after it is fully initialized, so a
     * collection triggered by this allocation never traces half a
     * frame. */
    OseoGenerator *state = malloc(
        sizeof(OseoGenerator) + slot_bytes + completion_bytes
    );
    if (state == NULL) {
        oseo_roots_release(context, &frame);
        return failure(context, "OSEO2001", "Generator allocation failed.");
    }
    state->callee = frame.slots[0];
    state->receiver = frame.slots[1];
    state->sent = oseo_undefined();
    state->async_function_capability = oseo_undefined();
    state->request_head = oseo_undefined();
    state->request_tail = oseo_undefined();
    state->slots = (OseoValue *)(void *)(state + 1);
    state->completions = (OseoCompletionRecord *)(void *)
        ((unsigned char *)state->slots + slot_bytes);
    state->slot_count = slot_count;
    state->completion_count = completion_count;
    state->resume_point = 0u;
    state->resume_kind = OSEO_GENERATOR_RESUME_NEXT;
    state->suspend_reason = OSEO_GENERATOR_SUSPEND_YIELD;
    state->state = OSEO_GENERATOR_SUSPENDED_START;
    state->asynchronous = asynchronous;
    state->async_function = async_function;
    state->awaiting_return = false;
    state->yielded_result_object = false;
    for (size_t index = 0u; index < slot_count; index += 1u) {
        state->slots[index] = oseo_undefined();
    }
    if (completion_bytes > 0u) memset(state->completions, 0, completion_bytes);
    OseoOrdinaryObject *object = ordinary_object(generator);
    object->default_intrinsics = true;
    object->generator = state;
    oseo_roots_release(context, &frame);
    return normal(generator);
}

OseoValue *oseo_generator_slots(OseoValue generator) {
    return generator_state(generator)->slots;
}

OseoCompletionRecord *oseo_generator_completions(OseoValue generator) {
    return generator_state(generator)->completions;
}

OseoValue oseo_generator_callee(OseoValue generator) {
    return generator_state(generator)->callee;
}

OseoValue oseo_generator_receiver(OseoValue generator) {
    return generator_state(generator)->receiver;
}

OseoValue oseo_generator_sent(OseoValue generator) {
    return generator_state(generator)->sent;
}

size_t oseo_generator_resume_point(OseoValue generator) {
    return generator_state(generator)->resume_point;
}

size_t oseo_generator_resume_kind(OseoValue generator) {
    return generator_state(generator)->resume_kind;
}

void oseo_generator_suspend(
    OseoContext *context,
    OseoValue generator,
    size_t resume_point,
    bool result_object,
    size_t suspend_reason
) {
    (void)context;
    /* Both suspension reasons leave the body resumable at `resume_point`;
     * the asynchronous driver is the only caller that distinguishes them,
     * and it parks an awaiting body itself once it has the operand. */
    OseoGenerator *state = generator_state(generator);
    state->resume_point = resume_point;
    state->state = OSEO_GENERATOR_SUSPENDED_YIELD;
    state->suspend_reason = suspend_reason;
    state->yielded_result_object = result_object;
}

/*
 * Discard [[GeneratorContext]] once a generator completes. A completed
 * generator can never be resumed, so retaining its frame would keep the
 * whole suspended object graph reachable for as long as the generator
 * itself is.
 */
void oseo_internal_generator_complete(OseoValue generator) {
    OseoGenerator *state = generator_state(generator);
    state->state = OSEO_GENERATOR_COMPLETED;
    state->callee = oseo_undefined();
    state->receiver = oseo_undefined();
    state->sent = oseo_undefined();
    /* A completed asynchronous generator still reports the requests it
     * already accepted, so only the frame is discarded here; the driver
     * drains the queue itself. */
    for (size_t index = 0u; index < state->slot_count; index += 1u) {
        state->slots[index] = oseo_undefined();
    }
    if (state->completion_count > 0u) {
        memset(
            state->completions,
            0,
            state->completion_count * sizeof(OseoCompletionRecord)
        );
    }
}

/*
 * GeneratorResume and GeneratorResumeAbrupt over a return completion.
 * Both deliver `sent` to the pending suspension and differ only in the
 * resume kind the body observes and in what an unstarted or completed
 * generator reports without entering the body.
 */
static OseoResult generator_resume(
    OseoContext *context,
    OseoValue generator,
    OseoValue sent,
    size_t resume_kind
) {
    bool returning = resume_kind == OSEO_GENERATOR_RESUME_RETURN;
    bool throwing = resume_kind == OSEO_GENERATOR_RESUME_THROW;
    /* An asynchronous generator reports its steps through promises, so
     * the synchronous resumption never drives one even when a caller
     * reaches this method with one as the receiver. */
    if (!is_generator(generator) || is_async_generator(generator)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            returning
                ? "Generator return requires a generator receiver."
                : throwing
                    ? "Generator throw requires a generator receiver."
                    : "Generator next requires a generator receiver."
        );
    }
    if (generator_state(generator)->state == OSEO_GENERATOR_EXECUTING) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot resume an already running generator."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = generator;
    frame.slots[1] = sent;
    OseoGeneratorState current = generator_state(frame.slots[0])->state;
    /* A return completion delivered before the body ever ran completes the
     * generator without entering it, so no `finally` in a body that never
     * started runs, and it reports the requested value. A completed
     * generator reports it too, while `next` reports undefined. A throw
     * completion re-throws the value. */
    bool unstarted =
        (returning || throwing) && current == OSEO_GENERATOR_SUSPENDED_START;
    if (current == OSEO_GENERATOR_COMPLETED || unstarted) {
        if (unstarted) oseo_internal_generator_complete(frame.slots[0]);
        if (throwing) {
            result = (OseoResult){OSEO_STATUS_THROW, frame.slots[1]};
            oseo_roots_release(context, &frame);
            return result;
        }
        result = oseo_internal_iterator_result(
            context,
            returning ? frame.slots[1] : oseo_undefined(),
            true
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    if (context->generator_dispatcher == NULL) {
        oseo_roots_release(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "No generated generator dispatcher is installed."
        );
    }
    OseoGenerator *state = generator_state(frame.slots[0]);
    state->sent = frame.slots[1];
    state->resume_kind = resume_kind;
    state->state = OSEO_GENERATOR_EXECUTING;
    result = oseo_call_enter(context);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_internal_generator_complete(frame.slots[0]);
        oseo_roots_release(context, &frame);
        return result;
    }
    result = context->generator_dispatcher(context, frame.slots[0]);
    oseo_call_leave(context);
    state = generator_state(frame.slots[0]);
    state->sent = oseo_undefined();
    /* The kind describes one resumption only; the next suspension is
     * resumed normally unless that resumption says otherwise. */
    state->resume_kind = OSEO_GENERATOR_RESUME_NEXT;
    /* The completion value only lives in `result` until it is rooted,
     * and discarding the frame drops the slot it came from. */
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_internal_generator_complete(frame.slots[0]);
        result.value = frame.slots[1];
        oseo_roots_release(context, &frame);
        return result;
    }
    bool done = state->state != OSEO_GENERATOR_SUSPENDED_YIELD;
    if (done) {
        oseo_internal_generator_complete(frame.slots[0]);
    } else if (state->yielded_result_object) {
        /* GeneratorYield receives an already-built iterator result
         * object from `yield*`, so it reaches the resuming consumer
         * unchanged, including a result that omits `done`. */
        OseoValue yielded = frame.slots[1];
        oseo_roots_release(context, &frame);
        return normal(yielded);
    }
    result = oseo_internal_iterator_result(context, frame.slots[1], done);
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_generator_next(
    OseoContext *context,
    OseoValue generator,
    OseoValue sent
) {
    return generator_resume(
        context,
        generator,
        sent,
        OSEO_GENERATOR_RESUME_NEXT
    );
}

OseoResult oseo_generator_return(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
) {
    return generator_resume(
        context,
        generator,
        value,
        OSEO_GENERATOR_RESUME_RETURN
    );
}

OseoResult oseo_generator_throw(
    OseoContext *context,
    OseoValue generator,
    OseoValue value
) {
    return generator_resume(
        context,
        generator,
        value,
        OSEO_GENERATOR_RESUME_THROW
    );
}
