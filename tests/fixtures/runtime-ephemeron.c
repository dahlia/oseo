#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue node(OseoContext *context) {
    return require_normal(oseo_environment_create(context, 1u));
}

static void assert_live_target(OseoValue reference) {
    assert(oseo_internal_weak_reference_target(reference) != oseo_undefined());
}

static void assert_cleared_target(OseoValue reference) {
    assert(oseo_internal_weak_reference_target(reference) == oseo_undefined());
}

static void test_queued_registries_stay_live(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoValue expected[3];
    oseo_context_init(
        &context,
        "queued-registries",
        sizeof("queued-registries") - 1u
    );
    require_normal(oseo_roots_allocate(&context, &frame, 10u));

    for (size_t index = 0u; index < 3u; index += 1u) {
        frame.slots[index] = require_normal(
            oseo_internal_finalization_registry_create(
                &context,
                oseo_number((double)(10u + index))
            )
        );
        expected[index] = frame.slots[index];
        frame.slots[3u + index] = node(&context);
        require_normal(oseo_internal_finalization_register(
            &context,
            frame.slots[index],
            frame.slots[3u + index],
            oseo_number((double)(index + 1u))
        ));
        frame.slots[3u + index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.finalization_pending_count == 3u);

    frame.slots[0] = oseo_undefined();
    frame.slots[1] = oseo_undefined();
    frame.slots[2] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 3u);
    for (size_t index = 0u; index < 3u; index += 1u) {
        assert(oseo_internal_finalization_take_cleanup(
            &context,
            &frame.slots[6u + index],
            &frame.slots[9]
        ));
        assert(frame.slots[6u + index] == expected[index]);
        assert(frame.slots[9] == oseo_number((double)(index + 1u)));
        assert(
            finalization_registry_object(frame.slots[6u + index])->callback ==
            oseo_number((double)(10u + index))
        );
    }
    assert(!oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[6],
        &frame.slots[9]
    ));
    assert(context.finalization_pending_count == 0u);

    oseo_collect(&context);
    for (size_t index = 0u; index < 3u; index += 1u) {
        OseoFinalizationRegistry *registry =
            finalization_registry_object(frame.slots[6u + index]);
        assert(registry->cell_head == oseo_undefined());
        assert(registry->cell_tail == oseo_undefined());
    }

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_dropped_registry_does_not_queue(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "dropped-registry",
        sizeof("dropped-registry") - 1u
    );
    require_normal(oseo_roots_allocate(&context, &frame, 3u));
    frame.slots[0] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            oseo_undefined()
        )
    );
    frame.slots[1] = node(&context);
    frame.slots[2] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[1]
    ));
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[0],
        frame.slots[1],
        oseo_number(1.0)
    ));

    frame.slots[0] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 0u);
    assert_live_target(frame.slots[2]);
    frame.slots[1] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 0u);
    assert_cleared_target(frame.slots[2]);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_dead_table_does_not_activate_value(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "dead-table",
        sizeof("dead-table") - 1u
    );
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[1] = node(&context);
    frame.slots[2] = node(&context);
    frame.slots[3] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[2]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[2]
    ));

    frame.slots[0] = oseo_undefined();
    frame.slots[2] = oseo_undefined();
    oseo_collect(&context);
    assert_cleared_target(frame.slots[3]);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_nested_table_discovery(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "nested-table",
        sizeof("nested-table") - 1u
    );
    require_normal(oseo_roots_allocate(&context, &frame, 6u));
    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[1] = node(&context);
    frame.slots[2] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[3] = node(&context);
    frame.slots[4] = node(&context);
    frame.slots[5] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[4]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[2],
        frame.slots[3],
        frame.slots[4]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[2]
    ));

    frame.slots[2] = oseo_undefined();
    frame.slots[4] = oseo_undefined();
    oseo_collect(&context);
    assert_live_target(frame.slots[5]);

    frame.slots[1] = oseo_undefined();
    oseo_collect(&context);
    assert_cleared_target(frame.slots[5]);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

static void assert_failed_allocation(
    OseoContext *context,
    OseoRootFrame *frame,
    OseoResult result
) {
    assert(result.status == OSEO_STATUS_THROW);
    assert(result.value == oseo_undefined());
    assert(context->allocation_attempts == 1u);
    assert(context->roots == frame);
    oseo_collect(context);
    oseo_context_fail_allocation_at(context, 0u);
    oseo_context_clear_language_error(context);
}

