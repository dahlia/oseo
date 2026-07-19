#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Coercions, arithmetic, comparison, string conversion, and
 * console output.
 */

static bool numeric_whitespace(uint16_t unit) {
    return unit == UINT16_C(0x0009) || unit == UINT16_C(0x000a) ||
        unit == UINT16_C(0x000b) || unit == UINT16_C(0x000c) ||
        unit == UINT16_C(0x000d) || unit == UINT16_C(0x0020) ||
        unit == UINT16_C(0x00a0) || unit == UINT16_C(0x1680) ||
        (unit >= UINT16_C(0x2000) && unit <= UINT16_C(0x200a)) ||
        unit == UINT16_C(0x2028) || unit == UINT16_C(0x2029) ||
        unit == UINT16_C(0x202f) || unit == UINT16_C(0x205f) ||
        unit == UINT16_C(0x3000) || unit == UINT16_C(0xfeff);
}

static int radix_digit(char character) {
    if (character >= '0' && character <= '9') return character - '0';
    if (character >= 'a' && character <= 'f') {
        return character - 'a' + 10;
    }
    if (character >= 'A' && character <= 'F') {
        return character - 'A' + 10;
    }
    return -1;
}

static double prefixed_integer(
    const char *text,
    size_t length,
    int radix
) {
    if (length <= 2u) return NAN;
    int bits_per_digit = radix == 2 ? 1 : radix == 8 ? 3 : 4;
    size_t first_nonzero = length;
    for (size_t index = 2u; index < length; index += 1u) {
        int digit = radix_digit(text[index]);
        if (digit < 0 || digit >= radix) return NAN;
        if (first_nonzero == length && digit != 0) first_nonzero = index;
    }
    if (first_nonzero == length) return 0.0;

    int first_digit = radix_digit(text[first_nonzero]);
    size_t first_bits = 0u;
    for (int digit = first_digit; digit != 0; digit >>= 1) {
        first_bits += 1u;
    }
    size_t remaining_digits = length - first_nonzero - 1u;
    if (remaining_digits >
        (SIZE_MAX - first_bits) / (size_t)bits_per_digit) {
        return INFINITY;
    }
    size_t bit_length = first_bits +
        remaining_digits * (size_t)bits_per_digit;
    uint64_t significant = 0u;
    size_t seen_bits = 0u;
    bool round_bit = false;
    bool sticky_bit = false;
    for (size_t index = first_nonzero; index < length; index += 1u) {
        int digit = radix_digit(text[index]);
        int highest_bit = index == first_nonzero
            ? (int)first_bits - 1
            : bits_per_digit - 1;
        for (int bit = highest_bit; bit >= 0; bit -= 1) {
            bool set = (digit & (1 << bit)) != 0;
            if (seen_bits < 53u) {
                significant = (significant << 1u) | (set ? 1u : 0u);
            } else if (seen_bits == 53u) {
                round_bit = set;
            } else if (set) {
                sticky_bit = true;
            }
            seen_bits += 1u;
        }
    }
    if (bit_length <= 53u) return (double)significant;

    size_t shift = bit_length - 53u;
    if (round_bit && (sticky_bit || (significant & 1u) != 0u)) {
        significant += 1u;
        if (significant == (UINT64_C(1) << 53u)) {
            significant >>= 1u;
            shift += 1u;
        }
    }
    if (shift > 971u) return INFINITY;
    return ldexp((double)significant, (int)shift);
}

