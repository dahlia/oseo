#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Function creation, callable metadata, construction, and
 * generic dispatch.
 */

typedef struct {
    size_t first_code_id;
    size_t last_code_id;
    OseoBuiltinDispatcher dispatch;
} OseoBuiltinDispatchRange;

OseoResult oseo_internal_function_builtin_dispatch(
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
    if (code_id == OSEO_FUNCTION_PROTOTYPE_CODE_ID) {
        return normal(oseo_undefined());
    }
    return oseo_unknown_function(context, code_id);
}

static const OseoBuiltinDispatchRange builtin_dispatch_ranges[] = {
    {OSEO_PROMISE_CODE_ID_RANGE_FIRST,
     OSEO_PROMISE_CODE_ID_RANGE_LAST,
     oseo_internal_promise_builtin_dispatch},
    {OSEO_ERROR_CODE_ID_RANGE_FIRST,
     OSEO_ERROR_CODE_ID_RANGE_LAST,
     oseo_internal_error_builtin_dispatch},
    {OSEO_SYMBOL_CODE_ID_RANGE_FIRST,
     OSEO_SYMBOL_CODE_ID_RANGE_LAST,
     oseo_internal_symbol_builtin_dispatch},
    {OSEO_ITERATOR_CODE_ID_RANGE_FIRST,
     OSEO_ITERATOR_CODE_ID_RANGE_LAST,
     oseo_internal_iterator_builtin_dispatch},
    {OSEO_GENERATOR_CODE_ID_RANGE_FIRST,
     OSEO_GENERATOR_CODE_ID_RANGE_LAST,
     oseo_internal_generator_builtin_dispatch},
    {OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_FIRST,
     OSEO_ASYNC_GENERATOR_CODE_ID_RANGE_LAST,
     oseo_internal_async_generator_builtin_dispatch},
    {OSEO_ARRAY_CODE_ID_RANGE_FIRST,
     OSEO_ARRAY_CODE_ID_RANGE_LAST,
     oseo_internal_array_builtin_dispatch},
    {OSEO_ARGUMENTS_CODE_ID_RANGE_FIRST,
     OSEO_ARGUMENTS_CODE_ID_RANGE_LAST,
     oseo_internal_arguments_builtin_dispatch},
    {OSEO_FUNCTION_CODE_ID_RANGE_FIRST,
     OSEO_FUNCTION_CODE_ID_RANGE_LAST,
     oseo_internal_function_builtin_dispatch},
};

static OseoBuiltinDispatcher builtin_dispatcher(size_t code_id) {
    size_t count =
        sizeof(builtin_dispatch_ranges) / sizeof(builtin_dispatch_ranges[0]);
    for (size_t index = 0u; index < count; index += 1u) {
        const OseoBuiltinDispatchRange *range =
            &builtin_dispatch_ranges[index];
        if (code_id >= range->first_code_id &&
            code_id <= range->last_code_id) {
            return range->dispatch;
        }
    }
    return NULL;
}

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

/*
 * Build the two roots every ordinary intrinsic chain reaches. The
 * bootstrap Function.prototype call skips this helper once, then the
 * completed pair is published together so no partial graph is observable.
 */
