#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>
#include <stdlib.h>

/*
 * The GlobalSymbolRegistry contract below the JavaScript surface: every
 * context resolves one key to one process-wide entry, keeps one rooted
 * representative per entry, and never loses an entry when another context
 * is destroyed. The entry pointer is private to the runtime, so this fixture
 * includes the internal header to observe it directly.
 */

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static bool collect_every_safepoint(void) {
    const char *value = getenv("OSEO_GC_EVERY_SAFEPOINT");
    return value != NULL && value[0] == '1';
}

static void init_context(OseoContext *context, const char *name) {
    size_t length = 0u;
    while (name[length] != '\0') length += 1u;
    oseo_context_init(context, name, length);
    context->collect_every_safepoint = collect_every_safepoint();
}

/*
 * Calls `Symbol[name](argument)` through the context's own intrinsic.
 * `roots` has three slots; slot 1 holds the argument across allocation.
 */
static OseoValue call_symbol_static(
    OseoContext *context,
    OseoValue *roots,
    const char *name,
    OseoValue argument
) {
    roots[1] = argument;
    roots[0] = require_normal(oseo_symbol_intrinsic(context));
    roots[2] = require_normal(oseo_internal_ascii_string(context, name));
    roots[2] = require_normal(oseo_object_get(context, roots[0], roots[2]));
    return require_normal(oseo_call_function(
        context,
        roots[2],
        roots[0],
        1u,
        &roots[1],
        oseo_undefined()
    ));
}

static OseoValue units_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    return require_normal(oseo_string_from_units(context, units, length));
}

static OseoValue register_units(
    OseoContext *context,
    OseoValue *roots,
    const uint16_t *units,
    size_t length
) {
    return call_symbol_static(
        context,
        roots,
        "for",
        units_string(context, units, length)
    );
}

static const void *entry_of(OseoValue symbol) {
    assert(is_symbol(symbol));
    return symbol_object(symbol)->registry_entry;
}

static void test_shared_entries_across_contexts(void) {
    static const uint16_t shared[] = {'s', 'h', 'a', 'r', 'e', 'd'};
    static const uint16_t other[] = {'o', 't', 'h', 'e', 'r'};
    /* NUL, an astral pair, and a lone trailing surrogate. */
    static const uint16_t unusual[] = {0x0000u, 0xd83du, 0xde00u, 0xdc00u};
    OseoContext left;
    OseoContext right;
    OseoRootFrame left_roots = {NULL, NULL, 0u};
    OseoRootFrame right_roots = {NULL, NULL, 0u};
    init_context(&left, "symbol-registry-left");
    init_context(&right, "symbol-registry-right");
    (void)require_normal(oseo_roots_allocate(&left, &left_roots, 8u));
    (void)require_normal(oseo_roots_allocate(&right, &right_roots, 8u));

    left_roots.slots[3] = register_units(&left, left_roots.slots, shared, 6u);
    right_roots.slots[3] =
        register_units(&right, right_roots.slots, shared, 6u);
    left_roots.slots[4] = register_units(&left, left_roots.slots, other, 5u);
    right_roots.slots[4] =
        register_units(&right, right_roots.slots, unusual, 4u);
    left_roots.slots[5] = register_units(&left, left_roots.slots, NULL, 0u);
    right_roots.slots[5] =
        register_units(&right, right_roots.slots, NULL, 0u);
    left_roots.slots[6] =
        register_units(&left, left_roots.slots, unusual, 4u);
    oseo_collect(&left);
    oseo_collect(&right);

    /* Distinct heap values in distinct heaps share one registry entry. */
    assert(left_roots.slots[3] != right_roots.slots[3]);
    assert(entry_of(left_roots.slots[3]) != NULL);
    assert(entry_of(left_roots.slots[3]) == entry_of(right_roots.slots[3]));
    assert(entry_of(left_roots.slots[5]) == entry_of(right_roots.slots[5]));
    assert(entry_of(left_roots.slots[6]) == entry_of(right_roots.slots[4]));
    assert(entry_of(left_roots.slots[3]) != entry_of(left_roots.slots[4]));
    assert(entry_of(left_roots.slots[5]) != entry_of(left_roots.slots[3]));
    assert(left.registered_symbol_count == 4u);
    assert(right.registered_symbol_count == 3u);

    /* Destroying the first registrant keeps the entry the right observes. */
    const void *shared_entry = entry_of(right_roots.slots[3]);
    oseo_roots_release(&left, &left_roots);
    oseo_context_destroy(&left);
    oseo_collect(&right);
    right_roots.slots[6] =
        register_units(&right, right_roots.slots, shared, 6u);
    assert(right_roots.slots[6] == right_roots.slots[3]);
    assert(entry_of(right_roots.slots[6]) == shared_entry);
    right_roots.slots[7] = call_symbol_static(
        &right,
        right_roots.slots,
        "keyFor",
        right_roots.slots[4]
    );
    assert(is_string(right_roots.slots[7]));
    OseoString *key = string_object(right_roots.slots[7]);
    assert(key->length == 4u);
    for (size_t index = 0u; index < 4u; index += 1u) {
        assert(key->units[index] == unusual[index]);
    }

    /* A new context resolves the surviving entry without re-creating it. */
    OseoContext late;
    OseoRootFrame late_roots = {NULL, NULL, 0u};
    init_context(&late, "symbol-registry-late");
    (void)require_normal(oseo_roots_allocate(&late, &late_roots, 4u));
    late_roots.slots[3] = register_units(&late, late_roots.slots, shared, 6u);
    assert(entry_of(late_roots.slots[3]) == shared_entry);
    oseo_roots_release(&late, &late_roots);
    oseo_context_destroy(&late);

    oseo_roots_release(&right, &right_roots);
    oseo_context_destroy(&right);
}

/*
 * Enough keys to grow both the process table and the context table
 * several times, with every earlier representative still resolved to the
 * same heap value and entry afterwards.
 */
static void test_growth_preserves_identity(void) {
    enum { KEY_COUNT = 300 };
    OseoContext context;
    OseoRootFrame roots = {NULL, NULL, 0u};
    init_context(&context, "symbol-registry-growth");
    (void)require_normal(
        oseo_roots_allocate(&context, &roots, 4u + KEY_COUNT)
    );
    for (size_t index = 0u; index < KEY_COUNT; index += 1u) {
        const uint16_t units[3] = {
            (uint16_t)'g',
            (uint16_t)(0x4e00u + index / 64u),
            (uint16_t)(index % 64u),
        };
        roots.slots[4u + index] =
            register_units(&context, roots.slots, units, 3u);
    }
    assert(context.registered_symbol_count == KEY_COUNT);
    oseo_collect(&context);
    for (size_t index = 0u; index < KEY_COUNT; index += 1u) {
        const uint16_t units[3] = {
            (uint16_t)'g',
            (uint16_t)(0x4e00u + index / 64u),
            (uint16_t)(index % 64u),
        };
        roots.slots[3] = register_units(&context, roots.slots, units, 3u);
        assert(roots.slots[3] == roots.slots[4u + index]);
        for (size_t earlier = 0u; earlier < index; earlier += 17u) {
            assert(entry_of(roots.slots[4u + earlier]) !=
                entry_of(roots.slots[3]));
        }
    }
    assert(context.registered_symbol_count == KEY_COUNT);
    oseo_roots_release(&context, &roots);
    oseo_context_destroy(&context);
}

int main(void) {
    test_shared_entries_across_contexts();
    test_growth_preserves_identity();
    return 0;
}