static OseoResult string_number(
    OseoContext *context,
    const OseoString *string
) {
    size_t start = 0u;
    size_t end_index = string->length;
    while (start < end_index && numeric_whitespace(string->units[start])) {
        start += 1u;
    }
    while (end_index > start &&
           numeric_whitespace(string->units[end_index - 1u])) {
        end_index -= 1u;
    }
    if (start == end_index) return normal(oseo_number(0.0));
    size_t length = end_index - start;
    char *text = malloc(length + 1u);
    if (text == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Numeric conversion allocation failed."
        );
    }
    for (size_t index = 0u; index < length; index += 1u) {
        uint16_t unit = string->units[start + index];
        if (unit == 0u || unit > UINT16_C(0x7f)) {
            free(text);
            return normal(oseo_number(NAN));
        }
        text[index] = (char)unit;
    }
    text[length] = '\0';
    if (strcmp(text, "Infinity") == 0 || strcmp(text, "+Infinity") == 0) {
        free(text);
        return normal(oseo_number(INFINITY));
    }
    if (strcmp(text, "-Infinity") == 0) {
        free(text);
        return normal(oseo_number(-INFINITY));
    }
    double result;
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'b' || text[1] == 'B')) {
        result = prefixed_integer(text, length, 2);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'o' || text[1] == 'O')) {
        result = prefixed_integer(text, length, 8);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'x' || text[1] == 'X')) {
        result = prefixed_integer(text, length, 16);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 3u && (text[0] == '+' || text[0] == '-') &&
        text[1] == '0' &&
        (text[2] == 'b' || text[2] == 'B' || text[2] == 'o' ||
         text[2] == 'O' || text[2] == 'x' || text[2] == 'X')) {
        free(text);
        return normal(oseo_number(NAN));
    }
    if ((text[0] < '0' || text[0] > '9') && text[0] != '+' &&
        text[0] != '-' && text[0] != '.') {
        free(text);
        return normal(oseo_number(NAN));
    }
    for (size_t index = 0u; index < length; index += 1u) {
        char character = text[index];
        bool lower_non_exponent = character >= 'a' && character <= 'z' &&
            character != 'e';
        bool upper_non_exponent = character >= 'A' && character <= 'Z' &&
            character != 'E';
        if (lower_non_exponent || upper_non_exponent) {
            free(text);
            return normal(oseo_number(NAN));
        }
    }
    char *parse_end;
    result = strtod(text, &parse_end);
    if (parse_end == text || *parse_end != '\0') result = NAN;
    free(text);
    return normal(oseo_number(result));
}

OseoResult oseo_internal_to_number(OseoContext *context, OseoValue value) {
    uint64_t tag = tag_of(value);
    if (is_number(value)) return normal(value);
    if (tag == OSEO_TAG_UNDEFINED) return normal(oseo_number(NAN));
    if (tag == OSEO_TAG_NULL) return normal(oseo_number(0.0));
    if (tag == OSEO_TAG_BOOLEAN) {
        double number = (value & 1u) != 0u ? 1.0 : 0.0;
        return normal(oseo_number(number));
    }
    if (is_string(value)) {
        return string_number(context, string_object(value));
    }
    return failure(
        context,
        "OSEO2001",
        "Object-to-primitive conversion is unsupported."
    );
}

static void append_character(
    char *text,
    size_t capacity,
    size_t *length,
    char character
) {
    if (*length + 1u < capacity) text[*length] = character;
    *length += 1u;
}

