#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * WeakMap, WeakSet, WeakRef, and FinalizationRegistry. Each source-visible
 * object wraps one collector-only record from runtime_memory.c, so the
 * ephemeron fixed point, weak-target clearing, and deterministic
 * finalization scheduling stay owned by the collector. This component owns
 * the constructors and prototype methods, CanBeHeldWeakly, the job-scoped
 * KeptAlive set, and the cleanup job step the event loop schedules.
 */

static void initialize_ordinary(
    OseoContext *context,
    OseoOrdinaryObject *object,
    OseoValue prototype
) {
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->private_elements = NULL;
    object->private_element_capacity = 0u;
    object->private_element_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    object->extensible = true;
    object->module_namespace = false;
    object->immutable_prototype = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->virtual_string_iterator = false;
    object->virtual_string_iterator_configurable = false;
    object->virtual_string_iterator_enumerable = false;
    object->virtual_string_iterator_writable = false;
    object->iterator_kind = OSEO_ITERATOR_NONE;
    object->iterator_target = oseo_undefined();
    object->iterator_index = 0u;
    object->regexp_string_iterator = false;
    object->regexp_iterator_regexp = oseo_undefined();
    object->regexp_iterator_subject = oseo_undefined();
    object->regexp_iterator_global = false;
    object->regexp_iterator_unicode = false;
    object->regexp_iterator_complete = false;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->wrap_for_valid_iterator = false;
    object->wrapped_iterator = oseo_undefined();
    object->wrapped_next = oseo_undefined();
    object->arguments_object = false;
    object->mapped_arguments = false;
    object->generator = NULL;
}

/*
 * CanBeHeldWeakly (9.13). This profile admits no Symbol.for registry, so
 * every Symbol value is unregistered and may be held weakly.
 */
static bool can_be_held_weakly(OseoValue value) {
    return is_object(value) || is_symbol(value);
}

static OseoValue argument_at(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return argument_count > index ? arguments[index] : oseo_undefined();
}

