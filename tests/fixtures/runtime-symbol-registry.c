#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>
#include <stdlib.h>

/*
 * The GlobalSymbolRegistry contract below the JavaScript surface: every
 * context resolves one key to one process-wide entry, keeps one rooted
 * representative per entry, and never loses an entry when another context
 * is destroyed. The entry pointer is private to the runtime, so this fixture
 * includes the internal header to observe it directly. The same header makes
 * the heap list and the well-known symbol table observable, which is what
 * lets this fixture also cover the two identity rules that only a failed
 * build or a destroyed context can break.
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
    assert(left.objects == NULL);
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
    assert(late.objects == NULL);

    oseo_roots_release(&right, &right_roots);
    oseo_context_destroy(&right);
    assert(right.objects == NULL);
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
    assert(context.objects == NULL);
}

/* Calls `receiver[name](...arguments)`. The caller roots every argument. */
static OseoValue call_method(
    OseoContext *context,
    OseoValue receiver,
    const char *name,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    slots[1] = require_normal(oseo_internal_ascii_string(context, name));
    slots[1] = require_normal(oseo_object_get(context, slots[0], slots[1]));
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        argument_count,
        arguments,
        oseo_undefined()
    );
    oseo_roots_pop(context, &frame);
    return require_normal(result);
}

/* `new Intrinsic()` for an argumentless collection constructor. */
static OseoValue construct_intrinsic(
    OseoContext *context,
    OseoIntrinsic intrinsic
) {
    OseoValue slots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    slots[0] = require_normal(oseo_intrinsic(context, intrinsic));
    slots[1] = require_normal(oseo_function_prototype(context, slots[0]));
    slots[1] = require_normal(oseo_constructor_receiver(context, slots[1]));
    OseoValue returned = require_normal(oseo_call_function(
        context,
        slots[0],
        slots[1],
        0u,
        NULL,
        slots[0]
    ));
    OseoResult result = oseo_constructor_result(context, returned, slots[1]);
    oseo_roots_pop(context, &frame);
    return require_normal(result);
}

static void assert_boolean(OseoResult result, bool expected) {
    assert(require_normal(result) == oseo_boolean(expected));
}

/*
 * Identity across a context boundary. The registry entry, not the heap
 * pointer, is what makes two representatives one registered symbol, so
 * every identity rule a context applies to a representative another
 * context created has to answer the way it answers for its own.
 *
 * A registered representative is the one value this fixture hands across.
 * It and its description never change and its own context roots it for
 * that context's lifetime, so the receiving context can compare it, and
 * can mark it while it is an argument, without hiding a later mutation
 * from its owner or leaving a mark that outlives it. Every key the
 * receiving context keeps is its own: a property key, a Map key, and a Set
 * element are the receiving context's own representative whether a local
 * or a foreign representative created them, so destroying the originating
 * context leaves each lookup inside this heap.
 * `test_foreign_value_survives_origin_teardown` covers the value positions
 * that rule does not reach.
 */
