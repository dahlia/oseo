#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Strings used as property keys, arrays, ordinary objects,
 * descriptors, prototypes, property caches, and the Object
 * builtins.
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

OseoResult oseo_internal_allocate_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    if (length > (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t size = sizeof(OseoString) + length * sizeof(uint16_t);
    OseoString *object = oseo_internal_allocate_heap_bytes(context, size);
    if (object == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    object->length = length;
    if (length > 0u) memcpy(object->units, units, length * sizeof(uint16_t));
    return oseo_internal_publish_heap(
        context, &object->header, OSEO_HEAP_STRING);
}

OseoResult oseo_string_from_units(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    return oseo_internal_allocate_string(context, units, length);
}

static bool string_equal(OseoValue left, OseoValue right) {
    if (!is_string(left) || !is_string(right)) return false;
    OseoString *left_string = string_object(left);
    OseoString *right_string = string_object(right);
    return left_string->length == right_string->length &&
        memcmp(
            left_string->units,
            right_string->units,
            left_string->length * sizeof(uint16_t)
        ) == 0;
}

/* Property keys are strings compared by content or symbols by identity. */
static bool property_key_equal(OseoValue left, OseoValue right) {
    if (is_string(left) && is_string(right)) return string_equal(left, right);
    return left == right;
}

static bool same_property_value(OseoValue left, OseoValue right) {
    if (is_number(left) && is_number(right)) {
        double left_number = number_value(left);
        double right_number = number_value(right);
        if (isnan(left_number) && isnan(right_number)) return true;
        if (left_number == 0.0 && right_number == 0.0) {
            return signbit(left_number) == signbit(right_number);
        }
        return left_number == right_number;
    }
    if (is_string(left) && is_string(right)) return string_equal(left, right);
    return left == right;
}

static size_t own_property_index(
    const OseoOrdinaryObject *object,
    OseoValue key
) {
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (property_key_equal(object->properties[index].key, key)) {
            return index;
        }
    }
    return SIZE_MAX;
}

bool oseo_internal_string_is_ascii(OseoValue value, const char *text) {
    if (!is_string(value)) return false;
    OseoString *string = string_object(value);
    size_t length = strlen(text);
    if (string->length != length) return false;
    for (size_t index = 0u; index < length; index += 1u) {
        if (string->units[index] !=
            (uint16_t)(unsigned char)text[index]) return false;
    }
    return true;
}

static bool array_index(OseoValue key, uint32_t *result) {
    if (!is_string(key)) return false;
    OseoString *string = string_object(key);
    if (string->length == 0u || string->length > 10u) return false;
    if (string->length > 1u && string->units[0] == UINT16_C(0x30)) {
        return false;
    }
    uint64_t value = 0u;
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint16_t unit = string->units[index];
        if (unit < UINT16_C(0x30) || unit > UINT16_C(0x39)) return false;
        value = value * UINT64_C(10) + (uint64_t)(unit - UINT16_C(0x30));
        if (value > UINT64_C(4294967294)) return false;
    }
    *result = (uint32_t)value;
    return true;
}

static bool remove_property(OseoOrdinaryObject *object, size_t index) {
    if (!object->properties[index].attributes.configurable) return false;
    for (size_t next = index + 1u; next < object->property_count; next += 1u) {
        object->properties[next - 1u] = object->properties[next];
    }
    object->property_count -= 1u;
    return true;
}