/* OrdinaryCreateFromConstructor's prototype selection for one intrinsic. */
static OseoResult prototype_from_target(
    OseoContext *context,
    OseoValue new_target,
    OseoIntrinsic fallback,
    OseoValue *prototype
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_constructor_prototype(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_validate_function_realm(
            context,
            frame.slots[0]
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_intrinsic(context, fallback);
        }
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Allocates one wrapper of `kind` around the collector record rooted in
 * `slots[1]`, with its prototype rooted in `slots[0]`.
 */
static OseoResult wrapper_allocate(
    OseoContext *context,
    OseoValue *slots,
    OseoHeapKind kind
) {
    OseoOrdinaryObject *ordinary = NULL;
    if (kind == OSEO_HEAP_WEAK_REF) {
        OseoWeakRef *reference =
            oseo_internal_allocate_heap_bytes(context, sizeof(*reference));
        if (reference != NULL) {
            reference->reference = slots[1];
            ordinary = &reference->ordinary;
        }
    } else if (kind == OSEO_HEAP_FINALIZATION_REGISTRY_OBJECT) {
        OseoFinalizationRegistryObject *registry =
            oseo_internal_allocate_heap_bytes(context, sizeof(*registry));
        if (registry != NULL) {
            registry->registry = slots[1];
            ordinary = &registry->ordinary;
        }
    } else {
        OseoWeakCollection *collection =
            oseo_internal_allocate_heap_bytes(context, sizeof(*collection));
        if (collection != NULL) {
            collection->table = slots[1];
            ordinary = &collection->ordinary;
        }
    }
    if (ordinary == NULL) {
        return failure(context, "OSEO2001", "Weak object allocation failed.");
    }
    initialize_ordinary(context, ordinary, slots[0]);
    return oseo_internal_publish_heap(context, &ordinary->header, kind);
}

/* IfAbruptCloseIterator for a catchable completion. */
static OseoResult close_after_abrupt(
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
 * The WeakMap and WeakSet constructors. A WeakMap reads its observable
 * `set` adder and adds [key, value] entries through AddEntriesFromIterable;
 * a WeakSet reads `add` and passes each value. Both obtain the adder before
 * acquiring the iterator and close it only after a completed step.
 */
static OseoResult weak_collection_construct(
    OseoContext *context,
    bool map,
    OseoValue iterable,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            map
                ? "WeakMap must be called with new."
                : "WeakSet must be called with new."
        );
    }
    /* 0 prototype then instance, 1 table, 2 iterable, 3 adder, 4 iterator,
     * 5 next method, 6 item, 7 key, 8 value, 9 "0", 10 "1". */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 11u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[2] = iterable;
    frame.slots[4] = new_target;
    result = prototype_from_target(
        context,
        frame.slots[4],
        map
            ? OSEO_INTRINSIC_WEAK_MAP_PROTOTYPE
            : OSEO_INTRINSIC_WEAK_SET_PROTOTYPE,
        &frame.slots[0]
    );
    frame.slots[4] = oseo_undefined();
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ephemeron_table_create(context);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = wrapper_allocate(
            context,
            frame.slots,
            map ? OSEO_HEAP_WEAK_MAP : OSEO_HEAP_WEAK_SET
        );
        frame.slots[0] = result.value;
    }
    if (result.status != OSEO_STATUS_NORMAL || is_nullish(frame.slots[2])) {
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_internal_ascii_string(context, map ? "set" : "add");
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_callable(frame.slots[3])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            map
                ? "The WeakMap set property is not callable."
                : "The WeakSet add property is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_iterator_get(context, frame.slots[2], &frame.slots[5]);
        frame.slots[4] = result.value;
    }
    static const uint16_t zero_units[] = {'0'};
    static const uint16_t one_units[] = {'1'};
    if (map && result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, zero_units, 1u);
        frame.slots[9] = result.value;
    }
    if (map && result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, one_units, 1u);
        frame.slots[10] = result.value;
    }
    while (result.status == OSEO_STATUS_NORMAL) {
        bool done = false;
        /* A throw from IteratorStepValue leaves the record done, so it
         * propagates without IteratorClose. */
        result = oseo_iterator_next(
            context,
            frame.slots[4],
            frame.slots[5],
            &frame.slots[6],
            &done
        );
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        if (!map) {
            result = oseo_call_function(
                context,
                frame.slots[3],
                frame.slots[0],
                1u,
                &frame.slots[6],
                oseo_undefined()
            );
        } else if (!is_object(frame.slots[6])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "A WeakMap constructor iterable entry must be an object."
            );
        } else {
            result = oseo_object_get(context, frame.slots[6], frame.slots[9]);
            frame.slots[7] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_object_get(
                    context,
                    frame.slots[6],
                    frame.slots[10]
                );
                frame.slots[8] = result.value;
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_call_function(
                    context,
                    frame.slots[3],
                    frame.slots[0],
                    2u,
                    &frame.slots[7],
                    oseo_undefined()
                );
            }
        }
        if (result.status != OSEO_STATUS_NORMAL) {
            result = close_after_abrupt(context, frame.slots[4], result);
            break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult weak_collection_receiver(
    OseoContext *context,
    OseoValue receiver,
    bool map,
    const char *message
) {
    if (map ? is_weak_map(receiver) : is_weak_set(receiver)) {
        return normal(receiver);
    }
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

static OseoResult weak_map_delete(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    OseoResult checked = weak_collection_receiver(
        context,
        receiver,
        true,
        "WeakMap.prototype.delete receiver is not a WeakMap."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (!can_be_held_weakly(key)) return normal(oseo_boolean(false));
    return normal(oseo_boolean(oseo_internal_ephemeron_delete(
        weak_collection_object(receiver)->table,
        key
    )));
}

static OseoResult weak_map_get(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    OseoResult checked = weak_collection_receiver(
        context,
        receiver,
        true,
        "WeakMap.prototype.get receiver is not a WeakMap."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue value = oseo_undefined();
    if (can_be_held_weakly(key)) {
        (void)oseo_internal_ephemeron_get(
            weak_collection_object(receiver)->table,
            key,
            &value
        );
    }
    return normal(value);
}

static OseoResult weak_collection_has(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key,
    bool map
) {
    OseoResult checked = weak_collection_receiver(
        context,
        receiver,
        map,
        map
            ? "WeakMap.prototype.has receiver is not a WeakMap."
            : "WeakSet.prototype.has receiver is not a WeakSet."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue value = oseo_undefined();
    bool present = can_be_held_weakly(key) &&
        oseo_internal_ephemeron_get(
            weak_collection_object(receiver)->table,
            key,
            &value
        );
    return normal(oseo_boolean(present));
}

/* WeakMap.prototype.set and WeakSet.prototype.add. Both return the
 * receiver; a WeakSet member maps to undefined so it traces nothing. */
static OseoResult weak_collection_store(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key,
    OseoValue value,
    bool map
) {
    OseoResult checked = weak_collection_receiver(
        context,
        receiver,
        map,
        map
            ? "WeakMap.prototype.set receiver is not a WeakMap."
            : "WeakSet.prototype.add receiver is not a WeakSet."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (!can_be_held_weakly(key)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            map
                ? "Invalid value used as a WeakMap key."
                : "Invalid value used in a WeakSet."
        );
    }
    OseoValue slots[1] = {receiver};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ephemeron_set(
        context,
        weak_collection_object(slots[0])->table,
        key,
        map ? value : oseo_undefined()
    );
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}

static OseoResult weak_set_delete(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value
) {
    OseoResult checked = weak_collection_receiver(
        context,
        receiver,
        false,
        "WeakSet.prototype.delete receiver is not a WeakSet."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (!can_be_held_weakly(value)) return normal(oseo_boolean(false));
    return normal(oseo_boolean(oseo_internal_ephemeron_delete(
        weak_collection_object(receiver)->table,
        value
    )));
}

/* KeptAlive uses the same address-keyed probing as ephemeron lookup. */
static size_t kept_slot_start(OseoValue value, size_t capacity) {
    uint64_t hash = ((value & OSEO_PAYLOAD_MASK) >> 3u) *
        UINT64_C(0x9e3779b97f4a7c15);
    return (size_t)(hash >> 20u) & (capacity - 1u);
}

OseoResult oseo_internal_keep_during_job(
    OseoContext *context,
    OseoValue value
) {
    if (tag_of(value) != OSEO_TAG_HEAP) return normal(oseo_undefined());
    OseoValue *kept = context->kept_objects;
    size_t capacity = context->kept_object_capacity;
    if (capacity != 0u) {
        size_t slot = kept_slot_start(value, capacity);
        while (kept[slot] != 0u) {
            if (kept[slot] == value) return normal(oseo_undefined());
            slot = (slot + 1u) & (capacity - 1u);
        }
    }
    if ((context->kept_object_count + 1u) > capacity / 4u * 3u) {
        size_t grown = capacity == 0u ? 16u : capacity;
        while (grown / 2u < context->kept_object_count + 1u) {
            if (grown > SIZE_MAX / 2u / sizeof(OseoValue)) {
                return failure(
                    context,
                    "OSEO2001",
                    "The kept-object set is too large."
                );
            }
            grown *= 2u;
        }
        OseoValue *slots =
            oseo_internal_allocate_work_bytes(context, grown * sizeof(*slots));
        if (slots == NULL) {
            return failure(
                context,
                "OSEO2001",
                "Kept-object allocation failed."
            );
        }
        for (size_t index = 0u; index < grown; index += 1u) slots[index] = 0u;
        for (size_t index = 0u; index < capacity; index += 1u) {
            if (kept[index] == 0u) continue;
            size_t slot = kept_slot_start(kept[index], grown);
            while (slots[slot] != 0u) slot = (slot + 1u) & (grown - 1u);
            slots[slot] = kept[index];
        }
        free(kept);
        context->kept_objects = slots;
        context->kept_object_capacity = grown;
        kept = slots;
        capacity = grown;
    }
    size_t slot = kept_slot_start(value, capacity);
    while (kept[slot] != 0u) slot = (slot + 1u) & (capacity - 1u);
    kept[slot] = value;
    context->kept_object_count += 1u;
    return normal(oseo_undefined());
}

void oseo_internal_clear_kept_objects(OseoContext *context) {
    if (context->kept_object_count == 0u) return;
    /* A large set from one job is released rather than rescanned by every
     * later job's clear. */
    if (context->kept_object_capacity > 256u) {
        free(context->kept_objects);
        context->kept_objects = NULL;
        context->kept_object_capacity = 0u;
    } else {
        OseoValue *kept = context->kept_objects;
        for (size_t index = 0u;
             index < context->kept_object_capacity;
             index += 1u) {
            kept[index] = 0u;
        }
    }
    context->kept_object_count = 0u;
}

static OseoResult weak_ref_construct(
    OseoContext *context,
    OseoValue target,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "WeakRef must be called with new."
        );
    }
    if (!can_be_held_weakly(target)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "WeakRef target cannot be held weakly."
        );
    }
    /* 0 prototype then instance, 1 weak reference, 2 target. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[1] = new_target;
    frame.slots[2] = target;
    result = prototype_from_target(
        context,
        frame.slots[1],
        OSEO_INTRINSIC_WEAK_REF_PROTOTYPE,
        &frame.slots[0]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_weak_reference_create(context, frame.slots[2]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = wrapper_allocate(context, frame.slots, OSEO_HEAP_WEAK_REF);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_keep_during_job(context, frame.slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult weak_ref_deref(OseoContext *context, OseoValue receiver) {
    if (!is_weak_ref(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "WeakRef.prototype.deref receiver is not a WeakRef."
        );
    }
    OseoValue target = oseo_internal_weak_reference_target(
        weak_ref_object(receiver)->reference
    );
    if (tag_of(target) != OSEO_TAG_HEAP) return normal(oseo_undefined());
    OseoResult kept = oseo_internal_keep_during_job(context, target);
    return kept.status == OSEO_STATUS_NORMAL ? normal(target) : kept;
}

static OseoResult finalization_registry_construct(
    OseoContext *context,
    OseoValue callback,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "FinalizationRegistry must be called with new."
        );
    }
    if (!is_callable(callback)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "FinalizationRegistry cleanup callback is not callable."
        );
    }
    /* 0 prototype then instance, 1 registry record, 2 callback. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[1] = new_target;
    frame.slots[2] = callback;
    result = prototype_from_target(
        context,
        frame.slots[1],
        OSEO_INTRINSIC_FINALIZATION_REGISTRY_PROTOTYPE,
        &frame.slots[0]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_finalization_registry_create(
            context,
            frame.slots[2]
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = wrapper_allocate(
            context,
            frame.slots,
            OSEO_HEAP_FINALIZATION_REGISTRY_OBJECT
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult finalization_registry_receiver(
    OseoContext *context,
    OseoValue receiver,
    const char *message
) {
    if (is_finalization_registry_object(receiver)) return normal(receiver);
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

static OseoResult finalization_registry_register(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult checked = finalization_registry_receiver(
        context,
        receiver,
        "FinalizationRegistry.prototype.register receiver is not a "
        "FinalizationRegistry."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue target = argument_at(argument_count, arguments, 0u);
    OseoValue holdings = argument_at(argument_count, arguments, 1u);
    OseoValue token = argument_at(argument_count, arguments, 2u);
    if (!can_be_held_weakly(target)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "FinalizationRegistry target cannot be held weakly."
        );
    }
    /* SameValue on a value that can be held weakly is identity. */
    if (target == holdings) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "FinalizationRegistry target and held value must differ."
        );
    }
    if (!can_be_held_weakly(token)) {
        if (tag_of(token) != OSEO_TAG_UNDEFINED) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "FinalizationRegistry unregister token cannot be held weakly."
            );
        }
        token = oseo_undefined();
    }
    OseoResult result = oseo_internal_finalization_register_token(
        context,
        finalization_registry_wrapper_object(receiver)->registry,
        target,
        holdings,
        token
    );
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