static size_t format_shortest_decimal(
    const char *candidate,
    char *output,
    size_t capacity
) {
    char digits[32];
    size_t digit_count = 0u;
    size_t digits_before_point = 0u;
    bool before_point = true;
    bool negative = candidate[0] == '-';
    const char *cursor = candidate + (negative ? 1u : 0u);
    const char *exponent_marker = strchr(cursor, 'e');
    const char *mantissa_end = exponent_marker == NULL
        ? cursor + strlen(cursor)
        : exponent_marker;
    for (const char *part = cursor; part < mantissa_end; part += 1) {
        if (*part == '.') {
            before_point = false;
        } else {
            digits[digit_count] = *part;
            digit_count += 1u;
            if (before_point) digits_before_point += 1u;
        }
    }
    int exponent = 0;
    if (exponent_marker != NULL) {
        const char *part = exponent_marker + 1;
        int sign = 1;
        if (*part == '+' || *part == '-') {
            if (*part == '-') sign = -1;
            part += 1;
        }
        while (*part >= '0' && *part <= '9') {
            exponent = exponent * 10 + (*part - '0');
            part += 1;
        }
        exponent *= sign;
    }
    int decimal_position = (int)digits_before_point + exponent;
    char formatted[96];
    size_t length = 0u;
    if (negative) {
        append_character(formatted, sizeof(formatted), &length, '-');
    }
    if (decimal_position <= 0 && decimal_position > -6) {
        append_character(formatted, sizeof(formatted), &length, '0');
        append_character(formatted, sizeof(formatted), &length, '.');
        for (int index = 0; index < -decimal_position; index += 1) {
            append_character(formatted, sizeof(formatted), &length, '0');
        }
        for (size_t index = 0u; index < digit_count; index += 1u) {
            append_character(
                formatted,
                sizeof(formatted),
                &length,
                digits[index]
            );
        }
    } else if (decimal_position > 0 && decimal_position <= 21) {
        for (int index = 0; index < decimal_position; index += 1) {
            char digit = index < (int)digit_count
                ? digits[(size_t)index]
                : '0';
            append_character(formatted, sizeof(formatted), &length, digit);
        }
        if (decimal_position < (int)digit_count) {
            append_character(formatted, sizeof(formatted), &length, '.');
            for (size_t index = (size_t)decimal_position;
                 index < digit_count;
                 index += 1u) {
                append_character(
                    formatted,
                    sizeof(formatted),
                    &length,
                    digits[index]
                );
            }
        }
    } else {
        append_character(formatted, sizeof(formatted), &length, digits[0]);
        if (digit_count > 1u) {
            append_character(formatted, sizeof(formatted), &length, '.');
            for (size_t index = 1u; index < digit_count; index += 1u) {
                append_character(
                    formatted,
                    sizeof(formatted),
                    &length,
                    digits[index]
                );
            }
        }
        int scientific_exponent = decimal_position - 1;
        char exponent_text[16];
        (void)snprintf(
            exponent_text,
            sizeof(exponent_text),
            "e%+d",
            scientific_exponent
        );
        for (const char *part = exponent_text; *part != '\0'; part += 1) {
            append_character(
                formatted,
                sizeof(formatted),
                &length,
                *part
            );
        }
    }
    size_t stored = length < sizeof(formatted) - 1u
        ? length
        : sizeof(formatted) - 1u;
    formatted[stored] = '\0';
    return (size_t)snprintf(output, capacity, "%s", formatted);
}

static size_t number_text(double value, char *output, size_t capacity) {
    if (isnan(value)) return (size_t)snprintf(output, capacity, "NaN");
    if (isinf(value)) {
        return (size_t)snprintf(
            output,
            capacity,
            signbit(value) ? "-Infinity" : "Infinity"
        );
    }
    if (value == 0.0) return (size_t)snprintf(output, capacity, "0");
    for (int precision = 1; precision <= 17; precision += 1) {
        char candidate[64];
        (void)snprintf(
            candidate,
            sizeof(candidate),
            "%.*g",
            precision,
            value
        );
        char *end;
        double parsed = strtod(candidate, &end);
        if (*end == '\0' && double_bits(parsed) == double_bits(value)) {
            return format_shortest_decimal(candidate, output, capacity);
        }
    }
    char fallback[64];
    (void)snprintf(fallback, sizeof(fallback), "%.17g", value);
    return format_shortest_decimal(fallback, output, capacity);
}

OseoResult oseo_internal_value_string(OseoContext *context, OseoValue value) {
    if (is_string(value)) return normal(value);
    const char *constant = NULL;
    uint64_t tag = tag_of(value);
    char number[64];
    if (tag == OSEO_TAG_UNDEFINED) constant = "undefined";
    else if (tag == OSEO_TAG_NULL) constant = "null";
    else if (tag == OSEO_TAG_BOOLEAN) {
        constant = (value & 1u) != 0u ? "true" : "false";
    } else if (is_number(value)) {
        (void)number_text(number_value(value), number, sizeof(number));
        constant = number;
    }
    if (constant == NULL) {
        return failure(context, "OSEO2001", "Value is outside M1 semantics.");
    }
    size_t length = strlen(constant);
    uint16_t units[64];
    if (length > 64u) {
        return failure(context, "OSEO2001", "Primitive text is too long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)constant[index];
    }
    return oseo_internal_allocate_string(context, units, length);
}

OseoResult oseo_property_key(OseoContext *context, OseoValue value) {
    return oseo_internal_value_string(context, value);
}

OseoResult oseo_negate(OseoContext *context, OseoValue value) {
    OseoResult number = oseo_internal_to_number(context, value);
    if (number.status != OSEO_STATUS_NORMAL) return number;
    return normal(oseo_number(-number_value(number.value)));
}

OseoResult oseo_typeof(OseoContext *context, OseoValue value) {
    const char *constant = NULL;
    uint64_t tag = tag_of(value);
    if (tag == OSEO_TAG_UNDEFINED) constant = "undefined";
    else if (tag == OSEO_TAG_NULL) constant = "object";
    else if (tag == OSEO_TAG_BOOLEAN) constant = "boolean";
    else if (is_number(value)) constant = "number";
    else if (is_string(value)) constant = "string";
    else if (is_function(value)) constant = "function";
    else if (is_object(value)) constant = "object";
    if (constant == NULL) {
        return failure(context, "OSEO2001", "Value has no typeof text.");
    }
    size_t length = strlen(constant);
    uint16_t units[16];
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)constant[index];
    }
    return oseo_internal_allocate_string(context, units, length);
}

