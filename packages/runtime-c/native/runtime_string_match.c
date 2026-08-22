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

typedef enum {
    OSEO_FALLBACK_REGEXP_LITERAL,
    OSEO_FALLBACK_REGEXP_DOT,
    OSEO_FALLBACK_REGEXP_DIGIT,
    OSEO_FALLBACK_REGEXP_NOT_DIGIT,
    OSEO_FALLBACK_REGEXP_WORD,
    OSEO_FALLBACK_REGEXP_NOT_WORD,
    OSEO_FALLBACK_REGEXP_SPACE,
    OSEO_FALLBACK_REGEXP_NOT_SPACE,
} OseoFallbackRegExpAtomKind;

typedef struct {
    OseoFallbackRegExpAtomKind kind;
    uint16_t literal;
} OseoFallbackRegExpAtom;

typedef enum {
    OSEO_FALLBACK_REGEXP_ATOM_OK,
    OSEO_FALLBACK_REGEXP_ATOM_INVALID,
    OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED,
} OseoFallbackRegExpAtomStatus;

static bool fallback_regexp_hex(uint16_t unit, uint16_t *value) {
    if (unit >= UINT16_C(0x30) && unit <= UINT16_C(0x39)) {
        *value = unit - UINT16_C(0x30);
        return true;
    }
    if (unit >= UINT16_C(0x41) && unit <= UINT16_C(0x46)) {
        *value = unit - UINT16_C(0x41) + UINT16_C(10);
        return true;
    }
    if (unit >= UINT16_C(0x61) && unit <= UINT16_C(0x66)) {
        *value = unit - UINT16_C(0x61) + UINT16_C(10);
        return true;
    }
    return false;
}

static bool fallback_regexp_escaped_literal(uint16_t unit) {
    switch (unit) {
        case UINT16_C(0x24):
        case UINT16_C(0x28):
        case UINT16_C(0x29):
        case UINT16_C(0x2a):
        case UINT16_C(0x2b):
        case UINT16_C(0x2e):
        case UINT16_C(0x2f):
        case UINT16_C(0x3f):
        case UINT16_C(0x5b):
        case UINT16_C(0x5c):
        case UINT16_C(0x5d):
        case UINT16_C(0x5e):
        case UINT16_C(0x7b):
        case UINT16_C(0x7c):
        case UINT16_C(0x7d):
            return true;
        default:
            return false;
    }
}

static bool fallback_regexp_unescaped_syntax(uint16_t unit) {
    return fallback_regexp_escaped_literal(unit) &&
        unit != UINT16_C(0x2f) && unit != UINT16_C(0x5c);
}

static OseoFallbackRegExpAtomStatus fallback_regexp_atom(
    const OseoString *pattern,
    size_t *index,
    OseoFallbackRegExpAtom *atom
) {
    uint16_t unit = pattern->units[*index];
    *index += 1u;
    atom->kind = OSEO_FALLBACK_REGEXP_LITERAL;
    atom->literal = unit;
    if (unit == UINT16_C(0x2e)) {
        atom->kind = OSEO_FALLBACK_REGEXP_DOT;
        return OSEO_FALLBACK_REGEXP_ATOM_OK;
    }
    if (unit != UINT16_C(0x5c)) {
        return fallback_regexp_unescaped_syntax(unit)
            ? OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED
            : OSEO_FALLBACK_REGEXP_ATOM_OK;
    }
    if (*index >= pattern->length) {
        return OSEO_FALLBACK_REGEXP_ATOM_INVALID;
    }
    unit = pattern->units[*index];
    *index += 1u;
    switch (unit) {
        case UINT16_C(0x64):
            atom->kind = OSEO_FALLBACK_REGEXP_DIGIT;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x44):
            atom->kind = OSEO_FALLBACK_REGEXP_NOT_DIGIT;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x77):
            atom->kind = OSEO_FALLBACK_REGEXP_WORD;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x57):
            atom->kind = OSEO_FALLBACK_REGEXP_NOT_WORD;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x73):
            atom->kind = OSEO_FALLBACK_REGEXP_SPACE;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x53):
            atom->kind = OSEO_FALLBACK_REGEXP_NOT_SPACE;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x66):
            atom->literal = UINT16_C(0x0c);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x6e):
            atom->literal = UINT16_C(0x0a);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x72):
            atom->literal = UINT16_C(0x0d);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x74):
            atom->literal = UINT16_C(0x09);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x76):
            atom->literal = UINT16_C(0x0b);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x30):
            if (*index < pattern->length &&
                pattern->units[*index] >= UINT16_C(0x30) &&
                pattern->units[*index] <= UINT16_C(0x39)) {
                return OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED;
            }
            atom->literal = UINT16_C(0);
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        case UINT16_C(0x78):
        case UINT16_C(0x75): {
            size_t digits = unit == UINT16_C(0x78) ? 2u : 4u;
            if (digits > pattern->length - *index) {
                return OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED;
            }
            uint16_t value = 0u;
            for (size_t offset = 0u; offset < digits; offset += 1u) {
                uint16_t digit = 0u;
                if (!fallback_regexp_hex(
                        pattern->units[*index + offset],
                        &digit
                    )) {
                    return OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED;
                }
                value = (uint16_t)(value * UINT16_C(16) + digit);
            }
            *index += digits;
            atom->literal = value;
            return OSEO_FALLBACK_REGEXP_ATOM_OK;
        }
        default:
            if (fallback_regexp_escaped_literal(unit)) {
                atom->literal = unit;
                return OSEO_FALLBACK_REGEXP_ATOM_OK;
            }
            return OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED;
    }
}

