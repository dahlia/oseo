#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * Set construction, insertion-ordered element storage, core prototype
 * methods, and %SetIteratorPrototype%.
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

static OseoResult set_receiver(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_set(receiver)) return normal(receiver);
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Set method receiver is not a Set."
    );
}

/* Set normalizes either zero sign to the realm's canonical positive zero. */
static OseoValue normalize_set_value(OseoValue value) {
    return is_number(value) && number_value(value) == 0.0
        ? oseo_number(0.0)
        : value;
}

/* Searches the live slots by the shared SameValueZero, skipping the
 * tombstones a prior delete or clear left behind. */
static size_t set_find(const OseoSet *set, OseoValue value) {
    for (size_t index = 0u; index < set->element_count; index += 1u) {
        if (set->elements[index].present &&
            oseo_internal_same_value_zero(set->elements[index].value, value)) {
            return index;
        }
    }
    return SIZE_MAX;
}

/* Reserving element storage is a safepoint. The Set value stays rooted by
 * every caller, and the record is reacquired after collection. */
static OseoResult grow_set(OseoContext *context, OseoValue set_value) {
    OseoSet *set = set_object(set_value);
    if (set->element_count < set->element_capacity) {
        return normal(set_value);
    }
    size_t capacity = set->element_capacity == 0u
        ? 4u
        : set->element_capacity * 2u;
    if (capacity < set->element_capacity ||
        capacity > SIZE_MAX / sizeof(OseoSetElement)) {
        return failure(context, "OSEO2001", "Set storage is too large.");
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    set = set_object(set_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(context, "OSEO2001", "Set storage allocation failed.");
    }
    OseoSetElement *elements = malloc(capacity * sizeof(*elements));
    if (elements == NULL) {
        return failure(context, "OSEO2001", "Set storage allocation failed.");
    }
    if (set->element_count > 0u) {
        memcpy(
            elements,
            set->elements,
            set->element_count * sizeof(*elements)
        );
    }
    free(set->elements);
    set->elements = elements;
    set->element_capacity = capacity;
    return normal(set_value);
}

static OseoResult set_allocate(
    OseoContext *context,
    OseoValue prototype
) {
    OseoValue slot = prototype;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoSet *set = oseo_internal_allocate_heap_bytes(context, sizeof(*set));
    if (set == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Set allocation failed.");
    }
    initialize_ordinary(context, &set->ordinary, slot);
    set->elements = NULL;
    set->element_capacity = 0u;
    set->element_count = 0u;
    set->size = 0u;
    OseoResult result = oseo_internal_publish_heap(
        context,
        &set->ordinary.header,
        OSEO_HEAP_SET
    );
    oseo_roots_pop(context, &frame);
    return result;
}

/* OrdinaryCreateFromConstructor(newTarget, "%Set.prototype%"). */
static OseoResult set_prototype_from_target(
    OseoContext *context,
    OseoValue new_target,
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
            result = oseo_internal_intrinsic(
                context,
                OSEO_INTRINSIC_SET_PROTOTYPE
            );
        }
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult set_add(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value
) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue slots[2] = {receiver, normalize_set_value(value)};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoSet *set = set_object(slots[0]);
    if (set_find(set, slots[1]) != SIZE_MAX) {
        oseo_roots_pop(context, &frame);
        return normal(slots[0]);
    }
    OseoResult result = grow_set(context, slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        set = set_object(slots[0]);
        OseoSetElement *element = &set->elements[set->element_count];
        element->value = slots[1];
        element->present = true;
        set->element_count += 1u;
        set->size += 1u;
        result = normal(slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult set_clear(OseoContext *context, OseoValue receiver) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoSet *set = set_object(receiver);
    for (size_t index = 0u; index < set->element_count; index += 1u) {
        set->elements[index].present = false;
        set->elements[index].value = oseo_undefined();
    }
    set->size = 0u;
    return normal(oseo_undefined());
}

static OseoResult set_delete(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value
) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoSet *set = set_object(receiver);
    size_t index = set_find(set, value);
    if (index == SIZE_MAX) return normal(oseo_boolean(false));
    set->elements[index].present = false;
    set->elements[index].value = oseo_undefined();
    set->size -= 1u;
    return normal(oseo_boolean(true));
}

static OseoResult set_has(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value
) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    bool present = set_find(set_object(receiver), value) != SIZE_MAX;
    return normal(oseo_boolean(present));
}

static OseoResult set_size(OseoContext *context, OseoValue receiver) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return normal(oseo_number((double)set_object(receiver)->size));
}

