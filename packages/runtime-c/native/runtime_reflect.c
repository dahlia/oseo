#include "runtime_internal.h"

#include <string.h>

/*
 * The Reflect namespace object of 28.1: the thirteen function
 * properties that expose one essential internal method each, and the
 * @@toStringTag value property. Reflect is an ordinary object, not a
 * function, so it has neither [[Call]] nor [[Construct]], and its
 * function properties are ordinary built-in functions that are not
 * constructors either.
 *
 * Every function here requires an object target and reports the
 * specification's boolean instead of raising the language error the
 * matching `Object` static raises. The refusal rules stay in the
 * descriptor, property, and object components, which report a refusal
 * through a message the throwing forms turn back into a TypeError.
 */

/*
 * One Reflect function property. The array order is the order the
 * namespace object creates its properties in and the order the code IDs
 * count down from `OSEO_REFLECT_FUNCTION_CODE_ID_LAST`, so an entry's
 * index is the only identity the builder and the dispatcher share.
 */
typedef enum {
    OSEO_REFLECT_APPLY = 0,
    OSEO_REFLECT_CONSTRUCT = 1,
    OSEO_REFLECT_DEFINE_PROPERTY = 2,
    OSEO_REFLECT_DELETE_PROPERTY = 3,
    OSEO_REFLECT_GET = 4,
    OSEO_REFLECT_GET_OWN_PROPERTY_DESCRIPTOR = 5,
    OSEO_REFLECT_GET_PROTOTYPE_OF = 6,
    OSEO_REFLECT_HAS = 7,
    OSEO_REFLECT_IS_EXTENSIBLE = 8,
    OSEO_REFLECT_OWN_KEYS = 9,
    OSEO_REFLECT_PREVENT_EXTENSIONS = 10,
    OSEO_REFLECT_SET = 11,
    OSEO_REFLECT_SET_PROTOTYPE_OF = 12,
} OseoReflectOperation;

typedef struct {
    const char *name;
    size_t length;
} OseoReflectFunction;

static const OseoReflectFunction reflect_functions[] = {
    {"apply", 3u},
    {"construct", 2u},
    {"defineProperty", 3u},
    {"deleteProperty", 2u},
    {"get", 2u},
    {"getOwnPropertyDescriptor", 2u},
    {"getPrototypeOf", 1u},
    {"has", 2u},
    {"isExtensible", 1u},
    {"ownKeys", 1u},
    {"preventExtensions", 1u},
    {"set", 3u},
    {"setPrototypeOf", 2u},
};

_Static_assert(
    sizeof(reflect_functions) / sizeof(reflect_functions[0]) ==
        OSEO_REFLECT_FUNCTION_COUNT,
    "The Reflect function table must match its reviewed code-ID range."
);

static OseoValue reflect_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

/*
 * The shared first step of every Reflect function but `apply` and
 * `construct`: a target that is not an object is a TypeError rather
 * than a coercion or a `false` result. `reflect_call` applies it once
 * for all eleven, so no individual body repeats it.
 */
static OseoResult reflect_object_target(
    OseoContext *context,
    OseoValue target
) {
    if (is_object(target)) return normal(target);
    return type_error(context, "A Reflect target must be an object.");
}