static OseoResult numeric_binary(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    char operator
) {
    OseoResult left_number = oseo_internal_to_number(context, left);
    if (left_number.status != OSEO_STATUS_NORMAL) return left_number;
    OseoResult right_number = oseo_internal_to_number(context, right);
    if (right_number.status != OSEO_STATUS_NORMAL) return right_number;
    double left_value = number_value(left_number.value);
    double right_value = number_value(right_number.value);
    double value;
    if (operator == '+') value = left_value + right_value;
    else if (operator == '-') value = left_value - right_value;
    else if (operator == '*') value = left_value * right_value;
    else if (operator == '%') value = fmod(left_value, right_value);
    else value = left_value / right_value;
    return normal(oseo_number(value));
}

OseoResult oseo_add(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    if (context->observe_specialization) {
        context->generic_addition_calls += 1u;
    }
    if (!is_string(left) && !is_string(right)) {
        return numeric_binary(context, left, right, '+');
    }
    OseoValue slots[2] = {left, right};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult left_string = oseo_internal_value_string(context, slots[0]);
    if (left_string.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return left_string;
    }
    slots[0] = left_string.value;
    OseoResult right_string = oseo_internal_value_string(context, slots[1]);
    if (right_string.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return right_string;
    }
    slots[1] = right_string.value;
    OseoString *left_object = string_object(slots[0]);
    OseoString *right_object = string_object(slots[1]);
    size_t maximum_length =
        (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t);
    if (left_object->length > maximum_length ||
        right_object->length > maximum_length - left_object->length) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "String allocation is too large."
        );
    }
    size_t length = left_object->length + right_object->length;
    uint16_t *units = length == 0u
        ? NULL
        : malloc(length * sizeof(uint16_t));
    if (units == NULL && length > 0u) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    if (left_object->length > 0u) {
        memcpy(
            units,
            left_object->units,
            left_object->length * sizeof(uint16_t)
        );
    }
    if (right_object->length > 0u) {
        memcpy(
            units + left_object->length,
            right_object->units,
            right_object->length * sizeof(uint16_t)
        );
    }
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    free(units);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_subtract(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '-');
}

OseoResult oseo_multiply(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '*');
}

OseoResult oseo_divide(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '/');
}

OseoResult oseo_remainder(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '%');
}

OseoResult oseo_to_number(OseoContext *context, OseoValue value) {
    return oseo_internal_to_number(context, value);
}

OseoResult oseo_exponentiate(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    OseoResult base = oseo_internal_to_number(context, left);
    if (base.status != OSEO_STATUS_NORMAL) return base;
    OseoResult exponent = oseo_internal_to_number(context, right);
    if (exponent.status != OSEO_STATUS_NORMAL) return exponent;
    double base_value = number_value(base.value);
    double exponent_value = number_value(exponent.value);
    double value;
    if (isnan(exponent_value)) {
        value = NAN;
    } else if (fabs(base_value) == 1.0 && isinf(exponent_value)) {
        value = NAN;
    } else {
        value = pow(base_value, exponent_value);
    }
    return normal(oseo_number(value));
}

/* The modular 32-bit patterns shared by ToInt32 and ToUint32. */
static uint32_t uint32_bits(double number) {
    if (!isfinite(number) || number == 0.0) return 0u;
    double wrapped = fmod(trunc(number), 4294967296.0);
    if (wrapped < 0.0) wrapped += 4294967296.0;
    return (uint32_t)wrapped;
}

