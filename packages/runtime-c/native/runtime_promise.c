#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Built-in bodies the dispatcher below reaches before this translation
 * unit defines them. */
static OseoResult capability_executor_call(
    OseoContext *context,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult promise_combine(
    OseoContext *context,
    OseoValue constructor,
    OseoValue iterable,
    bool race
);
static OseoResult promise_construct_with_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue executor
);
static OseoResult promise_prototype_then(
    OseoContext *context,
    OseoValue receiver,
    OseoValue on_fulfilled,
    OseoValue on_rejected
);
static OseoResult promise_resolve_with(
    OseoContext *context,
    OseoValue constructor,
    OseoValue value
);
static OseoResult promise_static_reject(
    OseoContext *context,
    OseoValue constructor,
    OseoValue reason
);
static OseoResult promise_static_resolve(
    OseoContext *context,
    OseoValue constructor,
    OseoValue value
);
static OseoResult promise_static_try(
    OseoContext *context,
    OseoValue constructor,
    size_t argument_count,
    const OseoValue *arguments
);
static OseoResult promise_then_with_capability(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected,
    OseoValue capability
);
static OseoResult promise_with_resolvers(
    OseoContext *context,
    OseoValue constructor
);

OseoResult oseo_internal_promise_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (code_id == OSEO_PROMISE_CONSTRUCTOR_CODE_ID) {
        /* 27.2.3.1 step 1: Promise is not callable without new. */
        if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The Promise constructor requires new."
            );
        }
        return promise_construct_with_target(
            context,
            new_target,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        /* Every remaining built-in here is a method, accessor, or
         * anonymous closure, and ECMA-262 gives none of them a
         * [[Construct]]. */
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Promise built-in function is not a constructor."
        );
    }
    if (code_id == OSEO_PROMISE_CAPABILITY_EXECUTOR_CODE_ID) {
        return capability_executor_call(
            context,
            callee,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_PROMISE_SPECIES_CODE_ID) {
        return normal(receiver);
    }
    if (code_id == OSEO_PROMISE_STATIC_RESOLVE_CODE_ID) {
        return promise_static_resolve(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (code_id == OSEO_PROMISE_STATIC_REJECT_CODE_ID) {
        return promise_static_reject(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined()
        );
    }
    if (code_id == OSEO_PROMISE_WITH_RESOLVERS_CODE_ID) {
        return promise_with_resolvers(context, receiver);
    }
    if (code_id == OSEO_PROMISE_TRY_CODE_ID) {
        return promise_static_try(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_PROMISE_ALL_CODE_ID ||
        code_id == OSEO_PROMISE_RACE_CODE_ID) {
        return promise_combine(
            context,
            receiver,
            argument_count > 0u ? arguments[0] : oseo_undefined(),
            code_id == OSEO_PROMISE_RACE_CODE_ID
        );
    }
    if (code_id == OSEO_PROMISE_DEFERRED_STATIC_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Promise static method is not admitted in this M5b node."
        );
    }
    if (code_id == OSEO_PROMISE_RESOLVE_CODE_ID ||
        code_id == OSEO_PROMISE_REJECT_CODE_ID) {
        OseoResult result = oseo_function_environment(context, callee);
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
            result = oseo_cell_set(context, latch, oseo_boolean(true));
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
        return result;
    }
    if (code_id == OSEO_PROMISE_FINALLY_FULFILL_CODE_ID ||
        code_id == OSEO_PROMISE_FINALLY_REJECT_CODE_ID) {
        OseoRootFrame frame = {NULL, NULL, 0u};
        OseoResult result = oseo_roots_allocate(context, &frame, 7u);
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
            /* ThenFinally resolves through the constructor the enclosing
             * `finally` captured, which is the SpeciesConstructor result
             * rather than %Promise% whenever the receiver names one. */
            result = oseo_environment_get(context, frame.slots[1], 1u);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = promise_resolve_with(
                context,
                frame.slots[5],
                frame.slots[4]
            );
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
        return result;
    }
    if (code_id == OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID) {
        OseoResult result = oseo_function_environment(context, callee);
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
        return result;
    }
    if (code_id == OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID ||
        code_id == OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID) {
        OseoResult result = oseo_function_environment(context, callee);
        OseoValue environment = result.value;
        bool fulfilling =
            code_id == OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID;
        if (result.status == OSEO_STATUS_NORMAL && fulfilling) {
            result = oseo_environment_get(context, environment, 1u);
        }
        bool already_fulfilled = result.status == OSEO_STATUS_NORMAL &&
            fulfilling && oseo_to_boolean(result.value);
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
        return result;
    }
    if (code_id == OSEO_PROMISE_THEN_CODE_ID ||
        code_id == OSEO_PROMISE_CATCH_CODE_ID ||
        code_id == OSEO_PROMISE_FINALLY_CODE_ID) {
        OseoValue first = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        OseoValue second = argument_count > 1u
            ? arguments[1]
            : oseo_undefined();
        if (code_id == OSEO_PROMISE_THEN_CODE_ID) {
            return promise_prototype_then(context, receiver, first, second);
        }
        if (code_id == OSEO_PROMISE_CATCH_CODE_ID) {
            return oseo_internal_promise_invoke_then(
                context,
                receiver,
                oseo_undefined(),
                first
            );
        }
        return oseo_internal_promise_finally_invoke(
            context,
            receiver,
            first
        );
    }
    return oseo_unknown_function(context, code_id);
}

/*
 * Promises, capabilities, reactions, thenable jobs, combinators,
 * and rejection tracking.
 */

/*
 * Allocates one pending promise with an explicit [[Prototype]]. The
 * prototype is rooted across the allocation because a subclass supplies
 * an object the intrinsic table does not hold.
 */
static OseoResult promise_allocate(
    OseoContext *context,
    OseoValue prototype_value
) {
    OseoValue rooted = prototype_value;
    OseoRootFrame frame = {NULL, &rooted, 1u};
    oseo_roots_push(context, &frame);
    OseoPromise *promise =
        oseo_internal_allocate_heap_bytes(context, sizeof(*promise));
    if (promise == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Promise allocation failed.");
    }
    promise->ordinary.prototype = rooted;
    promise->ordinary.properties = NULL;
    promise->ordinary.property_capacity = 0u;
    promise->ordinary.property_count = 0u;
    promise->ordinary.private_elements = NULL;
    promise->ordinary.private_element_capacity = 0u;
    promise->ordinary.private_element_count = 0u;
    promise->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    promise->ordinary.array_length = 0u;
    promise->ordinary.dictionary = false;
    promise->ordinary.length_writable = false;
    promise->ordinary.extensible = true;
    promise->ordinary.module_namespace = false;
    promise->ordinary.global_object = false;
    promise->ordinary.error_data = false;
    promise->ordinary.number_data = false;
    promise->ordinary.number_value = oseo_undefined();
    promise->ordinary.primitive_data = false;
    promise->ordinary.primitive_value = oseo_undefined();
    promise->ordinary.virtual_string_iterator = false;
    promise->ordinary.virtual_string_iterator_configurable = false;
    promise->ordinary.virtual_string_iterator_enumerable = false;
    promise->ordinary.virtual_string_iterator_writable = false;
    promise->ordinary.array_iterator = false;
    promise->ordinary.iterator_array = oseo_undefined();
    promise->ordinary.iterator_index = 0u;
    promise->ordinary.async_from_sync = false;
    promise->ordinary.async_sync_iterator = oseo_undefined();
    promise->ordinary.wrap_for_valid_iterator = false;
    promise->ordinary.wrapped_iterator = oseo_undefined();
    promise->ordinary.wrapped_next = oseo_undefined();
    promise->ordinary.generator = NULL;
    promise->ordinary.arguments_object = false;
    promise->ordinary.mapped_arguments = false;
    promise->result = oseo_undefined();
    promise->reaction_head = oseo_undefined();
    promise->reaction_tail = oseo_undefined();
    promise->unhandled_next = oseo_undefined();
    promise->rejection_source_id = context->source_id;
    promise->rejection_source_id_length = context->source_id_length;
    promise->rejection_line = context->line;
    promise->rejection_column = context->column;
    promise->state = OSEO_PROMISE_PENDING;
    promise->handled = false;
    promise->pending_report = false;
    promise->reported = false;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &promise->ordinary.header,
        OSEO_HEAP_PROMISE
    );
    oseo_roots_pop(context, &frame);
    return published;
}

OseoResult oseo_internal_promise_create(OseoContext *context) {
    OseoResult prototype = oseo_internal_promise_prototype(context);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    return promise_allocate(context, prototype.value);
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%Promise.prototype%"). A
 * subclass constructor carries its own `prototype` object, so
 * `new Subclass(executor)` gives its instance that object while a plain
 * `new Promise(executor)` keeps the realm prototype. The read matches
 * the one `oseo_internal_error_construct` performs, so both built-in
 * constructors take the prototype from the same place.
 */
static OseoResult promise_create_from_constructor(
    OseoContext *context,
    OseoValue new_target
) {
    OseoValue prototype = is_function(new_target)
        ? function_object(new_target)->prototype_object
        : oseo_undefined();
    if (is_object(prototype)) return promise_allocate(context, prototype);
    OseoResult fallback = oseo_internal_promise_prototype(context);
    if (fallback.status != OSEO_STATUS_NORMAL) return fallback;
    return promise_allocate(context, fallback.value);
}

OseoResult oseo_internal_promise_method_function(
    OseoContext *context,
    const char *name
) {
    OseoIntrinsic intrinsic;
    size_t code_id;
    const uint16_t *units;
    size_t length;
    static const uint16_t catch_units[] = {'c', 'a', 't', 'c', 'h'};
    static const uint16_t finally_units[] = {
        'f', 'i', 'n', 'a', 'l', 'l', 'y'
    };
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    if (strcmp(name, "then") == 0) {
        intrinsic = OSEO_INTRINSIC_PROMISE_THEN;
        code_id = OSEO_PROMISE_THEN_CODE_ID;
        units = then_units;
        length = sizeof(then_units) / sizeof(*then_units);
    } else if (strcmp(name, "catch") == 0) {
        intrinsic = OSEO_INTRINSIC_PROMISE_CATCH;
        code_id = OSEO_PROMISE_CATCH_CODE_ID;
        units = catch_units;
        length = sizeof(catch_units) / sizeof(*catch_units);
    } else if (strcmp(name, "finally") == 0) {
        intrinsic = OSEO_INTRINSIC_PROMISE_FINALLY;
        code_id = OSEO_PROMISE_FINALLY_CODE_ID;
        units = finally_units;
        length = sizeof(finally_units) / sizeof(*finally_units);
    } else {
        return failure(context, "OSEO2001", "Unknown promise method.");
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
            units,
            length,
            code_id == OSEO_PROMISE_THEN_CODE_ID ? 2u : 1u,
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

static OseoResult create_promise_builtin(
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

static OseoResult define_promise_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Materializes %Promise%, %Promise.prototype%, and every own property
 * ECMA-262 gives them. The whole cluster is built at once so that a
 * promise reached without naming `Promise`, such as the one an
 * asynchronous function returns, still finds `constructor`,
 * `Symbol.toStringTag`, and the statics on its prototype chain.
 *
 * `OSEO_INTRINSIC_PROMISE_SPECIES` is filled last, so it doubles as the
 * completion marker: a partially built cluster leaves it undefined and
 * the failure path clears every slot the attempt filled. The marker
 * holds the uninitialized sentinel while the attempt runs, so an
 * in-progress cluster is distinguishable from an unbuilt one. No
 * operation the build performs materializes `%Promise%`, so reaching
 * that state would mean a new dependency introduced a cycle; the
 * sentinel reports it instead of splitting the constructor and
 * prototype identities across two concurrent attempts.
 */
static OseoResult promise_intrinsic_build(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_PROMISE_SPECIES];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The Promise intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
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
        context->intrinsics[OSEO_INTRINSIC_PROMISE_PROTOTYPE] =
            frame.slots[1];
    }
    static const char *const method_names[] = {"then", "catch", "finally"};
    const OseoPropertyAttributes method = {true, false, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_internal_promise_method_function(
            context,
            method_names[index]
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_promise_property(
            context,
            frame.slots[1],
            method_names[index],
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_promise_builtin(
            context,
            OSEO_PROMISE_CONSTRUCTOR_CODE_ID,
            "Promise",
            1u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_PROMISE] = frame.slots[2];
        OseoFunction *constructor = function_object(frame.slots[2]);
        constructor->prototype_object = frame.slots[1];
        constructor->prototype_writable = false;
        result = define_promise_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Promise");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_PROMISE_ALL,
        OSEO_INTRINSIC_PROMISE_ALL_SETTLED,
        OSEO_INTRINSIC_PROMISE_ANY,
        OSEO_INTRINSIC_PROMISE_RACE,
        OSEO_INTRINSIC_PROMISE_REJECT,
        OSEO_INTRINSIC_PROMISE_RESOLVE,
        OSEO_INTRINSIC_PROMISE_TRY,
        OSEO_INTRINSIC_PROMISE_WITH_RESOLVERS,
    };
    static const size_t static_codes[] = {
        OSEO_PROMISE_ALL_CODE_ID,
        OSEO_PROMISE_DEFERRED_STATIC_CODE_ID,
        OSEO_PROMISE_DEFERRED_STATIC_CODE_ID,
        OSEO_PROMISE_RACE_CODE_ID,
        OSEO_PROMISE_STATIC_REJECT_CODE_ID,
        OSEO_PROMISE_STATIC_RESOLVE_CODE_ID,
        OSEO_PROMISE_TRY_CODE_ID,
        OSEO_PROMISE_WITH_RESOLVERS_CODE_ID,
    };
    static const char *const static_names[] = {
        "all",
        "allSettled",
        "any",
        "race",
        "reject",
        "resolve",
        "try",
        "withResolvers",
    };
    static const size_t static_lengths[] = {
        1u, 1u, 1u, 1u, 1u, 1u, 1u, 0u
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 8u;
         index += 1u) {
        result = create_promise_builtin(
            context,
            static_codes[index],
            static_names[index],
            static_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[5] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[static_intrinsics[index]] = frame.slots[5];
        result = define_promise_property(
            context,
            frame.slots[2],
            static_names[index],
            frame.slots[5],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_promise_builtin(
            context,
            OSEO_PROMISE_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[2],
            frame.slots[3],
            frame.slots[5],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_PROMISE_PROTOTYPE] =
            oseo_undefined();
        for (size_t index = OSEO_INTRINSIC_PROMISE;
             index <= OSEO_INTRINSIC_PROMISE_SPECIES;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue species = frame.slots[5];
    context->intrinsics[OSEO_INTRINSIC_PROMISE_SPECIES] = species;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(species);
}

OseoResult oseo_internal_promise_prototype(OseoContext *context) {
    OseoValue *cache =
        &context->intrinsics[OSEO_INTRINSIC_PROMISE_PROTOTYPE];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoResult built = promise_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(*cache);
}

OseoResult oseo_internal_promise_intrinsic(OseoContext *context) {
    OseoResult built = promise_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_PROMISE]);
}

OseoResult oseo_internal_install_promise_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_promise_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_promise_property(
            context,
            slots[0],
            "Promise",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}

static OseoResult reaction_create(
    OseoContext *context,
    OseoValue on_fulfilled,
    OseoValue on_rejected,
    OseoValue capability
) {
    OseoPromiseReaction *reaction =
        oseo_internal_allocate_heap_bytes(context, sizeof(*reaction));
    if (reaction == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Promise reaction allocation failed."
        );
    }
    reaction->next = oseo_undefined();
    reaction->on_fulfilled = on_fulfilled;
    reaction->on_rejected = on_rejected;
    reaction->capability = capability;
    reaction->aggregate = oseo_undefined();
    reaction->index = 0u;
    reaction->kind = OSEO_REACTION_NORMAL;
    return oseo_internal_publish_heap(
        context,
        &reaction->header,
        OSEO_HEAP_PROMISE_REACTION
    );
}

static OseoResult enqueue_job(
    OseoContext *context,
    OseoJobKind kind,
    OseoValue primary,
    OseoValue secondary,
    OseoValue argument,
    bool fulfilled
) {
    OseoJob *job = oseo_internal_allocate_heap_bytes(context, sizeof(*job));
    if (job == NULL) {
        return failure(context, "OSEO2001", "Promise job allocation failed.");
    }
    job->next = oseo_undefined();
    job->primary = primary;
    job->secondary = secondary;
    job->argument = argument;
    job->kind = kind;
    job->fulfilled = fulfilled;
    OseoResult published =
        oseo_internal_publish_heap(context, &job->header, OSEO_HEAP_JOB);
    if (published.status != OSEO_STATUS_NORMAL) return published;
    if (tag_of(context->microtask_tail) == OSEO_TAG_UNDEFINED) {
        context->microtask_head = published.value;
    } else {
        job_object(context->microtask_tail)->next = published.value;
    }
    context->microtask_tail = published.value;
    return normal(oseo_undefined());
}

static OseoResult promise_attach_reaction(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue reaction_value
) {
    OseoPromise *promise = promise_object(promise_value);
    if (promise->reported && !promise->handled) {
        context->rejection_handled_count += 1u;
    }
    promise->handled = true;
    promise->pending_report = false;
    if (promise->state == OSEO_PROMISE_PENDING) {
        if (tag_of(promise->reaction_tail) == OSEO_TAG_UNDEFINED) {
            promise->reaction_head = reaction_value;
        } else {
            reaction_object(promise->reaction_tail)->next = reaction_value;
        }
        promise->reaction_tail = reaction_value;
        return normal(oseo_undefined());
    }
    return enqueue_job(
        context,
        OSEO_JOB_REACTION,
        reaction_value,
        promise_value,
        promise->result,
        promise->state == OSEO_PROMISE_FULFILLED
    );
}

static OseoResult enqueue_reactions(
    OseoContext *context,
    OseoValue promise_value
) {
    OseoPromise *promise = promise_object(promise_value);
    OseoValue current = promise->reaction_head;
    while (tag_of(current) != OSEO_TAG_UNDEFINED) {
        OseoPromiseReaction *reaction = reaction_object(current);
        OseoValue next = reaction->next;
        OseoResult queued = enqueue_job(
            context,
            OSEO_JOB_REACTION,
            current,
            promise_value,
            promise_object(promise_value)->result,
            promise_object(promise_value)->state == OSEO_PROMISE_FULFILLED
        );
        if (queued.status != OSEO_STATUS_NORMAL) return queued;
        current = next;
    }
    promise = promise_object(promise_value);
    promise->reaction_head = oseo_undefined();
    promise->reaction_tail = oseo_undefined();
    return normal(oseo_undefined());
}

static OseoResult promise_fulfill(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue value
) {
    if (!is_promise(promise_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The settled value is not a promise."
        );
    }
    OseoPromise *promise = promise_object(promise_value);
    if (promise->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    promise->state = OSEO_PROMISE_FULFILLED;
    promise->result = value;
    return enqueue_reactions(context, promise_value);
}

OseoResult oseo_promise_reject_into(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue reason
) {
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The settled value is not a promise."
    );
    OseoPromise *promise = promise_object(promise_value);
    if (promise->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    promise->state = OSEO_PROMISE_REJECTED;
    promise->result = reason;
    promise->rejection_source_id = context->source_id;
    promise->rejection_source_id_length = context->source_id_length;
    promise->rejection_line = context->line;
    promise->rejection_column = context->column;
    if (!promise->handled) {
        promise->pending_report = true;
        if (tag_of(context->pending_rejection_tail) == OSEO_TAG_UNDEFINED) {
            context->pending_rejections = promise_value;
        } else {
            promise_object(context->pending_rejection_tail)->unhandled_next =
                promise_value;
        }
        context->pending_rejection_tail = promise_value;
    }
    return enqueue_reactions(context, promise_value);
}

static OseoResult resolving_environment_create(
    OseoContext *context,
    OseoValue promise
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_cell_create(context, oseo_boolean(false));
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult resolving_function_create(
    OseoContext *context,
    OseoValue environment,
    size_t code_id
) {
    if (!is_environment(environment)) {
        return failure(context, "OSEO2001", "Invalid resolving environment.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = environment;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[0],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_resolve_into(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue value
) {
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The settled value is not a promise."
    );
    if (promise_object(promise_value)->state != OSEO_PROMISE_PENDING) {
        return normal(oseo_undefined());
    }
    if (promise_value == value) {
        OseoResult error = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A promise cannot resolve to itself."
        );
        if (error.status != OSEO_STATUS_THROW || context->has_diagnostic) {
            return error;
        }
        oseo_context_clear_language_error(context);
        return oseo_promise_reject_into(context, promise_value, error.value);
    }
    if (!is_object(value)) {
        return promise_fulfill(context, promise_value, value);
    }

    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = value;
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    result = oseo_string_from_units(
        context,
        then_units,
        sizeof(then_units) / sizeof(*then_units)
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[1], frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(
            context,
            frame.slots[0],
            result.value
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_function(frame.slots[2])) {
        result = enqueue_job(
            context,
            OSEO_JOB_THENABLE,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            true
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_fulfill(context, frame.slots[0], frame.slots[1]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_resolve(
    OseoContext *context,
    OseoValue value
) {
    if (is_promise(value)) return normal(value);
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = oseo_internal_promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[1],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * A PromiseCapability Record. A capability over %Promise% is the native
 * promise itself, so the common path keeps allocating one object and
 * settles it directly. A capability over any other constructor is a
 * three-slot environment holding the constructed promise, its resolve
 * function, and its reject function, because those functions are the
 * only way to settle a foreign promise. Both shapes are ordinary
 * collector-traced values, so one reaction field carries either.
 */
static bool is_foreign_capability(OseoValue capability) {
    return is_environment(capability);
}

static OseoResult capability_promise(
    OseoContext *context,
    OseoValue capability
) {
    if (!is_foreign_capability(capability)) return normal(capability);
    return oseo_environment_get(context, capability, 0u);
}

/* Resolves or rejects one capability, whichever `fulfilled` selects. */
static OseoResult capability_settle(
    OseoContext *context,
    OseoValue capability,
    OseoValue value,
    bool fulfilled
) {
    if (!is_foreign_capability(capability)) {
        return fulfilled
            ? oseo_promise_resolve_into(context, capability, value)
            : oseo_promise_reject_into(context, capability, value);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = capability;
    frame.slots[1] = value;
    result = oseo_environment_get(
        context,
        frame.slots[0],
        fulfilled ? 1u : 2u
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[2],
            oseo_undefined(),
            1u,
            &frame.slots[1],
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * NewPromiseCapability. %Promise% keeps its allocation-free
 * representation; every other constructor is invoked with the
 * GetCapabilitiesExecutor closure, and the resolving functions it
 * captured must both be callable afterwards.
 */
static OseoResult new_promise_capability(
    OseoContext *context,
    OseoValue constructor
) {
    if (is_function(constructor) &&
        constructor == context->intrinsics[OSEO_INTRINSIC_PROMISE]) {
        return oseo_internal_promise_create(context);
    }
    if (!function_is_constructible(constructor)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The promise capability needs a constructor."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    result = oseo_environment_create(context, 3u);
    frame.slots[1] = result.value;
    /* Creating a function copies its environment's slots, so the record
     * itself is reached through one closure slot: the copy still points
     * at the same record, and the executor's writes stay visible here. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_create(context, 1u);
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[4],
            0u,
            frame.slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_PROMISE_CAPABILITY_EXECUTOR_CODE_ID,
            frame.slots[4],
            NULL,
            0u,
            2u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_prototype(context, frame.slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_receiver(context, result.value);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[0],
            frame.slots[3],
            1u,
            &frame.slots[2],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_result(
            context,
            result.value,
            frame.slots[3]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            result.value
        );
    }
    for (size_t index = 1u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_environment_get(context, frame.slots[1], index);
        if (result.status == OSEO_STATUS_NORMAL &&
            !is_function(result.value)) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The promise capability resolving function is not callable."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * GetCapabilitiesExecutor. ECMA-262 rejects a second call rather than
 * overwriting the captured functions, which is what makes a constructor
 * that invokes its executor twice observable.
 */
static OseoResult capability_executor_call(
    OseoContext *context,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[1] = argument_count > 0u ? arguments[0] : oseo_undefined();
    frame.slots[2] = argument_count > 1u ? arguments[1] : oseo_undefined();
    result = oseo_function_environment(context, callee);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_get(context, frame.slots[0], 0u);
        frame.slots[0] = result.value;
    }
    for (size_t index = 1u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_environment_get(context, frame.slots[0], index);
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(result.value) != OSEO_TAG_UNDEFINED) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The promise capability is already resolved."
            );
        }
    }
    for (size_t index = 1u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = oseo_environment_set(
            context,
            frame.slots[0],
            index,
            frame.slots[index]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_undefined());
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_aggregate_create(
    OseoContext *context,
    OseoValue capability,
    OseoValue values,
    size_t remaining
) {
    OseoPromiseAggregate *aggregate =
        oseo_internal_allocate_heap_bytes(context, sizeof(*aggregate));
    if (aggregate == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Promise aggregate allocation failed."
        );
    }
    aggregate->capability = capability;
    aggregate->values = values;
    aggregate->remaining = remaining;
    return oseo_internal_publish_heap(
        context,
        &aggregate->header,
        OSEO_HEAP_PROMISE_AGGREGATE
    );
}

static OseoResult promise_aggregate_environment_create(
    OseoContext *context,
    OseoValue reaction
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = reaction;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            oseo_boolean(false)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_aggregate_function_create(
    OseoContext *context,
    OseoValue environment,
    size_t code_id
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = environment;
    result = oseo_function_create(
        context,
        code_id,
        frame.slots[0],
        NULL,
        0u,
        1u,
        OSEO_FUNCTION_INTERNAL,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_aggregate_settle(
    OseoContext *context,
    OseoValue reaction_value,
    OseoValue argument,
    bool fulfilled
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = reaction_value;
    OseoPromiseReaction *reaction = reaction_object(frame.slots[0]);
    frame.slots[1] = reaction->aggregate;
    OseoPromiseAggregate *aggregate = aggregate_object(frame.slots[1]);
    frame.slots[2] = aggregate->capability;
    frame.slots[3] = aggregate->values;
    frame.slots[4] = argument;
    size_t index = reaction->index;
    OseoReactionKind kind = reaction->kind;
    if (!is_foreign_capability(frame.slots[2]) &&
        promise_object(frame.slots[2])->state != OSEO_PROMISE_PENDING) {
        result = normal(oseo_undefined());
    } else if (kind == OSEO_REACTION_RACE || !fulfilled) {
        result = capability_settle(
            context,
            frame.slots[2],
            frame.slots[4],
            fulfilled
        );
    } else {
        result = oseo_property_key(context, oseo_number((double)index));
        frame.slots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_set(
                context,
                frame.slots[3],
                frame.slots[0],
                frame.slots[4],
                true
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            aggregate = aggregate_object(frame.slots[1]);
            aggregate->remaining -= 1u;
            if (aggregate->remaining == 0u) {
                result = capability_settle(
                    context,
                    frame.slots[2],
                    frame.slots[3],
                    true
                );
            }
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The shared Promise.all and Promise.race body. The capability comes
 * from the `this` value, so a constructor whose executor never supplies
 * resolving functions is a TypeError before the iterable is touched,
 * and a subclass receives its own promise. Reading `resolve` from the
 * constructor and the remaining combinator refinements belong to the
 * combinator graph node.
 */
static OseoResult promise_combine(
    OseoContext *context,
    OseoValue constructor,
    OseoValue iterable,
    bool race
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 14u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = iterable;
    result = new_promise_capability(context, constructor);
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue captured_next = oseo_undefined();
        result = oseo_iterator_get(
            context,
            frame.slots[0],
            &captured_next
        );
        frame.slots[12] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            frame.slots[13] = captured_next;
        }
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[2] = result.value;
            oseo_context_clear_language_error(context);
            result = capability_settle(
                context,
                frame.slots[1],
                frame.slots[2],
                false
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = capability_promise(context, frame.slots[1]);
            }
            oseo_roots_release(context, &frame);
            return result;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = race
            ? normal(oseo_undefined())
            : oseo_array_create(context, 0u);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_aggregate_create(
            context,
            frame.slots[1],
            frame.slots[2],
            1u
        );
        frame.slots[3] = result.value;
    }
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_string_from_units(context, then_units, 4u);
        frame.slots[7] = result.value;
    }
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        OseoValue element = oseo_undefined();
        bool done = false;
        result = oseo_iterator_next(
            context,
            frame.slots[12],
            frame.slots[13],
            &element,
            &done
        );
        /*
         * A throw from IteratorStep leaves the iterator record done, so
         * the specification rejects without calling IteratorClose.
         */
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            result = capability_settle(
                context,
                frame.slots[1],
                frame.slots[4],
                false
            );
            break;
        }
        if (result.status != OSEO_STATUS_NORMAL || done) break;
        frame.slots[4] = element;
        if (!race) aggregate_object(frame.slots[3])->remaining += 1u;
        {
            result = oseo_promise_resolve(context, frame.slots[4]);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = reaction_create(
                context,
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined()
            );
            frame.slots[6] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoPromiseReaction *reaction =
                reaction_object(frame.slots[6]);
            reaction->aggregate = frame.slots[3];
            reaction->index = index;
            reaction->kind = race
                ? OSEO_REACTION_RACE
                : OSEO_REACTION_ALL;
            result = promise_aggregate_environment_create(
                context,
                frame.slots[6]
            );
            frame.slots[8] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = promise_aggregate_function_create(
                context,
                frame.slots[8],
                OSEO_PROMISE_AGGREGATE_FULFILL_CODE_ID
            );
            frame.slots[9] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = promise_aggregate_function_create(
                context,
                frame.slots[8],
                OSEO_PROMISE_AGGREGATE_REJECT_CODE_ID
            );
            frame.slots[10] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                context,
                frame.slots[5],
                frame.slots[7]
            );
            frame.slots[11] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_call_function(
                context,
                frame.slots[11],
                frame.slots[5],
                2u,
                &frame.slots[9],
                oseo_undefined()
            );
        }
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            /*
             * A throw after a successful step, such as calling a
             * yielded promise's own throwing then, closes the iterator
             * before rejecting. A non-catchable diagnostic from the
             * return method propagates.
             */
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            OseoResult closed = oseo_iterator_close(
                context,
                frame.slots[12],
                true
            );
            if (closed.status != OSEO_STATUS_NORMAL) {
                result = closed;
                break;
            }
            result = capability_settle(
                context,
                frame.slots[1],
                frame.slots[4],
                false
            );
            if (result.status == OSEO_STATUS_NORMAL) break;
        }
        index += 1u;
    }
    if (result.status == OSEO_STATUS_NORMAL && !race) {
        OseoPromiseAggregate *aggregate = aggregate_object(frame.slots[3]);
        aggregate->remaining -= 1u;
        if (aggregate->remaining == 0u) {
            result = capability_settle(
                context,
                frame.slots[1],
                frame.slots[2],
                true
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_promise(context, frame.slots[1]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_all(
    OseoContext *context,
    OseoValue iterable
) {
    OseoResult constructor =
        oseo_internal_intrinsic(context, OSEO_INTRINSIC_PROMISE);
    if (constructor.status != OSEO_STATUS_NORMAL) return constructor;
    return promise_combine(context, constructor.value, iterable, false);
}

OseoResult oseo_internal_promise_invoke_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected
) {
    static const uint16_t then_units[] = {'t', 'h', 'e', 'n'};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_fulfilled;
    frame.slots[2] = on_rejected;
    result = oseo_string_from_units(context, then_units, 4u);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(
            context,
            frame.slots[0],
            frame.slots[3]
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[4],
            frame.slots[0],
            2u,
            &frame.slots[1],
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_finally_function_create(
    OseoContext *context,
    OseoValue on_finally,
    OseoValue constructor,
    size_t code_id
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = on_finally;
    frame.slots[2] = constructor;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            frame.slots[1],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_finally_continuation_create(
    OseoContext *context,
    OseoValue preserved,
    bool fulfilled
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = preserved;
    result = oseo_environment_create(context, 2u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            0u,
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(
            context,
            frame.slots[1],
            1u,
            oseo_boolean(fulfilled)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_PROMISE_FINALLY_CONTINUE_CODE_ID,
            frame.slots[1],
            NULL,
            0u,
            0u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * SpeciesConstructor(O, %Promise%). An absent `constructor` keeps the
 * default, a non-object one is a TypeError, and the constructor's
 * `Symbol.species` selects the result when it is neither null nor
 * undefined. Every read is observable, so a throwing getter makes the
 * whole operation abrupt.
 */
static OseoResult promise_species_constructor(
    OseoContext *context,
    OseoValue object
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    result = oseo_internal_ascii_string(context, "constructor");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_PROMISE);
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The promise constructor property is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[2], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        (tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED ||
         tag_of(frame.slots[2]) == OSEO_TAG_NULL)) {
        result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_PROMISE);
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = function_is_constructible(frame.slots[2])
            ? normal(frame.slots[2])
            : oseo_internal_throw_error(
                  context,
                  OSEO_ERROR_TYPE,
                  "The promise species is not a constructor."
              );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * PromiseResolve(C, x) as this profile admits it. ECMA-262 returns an
 * already-native promise unchanged only after reading its `constructor`
 * and finding it SameValue with C. This profile does not perform that
 * read, so it compares C with %Promise% instead and keeps the missing
 * read as a recorded gap; every other constructor still gets its own
 * capability.
 */
static OseoResult promise_resolve_with(
    OseoContext *context,
    OseoValue constructor,
    OseoValue value
) {
    OseoResult promise_intrinsic =
        oseo_internal_intrinsic(context, OSEO_INTRINSIC_PROMISE);
    if (promise_intrinsic.status != OSEO_STATUS_NORMAL) {
        return promise_intrinsic;
    }
    if (constructor == promise_intrinsic.value) {
        return oseo_promise_resolve(context, value);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = value;
    result = new_promise_capability(context, frame.slots[0]);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_settle(
            context,
            frame.slots[2],
            frame.slots[1],
            true
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_promise(context, frame.slots[2]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_promise_finally_invoke(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_finally
) {
    if (!is_object(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Promise.prototype.finally requires an object."
    );
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_finally;
    /* SpeciesConstructor runs before the callable test, so a throwing
     * `constructor` or `Symbol.species` getter is observable even when
     * `onFinally` is not callable. */
    result = promise_species_constructor(context, frame.slots[0]);
    frame.slots[4] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_function(frame.slots[1])) {
        result = oseo_internal_promise_invoke_then(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[1]
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_finally_function_create(
            context,
            frame.slots[1],
            frame.slots[4],
            OSEO_PROMISE_FINALLY_FULFILL_CODE_ID
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_finally_function_create(
            context,
            frame.slots[1],
            frame.slots[4],
            OSEO_PROMISE_FINALLY_REJECT_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_promise_invoke_then(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[3]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Promise.prototype.then. The receiver must be a promise, the derived
 * promise comes from SpeciesConstructor, and PerformPromiseThen then
 * attaches the reaction to whichever capability that produced.
 */
static OseoResult promise_prototype_then(
    OseoContext *context,
    OseoValue receiver,
    OseoValue on_fulfilled,
    OseoValue on_rejected
) {
    if (!is_promise(receiver)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The receiver is not a promise."
    );
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = on_fulfilled;
    frame.slots[2] = on_rejected;
    result = promise_species_constructor(context, frame.slots[0]);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = new_promise_capability(context, frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_then_with_capability(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            frame.slots[3]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* The `this` value every Promise static requires before it builds a
 * capability. ECMA-262 states the object test separately from
 * NewPromiseCapability's constructor test, so a non-object receiver and
 * a non-constructor object receiver are distinguishable. */
static OseoResult promise_static_receiver(
    OseoContext *context,
    OseoValue constructor
) {
    if (is_object(constructor)) return normal(constructor);
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The Promise static receiver is not an object."
    );
}

static OseoResult promise_static_resolve(
    OseoContext *context,
    OseoValue constructor,
    OseoValue value
) {
    OseoResult receiver = promise_static_receiver(context, constructor);
    if (receiver.status != OSEO_STATUS_NORMAL) return receiver;
    return promise_resolve_with(context, constructor, value);
}

static OseoResult promise_static_reject(
    OseoContext *context,
    OseoValue constructor,
    OseoValue reason
) {
    OseoResult receiver = promise_static_receiver(context, constructor);
    if (receiver.status != OSEO_STATUS_NORMAL) return receiver;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = reason;
    result = new_promise_capability(context, frame.slots[0]);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_settle(
            context,
            frame.slots[2],
            frame.slots[1],
            false
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_promise(context, frame.slots[2]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Promise.withResolvers. The returned object is an ordinary object with
 * three own enumerable data properties, so a caller can destructure the
 * capability the static built.
 */
static OseoResult promise_with_resolvers(
    OseoContext *context,
    OseoValue constructor
) {
    OseoResult receiver = promise_static_receiver(context, constructor);
    if (receiver.status != OSEO_STATUS_NORMAL) return receiver;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    result = new_promise_capability(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    /* A %Promise% capability stores no resolving functions, so the pair
     * this static hands back is created here over one shared
     * already-resolved latch, exactly as CreateResolvingFunctions
     * does. */
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_foreign_capability(frame.slots[1])) {
        result = resolving_environment_create(context, frame.slots[1]);
        frame.slots[3] = result.value;
    }
    /* ECMA-262 creates `promise`, then `resolve`, then `reject`, and an
     * own-key enumeration of the result observes that order. The
     * capability record stores its resolving functions at the matching
     * slots, so one index selects both. */
    static const char *const names[] = {"promise", "resolve", "reject"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        if (index == 0u) {
            result = capability_promise(context, frame.slots[1]);
        } else if (is_foreign_capability(frame.slots[1])) {
            result = oseo_environment_get(context, frame.slots[1], index);
        } else {
            result = resolving_function_create(
                context,
                frame.slots[3],
                index == 1u
                    ? OSEO_PROMISE_RESOLVE_CODE_ID
                    : OSEO_PROMISE_REJECT_CODE_ID
            );
        }
        frame.slots[5] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_ascii_string(context, names[index]);
        frame.slots[4] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[2],
            frame.slots[4],
            frame.slots[5],
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Promise.try. The callback runs synchronously with the remaining
 * arguments, and its completion settles the capability, so a throw
 * becomes a rejection rather than propagating to the caller.
 */
static OseoResult promise_static_try(
    OseoContext *context,
    OseoValue constructor,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult receiver = promise_static_receiver(context, constructor);
    if (receiver.status != OSEO_STATUS_NORMAL) return receiver;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = argument_count > 0u ? arguments[0] : oseo_undefined();
    result = new_promise_capability(context, frame.slots[0]);
    frame.slots[2] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_call_function(
        context,
        frame.slots[1],
        oseo_undefined(),
        argument_count > 1u ? argument_count - 1u : 0u,
        argument_count > 1u ? &arguments[1] : NULL,
        oseo_undefined()
    );
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = capability_settle(
            context,
            frame.slots[2],
            frame.slots[3],
            false
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_settle(
            context,
            frame.slots[2],
            frame.slots[3],
            true
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_promise(context, frame.slots[2]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The Promise constructor's [[Construct]]. ECMA-262 rejects a
 * non-callable executor before it allocates anything, takes the
 * prototype from the new target, and turns a throwing executor into a
 * rejection of the promise it already created.
 */
static OseoResult promise_construct_with_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue executor
) {
    if (!is_function(executor)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The promise executor is not a function."
    );
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = executor;
    frame.slots[5] = new_target;
    result = promise_create_from_constructor(context, frame.slots[5]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_environment_create(context, frame.slots[1]);
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[4],
            OSEO_PROMISE_RESOLVE_CODE_ID
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[4],
            OSEO_PROMISE_REJECT_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[0],
            oseo_undefined(),
            2u,
            &frame.slots[2],
            oseo_undefined()
        );
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[4] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_call_function(
                context,
                frame.slots[3],
                oseo_undefined(),
                1u,
                &frame.slots[4],
                oseo_undefined()
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult promise_then_with_capability(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected,
    OseoValue capability
) {
    if (!is_promise(promise_value)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The receiver is not a promise."
    );
    if (tag_of(on_fulfilled) != OSEO_TAG_UNDEFINED &&
        !is_function(on_fulfilled)) {
        on_fulfilled = oseo_undefined();
    }
    if (tag_of(on_rejected) != OSEO_TAG_UNDEFINED &&
        !is_function(on_rejected)) {
        on_rejected = oseo_undefined();
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = promise_value;
    frame.slots[1] = on_fulfilled;
    frame.slots[2] = on_rejected;
    frame.slots[3] = capability;
    if (tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_promise_create(context);
        frame.slots[3] = result.value;
    } else if (!is_promise(frame.slots[3]) &&
               !is_foreign_capability(frame.slots[3])) {
        result = failure(
            context,
            "OSEO2001",
            "Invalid promise reaction capability."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = reaction_create(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3]
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = promise_attach_reaction(
            context,
            frame.slots[0],
            frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_promise(context, frame.slots[3]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled,
    OseoValue on_rejected
) {
    return promise_then_with_capability(
        context,
        promise_value,
        on_fulfilled,
        on_rejected,
        oseo_undefined()
    );
}

OseoResult oseo_promise_await_then(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_fulfilled
) {
    OseoValue capability = context->async_call_capability;
    context->async_call_capability = oseo_undefined();
    return promise_then_with_capability(
        context,
        promise_value,
        on_fulfilled,
        oseo_undefined(),
        capability
    );
}

OseoResult oseo_promise_async_call(
    OseoContext *context,
    OseoValue execution
) {
    if (!is_function(execution)) return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "The asynchronous execution is not a function."
    );
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = execution;
    result = oseo_internal_promise_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[3] = context->async_call_capability;
        context->async_call_capability = frame.slots[1];
        result = oseo_call_function(
            context,
            frame.slots[0],
            oseo_undefined(),
            0u,
            NULL,
            oseo_undefined()
        );
        frame.slots[2] = result.value;
        context->async_call_capability = frame.slots[3];
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        frame.slots[2] == frame.slots[1]) {
        result.value = frame.slots[1];
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[1],
            frame.slots[2]
        );
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    } else if (result.status == OSEO_STATUS_THROW &&
               !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = oseo_promise_reject_into(
            context,
            frame.slots[1],
            frame.slots[2]
        );
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_promise_finally(
    OseoContext *context,
    OseoValue promise_value,
    OseoValue on_finally
) {
    return oseo_internal_promise_finally_invoke(
        context, promise_value, on_finally);
}

OseoPromiseState oseo_promise_state(OseoValue promise) {
    return is_promise(promise)
        ? promise_object(promise)->state
        : OSEO_PROMISE_INVALID;
}

OseoResult oseo_promise_result(
    OseoContext *context,
    OseoValue promise
) {
    if (!is_promise(promise) ||
        promise_object(promise)->state == OSEO_PROMISE_PENDING) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The promise has no settled result."
        );
    }
    return normal(promise_object(promise)->result);
}

static OseoResult run_reaction_job(
    OseoContext *context,
    OseoValue job_value
) {
    OseoPromiseReaction *selected = reaction_object(
        job_object(job_value)->primary
    );
    if (selected->kind == OSEO_REACTION_ALL ||
        selected->kind == OSEO_REACTION_RACE) {
        OseoJob *job = job_object(job_value);
        return oseo_internal_promise_aggregate_settle(
            context,
            job->primary,
            job->argument,
            job->fulfilled
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoJob *job = job_object(job_value);
    OseoPromiseReaction *reaction = reaction_object(job->primary);
    frame.slots[0] = job->fulfilled
        ? reaction->on_fulfilled
        : reaction->on_rejected;
    frame.slots[1] = reaction->capability;
    frame.slots[2] = job->argument;
    bool fulfilled = job->fulfilled;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    if (!fulfilled && is_promise(job->secondary)) {
        OseoPromise *source = promise_object(job->secondary);
        context->source_id = source->rejection_source_id;
        context->source_id_length = source->rejection_source_id_length;
        context->line = source->rejection_line;
        context->column = source->rejection_column;
    }
    if (tag_of(frame.slots[0]) == OSEO_TAG_UNDEFINED) {
        result = capability_settle(
            context,
            frame.slots[1],
            frame.slots[2],
            fulfilled
        );
        if (!context->has_diagnostic) {
            context->source_id = source_id;
            context->source_id_length = source_id_length;
            context->line = line;
            context->column = column;
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    result = oseo_call_function(
        context,
        frame.slots[0],
        oseo_undefined(),
        1u,
        &frame.slots[2],
        oseo_undefined()
    );
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        oseo_context_clear_language_error(context);
        result = capability_settle(
            context,
            frame.slots[1],
            frame.slots[3],
            false
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = capability_settle(
            context,
            frame.slots[1],
            frame.slots[3],
            true
        );
    }
    if (!context->has_diagnostic) {
        context->source_id = source_id;
        context->source_id_length = source_id_length;
        context->line = line;
        context->column = column;
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult run_thenable_job(
    OseoContext *context,
    OseoValue job_value
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoJob *job = job_object(job_value);
    frame.slots[0] = job->primary;
    frame.slots[1] = job->secondary;
    frame.slots[2] = job->argument;
    result = resolving_environment_create(context, frame.slots[0]);
    frame.slots[5] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[5],
            OSEO_PROMISE_RESOLVE_CODE_ID
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = resolving_function_create(
            context,
            frame.slots[5],
            OSEO_PROMISE_REJECT_CODE_ID
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[1],
            frame.slots[2],
            2u,
            &frame.slots[3],
            oseo_undefined()
        );
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            frame.slots[5] = result.value;
            oseo_context_clear_language_error(context);
            result = oseo_call_function(
                context,
                frame.slots[4],
                oseo_undefined(),
                1u,
                &frame.slots[5],
                oseo_undefined()
            );
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

bool oseo_internal_jobs_reached_promise(OseoValue promise) {
    return is_promise(promise) &&
        promise_object(promise)->state != OSEO_PROMISE_PENDING;
}

static OseoResult jobs_run_next(OseoContext *context) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (tag_of(context->microtask_head) != OSEO_TAG_UNDEFINED) {
        frame.slots[0] = context->microtask_head;
        OseoValue next = job_object(frame.slots[0])->next;
        context->microtask_head = next;
        if (tag_of(next) == OSEO_TAG_UNDEFINED) {
            context->microtask_tail = oseo_undefined();
        }
        result = job_object(frame.slots[0])->kind == OSEO_JOB_REACTION
            ? run_reaction_job(context, frame.slots[0])
            : run_thenable_job(context, frame.slots[0]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_jobs_drain_until(
    OseoContext *context,
    OseoValue promise
) {
    OseoResult result = normal(oseo_undefined());
    while (tag_of(context->microtask_head) != OSEO_TAG_UNDEFINED &&
           !oseo_internal_jobs_reached_promise(promise)) {
        result = jobs_run_next(context);
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    return result;
}

OseoResult oseo_jobs_drain(OseoContext *context) {
    return oseo_internal_jobs_drain_until(context, oseo_undefined());
}

OseoResult oseo_rejection_checkpoint(OseoContext *context) {
    OseoValue current = context->pending_rejections;
    OseoValue first = oseo_undefined();
    const char *first_source_id = context->source_id;
    size_t first_source_id_length = context->source_id_length;
    size_t first_line = context->line;
    size_t first_column = context->column;
    bool found = false;
    context->pending_rejections = oseo_undefined();
    context->pending_rejection_tail = oseo_undefined();
    while (tag_of(current) != OSEO_TAG_UNDEFINED) {
        OseoPromise *promise = promise_object(current);
        OseoValue next = promise->unhandled_next;
        promise->unhandled_next = oseo_undefined();
        if (promise->pending_report && !promise->handled &&
            promise->state == OSEO_PROMISE_REJECTED) {
            promise->pending_report = false;
            promise->reported = true;
            context->unhandled_rejection_count += 1u;
            if (!found) {
                first = promise->result;
                first_source_id = promise->rejection_source_id;
                first_source_id_length =
                    promise->rejection_source_id_length;
                first_line = promise->rejection_line;
                first_column = promise->rejection_column;
                found = true;
            }
        }
        current = next;
    }
    if (!found) {
        return normal(oseo_undefined());
    }
    context->error_code = "OSEO2001";
    context->error_message = "Unhandled promise rejection.";
    context->has_diagnostic = false;
    context->source_id = first_source_id;
    context->source_id_length = first_source_id_length;
    context->line = first_line;
    context->column = first_column;
    return (OseoResult){OSEO_STATUS_THROW, first};
}