static OseoResult set_array_length(
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
                if (array_index(
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
            if (!array_index(
                    array->properties[selected].key,
                    &property_index
                ) ||
                !remove_property(array, selected)) {
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

static OseoResult require_property_key(
    OseoContext *context,
    OseoValue key
) {
    if (!is_string(key) && !is_symbol(key)) {
        return failure(
            context,
            "OSEO2001",
            "Property key is not a string or symbol."
        );
    }
    return normal(key);
}

static bool string_own_property(
    OseoValue string_value,
    OseoValue key,
    uint32_t *index
) {
    if (!is_string(string_value)) return false;
    if (oseo_internal_string_is_ascii(key, "length")) return true;
    uint32_t candidate = 0u;
    if (!array_index(key, &candidate) ||
        candidate >= string_object(string_value)->length) return false;
    if (index != NULL) *index = candidate;
    return true;
}

static OseoResult object_create(
    OseoContext *context,
    OseoValue prototype,
    bool default_intrinsics
) {
    if (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype)) {
        return type_error(
            context,
            "Object prototype must be an object or null."
        );
    }
    OseoOrdinaryObject *object =
        oseo_internal_allocate_heap_bytes(context, sizeof(*object));
    if (object == NULL) {
        return failure(context, "OSEO2001", "Object allocation failed.");
    }
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    object->module_namespace = false;
    object->error_data = false;
    object->array_iterator = false;
    object->iterator_array = oseo_undefined();
    object->iterator_index = 0u;
    object->default_intrinsics = default_intrinsics;
    object->generator_prototype = false;
    object->generator = NULL;
    return oseo_internal_publish_heap(
        context, &object->header, OSEO_HEAP_OBJECT);
}

OseoResult oseo_object_create(OseoContext *context, OseoValue prototype) {
    return object_create(context, prototype, false);
}

OseoResult oseo_object_literal_create(OseoContext *context) {
    return object_create(context, oseo_null(), true);
}

OseoResult oseo_require_object_coercible(
    OseoContext *context,
    OseoValue value
) {
    if (is_nullish(value)) {
        return type_error(context, "Cannot destructure a nullish value.");
    }
    return normal(value);
}

OseoResult oseo_array_create(OseoContext *context, size_t length) {
    if (length > UINT32_MAX) {
        return failure(context, "OSEO2001", "Array length is too large.");
    }
    OseoOrdinaryObject *array =
        oseo_internal_allocate_heap_bytes(context, sizeof(*array));
    if (array == NULL) {
        return failure(context, "OSEO2001", "Array allocation failed.");
    }
    array->prototype = oseo_null();
    array->properties = NULL;
    array->property_capacity = 0u;
    array->property_count = 0u;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    array->array_length = (uint32_t)length;
    array->dictionary = false;
    array->length_writable = true;
    array->module_namespace = false;
    array->error_data = false;
    array->array_iterator = false;
    array->iterator_array = oseo_undefined();
    array->iterator_index = 0u;
    array->default_intrinsics = true;
    array->generator_prototype = false;
    array->generator = NULL;
    return oseo_internal_publish_heap(context, &array->header, OSEO_HEAP_ARRAY);
}

static OseoResult grow_properties(
    OseoContext *context,
    OseoValue object_value
) {
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (object->property_count < object->property_capacity) {
        return normal(object_value);
    }
    size_t capacity = object->property_capacity == 0u
        ? 4u
        : object->property_capacity * 2u;
    if (capacity < object->property_capacity ||
        capacity > SIZE_MAX / sizeof(OseoProperty)) {
        return failure(context, "OSEO2001", "Property storage is too large.");
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    object = ordinary_object(object_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    OseoProperty *properties = malloc(capacity * sizeof(*properties));
    if (properties == NULL) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    if (object->property_count > 0u) {
        memcpy(
            properties,
            object->properties,
            object->property_count * sizeof(*properties)
        );
    }
    free(object->properties);
    object->properties = properties;
    object->property_capacity = capacity;
    return normal(object_value);
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
    OseoResult grown = grow_properties(context, array_value);
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

/*
 * The shared body of Get and its `super` form. `object_value` is where
 * the lookup starts and `receiver` is what a getter receives as `this`;
 * the two differ only for a `super` reference.
 */
static OseoResult object_get(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue receiver
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value)) {
            return type_error(
                context,
                "Cannot read properties of a nullish value."
            );
        }
        if (is_string(object_value) &&
            oseo_internal_string_is_ascii(key, "length")) {
            return normal(oseo_number(string_object(object_value)->length));
        }
        uint32_t index = 0u;
        if (string_own_property(object_value, key, &index)) {
            uint16_t unit = string_object(object_value)->units[index];
            return oseo_internal_allocate_string(context, &unit, 1u);
        }
        return normal(oseo_undefined());
    }
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoOrdinaryObject *object = ordinary_object(current);
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_descriptor(
            current, key, &value, &attributes, &getter, &setter)) {
            if (attributes.accessor) {
                if (!is_function(getter)) return normal(oseo_undefined());
                OseoRootFrame frame = {NULL, NULL, 0u};
                OseoResult result = oseo_roots_allocate(context, &frame, 1u);
                if (result.status != OSEO_STATUS_NORMAL) return result;
                frame.slots[0] = getter;
                result = oseo_call_function(
                    context,
                    frame.slots[0],
                    receiver,
                    0u,
                    NULL,
                    oseo_undefined()
                );
                oseo_roots_release(context, &frame);
                return result;
            }
            if (object->module_namespace && is_cell(value)) {
                return oseo_cell_get(context, value);
            }
            return normal(value);
        }
        if (is_promise(current) && object->default_intrinsics) {
            if (oseo_internal_string_is_ascii(key, "then")) {
                return oseo_internal_promise_method_function(context, "then");
            }
            if (oseo_internal_string_is_ascii(key, "catch")) {
                return oseo_internal_promise_method_function(context, "catch");
            }
            if (oseo_internal_string_is_ascii(key, "finally")) {
                return oseo_internal_promise_method_function(
                    context, "finally");
            }
        }
        if (object->array_iterator && object->default_intrinsics) {
            if (oseo_internal_string_is_ascii(key, "next")) {
                return oseo_internal_iterator_method(
                    context,
                    OSEO_ARRAY_ITERATOR_NEXT_CODE_ID
                );
            }
            if (oseo_internal_iterator_key_matches(context, key)) {
                return oseo_internal_iterator_method(
                    context,
                    OSEO_ITERATOR_SELF_CODE_ID
                );
            }
        }
        /* Only %GeneratorPrototype% carries this brand, and generator
         * objects reach it through their function's `prototype` object,
         * so an own property on either, or a replacement `prototype`
         * object, shadows these methods the way the specified prototype
         * chain does. `next` is an own property of the intrinsic, so it
         * survives a replaced prototype; `Symbol.iterator` is inherited
         * from %IteratorPrototype% and does not. `return` is an own
         * property of the intrinsic like `next`, and `IteratorClose`
         * reaches it whenever a consumer stops early. */
        if (object->generator_prototype) {
            if (oseo_internal_string_is_ascii(key, "next")) {
                return oseo_internal_iterator_method(
                    context,
                    OSEO_GENERATOR_NEXT_CODE_ID
                );
            }
            if (oseo_internal_string_is_ascii(key, "return")) {
                return oseo_internal_iterator_method(
                    context,
                    OSEO_GENERATOR_RETURN_CODE_ID
                );
            }
            if (object->default_intrinsics &&
                oseo_internal_iterator_key_matches(context, key)) {
                return oseo_internal_iterator_method(
                    context,
                    OSEO_ITERATOR_SELF_CODE_ID
                );
            }
        }
        if (is_array(current) && object->default_intrinsics &&
            oseo_internal_iterator_key_matches(context, key)) {
            return oseo_internal_iterator_method(
                context,
                OSEO_ARRAY_VALUES_CODE_ID
            );
        }
        current = object->prototype;
    }
    return normal(oseo_undefined());
}

OseoResult oseo_object_get(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    return object_get(context, object_value, key, object_value);
}

OseoResult oseo_super_get(
    OseoContext *context,
    OseoValue base,
    OseoValue key,
    OseoValue receiver
) {
    return object_get(context, base, key, receiver);
}

bool oseo_value_is_object(OseoValue value) {
    return is_object(value) || is_promise(value);
}

bool oseo_property_cache_matches(
    OseoValue object_value,
    const OseoPropertyCache *cache
) {
    if (!is_object(object_value)) return false;
    OseoOrdinaryObject *object = ordinary_object(object_value);
    return !object->dictionary && cache->shape_id != 0u &&
        cache->shape_id == object->shape_id &&
        cache->slot < object->property_count;
}

OseoValue oseo_property_cache_load(
    OseoValue object_value,
    const OseoPropertyCache *cache
) {
    if (!is_object(object_value)) return oseo_undefined();
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (cache->slot >= object->property_count) return oseo_undefined();
    return object->properties[cache->slot].value;
}

void oseo_property_cache_update(
    OseoValue object_value,
    OseoValue key,
    OseoPropertyCache *cache
) {
    if (!is_object(object_value)) {
        cache->shape_id = 0u;
        cache->slot = 0u;
        return;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t slot = own_property_index(object, key);
    /* An accessor slot must always dispatch through the generic getter
     * call, never the direct fixed-slot load. */
    if (!object->dictionary && slot != SIZE_MAX &&
        !object->properties[slot].attributes.accessor) {
        cache->shape_id = object->shape_id;
        cache->slot = slot;
    } else {
        cache->shape_id = 0u;
        cache->slot = 0u;
    }
}

OseoResult oseo_object_has_own(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value)) {
            return type_error(
                context,
                "Cannot convert a nullish value to an object."
            );
        }
        return normal(oseo_boolean(string_own_property(
            object_value,
            key,
            NULL
        )));
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        return normal(oseo_boolean(true));
    }
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return normal(oseo_boolean(true));
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    return normal(oseo_boolean(own_property_index(object, key) != SIZE_MAX));
}

