#include "runtime_internal.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

/* Reconstruct the bitmap independently from every actual value tag. */
static void assert_bitmap_exact(OseoValue value) {
    OseoEnvironment *environment = environment_object(value);
    size_t words = environment->slot_count / 64u +
        (environment->slot_count % 64u != 0u);
    assert(environment->heap_word_count == words);
    const uint64_t *bitmap = environment_heap_bitmap(environment);
    assert((uintptr_t)bitmap % _Alignof(uint64_t) == 0u);
    for (size_t word = 0u; word < words; word += 1u) {
        uint64_t expected = UINT64_C(0);
        for (size_t bit = 0u; bit < 64u; bit += 1u) {
            size_t index = word * 64u + bit;
            if (index < environment->slot_count &&
                tag_of(environment->slots[index]) == OSEO_TAG_HEAP) {
                expected |= UINT64_C(1) << bit;
            }
        }
        assert(bitmap[word] == expected);
    }
}

/* Exercise empty, exact-word, partial-word and wide sparse environments. */
static void test_bitmap_slots(size_t count, bool forced) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "bitmap-slots", 12u);
    context.collect_every_safepoint = forced;
    context.observe_specialization = true;
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    frame.slots[0] = require_normal(oseo_environment_create(&context, count));
    assert_bitmap_exact(frame.slots[0]);
    OseoResult invalid = oseo_environment_set(
        &context, frame.slots[0], count, oseo_number(1.0)
    );
    assert(invalid.status == OSEO_STATUS_THROW);
    assert_bitmap_exact(frame.slots[0]);
    if (count != 0u) {
        frame.slots[2] = require_normal(
            oseo_environment_create(&context, 0u)
        );
        frame.slots[3] = require_normal(oseo_internal_weak_reference_create(
            &context, frame.slots[2]
        ));
        for (size_t index = 0u; index < count; index += 1u) {
            OseoValue value = index % 37u == 0u || index == count - 1u
                ? frame.slots[2] : oseo_number((double)index);
            require_normal(oseo_environment_set(
                &context, frame.slots[0], index, value
            ));
        }
        assert_bitmap_exact(frame.slots[0]);
    }
    frame.slots[1] = require_normal(
        oseo_environment_clone(&context, frame.slots[0])
    );
    assert_bitmap_exact(frame.slots[1]);
    assert(environment_heap_bitmap(environment_object(frame.slots[0])) !=
        environment_heap_bitmap(environment_object(frame.slots[1])));
    OseoValue child = frame.slots[2];
    frame.slots[2] = oseo_undefined();
    for (size_t index = 0u; index < count; index += 1u) {
        require_normal(oseo_environment_set(
            &context, frame.slots[0], index, oseo_null()
        ));
    }
    assert_bitmap_exact(frame.slots[0]);
    assert_bitmap_exact(frame.slots[1]);
    oseo_collect(&context);
    if (count != 0u) {
        assert(oseo_internal_weak_reference_target(frame.slots[3]) == child);
        require_normal(oseo_environment_set(
            &context, frame.slots[0], count - 1u, child
        ));
        for (size_t index = 0u; index < count; index += 1u) {
            require_normal(oseo_environment_set(
                &context, frame.slots[1], index, oseo_boolean(false)
            ));
        }
        assert_bitmap_exact(frame.slots[0]);
        assert_bitmap_exact(frame.slots[1]);
        oseo_collect(&context);
        assert(oseo_internal_weak_reference_target(frame.slots[3]) == child);
        require_normal(oseo_environment_set(
            &context, frame.slots[0], count - 1u, oseo_undefined()
        ));
        assert_bitmap_exact(frame.slots[0]);
        oseo_collect(&context);
        assert(oseo_internal_weak_reference_target(frame.slots[3]) ==
            oseo_undefined());
    }
    for (size_t index = 0u; index < frame.slot_count; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.objects == NULL);
    assert(context.collections > 0u);
    oseo_roots_release(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
}

