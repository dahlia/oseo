#include "runtime_internal.h"

#include <float.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

/* Number constructor, wrapper state, constants, and static operations. */

#define OSEO_MAX_SAFE_INTEGER 9007199254740991.0

static bool number_whitespace(uint16_t unit) {
    return unit == UINT16_C(0x0009) || unit == UINT16_C(0x000a) ||
        unit == UINT16_C(0x000b) || unit == UINT16_C(0x000c) ||
        unit == UINT16_C(0x000d) || unit == UINT16_C(0x0020) ||
        unit == UINT16_C(0x00a0) || unit == UINT16_C(0x1680) ||
        (unit >= UINT16_C(0x2000) && unit <= UINT16_C(0x200a)) ||
        unit == UINT16_C(0x2028) || unit == UINT16_C(0x2029) ||
        unit == UINT16_C(0x202f) || unit == UINT16_C(0x205f) ||
        unit == UINT16_C(0x3000) || unit == UINT16_C(0xfeff);
}

static int number_digit(uint16_t unit) {
    if (unit >= UINT16_C('0') && unit <= UINT16_C('9')) {
        return (int)(unit - UINT16_C('0'));
    }
    if (unit >= UINT16_C('a') && unit <= UINT16_C('z')) {
        return (int)(unit - UINT16_C('a')) + 10;
    }
    if (unit >= UINT16_C('A') && unit <= UINT16_C('Z')) {
        return (int)(unit - UINT16_C('A')) + 10;
    }
    return -1;
}

static OseoResult number_argument(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count == 0u) return normal(oseo_number(0.0));
    OseoResult result = oseo_to_numeric(context, arguments[0]);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (is_bigint(result.value)) {
        return normal(oseo_number(
            oseo_internal_bigint_to_number(result.value)
        ));
    }
    return result;
}

static OseoResult number_construct(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    bool constructing
) {
    OseoResult result = number_argument(context, argument_count, arguments);
    if (result.status != OSEO_STATUS_NORMAL || !constructing) return result;
    if (!is_object(receiver)) {
        return failure(
            context,
            "OSEO2001",
            "Number receiver is not an object."
        );
    }
    OseoOrdinaryObject *object = ordinary_object(receiver);
    object->number_data = true;
    object->number_value = result.value;
    return normal(receiver);
}

static OseoResult number_is_finite(
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count == 0u || !is_number(arguments[0])) {
        return normal(oseo_boolean(false));
    }
    return normal(oseo_boolean(isfinite(number_value(arguments[0]))));
}

static OseoResult number_is_integer(
    size_t argument_count,
    const OseoValue *arguments,
    bool safe
) {
    if (argument_count == 0u || !is_number(arguments[0])) {
        return normal(oseo_boolean(false));
    }
    double value = number_value(arguments[0]);
    bool integer = isfinite(value) && trunc(value) == value;
    if (safe) integer = integer && fabs(value) <= OSEO_MAX_SAFE_INTEGER;
    return normal(oseo_boolean(integer));
}

static OseoResult number_is_nan(
    size_t argument_count,
    const OseoValue *arguments
) {
    bool result = argument_count > 0u && is_number(arguments[0]) &&
        isnan(number_value(arguments[0]));
    return normal(oseo_boolean(result));
}

static bool number_matches(
    const OseoString *string,
    size_t start,
    const char *text
) {
    size_t length = strlen(text);
    if (start > string->length || length > string->length - start) {
        return false;
    }
    for (size_t index = 0u; index < length; index += 1u) {
        if (string->units[start + index] !=
            (uint16_t)(unsigned char)text[index]) {
            return false;
        }
    }
    return true;
}