OseoResult oseo_object_set(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    bool strict
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value) || strict) {
            return type_error(
                context,
                "Cannot set properties of a nullish or primitive value."
            );
        }
        return normal(value);
    }
    if (ordinary_object(object_value)->module_namespace) {
        if (strict) {
            return type_error(
                context,
                "Cannot assign to a module namespace property."
            );
        }
        return normal(value);
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        OseoFunction *function = function_object(object_value);
        if (!function->prototype_writable) {
            if (strict) {
                return type_error(
                    context,
                    "Cannot assign to the read-only prototype property."
                );
            }
            return normal(value);
        }
        function->prototype_object = value;
        return normal(value);
    }
    OseoOrdinaryObject *receiver = ordinary_object(object_value);
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return set_array_length(
            context,
            receiver,
            value,
            strict,
            false,
            NULL
        );
    }
    uint32_t receiver_index = 0u;
    bool extends_array = is_array(object_value) &&
        array_index(key, &receiver_index) &&
        receiver_index >= receiver->array_length;
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoOrdinaryObject *owner = ordinary_object(current);
        OseoValue own_value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_descriptor(
            current, key, &own_value, &attributes, &getter, &setter)) {
            if (attributes.accessor) {
                if (!is_function(setter)) {
                    if (strict) {
                        return type_error(
                            context,
                            "Cannot set a property that has only a getter."
                        );
                    }
                    return normal(value);
                }
                OseoRootFrame frame = {NULL, NULL, 0u};
                OseoResult result = oseo_roots_allocate(context, &frame, 2u);
                if (result.status != OSEO_STATUS_NORMAL) return result;
                frame.slots[0] = setter;
                frame.slots[1] = value;
                result = oseo_call_function(
                    context,
                    frame.slots[0],
                    object_value,
                    1u,
                    &frame.slots[1],
                    oseo_undefined()
                );
                oseo_roots_release(context, &frame);
                if (result.status != OSEO_STATUS_NORMAL) return result;
                return normal(value);
            }
            if (!attributes.writable) {
                if (strict) {
                    return type_error(
                        context,
                        "Cannot assign to a read-only property."
                    );
                }
                return normal(value);
            }
            size_t index = own_property_index(owner, key);
            if (index == SIZE_MAX) break;
            OseoProperty *property = &owner->properties[index];
            if (current == object_value) {
                property->value = value;
                if (extends_array) receiver->array_length = receiver_index + 1u;
                return normal(value);
            }
            break;
        }
        current = owner->prototype;
    }
    if (extends_array && !receiver->length_writable) {
        if (strict) {
            return type_error(
                context,
                "Cannot extend an array with a read-only length."
            );
        }
        return normal(value);
    }
    OseoResult grown = grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    OseoOrdinaryObject *object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = (OseoPropertyAttributes){true, true, true, false};
    property->key = key;
    property->value = value;
    property->getter = oseo_undefined();
    property->setter = oseo_undefined();
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = receiver_index + 1u;
    return normal(value);
}

