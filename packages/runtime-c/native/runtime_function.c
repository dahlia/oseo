#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Function creation, callable metadata, construction, and
 * generic dispatch.
 */

static bool is_argument_list(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ARGUMENT_LIST;
}

static OseoArgumentList *argument_list(OseoValue value) {
    return (OseoArgumentList *)heap_object(value);
}

OseoResult oseo_argument_list_create(OseoContext *context) {
    OseoArgumentList *list =
        oseo_internal_allocate_heap_bytes(context, sizeof(*list));
    if (list == NULL) {
        return failure(context, "OSEO2001", "Argument list allocation failed.");
    }
    list->values = NULL;
    list->length = 0u;
    list->capacity = 0u;
    return oseo_internal_publish_heap(
        context,
        &list->header,
        OSEO_HEAP_ARGUMENT_LIST
    );
}

static OseoResult grow_argument_list(
    OseoContext *context,
    OseoValue list_value
) {
    OseoArgumentList *list = argument_list(list_value);
    if (list->length < list->capacity) return normal(list_value);
    size_t capacity = list->capacity == 0u ? 4u : list->capacity * 2u;
    if (capacity < list->capacity ||
        capacity > SIZE_MAX / sizeof(OseoValue)) {
        return failure(
            context,
            "OSEO2001",
            "Argument list storage is too large."
        );
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    list = argument_list(list_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(
            context,
            "OSEO2001",
            "Argument list allocation failed."
        );
    }
    OseoValue *values = malloc(capacity * sizeof(*values));
    if (values == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Argument list allocation failed."
        );
    }
    if (list->length > 0u) {
        memcpy(values, list->values, list->length * sizeof(*values));
    }
    free(list->values);
    list->values = values;
    list->capacity = capacity;
    return normal(list_value);
}

