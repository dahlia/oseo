#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>

/*
 * Collector-facing contracts the weak-collections component adds on top of
 * the ephemeron checkpoint: the address-keyed index stays synchronized
 * with source-level deletion and collector unlinking, unregister tokens
 * are weak, an unregistered queued record is skipped, and KeptAlive roots
 * last exactly until they are cleared.
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

int main(void) {
    test_index_survives_delete_and_clearing();
    test_index_reuses_tombstones();
    test_unregister_tokens();
    test_kept_objects();
    return 0;
}