static void test_allocation_failures(void) {
    OseoContext context;
    OseoValue roots[8] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 8u};
    oseo_context_init(
        &context,
        "allocation-failures",
        sizeof("allocation-failures") - 1u
    );
    oseo_roots_push(&context, &frame);
    context.collect_every_safepoint = true;

    oseo_context_fail_allocation_at(&context, 1u);
    assert_failed_allocation(
        &context,
        &frame,
        oseo_internal_ephemeron_table_create(&context)
    );
    roots[0] = require_normal(oseo_internal_ephemeron_table_create(&context));
    roots[1] = node(&context);
    roots[2] = node(&context);

    oseo_context_fail_allocation_at(&context, 1u);
    assert_failed_allocation(
        &context,
        &frame,
        oseo_internal_ephemeron_set(
            &context,
            roots[0],
            roots[1],
            roots[2]
        )
    );
    assert(oseo_internal_ephemeron_live_count(roots[0]) == 0u);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        roots[0],
        roots[1],
        roots[2]
    ));

    oseo_context_fail_allocation_at(&context, 1u);
    assert_failed_allocation(
        &context,
        &frame,
        oseo_internal_weak_reference_create(&context, roots[1])
    );
    roots[3] = require_normal(oseo_internal_weak_reference_create(
        &context,
        roots[1]
    ));
    assert_live_target(roots[3]);

    roots[4] = node(&context);
    oseo_context_fail_allocation_at(&context, 1u);
    assert_failed_allocation(
        &context,
        &frame,
        oseo_internal_finalization_registry_create(&context, roots[4])
    );
    roots[5] = require_normal(
        oseo_internal_finalization_registry_create(&context, roots[4])
    );

    oseo_context_fail_allocation_at(&context, 1u);
    assert_failed_allocation(
        &context,
        &frame,
        oseo_internal_finalization_register(
            &context,
            roots[5],
            roots[1],
            oseo_number(1.0)
        )
    );
    require_normal(oseo_internal_finalization_register(
        &context,
        roots[5],
        roots[1],
        oseo_number(1.0)
    ));

    roots[1] = oseo_undefined();
    roots[2] = oseo_undefined();
    oseo_collect(&context);
    assert_cleared_target(roots[3]);
    assert(context.finalization_pending_count == 1u);
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &roots[6],
        &roots[7]
    ));
    assert(roots[6] == roots[5]);
    assert(roots[7] == oseo_number(1.0));

    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
}

