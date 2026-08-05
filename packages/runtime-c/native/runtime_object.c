#include "runtime_internal.h"

#include <stdlib.h>

/*
 * Ordinary object creation and layout: the property vector and its
 * growth, own-property lookup and removal, cell-backed property
 * recognition, shape identifiers and the generated-code property
 * caches, object coercibility checks, and [[SetPrototypeOf]].
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

/*
 * True when one own property of `object_value` keeps its value in the
 * binding cell `stored` instead of the property slot. A module
 * namespace, the realm's global this value, and a mapped arguments
 * object are the objects whose properties are views of a binding: the
 * namespace exposes an imported binding, the global object exposes a
 * var-scoped Script binding, and a mapped arguments object exposes a
 * formal parameter. Every read of such a property dereferences the
 * cell, and every write that ECMA-262 admits goes through it, so a
 * property and its binding are one storage location rather than two
 * copies.
 */
bool oseo_internal_cell_backed_property(
    OseoValue object_value,
    OseoValue stored
) {
    if (!is_object(object_value) || !is_cell(stored)) return false;
    const OseoOrdinaryObject *object = ordinary_object(object_value);
    return object->module_namespace || object->global_object ||
        object->mapped_arguments;
}

size_t oseo_internal_own_property_index(
    const OseoOrdinaryObject *object,
    OseoValue key
) {
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (oseo_internal_property_key_equal(
            object->properties[index].key, key)) {
            return index;
        }
    }
    return SIZE_MAX;
}

bool oseo_internal_remove_property(OseoOrdinaryObject *object, size_t index) {
    if (!object->properties[index].attributes.configurable) return false;
    for (size_t next = index + 1u; next < object->property_count; next += 1u) {
        object->properties[next - 1u] = object->properties[next];
    }
    object->property_count -= 1u;
    return true;
}

static OseoResult object_create(
    OseoContext *context,
    OseoValue prototype,
    bool default_intrinsics
) {
    if (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype)) {
        return type_error(
            context,
            "Object prototype must be an object or null."
        );
    }
    OseoOrdinaryObject *object =
        oseo_internal_allocate_heap_bytes(context, sizeof(*object));
    if (object == NULL) {
        return failure(context, "OSEO2001", "Object allocation failed.");
    }
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->private_elements = NULL;
    object->private_element_capacity = 0u;
    object->private_element_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    object->extensible = true;
    object->module_namespace = false;
    object->global_object = false;
    object->error_data = false;
    object->array_iterator = false;
    object->iterator_array = oseo_undefined();
    object->iterator_index = 0u;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->default_intrinsics = default_intrinsics;
    object->generator_prototype = false;
    object->generator = NULL;
    object->mapped_arguments = false;
    return oseo_internal_publish_heap(
        context, &object->header, OSEO_HEAP_OBJECT);
}

OseoResult oseo_object_create(OseoContext *context, OseoValue prototype) {
    return object_create(context, prototype, false);
}

OseoResult oseo_object_literal_create(OseoContext *context) {
    return object_create(context, oseo_null(), true);
}

OseoResult oseo_require_object_coercible(
    OseoContext *context,
    OseoValue value
) {
    if (is_nullish(value)) {
        return type_error(context, "Cannot destructure a nullish value.");
    }
    return normal(value);
}

OseoResult oseo_require_delete_object_coercible(
    OseoContext *context,
    OseoValue value
) {
    if (is_nullish(value)) {
        return type_error(
            context,
            "Cannot delete properties of a nullish value."
        );
    }
    return normal(value);
}

OseoResult oseo_internal_grow_properties(
    OseoContext *context,
    OseoValue object_value
) {
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (object->property_count < object->property_capacity) {
        return normal(object_value);
    }
    size_t capacity = object->property_capacity == 0u
        ? 4u
        : object->property_capacity * 2u;
    if (capacity < object->property_capacity ||
        capacity > SIZE_MAX / sizeof(OseoProperty)) {
        return failure(context, "OSEO2001", "Property storage is too large.");
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    object = ordinary_object(object_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    OseoProperty *properties = malloc(capacity * sizeof(*properties));
    if (properties == NULL) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    if (object->property_count > 0u) {
        memcpy(
            properties,
            object->properties,
            object->property_count * sizeof(*properties)
        );
    }
    free(object->properties);
    object->properties = properties;
    object->property_capacity = capacity;
    return normal(object_value);
}

bool oseo_value_is_object(OseoValue value) {
    return is_object(value) || is_promise(value);
}

bool oseo_property_cache_matches(
    OseoValue object_value,
    const OseoPropertyCache *cache
) {
    if (!is_object(object_value)) return false;
    OseoOrdinaryObject *object = ordinary_object(object_value);
    return !object->dictionary && cache->shape_id != 0u &&
        cache->shape_id == object->shape_id &&
        cache->slot < object->property_count;
}

OseoValue oseo_property_cache_load(
    OseoValue object_value,
    const OseoPropertyCache *cache
) {
    if (!is_object(object_value)) return oseo_undefined();
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (cache->slot >= object->property_count) return oseo_undefined();
    return object->properties[cache->slot].value;
}

void oseo_property_cache_update(
    OseoValue object_value,
    OseoValue key,
    OseoPropertyCache *cache
) {
    if (!is_object(object_value)) {
        cache->shape_id = 0u;
        cache->slot = 0u;
        return;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t slot = oseo_internal_own_property_index(object, key);
    /* An accessor slot must always dispatch through the generic getter
     * call, never the direct fixed-slot load. A cell-backed slot holds
     * the binding cell rather than the value, so it is excluded for the
     * same reason: the fixed-slot load would hand generated code the
     * cell. Excluding the slot rather than the whole object keeps the
     * cache working for the global object's ordinary properties. */
    if (!object->dictionary && slot != SIZE_MAX &&
        !object->properties[slot].attributes.accessor &&
        !oseo_internal_cell_backed_property(
            object_value, object->properties[slot].value)) {
        cache->shape_id = object->shape_id;
        cache->slot = slot;
    } else {
        cache->shape_id = 0u;
        cache->slot = 0u;
    }
}

OseoResult oseo_object_set_prototype(
    OseoContext *context,
    OseoValue object_value,
    OseoValue prototype
) {
    if (!is_object(object_value) ||
        (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype))) {
        return type_error(
            context,
            "Object.setPrototypeOf requires an object prototype."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return tag_of(prototype) == OSEO_TAG_NULL
            ? normal(object_value)
            : type_error(context, "Cannot change a namespace prototype.");
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (!object->default_intrinsics && object->prototype == prototype) {
        return normal(object_value);
    }
    if (!object->extensible) {
        return type_error(
            context,
            "Cannot change a non-extensible object's prototype."
        );
    }
    OseoValue current = prototype;
    while (is_object(current)) {
        if (current == object_value) {
            return type_error(
                context,
                "Cyclic prototype chains are not allowed."
            );
        }
        current = ordinary_object(current)->prototype;
    }
    object->prototype = prototype;
    object->default_intrinsics = false;
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(object_value);
}

OseoResult oseo_object_literal_set_prototype(
    OseoContext *context,
    OseoValue object_value,
    OseoValue prototype
) {
    if (!is_object(object_value) || tag_of(prototype) == OSEO_TAG_NULL ||
        is_object(prototype)) {
        return oseo_object_set_prototype(context, object_value, prototype);
    }
    return normal(object_value);
}
