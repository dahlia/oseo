#include "runtime_internal.h"

#include <float.h>
#include <math.h>
#include <stdio.h>
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
    object->primitive_data = true;
    object->primitive_value = result.value;
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

/* ---- Exact rational arithmetic for Number.prototype formatting ---- */

/*
 * A non-negative arbitrary-precision integer stored as decimal digits,
 * least-significant digit first. Every formatting method below builds a
 * numerator and denominator of this type from a double's exact mantissa
 * and binary exponent, so toFixed, toExponential, and toPrecision round
 * to the correctly-rounded decimal value instead of drifting through
 * repeated floating-point arithmetic.
 */
typedef struct {
    uint8_t *digits;
    size_t length;
    size_t capacity;
} NumberBignum;

static bool number_bignum_reserve(NumberBignum *bignum, size_t needed) {
    if (needed <= bignum->capacity) return true;
    size_t capacity = bignum->capacity == 0u ? 32u : bignum->capacity;
    while (capacity < needed) capacity *= 2u;
    uint8_t *digits = realloc(bignum->digits, capacity);
    if (digits == NULL) return false;
    bignum->digits = digits;
    bignum->capacity = capacity;
    return true;
}

static void number_bignum_release(NumberBignum *bignum) {
    free(bignum->digits);
    bignum->digits = NULL;
    bignum->length = 0u;
    bignum->capacity = 0u;
}

static void number_bignum_trim(NumberBignum *bignum) {
    while (bignum->length > 1u && bignum->digits[bignum->length - 1u] == 0u) {
        bignum->length -= 1u;
    }
}

static bool number_bignum_from_u64(NumberBignum *bignum, uint64_t value) {
    if (!number_bignum_reserve(bignum, 20u)) return false;
    size_t length = 0u;
    do {
        bignum->digits[length] = (uint8_t)(value % 10u);
        value /= 10u;
        length += 1u;
    } while (value != 0u);
    bignum->length = length;
    return true;
}

static bool number_bignum_copy(
    NumberBignum *destination,
    const NumberBignum *source
) {
    if (!number_bignum_reserve(destination, source->length)) return false;
    memcpy(destination->digits, source->digits, source->length);
    destination->length = source->length;
    return true;
}

static bool number_bignum_is_zero(const NumberBignum *bignum) {
    return bignum->length == 1u && bignum->digits[0] == 0u;
}

static int number_bignum_compare(
    const NumberBignum *left,
    const NumberBignum *right
) {
    if (left->length != right->length) {
        return left->length < right->length ? -1 : 1;
    }
    for (size_t step = left->length; step > 0u; step -= 1u) {
        uint8_t a = left->digits[step - 1u];
        uint8_t b = right->digits[step - 1u];
        if (a != b) return a < b ? -1 : 1;
    }
    return 0;
}

static bool number_bignum_multiply_small(
    NumberBignum *bignum,
    unsigned multiplier
) {
    if (!number_bignum_reserve(bignum, bignum->length + 8u)) return false;
    unsigned carry = 0u;
    size_t length = bignum->length;
    for (size_t index = 0u; index < length; index += 1u) {
        unsigned product = (unsigned)bignum->digits[index] * multiplier +
            carry;
        bignum->digits[index] = (uint8_t)(product % 10u);
        carry = product / 10u;
    }
    while (carry != 0u) {
        if (!number_bignum_reserve(bignum, length + 1u)) return false;
        bignum->digits[length] = (uint8_t)(carry % 10u);
        carry /= 10u;
        length += 1u;
    }
    bignum->length = length;
    number_bignum_trim(bignum);
    return true;
}

/* bignum *= multiplier, both non-negative. Schoolbook long multiply. */
static bool number_bignum_multiply_bignum(
    NumberBignum *bignum,
    const NumberBignum *multiplier
) {
    if (number_bignum_is_zero(bignum) || number_bignum_is_zero(multiplier)) {
        return number_bignum_from_u64(bignum, 0u);
    }
    size_t result_length = bignum->length + multiplier->length;
    uint32_t *accumulator = calloc(result_length, sizeof(uint32_t));
    if (accumulator == NULL) return false;
    for (size_t i = 0u; i < bignum->length; i += 1u) {
        unsigned carry = 0u;
        for (size_t j = 0u; j < multiplier->length; j += 1u) {
            uint32_t product = (uint32_t)bignum->digits[i] *
                (uint32_t)multiplier->digits[j] +
                accumulator[i + j] + carry;
            accumulator[i + j] = product % 10u;
            carry = product / 10u;
        }
        size_t index = i + multiplier->length;
        while (carry != 0u) {
            uint32_t sum = accumulator[index] + carry;
            accumulator[index] = sum % 10u;
            carry = sum / 10u;
            index += 1u;
        }
    }
    if (!number_bignum_reserve(bignum, result_length)) {
        free(accumulator);
        return false;
    }
    for (size_t index = 0u; index < result_length; index += 1u) {
        bignum->digits[index] = (uint8_t)accumulator[index];
    }
    bignum->length = result_length;
    number_bignum_trim(bignum);
    free(accumulator);
    return true;
}

