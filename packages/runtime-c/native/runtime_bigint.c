#include "runtime_internal.h"

#include <float.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

/*
 * Exact BigInt primitives. Limbs use 30 value bits so every product,
 * accumulated carry, and shift intermediate fits in uint64_t on each target.
 */

#define BIGINT_BITS 30u
#define BIGINT_BASE (UINT32_C(1) << BIGINT_BITS)
#define BIGINT_MASK (BIGINT_BASE - UINT32_C(1))
#define BIGINT_MAX_BITS ((size_t)UINT32_C(65536))
#define BIGINT_MAX_LIMBS \
    ((BIGINT_MAX_BITS + (size_t)BIGINT_BITS - 1u) / (size_t)BIGINT_BITS)

typedef struct {
    uint32_t *limbs;
    size_t length;
} Magnitude;

static size_t magnitude_bits(const uint32_t *limbs, size_t length);

static size_t normalized_length(const uint32_t *limbs, size_t length) {
    while (length > 1u && limbs[length - 1u] == 0u) length -= 1u;
    return length;
}

static bool checked_limb_bytes(size_t length, size_t *bytes) {
    if (length == 0u ||
        length > (SIZE_MAX - sizeof(OseoBigInt)) / sizeof(uint32_t)) {
        return false;
    }
    *bytes = sizeof(OseoBigInt) + length * sizeof(uint32_t);
    return true;
}

static uint32_t *allocate_limbs(
    OseoContext *context,
    size_t length,
    bool clear
) {
    if (length == 0u || length > SIZE_MAX / sizeof(uint32_t)) return NULL;
    size_t bytes = length * sizeof(uint32_t);
    uint32_t *limbs = oseo_internal_allocate_heap_bytes(context, bytes);
    if (limbs != NULL && clear) memset(limbs, 0, bytes);
    return limbs;
}

static OseoResult allocation_failure(OseoContext *context) {
    return failure(context, "OSEO2001", "BigInt allocation failed.");
}

static OseoResult bigint_limit_error(OseoContext *context) {
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_RANGE,
        "BigInt exceeds the 65,536-bit implementation limit."
    );
}

static OseoResult publish_bigint(
    OseoContext *context,
    bool negative,
    const uint32_t *limbs,
    size_t length
) {
    length = normalized_length(limbs, length);
    if (length == 1u && limbs[0] == 0u) negative = false;
    if (magnitude_bits(limbs, length) > BIGINT_MAX_BITS) {
        return bigint_limit_error(context);
    }
    size_t bytes;
    if (!checked_limb_bytes(length, &bytes)) {
        return failure(context, "OSEO2001", "BigInt is too large.");
    }
    OseoBigInt *integer = oseo_internal_allocate_heap_bytes(context, bytes);
    if (integer == NULL) return allocation_failure(context);
    integer->negative = negative;
    integer->length = length;
    memcpy(integer->limbs, limbs, length * sizeof(uint32_t));
    return oseo_internal_publish_heap(
        context,
        &integer->header,
        OSEO_HEAP_BIGINT
    );
}

static OseoResult small_bigint(
    OseoContext *context,
    bool negative,
    uint32_t value
) {
    uint32_t limb = value;
    return publish_bigint(context, negative, &limb, 1u);
}

static int compare_magnitude(
    const uint32_t *left,
    size_t left_length,
    const uint32_t *right,
    size_t right_length
) {
    left_length = normalized_length(left, left_length);
    right_length = normalized_length(right, right_length);
    if (left_length < right_length) return -1;
    if (left_length > right_length) return 1;
    for (size_t index = left_length; index > 0u; index -= 1u) {
        uint32_t left_limb = left[index - 1u];
        uint32_t right_limb = right[index - 1u];
        if (left_limb < right_limb) return -1;
        if (left_limb > right_limb) return 1;
    }
    return 0;
}

static Magnitude add_magnitude(
    OseoContext *context,
    const OseoBigInt *left,
    const OseoBigInt *right
) {
    size_t length = left->length > right->length
        ? left->length
        : right->length;
    if (length == SIZE_MAX) return (Magnitude){NULL, 0u};
    uint32_t *result = allocate_limbs(context, length + 1u, true);
    if (result == NULL) return (Magnitude){NULL, 0u};
    uint64_t carry = 0u;
    for (size_t index = 0u; index < length; index += 1u) {
        uint64_t sum = carry;
        if (index < left->length) sum += left->limbs[index];
        if (index < right->length) sum += right->limbs[index];
        result[index] = (uint32_t)(sum & BIGINT_MASK);
        carry = sum >> BIGINT_BITS;
    }
    result[length] = (uint32_t)carry;
    return (Magnitude){result, normalized_length(result, length + 1u)};
}

/* Requires |left| >= |right|. */
static Magnitude subtract_magnitude(
    OseoContext *context,
    const uint32_t *left,
    size_t left_length,
    const uint32_t *right,
    size_t right_length
) {
    uint32_t *result = allocate_limbs(context, left_length, true);
    if (result == NULL) return (Magnitude){NULL, 0u};
    uint64_t borrow = 0u;
    for (size_t index = 0u; index < left_length; index += 1u) {
        uint64_t left_limb = left[index];
        uint64_t right_limb = index < right_length ? right[index] : 0u;
        uint64_t needed = right_limb + borrow;
        if (left_limb < needed) {
            result[index] =
                (uint32_t)(left_limb + BIGINT_BASE - needed);
            borrow = 1u;
        } else {
            result[index] = (uint32_t)(left_limb - needed);
            borrow = 0u;
        }
    }
    return (Magnitude){
        result,
        normalized_length(result, left_length),
    };
}

