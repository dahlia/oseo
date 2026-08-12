#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static OseoResult type_error(OseoContext *context, const char *message);
static OseoResult array_constructor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
);
static OseoResult array_from(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult array_of(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);

OseoResult oseo_internal_array_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (code_id == OSEO_ARRAY_CONSTRUCTOR_CODE_ID) {
        return array_constructor(
            context,
            argument_count,
            arguments,
            new_target
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return type_error(
            context,
            "Array static or accessor is not a constructor."
        );
    }
    if (code_id == OSEO_ARRAY_FROM_CODE_ID) {
        return array_from(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_ARRAY_IS_ARRAY_CODE_ID) {
        OseoValue value = argument_count == 0u
            ? oseo_undefined()
            : arguments[0];
        return normal(oseo_boolean(is_array(value)));
    }
    if (code_id == OSEO_ARRAY_OF_CODE_ID) {
        return array_of(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_ARRAY_SPECIES_GETTER_CODE_ID) {
        return normal(receiver);
    }
    if (code_id == OSEO_ARRAY_PUSH_CODE_ID) {
        return oseo_internal_array_push(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_ARRAY_UNADMITTED_METHOD_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Array prototype method is not admitted in this M5b node."
        );
    }
    (void)callee;
    return oseo_unknown_function(context, code_id);
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

static uint32_t uint32_length(double number) {
    if (!isfinite(number) || number == 0.0) return 0u;
    double modulo = fmod(trunc(number), 4294967296.0);
    if (modulo < 0.0) modulo += 4294967296.0;
    return (uint32_t)modulo;
}

OseoResult oseo_internal_to_array_length(
    OseoContext *context,
    OseoValue value,
    uint32_t *requested
) {
    OseoValue slots[1] = {value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult uint32_result = oseo_internal_to_number(
        context,
        slots[0]
    );
    if (uint32_result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return uint32_result;
    }
    uint32_t converted = uint32_length(number_value(uint32_result.value));
    OseoResult number_result = oseo_internal_to_number(context, slots[0]);
    oseo_roots_pop(context, &frame);
    if (number_result.status != OSEO_STATUS_NORMAL) return number_result;
    if ((double)converted != number_value(number_result.value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Invalid array length."
        );
    }
    *requested = converted;
    return normal(oseo_number(converted));
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
    if (!allow_same_value && !array->length_writable) {
        if (strict) {
            return type_error(
                context,
                "Cannot assign to the read-only array length."
            );
        }
        return normal(value);
    }
    uint32_t requested = 0u;
    OseoResult converted = oseo_internal_to_array_length(
        context,
        value,
        &requested
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
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

static OseoResult array_create_with_prototype(
    OseoContext *context,
    size_t length,
    OseoValue prototype
) {
    if (length > UINT32_MAX) {
        return failure(context, "OSEO2001", "Array length is too large.");
    }
    OseoValue slots[1] = {prototype};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoOrdinaryObject *array =
        oseo_internal_allocate_heap_bytes(context, sizeof(*array));
    if (array == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Array allocation failed.");
    }
    array->prototype = slots[0];
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
    array->number_data = false;
    array->number_value = oseo_undefined();
    array->primitive_data = false;
    array->primitive_value = oseo_undefined();
    array->virtual_string_iterator = false;
    array->virtual_string_iterator_configurable = false;
    array->virtual_string_iterator_enumerable = false;
    array->virtual_string_iterator_writable = false;
    array->array_iterator = false;
    array->iterator_array = oseo_undefined();
    array->iterator_index = 0u;
    array->async_from_sync = false;
    array->async_sync_iterator = oseo_undefined();
    array->wrap_for_valid_iterator = false;
    array->wrapped_iterator = oseo_undefined();
    array->wrapped_next = oseo_undefined();
    array->generator = NULL;
    array->arguments_object = false;
    array->mapped_arguments = false;
    OseoResult result = oseo_internal_publish_heap(
        context,
        &array->header,
        OSEO_HEAP_ARRAY
    );
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_array_create(OseoContext *context, size_t length) {
    OseoResult prototype = oseo_internal_array_prototype(context);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    return array_create_with_prototype(context, length, prototype.value);
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

static OseoValue builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult construct_function(
    OseoContext *context,
    OseoValue constructor,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    result = oseo_function_prototype(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_receiver(context, frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[0],
            frame.slots[2],
            argument_count,
            arguments,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_result(
            context,
            result.value,
            frame.slots[2]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult array_constructor_prototype(
    OseoContext *context,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ARRAY_PROTOTYPE
        );
    }
    OseoValue slots[2] = {new_target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "prototype");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ARRAY_PROTOTYPE
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult array_constructor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Array arguments are missing.");
    }
    OseoResult prototype = array_constructor_prototype(context, new_target);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    size_t length = 0u;
    bool single_element = false;
    if (argument_count == 1u) {
        if (is_number(arguments[0])) {
            double number = number_value(arguments[0]);
            if (!isfinite(number) || number < 0.0 ||
                number > 4294967295.0 || floor(number) != number) {
                return oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_RANGE,
                    "Invalid array length."
                );
            }
            length = (size_t)number;
        } else {
            single_element = true;
        }
    } else if (argument_count > 1u) {
        length = argument_count;
    }
    OseoResult result = array_create_with_prototype(
        context,
        single_element ? 0u : length,
        prototype.value
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue array = result.value;
    OseoRootFrame frame = {NULL, &array, 1u};
    oseo_roots_push(context, &frame);
    if (single_element) {
        result = oseo_array_append(context, array, arguments[0]);
    } else if (argument_count > 1u) {
        ordinary_object(array)->array_length = 0u;
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && index < argument_count;
             index += 1u) {
            result = oseo_array_append(context, array, arguments[index]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = array;
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult array_like_length(
    OseoContext *context,
    OseoValue value,
    double *length
) {
    *length = 0.0;
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "length");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        double number = number_value(result.value);
        const double maximum = 9007199254740991.0;
        if (isnan(number) || number <= 0.0) {
            *length = 0.0;
        } else if (!isfinite(number) || number > maximum) {
            *length = maximum;
        } else {
            *length = floor(number);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult array_set_length(
    OseoContext *context,
    OseoValue array,
    double length
) {
    OseoValue slots[2] = {array, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "length");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_set(
            context,
            slots[0],
            slots[1],
            oseo_number(length),
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

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

static OseoResult create_index_property(
    OseoContext *context,
    OseoValue target,
    double index,
    OseoValue value
) {
    OseoValue slots[3] = {target, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(context, oseo_number(index));
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult array_from_iterator(
    OseoContext *context,
    OseoRootFrame *frame
) {
    if (!is_function(frame->slots[4])) {
        return type_error(
            context,
            "The Symbol.iterator method is not callable."
        );
    }
    OseoResult result = function_is_constructible(frame->slots[0])
        ? construct_function(context, frame->slots[0], 0u, NULL)
        : oseo_array_create(context, 0u);
    frame->slots[7] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_call_function(
        context,
        frame->slots[4],
        frame->slots[1],
        0u,
        NULL,
        oseo_undefined()
    );
    frame->slots[5] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame->slots[5])) {
        result = type_error(context, "The iterator is not an object.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "next");
        frame->slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            frame->slots[5],
            frame->slots[6]
        );
        frame->slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_function(frame->slots[6])) {
        result = type_error(context, "The iterator next is not callable.");
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double index = 0.0;
    while (result.status == OSEO_STATUS_NORMAL) {
        bool done = false;
        result = oseo_iterator_next(
            context,
            frame->slots[5],
            frame->slots[6],
            &frame->slots[8],
            &done
        );
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        if (index >= 9007199254740991.0) {
            result = type_error(context, "Array.from has too many values.");
            result = close_after_abrupt(context, frame->slots[5], result);
            break;
        }
        if (tag_of(frame->slots[2]) != OSEO_TAG_UNDEFINED) {
            frame->slots[9] = oseo_number(index);
            result = oseo_call_function(
                context,
                frame->slots[2],
                frame->slots[3],
                2u,
                &frame->slots[8],
                oseo_undefined()
            );
            frame->slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = create_index_property(
                context,
                frame->slots[7],
                index,
                frame->slots[8]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) {
            result = close_after_abrupt(
                context,
                frame->slots[5],
                result
            );
            break;
        }
        index += 1.0;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_set_length(context, frame->slots[7], index);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame->slots[7];
    return result;
}

static OseoResult array_from_array_like(
    OseoContext *context,
    OseoRootFrame *frame
) {
    double length = 0.0;
    OseoResult result = array_like_length(
        context,
        frame->slots[1],
        &length
    );
    frame->slots[11] = oseo_number(length);
    if (result.status == OSEO_STATUS_NORMAL) {
        if (function_is_constructible(frame->slots[0])) {
            result = construct_function(
                context,
                frame->slots[0],
                1u,
                &frame->slots[11]
            );
        } else if (length > (double)UINT32_MAX) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "Invalid array length."
            );
        } else {
            result = oseo_array_create(context, (size_t)length);
        }
        frame->slots[7] = result.value;
    }
    for (double index = 0.0;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1.0) {
        result = oseo_property_key(context, oseo_number(index));
        frame->slots[10] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame->slots[1],
                frame->slots[10]
            );
            frame->slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(frame->slots[2]) != OSEO_TAG_UNDEFINED) {
            frame->slots[9] = oseo_number(index);
            result = oseo_call_function(
                context,
                frame->slots[2],
                frame->slots[3],
                2u,
                &frame->slots[8],
                oseo_undefined()
            );
            frame->slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = create_index_property(
                context,
                frame->slots[7],
                index,
                frame->slots[8]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_set_length(context, frame->slots[7], length);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame->slots[7];
    return result;
}

/*
 * Strings do not yet expose the separate M5b string iterator. Array.from
 * still consumes a primitive or wrapper that reaches the untouched virtual
 * default by Unicode code point rather than by the code-unit indexed
 * properties used by the array-like branch.
 */
static OseoResult array_from_string(
    OseoContext *context,
    OseoRootFrame *frame,
    OseoValue string_value
) {
    OseoResult result = function_is_constructible(frame->slots[0])
        ? construct_function(context, frame->slots[0], 0u, NULL)
        : oseo_array_create(context, 0u);
    frame->slots[7] = result.value;
    size_t offset = 0u;
    double index = 0.0;
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoString *source = string_object(string_value);
        if (offset >= source->length) break;
        size_t element_length = 1u;
        uint16_t first = source->units[offset];
        if (first >= UINT16_C(0xd800) &&
            first <= UINT16_C(0xdbff) &&
            offset + 1u < source->length) {
            uint16_t second = source->units[offset + 1u];
            if (second >= UINT16_C(0xdc00) &&
                second <= UINT16_C(0xdfff)) {
                element_length = 2u;
            }
        }
        result = oseo_string_from_units(
            context,
            &source->units[offset],
            element_length
        );
        frame->slots[8] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(frame->slots[2]) != OSEO_TAG_UNDEFINED) {
            frame->slots[9] = oseo_number(index);
            result = oseo_call_function(
                context,
                frame->slots[2],
                frame->slots[3],
                2u,
                &frame->slots[8],
                oseo_undefined()
            );
            frame->slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = create_index_property(
                context,
                frame->slots[7],
                index,
                frame->slots[8]
            );
        }
        offset += element_length;
        index += 1.0;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_set_length(context, frame->slots[7], index);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame->slots[7];
    return result;
}

/*
 * Recover the [[StringData]] used by a primitive string or String wrapper.
 * Other primitive wrappers also set `primitive_data`, so the stored value's
 * tag remains the brand check.
 */
static bool array_from_string_value(
    OseoValue source,
    OseoValue *string_value
) {
    if (is_string(source)) {
        *string_value = source;
        return true;
    }
    if (!is_object(source)) return false;
    OseoOrdinaryObject *object = ordinary_object(source);
    if (!object->primitive_data || !is_string(object->primitive_value)) {
        return false;
    }
    *string_value = object->primitive_value;
    return true;
}

/*
 * The virtual default participates in the wrapper's ordinary prototype walk.
 * A nearer actual property wins, while the untouched default on
 * %String.prototype% shadows any property inherited from Object.prototype.
 */
static bool array_from_uses_virtual_string_iterator(
    OseoValue source,
    OseoValue string_prototype,
    OseoValue iterator_key
) {
    OseoOrdinaryObject *prototype = ordinary_object(string_prototype);
    if (!prototype->virtual_string_iterator) return false;
    if (is_string(source)) {
        return oseo_internal_own_property_index(
            prototype,
            iterator_key
        ) == SIZE_MAX;
    }
    OseoValue current = source;
    while (is_object(current)) {
        OseoOrdinaryObject *object = ordinary_object(current);
        if (oseo_internal_own_property_index(object, iterator_key) !=
            SIZE_MAX) {
            return false;
        }
        if (current == string_prototype) return true;
        current = object->prototype;
    }
    return false;
}

static OseoResult array_from(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Array.from arguments are missing."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 12u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = builtin_argument(argument_count, arguments, 0u);
    frame.slots[2] = builtin_argument(argument_count, arguments, 1u);
    frame.slots[3] = builtin_argument(argument_count, arguments, 2u);
    bool has_string_value = false;
    bool uses_virtual_string_iterator = false;
    if (tag_of(frame.slots[2]) != OSEO_TAG_UNDEFINED &&
        !is_function(frame.slots[2])) {
        result = type_error(context, "Array.from mapfn is not callable.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        has_string_value = array_from_string_value(
            frame.slots[1],
            &frame.slots[11]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && has_string_value) {
        result = oseo_internal_primitive_wrapper_prototype(
            context,
            OSEO_INTRINSIC_STRING_PROTOTYPE
        );
        frame.slots[10] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            uses_virtual_string_iterator =
                array_from_uses_virtual_string_iterator(
                    frame.slots[1],
                    frame.slots[10],
                    frame.slots[4]
                );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !uses_virtual_string_iterator) {
        result = oseo_object_get(
            context,
            frame.slots[1],
            frame.slots[4]
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        if (uses_virtual_string_iterator) {
            result = array_from_string(context, &frame, frame.slots[11]);
        } else {
            result = is_nullish(frame.slots[4])
                ? array_from_array_like(context, &frame)
                : array_from_iterator(context, &frame);
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult array_of(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Array.of arguments are missing.");
    }
    OseoValue slots[2] = {receiver, oseo_number((double)argument_count)};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = function_is_constructible(slots[0])
        ? construct_function(context, slots[0], 1u, &slots[1])
        : oseo_array_create(context, argument_count);
    slots[0] = result.value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        result = create_index_property(
            context,
            slots[0],
            (double)index,
            arguments[index]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_set_length(
            context,
            slots[0],
            (double)argument_count
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[0];
    oseo_roots_pop(context, &frame);
    return result;
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

static OseoResult array_builtin_function(
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

OseoResult oseo_internal_array_prototype(OseoContext *context) {
    OseoResult result = oseo_internal_array_intrinsic(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->intrinsics[OSEO_INTRINSIC_ARRAY_PROTOTYPE]);
}

OseoResult oseo_internal_array_intrinsic(OseoContext *context) {
    OseoValue prototype =
        context->intrinsics[OSEO_INTRINSIC_ARRAY_PROTOTYPE];
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_ARRAY_SPECIES_GETTER];
    if (is_function(*marker)) {
        return normal(context->intrinsics[OSEO_INTRINSIC_ARRAY]);
    }
    if (is_object(*marker)) {
        return normal(context->intrinsics[OSEO_INTRINSIC_ARRAY]);
    }
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (is_array(prototype)) {
        frame.slots[0] = prototype;
        result = normal(prototype);
    } else {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        frame.slots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = array_create_with_prototype(
                context,
                0u,
                frame.slots[0]
            );
            frame.slots[0] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_ARRAY_PROTOTYPE] = frame.slots[0];
        *marker = frame.slots[0];
        result = array_builtin_function(
            context,
            OSEO_ARRAY_CONSTRUCTOR_CODE_ID,
            "Array",
            1u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_ARRAY] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
    }
    static const OseoIntrinsic intrinsics[] = {
        OSEO_INTRINSIC_ARRAY_FROM,
        OSEO_INTRINSIC_ARRAY_IS_ARRAY,
        OSEO_INTRINSIC_ARRAY_OF,
        OSEO_INTRINSIC_ARRAY_SPECIES_GETTER,
    };
    static const size_t codes[] = {
        OSEO_ARRAY_FROM_CODE_ID,
        OSEO_ARRAY_IS_ARRAY_CODE_ID,
        OSEO_ARRAY_OF_CODE_ID,
        OSEO_ARRAY_SPECIES_GETTER_CODE_ID,
    };
    static const char *const names[] = {
        "from",
        "isArray",
        "of",
        "[Symbol.species]",
    };
    static const size_t lengths[] = {1u, 1u, 0u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 4u;
         index += 1u) {
        result = array_builtin_function(
            context,
            codes[index],
            names[index],
            lengths[index],
            OSEO_FUNCTION_INTERNAL,
            index == 3u
                ? OSEO_FUNCTION_NAME_PREFIX_GET
                : OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[intrinsics[index]] = result.value;
        }
    }
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_ARRAY_FROM,
        OSEO_INTRINSIC_ARRAY_IS_ARRAY,
        OSEO_INTRINSIC_ARRAY_OF,
    };
    static const char *const static_names[] = {"from", "isArray", "of"};
    const OseoPropertyAttributes method = {true, false, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_internal_ascii_string(context, static_names[index]);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[1],
                frame.slots[3],
                context->intrinsics[static_intrinsics[index]],
                method
            );
        }
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
            frame.slots[1],
            frame.slots[3],
            context->intrinsics[OSEO_INTRINSIC_ARRAY_SPECIES_GETTER],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "constructor");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[3],
            frame.slots[1],
            method
        );
    }
    static const char *const unadmitted_names[] = {
        "concat",
        "every",
        "filter",
        "forEach",
        "indexOf",
        "join",
        "lastIndexOf",
        "map",
        "pop",
        "reduce",
        "reduceRight",
        "reverse",
        "shift",
        "slice",
        "some",
        "sort",
        "splice",
        "toLocaleString",
        "toString",
        "unshift",
    };
    static const size_t unadmitted_lengths[] = {
        1u,
        1u,
        1u,
        1u,
        1u,
        1u,
        1u,
        1u,
        0u,
        1u,
        1u,
        0u,
        0u,
        2u,
        1u,
        1u,
        2u,
        0u,
        0u,
        1u,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 20u;
         index += 1u) {
        result = array_builtin_function(
            context,
            OSEO_ARRAY_UNADMITTED_METHOD_CODE_ID,
            unadmitted_names[index],
            unadmitted_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(
                context,
                unadmitted_names[index]
            );
            frame.slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[3],
                frame.slots[2],
                method
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_array_push_function(context);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "push");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
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
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[3],
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(frame.slots[1]);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_ARRAY_PROTOTYPE] =
            oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_ARRAY_PUSH] = oseo_undefined();
        for (size_t index = OSEO_INTRINSIC_ARRAY;
             index <= OSEO_INTRINSIC_ARRAY_SPECIES_GETTER;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_install_array_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Array");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            result.value,
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
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
