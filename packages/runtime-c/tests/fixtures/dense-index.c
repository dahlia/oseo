/*
 * Dense index hint evidence. An own index lookup finds its slot or
 * misses without scanning the property vector only while the object's
 * dense index hint holds, and no JavaScript surface can see that hint, so
 * this fixture reads it through the package-private representation.
 * Ascending index writes, as Array.prototype.fill performs them into
 * holes and as an array-like object literal receives them after its
 * `length`, must keep the hint, because losing it makes every later miss
 * a linear scan, which is the quadratic cost the hint removes. Every
 * other step compares the lookup against a plain scan of the vector, so
 * a stale hint shows as a wrong answer.
 */
#include "runtime_internal.h"

#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Index keys the differential probes, past every length used below. */
#define PROBE_LIMIT 40u

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue index_key(OseoContext *context, uint32_t index) {
    return require_normal(
        oseo_property_key(context, oseo_number((double)index))
    );
}

static OseoValue named_key(OseoContext *context, uint16_t unit) {
    return require_normal(oseo_string_from_units(context, &unit, 1u));
}

static size_t scanned_index(const OseoOrdinaryObject *object, OseoValue key) {
    for (size_t slot = 0u; slot < object->property_count; slot += 1u) {
        OseoValue stored = object->properties[slot].key;
        if (oseo_internal_property_key_equal(stored, key)) return slot;
    }
    return SIZE_MAX;
}

/* The hint's own invariant, whenever the object still claims it. */
static void expect_hint_invariant(const OseoOrdinaryObject *object) {
    if (!object->dense_index_known) return;
    size_t base = object->dense_index_base;
    size_t end = base + object->dense_index_count;
    assert(end <= object->property_count);
    for (size_t slot = 0u; slot < object->property_count; slot += 1u) {
        uint32_t index;
        bool is_index =
            oseo_internal_array_index(object->properties[slot].key, &index);
        if (slot >= base && slot < end) {
            assert(is_index && index == slot - base);
        } else {
            assert(!is_index);
        }
    }
}

/* slots[1] holds the object; slots[2] is scratch for each probe key. */
static void expect_lookups(OseoContext *context, OseoValue *slots) {
    expect_hint_invariant(ordinary_object(slots[1]));
    for (uint32_t index = 0u; index < PROBE_LIMIT; index += 1u) {
        slots[2] = index_key(context, index);
        const OseoOrdinaryObject *object = ordinary_object(slots[1]);
        assert(
            oseo_internal_own_property_index(object, slots[2]) ==
                scanned_index(object, slots[2])
        );
    }
    for (uint16_t unit = 'a'; unit <= 'z'; unit += 1u) {
        slots[2] = named_key(context, unit);
        const OseoOrdinaryObject *object = ordinary_object(slots[1]);
        assert(
            oseo_internal_own_property_index(object, slots[2]) ==
                scanned_index(object, slots[2])
        );
    }
}

static void set_index(OseoContext *context, OseoValue *slots, uint32_t index) {
    slots[2] = index_key(context, index);
    (void)require_normal(oseo_object_set(
        context,
        slots[1],
        slots[2],
        oseo_number((double)index),
        true
    ));
}

static void set_named(OseoContext *context, OseoValue *slots, uint16_t unit) {
    slots[2] = named_key(context, unit);
    (void)require_normal(
        oseo_object_set(context, slots[1], slots[2], oseo_number(0.0), true)
    );
}

/* Deletes the key slots[2] holds. */
static void delete_key(OseoContext *context, OseoValue *slots) {
    OseoValue deleted =
        require_normal(oseo_object_delete(context, slots[1], slots[2], true));
    assert(deleted == oseo_boolean(true));
}

static void set_length(OseoContext *context, OseoValue *slots, double length) {
    static const uint16_t units[] = {'l', 'e', 'n', 'g', 't', 'h'};
    slots[2] = require_normal(oseo_string_from_units(context, units, 6u));
    (void)require_normal(oseo_object_set(
        context,
        slots[1],
        slots[2],
        oseo_number(length),
        true
    ));
}

static void define_accessor(
    OseoContext *context,
    OseoValue *slots,
    uint32_t index
) {
    slots[2] = index_key(context, index);
    (void)require_normal(oseo_object_define_accessor(
        context,
        slots[1],
        slots[2],
        oseo_undefined(),
        oseo_undefined(),
        true,
        false,
        (OseoPropertyAttributes){true, false, true, true}
    ));
}

static void expect_hint(
    OseoValue object,
    bool known,
    size_t base,
    uint32_t count
) {
    const OseoOrdinaryObject *ordinary = ordinary_object(object);
    assert(ordinary->dense_index_known == known);
    if (known) {
        assert(ordinary->dense_index_count == count);
        if (count > 0u) assert(ordinary->dense_index_base == base);
    }
}

static void fresh_array(OseoContext *context, OseoValue *slots, size_t length) {
    slots[1] = require_normal(oseo_array_create(context, length));
    expect_hint(slots[1], true, 0u, 0u);
}