/* bignum += addend, both non-negative. */
static bool number_bignum_add(
    NumberBignum *bignum,
    const NumberBignum *addend
) {
    size_t original_length = bignum->length;
    size_t length = original_length > addend->length
        ? original_length
        : addend->length;
    if (!number_bignum_reserve(bignum, length + 1u)) return false;
    unsigned carry = 0u;
    for (size_t index = 0u; index < length; index += 1u) {
        unsigned a = index < original_length ? bignum->digits[index] : 0u;
        unsigned b = index < addend->length ? addend->digits[index] : 0u;
        unsigned sum = a + b + carry;
        bignum->digits[index] = (uint8_t)(sum % 10u);
        carry = sum / 10u;
    }
    if (carry != 0u) {
        bignum->digits[length] = (uint8_t)carry;
        length += 1u;
    }
    bignum->length = length;
    number_bignum_trim(bignum);
    return true;
}

/* bignum -= subtrahend in place. Requires bignum >= subtrahend. */
static void number_bignum_subtract(
    NumberBignum *bignum,
    const NumberBignum *subtrahend
) {
    int borrow = 0;
    for (size_t index = 0u; index < bignum->length; index += 1u) {
        int a = (int)bignum->digits[index];
        int b = index < subtrahend->length
            ? (int)subtrahend->digits[index]
            : 0;
        int difference = a - b - borrow;
        if (difference < 0) {
            difference += 10;
            borrow = 1;
        } else {
            borrow = 0;
        }
        bignum->digits[index] = (uint8_t)difference;
    }
    number_bignum_trim(bignum);
}

/*
 * Divides bignum in place by a small divisor (2 to 36) and returns the
 * remainder. This is ordinary base-10 long division by a small number, so
 * it stays correct regardless of the divisor's relationship to the
 * decimal storage base, which is what lets it extract a target-radix
 * integer-part digit at a time.
 */
static unsigned number_bignum_divide_small(
    NumberBignum *bignum,
    unsigned divisor
) {
    unsigned remainder = 0u;
    for (size_t step = 0u; step < bignum->length; step += 1u) {
        size_t index = bignum->length - 1u - step;
        unsigned value = remainder * 10u + bignum->digits[index];
        bignum->digits[index] = (uint8_t)(value / divisor);
        remainder = value % divisor;
    }
    number_bignum_trim(bignum);
    return remainder;
}

/*
 * Computes quotient = floor(numerator / denominator) and remainder =
 * numerator - quotient * denominator, by schoolbook long division with
 * denominator's nine multiples precomputed once and reused for every
 * quotient digit. denominator must be nonzero.
 */
static bool number_bignum_divmod(
    const NumberBignum *numerator,
    const NumberBignum *denominator,
    NumberBignum *quotient,
    NumberBignum *remainder
) {
    NumberBignum multiples[10];
    memset(multiples, 0, sizeof(multiples));
    bool ok = number_bignum_from_u64(&multiples[0], 0u);
    for (unsigned digit = 1u; ok && digit <= 9u; digit += 1u) {
        ok = number_bignum_copy(&multiples[digit], &multiples[digit - 1u]) &&
            number_bignum_add(&multiples[digit], denominator);
    }
    size_t capacity = numerator->length;
    uint8_t *quotient_digits = ok ? malloc(capacity) : NULL;
    if (ok && quotient_digits == NULL) ok = false;
    if (ok) ok = number_bignum_from_u64(remainder, 0u);
    for (size_t step = 0u; ok && step < numerator->length; step += 1u) {
        size_t index = numerator->length - 1u - step;
        NumberBignum single = {NULL, 0u, 0u};
        ok = number_bignum_multiply_small(remainder, 10u) &&
            number_bignum_from_u64(&single, numerator->digits[index]) &&
            number_bignum_add(remainder, &single);
        number_bignum_release(&single);
        if (!ok) break;
        unsigned chosen = 0u;
        for (unsigned digit = 9u;; digit -= 1u) {
            if (number_bignum_compare(&multiples[digit], remainder) <= 0) {
                chosen = digit;
                break;
            }
            if (digit == 0u) break;
        }
        if (chosen != 0u) {
            number_bignum_subtract(remainder, &multiples[chosen]);
        }
        quotient_digits[step] = (uint8_t)chosen;
    }
    for (unsigned digit = 0u; digit <= 9u; digit += 1u) {
        number_bignum_release(&multiples[digit]);
    }
    if (ok) {
        ok = number_bignum_reserve(quotient, capacity);
        if (ok) {
            for (size_t index = 0u; index < capacity; index += 1u) {
                quotient->digits[index] =
                    quotient_digits[capacity - 1u - index];
            }
            quotient->length = capacity;
            number_bignum_trim(quotient);
        }
    }
    free(quotient_digits);
    return ok;
}

static size_t number_bignum_digit_string(
    const NumberBignum *bignum,
    char *out
) {
    for (size_t index = 0u; index < bignum->length; index += 1u) {
        out[index] = (char)('0' + bignum->digits[bignum->length - 1u - index]);
    }
    return bignum->length;
}

/*
 * Decomposes a finite value >= 0 into an exact mantissa and binary
 * exponent: value == (double)mantissa * exp2(exponent). frexp/ldexp
 * handle subnormals, so this stays exact at every magnitude a double can
 * hold, including Number.MIN_VALUE.
 */