static Magnitude multiply_magnitude(
    OseoContext *context,
    const OseoBigInt *left,
    const OseoBigInt *right
) {
    if (left->length > SIZE_MAX - right->length) {
        return (Magnitude){NULL, 0u};
    }
    size_t length = left->length + right->length;
    uint32_t *result = allocate_limbs(context, length, true);
    if (result == NULL) return (Magnitude){NULL, 0u};
    for (size_t left_index = 0u;
         left_index < left->length;
         left_index += 1u) {
        uint64_t carry = 0u;
        for (size_t right_index = 0u;
             right_index < right->length;
             right_index += 1u) {
            size_t index = left_index + right_index;
            uint64_t product =
                (uint64_t)left->limbs[left_index] *
                (uint64_t)right->limbs[right_index] +
                result[index] + carry;
            result[index] = (uint32_t)(product & BIGINT_MASK);
            carry = product >> BIGINT_BITS;
        }
        result[left_index + right->length] = (uint32_t)carry;
    }
    return (Magnitude){result, normalized_length(result, length)};
}

static size_t magnitude_bits(const uint32_t *limbs, size_t length) {
    length = normalized_length(limbs, length);
    uint32_t top = limbs[length - 1u];
    size_t top_bits = 0u;
    while (top != 0u) {
        top >>= 1u;
        top_bits += 1u;
    }
    return (length - 1u) * BIGINT_BITS + top_bits;
}

static bool magnitude_bit(
    const uint32_t *limbs,
    size_t length,
    size_t bit
) {
    size_t index = bit / BIGINT_BITS;
    if (index >= length) return false;
    return ((limbs[index] >> (bit % BIGINT_BITS)) & 1u) != 0u;
}

static void shift_one_add(uint32_t *limbs, size_t length, bool bit) {
    uint32_t carry = bit ? 1u : 0u;
    for (size_t index = 0u; index < length; index += 1u) {
        uint32_t next = limbs[index] >> (BIGINT_BITS - 1u);
        limbs[index] = ((limbs[index] << 1u) & BIGINT_MASK) | carry;
        carry = next;
    }
}

static void subtract_in_place(
    uint32_t *left,
    size_t left_length,
    const uint32_t *right,
    size_t right_length
) {
    uint64_t borrow = 0u;
    for (size_t index = 0u; index < left_length; index += 1u) {
        uint64_t right_limb = index < right_length ? right[index] : 0u;
        uint64_t needed = right_limb + borrow;
        if ((uint64_t)left[index] < needed) {
            left[index] =
                (uint32_t)((uint64_t)left[index] + BIGINT_BASE - needed);
            borrow = 1u;
        } else {
            left[index] = (uint32_t)((uint64_t)left[index] - needed);
            borrow = 0u;
        }
    }
}

static bool divide_magnitude(
    OseoContext *context,
    const OseoBigInt *dividend,
    const OseoBigInt *divisor,
    Magnitude *quotient,
    Magnitude *remainder
) {
    size_t quotient_length = dividend->length;
    if (divisor->length > SIZE_MAX - 1u) return false;
    size_t remainder_length = divisor->length + 1u;
    uint32_t *quotient_limbs =
        allocate_limbs(context, quotient_length, true);
    if (quotient_limbs == NULL) return false;
    uint32_t *remainder_limbs =
        allocate_limbs(context, remainder_length, true);
    if (remainder_limbs == NULL) {
        free(quotient_limbs);
        return false;
    }
    size_t bits = magnitude_bits(dividend->limbs, dividend->length);
    for (size_t cursor = bits; cursor > 0u; cursor -= 1u) {
        size_t bit = cursor - 1u;
        shift_one_add(
            remainder_limbs,
            remainder_length,
            magnitude_bit(dividend->limbs, dividend->length, bit)
        );
        if (compare_magnitude(
            remainder_limbs,
            remainder_length,
            divisor->limbs,
            divisor->length
        ) >= 0) {
            subtract_in_place(
                remainder_limbs,
                remainder_length,
                divisor->limbs,
                divisor->length
            );
            quotient_limbs[bit / BIGINT_BITS] |=
                UINT32_C(1) << (bit % BIGINT_BITS);
        }
    }
    *quotient = (Magnitude){
        quotient_limbs,
        normalized_length(quotient_limbs, quotient_length),
    };
    *remainder = (Magnitude){
        remainder_limbs,
        normalized_length(remainder_limbs, remainder_length),
    };
    return true;
}

static bool bigint_to_size(const OseoBigInt *integer, size_t *value) {
    size_t result = 0u;
    for (size_t index = integer->length; index > 0u; index -= 1u) {
        if (result > (SIZE_MAX - integer->limbs[index - 1u]) / BIGINT_BASE) {
            return false;
        }
        result = result * BIGINT_BASE + integer->limbs[index - 1u];
    }
    *value = result;
    return true;
}

static Magnitude left_shift_magnitude(
    OseoContext *context,
    const OseoBigInt *value,
    size_t shift
) {
    size_t limb_shift = shift / BIGINT_BITS;
    uint32_t bit_shift = (uint32_t)(shift % BIGINT_BITS);
    if (value->length > SIZE_MAX - limb_shift - 1u) {
        return (Magnitude){NULL, 0u};
    }
    size_t length = value->length + limb_shift + 1u;
    uint32_t *result = allocate_limbs(context, length, true);
    if (result == NULL) return (Magnitude){NULL, 0u};
    uint32_t carry = 0u;
    for (size_t index = 0u; index < value->length; index += 1u) {
        uint64_t shifted =
            ((uint64_t)value->limbs[index] << bit_shift) | carry;
        result[index + limb_shift] = (uint32_t)(shifted & BIGINT_MASK);
        carry = (uint32_t)(shifted >> BIGINT_BITS);
    }
    result[value->length + limb_shift] = carry;
    return (Magnitude){result, normalized_length(result, length)};
}

