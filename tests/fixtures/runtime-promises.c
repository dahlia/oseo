#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>

static size_t observations[8];
static size_t observation_count;

static void expect_number(OseoValue value, int64_t expected) {
    assert(oseo_value_is_smi(value));
    assert(oseo_value_unbox_smi(value) == expected);
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
    (void)receiver;
    (void)new_target;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (code_id == 1u) {
        OseoValue first = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        OseoValue second = oseo_number(99.0);
        result = oseo_call_function(
            context,
            first,
            oseo_undefined(),
            1u,
            &second,
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) return result;
        second = oseo_number(100.0);
        return oseo_call_function(
            context,
            first,
            oseo_undefined(),
            1u,
            &second,
            oseo_undefined()
        );
    }
    if (code_id == 2u || code_id == 3u) {
        observations[observation_count] = code_id;
        observation_count += 1u;
        OseoValue input = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        return oseo_add(context, input, oseo_number((double)code_id));
    }
    if (code_id == 4u) {
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id == 5u) {
        assert(argument_count == 2u);
        OseoValue value = oseo_number(55.0);
        return oseo_call_function(
            context,
            arguments[0],
            oseo_undefined(),
            1u,
            &value,
            oseo_undefined()
        );
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
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result;
    oseo_context_init(&context, "promise", 7u);
    oseo_context_set_function_dispatcher(&context, dispatch);
    result = oseo_roots_allocate(&context, &frame, 24u);
    assert(result.status == OSEO_STATUS_NORMAL);

    result = oseo_environment_create(&context, 0u);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[9] = result.value;
    frame.slots[0] = function(&context, 1u, frame.slots[9]);
    frame.slots[1] = function(&context, 2u, frame.slots[9]);
    frame.slots[2] = function(&context, 3u, frame.slots[9]);
    frame.slots[10] = function(&context, 4u, frame.slots[9]);
    frame.slots[12] = function(&context, 5u, frame.slots[9]);
    result = oseo_promise_construct(&context, frame.slots[0]);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[3] = result.value;
    assert(oseo_promise_state(frame.slots[3]) == OSEO_PROMISE_FULFILLED);
    result = oseo_promise_result(&context, frame.slots[3]);
    assert(result.status == OSEO_STATUS_NORMAL);
    expect_number(result.value, 99);

    result = oseo_promise_then(
        &context,
        frame.slots[3],
        frame.slots[1],
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[4] = result.value;
    result = oseo_promise_then(
        &context,
        frame.slots[3],
        frame.slots[2],
        oseo_undefined()
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[5] = result.value;
    assert(observation_count == 0u);
    result = oseo_jobs_drain(&context);
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(observation_count == 2u);
    assert(observations[0] == 2u);
    assert(observations[1] == 3u);
    result = oseo_promise_result(&context, frame.slots[4]);
    expect_number(result.value, 101);
    result = oseo_promise_result(&context, frame.slots[5]);
    expect_number(result.value, 102);

    result = oseo_promise_construct(&context, frame.slots[10]);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[6] = result.value;
    result = oseo_promise_resolve_into(
        &context,
        frame.slots[6],
        frame.slots[6]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(oseo_promise_state(frame.slots[6]) == OSEO_PROMISE_REJECTED);
    result = oseo_promise_then(
        &context,
        frame.slots[6],
        oseo_undefined(),
        frame.slots[10]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[11] = result.value;
    result = oseo_jobs_drain(&context);
    assert(result.status == OSEO_STATUS_NORMAL);

    result = oseo_promise_reject(&context, oseo_number(7.0));
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[7] = result.value;
    result = oseo_rejection_checkpoint(&context);
    assert(result.status == OSEO_STATUS_THROW);
    assert(context.unhandled_rejection_count == 1u);
    oseo_context_clear_language_error(&context);
    result = oseo_promise_then(
        &context,
        frame.slots[7],
        oseo_undefined(),
        frame.slots[1]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[8] = result.value;
    assert(context.rejection_handled_count == 1u);
    result = oseo_jobs_drain(&context);
    assert(result.status == OSEO_STATUS_NORMAL);

    result = oseo_object_create(&context, oseo_null());
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[13] = result.value;
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    result = oseo_string_from_units(
        &context,
        then_units,
        sizeof(then_units) / sizeof(*then_units)
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[14] = result.value;
    result = oseo_object_define(
        &context,
        frame.slots[13],
        frame.slots[14],
        frame.slots[12],
        (OseoPropertyAttributes){true, true, true}
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_promise_resolve(&context, frame.slots[13]);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[15] = result.value;
    assert(oseo_promise_state(frame.slots[15]) == OSEO_PROMISE_PENDING);
    result = oseo_jobs_drain(&context);
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_promise_result(&context, frame.slots[15]);
    assert(result.status == OSEO_STATUS_NORMAL);
    expect_number(result.value, 55);

    result = oseo_promise_construct(&context, frame.slots[10]);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[16] = result.value;
    result = oseo_promise_construct(&context, frame.slots[10]);
    assert(result.status == OSEO_STATUS_NORMAL);
    frame.slots[17] = result.value;
    result = oseo_promise_resolve_into(
        &context,
        frame.slots[17],
        frame.slots[16]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_promise_resolve_into(
        &context,
        frame.slots[16],
        oseo_number(23.0)
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    assert(oseo_promise_state(frame.slots[17]) == OSEO_PROMISE_PENDING);
    result = oseo_jobs_drain(&context);
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_promise_result(&context, frame.slots[17]);
    assert(result.status == OSEO_STATUS_NORMAL);
    expect_number(result.value, 23);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