static double int32_number(uint32_t bits) {
    return bits >= 2147483648u
        ? (double)((int64_t)bits - INT64_C(4294967296))
        : (double)bits;
}

static OseoResult int32_binary(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    char operator
) {
    OseoResult left_number = oseo_internal_to_number(context, left);
    if (left_number.status != OSEO_STATUS_NORMAL) return left_number;
    OseoResult right_number = oseo_internal_to_number(context, right);
    if (right_number.status != OSEO_STATUS_NORMAL) return right_number;
    uint32_t left_bits = uint32_bits(number_value(left_number.value));
    uint32_t right_bits = uint32_bits(number_value(right_number.value));
    if (operator == '&') {
        return normal(oseo_number(int32_number(left_bits & right_bits)));
    }
    if (operator == '|') {
        return normal(oseo_number(int32_number(left_bits | right_bits)));
    }
    if (operator == '^') {
        return normal(oseo_number(int32_number(left_bits ^ right_bits)));
    }
    uint32_t shift = right_bits & 31u;
    if (operator == '<') {
        return normal(oseo_number(int32_number(left_bits << shift)));
    }
    if (operator == '>') {
        uint32_t shifted = (left_bits & 2147483648u) != 0u
            ? ~(~left_bits >> shift)
            : left_bits >> shift;
        return normal(oseo_number(int32_number(shifted)));
    }
    return normal(oseo_number((double)(left_bits >> shift)));
}

OseoResult oseo_bitwise_and(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, '&');
}

OseoResult oseo_bitwise_or(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, '|');
}

OseoResult oseo_bitwise_xor(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, '^');
}

OseoResult oseo_shift_left(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, '<');
}

OseoResult oseo_shift_right(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, '>');
}

OseoResult oseo_shift_right_unsigned(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return int32_binary(context, left, right, 'u');
}

OseoResult oseo_bitwise_not(OseoContext *context, OseoValue value) {
    OseoResult number = oseo_internal_to_number(context, value);
    if (number.status != OSEO_STATUS_NORMAL) return number;
    uint32_t bits = ~uint32_bits(number_value(number.value));
    return normal(oseo_number(int32_number(bits)));
}

static bool strict_equal_value(OseoValue left, OseoValue right) {
    if (is_number(left) && is_number(right)) {
        double left_number = number_value(left);
        double right_number = number_value(right);
        return !isnan(left_number) && !isnan(right_number) &&
            left_number == right_number;
    }
    uint64_t left_tag = tag_of(left);
    if (left_tag != tag_of(right)) return false;
    if (left_tag == OSEO_TAG_UNDEFINED || left_tag == OSEO_TAG_NULL) {
        return true;
    }
    if (left_tag == OSEO_TAG_BOOLEAN) return (left & 1u) == (right & 1u);
    if (is_string(left) && is_string(right)) {
        OseoString *left_string = string_object(left);
        OseoString *right_string = string_object(right);
        return left_string->length == right_string->length &&
            memcmp(
                left_string->units,
                right_string->units,
                left_string->length * sizeof(uint16_t)
            ) == 0;
    }
    if (left_tag == OSEO_TAG_HEAP) return left == right;
    return false;
}

OseoResult oseo_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    (void)context;
    return normal(oseo_boolean(strict_equal_value(left, right)));
}

/* IsLooselyEqual for the admitted values; objects compare by identity and
 * object-to-primitive coercion keeps the shared unsupported boundary. */