static void test_identity_across_contexts(void) {
    static const uint16_t shared[] = {'c', 'r', 'o', 's', 's'};
    static const uint16_t apart[] = {'a', 'p', 'a', 'r', 't'};
    static const uint16_t unseen[] = {'u', 'n', 's', 'e', 'e', 'n'};
    OseoContext left;
    OseoContext right;
    OseoRootFrame left_roots = {NULL, NULL, 0u};
    OseoRootFrame right_roots = {NULL, NULL, 0u};
    init_context(&left, "symbol-identity-left");
    init_context(&right, "symbol-identity-right");
    (void)require_normal(oseo_roots_allocate(&left, &left_roots, 8u));
    (void)require_normal(oseo_roots_allocate(&right, &right_roots, 16u));

    left_roots.slots[3] = register_units(&left, left_roots.slots, shared, 5u);
    right_roots.slots[3] =
        register_units(&right, right_roots.slots, shared, 5u);
    right_roots.slots[4] = register_units(&right, right_roots.slots, apart, 5u);
    left_roots.slots[4] =
        require_normal(oseo_internal_symbol_create(&left, oseo_undefined()));
    right_roots.slots[5] =
        require_normal(oseo_internal_symbol_create(&right, oseo_undefined()));
    right_roots.slots[6] = require_normal(
        oseo_internal_well_known_symbol(&right, OSEO_WELL_KNOWN_ITERATOR)
    );
    left_roots.slots[5] =
        require_normal(oseo_object_create(&left, oseo_null()));
    right_roots.slots[7] =
        require_normal(oseo_object_create(&right, oseo_null()));
    OseoValue local = right_roots.slots[3];
    OseoValue foreign = left_roots.slots[3];
    assert(local != foreign);
    assert(entry_of(local) == entry_of(foreign));

    /* Every equality form, from either side of the boundary. */
    assert_boolean(oseo_strict_equal(&right, local, foreign), true);
    assert_boolean(oseo_strict_equal(&left, foreign, local), true);
    assert_boolean(oseo_not_strict_equal(&right, local, foreign), false);
    assert_boolean(oseo_loose_equal(&right, local, foreign), true);
    assert_boolean(oseo_not_loose_equal(&right, foreign, local), false);
    assert(oseo_internal_same_value(local, foreign));
    assert(oseo_internal_same_value(foreign, local));
    assert(oseo_internal_same_value_zero(local, foreign));
    assert(oseo_internal_property_key_equal(local, foreign));

    /*
     * Another key, an unregistered symbol from either context, a
     * well-known symbol, and an ordinary object keep pointer identity:
     * only one matching non-null entry joins two distinct heap values.
     */
    assert_boolean(
        oseo_strict_equal(&right, right_roots.slots[4], foreign),
        false
    );
    assert(!oseo_internal_same_value(right_roots.slots[4], foreign));
    assert(!oseo_internal_property_key_equal(right_roots.slots[4], foreign));
    assert_boolean(
        oseo_strict_equal(&right, right_roots.slots[5], left_roots.slots[4]),
        false
    );
    assert(!oseo_internal_same_value_zero(
        right_roots.slots[5],
        left_roots.slots[4]
    ));
    assert(!oseo_internal_property_key_equal(right_roots.slots[6], foreign));
    assert_boolean(
        oseo_strict_equal(&right, right_roots.slots[7], left_roots.slots[5]),
        false
    );

    /* A property the local representative defined answers the foreign one. */
    (void)require_normal(oseo_object_set(
        &right,
        right_roots.slots[7],
        local,
        oseo_number(1.0),
        true
    ));
    assert(oseo_internal_same_value(
        require_normal(oseo_object_get(&right, right_roots.slots[7], foreign)),
        oseo_number(1.0)
    ));
    (void)require_normal(oseo_object_set(
        &right,
        right_roots.slots[7],
        foreign,
        oseo_number(2.0),
        true
    ));
    assert(ordinary_object(right_roots.slots[7])->property_count == 1u);
    assert(ordinary_object(right_roots.slots[7])->properties[0].key == local);
    assert(oseo_internal_same_value(
        require_normal(oseo_object_get(&right, right_roots.slots[7], local)),
        oseo_number(2.0)
    ));

    /* Map keys and Set elements resolve the foreign representative too. */
    right_roots.slots[8] = construct_intrinsic(&right, OSEO_INTRINSIC_MAP);
    right_roots.slots[9] = construct_intrinsic(&right, OSEO_INTRINSIC_SET);
    right_roots.slots[10] = local;
    right_roots.slots[11] = oseo_number(3.0);
    (void)call_method(
        &right,
        right_roots.slots[8],
        "set",
        2u,
        &right_roots.slots[10]
    );
    (void)call_method(
        &right,
        right_roots.slots[9],
        "add",
        1u,
        &right_roots.slots[10]
    );
    right_roots.slots[10] = foreign;
    assert(oseo_internal_same_value(
        call_method(
            &right,
            right_roots.slots[8],
            "get",
            1u,
            &right_roots.slots[10]
        ),
        oseo_number(3.0)
    ));
    assert(call_method(
        &right,
        right_roots.slots[8],
        "has",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));
    assert(call_method(
        &right,
        right_roots.slots[9],
        "has",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));
    right_roots.slots[11] = oseo_number(4.0);
    (void)call_method(
        &right,
        right_roots.slots[8],
        "set",
        2u,
        &right_roots.slots[10]
    );
    (void)call_method(
        &right,
        right_roots.slots[9],
        "add",
        1u,
        &right_roots.slots[10]
    );

    /* Neither collection grew, and neither stored the foreign value. */
    assert(map_object(right_roots.slots[8])->live_count == 1u);
    assert(map_object(right_roots.slots[8])->entries[0].key == local);
    assert(oseo_internal_same_value(
        map_object(right_roots.slots[8])->entries[0].value,
        oseo_number(4.0)
    ));
    assert(set_object(right_roots.slots[9])->size == 1u);
    assert(set_object(right_roots.slots[9])->elements[0].value == local);

    /* Deleting through the foreign representative empties both. */
    assert(call_method(
        &right,
        right_roots.slots[8],
        "delete",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));
    assert(call_method(
        &right,
        right_roots.slots[9],
        "delete",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));
    assert(map_object(right_roots.slots[8])->live_count == 0u);
    assert(set_object(right_roots.slots[9])->size == 0u);
    right_roots.slots[10] = oseo_undefined();

    /* keyFor reads the shared entry, not the receiving context's copy. */
    right_roots.slots[12] = call_symbol_static(
        &right,
        right_roots.slots,
        "keyFor",
        left_roots.slots[3]
    );
    assert(is_string(right_roots.slots[12]));
    OseoString *key = string_object(right_roots.slots[12]);
    assert(key->length == 5u);
    for (size_t index = 0u; index < 5u; index += 1u) {
        assert(key->units[index] == shared[index]);
    }

    /*
     * First insertion through a foreign representative, for a key the
     * receiving context has never registered. Each store still keeps the
     * receiving context's own representative, which `Symbol.for` there
     * afterwards returns, so nothing in this heap points into the other.
     */
    left_roots.slots[6] = register_units(&left, left_roots.slots, unseen, 6u);
    right_roots.slots[13] =
        require_normal(oseo_object_create(&right, oseo_null()));
    right_roots.slots[10] = left_roots.slots[6];
    right_roots.slots[11] = oseo_number(5.0);
    (void)require_normal(oseo_object_set(
        &right,
        right_roots.slots[13],
        right_roots.slots[10],
        right_roots.slots[11],
        true
    ));
    right_roots.slots[8] = construct_intrinsic(&right, OSEO_INTRINSIC_MAP);
    right_roots.slots[9] = construct_intrinsic(&right, OSEO_INTRINSIC_SET);
    (void)call_method(
        &right,
        right_roots.slots[8],
        "set",
        2u,
        &right_roots.slots[10]
    );
    (void)call_method(
        &right,
        right_roots.slots[9],
        "add",
        1u,
        &right_roots.slots[10]
    );
    right_roots.slots[10] = oseo_undefined();
    right_roots.slots[12] =
        register_units(&right, right_roots.slots, unseen, 6u);
    OseoValue stored = right_roots.slots[12];
    assert(stored != left_roots.slots[6]);
    assert(ordinary_object(right_roots.slots[13])->properties[0].key ==
        stored);
    assert(map_object(right_roots.slots[8])->entries[0].key == stored);
    assert(set_object(right_roots.slots[9])->elements[0].value == stored);

    /*
     * The originating context goes away. Every stored key is a value this
     * context owns, so collection and lookup stay inside this heap.
     */
    oseo_roots_release(&left, &left_roots);
    oseo_context_destroy(&left);
    assert(left.objects == NULL);
    oseo_collect(&right);
    assert(oseo_internal_same_value(
        require_normal(
            oseo_object_get(&right, right_roots.slots[13], stored)
        ),
        oseo_number(5.0)
    ));
    right_roots.slots[10] = stored;
    assert(call_method(
        &right,
        right_roots.slots[8],
        "has",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));
    assert(call_method(
        &right,
        right_roots.slots[9],
        "has",
        1u,
        &right_roots.slots[10]
    ) == oseo_boolean(true));

    oseo_roots_release(&right, &right_roots);
    oseo_context_destroy(&right);
    assert(right.objects == NULL);
}