OseoResult oseo_super_set(
    OseoContext *context,
    OseoValue base,
    OseoValue key,
    OseoValue value,
    OseoValue receiver,
    bool strict
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(base)) {
        return type_error(
            context,
            "Cannot set properties of a nullish or primitive value."
        );
    }
    /* The lookup walks `base` only to decide whether a setter runs.
     * Every other outcome, including a data property found on the walk,
     * leaves the write to the receiver. */
    OseoValue current = base;
    while (is_object(current)) {
        OseoValue own_value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_descriptor(
            current, key, &own_value, &attributes, &getter, &setter)) {
            if (attributes.accessor) {
                if (!is_function(setter)) {
                    if (strict) {
                        return type_error(
                            context,
                            "Cannot set a property that has only a getter."
                        );
                    }
                    return normal(value);
                }
                OseoRootFrame frame = {NULL, NULL, 0u};
                OseoResult result = oseo_roots_allocate(context, &frame, 2u);
                if (result.status != OSEO_STATUS_NORMAL) return result;
                frame.slots[0] = setter;
                frame.slots[1] = value;
                result = oseo_call_function(
                    context,
                    frame.slots[0],
                    receiver,
                    1u,
                    &frame.slots[1],
                    oseo_undefined()
                );
                oseo_roots_release(context, &frame);
                if (result.status != OSEO_STATUS_NORMAL) return result;
                return normal(value);
            }
            if (!attributes.writable) {
                if (strict) {
                    return type_error(
                        context,
                        "Cannot assign to a read-only property."
                    );
                }
                return normal(value);
            }
            break;
        }
        current = ordinary_object(current)->prototype;
    }
    if (!is_object(receiver)) {
        if (strict) {
            return type_error(
                context,
                "Cannot set properties of a nullish or primitive value."
            );
        }
        return normal(value);
    }
    OseoValue receiver_value = oseo_undefined();
    OseoPropertyAttributes receiver_attributes = {false, false, false, false};
    OseoValue receiver_getter = oseo_undefined();
    OseoValue receiver_setter = oseo_undefined();
    if (oseo_internal_own_descriptor(
        receiver,
        key,
        &receiver_value,
        &receiver_attributes,
        &receiver_getter,
        &receiver_setter
    )) {
        if (receiver_attributes.accessor) {
            if (strict) {
                return type_error(
                    context,
                    "Cannot assign to an accessor property of the receiver."
                );
            }
            return normal(value);
        }
        if (!receiver_attributes.writable) {
            if (strict) {
                return type_error(
                    context,
                    "Cannot assign to a read-only property."
                );
            }
            return normal(value);
        }
        /* The receiver owns the property, so the ordinary assignment
         * finds it on its first step and never walks a prototype. */
        OseoResult assigned =
            oseo_object_set(context, receiver, key, value, strict);
        if (assigned.status != OSEO_STATUS_NORMAL) return assigned;
        return normal(value);
    }
    OseoResult created = oseo_object_define(
        context,
        receiver,
        key,
        value,
        (OseoPropertyAttributes){true, true, true, false}
    );
    if (created.status != OSEO_STATUS_NORMAL) return created;
    return normal(value);
}

OseoResult oseo_object_define(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Object.defineProperty requires an object."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return type_error(
            context,
            "Cannot define a module namespace property."
        );
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        if (attributes.configurable || attributes.enumerable) {
            return type_error(
                context,
                "Cannot redefine the prototype property."
            );
        }
        OseoFunction *function = function_object(object_value);
        if (!function->prototype_writable &&
            (attributes.writable ||
             !same_property_value(function->prototype_object, value))) {
            return type_error(
                context,
                "Cannot redefine the prototype property."
            );
        }
        function->prototype_object = value;
        function->prototype_writable = attributes.writable;
        return normal(object_value);
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        if (attributes.configurable || attributes.enumerable) {
            return type_error(
                context,
                "Cannot redefine the array length property."
            );
        }
        if (!object->length_writable && attributes.writable) {
            return type_error(
                context,
                "Cannot redefine the array length property."
            );
        }
        bool valid_length = false;
        OseoResult changed = set_array_length(
            context,
            object,
            value,
            true,
            true,
            &valid_length
        );
        if (changed.status != OSEO_STATUS_NORMAL) {
            if (valid_length && !attributes.writable) {
                object->length_writable = false;
            }
            return changed;
        }
        object->length_writable = attributes.writable;
        return normal(object_value);
    }
    uint32_t defined_index = 0u;
    bool extends_array = is_array(object_value) &&
        array_index(key, &defined_index) &&
        defined_index >= object->array_length;
    if (extends_array && !object->length_writable) {
        return type_error(
            context,
            "Cannot extend an array with a read-only length."
        );
    }
    size_t index = own_property_index(object, key);
    if (index != SIZE_MAX) {
        OseoProperty *property = &object->properties[index];
        if (!property->attributes.configurable &&
            (property->attributes.accessor ||
             attributes.configurable ||
             attributes.enumerable != property->attributes.enumerable ||
             (!property->attributes.writable && attributes.writable) ||
             (!property->attributes.writable &&
              !same_property_value(property->value, value)))) {
            return type_error(
                context,
                "Cannot redefine a non-configurable property."
            );
        }
        property->attributes = attributes;
        property->value = value;
        property->getter = oseo_undefined();
        property->setter = oseo_undefined();
        object->dictionary = true;
        object->shape_id = context->next_shape_id;
        context->next_shape_id += 1u;
        if (extends_array) object->array_length = defined_index + 1u;
        return normal(object_value);
    }
    OseoResult grown = grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = attributes;
    property->key = key;
    property->value = value;
    property->getter = oseo_undefined();
    property->setter = oseo_undefined();
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = defined_index + 1u;
    return normal(object_value);
}

