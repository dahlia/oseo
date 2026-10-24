#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>
#include <stdio.h>

/*
 * Drives the tail call trampoline through the public generated-code ABI.
 * Each code identity below stands for a generated body: it returns
 * `oseo_tail_call`'s result exactly as generated code does after the
 * status check sends it to the body's exit.
 */
enum {
    COUNTDOWN = 1u,
    GROW = 2u,
    DERIVED = 3u,
    BIND_THIS = 4u,
    RETURN_NUMBER = 5u,
    RETURN_UNDEFINED = 6u,
    NESTED = 7u,
    COLLECTING = 8u,
};

#define CHAIN_LENGTH 100000u
#define GROWTH_LIMIT 70u

static OseoValue functions[9];
static size_t deepest_call_depth;
static size_t deepest_root_frames;
static size_t steps;

static bool same(OseoContext *context, OseoValue left, OseoValue right) {
    OseoResult result = oseo_strict_equal(context, left, right);
    assert(result.status == OSEO_STATUS_NORMAL);
    return oseo_to_boolean(result.value);
}

static size_t root_frames(const OseoContext *context) {
    size_t count = 0u;
    for (const OseoRootFrame *frame = context->roots;
         frame != NULL;
         frame = frame->previous) {
        count += 1u;
    }
    return count;
}

static void observe(OseoContext *context) {
    steps += 1u;
    if (context->call_depth > deepest_call_depth) {
        deepest_call_depth = context->call_depth;
    }
    size_t frames = root_frames(context);
    if (frames > deepest_root_frames) deepest_root_frames = frames;
}

static double integer_argument(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    assert(index < argument_count);
    for (double value = 0.0; value <= (double)CHAIN_LENGTH; value += 1.0) {
        if (same(context, arguments[index], oseo_number(value))) return value;
    }
    assert(false);
    return -1.0;
}

static OseoResult dispatch(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    size_t code_id = 0u;
    OseoResult result = oseo_function_code_id(context, callee, &code_id);
    (void)new_target;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    observe(context);
    if (code_id == COUNTDOWN) {
        /* `return n === 0 ? n : countdown(n - 1)` without a frame per
         * step. The argument is a number below 2^53, so its successor
         * search stays exact. */
        assert(argument_count == 1u);
        if (same(context, arguments[0], oseo_number(0.0))) {
            return (OseoResult){OSEO_STATUS_NORMAL, arguments[0]};
        }
        result = oseo_subtract(context, arguments[0], oseo_number(1.0));
        assert(result.status == OSEO_STATUS_NORMAL);
        OseoValue next = result.value;
        return oseo_tail_call(context, callee, receiver, 1u, &next);
    }
    if (code_id == GROW) {
        /* Each step passes one more argument than it received and checks
         * that every earlier argument arrived unchanged. */
        for (size_t index = 0u; index < argument_count; index += 1u) {
            assert(
                integer_argument(context, argument_count, arguments, index) ==
                    (double)index
            );
        }
        if (argument_count == GROWTH_LIMIT) {
            return (OseoResult){
                OSEO_STATUS_NORMAL,
                oseo_number((double)argument_count),
            };
        }
        OseoValue grown[GROWTH_LIMIT];
        for (size_t index = 0u; index < argument_count; index += 1u) {
            grown[index] = arguments[index];
        }
        grown[argument_count] = oseo_number((double)argument_count);
        return oseo_tail_call(
            context,
            callee,
            receiver,
            argument_count + 1u,
            grown
        );
    }
    if (code_id == DERIVED) {
        /* A derived constructor body whose `this` binding a later step
         * initializes, as an arrow calling super() would. */
        assert(argument_count == 2u);
        return oseo_tail_call_derived(
            context,
            arguments[0],
            oseo_undefined(),
            1u,
            &arguments[1],
            arguments[1]
        );
    }
    if (code_id == BIND_THIS) {
        assert(argument_count == 1u);
        result = oseo_object_literal_create(context);
        assert(result.status == OSEO_STATUS_NORMAL);
        result = oseo_cell_initialize(context, arguments[0], result.value);
        assert(result.status == OSEO_STATUS_NORMAL);
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id == RETURN_NUMBER) {
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_number(7.0)};
    }
    if (code_id == RETURN_UNDEFINED) {
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id == NESTED) {
        /* A non-tail call inside a step runs its own chain to completion
         * before this step records its own tail call. */
        OseoValue count = oseo_number(1000.0);
        result = oseo_call_function(
            context,
            functions[COUNTDOWN],
            oseo_undefined(),
            1u,
            &count,
            oseo_undefined()
        );
        assert(result.status == OSEO_STATUS_NORMAL);
        assert(same(context, result.value, oseo_number(0.0)));
        count = oseo_number(10.0);
        return oseo_tail_call(
            context,
            functions[COUNTDOWN],
            oseo_undefined(),
            1u,
            &count
        );
    }
    if (code_id == COLLECTING) {
        /* The argument is an environment holding the remaining count.
         * The next step's environment is reachable only through the
         * pending record while the collector runs. */
        assert(argument_count == 1u);
        result = oseo_environment_get(context, arguments[0], 0u);
        assert(result.status == OSEO_STATUS_NORMAL);
        OseoValue slots[2] = {result.value, oseo_undefined()};
        if (same(context, slots[0], oseo_number(0.0))) {
            return (OseoResult){OSEO_STATUS_NORMAL, slots[0]};
        }
        OseoRootFrame frame = {NULL, slots, 2u};
        oseo_roots_push(context, &frame);
        result = oseo_subtract(context, slots[0], oseo_number(1.0));
        assert(result.status == OSEO_STATUS_NORMAL);
        slots[0] = result.value;
        result = oseo_environment_create(context, 1u);
        assert(result.status == OSEO_STATUS_NORMAL);
        slots[1] = result.value;
        result = oseo_environment_set(context, slots[1], 0u, slots[0]);
        assert(result.status == OSEO_STATUS_NORMAL);
        result = oseo_tail_call(context, callee, receiver, 1u, &slots[1]);
        oseo_roots_pop(context, &frame);
        assert(result.status == OSEO_STATUS_TAIL_CALL);
        oseo_collect(context);
        return result;
    }
    return oseo_unknown_function(context, code_id);
}