static Magnitude right_shift_magnitude(
    OseoContext *context,
    const OseoBigInt *value,
    size_t shift,
    bool *discarded
) {
    size_t limb_shift = shift / BIGINT_BITS;
    uint32_t bit_shift = (uint32_t)(shift % BIGINT_BITS);
    *discarded = false;
    for (size_t index = 0u;
         index < value->length && index < limb_shift;
         index += 1u) {
        if (value->limbs[index] != 0u) *discarded = true;
    }
    if (limb_shift >= value->length) {
        if (!oseo_internal_bigint_is_zero(
            tagged(OSEO_TAG_HEAP, (uint64_t)(uintptr_t)value)
        )) {
            *discarded = true;
        }
        uint32_t *zero = allocate_limbs(context, 1u, true);
        return (Magnitude){zero, zero == NULL ? 0u : 1u};
    }
    size_t length = value->length - limb_shift;
    uint32_t *result = allocate_limbs(context, length, true);
    if (result == NULL) return (Magnitude){NULL, 0u};
    uint32_t carry = 0u;
    for (size_t cursor = value->length; cursor > limb_shift; cursor -= 1u) {
        uint32_t limb = value->limbs[cursor - 1u];
        size_t output = cursor - 1u - limb_shift;
        if (bit_shift == 0u) {
            result[output] = limb;
        } else {
            result[output] =
                (limb >> bit_shift) |
                (carry << (BIGINT_BITS - bit_shift));
            carry = limb & ((UINT32_C(1) << bit_shift) - 1u);
        }
    }
    if (carry != 0u) *discarded = true;
    return (Magnitude){result, normalized_length(result, length)};
}

static Magnitude increment_magnitude(
    OseoContext *context,
    Magnitude input
) {
    if (input.length == SIZE_MAX) {
        free(input.limbs);
        return (Magnitude){NULL, 0u};
    }
    uint32_t *result = allocate_limbs(context, input.length + 1u, true);
    if (result == NULL) {
        free(input.limbs);
        return (Magnitude){NULL, 0u};
    }
    memcpy(result, input.limbs, input.length * sizeof(uint32_t));
    free(input.limbs);
    uint32_t carry = 1u;
    for (size_t index = 0u; index < input.length && carry != 0u; index += 1u) {
        uint32_t sum = result[index] + carry;
        result[index] = sum & BIGINT_MASK;
        carry = sum >> BIGINT_BITS;
    }
    result[input.length] = carry;
    return (Magnitude){
        result,
        normalized_length(result, input.length + 1u),
    };
}

static Magnitude bitwise_magnitude(
    OseoContext *context,
    const OseoBigInt *left,
    const OseoBigInt *right,
    OseoBigIntOperator operator,
    bool *negative
) {
    size_t width = left->length > right->length
        ? left->length
        : right->length;
    if (width == SIZE_MAX) return (Magnitude){NULL, 0u};
    width += 1u;
    uint32_t *left_bits = allocate_limbs(context, width, true);
    if (left_bits == NULL) return (Magnitude){NULL, 0u};
    uint32_t *right_bits = allocate_limbs(context, width, true);
    if (right_bits == NULL) {
        free(left_bits);
        return (Magnitude){NULL, 0u};
    }
    memcpy(left_bits, left->limbs, left->length * sizeof(uint32_t));
    memcpy(right_bits, right->limbs, right->length * sizeof(uint32_t));
    uint32_t *operands[2] = {left_bits, right_bits};
    const bool signs[2] = {left->negative, right->negative};
    for (size_t operand = 0u; operand < 2u; operand += 1u) {
        if (!signs[operand]) continue;
        uint32_t carry = 1u;
        for (size_t index = 0u; index < width; index += 1u) {
            uint32_t value = (~operands[operand][index]) & BIGINT_MASK;
            uint32_t sum = value + carry;
            operands[operand][index] = sum & BIGINT_MASK;
            carry = sum >> BIGINT_BITS;
        }
    }
    uint32_t *result = left_bits;
    for (size_t index = 0u; index < width; index += 1u) {
        if (operator == OSEO_BIGINT_AND) {
            result[index] &= right_bits[index];
        } else if (operator == OSEO_BIGINT_OR) {
            result[index] |= right_bits[index];
        } else {
            result[index] ^= right_bits[index];
        }
    }
    free(right_bits);
    *negative = (result[width - 1u] >> (BIGINT_BITS - 1u)) != 0u;
    if (*negative) {
        uint32_t carry = 1u;
        for (size_t index = 0u; index < width; index += 1u) {
            uint32_t value = (~result[index]) & BIGINT_MASK;
            uint32_t sum = value + carry;
            result[index] = sum & BIGINT_MASK;
            carry = sum >> BIGINT_BITS;
        }
    }
    return (Magnitude){result, normalized_length(result, width)};
}

static OseoResult arithmetic_result(
    OseoContext *context,
    bool negative,
    Magnitude magnitude
) {
    if (magnitude.limbs == NULL) return allocation_failure(context);
    OseoResult result = publish_bigint(
        context,
        negative,
        magnitude.limbs,
        magnitude.length
    );
    free(magnitude.limbs);
    return result;
}