static OseoResult finalization_registry_unregister(
    OseoContext *context,
    OseoValue receiver,
    OseoValue token
) {
    OseoResult checked = finalization_registry_receiver(
        context,
        receiver,
        "FinalizationRegistry.prototype.unregister receiver is not a "
        "FinalizationRegistry."
    );
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (!can_be_held_weakly(token)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "FinalizationRegistry unregister token cannot be held weakly."
        );
    }
    return normal(oseo_boolean(oseo_internal_finalization_unregister(
        context,
        finalization_registry_wrapper_object(receiver)->registry,
        token
    )));
}

OseoResult oseo_internal_finalization_cleanup_job(
    OseoContext *context,
    bool *ran
) {
    OseoValue slots[3] = {oseo_undefined(), oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    *ran = oseo_internal_finalization_take_cleanup(
        context,
        &slots[0],
        &slots[2]
    );
    OseoResult result = normal(oseo_undefined());
    if (*ran) {
        slots[1] = finalization_registry_object(slots[0])->callback;
        do {
            result = oseo_call_function(
                context,
                slots[1],
                oseo_undefined(),
                1u,
                &slots[2],
                oseo_undefined()
            );
            slots[2] = oseo_undefined();
        } while (result.status == OSEO_STATUS_NORMAL &&
                 oseo_internal_finalization_take_registry_cleanup(
                     context,
                     slots[0],
                     &slots[2]
                 ));
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_weak_collection_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    OseoValue first = argument_at(argument_count, arguments, 0u);
    if (code_id == OSEO_WEAK_MAP_CONSTRUCTOR_CODE_ID) {
        return weak_collection_construct(context, true, first, new_target);
    }
    if (code_id == OSEO_WEAK_MAP_DELETE_CODE_ID) {
        return weak_map_delete(context, receiver, first);
    }
    if (code_id == OSEO_WEAK_MAP_GET_CODE_ID) {
        return weak_map_get(context, receiver, first);
    }
    if (code_id == OSEO_WEAK_MAP_HAS_CODE_ID) {
        return weak_collection_has(context, receiver, first, true);
    }
    if (code_id == OSEO_WEAK_MAP_SET_CODE_ID) {
        return weak_collection_store(
            context,
            receiver,
            first,
            argument_at(argument_count, arguments, 1u),
            true
        );
    }
    if (code_id == OSEO_WEAK_SET_CONSTRUCTOR_CODE_ID) {
        return weak_collection_construct(context, false, first, new_target);
    }
    if (code_id == OSEO_WEAK_SET_ADD_CODE_ID) {
        return weak_collection_store(
            context,
            receiver,
            first,
            oseo_undefined(),
            false
        );
    }
    if (code_id == OSEO_WEAK_SET_DELETE_CODE_ID) {
        return weak_set_delete(context, receiver, first);
    }
    if (code_id == OSEO_WEAK_SET_HAS_CODE_ID) {
        return weak_collection_has(context, receiver, first, false);
    }
    if (code_id == OSEO_WEAK_REF_CONSTRUCTOR_CODE_ID) {
        return weak_ref_construct(context, first, new_target);
    }
    if (code_id == OSEO_WEAK_REF_DEREF_CODE_ID) {
        return weak_ref_deref(context, receiver);
    }
    if (code_id == OSEO_FINALIZATION_REGISTRY_CONSTRUCTOR_CODE_ID) {
        return finalization_registry_construct(context, first, new_target);
    }
    if (code_id == OSEO_FINALIZATION_REGISTRY_REGISTER_CODE_ID) {
        return finalization_registry_register(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_FINALIZATION_REGISTRY_UNREGISTER_CODE_ID) {
        return finalization_registry_unregister(context, receiver, first);
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_weak_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind
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
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_ascii_property(
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

/* One source-visible method on a prototype. */
typedef struct {
    OseoIntrinsic intrinsic;
    size_t code_id;
    const char *name;
    size_t length;
} OseoWeakMethod;

/* One constructor, its prototype, and that prototype's methods. */
typedef struct {
    OseoIntrinsic prototype_intrinsic;
    OseoIntrinsic constructor_intrinsic;
    size_t constructor_code_id;
    const char *name;
    size_t length;
    const OseoWeakMethod *methods;
    size_t method_count;
} OseoWeakConstructor;

static const OseoWeakMethod weak_map_methods[] = {
    {
        OSEO_INTRINSIC_WEAK_MAP_DELETE,
        OSEO_WEAK_MAP_DELETE_CODE_ID,
        "delete",
        1u,
    },
    {OSEO_INTRINSIC_WEAK_MAP_GET, OSEO_WEAK_MAP_GET_CODE_ID, "get", 1u},
    {OSEO_INTRINSIC_WEAK_MAP_HAS, OSEO_WEAK_MAP_HAS_CODE_ID, "has", 1u},
    {OSEO_INTRINSIC_WEAK_MAP_SET, OSEO_WEAK_MAP_SET_CODE_ID, "set", 2u},
};

static const OseoWeakMethod weak_set_methods[] = {
    {OSEO_INTRINSIC_WEAK_SET_ADD, OSEO_WEAK_SET_ADD_CODE_ID, "add", 1u},
    {
        OSEO_INTRINSIC_WEAK_SET_DELETE,
        OSEO_WEAK_SET_DELETE_CODE_ID,
        "delete",
        1u,
    },
    {OSEO_INTRINSIC_WEAK_SET_HAS, OSEO_WEAK_SET_HAS_CODE_ID, "has", 1u},
};

static const OseoWeakMethod weak_ref_methods[] = {
    {OSEO_INTRINSIC_WEAK_REF_DEREF, OSEO_WEAK_REF_DEREF_CODE_ID, "deref", 0u},
};

static const OseoWeakMethod finalization_registry_methods[] = {
    {
        OSEO_INTRINSIC_FINALIZATION_REGISTRY_REGISTER,
        OSEO_FINALIZATION_REGISTRY_REGISTER_CODE_ID,
        "register",
        2u,
    },
    {
        OSEO_INTRINSIC_FINALIZATION_REGISTRY_UNREGISTER,
        OSEO_FINALIZATION_REGISTRY_UNREGISTER_CODE_ID,
        "unregister",
        1u,
    },
};

/*
 * Constructor order is the order globals are installed. The last method of
 * the last constructor doubles as the cluster's completion marker.
 */
static const OseoWeakConstructor weak_constructors[] = {
    {
        OSEO_INTRINSIC_WEAK_MAP_PROTOTYPE,
        OSEO_INTRINSIC_WEAK_MAP,
        OSEO_WEAK_MAP_CONSTRUCTOR_CODE_ID,
        "WeakMap",
        0u,
        weak_map_methods,
        sizeof(weak_map_methods) / sizeof(weak_map_methods[0]),
    },
    {
        OSEO_INTRINSIC_WEAK_SET_PROTOTYPE,
        OSEO_INTRINSIC_WEAK_SET,
        OSEO_WEAK_SET_CONSTRUCTOR_CODE_ID,
        "WeakSet",
        0u,
        weak_set_methods,
        sizeof(weak_set_methods) / sizeof(weak_set_methods[0]),
    },
    {
        OSEO_INTRINSIC_WEAK_REF_PROTOTYPE,
        OSEO_INTRINSIC_WEAK_REF,
        OSEO_WEAK_REF_CONSTRUCTOR_CODE_ID,
        "WeakRef",
        1u,
        weak_ref_methods,
        sizeof(weak_ref_methods) / sizeof(weak_ref_methods[0]),
    },
    {
        OSEO_INTRINSIC_FINALIZATION_REGISTRY_PROTOTYPE,
        OSEO_INTRINSIC_FINALIZATION_REGISTRY,
        OSEO_FINALIZATION_REGISTRY_CONSTRUCTOR_CODE_ID,
        "FinalizationRegistry",
        1u,
        finalization_registry_methods,
        sizeof(finalization_registry_methods) /
            sizeof(finalization_registry_methods[0]),
    },
};

#define OSEO_WEAK_CONSTRUCTOR_COUNT \
    (sizeof(weak_constructors) / sizeof(weak_constructors[0]))

/*
 * Builds one constructor and prototype. `slots` holds 0 Object.prototype,
 * 1 the prototype, 2 the constructor, 3 a method, 4 a key, and 5 a value.
 */
static OseoResult weak_constructor_build(
    OseoContext *context,
    const OseoWeakConstructor *description,
    OseoValue *slots
) {
    const OseoPropertyAttributes method = {true, false, true, false};
    OseoResult result = oseo_object_create(context, slots[0]);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[description->prototype_intrinsic] = slots[1];
        result = create_weak_builtin(
            context,
            description->constructor_code_id,
            description->name,
            description->length,
            OSEO_FUNCTION_ORDINARY
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[description->constructor_intrinsic] = slots[2];
        OseoFunction *constructor = function_object(slots[2]);
        constructor->prototype_object = slots[1];
        constructor->prototype_writable = false;
        result = define_ascii_property(
            context,
            slots[1],
            "constructor",
            slots[2],
            method
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < description->method_count;
         index += 1u) {
        const OseoWeakMethod *entry = &description->methods[index];
        result = create_weak_builtin(
            context,
            entry->code_id,
            entry->name,
            entry->length,
            OSEO_FUNCTION_INTERNAL
        );
        slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[entry->intrinsic] = slots[3];
        result = define_ascii_property(
            context,
            slots[1],
            entry->name,
            slots[3],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, description->name);
        slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[1],
            slots[4],
            slots[5],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    return result;
}

static OseoResult weak_collection_intrinsic_build(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_FINALIZATION_REGISTRY_UNREGISTER];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The weak collection intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
    result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_OBJECT_PROTOTYPE);
    frame.slots[0] = result.value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_WEAK_CONSTRUCTOR_COUNT;
         index += 1u) {
        result = weak_constructor_build(
            context,
            &weak_constructors[index],
            frame.slots
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_WEAK_MAP_PROTOTYPE;
             index <= OSEO_INTRINSIC_FINALIZATION_REGISTRY_UNREGISTER;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(*marker);
}

OseoResult oseo_internal_weak_collection_intrinsic(OseoContext *context) {
    return weak_collection_intrinsic_build(context);
}

OseoResult oseo_internal_install_weak_collection_globals(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_weak_collection_intrinsic(context);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_WEAK_CONSTRUCTOR_COUNT;
         index += 1u) {
        slots[1] =
            context->intrinsics[weak_constructors[index].constructor_intrinsic];
        result = define_ascii_property(
            context,
            slots[0],
            weak_constructors[index].name,
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