static uint64_t number_decompose(double value, int *exponent) {
    if (value == 0.0) {
        *exponent = 0;
        return 0u;
    }
    int raw_exponent;
    double fraction = frexp(value, &raw_exponent);
    uint64_t mantissa = (uint64_t)ldexp(fraction, 53);
    *exponent = raw_exponent - 53;
    while (mantissa != 0u && (mantissa & 1u) == 0u) {
        mantissa >>= 1;
        *exponent += 1;
    }
    return mantissa;
}

/*
 * Builds numerator/denominator bignums whose exact ratio is
 * value * 10^decimal_shift, for a finite value >= 0. toFixed scales by
 * 10^fractionDigits; toExponential and toPrecision scale by
 * 10^(precision - 1 - exponent).
 */
static bool number_scaled_ratio(
    double value,
    int decimal_shift,
    NumberBignum *numerator,
    NumberBignum *denominator
) {
    int exponent;
    uint64_t mantissa = number_decompose(value, &exponent);
    bool ok = number_bignum_from_u64(numerator, mantissa) &&
        number_bignum_from_u64(denominator, 1u);
    for (int step = 0; ok && step < exponent; step += 1) {
        ok = number_bignum_multiply_small(numerator, 2u);
    }
    for (int step = 0; ok && step < -exponent; step += 1) {
        ok = number_bignum_multiply_small(denominator, 2u);
    }
    for (int step = 0; ok && step < decimal_shift; step += 1) {
        ok = number_bignum_multiply_small(numerator, 10u);
    }
    for (int step = 0; ok && step < -decimal_shift; step += 1) {
        ok = number_bignum_multiply_small(denominator, 10u);
    }
    return ok;
}

/*
 * Computes n = round(value * 10^decimal_shift) as an exact bignum, with
 * ties broken away from zero, matching the toFixed, toExponential, and
 * toPrecision rounding rule: "as close to zero as possible; if there are
 * two such n, pick the larger n". value must be finite and non-negative.
 */
static bool number_round_scaled(
    double value,
    int decimal_shift,
    NumberBignum *rounded
) {
    NumberBignum numerator = {NULL, 0u, 0u};
    NumberBignum denominator = {NULL, 0u, 0u};
    NumberBignum quotient = {NULL, 0u, 0u};
    NumberBignum remainder = {NULL, 0u, 0u};
    bool ok = number_scaled_ratio(
        value,
        decimal_shift,
        &numerator,
        &denominator
    );
    if (ok) {
        ok = number_bignum_divmod(
            &numerator,
            &denominator,
            &quotient,
            &remainder
        );
    }
    if (ok) {
        NumberBignum doubled = {NULL, 0u, 0u};
        ok = number_bignum_copy(&doubled, &remainder) &&
            number_bignum_multiply_small(&doubled, 2u);
        if (ok && number_bignum_compare(&doubled, &denominator) >= 0) {
            NumberBignum one = {NULL, 0u, 0u};
            ok = number_bignum_from_u64(&one, 1u) &&
                number_bignum_add(&quotient, &one);
            number_bignum_release(&one);
        }
        number_bignum_release(&doubled);
    }
    if (ok) ok = number_bignum_copy(rounded, &quotient);
    number_bignum_release(&numerator);
    number_bignum_release(&denominator);
    number_bignum_release(&quotient);
    number_bignum_release(&remainder);
    return ok;
}

static bool number_bignum_pow10(NumberBignum *out, int exponent) {
    bool ok = number_bignum_from_u64(out, 1u);
    for (int step = 0; ok && step < exponent; step += 1) {
        ok = number_bignum_multiply_small(out, 10u);
    }
    return ok;
}

/*
 * Finds the unique integer e for which 10^e <= magnitude < 10^(e + 1),
 * for a finite magnitude > 0. A floating-point log10 estimate only seeds
 * the search: every candidate is confirmed by exact bignum cross-
 * multiplication (10^e * denominator against numerator) rather than
 * trusted, because log10 can read on the wrong side of a power-of-ten
 * boundary by a margin far smaller than double precision resolves.
 */
static bool number_exact_decimal_exponent(double magnitude, int *out_e) {
    NumberBignum numerator = {NULL, 0u, 0u};
    NumberBignum denominator = {NULL, 0u, 0u};
    bool ok = number_scaled_ratio(magnitude, 0, &numerator, &denominator);
    int e = (int)floor(log10(magnitude));
    for (int attempt = 0; ok && attempt < 64; attempt += 1) {
        /*
         * Test 10^e <= numerator / denominator < 10^(e + 1) without
         * division. A non-negative e scales the two bounds by the
         * denominator; a negative one instead scales the numerator by
         * 10^-e, which turns the same test into
         * denominator <= numerator * 10^-e < denominator * 10.
         */
        NumberBignum low = {NULL, 0u, 0u};
        NumberBignum high = {NULL, 0u, 0u};
        NumberBignum scaled = {NULL, 0u, 0u};
        if (e >= 0) {
            ok = number_bignum_pow10(&low, e) &&
                number_bignum_multiply_bignum(&low, &denominator) &&
                number_bignum_pow10(&high, e + 1) &&
                number_bignum_multiply_bignum(&high, &denominator) &&
                number_bignum_copy(&scaled, &numerator);
        } else {
            ok = number_bignum_copy(&low, &denominator) &&
                number_bignum_copy(&high, &denominator) &&
                number_bignum_multiply_small(&high, 10u) &&
                number_bignum_pow10(&scaled, -e) &&
                number_bignum_multiply_bignum(&scaled, &numerator);
        }
        bool too_low = ok && number_bignum_compare(&scaled, &low) < 0;
        bool too_high = ok && !too_low &&
            number_bignum_compare(&scaled, &high) >= 0;
        number_bignum_release(&low);
        number_bignum_release(&high);
        number_bignum_release(&scaled);
        if (!ok) break;
        if (too_low) {
            e -= 1;
        } else if (too_high) {
            e += 1;
        } else {
            break;
        }
    }
    number_bignum_release(&numerator);
    number_bignum_release(&denominator);
    *out_e = e;
    return ok;
}

