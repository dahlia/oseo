#include "runtime_internal.h"

#include <math.h>
#include <string.h>

/*
 * String.prototype methods whose first operand may dispatch through a
 * well-known symbol. String-only fallbacks stay separate from the core
 * String value and wrapper implementation so neighboring M5b nodes do not
 * need to edit the same algorithm body.
 */

static OseoValue match_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult match_subject(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_nullish(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String method receiver is nullish."
        );
    }
    return oseo_internal_value_string(context, receiver);
}

static bool match_matches_at(
    const OseoString *subject,
    const OseoString *search,
    size_t position
) {
    if (position > subject->length ||
        search->length > subject->length - position) return false;
    return search->length == 0u ||
        memcmp(
            subject->units + position,
            search->units,
            search->length * sizeof(uint16_t)
        ) == 0;
}

/* IsRegExp, before the RegExp heap kind itself is admitted. */
static OseoResult match_is_regexp(
    OseoContext *context,
    OseoValue value,
    bool *regexp
) {
    if (!is_object(value)) {
        *regexp = false;
        return normal(oseo_boolean(false));
    }
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_MATCH
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(result.value) != OSEO_TAG_UNDEFINED) {
        *regexp = oseo_to_boolean(result.value);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        *regexp = false;
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_boolean(*regexp))
        : result;
}

