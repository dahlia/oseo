#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static void test_deep_graph(OseoContext *context, OseoValue *roots) {
    const size_t depth = 4096u;
    roots[0] = require_normal(oseo_environment_create(context, 1u));
    for (size_t index = 0u; index < depth; index += 1u) {
        roots[1] = require_normal(oseo_environment_create(context, 1u));
        (void)require_normal(
            oseo_environment_set(context, roots[1], 0u, roots[0])
        );
        roots[0] = roots[1];
    }
    oseo_collect(context);
    OseoValue current = roots[0];
    for (size_t index = 0u; index < depth; index += 1u) {
        current = require_normal(oseo_environment_get(context, current, 0u));
    }
    (void)require_normal(oseo_environment_get(context, current, 0u));
}

static void test_cycle_and_sharing(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_environment_create(context, 2u));
    roots[1] = require_normal(oseo_environment_create(context, 1u));
    roots[2] = require_normal(oseo_environment_create(context, 1u));
    (void)require_normal(
        oseo_environment_set(context, roots[0], 0u, roots[1])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[0], 1u, roots[1])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[1], 0u, roots[2])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[2], 0u, roots[0])
    );
    context->collect_every_safepoint = true;
    oseo_collect(context);
    OseoValue first = require_normal(
        oseo_environment_get(context, roots[0], 0u)
    );
    OseoValue second = require_normal(
        oseo_environment_get(context, roots[0], 1u)
    );
    assert(first == second);
    OseoValue tail = require_normal(
        oseo_environment_get(context, first, 0u)
    );
    assert(
        require_normal(oseo_environment_get(context, tail, 0u)) == roots[0]
    );
    context->collect_every_safepoint = false;
}

static void test_allocation_failure(
    OseoContext *context,
    OseoValue *roots
) {
    oseo_context_fail_allocation_at(context, 2u);
    roots[0] = require_normal(oseo_environment_create(context, 1u));
    OseoResult failed = oseo_environment_create(context, 1u);
    assert(failed.status == OSEO_STATUS_THROW);
    assert(context->allocation_attempts == 2u);
    oseo_collect(context);
    (void)require_normal(oseo_environment_get(context, roots[0], 0u));
    oseo_context_fail_allocation_at(context, 0u);
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "runtime-heap.c", 14u);
    (void)require_normal(oseo_roots_allocate(&context, &frame, 4u));
    test_deep_graph(&context, frame.slots);
    test_cycle_and_sharing(&context, frame.slots);
    test_allocation_failure(&context, frame.slots);
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
