#include "runtime_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * The `Object` built-ins, the `Object.prototype` methods, and the own-key
 * operations they share with object rest and spread: ToPropertyDescriptor,
 * CopyDataProperties, own-key ordering, and the `Object.create`,
 * `Object.defineProperty`, `Object.getOwnPropertyDescriptor`,
 * `Object.keys`, and `Object.setPrototypeOf` entry points.
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
    if (is_function(receiver)) return "Function";
    if (is_object(receiver) && ordinary_object(receiver)->arguments_object) {
        return "Arguments";
    }
    if (is_object(receiver) && ordinary_object(receiver)->error_data) {
        return "Error";
    }
    if (is_string(receiver)) return "String";
    if (is_symbol(receiver)) return "Symbol";
    if (is_bigint(receiver)) return "BigInt";
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
    const char *fallback = object_builtin_tag(receiver);
    if (!is_object(receiver)) {
        return object_tag_text(context, oseo_undefined(), fallback);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_TO_STRING_TAG
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = object_tag_text(context, frame.slots[2], fallback);
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
    if (!is_object(receiver)) {
        return is_symbol(receiver)
            ? oseo_internal_symbol_text(context, receiver)
            : oseo_internal_value_string(context, receiver);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = oseo_internal_ascii_string(context, "toString");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(frame.slots[1])) {
        result = type_error(context, "The toString property is not callable.");
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[1],
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
    if (is_nullish(receiver)) {
        return type_error(context, "Cannot convert a nullish value to object.");
    }
    if (!is_object(receiver)) {
        return failure(
            context,
            "OSEO2001",
            "Primitive wrapper objects are not admitted yet."
        );
    }
    return normal(receiver);
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
    (void)callee;
    (void)new_target;
    if (code_id == OSEO_OBJECT_CONSTRUCTOR_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Object constructor behavior is not admitted yet."
        );
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
        &context->intrinsics[OSEO_INTRINSIC_OBJECT_VALUE_OF];
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
        if (result.status == OSEO_STATUS_NORMAL) *marker = result.value;
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
        result = oseo_roots_allocate(context, &frame, 2u);
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
    /* A descriptor with no value field keeps the property's current
     * value, which a cell-backed property holds in its binding cell. */
    if (exists &&
        oseo_internal_cell_backed_property(object_value, current_value)) {
        result = oseo_cell_get(context, current_value);
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
        current_value = result.value;
    }
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
        result = oseo_object_literal_create(context);
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
    OseoResult result = oseo_internal_ascii_string(context, index_text);
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