/* Every bit position must retain its own independent weakly observed node. */
static void test_distinct_slot_edges(bool forced) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "distinct-edges", 14u);
    context.collect_every_safepoint = forced;
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    frame.slots[0] = require_normal(oseo_environment_create(&context, 130u));
    frame.slots[1] = require_normal(oseo_environment_create(&context, 130u));
    for (size_t index = 0u; index < 130u; index += 1u) {
        frame.slots[2] = require_normal(
            oseo_environment_create(&context, 0u)
        );
        frame.slots[3] = require_normal(oseo_internal_weak_reference_create(
            &context, frame.slots[2]
        ));
        require_normal(oseo_environment_set(
            &context, frame.slots[0], index, frame.slots[2]
        ));
        require_normal(oseo_environment_set(
            &context, frame.slots[1], index, frame.slots[3]
        ));
        frame.slots[2] = oseo_undefined();
        frame.slots[3] = oseo_undefined();
    }
    assert_bitmap_exact(frame.slots[0]);
    assert_bitmap_exact(frame.slots[1]);
    oseo_collect(&context);
    for (size_t index = 0u; index < 130u; index += 1u) {
        OseoValue reference = require_normal(oseo_environment_get(
            &context, frame.slots[1], index
        ));
        assert(oseo_internal_weak_reference_target(reference) !=
            oseo_undefined());
        if (index % 2u == 0u) {
            require_normal(oseo_environment_set(
                &context, frame.slots[0], index, oseo_uninitialized()
            ));
        }
    }
    frame.slots[2] = require_normal(
        oseo_environment_clone(&context, frame.slots[0])
    );
    for (size_t index = 0u; index < 130u; index += 1u) {
        require_normal(oseo_environment_set(
            &context, frame.slots[0], index, oseo_number(-0.0)
        ));
    }
    assert_bitmap_exact(frame.slots[0]);
    assert_bitmap_exact(frame.slots[2]);
    oseo_collect(&context);
    for (size_t index = 0u; index < 130u; index += 1u) {
        OseoValue reference = require_normal(oseo_environment_get(
            &context, frame.slots[1], index
        ));
        assert((oseo_internal_weak_reference_target(reference) ==
            oseo_undefined()) == (index % 2u == 0u));
    }
    frame.slots[2] = oseo_undefined();
    oseo_collect(&context);
    for (size_t index = 0u; index < 130u; index += 1u) {
        OseoValue reference = require_normal(oseo_environment_get(
            &context, frame.slots[1], index
        ));
        assert(oseo_internal_weak_reference_target(reference) ==
            oseo_undefined());
    }
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    assert(context.objects == NULL);
}

/* Both size guards reject before a safepoint; OOM keeps one attempt. */
static void test_bitmap_allocation_failures(bool forced) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "bitmap-oom", 10u);
    context.collect_every_safepoint = forced;
    context.observe_specialization = true;
    require_normal(oseo_roots_allocate(&context, &frame, 2u));
    size_t before = context.collections;
    assert(oseo_environment_create(&context, SIZE_MAX).status ==
        OSEO_STATUS_THROW);
    size_t slots_only_limit =
        (SIZE_MAX - sizeof(OseoEnvironment)) / sizeof(OseoValue);
    assert(oseo_environment_create(&context, slots_only_limit).status ==
        OSEO_STATUS_THROW);
    assert(context.allocation_attempts == 0u);
    assert(context.collections == before);
    assert(context.roots == &frame);
    oseo_context_fail_allocation_at(&context, 1u);
    assert(oseo_environment_create(&context, 65u).status == OSEO_STATUS_THROW);
    assert(strcmp(context.error_code, "OSEO2001") == 0);
    assert(context.allocation_attempts == 1u);
    assert(context.collections == before + (forced ? 1u : 0u));
    oseo_context_fail_allocation_at(&context, 0u);
    frame.slots[0] = require_normal(oseo_environment_create(&context, 65u));
    require_normal(oseo_environment_set(
        &context, frame.slots[0], 64u, frame.slots[0]
    ));
    before = context.collections;
    oseo_context_fail_allocation_at(&context, 1u);
    assert(oseo_environment_clone(&context, frame.slots[0]).status ==
        OSEO_STATUS_THROW);
    assert(context.allocation_attempts == 1u);
    assert(context.collections == before + (forced ? 1u : 0u));
    assert(context.roots == &frame);
    assert_bitmap_exact(frame.slots[0]);
    oseo_context_fail_allocation_at(&context, 0u);
    frame.slots[1] = require_normal(
        oseo_environment_clone(&context, frame.slots[0])
    );
    assert_bitmap_exact(frame.slots[1]);
    assert(require_normal(oseo_environment_get(
        &context, frame.slots[1], 64u
    )) == frame.slots[0]);
    oseo_roots_release(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
    assert(context.objects == NULL);
}

