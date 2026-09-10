#include "runtime_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * The `Object` built-ins, the `Object.prototype` methods, and the own-key
 * operations they share with object rest and spread: ToPropertyDescriptor,
 * FromPropertyDescriptor, CopyDataProperties, own-key ordering, and the
 * `Object.create`, `Object.defineProperty`, `Object.defineProperties`,
 * `Object.getOwnPropertyDescriptor`,
 * `Object.getOwnPropertyDescriptors`, `Object.keys`, and
 * `Object.setPrototypeOf` entry points.
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

static OseoValue builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult create_object_prototype_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
);
static OseoResult object_get_own_property_descriptors(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_define_properties(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_assign(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_entries(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_from_entries(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_get_own_property_names(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_get_own_property_symbols(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_group_by(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_has_own(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_values(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult object_prototype_has_own_property(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult key = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (key.status != OSEO_STATUS_NORMAL) return key;
    return oseo_object_has_own(context, receiver, key.value);
}

static OseoResult object_prototype_property_is_enumerable(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult key = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (key.status != OSEO_STATUS_NORMAL) return key;
    if (is_nullish(receiver)) {
        return type_error(context, "Cannot convert a nullish value to object.");
    }
    if (is_string(receiver)) {
        bool own = oseo_internal_string_own_property(
            receiver,
            key.value,
            NULL
        );
        bool enumerable = own &&
            !oseo_internal_string_is_ascii(key.value, "length");
        return normal(oseo_boolean(enumerable));
    }
    if (!is_object(receiver)) return normal(oseo_boolean(false));
    OseoValue ignored = oseo_undefined();
    OseoValue ignored_getter = oseo_undefined();
    OseoValue ignored_setter = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    bool own = false;
    OseoResult result = is_proxy(receiver)
        ? oseo_internal_proxy_get_own_property(
            context,
            receiver,
            key.value,
            &own,
            &ignored,
            &attributes,
            &ignored_getter,
            &ignored_setter
        )
        : normal(oseo_boolean(
            (own = oseo_internal_own_property_descriptor(
                context,
                receiver,
                key.value,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            ))
        ));
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(own && attributes.enumerable));
}

static OseoResult object_prototype_is_prototype_of(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(value)) return normal(oseo_boolean(false));
    if (is_nullish(receiver)) {
        return type_error(context, "Cannot convert a nullish value to object.");
    }
    if (!is_object(receiver)) return normal(oseo_boolean(false));
    OseoResult prototype = oseo_internal_get_prototype(context, value);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    OseoValue current = prototype.value;
    while (is_object(current)) {
        if (current == receiver) return normal(oseo_boolean(true));
        prototype = oseo_internal_get_prototype(context, current);
        if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
        current = prototype.value;
    }
    return normal(oseo_boolean(false));
}

static const char *object_builtin_tag(OseoValue receiver) {
    if (is_array(receiver)) return "Array";
    if (is_regexp(receiver)) return "RegExp";
    if (is_callable(receiver)) return "Function";
    if (is_object(receiver) && ordinary_object(receiver)->arguments_object) {
        return "Arguments";
    }
    if (is_object(receiver) && ordinary_object(receiver)->error_data) {
        return "Error";
    }
    if (is_object(receiver) && ordinary_object(receiver)->number_data) {
        return "Number";
    }
    if (is_object(receiver) && ordinary_object(receiver)->primitive_data) {
        OseoValue primitive = ordinary_object(receiver)->primitive_value;
        if (is_string(primitive)) return "String";
        if (is_symbol(primitive)) return "Symbol";
        if (tag_of(primitive) == OSEO_TAG_BOOLEAN) return "Boolean";
    }
    if (is_string(receiver)) return "String";
    if (is_symbol(receiver)) return "Symbol";
    if (is_number(receiver)) return "Number";
    if (tag_of(receiver) == OSEO_TAG_BOOLEAN) return "Boolean";
    return "Object";
}

static OseoResult object_tag_text(
    OseoContext *context,
    OseoValue tag_value,
    const char *fallback
) {
    static const uint16_t prefix[] = {
        '[', 'o', 'b', 'j', 'e', 'c', 't', ' '
    };
    size_t tag_length = is_string(tag_value)
        ? string_object(tag_value)->length
        : strlen(fallback);
    if (tag_length > SIZE_MAX - 9u ||
        tag_length + 9u > SIZE_MAX / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "Object tag is too long.");
    }
    size_t length = tag_length + 9u;
    OseoResult valid = oseo_internal_validate_string_length(context, length);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    uint16_t *units = malloc(length * sizeof(*units));
    if (units == NULL) {
        return failure(context, "OSEO2001", "Object tag allocation failed.");
    }
    memcpy(units, prefix, sizeof(prefix));
    if (is_string(tag_value)) {
        memcpy(
            units + 8u,
            string_object(tag_value)->units,
            tag_length * sizeof(*units)
        );
    } else {
        for (size_t index = 0u; index < tag_length; index += 1u) {
            units[index + 8u] = (uint16_t)(unsigned char)fallback[index];
        }
    }
    units[length - 1u] = ']';
    OseoValue slot = tag_value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    oseo_roots_pop(context, &frame);
    free(units);
    return result;
}

static OseoResult object_prototype_to_string(
    OseoContext *context,
    OseoValue receiver
) {
    if (tag_of(receiver) == OSEO_TAG_UNDEFINED) {
        return object_tag_text(context, oseo_undefined(), "Undefined");
    }
    if (tag_of(receiver) == OSEO_TAG_NULL) {
        return object_tag_text(context, oseo_undefined(), "Null");
    }
    OseoValue tag_target = receiver;
    bool proxy_array = false;
    while (is_proxy(tag_target)) {
        if (proxy_object(tag_target)->revoked) {
            return type_error(context, "Cannot inspect a revoked Proxy.");
        }
        tag_target = proxy_object(tag_target)->target;
    }
    if (is_proxy(receiver)) proxy_array = is_array(tag_target);
    const char *fallback = proxy_array
        ? "Array"
        : is_callable(receiver)
            ? "Function"
            : object_builtin_tag(is_proxy(receiver) ? receiver : tag_target);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    if (is_object(frame.slots[0])) {
        frame.slots[1] = frame.slots[0];
    } else {
        result = oseo_internal_to_object(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_super_get(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[0]
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = object_tag_text(context, frame.slots[3], fallback);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult object_prototype_to_locale_string(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_nullish(receiver)) {
        return type_error(context, "Cannot convert a nullish value to object.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = oseo_internal_to_object(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "toString");
    }
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_super_get(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[0]
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(frame.slots[2])) {
        result = type_error(context, "The toString property is not callable.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult object_prototype_value_of(
    OseoContext *context,
    OseoValue receiver
) {
    return oseo_internal_to_object(context, receiver);
}

OseoResult oseo_internal_install_primitive_wrapper_methods(
    OseoContext *context,
    OseoValue prototype,
    bool include_index_of
) {
    if (ordinary_object(prototype)->primitive_wrapper_methods_initialized) {
        return normal(prototype);
    }
    static const struct {
        const char *name;
        size_t length;
    } methods[] = {
        {"toString", 0u},
        {"valueOf", 0u},
        {"indexOf", 1u},
    };
    size_t method_count = include_index_of ? 3u : 2u;
    OseoValue slots[3] = {
        prototype,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(slots[0]);
    for (size_t index = 0u; index < method_count; index += 1u) {
        result = create_object_prototype_function(
            context,
            OSEO_OBJECT_PRIMITIVE_WRAPPER_METHOD_CODE_ID,
            methods[index].name,
            methods[index].length
        );
        slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(
                context,
                methods[index].name
            );
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
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(slots[0])->primitive_wrapper_methods_initialized =
            true;
        result.value = slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_primitive_wrapper_prototype(
    OseoContext *context,
    OseoIntrinsic intrinsic
) {
    OseoResult result;
    bool created = false;
    /*
     * A prototype whose own constructor node materializes it, including
     * the exotic own properties and the `constructor` property, is
     * reached through the realm intrinsic table rather than built here.
     */
    if (intrinsic == OSEO_INTRINSIC_BIGINT_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_NUMBER_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_STRING_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_SYMBOL_PROTOTYPE) {
        result = oseo_internal_intrinsic(context, intrinsic);
    } else if (is_object(context->intrinsics[intrinsic])) {
        result = normal(context->intrinsics[intrinsic]);
    } else {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_create(context, result.value);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[intrinsic] = result.value;
            created = true;
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (intrinsic == OSEO_INTRINSIC_BIGINT_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_NUMBER_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_STRING_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_SYMBOL_PROTOTYPE) {
        return result;
    }
    if (created) {
        OseoOrdinaryObject *prototype = ordinary_object(result.value);
        prototype->primitive_data = true;
        prototype->primitive_value = oseo_boolean(false);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_primitive_wrapper_methods(
            context,
            context->intrinsics[intrinsic],
            false
        );
    }
    if (result.status != OSEO_STATUS_NORMAL && created) {
        context->intrinsics[intrinsic] = oseo_undefined();
    }
    return result;
}

static OseoResult primitive_wrapper_prototype(
    OseoContext *context,
    OseoValue value
) {
    OseoIntrinsic intrinsic;
    if (is_number(value)) {
        intrinsic = OSEO_INTRINSIC_NUMBER_PROTOTYPE;
    } else if (is_symbol(value)) {
        intrinsic = OSEO_INTRINSIC_SYMBOL_PROTOTYPE;
    } else if (is_string(value)) {
        intrinsic = OSEO_INTRINSIC_STRING_PROTOTYPE;
    } else if (is_bigint(value)) {
        intrinsic = OSEO_INTRINSIC_BIGINT_PROTOTYPE;
    } else {
        intrinsic = OSEO_INTRINSIC_BOOLEAN_PROTOTYPE;
    }
    return oseo_internal_primitive_wrapper_prototype(context, intrinsic);
}

static OseoResult to_object(
    OseoContext *context,
    OseoValue value,
    bool define_string_properties
) {
    if (is_nullish(value)) {
        return type_error(context, "Cannot convert a nullish value to object.");
    }
    if (is_object(value)) return normal(value);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = primitive_wrapper_prototype(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *wrapper = ordinary_object(frame.slots[1]);
        wrapper->primitive_data = true;
        wrapper->primitive_value = frame.slots[0];
        if (is_number(frame.slots[0])) {
            wrapper->number_data = true;
            wrapper->number_value = frame.slots[0];
        }
        if (define_string_properties && is_string(frame.slots[0])) {
            result = oseo_internal_string_wrapper_properties(
                context,
                frame.slots[0],
                frame.slots[1]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_to_object(OseoContext *context, OseoValue value) {
    return to_object(context, value, true);
}

OseoResult oseo_internal_to_object_for_property(
    OseoContext *context,
    OseoValue value
) {
    return to_object(context, value, false);
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%Object.prototype%").
 * GetPrototypeFromConstructor is a real Get rather than a read of the
 * synthetic `prototype` slot, because `Reflect.construct` can hand this
 * a bound function whose own `prototype` a program defined as an
 * accessor. `Object` performs no argument validation before this step,
 * so the read is at the position 20.1.1.1 gives it.
 */
static OseoResult object_create_from_constructor(
    OseoContext *context,
    OseoValue new_target
) {
    OseoValue slots[2] = {new_target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_constructor_prototype(
        context,
        slots[0]
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_validate_function_realm(context, slots[0]);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_intrinsic(
                context,
                OSEO_INTRINSIC_OBJECT_PROTOTYPE
            );
        }
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult object_constructor(
    OseoContext *context,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED && new_target != callee) {
        return object_create_from_constructor(context, new_target);
    }
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (!is_nullish(value)) return oseo_internal_to_object(context, value);
    /* The new target is absent or the active function itself, so
     * 20.1.1.1 step 2 creates an ordinary object over the realm
     * prototype rather than reading anything. A built-in [[Construct]]
     * never adopts the receiver its caller made, so this creates one
     * even when the caller already had. */
    OseoResult prototype = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    return oseo_object_create(context, prototype.value);
}

static OseoResult object_get_prototype_of(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult object = oseo_internal_to_object_for_property(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (object.status != OSEO_STATUS_NORMAL) return object;
    return oseo_internal_get_prototype(context, object.value);
}

static OseoResult object_is(
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue left = builtin_argument(argument_count, arguments, 0u);
    OseoValue right = builtin_argument(argument_count, arguments, 1u);
    return normal(oseo_boolean(oseo_internal_same_value(left, right)));
}

/*
 * SetIntegrityLevel (7.3.15) over the ordinary and currently admitted exotic
 * object representations. The descriptor component remains authoritative for
 * applying every stored property change, including mapped arguments aliases
 * and module namespace compatibility. Array `length` and function `prototype`
 * are the two own data properties held outside the property vector.
 */
static OseoResult object_set_integrity_level(
    OseoContext *context,
    OseoValue object_value,
    bool frozen
) {
    if (is_proxy(object_value)) {
        OseoValue slots[3] = {
            object_value, oseo_undefined(), oseo_undefined(),
        };
        OseoRootFrame proxy_frame = {NULL, slots, 3u};
        oseo_roots_push(context, &proxy_frame);
        const char *refusal = NULL;
        OseoResult proxy_result = oseo_internal_prevent_extensions_reported(
            context, slots[0], &refusal);
        if (proxy_result.status == OSEO_STATUS_NORMAL && refusal != NULL) {
            proxy_result = type_error(context, refusal);
        }
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_internal_proxy_own_keys(
                context, slots[0], OSEO_OWN_KEY_ALL);
            slots[1] = proxy_result.value;
        }
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_internal_array_like_list(
                context, slots[1], &slots[2]);
        }
        size_t key_count = 0u;
        const OseoValue *keys = NULL;
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_argument_list_view(
                context, slots[2], &key_count, &keys);
        }
        for (size_t index = 0u;
             proxy_result.status == OSEO_STATUS_NORMAL && index < key_count;
             index += 1u) {
            bool found = true;
            OseoValue value = oseo_undefined();
            OseoPropertyAttributes attributes = {false, false, false, false};
            OseoValue getter = oseo_undefined();
            OseoValue setter = oseo_undefined();
            if (frozen) {
                proxy_result = oseo_internal_proxy_get_own_property(
                    context, slots[0], keys[index], &found, &value,
                    &attributes, &getter, &setter);
            }
            if (proxy_result.status != OSEO_STATUS_NORMAL || !found) continue;
            OseoConvertedDescriptor descriptor = {
                false, false, true, false,
                frozen && !attributes.accessor, false,
                false, false, false,
            };
            refusal = NULL;
            proxy_result = oseo_internal_proxy_define_own_property(
                context, slots[0], keys[index], &descriptor,
                oseo_undefined(), oseo_undefined(), oseo_undefined(),
                &refusal);
            if (proxy_result.status == OSEO_STATUS_NORMAL && refusal != NULL) {
                proxy_result = type_error(context, refusal);
            }
        }
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result.value = slots[0];
        }
        oseo_roots_pop(context, &proxy_frame);
        return proxy_result;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    object->extensible = false;
    if (object->virtual_string_iterator) {
        object->virtual_string_iterator_configurable = false;
        if (frozen) object->virtual_string_iterator_writable = false;
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object_value;
    size_t property_count = object->property_count;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < property_count;
         index += 1u) {
        object = ordinary_object(frame.slots[0]);
        OseoProperty property = object->properties[index];
        frame.slots[1] = property.key;
        frame.slots[2] = property.attributes.accessor
            ? property.getter
            : property.value;
        if (!property.attributes.accessor &&
            oseo_internal_cell_backed_property(
                frame.slots[0], frame.slots[2])) {
            result = oseo_cell_get(context, frame.slots[2]);
            frame.slots[2] = result.value;
        }
        OseoPropertyAttributes attributes = property.attributes;
        attributes.configurable = false;
        if (frozen && !attributes.accessor) attributes.writable = false;
        if (result.status == OSEO_STATUS_NORMAL && attributes.accessor) {
            result = oseo_object_define_accessor(
                context,
                frame.slots[0],
                frame.slots[1],
                property.getter,
                property.setter,
                true,
                true,
                attributes
            );
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_object_define_data(
                context,
                frame.slots[0],
                frame.slots[1],
                frame.slots[2],
                attributes,
                true
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && frozen) {
        object = ordinary_object(frame.slots[0]);
        if (is_array(frame.slots[0])) object->length_writable = false;
        if (function_has_prototype_property(frame.slots[0])) {
            function_object(frame.slots[0])->prototype_writable = false;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

/* TestIntegrityLevel (7.3.16), including the two virtual own properties. */
static OseoResult object_test_integrity_level(
    OseoContext *context,
    OseoValue value,
    bool frozen
) {
    if (is_proxy(value)) {
        OseoValue slots[3] = {value, oseo_undefined(), oseo_undefined()};
        OseoRootFrame frame = {NULL, slots, 3u};
        oseo_roots_push(context, &frame);
        OseoResult result = oseo_internal_is_extensible(context, slots[0]);
        if (result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value)) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_boolean(false));
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_proxy_own_keys(
                context, slots[0], OSEO_OWN_KEY_ALL);
            slots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_array_like_list(
                context, slots[1], &slots[2]);
        }
        size_t key_count = 0u;
        const OseoValue *keys = NULL;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_argument_list_view(
                context, slots[2], &key_count, &keys);
        }
        bool intact = true;
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && intact &&
                 index < key_count;
             index += 1u) {
            bool found = false;
            OseoValue property = oseo_undefined();
            OseoPropertyAttributes attributes = {false, false, false, false};
            OseoValue getter = oseo_undefined();
            OseoValue setter = oseo_undefined();
            result = oseo_internal_proxy_get_own_property(
                context, slots[0], keys[index], &found, &property, &attributes,
                &getter, &setter);
            if (result.status == OSEO_STATUS_NORMAL && found &&
                (attributes.configurable ||
                 (frozen && !attributes.accessor && attributes.writable))) {
                intact = false;
            }
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = normal(oseo_boolean(intact));
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    OseoOrdinaryObject *object = ordinary_object(value);
    if (object->extensible) return normal(oseo_boolean(false));
    if (frozen && is_array(value) && object->length_writable) {
        return normal(oseo_boolean(false));
    }
    if (frozen && function_has_prototype_property(value) &&
        function_object(value)->prototype_writable) {
        return normal(oseo_boolean(false));
    }
    if (object->virtual_string_iterator &&
        (object->virtual_string_iterator_configurable ||
         (frozen && object->virtual_string_iterator_writable))) {
        return normal(oseo_boolean(false));
    }
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        OseoPropertyAttributes attributes =
            object->properties[index].attributes;
        if (attributes.configurable ||
            (frozen && !attributes.accessor && attributes.writable)) {
            return normal(oseo_boolean(false));
        }
    }
    return normal(oseo_boolean(true));
}

static OseoResult object_integrity_transition(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    bool frozen
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(value)) return normal(value);
    return object_set_integrity_level(context, value, frozen);
}

static OseoResult object_integrity_query(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    bool frozen
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    return !is_object(value)
        ? normal(oseo_boolean(true))
        : object_test_integrity_level(context, value, frozen);
}

static OseoResult object_is_extensible(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    return is_object(value)
        ? oseo_internal_is_extensible(context, value)
        : normal(oseo_boolean(false));
}

static OseoResult object_prevent_extensions(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(value)) return normal(value);
    const char *refusal = NULL;
    OseoResult result = oseo_internal_prevent_extensions_reported(
        context, value, &refusal);
    if (result.status != OSEO_STATUS_NORMAL || refusal == NULL) return result;
    return type_error(context, refusal);
}

OseoResult oseo_internal_object_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (code_id == OSEO_OBJECT_CONSTRUCTOR_CODE_ID) {
        return object_constructor(
            context,
            callee,
            argument_count,
            arguments,
            new_target
        );
    }
    if (code_id == OSEO_OBJECT_PRIMITIVE_WRAPPER_METHOD_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Primitive wrapper prototype methods are not admitted yet."
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return type_error(
            context,
            "Object static method is not a constructor."
        );
    }
    if (code_id == OSEO_OBJECT_GET_PROTOTYPE_OF_CODE_ID) {
        return object_get_prototype_of(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_IS_CODE_ID) {
        return object_is(argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_SET_PROTOTYPE_OF_CODE_ID) {
        return oseo_object_builtin_set_prototype_of(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_CREATE_CODE_ID) {
        return oseo_object_builtin_create(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_DEFINE_PROPERTY_CODE_ID) {
        return oseo_object_builtin_define_property(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_DEFINE_PROPERTIES_CODE_ID) {
        return object_define_properties(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR_CODE_ID) {
        return oseo_object_builtin_get_own_property_descriptor(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS_CODE_ID) {
        return object_get_own_property_descriptors(
            context,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_FREEZE_CODE_ID) {
        return object_integrity_transition(
            context, argument_count, arguments, true);
    }
    if (code_id == OSEO_OBJECT_IS_EXTENSIBLE_CODE_ID) {
        return object_is_extensible(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_IS_FROZEN_CODE_ID) {
        return object_integrity_query(
            context, argument_count, arguments, true);
    }
    if (code_id == OSEO_OBJECT_IS_SEALED_CODE_ID) {
        return object_integrity_query(
            context, argument_count, arguments, false);
    }
    if (code_id == OSEO_OBJECT_PREVENT_EXTENSIONS_CODE_ID) {
        return object_prevent_extensions(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_SEAL_CODE_ID) {
        return object_integrity_transition(
            context, argument_count, arguments, false);
    }
    if (code_id == OSEO_OBJECT_ASSIGN_CODE_ID) {
        return object_assign(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_ENTRIES_CODE_ID) {
        return object_entries(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_FROM_ENTRIES_CODE_ID) {
        return object_from_entries(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_GET_OWN_PROPERTY_NAMES_CODE_ID) {
        return object_get_own_property_names(
            context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_GET_OWN_PROPERTY_SYMBOLS_CODE_ID) {
        return object_get_own_property_symbols(
            context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_GROUP_BY_CODE_ID) {
        return object_group_by(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_HAS_OWN_CODE_ID) {
        return object_has_own(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_KEYS_CODE_ID) {
        return oseo_object_builtin_keys(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_VALUES_CODE_ID) {
        return object_values(context, argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_HAS_OWN_PROPERTY_CODE_ID) {
        return object_prototype_has_own_property(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_IS_PROTOTYPE_OF_CODE_ID) {
        return object_prototype_is_prototype_of(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_PROPERTY_IS_ENUMERABLE_CODE_ID) {
        return object_prototype_property_is_enumerable(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_OBJECT_TO_STRING_CODE_ID) {
        return object_prototype_to_string(context, receiver);
    }
    if (code_id == OSEO_OBJECT_TO_LOCALE_STRING_CODE_ID) {
        return object_prototype_to_locale_string(context, receiver);
    }
    if (code_id == OSEO_OBJECT_VALUE_OF_CODE_ID) {
        return object_prototype_value_of(context, receiver);
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_object_prototype_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
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
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult object_prototype_function(
    OseoContext *context,
    OseoIntrinsic intrinsic,
    size_t code_id,
    const char *name,
    size_t length
) {
    OseoValue *cache = &context->intrinsics[intrinsic];
    if (is_function(*cache)) return normal(*cache);
    OseoResult result = create_object_prototype_function(
        context,
        code_id,
        name,
        length
    );
    if (result.status == OSEO_STATUS_NORMAL) *cache = result.value;
    return result;
}

static OseoResult object_constructor_function(OseoContext *context) {
    static const uint16_t name[] = {'O', 'b', 'j', 'e', 'c', 't'};
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_OBJECT_CONSTRUCTOR_CODE_ID,
            environment,
            name,
            sizeof(name) / sizeof(*name),
            1u,
            OSEO_FUNCTION_ORDINARY,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_object_prototype(OseoContext *context) {
    OseoValue prototype =
        context->intrinsics[OSEO_INTRINSIC_OBJECT_PROTOTYPE];
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_OBJECT_SET_PROTOTYPE_OF];
    if (is_function(*marker)) return normal(prototype);
    if (is_object(*marker)) return normal(prototype);
    if (!is_object(prototype)) {
        return failure(context, "OSEO2001", "Object prototype is unavailable.");
    }
    size_t entry_allocations = context->allocations;
    *marker = prototype;
    OseoResult result = object_constructor_function(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_OBJECT] = result.value;
        OseoFunction *constructor = function_object(result.value);
        constructor->prototype_object = prototype;
        constructor->prototype_writable = false;
    }
    static const OseoIntrinsic intrinsics[] = {
        OSEO_INTRINSIC_OBJECT_HAS_OWN_PROPERTY,
        OSEO_INTRINSIC_OBJECT_IS_PROTOTYPE_OF,
        OSEO_INTRINSIC_OBJECT_PROPERTY_IS_ENUMERABLE,
        OSEO_INTRINSIC_OBJECT_TO_LOCALE_STRING,
        OSEO_INTRINSIC_OBJECT_TO_STRING,
    };
    static const size_t codes[] = {
        OSEO_OBJECT_HAS_OWN_PROPERTY_CODE_ID,
        OSEO_OBJECT_IS_PROTOTYPE_OF_CODE_ID,
        OSEO_OBJECT_PROPERTY_IS_ENUMERABLE_CODE_ID,
        OSEO_OBJECT_TO_LOCALE_STRING_CODE_ID,
        OSEO_OBJECT_TO_STRING_CODE_ID,
    };
    static const char *const names[] = {
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "toString",
    };
    static const size_t lengths[] = {1u, 1u, 1u, 0u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < sizeof(intrinsics) / sizeof(*intrinsics);
         index += 1u) {
        result = object_prototype_function(
            context,
            intrinsics[index],
            codes[index],
            names[index],
            lengths[index]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_object_prototype_function(
            context,
            OSEO_OBJECT_VALUE_OF_CODE_ID,
            "valueOf",
            0u
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[OSEO_INTRINSIC_OBJECT_VALUE_OF] = result.value;
        }
    }
    static const OseoIntrinsic properties[] = {
        OSEO_INTRINSIC_OBJECT,
        OSEO_INTRINSIC_OBJECT_HAS_OWN_PROPERTY,
        OSEO_INTRINSIC_OBJECT_IS_PROTOTYPE_OF,
        OSEO_INTRINSIC_OBJECT_PROPERTY_IS_ENUMERABLE,
        OSEO_INTRINSIC_OBJECT_TO_LOCALE_STRING,
        OSEO_INTRINSIC_OBJECT_TO_STRING,
        OSEO_INTRINSIC_OBJECT_VALUE_OF,
    };
    static const char *const property_names[] = {
        "constructor",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "toString",
        "valueOf",
    };
    const OseoPropertyAttributes attributes = {true, false, true, false};
    OseoRootFrame frame = {NULL, NULL, 0u};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_roots_allocate(context, &frame, 3u);
        if (result.status == OSEO_STATUS_NORMAL) {
            frame.slots[0] = prototype;
        }
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < sizeof(properties) / sizeof(*properties);
         index += 1u) {
        result = oseo_internal_ascii_string(context, property_names[index]);
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                context->intrinsics[properties[index]],
                attributes
            );
        }
    }
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_OBJECT_GET_PROTOTYPE_OF,
        OSEO_INTRINSIC_OBJECT_IS,
        OSEO_INTRINSIC_OBJECT_SET_PROTOTYPE_OF,
    };
    static const size_t static_codes[] = {
        OSEO_OBJECT_GET_PROTOTYPE_OF_CODE_ID,
        OSEO_OBJECT_IS_CODE_ID,
        OSEO_OBJECT_SET_PROTOTYPE_OF_CODE_ID,
    };
    static const char *const static_names[] = {
        "getPrototypeOf",
        "is",
        "setPrototypeOf",
    };
    static const size_t static_lengths[] = {1u, 2u, 2u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = object_prototype_function(
            context,
            static_intrinsics[index],
            static_codes[index],
            static_names[index],
            static_lengths[index]
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(context, static_names[index]);
            frame.slots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                context->intrinsics[OSEO_INTRINSIC_OBJECT],
                frame.slots[1],
                context->intrinsics[static_intrinsics[index]],
                attributes
            );
        }
    }
    static const size_t owned_static_codes[] = {
        OSEO_OBJECT_ASSIGN_CODE_ID,
        OSEO_OBJECT_CREATE_CODE_ID,
        OSEO_OBJECT_DEFINE_PROPERTIES_CODE_ID,
        OSEO_OBJECT_DEFINE_PROPERTY_CODE_ID,
        OSEO_OBJECT_ENTRIES_CODE_ID,
        OSEO_OBJECT_FREEZE_CODE_ID,
        OSEO_OBJECT_FROM_ENTRIES_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_NAMES_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_SYMBOLS_CODE_ID,
        OSEO_OBJECT_GROUP_BY_CODE_ID,
        OSEO_OBJECT_HAS_OWN_CODE_ID,
        OSEO_OBJECT_IS_EXTENSIBLE_CODE_ID,
        OSEO_OBJECT_IS_FROZEN_CODE_ID,
        OSEO_OBJECT_IS_SEALED_CODE_ID,
        OSEO_OBJECT_KEYS_CODE_ID,
        OSEO_OBJECT_PREVENT_EXTENSIONS_CODE_ID,
        OSEO_OBJECT_SEAL_CODE_ID,
        OSEO_OBJECT_VALUES_CODE_ID,
    };
    static const char *const owned_static_names[] = {
        "assign",
        "create",
        "defineProperties",
        "defineProperty",
        "entries",
        "freeze",
        "fromEntries",
        "getOwnPropertyDescriptor",
        "getOwnPropertyDescriptors",
        "getOwnPropertyNames",
        "getOwnPropertySymbols",
        "groupBy",
        "hasOwn",
        "isExtensible",
        "isFrozen",
        "isSealed",
        "keys",
        "preventExtensions",
        "seal",
        "values",
    };
    static const size_t owned_static_lengths[] = {
        2u, 2u, 2u, 3u, 1u, 1u, 1u, 2u, 1u, 1u, 1u, 2u, 2u,
        1u, 1u, 1u, 1u, 1u, 1u, 1u,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < sizeof(owned_static_codes) / sizeof(*owned_static_codes);
         index += 1u) {
        result = create_object_prototype_function(
            context,
            owned_static_codes[index],
            owned_static_names[index],
            owned_static_lengths[index]
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(
                context,
                owned_static_names[index]
            );
            frame.slots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                context->intrinsics[OSEO_INTRINSIC_OBJECT],
                frame.slots[1],
                frame.slots[2],
                attributes
            );
        }
    }
    if (frame.slots != NULL) oseo_roots_release(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) {
        *marker = oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_OBJECT] = oseo_undefined();
        return result;
    }
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    return normal(prototype);
}

OseoResult oseo_internal_install_object_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_OBJECT);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Object");
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
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = descriptor_value;
    result = oseo_internal_ascii_string(context, name);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_has_property(
            context,
            frame.slots[1],
            frame.slots[0]
        );
        *has_field = result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value);
    }
    if (result.status == OSEO_STATUS_NORMAL && *has_field) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        *value = result.value;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(*value) : result;
}

static bool rest_key_is_excluded(
    OseoValue key,
    size_t excluded_count,
    const OseoValue *excluded_keys
) {
    for (size_t index = 0u; index < excluded_count; index += 1u) {
        if (oseo_internal_property_key_equal(key, excluded_keys[index])) {
            return true;
        }
    }
    return false;
}

/* Materialize a Proxy [[OwnPropertyKeys]] result in the frame shape used
 * by the ordinary own-key consumers below. */
static OseoResult proxy_own_key_frame(
    OseoContext *context,
    OseoValue proxy,
    OseoRootFrame *frame,
    size_t *key_count
) {
    OseoValue slots[3] = {
        proxy, oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame temporary = {NULL, slots, 3u};
    oseo_roots_push(context, &temporary);
    OseoResult result = oseo_internal_proxy_own_keys(
        context, slots[0], OSEO_OWN_KEY_ALL);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_array_like_list(
            context, slots[1], &slots[2]);
    }
    const OseoValue *keys = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context, slots[2], key_count, &keys);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        *key_count > SIZE_MAX - 3u) {
        result = failure(
            context, "OSEO2001", "Own-key snapshot is too large.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_roots_allocate(context, frame, *key_count + 3u);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        frame->slots[0] = slots[0];
        for (size_t index = 0u; index < *key_count; index += 1u) {
            frame->slots[3u + index] = keys[index];
        }
        /* The dynamic frame was pushed above the temporary roots. The
         * copied key values let it replace those roots in the chain. */
        frame->previous = temporary.previous;
        temporary.previous = NULL;
    } else {
        oseo_roots_pop(context, &temporary);
    }
    return result;
}

/*
 * The own-key order CopyDataProperties walks. Of the own properties that
 * live outside the property vector, only the virtual
 * %String.prototype%[@@iterator] can become enumerable, so it is the one
 * synthetic key this snapshot has to place; an array's `length` and a
 * function's `prototype` are permanently non-enumerable and the copy
 * would skip them anyway.
 */
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
            OseoResult key = oseo_internal_ascii_string(context, key_text);
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
            if (!oseo_internal_array_index(
                    object->properties[index].key, &number) ||
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
        if (is_symbol(key) ||
            oseo_internal_array_index(key, &ignored)) continue;
        frame->slots[3u + output] = key;
        output += 1u;
    }
    if (ordinary_object(frame->slots[0])->virtual_string_iterator) {
        /* The untouched String iterator leads every symbol a program can
         * add, exactly as it does in the ordinary own-key snapshot. */
        OseoResult key = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        if (key.status != OSEO_STATUS_NORMAL) return key;
        frame->slots[3u + output] = key.value;
        output += 1u;
    }
    /* The virtual-key lookup above may allocate, so reacquire the object
     * before reading its property vector. */
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
    OseoRootFrame frame = {NULL, NULL, 0u};
    size_t key_count = 0u;
    OseoResult result = normal(oseo_undefined());
    if (is_proxy(source)) {
        result = proxy_own_key_frame(context, source, &frame, &key_count);
    } else {
        key_count = is_string(source)
            ? string_object(source)->length
            : is_object(source)
                ? ordinary_object(source)->property_count +
                    (ordinary_object(source)->virtual_string_iterator
                        ? 1u
                        : 0u)
                : 0u;
        if (key_count > SIZE_MAX - 3u) {
            return failure(
                context, "OSEO2001", "Own-key snapshot is too large.");
        }
        result = oseo_roots_allocate(context, &frame, key_count + 3u);
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = source;
    frame.slots[1] = target;
    if (!is_proxy(frame.slots[0])) {
        result = snapshot_rest_keys(context, &frame, key_count);
    }
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
        bool exists = false;
        if (is_string(frame.slots[0])) {
            exists = oseo_internal_string_own_property(
                frame.slots[0], key, NULL);
        } else if (is_proxy(frame.slots[0])) {
            result = oseo_internal_proxy_get_own_property(
                context,
                frame.slots[0],
                key,
                &exists,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        } else {
            exists = oseo_internal_own_property_descriptor(
                context,
                frame.slots[0],
                key,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            );
        }
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
    /* Slot 1 keeps the fresh target alive while Proxy traps can collect. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = source;
    result = oseo_object_literal_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = copy_data_properties(
            context,
            frame.slots[1],
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
    OseoResult result = oseo_internal_ascii_string(context, name);
    frame->slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_define(
        context,
        frame->slots[0],
        frame->slots[1],
        value,
        (OseoPropertyAttributes){true, true, true, false}
    );
}

/*
 * Object.create (20.1.2.2). The prototype check precedes every read of
 * the properties argument, so a non-object non-null prototype throws
 * before a poisoned properties getter can run. An undefined properties
 * argument returns the fresh object directly; any other value flows
 * through the ObjectDefineProperties body `Object.defineProperties`
 * owns, so descriptor collection, ordering, and abrupt completions
 * behave identically over the freshly created target.
 */
OseoResult oseo_object_builtin_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue prototype = builtin_argument(argument_count, arguments, 0u);
    if (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype)) {
        return type_error(
            context,
            "Object.create requires an object or null prototype."
        );
    }
    OseoValue properties = builtin_argument(argument_count, arguments, 1u);
    if (tag_of(properties) == OSEO_TAG_UNDEFINED) {
        return oseo_object_create(context, prototype);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = properties;
    result = oseo_object_create(context, prototype);
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[1] = result.value;
        const OseoValue define_arguments[2] = {
            frame.slots[1],
            frame.slots[0],
        };
        result = object_define_properties(context, 2u, define_arguments);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The presence flags and converted attribute fields of one
 * ToPropertyDescriptor result. The `value`, `get`, and `set` fields are
 * heap values, so they stay in caller-rooted slots rather than in this
 * record; ToBoolean runs no user code, so the three attribute fields
 * hold their converted results directly.
 */
/*
 * ToPropertyDescriptor (6.2.6.5) over a descriptor object the caller has
 * already checked and rooted. The fields are read in ECMA-262's fixed
 * order: enumerable, configurable, value, writable, get, set. Every heap
 * field is stored into its caller-rooted slot as soon as it is read,
 * because reading a later field can invoke a descriptor accessor that
 * allocates and collects; an unrooted C local holding an earlier field's
 * freshly returned heap value would not survive that collection. An
 * accessor field that is neither undefined nor callable and a
 * descriptor mixing accessor and data fields throw the specified
 * TypeError.
 */
OseoResult oseo_internal_to_property_descriptor(
    OseoContext *context,
    OseoValue descriptor_value,
    OseoValue *value_slot,
    OseoValue *getter_slot,
    OseoValue *setter_slot,
    OseoConvertedDescriptor *descriptor
) {
    OseoValue attribute = oseo_undefined();
    OseoResult result = descriptor_field(
        context, descriptor_value, "enumerable",
        &descriptor->has_enumerable, &attribute);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    descriptor->enumerable =
        descriptor->has_enumerable && oseo_to_boolean(attribute);
    result = descriptor_field(
        context, descriptor_value, "configurable",
        &descriptor->has_configurable, &attribute);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    descriptor->configurable =
        descriptor->has_configurable && oseo_to_boolean(attribute);
    result = descriptor_field(
        context, descriptor_value, "value",
        &descriptor->has_value, value_slot);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = descriptor_field(
        context, descriptor_value, "writable",
        &descriptor->has_writable, &attribute);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    descriptor->writable =
        descriptor->has_writable && oseo_to_boolean(attribute);
    result = descriptor_field(
        context, descriptor_value, "get",
        &descriptor->has_getter, getter_slot);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (descriptor->has_getter &&
        tag_of(*getter_slot) != OSEO_TAG_UNDEFINED &&
        !is_callable(*getter_slot)) {
        return type_error(context, "A property descriptor 'get' field must "
            "be undefined or callable.");
    }
    result = descriptor_field(
        context, descriptor_value, "set",
        &descriptor->has_setter, setter_slot);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (descriptor->has_setter &&
        tag_of(*setter_slot) != OSEO_TAG_UNDEFINED &&
        !is_callable(*setter_slot)) {
        return type_error(context, "A property descriptor 'set' field must "
            "be undefined or callable.");
    }
    if ((descriptor->has_getter || descriptor->has_setter) &&
        (descriptor->has_value || descriptor->has_writable)) {
        return type_error(
            context,
            "A property descriptor cannot mix accessor and data fields."
        );
    }
    return normal(oseo_undefined());
}

/*
 * DefinePropertyOrThrow (7.3.8) over one converted descriptor. The
 * caller roots the target, the key, and the three heap descriptor
 * fields. The current property state supplies every absent field, a
 * cell-backed current value reads through its binding cell, and the
 * descriptor component stays authoritative for compatibility and
 * mutation.
 */
OseoResult oseo_internal_define_converted_property(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    OseoValue getter,
    OseoValue setter,
    const char **refusal
) {
    *refusal = NULL;
    if (is_proxy(object_value)) {
        return oseo_internal_proxy_define_own_property(
            context,
            object_value,
            key,
            descriptor,
            value,
            getter,
            setter,
            refusal
        );
    }
    OseoValue current_value = oseo_undefined();
    OseoPropertyAttributes current_attributes = {false, false, false, false};
    OseoValue current_getter = oseo_undefined();
    OseoValue current_setter = oseo_undefined();
    bool exists = oseo_internal_own_property_descriptor(
        context,
        object_value,
        key,
        &current_value,
        &current_attributes,
        &current_getter,
        &current_setter
    );
    /* A descriptor with no value field keeps the property's current
     * value, which a cell-backed property holds in its binding cell. */
    if (exists &&
        oseo_internal_cell_backed_property(object_value, current_value)) {
        OseoResult cell = oseo_cell_get(context, current_value);
        if (cell.status != OSEO_STATUS_NORMAL) return cell;
        current_value = cell.value;
    }
    if (descriptor->has_getter || descriptor->has_setter ||
        (!descriptor->has_value && !descriptor->has_writable &&
         exists && current_attributes.accessor)) {
        OseoPropertyAttributes attributes = {
            !descriptor->has_configurable
                ? exists && current_attributes.configurable
                : descriptor->configurable,
            !descriptor->has_enumerable
                ? exists && current_attributes.enumerable
                : descriptor->enumerable,
            false,
            true,
        };
        return oseo_internal_define_accessor_reported(
            context,
            object_value,
            key,
            descriptor->has_getter ? getter : oseo_undefined(),
            descriptor->has_setter ? setter : oseo_undefined(),
            descriptor->has_getter,
            descriptor->has_setter,
            attributes,
            refusal
        );
    }
    OseoPropertyAttributes attributes = {
        !descriptor->has_configurable
            ? exists && current_attributes.configurable
            : descriptor->configurable,
        !descriptor->has_enumerable
            ? exists && current_attributes.enumerable
            : descriptor->enumerable,
        !descriptor->has_writable
            ? exists && current_attributes.writable
            : descriptor->writable,
        false,
    };
    return oseo_internal_define_data_reported(
        context,
        object_value,
        key,
        descriptor->has_value ? value : current_value,
        attributes,
        descriptor->has_value,
        !descriptor->has_writable,
        refusal
    );
}

OseoResult oseo_internal_define_from_descriptor(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue descriptor_value,
    const char **refusal
) {
    *refusal = NULL;
    if (!is_object(descriptor_value)) {
        return type_error(
            context,
            "A property definition requires an object descriptor."
        );
    }
    /* Slots: 0 target, 1 key, 2 value, 3 get, 4 set. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object_value;
    frame.slots[1] = key;
    OseoConvertedDescriptor descriptor;
    result = oseo_internal_to_property_descriptor(
        context,
        descriptor_value,
        &frame.slots[2],
        &frame.slots[3],
        &frame.slots[4],
        &descriptor
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_define_converted_property(
            context,
            frame.slots[0],
            frame.slots[1],
            &descriptor,
            frame.slots[2],
            frame.slots[3],
            frame.slots[4],
            refusal
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_builtin_define_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    OseoValue descriptor_value =
        builtin_argument(argument_count, arguments, 2u);
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Object.defineProperty requires an object target."
        );
    }
    /* Slot 0 holds the converted key across the descriptor conversion. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(descriptor_value)) {
        result = type_error(
            context,
            "Object.defineProperty requires an object descriptor."
        );
    }
    const char *refusal = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_define_from_descriptor(
            context,
            object_value,
            frame.slots[0],
            descriptor_value,
            &refusal
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && refusal != NULL) {
        result = type_error(context, refusal);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = object_value;
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * FromPropertyDescriptor (6.2.6.4). The caller owns a root frame of at
 * least four slots and stores the described property's data value or
 * getter in slot 2 and its setter in slot 3 before calling. The created
 * object lands in slot 0, slot 1 is the field-name scratch every
 * define_ascii_value call uses, and the fields are defined in the order
 * the abstract operation specifies, so an own-key walk of the result
 * reports `value, writable, enumerable, configurable` for a data
 * property and `get, set, enumerable, configurable` for an accessor.
 */
static OseoResult from_property_descriptor(
    OseoContext *context,
    OseoRootFrame *frame,
    OseoPropertyAttributes attributes
) {
    OseoResult result = oseo_object_literal_create(context);
    frame->slots[0] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = attributes.accessor
        ? define_ascii_value(context, frame, "get", frame->slots[2])
        : define_ascii_value(context, frame, "value", frame->slots[2]);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = attributes.accessor
        ? define_ascii_value(context, frame, "set", frame->slots[3])
        : define_ascii_value(
            context,
            frame,
            "writable",
            oseo_boolean(attributes.writable)
        );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = define_ascii_value(
        context,
        frame,
        "enumerable",
        oseo_boolean(attributes.enumerable)
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = define_ascii_value(
        context,
        frame,
        "configurable",
        oseo_boolean(attributes.configurable)
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(frame->slots[0]);
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
        result = is_proxy(object_value)
            ? oseo_internal_proxy_get_own_property(
                context,
                object_value,
                frame.slots[1],
                &exists,
                &value,
                &attributes,
                &getter,
                &setter
            )
            : normal(oseo_boolean(
                (exists = oseo_internal_own_property_descriptor(
                    context,
                    object_value,
                    frame.slots[1],
                    &value,
                    &attributes,
                    &getter,
                    &setter
                ))
            ));
        /* The normal value is ignored; only the abrupt completion and
         * the descriptor outputs are observable here. */
        (void)result.value;
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_string(object_value)) {
        if (oseo_internal_string_is_ascii(frame.slots[1], "length")) {
            value = oseo_number(string_object(object_value)->length);
            exists = true;
        } else {
            uint32_t index = 0u;
            if (oseo_internal_array_index(frame.slots[1], &index) &&
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
        oseo_internal_cell_backed_property(object_value, value)) {
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
        result = from_property_descriptor(context, &frame, attributes);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * OrdinaryOwnPropertyKeys (10.1.11.1) over the representations this
 * profile stores. Integer-index keys come first in ascending numeric
 * order, then the remaining string keys in creation order, then the
 * symbol keys in creation order.
 *
 * Three own properties are not in the property vector: an array's
 * `length`, a function's `prototype`, and the untouched virtual
 * %String.prototype%[Symbol.iterator]. An array's `length` is created
 * before any property a program can add, so it leads the array's string
 * keys. A function's `prototype` follows the leading string keys its
 * `prototype_key_position` still counts. The untouched String iterator
 * leads every symbol a program can add. A concrete replacement occupies
 * that same position in the property vector. Slot 0 of `frame` holds
 * the object, slot 2 holds whichever synthesized string key this object
 * needs, and the keys fill the `key_count` slots from index 3.
 */
static OseoResult snapshot_own_keys(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t key_count
) {
    bool virtual_length = is_array(frame->slots[0]);
    bool virtual_prototype =
        function_has_prototype_property(frame->slots[0]);
    bool virtual_string_iterator =
        ordinary_object(frame->slots[0])->virtual_string_iterator;
    size_t output = 0u;
    uint64_t previous = UINT64_MAX;
    while (output < key_count) {
        OseoOrdinaryObject *object = ordinary_object(frame->slots[0]);
        size_t selected = SIZE_MAX;
        uint32_t selected_number = 0u;
        for (size_t index = 0u; index < object->property_count; index += 1u) {
            uint32_t number = 0u;
            if (!oseo_internal_array_index(
                    object->properties[index].key, &number) ||
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
    if (virtual_length || virtual_prototype) {
        OseoResult key = oseo_internal_ascii_string(
            context,
            virtual_length ? "length" : "prototype"
        );
        if (key.status != OSEO_STATUS_NORMAL) return key;
        frame->slots[2] = key.value;
    }
    if (virtual_length) {
        frame->slots[3u + output] = frame->slots[2];
        output += 1u;
    }
    /* No allocation happens through the remaining string-key pass, so
     * the property vector cannot move under this loop. */
    bool pending_prototype = virtual_prototype;
    size_t prototype_position = virtual_prototype
        ? function_object(frame->slots[0])->prototype_key_position
        : 0u;
    size_t string_rank = 0u;
    OseoOrdinaryObject *object = ordinary_object(frame->slots[0]);
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        uint32_t ignored = 0u;
        OseoValue key = object->properties[index].key;
        if (is_symbol(key) ||
            oseo_internal_array_index(key, &ignored)) continue;
        if (pending_prototype && string_rank == prototype_position) {
            frame->slots[3u + output] = frame->slots[2];
            output += 1u;
            pending_prototype = false;
        }
        frame->slots[3u + output] = key;
        output += 1u;
        string_rank += 1u;
    }
    if (pending_prototype) {
        frame->slots[3u + output] = frame->slots[2];
        output += 1u;
    }
    if (virtual_string_iterator) {
        OseoResult key = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        if (key.status != OSEO_STATUS_NORMAL) return key;
        frame->slots[3u + output] = key.value;
        output += 1u;
    }
    /* The virtual-key lookup above may allocate, so reacquire the object
     * before reading its property vector. No allocation happens during
     * the stored-symbol pass. */
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

static size_t own_key_count(OseoValue object_value) {
    size_t virtual_count = is_array(object_value) ||
        function_has_prototype_property(object_value) ? 1u : 0u;
    if (ordinary_object(object_value)->virtual_string_iterator) {
        virtual_count += 1u;
    }
    return ordinary_object(object_value)->property_count + virtual_count;
}

static OseoResult object_close_after_abrupt(
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

OseoResult oseo_internal_own_key_array(
    OseoContext *context,
    OseoValue object_value,
    OseoOwnKeyFilter filter
) {
    if (is_proxy(object_value)) {
        return oseo_internal_proxy_own_keys(context, object_value, filter);
    }
    OseoValue rooted = object_value;
    OseoRootFrame root = {NULL, &rooted, 1u};
    oseo_roots_push(context, &root);
    size_t key_count = own_key_count(rooted);
    if (key_count > SIZE_MAX - 3u) {
        oseo_roots_pop(context, &root);
        return failure(context, "OSEO2001", "Own-key snapshot is too large.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, key_count + 3u);
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[0] = rooted;
        result = snapshot_own_keys(context, &frame, key_count);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[1] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < key_count;
         index += 1u) {
        OseoValue key = frame.slots[3u + index];
        if ((filter == OSEO_OWN_KEY_STRINGS && is_symbol(key)) ||
            (filter == OSEO_OWN_KEY_SYMBOLS && !is_symbol(key))) {
            continue;
        }
        result = oseo_array_append(context, frame.slots[1], key);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    oseo_roots_pop(context, &root);
    return result;
}

static OseoResult object_filtered_own_keys(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    bool symbols
) {
    OseoResult converted = oseo_internal_to_object(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    return oseo_internal_own_key_array(
        context,
        converted.value,
        symbols ? OSEO_OWN_KEY_SYMBOLS : OSEO_OWN_KEY_STRINGS
    );
}

typedef enum {
    OSEO_ENUMERABLE_KEYS,
    OSEO_ENUMERABLE_VALUES,
    OSEO_ENUMERABLE_ENTRIES,
} OseoEnumerableOwnPropertyKind;

static OseoResult object_enumerable_own_properties(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoEnumerableOwnPropertyKind kind
) {
    OseoResult converted = oseo_internal_to_object(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    if (is_proxy(converted.value)) {
        OseoValue slots[5] = {
            converted.value,
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
        };
        OseoRootFrame proxy_frame = {NULL, slots, 5u};
        oseo_roots_push(context, &proxy_frame);
        OseoResult proxy_result = oseo_internal_proxy_own_keys(
            context, slots[0], OSEO_OWN_KEY_STRINGS);
        slots[1] = proxy_result.value;
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_internal_array_like_list(
                context, slots[1], &slots[2]);
        }
        size_t proxy_count = 0u;
        const OseoValue *proxy_keys = NULL;
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_argument_list_view(
                context, slots[2], &proxy_count, &proxy_keys);
        }
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result = oseo_array_create(context, 0u);
            slots[3] = proxy_result.value;
        }
        for (size_t index = 0u;
             proxy_result.status == OSEO_STATUS_NORMAL &&
                 index < proxy_count;
             index += 1u) {
            bool found = false;
            OseoValue descriptor_value = oseo_undefined();
            OseoValue descriptor_getter = oseo_undefined();
            OseoValue descriptor_setter = oseo_undefined();
            OseoPropertyAttributes descriptor = {false, false, false, false};
            proxy_result = oseo_internal_proxy_get_own_property(
                context,
                slots[0],
                proxy_keys[index],
                &found,
                &descriptor_value,
                &descriptor,
                &descriptor_getter,
                &descriptor_setter
            );
            if (proxy_result.status != OSEO_STATUS_NORMAL ||
                !found || !descriptor.enumerable) continue;
            if (kind == OSEO_ENUMERABLE_KEYS) {
                proxy_result = oseo_array_append(
                    context, slots[3], proxy_keys[index]);
                continue;
            }
            proxy_result = oseo_object_get(
                context, slots[0], proxy_keys[index]);
            slots[4] = proxy_result.value;
            if (proxy_result.status != OSEO_STATUS_NORMAL) break;
            if (kind == OSEO_ENUMERABLE_VALUES) {
                proxy_result = oseo_array_append(
                    context, slots[3], slots[4]);
                continue;
            }
            OseoResult pair = oseo_array_create(context, 0u);
            slots[1] = pair.value;
            if (pair.status == OSEO_STATUS_NORMAL) {
                pair = oseo_array_append(
                    context, slots[1], proxy_keys[index]);
            }
            if (pair.status == OSEO_STATUS_NORMAL) {
                pair = oseo_array_append(context, slots[1], slots[4]);
            }
            if (pair.status == OSEO_STATUS_NORMAL) {
                pair = oseo_array_append(context, slots[3], slots[1]);
            }
            proxy_result = pair;
        }
        if (proxy_result.status == OSEO_STATUS_NORMAL) {
            proxy_result.value = slots[3];
        }
        oseo_roots_pop(context, &proxy_frame);
        return proxy_result;
    }
    OseoValue rooted = converted.value;
    OseoRootFrame root = {NULL, &rooted, 1u};
    oseo_roots_push(context, &root);
    size_t key_count = own_key_count(rooted);
    if (key_count > SIZE_MAX - 3u) {
        oseo_roots_pop(context, &root);
        return failure(context, "OSEO2001", "Own-key snapshot is too large.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, key_count + 3u);
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[0] = rooted;
        result = snapshot_own_keys(context, &frame, key_count);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[1] = result.value;
    }
    OseoValue scratch_slots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame scratch = {NULL, scratch_slots, 2u};
    oseo_roots_push(context, &scratch);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < key_count;
         index += 1u) {
        OseoValue key = frame.slots[3u + index];
        if (is_symbol(key)) continue;
        OseoValue ignored = oseo_undefined();
        OseoValue ignored_getter = oseo_undefined();
        OseoValue ignored_setter = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        if (!oseo_internal_own_property_descriptor(
                context,
                frame.slots[0],
                key,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            ) ||
            !attributes.enumerable) {
            continue;
        }
        if (kind == OSEO_ENUMERABLE_KEYS) {
            result = oseo_array_append(context, frame.slots[1], key);
            continue;
        }
        result = oseo_object_get(context, frame.slots[0], key);
        scratch_slots[0] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (kind == OSEO_ENUMERABLE_VALUES) {
            result = oseo_array_append(
                context, frame.slots[1], scratch_slots[0]);
            continue;
        }
        result = oseo_array_create(context, 0u);
        scratch_slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(context, scratch_slots[1], key);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context, scratch_slots[1], scratch_slots[0]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context, frame.slots[1], scratch_slots[1]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_pop(context, &scratch);
    oseo_roots_release(context, &frame);
    oseo_roots_pop(context, &root);
    return result;
}

static OseoResult object_assign(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult converted = oseo_internal_to_object(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    OseoValue target = converted.value;
    OseoRootFrame target_root = {NULL, &target, 1u};
    oseo_roots_push(context, &target_root);
    OseoResult result = normal(target);
    for (size_t source_index = 1u;
         result.status == OSEO_STATUS_NORMAL && source_index < argument_count;
         source_index += 1u) {
        if (is_nullish(arguments[source_index])) continue;
        converted = oseo_internal_to_object(context, arguments[source_index]);
        if (converted.status != OSEO_STATUS_NORMAL) {
            result = converted;
            break;
        }
        OseoValue source = converted.value;
        OseoRootFrame source_root = {NULL, &source, 1u};
        oseo_roots_push(context, &source_root);
        size_t key_count = 0u;
        OseoRootFrame frame = {NULL, NULL, 0u};
        if (is_proxy(source)) {
            result = proxy_own_key_frame(
                context, source, &frame, &key_count);
        } else {
            key_count = own_key_count(source);
            if (key_count > SIZE_MAX - 3u) {
                result = failure(
                    context, "OSEO2001", "Own-key snapshot is too large.");
            }
        }
        if (result.status == OSEO_STATUS_NORMAL && !is_proxy(source)) {
            result = oseo_roots_allocate(context, &frame, key_count + 3u);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            frame.slots[0] = source;
            frame.slots[1] = target;
            if (!is_proxy(frame.slots[0])) {
                result = snapshot_own_keys(context, &frame, key_count);
            }
        }
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && index < key_count;
             index += 1u) {
            OseoValue key = frame.slots[3u + index];
            OseoValue ignored = oseo_undefined();
            OseoValue ignored_getter = oseo_undefined();
            OseoValue ignored_setter = oseo_undefined();
            OseoPropertyAttributes attributes = {false, false, false, false};
            bool exists = false;
            if (is_proxy(frame.slots[0])) {
                result = oseo_internal_proxy_get_own_property(
                    context,
                    frame.slots[0],
                    key,
                    &exists,
                    &ignored,
                    &attributes,
                    &ignored_getter,
                    &ignored_setter
                );
                if (result.status != OSEO_STATUS_NORMAL) break;
            } else {
                exists = oseo_internal_own_property_descriptor(
                    context,
                    frame.slots[0],
                    key,
                    &ignored,
                    &attributes,
                    &ignored_getter,
                    &ignored_setter
                );
            }
            if (!exists || !attributes.enumerable) {
                continue;
            }
            result = oseo_object_get(context, frame.slots[0], key);
            frame.slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_object_set(
                    context,
                    frame.slots[1],
                    key,
                    frame.slots[2],
                    true
                );
            }
        }
        oseo_roots_release(context, &frame);
        oseo_roots_pop(context, &source_root);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = target;
    oseo_roots_pop(context, &target_root);
    return result;
}

static OseoResult object_entries(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return object_enumerable_own_properties(
        context, argument_count, arguments, OSEO_ENUMERABLE_ENTRIES);
}

static OseoResult object_values(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return object_enumerable_own_properties(
        context, argument_count, arguments, OSEO_ENUMERABLE_VALUES);
}

static OseoResult object_get_own_property_names(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return object_filtered_own_keys(context, argument_count, arguments, false);
}

static OseoResult object_get_own_property_symbols(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return object_filtered_own_keys(context, argument_count, arguments, true);
}

static OseoResult object_has_own(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult converted = oseo_internal_to_object(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    OseoValue slots[2] = {
        converted.value,
        builtin_argument(argument_count, arguments, 1u),
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(context, slots[1]);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_has_own(context, slots[0], slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Recover the String value a primitive or [[StringData]] wrapper stores. */
static bool object_string_value(OseoValue source, OseoValue *string_value) {
    if (is_string(source)) {
        *string_value = source;
        return true;
    }
    if (!oseo_internal_string_data(source)) return false;
    *string_value = ordinary_object(source)->primitive_value;
    return true;
}

/*
 * Decide whether a value iterates as a String through the realm's
 * untouched virtual %String.prototype%[Symbol.iterator]. A primitive
 * String or a [[StringData]] wrapper that still reaches that default has
 * no iterator object to acquire, so the caller walks code points itself.
 * Anything else, including an own, inherited, replaced, or deleted
 * iterator, reports false and goes through observable iterator
 * acquisition. Both intrinsic lookups can allocate, so the frame roots
 * the source and its [[StringData]] rather than relying on the caller to
 * keep them reachable, and `string_value` is written after the last
 * allocation so the caller's rooted slot receives a live value.
 */
static OseoResult object_virtual_string_iteration(
    OseoContext *context,
    OseoValue source,
    OseoValue *string_value,
    bool *direct
) {
    *direct = false;
    OseoValue candidate = oseo_undefined();
    if (!object_string_value(source, &candidate)) {
        return normal(oseo_undefined());
    }
    OseoValue slots[3] = {source, candidate, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ITERATOR
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_primitive_wrapper_prototype(
            context,
            OSEO_INTRINSIC_STRING_PROTOTYPE
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /* The prototype is used before the next allocation, so it needs
         * no slot of its own. */
        *direct = oseo_internal_uses_virtual_string_iterator(
            slots[0],
            result.value,
            slots[2]
        );
        *string_value = slots[1];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Code-unit length of the code point the default String iterator yields
 * at `offset`, pairing a leading surrogate with a following trailing one
 * and reporting a lone surrogate as a single unit. Each caller reacquires
 * its OseoString from a rooted slot on every step, so the interior
 * `units` pointer it then hands to oseo_string_from_units stays valid:
 * the collector sweeps unreachable objects in place and never relocates a
 * reachable one.
 */
static size_t object_string_element_length(
    const OseoString *source,
    size_t offset
) {
    uint16_t first = source->units[offset];
    if (first < UINT16_C(0xd800) || first > UINT16_C(0xdbff)) return 1u;
    if (offset + 1u >= source->length) return 1u;
    uint16_t second = source->units[offset + 1u];
    if (second < UINT16_C(0xdc00) || second > UINT16_C(0xdfff)) return 1u;
    return 2u;
}

/*
 * CreateDataPropertyOnObject (20.1.2.7 step 5.c onward) for the entry now
 * in slots[4], defining its "0" key and "1" value on the target object in
 * slots[3]. slots[5] through slots[7] are the caller's rooted scratch.
 */
static OseoResult object_define_entry(OseoContext *context, OseoValue *slots) {
    if (!is_object(slots[4])) {
        return type_error(context, "Iterator value is not an entry object.");
    }
    OseoResult result = oseo_internal_ascii_string(context, "0");
    slots[5] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[4], slots[5]);
        slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "1");
        slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[4], slots[6]);
        slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_property_key(context, slots[5]);
        slots[7] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[3],
            slots[7],
            slots[6],
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    return result;
}

static OseoResult object_from_entries(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[9] = {
        builtin_argument(argument_count, arguments, 0u),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 9u};
    oseo_roots_push(context, &frame);
    bool direct_string = false;
    OseoResult result = object_virtual_string_iteration(
        context,
        slots[0],
        &slots[8],
        &direct_string
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_literal_create(context);
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !direct_string) {
        result = oseo_iterator_get(context, slots[0], &slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && direct_string) {
        /*
         * The separate String iterator node has not materialized an
         * iterator object yet, so walk the default code-point sequence
         * here as Object.groupBy and Array.from do. An empty String
         * yields nothing and produces an empty object; every element a
         * non-empty String yields is a primitive, so the first one
         * reaches the entry-object TypeError below. There is no iterator
         * object to close on that abrupt completion.
         */
        size_t offset = 0u;
        while (result.status == OSEO_STATUS_NORMAL) {
            OseoString *source = string_object(slots[8]);
            if (offset >= source->length) break;
            size_t element_length =
                object_string_element_length(source, offset);
            result = oseo_string_from_units(
                context,
                &source->units[offset],
                element_length
            );
            slots[4] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = object_define_entry(context, slots);
            }
            offset += element_length;
        }
    }
    bool done = false;
    while (result.status == OSEO_STATUS_NORMAL && !direct_string && !done) {
        result = oseo_iterator_next(
            context, slots[1], slots[2], &slots[4], &done);
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        result = object_define_entry(context, slots);
        if (result.status != OSEO_STATUS_NORMAL) {
            result = object_close_after_abrupt(context, slots[1], result);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[3];
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult object_add_grouped_value(
    OseoContext *context,
    OseoValue *slots,
    double index
) {
    OseoValue callback_arguments[2] = {
        slots[5],
        oseo_number(index),
    };
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        oseo_undefined(),
        2u,
        callback_arguments,
        oseo_undefined()
    );
    slots[6] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_property_key(context, slots[6]);
        slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_has_own(context, slots[4], slots[6]);
    }
    bool exists = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && exists) {
        result = oseo_object_get(context, slots[4], slots[6]);
        slots[7] = result.value;
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        slots[7] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                slots[4],
                slots[6],
                slots[7],
                (OseoPropertyAttributes){true, true, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, slots[7], slots[5]);
    }
    return result;
}

static OseoResult object_group_by(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[9] = {
        builtin_argument(argument_count, arguments, 0u),
        builtin_argument(argument_count, arguments, 1u),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 9u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    if (is_nullish(slots[0])) {
        result = type_error(context, "Object.groupBy requires an iterable.");
    } else if (!is_callable(slots[1])) {
        result = type_error(
            context,
            "Object.groupBy callback is not callable."
        );
    }
    bool direct_string = false;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = object_virtual_string_iteration(
            context,
            slots[0],
            &slots[8],
            &direct_string
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && !direct_string) {
        result = oseo_iterator_get(context, slots[0], &slots[3]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, oseo_null());
        slots[4] = result.value;
    }
    double index = 0.0;
    if (result.status == OSEO_STATUS_NORMAL && direct_string) {
        /*
         * The separate String iterator node has not materialized an
         * iterator object yet. Preserve its default code-point iteration
         * here, just as Array.from does, without changing indexed String
         * properties or exposing that later node's public surface.
         */
        size_t offset = 0u;
        while (result.status == OSEO_STATUS_NORMAL) {
            OseoString *source = string_object(slots[8]);
            if (offset >= source->length) break;
            size_t element_length =
                object_string_element_length(source, offset);
            result = oseo_string_from_units(
                context,
                &source->units[offset],
                element_length
            );
            slots[5] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = object_add_grouped_value(context, slots, index);
            }
            offset += element_length;
            index += 1.0;
        }
    }
    bool done = false;
    while (result.status == OSEO_STATUS_NORMAL && !direct_string && !done) {
        result = oseo_iterator_next(
            context, slots[2], slots[3], &slots[5], &done);
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        if (index >= 9007199254740991.0) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "Object.groupBy index is too large."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = object_add_grouped_value(context, slots, index);
        }
        if (result.status != OSEO_STATUS_NORMAL) {
            result = object_close_after_abrupt(context, slots[2], result);
        }
        index += 1.0;
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[4];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Object.getOwnPropertyDescriptors (20.1.2.9). ToObject runs before
 * anything else, so a nullish argument throws and a primitive is
 * reported through the wrapper object it converts to, including a
 * String wrapper's index and `length` properties. Every own key the
 * conversion result reports contributes one FromPropertyDescriptor
 * object, created as a writable, enumerable, configurable data property
 * of an ordinary object.
 */
static OseoResult object_get_own_property_descriptors(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (is_nullish(value)) {
        return type_error(
            context,
            "Cannot convert a nullish value to an object."
        );
    }
    OseoResult converted = oseo_internal_to_object(context, value);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    size_t key_count = 0u;
    /* The key frame roots the conversion result, the reported object,
     * the one synthesized key string, and the whole key snapshot. The
     * descriptor frame is the four-slot scratch every
     * FromPropertyDescriptor call reuses. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = normal(oseo_undefined());
    if (is_proxy(converted.value)) {
        result = proxy_own_key_frame(
            context, converted.value, &frame, &key_count);
    } else {
        key_count = own_key_count(converted.value);
        if (key_count > SIZE_MAX - 3u) {
            return failure(
                context, "OSEO2001", "Own-key snapshot is too large.");
        }
        result = oseo_roots_allocate(context, &frame, key_count + 3u);
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = converted.value;
    OseoRootFrame descriptor = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &descriptor, 4u);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    if (!is_proxy(frame.slots[0])) {
        result = snapshot_own_keys(context, &frame, key_count);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_literal_create(context);
        frame.slots[1] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < key_count;
         index += 1u) {
        OseoValue key = frame.slots[3u + index];
        OseoValue own = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        bool exists = false;
        if (is_proxy(frame.slots[0])) {
            result = oseo_internal_proxy_get_own_property(
                context,
                frame.slots[0],
                key,
                &exists,
                &own,
                &attributes,
                &getter,
                &setter
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        } else {
            exists = oseo_internal_own_property_descriptor(
                context,
                frame.slots[0],
                key,
                &own,
                &attributes,
                &getter,
                &setter
            );
        }
        if (!exists) continue;
        descriptor.slots[2] = attributes.accessor ? getter : own;
        descriptor.slots[3] = setter;
        if (oseo_internal_cell_backed_property(frame.slots[0], own)) {
            result = oseo_cell_get(context, own);
            descriptor.slots[2] = result.value;
            if (result.status != OSEO_STATUS_NORMAL) break;
        }
        result = from_property_descriptor(context, &descriptor, attributes);
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[1],
            key,
            descriptor.slots[0],
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &descriptor);
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Object.defineProperties (20.1.2.3) over ObjectDefineProperties
 * (20.1.2.3.1). The target check precedes every read of the properties
 * argument, and ToObject runs before the own-key walk, so a nullish
 * properties argument throws and a primitive is read through the
 * wrapper it converts to, including a String wrapper's index
 * properties. The walk visits ordinary own keys in order and keeps the
 * own enumerable ones, reading each descriptor with Get so an accessor
 * runs, and converts every descriptor through one ToPropertyDescriptor
 * body before the first definition mutates the target. An abrupt
 * completion while collecting therefore leaves the target untouched,
 * while an abrupt definition keeps every definition that preceded it.
 */
static OseoResult object_define_properties(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Object.defineProperties requires an object target."
        );
    }
    OseoResult converted = oseo_internal_to_object(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    size_t key_count = 0u;
    /* The key frame roots the properties object, the target, the one
     * synthesized key string, and the whole key snapshot. The collected
     * frame holds four slots per collected descriptor, in the order
     * key, value, getter, setter, and one final slot that roots each
     * descriptor object while its fields are read. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = normal(oseo_undefined());
    if (is_proxy(converted.value)) {
        result = proxy_own_key_frame(
            context, converted.value, &frame, &key_count);
    } else {
        key_count = own_key_count(converted.value);
        if (key_count > SIZE_MAX - 3u) {
            return failure(
                context, "OSEO2001", "Own-key snapshot is too large.");
        }
        result = oseo_roots_allocate(context, &frame, key_count + 3u);
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (key_count > (SIZE_MAX - 1u) / 4u) {
        oseo_roots_release(context, &frame);
        return failure(
            context, "OSEO2001", "Own-key snapshot is too large.");
    }
    frame.slots[0] = converted.value;
    frame.slots[1] = object_value;
    OseoRootFrame collected_frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(
        context,
        &collected_frame,
        4u * key_count + 1u
    );
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoConvertedDescriptor *records = NULL;
    if (key_count > 0u) {
        records = malloc(key_count * sizeof(*records));
        if (records == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Descriptor collection allocation failed."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_proxy(frame.slots[0])) {
        result = snapshot_own_keys(context, &frame, key_count);
    }
    size_t collected = 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < key_count;
         index += 1u) {
        OseoValue key = frame.slots[3u + index];
        OseoValue ignored = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue ignored_getter = oseo_undefined();
        OseoValue ignored_setter = oseo_undefined();
        /* A getter an earlier key ran may have removed this key or made
         * it non-enumerable, so the descriptor is re-read per key. */
        bool exists = false;
        if (is_proxy(frame.slots[0])) {
            result = oseo_internal_proxy_get_own_property(
                context,
                frame.slots[0],
                key,
                &exists,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        } else {
            exists = oseo_internal_own_property_descriptor(
                context,
                frame.slots[0],
                key,
                &ignored,
                &attributes,
                &ignored_getter,
                &ignored_setter
            );
        }
        if (!exists || !attributes.enumerable) {
            continue;
        }
        result = oseo_object_get(context, frame.slots[0], key);
        collected_frame.slots[4u * key_count] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (!is_object(result.value)) {
            result = type_error(
                context,
                "A property descriptor must be an object."
            );
            break;
        }
        OseoValue *slots = &collected_frame.slots[4u * collected];
        slots[0] = key;
        result = oseo_internal_to_property_descriptor(
            context,
            collected_frame.slots[4u * key_count],
            &slots[1],
            &slots[2],
            &slots[3],
            &records[collected]
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        collected += 1u;
    }
    const char *refusal = NULL;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < collected;
         index += 1u) {
        OseoValue *slots = &collected_frame.slots[4u * index];
        result = oseo_internal_define_converted_property(
            context,
            frame.slots[1],
            slots[0],
            &records[index],
            slots[1],
            slots[2],
            slots[3],
            &refusal
        );
        if (result.status == OSEO_STATUS_NORMAL && refusal != NULL) {
            result = type_error(context, refusal);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    free(records);
    oseo_roots_release(context, &collected_frame);
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_builtin_keys(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return object_enumerable_own_properties(
        context, argument_count, arguments, OSEO_ENUMERABLE_KEYS);
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