static OseoResult set_iterator_create(
    OseoContext *context,
    OseoValue set,
    OseoSetIteratorKind kind
) {
    OseoValue slots[2] = {set, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_SET_ITERATOR_PROTOTYPE
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoSetIterator *iterator =
            oseo_internal_allocate_heap_bytes(context, sizeof(*iterator));
        if (iterator == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Set iterator allocation failed."
            );
        } else {
            initialize_ordinary(context, &iterator->ordinary, slots[1]);
            iterator->set = slots[0];
            iterator->index = 0u;
            iterator->kind = kind;
            iterator->done = false;
            result = oseo_internal_publish_heap(
                context,
                &iterator->ordinary.header,
                OSEO_HEAP_SET_ITERATOR
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult set_entries(OseoContext *context, OseoValue receiver) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return set_iterator_create(context, receiver, OSEO_SET_ITERATOR_ENTRY);
}

static OseoResult set_values(OseoContext *context, OseoValue receiver) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return set_iterator_create(context, receiver, OSEO_SET_ITERATOR_VALUE);
}

static OseoResult set_iterator_next(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_set_iterator(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Set iterator next requires a Set iterator receiver."
        );
    }
    OseoValue slots[3] = {receiver, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoSetIterator *iterator = set_iterator_object(slots[0]);
    if (iterator->done || !is_set(iterator->set)) {
        iterator->done = true;
        iterator->set = oseo_undefined();
        oseo_roots_pop(context, &frame);
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    slots[1] = iterator->set;
    OseoSet *set = set_object(slots[1]);
    while (iterator->index < set->element_count) {
        size_t index = iterator->index;
        iterator->index += 1u;
        if (!set->elements[index].present) continue;
        slots[2] = set->elements[index].value;
        OseoResult result = normal(slots[2]);
        if (iterator->kind == OSEO_SET_ITERATOR_ENTRY) {
            result = oseo_array_create(context, 0u);
            if (result.status == OSEO_STATUS_NORMAL) {
                OseoValue pair = result.value;
                OseoRootFrame pair_frame = {NULL, &pair, 1u};
                oseo_roots_push(context, &pair_frame);
                result = oseo_array_append(context, pair, slots[2]);
                if (result.status == OSEO_STATUS_NORMAL) {
                    result = oseo_array_append(context, pair, slots[2]);
                }
                oseo_roots_pop(context, &pair_frame);
                if (result.status == OSEO_STATUS_NORMAL) slots[2] = pair;
            }
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_iterator_result(context, slots[2], false);
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    iterator = set_iterator_object(slots[0]);
    iterator->done = true;
    iterator->set = oseo_undefined();
    oseo_roots_pop(context, &frame);
    return oseo_internal_iterator_result(context, oseo_undefined(), true);
}

static OseoResult set_for_each(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult checked = set_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue callback = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (!is_callable(callback)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Set.prototype.forEach callback is not callable."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = callback;
    frame.slots[2] = argument_count > 1u
        ? arguments[1]
        : oseo_undefined();
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoSet *set = set_object(frame.slots[0]);
        while (index < set->element_count &&
               !set->elements[index].present) {
            index += 1u;
        }
        if (index >= set->element_count) break;
        frame.slots[3] = set->elements[index].value;
        index += 1u;
        frame.slots[4] = frame.slots[3];
        frame.slots[5] = frame.slots[0];
        result = oseo_call_function(
            context,
            frame.slots[1],
            frame.slots[2],
            3u,
            &frame.slots[3],
            oseo_undefined()
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_undefined());
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* AddEntriesFromIterable with the Set instance's observable `add` method. */
static OseoResult set_constructor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Set must be called with new."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    frame.slots[1] = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    result = set_prototype_from_target(
        context,
        frame.slots[0],
        &frame.slots[2]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = set_allocate(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status != OSEO_STATUS_NORMAL || is_nullish(frame.slots[1])) {
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_internal_ascii_string(context, "add");
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[2], frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_callable(frame.slots[3])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Set add property is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_iterator_get(
            context,
            frame.slots[1],
            &frame.slots[5]
        );
        frame.slots[4] = result.value;
    }
    bool done = false;
    while (result.status == OSEO_STATUS_NORMAL && !done) {
        result = oseo_iterator_next(
            context,
            frame.slots[4],
            frame.slots[5],
            &frame.slots[1],
            &done
        );
        bool close_iterator = false;
        if (result.status == OSEO_STATUS_NORMAL && !done) {
            close_iterator = true;
            result = oseo_call_function(
                context,
                frame.slots[3],
                frame.slots[2],
                1u,
                &frame.slots[1],
                oseo_undefined()
            );
        }
        if (close_iterator && result.status == OSEO_STATUS_THROW &&
            !context->has_diagnostic && is_object(frame.slots[4])) {
            OseoResult completion = result;
            frame.slots[1] = result.value;
            oseo_context_clear_language_error(context);
            OseoResult closed = oseo_iterator_close(
                context,
                frame.slots[4],
                true
            );
            result = closed.status == OSEO_STATUS_THROW &&
                    context->has_diagnostic
                ? closed
                : completion;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_set_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_SET_CONSTRUCTOR_CODE_ID) {
        return set_constructor(
            context,
            argument_count,
            arguments,
            new_target
        );
    }
    OseoValue value = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (code_id == OSEO_SET_ADD_CODE_ID) {
        return set_add(context, receiver, value);
    }
    if (code_id == OSEO_SET_CLEAR_CODE_ID) {
        return set_clear(context, receiver);
    }
    if (code_id == OSEO_SET_DELETE_CODE_ID) {
        return set_delete(context, receiver, value);
    }
    if (code_id == OSEO_SET_ENTRIES_CODE_ID) {
        return set_entries(context, receiver);
    }
    if (code_id == OSEO_SET_FOR_EACH_CODE_ID) {
        return set_for_each(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_SET_HAS_CODE_ID) {
        return set_has(context, receiver, value);
    }
    if (code_id == OSEO_SET_SIZE_CODE_ID) {
        return set_size(context, receiver);
    }
    if (code_id == OSEO_SET_VALUES_CODE_ID) {
        return set_values(context, receiver);
    }
    if (code_id == OSEO_SET_ITERATOR_NEXT_CODE_ID) {
        return set_iterator_next(context, receiver);
    }
    if (code_id == OSEO_SET_SPECIES_CODE_ID) return normal(receiver);
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_set_builtin(
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

static OseoResult define_set_property(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, key, value};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_define(
        context,
        slots[0],
        slots[1],
        slots[2],
        attributes
    );
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_set_ascii_property(
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

static OseoResult set_intrinsic_build(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_SET_SPECIES];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The Set intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET_PROTOTYPE] = frame.slots[1];
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ITERATOR_PROTOTYPE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET_ITERATOR_PROTOTYPE] =
            frame.slots[2];
        result = create_set_builtin(
            context,
            OSEO_SET_CONSTRUCTOR_CODE_ID,
            "Set",
            0u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[3] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET] = frame.slots[3];
        OseoFunction *constructor = function_object(frame.slots[3]);
        constructor->prototype_object = frame.slots[1];
        constructor->prototype_writable = false;
        result = define_set_ascii_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[3],
            method
        );
    }
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_SET_ADD,
        OSEO_INTRINSIC_SET_CLEAR,
        OSEO_INTRINSIC_SET_DELETE,
        OSEO_INTRINSIC_SET_ENTRIES,
        OSEO_INTRINSIC_SET_FOR_EACH,
        OSEO_INTRINSIC_SET_HAS,
    };
    static const size_t method_codes[] = {
        OSEO_SET_ADD_CODE_ID,
        OSEO_SET_CLEAR_CODE_ID,
        OSEO_SET_DELETE_CODE_ID,
        OSEO_SET_ENTRIES_CODE_ID,
        OSEO_SET_FOR_EACH_CODE_ID,
        OSEO_SET_HAS_CODE_ID,
    };
    static const char *const method_names[] = {
        "add", "clear", "delete", "entries", "forEach", "has",
    };
    static const size_t method_lengths[] = {1u, 0u, 1u, 0u, 1u, 1u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 6u;
         index += 1u) {
        result = create_set_builtin(
            context,
            method_codes[index],
            method_names[index],
            method_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[4] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[method_intrinsics[index]] = frame.slots[4];
        result = define_set_ascii_property(
            context,
            frame.slots[1],
            method_names[index],
            frame.slots[4],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_set_builtin(
            context,
            OSEO_SET_SIZE_CODE_ID,
            "size",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET_SIZE] = frame.slots[4];
        result = oseo_internal_ascii_string(context, "size");
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[1],
            frame.slots[5],
            frame.slots[4],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_set_builtin(
            context,
            OSEO_SET_VALUES_CODE_ID,
            "values",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET_VALUES] = frame.slots[4];
        result = define_set_ascii_property(
            context,
            frame.slots[1],
            "values",
            frame.slots[4],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_set_ascii_property(
            context,
            frame.slots[1],
            "keys",
            frame.slots[4],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_set_property(
            context,
            frame.slots[1],
            frame.slots[5],
            frame.slots[4],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Set");
        frame.slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_set_property(
            context,
            frame.slots[1],
            frame.slots[5],
            frame.slots[6],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_set_builtin(
            context,
            OSEO_SET_ITERATOR_NEXT_CODE_ID,
            "next",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SET_ITERATOR_NEXT] = frame.slots[4];
        result = define_set_ascii_property(
            context,
            frame.slots[2],
            "next",
            frame.slots[4],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Set Iterator");
        frame.slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_set_property(
            context,
            frame.slots[2],
            frame.slots[5],
            frame.slots[6],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_set_builtin(
            context,
            OSEO_SET_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[3],
            frame.slots[5],
            frame.slots[4],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_SET_PROTOTYPE;
             index <= OSEO_INTRINSIC_SET_SPECIES;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue species = frame.slots[4];
    context->intrinsics[OSEO_INTRINSIC_SET_SPECIES] = species;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(species);
}

OseoResult oseo_internal_set_intrinsic(OseoContext *context) {
    OseoResult built = set_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_SET]);
}

OseoResult oseo_internal_install_set_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_set_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Set");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
