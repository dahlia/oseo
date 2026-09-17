#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>

/*
 * Collector-facing contracts the weak-collections component adds on top of
 * the ephemeron checkpoint: the address-keyed index stays synchronized
 * with source-level deletion and collector unlinking, unregister tokens
 * are weak, an unregistered queued record is skipped, one registry's
 * records dequeue together past another registry's, KeptAlive roots
 * last exactly until they are cleared, and every promise job and timer
 * turn, including one that an internal await drives, starts without the
 * KeptAlive set of the job before it. An internal await that drives several
 * timers also runs the cleanup jobs one timer queued before the next.
 */

#define KEY_COUNT ((size_t)48u)

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue node(OseoContext *context) {
    return require_normal(oseo_environment_create(context, 1u));
}

static void assert_value(OseoValue table, OseoValue key, OseoValue expected) {
    OseoValue found = oseo_undefined();
    assert(oseo_internal_ephemeron_get(table, key, &found));
    assert(found == expected);
}

static void assert_absent(OseoValue table, OseoValue key) {
    OseoValue found = oseo_undefined();
    assert(!oseo_internal_ephemeron_get(table, key, &found));
    assert(found == oseo_undefined());
}

static void test_index_survives_delete_and_clearing(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "weak-index", sizeof("weak-index") - 1u);
    require_normal(oseo_roots_allocate(&context, &frame, KEY_COUNT + 2u));
    OseoValue *keys = &frame.slots[2];
    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    for (size_t index = 0u; index < KEY_COUNT; index += 1u) {
        keys[index] = node(&context);
        require_normal(oseo_internal_ephemeron_set(
            &context,
            frame.slots[0],
            keys[index],
            oseo_number((double)index)
        ));
    }
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == KEY_COUNT);

    /* Delete the head, the tail, and every third inner entry. */
    for (size_t index = 0u; index < KEY_COUNT; index += 3u) {
        assert(oseo_internal_ephemeron_delete(frame.slots[0], keys[index]));
        assert(!oseo_internal_ephemeron_delete(frame.slots[0], keys[index]));
    }
    assert(oseo_internal_ephemeron_delete(
        frame.slots[0],
        keys[KEY_COUNT - 1u]
    ));
    assert(!oseo_internal_ephemeron_delete(frame.slots[0], oseo_number(1.0)));
    assert(!oseo_internal_ephemeron_delete(oseo_undefined(), keys[1]));
    size_t live = 0u;
    for (size_t index = 0u; index < KEY_COUNT; index += 1u) {
        if (index % 3u == 0u || index == KEY_COUNT - 1u) {
            assert_absent(frame.slots[0], keys[index]);
        } else {
            assert_value(
                frame.slots[0],
                keys[index],
                oseo_number((double)index)
            );
            live += 1u;
        }
    }
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == live);

    /* The chain still links every survivor in both directions. */
    OseoEphemeronTable *table = ephemeron_table_object(frame.slots[0]);
    size_t forward = 0u;
    OseoValue previous = oseo_undefined();
    for (OseoValue cursor = table->head;
         tag_of(cursor) == OSEO_TAG_HEAP;
         cursor = ephemeron_entry_object(cursor)->next) {
        assert(ephemeron_entry_object(cursor)->previous == previous);
        previous = cursor;
        forward += 1u;
    }
    assert(forward == live);
    assert(table->tail == previous);

    /* Deleted entries are unreachable, so the sweep frees them, and keys
     * that die unlink through the collector's own index update. */
    for (size_t index = 1u; index < KEY_COUNT; index += 3u) {
        keys[index] = oseo_undefined();
    }
    oseo_collect(&context);
    live = 0u;
    for (size_t index = 0u; index < KEY_COUNT; index += 1u) {
        if (index % 3u == 2u && index != KEY_COUNT - 1u) {
            assert_value(
                frame.slots[0],
                keys[index],
                oseo_number((double)index)
            );
            live += 1u;
        }
    }
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == live);

    /* Tombstones from both paths are reused by later insertions, which
     * rebuild the index more than once. */
    for (size_t round = 0u; round < 4u; round += 1u) {
        for (size_t index = 0u; index < KEY_COUNT; index += 3u) {
            keys[index] = node(&context);
            require_normal(oseo_internal_ephemeron_set(
                &context,
                frame.slots[0],
                keys[index],
                oseo_number((double)round)
            ));
        }
        for (size_t index = 0u; index < KEY_COUNT; index += 3u) {
            assert_value(
                frame.slots[0],
                keys[index],
                oseo_number((double)round)
            );
            assert(oseo_internal_ephemeron_delete(
                frame.slots[0],
                keys[index]
            ));
        }
        oseo_collect(&context);
    }
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == live);
    table = ephemeron_table_object(frame.slots[0]);
    assert(table->index_used <= table->index_capacity / 4u * 3u);

    frame.slots[1] = node(&context);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[1]
    ));
    assert_value(frame.slots[0], frame.slots[1], frame.slots[1]);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_index_reuses_tombstones(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "weak-reuse", sizeof("weak-reuse") - 1u);
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    for (size_t index = 1u; index < 4u; index += 1u) {
        frame.slots[index] = node(&context);
        require_normal(oseo_internal_ephemeron_set(
            &context,
            frame.slots[0],
            frame.slots[index],
            oseo_number((double)index)
        ));
    }
    OseoEphemeronTable *table = ephemeron_table_object(frame.slots[0]);
    size_t capacity = table->index_capacity;
    assert(table->index_used == 3u);
    /* A delete leaves a tombstone on the key's own probe path, so adding
     * the key again reuses a removed slot instead of consuming an empty
     * one, and repeated churn never rebuilds the index. */
    for (size_t round = 0u; round < 64u; round += 1u) {
        assert(oseo_internal_ephemeron_delete(frame.slots[0], frame.slots[1]));
        require_normal(oseo_internal_ephemeron_set(
            &context,
            frame.slots[0],
            frame.slots[1],
            oseo_number((double)round)
        ));
        table = ephemeron_table_object(frame.slots[0]);
        assert(table->index_used == 3u);
        assert(table->index_capacity == capacity);
        assert_value(
            frame.slots[0],
            frame.slots[1],
            oseo_number((double)round)
        );
    }
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_unregister_tokens(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "weak-tokens", sizeof("weak-tokens") - 1u);
    require_normal(oseo_roots_allocate(&context, &frame, 8u));
    frame.slots[0] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            oseo_undefined()
        )
    );
    frame.slots[1] = node(&context);
    frame.slots[2] = node(&context);
    frame.slots[3] = node(&context);
    frame.slots[4] = node(&context);
    /* Target 1 uses token 2; target 3 uses itself as its token; target 4
     * shares token 2. */
    require_normal(oseo_internal_finalization_register_token(
        &context,
        frame.slots[0],
        frame.slots[1],
        oseo_number(1.0),
        frame.slots[2]
    ));
    require_normal(oseo_internal_finalization_register_token(
        &context,
        frame.slots[0],
        frame.slots[3],
        oseo_number(3.0),
        frame.slots[3]
    ));
    require_normal(oseo_internal_finalization_register_token(
        &context,
        frame.slots[0],
        frame.slots[4],
        oseo_number(4.0),
        frame.slots[2]
    ));

    /* A self token is weak, so its target still dies and queues. */
    frame.slots[3] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 1u);
    OseoFinalizationRegistry *registry =
        finalization_registry_object(frame.slots[0]);
    OseoFinalizationCell *self_cell = finalization_cell_object(
        finalization_cell_object(registry->cell_head)->next
    );
    assert(self_cell->unregister_token == oseo_undefined());

    /* Unregistering a queued record removes it before cleanup. */
    frame.slots[1] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 2u);
    assert(oseo_internal_finalization_unregister(
        &context,
        frame.slots[0],
        frame.slots[2]
    ));
    assert(context.finalization_pending_count == 1u);
    assert(!oseo_internal_finalization_unregister(
        &context,
        frame.slots[0],
        frame.slots[2]
    ));
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[5],
        &frame.slots[6]
    ));
    assert(frame.slots[5] == frame.slots[0]);
    assert(frame.slots[6] == oseo_number(3.0));
    assert(!oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[5],
        &frame.slots[6]
    ));

    /* The unregistered live target never queues after it dies. */
    frame.slots[4] = oseo_undefined();
    frame.slots[2] = oseo_undefined();
    oseo_collect(&context);
    oseo_collect(&context);
    assert(context.finalization_pending_count == 0u);
    registry = finalization_registry_object(frame.slots[0]);
    assert(registry->cell_head == oseo_undefined());
    assert(!oseo_internal_finalization_unregister(
        &context,
        frame.slots[0],
        oseo_number(1.0)
    ));

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