static OseoResult add_or_subtract(
    OseoContext *context,
    const OseoBigInt *left,
    const OseoBigInt *right,
    bool subtract
) {
    bool right_negative = right->negative != subtract;
    if (left->negative == right_negative) {
        Magnitude sum = add_magnitude(context, left, right);
        return arithmetic_result(context, left->negative, sum);
    }
    int order = compare_magnitude(
        left->limbs,
        left->length,
        right->limbs,
        right->length
    );
    if (order == 0) return small_bigint(context, false, 0u);
    const OseoBigInt *larger = order > 0 ? left : right;
    const OseoBigInt *smaller = order > 0 ? right : left;
    Magnitude difference = subtract_magnitude(
        context,
        larger->limbs,
        larger->length,
        smaller->limbs,
        smaller->length
    );
    bool negative = order > 0 ? left->negative : right_negative;
    return arithmetic_result(context, negative, difference);
}

static OseoResult shift_result(
    OseoContext *context,
    const OseoBigInt *left,
    const OseoBigInt *right,
    bool requested_left
) {
    if (left->length == 1u && left->limbs[0] == 0u) {
        return small_bigint(context, false, 0u);
    }
    bool left_direction = requested_left != right->negative;
    size_t shift;
    if (!bigint_to_size(right, &shift)) {
        if (left_direction) {
            return bigint_limit_error(context);
        }
        return small_bigint(context, left->negative, left->negative ? 1u : 0u);
    }
    if (left_direction) {
        size_t bits = magnitude_bits(left->limbs, left->length);
        if (shift > BIGINT_MAX_BITS || bits > BIGINT_MAX_BITS - shift) {
            return bigint_limit_error(context);
        }
        return arithmetic_result(
            context,
            left->negative,
            left_shift_magnitude(context, left, shift)
        );
    }
    bool discarded = false;
    Magnitude result = right_shift_magnitude(
        context,
        left,
        shift,
        &discarded
    );
    if (left->negative && discarded && result.limbs != NULL) {
        result = increment_magnitude(context, result);
    }
    return arithmetic_result(context, left->negative, result);
}

