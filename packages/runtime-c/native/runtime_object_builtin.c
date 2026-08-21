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
    if (function_has_prototype_property(receiver) &&
        oseo_internal_string_is_ascii(key.value, "prototype")) {
        return normal(oseo_boolean(false));
    }
    if (is_array(receiver) &&
        oseo_internal_string_is_ascii(key.value, "length")) {
        return normal(oseo_boolean(false));
    }
    OseoValue ignored = oseo_undefined();
    OseoValue ignored_getter = oseo_undefined();
    OseoValue ignored_setter = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    bool own = oseo_internal_own_descriptor(
        receiver,
        key.value,
        &ignored,
        &attributes,
        &ignored_getter,
        &ignored_setter
    );
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
    OseoValue current = ordinary_object(value)->prototype;
    while (is_object(current)) {
        if (current == receiver) return normal(oseo_boolean(true));
        current = ordinary_object(current)->prototype;
    }
    return normal(oseo_boolean(false));
}

static const char *object_builtin_tag(OseoValue receiver) {
    if (is_array(receiver)) return "Array";
    if (is_regexp(receiver)) return "RegExp";
    if (is_function(receiver)) return "Function";
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
    if (
        (is_function(receiver) &&
         (function_object(receiver)->function_kind == OSEO_FUNCTION_GENERATOR ||
          function_object(receiver)->function_kind ==
              OSEO_FUNCTION_ASYNC_GENERATOR)) ||
        is_generator(receiver)
    ) {
        return failure(
            context,
            "OSEO2001",
            "Generator intrinsic reflection is not admitted yet."
        );
    }
    const char *fallback = object_builtin_tag(receiver);
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
    if (result.status == OSEO_STATUS_NORMAL && !is_function(frame.slots[2])) {
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

static OseoResult object_constructor(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED && new_target != callee) {
        return normal(receiver);
    }
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (!is_nullish(value)) return oseo_internal_to_object(context, value);
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) return normal(receiver);
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
    if (
        (is_function(object.value) &&
         (function_object(object.value)->function_kind ==
              OSEO_FUNCTION_GENERATOR ||
          function_object(object.value)->function_kind ==
              OSEO_FUNCTION_ASYNC_GENERATOR)) ||
        is_generator(object.value)
    ) {
        return failure(
            context,
            "OSEO2001",
            "Generator intrinsic reflection is not admitted yet."
        );
    }
    return normal(ordinary_object(object.value)->prototype);
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
static bool object_test_integrity_level(OseoValue value, bool frozen) {
    OseoOrdinaryObject *object = ordinary_object(value);
    if (object->extensible) return false;
    if (frozen && is_array(value) && object->length_writable) return false;
    if (frozen && function_has_prototype_property(value) &&
        function_object(value)->prototype_writable) return false;
    if (object->virtual_string_iterator &&
        (object->virtual_string_iterator_configurable ||
         (frozen && object->virtual_string_iterator_writable))) {
        return false;
    }
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        OseoPropertyAttributes attributes =
            object->properties[index].attributes;
        if (attributes.configurable ||
            (frozen && !attributes.accessor && attributes.writable)) {
            return false;
        }
    }
    return true;
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
    size_t argument_count,
    const OseoValue *arguments,
    bool frozen
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    return normal(oseo_boolean(
        !is_object(value) || object_test_integrity_level(value, frozen)
    ));
}

static OseoResult object_is_extensible(
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    return normal(oseo_boolean(
        is_object(value) && ordinary_object(value)->extensible
    ));
}

