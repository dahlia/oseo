#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * Explicit resource management: DisposableStack, AsyncDisposableStack,
 * %Iterator.prototype%[@@dispose], and %AsyncIteratorPrototype%
 * [@@asyncDispose].
 *
 * Both stack kinds share one heap record, OseoDisposableStack, whose
 * traced resource buffer is the [[DisposeCapability]] of ECMAScript 2026
 * 27.3. DisposeResources runs here in both forms. The synchronous form
 * calls every dispose method in reverse order on the native stack. The
 * asynchronous form keeps its loop position, its pending completion, and
 * the needsAwait and hasAwaited flags in the record and returns at every
 * Await; two internal reactions resume it, so no native frame outlives a
 * suspension.
 */

static void initialize_ordinary(
    OseoContext *context,
    OseoOrdinaryObject *object,
    OseoValue prototype
) {
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    oseo_internal_init_dense_index(object);
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
    object->immutable_prototype = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->virtual_string_iterator = false;
    object->virtual_string_iterator_configurable = false;
    object->virtual_string_iterator_enumerable = false;
    object->virtual_string_iterator_writable = false;
    object->iterator_kind = OSEO_ITERATOR_NONE;
    object->iterator_target = oseo_undefined();
    object->iterator_index = 0u;
    object->regexp_string_iterator = false;
    object->regexp_iterator_regexp = oseo_undefined();
    object->regexp_iterator_subject = oseo_undefined();
    object->regexp_iterator_global = false;
    object->regexp_iterator_unicode = false;
    object->regexp_iterator_complete = false;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->wrap_for_valid_iterator = false;
    object->wrapped_iterator = oseo_undefined();
    object->wrapped_next = oseo_undefined();
    object->arguments_object = false;
    object->mapped_arguments = false;
    object->generator = NULL;
}

static OseoValue argument_at(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return argument_count > index && arguments != NULL
        ? arguments[index]
        : oseo_undefined();
}

static OseoResult type_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

/* A catchable throw, as opposed to a runtime diagnostic. */
static bool language_throw(OseoContext *context, OseoResult result) {
    return result.status == OSEO_STATUS_THROW && !context->has_diagnostic;
}

/* Allocates one empty stack whose prototype is rooted in `*prototype`. */
static OseoResult stack_allocate(
    OseoContext *context,
    const OseoValue *prototype,
    bool async
) {
    OseoDisposableStack *stack =
        oseo_internal_allocate_heap_bytes(context, sizeof(*stack));
    if (stack == NULL) {
        return failure(
            context,
            "OSEO2001",
            "DisposableStack allocation failed."
        );
    }
    initialize_ordinary(context, &stack->ordinary, *prototype);
    stack->resources = NULL;
    stack->resource_count = 0u;
    stack->resource_capacity = 0u;
    stack->async = async;
    stack->disposed = false;
    stack->capability_only = false;
    stack->capability = oseo_undefined();
    stack->promise = oseo_undefined();
    stack->error = oseo_undefined();
    stack->on_fulfilled = oseo_undefined();
    stack->on_rejected = oseo_undefined();
    stack->cursor = 0u;
    stack->has_error = false;
    stack->needs_await = false;
    stack->has_awaited = false;
    stack->phase = OSEO_DISPOSE_PHASE_RESULT;
    return oseo_internal_publish_heap(
        context,
        &stack->ordinary.header,
        OSEO_HEAP_DISPOSABLE_STACK
    );
}