OseoResult oseo_object_define_accessor(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue getter,
    OseoValue setter,
    bool has_getter,
    bool has_setter,
    OseoPropertyAttributes attributes
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Cannot define an accessor property on a non-object."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return type_error(
            context,
            "Cannot define a module namespace property."
        );
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        return type_error(
            context,
            "Cannot redefine the prototype property."
        );
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return type_error(
            context,
            "Cannot redefine the array length property."
        );
    }
    uint32_t defined_index = 0u;
    bool extends_array = is_array(object_value) &&
        array_index(key, &defined_index) &&
        defined_index >= object->array_length;
    if (extends_array && !object->length_writable) {
        return type_error(
            context,
            "Cannot extend an array with a read-only length."
        );
    }
    size_t index = own_property_index(object, key);
    OseoValue new_getter = has_getter ? getter : oseo_undefined();
    OseoValue new_setter = has_setter ? setter : oseo_undefined();
    if (index != SIZE_MAX) {
        OseoProperty *property = &object->properties[index];
        OseoValue existing_getter = property->attributes.accessor
            ? property->getter : oseo_undefined();
        OseoValue existing_setter = property->attributes.accessor
            ? property->setter : oseo_undefined();
        if (!has_getter) new_getter = existing_getter;
        if (!has_setter) new_setter = existing_setter;
        if (!property->attributes.configurable &&
            (!property->attributes.accessor ||
             attributes.configurable ||
             attributes.enumerable != property->attributes.enumerable ||
             (has_getter &&
              !same_property_value(existing_getter, new_getter)) ||
             (has_setter &&
              !same_property_value(existing_setter, new_setter)))) {
            return type_error(
                context,
                "Cannot redefine a non-configurable property."
            );
        }
        property->attributes = attributes;
        property->value = oseo_undefined();
        property->getter = new_getter;
        property->setter = new_setter;
        object->dictionary = true;
        object->shape_id = context->next_shape_id;
        context->next_shape_id += 1u;
        if (extends_array) object->array_length = defined_index + 1u;
        return normal(object_value);
    }
    OseoResult grown = grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = attributes;
    property->key = key;
    property->value = oseo_undefined();
    property->getter = new_getter;
    property->setter = new_setter;
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = defined_index + 1u;
    return normal(object_value);
}

OseoResult oseo_object_delete(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    bool strict
) {
    OseoResult valid = require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value)) {
            return type_error(
                context,
                "Cannot delete properties of a nullish value."
            );
        }
        if (string_own_property(object_value, key, NULL)) {
            return strict
                ? type_error(context, "Cannot delete a string index property.")
                : normal(oseo_boolean(false));
        }
        return normal(oseo_boolean(true));
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        return strict
            ? type_error(context, "Cannot delete the prototype property.")
            : normal(oseo_boolean(false));
    }
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return strict
            ? type_error(context, "Cannot delete the array length property.")
            : normal(oseo_boolean(false));
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = own_property_index(object, key);
    if (index == SIZE_MAX) return normal(oseo_boolean(true));
    if (!object->properties[index].attributes.configurable) {
        return strict
            ? type_error(context, "Cannot delete a non-configurable property.")
            : normal(oseo_boolean(false));
    }
    (void)remove_property(object, index);
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(oseo_boolean(true));
}

OseoResult oseo_object_set_prototype(
    OseoContext *context,
    OseoValue object_value,
    OseoValue prototype
) {
    if (!is_object(object_value) ||
        (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype))) {
        return type_error(
            context,
            "Object.setPrototypeOf requires an object prototype."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return tag_of(prototype) == OSEO_TAG_NULL
            ? normal(object_value)
            : type_error(context, "Cannot change a namespace prototype.");
    }
    OseoValue current = prototype;
    while (is_object(current)) {
        if (current == object_value) {
            return type_error(
                context,
                "Cyclic prototype chains are not allowed."
            );
        }
        current = ordinary_object(current)->prototype;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    object->prototype = prototype;
    object->default_intrinsics = false;
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(object_value);
}

static OseoValue builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static size_t own_ascii_property_index(
    const OseoOrdinaryObject *object,
    const char *name
) {
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (oseo_internal_string_is_ascii(
            object->properties[index].key, name)) return index;
    }
    return SIZE_MAX;
}

/* Mirrors HasProperty followed by Get for one ToPropertyDescriptor field:
 * an accessor field on the descriptor argument must be invoked with the
 * original descriptor object as the receiver, and a thrown exception must
 * propagate instead of being read as a raw stored value. */
static OseoResult descriptor_field(
    OseoContext *context,
    OseoValue descriptor_value,
    const char *name,
    bool *has_field,
    OseoValue *value
) {
    *has_field = false;
    *value = oseo_undefined();
    OseoValue current = descriptor_value;
    while (is_object(current)) {
        OseoOrdinaryObject *descriptor = ordinary_object(current);
        size_t index = own_ascii_property_index(descriptor, name);
        if (index != SIZE_MAX) {
            *has_field = true;
            OseoProperty *property = &descriptor->properties[index];
            if (!property->attributes.accessor) {
                *value = property->value;
                return normal(*value);
            }
            OseoValue getter = property->getter;
            if (!is_function(getter)) return normal(*value);
            OseoRootFrame frame = {NULL, NULL, 0u};
            OseoResult allocated = oseo_roots_allocate(context, &frame, 1u);
            if (allocated.status != OSEO_STATUS_NORMAL) return allocated;
            frame.slots[0] = getter;
            OseoResult result = oseo_call_function(
                context,
                frame.slots[0],
                descriptor_value,
                0u,
                NULL,
                oseo_undefined()
            );
            oseo_roots_release(context, &frame);
            if (result.status != OSEO_STATUS_NORMAL) return result;
            *value = result.value;
            return normal(*value);
        }
        current = descriptor->prototype;
    }
    return normal(*value);
}