static OseoResult object_prevent_extensions(
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = builtin_argument(argument_count, arguments, 0u);
    if (is_object(value)) ordinary_object(value)->extensible = false;
    return normal(value);
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
            receiver,
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
    if (code_id == OSEO_OBJECT_DEFERRED_STATIC_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Object static method is not admitted in this M5b node."
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
        return object_is_extensible(argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_IS_FROZEN_CODE_ID) {
        return object_integrity_query(argument_count, arguments, true);
    }
    if (code_id == OSEO_OBJECT_IS_SEALED_CODE_ID) {
        return object_integrity_query(argument_count, arguments, false);
    }
    if (code_id == OSEO_OBJECT_PREVENT_EXTENSIONS_CODE_ID) {
        return object_prevent_extensions(argument_count, arguments);
    }
    if (code_id == OSEO_OBJECT_SEAL_CODE_ID) {
        return object_integrity_transition(
            context, argument_count, arguments, false);
    }
    if (code_id == OSEO_OBJECT_KEYS_CODE_ID) {
        return oseo_object_builtin_keys(context, argument_count, arguments);
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
        OSEO_OBJECT_CREATE_CODE_ID,
        OSEO_OBJECT_DEFINE_PROPERTIES_CODE_ID,
        OSEO_OBJECT_DEFINE_PROPERTY_CODE_ID,
        OSEO_OBJECT_FREEZE_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR_CODE_ID,
        OSEO_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS_CODE_ID,
        OSEO_OBJECT_IS_EXTENSIBLE_CODE_ID,
        OSEO_OBJECT_IS_FROZEN_CODE_ID,
        OSEO_OBJECT_IS_SEALED_CODE_ID,
        OSEO_OBJECT_KEYS_CODE_ID,
        OSEO_OBJECT_PREVENT_EXTENSIONS_CODE_ID,
        OSEO_OBJECT_SEAL_CODE_ID,
    };
    static const char *const owned_static_names[] = {
        "create",
        "defineProperties",
        "defineProperty",
        "freeze",
        "getOwnPropertyDescriptor",
        "getOwnPropertyDescriptors",
        "isExtensible",
        "isFrozen",
        "isSealed",
        "keys",
        "preventExtensions",
        "seal",
    };
    static const size_t owned_static_lengths[] = {
        2u, 2u, 3u, 1u, 2u, 1u, 1u, 1u, 1u, 1u, 1u, 1u,
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
    static const char *const deferred_static_names[] = {
        "assign",
        "entries",
        "fromEntries",
        "getOwnPropertyNames",
        "getOwnPropertySymbols",
        "groupBy",
        "hasOwn",
        "values",
    };
    static const size_t deferred_static_lengths[] = {
        2u, 1u, 1u, 1u, 1u, 2u, 2u, 1u,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index <
                 sizeof(deferred_static_names) /
                     sizeof(*deferred_static_names);
         index += 1u) {
        result = create_object_prototype_function(
            context,
            OSEO_OBJECT_DEFERRED_STATIC_CODE_ID,
            deferred_static_names[index],
            deferred_static_lengths[index]
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(
                context,
                deferred_static_names[index]
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
            ? oseo_internal_string_own_property(frame.slots[0], key, NULL)
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

/*
 * The presence flags and converted attribute fields of one
 * ToPropertyDescriptor result. The `value`, `get`, and `set` fields are
 * heap values, so they stay in caller-rooted slots rather than in this
 * record; ToBoolean runs no user code, so the three attribute fields
 * hold their converted results directly.
 */
typedef struct {
    bool has_enumerable;
    bool enumerable;
    bool has_configurable;
    bool configurable;
    bool has_writable;
    bool writable;
    bool has_value;
    bool has_getter;
    bool has_setter;
} OseoConvertedDescriptor;

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
static OseoResult to_property_descriptor(
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
        !is_function(*getter_slot)) {
        return type_error(context, "A property descriptor 'get' field must "
            "be undefined or callable.");
    }
    result = descriptor_field(
        context, descriptor_value, "set",
        &descriptor->has_setter, setter_slot);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (descriptor->has_setter &&
        tag_of(*setter_slot) != OSEO_TAG_UNDEFINED &&
        !is_function(*setter_slot)) {
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
static OseoResult define_converted_property(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    OseoValue getter,
    OseoValue setter
) {
    OseoValue current_value = oseo_undefined();
    OseoPropertyAttributes current_attributes = {false, false, false, false};
    OseoValue current_getter = oseo_undefined();
    OseoValue current_setter = oseo_undefined();
    bool exists = oseo_internal_own_descriptor(
        object_value,
        key,
        &current_value,
        &current_attributes,
        &current_getter,
        &current_setter
    );
    if (!exists) {
        exists = oseo_internal_virtual_string_iterator_descriptor(
            context,
            object_value,
            key,
            &current_attributes
        );
    }
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
        return oseo_object_define_accessor(
            context,
            object_value,
            key,
            descriptor->has_getter ? getter : oseo_undefined(),
            descriptor->has_setter ? setter : oseo_undefined(),
            descriptor->has_getter,
            descriptor->has_setter,
            attributes
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
    return oseo_internal_object_define_data(
        context,
        object_value,
        key,
        descriptor->has_value ? value : current_value,
        attributes,
        descriptor->has_value
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
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Object.defineProperty requires an object target."
        );
    }
    /* Slots: 0 key, 1 value, 2 get, 3 set. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
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
    OseoConvertedDescriptor descriptor;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = to_property_descriptor(
            context,
            descriptor_value,
            &frame.slots[1],
            &frame.slots[2],
            &frame.slots[3],
            &descriptor
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_converted_property(
            context,
            object_value,
            frame.slots[0],
            &descriptor,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3]
        );
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
 * Two own properties are not in the property vector: an array's
 * `length` and a function's `prototype`. An array's `length` is created
 * before any property a program can add, so it leads the array's string
 * keys. A function's `prototype` follows the leading string keys its
 * `prototype_key_position` still counts. Slot 0 of `frame` holds the
 * object, slot 2 holds whichever of those two key strings this object
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
    /* No allocation happens from here to the end of the symbol pass, so
     * the property vector cannot move under these two loops. */
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
    size_t virtual_count = is_array(converted.value) ||
        function_has_prototype_property(converted.value) ? 1u : 0u;
    size_t property_count = ordinary_object(converted.value)->property_count;
    if (property_count > SIZE_MAX - 3u - virtual_count) {
        return failure(context, "OSEO2001", "Own-key snapshot is too large.");
    }
    size_t key_count = property_count + virtual_count;
    /* The key frame roots the conversion result, the reported object,
     * the one synthesized key string, and the whole key snapshot. The
     * descriptor frame is the four-slot scratch every
     * FromPropertyDescriptor call reuses. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, key_count + 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = converted.value;
    OseoRootFrame descriptor = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &descriptor, 4u);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    result = snapshot_own_keys(context, &frame, key_count);
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
        if (!oseo_internal_own_descriptor(
                frame.slots[0],
                key,
                &own,
                &attributes,
                &getter,
                &setter
            )) continue;
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
    size_t virtual_count = is_array(converted.value) ||
        function_has_prototype_property(converted.value) ? 1u : 0u;
    size_t property_count = ordinary_object(converted.value)->property_count;
    if (property_count > SIZE_MAX - 3u - virtual_count ||
        property_count + virtual_count > (SIZE_MAX - 1u) / 4u) {
        return failure(context, "OSEO2001", "Own-key snapshot is too large.");
    }
    size_t key_count = property_count + virtual_count;
    /* The key frame roots the properties object, the target, the one
     * synthesized key string, and the whole key snapshot. The collected
     * frame holds four slots per collected descriptor, in the order
     * key, value, getter, setter, and one final slot that roots each
     * descriptor object while its fields are read. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, key_count + 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
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
    if (result.status == OSEO_STATUS_NORMAL) {
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
        if (!oseo_internal_own_descriptor(
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
        result = to_property_descriptor(
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
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < collected;
         index += 1u) {
        OseoValue *slots = &collected_frame.slots[4u * index];
        result = define_converted_property(
            context,
            frame.slots[1],
            slots[0],
            &records[index],
            slots[1],
            slots[2],
            slots[3]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    free(records);
    oseo_roots_release(context, &collected_frame);
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
    OseoResult result = oseo_internal_ascii_string(context, index_text);
    frame->slots[1] = result.value;
    frame->slots[2] = key;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_define(
        context,
        frame->slots[0],
        frame->slots[1],
        frame->slots[2],
        (OseoPropertyAttributes){true, true, true, false}
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
            result = oseo_internal_ascii_string(context, key_text);
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
                !oseo_internal_array_index(property->key, &number) ||
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
            oseo_internal_array_index(property->key, &ignored)) continue;
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