static OseoResult intrinsic_graph_root(OseoContext *context) {
    OseoValue object_prototype =
        context->intrinsics[OSEO_INTRINSIC_OBJECT_PROTOTYPE];
    OseoValue function_prototype =
        context->intrinsics[OSEO_INTRINSIC_FUNCTION_PROTOTYPE];
    if (is_object(object_prototype) && is_function(function_prototype)) {
        return normal(object_prototype);
    }
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_create(context, oseo_null());
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_OBJECT_PROTOTYPE] = frame.slots[0];
        result = oseo_function_create(
            context,
            OSEO_FUNCTION_PROTOTYPE_CODE_ID,
            oseo_undefined(),
            NULL,
            0u,
            0u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_FUNCTION_PROTOTYPE] =
            frame.slots[1];
        result = normal(frame.slots[0]);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_OBJECT_PROTOTYPE] =
            oseo_undefined();
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_intrinsic(OseoContext *context, OseoIntrinsic intrinsic) {
    if ((size_t)intrinsic >= OSEO_INTRINSIC_COUNT) {
        return failure(context, "OSEO2001", "Unknown realm intrinsic.");
    }
    OseoResult materialized = normal(oseo_undefined());
    if (intrinsic == OSEO_INTRINSIC_OBJECT_PROTOTYPE ||
        intrinsic == OSEO_INTRINSIC_FUNCTION_PROTOTYPE) {
        materialized = intrinsic_graph_root(context);
    } else if (intrinsic == OSEO_INTRINSIC_ARRAY_PROTOTYPE) {
        materialized = oseo_internal_array_prototype(context);
    } else if (intrinsic == OSEO_INTRINSIC_PROMISE_PROTOTYPE) {
        materialized = oseo_internal_promise_prototype(context);
    } else if (intrinsic == OSEO_INTRINSIC_ITERATOR_PROTOTYPE ||
               intrinsic == OSEO_INTRINSIC_ARRAY_ITERATOR_PROTOTYPE) {
        materialized = oseo_internal_array_iterator_prototype(context);
    } else if (intrinsic == OSEO_INTRINSIC_GENERATOR_PROTOTYPE) {
        materialized = oseo_internal_generator_prototype(context);
    } else if (
        intrinsic >= OSEO_INTRINSIC_ASYNC_ITERATOR_PROTOTYPE &&
        intrinsic <= OSEO_INTRINSIC_ASYNC_GENERATOR_FUNCTION
    ) {
        materialized = oseo_internal_async_generator_prototype(context);
    } else if (intrinsic == OSEO_INTRINSIC_SYMBOL_PROTOTYPE ||
               intrinsic == OSEO_INTRINSIC_SYMBOL) {
        materialized = oseo_symbol_intrinsic(context);
    } else if (intrinsic >= OSEO_INTRINSIC_ERROR_PROTOTYPE &&
               intrinsic <= OSEO_INTRINSIC_AGGREGATE_ERROR_PROTOTYPE) {
        OseoErrorKind kind = (OseoErrorKind)(
            intrinsic - OSEO_INTRINSIC_ERROR_PROTOTYPE
        );
        materialized = oseo_internal_error_prototype(context, kind);
    } else if (intrinsic >= OSEO_INTRINSIC_ERROR &&
               intrinsic <= OSEO_INTRINSIC_AGGREGATE_ERROR) {
        OseoErrorKind kind =
            (OseoErrorKind)(intrinsic - OSEO_INTRINSIC_ERROR);
        materialized = oseo_error_intrinsic(context, kind);
    } else if (intrinsic == OSEO_INTRINSIC_THROW_TYPE_ERROR) {
        materialized = oseo_internal_throw_type_error_function(context);
    } else if (intrinsic == OSEO_INTRINSIC_ARRAY_PUSH) {
        materialized = oseo_internal_array_push_function(context);
    } else if (intrinsic >= OSEO_INTRINSIC_ARRAY_VALUES &&
               intrinsic <= OSEO_INTRINSIC_GENERATOR_THROW) {
        static const size_t codes[] = {
            OSEO_ARRAY_VALUES_CODE_ID,
            OSEO_ARRAY_ITERATOR_NEXT_CODE_ID,
            OSEO_ITERATOR_SELF_CODE_ID,
            OSEO_GENERATOR_NEXT_CODE_ID,
            OSEO_GENERATOR_RETURN_CODE_ID,
            OSEO_GENERATOR_THROW_CODE_ID,
        };
        size_t index = (size_t)(intrinsic - OSEO_INTRINSIC_ARRAY_VALUES);
        materialized = oseo_internal_iterator_method(context, codes[index]);
    } else if (intrinsic >= OSEO_INTRINSIC_PROMISE_THEN &&
               intrinsic <= OSEO_INTRINSIC_PROMISE_FINALLY) {
        static const char *const names[] = {"then", "catch", "finally"};
        size_t index = (size_t)(intrinsic - OSEO_INTRINSIC_PROMISE_THEN);
        materialized = oseo_internal_promise_method_function(
            context,
            names[index]
        );
    } else {
        static const size_t codes[] = {
            OSEO_ASYNC_GENERATOR_NEXT_CODE_ID,
            OSEO_ASYNC_GENERATOR_RETURN_CODE_ID,
            OSEO_ASYNC_GENERATOR_THROW_CODE_ID,
            OSEO_ASYNC_ITERATOR_SELF_CODE_ID,
        };
        size_t index =
            (size_t)(intrinsic - OSEO_INTRINSIC_ASYNC_GENERATOR_NEXT);
        materialized = oseo_internal_async_generator_method(
            context,
            codes[index]
        );
    }
    if (materialized.status != OSEO_STATUS_NORMAL) return materialized;
    OseoValue value = context->intrinsics[intrinsic];
    if (tag_of(value) == OSEO_TAG_UNDEFINED) {
        return failure(context, "OSEO2001", "Realm intrinsic is unavailable.");
    }
    return normal(value);
}