static OseoResult loose_equal_value(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    bool *equal
) {
    if (is_number(left) && is_number(right)) {
        *equal = strict_equal_value(left, right);
        return normal(oseo_undefined());
    }
    uint64_t left_tag = tag_of(left);
    uint64_t right_tag = tag_of(right);
    bool left_nullish =
        left_tag == OSEO_TAG_UNDEFINED || left_tag == OSEO_TAG_NULL;
    bool right_nullish =
        right_tag == OSEO_TAG_UNDEFINED || right_tag == OSEO_TAG_NULL;
    if (left_nullish || right_nullish) {
        *equal = left_nullish && right_nullish;
        return normal(oseo_undefined());
    }
    if (left_tag == OSEO_TAG_BOOLEAN) {
        OseoResult number = oseo_internal_to_number(context, left);
        if (number.status != OSEO_STATUS_NORMAL) return number;
        return loose_equal_value(context, number.value, right, equal);
    }
    if (right_tag == OSEO_TAG_BOOLEAN) {
        OseoResult number = oseo_internal_to_number(context, right);
        if (number.status != OSEO_STATUS_NORMAL) return number;
        return loose_equal_value(context, left, number.value, equal);
    }
    if (is_string(left) && is_string(right)) {
        *equal = strict_equal_value(left, right);
        return normal(oseo_undefined());
    }
    if (is_number(left) && is_string(right)) {
        OseoResult converted = string_number(context, string_object(right));
        if (converted.status != OSEO_STATUS_NORMAL) return converted;
        return loose_equal_value(context, left, converted.value, equal);
    }
    if (is_string(left) && is_number(right)) {
        OseoResult converted = string_number(context, string_object(left));
        if (converted.status != OSEO_STATUS_NORMAL) return converted;
        return loose_equal_value(context, converted.value, right, equal);
    }
    if (is_object(left) && is_object(right)) {
        *equal = left == right;
        return normal(oseo_undefined());
    }
    return failure(
        context,
        "OSEO2001",
        "Object-to-primitive conversion is unsupported."
    );
}

OseoResult oseo_loose_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    bool equal = false;
    OseoResult status = loose_equal_value(context, left, right, &equal);
    if (status.status != OSEO_STATUS_NORMAL) return status;
    return normal(oseo_boolean(equal));
}

OseoResult oseo_not_loose_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    bool equal = false;
    OseoResult status = loose_equal_value(context, left, right, &equal);
    if (status.status != OSEO_STATUS_NORMAL) return status;
    return normal(oseo_boolean(!equal));
}

OseoResult oseo_has_property(
    OseoContext *context,
    OseoValue key,
    OseoValue object_value
) {
    if (!is_object(object_value)) {
        return language_failure_message(
            context,
            "The in operator requires an object."
        );
    }
    OseoValue slots[2] = {key, object_value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult converted = oseo_property_key(context, slots[0]);
    oseo_roots_pop(context, &frame);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    OseoValue property = converted.value;
    OseoValue current = slots[1];
    while (is_object(current)) {
        OseoValue value = oseo_undefined();
        OseoPropertyAttributes attributes = {false, false, false};
        if (oseo_internal_own_descriptor(
            current, property, &value, &attributes)) {
            return normal(oseo_boolean(true));
        }
        if (is_promise(current) &&
            ordinary_object(current)->default_intrinsics &&
            (oseo_internal_string_is_ascii(property, "then") ||
             oseo_internal_string_is_ascii(property, "catch") ||
             oseo_internal_string_is_ascii(property, "finally"))) {
            return normal(oseo_boolean(true));
        }
        current = ordinary_object(current)->prototype;
    }
    return normal(oseo_boolean(false));
}

OseoResult oseo_instanceof(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    if (!is_function(right)) {
        return language_failure_message(
            context,
            "The instanceof right operand must be callable."
        );
    }
    if (!is_object(left)) return normal(oseo_boolean(false));
    OseoValue slots[3] = {left, right, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    const char *name = "prototype";
    uint16_t units[9];
    for (size_t index = 0u; index < 9u; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoResult key = oseo_internal_allocate_string(context, units, 9u);
    if (key.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return key;
    }
    slots[2] = key.value;
    OseoResult prototype = oseo_object_get(context, slots[1], slots[2]);
    oseo_roots_pop(context, &frame);
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    if (!is_object(prototype.value)) {
        return language_failure_message(
            context,
            "The instanceof prototype must be an object."
        );
    }
    OseoValue current = ordinary_object(slots[0])->prototype;
    while (is_object(current)) {
        if (current == prototype.value) return normal(oseo_boolean(true));
        current = ordinary_object(current)->prototype;
    }
    return normal(oseo_boolean(false));
}

OseoResult oseo_not_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    (void)context;
    return normal(oseo_boolean(!strict_equal_value(left, right)));
}

static int compare_strings(
    const OseoString *left,
    const OseoString *right
) {
    size_t length = left->length < right->length
        ? left->length
        : right->length;
    for (size_t index = 0u; index < length; index += 1u) {
        if (left->units[index] < right->units[index]) return -1;
        if (left->units[index] > right->units[index]) return 1;
    }
    if (left->length < right->length) return -1;
    if (left->length > right->length) return 1;
    return 0;
}

static OseoResult relational(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    char operator
) {
    if (is_string(left) && is_string(right)) {
        int order = compare_strings(string_object(left), string_object(right));
        bool result;
        if (operator == '<') result = order < 0;
        else if (operator == 'l') result = order <= 0;
        else if (operator == '>') result = order > 0;
        else result = order >= 0;
        return normal(oseo_boolean(result));
    }
    OseoResult left_number = oseo_internal_to_number(context, left);
    if (left_number.status != OSEO_STATUS_NORMAL) return left_number;
    OseoResult right_number = oseo_internal_to_number(context, right);
    if (right_number.status != OSEO_STATUS_NORMAL) return right_number;
    double left_value = number_value(left_number.value);
    double right_value = number_value(right_number.value);
    bool result = false;
    if (!isnan(left_value) && !isnan(right_value)) {
        if (operator == '<') result = left_value < right_value;
        else if (operator == 'l') result = left_value <= right_value;
        else if (operator == '>') result = left_value > right_value;
        else result = left_value >= right_value;
    }
    return normal(oseo_boolean(result));
}

OseoResult oseo_less_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, '<');
}

