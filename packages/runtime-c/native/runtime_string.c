#include "runtime_internal.h"
#include "runtime_unicode_tables.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * String values and the string half of property keys: allocation,
 * content equality, ASCII name matching, canonical array-index
 * recognition, and the own properties a String exotic object exposes.
 * Every component that compares, builds, or classifies a property key
 * name reaches this unit through the internal header. The same unit
 * owns the realm's `String` constructor, %String.prototype%, the String
 * exotic objects `new String` creates, and the `fromCharCode`,
 * `fromCodePoint`, and `raw` statics. Case conversion, trimming,
 * normalization, and deterministic locale comparison read only the pinned
 * tables in the generated runtime Unicode header.
 */

OseoResult oseo_internal_validate_string_length(
    OseoContext *context,
    size_t length
) {
    if (length > OSEO_MAX_STRING_LENGTH) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Invalid string length."
        );
    }
    return normal(oseo_undefined());
}

OseoResult oseo_internal_allocate_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    OseoResult valid = oseo_internal_validate_string_length(context, length);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (length > (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t size = sizeof(OseoString) + length * sizeof(uint16_t);
    OseoString *object = oseo_internal_allocate_heap_bytes(context, size);
    if (object == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    object->length = length;
    if (length > 0u) memcpy(object->units, units, length * sizeof(uint16_t));
    return oseo_internal_publish_heap(
        context, &object->header, OSEO_HEAP_STRING);
}

OseoResult oseo_string_from_units(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    return oseo_internal_allocate_string(context, units, length);
}

OseoResult oseo_internal_ascii_string(OseoContext *context, const char *text) {
    uint16_t units[32];
    size_t length = strlen(text);
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Internal property name is long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_internal_allocate_string(context, units, length);
}

bool oseo_internal_string_is_ascii(OseoValue value, const char *text) {
    if (!is_string(value)) return false;
    OseoString *string = string_object(value);
    size_t length = strlen(text);
    if (string->length != length) return false;
    for (size_t index = 0u; index < length; index += 1u) {
        if (string->units[index] !=
            (uint16_t)(unsigned char)text[index]) return false;
    }
    return true;
}

bool oseo_internal_string_equal(OseoValue left, OseoValue right) {
    if (!is_string(left) || !is_string(right)) return false;
    OseoString *left_string = string_object(left);
    OseoString *right_string = string_object(right);
    return left_string->length == right_string->length &&
        memcmp(
            left_string->units,
            right_string->units,
            left_string->length * sizeof(uint16_t)
        ) == 0;
}

/* Property keys are strings compared by content or symbols by identity. */
bool oseo_internal_property_key_equal(OseoValue left, OseoValue right) {
    if (is_string(left) && is_string(right)) {
        return oseo_internal_string_equal(left, right);
    }
    return left == right;
}

bool oseo_internal_array_index(OseoValue key, uint32_t *result) {
    if (!is_string(key)) return false;
    OseoString *string = string_object(key);
    if (string->length == 0u || string->length > 10u) return false;
    if (string->length > 1u && string->units[0] == UINT16_C(0x30)) {
        return false;
    }
    uint64_t value = 0u;
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint16_t unit = string->units[index];
        if (unit < UINT16_C(0x30) || unit > UINT16_C(0x39)) return false;
        value = value * UINT64_C(10) + (uint64_t)(unit - UINT16_C(0x30));
        if (value > UINT64_C(4294967294)) return false;
    }
    *result = (uint32_t)value;
    return true;
}

bool oseo_internal_string_own_property(
    OseoValue string_value,
    OseoValue key,
    uint32_t *index
) {
    if (!is_string(string_value)) return false;
    if (oseo_internal_string_is_ascii(key, "length")) return true;
    uint32_t candidate = 0u;
    if (!oseo_internal_array_index(key, &candidate) ||
        candidate >= string_object(string_value)->length) return false;
    if (index != NULL) *index = candidate;
    return true;
}

bool oseo_internal_string_data(OseoValue value) {
    return is_object(value) && ordinary_object(value)->primitive_data &&
        is_string(ordinary_object(value)->primitive_value);
}

/*
 * True when the whole run of wrapper definitions may append without a
 * duplicate-key scan. Every key the run produces is a distinct
 * canonical index or `length`, and no user code runs between two of
 * them, so an empty extensible ordinary object stays free of the
 * collisions [[DefineOwnProperty]] exists to detect. A wrapper that
 * arrives with any own property, or that is not an ordinary object,
 * takes the ordinary definition path instead.
 */
static bool string_wrapper_may_append(OseoValue wrapper) {
    if (!is_object(wrapper) || is_array(wrapper) || is_function(wrapper)) {
        return false;
    }
    const OseoOrdinaryObject *object = ordinary_object(wrapper);
    return object->extensible && !object->module_namespace &&
        object->property_count == 0u;
}

static OseoResult define_wrapper_property(
    OseoContext *context,
    bool append,
    OseoValue wrapper,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    return append
        ? oseo_internal_append_own_property(
              context, wrapper, key, value, attributes)
        : oseo_object_define(context, wrapper, key, value, attributes);
}

OseoResult oseo_internal_string_wrapper_properties(
    OseoContext *context,
    OseoValue string_value,
    OseoValue wrapper
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = string_value;
    frame.slots[1] = wrapper;
    bool append = string_wrapper_may_append(frame.slots[1]);
    size_t length = string_object(frame.slots[0])->length;
    for (size_t index = 0u; index < length; index += 1u) {
        char key_text[24];
        (void)snprintf(key_text, sizeof(key_text), "%zu", index);
        result = oseo_internal_ascii_string(context, key_text);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        uint16_t unit = string_object(frame.slots[0])->units[index];
        result = oseo_internal_allocate_string(context, &unit, 1u);
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_wrapper_property(
            context,
            append,
            frame.slots[1],
            frame.slots[2],
            frame.slots[3],
            (OseoPropertyAttributes){false, true, false, false}
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "length");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_wrapper_property(
            context,
            append,
            frame.slots[1],
            frame.slots[2],
            oseo_number((double)string_object(frame.slots[0])->length),
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[1]);
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * One growable UTF-16 accumulator. The statics build their result
 * outside the collected heap, so a conversion that runs user code
 * between two appends cannot observe or reclaim a partial string.
 */
typedef struct {
    uint16_t *units;
    size_t length;
    size_t capacity;
} OseoStringBuilder;

static OseoResult string_builder_reserve(
    OseoContext *context,
    OseoStringBuilder *builder,
    size_t additional
) {
    if (additional > SIZE_MAX - builder->length) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t required = builder->length + additional;
    OseoResult valid = oseo_internal_validate_string_length(
        context,
        required
    );
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (required <= builder->capacity) return normal(oseo_undefined());
    size_t capacity = builder->capacity == 0u ? 16u : builder->capacity;
    while (capacity < required) {
        if (capacity > OSEO_MAX_STRING_LENGTH / 2u) {
            capacity = required;
            break;
        }
        capacity *= 2u;
    }
    uint16_t *units = realloc(builder->units, capacity * sizeof(uint16_t));
    if (units == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    builder->units = units;
    builder->capacity = capacity;
    return normal(oseo_undefined());
}

static OseoResult string_builder_append_unit(
    OseoContext *context,
    OseoStringBuilder *builder,
    uint16_t unit
) {
    OseoResult result = string_builder_reserve(context, builder, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    builder->units[builder->length] = unit;
    builder->length += 1u;
    return result;
}

static OseoResult string_builder_append(
    OseoContext *context,
    OseoStringBuilder *builder,
    const uint16_t *units,
    size_t length
) {
    if (length == 0u) return normal(oseo_undefined());
    OseoResult result = string_builder_reserve(context, builder, length);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    memcpy(
        builder->units + builder->length,
        units,
        length * sizeof(uint16_t)
    );
    builder->length += length;
    return result;
}

static void string_builder_release(OseoStringBuilder *builder) {
    free(builder->units);
    builder->units = NULL;
    builder->length = 0u;
    builder->capacity = 0u;
}

typedef struct {
    uint32_t *values;
    size_t length;
    size_t capacity;
} OseoCodePointBuilder;

static OseoValue string_builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
);

static OseoResult string_method_subject(
    OseoContext *context,
    OseoValue receiver
);

static OseoResult code_point_builder_reserve(
    OseoContext *context,
    OseoCodePointBuilder *builder,
    size_t additional
) {
    if (additional > SIZE_MAX - builder->length) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t required = builder->length + additional;
    if (required <= builder->capacity) return normal(oseo_undefined());
    size_t capacity = builder->capacity == 0u ? 16u : builder->capacity;
    while (capacity < required) {
        if (capacity > SIZE_MAX / 2u) {
            capacity = required;
            break;
        }
        capacity *= 2u;
    }
    if (capacity > SIZE_MAX / sizeof(uint32_t)) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    uint32_t *values = realloc(
        builder->values,
        capacity * sizeof(uint32_t)
    );
    if (values == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    builder->values = values;
    builder->capacity = capacity;
    return normal(oseo_undefined());
}

static OseoResult code_point_builder_append(
    OseoContext *context,
    OseoCodePointBuilder *builder,
    uint32_t value
) {
    OseoResult result = code_point_builder_reserve(context, builder, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    builder->values[builder->length] = value;
    builder->length += 1u;
    return result;
}

static void code_point_builder_release(OseoCodePointBuilder *builder) {
    free(builder->values);
    builder->values = NULL;
    builder->length = 0u;
    builder->capacity = 0u;
}

static uint32_t string_next_code_point(
    const OseoString *string,
    size_t *cursor
) {
    uint16_t first = string->units[*cursor];
    *cursor += 1u;
    if (first < UINT16_C(0xd800) || first > UINT16_C(0xdbff) ||
        *cursor >= string->length) return first;
    uint16_t second = string->units[*cursor];
    if (second < UINT16_C(0xdc00) || second > UINT16_C(0xdfff)) return first;
    *cursor += 1u;
    return UINT32_C(0x10000) +
        ((uint32_t)(first - UINT16_C(0xd800)) << 10u) +
        (uint32_t)(second - UINT16_C(0xdc00));
}

static OseoResult code_points_from_string(
    OseoContext *context,
    const OseoString *string,
    OseoCodePointBuilder *builder
) {
    OseoResult result = code_point_builder_reserve(
        context,
        builder,
        string->length
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    size_t cursor = 0u;
    while (cursor < string->length) {
        builder->values[builder->length] = string_next_code_point(
            string,
            &cursor
        );
        builder->length += 1u;
    }
    return result;
}

static OseoResult string_from_code_points(
    OseoContext *context,
    const OseoCodePointBuilder *builder
) {
    OseoStringBuilder units = {NULL, 0u, 0u};
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < builder->length;
         index += 1u) {
        uint32_t code_point = builder->values[index];
        if (code_point <= UINT32_C(0xffff)) {
            result = string_builder_append_unit(
                context,
                &units,
                (uint16_t)code_point
            );
        } else {
            uint32_t value = code_point - UINT32_C(0x10000);
            result = string_builder_append_unit(
                context,
                &units,
                (uint16_t)(UINT32_C(0xd800) + (value >> 10u))
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = string_builder_append_unit(
                    context,
                    &units,
                    (uint16_t)(UINT32_C(0xdc00) +
                        (value & UINT32_C(0x3ff)))
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            units.units,
            units.length
        );
    }
    string_builder_release(&units);
    return result;
}

static const OseoUnicodeMapping *unicode_mapping_find(
    const OseoUnicodeMapping *mappings,
    size_t count,
    uint32_t code_point
) {
    size_t low = 0u;
    size_t high = count;
    while (low < high) {
        size_t middle = low + (high - low) / 2u;
        uint32_t candidate = mappings[middle].code_point;
        if (candidate < code_point) low = middle + 1u;
        else high = middle;
    }
    return low < count && mappings[low].code_point == code_point
        ? &mappings[low]
        : NULL;
}

static uint8_t unicode_combining_class(uint32_t code_point) {
    size_t count = sizeof(oseo_unicode_combining_classes) /
        sizeof(oseo_unicode_combining_classes[0]);
    size_t low = 0u;
    size_t high = count;
    while (low < high) {
        size_t middle = low + (high - low) / 2u;
        if (oseo_unicode_combining_classes[middle].start <= code_point) {
            low = middle + 1u;
        } else {
            high = middle;
        }
    }
    return low == 0u ? 0u : oseo_unicode_combining_classes[low - 1u].value;
}

static bool unicode_set_has(
    const uint32_t *boundaries,
    size_t count,
    uint32_t code_point
) {
    size_t low = 0u;
    size_t high = count;
    while (low < high) {
        size_t middle = low + (high - low) / 2u;
        if (boundaries[middle] <= code_point) low = middle + 1u;
        else high = middle;
    }
    return (low & 1u) != 0u;
}

static bool unicode_cased(uint32_t code_point) {
    return unicode_set_has(
        oseo_unicode_cased,
        sizeof(oseo_unicode_cased) / sizeof(oseo_unicode_cased[0]),
        code_point
    );
}

static bool unicode_case_ignorable(uint32_t code_point) {
    return unicode_set_has(
        oseo_unicode_case_ignorable,
        sizeof(oseo_unicode_case_ignorable) /
            sizeof(oseo_unicode_case_ignorable[0]),
        code_point
    );
}

static bool unicode_final_sigma(
    const OseoCodePointBuilder *subject,
    size_t index
) {
    bool preceded = false;
    size_t cursor = index;
    while (cursor > 0u) {
        cursor -= 1u;
        uint32_t code_point = subject->values[cursor];
        if (unicode_case_ignorable(code_point)) continue;
        preceded = unicode_cased(code_point);
        break;
    }
    if (!preceded) return false;
    for (cursor = index + 1u; cursor < subject->length; cursor += 1u) {
        uint32_t code_point = subject->values[cursor];
        if (unicode_case_ignorable(code_point)) continue;
        return !unicode_cased(code_point);
    }
    return true;
}

static OseoResult string_convert_case(
    OseoContext *context,
    OseoValue receiver,
    bool uppercase
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[1] = result.value;
    OseoCodePointBuilder input = {NULL, 0u, 0u};
    OseoCodePointBuilder output = {NULL, 0u, 0u};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = code_points_from_string(
            context,
            string_object(frame.slots[1]),
            &input
        );
    }
    const OseoUnicodeMapping *mappings = uppercase
        ? oseo_unicode_uppercase
        : oseo_unicode_lowercase;
    size_t mapping_count = uppercase
        ? sizeof(oseo_unicode_uppercase) /
            sizeof(oseo_unicode_uppercase[0])
        : sizeof(oseo_unicode_lowercase) /
            sizeof(oseo_unicode_lowercase[0]);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < input.length;
         index += 1u) {
        uint32_t code_point = input.values[index];
        if (!uppercase && code_point == UINT32_C(0x3a3) &&
            unicode_final_sigma(&input, index)) {
            result = code_point_builder_append(
                context,
                &output,
                UINT32_C(0x3c2)
            );
            continue;
        }
        const OseoUnicodeMapping *mapping = unicode_mapping_find(
            mappings,
            mapping_count,
            code_point
        );
        if (mapping == NULL) {
            result = code_point_builder_append(context, &output, code_point);
            continue;
        }
        for (size_t item = 0u;
             result.status == OSEO_STATUS_NORMAL && item < mapping->length;
             item += 1u) {
            result = code_point_builder_append(
                context,
                &output,
                oseo_unicode_mapping_values[mapping->offset + item]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_from_code_points(context, &output);
    }
    code_point_builder_release(&input);
    code_point_builder_release(&output);
    oseo_roots_release(context, &frame);
    return result;
}

static bool string_trim_code_unit(uint16_t unit) {
    return unit == UINT16_C(0x0009) || unit == UINT16_C(0x000a) ||
        unit == UINT16_C(0x000b) || unit == UINT16_C(0x000c) ||
        unit == UINT16_C(0x000d) || unit == UINT16_C(0x0020) ||
        unit == UINT16_C(0x00a0) || unit == UINT16_C(0x1680) ||
        (unit >= UINT16_C(0x2000) && unit <= UINT16_C(0x200a)) ||
        unit == UINT16_C(0x2028) || unit == UINT16_C(0x2029) ||
        unit == UINT16_C(0x202f) || unit == UINT16_C(0x205f) ||
        unit == UINT16_C(0x3000) || unit == UINT16_C(0xfeff);
}

static OseoResult string_trim(
    OseoContext *context,
    OseoValue receiver,
    bool trim_start,
    bool trim_end
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoString *subject = string_object(frame.slots[1]);
        size_t start = 0u;
        size_t end = subject->length;
        if (trim_start) {
            while (start < end && string_trim_code_unit(
                subject->units[start])) start += 1u;
        }
        if (trim_end) {
            while (end > start && string_trim_code_unit(
                subject->units[end - 1u])) end -= 1u;
        }
        result = oseo_internal_allocate_string(
            context,
            start == 0u ? subject->units : subject->units + start,
            end - start
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult normalize_append_ordered(
    OseoContext *context,
    OseoCodePointBuilder *output,
    uint32_t code_point
) {
    OseoResult result = code_point_builder_append(
        context,
        output,
        code_point
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint8_t combining = unicode_combining_class(code_point);
    if (combining == 0u) return result;
    size_t index = output->length - 1u;
    while (index > 0u) {
        uint8_t prior = unicode_combining_class(output->values[index - 1u]);
        if (prior == 0u || prior <= combining) break;
        output->values[index] = output->values[index - 1u];
        index -= 1u;
    }
    output->values[index] = code_point;
    return result;
}

static OseoResult normalize_decompose(
    OseoContext *context,
    OseoCodePointBuilder *output,
    uint32_t code_point,
    bool compatibility
) {
    const uint32_t s_base = UINT32_C(0xac00);
    const uint32_t l_base = UINT32_C(0x1100);
    const uint32_t v_base = UINT32_C(0x1161);
    const uint32_t t_base = UINT32_C(0x11a7);
    const uint32_t l_count = UINT32_C(19);
    const uint32_t v_count = UINT32_C(21);
    const uint32_t t_count = UINT32_C(28);
    const uint32_t n_count = v_count * t_count;
    const uint32_t s_count = l_count * n_count;
    if (code_point >= s_base && code_point < s_base + s_count) {
        uint32_t index = code_point - s_base;
        OseoResult result = normalize_append_ordered(
            context,
            output,
            l_base + index / n_count
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = normalize_append_ordered(
                context,
                output,
                v_base + (index % n_count) / t_count
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && index % t_count != 0u) {
            result = normalize_append_ordered(
                context,
                output,
                t_base + index % t_count
            );
        }
        return result;
    }
    const OseoUnicodeMapping *mapping = NULL;
    if (compatibility) {
        mapping = unicode_mapping_find(
            oseo_unicode_compat_decomposition,
            sizeof(oseo_unicode_compat_decomposition) /
                sizeof(oseo_unicode_compat_decomposition[0]),
            code_point
        );
    }
    if (mapping == NULL) {
        mapping = unicode_mapping_find(
            oseo_unicode_canonical_decomposition,
            sizeof(oseo_unicode_canonical_decomposition) /
                sizeof(oseo_unicode_canonical_decomposition[0]),
            code_point
        );
    }
    if (mapping == NULL) {
        return normalize_append_ordered(context, output, code_point);
    }
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < mapping->length;
         index += 1u) {
        result = normalize_decompose(
            context,
            output,
            oseo_unicode_mapping_values[mapping->offset + index],
            compatibility
        );
    }
    return result;
}

static uint32_t normalize_compose_pair(uint32_t first, uint32_t second) {
    const uint32_t s_base = UINT32_C(0xac00);
    const uint32_t l_base = UINT32_C(0x1100);
    const uint32_t v_base = UINT32_C(0x1161);
    const uint32_t t_base = UINT32_C(0x11a7);
    const uint32_t l_count = UINT32_C(19);
    const uint32_t v_count = UINT32_C(21);
    const uint32_t t_count = UINT32_C(28);
    const uint32_t n_count = v_count * t_count;
    const uint32_t s_count = l_count * n_count;
    if (first >= l_base && first < l_base + l_count &&
        second >= v_base && second < v_base + v_count) {
        return s_base + ((first - l_base) * v_count +
            (second - v_base)) * t_count;
    }
    if (first >= s_base && first < s_base + s_count &&
        (first - s_base) % t_count == 0u && second > t_base &&
        second < t_base + t_count) {
        return first + second - t_base;
    }
    size_t count = sizeof(oseo_unicode_compositions) /
        sizeof(oseo_unicode_compositions[0]);
    size_t low = 0u;
    size_t high = count;
    while (low < high) {
        size_t middle = low + (high - low) / 2u;
        OseoUnicodeComposition candidate = oseo_unicode_compositions[middle];
        if (candidate.first < first ||
            (candidate.first == first && candidate.second < second)) {
            low = middle + 1u;
        } else {
            high = middle;
        }
    }
    if (low < count && oseo_unicode_compositions[low].first == first &&
        oseo_unicode_compositions[low].second == second) {
        return oseo_unicode_compositions[low].composite;
    }
    return 0u;
}

static void normalize_compose(OseoCodePointBuilder *output) {
    if (output->length < 2u) return;
    size_t result_length = 1u;
    size_t starter_index = 0u;
    uint32_t starter = output->values[0];
    uint8_t prior_combining = unicode_combining_class(starter);
    for (size_t index = 1u; index < output->length; index += 1u) {
        uint32_t code_point = output->values[index];
        uint8_t combining = unicode_combining_class(code_point);
        uint32_t composite = 0u;
        if (prior_combining < combining || prior_combining == 0u) {
            composite = normalize_compose_pair(starter, code_point);
        }
        if (composite != 0u) {
            output->values[starter_index] = composite;
            starter = composite;
            continue;
        }
        output->values[result_length] = code_point;
        if (combining == 0u) {
            starter_index = result_length;
            starter = code_point;
        }
        result_length += 1u;
        prior_combining = combining;
    }
    output->length = result_length;
}

static OseoResult normalize_subject(
    OseoContext *context,
    OseoValue subject,
    bool compatibility,
    bool compose
) {
    OseoCodePointBuilder input = {NULL, 0u, 0u};
    OseoCodePointBuilder output = {NULL, 0u, 0u};
    OseoResult result = code_points_from_string(
        context,
        string_object(subject),
        &input
    );
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < input.length;
         index += 1u) {
        result = normalize_decompose(
            context,
            &output,
            input.values[index],
            compatibility
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && compose) {
        normalize_compose(&output);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_from_code_points(context, &output);
    }
    code_point_builder_release(&input);
    code_point_builder_release(&output);
    return result;
}

static OseoResult string_normalize(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = string_builtin_argument(argument_count, arguments, 0u);
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[2] = result.value;
    bool compatibility = false;
    bool compose = true;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[1]) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_value_string(context, frame.slots[1]);
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            if (oseo_internal_string_is_ascii(frame.slots[1], "NFC")) {
                compatibility = false;
                compose = true;
            } else if (oseo_internal_string_is_ascii(
                frame.slots[1], "NFD")) {
                compatibility = false;
                compose = false;
            } else if (oseo_internal_string_is_ascii(
                frame.slots[1], "NFKC")) {
                compatibility = true;
                compose = true;
            } else if (oseo_internal_string_is_ascii(
                frame.slots[1], "NFKD")) {
                compatibility = true;
                compose = false;
            } else {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_RANGE,
                    "Invalid Unicode normalization form."
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normalize_subject(
            context,
            frame.slots[2],
            compatibility,
            compose
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_locale_compare(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = string_builtin_argument(argument_count, arguments, 0u);
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, frame.slots[1]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normalize_subject(context, frame.slots[2], false, false);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normalize_subject(context, frame.slots[3], false, false);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoString *left = string_object(frame.slots[2]);
        const OseoString *right = string_object(frame.slots[3]);
        size_t common = left->length < right->length
            ? left->length
            : right->length;
        int comparison = 0;
        for (size_t index = 0u; index < common; index += 1u) {
            if (left->units[index] < right->units[index]) {
                comparison = -1;
                break;
            }
            if (left->units[index] > right->units[index]) {
                comparison = 1;
                break;
            }
        }
        double order = comparison < 0 ||
            (comparison == 0 && left->length < right->length)
            ? -1.0
            : comparison > 0 ||
                (comparison == 0 && left->length > right->length)
                ? 1.0
                : 0.0;
        result = normal(oseo_number(order));
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* ToUint16 (7.1.7) over an already converted Number. */
static uint16_t string_to_uint16(double value) {
    if (!isfinite(value) || value == 0.0) return 0u;
    double modulo = fmod(trunc(value), 65536.0);
    if (modulo < 0.0) modulo += 65536.0;
    return (uint16_t)modulo;
}

static OseoValue string_builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

/* ToIntegerOrInfinity over one already rooted input value. */
static OseoResult string_integer_or_infinity(
    OseoContext *context,
    OseoValue value
) {
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double number = number_value(result.value);
    if (isnan(number) || number == 0.0) number = 0.0;
    else if (isfinite(number)) number = trunc(number);
    return normal(oseo_number(number));
}

static OseoResult string_method_subject(
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

static OseoResult string_at_index(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = string_builtin_argument(
        argument_count,
        arguments,
        0u
    );
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_integer_or_infinity(context, frame.slots[1]);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }

    double position = number_value(result.value);
    size_t length = string_object(frame.slots[2])->length;
    if (code_id == OSEO_STRING_AT_CODE_ID && position < 0.0) {
        position += (double)length;
    }
    if (position < 0.0 || !(position < (double)length)) {
        if (code_id == OSEO_STRING_CHAR_AT_CODE_ID) {
            result = oseo_internal_allocate_string(context, NULL, 0u);
        } else if (code_id == OSEO_STRING_CHAR_CODE_AT_CODE_ID) {
            result = normal(oseo_number(NAN));
        } else {
            result = normal(oseo_undefined());
        }
        oseo_roots_release(context, &frame);
        return result;
    }

    size_t index = (size_t)position;
    uint16_t first = string_object(frame.slots[2])->units[index];
    if (code_id == OSEO_STRING_CHAR_CODE_AT_CODE_ID) {
        result = normal(oseo_number((double)first));
    } else if (code_id == OSEO_STRING_CODE_POINT_AT_CODE_ID &&
               first >= UINT16_C(0xd800) &&
               first <= UINT16_C(0xdbff) && index + 1u < length) {
        uint16_t second = string_object(frame.slots[2])->units[index + 1u];
        if (second >= UINT16_C(0xdc00) && second <= UINT16_C(0xdfff)) {
            uint32_t code_point = UINT32_C(0x10000) +
                ((uint32_t)(first - UINT16_C(0xd800)) << 10u) +
                (uint32_t)(second - UINT16_C(0xdc00));
            result = normal(oseo_number((double)code_point));
        } else {
            result = normal(oseo_number((double)first));
        }
    } else if (code_id == OSEO_STRING_CODE_POINT_AT_CODE_ID) {
        result = normal(oseo_number((double)first));
    } else {
        result = oseo_internal_allocate_string(context, &first, 1u);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_this_value(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_string(receiver)) return normal(receiver);
    if (oseo_internal_string_data(receiver)) {
        return normal(ordinary_object(receiver)->primitive_value);
    }
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "String.prototype method requires a String receiver."
    );
}

static bool string_matches_at(
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

static size_t string_clamped_position(double position, size_t length) {
    if (!(position > 0.0)) return 0u;
    if (!(position < (double)length)) return length;
    return (size_t)position;
}

static size_t string_relative_position(double position, size_t length) {
    if (position == -INFINITY) return 0u;
    if (position < 0.0) {
        double relative = (double)length + position;
        return relative > 0.0 ? (size_t)relative : 0u;
    }
    return string_clamped_position(position, length);
}

static OseoResult string_is_regexp(
    OseoContext *context,
    OseoValue value,
    bool *regexp
) {
    return oseo_internal_is_regexp(context, value, regexp);
}

static OseoResult string_concat(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_builder_append(
            context,
            &builder,
            string_object(frame.slots[1])->units,
            string_object(frame.slots[1])->length
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < argument_count;
         index += 1u) {
        result = oseo_internal_value_string(context, arguments[index]);
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = string_builder_append(
                context,
                &builder,
                string_object(frame.slots[1])->units,
                string_object(frame.slots[1])->length
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
    string_builder_release(&builder);
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_search(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = string_builtin_argument(argument_count, arguments, 0u);
    frame.slots[2] = string_builtin_argument(argument_count, arguments, 1u);
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[3] = result.value;

    bool rejects_regexp = code_id == OSEO_STRING_INCLUDES_CODE_ID ||
        code_id == OSEO_STRING_STARTS_WITH_CODE_ID ||
        code_id == OSEO_STRING_ENDS_WITH_CODE_ID;
    bool regexp = false;
    if (result.status == OSEO_STATUS_NORMAL && rejects_regexp) {
        result = string_is_regexp(context, frame.slots[1], &regexp);
    }
    if (result.status == OSEO_STATUS_NORMAL && regexp) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String search argument must not be a RegExp."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, frame.slots[1]);
        frame.slots[4] = result.value;
    }

    double position = 0.0;
    if (result.status == OSEO_STATUS_NORMAL &&
        code_id == OSEO_STRING_LAST_INDEX_OF_CODE_ID) {
        result = oseo_internal_to_number(context, frame.slots[2]);
        if (result.status == OSEO_STATUS_NORMAL) {
            position = number_value(result.value);
            if (isnan(position)) position = INFINITY;
            else if (isfinite(position)) position = trunc(position);
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               code_id == OSEO_STRING_ENDS_WITH_CODE_ID &&
               tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED) {
        position = (double)string_object(frame.slots[3])->length;
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = string_integer_or_infinity(context, frame.slots[2]);
        if (result.status == OSEO_STATUS_NORMAL) {
            position = number_value(result.value);
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }

    const OseoString *subject = string_object(frame.slots[3]);
    const OseoString *search = string_object(frame.slots[4]);
    size_t start = string_clamped_position(position, subject->length);
    if (code_id == OSEO_STRING_STARTS_WITH_CODE_ID) {
        result = normal(oseo_boolean(string_matches_at(
            subject,
            search,
            start
        )));
    } else if (code_id == OSEO_STRING_ENDS_WITH_CODE_ID) {
        bool matches = search->length <= start &&
            string_matches_at(subject, search, start - search->length);
        result = normal(oseo_boolean(matches));
    } else if (code_id == OSEO_STRING_INDEX_OF_CODE_ID ||
               code_id == OSEO_STRING_INCLUDES_CODE_ID) {
        size_t found = SIZE_MAX;
        if (search->length <= subject->length) {
            size_t limit = subject->length - search->length;
            for (size_t index = start; index <= limit; index += 1u) {
                if (string_matches_at(subject, search, index)) {
                    found = index;
                    break;
                }
            }
        }
        result = code_id == OSEO_STRING_INCLUDES_CODE_ID
            ? normal(oseo_boolean(found != SIZE_MAX))
            : normal(oseo_number(
                  found == SIZE_MAX ? -1.0 : (double)found));
    } else {
        size_t found = SIZE_MAX;
        if (search->length <= subject->length) {
            size_t latest = subject->length - search->length;
            if (start < latest) latest = start;
            for (size_t index = latest;; index -= 1u) {
                if (string_matches_at(subject, search, index)) {
                    found = index;
                    break;
                }
                if (index == 0u) break;
            }
        }
        result = normal(oseo_number(
            found == SIZE_MAX ? -1.0 : (double)found));
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_slice(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    frame.slots[1] = string_builtin_argument(argument_count, arguments, 0u);
    frame.slots[2] = string_builtin_argument(argument_count, arguments, 1u);
    result = string_method_subject(context, frame.slots[0]);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_integer_or_infinity(context, frame.slots[1]);
    }
    double start = result.status == OSEO_STATUS_NORMAL
        ? number_value(result.value)
        : 0.0;
    double end = 0.0;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED) {
        end = (double)string_object(frame.slots[3])->length;
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = string_integer_or_infinity(context, frame.slots[2]);
        if (result.status == OSEO_STATUS_NORMAL) {
            end = number_value(result.value);
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }

    const OseoString *subject = string_object(frame.slots[3]);
    size_t from;
    size_t to;
    if (code_id == OSEO_STRING_SLICE_CODE_ID) {
        from = string_relative_position(start, subject->length);
        to = string_relative_position(end, subject->length);
        if (to < from) to = from;
    } else {
        from = string_clamped_position(start, subject->length);
        to = string_clamped_position(end, subject->length);
        if (from > to) {
            size_t swap = from;
            from = to;
            to = swap;
        }
    }
    result = oseo_internal_allocate_string(
        context,
        subject->units + from,
        to - from
    );
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult string_from_char_code(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u; index < argument_count; index += 1u) {
        result = oseo_internal_to_number(context, arguments[index]);
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = string_builder_append_unit(
            context,
            &builder,
            string_to_uint16(number_value(result.value))
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            builder.units,
            builder.length
        );
    }
    string_builder_release(&builder);
    return result;
}

static OseoResult string_from_code_point(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u; index < argument_count; index += 1u) {
        result = oseo_internal_to_number(context, arguments[index]);
        if (result.status != OSEO_STATUS_NORMAL) break;
        double next = number_value(result.value);
        if (!isfinite(next) || trunc(next) != next || next < 0.0 ||
            next > 1114111.0) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "String.fromCodePoint received an invalid code point."
            );
            break;
        }
        uint32_t code_point = (uint32_t)next;
        if (code_point <= UINT32_C(0xffff)) {
            result = string_builder_append_unit(
                context,
                &builder,
                (uint16_t)code_point
            );
        } else {
            uint32_t rest = code_point - UINT32_C(0x10000);
            uint16_t pair[] = {
                (uint16_t)(UINT32_C(0xd800) + (rest >> 10u)),
                (uint16_t)(UINT32_C(0xdc00) + (rest & UINT32_C(0x3ff))),
            };
            result = string_builder_append(
                context,
                &builder,
                pair,
                2u
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            builder.units,
            builder.length
        );
    }
    string_builder_release(&builder);
    return result;
}

/* LengthOfArrayLike (7.3.18) reported as an exact non-negative double. */
static OseoResult string_length_of_array_like(
    OseoContext *context,
    OseoValue object_value,
    double *length
) {
    OseoValue slots[2] = {object_value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "length");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, result.value);
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double value = number_value(result.value);
    if (isnan(value)) value = 0.0;
    else value = trunc(value);
    if (!(value > 0.0)) value = 0.0;
    else if (value > 9007199254740991.0) value = 9007199254740991.0;
    *length = value;
    return normal(oseo_number(value));
}

static OseoResult string_raw(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    size_t substitution_count = argument_count == 0u
        ? 0u
        : argument_count - 1u;
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_to_object(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0]
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "raw");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_object(context, frame.slots[1]);
        frame.slots[1] = result.value;
    }
    double literal_count = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = string_length_of_array_like(
            context,
            frame.slots[1],
            &literal_count
        );
    }
    for (double next = 0.0;
         result.status == OSEO_STATUS_NORMAL && next < literal_count;
         next += 1.0) {
        char key_text[32];
        (void)snprintf(key_text, sizeof(key_text), "%.0f", next);
        result = oseo_internal_ascii_string(context, key_text);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_get(context, frame.slots[1], frame.slots[2]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = string_builder_append(
            context,
            &builder,
            string_object(frame.slots[2])->units,
            string_object(frame.slots[2])->length
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            break;
        }
        if (next + 1.0 >= literal_count) break;
        if (next >= (double)substitution_count) continue;
        result = oseo_internal_value_string(
            context,
            arguments[(size_t)next + 1u]
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = string_builder_append(
            context,
            &builder,
            string_object(frame.slots[2])->units,
            string_object(frame.slots[2])->length
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(
            context,
            builder.units,
            builder.length
        );
    }
    string_builder_release(&builder);
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The String constructor (22.1.1.1). A call with a Symbol argument
 * renders SymbolDescriptiveString instead of throwing, which is the one
 * conversion difference between calling and constructing; construction
 * brands the ordinary receiver the caller created from the new target
 * with [[StringData]] and gives it the exotic own properties.
 */
static OseoResult string_construct(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    bool constructing
) {
    OseoResult result;
    if (argument_count == 0u) {
        result = oseo_internal_allocate_string(context, NULL, 0u);
    } else if (!constructing && is_symbol(arguments[0])) {
        return oseo_internal_symbol_text(context, arguments[0]);
    } else {
        result = oseo_internal_value_string(context, arguments[0]);
    }
    if (result.status != OSEO_STATUS_NORMAL || !constructing) return result;
    if (!is_object(receiver)) {
        return failure(
            context,
            "OSEO2001",
            "String receiver is not an object."
        );
    }
    OseoValue slots[2] = {result.value, receiver};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoOrdinaryObject *wrapper = ordinary_object(slots[1]);
    wrapper->primitive_data = true;
    wrapper->primitive_value = slots[0];
    result = oseo_internal_string_wrapper_properties(
        context,
        slots[0],
        slots[1]
    );
    OseoValue wrapper_value = slots[1];
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(wrapper_value)
        : result;
}

OseoResult oseo_internal_string_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_STRING_CONSTRUCTOR_CODE_ID) {
        return string_construct(
            context,
            receiver,
            argument_count,
            arguments,
            tag_of(new_target) != OSEO_TAG_UNDEFINED
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "String method is not a constructor."
        );
    }
    if (code_id == OSEO_STRING_AT_CODE_ID ||
        code_id == OSEO_STRING_CHAR_AT_CODE_ID ||
        code_id == OSEO_STRING_CHAR_CODE_AT_CODE_ID ||
        code_id == OSEO_STRING_CODE_POINT_AT_CODE_ID) {
        return string_at_index(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_TO_STRING_CODE_ID ||
        code_id == OSEO_STRING_VALUE_OF_CODE_ID) {
        return string_this_value(context, receiver);
    }
    if (code_id == OSEO_STRING_CONCAT_CODE_ID) {
        return string_concat(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_STRING_INDEX_OF_CODE_ID ||
        code_id == OSEO_STRING_LAST_INDEX_OF_CODE_ID ||
        code_id == OSEO_STRING_INCLUDES_CODE_ID ||
        code_id == OSEO_STRING_STARTS_WITH_CODE_ID ||
        code_id == OSEO_STRING_ENDS_WITH_CODE_ID) {
        return string_search(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_SLICE_CODE_ID ||
        code_id == OSEO_STRING_SUBSTRING_CODE_ID) {
        return string_slice(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_LOWERCASE_CODE_ID ||
        code_id == OSEO_STRING_UPPERCASE_CODE_ID) {
        return string_convert_case(
            context,
            receiver,
            code_id == OSEO_STRING_UPPERCASE_CODE_ID
        );
    }
    if (code_id == OSEO_STRING_TRIM_CODE_ID ||
        code_id == OSEO_STRING_TRIM_START_CODE_ID ||
        code_id == OSEO_STRING_TRIM_END_CODE_ID) {
        return string_trim(
            context,
            receiver,
            code_id != OSEO_STRING_TRIM_END_CODE_ID,
            code_id != OSEO_STRING_TRIM_START_CODE_ID
        );
    }
    if (code_id == OSEO_STRING_NORMALIZE_CODE_ID) {
        return string_normalize(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_LOCALE_COMPARE_CODE_ID) {
        return string_locale_compare(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_MATCH_CODE_ID ||
        code_id == OSEO_STRING_MATCH_ALL_CODE_ID ||
        code_id == OSEO_STRING_SEARCH_CODE_ID ||
        code_id == OSEO_STRING_SPLIT_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_CODE_ID ||
        code_id == OSEO_STRING_REPLACE_ALL_CODE_ID) {
        return oseo_internal_string_protocol_dispatch(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_STRING_ITERATOR_NEXT_CODE_ID) {
        return oseo_internal_string_protocol_dispatch(
            context,
            code_id,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_STRING_FROM_CHAR_CODE_CODE_ID) {
        return string_from_char_code(context, argument_count, arguments);
    }
    if (code_id == OSEO_STRING_FROM_CODE_POINT_CODE_ID) {
        return string_from_code_point(context, argument_count, arguments);
    }
    if (code_id == OSEO_STRING_RAW_CODE_ID) {
        return string_raw(context, argument_count, arguments);
    }
    if (code_id == OSEO_STRING_UNADMITTED_METHOD_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "String prototype method is not admitted in this M5b node."
        );
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_string_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind
) {
    size_t name_length = strlen(name);
    uint16_t units[31];
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
            kind,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_string_property(
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

OseoResult oseo_internal_string_intrinsic(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_STRING_RAW];
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) {
        return normal(context->intrinsics[OSEO_INTRINSIC_STRING]);
    }
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(context, NULL, 0u);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * %String.prototype% is itself a String exotic object whose
         * [[StringData]] is the empty String, so it carries the same
         * brand and the same non-writable `length` an instance does.
         */
        OseoOrdinaryObject *prototype = ordinary_object(frame.slots[0]);
        prototype->primitive_data = true;
        prototype->primitive_value = frame.slots[1];
        prototype->virtual_string_iterator = true;
        prototype->virtual_string_iterator_configurable = true;
        prototype->virtual_string_iterator_enumerable = false;
        prototype->virtual_string_iterator_writable = true;
        context->intrinsics[OSEO_INTRINSIC_STRING_PROTOTYPE] = frame.slots[0];
        /*
         * The marker slot is claimed before the remaining allocations so
         * a nested materialization cannot start a second construction;
         * the failure path below clears every slot again.
         */
        *marker = frame.slots[0];
        result = oseo_internal_string_wrapper_properties(
            context,
            frame.slots[1],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_install_primitive_wrapper_methods(
            context,
            frame.slots[0],
            true
        );
    }
    static const size_t access_codes[] = {
        OSEO_STRING_AT_CODE_ID,
        OSEO_STRING_CHAR_AT_CODE_ID,
        OSEO_STRING_CHAR_CODE_AT_CODE_ID,
        OSEO_STRING_CODE_POINT_AT_CODE_ID,
        OSEO_STRING_TO_STRING_CODE_ID,
        OSEO_STRING_VALUE_OF_CODE_ID,
        OSEO_STRING_CONCAT_CODE_ID,
        OSEO_STRING_INDEX_OF_CODE_ID,
        OSEO_STRING_LAST_INDEX_OF_CODE_ID,
        OSEO_STRING_INCLUDES_CODE_ID,
        OSEO_STRING_STARTS_WITH_CODE_ID,
        OSEO_STRING_ENDS_WITH_CODE_ID,
        OSEO_STRING_SLICE_CODE_ID,
        OSEO_STRING_SUBSTRING_CODE_ID,
        OSEO_STRING_MATCH_CODE_ID,
        OSEO_STRING_MATCH_ALL_CODE_ID,
        OSEO_STRING_SEARCH_CODE_ID,
        OSEO_STRING_SPLIT_CODE_ID,
        OSEO_STRING_REPLACE_CODE_ID,
        OSEO_STRING_REPLACE_ALL_CODE_ID,
        OSEO_STRING_LOCALE_COMPARE_CODE_ID,
        OSEO_STRING_LOWERCASE_CODE_ID,
        OSEO_STRING_UPPERCASE_CODE_ID,
        OSEO_STRING_LOWERCASE_CODE_ID,
        OSEO_STRING_UPPERCASE_CODE_ID,
        OSEO_STRING_TRIM_CODE_ID,
        OSEO_STRING_TRIM_START_CODE_ID,
        OSEO_STRING_TRIM_END_CODE_ID,
        OSEO_STRING_NORMALIZE_CODE_ID,
    };
    static const char *const access_names[] = {
        "at",
        "charAt",
        "charCodeAt",
        "codePointAt",
        "toString",
        "valueOf",
        "concat",
        "indexOf",
        "lastIndexOf",
        "includes",
        "startsWith",
        "endsWith",
        "slice",
        "substring",
        "match",
        "matchAll",
        "search",
        "split",
        "replace",
        "replaceAll",
        "localeCompare",
        "toLocaleLowerCase",
        "toLocaleUpperCase",
        "toLowerCase",
        "toUpperCase",
        "trim",
        "trimStart",
        "trimEnd",
        "normalize",
    };
    static const size_t access_lengths[] = {
        1u, 1u, 1u, 1u, 0u, 0u, 1u,
        1u, 1u, 1u, 1u, 1u, 2u, 2u,
        1u, 1u, 1u, 2u, 2u, 2u,
        1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < sizeof(access_codes) / sizeof(access_codes[0]);
         index += 1u) {
        result = create_string_function(
            context,
            access_codes[index],
            access_names[index],
            access_lengths[index],
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_string_property(
                context,
                frame.slots[0],
                access_names[index],
                frame.slots[1],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_string_function(
            context,
            OSEO_STRING_CONSTRUCTOR_CODE_ID,
            "String",
            1u,
            OSEO_FUNCTION_ORDINARY
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_STRING] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_string_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_STRING_FROM_CHAR_CODE,
        OSEO_INTRINSIC_STRING_FROM_CODE_POINT,
        OSEO_INTRINSIC_STRING_RAW,
    };
    static const size_t static_codes[] = {
        OSEO_STRING_FROM_CHAR_CODE_CODE_ID,
        OSEO_STRING_FROM_CODE_POINT_CODE_ID,
        OSEO_STRING_RAW_CODE_ID,
    };
    static const char *const static_names[] = {
        "fromCharCode",
        "fromCodePoint",
        "raw",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = create_string_function(
            context,
            static_codes[index],
            static_names[index],
            1u,
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[static_intrinsics[index]] = frame.slots[2];
        result = define_string_property(
            context,
            frame.slots[1],
            static_names[index],
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_STRING_PROTOTYPE] =
            oseo_undefined();
        for (size_t index = OSEO_INTRINSIC_STRING;
             index <= OSEO_INTRINSIC_STRING_RAW;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
    } else if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(context->intrinsics[OSEO_INTRINSIC_STRING])
        : result;
}

OseoResult oseo_internal_install_string_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_string_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_string_property(
            context,
            slots[0],
            "String",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    OseoValue global_value = slots[0];
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(global_value)
        : result;
}