static OseoResult fallback_regexp_validate(
    OseoContext *context,
    OseoValue pattern_value
) {
    const OseoString *pattern = string_object(pattern_value);
    size_t index = 0u;
    while (index < pattern->length) {
        OseoFallbackRegExpAtom atom;
        OseoFallbackRegExpAtomStatus status = fallback_regexp_atom(
            pattern,
            &index,
            &atom
        );
        if (status == OSEO_FALLBACK_REGEXP_ATOM_INVALID) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_SYNTAX,
                "Invalid regular expression fallback pattern."
            );
        }
        if (status == OSEO_FALLBACK_REGEXP_ATOM_UNSUPPORTED) {
            return failure(
                context,
                "OSEO2001",
                "Regular expression fallback syntax is not admitted in "
                "this M5b node."
            );
        }
    }
    return normal(pattern_value);
}

static bool fallback_regexp_word(uint16_t unit) {
    return (unit >= UINT16_C(0x30) && unit <= UINT16_C(0x39)) ||
        (unit >= UINT16_C(0x41) && unit <= UINT16_C(0x5a)) ||
        unit == UINT16_C(0x5f) ||
        (unit >= UINT16_C(0x61) && unit <= UINT16_C(0x7a));
}

static bool fallback_regexp_space(uint16_t unit) {
    switch (unit) {
        case UINT16_C(0x0009):
        case UINT16_C(0x000a):
        case UINT16_C(0x000b):
        case UINT16_C(0x000c):
        case UINT16_C(0x000d):
        case UINT16_C(0x0020):
        case UINT16_C(0x00a0):
        case UINT16_C(0x1680):
        case UINT16_C(0x2000):
        case UINT16_C(0x2001):
        case UINT16_C(0x2002):
        case UINT16_C(0x2003):
        case UINT16_C(0x2004):
        case UINT16_C(0x2005):
        case UINT16_C(0x2006):
        case UINT16_C(0x2007):
        case UINT16_C(0x2008):
        case UINT16_C(0x2009):
        case UINT16_C(0x200a):
        case UINT16_C(0x2028):
        case UINT16_C(0x2029):
        case UINT16_C(0x202f):
        case UINT16_C(0x205f):
        case UINT16_C(0x3000):
        case UINT16_C(0xfeff):
            return true;
        default:
            return false;
    }
}

static bool fallback_regexp_atom_matches(
    OseoFallbackRegExpAtom atom,
    uint16_t unit
) {
    switch (atom.kind) {
        case OSEO_FALLBACK_REGEXP_LITERAL:
            return atom.literal == unit;
        case OSEO_FALLBACK_REGEXP_DOT:
            return unit != UINT16_C(0x000a) && unit != UINT16_C(0x000d) &&
                unit != UINT16_C(0x2028) && unit != UINT16_C(0x2029);
        case OSEO_FALLBACK_REGEXP_DIGIT:
            return unit >= UINT16_C(0x30) && unit <= UINT16_C(0x39);
        case OSEO_FALLBACK_REGEXP_NOT_DIGIT:
            return unit < UINT16_C(0x30) || unit > UINT16_C(0x39);
        case OSEO_FALLBACK_REGEXP_WORD:
            return fallback_regexp_word(unit);
        case OSEO_FALLBACK_REGEXP_NOT_WORD:
            return !fallback_regexp_word(unit);
        case OSEO_FALLBACK_REGEXP_SPACE:
            return fallback_regexp_space(unit);
        case OSEO_FALLBACK_REGEXP_NOT_SPACE:
            return !fallback_regexp_space(unit);
    }
    return false;
}

static bool fallback_regexp_matches_at(
    const OseoString *subject,
    const OseoString *pattern,
    size_t position,
    size_t *match_length
) {
    size_t pattern_index = 0u;
    size_t subject_index = position;
    while (pattern_index < pattern->length) {
        if (subject_index >= subject->length) return false;
        OseoFallbackRegExpAtom atom;
        if (fallback_regexp_atom(pattern, &pattern_index, &atom) !=
            OSEO_FALLBACK_REGEXP_ATOM_OK) {
            return false;
        }
        if (!fallback_regexp_atom_matches(
                atom,
                subject->units[subject_index]
            )) {
            return false;
        }
        subject_index += 1u;
    }
    *match_length = subject_index - position;
    return true;
}

