#include "runtime_internal.h"

#include <math.h>

/*
 * Property descriptors: [[GetOwnProperty]], [[DefineOwnProperty]] for
 * data and accessor descriptors, [[Delete]], and the SameValue
 * comparison ValidateAndApplyPropertyDescriptor performs.
 */

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

bool oseo_internal_same_value(OseoValue left, OseoValue right) {
    if (is_number(left) && is_number(right)) {
        double left_number = number_value(left);
        double right_number = number_value(right);
        if (isnan(left_number) && isnan(right_number)) return true;
        if (left_number == 0.0 && right_number == 0.0) {
            return signbit(left_number) == signbit(right_number);
        }
        return left_number == right_number;
    }
    if (is_string(left) && is_string(right)) {
        return oseo_internal_string_equal(left, right);
    }
    if (is_bigint(left) && is_bigint(right)) {
        return oseo_internal_bigint_equal(left, right);
    }
    return left == right;
}

bool oseo_internal_own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes,
    OseoValue *getter,
    OseoValue *setter
) {
    *getter = oseo_undefined();
    *setter = oseo_undefined();
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        *value = function_object(object_value)->prototype_object;
        *attributes = (OseoPropertyAttributes){
            false,
            false,
            function_object(object_value)->prototype_writable,
            false,
        };
        return true;
    }
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        OseoOrdinaryObject *array = ordinary_object(object_value);
        *value = oseo_number(array->array_length);
        *attributes = (OseoPropertyAttributes){
            false,
            false,
            array->length_writable,
            false,
        };
        return true;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = oseo_internal_own_property_index(object, key);
    if (index == SIZE_MAX) return false;
    OseoProperty *property = &object->properties[index];
    *attributes = property->attributes;
    if (property->attributes.accessor) {
        *value = oseo_undefined();
        *getter = property->getter;
        *setter = property->setter;
    } else {
        *value = property->value;
    }
    return true;
}

OseoResult oseo_object_define(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoResult valid = oseo_internal_require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Object.defineProperty requires an object."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return type_error(
            context,
            "Cannot define a module namespace property."
        );
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        if (attributes.configurable || attributes.enumerable) {
            return type_error(
                context,
                "Cannot redefine the prototype property."
            );
        }
        OseoFunction *function = function_object(object_value);
        if (!function->prototype_writable &&
            (attributes.writable ||
             !oseo_internal_same_value(function->prototype_object, value))) {
            return type_error(
                context,
                "Cannot redefine the prototype property."
            );
        }
        function->prototype_object = value;
        function->prototype_writable = attributes.writable;
        return normal(object_value);
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        if (attributes.configurable || attributes.enumerable) {
            return type_error(
                context,
                "Cannot redefine the array length property."
            );
        }
        if (!object->length_writable && attributes.writable) {
            return type_error(
                context,
                "Cannot redefine the array length property."
            );
        }
        bool valid_length = false;
        OseoResult changed = oseo_internal_set_array_length(
            context,
            object,
            value,
            true,
            true,
            &valid_length
        );
        if (changed.status != OSEO_STATUS_NORMAL) {
            if (valid_length && !attributes.writable) {
                object->length_writable = false;
            }
            return changed;
        }
        object->length_writable = attributes.writable;
        return normal(object_value);
    }
    uint32_t defined_index = 0u;
    bool extends_array = is_array(object_value) &&
        oseo_internal_array_index(key, &defined_index) &&
        defined_index >= object->array_length;
    if (extends_array && !object->length_writable) {
        return type_error(
            context,
            "Cannot extend an array with a read-only length."
        );
    }
    size_t index = oseo_internal_own_property_index(object, key);
    if (index != SIZE_MAX) {
        OseoProperty *property = &object->properties[index];
        /* ValidateAndApplyPropertyDescriptor compares the property's
         * current value, which a cell-backed property keeps in its
         * binding cell. Reading it allocates nothing on the normal path,
         * so the property pointer stays valid. */
        bool cell_backed = oseo_internal_cell_backed_property(
            object_value, property->value);
        OseoValue current_value = property->value;
        if (cell_backed) {
            OseoResult read = oseo_cell_get(context, property->value);
            if (read.status != OSEO_STATUS_NORMAL) return read;
            current_value = read.value;
        }
        if (!property->attributes.configurable &&
            (property->attributes.accessor ||
             attributes.configurable ||
             attributes.enumerable != property->attributes.enumerable ||
             (!property->attributes.writable && attributes.writable) ||
             (!property->attributes.writable &&
              !oseo_internal_same_value(current_value, value)))) {
            return type_error(
                context,
                "Cannot redefine a non-configurable property."
            );
        }
        if (cell_backed) {
            /* The binding stays the one storage location the property
             * views, so the accepted redefinition writes through the
             * cell. A global or namespace binding also records the new
             * [[Writable]] on the cell, so a later binding assignment
             * fails exactly where a property assignment would. */
            OseoValue cell = property->value;
            OseoResult written = oseo_cell_set(context, cell, value);
            if (written.status != OSEO_STATUS_NORMAL) return written;
            property->attributes = attributes;
            if (object->mapped_arguments) {
                /* CreateMappedArgumentsObject's [[DefineOwnProperty]]
                 * (10.4.4.2) severs the alias exactly when the accepted
                 * descriptor is an explicit non-writable data
                 * descriptor: this property stops forwarding to the
                 * cell and keeps the value just written as its own
                 * plain snapshot, while the parameter itself keeps its
                 * own cell and stays an ordinary mutable binding. */
                if (!attributes.writable) property->value = value;
            } else {
                cell_object(cell)->writable = attributes.writable;
            }
            object->dictionary = true;
            object->shape_id = context->next_shape_id;
            context->next_shape_id += 1u;
            return normal(object_value);
        }
        property->attributes = attributes;
        property->value = value;
        property->getter = oseo_undefined();
        property->setter = oseo_undefined();
        object->dictionary = true;
        object->shape_id = context->next_shape_id;
        context->next_shape_id += 1u;
        if (extends_array) object->array_length = defined_index + 1u;
        return normal(object_value);
    }
    if (!object->extensible) {
        return type_error(
            context,
            "Cannot define a property on a non-extensible object."
        );
    }
    OseoResult grown = oseo_internal_grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = attributes;
    property->key = key;
    property->value = value;
    property->getter = oseo_undefined();
    property->setter = oseo_undefined();
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = defined_index + 1u;
    return normal(object_value);
}