/*
 * A Symbol build that fails partway keeps the well-known symbols it has
 * already created. Creating the constructor materializes
 * %Function.prototype%, which keys its `[Symbol.hasInstance]` method by the
 * well-known symbol of that moment, and no later build can rewrite that
 * key, so a retry that created a fresh symbol would leave the method
 * unreachable through `Symbol.hasInstance` for the rest of the context's
 * life. Every allocation the build makes is a failure point, so this sweeps
 * all of them rather than choosing one.
 */
static void test_failed_build_retry_keeps_symbol_identity(void) {
    size_t failures = 0u;
    bool completed = false;
    for (size_t attempt = 1u; attempt <= 4096u && !completed; attempt += 1u) {
        OseoContext context;
        OseoRootFrame roots = {NULL, NULL, 0u};
        init_context(&context, "symbol-intrinsic-retry");
        (void)require_normal(oseo_roots_allocate(&context, &roots, 4u));
        oseo_context_fail_allocation_at(&context, attempt);
        OseoResult first = oseo_symbol_intrinsic(&context);
        oseo_context_fail_allocation_at(&context, 0u);
        context.has_diagnostic = false;
        context.error_code = NULL;
        context.error_message = NULL;
        if (first.status == OSEO_STATUS_NORMAL) {
            completed = true;
        } else {
            assert(first.status == OSEO_STATUS_THROW);
            assert(first.value == oseo_undefined());
            failures += 1u;
        }

        /*
         * The retry answers one intrinsic graph, and its
         * `Symbol.hasInstance` is still the key %Function.prototype% holds,
         * whether the attempt that failed defined that method or a later
         * materialization did.
         */
        roots.slots[0] = require_normal(oseo_symbol_intrinsic(&context));
        roots.slots[1] = require_normal(
            oseo_intrinsic(&context, OSEO_INTRINSIC_FUNCTION_PROTOTYPE)
        );
        roots.slots[2] = require_normal(oseo_internal_well_known_symbol(
            &context,
            OSEO_WELL_KNOWN_HAS_INSTANCE
        ));
        roots.slots[3] = require_normal(
            oseo_object_get(&context, roots.slots[1], roots.slots[2])
        );
        assert(roots.slots[3] == require_normal(
            oseo_intrinsic(&context, OSEO_INTRINSIC_FUNCTION_HAS_INSTANCE)
        ));

        /* The constructor exposes that same symbol, not another one. */
        roots.slots[1] = require_normal(
            oseo_internal_ascii_string(&context, "hasInstance")
        );
        assert(require_normal(
            oseo_object_get(&context, roots.slots[0], roots.slots[1])
        ) == roots.slots[2]);
        oseo_roots_release(&context, &roots);
        oseo_context_destroy(&context);
        assert(context.objects == NULL);
    }
    assert(failures > 0u);
    assert(completed);
}

