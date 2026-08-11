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
    cell->writable = true;
    return oseo_internal_publish_heap(context, &cell->header, OSEO_HEAP_CELL);
}

OseoResult oseo_cell_get(OseoContext *context, OseoValue cell_value) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    return oseo_read_binding(context, cell_object(cell_value)->value);
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
 * literal, so it reaches the realm-owned %Object.prototype%. Storing it
 * before returning keeps one identity for the whole
 * realm and permanently roots it, so a collection between two `this`
 * reads cannot replace it.
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
    ordinary_object(result.value)->global_object = true;
    context->global_this = result.value;
    result = oseo_internal_install_object_global(context, result.value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_install_number_global(context, result.value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_install_promise_global(context, result.value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_install_array_buffer_global(context, result.value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    static const char *const names[] = {"Infinity", "NaN", "undefined"};
    const OseoValue values[] = {
        oseo_number(INFINITY),
        oseo_number(NAN),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = context->global_this;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_internal_ascii_string(context, names[index]);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_cell_create(context, values[index]);
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
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
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
    size_t binding_count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_ids,
    const bool *function_declarations
) {
    if ((lexical_count > 0u &&
         (lexical_names == NULL || lexical_name_lengths == NULL)) ||
        (binding_count > 0u &&
         (names == NULL || name_lengths == NULL || binding_ids == NULL ||
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
        if (attributes.accessor) {
            result = failure(
                context,
                "OSEO2001",
                "Accessor-backed global declarations are unavailable."
            );
            break;
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
            result = oseo_cell_initialize(context, frame.slots[2], current);
            if (result.status != OSEO_STATUS_NORMAL) break;
            cell = frame.slots[2];
            object = ordinary_object(frame.slots[0]);
            object->properties[property_index].value = cell;
            object->dictionary = true;
            object->shape_id = context->next_shape_id;
            context->next_shape_id += 1u;
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
        if (function_declarations[index]) {
            property->attributes =
                (OseoPropertyAttributes){false, true, true, false};
            object->dictionary = true;
            object->shape_id = context->next_shape_id;
            context->next_shape_id += 1u;
        }
        cell_object(cell)->writable = property->attributes.writable;
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
    cell_object(cell_value)->value = value;
    return normal(value);
}