/* The internal ephemeron contract accepts every tagged heap kind. */
static OseoValue leaf(
    OseoContext *context,
    OseoRootFrame *frame,
    OseoHeapKind kind
) {
    switch (kind) {
    case OSEO_HEAP_STRING: {
        const uint16_t units[] = {'k', 'e', 'y'};
        return require_normal(oseo_string_from_units(context, units, 3u));
    }
    case OSEO_HEAP_BIGINT:
        return require_normal(oseo_bigint_literal(context, "123456789", 10u));
    case OSEO_HEAP_PRIVATE_NAME:
        return require_normal(oseo_private_name_create(context));
    case OSEO_HEAP_WEAK_REFERENCE:
        frame->slots[11] = require_normal(
            oseo_environment_create(context, 0u)
        );
        return require_normal(oseo_internal_weak_reference_create(
            context, frame->slots[11]
        ));
    default:
        assert(false);
        return oseo_undefined();
    }
}

/*
 * Two tables park on one indirectly rooted leaf, or encounter it already
 * marked. Their values are distinct cyclic clones sharing a mutable cell.
 * Deletion must reclaim only the first value; removing the key's last
 * strong path must reclaim the second and publish cleanup in FIFO order.
 */
static void test_leaf_graph(
    OseoHeapKind kind,
    bool entries_first,
    bool forced
) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "leaf-graph", 10u);
    context.collect_every_safepoint = forced;
    context.observe_specialization = true;
    require_normal(oseo_roots_allocate(&context, &frame, 12u));
    frame.slots[0] = require_normal(oseo_environment_create(&context, 1u));
    frame.slots[1] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[2] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[3] = leaf(&context, &frame, kind);
    frame.slots[11] = oseo_undefined();
    assert(heap_object(frame.slots[3])->kind == kind);
    frame.slots[4] = require_normal(oseo_environment_create(&context, 2u));
    frame.slots[10] = require_normal(
        oseo_cell_create(&context, oseo_number(1.0))
    );
    require_normal(oseo_environment_set(
        &context, frame.slots[4], 0u, frame.slots[4]
    ));
    require_normal(oseo_environment_set(
        &context, frame.slots[4], 1u, frame.slots[10]
    ));
    frame.slots[5] = require_normal(
        oseo_environment_clone(&context, frame.slots[4])
    );
    require_normal(oseo_environment_set(
        &context, frame.slots[5], 0u, frame.slots[5]
    ));
    frame.slots[6] = require_normal(oseo_internal_weak_reference_create(
        &context, frame.slots[4]
    ));
    frame.slots[7] = require_normal(oseo_internal_weak_reference_create(
        &context, frame.slots[5]
    ));
    frame.slots[8] = require_normal(
        oseo_internal_finalization_registry_create(
            &context, oseo_undefined()
        )
    );
    for (size_t index = 0u; index < 2u; index += 1u) {
        require_normal(oseo_internal_ephemeron_set(
            &context,
            frame.slots[1u + index],
            frame.slots[3],
            frame.slots[4u + index]
        ));
        require_normal(oseo_internal_finalization_register(
            &context,
            frame.slots[8],
            frame.slots[4u + index],
            oseo_number((double)(index + 1u))
        ));
    }
    require_normal(oseo_environment_set(
        &context, frame.slots[0], 0u, frame.slots[3]
    ));
    OseoValue bridge = frame.slots[0];
    OseoValue key = frame.slots[3];
    OseoValue first = frame.slots[4];
    OseoValue second = frame.slots[5];
    OseoValue table = frame.slots[1];
    frame.slots[3] = oseo_undefined();
    frame.slots[4] = oseo_undefined();
    frame.slots[5] = oseo_undefined();
    frame.slots[10] = oseo_undefined();
    if (!entries_first) {
        frame.slots[0] = frame.slots[2];
        frame.slots[2] = bridge;
    }
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[6]) == first);
    assert(oseo_internal_weak_reference_target(frame.slots[7]) == second);
    assert(heap_object(key)->ephemeron_pending == NULL);
    assert(heap_object(key)->trace_next == NULL);
    if (kind == OSEO_HEAP_WEAK_REFERENCE) {
        assert(oseo_internal_weak_reference_target(key) == oseo_undefined());
    }

    /* Empty owner-local weak counts cannot bypass foreign activation. */
    OseoContext observer;
    oseo_context_init(&observer, "leaf-observer", 13u);
    OseoValue foreign[] = {
        frame.slots[0], frame.slots[1], frame.slots[2]
    };
    OseoRootFrame observed = {NULL, foreign, 3u};
    oseo_roots_push(&observer, &observed);
    oseo_collect(&observer);
    assert(heap_object(key)->marked);
    assert(heap_object(first)->marked);
    assert(heap_object(second)->marked);
    assert(heap_object(key)->ephemeron_pending == NULL);
    assert(observer.objects == NULL);
    assert(observer.ephemeron_table_count == 0u);
    assert(observer.weak_reference_count == 0u);
    oseo_roots_pop(&observer, &observed);
    oseo_context_destroy(&observer);
    oseo_internal_clear_heap_marks(&context);

    OseoValue value = oseo_undefined();
    assert(oseo_internal_ephemeron_get(table, key, &value));
    assert(value == first);
    assert(require_normal(oseo_environment_get(&context, first, 0u)) == first);
    assert(require_normal(oseo_environment_get(
        &context, second, 0u
    )) == second);
    OseoValue shared = require_normal(
        oseo_environment_get(&context, second, 1u)
    );
    require_normal(oseo_cell_set(&context, shared, oseo_number(9.0)));
    assert(require_normal(oseo_cell_get(&context, require_normal(
        oseo_environment_get(&context, first, 1u)
    ))) == oseo_number(9.0));

    /* A mark cycle must neither allocate nor consume an injected failure. */
    oseo_context_fail_allocation_at(&context, 1u);
    oseo_collect(&context);
    assert(context.allocation_attempts == 0u);
    OseoResult failed = oseo_environment_create(&context, 1u);
    assert(failed.status == OSEO_STATUS_THROW);
    assert(strcmp(context.error_code, "OSEO2001") == 0);
    assert(context.roots == &frame);
    oseo_context_fail_allocation_at(&context, 0u);
    frame.slots[11] = require_normal(oseo_environment_create(&context, 1u));
    frame.slots[11] = oseo_undefined();

    assert(oseo_internal_ephemeron_delete(table, key));
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[6]) ==
        oseo_undefined());
    assert(oseo_internal_weak_reference_target(frame.slots[7]) == second);
    assert(context.finalization_pending_count == 1u);
    require_normal(oseo_environment_set(
        &context, bridge, 0u, oseo_undefined()
    ));
    oseo_collect(&context);
    assert(oseo_internal_weak_reference_target(frame.slots[7]) ==
        oseo_undefined());
    assert(context.finalization_pending_count == 2u);
    for (size_t index = 0u; index < 2u; index += 1u) {
        OseoValue registry = oseo_undefined();
        OseoValue holdings = oseo_undefined();
        assert(oseo_internal_finalization_take_cleanup(
            &context, &registry, &holdings
        ));
        assert(registry == frame.slots[8]);
        assert(holdings == oseo_number((double)(index + 1u)));
    }
    for (size_t index = 0u; index < frame.slot_count; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.objects == NULL);
    assert(context.collections > 0u);
    assert(context.active_frame_slots == 0u);
    assert(context.call_depth == 0u);
    oseo_roots_release(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
}

int main(void) {
    const OseoHeapKind kinds[] = {
        OSEO_HEAP_STRING,
        OSEO_HEAP_BIGINT,
        OSEO_HEAP_PRIVATE_NAME,
        OSEO_HEAP_WEAK_REFERENCE,
    };
    const size_t counts[] = {0u, 1u, 63u, 64u, 65u, 127u, 128u, 129u, 4097u};
    for (size_t mode = 0u; mode < 2u; mode += 1u) {
        for (size_t index = 0u;
             index < sizeof(counts) / sizeof(counts[0]);
             index += 1u) {
            test_bitmap_slots(counts[index], mode != 0u);
        }
        test_bitmap_allocation_failures(mode != 0u);
        test_distinct_slot_edges(mode != 0u);
        for (size_t index = 0u; index < 4u; index += 1u) {
            test_leaf_graph(kinds[index], true, mode != 0u);
            test_leaf_graph(kinds[index], false, mode != 0u);
        }
    }
    puts("environment bitmap complete");
    return 0;
}