/*
 * A receiving context traces every value its roots hold, including one
 * another context owns, and the mark it leaves belongs to a heap it never
 * sweeps. The owning context therefore drops every mark before its own last
 * sweep, so destroying it frees its whole heap whatever another context
 * marked. An ordinary object carries that rule here: unlike a registered
 * representative, nothing keeps it alive past its own context, so a mark
 * left on it is what the final sweep would otherwise honor. The
 * representatives the same collection marks are the storage side of the
 * rule: a store keeps this context's own representative, so the other
 * heap's teardown leaves each stored key untouched.
 */
static void test_foreign_representative_leaves_no_mark(void) {
    static const uint16_t shared[] = {'m', 'a', 'r', 'k', 'e', 'd'};
    OseoContext origin;
    OseoContext receiver;
    OseoRootFrame origin_roots = {NULL, NULL, 0u};
    OseoRootFrame receiver_roots = {NULL, NULL, 0u};
    init_context(&origin, "symbol-mark-origin");
    init_context(&receiver, "symbol-mark-receiver");
    (void)require_normal(oseo_roots_allocate(&origin, &origin_roots, 8u));
    (void)require_normal(oseo_roots_allocate(&receiver, &receiver_roots, 12u));

    origin_roots.slots[3] =
        register_units(&origin, origin_roots.slots, shared, 6u);
    origin_roots.slots[4] =
        require_normal(oseo_object_create(&origin, oseo_null()));
    receiver_roots.slots[3] =
        require_normal(oseo_object_create(&receiver, oseo_null()));
    receiver_roots.slots[4] =
        construct_intrinsic(&receiver, OSEO_INTRINSIC_MAP);
    /*
     * An object the origin owns and nothing outlives, rooted here only long
     * enough for one collection of this heap to mark it.
     */
    receiver_roots.slots[8] = origin_roots.slots[4];

    /*
     * The foreign representative is an argument the receiving context
     * roots, and localizing it allocates, so this collection is the one a
     * safepoint inside that localization takes anyway.
     */
    receiver_roots.slots[5] = origin_roots.slots[3];
    oseo_collect(&receiver);
    (void)require_normal(oseo_object_set(
        &receiver,
        receiver_roots.slots[3],
        receiver_roots.slots[5],
        oseo_number(1.0),
        true
    ));
    receiver_roots.slots[6] = receiver_roots.slots[5];
    receiver_roots.slots[7] = oseo_number(2.0);
    (void)call_method(
        &receiver,
        receiver_roots.slots[4],
        "set",
        2u,
        &receiver_roots.slots[6]
    );
    oseo_collect(&receiver);

    /* Both stores kept the receiving context's own representative. */
    OseoValue local = require_normal(
        oseo_internal_local_symbol(&receiver, origin_roots.slots[3])
    );
    assert(local != origin_roots.slots[3]);
    assert(ordinary_object(receiver_roots.slots[3])->properties[0].key ==
        local);
    assert(map_object(receiver_roots.slots[4])->entries[0].key == local);
    receiver_roots.slots[5] = oseo_undefined();
    receiver_roots.slots[6] = oseo_undefined();
    receiver_roots.slots[8] = oseo_undefined();

    /* The owning context frees its whole heap, marks and all. */
    oseo_roots_release(&origin, &origin_roots);
    oseo_context_destroy(&origin);
    assert(origin.objects == NULL);

    oseo_collect(&receiver);
    assert(oseo_internal_same_value(
        require_normal(
            oseo_object_get(&receiver, receiver_roots.slots[3], local)
        ),
        oseo_number(1.0)
    ));
    receiver_roots.slots[5] = local;
    assert(call_method(
        &receiver,
        receiver_roots.slots[4],
        "has",
        1u,
        &receiver_roots.slots[5]
    ) == oseo_boolean(true));
    oseo_roots_release(&receiver, &receiver_roots);
    oseo_context_destroy(&receiver);
    assert(receiver.objects == NULL);
}

