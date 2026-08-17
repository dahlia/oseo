#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * The %Map% intrinsic: keyed collection storage with SameValueZero
 * identity and insertion order, its prototype methods, and
 * %MapIteratorPrototype%.
 */

static OseoResult map_intrinsic_build(OseoContext *context);

/*
 * [[MapData]] storage, growth, and SameValueZero lookup.
 */

/* Searches the live records by SameValueZero, skipping tombstones left
 * by a prior delete or clear. */
static size_t map_entry_find(const OseoMap *map, OseoValue key) {
    for (size_t index = 0u; index < map->entry_count; index += 1u) {
        if (map->entries[index].live &&
            oseo_internal_same_value_zero(map->entries[index].key, key)) {
            return index;
        }
    }
    return SIZE_MAX;
}

/* If SameValueZero(key, -0) is true, set key to +0, so a newly created
 * record always stores the canonical positive zero. */
static OseoValue map_normalize_key(OseoValue key) {
    if (is_number(key) && number_value(key) == 0.0) return oseo_number(0.0);
    return key;
}

static OseoResult map_grow_entries(OseoContext *context, OseoValue map_value) {
    OseoMap *map = map_object(map_value);
    if (map->entry_count < map->entry_capacity) return normal(map_value);
    size_t capacity = map->entry_capacity == 0u
        ? 4u
        : map->entry_capacity * 2u;
    if (capacity < map->entry_capacity ||
        capacity > SIZE_MAX / sizeof(OseoMapEntry)) {
        return failure(context, "OSEO2001", "Map storage is too large.");
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    map = map_object(map_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(context, "OSEO2001", "Map storage allocation failed.");
    }
    OseoMapEntry *entries = malloc(capacity * sizeof(*entries));
    if (entries == NULL) {
        return failure(context, "OSEO2001", "Map storage allocation failed.");
    }
    if (map->entry_count > 0u) {
        memcpy(entries, map->entries, map->entry_count * sizeof(*entries));
    }
    free(map->entries);
    map->entries = entries;
    map->entry_capacity = capacity;
    return normal(map_value);
}

/* Appends {key, value} as a fresh live [[MapData]] record. `key` must
 * already be normalized. A record is always appended rather than
 * reusing a tombstone slot, which is what lets a key deleted and later
 * re-added reappear at the end of insertion order instead of its
 * original position. */
static OseoResult map_append_entry(
    OseoContext *context,
    OseoValue map_value,
    OseoValue key,
    OseoValue value
) {
    OseoValue slots[3] = {map_value, key, value};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = map_grow_entries(context, slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoMap *map = map_object(slots[0]);
        map->entries[map->entry_count].key = slots[1];
        map->entries[map->entry_count].value = slots[2];
        map->entries[map->entry_count].live = true;
        map->entry_count += 1u;
        map->live_count += 1u;
        result = normal(slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Allocation.
 */

static OseoResult map_allocate(
    OseoContext *context,
    OseoValue prototype_value
) {
    OseoValue rooted = prototype_value;
    OseoRootFrame frame = {NULL, &rooted, 1u};
    oseo_roots_push(context, &frame);
    OseoMap *map = oseo_internal_allocate_heap_bytes(context, sizeof(*map));
    if (map == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Map allocation failed.");
    }
    map->ordinary.prototype = rooted;
    map->ordinary.properties = NULL;
    map->ordinary.property_capacity = 0u;
    map->ordinary.property_count = 0u;
    map->ordinary.private_elements = NULL;
    map->ordinary.private_element_capacity = 0u;
    map->ordinary.private_element_count = 0u;
    map->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    map->ordinary.array_length = 0u;
    map->ordinary.dictionary = false;
    map->ordinary.length_writable = false;
    map->ordinary.extensible = true;
    map->ordinary.module_namespace = false;
    map->ordinary.global_object = false;
    map->ordinary.error_data = false;
    map->ordinary.number_data = false;
    map->ordinary.number_value = oseo_undefined();
    map->ordinary.primitive_data = false;
    map->ordinary.primitive_value = oseo_undefined();
    map->ordinary.primitive_wrapper_methods_initialized = false;
    map->ordinary.virtual_string_iterator = false;
    map->ordinary.virtual_string_iterator_configurable = false;
    map->ordinary.virtual_string_iterator_enumerable = false;
    map->ordinary.virtual_string_iterator_writable = false;
    map->ordinary.array_iterator = false;
    map->ordinary.iterator_array = oseo_undefined();
    map->ordinary.iterator_index = 0u;
    map->ordinary.regexp_string_iterator = false;
    map->ordinary.regexp_iterator_subject = oseo_undefined();
    map->ordinary.regexp_iterator_pattern = oseo_undefined();
    map->ordinary.regexp_iterator_index = 0u;
    map->ordinary.regexp_iterator_complete = false;
    map->ordinary.async_from_sync = false;
    map->ordinary.async_sync_iterator = oseo_undefined();
    map->ordinary.wrap_for_valid_iterator = false;
    map->ordinary.wrapped_iterator = oseo_undefined();
    map->ordinary.wrapped_next = oseo_undefined();
    map->ordinary.generator = NULL;
    map->ordinary.arguments_object = false;
    map->ordinary.mapped_arguments = false;
    map->entries = NULL;
    map->entry_count = 0u;
    map->entry_capacity = 0u;
    map->live_count = 0u;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &map->ordinary.header,
        OSEO_HEAP_MAP
    );
    oseo_roots_pop(context, &frame);
    return published;
}

static OseoResult map_prototype_intrinsic(OseoContext *context) {
    OseoValue *cache = &context->intrinsics[OSEO_INTRINSIC_MAP_PROTOTYPE];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoResult built = map_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(*cache);
}

/* ! Construct(%Map%): a fresh empty map taking the realm prototype
 * directly, used by Map.groupBy, which never observes a subclass. */
static OseoResult map_create(OseoContext *context) {
    OseoResult prototype = map_prototype_intrinsic(context);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    return map_allocate(context, prototype.value);
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%Map.prototype%"). A
 * subclass constructor carries its own `prototype` object, so
 * `new Subclass(iterable)` gives its instance that object while a plain
 * `new Map(iterable)` keeps the realm prototype.
 */
static OseoResult map_create_from_constructor(
    OseoContext *context,
    OseoValue new_target
) {
    OseoValue prototype = is_function(new_target)
        ? function_object(new_target)->prototype_object
        : oseo_undefined();
    if (is_object(prototype)) return map_allocate(context, prototype);
    OseoResult fallback = map_prototype_intrinsic(context);
    if (fallback.status != OSEO_STATUS_NORMAL) return fallback;
    return map_allocate(context, fallback.value);
}

/*
 * Constructor: iteration, IteratorClose, and Map.groupBy.
 */

/* IfAbruptCloseIterator: closes the iterator record and returns the
 * original abrupt completion, unless closing itself throws or the
 * runtime already carries an internal diagnostic rather than a
 * catchable thrown value. `abrupt` is returned unexamined when it is
 * not a catchable throw, which is what keeps a non-catchable internal
 * diagnostic, such as an allocation failure while constructing the
 * thrown error itself, from being cleared and replaced with a
 * catchable completion. */
static OseoResult map_iterator_close_after_abrupt(
    OseoContext *context,
    OseoValue iterator,
    OseoResult abrupt
) {
    if (abrupt.status != OSEO_STATUS_THROW || context->has_diagnostic) {
        return abrupt;
    }
    OseoValue slots[2] = {iterator, abrupt.value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    oseo_context_clear_language_error(context);
    OseoResult closed = oseo_iterator_close(context, slots[0], true);
    OseoResult result = closed.status == OSEO_STATUS_NORMAL
        ? (OseoResult){OSEO_STATUS_THROW, slots[1]}
        : closed;
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * AddEntriesFromIterable(target, iterable, adder), specialized to the
 * Map constructor's own already-captured adder.
 */
static OseoResult map_add_entries_from_iterable(
    OseoContext *context,
    OseoValue map_value,
    OseoValue iterable,
    OseoValue adder
) {
    /* 0 map, 1 adder, 2 iterator, 3 next method, 4 next item,
     * 5 "0" key, 6 "1" key, 7 k, 8 v. */
    OseoValue slots[9] = {
        map_value, adder, iterable, oseo_undefined(), oseo_undefined(),
        oseo_undefined(), oseo_undefined(), oseo_undefined(), oseo_undefined()
    };
    OseoRootFrame frame = {NULL, slots, 9u};
    oseo_roots_push(context, &frame);
    OseoValue next_method = oseo_undefined();
    OseoResult result = oseo_iterator_get(context, slots[2], &next_method);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) slots[3] = next_method;
    static const uint16_t zero_units[] = {'0'};
    static const uint16_t one_units[] = {'1'};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, zero_units, 1u);
        slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, one_units, 1u);
        slots[6] = result.value;
    }
    while (result.status == OSEO_STATUS_NORMAL) {
        bool done = false;
        result = oseo_iterator_next(
            context,
            slots[2],
            slots[3],
            &slots[4],
            &done
        );
        /* A throw from IteratorStep leaves the iterator record done, so
         * the specification rejects without calling IteratorClose. */
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        if (!is_object(slots[4])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "A Map constructor iterable entry must be an object."
            );
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
        result = oseo_object_get(context, slots[4], slots[5]);
        slots[7] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
        result = oseo_object_get(context, slots[4], slots[6]);
        slots[8] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            2u,
            &slots[7],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
    }
    OseoValue map_result = slots[0];
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(map_result) : result;
}

static OseoResult map_construct_with_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue iterable
) {
    OseoResult created = map_create_from_constructor(context, new_target);
    if (created.status != OSEO_STATUS_NORMAL) return created;
    if (is_nullish(iterable)) return created;
    OseoValue slots[3] = {created.value, iterable, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    static const uint16_t set_units[] = {'s', 'e', 't'};
    OseoResult result = oseo_string_from_units(context, set_units, 3u);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], result.value);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Map adder property is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = map_add_entries_from_iterable(
            context,
            slots[0],
            slots[1],
            slots[2]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Map.groupBy(items, callbackfn): GroupBy with the zero (SameValueZero)
 * key comparator, built directly into a fresh map's [[MapData]] instead
 * of through a Get(map, "set") lookup, since the specified algorithm
 * never observes an overridden adder.
 */
static OseoResult map_group_by(
    OseoContext *context,
    OseoValue items,
    OseoValue callback
) {
    if (!is_function(callback)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Map.groupBy callback is not callable."
        );
    }
    OseoResult created = map_create(context);
    if (created.status != OSEO_STATUS_NORMAL) return created;
    /* 0 map, 1 callback, 2 iterator, 3 next method, 4 value,
     * 5 index number, 6 key, 7 group array. */
    OseoValue slots[8] = {
        created.value, callback, items, oseo_undefined(), oseo_undefined(),
        oseo_undefined(), oseo_undefined(), oseo_undefined()
    };
    OseoRootFrame frame = {NULL, slots, 8u};
    oseo_roots_push(context, &frame);
    OseoValue next_method = oseo_undefined();
    OseoResult result = oseo_iterator_get(context, slots[2], &next_method);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) slots[3] = next_method;
    double index = 0.0;
    while (result.status == OSEO_STATUS_NORMAL) {
        /* GroupBy checks k >= 2^53 - 1 before every IteratorStepValue,
         * even one that would report the iterator done, rather than
         * after. */
        if (index >= 9007199254740991.0) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Map.groupBy has too many values."
            );
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
        bool done = false;
        result = oseo_iterator_next(
            context,
            slots[2],
            slots[3],
            &slots[4],
            &done
        );
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        slots[5] = oseo_number(index);
        index += 1.0;
        result = oseo_call_function(
            context,
            slots[1],
            oseo_undefined(),
            2u,
            &slots[4],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            result = map_iterator_close_after_abrupt(
                context,
                slots[2],
                result
            );
            break;
        }
        slots[6] = map_normalize_key(result.value);
        size_t found = map_entry_find(map_object(slots[0]), slots[6]);
        if (found != SIZE_MAX) {
            slots[7] = map_object(slots[0])->entries[found].value;
            result = oseo_array_append(context, slots[7], slots[4]);
        } else {
            result = oseo_array_create(context, 0u);
            slots[7] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_array_append(context, slots[7], slots[4]);
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = map_append_entry(
                    context,
                    slots[0],
                    slots[6],
                    slots[7]
                );
            }
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    OseoValue map_result = slots[0];
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(map_result) : result;
}