static OseoResult ascii_string(OseoContext *context, const char *text) {
    uint16_t units[32];
    size_t length = strlen(text);
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Internal property name is long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_internal_allocate_string(context, units, length);
}

static bool rest_key_is_excluded(
    OseoValue key,
    size_t excluded_count,
    const OseoValue *excluded_keys
) {
    for (size_t index = 0u; index < excluded_count; index += 1u) {
        if (property_key_equal(key, excluded_keys[index])) return true;
    }
    return false;
}

static OseoResult snapshot_rest_keys(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t key_count
) {
    OseoValue source = frame->slots[0];
    size_t output = 0u;
    if (is_string(source)) {
        for (size_t index = 0u; index < key_count; index += 1u) {
            char key_text[24];
            (void)snprintf(key_text, sizeof(key_text), "%zu", index);
            OseoResult key = ascii_string(context, key_text);
            if (key.status != OSEO_STATUS_NORMAL) return key;
            frame->slots[3u + output] = key.value;
            output += 1u;
        }
        return normal(oseo_undefined());
    }
    if (!is_object(source)) return normal(oseo_undefined());
    uint64_t previous = UINT64_MAX;
    while (output < key_count) {
        OseoOrdinaryObject *object = ordinary_object(frame->slots[0]);
        size_t selected = SIZE_MAX;
        uint32_t selected_number = 0u;
        for (size_t index = 0u; index < object->property_count; index += 1u) {
            uint32_t number = 0u;
            if (!array_index(object->properties[index].key, &number) ||
                (previous != UINT64_MAX && number <= previous)) continue;
            if (selected == SIZE_MAX || number < selected_number) {
                selected = index;
                selected_number = number;
            }
        }
        if (selected == SIZE_MAX) break;
        frame->slots[3u + output] = object->properties[selected].key;
        output += 1u;
        previous = selected_number;
    }
    OseoOrdinaryObject *object = ordinary_object(frame->slots[0]);
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        uint32_t ignored = 0u;
        OseoValue key = object->properties[index].key;
        if (is_symbol(key) || array_index(key, &ignored)) continue;
        frame->slots[3u + output] = key;
        output += 1u;
    }
    object = ordinary_object(frame->slots[0]);
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        OseoValue key = object->properties[index].key;
        if (!is_symbol(key)) continue;
        frame->slots[3u + output] = key;
        output += 1u;
    }
    if (output != key_count) {
        return failure(context, "OSEO2001", "Own-key snapshot changed.");
    }
    return normal(oseo_undefined());
}

/**
 * CopyDataProperties: adds every own enumerable property of `source` that is
 * not an excluded key to `target` as a writable, enumerable, configurable
 * data property, in own-key order. `source` must not be nullish; the two
 * callers apply the nullish rule their own syntax requires. The result value
 * is `target` so a caller can return it directly.
 */
