#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Environments, binding cells, and module namespaces.
 */

OseoResult oseo_environment_create(OseoContext *context, size_t slot_count) {
    if (slot_count >
        (SIZE_MAX - sizeof(OseoEnvironment)) / sizeof(OseoValue)) {
        return failure(
            context,
            "OSEO2001",
            "Environment allocation is too large."
        );
    }
    size_t size = sizeof(OseoEnvironment) +
        slot_count * sizeof(OseoValue);
    OseoEnvironment *environment =
        oseo_internal_allocate_heap_bytes(context, size);
    if (environment == NULL) {
        return failure(context, "OSEO2001", "Environment allocation failed.");
    }
    environment->slot_count = slot_count;
    for (size_t index = 0u; index < slot_count; index += 1u) {
        environment->slots[index] = oseo_undefined();
    }
    return oseo_internal_publish_heap(
        context,
        &environment->header,
        OSEO_HEAP_ENVIRONMENT
    );
}

OseoResult oseo_environment_get(
    OseoContext *context,
    OseoValue environment_value,
    size_t index
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    OseoEnvironment *environment = environment_object(environment_value);
    if (index >= environment->slot_count) {
        return failure(context, "OSEO2001", "Environment index is invalid.");
    }
    return normal(environment->slots[index]);
}

OseoResult oseo_environment_set(
    OseoContext *context,
    OseoValue environment_value,
    size_t index,
    OseoValue value
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    OseoEnvironment *environment = environment_object(environment_value);
    if (index >= environment->slot_count) {
        return failure(context, "OSEO2001", "Environment index is invalid.");
    }
    environment->slots[index] = value;
    return normal(value);
}

OseoResult oseo_environment_clone(
    OseoContext *context,
    OseoValue environment_value
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    size_t slot_count = environment_object(environment_value)->slot_count;
    OseoResult created = oseo_environment_create(context, slot_count);
    if (created.status != OSEO_STATUS_NORMAL) return created;
    OseoEnvironment *source = environment_object(environment_value);
    OseoEnvironment *target = environment_object(created.value);
    if (slot_count > 0u) {
        memcpy(
            target->slots,
            source->slots,
            slot_count * sizeof(*target->slots)
        );
    }
    return created;
}

OseoResult oseo_cell_create(OseoContext *context, OseoValue value) {
    OseoCell *cell = oseo_internal_allocate_heap_bytes(context, sizeof(*cell));
    if (cell == NULL) {
        return failure(context, "OSEO2001", "Binding cell allocation failed.");
    }
    cell->value = value;
    cell->object = oseo_undefined();
    cell->key = oseo_undefined();
    cell->object_environment = false;
    cell->writable = true;
    return oseo_internal_publish_heap(context, &cell->header, OSEO_HEAP_CELL);
}

/* Object Environment Record HasBinding uses [[HasProperty]], including
 * inherited properties. The key is already a property key, so this walk
 * needs neither coercion nor an allocation safepoint. */
static bool object_environment_has_property(
    OseoValue object_value,
    OseoValue key
) {
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        if (oseo_internal_own_descriptor(
            current,
            key,
            &value,
            &attributes,
            &getter,
            &setter
        )) {
            return true;
        }
        current = ordinary_object(current)->prototype;
    }
    return false;
}

OseoResult oseo_cell_get(OseoContext *context, OseoValue cell_value) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    OseoCell *cell = cell_object(cell_value);
    if (cell->object_environment) {
        if (!object_environment_has_property(cell->object, cell->key)) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_REFERENCE,
                "Global binding does not exist."
            );
        }
        return oseo_object_get(context, cell->object, cell->key);
    }
    return oseo_read_binding(context, cell->value);
}

OseoResult oseo_cell_set(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (tag_of(cell_object(cell_value)->value) == OSEO_TAG_UNINITIALIZED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_REFERENCE,
            "Binding was assigned before initialization."
        );
    }
    cell_object(cell_value)->value = value;
    return normal(value);
}

OseoResult oseo_cell_initialize(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (tag_of(cell_object(cell_value)->value) != OSEO_TAG_UNINITIALIZED) {
        return failure(context, "OSEO2001", "Binding is already initialized.");
    }
    cell_object(cell_value)->value = value;
    return normal(value);
}

