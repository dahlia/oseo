#include "runtime_internal.h"

/*
 * The generic property access paths: [[Get]] and its `super` form,
 * [[Set]] and its `super` form, and HasOwnProperty.
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

OseoResult oseo_internal_require_property_key(
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
    OseoResult valid = oseo_internal_require_property_key(context, key);
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
        if (oseo_internal_string_own_property(object_value, key, &index)) {
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
            if (oseo_internal_cell_backed_property(current, value)) {
                return oseo_cell_get(context, value);
            }
            return normal(value);
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

OseoResult oseo_object_has_own(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    OseoResult valid = oseo_internal_require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value)) {
            return type_error(
                context,
                "Cannot convert a nullish value to an object."
            );
        }
        return normal(oseo_boolean(oseo_internal_string_own_property(
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
    return normal(oseo_boolean(
        oseo_internal_own_property_index(object, key) != SIZE_MAX));
}

OseoResult oseo_object_set(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    bool strict
) {
    OseoResult valid = oseo_internal_require_property_key(context, key);
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
        return oseo_internal_set_array_length(
            context,
            receiver,
            value,
            strict,
            false,
            false,
            NULL
        );
    }
    uint32_t receiver_index = 0u;
    bool extends_array = is_array(object_value) &&
        oseo_internal_array_index(key, &receiver_index) &&
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
            size_t index = oseo_internal_own_property_index(owner, key);
            if (index == SIZE_MAX) break;
            OseoProperty *property = &owner->properties[index];
            if (current == object_value) {
                /* A cell-backed property is a view of a binding, so the
                 * assignment updates the binding rather than replacing
                 * the view with a plain value. */
                if (oseo_internal_cell_backed_property(
                    current, property->value)) {
                    return oseo_cell_set(context, property->value, value);
                }
                property->value = value;
                if (extends_array) receiver->array_length = receiver_index + 1u;
                return normal(value);
            }
            break;
        }
        current = owner->prototype;
    }
    if (!receiver->extensible) {
        if (strict) {
            return type_error(
                context,
                "Cannot add a property to a non-extensible object."
            );
        }
        return normal(value);
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
    OseoResult grown = oseo_internal_grow_properties(context, object_value);
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
    OseoResult valid = oseo_internal_require_property_key(context, key);
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
