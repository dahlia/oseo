#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * The generic synchronous iterator protocol: GetIterator over
 * Symbol.iterator, IteratorStep and IteratorValue, IteratorClose, and
 * the first-class array iterator that backs a default array's values.
 */

static OseoResult ascii_iterator_string(
    OseoContext *context,
    const char *text
) {
    size_t length = strlen(text);
    uint16_t units[16];
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_string_from_units(context, units, length);
}

/* True when the key is the well-known Symbol.iterator. */
bool oseo_internal_iterator_key_matches(
    OseoContext *context,
    OseoValue key
) {
    if (!is_symbol(key)) return false;
    OseoResult iterator_symbol =
        oseo_internal_well_known_symbol(context, OSEO_WELL_KNOWN_ITERATOR);
    return iterator_symbol.status == OSEO_STATUS_NORMAL &&
        iterator_symbol.value == key;
}

/* The same for Symbol.asyncIterator. */
bool oseo_internal_async_iterator_key_matches(
    OseoContext *context,
    OseoValue key
) {
    if (!is_symbol(key)) return false;
    OseoResult iterator_symbol = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ASYNC_ITERATOR
    );
    return iterator_symbol.status == OSEO_STATUS_NORMAL &&
        iterator_symbol.value == key;
}

/*
 * The virtualized internal iterator methods are cached on the context
 * so each stays permanently rooted, matching the promise-method
 * pattern; a fresh allocation on every property read would leave the
 * returned function briefly unrooted across a call boundary.
 */
