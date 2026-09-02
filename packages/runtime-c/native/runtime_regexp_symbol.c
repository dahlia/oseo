#include "runtime_internal.h"

#include <math.h>
#include <string.h>

/*
 * The RegExp.prototype well-known symbol methods of 22.2.6 and the
 * `RegExp.escape` static of 22.2.5. Each method reads its operand through
 * ordinary property access and executes through RegExpExec, so a program
 * that overrides `exec`, `flags`, `lastIndex`, or `constructor` observes
 * exactly what the specification says it observes. The pattern grammar,
 * the matcher artifact, and built-in execution stay with
 * runtime_regexp.c, and the String.prototype entry points that reach
 * these methods stay with runtime_string_match.c.
 */

#define OSEO_REGEXP_SYMBOL_MAX_SAFE_LENGTH 9007199254740991.0
#define OSEO_REGEXP_SYMBOL_MAX_UINT32 4294967295.0

static OseoValue symbol_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult symbol_require_object(
    OseoContext *context,
    OseoValue receiver,
    const char *message
) {
    if (is_object(receiver)) return normal(receiver);
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

/* Get(object, name) for one ASCII property name. */
static OseoResult symbol_get(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue *value
) {
    OseoValue slots[2] = {object, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/* Get(object, ToString(index)) for one canonical numeric key. */
static OseoResult symbol_get_index(
    OseoContext *context,
    OseoValue object,
    double index,
    OseoValue *value
) {
    OseoValue slots[2] = {object, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(
        context,
        oseo_number(index)
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *value = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

/* Set(regexp, "lastIndex", value, true), which a read-only slot rejects. */
static OseoResult symbol_set_last_index(
    OseoContext *context,
    OseoValue regexp,
    OseoValue value
) {
    OseoValue slots[3] = {regexp, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "lastIndex");
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_set(
            context,
            slots[0],
            slots[2],
            slots[1],
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToLength, which clamps NaN and every negative value to zero. */
static OseoResult symbol_to_length(
    OseoContext *context,
    OseoValue value,
    double *length
) {
    *length = 0.0;
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (!is_number(result.value)) return normal(oseo_undefined());
    double number = number_value(result.value);
    if (!(number > 0.0)) return normal(oseo_undefined());
    number = floor(number);
    *length = number > OSEO_REGEXP_SYMBOL_MAX_SAFE_LENGTH
        ? OSEO_REGEXP_SYMBOL_MAX_SAFE_LENGTH
        : number;
    return normal(oseo_undefined());
}

/* ToLength(Get(regexp, "lastIndex")). */
static OseoResult symbol_last_index(
    OseoContext *context,
    OseoValue regexp,
    double *index
) {
    OseoValue value = oseo_undefined();
    OseoValue slots[2] = {regexp, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = symbol_get(context, slots[0], "lastIndex", &value);
    slots[1] = value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_to_length(context, slots[1], index);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToString(Get(regexp, "flags")). */
static OseoResult symbol_flags(
    OseoContext *context,
    OseoValue regexp,
    OseoValue *flags
) {
    OseoValue value = oseo_undefined();
    OseoValue slots[2] = {regexp, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = symbol_get(context, slots[0], "flags", &value);
    slots[1] = value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *flags = slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

static bool symbol_flags_contain(OseoValue flags, uint16_t unit) {
    const OseoString *string = string_object(flags);
    for (size_t index = 0u; index < string->length; index += 1u) {
        if (string->units[index] == unit) return true;
    }
    return false;
}

/* Whether `flags` selects code-point traversal, meaning `u` or `v`. */
static bool symbol_flags_unicode(OseoValue flags) {
    return symbol_flags_contain(flags, UINT16_C(0x75)) ||
        symbol_flags_contain(flags, UINT16_C(0x76));
}

/* AdvanceStringIndex (22.2.7.3). */
static double symbol_advance_string_index(
    const OseoString *subject,
    double index,
    bool unicode
) {
    if (!unicode || index + 1.0 >= (double)subject->length) {
        return index + 1.0;
    }
    size_t position = (size_t)index;
    uint16_t first = subject->units[position];
    if (first < UINT16_C(0xd800) || first > UINT16_C(0xdbff)) {
        return index + 1.0;
    }
    uint16_t second = subject->units[position + 1u];
    if (second < UINT16_C(0xdc00) || second > UINT16_C(0xdfff)) {
        return index + 1.0;
    }
    return index + 2.0;
}

/* The half-open substring of one rooted string value. */
static OseoResult symbol_substring(
    OseoContext *context,
    OseoValue subject,
    size_t start,
    size_t end
) {
    const OseoString *string = string_object(subject);
    return oseo_internal_allocate_string(
        context,
        string->units + start,
        end - start
    );
}

/* LengthOfArrayLike(object). */
static OseoResult symbol_length_of_array_like(
    OseoContext *context,
    OseoValue object,
    double *length
) {
    OseoValue value = oseo_undefined();
    OseoValue slots[2] = {object, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = symbol_get(context, slots[0], "length", &value);
    slots[1] = value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_to_length(context, slots[1], length);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* SpeciesConstructor(object, %RegExp%). */
static OseoResult symbol_species_constructor(
    OseoContext *context,
    OseoValue object
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    result = symbol_get(
        context,
        frame.slots[0],
        "constructor",
        &frame.slots[1]
    );
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[1]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_REGEXP);
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The RegExp constructor property is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[1], frame.slots[0]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(frame.slots[1])) {
        result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_REGEXP);
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = function_is_constructible(frame.slots[1])
            ? normal(frame.slots[1])
            : oseo_internal_throw_error(
                  context,
                  OSEO_ERROR_TYPE,
                  "The RegExp species is not a constructor."
              );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* Construct(constructor, «regexp, flags»). */
static OseoResult symbol_construct(
    OseoContext *context,
    OseoValue constructor,
    OseoValue regexp,
    OseoValue flags
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = regexp;
    frame.slots[2] = flags;
    result = oseo_function_prototype(context, frame.slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_receiver(context, result.value);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue call_arguments[2] = {frame.slots[1], frame.slots[2]};
        result = oseo_call_function(
            context,
            frame.slots[0],
            frame.slots[3],
            2u,
            call_arguments,
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
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_regexp_iteration_step(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject,
    OseoValue match,
    bool unicode
) {
    OseoValue slots[4] = {regexp, subject, match, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = symbol_get_index(context, slots[2], 0.0, &slots[3]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, slots[3]);
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        string_object(slots[3])->length == 0u) {
        double index = 0.0;
        result = symbol_last_index(context, slots[0], &index);
        if (result.status == OSEO_STATUS_NORMAL) {
            double next = symbol_advance_string_index(
                string_object(slots[1]),
                index,
                unicode
            );
            result = symbol_set_last_index(
                context,
                slots[0],
                oseo_number(next)
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* RegExp.prototype[Symbol.match] (22.2.6.8). */
static OseoResult regexp_symbol_match(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = symbol_require_object(
        context,
        receiver,
        "RegExp.prototype[Symbol.match] requires an object receiver."
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 0: rx, 1: S, 2: flags, 3: accumulated array, 4: one execution */
    frame.slots[0] = receiver;
    result = oseo_internal_value_string(
        context,
        symbol_argument(argument_count, arguments, 0u)
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_flags(context, frame.slots[0], &frame.slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !symbol_flags_contain(frame.slots[2], UINT16_C(0x67))) {
        result = oseo_internal_regexp_exec(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    bool unicode = result.status == OSEO_STATUS_NORMAL &&
        symbol_flags_unicode(frame.slots[2]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_set_last_index(
            context,
            frame.slots[0],
            oseo_number(0.0)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[3] = result.value;
    }
    size_t count = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_regexp_exec(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[4] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (tag_of(frame.slots[4]) == OSEO_TAG_NULL) {
            result = normal(count == 0u ? oseo_null() : frame.slots[3]);
            break;
        }
        OseoValue matched = oseo_undefined();
        result = symbol_get_index(context, frame.slots[4], 0.0, &matched);
        frame.slots[4] = matched;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_value_string(context, frame.slots[4]);
            frame.slots[4] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[3],
                frame.slots[4]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            string_object(frame.slots[4])->length == 0u) {
            double index = 0.0;
            result = symbol_last_index(context, frame.slots[0], &index);
            if (result.status == OSEO_STATUS_NORMAL) {
                double next = symbol_advance_string_index(
                    string_object(frame.slots[1]),
                    index,
                    unicode
                );
                result = symbol_set_last_index(
                    context,
                    frame.slots[0],
                    oseo_number(next)
                );
            }
        }
        count += 1u;
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* RegExp.prototype[Symbol.matchAll] (22.2.6.9). */
static OseoResult regexp_symbol_match_all(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = symbol_require_object(
        context,
        receiver,
        "RegExp.prototype[Symbol.matchAll] requires an object receiver."
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 0: R, 1: S, 2: species then flags, 3: flags, 4: matcher */
    frame.slots[0] = receiver;
    result = oseo_internal_value_string(
        context,
        symbol_argument(argument_count, arguments, 0u)
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_species_constructor(context, frame.slots[0]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_flags(context, frame.slots[0], &frame.slots[3]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_construct(
            context,
            frame.slots[2],
            frame.slots[0],
            frame.slots[3]
        );
        frame.slots[4] = result.value;
    }
    double index = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_last_index(context, frame.slots[0], &index);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_set_last_index(
            context,
            frame.slots[4],
            oseo_number(index)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_regexp_string_iterator_create(
            context,
            frame.slots[4],
            frame.slots[1],
            symbol_flags_contain(frame.slots[3], UINT16_C(0x67)),
            symbol_flags_unicode(frame.slots[3])
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* RegExp.prototype[Symbol.search] (22.2.6.12). */
static OseoResult regexp_symbol_search(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = symbol_require_object(
        context,
        receiver,
        "RegExp.prototype[Symbol.search] requires an object receiver."
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 0: rx, 1: S, 2: previous lastIndex, 3: execution, 4: current */
    frame.slots[0] = receiver;
    result = oseo_internal_value_string(
        context,
        symbol_argument(argument_count, arguments, 0u)
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_get(
            context,
            frame.slots[0],
            "lastIndex",
            &frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !oseo_internal_same_value(frame.slots[2], oseo_number(0.0))) {
        result = symbol_set_last_index(
            context,
            frame.slots[0],
            oseo_number(0.0)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_regexp_exec(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_get(
            context,
            frame.slots[0],
            "lastIndex",
            &frame.slots[4]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !oseo_internal_same_value(frame.slots[4], frame.slots[2])) {
        result = symbol_set_last_index(
            context,
            frame.slots[0],
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[3]) == OSEO_TAG_NULL) {
        result = normal(oseo_number(-1.0));
    } else if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue index = oseo_undefined();
        result = symbol_get(context, frame.slots[3], "index", &index);
        if (result.status == OSEO_STATUS_NORMAL) result = normal(index);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* RegExp.prototype[Symbol.split] (22.2.6.14). */
static OseoResult regexp_symbol_split(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = symbol_require_object(
        context,
        receiver,
        "RegExp.prototype[Symbol.split] requires an object receiver."
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /*
     * 0: rx, 1: S, 2: species then splitter, 3: flags, 4: A, 5: one
     * execution, 6: the substring or capture being appended. Slot 6 is
     * rooted because appending to an Array allocates its index key, which
     * is a safepoint the value has to survive.
     */
    frame.slots[0] = receiver;
    result = oseo_internal_value_string(
        context,
        symbol_argument(argument_count, arguments, 0u)
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_species_constructor(context, frame.slots[0]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_flags(context, frame.slots[0], &frame.slots[3]);
    }
    bool unicode = result.status == OSEO_STATUS_NORMAL &&
        symbol_flags_unicode(frame.slots[3]);
    if (result.status == OSEO_STATUS_NORMAL &&
        !symbol_flags_contain(frame.slots[3], UINT16_C(0x79))) {
        const OseoString *flags = string_object(frame.slots[3]);
        OseoStringBuilder builder = {NULL, 0u, 0u};
        result = oseo_internal_string_builder_append(
            context,
            &builder,
            flags->units,
            flags->length
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            uint16_t sticky = UINT16_C(0x79);
            result = oseo_internal_string_builder_append(
                context,
                &builder,
                &sticky,
                1u
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_allocate_string(
                context,
                builder.units,
                builder.length
            );
            frame.slots[3] = result.value;
        }
        oseo_internal_string_builder_release(&builder);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_construct(
            context,
            frame.slots[2],
            frame.slots[0],
            frame.slots[3]
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[4] = result.value;
    }
    double limit = OSEO_REGEXP_SYMBOL_MAX_UINT32;
    OseoValue requested = symbol_argument(argument_count, arguments, 1u);
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(requested) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_to_number(context, requested);
        if (result.status == OSEO_STATUS_NORMAL) {
            double number = number_value(result.value);
            if (!isfinite(number) || number == 0.0) {
                limit = 0.0;
            } else {
                double modulo = fmod(trunc(number), 4294967296.0);
                if (modulo < 0.0) modulo += 4294967296.0;
                limit = modulo;
            }
        }
    }
    if (result.status != OSEO_STATUS_NORMAL || limit == 0.0) {
        if (result.status == OSEO_STATUS_NORMAL) {
            result = normal(frame.slots[4]);
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    size_t size = string_object(frame.slots[1])->length;
    if (size == 0u) {
        result = oseo_internal_regexp_exec(
            context,
            frame.slots[2],
            frame.slots[1]
        );
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(result.value) == OSEO_TAG_NULL) {
            result = oseo_array_append(
                context,
                frame.slots[4],
                frame.slots[1]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = normal(frame.slots[4]);
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    double start = 0.0;
    double cursor = 0.0;
    while (result.status == OSEO_STATUS_NORMAL && cursor < (double)size) {
        result = symbol_set_last_index(
            context,
            frame.slots[2],
            oseo_number(cursor)
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_regexp_exec(
                context,
                frame.slots[2],
                frame.slots[1]
            );
            frame.slots[5] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (tag_of(frame.slots[5]) == OSEO_TAG_NULL) {
            cursor = symbol_advance_string_index(
                string_object(frame.slots[1]),
                cursor,
                unicode
            );
            continue;
        }
        double end = 0.0;
        result = symbol_last_index(context, frame.slots[2], &end);
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (end > (double)size) end = (double)size;
        if (end == start) {
            cursor = symbol_advance_string_index(
                string_object(frame.slots[1]),
                cursor,
                unicode
            );
            continue;
        }
        result = symbol_substring(
            context,
            frame.slots[1],
            (size_t)start,
            (size_t)cursor
        );
        frame.slots[6] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[4],
                frame.slots[6]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if ((double)ordinary_object(frame.slots[4])->array_length == limit) {
            result = normal(frame.slots[4]);
            oseo_roots_release(context, &frame);
            return result;
        }
        start = end;
        double captures = 0.0;
        result = symbol_length_of_array_like(
            context,
            frame.slots[5],
            &captures
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        captures = captures > 1.0 ? captures - 1.0 : 0.0;
        bool truncated = false;
        for (double index = 1.0;
             result.status == OSEO_STATUS_NORMAL && index <= captures;
             index += 1.0) {
            result = symbol_get_index(
                context,
                frame.slots[5],
                index,
                &frame.slots[6]
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_array_append(
                    context,
                    frame.slots[4],
                    frame.slots[6]
                );
            }
            if (result.status == OSEO_STATUS_NORMAL &&
                (double)ordinary_object(frame.slots[4])->array_length ==
                    limit) {
                truncated = true;
                break;
            }
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (truncated) {
            result = normal(frame.slots[4]);
            oseo_roots_release(context, &frame);
            return result;
        }
        cursor = start;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_substring(
            context,
            frame.slots[1],
            (size_t)start,
            size
        );
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, frame.slots[4], frame.slots[5]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[4]);
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * One iteration of the @@replace result loop (22.2.6.11 step 14),
 * appending the replacement text into `builder`. It performs every read
 * that step specifies in order, meaning `length`, `0`, `index`, each
 * capture, and `groups`, so a match object built by user code observes
 * exactly the specified sequence. A functional replacer receives the
 * matched text, every capture, the position, the subject, and the
 * named-capture object when the match declares one; a String replacer
 * runs through GetSubstitution instead. `position` and `matched_length`
 * report what the caller needs to stage the surrounding subject text.
 */
static OseoResult regexp_replacement(
    OseoContext *context,
    OseoStringBuilder *builder,
    OseoValue subject,
    OseoValue match,
    OseoValue replacer,
    bool functional,
    size_t *position,
    size_t *matched_length
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /*
     * 0: S, 1: match, 2: replacer, 3: matched, 4: captures, 5: groups
     * then the replacer's result, 6: the capture being converted and
     * appended. Slot 6 is rooted because both the conversion and the
     * append are safepoints.
     */
    frame.slots[0] = subject;
    frame.slots[1] = match;
    frame.slots[2] = replacer;
    double length = 0.0;
    result = symbol_length_of_array_like(context, frame.slots[1], &length);
    double count = length > 1.0 ? length - 1.0 : 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_get_index(
            context,
            frame.slots[1],
            0.0,
            &frame.slots[3]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *matched_length = string_object(frame.slots[3])->length;
        result = symbol_get(
            context,
            frame.slots[1],
            "index",
            &frame.slots[6]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, frame.slots[6]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        double number = number_value(result.value);
        number = isnan(number) ? 0.0
            : isfinite(number) ? trunc(number)
                               : number;
        double limit = (double)string_object(frame.slots[0])->length;
        *position = (size_t)(
            number < 0.0 ? 0.0 : number > limit ? limit : number
        );
        frame.slots[6] = oseo_undefined();
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[4] = result.value;
    }
    for (double index = 1.0;
         result.status == OSEO_STATUS_NORMAL && index <= count;
         index += 1.0) {
        result = symbol_get_index(
            context,
            frame.slots[1],
            index,
            &frame.slots[6]
        );
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(frame.slots[6]) != OSEO_TAG_UNDEFINED) {
            result = oseo_internal_value_string(context, frame.slots[6]);
            frame.slots[6] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[4],
                frame.slots[6]
            );
        }
    }
    frame.slots[6] = oseo_undefined();
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_get(
            context,
            frame.slots[1],
            "groups",
            &frame.slots[5]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && functional) {
        size_t named = tag_of(frame.slots[5]) == OSEO_TAG_UNDEFINED ? 0u : 1u;
        size_t total = (size_t)count + 3u + named;
        OseoRootFrame call = {NULL, NULL, 0u};
        result = oseo_roots_allocate(context, &call, total);
        if (result.status == OSEO_STATUS_NORMAL) {
            call.slots[0] = frame.slots[3];
            for (size_t index = 0u;
                 result.status == OSEO_STATUS_NORMAL &&
                     index < (size_t)count;
                 index += 1u) {
                result = symbol_get_index(
                    context,
                    frame.slots[4],
                    (double)index,
                    &call.slots[index + 1u]
                );
            }
            call.slots[(size_t)count + 1u] =
                oseo_number((double)*position);
            call.slots[(size_t)count + 2u] = frame.slots[0];
            if (named == 1u) {
                call.slots[(size_t)count + 3u] = frame.slots[5];
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_call_function(
                    context,
                    frame.slots[2],
                    oseo_undefined(),
                    total,
                    call.slots,
                    oseo_undefined()
                );
            }
            oseo_roots_release(context, &call);
        }
        frame.slots[5] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_value_string(context, frame.slots[5]);
            frame.slots[5] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            const OseoString *text = string_object(frame.slots[5]);
            result = oseo_internal_string_builder_append(
                context,
                builder,
                text->units,
                text->length
            );
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[5]) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_to_object(context, frame.slots[5]);
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_get_substitution(
            context,
            builder,
            frame.slots[3],
            frame.slots[0],
            *position,
            frame.slots[4],
            frame.slots[5],
            frame.slots[2]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* RegExp.prototype[Symbol.replace] (22.2.6.11). */
static OseoResult regexp_symbol_replace(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = symbol_require_object(
        context,
        receiver,
        "RegExp.prototype[Symbol.replace] requires an object receiver."
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /*
     * 0: rx, 1: S, 2: replacer, 3: flags, 4: results, 5: one execution,
     * 6: the `index` and `0` reads of that execution, which are rooted
     * because their conversions are safepoints.
     */
    frame.slots[0] = receiver;
    frame.slots[2] = symbol_argument(argument_count, arguments, 1u);
    result = oseo_internal_value_string(
        context,
        symbol_argument(argument_count, arguments, 0u)
    );
    frame.slots[1] = result.value;
    bool functional = is_function(frame.slots[2]);
    if (result.status == OSEO_STATUS_NORMAL && !functional) {
        result = oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_flags(context, frame.slots[0], &frame.slots[3]);
    }
    bool global = result.status == OSEO_STATUS_NORMAL &&
        symbol_flags_contain(frame.slots[3], UINT16_C(0x67));
    bool unicode = global && symbol_flags_unicode(frame.slots[3]);
    if (result.status == OSEO_STATUS_NORMAL && global) {
        result = symbol_set_last_index(
            context,
            frame.slots[0],
            oseo_number(0.0)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[4] = result.value;
    }
    bool done = false;
    while (result.status == OSEO_STATUS_NORMAL && !done) {
        result = oseo_internal_regexp_exec(
            context,
            frame.slots[0],
            frame.slots[1]
        );
        frame.slots[5] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (tag_of(frame.slots[5]) == OSEO_TAG_NULL) {
            done = true;
            break;
        }
        result = oseo_array_append(context, frame.slots[4], frame.slots[5]);
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (!global) {
            done = true;
            break;
        }
        result = oseo_internal_regexp_iteration_step(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[5],
            unicode
        );
    }
    OseoStringBuilder builder = {NULL, 0u, 0u};
    size_t consumed = 0u;
    size_t total = result.status == OSEO_STATUS_NORMAL
        ? ordinary_object(frame.slots[4])->array_length
        : 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < total;
         index += 1u) {
        result = symbol_get_index(
            context,
            frame.slots[4],
            (double)index,
            &frame.slots[5]
        );
        /*
         * The replacement is computed before the preceding subject slice
         * is staged, because the specification concatenates only after
         * the replacer has run.
         */
        size_t position = 0u;
        size_t matched_length = 0u;
        OseoStringBuilder piece = {NULL, 0u, 0u};
        if (result.status == OSEO_STATUS_NORMAL) {
            result = regexp_replacement(
                context,
                &piece,
                frame.slots[1],
                frame.slots[5],
                frame.slots[2],
                functional,
                &position,
                &matched_length
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && position >= consumed) {
            const OseoString *subject = string_object(frame.slots[1]);
            result = oseo_internal_string_builder_append(
                context,
                &builder,
                subject->units + consumed,
                position - consumed
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_string_builder_append(
                    context,
                    &builder,
                    piece.units,
                    piece.length
                );
            }
            /*
             * The next source position keeps the unclamped sum. A match
             * object built by user code may report a `0` longer than what
             * remains of the subject, and the specification then ignores
             * every later match that starts before that sum, including one
             * at the subject's own end.
             */
            consumed = position + matched_length;
        }
        oseo_internal_string_builder_release(&piece);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *subject = string_object(frame.slots[1]);
        if (consumed < subject->length) {
            result = oseo_internal_string_builder_append(
                context,
                &builder,
                subject->units + consumed,
                subject->length - consumed
            );
        }
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

/* The SyntaxCharacter production plus U+002F, which always escape. */
static bool escape_syntax_character(uint32_t point) {
    switch (point) {
        case 0x005eu:
        case 0x0024u:
        case 0x005cu:
        case 0x002eu:
        case 0x002au:
        case 0x002bu:
        case 0x003fu:
        case 0x0028u:
        case 0x0029u:
        case 0x005bu:
        case 0x005du:
        case 0x007bu:
        case 0x007du:
        case 0x007cu:
        case 0x002fu:
            return true;
        default:
            return false;
    }
}

/* The ControlEscape letter for one code point, or zero for anything else. */
static uint16_t escape_control_letter(uint32_t point) {
    switch (point) {
        case 0x0009u:
            return UINT16_C(0x74);
        case 0x000au:
            return UINT16_C(0x6e);
        case 0x000bu:
            return UINT16_C(0x76);
        case 0x000cu:
            return UINT16_C(0x66);
        case 0x000du:
            return UINT16_C(0x72);
        default:
            return 0u;
    }
}

/*
 * The punctuators EncodeForRegExpEscape hex-escapes so that the result
 * stays inert wherever it is spliced, plus WhiteSpace, LineTerminator,
 * and the surrogate range.
 */
static bool escape_hex_required(uint32_t point) {
    switch (point) {
        case 0x002cu:
        case 0x002du:
        case 0x003du:
        case 0x003cu:
        case 0x003eu:
        case 0x0023u:
        case 0x0026u:
        case 0x0021u:
        case 0x0025u:
        case 0x003au:
        case 0x003bu:
        case 0x0040u:
        case 0x007eu:
        case 0x0027u:
        case 0x0060u:
        case 0x0022u:
            return true;
        default:
            break;
    }
    if (point >= 0xd800u && point <= 0xdfffu) return true;
    return point == 0x0009u || point == 0x000au || point == 0x000bu ||
        point == 0x000cu || point == 0x000du || point == 0x0020u ||
        point == 0x00a0u || point == 0x1680u ||
        (point >= 0x2000u && point <= 0x200au) ||
        point == 0x2028u || point == 0x2029u || point == 0x202fu ||
        point == 0x205fu || point == 0x3000u || point == 0xfeffu;
}

static uint16_t escape_hex_digit(uint32_t value) {
    return value < 10u
        ? (uint16_t)(UINT16_C(0x30) + value)
        : (uint16_t)(UINT16_C(0x61) + value - 10u);
}

/* `\xNN` for a code point at or below U+00FF. */
static OseoResult escape_hex_pair(
    OseoContext *context,
    OseoStringBuilder *builder,
    uint32_t point
) {
    uint16_t units[4] = {
        UINT16_C(0x5c),
        UINT16_C(0x78),
        escape_hex_digit((point >> 4u) & 0xfu),
        escape_hex_digit(point & 0xfu),
    };
    return oseo_internal_string_builder_append(context, builder, units, 4u);
}

/* UnicodeEscape of one code unit, meaning `\uNNNN` in lowercase hex. */
static OseoResult escape_unicode(
    OseoContext *context,
    OseoStringBuilder *builder,
    uint16_t unit
) {
    uint16_t units[6] = {
        UINT16_C(0x5c),
        UINT16_C(0x75),
        escape_hex_digit((uint32_t)(unit >> 12u) & 0xfu),
        escape_hex_digit((uint32_t)(unit >> 8u) & 0xfu),
        escape_hex_digit((uint32_t)(unit >> 4u) & 0xfu),
        escape_hex_digit((uint32_t)unit & 0xfu),
    };
    return oseo_internal_string_builder_append(context, builder, units, 6u);
}

/* EncodeForRegExpEscape (22.2.5.2.1). */
static OseoResult escape_code_point(
    OseoContext *context,
    OseoStringBuilder *builder,
    uint32_t point,
    const uint16_t *units,
    size_t length
) {
    if (escape_syntax_character(point)) {
        /* Every SyntaxCharacter and the solidus are one BMP code unit. */
        uint16_t escaped[2] = {UINT16_C(0x5c), units[0]};
        (void)length;
        return oseo_internal_string_builder_append(
            context,
            builder,
            escaped,
            2u
        );
    }
    uint16_t letter = escape_control_letter(point);
    if (letter != 0u) {
        uint16_t escaped[2] = {UINT16_C(0x5c), letter};
        return oseo_internal_string_builder_append(
            context,
            builder,
            escaped,
            2u
        );
    }
    if (!escape_hex_required(point)) {
        return oseo_internal_string_builder_append(
            context,
            builder,
            units,
            length
        );
    }
    if (point <= 0xffu) return escape_hex_pair(context, builder, point);
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = escape_unicode(context, builder, units[index]);
    }
    return result;
}

/*
 * RegExp.escape (22.2.5.2). The first code point is hex-escaped whenever
 * it is a decimal digit or an ASCII letter, so the result can never begin
 * a `\cX` or decimal escape when it is spliced after a backslash.
 */
static OseoResult regexp_escape(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue value = symbol_argument(argument_count, arguments, 0u);
    if (!is_string(value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp.escape requires a String argument."
        );
    }
    OseoValue slots[1] = {value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoResult result = normal(oseo_undefined());
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *source = string_object(slots[0]);
        if (index >= source->length) break;
        uint16_t first = source->units[index];
        size_t length = 1u;
        uint32_t point = first;
        if (first >= UINT16_C(0xd800) && first <= UINT16_C(0xdbff) &&
            index + 1u < source->length &&
            source->units[index + 1u] >= UINT16_C(0xdc00) &&
            source->units[index + 1u] <= UINT16_C(0xdfff)) {
            length = 2u;
            point = 0x10000u +
                (((uint32_t)first - 0xd800u) << 10u) +
                ((uint32_t)source->units[index + 1u] - 0xdc00u);
        }
        bool alphanumeric = (point >= 0x30u && point <= 0x39u) ||
            (point >= 0x41u && point <= 0x5au) ||
            (point >= 0x61u && point <= 0x7au);
        if (index == 0u && alphanumeric) {
            result = escape_hex_pair(context, &builder, point);
        } else {
            result = escape_code_point(
                context,
                &builder,
                point,
                source->units + index,
                length
            );
        }
        index += length;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            builder.units,
            builder.length
        );
    }
    oseo_internal_string_builder_release(&builder);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_regexp_symbol_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (code_id == OSEO_REGEXP_MATCH_CODE_ID) {
        return regexp_symbol_match(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_MATCH_ALL_CODE_ID) {
        return regexp_symbol_match_all(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_SEARCH_CODE_ID) {
        return regexp_symbol_search(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_SPLIT_CODE_ID) {
        return regexp_symbol_split(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_REPLACE_CODE_ID) {
        return regexp_symbol_replace(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_ESCAPE_CODE_ID) {
        return regexp_escape(context, argument_count, arguments);
    }
    return oseo_unknown_function(context, code_id);
}