/*
 * Computes p significant decimal digits of a positive, finite magnitude
 * and the decimal exponent e of its leading digit, such that
 * digit_buffer[0..p) interpreted as an integer, times 10^(e - p + 1), is
 * the correctly-rounded value. Shared by toExponential's fixed-precision
 * branch and toPrecision. e is found exactly first (never guessed from a
 * digit count after rounding, which a power-of-ten boundary can make
 * self-consistently wrong on either side); the one remaining case is
 * rounding carrying p nines up to a leading 1 followed by zeros, which
 * simply moves e up by one and truncates the known result.
 */
static bool number_significant_digits(
    double magnitude,
    int p,
    char digit_buffer[128],
    int *out_e
) {
    int e;
    if (!number_exact_decimal_exponent(magnitude, &e)) return false;
    NumberBignum rounded = {NULL, 0u, 0u};
    bool ok = number_round_scaled(magnitude, p - 1 - e, &rounded);
    size_t count = ok ? number_bignum_digit_string(&rounded, digit_buffer) : 0u;
    number_bignum_release(&rounded);
    if (!ok) return false;
    if ((int)count == p + 1) {
        e += 1;
        digit_buffer[0] = '1';
        for (int index = 1; index < p; index += 1) digit_buffer[index] = '0';
        count = (size_t)p;
    }
    *out_e = e;
    return count == (size_t)p;
}

static const char number_radix_digit_glyphs[37] =
    "0123456789abcdefghijklmnopqrstuvwxyz";

/*
 * Formats a finite, non-negative value in the given radix (2 to 36), the
 * way Number::toString's specification note permits its decimal algorithm
 * to generalize. The integer part is always exact. The fractional part
 * emits only the digits the double actually carries: the remaining tail
 * advances alongside the distance to the rounding boundary, and the loop
 * stops once the tail no longer exceeds it, raising the final digit when
 * ordinary rounding selects it and the raised value still names this same
 * double. Every quantity is an exact bignum rational over one shared
 * power-of-two denominator, so a radix whose expansion never terminates
 * stops at a digit string that reads back as this double rather than
 * running to the buffer limit.
 *
 * This is the round-trip stopping rule, not a shortest-string search: a
 * shorter string that also reads back can exist when ordinary rounding
 * does not select the raised digit, and the tie test looks at the final
 * digit rather than the parity of the whole coefficient, which are the
 * same only in an even radix. ECMA-262 leaves a non-decimal radix
 * implementation-approximated, and both choices match the decimal
 * algorithm this generalizes.
 */