/*
 * A value position keeps whatever representative reached it. Localizing
 * covers the identity positions a lookup probes, a property key, a Map key,
 * and a Set element, but an ordinary property value, an array element, a
 * Map value, a WeakMap value, and a settled promise's result each keep the
 * value they were handed, and the collector traces dozens more fields like
 * them. A receiving context therefore does hold a representative another
 * context created, and destroying that context has to leave every one of
 * those stores readable rather than dangling: the representative and its
 * description leave the dying heap instead of being freed with it. Each
 * read below dereferences the retired symbol, which is what an
 * address sanitizer reports when the value is freed with its context.
 */
static void test_foreign_value_survives_origin_teardown(void) {
    static const uint16_t shared[] = {'k', 'e', 'p', 't'};
    OseoContext origin;
    OseoContext receiver;
    OseoRootFrame origin_roots = {NULL, NULL, 0u};
    OseoRootFrame receiver_roots = {NULL, NULL, 0u};
    init_context(&origin, "symbol-value-origin");
    init_context(&receiver, "symbol-value-receiver");
    (void)require_normal(oseo_roots_allocate(&origin, &origin_roots, 4u));
    (void)require_normal(oseo_roots_allocate(&receiver, &receiver_roots, 16u));

    origin_roots.slots[3] =
        register_units(&origin, origin_roots.slots, shared, 4u);
    OseoValue foreign = origin_roots.slots[3];

    receiver_roots.slots[3] =
        require_normal(oseo_object_create(&receiver, oseo_null()));
    receiver_roots.slots[4] = require_normal(oseo_array_create(&receiver, 0u));
    receiver_roots.slots[5] =
        construct_intrinsic(&receiver, OSEO_INTRINSIC_MAP);
    receiver_roots.slots[6] =
        construct_intrinsic(&receiver, OSEO_INTRINSIC_WEAK_MAP);
    receiver_roots.slots[8] =
        require_normal(oseo_object_create(&receiver, oseo_null()));
    receiver_roots.slots[13] =
        require_normal(oseo_internal_ascii_string(&receiver, "held"));
    receiver_roots.slots[14] =
        require_normal(oseo_internal_ascii_string(&receiver, "0"));
    receiver_roots.slots[9] = foreign;

    /* An ordinary property value. */
    (void)require_normal(oseo_object_set(
        &receiver,
        receiver_roots.slots[3],
        receiver_roots.slots[13],
        receiver_roots.slots[9],
        true
    ));

    /* An array element. */
    (void)require_normal(oseo_array_append(
        &receiver,
        receiver_roots.slots[4],
        receiver_roots.slots[9]
    ));

    /* A Map value under a string key. */
    receiver_roots.slots[11] = receiver_roots.slots[13];
    receiver_roots.slots[12] = receiver_roots.slots[9];
    (void)call_method(
        &receiver,
        receiver_roots.slots[5],
        "set",
        2u,
        &receiver_roots.slots[11]
    );

    /* A WeakMap value behind an object key, which is an ephemeron value. */
    receiver_roots.slots[11] = receiver_roots.slots[8];
    receiver_roots.slots[12] = receiver_roots.slots[9];
    (void)call_method(
        &receiver,
        receiver_roots.slots[6],
        "set",
        2u,
        &receiver_roots.slots[11]
    );

    /* A fulfilled promise's result. */
    receiver_roots.slots[7] = require_normal(
        oseo_promise_resolve(&receiver, receiver_roots.slots[9])
    );
    (void)require_normal(oseo_jobs_drain(&receiver));

    /*
     * Every one of these stores kept the value it was handed, which is the
     * representative the other context owns.
     */
    assert(ordinary_object(receiver_roots.slots[3])->properties[0].value ==
        foreign);
    assert(map_object(receiver_roots.slots[5])->entries[0].value == foreign);
    assert(oseo_promise_state(receiver_roots.slots[7]) ==
        OSEO_PROMISE_FULFILLED);
    receiver_roots.slots[9] = oseo_undefined();
    receiver_roots.slots[11] = oseo_undefined();
    receiver_roots.slots[12] = oseo_undefined();

    /* The originating context goes away while every store still holds it. */
    oseo_roots_release(&origin, &origin_roots);
    oseo_context_destroy(&origin);
    assert(origin.objects == NULL);
    oseo_collect(&receiver);
    oseo_collect(&receiver);

    /*
     * Hand the allocator a run of requests the size of a symbol before
     * anything reads a store back. A build that freed the representative
     * with its context then reads a block the allocator has handed out
     * again, which is what makes this case fail on the Zig lane: its
     * address sanitizer does not report a plain heap-use-after-free here,
     * while the host C compiler sanitizer lane reports the access itself.
     * Reuse is allocator behavior rather than a guarantee, so the two lanes
     * together are the evidence. The array keeps every request alive.
     */
    receiver_roots.slots[15] = require_normal(oseo_array_create(&receiver, 0u));
    for (size_t index = 0u; index < 64u; index += 1u) {
        receiver_roots.slots[9] = require_normal(
            oseo_internal_symbol_create(&receiver, oseo_undefined())
        );
        (void)require_normal(oseo_array_append(
            &receiver,
            receiver_roots.slots[15],
            receiver_roots.slots[9]
        ));
    }
    receiver_roots.slots[9] = oseo_undefined();

    /* Each store reads back a usable symbol that names the same key. */
    OseoValue stores[5] = {
        require_normal(oseo_object_get(
            &receiver,
            receiver_roots.slots[3],
            receiver_roots.slots[13]
        )),
        require_normal(oseo_object_get(
            &receiver,
            receiver_roots.slots[4],
            receiver_roots.slots[14]
        )),
        oseo_undefined(),
        oseo_undefined(),
        require_normal(oseo_promise_result(&receiver, receiver_roots.slots[7]))
    };
    receiver_roots.slots[11] = receiver_roots.slots[13];
    stores[2] = call_method(
        &receiver,
        receiver_roots.slots[5],
        "get",
        1u,
        &receiver_roots.slots[11]
    );
    receiver_roots.slots[11] = receiver_roots.slots[8];
    stores[3] = call_method(
        &receiver,
        receiver_roots.slots[6],
        "get",
        1u,
        &receiver_roots.slots[11]
    );
    receiver_roots.slots[11] = oseo_undefined();

    /*
     * This context registers the same key for the first time only now, so
     * its own representative is a value the retired one has to answer for.
     */
    receiver_roots.slots[10] =
        register_units(&receiver, receiver_roots.slots, shared, 4u);
    OseoValue local = receiver_roots.slots[10];
    assert(local != foreign);
    for (size_t index = 0u; index < 5u; index += 1u) {
        OseoValue stored = stores[index];
        assert(stored == foreign);
        assert(is_symbol(stored));
        assert(entry_of(stored) == entry_of(local));
        assert(oseo_internal_same_value(stored, local));
        assert_boolean(oseo_strict_equal(&receiver, stored, local), true);

        /* The description is readable, so its string outlived the heap. */
        receiver_roots.slots[9] = stored;
        receiver_roots.slots[11] = require_normal(
            oseo_internal_ascii_string(&receiver, "description")
        );
        receiver_roots.slots[11] = require_normal(oseo_object_get(
            &receiver,
            receiver_roots.slots[9],
            receiver_roots.slots[11]
        ));
        assert(is_string(receiver_roots.slots[11]));
        assert(string_object(receiver_roots.slots[11])->length == 4u);
        for (size_t unit = 0u; unit < 4u; unit += 1u) {
            assert(string_object(receiver_roots.slots[11])->units[unit] ==
                shared[unit]);
        }

        /* keyFor answers from the shared entry the retired symbol names. */
        receiver_roots.slots[11] = call_symbol_static(
            &receiver,
            receiver_roots.slots,
            "keyFor",
            stored
        );
        assert(is_string(receiver_roots.slots[11]));
        assert(string_object(receiver_roots.slots[11])->length == 4u);

        /* It still keys a property, and the store keeps the local value. */
        receiver_roots.slots[9] = stored;
        (void)require_normal(oseo_object_set(
            &receiver,
            receiver_roots.slots[8],
            receiver_roots.slots[9],
            oseo_number((double)index),
            true
        ));
        assert(ordinary_object(receiver_roots.slots[8])->properties[0].key ==
            local);
        assert(oseo_internal_same_value(
            require_normal(
                oseo_object_get(&receiver, receiver_roots.slots[8], local)
            ),
            oseo_number((double)index)
        ));
        receiver_roots.slots[9] = oseo_undefined();
        receiver_roots.slots[11] = oseo_undefined();
    }

    oseo_roots_release(&receiver, &receiver_roots);
    oseo_context_destroy(&receiver);
    assert(receiver.objects == NULL);
}

int main(void) {
    test_shared_entries_across_contexts();
    test_identity_across_contexts();
    test_growth_preserves_identity();
    test_failed_build_retry_keeps_symbol_identity();
    test_foreign_representative_leaves_no_mark();
    test_foreign_value_survives_origin_teardown();
    return 0;
}
