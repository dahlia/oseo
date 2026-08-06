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
    return result;
}

OseoResult oseo_this_value(OseoContext *context, OseoValue receiver) {
    if (!is_nullish(receiver)) return normal(receiver);
    return global_this_object(context);
}

OseoResult oseo_global_object_create(
    OseoContext *context,
    OseoValue environment,
    size_t count,
    const uint16_t *const *names,
    const size_t *name_lengths,
    const size_t *binding_ids
) {
    if (count > 0u &&
        (names == NULL || name_lengths == NULL || binding_ids == NULL)) {
        return failure(context, "OSEO2001", "Invalid global object.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = global_this_object(context);
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
        /*
         * The property stores the binding cell itself, which is why the
         * environment slot rather than its current value is read here.
         * CreateGlobalVarBinding and CreateGlobalFunctionBinding both
         * create a writable, enumerable, non-configurable property.
         */
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
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){false, true, true, false}
        );
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
