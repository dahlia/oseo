#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static OseoResult iterator_from(
    OseoContext *context,
    OseoValue value
);
static OseoResult wrap_for_valid_iterator_next(
    OseoContext *context,
    OseoValue receiver
);
static OseoResult wrap_for_valid_iterator_return(
    OseoContext *context,
    OseoValue receiver
);
static OseoResult iterator_prototype_accessor(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult iterator_helper_method(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult iterator_helper_resume(
    OseoContext *context,
    OseoValue receiver
);
static OseoResult iterator_helper_return(
    OseoContext *context,
    OseoValue receiver
);

OseoResult oseo_internal_iterator_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (code_id == OSEO_ITERATOR_CONSTRUCTOR_CODE_ID) {
        if (tag_of(new_target) == OSEO_TAG_UNDEFINED || new_target == callee) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Iterator must be constructed through a derived class."
            );
        }
        return normal(receiver);
    }
    if (code_id == OSEO_ITERATOR_FROM_CODE_ID) {
        OseoValue value = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        return iterator_from(context, value);
    }
    if (code_id == OSEO_WRAP_FOR_VALID_ITERATOR_NEXT_CODE_ID) {
        return wrap_for_valid_iterator_next(context, receiver);
    }
    if (code_id == OSEO_WRAP_FOR_VALID_ITERATOR_RETURN_CODE_ID) {
        return wrap_for_valid_iterator_return(context, receiver);
    }
    if (code_id <= OSEO_ITERATOR_MAP_CODE_ID &&
        code_id >= OSEO_ITERATOR_FLAT_MAP_CODE_ID) {
        return iterator_helper_method(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_ITERATOR_HELPER_NEXT_CODE_ID) {
        return iterator_helper_resume(context, receiver);
    }
    if (code_id == OSEO_ITERATOR_HELPER_RETURN_CODE_ID) {
        return iterator_helper_return(context, receiver);
    }
    if (code_id >= OSEO_ITERATOR_TAG_SETTER_CODE_ID &&
        code_id <= OSEO_ITERATOR_CONSTRUCTOR_GETTER_CODE_ID) {
        return iterator_prototype_accessor(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_ARRAY_VALUES_CODE_ID) {
        return oseo_internal_array_values(context, receiver);
    }
    if (code_id == OSEO_ARRAY_ITERATOR_NEXT_CODE_ID) {
        return oseo_internal_array_iterator_next(context, receiver);
    }
    if (code_id == OSEO_ITERATOR_SELF_CODE_ID) return normal(receiver);
    OseoValue argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (code_id == OSEO_ASYNC_FROM_SYNC_FULFILL_CODE_ID) {
        return oseo_internal_async_from_sync_fulfilled(
            context,
            callee,
            argument
        );
    }
    if (code_id == OSEO_ASYNC_FROM_SYNC_REJECT_CLOSE_CODE_ID) {
        return oseo_internal_async_from_sync_rejected(
            context,
            callee,
            argument
        );
    }
    return oseo_unknown_function(context, code_id);
}

/*
 * The generic synchronous iterator protocol: GetIterator over
 * Symbol.iterator, IteratorStep and IteratorValue, IteratorClose, and
 * the first-class array iterator and its realm-owned prototype chain.
 */

static OseoResult ascii_iterator_string(
    OseoContext *context,
    const char *text
) {
    size_t length = strlen(text);
    uint16_t units[32];
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Iterator key is too long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_string_from_units(context, units, length);
}

/* True when the key is the well-known Symbol.iterator. */
bool oseo_internal_iterator_key_matches(
    OseoContext *context,
    OseoValue key
) {
    if (!is_symbol(key)) return false;
    OseoResult iterator_symbol =
        oseo_internal_well_known_symbol(context, OSEO_WELL_KNOWN_ITERATOR);
    return iterator_symbol.status == OSEO_STATUS_NORMAL &&
        iterator_symbol.value == key;
}

/* The same for Symbol.asyncIterator. */
bool oseo_internal_async_iterator_key_matches(
    OseoContext *context,
    OseoValue key
) {
    if (!is_symbol(key)) return false;
    OseoResult iterator_symbol = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ASYNC_ITERATOR
    );
    return iterator_symbol.status == OSEO_STATUS_NORMAL &&
        iterator_symbol.value == key;
}

/*
 * Intrinsic iterator methods occupy named slots in the realm table.
 */