static bool number_radix_text(
    double magnitude,
    unsigned radix,
    char *output,
    size_t capacity,
    size_t *length
) {
    int exponent;
    uint64_t mantissa = number_decompose(magnitude, &exponent);
    /*
     * The digits may stop as soon as they name this double rather than a
     * neighbor, so the budget is the distance to the rounding boundary on
     * each side: half the gap to the next double above, and half the gap
     * to the one below. The two differ, because a power of two sits twice
     * as far from its upper neighbor as from its lower one, so one shared
     * budget would let a truncation cross the lower boundary. Truncating
     * spends the lower budget and rounding up spends the upper one.
     *
     * Both gaps are exact powers of two, and only their exponents are
     * used, so halving them here cannot underflow the way the value
     * itself would at the smallest denormal. The gap above overflows to
     * infinity only at the largest finite value, whose neighbor below is
     * the same distance away.
     */
    double upper_gap = nextafter(magnitude, INFINITY) - magnitude;
    double lower_gap = magnitude - nextafter(magnitude, 0.0);
    if (!isfinite(upper_gap) || !(upper_gap > 0.0)) upper_gap = lower_gap;
    if (!(lower_gap > 0.0)) lower_gap = upper_gap;
    int upper_exponent = 0;
    int lower_exponent = 0;
    uint64_t upper_mantissa = number_decompose(upper_gap, &upper_exponent);
    uint64_t lower_mantissa = number_decompose(lower_gap, &lower_exponent);
    upper_exponent -= 1;
    lower_exponent -= 1;
    int fraction_bits = exponent < 0 ? -exponent : 0;
    int shared_bits = fraction_bits;
    if (upper_exponent < 0 && -upper_exponent > shared_bits) {
        shared_bits = -upper_exponent;
    }
    if (lower_exponent < 0 && -lower_exponent > shared_bits) {
        shared_bits = -lower_exponent;
    }

    NumberBignum integer_value = {NULL, 0u, 0u};
    NumberBignum fraction = {NULL, 0u, 0u};
    NumberBignum upper_budget = {NULL, 0u, 0u};
    NumberBignum lower_budget = {NULL, 0u, 0u};
    NumberBignum denominator = {NULL, 0u, 0u};
    bool ok = number_bignum_from_u64(&integer_value, mantissa) &&
        number_bignum_from_u64(&fraction, 0u) &&
        number_bignum_from_u64(&denominator, 1u);
    for (int step = 0; ok && step < shared_bits; step += 1) {
        ok = number_bignum_multiply_small(&denominator, 2u);
    }
    if (ok && exponent >= 0) {
        for (int step = 0; ok && step < exponent; step += 1) {
            ok = number_bignum_multiply_small(&integer_value, 2u);
        }
    } else if (ok) {
        NumberBignum split = {NULL, 0u, 0u};
        NumberBignum quotient = {NULL, 0u, 0u};
        ok = number_bignum_from_u64(&split, 1u);
        for (int step = 0; ok && step < fraction_bits; step += 1) {
            ok = number_bignum_multiply_small(&split, 2u);
        }
        if (ok) {
            ok = number_bignum_divmod(
                &integer_value,
                &split,
                &quotient,
                &fraction
            );
        }
        if (ok) ok = number_bignum_copy(&integer_value, &quotient);
        /* Restate the fraction over the shared denominator. */
        for (int step = 0; ok && step < shared_bits - fraction_bits;
             step += 1) {
            ok = number_bignum_multiply_small(&fraction, 2u);
        }
        number_bignum_release(&split);
        number_bignum_release(&quotient);
    }
    if (ok) ok = number_bignum_from_u64(&upper_budget, upper_mantissa);
    for (int step = 0; ok && step < shared_bits + upper_exponent; step += 1) {
        ok = number_bignum_multiply_small(&upper_budget, 2u);
    }
    if (ok) ok = number_bignum_from_u64(&lower_budget, lower_mantissa);
    for (int step = 0; ok && step < shared_bits + lower_exponent; step += 1) {
        ok = number_bignum_multiply_small(&lower_budget, 2u);
    }

    char fraction_digits[1200];
    size_t fraction_digit_count = 0u;
    bool carry = false;
    if (ok && !number_bignum_is_zero(&fraction)) {
        NumberBignum multiples[36];
        memset(multiples, 0, sizeof(multiples));
        for (unsigned digit = 0u; ok && digit < radix; digit += 1u) {
            if (digit == 0u) {
                ok = number_bignum_from_u64(&multiples[0], 0u);
            } else {
                ok = number_bignum_copy(
                        &multiples[digit],
                        &multiples[digit - 1u]
                    ) &&
                    number_bignum_add(&multiples[digit], &denominator);
            }
        }
        while (ok) {
            if (fraction_digit_count >= sizeof(fraction_digits)) {
                ok = false;
                break;
            }
            ok = number_bignum_multiply_small(&fraction, radix) &&
                number_bignum_multiply_small(&upper_budget, radix) &&
                number_bignum_multiply_small(&lower_budget, radix);
            if (!ok) break;
            unsigned digit = 0u;
            for (unsigned candidate = radix - 1u;; candidate -= 1u) {
                if (number_bignum_compare(
                        &multiples[candidate],
                        &fraction
                    ) <= 0) {
                    digit = candidate;
                    break;
                }
                if (candidate == 0u) break;
            }
            if (digit != 0u) {
                number_bignum_subtract(&fraction, &multiples[digit]);
            }
            fraction_digits[fraction_digit_count] =
                number_radix_digit_glyphs[digit];
            fraction_digit_count += 1u;
            NumberBignum twice = {NULL, 0u, 0u};
            ok = number_bignum_copy(&twice, &fraction) &&
                number_bignum_multiply_small(&twice, 2u);
            int against_half = ok
                ? number_bignum_compare(&twice, &denominator)
                : 0;
            number_bignum_release(&twice);
            if (!ok) break;
            if (against_half > 0 ||
                (against_half == 0 && (digit & 1u) != 0u)) {
                NumberBignum raised = {NULL, 0u, 0u};
                ok = number_bignum_copy(&raised, &fraction) &&
                    number_bignum_add(&raised, &upper_budget);
                bool inside = ok &&
                    number_bignum_compare(&raised, &denominator) > 0;
                number_bignum_release(&raised);
                if (!ok) break;
                if (inside) {
                    /* Round up, carrying through the emitted digits and,
                     * if every one of them overflows, into the integer. */
                    carry = true;
                    while (fraction_digit_count > 0u) {
                        char glyph =
                            fraction_digits[fraction_digit_count - 1u];
                        unsigned value = glyph <= '9'
                            ? (unsigned)(glyph - '0')
                            : (unsigned)(glyph - 'a') + 10u;
                        if (value + 1u < radix) {
                            fraction_digits[fraction_digit_count - 1u] =
                                number_radix_digit_glyphs[value + 1u];
                            carry = false;
                            break;
                        }
                        fraction_digit_count -= 1u;
                    }
                    break;
                }
            }
            if (number_bignum_compare(&fraction, &lower_budget) < 0) break;
        }
        for (unsigned digit = 0u; digit < radix; digit += 1u) {
            number_bignum_release(&multiples[digit]);
        }
        while (fraction_digit_count > 0u &&
               fraction_digits[fraction_digit_count - 1u] == '0') {
            fraction_digit_count -= 1u;
        }
    }
    if (ok && carry) {
        NumberBignum one = {NULL, 0u, 0u};
        ok = number_bignum_from_u64(&one, 1u) &&
            number_bignum_add(&integer_value, &one);
        number_bignum_release(&one);
    }
    char integer_digits[1200];
    size_t integer_digit_count = 0u;
    if (ok && number_bignum_is_zero(&integer_value)) {
        integer_digits[0] = '0';
        integer_digit_count = 1u;
    }
    while (ok && !number_bignum_is_zero(&integer_value)) {
        if (integer_digit_count >= sizeof(integer_digits)) {
            ok = false;
            break;
        }
        unsigned digit = number_bignum_divide_small(&integer_value, radix);
        integer_digits[integer_digit_count] =
            number_radix_digit_glyphs[digit];
        integer_digit_count += 1u;
    }
    number_bignum_release(&integer_value);
    number_bignum_release(&fraction);
    number_bignum_release(&upper_budget);
    number_bignum_release(&lower_budget);
    number_bignum_release(&denominator);
    if (!ok) return false;
    size_t total = integer_digit_count +
        (fraction_digit_count > 0u ? 1u + fraction_digit_count : 0u);
    if (total >= capacity) return false;
    size_t position = 0u;
    for (size_t index = 0u; index < integer_digit_count; index += 1u) {
        output[position] = integer_digits[integer_digit_count - 1u - index];
        position += 1u;
    }
    if (fraction_digit_count > 0u) {
        output[position] = '.';
        position += 1u;
        memcpy(output + position, fraction_digits, fraction_digit_count);
        position += fraction_digit_count;
    }
    *length = position;
    return true;
}