static OseoResult exponentiate(
    OseoContext *context,
    OseoValue left_value,
    OseoValue right_value
) {
    OseoBigInt *exponent = bigint_object(right_value);
    if (exponent->negative) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "A BigInt exponent cannot be negative."
        );
    }
    size_t exponent_size;
    OseoBigInt *base = bigint_object(left_value);
    if (!bigint_to_size(exponent, &exponent_size)) {
        if (oseo_internal_bigint_is_zero(left_value)) {
            return small_bigint(context, false, 0u);
        }
        if (base->length == 1u && base->limbs[0] == 1u) {
            bool negative = base->negative &&
                (exponent->limbs[0] & 1u) != 0u;
            return small_bigint(context, negative, 1u);
        }
        return bigint_limit_error(context);
    }
    size_t base_bits = magnitude_bits(base->limbs, base->length);
    if (base_bits > 1u &&
        exponent_size > (BIGINT_MAX_BITS - 1u) / (base_bits - 1u)) {
        return bigint_limit_error(context);
    }
    OseoValue slots[4] = {
        left_value,
        right_value,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult one = small_bigint(context, false, 1u);
    if (one.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return one;
    }
    slots[2] = one.value;
    slots[3] = slots[0];
    size_t remaining = exponent_size;
    while (remaining > 0u) {
        if ((remaining & 1u) != 0u) {
            Magnitude product = multiply_magnitude(
                context,
                bigint_object(slots[2]),
                bigint_object(slots[3])
            );
            OseoResult next = arithmetic_result(
                context,
                bigint_object(slots[2])->negative !=
                    bigint_object(slots[3])->negative,
                product
            );
            if (next.status != OSEO_STATUS_NORMAL) {
                oseo_roots_pop(context, &frame);
                return next;
            }
            slots[2] = next.value;
        }
        remaining >>= 1u;
        if (remaining == 0u) break;
        Magnitude square = multiply_magnitude(
            context,
            bigint_object(slots[3]),
            bigint_object(slots[3])
        );
        OseoResult next = arithmetic_result(context, false, square);
        if (next.status != OSEO_STATUS_NORMAL) {
            oseo_roots_pop(context, &frame);
            return next;
        }
        slots[3] = next.value;
    }
    OseoResult result = normal(slots[2]);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_bigint_literal(
    OseoContext *context,
    const char *digits,
    uint32_t radix
) {
    if (digits == NULL ||
        (radix != 2u && radix != 8u && radix != 10u && radix != 16u)) {
        return failure(context, "OSEO2001", "Invalid BigInt constant.");
    }
    size_t length = strlen(digits);
    if (length == 0u || length > (SIZE_MAX - 1u) / 4u) {
        return failure(context, "OSEO2001", "Invalid BigInt constant.");
    }
    size_t capacity = length * 4u / BIGINT_BITS + 2u;
    if (capacity > BIGINT_MAX_LIMBS + 1u) {
        capacity = BIGINT_MAX_LIMBS + 1u;
    }
    uint32_t *limbs = allocate_limbs(context, capacity, true);
    if (limbs == NULL) return allocation_failure(context);
    size_t limb_count = 1u;
    for (size_t index = 0u; index < length; index += 1u) {
        char character = digits[index];
        uint32_t digit;
        if (character >= '0' && character <= '9') {
            digit = (uint32_t)(character - '0');
        } else if (character >= 'a' && character <= 'f') {
            digit = (uint32_t)(character - 'a' + 10);
        } else {
            free(limbs);
            return failure(context, "OSEO2001", "Invalid BigInt constant.");
        }
        if (digit >= radix) {
            free(limbs);
            return failure(context, "OSEO2001", "Invalid BigInt constant.");
        }
        uint64_t carry = digit;
        for (size_t limb = 0u; limb < limb_count; limb += 1u) {
            uint64_t value = (uint64_t)limbs[limb] * radix + carry;
            limbs[limb] = (uint32_t)(value & BIGINT_MASK);
            carry = value >> BIGINT_BITS;
        }
        if (carry != 0u) {
            if (limb_count >= capacity) {
                free(limbs);
                return bigint_limit_error(context);
            }
            limbs[limb_count] = (uint32_t)carry;
            limb_count += 1u;
        }
    }
    OseoResult result = publish_bigint(
        context,
        false,
        limbs,
        limb_count
    );
    free(limbs);
    return result;
}

bool oseo_internal_bigint_is_zero(OseoValue value) {
    OseoBigInt *integer = bigint_object(value);
    return integer->length == 1u && integer->limbs[0] == 0u;
}

static double magnitude_to_number(
    const uint32_t *limbs,
    size_t length,
    bool negative
) {
    size_t bit_length = magnitude_bits(limbs, length);
    if (bit_length == 0u) return 0.0;

    size_t kept_bits = bit_length < DBL_MANT_DIG
        ? bit_length
        : DBL_MANT_DIG;
    uint64_t significant = 0u;
    for (size_t offset = 0u; offset < kept_bits; offset += 1u) {
        size_t bit = bit_length - offset - 1u;
        size_t limb = bit / BIGINT_BITS;
        size_t shift = bit % BIGINT_BITS;
        significant = (significant << 1u) |
            ((limbs[limb] >> shift) & 1u);
    }

    size_t discarded = bit_length - kept_bits;
    if (discarded > 0u) {
        size_t round_index = discarded - 1u;
        size_t round_limb = round_index / BIGINT_BITS;
        size_t round_shift = round_index % BIGINT_BITS;
        bool round_bit =
            ((limbs[round_limb] >> round_shift) & 1u) != 0u;
        bool sticky = false;
        for (size_t bit = 0u; bit < round_index; bit += 1u) {
            size_t limb = bit / BIGINT_BITS;
            size_t shift = bit % BIGINT_BITS;
            if (((limbs[limb] >> shift) & 1u) != 0u) {
                sticky = true;
                break;
            }
        }
        if (round_bit && (sticky || (significant & 1u) != 0u)) {
            significant += 1u;
            if (significant == (UINT64_C(1) << DBL_MANT_DIG)) {
                significant >>= 1u;
                discarded += 1u;
            }
        }
    }
    double number = discarded > (size_t)(DBL_MAX_EXP - DBL_MANT_DIG)
        ? INFINITY
        : ldexp((double)significant, (int)discarded);
    return negative ? -number : number;
}

double oseo_internal_bigint_to_number(OseoValue value) {
    const OseoBigInt *integer = bigint_object(value);
    return magnitude_to_number(
        integer->limbs,
        integer->length,
        integer->negative
    );
}

double oseo_internal_integer_digits_to_number(
    const uint16_t *units,
    size_t length,
    uint32_t radix
) {
    enum {
        NUMBER_LIMBS =
            (DBL_MAX_EXP + (int)BIGINT_BITS) / (int)BIGINT_BITS,
    };
    uint32_t limbs[NUMBER_LIMBS] = {0u};
    size_t limb_count = 1u;
    for (size_t index = 0u; index < length; index += 1u) {
        uint16_t unit = units[index];
        uint32_t digit;
        if (unit >= UINT16_C('0') && unit <= UINT16_C('9')) {
            digit = (uint32_t)(unit - UINT16_C('0'));
        } else if (unit >= UINT16_C('a') && unit <= UINT16_C('z')) {
            digit = (uint32_t)(unit - UINT16_C('a')) + 10u;
        } else if (unit >= UINT16_C('A') && unit <= UINT16_C('Z')) {
            digit = (uint32_t)(unit - UINT16_C('A')) + 10u;
        } else {
            return NAN;
        }
        if (digit >= radix) return NAN;
        uint64_t carry = digit;
        for (size_t limb = 0u; limb < limb_count; limb += 1u) {
            uint64_t next = (uint64_t)limbs[limb] * radix + carry;
            limbs[limb] = (uint32_t)(next & BIGINT_MASK);
            carry = next >> BIGINT_BITS;
        }
        if (carry != 0u) {
            if (limb_count >= NUMBER_LIMBS) return INFINITY;
            limbs[limb_count] = (uint32_t)carry;
            limb_count += 1u;
        }
        if (magnitude_bits(limbs, limb_count) > DBL_MAX_EXP) {
            return INFINITY;
        }
    }
    return magnitude_to_number(limbs, limb_count, false);
}

bool oseo_internal_bigint_equal(OseoValue left, OseoValue right) {
    OseoBigInt *left_integer = bigint_object(left);
    OseoBigInt *right_integer = bigint_object(right);
    return left_integer->negative == right_integer->negative &&
        left_integer->length == right_integer->length &&
        memcmp(
            left_integer->limbs,
            right_integer->limbs,
            left_integer->length * sizeof(uint32_t)
        ) == 0;
}

int oseo_internal_bigint_compare(OseoValue left, OseoValue right) {
    OseoBigInt *left_integer = bigint_object(left);
    OseoBigInt *right_integer = bigint_object(right);
    if (left_integer->negative != right_integer->negative) {
        return left_integer->negative ? -1 : 1;
    }
    int order = compare_magnitude(
        left_integer->limbs,
        left_integer->length,
        right_integer->limbs,
        right_integer->length
    );
    return left_integer->negative ? -order : order;
}

static int compare_magnitude_double(const OseoBigInt *integer, double number) {
    if (number < 1.0) {
        return oseo_internal_bigint_is_zero(
            tagged(OSEO_TAG_HEAP, (uint64_t)(uintptr_t)integer)
        ) ? 0 : 1;
    }
    int exponent;
    double fraction = frexp(number, &exponent);
    uint64_t significand = (uint64_t)ldexp(fraction, DBL_MANT_DIG);
    size_t integer_bits = magnitude_bits(integer->limbs, integer->length);
    size_t number_bits = (size_t)exponent;
    if (integer_bits < number_bits) return -1;
    if (integer_bits > number_bits) return 1;
    int shift = exponent - DBL_MANT_DIG;
    for (size_t cursor = integer_bits; cursor > 0u; cursor -= 1u) {
        size_t bit = cursor - 1u;
        bool integer_bit = magnitude_bit(
            integer->limbs,
            integer->length,
            bit
        );
        bool number_bit = false;
        if (shift >= 0) {
            if (bit >= (size_t)shift &&
                bit - (size_t)shift < DBL_MANT_DIG) {
                number_bit =
                    ((significand >> (bit - (size_t)shift)) & 1u) != 0u;
            }
        } else {
            size_t discarded = (size_t)(-shift);
            if (bit + discarded < DBL_MANT_DIG) {
                number_bit =
                    ((significand >> (bit + discarded)) & 1u) != 0u;
            }
        }
        if (integer_bit != number_bit) return integer_bit ? 1 : -1;
    }
    return 0;
}

int oseo_internal_bigint_compare_number(OseoValue value, double number) {
    OseoBigInt *integer = bigint_object(value);
    if (isinf(number)) return number > 0.0 ? -1 : 1;
    bool number_negative = signbit(number) && number != 0.0;
    if (integer->negative != number_negative) {
        return integer->negative ? -1 : 1;
    }
    double absolute = fabs(number);
    double integral = trunc(absolute);
    int order = compare_magnitude_double(integer, integral);
    if (integer->negative) order = -order;
    if (order == 0 && absolute != integral) {
        return integer->negative ? 1 : -1;
    }
    return order;
}

OseoResult oseo_internal_bigint_negate(
    OseoContext *context,
    OseoValue value
) {
    OseoBigInt *integer = bigint_object(value);
    bool negative = !integer->negative;
    if (oseo_internal_bigint_is_zero(value)) negative = false;
    return publish_bigint(
        context,
        negative,
        integer->limbs,
        integer->length
    );
}

OseoResult oseo_internal_bigint_not(
    OseoContext *context,
    OseoValue value
) {
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult one = small_bigint(context, false, 1u);
    if (one.status == OSEO_STATUS_NORMAL) {
        slots[1] = one.value;
        OseoResult negative = oseo_internal_bigint_negate(context, slots[0]);
        if (negative.status == OSEO_STATUS_NORMAL) {
            slots[0] = negative.value;
            one = add_or_subtract(
                context,
                bigint_object(slots[0]),
                bigint_object(slots[1]),
                true
            );
        } else {
            one = negative;
        }
    }
    oseo_roots_pop(context, &frame);
    return one;
}

OseoResult oseo_internal_bigint_binary(
    OseoContext *context,
    OseoValue left_value,
    OseoValue right_value,
    OseoBigIntOperator operator
) {
    OseoBigInt *left = bigint_object(left_value);
    OseoBigInt *right = bigint_object(right_value);
    if (operator == OSEO_BIGINT_ADD || operator == OSEO_BIGINT_SUBTRACT) {
        return add_or_subtract(
            context,
            left,
            right,
            operator == OSEO_BIGINT_SUBTRACT
        );
    }
    if (operator == OSEO_BIGINT_MULTIPLY) {
        Magnitude product = multiply_magnitude(context, left, right);
        return arithmetic_result(
            context,
            left->negative != right->negative,
            product
        );
    }
    if (operator == OSEO_BIGINT_DIVIDE ||
        operator == OSEO_BIGINT_REMAINDER) {
        if (oseo_internal_bigint_is_zero(right_value)) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "BigInt division by zero."
            );
        }
        Magnitude quotient;
        Magnitude remainder;
        if (!divide_magnitude(
            context,
            left,
            right,
            &quotient,
            &remainder
        )) {
            return allocation_failure(context);
        }
        bool return_quotient = operator == OSEO_BIGINT_DIVIDE;
        Magnitude selected = return_quotient ? quotient : remainder;
        free(return_quotient ? remainder.limbs : quotient.limbs);
        bool negative = return_quotient
            ? left->negative != right->negative
            : left->negative;
        return arithmetic_result(context, negative, selected);
    }
    if (operator == OSEO_BIGINT_EXPONENTIATE) {
        return exponentiate(context, left_value, right_value);
    }
    if (operator == OSEO_BIGINT_SHIFT_LEFT ||
        operator == OSEO_BIGINT_SHIFT_RIGHT) {
        return shift_result(
            context,
            left,
            right,
            operator == OSEO_BIGINT_SHIFT_LEFT
        );
    }
    bool negative = false;
    Magnitude result = bitwise_magnitude(
        context,
        left,
        right,
        operator,
        &negative
    );
    return arithmetic_result(context, negative, result);
}