OseoResult oseo_internal_iterator_method(
    OseoContext *context,
    size_t code_id
) {
    OseoValue *cache;
    const uint16_t next_units[] = {'n', 'e', 'x', 't'};
    const uint16_t return_units[] = {'r', 'e', 't', 'u', 'r', 'n'};
    const uint16_t values_units[] = {'v', 'a', 'l', 'u', 'e', 's'};
    static const uint16_t symbol_iterator_units[] = {
        '[', 'S', 'y', 'm', 'b', 'o', 'l', '.',
        'i', 't', 'e', 'r', 'a', 't', 'o', 'r', ']'
    };
    const uint16_t *name;
    size_t name_length;
    /* %GeneratorPrototype%.next and .return each take one declared
     * parameter; every other virtualized iterator method declares none. */
    size_t parameter_count = 0u;
    if (code_id == OSEO_ARRAY_ITERATOR_NEXT_CODE_ID) {
        cache = &context->iterator_next_function;
        name = next_units;
        name_length = 4u;
    } else if (code_id == OSEO_GENERATOR_NEXT_CODE_ID) {
        cache = &context->generator_next_function;
        name = next_units;
        name_length = 4u;
        parameter_count = 1u;
    } else if (code_id == OSEO_GENERATOR_RETURN_CODE_ID) {
        cache = &context->generator_return_function;
        name = return_units;
        name_length = 6u;
        parameter_count = 1u;
    } else if (code_id == OSEO_ARRAY_VALUES_CODE_ID) {
        cache = &context->iterator_values_function;
        name = values_units;
        name_length = 6u;
    } else {
        cache = &context->iterator_self_function;
        name = symbol_iterator_units;
        name_length = sizeof(symbol_iterator_units) /
            sizeof(*symbol_iterator_units);
    }
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
            name,
            name_length,
            parameter_count,
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

OseoResult oseo_internal_array_values(
    OseoContext *context,
    OseoValue array
) {
    if (!is_array(array)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Array iteration requires an array receiver."
        );
    }
    OseoValue slots[1] = {array};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_create(context, oseo_null());
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *iterator = ordinary_object(result.value);
        iterator->default_intrinsics = true;
        iterator->array_iterator = true;
        iterator->iterator_array = slots[0];
        iterator->iterator_index = 0u;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_iterator_result(
    OseoContext *context,
    OseoValue value,
    bool done
) {
    OseoValue slots[3] = {value, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_literal_create(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[1] = result.value;
        const OseoPropertyAttributes plain = {true, true, true, false};
        result = ascii_iterator_string(context, "value");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                slots[1],
                slots[2],
                slots[0],
                plain
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = ascii_iterator_string(context, "done");
            slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                slots[1],
                slots[2],
                oseo_boolean(done),
                plain
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_array_iterator_next(
    OseoContext *context,
    OseoValue iterator
) {
    if (!is_array_iterator(iterator)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Array iterator next requires an array iterator receiver."
        );
    }
    OseoOrdinaryObject *state = ordinary_object(iterator);
    if (!is_array(state->iterator_array)) {
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    uint32_t length = ordinary_object(state->iterator_array)->array_length;
    if (state->iterator_index >= length) {
        state->iterator_array = oseo_undefined();
        return oseo_internal_iterator_result(context, oseo_undefined(), true);
    }
    OseoValue slots[2] = {iterator, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_property_key(context, oseo_number((double)state->iterator_index));
    if (result.status == OSEO_STATUS_NORMAL) {
        state = ordinary_object(slots[0]);
        result = oseo_object_get(context, state->iterator_array, result.value);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        state = ordinary_object(slots[0]);
        state->iterator_index += 1u;
        result = oseo_internal_iterator_result(context, slots[1], false);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetIterator(iterable, sync): read the Symbol.iterator method and call
 * it, validating that the result is an object, then capture the
 * iterator's next method once so every later step reuses it as the
 * specification's iterator record requires. A default array with no
 * user-overridden Symbol.iterator uses the native array iterator.
 */
OseoResult oseo_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
) {
    *next_method = oseo_undefined();
    OseoValue slots[3] = {iterable, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_internal_well_known_symbol(context, OSEO_WELL_KNOWN_ITERATOR);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Symbol.iterator method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[2],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[1], slots[2]);
        *next_method = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(*next_method)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator next method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * IteratorStep and IteratorValue: call next(), validate the result is
 * an object, and read its done and value fields. A truthy done reports
 * exhaustion.
 */
OseoResult oseo_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    /* The next method captured by GetIterator is reused every step. */
    OseoValue slots[3] = {iterator, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        next_method,
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "done");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
        }
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && !is_done) {
        result = ascii_iterator_string(context, "value");
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            *value = result.value;
            *done = false;
        }
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!*done));
}

/*
 * IteratorComplete over one delegation step's result, followed by
 * IteratorValue only when the step is done. A step that is not done
 * reports the inner result object itself, because GeneratorYield
 * forwards it to the resuming consumer unchanged; reading `value` there
 * would observe a getter the specification never runs.
 */
static OseoResult delegate_result_fields(
    OseoContext *context,
    OseoValue inner,
    OseoValue *result_value,
    bool *done
) {
    OseoValue slots[2] = {inner, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *done = oseo_to_boolean(result.value);
        if (!*done) {
            *result_value = slots[0];
            oseo_roots_pop(context, &frame);
            return normal(oseo_boolean(true));
        }
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) *result_value = result.value;
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(false));
}

OseoResult oseo_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *result_value,
    bool *done
) {
    *result_value = oseo_undefined();
    *done = true;
    /* The sent value occupies its own root slot so it can be passed as
     * the one-element argument list the specification requires. */
    OseoValue slots[3] = {iterator, next_method, sent};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        1u,
        &slots[2],
        oseo_undefined()
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = delegate_result_fields(
            context,
            slots[2],
            result_value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *result_value,
    bool *done
) {
    /* GetMethod reports undefined for both an absent and a null method,
     * and the delegating body then leaves through the return completion
     * carrying the value the resumption delivered. */
    *result_value = sent;
    *done = true;
    OseoValue slots[3] = {iterator, oseo_undefined(), sent};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_boolean(false));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            1u,
            &slots[2],
            oseo_undefined()
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = delegate_result_fields(
            context,
            slots[2],
            result_value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * IteratorClose: if the iterator has a callable return method, call it.
 * When closing because of an in-flight error the original completion is
 * preserved, so a catchable throw or non-object return result is
 * discarded, but a non-catchable resource or host diagnostic still
 * propagates.
 */
OseoResult oseo_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
) {
    if (!is_object(iterator)) return normal(oseo_undefined());
    OseoValue slots[3] = {iterator, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[1])) {
        if (from_error) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_undefined());
        }
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
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
    if (from_error) {
        if (result.status == OSEO_STATUS_THROW && context->has_diagnostic) {
            oseo_roots_pop(context, &frame);
            return result;
        }
        oseo_context_clear_language_error(context);
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(result.value)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_undefined());
}