OseoResult oseo_module_namespace_create(
    OseoContext *context,
    OseoValue environment,
    size_t count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_ids
) {
    if (count > 0u &&
        (names == NULL || name_lengths == NULL || binding_ids == NULL)) {
        return failure(context, "OSEO2001", "Invalid module namespace.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_create(context, oseo_null());
    frame.slots[0] = result.value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < count;
         index += 1u) {
        result = oseo_string_from_units(
            context,
            names[index],
            name_lengths[index]
        );
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_environment_get(
            context,
            environment,
            binding_ids[index]
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){false, true, true, false}
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
        result = oseo_internal_ascii_string(context, "Module");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *object = ordinary_object(frame.slots[0]);
        object->dictionary = true;
        object->extensible = false;
        object->module_namespace = true;
        result.value = frame.slots[0];
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The realm's global this value, created on first use. It is an
 * ordinary extensible object created the way this profile creates an object
 * literal, so it reaches the realm-owned %Object.prototype%. A temporary
 * root owns it while standard globals are installed. Publishing only the
 * completed object keeps one permanent realm identity and lets a failed
 * installation retry instead of exposing a partial global.
 *
 * The object is not put in dictionary mode. A var-scoped Script property
 * stores its binding cell rather than its value, but the property cache
 * excludes those slots individually, so the cache still serves the
 * ordinary properties a program adds to this object.
 */
static OseoResult global_this_object(OseoContext *context) {
    if (tag_of(context->global_this) != OSEO_TAG_UNDEFINED) {
        return normal(context->global_this);
    }
    OseoResult result = oseo_object_literal_create(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[3] = {
        result.value,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    ordinary_object(frame.slots[0])->global_object = true;
    result = oseo_internal_install_object_global(context, frame.slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_array_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_number_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_string_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_promise_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_array_buffer_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_map_global(
            context,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_bigint_global(
            context,
            frame.slots[0]
        );
    }
    static const char *const intrinsic_names[] = {
        "Function",
        "Symbol",
        "Error",
        "EvalError",
        "RangeError",
        "ReferenceError",
        "SyntaxError",
        "TypeError",
        "URIError",
        "AggregateError",
        "Iterator",
    };
    static const OseoIntrinsic intrinsic_values[] = {
        OSEO_INTRINSIC_FUNCTION,
        OSEO_INTRINSIC_SYMBOL,
        OSEO_INTRINSIC_ERROR,
        OSEO_INTRINSIC_EVAL_ERROR,
        OSEO_INTRINSIC_RANGE_ERROR,
        OSEO_INTRINSIC_REFERENCE_ERROR,
        OSEO_INTRINSIC_SYNTAX_ERROR,
        OSEO_INTRINSIC_TYPE_ERROR,
        OSEO_INTRINSIC_URI_ERROR,
        OSEO_INTRINSIC_AGGREGATE_ERROR,
        OSEO_INTRINSIC_ITERATOR,
    };
    _Static_assert(
        sizeof(intrinsic_names) / sizeof(intrinsic_names[0]) ==
        sizeof(intrinsic_values) / sizeof(intrinsic_values[0]),
        "Intrinsic global tables must stay aligned."
    );
    const size_t intrinsic_count =
        sizeof(intrinsic_names) / sizeof(intrinsic_names[0]);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < intrinsic_count;
         index += 1u) {
        result = oseo_internal_intrinsic(context, intrinsic_values[index]);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_ascii_string(context, intrinsic_names[index]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const char *const value_names[] = {
        "Infinity",
        "NaN",
        "undefined",
    };
    const OseoValue value_values[] = {
        oseo_number(INFINITY),
        oseo_number(NAN),
        oseo_undefined(),
    };
    _Static_assert(
        sizeof(value_names) / sizeof(value_names[0]) ==
        sizeof(value_values) / sizeof(value_values[0]),
        "Intrinsic value tables must stay aligned."
    );
    const size_t value_count =
        sizeof(value_names) / sizeof(value_names[0]);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < value_count;
         index += 1u) {
        result = oseo_internal_ascii_string(context, value_names[index]);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_cell_create(context, value_values[index]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        cell_object(frame.slots[2])->writable = false;
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->global_this = frame.slots[0];
        result.value = frame.slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_this_value(OseoContext *context, OseoValue receiver) {
    if (is_nullish(receiver)) return global_this_object(context);
    if (!is_object(receiver)) {
        return failure(
            context,
            "OSEO2001",
            "Primitive wrapper objects are not admitted yet."
        );
    }
    return normal(receiver);
}

OseoResult oseo_global_object_create(
    OseoContext *context,
    OseoValue environment,
    size_t lexical_count,
    const uint16_t *const *lexical_names,
    const size_t *lexical_name_lengths,
    const size_t *lexical_lines,
    const size_t *lexical_columns,
    size_t binding_count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_lines,
    const size_t *binding_columns,
    const size_t *binding_ids,
    const bool *function_declarations
) {
    if ((lexical_count > 0u &&
         (lexical_names == NULL || lexical_name_lengths == NULL ||
          lexical_lines == NULL || lexical_columns == NULL)) ||
        (binding_count > 0u &&
         (names == NULL || name_lengths == NULL || binding_lines == NULL ||
          binding_columns == NULL || binding_ids == NULL ||
          function_declarations == NULL))) {
        return failure(context, "OSEO2001", "Invalid global object.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = global_this_object(context);
    frame.slots[0] = result.value;
    /* HasRestrictedGlobalProperty runs for every lexical name before any
     * var-scoped declaration changes the global object. */
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < lexical_count;
         index += 1u) {
        oseo_context_location(
            context,
            lexical_lines[index],
            lexical_columns[index]
        );
        result = oseo_string_from_units(
            context,
            lexical_names[index],
            lexical_name_lengths[index]
        );
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        bool exists = oseo_internal_own_descriptor(
            frame.slots[0],
            frame.slots[1],
            &value,
            &attributes,
            &getter,
            &setter
        );
        if (exists && !attributes.configurable) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_SYNTAX,
                "A lexical declaration shadows a restricted global."
            );
        }
    }
    /* CanDeclareGlobalFunction and CanDeclareGlobalVar validate the whole
     * declaration set before CreateGlobal*Binding mutates any property. */
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < binding_count;
         index += 1u) {
        oseo_context_location(
            context,
            binding_lines[index],
            binding_columns[index]
        );
        result = oseo_string_from_units(
            context,
            names[index],
            name_lengths[index]
        );
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        bool exists = oseo_internal_own_descriptor(
            frame.slots[0],
            frame.slots[1],
            &value,
            &attributes,
            &getter,
            &setter
        );
        bool allowed = exists
            ? !function_declarations[index] || attributes.configurable ||
                (!attributes.accessor && attributes.writable &&
                 attributes.enumerable)
            : ordinary_object(frame.slots[0])->extensible;
        if (!allowed) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "A global declaration is not permitted."
            );
        }
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < binding_count;
         index += 1u) {
        result = oseo_string_from_units(
            context,
            names[index],
            name_lengths[index]
        );
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_environment_get(
            context,
            environment,
            binding_ids[index]
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (!is_cell(frame.slots[2])) {
            result = failure(
                context,
                "OSEO2001",
                "A global object property needs a binding cell."
            );
            break;
        }
        OseoValue current = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        bool exists = oseo_internal_own_descriptor(
            frame.slots[0],
            frame.slots[1],
            &current,
            &attributes,
            &getter,
            &setter
        );
        if (!exists) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                frame.slots[2],
                (OseoPropertyAttributes){false, true, true, false}
            );
            continue;
        }
        OseoOrdinaryObject *object = ordinary_object(frame.slots[0]);
        size_t property_index = oseo_internal_own_property_index(
            object,
            frame.slots[1]
        );
        if (property_index == SIZE_MAX) {
            result = failure(context, "OSEO2001", "Global property vanished.");
            break;
        }
        OseoValue cell = object->properties[property_index].value;
        if (!oseo_internal_cell_backed_property(frame.slots[0], cell)) {
            OseoCell *binding = cell_object(frame.slots[2]);
            binding->object = frame.slots[0];
            binding->key = frame.slots[1];
            binding->object_environment = true;
            cell = frame.slots[2];
        } else {
            result = oseo_environment_set(
                context,
                environment,
                binding_ids[index],
                cell
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        }
        object = ordinary_object(frame.slots[0]);
        OseoProperty *property = &object->properties[property_index];
        if (function_declarations[index] &&
            !cell_object(cell)->object_environment) {
            property->attributes =
                (OseoPropertyAttributes){false, true, true, false};
            object->dictionary = true;
            object->shape_id = context->next_shape_id;
            context->next_shape_id += 1u;
        }
        if (!cell_object(cell)->object_environment) {
            cell_object(cell)->writable = property->attributes.writable;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_global_binding_set(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value,
    bool strict
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    OseoCell *cell = cell_object(cell_value);
    if (cell->object_environment) {
        bool exists =
            object_environment_has_property(cell->object, cell->key);
        if (!exists && strict) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_REFERENCE,
                "Global binding does not exist."
            );
        }
        return oseo_object_set(
            context,
            cell->object,
            cell->key,
            value,
            strict
        );
    }
    /*
     * A global var or function binding is an object environment record
     * binding, so SetMutableBinding writes through the global object's
     * property. Once [[DefineOwnProperty]] made that property
     * non-writable, the assignment fails: silently outside strict code
     * and with a TypeError inside it.
     */
    if (!cell_object(cell_value)->writable) {
        return strict
            ? oseo_internal_throw_error(
                  context,
                  OSEO_ERROR_TYPE,
                  "Cannot assign to a read-only property."
              )
            : normal(value);
    }
    return oseo_cell_set(context, cell_value, value);
}

OseoResult oseo_global_binding_initialize(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (cell_object(cell_value)->object_environment) return normal(value);
    if (tag_of(cell_object(cell_value)->value) != OSEO_TAG_UNINITIALIZED) {
        return normal(cell_object(cell_value)->value);
    }
    return oseo_cell_initialize(context, cell_value, value);
}

OseoResult oseo_global_function_initialize(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    OseoCell *cell = cell_object(cell_value);
    if (cell->object_environment) {
        return oseo_object_define(
            context,
            cell->object,
            cell->key,
            value,
            (OseoPropertyAttributes){false, true, true, false}
        );
    }
    cell->value = value;
    return normal(value);
}