OseoResult oseo_internal_intrinsic(
    OseoContext *context,
    OseoIntrinsic intrinsic
) {
    return oseo_intrinsic(context, intrinsic);
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
    bool bootstrapping_function_prototype =
        code_id == OSEO_FUNCTION_PROTOTYPE_CODE_ID &&
        tag_of(context->intrinsics[OSEO_INTRINSIC_FUNCTION_PROTOTYPE]) ==
            OSEO_TAG_UNDEFINED;
    if (!bootstrapping_function_prototype && !is_environment(environment)) {
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
        case OSEO_FUNCTION_ASYNC_GENERATOR:
        case OSEO_FUNCTION_CLASS:
            break;
        default:
            return failure(context, "OSEO2001", "Invalid function kind.");
    }
    OseoResult result = oseo_roots_allocate(context, &frame, 10u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[5] = inferred_name;
    if (bootstrapping_function_prototype) {
        frame.slots[8] =
            context->intrinsics[OSEO_INTRINSIC_OBJECT_PROTOTYPE];
        frame.slots[9] = frame.slots[8];
    } else {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        frame.slots[8] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_intrinsic(
                context,
                OSEO_INTRINSIC_FUNCTION_PROTOTYPE
            );
            frame.slots[9] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    frame.slots[7] = function_kind == OSEO_FUNCTION_ARROW ||
        function_kind == OSEO_FUNCTION_ASYNC_ARROW
        ? lexical_this
        : oseo_undefined();
    if (bootstrapping_function_prototype) {
        frame.slots[0] = oseo_undefined();
    } else {
        result = oseo_environment_clone(context, environment);
        frame.slots[0] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    /* A generator function's `prototype` object inherits from
     * %GeneratorPrototype%, so its generators reach the materialized
     * `next` and `Symbol.iterator` through the specified lookup order,
     * and, unlike a constructor's prototype, it has no `constructor`
     * property. */
    if (function_kind == OSEO_FUNCTION_GENERATOR ||
        function_kind == OSEO_FUNCTION_ASYNC_GENERATOR) {
        result = function_kind == OSEO_FUNCTION_ASYNC_GENERATOR
            ? oseo_internal_async_generator_prototype(context)
            : oseo_internal_generator_prototype(context);
        frame.slots[8] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    /* An asynchronous generator function itself inherits from
     * %AsyncGeneratorFunction.prototype%, which is what makes its
     * `constructor` reach %AsyncGeneratorFunction%. Every other function
     * inherits from the realm's %Function.prototype%. */
    if (function_kind == OSEO_FUNCTION_ASYNC_GENERATOR) {
        result = oseo_internal_async_generator_intrinsic(context);
        frame.slots[9] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    if (bootstrapping_function_prototype) {
        result = normal(oseo_undefined());
    } else {
        result = oseo_object_create(context, frame.slots[8]);
    }
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL &&
        !bootstrapping_function_prototype &&
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
    function->ordinary.prototype = frame.slots[9];
    function->ordinary.properties = NULL;
    function->ordinary.property_capacity = 0u;
    function->ordinary.property_count = 0u;
    function->ordinary.private_elements = NULL;
    function->ordinary.private_element_capacity = 0u;
    function->ordinary.private_element_count = 0u;
    function->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    function->ordinary.array_length = 0u;
    function->ordinary.dictionary = false;
    function->ordinary.length_writable = false;
    function->ordinary.extensible = true;
    function->ordinary.module_namespace = false;
    function->ordinary.global_object = false;
    function->ordinary.error_data = false;
    function->ordinary.array_iterator = false;
    function->ordinary.iterator_array = oseo_undefined();
    function->ordinary.iterator_index = 0u;
    function->ordinary.async_from_sync = false;
    function->ordinary.async_sync_iterator = oseo_undefined();
    function->ordinary.generator = NULL;
    function->ordinary.mapped_arguments = false;
    function->environment = frame.slots[0];
    function->lexical_this = frame.slots[7];
    function->lexical_new_target = oseo_undefined();
    function->lexical_super = oseo_undefined();
    function->prototype_object = frame.slots[1];
    function->home_object = oseo_undefined();
    function->elements = NULL;
    function->element_count = 0u;
    function->element_capacity = 0u;
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
        !bootstrapping_function_prototype &&
        function_kind != OSEO_FUNCTION_GENERATOR &&
        function_kind != OSEO_FUNCTION_ASYNC_GENERATOR) {
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
        !bootstrapping_function_prototype &&
        function_kind != OSEO_FUNCTION_GENERATOR &&
        function_kind != OSEO_FUNCTION_ASYNC_GENERATOR) {
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
    OseoResult fallback = normal(prototype);
    if (!is_object(prototype)) {
        fallback = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
    }
    if (fallback.status != OSEO_STATUS_NORMAL) return fallback;
    return oseo_object_create(context, fallback.value);
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
    if (tag_of(heritage) == OSEO_TAG_NULL) {
        OseoValue class_prototype =
            function_object(constructor)->prototype_object;
        if (is_object(class_prototype)) {
            relink_prototype(context, class_prototype, oseo_null());
        }
        return normal(constructor);
    }
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

/*
 * Reserves room for one more entry in a class constructor's element
 * list. The list belongs to the constructor rather than to the heap
 * object graph, so it grows with the same explicit reallocation the
 * property table uses, and the caller reacquires the function pointer.
 */
static OseoResult reserve_class_element(
    OseoContext *context,
    OseoValue constructor
) {
    OseoFunction *function = function_object(constructor);
    if (function->element_count != function->element_capacity) {
        return normal(constructor);
    }
    size_t capacity = function->element_capacity == 0u
        ? 4u
        : function->element_capacity * 2u;
    if (capacity < function->element_capacity ||
        capacity > SIZE_MAX / sizeof(OseoClassElement)) {
        return failure(
            context,
            "OSEO2001",
            "Class element storage is too large."
        );
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    context->allocation_attempts += 1u;
    OseoClassElement *elements =
        context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at
            ? NULL
            : malloc(capacity * sizeof(*elements));
    if (elements == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Class element allocation failed."
        );
    }
    function = function_object(constructor);
    if (function->element_count > 0u) {
        memcpy(
            elements,
            function->elements,
            function->element_count * sizeof(*elements)
        );
    }
    free(function->elements);
    function->elements = elements;
    function->element_capacity = capacity;
    return normal(constructor);
}

/* Appends one already-complete record to a constructor's element list. */
static OseoResult append_class_element(
    OseoContext *context,
    OseoValue constructor,
    OseoClassElement element
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class elements need a class.");
    }
    OseoResult result = reserve_class_element(context, constructor);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoFunction *function = function_object(constructor);
    function->elements[function->element_count] = element;
    function->element_count += 1u;
    return normal(constructor);
}

OseoResult oseo_class_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer
) {
    OseoClassElement element = {
        key,
        initializer,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_CLASS_ELEMENT_FIELD,
    };
    return append_class_element(context, constructor, element);
}

OseoResult oseo_class_private_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue initializer
) {
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A private field needs a private name."
        );
    }
    OseoClassElement element = {
        name,
        initializer,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_CLASS_ELEMENT_PRIVATE_FIELD,
    };
    return append_class_element(context, constructor, element);
}

OseoResult oseo_class_private_method_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue value,
    OseoPrivateMethodKind kind
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class elements need a class.");
    }
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A private method needs a private name."
        );
    }
    if (kind == OSEO_PRIVATE_METHOD) {
        OseoClassElement element = {
            name,
            value,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_CLASS_ELEMENT_PRIVATE_METHOD,
        };
        return append_class_element(context, constructor, element);
    }
    /* A getter and a setter under one private name describe one
     * accessor element, so the second half fills the record the first
     * appended instead of adding a second entry the instance would
     * reject as a duplicate. */
    OseoFunction *function = function_object(constructor);
    for (size_t index = 0u; index < function->element_count; index += 1u) {
        OseoClassElement *element = &function->elements[index];
        if (element->kind != OSEO_CLASS_ELEMENT_PRIVATE_ACCESSOR) continue;
        if (element->key != name) continue;
        if (kind == OSEO_PRIVATE_GETTER) {
            element->getter = value;
        } else {
            element->setter = value;
        }
        return normal(constructor);
    }
    OseoClassElement element = {
        name,
        oseo_undefined(),
        kind == OSEO_PRIVATE_GETTER ? value : oseo_undefined(),
        kind == OSEO_PRIVATE_SETTER ? value : oseo_undefined(),
        OSEO_CLASS_ELEMENT_PRIVATE_ACCESSOR,
    };
    return append_class_element(context, constructor, element);
}