/*
 * CreateAsyncFromSyncIterator over an already acquired synchronous
 * iterator. The wrapper is an internal record rather than an object with
 * methods: nothing outside this file reads it, so it needs no prototype
 * and no own properties, and the asynchronous step and close entry
 * points recognize it by its flag.
 */
static OseoResult async_from_sync_create(
    OseoContext *context,
    OseoValue sync_iterator
) {
    OseoValue slots[1] = {sync_iterator};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_create(context, oseo_null());
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *wrapper = ordinary_object(result.value);
        wrapper->async_from_sync = true;
        wrapper->async_sync_iterator = slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * GetIterator(iterable, async): read the Symbol.asyncIterator method and
 * call it, then capture the resulting iterator's next method once. A
 * value with no such method falls back to GetIterator(iterable, sync)
 * and wraps that record, which is what makes a synchronous iterable
 * usable by a `for await` head.
 */
OseoResult oseo_async_iterator_get(
    OseoContext *context,
    OseoValue iterable,
    OseoValue *next_method
) {
    *next_method = oseo_undefined();
    OseoValue slots[3] = {iterable, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ASYNC_ITERATOR
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The value is not async iterable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_iterator_get(context, slots[0], next_method);
        slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_create(context, slots[1]);
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The Symbol.asyncIterator method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[2],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "next");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[1], slots[2]);
        *next_method = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(*next_method)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator next method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * AsyncFromSyncIteratorContinuation over one synchronous step result:
 * read `done` and `value`, then await the value. The value is awaited
 * even for the step that reports exhaustion, because the wrapper
 * promises a settled result object either way, and a rejected value
 * therefore reaches the head as a rejected step rather than as an
 * exhausted iterator. The specification closes the synchronous iterator
 * only when PromiseResolve itself completes abruptly, which a rejecting
 * thenable does not, so a rejection leaves the iterator open exactly as
 * a rejected asynchronous step does.
 */
static OseoResult async_from_sync_continuation(
    OseoContext *context,
    OseoValue step_result,
    OseoValue *value,
    bool *done
) {
    OseoValue slots[2] = {step_result, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[1]);
    }
    /* Both roles this continuation serves read the awaited value: a
     * `for await` step ignores it once the iterator reports exhaustion,
     * while a `yield*` delegation step reports it as its own result. */
    if (result.status == OSEO_STATUS_NORMAL) {
        *value = result.value;
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

/*
 * The Await that a `for await` head and AsyncIteratorClose each perform on
 * the promise a wrapper method returns, whatever that promise settles to.
 * Every path through AsyncFromSyncIteratorPrototype.next and .return
 * produces one, so the jobs queued before the step or the close run before
 * the awaiting body resumes. It is a turn of its own even when the
 * wrapper's own continuation already awaited the stepped value, because
 * that inner await only settles the promise this one waits on. An abrupt
 * path reaches it too, because IfAbruptRejectPromise rejects that same
 * promise rather than throwing to the caller. The pending completion is
 * carried across the drain the way the entry task checkpoint carries one,
 * because the jobs it runs may raise and clear language errors of their
 * own.
 */
static OseoResult await_wrapper_promise(
    OseoContext *context,
    OseoResult completion
) {
    /* A host diagnostic is terminal, so no further job runs after it. */
    if (completion.status == OSEO_STATUS_THROW && context->has_diagnostic) {
        return completion;
    }
    const char *error_code = context->error_code;
    const char *error_message = context->error_message;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    bool had_diagnostic = context->has_diagnostic;
    OseoValue slots[1] = {completion.value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult drained = oseo_internal_await_step(context, oseo_undefined());
    oseo_roots_pop(context, &frame);
    if (drained.status != OSEO_STATUS_NORMAL && context->has_diagnostic) {
        return drained;
    }
    if (completion.status == OSEO_STATUS_NORMAL) {
        if (drained.status != OSEO_STATUS_NORMAL) return drained;
        drained.value = slots[0];
        return drained;
    }
    context->error_code = error_code;
    context->error_message = error_message;
    context->has_diagnostic = had_diagnostic;
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    context->line = line;
    context->column = column;
    completion.value = slots[0];
    return completion;
}

/*
 * One asynchronous iteration step: call the captured next method, await
 * its result, require an object, and read `done` and `value`. A wrapped
 * synchronous iterator instead runs the wrapper's own continuation, which
 * awaits the stepped value, and the head then awaits the promise that
 * continuation settles, so the two records report the same contract to one
 * loop lowering across the same number of turns.
 */
OseoResult oseo_async_iterator_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[4] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        next_method,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        0u,
        NULL,
        oseo_undefined()
    );
    slots[2] = result.value;
    if (from_sync) {
        if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator result is not an object."
            );
        }
        bool stepped_done = true;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_continuation(
                context,
                slots[2],
                &slots[3],
                &stepped_done
            );
        }
        /*
         * The head awaits the promise the wrapper's next method returned,
         * which the continuation's await of the stepped value only settles.
         * The stepped value stays rooted across that turn and reaches the
         * caller only once it survives, because the drain runs jobs that
         * allocate.
         */
        result = await_wrapper_promise(context, result);
        if (result.status == OSEO_STATUS_NORMAL && !stepped_done) {
            *value = slots[3];
            *done = false;
        }
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(!*done));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[2]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "done");
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[2], slots[3]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL && !is_done) {
        result = ascii_iterator_string(context, "value");
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[2], slots[3]);
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            *value = result.value;
            *done = false;
        }
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!*done));
}