static OseoResult number_parse_float(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue input = argument_count == 0u
        ? oseo_undefined()
        : arguments[0];
    OseoResult converted = oseo_internal_value_string(context, input);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    const OseoString *string = string_object(converted.value);
    size_t start = 0u;
    while (start < string->length &&
           number_whitespace(string->units[start])) {
        start += 1u;
    }
    size_t cursor = start;
    bool negative = false;
    if (cursor < string->length &&
        (string->units[cursor] == UINT16_C('+') ||
         string->units[cursor] == UINT16_C('-'))) {
        negative = string->units[cursor] == UINT16_C('-');
        cursor += 1u;
    }
    if (number_matches(string, cursor, "Infinity")) {
        return normal(oseo_number(negative ? -INFINITY : INFINITY));
    }
    size_t integer_start = cursor;
    while (cursor < string->length &&
           number_digit(string->units[cursor]) >= 0 &&
           number_digit(string->units[cursor]) < 10) {
        cursor += 1u;
    }
    bool has_digits = cursor > integer_start;
    if (cursor < string->length &&
        string->units[cursor] == UINT16_C('.')) {
        cursor += 1u;
        size_t fraction_start = cursor;
        while (cursor < string->length &&
               number_digit(string->units[cursor]) >= 0 &&
               number_digit(string->units[cursor]) < 10) {
            cursor += 1u;
        }
        has_digits = has_digits || cursor > fraction_start;
    }
    if (!has_digits) return normal(oseo_number(NAN));
    size_t exponent_start = cursor;
    if (cursor < string->length &&
        (string->units[cursor] == UINT16_C('e') ||
         string->units[cursor] == UINT16_C('E'))) {
        cursor += 1u;
        if (cursor < string->length &&
            (string->units[cursor] == UINT16_C('+') ||
             string->units[cursor] == UINT16_C('-'))) {
            cursor += 1u;
        }
        size_t digits = cursor;
        while (cursor < string->length &&
               number_digit(string->units[cursor]) >= 0 &&
               number_digit(string->units[cursor]) < 10) {
            cursor += 1u;
        }
        if (cursor == digits) cursor = exponent_start;
    }
    size_t length = cursor - start;
    char *text = malloc(length + 1u);
    if (text == NULL) {
        return failure(context, "OSEO2001", "Number parsing failed.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        text[index] = (char)string->units[start + index];
    }
    text[length] = '\0';
    double value = strtod(text, NULL);
    free(text);
    return normal(oseo_number(value));
}

static int32_t number_to_int32(double value) {
    if (!isfinite(value) || value == 0.0) return 0;
    double modulo = fmod(trunc(value), 4294967296.0);
    if (modulo < 0.0) modulo += 4294967296.0;
    uint32_t bits = (uint32_t)modulo;
    if (bits < UINT32_C(0x80000000)) return (int32_t)bits;
    return (int32_t)((int64_t)bits - INT64_C(4294967296));
}

static OseoResult number_parse_int(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[2] = {
        argument_count == 0u ? oseo_undefined() : arguments[0],
        argument_count < 2u ? oseo_undefined() : arguments[1],
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(context, slots[0]);
    slots[0] = result.value;
    int32_t requested_radix = 0;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[1]) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_to_number(context, slots[1]);
        if (result.status == OSEO_STATUS_NORMAL) {
            requested_radix = number_to_int32(number_value(result.value));
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    const OseoString *string = string_object(slots[0]);
    size_t cursor = 0u;
    while (cursor < string->length &&
           number_whitespace(string->units[cursor])) {
        cursor += 1u;
    }
    bool negative = false;
    if (cursor < string->length &&
        (string->units[cursor] == UINT16_C('+') ||
         string->units[cursor] == UINT16_C('-'))) {
        negative = string->units[cursor] == UINT16_C('-');
        cursor += 1u;
    }
    int radix = requested_radix;
    bool strip_prefix = true;
    if (radix != 0) {
        if (radix < 2 || radix > 36) {
            oseo_roots_pop(context, &frame);
            return normal(oseo_number(NAN));
        }
        strip_prefix = radix == 16;
    } else {
        radix = 10;
    }
    if (strip_prefix && cursor + 1u < string->length &&
        string->units[cursor] == UINT16_C('0') &&
        (string->units[cursor + 1u] == UINT16_C('x') ||
         string->units[cursor + 1u] == UINT16_C('X'))) {
        cursor += 2u;
        radix = 16;
    }
    size_t digits = 0u;
    size_t digit_start = cursor;
    while (cursor < string->length) {
        int digit = number_digit(string->units[cursor]);
        if (digit < 0 || digit >= radix) break;
        digits += 1u;
        cursor += 1u;
    }
    double value = oseo_internal_integer_digits_to_number(
        &string->units[digit_start],
        digits,
        (uint32_t)radix
    );
    oseo_roots_pop(context, &frame);
    if (digits == 0u) return normal(oseo_number(NAN));
    return normal(oseo_number(negative ? -value : value));
}

OseoResult oseo_internal_number_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_NUMBER_CONSTRUCTOR_CODE_ID) {
        return number_construct(
            context,
            receiver,
            argument_count,
            arguments,
            tag_of(new_target) != OSEO_TAG_UNDEFINED
        );
    }
    if (code_id == OSEO_NUMBER_VALUE_OF_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "Number prototype methods are not admitted yet."
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Number static method is not a constructor."
        );
    }
    if (code_id == OSEO_NUMBER_IS_FINITE_CODE_ID) {
        return number_is_finite(argument_count, arguments);
    }
    if (code_id == OSEO_NUMBER_IS_INTEGER_CODE_ID) {
        return number_is_integer(argument_count, arguments, false);
    }
    if (code_id == OSEO_NUMBER_IS_NAN_CODE_ID) {
        return number_is_nan(argument_count, arguments);
    }
    if (code_id == OSEO_NUMBER_IS_SAFE_INTEGER_CODE_ID) {
        return number_is_integer(argument_count, arguments, true);
    }
    if (code_id == OSEO_NUMBER_PARSE_FLOAT_CODE_ID) {
        return number_parse_float(context, argument_count, arguments);
    }
    if (code_id == OSEO_NUMBER_PARSE_INT_CODE_ID) {
        return number_parse_int(context, argument_count, arguments);
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_number_function(
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

static OseoResult define_number_property(
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

OseoResult oseo_internal_number_intrinsic(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_NUMBER_PARSE_INT];
    if (is_function(*marker)) {
        return normal(context->intrinsics[OSEO_INTRINSIC_NUMBER]);
    }
    if (is_object(*marker)) {
        return normal(context->intrinsics[OSEO_INTRINSIC_NUMBER]);
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
        OseoOrdinaryObject *prototype = ordinary_object(frame.slots[0]);
        prototype->number_data = true;
        prototype->number_value = oseo_number(0.0);
        context->intrinsics[OSEO_INTRINSIC_NUMBER_PROTOTYPE] = frame.slots[0];
        *marker = frame.slots[0];
        result = create_number_function(
            context,
            OSEO_NUMBER_CONSTRUCTOR_CODE_ID,
            "Number",
            1u,
            OSEO_FUNCTION_ORDINARY
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_NUMBER] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_number_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_number_function(
            context,
            OSEO_NUMBER_VALUE_OF_CODE_ID,
            "valueOf",
            0u,
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_number_property(
            context,
            frame.slots[0],
            "valueOf",
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_NUMBER_IS_FINITE,
        OSEO_INTRINSIC_NUMBER_IS_INTEGER,
        OSEO_INTRINSIC_NUMBER_IS_NAN,
        OSEO_INTRINSIC_NUMBER_IS_SAFE_INTEGER,
        OSEO_INTRINSIC_NUMBER_PARSE_FLOAT,
        OSEO_INTRINSIC_NUMBER_PARSE_INT,
    };
    static const size_t method_codes[] = {
        OSEO_NUMBER_IS_FINITE_CODE_ID,
        OSEO_NUMBER_IS_INTEGER_CODE_ID,
        OSEO_NUMBER_IS_NAN_CODE_ID,
        OSEO_NUMBER_IS_SAFE_INTEGER_CODE_ID,
        OSEO_NUMBER_PARSE_FLOAT_CODE_ID,
        OSEO_NUMBER_PARSE_INT_CODE_ID,
    };
    static const char *const method_names[] = {
        "isFinite",
        "isInteger",
        "isNaN",
        "isSafeInteger",
        "parseFloat",
        "parseInt",
    };
    static const size_t method_lengths[] = {1u, 1u, 1u, 1u, 1u, 2u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 6u;
         index += 1u) {
        result = create_number_function(
            context,
            method_codes[index],
            method_names[index],
            method_lengths[index],
            OSEO_FUNCTION_INTERNAL
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[method_intrinsics[index]] = result.value;
            result = define_number_property(
                context,
                frame.slots[1],
                method_names[index],
                result.value,
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    static const char *const constant_names[] = {
        "EPSILON",
        "MAX_SAFE_INTEGER",
        "MAX_VALUE",
        "MIN_SAFE_INTEGER",
        "MIN_VALUE",
        "NaN",
        "NEGATIVE_INFINITY",
        "POSITIVE_INFINITY",
    };
    static const double constant_values[] = {
        DBL_EPSILON,
        OSEO_MAX_SAFE_INTEGER,
        DBL_MAX,
        -OSEO_MAX_SAFE_INTEGER,
        DBL_TRUE_MIN,
        NAN,
        -INFINITY,
        INFINITY,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 8u;
         index += 1u) {
        result = define_number_property(
            context,
            frame.slots[1],
            constant_names[index],
            oseo_number(constant_values[index]),
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_NUMBER_PROTOTYPE;
             index <= OSEO_INTRINSIC_NUMBER_PARSE_INT;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
    } else if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(context->intrinsics[OSEO_INTRINSIC_NUMBER])
        : result;
}

OseoResult oseo_internal_install_number_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_number_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_number_property(
            context,
            slots[0],
            "Number",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(slots[0])
        : result;
}
