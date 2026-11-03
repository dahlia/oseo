#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>
#include <stdlib.h>

/*
 * Drives the runtime module evaluation driver directly with C evaluators.
 * Code 100 + k is a synchronous evaluator that records k, code 200 + k an
 * asynchronous one that records k + 100 and returns a pending promise
 * held in `pending[k]`, code 300 a synchronous evaluator that throws 7,
 * code 400 a shared synchronous chain evaluator, and codes 500 and 501
 * reactions that record their code and argument.
 */

enum { observation_limit = 32 };

static size_t observations[observation_limit];
static OseoValue reaction_values[observation_limit];
static size_t observation_count;
static size_t chain_runs;
static OseoValue held[8];

static void observe(size_t value) {
    assert(observation_count < observation_limit);
    observations[observation_count] = value;
    observation_count += 1u;
}

static void expect_observations(const size_t *expected, size_t count) {
    assert(observation_count == count);
    for (size_t index = 0u; index < count; index += 1u) {
        assert(observations[index] == expected[index]);
    }
}

static void expect_number(OseoValue value, int64_t expected) {
    assert(oseo_value_is_smi(value));
    assert(oseo_value_unbox_smi(value) == expected);
}

static OseoValue construct_pending_promise(OseoContext *context);

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
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id >= 100u && code_id < 200u) {
        observe(code_id - 100u);
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id >= 200u && code_id < 300u) {
        observe(code_id - 100u);
        held[code_id - 200u] = construct_pending_promise(context);
        return (OseoResult){OSEO_STATUS_NORMAL, held[code_id - 200u]};
    }
    if (code_id == 300u) {
        observe(300u);
        return (OseoResult){OSEO_STATUS_THROW, oseo_number(7.0)};
    }
    if (code_id == 400u) {
        chain_runs += 1u;
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    if (code_id == 500u || code_id == 501u) {
        reaction_values[observation_count] = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        observe(code_id);
        return (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()};
    }
    return oseo_unknown_function(context, code_id);
}