static bool fallback_regexp_find(
    OseoValue subject_value,
    OseoValue pattern_value,
    size_t start,
    size_t *position,
    size_t *match_length
) {
    const OseoString *subject = string_object(subject_value);
    const OseoString *pattern = string_object(pattern_value);
    if (start > subject->length) return false;
    for (size_t index = start; index <= subject->length; index += 1u) {
        if (fallback_regexp_matches_at(
                subject,
                pattern,
                index,
                match_length
            )) {
            *position = index;
            return true;
        }
    }
    return false;
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

/*
 * The earlier String node keeps its string-only fallback until the RegExp
 * symbol-method node can perform RegExpCreate and Invoke. Once user code
 * installs the corresponding prototype hook, continuing through that
 * fallback would silently skip the observable call.
 */
static OseoResult deferred_regexp_string_dispatch(
    OseoContext *context,
    size_t code_id
) {
    OseoValue slots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_REGEXP_PROTOTYPE
    );
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            string_symbol_index(code_id)
        );
        slots[1] = result.value;
    }
    while (result.status == OSEO_STATUS_NORMAL && is_object(slots[0])) {
        OseoValue value = oseo_undefined();
        OseoValue getter = oseo_undefined();
        OseoValue setter = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false, false};
        if (oseo_internal_own_descriptor(
                slots[0],
                slots[1],
                &value,
                &attributes,
                &getter,
                &setter
            )) {
            bool deferred_placeholder =
                slots[0] == context->intrinsics[
                    OSEO_INTRINSIC_REGEXP_PROTOTYPE
                ] &&
                !attributes.accessor &&
                is_function(value) &&
                function_object(value)->code_id ==
                    OSEO_REGEXP_DEFERRED_CODE_ID;
            if (!deferred_placeholder) {
                result = failure(
                    context,
                    "OSEO2001",
                    "RegExp String dispatch is not admitted yet."
                );
                break;
            }
        }
        slots[0] = ordinary_object(slots[0])->prototype;
    }
    oseo_roots_pop(context, &frame);
    return result;
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = deferred_regexp_string_dispatch(context, code_id);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = fallback_regexp_validate(context, frame.slots[1]);
    }
    size_t position = 0u;
    size_t match_length = 0u;
    bool found = result.status == OSEO_STATUS_NORMAL && fallback_regexp_find(
        frame.slots[0],
        frame.slots[1],
        0u,
        &position,
        &match_length
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
            match_length
        );
    }
    oseo_roots_release(context, &frame);
    return result;
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

static OseoResult regexp_string_iterator_create(
    OseoContext *context,
    OseoValue subject,
    OseoValue pattern
) {
    OseoValue slots[3] = {subject, pattern, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = fallback_regexp_validate(context, slots[1]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_regexp_string_iterator_prototype(context);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoOrdinaryObject *iterator = ordinary_object(result.value);
        iterator->regexp_string_iterator = true;
        iterator->regexp_iterator_subject = slots[0];
        iterator->regexp_iterator_pattern = slots[1];
        iterator->regexp_iterator_index = 0u;
        iterator->regexp_iterator_complete = false;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

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
        state->regexp_iterator_subject = oseo_undefined();
        state->regexp_iterator_pattern = oseo_undefined();
        return oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    }
    OseoValue slots[4] = {
        receiver,
        state->regexp_iterator_subject,
        state->regexp_iterator_pattern,
        oseo_undefined(),
    };
    size_t start = state->regexp_iterator_index;
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    size_t position = 0u;
    size_t match_length = 0u;
    bool found = fallback_regexp_find(
        slots[1],
        slots[2],
        start,
        &position,
        &match_length
    );
    OseoResult result = normal(oseo_undefined());
    if (!found) {
        state = ordinary_object(slots[0]);
        state->regexp_iterator_complete = true;
        state->regexp_iterator_subject = oseo_undefined();
        state->regexp_iterator_pattern = oseo_undefined();
        result = oseo_internal_iterator_result(
            context,
            oseo_undefined(),
            true
        );
    } else {
        result = string_match_result(
            context,
            slots[1],
            position,
            match_length
        );
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            state = ordinary_object(slots[0]);
            if (match_length == 0u) {
                if (position == string_object(slots[1])->length) {
                    state->regexp_iterator_complete = true;
                } else {
                    state->regexp_iterator_index = position + 1u;
                }
            } else {
                state->regexp_iterator_index = position + match_length;
            }
            result = oseo_internal_iterator_result(
                context,
                slots[3],
                false
            );
        }
    }
    oseo_roots_pop(context, &frame);
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = deferred_regexp_string_dispatch(
            context,
            OSEO_STRING_MATCH_ALL_CODE_ID
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_string_iterator_create(
            context,
            frame.slots[0],
            frame.slots[1]
        );
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
    if (code_id == OSEO_REGEXP_STRING_ITERATOR_NEXT_CODE_ID) {
        return regexp_string_iterator_next(context, receiver);
    }
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
