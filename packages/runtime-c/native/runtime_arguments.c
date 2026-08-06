#include "runtime_internal.h"

OseoResult oseo_internal_arguments_builtin_dispatch(
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
    (void)argument_count;
    (void)arguments;
    (void)new_target;
    if (code_id != OSEO_THROW_TYPE_ERROR_CODE_ID) {
        return oseo_unknown_function(context, code_id);
    }
    /* %ThrowTypeError%. Both accessor halves throw regardless of their
     * receiver or argument. */
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "'callee' is not available on an unmapped arguments object."
    );
}

/*
 * The arguments exotic objects: the unmapped object 10.2.4 creates, the
 * mapped object 10.4.4 creates from a simple parameter list, the
 * `@@iterator` both shapes define, and the realm's single
 * %ThrowTypeError% intrinsic their `callee` accessor reports.
 */

/*
 * %ThrowTypeError% (10.2.4.1). One anonymous, zero-parameter function
 * per realm, so an unmapped arguments object's `callee` accessor reports
 * the same [[Get]] and [[Set]] identity every time it is inspected. Its
 * own body only throws, and the caller's arguments never reach it.
 *
 * 10.2.4.1 also hardens the intrinsic: its `length` and `name` are
 * non-writable and non-configurable, and the function itself is
 * non-extensible, so admitted reflection can neither reshape it nor
 * replace its prototype. `oseo_function_create` leaves both properties
 * configurable, so they are redefined before extensibility is dropped.
 * The `prototype` object every internal function in this profile still
 * carries is a separate boundary the intrinsics stream owns.
 */
OseoResult oseo_internal_throw_type_error_function(OseoContext *context) {
    OseoValue *cache =
        &context->intrinsics[OSEO_INTRINSIC_THROW_TYPE_ERROR];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) {
        return normal(*cache);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_environment_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_THROW_TYPE_ERROR_CODE_ID,
            frame.slots[0],
            NULL,
            0u,
            0u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[0] = result.value;
    }
    const OseoPropertyAttributes frozen =
        (OseoPropertyAttributes){false, false, false, false};
    const char *const hardened[] = {"length", "name"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = oseo_internal_ascii_string(context, hardened[index]);
        frame.slots[1] = result.value;
        OseoValue existing = oseo_undefined();
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
            existing = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                existing,
                frozen
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])->extensible = false;
        *cache = frame.slots[0];
        result = normal(frame.slots[0]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Both arguments object shapes define `@@iterator` as an ordinary
 * writable, non-enumerable, configurable data property whose value is
 * the same %Array.prototype.values% function an array's own
 * `Symbol.iterator` resolves to, so spreading or iterating an arguments
 * object walks its indices through the same array iterator, which reads
 * a non-array target's `length` the way LengthOfArrayLike does.
 */
static OseoResult arguments_define_iterator(
    OseoContext *context,
    OseoValue object
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    result = oseo_internal_well_known_symbol(context, OSEO_WELL_KNOWN_ITERATOR);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result =
            oseo_internal_iterator_method(context, OSEO_ARRAY_VALUES_CODE_ID);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes attributes =
            (OseoPropertyAttributes){true, false, true, false};
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            attributes
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_arguments_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Arguments are missing.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_literal_create(context);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])->arguments_object = true;
    }
    const OseoPropertyAttributes indexed =
        (OseoPropertyAttributes){true, true, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        result = oseo_property_key(context, oseo_number((double)index));
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                arguments[index],
                indexed
            );
        }
    }
    const OseoPropertyAttributes metadata =
        (OseoPropertyAttributes){true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "length");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            oseo_number((double)argument_count),
            metadata
        );
    }
    /*
     * CreateUnmappedArgumentsObject poisons `callee` unconditionally: it
     * is a non-configurable accessor whose [[Get]] and [[Set]] are both
     * %ThrowTypeError%, so the running function never leaks through an
     * unmapped arguments object, whatever the caller's strictness. Only
     * the mapped object still exposes the ordinary data property.
     */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_throw_type_error_function(context);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "callee");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes poisoned =
            (OseoPropertyAttributes){false, false, false, true};
        result = oseo_object_define_accessor(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            frame.slots[2],
            true,
            true,
            poisoned
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = arguments_define_iterator(context, frame.slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * CreateMappedArgumentsObject (10.4.4.7), admitted only for a non-strict
 * function whose parameter list is simple. `mapped_indices` names, in
 * ascending order, exactly the indices that are the rightmost formal
 * parameter of their name, and `mapped_binding_ids` gives each of those
 * indices its parameter's own environment binding id at the same
 * position; both are empty for a supplied index that is a duplicate
 * name's non-rightmost occurrence, or at or beyond the parameter count,
 * since ECMA-262 maps only the rightmost occurrence of a declared
 * parameter position. Defining a mapped index's property with its
 * parameter's own binding cell as the stored value, rather than the
 * plain snapshot value an unmapped arguments object stores, is what
 * makes oseo_internal_cell_backed_property recognize it afterward: every later
 * [[Get]]/[[Set]]/[[GetOwnProperty]]/[[DefineOwnProperty]]/[[Delete]]
 * on the index then reaches the parameter through the existing
 * cell-backed property machinery with no exotic method table of its
 * own.
 */
OseoResult oseo_mapped_arguments_create(
    OseoContext *context,
    OseoValue environment,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments,
    const size_t *mapped_indices,
    const size_t *mapped_binding_ids,
    size_t mapped_count
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Arguments are missing.");
    }
    if (mapped_count > 0u &&
        (mapped_indices == NULL || mapped_binding_ids == NULL)) {
        return failure(context, "OSEO2001", "Mapped parameters are missing.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[2] = callee;
    result = oseo_object_literal_create(context);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])->arguments_object = true;
        ordinary_object(frame.slots[0])->mapped_arguments = true;
    }
    const OseoPropertyAttributes indexed =
        (OseoPropertyAttributes){true, true, true, false};
    size_t mapped_position = 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        bool is_mapped = mapped_position < mapped_count &&
            mapped_indices[mapped_position] == index;
        if (is_mapped) {
            result = oseo_environment_get(
                context,
                environment,
                mapped_binding_ids[mapped_position]
            );
            mapped_position += 1u;
        } else {
            result = normal(arguments[index]);
        }
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_property_key(context, oseo_number((double)index));
            frame.slots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                frame.slots[3],
                indexed
            );
        }
    }
    const OseoPropertyAttributes metadata =
        (OseoPropertyAttributes){true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "length");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            oseo_number((double)argument_count),
            metadata
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "callee");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            metadata
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = arguments_define_iterator(context, frame.slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}