/*
 * Reserves room for one more entry in an object's [[PrivateElements]].
 * The list is per-instance and grows only while a constructor installs
 * the elements its class declared.
 */
static OseoResult reserve_private_element(
    OseoContext *context,
    OseoValue object
) {
    OseoOrdinaryObject *target = ordinary_object(object);
    if (target->private_element_count != target->private_element_capacity) {
        return normal(object);
    }
    size_t capacity = target->private_element_capacity == 0u
        ? 4u
        : target->private_element_capacity * 2u;
    if (capacity < target->private_element_capacity ||
        capacity > SIZE_MAX / sizeof(OseoPrivateElement)) {
        return failure(
            context,
            "OSEO2001",
            "Private element storage is too large."
        );
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    context->allocation_attempts += 1u;
    OseoPrivateElement *elements =
        context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at
            ? NULL
            : malloc(capacity * sizeof(*elements));
    if (elements == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Private element allocation failed."
        );
    }
    target = ordinary_object(object);
    if (target->private_element_count > 0u) {
        memcpy(
            elements,
            target->private_elements,
            target->private_element_count * sizeof(*elements)
        );
    }
    free(target->private_elements);
    target->private_elements = elements;
    target->private_element_capacity = capacity;
    return normal(object);
}

/* PrivateElementFind: the entry `object` carries under `name`. */
static OseoPrivateElement *find_private_element(
    OseoValue object,
    OseoValue name
) {
    if (!is_object(object)) return NULL;
    OseoOrdinaryObject *target = ordinary_object(object);
    for (size_t index = 0u;
         index < target->private_element_count;
         index += 1u) {
        if (target->private_elements[index].key == name) {
            return &target->private_elements[index];
        }
    }
    return NULL;
}

