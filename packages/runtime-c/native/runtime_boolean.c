#include "runtime_internal.h"

#include <string.h>

/* Boolean constructor, prototype methods, and branded wrapper objects. */

static OseoResult boolean_this_value(
    OseoContext *context,
    OseoValue receiver
) {
    if (tag_of(receiver) == OSEO_TAG_BOOLEAN) return normal(receiver);
    if (is_object(receiver) &&
        ordinary_object(receiver)->primitive_data &&
        tag_of(ordinary_object(receiver)->primitive_value) ==
            OSEO_TAG_BOOLEAN) {
        return normal(ordinary_object(receiver)->primitive_value);
    }
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Boolean method requires a Boolean receiver."
    );
}

static OseoResult boolean_construct(
    OseoContext *context,
    OseoValue new_target,
    size_t argument_count,
    const OseoValue *arguments,
    bool constructing
) {
    OseoValue data = oseo_boolean(
        argument_count > 0u && oseo_to_boolean(arguments[0])
    );
    if (!constructing) return normal(data);

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
                OSEO_INTRINSIC_BOOLEAN_PROTOTYPE
            );
        }
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *object = ordinary_object(result.value);
        object->primitive_data = true;
        object->primitive_value = data;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult boolean_to_string(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult result = boolean_this_value(context, receiver);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    const char *text = oseo_to_boolean(result.value) ? "true" : "false";
    return oseo_internal_ascii_string(context, text);
}

OseoResult oseo_internal_boolean_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_BOOLEAN_CONSTRUCTOR_CODE_ID) {
        return boolean_construct(
            context,
            new_target,
            argument_count,
            arguments,
            tag_of(new_target) != OSEO_TAG_UNDEFINED
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Boolean method is not a constructor."
        );
    }
    if (code_id == OSEO_BOOLEAN_TO_STRING_CODE_ID) {
        return boolean_to_string(context, receiver);
    }
    if (code_id == OSEO_BOOLEAN_VALUE_OF_CODE_ID) {
        return boolean_this_value(context, receiver);
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_boolean_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind
) {
    size_t name_length = strlen(name);
    uint16_t units[16];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Boolean function name is long.");
    }
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

static OseoResult define_boolean_property(
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

OseoResult oseo_internal_boolean_intrinsic(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_BOOLEAN_VALUE_OF];
    if (is_function(*marker)) {
        return normal(context->intrinsics[OSEO_INTRINSIC_BOOLEAN]);
    }
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;

    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *prototype = ordinary_object(frame.slots[0]);
        prototype->primitive_data = true;
        prototype->primitive_value = oseo_boolean(false);
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN_PROTOTYPE] = frame.slots[0];
        result = create_boolean_function(
            context,
            OSEO_BOOLEAN_CONSTRUCTOR_CODE_ID,
            "Boolean",
            1u,
            OSEO_FUNCTION_ORDINARY
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_boolean_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const OseoIntrinsic intrinsics[] = {
        OSEO_INTRINSIC_BOOLEAN_TO_STRING,
        OSEO_INTRINSIC_BOOLEAN_VALUE_OF,
    };
    static const size_t codes[] = {
        OSEO_BOOLEAN_TO_STRING_CODE_ID,
        OSEO_BOOLEAN_VALUE_OF_CODE_ID,
    };
    static const char *const names[] = {"toString", "valueOf"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_boolean_function(
            context,
            codes[index],
            names[index],
            0u,
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[intrinsics[index]] = frame.slots[2];
            result = define_boolean_property(
                context,
                frame.slots[0],
                names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])
            ->primitive_wrapper_methods_initialized = true;
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN_PROTOTYPE] =
            oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN] = oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN_TO_STRING] =
            oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_BOOLEAN_VALUE_OF] =
            oseo_undefined();
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(context->intrinsics[OSEO_INTRINSIC_BOOLEAN])
        : result;
}

OseoResult oseo_internal_install_boolean_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_boolean_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_boolean_property(
            context,
            slots[0],
            "Boolean",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