/* Assembles "d[.ddd]e[+-]EE" from already-computed significant digits. */
static bool number_format_exponential_digits(
    const char *digit_buffer,
    size_t digit_count,
    int e,
    char *text,
    size_t capacity,
    size_t *length
) {
    size_t position = 0u;
    if (capacity < 1u) return false;
    text[position] = digit_buffer[0];
    position += 1u;
    if (digit_count > 1u) {
        if (position + 1u + (digit_count - 1u) > capacity) return false;
        text[position] = '.';
        position += 1u;
        memcpy(text + position, digit_buffer + 1u, digit_count - 1u);
        position += digit_count - 1u;
    }
    if (position + 2u > capacity) return false;
    text[position] = 'e';
    position += 1u;
    text[position] = e < 0 ? '-' : '+';
    position += 1u;
    char exponent_text[16];
    int written = snprintf(
        exponent_text,
        sizeof(exponent_text),
        "%d",
        e < 0 ? -e : e
    );
    if (written < 0 || position + (size_t)written > capacity) return false;
    memcpy(text + position, exponent_text, (size_t)written);
    position += (size_t)written;
    *length = position;
    return true;
}

/*
 * Computes the exponential-notation body (without sign) for toExponential:
 * value 0 formats as fractionDigits (or one) zero digits with exponent 0;
 * a defined fractionDigits rounds to f + 1 significant digits; an
 * undefined fractionDigits reuses the shortest round-trip decimal digits,
 * matching the "as small a p as possible" free-precision rule.
 */
static bool number_format_exponential(
    double magnitude,
    bool fraction_digits_defined,
    int f,
    char *text,
    size_t capacity,
    size_t *length
) {
    char digit_buffer[128];
    size_t digit_count;
    int e;
    if (magnitude == 0.0) {
        digit_count = fraction_digits_defined ? (size_t)f + 1u : 1u;
        for (size_t index = 0u; index < digit_count; index += 1u) {
            digit_buffer[index] = '0';
        }
        e = 0;
    } else if (fraction_digits_defined) {
        int p = f + 1;
        if (!number_significant_digits(magnitude, p, digit_buffer, &e)) {
            return false;
        }
        digit_count = (size_t)p;
    } else {
        char shortest[18];
        size_t count;
        int exponent;
        oseo_internal_number_shortest_digits(
            magnitude,
            shortest,
            &count,
            &exponent
        );
        memcpy(digit_buffer, shortest, count);
        digit_count = count;
        e = exponent - 1;
    }
    return number_format_exponential_digits(
        digit_buffer,
        digit_count,
        e,
        text,
        capacity,
        length
    );
}

static OseoResult number_allocate_ascii(
    OseoContext *context,
    const char *text,
    size_t length
) {
    uint16_t units[2400];
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Number formatting overflowed.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_internal_allocate_string(context, units, length);
}

/* thisNumberValue (21.1.3), the [[NumberData]] receiver brand check
 * shared by valueOf and every formatting method below. */
static OseoResult number_this_value(OseoContext *context, OseoValue receiver) {
    if (is_number(receiver)) return normal(receiver);
    if (is_object(receiver) && ordinary_object(receiver)->number_data) {
        return normal(ordinary_object(receiver)->number_value);
    }
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Number.prototype method requires a Number receiver."
    );
}