static bool bigint_whitespace(uint16_t unit) {
    return unit == UINT16_C(0x0009) || unit == UINT16_C(0x000a) ||
        unit == UINT16_C(0x000b) || unit == UINT16_C(0x000c) ||
        unit == UINT16_C(0x000d) || unit == UINT16_C(0x0020) ||
        unit == UINT16_C(0x00a0) || unit == UINT16_C(0x1680) ||
        (unit >= UINT16_C(0x2000) && unit <= UINT16_C(0x200a)) ||
        unit == UINT16_C(0x2028) || unit == UINT16_C(0x2029) ||
        unit == UINT16_C(0x202f) || unit == UINT16_C(0x205f) ||
        unit == UINT16_C(0x3000) || unit == UINT16_C(0xfeff);
}

OseoResult oseo_internal_string_to_bigint(
    OseoContext *context,
    const OseoString *string,
    bool *valid
) {
    size_t start = 0u;
    size_t end = string->length;
    while (start < end && bigint_whitespace(string->units[start])) start += 1u;
    while (end > start && bigint_whitespace(string->units[end - 1u])) end -= 1u;
    if (start == end) {
        *valid = true;
        return small_bigint(context, false, 0u);
    }
    bool has_sign = false;
    bool negative = false;
    if (string->units[start] == '+' || string->units[start] == '-') {
        has_sign = true;
        negative = string->units[start] == '-';
        start += 1u;
        if (start == end) {
            *valid = false;
            return normal(oseo_undefined());
        }
    }
    uint32_t radix = 10u;
    if (end - start >= 2u && string->units[start] == '0') {
        uint16_t prefix = string->units[start + 1u];
        if (prefix == 'b' || prefix == 'B') radix = 2u;
        else if (prefix == 'o' || prefix == 'O') radix = 8u;
        else if (prefix == 'x' || prefix == 'X') radix = 16u;
        if (radix != 10u) {
            if (has_sign) {
                *valid = false;
                return normal(oseo_undefined());
            }
            start += 2u;
        }
    }
    if (start == end || end - start > (SIZE_MAX - 1u) / 4u) {
        *valid = false;
        return normal(oseo_undefined());
    }
    size_t count = end - start;
    char *digits = oseo_internal_allocate_heap_bytes(context, count + 1u);
    if (digits == NULL) return allocation_failure(context);
    for (size_t index = 0u; index < count; index += 1u) {
        uint16_t unit = string->units[start + index];
        bool decimal = unit >= '0' && unit <= '9';
        bool hexadecimal =
            (unit >= 'a' && unit <= 'f') ||
            (unit >= 'A' && unit <= 'F');
        uint32_t digit = decimal
            ? (uint32_t)(unit - '0')
            : hexadecimal
              ? (uint32_t)((unit | UINT16_C(0x20)) - 'a' + 10)
              : UINT32_MAX;
        if (unit > UINT16_C(0x7f) || digit >= radix) {
            free(digits);
            *valid = false;
            return normal(oseo_undefined());
        }
        digits[index] = (char)(hexadecimal
            ? unit | UINT16_C(0x20)
            : unit);
    }
    digits[count] = '\0';
    OseoResult result = oseo_bigint_literal(context, digits, radix);
    free(digits);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (negative && !oseo_internal_bigint_is_zero(result.value)) {
        OseoValue slot = result.value;
        OseoRootFrame frame = {NULL, &slot, 1u};
        oseo_roots_push(context, &frame);
        result = oseo_internal_bigint_negate(context, slot);
        oseo_roots_pop(context, &frame);
    }
    *valid = result.status == OSEO_STATUS_NORMAL;
    return result;
}