static void fresh_object(OseoContext *context, OseoValue *slots) {
    slots[1] = require_normal(oseo_object_literal_create(context));
    expect_hint(slots[1], true, 0u, 0u);
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "dense-index.c", 13u);
    (void)require_normal(oseo_roots_allocate(&context, &frame, 3u));
    OseoValue *slots = frame.slots;

    /*
     * Ascending writes into ten thousand holes extend the run once per
     * write. Tail truncation through length removes its last slot each
     * time.
     */
    fresh_array(&context, slots, 10000u);
    for (uint32_t index = 0u; index < 10000u; index += 1u) {
        set_index(&context, slots, index);
        expect_hint(slots[1], true, 0u, index + 1u);
    }
    set_length(&context, slots, 5000.0);
    assert(ordinary_object(slots[1])->array_length == 5000u);
    expect_hint(slots[1], true, 0u, 5000u);

    /* An array-like object stores its run after the leading `length`. */
    fresh_object(&context, slots);
    set_length(&context, slots, 10000.0);
    for (uint32_t index = 0u; index < 10000u; index += 1u) {
        set_index(&context, slots, index);
        expect_hint(slots[1], true, 1u, index + 1u);
    }

    /* Named keys after the run keep it, including across truncation. */
    fresh_array(&context, slots, 32u);
    for (uint32_t index = 0u; index < 6u; index += 1u) {
        set_index(&context, slots, index);
    }
    set_named(&context, slots, 'x');
    expect_hint(slots[1], true, 0u, 6u);
    expect_lookups(&context, slots);
    set_length(&context, slots, 3.0);
    expect_hint(slots[1], true, 0u, 3u);
    expect_lookups(&context, slots);
    slots[2] = named_key(&context, 'x');
    delete_key(&context, slots);
    expect_hint(slots[1], true, 0u, 3u);
    set_index(&context, slots, 3u);
    expect_hint(slots[1], true, 0u, 4u);
    expect_lookups(&context, slots);

    /* An index stored after a named key cannot extend the run. */
    set_named(&context, slots, 'y');
    set_index(&context, slots, 4u);
    expect_hint(slots[1], false, 0u, 0u);
    expect_lookups(&context, slots);

    /* Out-of-order insertion gives up the hint. */
    fresh_array(&context, slots, 32u);
    set_index(&context, slots, 5u);
    expect_hint(slots[1], false, 0u, 0u);
    /*
     * The lookup trusts a claimed hint instead of scanning: forcing the
     * claim over the stray index hides it. This is the miss the
     * ascending writes above take ten thousand times.
     */
    slots[2] = index_key(&context, 5u);
    ordinary_object(slots[1])->dense_index_known = true;
    assert(
        oseo_internal_own_property_index(ordinary_object(slots[1]), slots[2]) ==
            SIZE_MAX
    );
    ordinary_object(slots[1])->dense_index_known = false;
    assert(
        oseo_internal_own_property_index(ordinary_object(slots[1]), slots[2]) ==
            0u
    );
    set_index(&context, slots, 0u);
    expect_lookups(&context, slots);

    /* Deleting the last run index shrinks it; a middle one ends it. */
    fresh_array(&context, slots, 32u);
    for (uint32_t index = 0u; index < 10u; index += 1u) {
        set_index(&context, slots, index);
    }
    slots[2] = index_key(&context, 9u);
    delete_key(&context, slots);
    expect_hint(slots[1], true, 0u, 9u);
    expect_lookups(&context, slots);
    slots[2] = index_key(&context, 4u);
    delete_key(&context, slots);
    expect_hint(slots[1], false, 0u, 0u);
    expect_lookups(&context, slots);

    /*
     * Removing a named key before the run shifts it down whole, and
     * emptying the run lets a later index 0 start a new one anywhere.
     */
    fresh_object(&context, slots);
    set_named(&context, slots, 'a');
    set_named(&context, slots, 'b');
    for (uint32_t index = 0u; index < 3u; index += 1u) {
        set_index(&context, slots, index);
    }
    set_named(&context, slots, 'c');
    expect_hint(slots[1], true, 2u, 3u);
    expect_lookups(&context, slots);
    slots[2] = named_key(&context, 'a');
    delete_key(&context, slots);
    expect_hint(slots[1], true, 1u, 3u);
    expect_lookups(&context, slots);
    for (uint32_t index = 3u; index > 0u; index -= 1u) {
        slots[2] = index_key(&context, index - 1u);
        delete_key(&context, slots);
        expect_lookups(&context, slots);
    }
    expect_hint(slots[1], true, 0u, 0u);
    set_index(&context, slots, 0u);
    expect_hint(slots[1], true, 2u, 1u);
    expect_lookups(&context, slots);
    /* An index other than 0 cannot start a run. */
    fresh_object(&context, slots);
    set_index(&context, slots, 1u);
    expect_hint(slots[1], false, 0u, 0u);
    set_index(&context, slots, 0u);
    expect_lookups(&context, slots);

    /* Accessor definitions follow the same rule as data writes. */
    fresh_array(&context, slots, 32u);
    define_accessor(&context, slots, 0u);
    set_index(&context, slots, 1u);
    expect_hint(slots[1], true, 0u, 2u);
    expect_lookups(&context, slots);
    define_accessor(&context, slots, 7u);
    expect_hint(slots[1], false, 0u, 0u);
    expect_lookups(&context, slots);

    /* Redefining an existing run index stores no new key. */
    fresh_object(&context, slots);
    set_index(&context, slots, 0u);
    define_accessor(&context, slots, 0u);
    expect_hint(slots[1], true, 0u, 1u);
    expect_lookups(&context, slots);

    /* Generated accumulation appends at the length, past the run. */
    fresh_array(&context, slots, 0u);
    for (uint32_t index = 0u; index < 3u; index += 1u) {
        (void)require_normal(
            oseo_array_append(&context, slots[1], oseo_number(1.0))
        );
    }
    expect_hint(slots[1], true, 0u, 3u);
    (void)require_normal(oseo_array_append_hole(&context, slots[1]));
    (void)require_normal(
        oseo_array_append(&context, slots[1], oseo_number(1.0))
    );
    expect_hint(slots[1], false, 0u, 0u);
    expect_lookups(&context, slots);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