/* Reflect.apply(target, thisArgument, argumentsList). */
static OseoResult reflect_apply(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    if (!is_function(target)) {
        return type_error(context, "Reflect.apply requires a callable target.");
    }
    OseoValue slots[4] = {
        target,
        reflect_argument(argument_count, arguments, 1u),
        reflect_argument(argument_count, arguments, 2u),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_like_list(
        context,
        slots[2],
        &slots[3]
    );
    size_t forwarded_count = 0u;
    const OseoValue *forwarded = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context,
            slots[3],
            &forwarded_count,
            &forwarded
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[0],
            slots[1],
            forwarded_count,
            forwarded,
            oseo_undefined()
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetPrototypeFromConstructor over the new target `target.[[Construct]]`
 * actually receives. A bound function's [[Construct]] replaces the new
 * target with its own target whenever the two are the same function, and
 * it repeats that at every layer of a bound chain, so the effective new
 * target is found by walking the target's bound chain and unwrapping
 * only while it still names the new target.
 *
 * The prototype itself is read differently for the two kinds of
 * constructor, which is decided by the innermost bound target, because
 * that is the function whose clause defines the [[Construct]] this
 * reaches. An ordinary or class constructor runs
 * OrdinaryCreateFromConstructor before its body, so reading
 * `prototype` here is at the specified position and the read is a real
 * Get: a bound function has no own `prototype`, so a program can define
 * an accessor one on it and observe it. A built-in constructor performs
 * OrdinaryCreateFromConstructor at its own position, after the argument
 * validation its clause specifies, so this reads only the synthetic
 * `prototype` slot and leaves the observable Get to the component that
 * owns the constructor.
 */
static OseoResult reflect_new_target_prototype(
    OseoContext *context,
    OseoValue target,
    OseoValue new_target
) {
    OseoValue effective = new_target;
    OseoValue constructor = target;
    while (is_function(constructor) &&
           function_object(constructor)->function_kind ==
               OSEO_FUNCTION_BOUND) {
        if (constructor == effective) {
            effective = function_object(constructor)->bound_target;
        }
        constructor = function_object(constructor)->bound_target;
    }
    size_t code_id = 0u;
    OseoResult identified = oseo_function_code_id(
        context,
        constructor,
        &code_id
    );
    if (identified.status != OSEO_STATUS_NORMAL) return identified;
    if (oseo_internal_builtin_code_id(code_id)) {
        return normal(
            function_has_prototype_property(effective)
                ? function_object(effective)->prototype_object
                : oseo_undefined()
        );
    }
    OseoValue slots[2] = {effective, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "prototype");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.construct(target, argumentsList [, newTarget]). */
static OseoResult reflect_construct(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    if (!function_is_constructible(target)) {
        return type_error(
            context,
            "Reflect.construct requires a constructor target."
        );
    }
    OseoValue new_target = argument_count > 2u ? arguments[2] : target;
    if (!function_is_constructible(new_target)) {
        return type_error(
            context,
            "Reflect.construct requires a constructor new target."
        );
    }
    /*
     * Slots: 0 target, 1 new target, 2 the array-like source, 3 the
     * collected argument list, 4 the receiver OrdinaryCreateFromConstructor
     * builds from the new target's `prototype`.
     */
    OseoValue slots[5] = {
        target,
        new_target,
        reflect_argument(argument_count, arguments, 1u),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_like_list(
        context,
        slots[2],
        &slots[3]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        /* A `prototype` accessor can return a fresh object, so the read
         * lands in a rooted slot before the receiver allocation. */
        result = reflect_new_target_prototype(context, slots[0], slots[1]);
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_receiver(context, slots[4]);
        slots[4] = result.value;
    }
    size_t forwarded_count = 0u;
    const OseoValue *forwarded = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context,
            slots[3],
            &forwarded_count,
            &forwarded
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[0],
            slots[4],
            forwarded_count,
            forwarded,
            slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_result(context, result.value, slots[4]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.defineProperty(target, propertyKey, attributes). */
static OseoResult reflect_define_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoValue slots[3] = {
        target,
        reflect_argument(argument_count, arguments, 2u),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(
        context,
        reflect_argument(argument_count, arguments, 1u)
    );
    slots[2] = result.value;
    const char *refusal = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_define_from_descriptor(
            context,
            slots[0],
            slots[2],
            slots[1],
            &refusal
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_boolean(refusal == NULL));
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.deleteProperty(target, propertyKey). */
static OseoResult reflect_delete_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoValue slots[2] = {target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(
        context,
        reflect_argument(argument_count, arguments, 1u)
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        /* The non-strict delete is the one that reports the
         * specification's boolean instead of raising a TypeError. */
        result = oseo_object_delete(context, slots[0], slots[1], false);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.get(target, propertyKey [, receiver]). */
static OseoResult reflect_get(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoValue slots[3] = {
        target,
        argument_count > 2u ? arguments[2] : target,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(
        context,
        reflect_argument(argument_count, arguments, 1u)
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_super_get(context, slots[0], slots[2], slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.set(target, propertyKey, V [, receiver]). */
static OseoResult reflect_set(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoValue slots[4] = {
        target,
        reflect_argument(argument_count, arguments, 2u),
        argument_count > 3u ? arguments[3] : target,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_property_key(
        context,
        reflect_argument(argument_count, arguments, 1u)
    );
    slots[3] = result.value;
    const char *refusal = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_set_with_receiver(
            context,
            slots[0],
            slots[3],
            slots[1],
            slots[2],
            &refusal
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_boolean(refusal == NULL));
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* Reflect.setPrototypeOf(target, proto). */
static OseoResult reflect_set_prototype_of(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoValue prototype = reflect_argument(argument_count, arguments, 1u);
    if (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype)) {
        return type_error(
            context,
            "Reflect.setPrototypeOf requires an object or null prototype."
        );
    }
    const char *refusal = NULL;
    OseoResult result = oseo_internal_set_prototype_reported(
        context,
        target,
        prototype,
        &refusal
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(refusal == NULL));
}

static OseoResult reflect_call(
    OseoContext *context,
    size_t operation,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (operation == OSEO_REFLECT_APPLY) {
        return reflect_apply(context, argument_count, arguments);
    }
    if (operation == OSEO_REFLECT_CONSTRUCT) {
        return reflect_construct(context, argument_count, arguments);
    }
    /* The eleven remaining functions share one first step: an object
     * target, checked before any key or descriptor conversion. */
    OseoValue target = reflect_argument(argument_count, arguments, 0u);
    OseoResult checked = reflect_object_target(context, target);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    switch (operation) {
        case OSEO_REFLECT_DEFINE_PROPERTY:
            return reflect_define_property(context, argument_count, arguments);
        case OSEO_REFLECT_DELETE_PROPERTY:
            return reflect_delete_property(context, argument_count, arguments);
        case OSEO_REFLECT_GET:
            return reflect_get(context, argument_count, arguments);
        case OSEO_REFLECT_SET:
            return reflect_set(context, argument_count, arguments);
        case OSEO_REFLECT_SET_PROTOTYPE_OF:
            return reflect_set_prototype_of(
                context,
                argument_count,
                arguments
            );
        case OSEO_REFLECT_GET_OWN_PROPERTY_DESCRIPTOR:
            return oseo_object_builtin_get_own_property_descriptor(
                context,
                argument_count,
                arguments
            );
        case OSEO_REFLECT_GET_PROTOTYPE_OF:
            return normal(ordinary_object(target)->prototype);
        case OSEO_REFLECT_HAS: {
            OseoValue slots[2] = {target, oseo_undefined()};
            OseoRootFrame frame = {NULL, slots, 2u};
            oseo_roots_push(context, &frame);
            OseoResult result = oseo_property_key(
                context,
                reflect_argument(argument_count, arguments, 1u)
            );
            slots[1] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_has_property(context, slots[1], slots[0]);
            }
            oseo_roots_pop(context, &frame);
            return result;
        }
        case OSEO_REFLECT_IS_EXTENSIBLE:
            return normal(oseo_boolean(ordinary_object(target)->extensible));
        case OSEO_REFLECT_OWN_KEYS:
            return oseo_internal_own_key_array(
                context,
                target,
                OSEO_OWN_KEY_ALL
            );
        case OSEO_REFLECT_PREVENT_EXTENSIONS:
            /* OrdinaryPreventExtensions never refuses, so the reported
             * boolean is always true. */
            ordinary_object(target)->extensible = false;
            return normal(oseo_boolean(true));
        default: break;
    }
    return failure(context, "OSEO2001", "Unknown Reflect operation.");
}

OseoResult oseo_internal_reflect_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    if (code_id < OSEO_REFLECT_FUNCTION_CODE_ID_FIRST ||
        code_id > OSEO_REFLECT_FUNCTION_CODE_ID_LAST) {
        return oseo_unknown_function(context, code_id);
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return type_error(context, "Reflect method is not a constructor.");
    }
    size_t operation = OSEO_REFLECT_FUNCTION_CODE_ID_LAST - code_id;
    return reflect_call(context, operation, argument_count, arguments);
}

/* One Reflect function property, created without a `prototype`. */
static OseoResult create_reflect_function(
    OseoContext *context,
    size_t operation
) {
    const OseoReflectFunction *entry = &reflect_functions[operation];
    size_t name_length = strlen(entry->name);
    uint16_t units[32];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)entry->name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_REFLECT_FUNCTION_CODE_ID_LAST - operation,
            environment,
            units,
            name_length,
            entry->length,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_reflect_property(
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

OseoResult oseo_internal_reflect_intrinsic(OseoContext *context) {
    OseoValue *slot = &context->intrinsics[OSEO_INTRINSIC_REFLECT];
    if (is_object(*slot)) return normal(*slot);
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
        *slot = frame.slots[0];
    }
    static const OseoPropertyAttributes method_attributes =
        {true, false, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_REFLECT_FUNCTION_COUNT;
         index += 1u) {
        result = create_reflect_function(context, index);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_ascii_string(
            context,
            reflect_functions[index].name
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_reflect_property(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            method_attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Reflect");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_reflect_property(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        *slot = oseo_undefined();
    } else if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(*slot) : result;
}

OseoResult oseo_internal_install_reflect_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_reflect_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Reflect");
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
