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
    const uint16_t values_units[] = {'v', 'a', 'l', 'u', 'e', 's'};
    static const uint16_t symbol_iterator_units[] = {
        '[', 'S', 'y', 'm', 'b', 'o', 'l', '.',
        'i', 't', 'e', 'r', 'a', 't', 'o', 'r', ']'
    };
    const uint16_t *name;
    size_t name_length;
    if (code_id == OSEO_ARRAY_ITERATOR_NEXT_CODE_ID) {
        cache = &context->iterator_next_function;
        name = next_units;
        name_length = 4u;
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
            0u,
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

/* Build one { value, done } iterator result object. */
static OseoResult iterator_result(
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
        return iterator_result(context, oseo_undefined(), true);
    }
    uint32_t length = ordinary_object(state->iterator_array)->array_length;
    if (state->iterator_index >= length) {
        state->iterator_array = oseo_undefined();
        return iterator_result(context, oseo_undefined(), true);
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
        result = iterator_result(context, slots[1], false);
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