OseoResult oseo_less_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, 'l');
}

OseoResult oseo_greater_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, '>');
}

OseoResult oseo_greater_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, 'g');
}

static int write_code_point(uint32_t point) {
    unsigned char bytes[4];
    size_t length;
    if (point <= UINT32_C(0x7f)) {
        bytes[0] = (unsigned char)point;
        length = 1u;
    } else if (point <= UINT32_C(0x7ff)) {
        bytes[0] = (unsigned char)(UINT32_C(0xc0) | (point >> 6u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 2u;
    } else if (point <= UINT32_C(0xffff)) {
        bytes[0] = (unsigned char)(UINT32_C(0xe0) | (point >> 12u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | ((point >> 6u) & 0x3fu));
        bytes[2] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 3u;
    } else {
        bytes[0] = (unsigned char)(UINT32_C(0xf0) | (point >> 18u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | ((point >> 12u) & 0x3fu));
        bytes[2] = (unsigned char)(UINT32_C(0x80) | ((point >> 6u) & 0x3fu));
        bytes[3] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 4u;
    }
    return fwrite(bytes, 1u, length, stdout) == length ? 0 : 1;
}

static int write_string(OseoValue value) {
    OseoString *string = string_object(value);
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint32_t point = string->units[index];
        if (point >= UINT32_C(0xd800) && point <= UINT32_C(0xdbff) &&
            index + 1u < string->length) {
            uint32_t low = string->units[index + 1u];
            if (low >= UINT32_C(0xdc00) && low <= UINT32_C(0xdfff)) {
                point = UINT32_C(0x10000) +
                    ((point - UINT32_C(0xd800)) << 10u) +
                    (low - UINT32_C(0xdc00));
                index += 1u;
            } else {
                point = UINT32_C(0xfffd);
            }
        } else if (point >= UINT32_C(0xd800) &&
                   point <= UINT32_C(0xdfff)) {
            point = UINT32_C(0xfffd);
        }
        if (write_code_point(point) != 0) return 1;
    }
    return 0;
}

OseoResult oseo_console_log(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    for (size_t index = 0u; index < argument_count; index += 1u) {
        if (index > 0u && fputc(' ', stdout) == EOF) {
            return failure(context, "OSEO3001", "Standard output failed.");
        }
        OseoResult string =
            oseo_internal_value_string(context, arguments[index]);
        if (string.status != OSEO_STATUS_NORMAL) return string;
        if (write_string(string.value) != 0) {
            return failure(context, "OSEO3001", "Standard output failed.");
        }
    }
    if (fputc('\n', stdout) == EOF) {
        return failure(context, "OSEO3001", "Standard output failed.");
    }
    return normal(oseo_undefined());
}