/* Registries 0 and 1 hold targets 2, 3, 4, and 5 in that order. */
static void register_grouped(OseoContext *context, OseoValue *slots) {
    for (size_t index = 0u; index < 4u; index += 1u) {
        slots[2u + index] = node(context);
        require_normal(oseo_internal_finalization_register_token(
            context,
            slots[index == 1u ? 1u : 0u],
            slots[2u + index],
            oseo_number((double)index),
            index == 2u ? slots[6] : oseo_undefined()
        ));
    }
}

static void assert_registry_take(
    OseoContext *context,
    OseoValue registry,
    OseoValue *holdings,
    double expected
) {
    assert(oseo_internal_finalization_take_registry_cleanup(
        context,
        registry,
        holdings
    ));
    assert(*holdings == oseo_number(expected));
}

static void test_registry_cleanup_grouping(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "weak-group", sizeof("weak-group") - 1u);
    require_normal(oseo_roots_allocate(&context, &frame, 9u));
    for (size_t index = 0u; index < 2u; index += 1u) {
        frame.slots[index] = require_normal(
            oseo_internal_finalization_registry_create(
                &context,
                oseo_undefined()
            )
        );
    }
    frame.slots[6] = node(&context);
    register_grouped(&context, frame.slots);
    for (size_t index = 2u; index < 6u; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.finalization_pending_count == 4u);

    /* Queue: 0/r0, 1/r1, 2/r0 (token), 3/r0. The first take picks the
     * job's registry; its later records dequeue past registry 1's. */
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[7],
        &frame.slots[8]
    ));
    assert(frame.slots[7] == frame.slots[0]);
    assert(frame.slots[8] == oseo_number(0.0));
    /* An unregister during the job removes a record not yet called. */
    assert(oseo_internal_finalization_unregister(
        &context,
        frame.slots[0],
        frame.slots[6]
    ));
    assert_registry_take(&context, frame.slots[0], &frame.slots[8], 3.0);
    assert(!oseo_internal_finalization_take_registry_cleanup(
        &context,
        frame.slots[0],
        &frame.slots[8]
    ));
    assert(!oseo_internal_finalization_take_registry_cleanup(
        &context,
        oseo_number(1.0),
        &frame.slots[8]
    ));
    assert(context.finalization_pending_count == 1u);
    assert_registry_take(&context, frame.slots[1], &frame.slots[8], 1.0);
    assert(context.finalization_pending_count == 0u);
    assert(context.finalization_head == oseo_undefined());
    assert(context.finalization_tail == oseo_undefined());

    /* Removing the tail record past registry 1's keeps appends linked. */
    register_grouped(&context, frame.slots);
    for (size_t index = 2u; index < 6u; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert_registry_take(&context, frame.slots[0], &frame.slots[8], 0.0);
    assert_registry_take(&context, frame.slots[0], &frame.slots[8], 2.0);
    assert_registry_take(&context, frame.slots[0], &frame.slots[8], 3.0);
    assert(context.finalization_tail == context.finalization_head);
    frame.slots[2] = node(&context);
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[1],
        frame.slots[2],
        oseo_number(4.0)
    ));
    frame.slots[2] = oseo_undefined();
    oseo_collect(&context);
    assert_registry_take(&context, frame.slots[1], &frame.slots[8], 1.0);
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[7],
        &frame.slots[8]
    ));
    assert(frame.slots[7] == frame.slots[1]);
    assert(frame.slots[8] == oseo_number(4.0));
    assert(context.finalization_tail == oseo_undefined());

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_kept_objects(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "weak-kept", sizeof("weak-kept") - 1u);
    require_normal(oseo_roots_allocate(&context, &frame, 2u));
    frame.slots[0] = node(&context);
    frame.slots[1] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[0]
    ));
    require_normal(oseo_internal_keep_during_job(&context, frame.slots[0]));
    require_normal(oseo_internal_keep_during_job(&context, frame.slots[0]));
    require_normal(oseo_internal_keep_during_job(&context, oseo_number(1.0)));
    assert(context.kept_object_count == 1u);
    frame.slots[0] = oseo_undefined();
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[1]) !=
        oseo_undefined());

    /* Growing past one table keeps every earlier member. */
    for (size_t index = 0u; index < 300u; index += 1u) {
        frame.slots[0] = node(&context);
        require_normal(oseo_internal_keep_during_job(
            &context,
            frame.slots[0]
        ));
    }
    frame.slots[0] = oseo_undefined();
    assert(context.kept_object_count == 301u);
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[1]) !=
        oseo_undefined());

    oseo_internal_clear_kept_objects(&context);
    assert(context.kept_object_count == 0u);
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[1]) ==
        oseo_undefined());

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static bool timer_observed_cleared;