OseoResult oseo_object_define_accessor(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue getter,
    OseoValue setter,
    bool has_getter,
    bool has_setter,
    OseoPropertyAttributes attributes
) {
    OseoResult valid = oseo_internal_require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        return type_error(
            context,
            "Cannot define an accessor property on a non-object."
        );
    }
    if (ordinary_object(object_value)->module_namespace) {
        return type_error(
            context,
            "Cannot define a module namespace property."
        );
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        return type_error(
            context,
            "Cannot redefine the prototype property."
        );
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return type_error(
            context,
            "Cannot redefine the array length property."
        );
    }
    uint32_t defined_index = 0u;
    bool extends_array = is_array(object_value) &&
        oseo_internal_array_index(key, &defined_index) &&
        defined_index >= object->array_length;
    if (extends_array && !object->length_writable) {
        return type_error(
            context,
            "Cannot extend an array with a read-only length."
        );
    }
    size_t index = oseo_internal_own_property_index(object, key);
    OseoValue new_getter = has_getter ? getter : oseo_undefined();
    OseoValue new_setter = has_setter ? setter : oseo_undefined();
    if (index != SIZE_MAX) {
        OseoProperty *property = &object->properties[index];
        OseoValue existing_getter = property->attributes.accessor
            ? property->getter : oseo_undefined();
        OseoValue existing_setter = property->attributes.accessor
            ? property->setter : oseo_undefined();
        if (!has_getter) new_getter = existing_getter;
        if (!has_setter) new_setter = existing_setter;
        if (!property->attributes.configurable &&
            (!property->attributes.accessor ||
             attributes.configurable ||
             attributes.enumerable != property->attributes.enumerable ||
             (has_getter &&
              !oseo_internal_same_value(existing_getter, new_getter)) ||
             (has_setter &&
              !oseo_internal_same_value(existing_setter, new_setter)))) {
            return type_error(
                context,
                "Cannot redefine a non-configurable property."
            );
        }
        property->attributes = attributes;
        property->value = oseo_undefined();
        property->getter = new_getter;
        property->setter = new_setter;
        object->dictionary = true;
        object->shape_id = context->next_shape_id;
        context->next_shape_id += 1u;
        if (extends_array) object->array_length = defined_index + 1u;
        return normal(object_value);
    }
    if (!object->extensible) {
        return type_error(
            context,
            "Cannot define a property on a non-extensible object."
        );
    }
    OseoResult grown = oseo_internal_grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = attributes;
    property->key = key;
    property->value = oseo_undefined();
    property->getter = new_getter;
    property->setter = new_setter;
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = defined_index + 1u;
    return normal(object_value);
}

OseoResult oseo_object_delete(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    bool strict
) {
    OseoResult valid = oseo_internal_require_property_key(context, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (!is_object(object_value)) {
        if (is_nullish(object_value)) {
            return type_error(
                context,
                "Cannot delete properties of a nullish value."
            );
        }
        if (oseo_internal_string_own_property(object_value, key, NULL)) {
            return strict
                ? type_error(context, "Cannot delete a string index property.")
                : normal(oseo_boolean(false));
        }
        return normal(oseo_boolean(true));
    }
    if (function_has_prototype_property(object_value) &&
        oseo_internal_string_is_ascii(key, "prototype")) {
        return strict
            ? type_error(context, "Cannot delete the prototype property.")
            : normal(oseo_boolean(false));
    }
    if (is_array(object_value) &&
        oseo_internal_string_is_ascii(key, "length")) {
        return strict
            ? type_error(context, "Cannot delete the array length property.")
            : normal(oseo_boolean(false));
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = oseo_internal_own_property_index(object, key);
    if (index == SIZE_MAX) return normal(oseo_boolean(true));
    if (!object->properties[index].attributes.configurable) {
        return strict
            ? type_error(context, "Cannot delete a non-configurable property.")
            : normal(oseo_boolean(false));
    }
    (void)oseo_internal_remove_property(object, index);
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(oseo_boolean(true));
}