/* Appends one private element, which PrivateElementFind must not find. */
static OseoResult add_private_element(
    OseoContext *context,
    OseoValue object,
    OseoPrivateElement element
) {
    if (!is_object(object)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A private element needs an object."
        );
    }
    if (find_private_element(object, element.key) != NULL) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "This object already carries that private member."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    frame.slots[1] = element.key;
    frame.slots[2] = element.value;
    frame.slots[3] = element.getter;
    frame.slots[4] = element.setter;
    result = reserve_private_element(context, frame.slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *target = ordinary_object(frame.slots[0]);
        OseoPrivateElement stored = {
            frame.slots[1],
            frame.slots[2],
            frame.slots[3],
            frame.slots[4],
            element.kind,
        };
        target->private_elements[target->private_element_count] = stored;
        target->private_element_count += 1u;
        result = normal(frame.slots[0]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_class_static_private_method_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue value,
    OseoPrivateMethodKind kind
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class elements need a class.");
    }
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A static private method needs a private name."
        );
    }
    if (kind == OSEO_PRIVATE_METHOD) {
        OseoPrivateElement added = {
            name,
            value,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_PRIVATE_ELEMENT_METHOD,
        };
        return add_private_element(context, constructor, added);
    }
    if (kind != OSEO_PRIVATE_GETTER && kind != OSEO_PRIVATE_SETTER) {
        return failure(
            context,
            "OSEO2001",
            "A static private accessor needs a valid half."
        );
    }
    OseoPrivateElement *existing = find_private_element(constructor, name);
    if (existing != NULL) {
        if (existing->kind != OSEO_PRIVATE_ELEMENT_ACCESSOR) {
            return failure(
                context,
                "OSEO2001",
                "A static private accessor conflicts with another element."
            );
        }
        OseoValue *slot =
            kind == OSEO_PRIVATE_GETTER ? &existing->getter : &existing->setter;
        if (tag_of(*slot) != OSEO_TAG_UNDEFINED) {
            return failure(
                context,
                "OSEO2001",
                "A static private accessor half is already defined."
            );
        }
        *slot = value;
        return normal(constructor);
    }
    OseoPrivateElement added = {
        name,
        oseo_undefined(),
        kind == OSEO_PRIVATE_GETTER ? value : oseo_undefined(),
        kind == OSEO_PRIVATE_SETTER ? value : oseo_undefined(),
        OSEO_PRIVATE_ELEMENT_ACCESSOR,
    };
    return add_private_element(context, constructor, added);
}