OseoResult oseo_internal_dispose_capability_create(
    OseoContext *context,
    bool async
) {
    OseoValue prototype = oseo_null();
    OseoRootFrame frame = {NULL, &prototype, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = stack_allocate(context, &prototype, async);
    if (result.status == OSEO_STATUS_NORMAL) {
        disposable_stack_object(result.value)->capability_only = true;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Allocates one stack whose prototype is rooted in `*prototype`, with a
 * fresh, empty capability record of its own.
 */
static OseoResult stack_create(
    OseoContext *context,
    const OseoValue *prototype,
    bool async
) {
    OseoValue capability = oseo_undefined();
    OseoRootFrame frame = {NULL, &capability, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_dispose_capability_create(context, async);
    capability = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = stack_allocate(context, prototype, async);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        disposable_stack_object(result.value)->capability = capability;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * The DisposableStack and AsyncDisposableStack constructors. Both take
 * the prototype from the new target, falling back to the new target's
 * realm, and start pending with an empty capability.
 */
static OseoResult stack_construct(
    OseoContext *context,
    OseoValue new_target,
    bool async
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return type_error(
            context,
            async
                ? "AsyncDisposableStack must be called with new."
                : "DisposableStack must be called with new."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_constructor_prototype(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_constructor_realm_default(
            context,
            frame.slots[0],
            async
                ? OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK_PROTOTYPE
                : OSEO_INTRINSIC_DISPOSABLE_STACK_PROTOTYPE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = stack_create(context, &frame.slots[1], async);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* The capability record a constructed stack currently owns. */
static OseoValue stack_capability(OseoValue stack) {
    return disposable_stack_object(stack)->capability;
}

/* RequireInternalSlot for [[DisposableState]] or [[AsyncDisposableState]]. */
static bool stack_receiver(OseoValue receiver, bool async) {
    if (!is_disposable_stack(receiver)) return false;
    OseoDisposableStack *stack = disposable_stack_object(receiver);
    /* A `using` scope's capability is never exposed, so only a
     * constructed stack of the requested kind qualifies. */
    return stack->async == async && !stack->capability_only;
}

static OseoResult receiver_error(OseoContext *context, bool async) {
    return type_error(
        context,
        async
            ? "The receiver is not an AsyncDisposableStack."
            : "The receiver is not a DisposableStack."
    );
}

static OseoResult disposed_error(OseoContext *context, bool async) {
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_REFERENCE,
        async
            ? "The AsyncDisposableStack is already disposed."
            : "The DisposableStack is already disposed."
    );
}

/*
 * Appends one DisposableResource. The values are read from the caller's
 * roots and only the host buffer grows, so no collection runs between
 * the reads and the stores.
 */
static OseoResult stack_push(
    OseoContext *context,
    OseoValue stack_value,
    OseoValue value,
    OseoValue method,
    int flags
) {
    OseoDisposableStack *stack = disposable_stack_object(stack_value);
    if (stack->resource_count + 3u > stack->resource_capacity) {
        size_t capacity = stack->resource_capacity == 0u
            ? 12u
            : stack->resource_capacity * 2u;
        if (capacity < stack->resource_capacity ||
            capacity > SIZE_MAX / sizeof(OseoValue)) {
            return failure(
                context,
                "OSEO2001",
                "DisposableStack resource list is too large."
            );
        }
        OseoValue *resources =
            realloc(stack->resources, capacity * sizeof(OseoValue));
        if (resources == NULL) {
            return failure(
                context,
                "OSEO2001",
                "DisposableStack resource allocation failed."
            );
        }
        stack->resources = resources;
        stack->resource_capacity = capacity;
    }
    stack->resources[stack->resource_count] = value;
    stack->resources[stack->resource_count + 1u] = method;
    stack->resources[stack->resource_count + 2u] = oseo_number((double)flags);
    stack->resource_count += 3u;
    return normal(oseo_undefined());
}

/* GetMethod(V, P) for a well-known symbol key, which runs user getters. */
static OseoResult symbol_method(
    OseoContext *context,
    OseoValue value,
    size_t well_known
) {
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(context, well_known);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        if (is_nullish(result.value)) {
            result.value = oseo_undefined();
        } else if (!is_callable(result.value)) {
            result = type_error(
                context,
                well_known == OSEO_WELL_KNOWN_DISPOSE
                    ? "The Symbol.dispose property is not callable."
                    : "The Symbol.asyncDispose property is not callable."
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_dispose_capability_add(
    OseoContext *context,
    OseoValue capability,
    OseoValue value,
    bool async
) {
    /* AddDisposableResource without a method: a synchronous hint skips a
     * nullish value, and an asynchronous hint records it so disposal
     * still awaits once. */
    if (is_nullish(value)) {
        if (!async) return normal(oseo_undefined());
        return stack_push(
            context,
            capability,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_DISPOSE_ASYNC_HINT
        );
    }
    if (!is_object(value)) {
        return type_error(
            context,
            "A disposable resource must be an object."
        );
    }
    OseoValue slots[3] = {capability, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    int flags = async ? OSEO_DISPOSE_ASYNC_HINT : 0;
    OseoResult result = symbol_method(
        context,
        slots[1],
        async ? OSEO_WELL_KNOWN_ASYNC_DISPOSE : OSEO_WELL_KNOWN_DISPOSE
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && async &&
        tag_of(slots[2]) == OSEO_TAG_UNDEFINED) {
        result = symbol_method(context, slots[1], OSEO_WELL_KNOWN_DISPOSE);
        slots[2] = result.value;
        flags |= OSEO_DISPOSE_SYNC_FALLBACK;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[2]) == OSEO_TAG_UNDEFINED) {
        result = type_error(
            context,
            async
                ? "The resource has no Symbol.asyncDispose or "
                  "Symbol.dispose method."
                : "The resource has no Symbol.dispose method."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = stack_push(context, slots[0], slots[1], slots[2], flags);
    }
    oseo_roots_pop(context, &frame);
    if (result.status == OSEO_STATUS_NORMAL) result.value = value;
    return result;
}

/* Calls the dispose method of resource `index`; the stack stays rooted. */
static OseoResult call_resource(
    OseoContext *context,
    OseoValue stack_value,
    size_t index
) {
    OseoDisposableStack *stack = disposable_stack_object(stack_value);
    OseoValue slots[2] = {
        stack->resources[index * 3u],
        stack->resources[index * 3u + 1u],
    };
    int flags = (int)number_value(stack->resources[index * 3u + 2u]);
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = (flags & OSEO_DISPOSE_ADOPTED) != 0
        ? oseo_call_function(
            context,
            slots[1],
            oseo_undefined(),
            1u,
            &slots[0],
            oseo_undefined()
        )
        : oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Folds one throw completion of a dispose method into the stored one. A
 * later error replaces the completion with a SuppressedError whose
 * `error` is the new value and whose `suppressed` is the earlier one.
 */
static OseoResult record_error(
    OseoContext *context,
    OseoValue stack_value,
    OseoValue error
) {
    oseo_context_clear_language_error(context);
    OseoDisposableStack *stack = disposable_stack_object(stack_value);
    if (!stack->has_error) {
        stack->has_error = true;
        stack->error = error;
        return normal(oseo_undefined());
    }
    OseoValue slots[2] = {stack_value, error};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_suppressed_error_create(
        context,
        slots[1],
        disposable_stack_object(slots[0])->error
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        disposable_stack_object(slots[0])->error = result.value;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static void release_resources(OseoDisposableStack *stack) {
    free(stack->resources);
    stack->resources = NULL;
    stack->resource_count = 0u;
    stack->resource_capacity = 0u;
}

/* The final completion of one DisposeResources, read from the record. */
static OseoResult stored_completion(
    OseoContext *context,
    OseoValue stack_value
) {
    OseoDisposableStack *stack = disposable_stack_object(stack_value);
    if (!stack->has_error) return normal(oseo_undefined());
    OseoValue error = stack->error;
    stack->has_error = false;
    stack->error = oseo_undefined();
    oseo_context_clear_language_error(context);
    return (OseoResult){OSEO_STATUS_THROW, error};
}

OseoResult oseo_internal_dispose_capability_dispose(
    OseoContext *context,
    OseoValue capability,
    bool has_completion,
    OseoValue completion
) {
    OseoValue slots[1] = {capability};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoDisposableStack *stack = disposable_stack_object(slots[0]);
    stack->has_error = has_completion;
    stack->error = has_completion ? completion : oseo_undefined();
    OseoResult result = normal(oseo_undefined());
    for (size_t index = stack->resource_count / 3u; index > 0u; index -= 1u) {
        result = call_resource(context, slots[0], index - 1u);
        if (language_throw(context, result)) {
            result = record_error(context, slots[0], result.value);
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    stack = disposable_stack_object(slots[0]);
    release_resources(stack);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = stored_completion(context, slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* A fresh %Promise% already settled with `value`. */
static OseoResult settled_promise(
    OseoContext *context,
    OseoValue value,
    bool fulfilled
) {
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_promise_create(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = fulfilled
            ? oseo_promise_resolve_into(context, slots[1], slots[0])
            : oseo_promise_reject_into(context, slots[1], slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/* A promise rejected with the catchable throw `abrupt` carries. */
static OseoResult rejected_with(OseoContext *context, OseoResult abrupt) {
    if (!language_throw(context, abrupt)) return abrupt;
    oseo_context_clear_language_error(context);
    return settled_promise(context, abrupt.value, false);
}

/*
 * Await(value) inside an asynchronous DisposeResources. PromiseResolve
 * may throw synchronously, for example from a `constructor` getter; that
 * throw is returned as is, and the caller treats it as the dispose
 * result. Otherwise the record's two reactions are attached and the run
 * returns until one of them resumes it.
 */
static OseoResult dispose_await(
    OseoContext *context,
    OseoValue stack_value,
    OseoValue value
) {
    OseoValue slots[2] = {stack_value, value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_promise_resolve(context, slots[1]);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        result = oseo_promise_then(
            context,
            slots[1],
            stack->on_fulfilled,
            stack->on_rejected
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Settles the run's promise with its final completion. A run started by
 * generated code for `await using` has no promise of its own; its final
 * completion stays in the record for the generated frame to read.
 */
static OseoResult async_dispose_finish(
    OseoContext *context,
    OseoValue stack_value
) {
    OseoValue slots[2] = {stack_value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoDisposableStack *stack = disposable_stack_object(slots[0]);
    release_resources(stack);
    stack->phase = OSEO_DISPOSE_PHASE_DONE;
    slots[1] = stack->promise;
    OseoResult result = normal(oseo_undefined());
    if (is_promise(slots[1])) {
        stack->promise = oseo_undefined();
        bool has_error = stack->has_error;
        OseoValue error = stack->error;
        stack->has_error = false;
        stack->error = oseo_undefined();
        result = has_error
            ? oseo_promise_reject_into(context, slots[1], error)
            : oseo_promise_resolve_into(context, slots[1], oseo_undefined());
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Runs an asynchronous DisposeResources from the record's cursor until
 * it awaits or finishes. The record is rooted by the caller.
 */
static OseoResult async_dispose_run(
    OseoContext *context,
    OseoValue stack_value
) {
    OseoValue slots[2] = {stack_value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    for (;;) {
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        if (stack->cursor == 0u) break;
        size_t index = stack->cursor - 1u;
        int flags = (int)number_value(stack->resources[index * 3u + 2u]);
        bool async_hint = (flags & OSEO_DISPOSE_ASYNC_HINT) != 0;
        if (!async_hint && stack->needs_await && !stack->has_awaited) {
            /* The resource stays unconsumed until the tick resumes. */
            stack->needs_await = false;
            stack->phase = OSEO_DISPOSE_PHASE_TICK;
            result = dispose_await(context, slots[0], oseo_undefined());
            oseo_roots_pop(context, &frame);
            return result;
        }
        stack->cursor = index;
        if (tag_of(stack->resources[index * 3u + 1u]) == OSEO_TAG_UNDEFINED) {
            stack->needs_await = true;
            continue;
        }
        result = call_resource(context, slots[0], index);
        if (result.status == OSEO_STATUS_NORMAL && async_hint) {
            if ((flags & OSEO_DISPOSE_SYNC_FALLBACK) != 0) {
                result = settled_promise(context, oseo_undefined(), true);
            }
        } else if (language_throw(context, result) && async_hint &&
                   (flags & OSEO_DISPOSE_SYNC_FALLBACK) != 0) {
            /* The fallback closure turns the throw into its rejected
             * promise, which is still awaited. */
            oseo_context_clear_language_error(context);
            result = settled_promise(context, result.value, false);
        } else if (language_throw(context, result)) {
            result = record_error(context, slots[0], result.value);
            if (result.status != OSEO_STATUS_NORMAL) break;
            continue;
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (!async_hint) continue;
        slots[1] = result.value;
        stack = disposable_stack_object(slots[0]);
        stack->has_awaited = true;
        stack->phase = OSEO_DISPOSE_PHASE_RESULT;
        result = dispose_await(context, slots[0], slots[1]);
        if (language_throw(context, result)) {
            result = record_error(context, slots[0], result.value);
            if (result.status != OSEO_STATUS_NORMAL) break;
            continue;
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        if (stack->needs_await && !stack->has_awaited) {
            stack->needs_await = false;
            stack->phase = OSEO_DISPOSE_PHASE_FINAL;
            result = dispose_await(context, slots[0], oseo_undefined());
        } else {
            result = async_dispose_finish(context, slots[0]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* One of the two reactions that resume an asynchronous disposal. */
static OseoResult async_dispose_resume(
    OseoContext *context,
    OseoValue callee,
    OseoValue argument,
    bool fulfilled
) {
    OseoValue slots[2] = {callee, argument};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_function_environment(context, slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_get(context, result.value, 0u);
        slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_disposable_stack(slots[0])) {
        result = failure(
            context,
            "OSEO2001",
            "Invalid asynchronous disposal reaction."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        int phase = stack->phase;
        if (!fulfilled && phase == OSEO_DISPOSE_PHASE_RESULT) {
            result = record_error(context, slots[0], slots[1]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = phase == OSEO_DISPOSE_PHASE_FINAL
                ? async_dispose_finish(context, slots[0])
                : async_dispose_run(context, slots[0]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

/* Creates the record's two resuming reactions over one environment. */
static OseoResult async_dispose_reactions(
    OseoContext *context,
    OseoValue stack_value
) {
    OseoValue slots[3] = {stack_value, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 1u);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_set(context, slots[1], 0u, slots[0]);
    }
    static const size_t codes[2] = {
        OSEO_ASYNC_DISPOSE_FULFILLED_CODE_ID,
        OSEO_ASYNC_DISPOSE_REJECTED_CODE_ID,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = oseo_function_create(
            context,
            codes[index],
            slots[1],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[2] = result.value;
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        if (index == 0u) {
            stack->on_fulfilled = slots[2];
        } else {
            stack->on_rejected = slots[2];
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_dispose_capability_dispose_async(
    OseoContext *context,
    OseoValue capability,
    OseoValue promise,
    bool has_completion,
    OseoValue completion
) {
    OseoValue slots[3] = {capability, promise, completion};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = async_dispose_reactions(context, slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoDisposableStack *stack = disposable_stack_object(slots[0]);
        stack->promise = slots[1];
        stack->has_error = has_completion;
        stack->error = has_completion ? slots[2] : oseo_undefined();
        stack->cursor = stack->resource_count / 3u;
        stack->needs_await = false;
        stack->has_awaited = false;
        stack->phase = OSEO_DISPOSE_PHASE_RESULT;
        result = async_dispose_run(context, slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

bool oseo_internal_dispose_capability_done(OseoValue capability) {
    return disposable_stack_object(capability)->phase ==
        OSEO_DISPOSE_PHASE_DONE;
}

OseoResult oseo_internal_dispose_capability_completion(
    OseoContext *context,
    OseoValue capability
) {
    return stored_completion(context, capability);
}

/* DisposableStack.prototype.dispose and @@dispose. */
static OseoResult stack_dispose(OseoContext *context, OseoValue receiver) {
    if (!stack_receiver(receiver, false)) {
        return receiver_error(context, false);
    }
    OseoDisposableStack *stack = disposable_stack_object(receiver);
    if (stack->disposed) return normal(oseo_undefined());
    stack->disposed = true;
    return oseo_internal_dispose_capability_dispose(
        context,
        stack->capability,
        false,
        oseo_undefined()
    );
}

/* AsyncDisposableStack.prototype.disposeAsync and @@asyncDispose. */
static OseoResult stack_dispose_async(
    OseoContext *context,
    OseoValue receiver
) {
    if (!stack_receiver(receiver, true)) {
        return rejected_with(context, receiver_error(context, true));
    }
    OseoDisposableStack *stack = disposable_stack_object(receiver);
    if (stack->disposed) {
        return settled_promise(context, oseo_undefined(), true);
    }
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_promise_create(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        disposable_stack_object(slots[0])->disposed = true;
        result = oseo_internal_dispose_capability_dispose_async(
            context,
            stack_capability(slots[0]),
            slots[1],
            false,
            oseo_undefined()
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/* The `disposed` getter of either prototype. */
static OseoResult stack_disposed(
    OseoContext *context,
    OseoValue receiver,
    bool async
) {
    if (!stack_receiver(receiver, async)) {
        return receiver_error(context, async);
    }
    return normal(oseo_boolean(disposable_stack_object(receiver)->disposed));
}

/* The checks every adding method and `move` start with. */
static OseoResult pending_receiver(
    OseoContext *context,
    OseoValue receiver,
    bool async
) {
    if (!stack_receiver(receiver, async)) {
        return receiver_error(context, async);
    }
    if (disposable_stack_object(receiver)->disposed) {
        return disposed_error(context, async);
    }
    return normal(receiver);
}

static OseoResult stack_use(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value,
    bool async
) {
    OseoResult result = pending_receiver(context, receiver, async);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* The capability is captured before the dispose method's getter
     * runs, so a `move` inside that getter still sees the resource. */
    result = oseo_internal_dispose_capability_add(
        context,
        stack_capability(receiver),
        value,
        async
    );
    if (result.status == OSEO_STATUS_NORMAL) result.value = value;
    return result;
}

static OseoResult stack_adopt(
    OseoContext *context,
    OseoValue receiver,
    OseoValue value,
    OseoValue on_dispose,
    bool async
) {
    OseoResult result = pending_receiver(context, receiver, async);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (!is_callable(on_dispose)) {
        return type_error(context, "The onDispose callback is not callable.");
    }
    int flags = OSEO_DISPOSE_ADOPTED | (async ? OSEO_DISPOSE_ASYNC_HINT : 0);
    result = stack_push(
        context,
        stack_capability(receiver),
        value,
        on_dispose,
        flags
    );
    if (result.status == OSEO_STATUS_NORMAL) result.value = value;
    return result;
}

static OseoResult stack_defer(
    OseoContext *context,
    OseoValue receiver,
    OseoValue on_dispose,
    bool async
) {
    OseoResult result = pending_receiver(context, receiver, async);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (!is_callable(on_dispose)) {
        return type_error(context, "The onDispose callback is not callable.");
    }
    return stack_push(
        context,
        stack_capability(receiver),
        oseo_undefined(),
        on_dispose,
        async ? OSEO_DISPOSE_ASYNC_HINT : 0
    );
}

/*
 * `move` creates the new stack from the intrinsic constructor of the
 * running realm, hands it the receiver's capability record, and leaves
 * the receiver disposed with a fresh, empty one.
 */
static OseoResult stack_move(
    OseoContext *context,
    OseoValue receiver,
    bool async
) {
    OseoResult result = pending_receiver(context, receiver, async);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    result = oseo_internal_intrinsic(
        context,
        async
            ? OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK_PROTOTYPE
            : OSEO_INTRINSIC_DISPOSABLE_STACK_PROTOTYPE
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = stack_create(context, &slots[1], async);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoDisposableStack *source = disposable_stack_object(slots[0]);
        OseoDisposableStack *target = disposable_stack_object(result.value);
        OseoValue fresh = target->capability;
        target->capability = source->capability;
        source->capability = fresh;
        source->disposed = true;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* %Iterator.prototype%[@@dispose]: GetMethod(O, "return") and a call. */
static OseoResult iterator_dispose(OseoContext *context, OseoValue receiver) {
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "return");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_nullish(slots[1])) {
        result = is_callable(slots[1])
            ? oseo_call_function(
                context,
                slots[1],
                slots[0],
                0u,
                NULL,
                oseo_undefined()
            )
            : type_error(
                context,
                "The iterator return method is not callable."
            );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

/*
 * %AsyncIteratorPrototype%[@@asyncDispose]. Each abrupt step rejects the
 * returned promise. A `return` result is passed through PromiseResolve,
 * and the promise returned is the one PerformPromiseThen derives from it
 * with a reaction that discards the fulfillment value.
 */
static OseoResult async_iterator_dispose(
    OseoContext *context,
    OseoValue receiver
) {
    OseoValue slots[3] = {receiver, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "return");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        result = settled_promise(context, oseo_undefined(), true);
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(slots[1])) {
        result = type_error(
            context,
            "The iterator return method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve(context, result.value);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_create(context, 0u);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_ASYNC_ITERATOR_DISPOSE_UNWRAP_CODE_ID,
            slots[2],
            NULL,
            0u,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_then(
            context,
            slots[1],
            slots[2],
            oseo_undefined()
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        result = rejected_with(context, result);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_disposal_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    OseoValue first = argument_at(argument_count, arguments, 0u);
    OseoValue second = argument_at(argument_count, arguments, 1u);
    switch (code_id) {
    case OSEO_DISPOSABLE_STACK_CONSTRUCTOR_CODE_ID:
        return stack_construct(context, new_target, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_CONSTRUCTOR_CODE_ID:
        return stack_construct(context, new_target, true);
    case OSEO_DISPOSABLE_STACK_ADOPT_CODE_ID:
        return stack_adopt(context, receiver, first, second, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_ADOPT_CODE_ID:
        return stack_adopt(context, receiver, first, second, true);
    case OSEO_DISPOSABLE_STACK_DEFER_CODE_ID:
        return stack_defer(context, receiver, first, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_DEFER_CODE_ID:
        return stack_defer(context, receiver, first, true);
    case OSEO_DISPOSABLE_STACK_DISPOSE_CODE_ID:
        return stack_dispose(context, receiver);
    case OSEO_ASYNC_DISPOSABLE_STACK_DISPOSE_ASYNC_CODE_ID:
        return stack_dispose_async(context, receiver);
    case OSEO_DISPOSABLE_STACK_DISPOSED_CODE_ID:
        return stack_disposed(context, receiver, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_DISPOSED_CODE_ID:
        return stack_disposed(context, receiver, true);
    case OSEO_DISPOSABLE_STACK_MOVE_CODE_ID:
        return stack_move(context, receiver, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_MOVE_CODE_ID:
        return stack_move(context, receiver, true);
    case OSEO_DISPOSABLE_STACK_USE_CODE_ID:
        return stack_use(context, receiver, first, false);
    case OSEO_ASYNC_DISPOSABLE_STACK_USE_CODE_ID:
        return stack_use(context, receiver, first, true);
    case OSEO_ITERATOR_DISPOSE_CODE_ID:
        return iterator_dispose(context, receiver);
    case OSEO_ASYNC_ITERATOR_ASYNC_DISPOSE_CODE_ID:
        return async_iterator_dispose(context, receiver);
    case OSEO_ASYNC_ITERATOR_DISPOSE_UNWRAP_CODE_ID:
        return normal(oseo_undefined());
    case OSEO_ASYNC_DISPOSE_FULFILLED_CODE_ID:
        return async_dispose_resume(context, callee, first, true);
    case OSEO_ASYNC_DISPOSE_REJECTED_CODE_ID:
        return async_dispose_resume(context, callee, first, false);
    default:
        return oseo_unknown_function(context, code_id);
    }
}

static OseoResult create_disposal_builtin(
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

OseoResult oseo_internal_iterator_dispose_function(
    OseoContext *context,
    size_t code_id
) {
    return create_disposal_builtin(
        context,
        code_id,
        code_id == OSEO_ITERATOR_DISPOSE_CODE_ID
            ? "[Symbol.dispose]"
            : "[Symbol.asyncDispose]",
        0u,
        OSEO_FUNCTION_INTERNAL,
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
}

static OseoResult define_key(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    return oseo_object_define(context, object, key, value, attributes);
}

static OseoResult define_ascii_property(
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
        result = define_key(context, slots[0], slots[2], slots[1], attributes);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* One prototype method of a stack constructor. */
typedef struct {
    size_t code_id;
    const char *name;
    size_t length;
} OseoDisposalMethod;

/* One stack constructor, its prototype, and the prototype's members. */
typedef struct {
    OseoIntrinsic prototype_intrinsic;
    OseoIntrinsic constructor_intrinsic;
    size_t constructor_code_id;
    const char *name;
    const OseoDisposalMethod *methods;
    size_t method_count;
    /* The method also installed under `dispose_symbol`. */
    size_t dispose_method;
    size_t dispose_symbol;
    size_t disposed_code_id;
} OseoDisposalConstructor;

static const OseoDisposalMethod disposable_stack_methods[] = {
    {OSEO_DISPOSABLE_STACK_ADOPT_CODE_ID, "adopt", 2u},
    {OSEO_DISPOSABLE_STACK_DEFER_CODE_ID, "defer", 1u},
    {OSEO_DISPOSABLE_STACK_DISPOSE_CODE_ID, "dispose", 0u},
    {OSEO_DISPOSABLE_STACK_MOVE_CODE_ID, "move", 0u},
    {OSEO_DISPOSABLE_STACK_USE_CODE_ID, "use", 1u},
};

static const OseoDisposalMethod async_disposable_stack_methods[] = {
    {OSEO_ASYNC_DISPOSABLE_STACK_ADOPT_CODE_ID, "adopt", 2u},
    {OSEO_ASYNC_DISPOSABLE_STACK_DEFER_CODE_ID, "defer", 1u},
    {OSEO_ASYNC_DISPOSABLE_STACK_DISPOSE_ASYNC_CODE_ID, "disposeAsync", 0u},
    {OSEO_ASYNC_DISPOSABLE_STACK_MOVE_CODE_ID, "move", 0u},
    {OSEO_ASYNC_DISPOSABLE_STACK_USE_CODE_ID, "use", 1u},
};

/*
 * Constructor order is the order the globals are installed. The last
 * constructor's slot doubles as the cluster's completion marker.
 */
static const OseoDisposalConstructor disposal_constructors[] = {
    {
        OSEO_INTRINSIC_DISPOSABLE_STACK_PROTOTYPE,
        OSEO_INTRINSIC_DISPOSABLE_STACK,
        OSEO_DISPOSABLE_STACK_CONSTRUCTOR_CODE_ID,
        "DisposableStack",
        disposable_stack_methods,
        sizeof(disposable_stack_methods) / sizeof(disposable_stack_methods[0]),
        2u,
        OSEO_WELL_KNOWN_DISPOSE,
        OSEO_DISPOSABLE_STACK_DISPOSED_CODE_ID,
    },
    {
        OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK_PROTOTYPE,
        OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK,
        OSEO_ASYNC_DISPOSABLE_STACK_CONSTRUCTOR_CODE_ID,
        "AsyncDisposableStack",
        async_disposable_stack_methods,
        sizeof(async_disposable_stack_methods) /
            sizeof(async_disposable_stack_methods[0]),
        2u,
        OSEO_WELL_KNOWN_ASYNC_DISPOSE,
        OSEO_ASYNC_DISPOSABLE_STACK_DISPOSED_CODE_ID,
    },
};

#define OSEO_DISPOSAL_CONSTRUCTOR_COUNT \
    (sizeof(disposal_constructors) / sizeof(disposal_constructors[0]))

/*
 * Builds one constructor and prototype in the specification's property
 * order. `slots` holds 0 Object.prototype, 1 the prototype, 2 the
 * constructor, 3 a method, 4 a key, 5 a value, and 6 the dispose method.
 */
static OseoResult disposal_constructor_build(
    OseoContext *context,
    const OseoDisposalConstructor *description,
    OseoValue *slots
) {
    const OseoPropertyAttributes method = {true, false, true, false};
    OseoResult result = oseo_object_create(context, slots[0]);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_disposal_builtin(
            context,
            description->constructor_code_id,
            description->name,
            0u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoFunction *constructor = function_object(slots[2]);
        constructor->prototype_object = slots[1];
        constructor->prototype_writable = false;
        result = define_ascii_property(
            context,
            slots[1],
            "constructor",
            slots[2],
            method
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < description->method_count;
         index += 1u) {
        const OseoDisposalMethod *entry = &description->methods[index];
        result = create_disposal_builtin(
            context,
            entry->code_id,
            entry->name,
            entry->length,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (index == description->dispose_method) slots[6] = slots[3];
        result = define_ascii_property(
            context,
            slots[1],
            entry->name,
            slots[3],
            method
        );
        /* The `disposed` accessor follows the dispose method. */
        if (result.status != OSEO_STATUS_NORMAL ||
            index != description->dispose_method) {
            continue;
        }
        result = create_disposal_builtin(
            context,
            description->disposed_code_id,
            "disposed",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(context, "disposed");
            slots[4] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define_accessor(
                context,
                slots[1],
                slots[4],
                slots[3],
                oseo_undefined(),
                true,
                false,
                (OseoPropertyAttributes){true, false, false, true}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            description->dispose_symbol
        );
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_key(context, slots[1], slots[4], slots[6], method);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, description->name);
        slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_key(
            context,
            slots[1],
            slots[4],
            slots[5],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->realm->intrinsics[description->prototype_intrinsic] =
            slots[1];
        context->realm->intrinsics[description->constructor_intrinsic] =
            slots[2];
    }
    return result;
}

OseoResult oseo_internal_disposal_intrinsic(OseoContext *context) {
    OseoValue *intrinsics = context->realm->intrinsics;
    OseoValue *marker = &intrinsics[OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK];
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_OBJECT_PROTOTYPE);
    frame.slots[0] = result.value;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_DISPOSAL_CONSTRUCTOR_COUNT;
         index += 1u) {
        result = disposal_constructor_build(
            context,
            &disposal_constructors[index],
            frame.slots
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_DISPOSABLE_STACK_PROTOTYPE;
             index <= OSEO_INTRINSIC_ASYNC_DISPOSABLE_STACK;
             index += 1u) {
            context->realm->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(*marker);
}

OseoResult oseo_internal_install_disposal_globals(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_disposal_intrinsic(context);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_DISPOSAL_CONSTRUCTOR_COUNT;
         index += 1u) {
        slots[1] = context->realm->intrinsics[
            disposal_constructors[index].constructor_intrinsic
        ];
        result = define_ascii_property(
            context,
            slots[0],
            disposal_constructors[index].name,
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
