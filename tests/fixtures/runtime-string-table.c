#include "runtime_internal.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static size_t table_count(const OseoContext *context) {
    const OseoStringTable *table = context->string_table;
    return table == NULL ? 0u : table->count;
}

/* Writes a distinct decimal name of `width` units into `units`. */
static void decimal_units(uint16_t *units, size_t width, size_t value) {
    for (size_t index = width; index > 0u; index -= 1u) {
        units[index - 1u] = (uint16_t)('0' + value % 10u);
        value /= 10u;
    }
}

/*
 * A short string is shared while it lives, a request that finds it
 * allocates nothing and reaches no safepoint, and a longer string is
 * never shared.
 */
static void test_sharing(bool forced) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "string-table-sharing", 20u);
    context.collect_every_safepoint = forced;
    context.observe_specialization = true;
    require_normal(oseo_roots_allocate(&context, &frame, 4u));
    static const uint16_t name[] = {'l', 'e', 'n', 'g', 't', 'h'};
    frame.slots[0] = require_normal(
        oseo_internal_allocate_string(&context, name, 6u)
    );
    size_t attempts = context.allocation_attempts;
    size_t allocations = context.allocations;
    size_t collections = context.collections;
    frame.slots[1] = require_normal(
        oseo_internal_allocate_string(&context, name, 6u)
    );
    assert(frame.slots[1] == frame.slots[0]);
    assert(context.allocation_attempts == attempts);
    assert(context.allocations == allocations);
    assert(context.collections == collections);
    assert(table_count(&context) == 1u);

    uint16_t units[OSEO_STRING_TABLE_MAX_UNITS + 1u];
    for (size_t index = 0u; index < sizeof(units) / sizeof(*units);
         index += 1u) {
        units[index] = (uint16_t)('a' + index % 26u);
    }
    frame.slots[2] = require_normal(oseo_internal_allocate_string(
        &context, units, OSEO_STRING_TABLE_MAX_UNITS
    ));
    assert(require_normal(oseo_internal_allocate_string(
        &context, units, OSEO_STRING_TABLE_MAX_UNITS
    )) == frame.slots[2]);
    frame.slots[3] = require_normal(oseo_internal_allocate_string(
        &context, units, OSEO_STRING_TABLE_MAX_UNITS + 1u
    ));
    OseoValue longer = require_normal(oseo_internal_allocate_string(
        &context, units, OSEO_STRING_TABLE_MAX_UNITS + 1u
    ));
    assert(longer != frame.slots[3]);
    assert(table_count(&context) == 2u);

    /* An empty string is a string like any other. */
    OseoValue empty = require_normal(
        oseo_internal_allocate_string(&context, NULL, 0u)
    );
    assert(require_normal(
        oseo_internal_allocate_string(&context, NULL, 0u)
    ) == empty);

    for (size_t index = 0u; index < frame.slot_count; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.objects == NULL);
    assert(table_count(&context) == 0u);
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

/*
 * The table is weak: an unrooted entry dies with its string, survivors
 * keep their identity across index growth and removal, and a dead name
 * is allocated afresh.
 */
static void test_weak_entries(bool forced) {
    enum { count = 1000, width = 4 };
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "string-table-weak", 17u);
    context.collect_every_safepoint = forced;
    require_normal(oseo_roots_allocate(&context, &frame, count));
    uint16_t units[width];
    for (size_t index = 0u; index < count; index += 1u) {
        decimal_units(units, width, index);
        frame.slots[index] = require_normal(
            oseo_internal_allocate_string(&context, units, width)
        );
    }
    assert(table_count(&context) == count);
    for (size_t index = 0u; index < count; index += 2u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(table_count(&context) == count / 2u);
    for (size_t index = 1u; index < count; index += 2u) {
        decimal_units(units, width, index);
        size_t attempts = context.allocation_attempts;
        assert(require_normal(
            oseo_internal_allocate_string(&context, units, width)
        ) == frame.slots[index]);
        assert(context.allocation_attempts == attempts);
    }
    for (size_t index = 0u; index < count; index += 2u) {
        decimal_units(units, width, index);
        size_t attempts = context.allocation_attempts;
        frame.slots[index] = require_normal(
            oseo_internal_allocate_string(&context, units, width)
        );
        assert(context.allocation_attempts == attempts + 1u);
        const OseoString *string = string_object(frame.slots[index]);
        assert(string->length == width);
        assert(memcmp(string->units, units, sizeof(units)) == 0);
    }
    assert(table_count(&context) == count);
    for (size_t index = 0u; index < count; index += 1u) {
        frame.slots[index] = oseo_undefined();
    }
    oseo_collect(&context);
    assert(context.objects == NULL);
    assert(table_count(&context) == 0u);
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

/* A failed allocation records nothing, so the next request allocates. */
static void test_failed_allocation(bool forced) {
    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "string-table-failure", 20u);
    context.collect_every_safepoint = forced;
    require_normal(oseo_roots_allocate(&context, &frame, 1u));
    static const uint16_t name[] = {'d', 'o', 'n', 'e'};
    oseo_context_fail_allocation_at(&context, 1u);
    OseoResult failed = oseo_internal_allocate_string(&context, name, 4u);
    assert(failed.status != OSEO_STATUS_NORMAL);
    assert(table_count(&context) == 0u);
    oseo_context_fail_allocation_at(&context, 0u);
    oseo_context_clear_language_error(&context);
    frame.slots[0] = require_normal(
        oseo_internal_allocate_string(&context, name, 4u)
    );
    assert(table_count(&context) == 1u);
    frame.slots[0] = oseo_undefined();
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
}

int main(void) {
    for (size_t mode = 0u; mode < 2u; mode += 1u) {
        test_sharing(mode != 0u);
        test_weak_entries(mode != 0u);
        test_failed_allocation(mode != 0u);
    }
    puts("string table complete");
    return 0;
}