static OseoResult string_named_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
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
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult string_match_result(
    OseoContext *context,
    OseoValue subject,
    size_t position,
    size_t length
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = subject;
    result = oseo_array_create(context, 0u);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *string = string_object(frame.slots[0]);
        result = oseo_internal_allocate_string(
            context,
            string->units + position,
            length
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, frame.slots[1], frame.slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_named_property(
            context,
            frame.slots[1],
            "index",
            oseo_number((double)position)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_named_property(
            context,
            frame.slots[1],
            "input",
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_named_property(
            context,
            frame.slots[1],
            "groups",
            oseo_undefined()
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static bool string_find(
    OseoValue subject_value,
    OseoValue search_value,
    size_t start,
    size_t *position
) {
    const OseoString *subject = string_object(subject_value);
    const OseoString *search = string_object(search_value);
    if (start > subject->length || search->length > subject->length) {
        return false;
    }
    size_t last = subject->length - search->length;
    for (size_t index = start; index <= last; index += 1u) {
        if (match_matches_at(subject, search, index)) {
            *position = index;
            return true;
        }
    }
    return false;
}

static size_t string_symbol_index(size_t code_id) {
    if (code_id == OSEO_STRING_MATCH_CODE_ID) return OSEO_WELL_KNOWN_MATCH;
    if (code_id == OSEO_STRING_MATCH_ALL_CODE_ID) {
        return OSEO_WELL_KNOWN_MATCH_ALL;
    }
    if (code_id == OSEO_STRING_SEARCH_CODE_ID) return OSEO_WELL_KNOWN_SEARCH;
    return OSEO_WELL_KNOWN_SPLIT;
}

static OseoResult string_match_all_flags(
    OseoContext *context,
    OseoValue regexp
) {
    OseoValue slots[3] = {regexp, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "flags");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String.prototype.matchAll flags are nullish."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, slots[2]);
        slots[2] = result.value;
    }
    bool global = false;
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *flags = string_object(slots[2]);
        for (size_t index = 0u; index < flags->length; index += 1u) {
            if (flags->units[index] == UINT16_C(0x67)) {
                global = true;
                break;
            }
        }
        if (!global) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "String.prototype.matchAll requires a global RegExp."
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult string_protocol_method(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    bool *dispatched
) {
    *dispatched = false;
    if (is_nullish(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String method receiver is nullish."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = match_argument(
        argument_count,
        arguments,
        0u
    );
    frame.slots[2] = match_argument(
        argument_count,
        arguments,
        1u
    );
    frame.slots[3] = oseo_undefined();
    bool regexp = false;
    if (code_id == OSEO_STRING_MATCH_ALL_CODE_ID &&
        !is_nullish(frame.slots[1])) {
        result = match_is_regexp(context, frame.slots[1], &regexp);
        if (result.status == OSEO_STATUS_NORMAL && regexp) {
            result = string_match_all_flags(context, frame.slots[1]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_object(frame.slots[1])) {
        result = oseo_internal_well_known_symbol(
            context,
            string_symbol_index(code_id)
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_object(frame.slots[1])) {
        result = oseo_object_get(
            context,
            frame.slots[1],
            frame.slots[3]
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_nullish(frame.slots[3])) {
        if (!is_function(frame.slots[3])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "String symbol protocol method is not callable."
            );
        } else {
            size_t call_count = code_id == OSEO_STRING_SPLIT_CODE_ID
                ? 2u
                : 1u;
            OseoValue call_arguments[2] = {
                frame.slots[0],
                frame.slots[2],
            };
            result = oseo_call_function(
                context,
                frame.slots[3],
                frame.slots[1],
                call_count,
                call_arguments,
                oseo_undefined()
            );
            *dispatched = true;
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_fallback_pattern(
    OseoContext *context,
    OseoValue value
) {
    return tag_of(value) == OSEO_TAG_UNDEFINED
        ? oseo_internal_allocate_string(context, NULL, 0u)
        : oseo_internal_value_string(context, value);
}

static OseoResult string_match_or_search(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    bool dispatched = false;
    OseoResult result = string_protocol_method(
        context,
        code_id,
        receiver,
        argument_count,
        arguments,
        &dispatched
    );
    if (result.status != OSEO_STATUS_NORMAL || dispatched) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = match_subject(context, receiver);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_fallback_pattern(
            context,
            match_argument(argument_count, arguments, 0u)
        );
        frame.slots[1] = result.value;
    }
    size_t position = 0u;
    bool found = result.status == OSEO_STATUS_NORMAL && string_find(
        frame.slots[0],
        frame.slots[1],
        0u,
        &position
    );
    if (result.status == OSEO_STATUS_NORMAL &&
        code_id == OSEO_STRING_SEARCH_CODE_ID) {
        result = normal(oseo_number(found ? (double)position : -1.0));
    } else if (result.status == OSEO_STATUS_NORMAL && !found) {
        result = normal(oseo_null());
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = string_match_result(
            context,
            frame.slots[0],
            position,
            string_object(frame.slots[1])->length
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_match_all(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    bool dispatched = false;
    OseoResult result = string_protocol_method(
        context,
        OSEO_STRING_MATCH_ALL_CODE_ID,
        receiver,
        argument_count,
        arguments,
        &dispatched
    );
    if (result.status != OSEO_STATUS_NORMAL || dispatched) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = match_subject(context, receiver);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_fallback_pattern(
            context,
            match_argument(argument_count, arguments, 0u)
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[2] = result.value;
    }
    size_t next = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        size_t position = 0u;
        if (!string_find(frame.slots[0], frame.slots[1], next, &position)) {
            break;
        }
        result = string_match_result(
            context,
            frame.slots[0],
            position,
            string_object(frame.slots[1])->length
        );
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[2],
                frame.slots[3]
            );
        }
        size_t search_length = string_object(frame.slots[1])->length;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (search_length == 0u) {
            if (position == string_object(frame.slots[0])->length) break;
            next = position + 1u;
        } else {
            next = position + search_length;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_array_values(context, frame.slots[2]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static uint32_t string_to_uint32(double number) {
    if (!isfinite(number) || number == 0.0) return 0u;
    double modulo = fmod(trunc(number), 4294967296.0);
    if (modulo < 0.0) modulo += 4294967296.0;
    return (uint32_t)modulo;
}

static OseoResult string_append_slice(
    OseoContext *context,
    OseoValue array,
    OseoValue subject,
    size_t start,
    size_t end
) {
    OseoValue slots[3] = {array, subject, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    const OseoString *string = string_object(slots[1]);
    OseoResult result = oseo_internal_allocate_string(
        context,
        string->units + start,
        end - start
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, slots[0], slots[2]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult string_split(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    bool dispatched = false;
    OseoResult result = string_protocol_method(
        context,
        OSEO_STRING_SPLIT_CODE_ID,
        receiver,
        argument_count,
        arguments,
        &dispatched
    );
    if (result.status != OSEO_STATUS_NORMAL || dispatched) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = match_argument(argument_count, arguments, 0u);
    frame.slots[1] = match_argument(argument_count, arguments, 1u);
    result = match_subject(context, receiver);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[3] = result.value;
    }
    uint32_t limit = UINT32_MAX;
    bool separator_undefined =
        tag_of(frame.slots[0]) == OSEO_TAG_UNDEFINED;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[1]) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_to_number(context, frame.slots[1]);
        if (result.status == OSEO_STATUS_NORMAL) {
            limit = string_to_uint32(number_value(result.value));
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !separator_undefined) {
        result = oseo_internal_value_string(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && limit == 0u) {
        result = normal(frame.slots[3]);
    } else if (result.status == OSEO_STATUS_NORMAL &&
               separator_undefined) {
        result = oseo_array_append(
            context,
            frame.slots[3],
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !separator_undefined && limit != 0u) {
        size_t subject_length = string_object(frame.slots[2])->length;
        size_t separator_length = string_object(frame.slots[0])->length;
        if (subject_length == 0u) {
            if (separator_length != 0u) {
                result = string_append_slice(
                    context,
                    frame.slots[3],
                    frame.slots[2],
                    0u,
                    0u
                );
            }
        } else if (separator_length == 0u) {
            for (size_t index = 0u;
                 result.status == OSEO_STATUS_NORMAL &&
                     index < subject_length && index < (size_t)limit;
                 index += 1u) {
                result = string_append_slice(
                    context,
                    frame.slots[3],
                    frame.slots[2],
                    index,
                    index + 1u
                );
            }
        } else {
            size_t start = 0u;
            while (result.status == OSEO_STATUS_NORMAL &&
                   ordinary_object(frame.slots[3])->array_length < limit) {
                size_t position = 0u;
                if (!string_find(
                        frame.slots[2],
                        frame.slots[0],
                        start,
                        &position
                    )) break;
                result = string_append_slice(
                    context,
                    frame.slots[3],
                    frame.slots[2],
                    start,
                    position
                );
                start = position + separator_length;
            }
            if (result.status == OSEO_STATUS_NORMAL &&
                ordinary_object(frame.slots[3])->array_length < limit) {
                result = string_append_slice(
                    context,
                    frame.slots[3],
                    frame.slots[2],
                    start,
                    subject_length
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[3];
    oseo_roots_release(context, &frame);
    return result;
}


OseoResult oseo_internal_string_protocol_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (code_id == OSEO_STRING_MATCH_CODE_ID ||
        code_id == OSEO_STRING_SEARCH_CODE_ID) {
        return string_match_or_search(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_MATCH_ALL_CODE_ID) {
        return string_match_all(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_SPLIT_CODE_ID) {
        return string_split(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    return oseo_unknown_function(context, code_id);
}