/*
 * AsyncIteratorClose: call a callable return method and await its
 * result, which must be an object. A wrapped synchronous iterator instead
 * runs AsyncFromSyncIteratorPrototype.return, which requires an object
 * result and reads and awaits its `done` and `value`, and reports a
 * completed iterator result when the synchronous iterator declares no
 * `return` at all. Every wrapper path therefore reaches an Await. As in
 * the synchronous close, an in-flight error keeps the original completion,
 * which is why the result check runs after that precedence.
 */
OseoResult oseo_async_iterator_close(
    OseoContext *context,
    OseoValue iterator,
    bool from_error
) {
    if (!is_object(iterator)) return normal(oseo_undefined());
    bool from_sync = is_async_from_sync_iterator(iterator);
    OseoValue slots[3] = {
        from_sync ? ordinary_object(iterator)->async_sync_iterator : iterator,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "return");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[2]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[1])) {
        if (!from_sync) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_undefined());
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               !is_function(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return method is not callable."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[1],
            slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
        slots[2] = result.value;
        if (!from_sync) {
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_await_step(context, slots[2]);
                slots[2] = result.value;
            }
        } else if (result.status == OSEO_STATUS_NORMAL &&
                   !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator return result is not an object."
            );
        } else if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue stepped = oseo_undefined();
            bool done = true;
            result = async_from_sync_continuation(
                context,
                slots[2],
                &stepped,
                &done
            );
        }
    }
    /*
     * AsyncIteratorClose awaits the wrapper's promise, which is a turn of
     * its own: the continuation's await of the stepped value settles that
     * promise rather than consuming this one.
     */
    if (from_sync) result = await_wrapper_promise(context, result);
    if (from_error) {
        // The in-flight error stays authoritative, so the result check
        // below never runs and only a host diagnostic propagates.
        if (result.status == OSEO_STATUS_THROW && context->has_diagnostic) {
            oseo_roots_pop(context, &frame);
            return result;
        }
        oseo_context_clear_language_error(context);
        oseo_roots_pop(context, &frame);
        return normal(oseo_undefined());
    }
    /* A wrapped iterator resolves to a fresh iterator result object, so
     * only a native asynchronous iterator can report a non-object here. */
    if (result.status == OSEO_STATUS_NORMAL && !from_sync &&
        !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The iterator return result is not an object."
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_undefined());
}

/*
 * `done` and `value` of one awaited asynchronous delegation result.
 * Unlike the synchronous delegation, which forwards the inner result
 * object unchanged, an asynchronous `yield*` reports IteratorValue for
 * every step, because AsyncGeneratorYield produces the outer step.
 */