static void test_destroy_nonempty_queue(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(
        &context,
        "destroy-queued",
        sizeof("destroy-queued") - 1u
    );
    require_normal(oseo_roots_allocate(&context, &frame, 2u));
    frame.slots[0] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            oseo_undefined()
        )
    );
    frame.slots[1] = node(&context);
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[0],
        frame.slots[1],
        oseo_number(1.0)
    ));
    frame.slots[1] = oseo_undefined();
    oseo_collect(&context);
    assert(context.finalization_pending_count == 1u);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "runtime-ephemeron", 17u);
    require_normal(oseo_roots_allocate(&context, &frame, 18u));

    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[1] = node(&context);
    frame.slots[2] = node(&context);
    frame.slots[3] = node(&context);
    require_normal(oseo_environment_set(
        &context,
        frame.slots[3],
        0u,
        frame.slots[1]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[2]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[2],
        frame.slots[3]
    ));
    frame.slots[4] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[2]
    ));
    frame.slots[5] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[3]
    ));

    frame.slots[6] = node(&context);
    frame.slots[7] = node(&context);
    require_normal(oseo_environment_set(
        &context,
        frame.slots[7],
        0u,
        frame.slots[6]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[6],
        frame.slots[7]
    ));
    frame.slots[8] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[6]
    ));
    frame.slots[9] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[7]
    ));

    frame.slots[14] = node(&context);
    frame.slots[15] = node(&context);
    frame.slots[10] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            frame.slots[14]
        )
    );
    frame.slots[11] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            frame.slots[15]
        )
    );
    assert(oseo_internal_ephemeron_set(
        &context,
        oseo_undefined(),
        frame.slots[1],
        frame.slots[2]
    ).status == OSEO_STATUS_THROW);
    assert(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        oseo_number(1.0),
        frame.slots[2]
    ).status == OSEO_STATUS_THROW);
    assert(oseo_internal_weak_reference_create(
        &context,
        oseo_number(1.0)
    ).status == OSEO_STATUS_THROW);
    assert(oseo_internal_finalization_register(
        &context,
        oseo_undefined(),
        frame.slots[1],
        oseo_number(1.0)
    ).status == OSEO_STATUS_THROW);
    assert(oseo_internal_finalization_register(
        &context,
        frame.slots[10],
        oseo_number(1.0),
        oseo_number(2.0)
    ).status == OSEO_STATUS_THROW);
    assert(oseo_internal_finalization_register(
        &context,
        frame.slots[10],
        frame.slots[1],
        frame.slots[1]
    ).status == OSEO_STATUS_THROW);
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[11],
        frame.slots[6],
        oseo_number(41.0)
    ));
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[10],
        frame.slots[7],
        oseo_number(42.0)
    ));
    require_normal(oseo_internal_finalization_register(
        &context,
        frame.slots[10],
        frame.slots[3],
        oseo_number(99.0)
    ));
    assert(context.finalization_pending_count == 0u);

    frame.slots[2] = oseo_undefined();
    frame.slots[3] = oseo_undefined();
    frame.slots[6] = oseo_undefined();
    frame.slots[7] = oseo_undefined();
    frame.slots[14] = oseo_undefined();
    frame.slots[15] = oseo_undefined();
    oseo_collect(&context);

    OseoValue second = oseo_undefined();
    OseoValue third = oseo_undefined();
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[1],
        &second
    ));
    assert(second == oseo_internal_weak_reference_target(frame.slots[4]));
    assert(oseo_internal_ephemeron_get(frame.slots[0], second, &third));
    assert(third == oseo_internal_weak_reference_target(frame.slots[5]));
    assert_live_target(frame.slots[4]);
    assert_live_target(frame.slots[5]);
    assert_cleared_target(frame.slots[8]);
    assert_cleared_target(frame.slots[9]);
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 2u);
    assert(context.finalization_pending_count == 2u);

    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[12],
        &frame.slots[13]
    ));
    assert(frame.slots[12] == frame.slots[11]);
    assert(frame.slots[13] == oseo_number(41.0));
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[12],
        &frame.slots[13]
    ));
    assert(frame.slots[12] == frame.slots[10]);
    assert(frame.slots[13] == oseo_number(42.0));
    assert(!oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[12],
        &frame.slots[13]
    ));
    assert(context.finalization_pending_count == 0u);

    frame.slots[1] = oseo_undefined();
    frame.slots[12] = oseo_undefined();
    frame.slots[13] = oseo_undefined();
    oseo_collect(&context);
    assert_cleared_target(frame.slots[4]);
    assert_cleared_target(frame.slots[5]);
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 0u);
    assert(context.finalization_pending_count == 1u);
    assert(oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[12],
        &frame.slots[13]
    ));
    assert(frame.slots[12] == frame.slots[10]);
    assert(frame.slots[13] == oseo_number(99.0));
    assert(context.finalization_pending_count == 0u);

    /* Repopulate the emptied table so lookups cross a chain whose head
     * and middle entries die, not only its last one. */
    frame.slots[1] = node(&context);
    frame.slots[2] = node(&context);
    frame.slots[3] = node(&context);
    frame.slots[6] = node(&context);
    frame.slots[7] = node(&context);
    frame.slots[14] = node(&context);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[6]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[2],
        frame.slots[7]
    ));
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[3],
        frame.slots[14]
    ));
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 3u);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[2],
        frame.slots[14]
    ));
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 3u);
    OseoValue found = oseo_undefined();
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[2],
        &found
    ));
    assert(found == frame.slots[14]);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[2],
        frame.slots[7]
    ));
    frame.slots[15] = require_normal(oseo_internal_weak_reference_create(
        &context,
        frame.slots[6]
    ));
    frame.slots[16] = node(&context);
    assert(!oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[16],
        &found
    ));

    /* Kill the head entry's key; its value dies with it. */
    frame.slots[1] = oseo_undefined();
    frame.slots[6] = oseo_undefined();
    oseo_collect(&context);
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 2u);
    assert_cleared_target(frame.slots[15]);
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[2],
        &found
    ));
    assert(found == frame.slots[7]);
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[3],
        &found
    ));
    assert(found == frame.slots[14]);
    assert(!oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[16],
        &found
    ));

    /* A fresh key after a death appends an ordinary new entry. */
    frame.slots[1] = node(&context);
    require_normal(oseo_internal_ephemeron_set(
        &context,
        frame.slots[0],
        frame.slots[1],
        frame.slots[16]
    ));
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 3u);

    /* Kill the middle entry's key so unlinking repairs an inner link. */
    frame.slots[3] = oseo_undefined();
    frame.slots[14] = oseo_undefined();
    oseo_collect(&context);
    assert(oseo_internal_ephemeron_live_count(frame.slots[0]) == 2u);
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[2],
        &found
    ));
    assert(found == frame.slots[7]);
    assert(oseo_internal_ephemeron_get(
        frame.slots[0],
        frame.slots[1],
        &found
    ));
    assert(found == frame.slots[16]);
    assert(context.finalization_pending_count == 0u);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    test_queued_registries_stay_live();
    test_dropped_registry_does_not_queue();
    test_dead_table_does_not_activate_value();
    test_nested_table_discovery();
    test_allocation_failures();
    test_destroy_nonempty_queue();
    return 0;
}