OseoResult oseo_private_name_create(OseoContext *context) {
    OseoPrivateName *name =
        oseo_internal_allocate_heap_bytes(context, sizeof(*name));
    if (name == NULL) {
        return failure(context, "OSEO2001", "Private name allocation failed.");
    }
    return oseo_internal_publish_heap(
        context,
        &name->header,
        OSEO_HEAP_PRIVATE_NAME
    );
}

OseoResult oseo_private_get(
    OseoContext *context,
    OseoValue object,
    OseoValue name
) {
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A private reference needs a private name."
        );
    }
    /* GetValue converts the base with ToObject first, and no primitive
     * wrapper carries a private element, so every non-object base ends
     * in the same TypeError this reports directly. */
    OseoPrivateElement *element = find_private_element(object, name);
    if (element == NULL) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "This object does not carry that private member."
        );
    }
    if (element->kind != OSEO_PRIVATE_ELEMENT_ACCESSOR) {
        return normal(element->value);
    }
    OseoValue getter = element->getter;
    if (tag_of(getter) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "This private accessor declares no getter."
        );
    }
    return oseo_call_function(
        context,
        getter,
        object,
        0u,
        NULL,
        oseo_undefined()
    );
}

OseoResult oseo_private_in(
    OseoContext *context,
    OseoValue object,
    OseoValue name
) {
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A private brand check needs a private name."
        );
    }
    if (!is_object(object)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A private brand check needs an object."
        );
    }
    return normal(oseo_boolean(find_private_element(object, name) != NULL));
}