/*
 * Lowercase digit characters for every radix ECMA-262 admits, so a
 * value of 10 through 35 spells a through z.
 */
static const char bigint_digit_characters[] =
    "0123456789abcdefghijklmnopqrstuvwxyz";

static OseoResult bigint_string_rooted(
    OseoContext *context,
    OseoValue value,
    uint32_t radix
) {
    OseoBigInt *integer = bigint_object(value);
    bool negative = integer->negative;
    size_t working_length = integer->length;
    uint32_t *working = allocate_limbs(context, working_length, false);
    if (working == NULL) return allocation_failure(context);
    memcpy(working, integer->limbs, working_length * sizeof(uint32_t));
    /*
     * Every radix of at least two consumes one whole bit per digit, so
     * the magnitude's bit length bounds the digit count, and the two
     * extra bytes cover the zero digit and the sign.
     */
    size_t capacity = magnitude_bits(working, working_length) + 2u;
    char *reverse = oseo_internal_allocate_heap_bytes(context, capacity);
    if (reverse == NULL) {
        free(working);
        return allocation_failure(context);
    }
    size_t digits = 0u;
    do {
        uint64_t remainder = 0u;
        for (size_t cursor = working_length; cursor > 0u; cursor -= 1u) {
            uint64_t current =
                (remainder << BIGINT_BITS) | working[cursor - 1u];
            working[cursor - 1u] = (uint32_t)(current / radix);
            remainder = current % radix;
        }
        reverse[digits] = bigint_digit_characters[remainder];
        digits += 1u;
        working_length = normalized_length(working, working_length);
    } while (!(working_length == 1u && working[0] == 0u));
    free(working);
    if (negative) {
        reverse[digits] = '-';
        digits += 1u;
    }
    if (digits > SIZE_MAX / sizeof(uint16_t)) {
        free(reverse);
        return failure(context, "OSEO2001", "BigInt text is too large.");
    }
    uint16_t *units = oseo_internal_allocate_heap_bytes(
        context,
        digits * sizeof(uint16_t)
    );
    if (units == NULL) {
        free(reverse);
        return allocation_failure(context);
    }
    for (size_t index = 0u; index < digits; index += 1u) {
        units[index] =
            (uint16_t)(unsigned char)reverse[digits - index - 1u];
    }
    free(reverse);
    OseoResult result = oseo_internal_allocate_string(
        context,
        units,
        digits
    );
    free(units);
    return result;
}

