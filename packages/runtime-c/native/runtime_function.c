#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Function creation, callable metadata, construction, and
 * generic dispatch.
 */

OseoResult oseo_function_create(
    OseoContext *context,
    size_t code_id,
    OseoValue environment,
    const uint16_t *name_units,
    size_t name_length,
    size_t parameter_count,
    OseoFunctionKind function_kind,
    OseoValue lexical_this,
    OseoValue inferred_name
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
            break;
        default:
            return failure(context, "OSEO2001", "Invalid function kind.");
    }
    OseoResult result = oseo_roots_allocate(context, &frame, 8u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[5] = inferred_name;
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
    result = oseo_object_create(context, oseo_null());
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
    function->environment = frame.slots[0];
    function->lexical_this = frame.slots[7];
    function->prototype_object = frame.slots[1];
    function->code_id = code_id;
    function->function_kind = function_kind;
    function->prototype_writable = true;
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
        OseoPropertyAttributes attributes = {true, false, false};
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
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPropertyAttributes attributes = {true, false, false};
        result = oseo_object_define(
            context,
            frame.slots[2],
            frame.slots[4],
            frame.slots[5],
            attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
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
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoPropertyAttributes attributes = {true, false, true};
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

OseoResult oseo_call_function(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
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
