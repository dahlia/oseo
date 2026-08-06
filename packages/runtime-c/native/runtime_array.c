#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>

OseoResult oseo_internal_array_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)new_target;
    if (code_id != OSEO_ARRAY_PUSH_CODE_ID) {
        return oseo_unknown_function(context, code_id);
    }
    return oseo_internal_array_push(
        context,
        receiver,
        argument_count,
        arguments
    );
}

/*
 * Array exotic behavior: array creation, the `length` own property and
 * its truncation rules, canonical index keys, monotonic literal and
 * spread accumulation, frozen template objects, and the realm-owned
 * `%Array.prototype%` methods admitted by M5.
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

OseoResult oseo_internal_set_array_length(
    OseoContext *context,
    OseoOrdinaryObject *array,
    OseoValue value,
    bool strict,
    bool allow_same_value,
    bool *valid_length
) {
    if (valid_length != NULL) *valid_length = false;
    OseoResult converted = oseo_internal_to_number(context, value);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    double number = number_value(converted.value);
    if (!isfinite(number) || number < 0.0 ||
        number > 4294967295.0 || floor(number) != number) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Invalid array length."
        );
    }
    uint32_t requested = (uint32_t)number;
    if (valid_length != NULL) *valid_length = true;
    if (!array->length_writable) {
        if (allow_same_value && requested == array->array_length) {
            return normal(value);
        }
        if (strict) {
            return type_error(
                context,
                "Cannot assign to the read-only array length."
            );
        }
        return normal(value);
    }
    if (requested < array->array_length) {
        bool removed = false;
        while (true) {
            size_t selected = SIZE_MAX;
            uint32_t selected_index = 0u;
            for (
                size_t index = 0u;
                index < array->property_count;
                index += 1u
            ) {
                uint32_t property_index;
                if (oseo_internal_array_index(
                        array->properties[index].key,
                        &property_index
                    ) &&
                    property_index >= requested &&
                    (selected == SIZE_MAX || property_index > selected_index)) {
                    selected = index;
                    selected_index = property_index;
                }
            }
            if (selected == SIZE_MAX) break;
            uint32_t property_index;
            if (!oseo_internal_array_index(
                    array->properties[selected].key,
                    &property_index
                ) ||
                !oseo_internal_remove_property(array, selected)) {
                array->array_length = selected_index + 1u;
                if (removed) {
                    array->dictionary = true;
                    array->shape_id = context->next_shape_id;
                    context->next_shape_id += 1u;
                }
                if (strict) {
                    return type_error(
                        context,
                        "Cannot truncate past a non-configurable element."
                    );
                }
                return normal(value);
            }
            removed = true;
        }
    }
    array->array_length = requested;
    array->dictionary = true;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(value);
}

OseoResult oseo_array_create(OseoContext *context, size_t length) {
    if (length > UINT32_MAX) {
        return failure(context, "OSEO2001", "Array length is too large.");
    }
    OseoResult prototype = oseo_internal_array_prototype(context);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    OseoOrdinaryObject *array =
        oseo_internal_allocate_heap_bytes(context, sizeof(*array));
    if (array == NULL) {
        return failure(context, "OSEO2001", "Array allocation failed.");
    }
    array->prototype = prototype.value;
    array->properties = NULL;
    array->property_capacity = 0u;
    array->property_count = 0u;
    array->private_elements = NULL;
    array->private_element_capacity = 0u;
    array->private_element_count = 0u;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    array->array_length = (uint32_t)length;
    array->dictionary = false;
    array->length_writable = true;
    array->extensible = true;
    array->module_namespace = false;
    array->global_object = false;
    array->error_data = false;
    array->array_iterator = false;
    array->iterator_array = oseo_undefined();
    array->iterator_index = 0u;
    array->async_from_sync = false;
    array->async_sync_iterator = oseo_undefined();
    array->generator = NULL;
    array->arguments_object = false;
    array->mapped_arguments = false;
    return oseo_internal_publish_heap(context, &array->header, OSEO_HEAP_ARRAY);
}

static OseoResult array_index_key(
    OseoContext *context,
    uint32_t index
) {
    uint16_t units[10];
    size_t start = sizeof(units) / sizeof(*units);
    do {
        units[start - 1u] =
            UINT16_C(0x30) + (uint16_t)(index % UINT32_C(10));
        start -= 1u;
        index /= UINT32_C(10);
    } while (index != 0u);
    return oseo_string_from_units(
        context,
        &units[start],
        sizeof(units) / sizeof(*units) - start
    );
}

OseoResult oseo_template_object(
    OseoContext *context,
    const void *site,
    size_t count,
    const uint16_t *const *cooked,
    const size_t *cooked_lengths,
    const bool *cooked_defined,
    const uint16_t *const *raw,
    const size_t *raw_lengths
) {
    if (site == NULL || count == 0u || count > UINT32_MAX ||
        cooked == NULL || cooked_lengths == NULL ||
        cooked_defined == NULL || raw == NULL || raw_lengths == NULL) {
        return failure(context, "OSEO2001", "Invalid template object.");
    }
    OseoTemplateCacheEntry *cache = context->template_cache;
    for (size_t index = 0u;
         index < context->template_cache_count;
         index += 1u) {
        if (cache[index].site == site) return normal(cache[index].object);
    }
    for (size_t index = 0u; index < count; index += 1u) {
        if ((cooked_defined[index] && cooked_lengths[index] > 0u &&
             cooked[index] == NULL) ||
            (raw_lengths[index] > 0u && raw[index] == NULL)) {
            return failure(context, "OSEO2001", "Invalid template strings.");
        }
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_array_create(context, count);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, count);
        frame.slots[1] = result.value;
    }
    const OseoPropertyAttributes element_attributes =
        (OseoPropertyAttributes){false, true, false, false};
    for (uint32_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < (uint32_t)count;
         index += 1u) {
        result = array_index_key(context, index);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = cooked_defined[index]
            ? oseo_string_from_units(
                context, cooked[index], cooked_lengths[index])
            : normal(oseo_undefined());
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[3],
            element_attributes
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_string_from_units(
            context, raw[index], raw_lengths[index]);
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3],
            element_attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        static const uint16_t raw_key[] = {
            UINT16_C(0x72), UINT16_C(0x61), UINT16_C(0x77)
        };
        result = oseo_string_from_units(
            context, raw_key, sizeof(raw_key) / sizeof(*raw_key));
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *cooked_object =
            ordinary_object(frame.slots[0]);
        OseoOrdinaryObject *raw_object = ordinary_object(frame.slots[1]);
        cooked_object->length_writable = false;
        cooked_object->extensible = false;
        raw_object->length_writable = false;
        raw_object->extensible = false;
        if (context->template_cache_count ==
            context->template_cache_capacity) {
            size_t capacity = context->template_cache_capacity == 0u
                ? 4u
                : context->template_cache_capacity * 2u;
            if (capacity < context->template_cache_capacity ||
                capacity > SIZE_MAX / sizeof(*cache)) {
                result = failure(
                    context, "OSEO2001", "Template cache is too large.");
            } else {
                OseoTemplateCacheEntry *grown =
                    realloc(cache, capacity * sizeof(*cache));
                if (grown == NULL) {
                    result = failure(
                        context,
                        "OSEO2001",
                        "Template cache allocation failed."
                    );
                } else {
                    context->template_cache = grown;
                    context->template_cache_capacity = capacity;
                    cache = grown;
                }
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        size_t index = context->template_cache_count;
        cache[index].site = site;
        cache[index].object = frame.slots[0];
        context->template_cache_count += 1u;
        result.value = frame.slots[0];
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_array_append(
    OseoContext *context,
    OseoValue array_value,
    OseoValue value
) {
    if (!is_array(array_value)) {
        return type_error(context, "Array append requires an array.");
    }
    OseoOrdinaryObject *array = ordinary_object(array_value);
    if (!array->length_writable) {
        return type_error(context, "Cannot extend a read-only array.");
    }
    if (array->array_length == UINT32_MAX) {
        return failure(
            context,
            "OSEO2001",
            "Array accumulation is too large."
        );
    }
    uint32_t index = array->array_length;
    OseoResult grown = oseo_internal_grow_properties(context, array_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    OseoResult key = array_index_key(context, index);
    if (key.status != OSEO_STATUS_NORMAL) return key;
    array = ordinary_object(array_value);
    OseoProperty *property = &array->properties[array->property_count];
    property->attributes = (OseoPropertyAttributes){true, true, true, false};
    property->key = key.value;
    property->value = value;
    property->getter = oseo_undefined();
    property->setter = oseo_undefined();
    array->property_count += 1u;
    array->array_length = index + 1u;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(array_value);
}

OseoResult oseo_array_append_hole(
    OseoContext *context,
    OseoValue array_value
) {
    if (!is_array(array_value)) {
        return type_error(context, "Array hole append requires an array.");
    }
    OseoOrdinaryObject *array = ordinary_object(array_value);
    if (!array->length_writable) {
        return type_error(context, "Cannot extend a read-only array.");
    }
    if (array->array_length == UINT32_MAX) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Invalid array length."
        );
    }
    array->array_length += 1u;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(array_value);
}

OseoResult oseo_internal_array_push_function(OseoContext *context) {
    OseoValue *cache = &context->intrinsics[OSEO_INTRINSIC_ARRAY_PUSH];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) {
        return normal(*cache);
    }
    static const uint16_t name[] = {'p', 'u', 's', 'h'};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_environment_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_ARRAY_PUSH_CODE_ID,
            frame.slots[0],
            name,
            sizeof(name) / sizeof(*name),
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *cache = result.value;
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_array_prototype(OseoContext *context) {
    OseoValue *cache = &context->intrinsics[OSEO_INTRINSIC_ARRAY_PROTOTYPE];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
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
        result = oseo_internal_array_push_function(context);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "push");
        frame.slots[3] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_method(
            context,
            OSEO_ARRAY_VALUES_CODE_ID
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[4],
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *cache = frame.slots[1];
        result = normal(*cache);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_array_push(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_object(receiver)) {
        return type_error(
            context,
            "Array.prototype.push requires an object receiver."
        );
    }
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Push arguments are missing.");
    }
    if (argument_count > SIZE_MAX - 4u) {
        return failure(context, "OSEO2001", "Push argument list is too large.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result =
        oseo_roots_allocate(context, &frame, argument_count + 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    for (size_t index = 0u; index < argument_count; index += 1u) {
        frame.slots[index + 4u] = arguments[index];
    }
    result = oseo_internal_ascii_string(context, "length");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    double length = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        const double number = number_value(frame.slots[2]);
        const double maximum_safe_integer = 9007199254740991.0;
        if (isnan(number) || number <= 0.0) {
            length = 0.0;
        } else if (!isfinite(number) || number > maximum_safe_integer) {
            length = maximum_safe_integer;
        } else {
            length = floor(number);
        }
        if ((double)argument_count > maximum_safe_integer - length) {
            result = type_error(
                context,
                "Array.prototype.push exceeds the maximum safe integer."
            );
        }
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        result = oseo_property_key(
            context,
            oseo_number(length + (double)index)
        );
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_set(
                context,
                frame.slots[0],
                frame.slots[3],
                frame.slots[index + 4u],
                true
            );
        }
    }
    const double new_length = length + (double)argument_count;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_set(
            context,
            frame.slots[0],
            frame.slots[1],
            oseo_number(new_length),
            true
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_number(new_length));
    }
    oseo_roots_release(context, &frame);
    return result;
}
