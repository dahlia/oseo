#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>
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

static OseoResult match_is_regexp(
    OseoContext *context,
    OseoValue value,
    bool *regexp
) {
    return oseo_internal_is_regexp(context, value, regexp);
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
    if (code_id == OSEO_STRING_REPLACE_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_ALL_CODE_ID) {
        return OSEO_WELL_KNOWN_REPLACE;
    }
    return OSEO_WELL_KNOWN_SPLIT;
}

/* The two methods whose operand must name a global RegExp when it is one. */
static bool string_requires_global_flags(size_t code_id) {
    return code_id == OSEO_STRING_MATCH_ALL_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_ALL_CODE_ID;
}

/* The methods that forward a second argument to their symbol method. */
static bool string_forwards_second_argument(size_t code_id) {
    return code_id == OSEO_STRING_SPLIT_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_ALL_CODE_ID;
}

/*
 * The `flags` observation String.prototype.matchAll and replaceAll share
 * once IsRegExp reports true for their operand: the value must be
 * object-coercible and its String form must contain `g`.
 */
static OseoResult string_require_global_flags(
    OseoContext *context,
    size_t code_id,
    OseoValue regexp
) {
    bool match_all = code_id == OSEO_STRING_MATCH_ALL_CODE_ID;
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
            match_all
                ? "String.prototype.matchAll flags are nullish."
                : "String.prototype.replaceAll flags are nullish."
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
                match_all
                    ? "String.prototype.matchAll requires a global RegExp."
                    : "String.prototype.replaceAll requires a global RegExp."
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
    /*
     * Every one of these methods observes its operand only when the operand
     * is an Object, so a primitive never reaches IsRegExp, the `flags` read,
     * or the symbol lookup.
     */
    if (string_requires_global_flags(code_id) && is_object(frame.slots[1])) {
        result = match_is_regexp(context, frame.slots[1], &regexp);
        if (result.status == OSEO_STATUS_NORMAL && regexp) {
            result = string_require_global_flags(
                context,
                code_id,
                frame.slots[1]
            );
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
            size_t call_count =
                string_forwards_second_argument(code_id) ? 2u : 1u;
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

/*
 * The shared tail of String.prototype match, matchAll, and search once
 * GetMethod found no symbol method on the operand: RegExpCreate over the
 * raw operand, then Invoke of the same well-known symbol on the created
 * RegExp. The created object is an ordinary %RegExp.prototype% instance,
 * so the invoked method is the built-in one unless the program replaced
 * it, which is exactly what the specification observes here.
 */
static OseoResult string_regexp_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    OseoValue pattern,
    const char *flags
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 0: subject, 1: pattern, 2: created RegExp, 3: symbol then method */
    frame.slots[1] = pattern;
    result = match_subject(context, receiver);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && flags != NULL) {
        result = oseo_internal_ascii_string(context, flags);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_regexp_create(
            context,
            frame.slots[1],
            flags == NULL ? oseo_undefined() : frame.slots[2]
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            string_symbol_index(code_id)
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[2], frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_function(frame.slots[3])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String symbol protocol method is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[3],
            frame.slots[2],
            1u,
            &frame.slots[0],
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * String.prototype.match (22.1.3.13), matchAll (22.1.3.14), and search
 * (22.1.3.16). Each observes an Object operand through IsRegExp where the
 * specification says so and through GetMethod of its own well-known
 * symbol; a nullish method reaches RegExpCreate, where matchAll alone
 * supplies the `g` flag.
 */
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
    return string_regexp_dispatch(
        context,
        code_id,
        receiver,
        match_argument(argument_count, arguments, 0u),
        code_id == OSEO_STRING_MATCH_ALL_CODE_ID ? "g" : NULL
    );
}

static OseoResult regexp_iterator_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
) {
    size_t name_length = strlen(name);
    uint16_t units[8];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
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
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_iterator_property(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, key, value};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_object_define(
        context,
        slots[0],
        slots[1],
        slots[2],
        attributes
    );
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_regexp_string_iterator_prototype(
    OseoContext *context
) {
    OseoValue *prototype_cache = &context->intrinsics[
        OSEO_INTRINSIC_REGEXP_STRING_ITERATOR_PROTOTYPE
    ];
    OseoValue *next_cache = &context->intrinsics[
        OSEO_INTRINSIC_REGEXP_STRING_ITERATOR_NEXT
    ];
    if (is_object(*prototype_cache) && is_function(*next_cache)) {
        return normal(*prototype_cache);
    }
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 6u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_ITERATOR_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_iterator_function(
            context,
            OSEO_REGEXP_STRING_ITERATOR_NEXT_CODE_ID,
            "next",
            0u
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "next");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_iterator_property(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(
            context,
            "RegExp String Iterator"
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_iterator_property(
            context,
            frame.slots[1],
            frame.slots[4],
            frame.slots[5],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *prototype_cache = frame.slots[1];
        *next_cache = frame.slots[2];
        result = normal(frame.slots[1]);
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        *prototype_cache = oseo_undefined();
        *next_cache = oseo_undefined();
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_regexp_string_iterator_create(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject,
    bool global,
    bool unicode
) {
    OseoValue slots[3] = {regexp, subject, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_regexp_string_iterator_prototype(
        context
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *iterator = ordinary_object(result.value);
        iterator->regexp_string_iterator = true;
        iterator->regexp_iterator_regexp = slots[0];
        iterator->regexp_iterator_subject = slots[1];
        iterator->regexp_iterator_global = global;
        iterator->regexp_iterator_unicode = unicode;
        iterator->regexp_iterator_complete = false;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * %RegExpStringIteratorPrototype%.next (22.2.9.2.1). A non-global
 * iterator finishes on its first match, and a global one that matched the
 * empty string advances `lastIndex` on the iterating RegExp itself, which
 * is where the cursor lives.
 */
static OseoResult regexp_string_iterator_next(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_regexp_string_iterator(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp String iterator next requires its iterator receiver."
        );
    }
    OseoOrdinaryObject *state = ordinary_object(receiver);
    if (state->regexp_iterator_complete) {
        return oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    }
    bool global = state->regexp_iterator_global;
    bool unicode = state->regexp_iterator_unicode;
    OseoValue slots[4] = {
        receiver,
        state->regexp_iterator_regexp,
        state->regexp_iterator_subject,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_regexp_exec(
        context,
        slots[1],
        slots[2]
    );
    slots[3] = result.value;
    bool finished = result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[3]) == OSEO_TAG_NULL;
    if (finished || (result.status == OSEO_STATUS_NORMAL && !global)) {
        state = ordinary_object(slots[0]);
        state->regexp_iterator_complete = true;
        state->regexp_iterator_regexp = oseo_undefined();
        state->regexp_iterator_subject = oseo_undefined();
    }
    if (result.status == OSEO_STATUS_NORMAL && !finished && global) {
        result = oseo_internal_regexp_iteration_step(
            context,
            slots[1],
            slots[2],
            slots[3],
            unicode
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_iterator_result(
            context,
            finished ? oseo_undefined() : slots[3],
            finished
        );
    }
    oseo_roots_pop(context, &frame);
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


/* The decimal value of one ASCII digit, or `UINT16_MAX` for anything else. */
static uint16_t substitution_digit(uint16_t unit) {
    return unit >= UINT16_C(0x30) && unit <= UINT16_C(0x39)
        ? (uint16_t)(unit - UINT16_C(0x30))
        : UINT16_MAX;
}

/*
 * The `$n`, `$nn`, and `$<name>` reference forms of GetSubstitution.
 * `reference` receives how many code units the reference spans, and
 * `capture` receives the substituted text or `oseo_uninitialized()` when
 * the reference has no referent and copies its own text instead.
 */
static OseoResult substitution_reference(
    OseoContext *context,
    OseoValue replacement,
    size_t index,
    OseoValue captures,
    OseoValue named_captures,
    size_t *reference,
    OseoValue *capture
) {
    const OseoString *pattern = string_object(replacement);
    uint16_t next = pattern->units[index + 1u];
    *capture = oseo_uninitialized();
    if (next == UINT16_C(0x3c)) {
        *reference = 2u;
        if (tag_of(named_captures) == OSEO_TAG_UNDEFINED) {
            return normal(oseo_undefined());
        }
        size_t close = index + 2u;
        while (close < pattern->length &&
               pattern->units[close] != UINT16_C(0x3e)) {
            close += 1u;
        }
        if (close == pattern->length) return normal(oseo_undefined());
        *reference = close + 1u - index;
        OseoValue slots[3] = {replacement, named_captures, oseo_undefined()};
        OseoRootFrame frame = {NULL, slots, 3u};
        oseo_roots_push(context, &frame);
        OseoResult result = oseo_internal_allocate_string(
            context,
            string_object(slots[0])->units + index + 2u,
            close - index - 2u
        );
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
            slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(slots[2]) == OSEO_TAG_UNDEFINED) {
            result = oseo_internal_allocate_string(context, NULL, 0u);
            slots[2] = result.value;
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_value_string(context, slots[2]);
            slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) *capture = slots[2];
        oseo_roots_pop(context, &frame);
        return result;
    }
    uint16_t first = substitution_digit(next);
    if (first == UINT16_MAX) {
        *reference = 1u;
        return normal(oseo_undefined());
    }
    uint16_t second = index + 2u < pattern->length
        ? substitution_digit(pattern->units[index + 2u])
        : UINT16_MAX;
    size_t capture_count = tag_of(captures) == OSEO_TAG_UNDEFINED
        ? 0u
        : ordinary_object(captures)->array_length;
    size_t digits = second == UINT16_MAX ? 1u : 2u;
    size_t number = digits == 1u
        ? (size_t)first
        : (size_t)first * 10u + (size_t)second;
    /*
     * A two-digit reference past the capture count is one digit followed
     * by a literal digit, so the second digit is left for the scan that
     * resumes after this reference.
     */
    if (number > capture_count && digits == 2u) {
        digits = 1u;
        number = (size_t)first;
    }
    *reference = digits + 1u;
    if (number < 1u || number > capture_count) {
        return normal(oseo_undefined());
    }
    OseoValue slots[2] = {captures, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(
        context,
        oseo_number((double)(number - 1u))
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[1]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_allocate_string(context, NULL, 0u);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *capture = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_get_substitution(
    OseoContext *context,
    OseoStringBuilder *builder,
    OseoValue matched,
    OseoValue subject,
    size_t position,
    OseoValue captures,
    OseoValue named_captures,
    OseoValue replacement
) {
    OseoValue slots[6] = {
        matched,
        subject,
        captures,
        named_captures,
        replacement,
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *pattern = string_object(slots[4]);
        if (index >= pattern->length) break;
        uint16_t unit = pattern->units[index];
        if (unit != UINT16_C(0x24) || index + 1u >= pattern->length) {
            result = oseo_internal_string_builder_append(
                context,
                builder,
                &unit,
                1u
            );
            index += 1u;
            continue;
        }
        uint16_t next = pattern->units[index + 1u];
        if (next == UINT16_C(0x24)) {
            uint16_t dollar = UINT16_C(0x24);
            result = oseo_internal_string_builder_append(
                context,
                builder,
                &dollar,
                1u
            );
            index += 2u;
            continue;
        }
        if (next == UINT16_C(0x26)) {
            const OseoString *match = string_object(slots[0]);
            result = oseo_internal_string_builder_append(
                context,
                builder,
                match->units,
                match->length
            );
            index += 2u;
            continue;
        }
        if (next == UINT16_C(0x60)) {
            const OseoString *string = string_object(slots[1]);
            result = oseo_internal_string_builder_append(
                context,
                builder,
                string->units,
                position
            );
            index += 2u;
            continue;
        }
        if (next == UINT16_C(0x27)) {
            const OseoString *string = string_object(slots[1]);
            size_t tail = position + string_object(slots[0])->length;
            if (tail > string->length) tail = string->length;
            result = oseo_internal_string_builder_append(
                context,
                builder,
                string->units + tail,
                string->length - tail
            );
            index += 2u;
            continue;
        }
        size_t reference = 1u;
        result = substitution_reference(
            context,
            slots[4],
            index,
            slots[2],
            slots[3],
            &reference,
            &slots[5]
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (tag_of(slots[5]) == OSEO_TAG_UNINITIALIZED) {
            /* The reference has no referent, so it copies its own text. */
            result = oseo_internal_string_builder_append(
                context,
                builder,
                string_object(slots[4])->units + index,
                reference
            );
        } else {
            const OseoString *text = string_object(slots[5]);
            result = oseo_internal_string_builder_append(
                context,
                builder,
                text->units,
                text->length
            );
            slots[5] = oseo_undefined();
        }
        index += reference;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * String.prototype.replace (22.1.3.19) and replaceAll (22.1.3.20). The two
 * share one body: `replace` stops after the first match, while `replaceAll`
 * continues from each match end and advances by one code unit for an empty
 * search string. Neither converts a callable replacer, and a String
 * replacer is converted before the subject is searched.
 */
static OseoResult string_replace(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    bool all = code_id == OSEO_STRING_REPLACE_ALL_CODE_ID;
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
    result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 0: subject, 1: search string, 2: replacer, 3: replacement text */
    frame.slots[2] = match_argument(argument_count, arguments, 1u);
    result = match_subject(context, receiver);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(
            context,
            match_argument(argument_count, arguments, 0u)
        );
        frame.slots[1] = result.value;
    }
    bool functional = is_function(frame.slots[2]);
    if (result.status == OSEO_STATUS_NORMAL && !functional) {
        result = oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    size_t position = 0u;
    bool found = result.status == OSEO_STATUS_NORMAL &&
        string_find(frame.slots[0], frame.slots[1], 0u, &position);
    if (result.status != OSEO_STATUS_NORMAL || !found) {
        if (result.status == OSEO_STATUS_NORMAL) {
            result = normal(frame.slots[0]);
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    size_t search_length = string_object(frame.slots[1])->length;
    size_t advance = search_length == 0u ? 1u : search_length;
    size_t consumed = 0u;
    OseoStringBuilder builder = {NULL, 0u, 0u};
    while (result.status == OSEO_STATUS_NORMAL && found) {
        /*
         * The replacer runs before the preceding subject slice is staged.
         * The specification computes the replacement and only then builds
         * the concatenation, so a staged slice that would exceed the
         * runtime's string ceiling must not suppress this match's call.
         */
        if (functional) {
            OseoValue call_arguments[3] = {
                frame.slots[1],
                oseo_number((double)position),
                frame.slots[0],
            };
            result = oseo_call_function(
                context,
                frame.slots[2],
                oseo_undefined(),
                3u,
                call_arguments,
                oseo_undefined()
            );
            frame.slots[3] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_value_string(context, frame.slots[3]);
                frame.slots[3] = result.value;
            }
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            const OseoString *subject = string_object(frame.slots[0]);
            result = oseo_internal_string_builder_append(
                context,
                &builder,
                subject->units + consumed,
                position - consumed
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && functional) {
            const OseoString *text = string_object(frame.slots[3]);
            result = oseo_internal_string_builder_append(
                context,
                &builder,
                text->units,
                text->length
            );
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_get_substitution(
                context,
                &builder,
                frame.slots[1],
                frame.slots[0],
                position,
                oseo_undefined(),
                oseo_undefined(),
                frame.slots[2]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        consumed = position + search_length;
        found = all && string_find(
            frame.slots[0],
            frame.slots[1],
            position + advance,
            &position
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *subject = string_object(frame.slots[0]);
        result = oseo_internal_string_builder_append(
            context,
            &builder,
            subject->units + consumed,
            subject->length - consumed
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            builder.units,
            builder.length
        );
    }
    oseo_internal_string_builder_release(&builder);
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
    if (code_id == OSEO_REGEXP_STRING_ITERATOR_NEXT_CODE_ID) {
        return regexp_string_iterator_next(context, receiver);
    }
    if (code_id == OSEO_STRING_MATCH_CODE_ID ||
        code_id == OSEO_STRING_MATCH_ALL_CODE_ID ||
        code_id == OSEO_STRING_SEARCH_CODE_ID) {
        return string_match_or_search(
            context,
            code_id,
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
    if (code_id == OSEO_STRING_REPLACE_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_ALL_CODE_ID) {
        return string_replace(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    return oseo_unknown_function(context, code_id);
}