/* ToIntegerOrInfinity over one already rooted input value. */
static OseoResult number_integer_or_infinity(
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

/* Number.prototype.toString ( [ radix ] ), 21.1.3.6. */
static OseoResult number_to_string(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = number_this_value(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    double x = number_value(frame.slots[1]);
    OseoValue radix_argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    int radix = 10;
    if (tag_of(radix_argument) != OSEO_TAG_UNDEFINED) {
        result = number_integer_or_infinity(context, radix_argument);
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
        double radix_value = number_value(result.value);
        if (!(radix_value >= 2.0 && radix_value <= 36.0)) {
            oseo_roots_release(context, &frame);
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "Number.prototype.toString radix must be within 2..36."
            );
        }
        radix = (int)radix_value;
    }
    oseo_roots_release(context, &frame);
    char text[2400];
    if (radix == 10) {
        (void)oseo_internal_number_text(x, text, sizeof(text));
        return number_allocate_ascii(context, text, strlen(text));
    }
    if (isnan(x)) return number_allocate_ascii(context, "NaN", 3u);
    if (isinf(x)) {
        const char *infinity = signbit(x) ? "-Infinity" : "Infinity";
        return number_allocate_ascii(context, infinity, strlen(infinity));
    }
    bool negative = signbit(x) && x != 0.0;
    double magnitude = negative ? -x : x;
    size_t position = 0u;
    if (negative) {
        text[position] = '-';
        position += 1u;
    }
    size_t length = 0u;
    if (!number_radix_text(
            magnitude,
            (unsigned)radix,
            text + position,
            sizeof(text) - position,
            &length
        )) {
        return failure(context, "OSEO2001", "Number formatting failed.");
    }
    return number_allocate_ascii(context, text, position + length);
}

/* Number.prototype.toFixed ( fractionDigits ), 21.1.3.3. */
static OseoResult number_to_fixed(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = number_this_value(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    double x = number_value(frame.slots[1]);
    OseoValue digits_argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    double f_value = 0.0;
    if (tag_of(digits_argument) != OSEO_TAG_UNDEFINED) {
        result = number_integer_or_infinity(context, digits_argument);
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
        f_value = number_value(result.value);
        if (!(f_value >= 0.0 && f_value <= 100.0)) {
            oseo_roots_release(context, &frame);
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "Number.prototype.toFixed digit count must be within "
                "0..100."
            );
        }
    }
    oseo_roots_release(context, &frame);
    int f = (int)f_value;
    if (isnan(x)) return number_allocate_ascii(context, "NaN", 3u);
    char text[256];
    size_t position = 0u;
    bool negative = x < 0.0;
    double magnitude = negative ? -x : x;
    if (negative) {
        text[position] = '-';
        position += 1u;
    }
    if (magnitude >= 1e21) {
        char decimal[64];
        (void)oseo_internal_number_text(magnitude, decimal, sizeof(decimal));
        size_t length = strlen(decimal);
        memcpy(text + position, decimal, length);
        position += length;
        return number_allocate_ascii(context, text, position);
    }
    NumberBignum rounded = {NULL, 0u, 0u};
    if (!number_round_scaled(magnitude, f, &rounded)) {
        return failure(context, "OSEO2001", "Number formatting failed.");
    }
    char digits[128];
    size_t digit_count = number_bignum_digit_string(&rounded, digits);
    number_bignum_release(&rounded);
    size_t pad = (f > 0 && digit_count <= (size_t)f)
        ? ((size_t)f + 1u - digit_count)
        : 0u;
    char m[160];
    size_t m_length = 0u;
    for (size_t index = 0u; index < pad; index += 1u) {
        m[m_length] = '0';
        m_length += 1u;
    }
    memcpy(m + m_length, digits, digit_count);
    m_length += digit_count;
    if (f == 0) {
        memcpy(text + position, m, m_length);
        position += m_length;
    } else {
        size_t a_length = m_length - (size_t)f;
        memcpy(text + position, m, a_length);
        position += a_length;
        text[position] = '.';
        position += 1u;
        memcpy(text + position, m + a_length, (size_t)f);
        position += (size_t)f;
    }
    return number_allocate_ascii(context, text, position);
}

/* Number.prototype.toExponential ( fractionDigits ), 21.1.3.2. */
static OseoResult number_to_exponential(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = number_this_value(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    double x = number_value(frame.slots[1]);
    OseoValue digits_argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    bool digits_defined = tag_of(digits_argument) != OSEO_TAG_UNDEFINED;
    double f_value = 0.0;
    if (digits_defined) {
        result = number_integer_or_infinity(context, digits_argument);
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_release(context, &frame);
            return result;
        }
        f_value = number_value(result.value);
    }
    oseo_roots_release(context, &frame);
    if (isnan(x)) return number_allocate_ascii(context, "NaN", 3u);
    bool negative = x < 0.0;
    double magnitude = negative ? -x : x;
    if (isinf(magnitude)) {
        const char *infinity = negative ? "-Infinity" : "Infinity";
        return number_allocate_ascii(context, infinity, strlen(infinity));
    }
    if (digits_defined && !(f_value >= 0.0 && f_value <= 100.0)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Number.prototype.toExponential digit count must be within "
            "0..100."
        );
    }
    int f = (int)f_value;
    char text[160];
    size_t position = 0u;
    if (negative) {
        text[position] = '-';
        position += 1u;
    }
    size_t length = 0u;
    if (!number_format_exponential(
            magnitude,
            digits_defined,
            f,
            text + position,
            sizeof(text) - position,
            &length
        )) {
        return failure(context, "OSEO2001", "Number formatting failed.");
    }
    return number_allocate_ascii(context, text, position + length);
}