OseoResult oseo_argument_list_append(
    OseoContext *context,
    OseoValue list_value,
    OseoValue value
) {
    if (!is_argument_list(list_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Argument list append requires a list."
        );
    }
    OseoResult grown = grow_argument_list(context, list_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    OseoArgumentList *list = argument_list(list_value);
    list->values[list->length] = value;
    list->length += 1u;
    return normal(list_value);
}

OseoResult oseo_argument_list_view(
    OseoContext *context,
    OseoValue list_value,
    size_t *count,
    const OseoValue **arguments
) {
    if (!is_argument_list(list_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Argument list view requires a list."
        );
    }
    OseoArgumentList *list = argument_list(list_value);
    *count = list->length;
    *arguments = list->values;
    return normal(list_value);
}

/*
 * SetFunctionName's "get "/"set " prefix, applied to whatever base
 * name the static or computed key path already resolved, mirroring
 * oseo_internal_symbol_name's bracket-wrapping for a symbol key.
 */
static OseoResult accessor_function_name(
    OseoContext *context,
    OseoValue base_name,
    bool setter
) {
    size_t base_length = string_object(base_name)->length;
    if (base_length > SIZE_MAX / sizeof(uint16_t) - 4u) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t length = base_length + 4u;
    uint16_t *units = malloc(length * sizeof(uint16_t));
    if (units == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    static const char get_prefix[] = "get ";
    static const char set_prefix[] = "set ";
    const char *prefix = setter ? set_prefix : get_prefix;
    for (size_t index = 0u; index < 4u; index += 1u) {
        units[index] = (uint16_t)(unsigned char)prefix[index];
    }
    if (base_length > 0u) {
        memcpy(
            units + 4u,
            string_object(base_name)->units,
            base_length * sizeof(uint16_t)
        );
    }
    OseoValue slots[1] = {base_name};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    oseo_roots_pop(context, &frame);
    free(units);
    return result;
}

OseoResult oseo_function_create(
    OseoContext *context,
    size_t code_id,
    OseoValue environment,
    const uint16_t *name_units,
    size_t name_length,
    size_t parameter_count,
    OseoFunctionKind function_kind,
    OseoValue lexical_this,
    OseoValue inferred_name,
    OseoFunctionNamePrefix name_prefix
) {
    if (!is_environment(environment)) {
        return failure(context, "OSEO2001", "Invalid function environment.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    switch (function_kind) {
        case OSEO_FUNCTION_ORDINARY:
        case OSEO_FUNCTION_ARROW:
        case OSEO_FUNCTION_ASYNC:
        case OSEO_FUNCTION_ASYNC_ARROW:
        case OSEO_FUNCTION_INTERNAL:
        case OSEO_FUNCTION_METHOD:
        case OSEO_FUNCTION_GENERATOR:
        case OSEO_FUNCTION_CLASS:
            break;
        default:
            return failure(context, "OSEO2001", "Invalid function kind.");
    }
    OseoResult result = oseo_roots_allocate(context, &frame, 9u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[5] = inferred_name;
    /* The [[Prototype]] of the created `prototype` object. */
    frame.slots[8] = oseo_null();
    frame.slots[7] = function_kind == OSEO_FUNCTION_ARROW ||
        function_kind == OSEO_FUNCTION_ASYNC_ARROW
        ? lexical_this
        : oseo_undefined();
    result = oseo_environment_clone(context, environment);
    frame.slots[0] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    /* A generator function's `prototype` object inherits from
     * %GeneratorPrototype%, so its generators reach the virtualized
     * `next` and `Symbol.iterator` through the specified lookup order,
     * and, unlike a constructor's prototype, it has no `constructor`
     * property. */
    if (function_kind == OSEO_FUNCTION_GENERATOR) {
        result = oseo_internal_generator_prototype(context);
        frame.slots[8] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    result = oseo_object_create(context, frame.slots[8]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL &&
        context->observe_specialization && context->allocations > 0u) {
        context->allocations -= 1u;
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoFunction *function =
        oseo_internal_allocate_heap_bytes(context, sizeof(*function));
    if (function == NULL) {
        oseo_roots_release(context, &frame);
        return failure(context, "OSEO2001", "Function allocation failed.");
    }
    function->ordinary.prototype = oseo_null();
    function->ordinary.properties = NULL;
    function->ordinary.property_capacity = 0u;
    function->ordinary.property_count = 0u;
    function->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    function->ordinary.array_length = 0u;
    function->ordinary.dictionary = false;
    function->ordinary.length_writable = false;
    function->ordinary.module_namespace = false;
    function->ordinary.error_data = false;
    function->ordinary.array_iterator = false;
    function->ordinary.iterator_array = oseo_undefined();
    function->ordinary.iterator_index = 0u;
    function->ordinary.default_intrinsics = true;
    function->ordinary.generator_prototype = false;
    function->ordinary.generator = NULL;
    function->environment = frame.slots[0];
    function->lexical_this = frame.slots[7];
    function->prototype_object = frame.slots[1];
    function->home_object = oseo_undefined();
    function->fields = NULL;
    function->field_count = 0u;
    function->field_capacity = 0u;
    function->code_id = code_id;
    function->function_kind = function_kind;
    /* A class's `prototype` is non-writable, non-enumerable, and
     * non-configurable, unlike an ordinary function's writable one. */
    function->prototype_writable = function_kind != OSEO_FUNCTION_CLASS;
    result = oseo_internal_publish_heap(
        context,
        &function->ordinary.header,
        OSEO_HEAP_FUNCTION
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        static const uint16_t length_name[] = {
            'l', 'e', 'n', 'g', 't', 'h',
        };
        result = oseo_internal_allocate_string(
            context,
            length_name,
            sizeof(length_name) / sizeof(*length_name)
        );
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPropertyAttributes attributes = {true, false, false, false};
        result = oseo_object_define(
            context,
            frame.slots[2],
            frame.slots[3],
            oseo_number(parameter_count),
            attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        static const uint16_t name_name[] = {'n', 'a', 'm', 'e'};
        result = oseo_internal_allocate_string(
            context,
            name_name,
            sizeof(name_name) / sizeof(*name_name)
        );
        frame.slots[4] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[5]) == OSEO_TAG_UNDEFINED) {
        result =
            oseo_internal_allocate_string(context, name_units, name_length);
        frame.slots[5] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    /* SetFunctionName wraps a symbol key's description in brackets,
     * producing "[description]", or an empty name for a
     * descriptionless symbol. */
    if (result.status == OSEO_STATUS_NORMAL && is_symbol(frame.slots[5])) {
        result = oseo_internal_symbol_name(context, frame.slots[5]);
        frame.slots[5] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_string(frame.slots[5])) {
        result = failure(context, "OSEO2001", "Invalid function name.");
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        name_prefix != OSEO_FUNCTION_NAME_PREFIX_NONE) {
        result = accessor_function_name(
            context,
            frame.slots[5],
            name_prefix == OSEO_FUNCTION_NAME_PREFIX_SET
        );
        frame.slots[5] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPropertyAttributes attributes = {true, false, false, false};
        result = oseo_object_define(
            context,
            frame.slots[2],
            frame.slots[4],
            frame.slots[5],
            attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        function_kind != OSEO_FUNCTION_GENERATOR) {
        static const uint16_t constructor_name[] = {
            'c', 'o', 'n', 's', 't', 'r', 'u', 'c', 't', 'o', 'r',
        };
        result = oseo_internal_allocate_string(
            context,
            constructor_name,
            sizeof(constructor_name) / sizeof(*constructor_name)
        );
        frame.slots[6] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            context->observe_specialization && context->allocations > 0u) {
            context->allocations -= 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        function_kind != OSEO_FUNCTION_GENERATOR) {
        OseoPropertyAttributes attributes = {true, false, true, false};
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[6],
            frame.slots[2],
            attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result.value = frame.slots[2];
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_function_environment(
    OseoContext *context,
    OseoValue function_value
) {
    if (!is_function(function_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Called value is not a function."
        );
    }
    return normal(function_object(function_value)->environment);
}

OseoResult oseo_function_code_id(
    OseoContext *context,
    OseoValue function_value,
    size_t *code_id
) {
    if (!is_function(function_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Called value is not a function."
        );
    }
    *code_id = function_object(function_value)->code_id;
    return normal(function_value);
}

OseoResult oseo_unknown_function(OseoContext *context, size_t code_id) {
    (void)code_id;
    return failure(context, "OSEO2001", "Function code identity is invalid.");
}

OseoResult oseo_function_prototype(
    OseoContext *context,
    OseoValue function_value
) {
    if (!function_is_constructible(function_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Constructed value is not a constructor."
        );
    }
    return normal(function_object(function_value)->prototype_object);
}

OseoResult oseo_constructor_receiver(
    OseoContext *context,
    OseoValue prototype
) {
    return oseo_object_create(
        context,
        is_object(prototype) ? prototype : oseo_null()
    );
}

OseoResult oseo_constructor_result(
    OseoContext *context,
    OseoValue returned,
    OseoValue receiver
) {
    (void)context;
    return normal(
        is_object(returned) || is_promise(returned) ? returned : receiver
    );
}

/*
 * Replaces one freshly created object's [[Prototype]]. Both objects a
 * class definition links are allocated by that definition, so no earlier
 * shape assumption or intrinsic lookup can depend on the old chain; this
 * therefore keeps the object out of dictionary mode, unlike the
 * `Object.setPrototypeOf` path that must assume arbitrary history.
 */
static void relink_prototype(
    OseoContext *context,
    OseoValue object_value,
    OseoValue prototype
) {
    OseoOrdinaryObject *object = ordinary_object(object_value);
    object->prototype = prototype;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
}

OseoResult oseo_class_heritage(
    OseoContext *context,
    OseoValue constructor,
    OseoValue heritage
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class heritage needs a class.");
    }
    if (tag_of(heritage) == OSEO_TAG_NULL) return normal(constructor);
    if (!function_is_constructible(heritage)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Class extends value is not a constructor or null."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = heritage;
    static const uint16_t prototype_name[] = {
        'p', 'r', 'o', 't', 'o', 't', 'y', 'p', 'e',
    };
    result = oseo_internal_allocate_string(
        context,
        prototype_name,
        sizeof(prototype_name) / sizeof(*prototype_name)
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[1], frame.slots[2]);
    }
    OseoValue parent_prototype = result.value;
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_object(parent_prototype) &&
        tag_of(parent_prototype) != OSEO_TAG_NULL) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Class extends value has a non-object prototype."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue class_prototype =
            function_object(frame.slots[0])->prototype_object;
        if (is_object(class_prototype)) {
            relink_prototype(context, class_prototype, parent_prototype);
        }
        relink_prototype(context, frame.slots[0], frame.slots[1]);
        result = normal(frame.slots[0]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_class_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class fields need a class.");
    }
    OseoFunction *function = function_object(constructor);
    if (function->field_count == function->field_capacity) {
        size_t capacity = function->field_capacity == 0u
            ? 4u
            : function->field_capacity * 2u;
        if (capacity < function->field_capacity ||
            capacity > SIZE_MAX / sizeof(OseoClassField)) {
            return failure(
                context,
                "OSEO2001",
                "Class field storage is too large."
            );
        }
        if (context->collect_every_safepoint) oseo_collect(context);
        context->allocation_attempts += 1u;
        OseoClassField *fields =
            context->fail_allocation_at != 0u &&
            context->allocation_attempts == context->fail_allocation_at
                ? NULL
                : malloc(capacity * sizeof(*fields));
        if (fields == NULL) {
            return failure(
                context,
                "OSEO2001",
                "Class field allocation failed."
            );
        }
        function = function_object(constructor);
        if (function->field_count > 0u) {
            memcpy(
                fields,
                function->fields,
                function->field_count * sizeof(*fields)
            );
        }
        free(function->fields);
        function->fields = fields;
        function->field_capacity = capacity;
    }
    function->fields[function->field_count].key = key;
    function->fields[function->field_count].initializer = initializer;
    function->field_count += 1u;
    return normal(constructor);
}

OseoResult oseo_initialize_instance_fields(
    OseoContext *context,
    OseoValue constructor,
    OseoValue instance
) {
    if (!is_function(constructor)) {
        return failure(
            context,
            "OSEO2001",
            "Instance fields need a class constructor."
        );
    }
    if (function_object(constructor)->field_count == 0u) {
        return normal(instance);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = instance;
    for (size_t index = 0u;
         index < function_object(frame.slots[0])->field_count;
         index += 1u) {
        /* The list is complete before any instance exists, so re-reading
         * it only guards against a reallocation this loop cannot cause. */
        OseoClassField field =
            function_object(frame.slots[0])->fields[index];
        frame.slots[2] = field.key;
        frame.slots[3] = field.initializer;
        frame.slots[4] = oseo_undefined();
        if (tag_of(frame.slots[3]) != OSEO_TAG_UNDEFINED) {
            result = oseo_call_function(
                context,
                frame.slots[3],
                frame.slots[1],
                0u,
                NULL,
                oseo_undefined()
            );
            frame.slots[4] = result.value;
            if (result.status != OSEO_STATUS_NORMAL) break;
        }
        OseoPropertyAttributes attributes = {true, true, true, false};
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[4],
            attributes
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[1]);
    oseo_roots_release(context, &frame);
    return result;
}

void oseo_bind_home_object(OseoValue function, OseoValue home) {
    if (!is_function(function)) return;
    function_object(function)->home_object = home;
}

OseoValue oseo_super_base(OseoValue callee) {
    if (!is_function(callee)) return oseo_undefined();
    OseoValue home = function_object(callee)->home_object;
    if (!is_object(home)) return oseo_undefined();
    return ordinary_object(home)->prototype;
}

OseoResult oseo_super_constructor(OseoContext *context, OseoValue callee) {
    OseoValue parent = is_function(callee)
        ? function_object(callee)->ordinary.prototype
        : oseo_undefined();
    if (!function_is_constructible(parent)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Super constructor is not a constructor."
        );
    }
    return normal(parent);
}

OseoResult oseo_bind_this(
    OseoContext *context,
    OseoValue cell,
    OseoValue value
) {
    if (!is_cell(cell)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (tag_of(cell_object(cell)->value) != OSEO_TAG_UNINITIALIZED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_REFERENCE,
            "Super constructor was already called in this constructor."
        );
    }
    cell_object(cell)->value = value;
    return normal(value);
}

OseoResult oseo_derived_constructor_result(
    OseoContext *context,
    OseoValue returned,
    OseoValue cell
) {
    if (is_object(returned) || is_promise(returned)) return normal(returned);
    if (tag_of(returned) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Derived constructor returned a non-object value."
        );
    }
    return oseo_cell_get(context, cell);
}

OseoResult oseo_call_function(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    /* A class constructor has [[IsClassConstructor]] true, so [[Call]]
     * always throws; only [[Construct]], which supplies a new target,
     * reaches its body. */
    if (is_function(callee) &&
        function_object(callee)->function_kind == OSEO_FUNCTION_CLASS &&
        tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Class constructor cannot be invoked without 'new'."
        );
    }
    if (function_has_lexical_this(callee)) {
        receiver = function_object(callee)->lexical_this;
    }
    size_t code_id = 0u;
    OseoResult result = oseo_function_code_id(context, callee, &code_id);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_call_enter(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (code_id >= OSEO_ERROR_CONSTRUCT_FIRST_CODE_ID &&
        code_id <= OSEO_ERROR_CONSTRUCT_LAST_CODE_ID) {
        result = oseo_internal_error_construct(
            context,
            callee,
            new_target,
            code_id,
            argument_count,
            arguments
        );
    } else if (code_id == OSEO_ERROR_TO_STRING_CODE_ID) {
        result = oseo_internal_error_to_string(context, receiver);
    } else if (code_id == OSEO_ARRAY_VALUES_CODE_ID) {
        result = oseo_internal_array_values(context, receiver);
    } else if (code_id == OSEO_ARRAY_ITERATOR_NEXT_CODE_ID) {
        result = oseo_internal_array_iterator_next(context, receiver);
    } else if (code_id == OSEO_ITERATOR_SELF_CODE_ID) {
        result = normal(receiver);
    } else if (code_id == OSEO_GENERATOR_NEXT_CODE_ID) {
        result = oseo_generator_next(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    } else if (code_id == OSEO_GENERATOR_RETURN_CODE_ID) {
        result = oseo_generator_return(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    } else if (code_id == OSEO_SYMBOL_CONSTRUCT_CODE_ID) {
        OseoValue description_input = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        if (tag_of(description_input) == OSEO_TAG_UNDEFINED) {
            result = oseo_internal_symbol_create(context, oseo_undefined());
        } else {
            result = oseo_internal_value_string(context, description_input);
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_symbol_create(context, result.value);
            }
        }
    } else if (code_id == OSEO_PROMISE_RESOLVE_CODE_ID ||
        code_id == OSEO_PROMISE_REJECT_CODE_ID) {
        result = oseo_function_environment(context, callee);
        OseoValue environment = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_environment_get(context, environment, 1u);
        }
        OseoValue latch = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_cell_get(context, latch);
        }
        bool already_resolved = result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value);
        if (already_resolved) {
            result = normal(oseo_undefined());
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_cell_set(
                context,
                latch,
                oseo_boolean(true)
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && !already_resolved) {
            result = oseo_environment_get(context, environment, 0u);
        }
        if (result.status == OSEO_STATUS_NORMAL && !already_resolved) {
            OseoValue argument = argument_count > 0u
                ? arguments[0]
                : oseo_undefined();
            result = code_id == OSEO_PROMISE_RESOLVE_CODE_ID
                ? oseo_promise_resolve_into(context, result.value, argument)
                : oseo_promise_reject_into(context, result.value, argument);
        }
    } else if (code_id == OSEO_PROMISE_FINALLY_FULFILL_CODE_ID ||
               code_id == OSEO_PROMISE_FINALLY_REJECT_CODE_ID) {
        OseoRootFrame frame = {NULL, NULL, 0u};
        result = oseo_roots_allocate(context, &frame, 7u);
        if (result.status == OSEO_STATUS_NORMAL) {
            frame.slots[0] = callee;
            frame.slots[3] = argument_count > 0u
                ? arguments[0]
                : oseo_undefined();
            result = oseo_function_environment(context, frame.slots[0]);
            frame.slots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_environment_get(context, frame.slots[1], 0u);
            frame.slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_call_function(
                context,
                frame.slots[2],
                oseo_undefined(),
                0u,
                NULL,
                oseo_undefined()
            );
            frame.slots[4] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_promise_resolve(context, frame.slots[4]);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            bool fulfilled =
                code_id == OSEO_PROMISE_FINALLY_FULFILL_CODE_ID;
            result = oseo_internal_promise_finally_continuation_create(
                context,
                frame.slots[3],
                fulfilled
            );
            frame.slots[6] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_promise_invoke_then(
                context,
                frame.slots[5],
                frame.slots[6],
                oseo_undefined()
            );
        }
        oseo_roots_release(context, &frame);
    } else if (code_id == OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID) {
        result = oseo_function_environment(context, callee);
        OseoValue environment = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_environment_get(context, environment, 0u);
        }
        OseoValue preserved = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_environment_get(context, environment, 1u);
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value)) {
            result = normal(preserved);
        } else if (result.status == OSEO_STATUS_NORMAL) {
            oseo_context_clear_language_error(context);
            result = (OseoResult){OSEO_STATUS_THROW, preserved};
        }
    } else if (code_id == OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID ||
               code_id == OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID) {
        result = oseo_function_environment(context, callee);
        OseoValue environment = result.value;
        bool fulfilling =
            code_id == OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID;
        if (result.status == OSEO_STATUS_NORMAL && fulfilling) {
            result = oseo_environment_get(context, environment, 1u);
        }
        bool already_fulfilled = result.status == OSEO_STATUS_NORMAL &&
            fulfilling &&
            oseo_to_boolean(result.value);
        if (already_fulfilled) {
            result = normal(oseo_undefined());
        } else if (result.status == OSEO_STATUS_NORMAL && fulfilling) {
            result = oseo_environment_set(
                context,
                environment,
                1u,
                oseo_boolean(true)
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && !already_fulfilled) {
            result = oseo_environment_get(context, environment, 0u);
        }
        if (result.status == OSEO_STATUS_NORMAL && !already_fulfilled) {
            OseoValue argument = argument_count > 0u
                ? arguments[0]
                : oseo_undefined();
            result = oseo_internal_promise_aggregate_settle(
                context,
                result.value,
                argument,
                fulfilling
            );
        }
    } else if (code_id == OSEO_PROMISE_THEN_CODE_ID ||
               code_id == OSEO_PROMISE_CATCH_CODE_ID ||
               code_id == OSEO_PROMISE_FINALLY_CODE_ID) {
        OseoValue first = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        OseoValue second = argument_count > 1u
            ? arguments[1]
            : oseo_undefined();
        if (code_id == OSEO_PROMISE_THEN_CODE_ID) {
            result = oseo_promise_then(context, receiver, first, second);
        } else if (code_id == OSEO_PROMISE_CATCH_CODE_ID) {
            result = oseo_internal_promise_invoke_then(
                context,
                receiver,
                oseo_undefined(),
                first
            );
        } else {
            result =
                oseo_internal_promise_finally_invoke(context, receiver, first);
        }
    } else if (context->function_dispatcher == NULL) {
        result = failure(
            context,
            "OSEO2001",
            "No generated function dispatcher is installed."
        );
    } else {
        result = context->function_dispatcher(
            context,
            callee,
            receiver,
            argument_count,
            arguments,
            new_target
        );
    }
    oseo_call_leave(context);
    return result;
}