/* The timer callback collects, observes its reference, and settles the
 * awaited promise so the internal await returns. */
static OseoResult dispatch_kept_timer(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)new_target;
    assert(argument_count == 2u);
    assert(context->kept_object_count == 0u);
    oseo_collect(context);
    timer_observed_cleared =
        oseo_internal_weak_reference_target(arguments[0]) == oseo_undefined();
    return oseo_promise_resolve_into(context, arguments[1], oseo_undefined());
}

static void test_internal_await_timer_ends_kept_objects(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "weak-await-timer",
        sizeof("weak-await-timer") - 1u
    );
    oseo_context_set_function_dispatcher(&context, dispatch_kept_timer);
    require_normal(oseo_roots_allocate(&context, &frame, 5u));
    frame.slots[0] = node(&context);
    frame.slots[1] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[0]
    ));
    require_normal(oseo_internal_keep_during_job(&context, frame.slots[0]));
    frame.slots[0] = oseo_undefined();
    frame.slots[2] = require_normal(oseo_internal_promise_create(&context));
    frame.slots[3] = require_normal(oseo_function_create(
        &context,
        1u,
        node(&context),
        NULL,
        0u,
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    frame.slots[4] = oseo_number(0.0);
    OseoValue arguments[4] = {
        frame.slots[3],
        frame.slots[4],
        frame.slots[1],
        frame.slots[2],
    };
    require_normal(oseo_set_timeout(&context, 4u, arguments));

    /* The awaiting job still holds the target, so only the timer turn
     * that the await drives may end its KeptAlive set. */
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[1]) !=
        oseo_undefined());
    timer_observed_cleared = false;
    require_normal(oseo_internal_await_step(&context, frame.slots[2]));
    assert(timer_observed_cleared);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static OseoValue kept_function(OseoContext *context) {
    return require_normal(oseo_function_create(
        context,
        1u,
        node(context),
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
}

static size_t reaction_step;
static bool reaction_observed_cleared;

/*
 * The first reaction starts without the enqueuing job's KeptAlive set,
 * then keeps a fresh target and fulfills with its reference. The second
 * reaction runs in the same drain and must see neither set.
 */
static OseoResult dispatch_kept_reaction(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)new_target;
    assert(argument_count == 1u);
    assert(context->kept_object_count == 0u);
    reaction_step += 1u;
    oseo_collect(context);
    if (reaction_step == 1u) {
        assert(oseo_internal_weak_reference_target(arguments[0]) ==
            oseo_undefined());
        OseoValue target = node(context);
        require_normal(oseo_internal_keep_during_job(context, target));
        return oseo_internal_weak_reference_create(context, target);
    }
    reaction_observed_cleared =
        oseo_internal_weak_reference_target(arguments[0]) == oseo_undefined();
    return normal(oseo_undefined());
}

/* A job holds a target, then queues two chained reactions. */
static void enqueue_kept_reactions(OseoContext *context, OseoValue *slots) {
    slots[0] = node(context);
    slots[1] = require_normal(oseo_internal_weak_reference_create(
        context,
        slots[0]
    ));
    require_normal(oseo_internal_keep_during_job(context, slots[0]));
    slots[0] = oseo_undefined();
    slots[2] = require_normal(oseo_promise_resolve(context, slots[1]));
    slots[3] = kept_function(context);
    slots[2] = require_normal(oseo_promise_then(
        context,
        slots[2],
        slots[3],
        oseo_undefined()
    ));
    slots[2] = require_normal(oseo_promise_then(
        context,
        slots[2],
        slots[3],
        oseo_undefined()
    ));
    oseo_collect(context);
    assert(oseo_internal_weak_reference_target(slots[1]) != oseo_undefined());
    reaction_step = 0u;
    reaction_observed_cleared = false;
}

static void test_promise_jobs_end_kept_objects(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "weak-promise-jobs",
        sizeof("weak-promise-jobs") - 1u
    );
    oseo_context_set_function_dispatcher(&context, dispatch_kept_reaction);
    require_normal(oseo_roots_allocate(&context, &frame, 4u));

    /* One drain runs both reactions as separate jobs. */
    enqueue_kept_reactions(&context, frame.slots);
    require_normal(oseo_jobs_drain(&context));
    assert(reaction_step == 2u);
    assert(reaction_observed_cleared);

    /* An internal await drains the same reactions until its promise
     * settles, so they also end the awaiting job's set and each other's. */
    enqueue_kept_reactions(&context, frame.slots);
    require_normal(oseo_internal_await_step(&context, frame.slots[2]));
    assert(reaction_step == 2u);
    assert(reaction_observed_cleared);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static size_t cleanup_timer_calls;
static double cleanup_holdings;

/*
 * Timer 1 drops the only reference to a registered target and collects, so
 * its record is queued. The cleanup job for that record must run before
 * timer 2, which settles the awaited promise.
 */
static OseoResult dispatch_cleanup_timers(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)new_target;
    if (argument_count == 1u) {
        assert(cleanup_holdings == 0.0);
        cleanup_holdings = number_value(arguments[0]);
        return normal(oseo_undefined());
    }
    assert(argument_count == 2u);
    cleanup_timer_calls += 1u;
    if (cleanup_timer_calls == 1u) {
        require_normal(oseo_environment_set(
            context,
            arguments[1],
            0u,
            oseo_undefined()
        ));
        oseo_collect(context);
        assert(context->finalization_pending_count == 1u);
        assert(cleanup_holdings == 0.0);
        return normal(oseo_undefined());
    }
    assert(cleanup_holdings == 7.0);
    return oseo_promise_resolve_into(context, arguments[1], oseo_undefined());
}