/* Number.prototype.toPrecision ( precision ), 21.1.3.5. */
static OseoResult number_to_precision(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = number_this_value(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    double x = number_value(frame.slots[1]);
    OseoValue precision_argument = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (tag_of(precision_argument) == OSEO_TAG_UNDEFINED) {
        oseo_roots_release(context, &frame);
        char text[64];
        (void)oseo_internal_number_text(x, text, sizeof(text));
        return number_allocate_ascii(context, text, strlen(text));
    }
    result = number_integer_or_infinity(context, precision_argument);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    double p_value = number_value(result.value);
    oseo_roots_release(context, &frame);
    if (isnan(x)) return number_allocate_ascii(context, "NaN", 3u);
    bool negative = x < 0.0;
    double magnitude = negative ? -x : x;
    if (isinf(magnitude)) {
        const char *infinity = negative ? "-Infinity" : "Infinity";
        return number_allocate_ascii(context, infinity, strlen(infinity));
    }
    if (!(p_value >= 1.0 && p_value <= 100.0)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Number.prototype.toPrecision precision must be within "
            "1..100."
        );
    }
    int p = (int)p_value;
    char digit_buffer[128];
    int e = 0;
    if (magnitude == 0.0) {
        for (int index = 0; index < p; index += 1) digit_buffer[index] = '0';
    } else if (!number_significant_digits(magnitude, p, digit_buffer, &e)) {
        return failure(context, "OSEO2001", "Number formatting failed.");
    }
    char text[256];
    size_t position = 0u;
    if (negative) {
        text[position] = '-';
        position += 1u;
    }
    if (e < -6 || e >= p) {
        size_t length = 0u;
        if (!number_format_exponential_digits(
                digit_buffer,
                (size_t)p,
                e,
                text + position,
                sizeof(text) - position,
                &length
            )) {
            return failure(context, "OSEO2001", "Number formatting failed.");
        }
        position += length;
    } else {
        int decimal_position = e + 1;
        if (decimal_position <= 0) {
            text[position] = '0';
            position += 1u;
            text[position] = '.';
            position += 1u;
            for (int index = 0; index < -decimal_position; index += 1) {
                text[position] = '0';
                position += 1u;
            }
            memcpy(text + position, digit_buffer, (size_t)p);
            position += (size_t)p;
        } else {
            memcpy(text + position, digit_buffer, (size_t)decimal_position);
            position += (size_t)decimal_position;
            if (decimal_position < p) {
                text[position] = '.';
                position += 1u;
                memcpy(
                    text + position,
                    digit_buffer + decimal_position,
                    (size_t)(p - decimal_position)
                );
                position += (size_t)(p - decimal_position);
            }
        }
    }
    return number_allocate_ascii(context, text, position);
}

/*
 * Number.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] ),
 * 21.1.3.4. Without the ECMA-402 Internationalization API, the base
 * specification's own recommended behavior is thisNumberValue followed by
 * ToString: the reserved parameter positions are ignored entirely rather
 * than read or coerced.
 */
static OseoResult number_to_locale_string(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult result = number_this_value(context, receiver);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    char text[64];
    (void)oseo_internal_number_text(
        number_value(result.value),
        text,
        sizeof(text)
    );
    return number_allocate_ascii(context, text, strlen(text));
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
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Number method is not a constructor."
        );
    }
    if (code_id == OSEO_NUMBER_VALUE_OF_CODE_ID) {
        return number_this_value(context, receiver);
    }
    if (code_id == OSEO_NUMBER_TO_STRING_CODE_ID) {
        return number_to_string(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_NUMBER_TO_FIXED_CODE_ID) {
        return number_to_fixed(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_NUMBER_TO_EXPONENTIAL_CODE_ID) {
        return number_to_exponential(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_NUMBER_TO_PRECISION_CODE_ID) {
        return number_to_precision(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_NUMBER_TO_LOCALE_STRING_CODE_ID) {
        return number_to_locale_string(context, receiver);
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
        prototype->primitive_data = true;
        prototype->primitive_value = oseo_number(0.0);
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_number_function(
            context,
            OSEO_NUMBER_TO_STRING_CODE_ID,
            "toString",
            1u,
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_number_property(
            context,
            frame.slots[0],
            "toString",
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const size_t prototype_method_codes[] = {
        OSEO_NUMBER_TO_FIXED_CODE_ID,
        OSEO_NUMBER_TO_EXPONENTIAL_CODE_ID,
        OSEO_NUMBER_TO_PRECISION_CODE_ID,
        OSEO_NUMBER_TO_LOCALE_STRING_CODE_ID,
    };
    static const char *const prototype_method_names[] = {
        "toFixed",
        "toExponential",
        "toPrecision",
        "toLocaleString",
    };
    static const size_t prototype_method_lengths[] = {1u, 1u, 1u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 4u;
         index += 1u) {
        result = create_number_function(
            context,
            prototype_method_codes[index],
            prototype_method_names[index],
            prototype_method_lengths[index],
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_number_property(
                context,
                frame.slots[0],
                prototype_method_names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
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