OseoResult oseo_internal_bigint_string(
    OseoContext *context,
    OseoValue value
) {
    return oseo_internal_bigint_radix_string(context, value, 10u);
}

OseoResult oseo_internal_bigint_radix_string(
    OseoContext *context,
    OseoValue value,
    uint32_t radix
) {
    if (radix < 2u || radix > 36u) {
        return failure(context, "OSEO2001", "Invalid BigInt text radix.");
    }
    OseoValue slot = value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = bigint_string_rooted(context, slot, radix);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_bigint_from_integral_number(
    OseoContext *context,
    double number
) {
    if (number == 0.0) return small_bigint(context, false, 0u);
    bool negative = number < 0.0;
    double magnitude = negative ? -number : number;
    int exponent = 0;
    double fraction = frexp(magnitude, &exponent);
    /*
     * magnitude is fraction * 2**exponent with fraction in [0.5, 1), so
     * the scaled significand is an exact integer and magnitude is
     * significand * 2**(exponent - DBL_MANT_DIG). An integral magnitude
     * below 2**DBL_MANT_DIG leaves that shift negative with the dropped
     * low bits already zero, so the right shift stays exact.
     */
    uint64_t significand = (uint64_t)ldexp(fraction, DBL_MANT_DIG);
    int shift = exponent - DBL_MANT_DIG;
    if (shift < 0) {
        significand >>= (unsigned)(-shift);
        shift = 0;
    }
    size_t offset = (size_t)shift;
    size_t length = (size_t)exponent / BIGINT_BITS + 1u;
    uint32_t *limbs = allocate_limbs(context, length, true);
    if (limbs == NULL) return allocation_failure(context);
    for (unsigned index = 0u; index < 64u; index += 1u) {
        if (((significand >> index) & UINT64_C(1)) == 0u) continue;
        size_t bit = offset + index;
        limbs[bit / BIGINT_BITS] |=
            UINT32_C(1) << (bit % (size_t)BIGINT_BITS);
    }
    OseoResult result = publish_bigint(context, negative, limbs, length);
    free(limbs);
    return result;
}

/*
 * Replace the width-bounded magnitude in `limbs` with 2**width minus
 * itself, which the two's complement produces in place. The caller
 * guarantees a nonzero input, so the increment never carries past the
 * width.
 */
static void width_complement(
    uint32_t *limbs,
    size_t length,
    size_t top_limb,
    uint32_t top_mask
) {
    for (size_t index = 0u; index < length; index += 1u) {
        limbs[index] = (~limbs[index]) & BIGINT_MASK;
    }
    limbs[top_limb] &= top_mask;
    uint32_t carry = 1u;
    for (size_t index = 0u; index < length && carry != 0u; index += 1u) {
        uint32_t sum = limbs[index] + carry;
        limbs[index] = sum & BIGINT_MASK;
        carry = sum >> BIGINT_BITS;
    }
}

static OseoResult bigint_as_width_rooted(
    OseoContext *context,
    OseoValue value,
    double bits,
    bool signed_result
) {
    const OseoBigInt *integer = bigint_object(value);
    bool negative = integer->negative;
    size_t source_bits = magnitude_bits(integer->limbs, integer->length);
    if (bits == 0.0) return small_bigint(context, false, 0u);
    if (bits > (double)source_bits) {
        /*
         * Every bit of the operand sits strictly below the sign bit of
         * the requested width, so the signed result is the operand and
         * the unsigned result is the operand whenever it is not
         * negative. Neither needs 2**bits to exist.
         */
        if (signed_result || !negative) return normal(value);
        if (bits > (double)BIGINT_MAX_BITS) return bigint_limit_error(context);
    }
    size_t width = (size_t)bits;
    size_t top_limb = width / (size_t)BIGINT_BITS;
    size_t top_bit = width % (size_t)BIGINT_BITS;
    uint32_t top_mask = top_bit == 0u
        ? 0u
        : (uint32_t)((UINT32_C(1) << top_bit) - 1u);
    size_t length = top_limb + 1u;
    uint32_t *limbs = allocate_limbs(context, length, true);
    if (limbs == NULL) return allocation_failure(context);
    for (size_t index = 0u; index < length; index += 1u) {
        limbs[index] = index < integer->length ? integer->limbs[index] : 0u;
    }
    limbs[top_limb] &= top_mask;
    bool low_zero = normalized_length(limbs, length) == 1u && limbs[0] == 0u;
    bool result_negative = false;
    /*
     * Both the unsigned wrap of a negative operand and the signed
     * reading of a set sign bit are 2**width minus the current value,
     * which the width-bounded two's complement produces without ever
     * materializing 2**width itself.
     */
    bool complement = negative && !low_zero;
    if (complement) width_complement(limbs, length, top_limb, top_mask);
    if (signed_result && magnitude_bit(limbs, length, width - 1u)) {
        width_complement(limbs, length, top_limb, top_mask);
        result_negative = true;
    }
    OseoResult result =
        publish_bigint(context, result_negative, limbs, length);
    free(limbs);
    return result;
}

OseoResult oseo_internal_bigint_as_width(
    OseoContext *context,
    OseoValue value,
    double bits,
    bool signed_result
) {
    OseoValue slot = value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        bigint_as_width_rooted(context, slot, bits, signed_result);
    oseo_roots_pop(context, &frame);
    return result;
}