/*
 * Map.prototype methods. Each brands its receiver before touching
 * [[MapData]].
 */

static OseoResult map_prototype_get(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.get called on incompatible receiver."
        );
    }
    size_t index = map_entry_find(map_object(receiver), key);
    if (index == SIZE_MAX) return normal(oseo_undefined());
    return normal(map_object(receiver)->entries[index].value);
}

static OseoResult map_prototype_has(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.has called on incompatible receiver."
        );
    }
    bool present = map_entry_find(map_object(receiver), key) != SIZE_MAX;
    return normal(oseo_boolean(present));
}

static OseoResult map_prototype_set(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key,
    OseoValue value
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.set called on incompatible receiver."
        );
    }
    OseoValue normalized_key = map_normalize_key(key);
    size_t index = map_entry_find(map_object(receiver), normalized_key);
    if (index != SIZE_MAX) {
        map_object(receiver)->entries[index].value = value;
        return normal(receiver);
    }
    OseoResult result =
        map_append_entry(context, receiver, normalized_key, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(receiver);
}

static OseoResult map_prototype_delete(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.delete called on incompatible receiver."
        );
    }
    OseoMap *map = map_object(receiver);
    size_t index = map_entry_find(map, key);
    if (index == SIZE_MAX) return normal(oseo_boolean(false));
    map->entries[index].live = false;
    map->entries[index].key = oseo_undefined();
    map->entries[index].value = oseo_undefined();
    map->live_count -= 1u;
    return normal(oseo_boolean(true));
}