static OseoValue function(
    OseoContext *context,
    size_t code_id,
    OseoValue environment
) {
    OseoResult result = oseo_function_create(
        context,
        code_id,
        environment,
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static void reset_observations(void) {
    deepest_call_depth = 0u;
    deepest_root_frames = 0u;
    steps = 0u;
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result;
    oseo_context_init(&context, "tail-calls", 10u);
    oseo_context_set_function_dispatcher(&context, dispatch);
    result = oseo_roots_allocate(&context, &frame, 12u);
    assert(result.status == OSEO_STATUS_NORMAL);
    /* Every function needs an environment to close over. Slot 0 keeps
     * the empty one rooted while the later creations allocate. */
    result = oseo_environment_create(&context, 0u);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[0] = result.value;
    for (size_t code_id = COUNTDOWN; code_id <= COLLECTING; code_id += 1u) {
        frame.slots[code_id] = function(&context, code_id, frame.slots[0]);
        functions[code_id] = frame.slots[code_id];
    }
    size_t base_frames = root_frames(&context);

    /* A chain of 100,000 tail calls holds one step's call depth and a
     * constant number of root frames, far below the 256-call limit an
     * ordinary chain of the same length would exceed. */
    reset_observations();
    OseoValue start = oseo_number((double)CHAIN_LENGTH);
    result = oseo_call_function(
        &context,
        frame.slots[COUNTDOWN],
        oseo_undefined(),
        1u,
        &start,
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_number(0.0)));
    assert(steps == CHAIN_LENGTH + 1u);
    assert(deepest_call_depth == 1u);
    assert(deepest_root_frames <= base_frames + 3u);
    assert(context.call_depth == 0u);
    assert(context.active_frame_slots == 0u);
    assert(root_frames(&context) == base_frames);

    /* The argument buffer grows across steps without losing a value. */
    reset_observations();
    result = oseo_call_function(
        &context,
        frame.slots[GROW],
        oseo_undefined(),
        0u,
        NULL,
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_number((double)GROWTH_LIMIT)));
    assert(steps == GROWTH_LIMIT + 1u);
    assert(deepest_call_depth == 1u);

    /* A non-tail chain inside a step finishes before the step's own
     * tail call, so neither overwrites the other's record. */
    reset_observations();
    result = oseo_call_function(
        &context,
        frame.slots[NESTED],
        oseo_undefined(),
        0u,
        NULL,
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_number(0.0)));
    assert(deepest_call_depth == 2u);
    assert(root_frames(&context) == base_frames);

    /* The pending record roots its arguments through a collection. */
    result = oseo_environment_create(&context, 1u);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[9] = result.value;
    result = oseo_environment_set(
        &context,
        frame.slots[9],
        0u,
        oseo_number(50.0)
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_call_function(
        &context,
        frame.slots[COLLECTING],
        oseo_undefined(),
        1u,
        &frame.slots[9],
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_number(0.0)));

    /* A derived constructor's result rules apply to the chain's value
     * through the cell it carried: undefined reads the binding a later
     * step initialized, an object stands, and a primitive throws. */
    result = oseo_cell_create(&context, oseo_uninitialized());
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[10] = result.value;
    OseoValue derived_arguments[2] = {
        frame.slots[BIND_THIS],
        frame.slots[10],
    };
    result = oseo_call_function(
        &context,
        frame.slots[DERIVED],
        oseo_undefined(),
        2u,
        derived_arguments,
        frame.slots[DERIVED]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(oseo_value_is_object(result.value));
    result = oseo_cell_get(&context, frame.slots[10]);
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(oseo_value_is_object(result.value));

    result = oseo_cell_create(&context, oseo_uninitialized());
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[11] = result.value;
    derived_arguments[0] = frame.slots[RETURN_NUMBER];
    derived_arguments[1] = frame.slots[11];
    result = oseo_call_function(
        &context,
        frame.slots[DERIVED],
        oseo_undefined(),
        2u,
        derived_arguments,
        frame.slots[DERIVED]
    );
    assert(result.status == OSEO_STATUS_THROW);
    oseo_context_clear_language_error(&context);

    derived_arguments[0] = frame.slots[RETURN_UNDEFINED];
    result = oseo_call_function(
        &context,
        frame.slots[DERIVED],
        oseo_undefined(),
        2u,
        derived_arguments,
        frame.slots[DERIVED]
    );
    assert(result.status == OSEO_STATUS_THROW);
    oseo_context_clear_language_error(&context);

    /* A value that is not callable throws in the calling frame instead
     * of being recorded. */
    result = oseo_tail_call(
        &context,
        oseo_number(1.0),
        oseo_undefined(),
        0u,
        NULL
    );
    assert(result.status == OSEO_STATUS_THROW);
    oseo_context_clear_language_error(&context);
    assert(context.call_depth == 0u);
    assert(root_frames(&context) == base_frames);

    /* A host intrinsic recorded in tail position runs as a step. */
    OseoValue logged = oseo_number(3.0);
    result = oseo_call_complete(
        &context,
        oseo_tail_host_call(&context, OSEO_TAIL_HOST_CONSOLE_LOG, 1u, &logged)
    );
    assert(result.status == OSEO_STATUS_NORMAL);

    /* clearTimeout is a host tail step even though it cannot call user
     * code. Copy its arguments before releasing the simulated caller's
     * entire frame budget and roots, then collect the pending record.
     * Overwriting the old handle must not stop the step canceling it. */
    context.collect_every_safepoint = true;
    const uint16_t live_key[] = {'l', 'i', 'v', 'e'};
    result = oseo_string_from_units(&context, live_key, 4u);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[9] = result.value;
    OseoValue timer_arguments[2] = {
        frame.slots[RETURN_UNDEFINED],
        oseo_number(0.0),
    };
    result = oseo_set_timeout(&context, 2u, timer_arguments);
    assert(result.status == OSEO_STATUS_NORMAL);
    OseoValue clear_arguments[2] = {result.value, oseo_undefined()};
    OseoRootFrame caller_frame = {NULL, clear_arguments, 2u};
    oseo_roots_push(&context, &caller_frame);
    result = oseo_object_literal_create(&context);
    assert(result.status == OSEO_STATUS_NORMAL);
    clear_arguments[1] = result.value;
    result = oseo_object_define(
        &context,
        clear_arguments[1],
        frame.slots[9],
        oseo_number(7.0),
        (OseoPropertyAttributes){
            .writable = true,
            .enumerable = true,
            .configurable = true,
        }
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_frame_enter(&context, OSEO_MAX_ACTIVE_FRAME_SLOTS);
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_tail_host_call(
        &context,
        OSEO_TAIL_HOST_CLEAR_TIMEOUT,
        2u,
        clear_arguments
    );
    assert(result.status == OSEO_STATUS_TAIL_CALL);
    OseoResult pending_clear = result;
    OseoValue retained_extra = clear_arguments[1];
    clear_arguments[0] = oseo_undefined();
    clear_arguments[1] = oseo_undefined();
    oseo_roots_pop(&context, &caller_frame);
    oseo_frame_leave(&context, OSEO_MAX_ACTIVE_FRAME_SLOTS);
    oseo_collect(&context);
    /* This unrooted local survives only through the pending record. */
    result = oseo_object_get(&context, retained_extra, frame.slots[9]);
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_number(7.0)));
    result = oseo_call_complete(&context, pending_clear);
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_undefined()));
    reset_observations();
    result = oseo_event_loop_run(&context, oseo_undefined());
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(steps == 0u);

    /* Missing and non-number handles keep the direct host contract. */
    result = oseo_call_complete(
        &context,
        oseo_tail_host_call(&context, OSEO_TAIL_HOST_CLEAR_TIMEOUT, 0u, NULL)
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_undefined()));
    result = oseo_object_literal_create(&context);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[9] = result.value;
    result = oseo_call_complete(
        &context,
        oseo_tail_host_call(
            &context,
            OSEO_TAIL_HOST_CLEAR_TIMEOUT,
            1u,
            &frame.slots[9]
        )
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(same(&context, result.value, oseo_undefined()));
    assert(context.call_depth == 0u);
    assert(context.active_frame_slots == 0u);
    assert(root_frames(&context) == base_frames);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    (void)printf("tail calls complete\n");
    return 0;
}
