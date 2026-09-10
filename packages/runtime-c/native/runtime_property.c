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
        OseoValue slots[3] = {object_value, key, receiver};
        OseoRootFrame frame = {NULL, slots, 3u};
        oseo_roots_push(context, &frame);
        OseoResult boxed = oseo_internal_to_object_for_property(
            context,
            slots[0]
        );
        slots[0] = boxed.value;
        if (boxed.status == OSEO_STATUS_NORMAL) {
            boxed = object_get(context, slots[0], slots[1], slots[2]);
        }
        oseo_roots_pop(context, &frame);
        return boxed;
    }
    OseoValue current = object_value;
    while (is_object(current)) {
        if (is_proxy(current)) {
            return oseo_internal_proxy_get(
                context, current, key, receiver);
        }
        OseoOrdinaryObject *object = ordinary_object(current);
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_property_descriptor(
            context, current, key, &value, &attributes, &getter, &setter)) {
            if (attributes.accessor) {
                if (!is_callable(getter)) return normal(oseo_undefined());
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
    /* The shared descriptor primitive already reports a function's
     * `prototype`, an array's `length`, and the virtual String iterator,
     * so the ownership answer never needs a separate synthetic case. */
    OseoValue value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    if (is_proxy(object_value)) {
        bool found = false;
        OseoResult result = oseo_internal_proxy_get_own_property(
            context,
            object_value,
            key,
            &found,
            &value,
            &attributes,
            &getter,
            &setter
        );
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(found));
    }
    return normal(oseo_boolean(oseo_internal_own_property_descriptor(
        context,
        object_value,
        key,
        &value,
        &attributes,
        &getter,
        &setter
    )));
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
    if (is_proxy(object_value)) {
        const char *refusal = NULL;
        OseoResult result = oseo_internal_proxy_set(
            context, object_value, key, value, object_value, &refusal);
        if (result.status != OSEO_STATUS_NORMAL || refusal == NULL) {
            return result;
        }
        return strict ? type_error(context, refusal) : normal(value);
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
            NULL
        );
    }
    uint32_t receiver_index = 0u;
    bool extends_array = is_array(object_value) &&
        oseo_internal_array_index(key, &receiver_index) &&
        receiver_index >= receiver->array_length;
    OseoValue current = object_value;
    while (is_object(current)) {
        if (is_proxy(current)) {
            const char *refusal = NULL;
            OseoResult result = oseo_internal_proxy_set(
                context,
                current,
                key,
                value,
                object_value,
                &refusal
            );
            if (result.status != OSEO_STATUS_NORMAL || refusal == NULL) {
                return result;
            }
            return strict ? type_error(context, refusal) : normal(value);
        }
        OseoOrdinaryObject *owner = ordinary_object(current);
        if (owner->module_namespace) {
            /* The receiver itself was answered above; a namespace
             * reached later on the walk owns the [[Set]] the absent own
             * property hands the parent, and it refuses every key. */
            if (strict) {
                return type_error(
                    context,
                    "Cannot assign to a module namespace property."
                );
            }
            return normal(value);
        }
        OseoValue own_value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_property_descriptor(
            context, current, key, &own_value, &attributes, &getter,
            &setter)) {
            if (attributes.accessor) {
                if (!is_callable(setter)) {
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
            if (index == SIZE_MAX) {
                /* An own property outside the property vector is either a
                 * synthetic descriptor a dedicated branch above already
                 * answered or the virtual String iterator, which an
                 * assignment to its own object replaces in place. */
                OseoPropertyAttributes virtual_attributes = attributes;
                if (current == object_value &&
                    oseo_internal_virtual_string_iterator_descriptor(
                        context,
                        current,
                        key,
                        &virtual_attributes
                    )) {
                    OseoResult assigned = oseo_object_define(
                        context,
                        object_value,
                        key,
                        value,
                        virtual_attributes
                    );
                    if (assigned.status != OSEO_STATUS_NORMAL) {
                        return assigned;
                    }
                    return normal(value);
                }
                break;
            }
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

OseoResult oseo_internal_set_with_receiver(
    OseoContext *context,
    OseoValue base,
    OseoValue key,
    OseoValue value,
    OseoValue receiver,
    const char **refusal
) {
    *refusal = NULL;
    OseoResult valid = oseo_internal_require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    /* The lookup walks `base` only to decide whether a setter runs.
     * Every other outcome, including a data property found on the walk,
     * leaves the write to the receiver. */
    OseoValue current = base;
    while (is_object(current)) {
        if (is_proxy(current)) {
            return oseo_internal_proxy_set(
                context, current, key, value, receiver, refusal);
        }
        if (ordinary_object(current)->module_namespace) {
            /* OrdinarySetWithOwnDescriptor hands an absent own property
             * to the parent's own [[Set]], so a module namespace
             * anywhere on the walk answers with its exotic [[Set]]
             * (10.4.6.9) rather than with this ordinary continuation.
             * That reports false for every key and every receiver, so
             * no write reaches either object. */
            *refusal = "Cannot assign to a module namespace property.";
            return normal(value);
        }
        OseoValue own_value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_property_descriptor(
            context, current, key, &own_value, &attributes, &getter,
            &setter)) {
            if (attributes.accessor) {
                if (!is_callable(setter)) {
                    *refusal = "Cannot set a property that has only a getter.";
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
                *refusal = "Cannot assign to a read-only property.";
                return normal(value);
            }
            break;
        }
        current = ordinary_object(current)->prototype;
    }
    if (!is_object(receiver)) {
        *refusal = "Cannot set properties of a nullish or primitive value.";
        return normal(value);
    }
    OseoValue receiver_value = oseo_undefined();
    OseoPropertyAttributes receiver_attributes = {false, false, false, false};
    OseoValue receiver_getter = oseo_undefined();
    OseoValue receiver_setter = oseo_undefined();
    bool receiver_found = false;
    OseoResult receiver_result = is_proxy(receiver)
        ? oseo_internal_proxy_get_own_property(
            context,
            receiver,
            key,
            &receiver_found,
            &receiver_value,
            &receiver_attributes,
            &receiver_getter,
            &receiver_setter
        )
        : normal(oseo_boolean(
            (receiver_found = oseo_internal_own_property_descriptor(
                context,
                receiver,
                key,
                &receiver_value,
                &receiver_attributes,
                &receiver_getter,
                &receiver_setter
            ))
        ));
    if (receiver_result.status != OSEO_STATUS_NORMAL) return receiver_result;
    if (receiver_found) {
        if (receiver_attributes.accessor) {
            *refusal = "Cannot assign to an accessor property of the receiver.";
            return normal(value);
        }
        if (!receiver_attributes.writable) {
            *refusal = "Cannot assign to a read-only property.";
            return normal(value);
        }
        /* OrdinarySetWithOwnDescriptor finishes with
         * Receiver.[[DefineOwnProperty]](P, { [[Value]]: V }), which
         * keeps every other attribute the property already has and
         * routes an array `length` write through ArraySetLength. That
         * definition can still report a refusal, because coercing the
         * written value runs user code that may make the property
         * non-writable. */
        OseoPropertyAttributes attributes = receiver_attributes;
        attributes.accessor = false;
        OseoResult assigned = oseo_internal_define_data_reported(
            context,
            receiver,
            key,
            value,
            attributes,
            true,
            true,
            refusal
        );
        if (assigned.status != OSEO_STATUS_NORMAL) return assigned;
        return normal(value);
    }
    /* CreateDataProperty on the receiver, which reports false rather
     * than throwing when the receiver refuses a new own property. */
    OseoResult created = oseo_internal_define_data_reported(
        context,
        receiver,
        key,
        value,
        (OseoPropertyAttributes){true, true, true, false},
        true,
        false,
        refusal
    );
    if (created.status != OSEO_STATUS_NORMAL) return created;
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
    const char *refusal = NULL;
    OseoResult result = oseo_internal_set_with_receiver(
        context,
        base,
        key,
        value,
        receiver,
        &refusal
    );
    if (result.status != OSEO_STATUS_NORMAL || refusal == NULL) return result;
    return strict ? type_error(context, refusal) : normal(value);
}