static OseoResult copy_data_properties(
    OseoContext *context,
    OseoValue target,
    OseoValue source,
    size_t excluded_count,
    const OseoValue *excluded_keys
) {
    size_t key_count = is_string(source)
        ? string_object(source)->length
        : is_object(source)
            ? ordinary_object(source)->property_count
            : 0u;
    if (key_count > SIZE_MAX - 3u) {
        return failure(context, "OSEO2001", "Own-key snapshot is too large.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, key_count + 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = source;
    frame.slots[1] = target;
    result = snapshot_rest_keys(context, &frame, key_count);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < key_count;
         index += 1u) {
        OseoValue key = frame.slots[3u + index];
        if (rest_key_is_excluded(key, excluded_count, excluded_keys)) {
            continue;
        }
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue ignored = oseo_undefined();
        OseoValue ignored_getter = oseo_undefined();
        OseoValue ignored_setter = oseo_undefined();
        bool exists = is_string(frame.slots[0])
            ? string_own_property(frame.slots[0], key, NULL)
            : oseo_internal_own_descriptor(
                frame.slots[0],
                key,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            );
        bool enumerable = is_string(frame.slots[0])
            ? exists && !oseo_internal_string_is_ascii(key, "length")
            : exists && attributes.enumerable;
        if (!enumerable) continue;
        result = oseo_object_get(context, frame.slots[0], key);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[1],
                key,
                frame.slots[2],
                (OseoPropertyAttributes){true, true, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_rest(
    OseoContext *context,
    OseoValue source,
    size_t excluded_count,
    const OseoValue *excluded_keys
) {
    if (is_nullish(source)) {
        return type_error(context, "Cannot destructure a nullish value.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = source;
    result = oseo_object_literal_create(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = copy_data_properties(
            context,
            result.value,
            frame.slots[0],
            excluded_count,
            excluded_keys
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_spread(
    OseoContext *context,
    OseoValue target,
    OseoValue source
) {
    /* An object literal spread of null or undefined copies nothing rather
     * than throwing, unlike an object binding rest. */
    if (is_nullish(source)) return normal(target);
    return copy_data_properties(context, target, source, 0u, NULL);
}

static OseoResult define_ascii_value(
    OseoContext *context,
    OseoRootFrame *frame,
    const char *name,
    OseoValue value
) {
    OseoResult result = ascii_string(context, name);
    frame->slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_set(
        context,
        frame->slots[0],
        frame->slots[1],
        value,
        false
    );
}

OseoResult oseo_object_builtin_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 1u) {
        return failure(
            context,
            "OSEO2001",
            "Object.create descriptor maps are unsupported in M3."
        );
    }
    return oseo_object_create(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
}

OseoResult oseo_object_builtin_define_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    OseoValue descriptor_value =
        builtin_argument(argument_count, arguments, 2u);
    if (!is_object(object_value) || !is_object(descriptor_value)) {
        return type_error(
            context,
            "Object.defineProperty requires an object descriptor."
        );
    }
    /* Slots: 0 key, 1 enumerable, 2 configurable, 3 value, 4 writable,
     * 5 get, 6 set. Every ToPropertyDescriptor field is stored directly
     * into its own rooted slot as soon as it is read, in ECMA-262's
     * fixed field order, because reading a later field can invoke a
     * descriptor accessor that allocates and collects; an unrooted C
     * local holding an earlier field's freshly returned heap value
     * would not survive that collection. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    frame.slots[0] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    bool has_enumerable = false;
    result = descriptor_field(
        context, descriptor_value, "enumerable", &has_enumerable,
        &frame.slots[1]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    bool has_configurable = false;
    result = descriptor_field(
        context, descriptor_value, "configurable", &has_configurable,
        &frame.slots[2]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    bool has_value = false;
    result = descriptor_field(
        context, descriptor_value, "value", &has_value, &frame.slots[3]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    bool has_writable = false;
    result = descriptor_field(
        context, descriptor_value, "writable", &has_writable,
        &frame.slots[4]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    bool has_getter = false;
    result = descriptor_field(
        context, descriptor_value, "get", &has_getter, &frame.slots[5]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    if (has_getter &&
        tag_of(frame.slots[5]) != OSEO_TAG_UNDEFINED &&
        !is_function(frame.slots[5])) {
        oseo_roots_release(context, &frame);
        return type_error(context, "A property descriptor 'get' field must "
            "be undefined or callable.");
    }
    bool has_setter = false;
    result = descriptor_field(
        context, descriptor_value, "set", &has_setter, &frame.slots[6]);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    if (has_setter &&
        tag_of(frame.slots[6]) != OSEO_TAG_UNDEFINED &&
        !is_function(frame.slots[6])) {
        oseo_roots_release(context, &frame);
        return type_error(context, "A property descriptor 'set' field must "
            "be undefined or callable.");
    }
    if ((has_getter || has_setter) && (has_value || has_writable)) {
        oseo_roots_release(context, &frame);
        return type_error(
            context,
            "A property descriptor cannot mix accessor and data fields."
        );
    }
    OseoValue enumerable = frame.slots[1];
    OseoValue configurable = frame.slots[2];
    OseoValue descriptor_value_field = frame.slots[3];
    OseoValue writable = frame.slots[4];
    OseoValue getter_field = frame.slots[5];
    OseoValue setter_field = frame.slots[6];
    OseoValue current_value = oseo_undefined();
    OseoPropertyAttributes current_attributes = {false, false, false, false};
    OseoValue current_getter = oseo_undefined();
    OseoValue current_setter = oseo_undefined();
    bool exists = oseo_internal_own_descriptor(
        object_value,
        frame.slots[0],
        &current_value,
        &current_attributes,
        &current_getter,
        &current_setter
    );
    if (has_getter || has_setter ||
        (!has_value && !has_writable &&
         exists && current_attributes.accessor)) {
        OseoPropertyAttributes attributes = {
            !has_configurable
                ? exists && current_attributes.configurable
                : oseo_to_boolean(configurable),
            !has_enumerable
                ? exists && current_attributes.enumerable
                : oseo_to_boolean(enumerable),
            false,
            true,
        };
        result = oseo_object_define_accessor(
            context,
            object_value,
            frame.slots[0],
            has_getter ? getter_field : oseo_undefined(),
            has_setter ? setter_field : oseo_undefined(),
            has_getter,
            has_setter,
            attributes
        );
        if (result.status == OSEO_STATUS_NORMAL) result.value = object_value;
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue value = has_value ? descriptor_value_field : current_value;
    OseoPropertyAttributes attributes = {
        !has_configurable
            ? exists && current_attributes.configurable
            : oseo_to_boolean(configurable),
        !has_enumerable
            ? exists && current_attributes.enumerable
            : oseo_to_boolean(enumerable),
        !has_writable
            ? exists && current_attributes.writable
            : oseo_to_boolean(writable),
        false,
    };
    result = oseo_object_define(
        context,
        object_value,
        frame.slots[0],
        value,
        attributes
    );
    if (result.status == OSEO_STATUS_NORMAL) result.value = object_value;
    oseo_roots_release(context, &frame);
    return result;
}

bool oseo_internal_own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
) {
    *getter = oseo_undefined();
    *setter = oseo_undefined();
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        *value = function_object(object_value)->prototype_object;
        *attributes = (OseoPropertyAttributes){
            false,
            false,
            function_object(object_value)->prototype_writable,
            false,
        };
        return true;
    }
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        OseoOrdinaryObject *array = ordinary_object(object_value);
        *value = oseo_number(array->array_length);
        *attributes = (OseoPropertyAttributes){
            false,
            false,
            array->length_writable,
            false,
        };
        return true;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = own_property_index(object, key);
    if (index == SIZE_MAX) return false;
    OseoProperty *property = &object->properties[index];
    *attributes = property->attributes;
    if (property->attributes.accessor) {
        *value = oseo_undefined();
        *getter = property->getter;
        *setter = property->setter;
    } else {
        *value = property->value;
    }
    return true;
}

OseoResult oseo_object_builtin_get_own_property_descriptor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    if (is_nullish(object_value)) {
        return type_error(
            context,
            "Cannot convert a nullish value to an object."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    frame.slots[1] = result.value;
    OseoValue value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    bool exists = false;
    if (result.status == OSEO_STATUS_NORMAL && is_object(object_value)) {
        exists = oseo_internal_own_descriptor(
            object_value,
            frame.slots[1],
            &value,
            &attributes,
            &getter,
            &setter
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_string(object_value)) {
        if (oseo_internal_string_is_ascii(frame.slots[1], "length")) {
            value = oseo_number(string_object(object_value)->length);
            exists = true;
        } else {
            uint32_t index = 0u;
            if (array_index(frame.slots[1], &index) &&
                index < string_object(object_value)->length) {
                uint16_t unit = string_object(object_value)->units[index];
                result = oseo_internal_allocate_string(context, &unit, 1u);
                value = result.value;
                attributes.enumerable = true;
                exists = result.status == OSEO_STATUS_NORMAL;
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && exists &&
        is_object(object_value) &&
        ordinary_object(object_value)->module_namespace &&
        is_cell(value)) {
        result = oseo_cell_get(context, value);
        value = result.value;
    }
    frame.slots[2] = attributes.accessor ? getter : value;
    frame.slots[3] = setter;
    if (result.status == OSEO_STATUS_NORMAL && !exists) {
        oseo_roots_release(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = attributes.accessor
            ? define_ascii_value(context, &frame, "get", frame.slots[2])
            : define_ascii_value(context, &frame, "value", frame.slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = attributes.accessor
            ? define_ascii_value(context, &frame, "set", frame.slots[3])
            : define_ascii_value(
                context,
                &frame,
                "writable",
                oseo_boolean(attributes.writable)
            );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(
            context,
            &frame,
            "enumerable",
            oseo_boolean(attributes.enumerable)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(
            context,
            &frame,
            "configurable",
            oseo_boolean(attributes.configurable)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult append_key(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t output_index,
    OseoValue key
) {
    char index_text[24];
    (void)snprintf(index_text, sizeof(index_text), "%zu", output_index);
    OseoResult result = ascii_string(context, index_text);
    frame->slots[1] = result.value;
    frame->slots[2] = key;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_set(
        context,
        frame->slots[0],
        frame->slots[1],
        frame->slots[2],
        false
    );
}

OseoResult oseo_object_builtin_keys(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    if (is_nullish(object_value)) {
        return type_error(
            context,
            "Cannot convert a nullish value to an object."
        );
    }
    OseoOrdinaryObject *object = is_object(object_value)
        ? ordinary_object(object_value)
        : NULL;
    size_t count = is_string(object_value)
        ? string_object(object_value)->length
        : 0u;
    if (object != NULL) {
        for (size_t index = 0u; index < object->property_count; index += 1u) {
            /* Object.keys reports only enumerable string keys. */
            if (object->properties[index].attributes.enumerable &&
                !is_symbol(object->properties[index].key)) {
                count += 1u;
            }
        }
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_array_create(context, count);
    frame.slots[0] = result.value;
    size_t output_index = 0u;
    if (is_string(object_value)) {
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && index < count;
             index += 1u) {
            char key_text[24];
            (void)snprintf(key_text, sizeof(key_text), "%zu", index);
            result = ascii_string(context, key_text);
            frame.slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = append_key(
                    context,
                    &frame,
                    output_index,
                    frame.slots[2]
                );
            }
            output_index += 1u;
        }
    }
    uint64_t previous = UINT64_MAX;
    while (result.status == OSEO_STATUS_NORMAL && object != NULL) {
        size_t selected = SIZE_MAX;
        uint32_t selected_number = 0u;
        for (size_t index = 0u; index < object->property_count; index += 1u) {
            uint32_t number = 0u;
            OseoProperty *property = &object->properties[index];
            if (!property->attributes.enumerable ||
                !array_index(property->key, &number) ||
                (previous != UINT64_MAX && number <= previous)) continue;
            if (selected == SIZE_MAX || number < selected_number) {
                selected = index;
                selected_number = number;
            }
        }
        if (selected == SIZE_MAX) break;
        result = append_key(
            context,
            &frame,
            output_index,
            object->properties[selected].key
        );
        output_index += 1u;
        previous = selected_number;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && object != NULL &&
         index < object->property_count;
         index += 1u) {
        OseoProperty *property = &object->properties[index];
        uint32_t ignored = 0u;
        if (!property->attributes.enumerable ||
            is_symbol(property->key) ||
            array_index(property->key, &ignored)) continue;
        result = append_key(
            context,
            &frame,
            output_index,
            property->key
        );
        output_index += 1u;
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_builtin_set_prototype_of(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(
        argument_count,
        arguments,
        0u
    );
    OseoValue prototype = builtin_argument(argument_count, arguments, 1u);
    if (is_nullish(object_value) ||
        (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype))) {
        return type_error(
            context,
            "Object.setPrototypeOf requires an object prototype."
        );
    }
    if (!is_object(object_value)) return normal(object_value);
    return oseo_object_set_prototype(
        context,
        object_value,
        prototype
    );
}