static OseoResult map_prototype_clear(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.clear called on incompatible receiver."
        );
    }
    OseoMap *map = map_object(receiver);
    for (size_t index = 0u; index < map->entry_count; index += 1u) {
        map->entries[index].live = false;
        map->entries[index].key = oseo_undefined();
        map->entries[index].value = oseo_undefined();
    }
    map->live_count = 0u;
    return normal(oseo_undefined());
}

static OseoResult map_prototype_size_getter(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method get Map.prototype.size called on incompatible receiver."
        );
    }
    return normal(oseo_number((double)map_object(receiver)->live_count));
}

/*
 * Map.prototype.forEach walks [[MapData]] by index rather than a
 * snapshot, re-reading the entry array pointer on every step: the
 * callback may itself call `set` on this map, which can reallocate the
 * backing storage and grow entry_count, and a value it adds during the
 * walk is still visited once the walk reaches it, matching the
 * specified behavior.
 */
static OseoResult map_prototype_for_each(
    OseoContext *context,
    OseoValue receiver,
    OseoValue callback,
    OseoValue this_argument
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method Map.prototype.forEach called on incompatible receiver."
        );
    }
    if (!is_function(callback)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Map.prototype.forEach callback is not callable."
        );
    }
    /* 0 map, 1 callback, 2 thisArg, 3 value, 4 key, 5 map (again, so the
     * three call arguments sit in one contiguous rooted range). */
    OseoValue slots[6] = {
        receiver, callback, this_argument,
        oseo_undefined(), oseo_undefined(), receiver
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    size_t index = 0u;
    while (true) {
        OseoMap *map = map_object(slots[0]);
        if (index >= map->entry_count) break;
        if (!map->entries[index].live) {
            index += 1u;
            continue;
        }
        slots[3] = map->entries[index].value;
        slots[4] = map->entries[index].key;
        index += 1u;
        OseoResult called = oseo_call_function(
            context,
            slots[1],
            slots[2],
            3u,
            &slots[3],
            oseo_undefined()
        );
        /* forEach always returns undefined; only an abrupt callback
         * completion overrides that, never a callback's return value. */
        if (called.status != OSEO_STATUS_NORMAL) {
            result = called;
            break;
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * %MapIteratorPrototype% and CreateMapIterator.
 */

static OseoResult map_iterator_prototype_intrinsic(OseoContext *context) {
    OseoValue *cache =
        &context->intrinsics[OSEO_INTRINSIC_MAP_ITERATOR_PROTOTYPE];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoResult built = map_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(*cache);
}

static OseoResult map_create_iterator(
    OseoContext *context,
    OseoValue receiver,
    OseoMapIterationKind kind,
    const char *message
) {
    if (!is_map(receiver)) {
        return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
    }
    OseoResult prototype = map_iterator_prototype_intrinsic(context);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    OseoValue slots[2] = {receiver, prototype.value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoMapIterator *iterator =
        oseo_internal_allocate_heap_bytes(context, sizeof(*iterator));
    if (iterator == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Map iterator allocation failed."
        );
    }
    iterator->ordinary.prototype = slots[1];
    iterator->ordinary.properties = NULL;
    iterator->ordinary.property_capacity = 0u;
    iterator->ordinary.property_count = 0u;
    iterator->ordinary.private_elements = NULL;
    iterator->ordinary.private_element_capacity = 0u;
    iterator->ordinary.private_element_count = 0u;
    iterator->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    iterator->ordinary.array_length = 0u;
    iterator->ordinary.dictionary = false;
    iterator->ordinary.length_writable = false;
    iterator->ordinary.extensible = true;
    iterator->ordinary.module_namespace = false;
    iterator->ordinary.global_object = false;
    iterator->ordinary.error_data = false;
    iterator->ordinary.number_data = false;
    iterator->ordinary.number_value = oseo_undefined();
    iterator->ordinary.primitive_data = false;
    iterator->ordinary.primitive_value = oseo_undefined();
    iterator->ordinary.primitive_wrapper_methods_initialized = false;
    iterator->ordinary.virtual_string_iterator = false;
    iterator->ordinary.virtual_string_iterator_configurable = false;
    iterator->ordinary.virtual_string_iterator_enumerable = false;
    iterator->ordinary.virtual_string_iterator_writable = false;
    iterator->ordinary.array_iterator = false;
    iterator->ordinary.iterator_array = oseo_undefined();
    iterator->ordinary.iterator_index = 0u;
    iterator->ordinary.regexp_string_iterator = false;
    iterator->ordinary.regexp_iterator_subject = oseo_undefined();
    iterator->ordinary.regexp_iterator_pattern = oseo_undefined();
    iterator->ordinary.regexp_iterator_index = 0u;
    iterator->ordinary.regexp_iterator_complete = false;
    iterator->ordinary.async_from_sync = false;
    iterator->ordinary.async_sync_iterator = oseo_undefined();
    iterator->ordinary.wrap_for_valid_iterator = false;
    iterator->ordinary.wrapped_iterator = oseo_undefined();
    iterator->ordinary.wrapped_next = oseo_undefined();
    iterator->ordinary.generator = NULL;
    iterator->ordinary.arguments_object = false;
    iterator->ordinary.mapped_arguments = false;
    iterator->target = slots[0];
    iterator->index = 0u;
    iterator->kind = kind;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &iterator->ordinary.header,
        OSEO_HEAP_MAP_ITERATOR
    );
    oseo_roots_pop(context, &frame);
    return published;
}

static OseoResult map_iterator_next(OseoContext *context, OseoValue receiver) {
    if (!is_map_iterator(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Method %MapIteratorPrototype%.next called on incompatible "
            "receiver."
        );
    }
    OseoMapIterator *iterator = map_iterator_object(receiver);
    if (tag_of(iterator->target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    OseoValue slots[3] = {receiver, iterator->target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    bool found = false;
    while (true) {
        OseoMap *map = map_object(slots[1]);
        OseoMapIterator *live_iterator = map_iterator_object(slots[0]);
        if (live_iterator->index >= map->entry_count) break;
        size_t index = live_iterator->index;
        live_iterator->index += 1u;
        if (!map->entries[index].live) continue;
        found = true;
        if (live_iterator->kind == OSEO_MAP_ITERATION_KEY) {
            slots[2] = map->entries[index].key;
        } else if (live_iterator->kind == OSEO_MAP_ITERATION_VALUE) {
            slots[2] = map->entries[index].value;
        } else {
            OseoValue key = map->entries[index].key;
            OseoValue value = map->entries[index].value;
            result = oseo_array_create(context, 0u);
            slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_array_append(context, slots[2], key);
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_array_append(context, slots[2], value);
            }
        }
        break;
    }
    if (result.status == OSEO_STATUS_NORMAL && found) {
        result = oseo_internal_iterator_result(context, slots[2], false);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        map_iterator_object(slots[0])->target = oseo_undefined();
        result = oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Intrinsic cluster construction and installation.
 */

static OseoResult create_map_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind,
    OseoFunctionNamePrefix prefix
) {
    size_t name_length = strlen(name);
    if (name_length > 31u) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    uint16_t units[31];
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            environment,
            units,
            name_length,
            length,
            kind,
            oseo_undefined(),
            oseo_undefined(),
            prefix
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_map_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Materializes %MapIteratorPrototype%, %Map.prototype%, and %Map%
 * together, so a map or map iterator reached without naming `Map`
 * still finds every specified own property on its prototype chain.
 *
 * `OSEO_INTRINSIC_MAP_SPECIES` is filled last, so it doubles as the
 * completion marker the way the Promise cluster's species slot does:
 * a partially built cluster leaves it undefined and the failure path
 * clears every slot the attempt filled, and the uninitialized sentinel
 * reports a reentrant build attempt instead of splitting identities
 * across two concurrent attempts.
 */
static OseoResult map_intrinsic_build(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_MAP_SPECIES];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The Map intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();

    /* %MapIteratorPrototype%, independent of %Map%/%Map.prototype%. */
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_ITERATOR_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_ITERATOR_PROTOTYPE] =
            frame.slots[1];
        result = create_map_builtin(
            context,
            OSEO_MAP_ITERATOR_NEXT_CODE_ID,
            "next",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_ITERATOR_NEXT] = frame.slots[2];
        result = define_map_property(
            context,
            frame.slots[1],
            "next",
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Map Iterator");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }

    /* %Map.prototype%. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_PROTOTYPE] = frame.slots[1];
    }
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_MAP_GET,
        OSEO_INTRINSIC_MAP_SET,
        OSEO_INTRINSIC_MAP_HAS,
        OSEO_INTRINSIC_MAP_DELETE,
        OSEO_INTRINSIC_MAP_CLEAR,
        OSEO_INTRINSIC_MAP_FOR_EACH,
        OSEO_INTRINSIC_MAP_KEYS,
        OSEO_INTRINSIC_MAP_VALUES,
    };
    static const size_t method_codes[] = {
        OSEO_MAP_GET_CODE_ID,
        OSEO_MAP_SET_CODE_ID,
        OSEO_MAP_HAS_CODE_ID,
        OSEO_MAP_DELETE_CODE_ID,
        OSEO_MAP_CLEAR_CODE_ID,
        OSEO_MAP_FOR_EACH_CODE_ID,
        OSEO_MAP_KEYS_CODE_ID,
        OSEO_MAP_VALUES_CODE_ID,
    };
    static const char *const method_names[] = {
        "get", "set", "has", "delete", "clear", "forEach", "keys", "values",
    };
    static const size_t method_lengths[] = {1u, 2u, 1u, 1u, 0u, 1u, 0u, 0u};
    const OseoPropertyAttributes method = {true, false, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 8u;
         index += 1u) {
        result = create_map_builtin(
            context,
            method_codes[index],
            method_names[index],
            method_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[method_intrinsics[index]] = frame.slots[2];
        result = define_map_property(
            context,
            frame.slots[1],
            method_names[index],
            frame.slots[2],
            method
        );
    }
    /* entries and [Symbol.iterator] are the same function object. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_map_builtin(
            context,
            OSEO_MAP_ENTRIES_CODE_ID,
            "entries",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_ENTRIES] = frame.slots[2];
        result = define_map_property(
            context,
            frame.slots[1],
            "entries",
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            method
        );
    }
    /* size, a getter-only accessor. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_map_builtin(
            context,
            OSEO_MAP_SIZE_GETTER_CODE_ID,
            "size",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "size");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_SIZE_GETTER] = frame.slots[2];
        result = oseo_object_define_accessor(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Map");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }

    /* %Map%. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_map_builtin(
            context,
            OSEO_MAP_CONSTRUCTOR_CODE_ID,
            "Map",
            0u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP] = frame.slots[2];
        OseoFunction *constructor = function_object(frame.slots[2]);
        constructor->prototype_object = frame.slots[1];
        constructor->prototype_writable = false;
        result = define_map_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_map_builtin(
            context,
            OSEO_MAP_GROUP_BY_CODE_ID,
            "groupBy",
            2u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_MAP_GROUP_BY] = frame.slots[5];
        result = define_map_property(
            context,
            frame.slots[2],
            "groupBy",
            frame.slots[5],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_map_builtin(
            context,
            OSEO_MAP_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[2],
            frame.slots[3],
            frame.slots[5],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_MAP_ITERATOR_PROTOTYPE;
             index <= OSEO_INTRINSIC_MAP_SPECIES;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue species = frame.slots[5];
    context->intrinsics[OSEO_INTRINSIC_MAP_SPECIES] = species;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(species);
}

OseoResult oseo_internal_map_prototype(OseoContext *context) {
    return map_prototype_intrinsic(context);
}

OseoResult oseo_internal_map_intrinsic(OseoContext *context) {
    OseoResult built = map_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_MAP]);
}

OseoResult oseo_internal_install_map_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_map_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_map_property(
            context,
            slots[0],
            "Map",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}

/*
 * Dispatch.
 */

OseoResult oseo_internal_map_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_MAP_CONSTRUCTOR_CODE_ID) {
        /* 24.1.1.1 step 1: Map is not callable without new. */
        if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The Map constructor requires new."
            );
        }
        return map_construct_with_target(
            context,
            new_target,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        /* Every remaining built-in here is a method, accessor, or
         * static, and ECMA-262 gives none of them a [[Construct]]. */
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Map built-in function is not a constructor."
        );
    }
    if (code_id == OSEO_MAP_SPECIES_CODE_ID) {
        return normal(receiver);
    }
    if (code_id == OSEO_MAP_GET_CODE_ID) {
        return map_prototype_get(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_HAS_CODE_ID) {
        return map_prototype_has(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_SET_CODE_ID) {
        return map_prototype_set(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined(),
            argument_count > 1u ? arguments[1] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_DELETE_CODE_ID) {
        return map_prototype_delete(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_CLEAR_CODE_ID) {
        return map_prototype_clear(context, receiver);
    }
    if (code_id == OSEO_MAP_SIZE_GETTER_CODE_ID) {
        return map_prototype_size_getter(context, receiver);
    }
    if (code_id == OSEO_MAP_FOR_EACH_CODE_ID) {
        return map_prototype_for_each(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined(),
            argument_count > 1u ? arguments[1] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_KEYS_CODE_ID) {
        return map_create_iterator(
            context,
            receiver,
            OSEO_MAP_ITERATION_KEY,
            "Method Map.prototype.keys called on incompatible receiver."
        );
    }
    if (code_id == OSEO_MAP_VALUES_CODE_ID) {
        return map_create_iterator(
            context,
            receiver,
            OSEO_MAP_ITERATION_VALUE,
            "Method Map.prototype.values called on incompatible receiver."
        );
    }
    if (code_id == OSEO_MAP_ENTRIES_CODE_ID) {
        return map_create_iterator(
            context,
            receiver,
            OSEO_MAP_ITERATION_KEY_VALUE,
            "Method Map.prototype.entries called on incompatible receiver."
        );
    }
    if (code_id == OSEO_MAP_GROUP_BY_CODE_ID) {
        return map_group_by(
            context,
            argument_count > 0u ? arguments[0] : oseo_undefined(),
            argument_count > 1u ? arguments[1] : oseo_undefined()
        );
    }
    if (code_id == OSEO_MAP_ITERATOR_NEXT_CODE_ID) {
        return map_iterator_next(context, receiver);
    }
    return oseo_unknown_function(context, code_id);
}