OseoResult oseo_internal_iterator_method(
    OseoContext *context,
    size_t code_id
) {
    OseoIntrinsic intrinsic;
    const uint16_t next_units[] = {'n', 'e', 'x', 't'};
    const uint16_t return_units[] = {'r', 'e', 't', 'u', 'r', 'n'};
    const uint16_t throw_units[] = {'t', 'h', 'r', 'o', 'w'};
    const uint16_t values_units[] = {'v', 'a', 'l', 'u', 'e', 's'};
    static const uint16_t symbol_iterator_units[] = {
        '[', 'S', 'y', 'm', 'b', 'o', 'l', '.',
        'i', 't', 'e', 'r', 'a', 't', 'o', 'r', ']'
    };
    const uint16_t *name;
    size_t name_length;
    /* %GeneratorPrototype%.next, .return, and .throw each take one
     * declared parameter; every other intrinsic iterator method
     * declares none. */
    size_t parameter_count = 0u;
    if (code_id == OSEO_ARRAY_ITERATOR_NEXT_CODE_ID) {
        intrinsic = OSEO_INTRINSIC_ARRAY_ITERATOR_NEXT;
        name = next_units;
        name_length = 4u;
    } else if (code_id == OSEO_GENERATOR_NEXT_CODE_ID) {
        intrinsic = OSEO_INTRINSIC_GENERATOR_NEXT;
        name = next_units;
        name_length = 4u;
        parameter_count = 1u;
    } else if (code_id == OSEO_GENERATOR_RETURN_CODE_ID) {
        intrinsic = OSEO_INTRINSIC_GENERATOR_RETURN;
        name = return_units;
        name_length = 6u;
        parameter_count = 1u;
    } else if (code_id == OSEO_GENERATOR_THROW_CODE_ID) {
        intrinsic = OSEO_INTRINSIC_GENERATOR_THROW;
        name = throw_units;
        name_length = 5u;
        parameter_count = 1u;
    } else if (code_id == OSEO_ARRAY_VALUES_CODE_ID) {
        intrinsic = OSEO_INTRINSIC_ARRAY_VALUES;
        name = values_units;
        name_length = 6u;
    } else {
        intrinsic = OSEO_INTRINSIC_ITERATOR_SELF;
        name = symbol_iterator_units;
        name_length = sizeof(symbol_iterator_units) /
            sizeof(*symbol_iterator_units);
    }
    OseoValue *cache = &context->intrinsics[intrinsic];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_environment_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[0],
            name,
            name_length,
            parameter_count,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) *cache = result.value;
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult create_iterator_builtin(
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

static OseoResult define_iterator_data(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value
) {
    return oseo_object_define(
        context,
        object,
        key,
        value,
        (OseoPropertyAttributes){true, false, true, false}
    );
}

static OseoResult define_iterator_accessor(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue getter,
    OseoValue setter
) {
    return oseo_object_define_accessor(
        context,
        object,
        key,
        getter,
        setter,
        true,
        true,
        (OseoPropertyAttributes){true, false, false, true}
    );
}

OseoResult oseo_internal_array_iterator_prototype(OseoContext *context) {
    OseoValue *array_cache =
        &context->intrinsics[OSEO_INTRINSIC_ARRAY_ITERATOR_PROTOTYPE];
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_ITERATOR_TAG_SETTER];
    if (is_function(*marker)) {
        return normal(*array_cache);
    }
    if (is_object(*marker)) return normal(*array_cache);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 8u);
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
        context->intrinsics[OSEO_INTRINSIC_ITERATOR_PROTOTYPE] =
            frame.slots[1];
        *marker = frame.slots[1];
        result = create_iterator_builtin(
            context,
            OSEO_ITERATOR_CONSTRUCTOR_CODE_ID,
            "Iterator",
            0u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_ITERATOR] = frame.slots[2];
        OseoFunction *constructor = function_object(frame.slots[2]);
        constructor->prototype_object = frame.slots[1];
        constructor->prototype_writable = false;
    }
    static const OseoIntrinsic intrinsics[] = {
        OSEO_INTRINSIC_ITERATOR_FROM,
        OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_NEXT,
        OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_RETURN,
        OSEO_INTRINSIC_ITERATOR_CONSTRUCTOR_GETTER,
        OSEO_INTRINSIC_ITERATOR_CONSTRUCTOR_SETTER,
        OSEO_INTRINSIC_ITERATOR_TAG_GETTER,
        OSEO_INTRINSIC_ITERATOR_TAG_SETTER,
        OSEO_INTRINSIC_ITERATOR_MAP,
        OSEO_INTRINSIC_ITERATOR_FILTER,
        OSEO_INTRINSIC_ITERATOR_TAKE,
        OSEO_INTRINSIC_ITERATOR_DROP,
        OSEO_INTRINSIC_ITERATOR_FLAT_MAP,
    };
    static const size_t codes[] = {
        OSEO_ITERATOR_FROM_CODE_ID,
        OSEO_WRAP_FOR_VALID_ITERATOR_NEXT_CODE_ID,
        OSEO_WRAP_FOR_VALID_ITERATOR_RETURN_CODE_ID,
        OSEO_ITERATOR_CONSTRUCTOR_GETTER_CODE_ID,
        OSEO_ITERATOR_CONSTRUCTOR_SETTER_CODE_ID,
        OSEO_ITERATOR_TAG_GETTER_CODE_ID,
        OSEO_ITERATOR_TAG_SETTER_CODE_ID,
        OSEO_ITERATOR_MAP_CODE_ID,
        OSEO_ITERATOR_FILTER_CODE_ID,
        OSEO_ITERATOR_TAKE_CODE_ID,
        OSEO_ITERATOR_DROP_CODE_ID,
        OSEO_ITERATOR_FLAT_MAP_CODE_ID,
    };
    static const char *const names[] = {
        "from",
        "next",
        "return",
        "constructor",
        "constructor",
        "[Symbol.toStringTag]",
        "[Symbol.toStringTag]",
        "map",
        "filter",
        "take",
        "drop",
        "flatMap",
    };
    static const size_t lengths[] = {
        1u, 0u, 0u, 0u, 1u, 0u, 1u, 1u, 1u, 1u, 1u, 1u,
    };
    static const OseoFunctionNamePrefix prefixes[] = {
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_GET,
        OSEO_FUNCTION_NAME_PREFIX_SET,
        OSEO_FUNCTION_NAME_PREFIX_GET,
        OSEO_FUNCTION_NAME_PREFIX_SET,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
        OSEO_FUNCTION_NAME_PREFIX_NONE,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 12u;
         index += 1u) {
        result = create_iterator_builtin(
            context,
            codes[index],
            names[index],
            lengths[index],
            OSEO_FUNCTION_INTERNAL,
            prefixes[index]
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[intrinsics[index]] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "from");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_iterator_data(
            context,
            frame.slots[2],
            frame.slots[3],
            context->intrinsics[OSEO_INTRINSIC_ITERATOR_FROM]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_method(
            context,
            OSEO_ITERATOR_SELF_CODE_ID
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_iterator_data(
            context,
            frame.slots[1],
            frame.slots[5],
            frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "constructor");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_iterator_accessor(
            context,
            frame.slots[1],
            frame.slots[3],
            context->intrinsics[OSEO_INTRINSIC_ITERATOR_CONSTRUCTOR_GETTER],
            context->intrinsics[OSEO_INTRINSIC_ITERATOR_CONSTRUCTOR_SETTER]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_iterator_accessor(
            context,
            frame.slots[1],
            frame.slots[5],
            context->intrinsics[OSEO_INTRINSIC_ITERATOR_TAG_GETTER],
            context->intrinsics[OSEO_INTRINSIC_ITERATOR_TAG_SETTER]
        );
    }
    /* The five lazy helper methods are ordinary writable,
     * non-enumerable, configurable data properties of
     * %IteratorPrototype%, so replacing one on the prototype changes
     * what every iterator that inherits it resolves. */
    for (size_t index = 7u;
         result.status == OSEO_STATUS_NORMAL && index < 12u;
         index += 1u) {
        result = ascii_iterator_string(context, names[index]);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_iterator_data(
                context,
                frame.slots[1],
                frame.slots[3],
                context->intrinsics[intrinsics[index]]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[6] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[
                OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_PROTOTYPE
            ] = frame.slots[6];
        }
    }
    static const char *const wrap_names[] = {"next", "return"};
    static const OseoIntrinsic wrap_methods[] = {
        OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_NEXT,
        OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_RETURN,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = ascii_iterator_string(context, wrap_names[index]);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_iterator_data(
                context,
                frame.slots[6],
                frame.slots[3],
                context->intrinsics[wrap_methods[index]]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[7] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_method(
            context,
            OSEO_ARRAY_ITERATOR_NEXT_CODE_ID
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_iterator_data(
            context,
            frame.slots[7],
            frame.slots[3],
            frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *array_cache = frame.slots[7];
        result = normal(*array_cache);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_ITERATOR_PROTOTYPE] =
            oseo_undefined();
        *array_cache = oseo_undefined();
        for (size_t index = OSEO_INTRINSIC_ITERATOR;
             index <= OSEO_INTRINSIC_ITERATOR_TAG_SETTER;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        for (size_t index = OSEO_INTRINSIC_ITERATOR_MAP;
             index <= OSEO_INTRINSIC_ITERATOR_FLAT_MAP;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult iterator_type_error(
    OseoContext *context,
    const char *message
) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

static bool inherits_iterator_prototype(
    OseoValue iterator,
    OseoValue iterator_prototype
) {
    OseoValue current = ordinary_object(iterator)->prototype;
    while (is_object(current)) {
        if (current == iterator_prototype) return true;
        current = ordinary_object(current)->prototype;
    }
    return false;
}

static OseoResult iterator_from(
    OseoContext *context,
    OseoValue value
) {
    if (is_string(value)) {
        return failure(
            context,
            "OSEO2001",
            "String iteration is not admitted yet."
        );
    }
    if (!is_object(value)) {
        return iterator_type_error(
            context,
            "Iterator.from requires an object or string."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ITERATOR
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_nullish(frame.slots[1]) &&
        !is_function(frame.slots[1])) {
        result = iterator_type_error(
            context,
            "The Symbol.iterator property is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_function(frame.slots[1])) {
        result = oseo_call_function(
            context,
            frame.slots[1],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[2] = result.value;
    } else {
        frame.slots[2] = frame.slots[0];
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[2])) {
        result = iterator_type_error(
            context,
            "The iterator method did not return an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[2], frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ITERATOR_PROTOTYPE
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        inherits_iterator_prototype(frame.slots[2], frame.slots[4])) {
        result = normal(frame.slots[2]);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_WRAP_FOR_VALID_ITERATOR_PROTOTYPE
        );
        frame.slots[4] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_create(context, frame.slots[4]);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoOrdinaryObject *wrapper = ordinary_object(frame.slots[5]);
            wrapper->wrap_for_valid_iterator = true;
            wrapper->wrapped_iterator = frame.slots[2];
            wrapper->wrapped_next = frame.slots[3];
            result = normal(frame.slots[5]);
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult wrap_for_valid_iterator_next(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_wrap_for_valid_iterator(receiver)) {
        return iterator_type_error(
            context,
            "Iterator wrapper next requires a valid wrapper receiver."
        );
    }
    OseoValue slots[2] = {
        ordinary_object(receiver)->wrapped_iterator,
        ordinary_object(receiver)->wrapped_next,
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult wrap_for_valid_iterator_return(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_wrap_for_valid_iterator(receiver)) {
        return iterator_type_error(
            context,
            "Iterator wrapper return requires a valid wrapper receiver."
        );
    }
    OseoValue slots[2] = {
        ordinary_object(receiver)->wrapped_iterator,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    } else if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        result = iterator_type_error(
            context,
            "The iterator return property is not callable."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult iterator_setter(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    OseoValue value
) {
    if (!is_object(receiver)) {
        return iterator_type_error(
            context,
            "Iterator prototype setter requires an object receiver."
        );
    }
    OseoValue slots[3] = {receiver, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = code_id == OSEO_ITERATOR_CONSTRUCTOR_SETTER_CODE_ID
        ? ascii_iterator_string(context, "constructor")
        : oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
    slots[2] = result.value;
    OseoValue home =
        context->intrinsics[OSEO_INTRINSIC_ITERATOR_PROTOTYPE];
    if (result.status == OSEO_STATUS_NORMAL && slots[0] == home) {
        result = iterator_type_error(
            context,
            "Cannot assign to an Iterator prototype accessor."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue ignored = oseo_undefined();
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        bool own = oseo_internal_own_descriptor(
            slots[0],
            slots[2],
            &ignored,
            &attributes,
            &getter,
            &setter
        );
        result = own
            ? oseo_object_set(context, slots[0], slots[2], slots[1], true)
            : oseo_object_define(
                context,
                slots[0],
                slots[2],
                slots[1],
                (OseoPropertyAttributes){true, true, true, false}
            );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_undefined());
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult iterator_prototype_accessor(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (code_id == OSEO_ITERATOR_CONSTRUCTOR_GETTER_CODE_ID) {
        return oseo_internal_intrinsic(context, OSEO_INTRINSIC_ITERATOR);
    }
    if (code_id == OSEO_ITERATOR_TAG_GETTER_CODE_ID) {
        return ascii_iterator_string(context, "Iterator");
    }
    OseoValue value = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    return iterator_setter(context, code_id, receiver, value);
}

/*
 * The lazy iterator helpers (27.1.4): map, filter, take, drop, and
 * flatMap, the %IteratorHelperPrototype% their results share, and the
 * underlying-iterator close each specified abstract closure performs.
 *
 * ECMA-262 writes every one of these as a generator over an abstract
 * closure with a single `yield`. A helper object here stores that
 * closure's captured state instead, so one resumption re-enters the
 * loop at the point the yield left it: the iterator record and callback
 * never change, and only the counter, the remaining count, and the
 * flatMap inner record advance. The [[GeneratorState]] the object
 * carries is what makes a re-entrant resumption, a `return` before the
 * first step, and a `return` after completion behave exactly as the
 * generator would.
 */

/* IfAbruptCloseIterator: close the record and keep the original abrupt
 * completion, unless closing itself throws or the completion is a
 * non-catchable internal diagnostic rather than a thrown value. */
static OseoResult helper_close_after_abrupt(
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

/*
 * IteratorStep and IteratorStepValue over one already-captured record.
 * `value` stays undefined when `read_value` is false, which is the
 * plain IteratorStep `drop` performs while skipping its prefix: a
 * skipped result's `value` getter never runs.
 *
 * A throw anywhere in the step leaves the record exhausted without
 * closing it, which is what the specified operations do by setting
 * [[Done]] before propagating. The caller marks the helper completed
 * for the same reason, so a later `return` performs no close.
 */
static OseoResult helper_iterator_step(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    bool read_value,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = false;
    OseoValue slots[4] = {
        iterator,
        next_method,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = iterator_type_error(
            context,
            "The iterator next result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "done");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[2], slots[3]);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value)) {
        *done = true;
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL && read_value) {
        result = ascii_iterator_string(context, "value");
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[2], slots[3]);
        }
        if (result.status == OSEO_STATUS_NORMAL) *value = result.value;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_undefined());
}

/*
 * GetIteratorDirect(obj): the record every helper method captures. The
 * `next` method is read exactly once, when the helper object is
 * created, and reused for every later step.
 */
static OseoResult helper_get_iterator_direct(
    OseoContext *context,
    OseoValue object,
    OseoValue *next_method
) {
    *next_method = oseo_undefined();
    OseoValue slots[2] = {object, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "next");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        if (result.status == OSEO_STATUS_NORMAL) *next_method = result.value;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetIteratorFlattenable(value, REJECT-PRIMITIVES), which is what
 * flatMap applies to each mapped value. A primitive, a String included,
 * is rejected rather than iterated; a nullish `Symbol.iterator` leaves
 * the object itself as the iterator; and any other non-callable value
 * there is a TypeError.
 */
static OseoResult helper_get_iterator_flattenable(
    OseoContext *context,
    OseoValue value,
    OseoValue *iterator,
    OseoValue *next_method
) {
    *iterator = oseo_undefined();
    *next_method = oseo_undefined();
    if (!is_object(value)) {
        return iterator_type_error(
            context,
            "flatMap requires each mapped value to be an object."
        );
    }
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ITERATOR
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        slots[1] = slots[0];
    } else if (result.status == OSEO_STATUS_NORMAL) {
        if (!is_function(slots[1])) {
            result = iterator_type_error(
                context,
                "The Symbol.iterator property is not callable."
            );
        } else {
            result = oseo_call_function(
                context,
                slots[1],
                slots[0],
                0u,
                NULL,
                oseo_undefined()
            );
            slots[1] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = iterator_type_error(
            context,
            "The iterator method did not return an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue captured = oseo_undefined();
        result = helper_get_iterator_direct(context, slots[1], &captured);
        if (result.status == OSEO_STATUS_NORMAL) {
            *iterator = slots[1];
            *next_method = captured;
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_iterator_helper_prototype(OseoContext *context) {
    OseoValue *cache =
        &context->intrinsics[OSEO_INTRINSIC_ITERATOR_HELPER_PROTOTYPE];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    size_t entry_allocations = context->allocations;
    /* 0 %IteratorPrototype%, 1 the helper prototype, 2 one key,
     * 3 the tag string. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_ITERATOR_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    static const OseoIntrinsic methods[] = {
        OSEO_INTRINSIC_ITERATOR_HELPER_NEXT,
        OSEO_INTRINSIC_ITERATOR_HELPER_RETURN,
    };
    static const size_t codes[] = {
        OSEO_ITERATOR_HELPER_NEXT_CODE_ID,
        OSEO_ITERATOR_HELPER_RETURN_CODE_ID,
    };
    static const char *const names[] = {"next", "return"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_iterator_builtin(
            context,
            codes[index],
            names[index],
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[methods[index]] = result.value;
            result = ascii_iterator_string(context, names[index]);
            frame.slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_iterator_data(
                context,
                frame.slots[1],
                frame.slots[2],
                context->intrinsics[methods[index]]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "Iterator Helper");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *cache = frame.slots[1];
        result = normal(*cache);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        *cache = oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_ITERATOR_HELPER_NEXT] =
            oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_ITERATOR_HELPER_RETURN] =
            oseo_undefined();
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* CreateIteratorFromClosure for one helper kind, with the closure's
 * captured state stored in the object the collector traces. */
static OseoResult iterator_helper_create(
    OseoContext *context,
    OseoIteratorHelperKind kind,
    OseoValue underlying_iterator,
    OseoValue underlying_next,
    OseoValue callback,
    double remaining
) {
    OseoValue slots[4] = {
        underlying_iterator,
        underlying_next,
        callback,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_iterator_helper_prototype(context);
    slots[3] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    OseoIteratorHelper *helper =
        oseo_internal_allocate_heap_bytes(context, sizeof(*helper));
    if (helper == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Iterator helper allocation failed."
        );
    }
    helper->ordinary.prototype = slots[3];
    helper->ordinary.properties = NULL;
    helper->ordinary.property_capacity = 0u;
    helper->ordinary.property_count = 0u;
    helper->ordinary.private_elements = NULL;
    helper->ordinary.private_element_capacity = 0u;
    helper->ordinary.private_element_count = 0u;
    helper->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    helper->ordinary.array_length = 0u;
    helper->ordinary.dictionary = false;
    helper->ordinary.length_writable = false;
    helper->ordinary.extensible = true;
    helper->ordinary.module_namespace = false;
    helper->ordinary.global_object = false;
    helper->ordinary.error_data = false;
    helper->ordinary.number_data = false;
    helper->ordinary.number_value = oseo_undefined();
    helper->ordinary.primitive_data = false;
    helper->ordinary.primitive_value = oseo_undefined();
    helper->ordinary.primitive_wrapper_methods_initialized = false;
    helper->ordinary.virtual_string_iterator = false;
    helper->ordinary.virtual_string_iterator_configurable = false;
    helper->ordinary.virtual_string_iterator_enumerable = false;
    helper->ordinary.virtual_string_iterator_writable = false;
    helper->ordinary.array_iterator = false;
    helper->ordinary.iterator_array = oseo_undefined();
    helper->ordinary.iterator_index = 0u;
    helper->ordinary.regexp_string_iterator = false;
    helper->ordinary.regexp_iterator_regexp = oseo_undefined();
    helper->ordinary.regexp_iterator_subject = oseo_undefined();
    helper->ordinary.regexp_iterator_global = false;
    helper->ordinary.regexp_iterator_unicode = false;
    helper->ordinary.regexp_iterator_complete = false;
    helper->ordinary.async_from_sync = false;
    helper->ordinary.async_sync_iterator = oseo_undefined();
    helper->ordinary.wrap_for_valid_iterator = false;
    helper->ordinary.wrapped_iterator = oseo_undefined();
    helper->ordinary.wrapped_next = oseo_undefined();
    helper->ordinary.generator = NULL;
    helper->ordinary.arguments_object = false;
    helper->ordinary.mapped_arguments = false;
    helper->underlying_iterator = slots[0];
    helper->underlying_next = slots[1];
    helper->callback = slots[2];
    helper->inner_iterator = oseo_undefined();
    helper->inner_next = oseo_undefined();
    helper->remaining = remaining;
    helper->counter = 0.0;
    helper->inner_alive = false;
    helper->prefix_dropped = false;
    helper->kind = kind;
    helper->state = OSEO_ITERATOR_HELPER_SUSPENDED_START;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &helper->ordinary.header,
        OSEO_HEAP_ITERATOR_HELPER
    );
    oseo_roots_pop(context, &frame);
    return published;
}

/*
 * One resumption of a helper's closure. It either yields a value or
 * reports that the closure returned; every abrupt completion here has
 * already performed the close its specified step requires.
 */
static OseoResult iterator_helper_advance(
    OseoContext *context,
    OseoValue helper_value,
    OseoValue *yielded,
    bool *closure_done
) {
    *closure_done = false;
    /* 0 helper, 1 underlying iterator, 2 stepped value, 3 callback
     * result or inner iterator, 4 callback arguments. */
    OseoValue slots[5] = {
        helper_value,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoIteratorHelper *helper = iterator_helper_object(slots[0]);
        OseoIteratorHelperKind kind = helper->kind;
        slots[1] = helper->underlying_iterator;
        if (kind == OSEO_ITERATOR_HELPER_TAKE && helper->remaining == 0.0) {
            /* Return ? IteratorClose(iterated, ReturnCompletion). */
            result = oseo_iterator_close(context, slots[1], false);
            if (result.status == OSEO_STATUS_NORMAL) *closure_done = true;
            break;
        }
        if (kind == OSEO_ITERATOR_HELPER_FLAT_MAP && helper->inner_alive) {
            bool inner_done = false;
            OseoValue inner_iterator = helper->inner_iterator;
            OseoValue inner_next = helper->inner_next;
            result = helper_iterator_step(
                context,
                inner_iterator,
                inner_next,
                true,
                &slots[2],
                &inner_done
            );
            if (result.status != OSEO_STATUS_NORMAL) {
                result = helper_close_after_abrupt(context, slots[1], result);
                break;
            }
            helper = iterator_helper_object(slots[0]);
            if (!inner_done) {
                *yielded = slots[2];
                break;
            }
            helper->inner_alive = false;
            helper->inner_iterator = oseo_undefined();
            helper->inner_next = oseo_undefined();
            continue;
        }
        if (kind == OSEO_ITERATOR_HELPER_DROP && !helper->prefix_dropped) {
            bool exhausted = false;
            while (result.status == OSEO_STATUS_NORMAL) {
                helper = iterator_helper_object(slots[0]);
                if (!(helper->remaining > 0.0)) break;
                if (helper->remaining != INFINITY) {
                    helper->remaining -= 1.0;
                }
                bool skipped_done = false;
                OseoValue ignored = oseo_undefined();
                result = helper_iterator_step(
                    context,
                    helper->underlying_iterator,
                    helper->underlying_next,
                    false,
                    &ignored,
                    &skipped_done
                );
                if (result.status == OSEO_STATUS_NORMAL && skipped_done) {
                    exhausted = true;
                    break;
                }
            }
            if (result.status != OSEO_STATUS_NORMAL) break;
            helper = iterator_helper_object(slots[0]);
            helper->prefix_dropped = true;
            if (exhausted) {
                *closure_done = true;
                break;
            }
        }
        helper = iterator_helper_object(slots[0]);
        if (kind == OSEO_ITERATOR_HELPER_TAKE &&
            helper->remaining != INFINITY) {
            helper->remaining -= 1.0;
        }
        bool step_done = false;
        result = helper_iterator_step(
            context,
            helper->underlying_iterator,
            helper->underlying_next,
            true,
            &slots[2],
            &step_done
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (step_done) {
            *closure_done = true;
            break;
        }
        if (kind == OSEO_ITERATOR_HELPER_TAKE ||
            kind == OSEO_ITERATOR_HELPER_DROP) {
            *yielded = slots[2];
            break;
        }
        helper = iterator_helper_object(slots[0]);
        slots[3] = helper->callback;
        slots[4] = oseo_number(helper->counter);
        OseoValue callback_arguments[2] = {slots[2], slots[4]};
        result = oseo_call_function(
            context,
            slots[3],
            oseo_undefined(),
            2u,
            callback_arguments,
            oseo_undefined()
        );
        slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            result = helper_close_after_abrupt(context, slots[1], result);
            break;
        }
        /* The specified closures increment the counter after the yield
         * the callback result feeds. Nothing between the call and that
         * increment can observe the counter, and a resumption that
         * never returns leaves the closure completed, so incrementing
         * here produces the same 0, 1, 2, ... sequence. */
        helper = iterator_helper_object(slots[0]);
        helper->counter += 1.0;
        if (kind == OSEO_ITERATOR_HELPER_MAP) {
            *yielded = slots[3];
            break;
        }
        if (kind == OSEO_ITERATOR_HELPER_FILTER) {
            if (oseo_to_boolean(slots[3])) {
                *yielded = slots[2];
                break;
            }
            continue;
        }
        OseoValue inner_iterator = oseo_undefined();
        OseoValue inner_next = oseo_undefined();
        result = helper_get_iterator_flattenable(
            context,
            slots[3],
            &inner_iterator,
            &inner_next
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            result = helper_close_after_abrupt(context, slots[1], result);
            break;
        }
        helper = iterator_helper_object(slots[0]);
        helper->inner_iterator = inner_iterator;
        helper->inner_next = inner_next;
        helper->inner_alive = true;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* GeneratorResume for a helper: %IteratorHelperPrototype%.next. */
static OseoResult iterator_helper_resume(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_iterator_helper(receiver)) {
        return iterator_type_error(
            context,
            "Method %IteratorHelperPrototype%.next called on incompatible "
            "receiver."
        );
    }
    OseoIteratorHelper *helper = iterator_helper_object(receiver);
    if (helper->state == OSEO_ITERATOR_HELPER_EXECUTING) {
        return iterator_type_error(
            context,
            "Cannot resume an iterator helper that is already running."
        );
    }
    if (helper->state == OSEO_ITERATOR_HELPER_COMPLETED) {
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    helper->state = OSEO_ITERATOR_HELPER_EXECUTING;
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    bool closure_done = false;
    OseoResult result = iterator_helper_advance(
        context,
        slots[0],
        &slots[1],
        &closure_done
    );
    helper = iterator_helper_object(slots[0]);
    if (result.status != OSEO_STATUS_NORMAL || closure_done) {
        helper->state = OSEO_ITERATOR_HELPER_COMPLETED;
        helper->callback = oseo_undefined();
        helper->inner_alive = false;
        helper->inner_iterator = oseo_undefined();
        helper->inner_next = oseo_undefined();
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_iterator_result(
                context,
                oseo_undefined(),
                true
            );
        }
    } else {
        helper->state = OSEO_ITERATOR_HELPER_SUSPENDED_YIELD;
        result = oseo_internal_iterator_result(context, slots[1], false);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * %IteratorHelperPrototype%.return. A helper that has never run closes
 * its underlying iterator directly; a suspended one resumes with a
 * return completion, which is what makes the specified closure close
 * the flatMap inner iterator first and the underlying iterator second;
 * and a completed one closes nothing.
 */
static OseoResult iterator_helper_return(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_iterator_helper(receiver)) {
        return iterator_type_error(
            context,
            "Method %IteratorHelperPrototype%.return called on "
            "incompatible receiver."
        );
    }
    OseoIteratorHelper *helper = iterator_helper_object(receiver);
    if (helper->state == OSEO_ITERATOR_HELPER_EXECUTING) {
        return iterator_type_error(
            context,
            "Cannot close an iterator helper that is already running."
        );
    }
    if (helper->state == OSEO_ITERATOR_HELPER_COMPLETED) {
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    bool suspended_yield =
        helper->state == OSEO_ITERATOR_HELPER_SUSPENDED_YIELD;
    bool close_inner = suspended_yield &&
        helper->kind == OSEO_ITERATOR_HELPER_FLAT_MAP &&
        helper->inner_alive;
    /*
     * A helper that has never run completes before its close runs, which
     * is what %IteratorHelperPrototype%.return does directly. A suspended
     * one instead resumes its closure with a return completion through
     * GeneratorResumeAbrupt, so its state is `executing` for the whole
     * cleanup and a `return` method that re-enters this helper reaches
     * the running-generator TypeError rather than a `done` result.
     */
    helper->state = suspended_yield
        ? OSEO_ITERATOR_HELPER_EXECUTING
        : OSEO_ITERATOR_HELPER_COMPLETED;
    helper->callback = oseo_undefined();
    /* 0 helper, 1 underlying iterator, 2 inner iterator. */
    OseoValue slots[3] = {
        receiver,
        helper->underlying_iterator,
        helper->inner_iterator,
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    helper->inner_alive = false;
    helper->inner_iterator = oseo_undefined();
    helper->inner_next = oseo_undefined();
    OseoResult result = normal(oseo_undefined());
    if (close_inner) {
        result = oseo_iterator_close(context, slots[2], false);
        if (result.status != OSEO_STATUS_NORMAL) {
            result = helper_close_after_abrupt(context, slots[1], result);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_iterator_close(context, slots[1], false);
    }
    /* The resumed closure has finished, normally or abruptly, so the
     * generator is completed either way. */
    iterator_helper_object(slots[0])->state =
        OSEO_ITERATOR_HELPER_COMPLETED;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToIntegerOrInfinity's truncation, applied to an already-checked
 * non-NaN Number. */
static double helper_integer_or_infinity(double value) {
    if (value == 0.0) return 0.0;
    if (value == INFINITY || value == -INFINITY) return value;
    return trunc(value);
}

/*
 * The five %Iterator.prototype% helper methods. Each one validates its
 * receiver, then validates its argument against the record it would
 * have captured, closing that record when the validation fails, and
 * only then reads `next`. Reading `next` last is what keeps a failing
 * argument from ever reaching the underlying iterator's `next` getter.
 */
static OseoResult iterator_helper_method(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoIteratorHelperKind kind = OSEO_ITERATOR_HELPER_MAP;
    if (code_id == OSEO_ITERATOR_FILTER_CODE_ID) {
        kind = OSEO_ITERATOR_HELPER_FILTER;
    } else if (code_id == OSEO_ITERATOR_TAKE_CODE_ID) {
        kind = OSEO_ITERATOR_HELPER_TAKE;
    } else if (code_id == OSEO_ITERATOR_DROP_CODE_ID) {
        kind = OSEO_ITERATOR_HELPER_DROP;
    } else if (code_id == OSEO_ITERATOR_FLAT_MAP_CODE_ID) {
        kind = OSEO_ITERATOR_HELPER_FLAT_MAP;
    }
    bool counted = kind == OSEO_ITERATOR_HELPER_TAKE ||
        kind == OSEO_ITERATOR_HELPER_DROP;
    if (!is_object(receiver)) {
        return iterator_type_error(
            context,
            counted
                ? "Iterator take and drop require an object receiver."
                : "Iterator map, filter, and flatMap require an object "
                  "receiver."
        );
    }
    OseoValue argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    /* 0 receiver, 1 argument, 2 captured next method. */
    OseoValue slots[3] = {receiver, argument, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    double remaining = INFINITY;
    if (counted) {
        result = oseo_internal_to_number(context, slots[1]);
        if (result.status == OSEO_STATUS_NORMAL) {
            double limit = number_value(result.value);
            if (limit != limit) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_RANGE,
                    "Iterator take and drop reject a NaN limit."
                );
            } else {
                remaining = helper_integer_or_infinity(limit);
                if (remaining < 0.0) {
                    result = oseo_internal_throw_error(
                        context,
                        OSEO_ERROR_RANGE,
                        "Iterator take and drop reject a negative limit."
                    );
                }
            }
        }
    } else if (!is_function(slots[1])) {
        result = iterator_type_error(
            context,
            "Iterator map, filter, and flatMap require a callable "
            "argument."
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        result = helper_close_after_abrupt(context, slots[0], result);
        oseo_roots_pop(context, &frame);
        return result;
    }
    result = helper_get_iterator_direct(context, slots[0], &slots[2]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = iterator_helper_create(
            context,
            kind,
            slots[0],
            slots[2],
            counted ? oseo_undefined() : slots[1],
            remaining
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToLength's clamp: 2^53 - 1. */
#define OSEO_MAX_SAFE_LENGTH 9007199254740991.0

/*
 * LengthOfArrayLike for the array iterator's target: ToLength(Get(O,
 * "length")). An ordinary array answers from its own element count,
 * which is the same value its `length` property reports. Every other
 * object goes through the generic `Get`, so an inherited or accessor
 * `length` is observed and an abrupt completion propagates, and then
 * through ToNumber and ToLength, so a fractional, string, negative,
 * `NaN`, or infinite value produces the specified integral count rather
 * than being read literally.
 */
static OseoResult array_like_length(
    OseoContext *context,
    OseoValue target,
    double *length
) {
    *length = 0.0;
    if (is_array(target)) {
        *length = (double)ordinary_object(target)->array_length;
        return normal(oseo_undefined());
    }
    OseoValue slots[1] = {target};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "length");
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], result.value);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, result.value);
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (!is_number(result.value)) return normal(oseo_undefined());
    double value = number_value(result.value);
    /* NaN, negative zero, and every negative value clamp to zero. */
    if (!(value > 0.0)) return normal(oseo_undefined());
    value = floor(value);
    *length = value > OSEO_MAX_SAFE_LENGTH ? OSEO_MAX_SAFE_LENGTH : value;
    return normal(oseo_undefined());
}

OseoResult oseo_internal_array_values(
    OseoContext *context,
    OseoValue array
) {
    if (!is_object(array)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Array iteration requires an object receiver."
        );
    }
    OseoValue slots[2] = {array, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_iterator_prototype(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *iterator = ordinary_object(result.value);
        iterator->array_iterator = true;
        iterator->iterator_array = slots[0];
        iterator->iterator_index = 0u;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_iterator_result(
    OseoContext *context,
    OseoValue value,
    bool done
) {
    OseoValue slots[3] = {value, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_literal_create(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[1] = result.value;
        const OseoPropertyAttributes plain = {true, true, true, false};
        result = ascii_iterator_string(context, "value");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                slots[1],
                slots[2],
                slots[0],
                plain
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = ascii_iterator_string(context, "done");
            slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                slots[1],
                slots[2],
                oseo_boolean(done),
                plain
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_array_iterator_next(
    OseoContext *context,
    OseoValue iterator
) {
    if (!is_array_iterator(iterator)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Array iterator next requires an array iterator receiver."
        );
    }
    /*
     * The iterated target and the cursor are both snapshotted before
     * LengthOfArrayLike, because its `Get` can run an accessor that
     * reenters this same iterator: the reentrant step must not decide
     * which index this step yields. The cursor then advances before the
     * element `Get`, so an abrupt element accessor leaves the iterator on
     * the following index rather than retrying the one it failed to read.
     */
    OseoOrdinaryObject *state = ordinary_object(iterator);
    if (!is_object(state->iterator_array)) {
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    OseoValue slots[3] = {iterator, oseo_undefined(), state->iterator_array};
    const size_t index = state->iterator_index;
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    double length = 0.0;
    OseoResult result = array_like_length(context, slots[2], &length);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    if ((double)index >= length) {
        ordinary_object(slots[0])->iterator_array = oseo_undefined();
        oseo_roots_pop(context, &frame);
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    ordinary_object(slots[0])->iterator_index = index + 1u;
    result = oseo_property_key(context, oseo_number((double)index));
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[2], result.value);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_result(context, slots[1], false);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetIterator(iterable, sync): read the Symbol.iterator method and call
 * it, validating that the result is an object, then capture the
 * iterator's next method once so every later step reuses it as the
 * specification's iterator record requires. A default array with no
 * user-overridden Symbol.iterator uses the native array iterator.
 */
OseoResult oseo_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
) {
    *next_method = oseo_undefined();
    OseoValue slots[3] = {iterable, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_internal_well_known_symbol(context, OSEO_WELL_KNOWN_ITERATOR);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Symbol.iterator method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[2],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[1], slots[2]);
        *next_method = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(*next_method)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator next method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * IteratorStep and IteratorValue: call next(), validate the result is
 * an object, and read its done and value fields. A truthy done reports
 * exhaustion.
 */
OseoResult oseo_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    /* The next method captured by GetIterator is reused every step. */
    OseoValue slots[3] = {iterator, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        next_method,
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "done");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
        }
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && !is_done) {
        result = ascii_iterator_string(context, "value");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            *value = result.value;
            *done = false;
        }
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!*done));
}

/*
 * IteratorComplete over one delegation step's result, followed by
 * IteratorValue only when the step is done. A step that is not done
 * reports the inner result object itself, because GeneratorYield
 * forwards it to the resuming consumer unchanged; reading `value` there
 * would observe a getter the specification never runs.
 */
static OseoResult delegate_result_fields(
    OseoContext *context,
    OseoValue inner,
    OseoValue *result_value,
    bool *done
) {
    OseoValue slots[2] = {inner, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *done = oseo_to_boolean(result.value);
        if (!*done) {
            *result_value = slots[0];
            oseo_roots_pop(context, &frame);
            return normal(oseo_boolean(true));
        }
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) *result_value = result.value;
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(false));
}

OseoResult oseo_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *result_value,
    bool *done
) {
    *result_value = oseo_undefined();
    *done = true;
    /* The sent value occupies its own root slot so it can be passed as
     * the one-element argument list the specification requires. */
    OseoValue slots[3] = {iterator, next_method, sent};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        1u,
        &slots[2],
        oseo_undefined()
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = delegate_result_fields(
            context,
            slots[2],
            result_value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *result_value,
    bool *done
) {
    /* GetMethod reports undefined for both an absent and a null method,
     * and the delegating body then leaves through the return completion
     * carrying the value the resumption delivered. */
    *result_value = sent;
    *done = true;
    OseoValue slots[3] = {iterator, oseo_undefined(), sent};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_boolean(false));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            1u,
            &slots[2],
            oseo_undefined()
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = delegate_result_fields(
            context,
            slots[2],
            result_value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_iterator_delegate_throw(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *result_value,
    bool *done
) {
    *result_value = oseo_undefined();
    *done = true;
    OseoValue slots[3] = {iterator, oseo_undefined(), sent};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "throw");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = oseo_iterator_close(context, slots[0], 0u);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator has no throw method."
            );
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        result = oseo_iterator_close(context, slots[0], 0u);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator throw method is not callable."
            );
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            1u,
            &slots[2],
            oseo_undefined()
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = delegate_result_fields(
            context,
            slots[2],
            result_value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * IteratorClose: if the iterator has a callable return method, call it.
 * When closing because of an in-flight error the original completion is
 * preserved, so a catchable throw or non-object return result is
 * discarded, but a non-catchable resource or host diagnostic still
 * propagates.
 */
OseoResult oseo_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
) {
    if (!is_object(iterator)) return normal(oseo_undefined());
    OseoValue slots[3] = {iterator, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        if (from_error) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_undefined());
        }
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    }
    if (from_error) {
        if (result.status == OSEO_STATUS_THROW && context->has_diagnostic) {
            oseo_roots_pop(context, &frame);
            return result;
        }
        oseo_context_clear_language_error(context);
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(result.value)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_undefined());
}

/*
 * CreateAsyncFromSyncIterator over an already acquired synchronous
 * iterator. The wrapper is an internal record rather than an object with
 * methods: nothing outside this file reads it, so it needs no prototype
 * and no own properties, and the asynchronous step and close entry
 * points recognize it by its flag.
 */
static OseoResult async_from_sync_create(
    OseoContext *context,
    OseoValue sync_iterator
) {
    OseoValue slots[1] = {sync_iterator};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_create(context, oseo_null());
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *wrapper = ordinary_object(result.value);
        wrapper->async_from_sync = true;
        wrapper->async_sync_iterator = slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetIterator(iterable, async): read the Symbol.asyncIterator method and
 * call it, then capture the resulting iterator's next method once. A
 * value with no such method falls back to GetIterator(iterable, sync)
 * and wraps that record, which is what makes a synchronous iterable
 * usable by a `for await` head.
 */
OseoResult oseo_async_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
) {
    *next_method = oseo_undefined();
    OseoValue slots[3] = {iterable, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ASYNC_ITERATOR
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not async iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_iterator_get(context, slots[0], next_method);
        slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_create(context, slots[1]);
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Symbol.asyncIterator method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[2],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[1], slots[2]);
        *next_method = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(*next_method)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator next method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * AsyncFromSyncIteratorContinuation over one synchronous step result:
 * read `done` and `value`, then await the value. The value is awaited
 * even for the step that reports exhaustion, because the wrapper
 * promises a settled result object either way, and a rejected value
 * therefore reaches the head as a rejected step rather than as an
 * exhausted iterator. The specification closes the synchronous iterator
 * when `close_on_rejection` applies and the awaited stepped value rejects.
 * The original rejection remains authoritative over close-time failures.
 */
static OseoResult async_from_sync_fields(
    OseoContext *context,
    OseoValue step_result,
    OseoValue *value,
    bool *done
) {
    OseoValue slots[2] = {step_result, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *value = slots[1];
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

static OseoResult async_from_sync_continuation(
    OseoContext *context,
    OseoValue sync_iterator,
    OseoValue step_result,
    bool close_on_rejection,
    OseoValue *value,
    bool *done
) {
    OseoValue slots[3] = {
        sync_iterator,
        step_result,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool is_done = true;
    OseoResult result = async_from_sync_fields(
        context,
        slots[1],
        &slots[2],
        &is_done
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[2]);
    }
    if (result.status == OSEO_STATUS_THROW &&
        !context->has_diagnostic && !is_done && close_on_rejection) {
        slots[2] = result.value;
        OseoResult closed = oseo_iterator_close(context, slots[0], true);
        if (closed.status == OSEO_STATUS_THROW && context->has_diagnostic) {
            result = closed;
        } else {
            result = (OseoResult){OSEO_STATUS_THROW, slots[2]};
        }
    }
    /* Both roles this continuation serves read the awaited value: a
     * `for await` step ignores it once the iterator reports exhaustion,
     * while a `yield*` delegation step reports it as its own result. */
    if (result.status == OSEO_STATUS_NORMAL) {
        *value = result.value;
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

/*
 * Converts one caught language throw into the promise a wrapper method
 * returns. Host diagnostics remain terminal and are never converted.
 */
static OseoResult rejected_async_step(
    OseoContext *context,
    OseoResult completion
) {
    if (completion.status != OSEO_STATUS_THROW ||
        context->has_diagnostic) {
        return completion;
    }
    OseoValue slots[2] = {completion.value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    oseo_context_clear_language_error(context);
    OseoResult result = oseo_internal_promise_create(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_reject_into(
            context,
            slots[1],
            slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * The fulfillment reaction of AsyncFromSyncIteratorContinuation. Its
 * environment retains the `done` field read before the stepped value was
 * awaited, and fulfillment creates the wrapper method's result object.
 */
OseoResult oseo_internal_async_from_sync_fulfilled(
    OseoContext *context,
    OseoValue callee,
    OseoValue value
) {
    OseoValue slots[2] = {callee, value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_function_environment(context, slots[0]);
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_get(context, slots[0], 0u);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_result(
            context,
            slots[1],
            oseo_to_boolean(result.value)
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Rejection reaction used when AsyncFromSyncIteratorContinuation was
 * requested with closeOnRejection. IteratorClose observes the wrapped
 * synchronous iterator, while its throw precedence keeps `reason` as the
 * rejection even when `return` throws or reports a non-object result.
 */
OseoResult oseo_internal_async_from_sync_rejected(
    OseoContext *context,
    OseoValue callee,
    OseoValue reason
) {
    OseoValue slots[2] = {callee, reason};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_function_environment(context, slots[0]);
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_get(context, slots[0], 0u);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_iterator_close(context, result.value, true);
    }
    if (result.status == OSEO_STATUS_NORMAL || !context->has_diagnostic) {
        result = (OseoResult){OSEO_STATUS_THROW, slots[1]};
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Builds the promise returned by one AsyncFromSyncIterator method after
 * its synchronous result object has been obtained. The wrapper's own
 * continuation awaits the stepped value and creates a fresh iterator result;
 * generated code then performs the outer Await without draining here.
 */
static OseoResult async_from_sync_promise(
    OseoContext *context,
    OseoValue sync_iterator,
    OseoValue step_result,
    bool close_on_rejection
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = sync_iterator;
    frame.slots[1] = step_result;
    frame.slots[6] = oseo_undefined();
    bool done = true;
    result = async_from_sync_fields(
        context,
        frame.slots[1],
        &frame.slots[2],
        &done
    );
    if (result.status != OSEO_STATUS_NORMAL) {
        result = rejected_async_step(context, result);
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_environment_create(context, 1u);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[3],
            0u,
            oseo_boolean(done)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_ASYNC_FROM_SYNC_FULFILL_CODE_ID,
            frame.slots[3],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve(context, frame.slots[2]);
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        close_on_rejection && !done) {
        result = oseo_environment_create(context, 1u);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_environment_set(
                context,
                frame.slots[3],
                0u,
                frame.slots[0]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_function_create(
                context,
                OSEO_ASYNC_FROM_SYNC_REJECT_CLOSE_CODE_ID,
                frame.slots[3],
                NULL,
                0u,
                1u,
                OSEO_FUNCTION_INTERNAL,
                oseo_undefined(),
                oseo_undefined(),
                OSEO_FUNCTION_NAME_PREFIX_NONE
            );
            frame.slots[6] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_then(
            context,
            frame.slots[5],
            frame.slots[4],
            frame.slots[6]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Calls one wrapped synchronous method and converts every abrupt path into
 * the wrapper promise's rejection before returning to generated code.
 */
static OseoResult async_from_sync_start(
    OseoContext *context,
    OseoValue target,
    OseoValue method,
    size_t argument_count,
    OseoValue *arguments,
    bool close_on_rejection
) {
    OseoValue slots[3] = {target, method, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        argument_count,
        arguments,
        oseo_undefined()
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_from_sync_promise(
            context,
            slots[0],
            slots[2],
            close_on_rejection
        );
    } else {
        result = rejected_async_step(context, result);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * The Await that a `for await` head and AsyncIteratorClose each perform on
 * the promise a wrapper method returns, whatever that promise settles to.
 * Every path through AsyncFromSyncIteratorPrototype.next and .return
 * produces one, so the jobs queued before the step or the close run before
 * the awaiting body resumes. It is a turn of its own even when the
 * wrapper's own continuation already awaited the stepped value, because
 * that inner await only settles the promise this one waits on. An abrupt
 * path reaches it too, because IfAbruptRejectPromise rejects that same
 * promise rather than throwing to the caller. The pending completion is
 * carried across the drain the way the entry task checkpoint carries one,
 * because the jobs it runs may raise and clear language errors of their
 * own.
 */
static OseoResult await_wrapper_promise(
    OseoContext *context,
    OseoResult completion
) {
    /* A host diagnostic is terminal, so no further job runs after it. */
    if (completion.status == OSEO_STATUS_THROW && context->has_diagnostic) {
        return completion;
    }
    const char *error_code = context->error_code;
    const char *error_message = context->error_message;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    bool had_diagnostic = context->has_diagnostic;
    OseoValue slots[1] = {completion.value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult drained = oseo_internal_await_step(context, oseo_undefined());
    oseo_roots_pop(context, &frame);
    if (drained.status != OSEO_STATUS_NORMAL && context->has_diagnostic) {
        return drained;
    }
    if (completion.status == OSEO_STATUS_NORMAL) {
        if (drained.status != OSEO_STATUS_NORMAL) return drained;
        drained.value = slots[0];
        return drained;
    }
    context->error_code = error_code;
    context->error_message = error_message;
    context->has_diagnostic = had_diagnostic;
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    context->line = line;
    context->column = column;
    completion.value = slots[0];
    return completion;
}

OseoResult oseo_async_iterator_next_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method
) {
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[3] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        next_method,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result;
    if (from_sync) {
        result = async_from_sync_start(
            context,
            slots[0],
            slots[1],
            0u,
            NULL,
            true
        );
    } else {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, slots[2]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_result(
    OseoContext *context,
    OseoValue settled,
    bool value_only,
    bool value_when_done,
    OseoValue iterator,
    bool throw_on_value_only,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    if (value_only) {
        if (throw_on_value_only) {
            if (!is_async_from_sync_iterator(iterator) &&
                !is_object(settled)) {
                return oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "The iterator return result is not an object."
                );
            }
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The delegated iterator has no throw method."
            );
        }
        *value = settled;
        return normal(oseo_boolean(false));
    }
    if (!is_object(settled)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator result is not an object."
        );
    }
    OseoValue slots[2] = {settled, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL &&
        (value_when_done || !is_done)) {
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        (value_when_done || !is_done)) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        if (value_when_done || !is_done) *value = slots[1];
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

/*
 * One asynchronous iteration step: call the captured next method, await
 * its result, require an object, and read `done` and `value`. A wrapped
 * synchronous iterator instead runs the wrapper's own continuation, which
 * awaits the stepped value, and the head then awaits the promise that
 * continuation settles, so the two records report the same contract to one
 * loop lowering across the same number of turns.
 */
OseoResult oseo_async_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[4] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        next_method,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    slots[2] = result.value;
    if (from_sync) {
        if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator result is not an object."
            );
        }
        bool stepped_done = true;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_continuation(
                context,
                slots[0],
                slots[2],
                true,
                &slots[3],
                &stepped_done
            );
        }
        /*
         * The head awaits the promise the wrapper's next method returned,
         * which the continuation's await of the stepped value only settles.
         * The stepped value stays rooted across that turn and reaches the
         * caller only once it survives, because the drain runs jobs that
         * allocate.
         */
        result = await_wrapper_promise(context, result);
        if (result.status == OSEO_STATUS_NORMAL && !stepped_done) {
            *value = slots[3];
            *done = false;
        }
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(!*done));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[2]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "done");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[2], slots[3]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && !is_done) {
        result = ascii_iterator_string(context, "value");
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[2], slots[3]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            *value = result.value;
            *done = false;
        }
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!*done));
}

/*
 * Starts AsyncIteratorClose without draining. A native asynchronous
 * iterator with no `return` completes immediately. The internal
 * Async-from-Sync wrapper instead always returns a promise, converting its
 * synchronous abrupt paths into rejection before generated code awaits it.
 */
OseoResult oseo_async_iterator_close_start(
    OseoContext *context,
    OseoValue iterator,
    bool from_error,
    OseoValue *skip_validation,
    bool *needs_await
) {
    *skip_validation = oseo_boolean(false);
    *needs_await = false;
    if (!is_object(iterator)) return normal(oseo_undefined());
    bool from_sync = is_async_from_sync_iterator(iterator);
    if (from_sync) *skip_validation = oseo_boolean(true);
    OseoValue slots[3] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        if (from_sync) {
            result = oseo_promise_resolve(context, oseo_undefined());
            *needs_await = result.status == OSEO_STATUS_NORMAL;
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               !is_function(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[2] = result.value;
        if (from_sync) {
            if (result.status == OSEO_STATUS_NORMAL &&
                !is_object(slots[2])) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "The iterator return result is not an object."
                );
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = async_from_sync_promise(
                    context,
                    slots[0],
                    slots[2],
                    false
                );
            } else {
                result = rejected_async_step(context, result);
            }
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, slots[2]);
        }
        *needs_await = result.status == OSEO_STATUS_NORMAL;
    }
    if (from_sync && result.status == OSEO_STATUS_THROW &&
        !context->has_diagnostic) {
        result = rejected_async_step(context, result);
        *needs_await = result.status == OSEO_STATUS_NORMAL;
    } else if (from_error && result.status == OSEO_STATUS_THROW &&
               !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = normal(oseo_undefined());
        *needs_await = false;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_close_result(
    OseoContext *context,
    OseoValue settled,
    bool ignore_result,
    bool skip_validation
) {
    if (ignore_result || skip_validation) return normal(oseo_undefined());
    if (!is_object(settled)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    return normal(oseo_undefined());
}

/*
 * AsyncIteratorClose: call a callable return method and await its
 * result, which must be an object. A wrapped synchronous iterator instead
 * runs AsyncFromSyncIteratorPrototype.return, which requires an object
 * result and reads and awaits its `done` and `value`, and reports a
 * completed iterator result when the synchronous iterator declares no
 * `return` at all. Every wrapper path therefore reaches an Await. As in
 * the synchronous close, an in-flight error keeps the original completion,
 * which is why the result check runs after that precedence.
 */
OseoResult oseo_async_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
) {
    if (!is_object(iterator)) return normal(oseo_undefined());
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[3] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        if (!from_sync) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_undefined());
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               !is_function(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[2] = result.value;
        if (!from_sync) {
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_await_step(context, slots[2]);
                slots[2] = result.value;
            }
        } else if (result.status == OSEO_STATUS_NORMAL &&
                   !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator return result is not an object."
            );
        } else if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue stepped = oseo_undefined();
            bool done = true;
            result = async_from_sync_continuation(
                context,
                slots[0],
                slots[2],
                false,
                &stepped,
                &done
            );
        }
    }
    /*
     * AsyncIteratorClose awaits the wrapper's promise, which is a turn of
     * its own: the continuation's await of the stepped value settles that
     * promise rather than consuming this one.
     */
    if (from_sync) result = await_wrapper_promise(context, result);
    if (from_error) {
        // The in-flight error stays authoritative, so the result check
        // below never runs and only a host diagnostic propagates.
        if (result.status == OSEO_STATUS_THROW && context->has_diagnostic) {
            oseo_roots_pop(context, &frame);
            return result;
        }
        oseo_context_clear_language_error(context);
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    /* A wrapped iterator resolves to a fresh iterator result object, so
     * only a native asynchronous iterator can report a non-object here. */
    if (result.status == OSEO_STATUS_NORMAL && !from_sync &&
        !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_undefined());
}

/*
 * `done` and `value` of one awaited asynchronous delegation result.
 * Unlike the synchronous delegation, which forwards the inner result
 * object unchanged, an asynchronous `yield*` reports IteratorValue for
 * every step, because AsyncGeneratorYield produces the outer step.
 */
static OseoResult async_delegate_result_fields(
    OseoContext *context,
    OseoValue inner,
    OseoValue *result_value,
    bool *done
) {
    OseoValue slots[2] = {inner, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *result_value = result.value;
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

/*
 * One asynchronous delegation step: call `method` with `argument`, await
 * its result, and read `done` and `value`. A wrapped synchronous
 * iterator runs the wrapper's own continuation, which awaits the stepped
 * value, and the step then awaits the promise that continuation settles,
 * so both records spend the same number of turns per step.
 */
static OseoResult async_delegate_invoke(
    OseoContext *context,
    OseoValue target,
    bool from_sync,
    bool close_on_rejection,
    OseoValue method,
    OseoValue argument,
    OseoValue *value,
    bool *done
) {
    OseoValue slots[3] = {target, method, argument};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        1u,
        &slots[2],
        oseo_undefined()
    );
    slots[2] = result.value;
    if (from_sync) {
        if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator result is not an object."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_continuation(
                context,
                slots[0],
                slots[2],
                close_on_rejection,
                value,
                done
            );
        }
        result = await_wrapper_promise(context, result);
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(!*done));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[2]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_result_fields(context, slots[2], value, done);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The iterator a delegation step actually calls its method on. */
static OseoValue delegation_target(OseoValue iterator) {
    return is_async_from_sync_iterator(iterator)
        ? ordinary_object(iterator)->async_sync_iterator
        : iterator;
}

OseoResult oseo_async_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    return async_delegate_invoke(
        context,
        delegation_target(iterator),
        is_async_from_sync_iterator(iterator),
        true,
        next_method,
        sent,
        value,
        done
    );
}

/*
 * GetMethod over one delegation step's named method. An absent or null
 * method reports no method rather than an error, which is what lets a
 * return step end the delegation and a throw step close the iterator.
 */
static OseoResult delegate_method(
    OseoContext *context,
    OseoValue target,
    const char *name,
    OseoValue *method,
    bool *present
) {
    *method = oseo_undefined();
    *present = false;
    OseoValue slots[2] = {target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, name);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_nullish(slots[1])) {
        if (!is_function(slots[1])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator method is not callable."
            );
        } else {
            *method = slots[1];
            *present = true;
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult async_delegate_start_invoke(
    OseoContext *context,
    OseoValue iterator,
    OseoValue method,
    OseoValue argument,
    bool close_on_rejection
) {
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[4] = {
        iterator,
        delegation_target(iterator),
        method,
        argument,
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result;
    if (from_sync) {
        result = async_from_sync_start(
            context,
            slots[1],
            slots[2],
            1u,
            &slots[3],
            close_on_rejection
        );
    } else {
        result = oseo_call_function(
            context,
            slots[2],
            slots[1],
            1u,
            &slots[3],
            oseo_undefined()
        );
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, slots[3]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_next_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value_only
) {
    *value_only = oseo_boolean(false);
    return async_delegate_start_invoke(
        context,
        iterator,
        next_method,
        sent,
        true
    );
}

OseoResult oseo_async_iterator_delegate_return_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value_only
) {
    *value_only = oseo_boolean(false);
    OseoValue slots[3] = {iterator, sent, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "return",
        &slots[2],
        &present
    );
    if (result.status != OSEO_STATUS_NORMAL) {
        if (is_async_from_sync_iterator(slots[0])) {
            result = rejected_async_step(context, result);
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (present) {
        result = async_delegate_start_invoke(
            context,
            slots[0],
            slots[2],
            slots[1],
            false
        );
    } else if (is_async_from_sync_iterator(slots[0])) {
        result = oseo_internal_iterator_result(context, slots[1], true);
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, slots[2]);
        }
    } else {
        *value_only = oseo_boolean(true);
        result = oseo_promise_resolve(context, slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_throw_start(
    OseoContext *context,
    OseoValue iterator,
    OseoValue reason,
    OseoValue *value_only
) {
    *value_only = oseo_boolean(false);
    OseoValue slots[3] = {iterator, reason, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "throw",
        &slots[2],
        &present
    );
    if (result.status != OSEO_STATUS_NORMAL) {
        if (is_async_from_sync_iterator(slots[0])) {
            result = rejected_async_step(context, result);
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (!present) {
        if (is_async_from_sync_iterator(slots[0])) {
            result = oseo_iterator_close(
                context,
                delegation_target(slots[0]),
                false
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "The delegated iterator has no throw method."
                );
            }
            result = rejected_async_step(context, result);
        } else {
            bool needs_await = false;
            OseoValue ignore_result = oseo_boolean(false);
            result = oseo_async_iterator_close_start(
                context,
                slots[0],
                false,
                &ignore_result,
                &needs_await
            );
            if (result.status == OSEO_STATUS_NORMAL && needs_await) {
                *value_only = oseo_boolean(true);
            } else if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "The delegated iterator has no throw method."
                );
            }
        }
    } else {
        result = async_delegate_start_invoke(
            context,
            slots[0],
            slots[2],
            slots[1],
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value,
    bool *done
) {
    /* An iterator with no `return` method reports done with the value the
     * resumption delivered, which is the return completion the delegating
     * body then leaves through. That path is still a turn: a native
     * asynchronous iterator awaits the delivered value itself, and a
     * wrapped synchronous one runs
     * AsyncFromSyncIteratorPrototype.return, which resolves its own
     * promise with a completed result object built from the unawaited
     * value and leaves the delegation awaiting that promise. Both spend
     * exactly one turn, so a `return` delivered into a delegation resumes
     * the delegating body at the same point either way. */
    *value = sent;
    *done = true;
    OseoValue slots[3] = {iterator, sent, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "return",
        &slots[2],
        &present
    );
    if (result.status == OSEO_STATUS_NORMAL && !present) {
        if (is_async_from_sync_iterator(slots[0])) {
            /* The wrapper reports the delivered value unchanged, so only
             * the promise it settles is awaited here. */
            result = await_wrapper_promise(context, normal(slots[1]));
        } else {
            result = oseo_internal_await_step(context, slots[1]);
            if (result.status == OSEO_STATUS_NORMAL) *value = result.value;
        }
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(false));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_invoke(
            context,
            delegation_target(slots[0]),
            is_async_from_sync_iterator(slots[0]),
            false,
            slots[2],
            slots[1],
            value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_throw(
    OseoContext *context,
    OseoValue iterator,
    OseoValue reason,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    OseoValue slots[3] = {iterator, reason, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "throw",
        &slots[2],
        &present
    );
    /* The delegating body has no way to deliver a throw completion to an
     * iterator that declares no `throw`, so it closes that iterator and
     * reports a TypeError instead. An abrupt close replaces it. */
    if (result.status == OSEO_STATUS_NORMAL && !present) {
        bool from_sync = is_async_from_sync_iterator(slots[0]);
        result = from_sync
            ? oseo_iterator_close(
                context,
                delegation_target(slots[0]),
                false
            )
            : oseo_async_iterator_close(context, slots[0], false);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The delegated iterator has no throw method."
            );
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_invoke(
            context,
            delegation_target(slots[0]),
            is_async_from_sync_iterator(slots[0]),
            true,
            slots[2],
            slots[1],
            value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}