static void test_internal_await_timers_run_cleanup_between(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "weak-await-cleanup",
        sizeof("weak-await-cleanup") - 1u
    );
    oseo_context_set_function_dispatcher(&context, dispatch_cleanup_timers);
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    frame.slots[2] = node(&context);
    frame.slots[0] = require_normal(oseo_function_create(
        &context,
        1u,
        frame.slots[2],
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    frame.slots[1] = require_normal(
        oseo_internal_finalization_registry_create(&context, frame.slots[0])
    );
    frame.slots[2] = node(&context);
    frame.slots[3] = node(&context);
    require_normal(oseo_environment_set(
        &context,
        frame.slots[2],
        0u,
        frame.slots[3]
    ));
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[1],
        frame.slots[3],
        oseo_number(7.0)
    ));
    frame.slots[3] = require_normal(oseo_internal_promise_create(&context));
    OseoValue first[4] = {
        frame.slots[0],
        oseo_number(0.0),
        oseo_number(1.0),
        frame.slots[2],
    };
    require_normal(oseo_set_timeout(&context, 4u, first));
    OseoValue second[4] = {
        frame.slots[0],
        oseo_number(0.0),
        oseo_number(2.0),
        frame.slots[3],
    };
    require_normal(oseo_set_timeout(&context, 4u, second));

    cleanup_timer_calls = 0u;
    cleanup_holdings = 0.0;
    require_normal(oseo_internal_await_step(&context, frame.slots[3]));
    assert(cleanup_timer_calls == 2u);
    assert(cleanup_holdings == 7.0);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

int main(void) {
    test_index_survives_delete_and_clearing();
    test_index_reuses_tombstones();
    test_unregister_tokens();
    test_registry_cleanup_grouping();
    test_kept_objects();
    test_internal_await_timer_ends_kept_objects();
    test_promise_jobs_end_kept_objects();
    test_internal_await_timers_run_cleanup_between();
    return 0;
}