static OseoResult async_delegate_result_fields(
    OseoContext *context,
    OseoValue inner,
    OseoValue *result_value,
    bool *done
) {
    OseoValue slots[2] = {inner, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, "done");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    bool is_done = result.status == OSEO_STATUS_NORMAL &&
        oseo_to_boolean(result.value);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_iterator_string(context, "value");
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *result_value = result.value;
        *done = is_done;
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(!is_done));
}

/*
 * One asynchronous delegation step: call `method` with `argument`, await
 * its result, and read `done` and `value`. A wrapped synchronous
 * iterator runs the wrapper's own continuation, which awaits the stepped
 * value, and the step then awaits the promise that continuation settles,
 * so both records spend the same number of turns per step.
 */
static OseoResult async_delegate_invoke(
    OseoContext *context,
    OseoValue target,
    bool from_sync,
    OseoValue method,
    OseoValue argument,
    OseoValue *value,
    bool *done
) {
    OseoValue slots[3] = {target, method, argument};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_call_function(
        context,
        slots[1],
        slots[0],
        1u,
        &slots[2],
        oseo_undefined()
    );
    slots[2] = result.value;
    if (from_sync) {
        if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator result is not an object."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = async_from_sync_continuation(
                context,
                slots[2],
                value,
                done
            );
        }
        result = await_wrapper_promise(context, result);
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        return normal(oseo_boolean(!*done));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_await_step(context, slots[2]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The async iterator result is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_result_fields(context, slots[2], value, done);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The iterator a delegation step actually calls its method on. */
static OseoValue delegation_target(OseoValue iterator) {
    return is_async_from_sync_iterator(iterator)
        ? ordinary_object(iterator)->async_sync_iterator
        : iterator;
}

OseoResult oseo_async_iterator_delegate_next(
    OseoContext *context,
    OseoValue iterator,
    OseoValue next_method,
    OseoValue sent,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    return async_delegate_invoke(
        context,
        delegation_target(iterator),
        is_async_from_sync_iterator(iterator),
        next_method,
        sent,
        value,
        done
    );
}

/*
 * GetMethod over one delegation step's named method. An absent or null
 * method reports no method rather than an error, which is what lets a
 * return step end the delegation and a throw step close the iterator.
 */
static OseoResult delegate_method(
    OseoContext *context,
    OseoValue target,
    const char *name,
    OseoValue *method,
    bool *present
) {
    *method = oseo_undefined();
    *present = false;
    OseoValue slots[2] = {target, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_iterator_string(context, name);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_nullish(slots[1])) {
        if (!is_function(slots[1])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The iterator method is not callable."
            );
        } else {
            *method = slots[1];
            *present = true;
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_return(
    OseoContext *context,
    OseoValue iterator,
    OseoValue sent,
    OseoValue *value,
    bool *done
) {
    /* An iterator with no `return` method reports done with the value the
     * resumption delivered, which is the return completion the delegating
     * body then leaves through. */
    *value = sent;
    *done = true;
    OseoValue slots[3] = {iterator, sent, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "return",
        &slots[2],
        &present
    );
    if (result.status == OSEO_STATUS_NORMAL && !present) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_boolean(false));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_invoke(
            context,
            delegation_target(slots[0]),
            is_async_from_sync_iterator(slots[0]),
            slots[2],
            slots[1],
            value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_async_iterator_delegate_throw(
    OseoContext *context,
    OseoValue iterator,
    OseoValue reason,
    OseoValue *value,
    bool *done
) {
    *value = oseo_undefined();
    *done = true;
    OseoValue slots[3] = {iterator, reason, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    bool present = false;
    OseoResult result = delegate_method(
        context,
        delegation_target(slots[0]),
        "throw",
        &slots[2],
        &present
    );
    /* The delegating body has no way to deliver a throw completion to an
     * iterator that declares no `throw`, so it closes that iterator and
     * reports a TypeError instead. An abrupt close replaces it. */
    if (result.status == OSEO_STATUS_NORMAL && !present) {
        result = oseo_async_iterator_close(context, slots[0], false);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "The delegated iterator has no throw method."
            );
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = async_delegate_invoke(
            context,
            delegation_target(slots[0]),
            is_async_from_sync_iterator(slots[0]),
            slots[2],
            slots[1],
            value,
            done
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}