static OseoValue function(OseoContext *context, size_t code_id) {
    OseoResult environment = oseo_environment_create(context, 0u);
    assert(environment.status == OSEO_STATUS_NORMAL);
    OseoValue slots[1] = {environment.value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_function_create(
        context,
        code_id,
        slots[0],
        NULL,
        0u,
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
    oseo_roots_pop(context, &frame);
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue construct_pending_promise(OseoContext *context) {
    OseoResult constructor = oseo_intrinsic(context, OSEO_INTRINSIC_PROMISE);
    assert(constructor.status == OSEO_STATUS_NORMAL);
    OseoValue slots[3] = {
        oseo_undefined(),
        constructor.value,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    slots[0] = function(context, 1u);
    OseoResult result = oseo_function_prototype(context, slots[1]);
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_constructor_receiver(context, result.value);
    assert(result.status == OSEO_STATUS_NORMAL);
    slots[2] = result.value;
    result = oseo_call_function(
        context,
        slots[1],
        slots[2],
        1u,
        &slots[0],
        slots[1]
    );
    assert(result.status == OSEO_STATUS_NORMAL);
    result = oseo_constructor_result(context, result.value, slots[2]);
    assert(result.status == OSEO_STATUS_NORMAL);
    oseo_roots_pop(context, &frame);
    assert(oseo_promise_state(result.value) == OSEO_PROMISE_PENDING);
    return result.value;
}

/* One module of a table: its evaluator code and requested modules. */
typedef struct {
    size_t code_id;
    bool asynchronous;
    size_t request_count;
    size_t requests[2];
} ModuleSpec;

/* Builds the table arguments; `frame` roots every evaluator. */
static OseoValue install(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t entry,
    const ModuleSpec *modules,
    size_t count
) {
    size_t argument_count = 2u;
    for (size_t index = 0u; index < count; index += 1u) {
        argument_count += 3u + modules[index].request_count;
    }
    OseoResult result = oseo_roots_allocate(context, frame, argument_count);
    assert(result.status == OSEO_STATUS_NORMAL);
    OseoValue *arguments = frame->slots;
    size_t position = 0u;
    arguments[position++] = oseo_number((double)entry);
    arguments[position++] = oseo_number((double)count);
    for (size_t index = 0u; index < count; index += 1u) {
        arguments[position++] = function(context, modules[index].code_id);
        arguments[position++] = oseo_number(modules[index].asynchronous);
        arguments[position++] =
            oseo_number((double)modules[index].request_count);
        for (size_t request = 0u;
             request < modules[index].request_count;
             request += 1u) {
            arguments[position++] =
                oseo_number((double)modules[index].requests[request]);
        }
    }
    result = oseo_module_graph_evaluate(context, argument_count, arguments);
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue evaluate(OseoContext *context, size_t index) {
    OseoResult result = oseo_module_evaluate(context, index);
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static void then(
    OseoContext *context,
    OseoValue promise,
    size_t fulfilled_code,
    size_t rejected_code
) {
    OseoValue slots[3] = {promise, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    if (fulfilled_code != 0u) slots[1] = function(context, fulfilled_code);
    if (rejected_code != 0u) slots[2] = function(context, rejected_code);
    OseoResult result =
        oseo_promise_then(context, slots[0], slots[1], slots[2]);
    assert(result.status == OSEO_STATUS_NORMAL);
    oseo_roots_pop(context, &frame);
}

static void drain(OseoContext *context) {
    OseoResult result = oseo_jobs_drain(context);
    assert(result.status == OSEO_STATUS_NORMAL);
}

static void begin(OseoContext *context, OseoRootFrame *held_frame) {
    oseo_context_init(context, "module-driver", 13u);
    oseo_context_set_function_dispatcher(context, dispatch);
    for (size_t index = 0u; index < 8u; index += 1u) {
        held[index] = oseo_undefined();
    }
    *held_frame = (OseoRootFrame){NULL, held, 8u};
    oseo_roots_push(context, held_frame);
    observation_count = 0u;
    chain_runs = 0u;
}

static void end(
    OseoContext *context,
    OseoRootFrame *held_frame,
    OseoRootFrame *table_frame,
    OseoRootFrame *promises
) {
    oseo_roots_release(context, table_frame);
    oseo_roots_pop(context, promises);
    oseo_roots_pop(context, held_frame);
    oseo_context_destroy(context);
}

/*
 * A later Evaluate of a module whose asynchronous evaluation already
 * finished settles its new capability, and repeated Evaluates of one
 * cycle root share its capability.
 */
static void fulfilled_reentry(void) {
    OseoContext context;
    OseoRootFrame held_frame;
    OseoRootFrame table = {NULL, NULL, 0u};
    OseoValue promises[4];
    OseoRootFrame promise_frame = {NULL, promises, 4u};
    begin(&context, &held_frame);
    for (size_t index = 0u; index < 4u; index += 1u) {
        promises[index] = oseo_undefined();
    }
    oseo_roots_push(&context, &promise_frame);
    const ModuleSpec modules[] = {
        {100u, false, 1u, {1u, 0u}},
        {101u, false, 1u, {2u, 0u}},
        {202u, true, 0u, {0u, 0u}},
    };
    promises[0] = install(&context, &table, 0u, modules, 3u);
    expect_observations((const size_t[]){102u}, 1u);
    assert(oseo_promise_state(promises[0]) == OSEO_PROMISE_PENDING);
    promises[1] = evaluate(&context, 1u);
    assert(promises[1] != promises[0]);
    assert(oseo_promise_state(promises[1]) == OSEO_PROMISE_PENDING);
    then(&context, promises[1], 500u, 0u);
    then(&context, promises[0], 501u, 0u);
    OseoResult result =
        oseo_promise_resolve_into(&context, held[2], oseo_undefined());
    assert(result.status == OSEO_STATUS_NORMAL);
    drain(&context);
    expect_observations((const size_t[]){102u, 1u, 0u, 500u, 501u}, 5u);
    assert(oseo_promise_state(promises[0]) == OSEO_PROMISE_FULFILLED);
    assert(oseo_promise_state(promises[1]) == OSEO_PROMISE_FULFILLED);
    promises[2] = evaluate(&context, 2u);
    assert(oseo_promise_state(promises[2]) == OSEO_PROMISE_FULFILLED);
    assert(evaluate(&context, 2u) == promises[2]);
    assert(evaluate(&context, 1u) == promises[1]);
    assert(evaluate(&context, 0u) == promises[0]);
    drain(&context);
    assert(observation_count == 5u);
    end(&context, &held_frame, &table, &promise_frame);
}

/*
 * A rejected leaf rejects every waiting capability leaf to root, and its
 * importers never run. A later Evaluate of the leaf rejects a new
 * capability with the same error.
 */
static void rejection_order(void) {
    OseoContext context;
    OseoRootFrame held_frame;
    OseoRootFrame table = {NULL, NULL, 0u};
    OseoValue promises[4];
    OseoRootFrame promise_frame = {NULL, promises, 4u};
    begin(&context, &held_frame);
    for (size_t index = 0u; index < 4u; index += 1u) {
        promises[index] = oseo_undefined();
    }
    oseo_roots_push(&context, &promise_frame);
    const ModuleSpec modules[] = {
        {100u, false, 2u, {1u, 3u}},
        {101u, false, 1u, {2u, 0u}},
        {202u, true, 0u, {0u, 0u}},
        {103u, false, 0u, {0u, 0u}},
    };
    promises[0] = install(&context, &table, 0u, modules, 4u);
    expect_observations((const size_t[]){102u, 3u}, 2u);
    promises[1] = evaluate(&context, 1u);
    then(&context, promises[0], 0u, 501u);
    then(&context, promises[1], 0u, 500u);
    OseoResult result =
        oseo_promise_reject_into(&context, held[2], oseo_number(9.0));
    assert(result.status == OSEO_STATUS_NORMAL);
    drain(&context);
    expect_observations((const size_t[]){102u, 3u, 500u, 501u}, 4u);
    expect_number(reaction_values[2], 9);
    expect_number(reaction_values[3], 9);
    promises[2] = evaluate(&context, 2u);
    assert(oseo_promise_state(promises[2]) == OSEO_PROMISE_REJECTED);
    result = oseo_promise_result(&context, promises[2]);
    expect_number(result.value, 9);
    assert(evaluate(&context, 1u) == promises[1]);
    then(&context, promises[2], 0u, 500u);
    drain(&context);
    end(&context, &held_frame, &table, &promise_frame);
}

/*
 * A synchronous throw rejects the entry while an asynchronous sibling is
 * still running. The sibling's later fulfillment runs no errored
 * importer, and each module answers a later Evaluate by its own state.
 */
static void synchronous_error(void) {
    OseoContext context;
    OseoRootFrame held_frame;
    OseoRootFrame table = {NULL, NULL, 0u};
    OseoValue promises[4];
    OseoRootFrame promise_frame = {NULL, promises, 4u};
    begin(&context, &held_frame);
    for (size_t index = 0u; index < 4u; index += 1u) {
        promises[index] = oseo_undefined();
    }
    oseo_roots_push(&context, &promise_frame);
    const ModuleSpec modules[] = {
        {100u, false, 2u, {1u, 2u}},
        {201u, true, 0u, {0u, 0u}},
        {300u, false, 0u, {0u, 0u}},
    };
    promises[0] = install(&context, &table, 0u, modules, 3u);
    expect_observations((const size_t[]){101u, 300u}, 2u);
    assert(oseo_promise_state(promises[0]) == OSEO_PROMISE_REJECTED);
    OseoResult result = oseo_promise_result(&context, promises[0]);
    expect_number(result.value, 7);
    then(&context, promises[0], 0u, 501u);
    result = oseo_promise_resolve_into(&context, held[1], oseo_undefined());
    assert(result.status == OSEO_STATUS_NORMAL);
    drain(&context);
    expect_observations((const size_t[]){101u, 300u, 501u}, 3u);
    promises[1] = evaluate(&context, 1u);
    assert(oseo_promise_state(promises[1]) == OSEO_PROMISE_FULFILLED);
    promises[2] = evaluate(&context, 2u);
    assert(oseo_promise_state(promises[2]) == OSEO_PROMISE_REJECTED);
    result = oseo_promise_result(&context, promises[2]);
    expect_number(result.value, 7);
    then(&context, promises[2], 0u, 500u);
    assert(evaluate(&context, 0u) == promises[0]);
    drain(&context);
    end(&context, &held_frame, &table, &promise_frame);
}

/*
 * A chain deeper than any native stack would allow for one C frame per
 * module: its depth-first walk, its ancestor gathering, and its rejection
 * walk all run over explicit stacks.
 */
static void deep_chain(size_t length, bool reject) {
    OseoContext context;
    OseoRootFrame held_frame;
    OseoRootFrame table = {NULL, NULL, 0u};
    OseoValue promises[1] = {oseo_undefined()};
    OseoRootFrame promise_frame = {NULL, promises, 1u};
    begin(&context, &held_frame);
    oseo_roots_push(&context, &promise_frame);
    ModuleSpec *modules = calloc(length, sizeof(*modules));
    assert(modules != NULL);
    for (size_t index = 0u; index + 1u < length; index += 1u) {
        modules[index] = (ModuleSpec){400u, false, 1u, {index + 1u, 0u}};
    }
    modules[length - 1u] = (ModuleSpec){200u, true, 0u, {0u, 0u}};
    promises[0] = install(&context, &table, 0u, modules, length);
    free(modules);
    assert(chain_runs == 0u);
    OseoResult result = reject
        ? oseo_promise_reject_into(&context, held[0], oseo_number(5.0))
        : oseo_promise_resolve_into(&context, held[0], oseo_undefined());
    assert(result.status == OSEO_STATUS_NORMAL);
    drain(&context);
    if (reject) {
        assert(chain_runs == 0u);
        assert(oseo_promise_state(promises[0]) == OSEO_PROMISE_REJECTED);
        result = oseo_promise_result(&context, promises[0]);
        expect_number(result.value, 5);
        assert(
            oseo_promise_state(evaluate(&context, length / 2u)) ==
            OSEO_PROMISE_REJECTED
        );
    } else {
        assert(chain_runs == length - 1u);
        assert(oseo_promise_state(promises[0]) == OSEO_PROMISE_FULFILLED);
        assert(
            oseo_promise_state(evaluate(&context, length / 2u)) ==
            OSEO_PROMISE_FULFILLED
        );
    }
    end(&context, &held_frame, &table, &promise_frame);
}

int main(void) {
    fulfilled_reentry();
    rejection_order();
    synchronous_error();
    /* Collecting at every safepoint makes each step quadratic. */
    size_t length = getenv("OSEO_GC_EVERY_SAFEPOINT") == NULL
        ? 50000u
        : 1000u;
    deep_chain(length, false);
    deep_chain(length, true);
    return 0;
}