OseoResult oseo_private_set(
    OseoContext *context,
    OseoValue object,
    OseoValue name,
    OseoValue value
) {
    if (!is_private_name(name)) {
        return failure(
            context,
            "OSEO2001",
            "A private reference needs a private name."
        );
    }
    OseoPrivateElement *element = find_private_element(object, name);
    if (element == NULL) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "This object does not carry that private member."
        );
    }
    if (element->kind == OSEO_PRIVATE_ELEMENT_FIELD) {
        element->value = value;
        return normal(value);
    }
    if (element->kind == OSEO_PRIVATE_ELEMENT_METHOD) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A private method cannot be assigned."
        );
    }
    OseoValue setter = element->setter;
    if (tag_of(setter) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "This private accessor declares no setter."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = oseo_call_function(
        context,
        setter,
        object,
        1u,
        &frame.slots[0],
        oseo_undefined()
    );
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[0]);
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_initialize_instance_elements(
    OseoContext *context,
    OseoValue constructor,
    OseoValue instance
) {
    if (!is_function(constructor)) {
        return failure(
            context,
            "OSEO2001",
            "Instance elements need a class constructor."
        );
    }
    if (function_object(constructor)->element_count == 0u) {
        return normal(instance);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = instance;
    /* Every private method and accessor is installed before any field
     * initializer runs, so an initializer can already call `this.#m()`
     * even when the method is declared after it. */
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < function_object(frame.slots[0])->element_count;
         index += 1u) {
        /* The list is complete before any instance exists, so re-reading
         * it only guards against a reallocation this loop cannot cause. */
        OseoClassElement element =
            function_object(frame.slots[0])->elements[index];
        if (element.kind != OSEO_CLASS_ELEMENT_PRIVATE_METHOD &&
            element.kind != OSEO_CLASS_ELEMENT_PRIVATE_ACCESSOR) {
            continue;
        }
        frame.slots[2] = element.key;
        frame.slots[3] = element.value;
        frame.slots[4] = element.getter;
        frame.slots[5] = element.setter;
        OseoPrivateElement installed = {
            frame.slots[2],
            frame.slots[3],
            frame.slots[4],
            frame.slots[5],
            element.kind == OSEO_CLASS_ELEMENT_PRIVATE_METHOD
                ? OSEO_PRIVATE_ELEMENT_METHOD
                : OSEO_PRIVATE_ELEMENT_ACCESSOR,
        };
        result = add_private_element(context, frame.slots[1], installed);
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < function_object(frame.slots[0])->element_count;
         index += 1u) {
        OseoClassElement element =
            function_object(frame.slots[0])->elements[index];
        if (element.kind != OSEO_CLASS_ELEMENT_FIELD &&
            element.kind != OSEO_CLASS_ELEMENT_PRIVATE_FIELD) {
            continue;
        }
        frame.slots[2] = element.key;
        frame.slots[3] = element.value;
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
        if (element.kind == OSEO_CLASS_ELEMENT_PRIVATE_FIELD) {
            OseoPrivateElement added = {
                frame.slots[2],
                frame.slots[4],
                oseo_undefined(),
                oseo_undefined(),
                OSEO_PRIVATE_ELEMENT_FIELD,
            };
            result = add_private_element(context, frame.slots[1], added);
            continue;
        }
        OseoPropertyAttributes attributes = {true, true, true, false};
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[4],
            attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[1]);
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * DefineField against a class constructor, which is what a `static`
 * field definition performs once the class is otherwise complete. The
 * initializer runs with the constructor as its receiver, so `this`
 * inside it is the class, and its result is installed as a property or
 * as a private element the constructor carries.
 */
static OseoResult define_static_field(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer,
    bool private_element
) {
    if (!is_function(constructor)) {
        return failure(context, "OSEO2001", "Class elements need a class.");
    }
    if (private_element != is_private_name(key)) {
        return failure(
            context,
            "OSEO2001",
            "A static field key does not match its placement."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = key;
    frame.slots[2] = initializer;
    frame.slots[3] = oseo_undefined();
    if (tag_of(frame.slots[2]) != OSEO_TAG_UNDEFINED) {
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        if (private_element) {
            OseoPrivateElement added = {
                frame.slots[1],
                frame.slots[3],
                oseo_undefined(),
                oseo_undefined(),
                OSEO_PRIVATE_ELEMENT_FIELD,
            };
            result = add_private_element(context, frame.slots[0], added);
        } else {
            OseoPropertyAttributes attributes = {true, true, true, false};
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[1],
                frame.slots[3],
                attributes
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[0]);
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_class_static_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue key,
    OseoValue initializer
) {
    return define_static_field(context, constructor, key, initializer, false);
}

OseoResult oseo_class_static_private_field_define(
    OseoContext *context,
    OseoValue constructor,
    OseoValue name,
    OseoValue initializer
) {
    return define_static_field(context, constructor, name, initializer, true);
}

void oseo_bind_home_object(OseoValue function, OseoValue home) {
    if (!is_function(function)) return;
    function_object(function)->home_object = home;
}

void oseo_bind_arrow_context(
    OseoValue function,
    OseoValue enclosing,
    OseoValue new_target
) {
    if (!function_has_lexical_this(function)) return;
    OseoFunction *arrow = function_object(function);
    arrow->lexical_new_target = new_target;
    if (!is_function(enclosing)) return;
    OseoFunction *outer = function_object(enclosing);
    arrow->home_object = outer->home_object;
    arrow->lexical_super = function_has_lexical_this(enclosing)
        ? outer->lexical_super
        : enclosing;
}

OseoValue oseo_super_base(OseoValue callee) {
    if (!is_function(callee)) return oseo_undefined();
    OseoValue home = function_object(callee)->home_object;
    if (!is_object(home)) return oseo_undefined();
    return ordinary_object(home)->prototype;
}

OseoResult oseo_super_property_delete(OseoContext *context) {
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_REFERENCE,
        "Cannot delete a super property reference."
    );
}

OseoResult oseo_super_constructor(OseoContext *context, OseoValue callee) {
    OseoValue context_function = callee;
    if (function_has_lexical_this(callee)) {
        context_function = function_object(callee)->lexical_super;
    }
    OseoValue parent = is_function(context_function)
        ? function_object(context_function)->ordinary.prototype
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
        OseoFunction *function = function_object(callee);
        receiver = function->lexical_this;
        new_target = function->lexical_new_target;
    }
    size_t code_id = 0u;
    OseoResult result = oseo_function_code_id(context, callee, &code_id);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_call_enter(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoBuiltinDispatcher dispatch = builtin_dispatcher(code_id);
    if (dispatch != NULL) {
        result = dispatch(
            context,
            code_id,
            callee,
            receiver,
            argument_count,
            arguments,
            new_target
        );
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
        OseoFunctionKind kind = function_object(callee)->function_kind;
        bool async_function = kind == OSEO_FUNCTION_ASYNC ||
            kind == OSEO_FUNCTION_ASYNC_ARROW;
        if (async_function && result.status == OSEO_STATUS_NORMAL) {
            result = oseo_async_function_start(context, result.value);
        } else if (async_function &&
                   result.status == OSEO_STATUS_THROW &&
                   !context->has_diagnostic) {
            OseoValue reason = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_async_function_reject(context, reason);
        }
    }
    oseo_call_leave(context);
    return result;
}
