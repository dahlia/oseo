#include "runtime_internal.h"

#include <float.h>
#include <math.h>
#include <string.h>

/*
 * The Math namespace object: the eight value properties of 21.3.1, the
 * thirty-six function properties of 21.3.2, and the realm's
 * pseudorandom source. Math is an ordinary object, not a function, so
 * it has neither [[Call]] nor [[Construct]] and its function properties
 * are ordinary built-in functions that are not constructors either.
 */

/*
 * One Math function property. The array order is the ordering the
 * namespace object creates its properties in and the order the code
 * IDs count down from `OSEO_MATH_FUNCTION_CODE_ID_LAST`, so an entry's
 * index is the only identity the builder and the dispatcher share.
 */
typedef enum {
    OSEO_MATH_ABS = 0,
    OSEO_MATH_ACOS = 1,
    OSEO_MATH_ACOSH = 2,
    OSEO_MATH_ASIN = 3,
    OSEO_MATH_ASINH = 4,
    OSEO_MATH_ATAN = 5,
    OSEO_MATH_ATANH = 6,
    OSEO_MATH_ATAN2 = 7,
    OSEO_MATH_CBRT = 8,
    OSEO_MATH_CEIL = 9,
    OSEO_MATH_CLZ32 = 10,
    OSEO_MATH_COS = 11,
    OSEO_MATH_COSH = 12,
    OSEO_MATH_EXP = 13,
    OSEO_MATH_EXPM1 = 14,
    OSEO_MATH_F16ROUND = 15,
    OSEO_MATH_FLOOR = 16,
    OSEO_MATH_FROUND = 17,
    OSEO_MATH_HYPOT = 18,
    OSEO_MATH_IMUL = 19,
    OSEO_MATH_LOG = 20,
    OSEO_MATH_LOG1P = 21,
    OSEO_MATH_LOG10 = 22,
    OSEO_MATH_LOG2 = 23,
    OSEO_MATH_MAX = 24,
    OSEO_MATH_MIN = 25,
    OSEO_MATH_POW = 26,
    OSEO_MATH_RANDOM = 27,
    OSEO_MATH_ROUND = 28,
    OSEO_MATH_SIGN = 29,
    OSEO_MATH_SIN = 30,
    OSEO_MATH_SINH = 31,
    OSEO_MATH_SQRT = 32,
    OSEO_MATH_TAN = 33,
    OSEO_MATH_TANH = 34,
    OSEO_MATH_TRUNC = 35,
} OseoMathOperation;

typedef struct {
    const char *name;
    size_t length;
} OseoMathFunction;

static const OseoMathFunction math_functions[] = {
    {"abs", 1u},      {"acos", 1u},   {"acosh", 1u},    {"asin", 1u},
    {"asinh", 1u},    {"atan", 1u},   {"atanh", 1u},    {"atan2", 2u},
    {"cbrt", 1u},     {"ceil", 1u},   {"clz32", 1u},    {"cos", 1u},
    {"cosh", 1u},     {"exp", 1u},    {"expm1", 1u},    {"f16round", 1u},
    {"floor", 1u},    {"fround", 1u}, {"hypot", 2u},    {"imul", 2u},
    {"log", 1u},      {"log1p", 1u},  {"log10", 1u},    {"log2", 1u},
    {"max", 2u},      {"min", 2u},    {"pow", 2u},      {"random", 0u},
    {"round", 1u},    {"sign", 1u},   {"sin", 1u},      {"sinh", 1u},
    {"sqrt", 1u},     {"tan", 1u},    {"tanh", 1u},     {"trunc", 1u},
};

_Static_assert(
    sizeof(math_functions) / sizeof(math_functions[0]) ==
        OSEO_MATH_FUNCTION_COUNT,
    "The Math function table must match its reviewed code-ID range."
);

typedef struct {
    const char *name;
    double value;
} OseoMathConstant;

/*
 * The eight value properties, each the Number value closest to the
 * mathematical constant it names. They are non-writable,
 * non-enumerable, and non-configurable.
 */
static const OseoMathConstant math_constants[] = {
    {"E", 2.7182818284590452354},
    {"LN10", 2.302585092994046},
    {"LN2", 0.6931471805599453},
    {"LOG10E", 0.4342944819032518},
    {"LOG2E", 1.4426950408889634},
    {"PI", 3.1415926535897932},
    {"SQRT1_2", 0.7071067811865476},
    {"SQRT2", 1.4142135623730951},
};

#define OSEO_MATH_CONSTANT_COUNT \
    (sizeof(math_constants) / sizeof(math_constants[0]))

/*
 * Round one finite nonzero magnitude to the nearest value of a binary
 * interchange format with `significand_bits` significant bits and
 * `minimum_quantum` as the exponent of its subnormal quantum, with ties
 * to even. The scaled operand stays below 2**significand_bits + 1, so
 * both the scaling and the comparison are exact binary64 arithmetic and
 * no narrowing floating conversion happens. A magnitude that rounds
 * past `maximum_finite` becomes an infinity.
 */
static double round_to_binary(
    double magnitude,
    int significand_bits,
    int minimum_quantum,
    double maximum_finite
) {
    int exponent;
    (void)frexp(magnitude, &exponent);
    int quantum = exponent - significand_bits;
    if (quantum < minimum_quantum) quantum = minimum_quantum;
    double scaled = ldexp(magnitude, -quantum);
    double lower = floor(scaled);
    double fraction = scaled - lower;
    double rounded;
    if (fraction > 0.5) {
        rounded = lower + 1.0;
    } else if (fraction < 0.5) {
        rounded = lower;
    } else {
        rounded = fmod(lower, 2.0) == 0.0 ? lower : lower + 1.0;
    }
    double result = ldexp(rounded, quantum);
    return result > maximum_finite ? (double)INFINITY : result;
}

/* Math.fround and Math.f16round over one already converted Number. */
static double math_round_to_format(double value, bool half) {
    if (isnan(value) || isinf(value) || value == 0.0) return value;
    double magnitude = round_to_binary(
        fabs(value),
        half ? 11 : 24,
        half ? -24 : -149,
        half ? 65504.0 : (double)FLT_MAX
    );
    return value < 0.0 ? -magnitude : magnitude;
}

/*
 * Math.round, 21.3.2.28. The specification rounds to the closest
 * integral Number and breaks a tie toward positive infinity, which is
 * not what C `round` does for a negative tie, and it keeps a negative
 * operand above -0.5 at -0. Comparing the fractional part against one
 * half decides both, and an operand whose magnitude is at least 2**52
 * is already integral, so its fractional part is exactly zero.
 */
static double math_round(double value) {
    if (isnan(value) || isinf(value) || value == 0.0) return value;
    if (value > 0.0 && value < 0.5) return 0.0;
    if (value < 0.0 && value >= -0.5) return -0.0;
    double lower = floor(value);
    return value - lower < 0.5 ? lower : lower + 1.0;
}

/* Math.sign, 21.3.2.29, which preserves both signed zeroes and NaN. */
static double math_sign(double value) {
    if (isnan(value) || value == 0.0) return value;
    return value < 0.0 ? -1.0 : 1.0;
}

/* Math.clz32, 21.3.2.11, over the operand's ToUint32 bit pattern. */
static double math_clz32(double value) {
    uint32_t bits = oseo_internal_number_to_uint32(value);
    if (bits == 0u) return 32.0;
    int count = 0;
    while ((bits & UINT32_C(0x80000000)) == 0u) {
        bits <<= 1u;
        count += 1;
    }
    return (double)count;
}

/* Math.imul, 21.3.2.20: the signed reading of a wrapped 32-bit product. */
static double math_imul(double left, double right) {
    uint32_t product = oseo_internal_number_to_uint32(left) *
        oseo_internal_number_to_uint32(right);
    return product >= UINT32_C(0x80000000)
        ? (double)((int64_t)product - INT64_C(4294967296))
        : (double)product;
}

/*
 * The realm's xorshift128+ draw. The state is the two words the context
 * mixed from this realm's initialization ordinal, so the sequence is
 * uniform, identical on every supported target, and distinct from every
 * other realm's.
 */
static double math_random(OseoContext *context) {
    uint64_t first = context->random_state[0];
    const uint64_t second = context->random_state[1];
    context->random_state[0] = second;
    first ^= first << 23u;
    first ^= first >> 17u;
    first ^= second;
    first ^= second >> 26u;
    context->random_state[1] = first;
    /* The high 53 bits of the sum scale exactly onto [0, 1). */
    return (double)((first + second) >> 11u) * (1.0 / 9007199254740992.0);
}

/* Every Math function property whose result needs one operand only. */
static double math_unary_value(size_t operation, double value) {
    switch ((OseoMathOperation)operation) {
        case OSEO_MATH_ABS: return fabs(value);
        case OSEO_MATH_ACOS: return acos(value);
        case OSEO_MATH_ACOSH: return acosh(value);
        case OSEO_MATH_ASIN: return asin(value);
        case OSEO_MATH_ASINH: return asinh(value);
        case OSEO_MATH_ATAN: return atan(value);
        case OSEO_MATH_ATANH: return atanh(value);
        case OSEO_MATH_CBRT: return cbrt(value);
        case OSEO_MATH_CEIL: return ceil(value);
        case OSEO_MATH_CLZ32: return math_clz32(value);
        case OSEO_MATH_COS: return cos(value);
        case OSEO_MATH_COSH: return cosh(value);
        case OSEO_MATH_EXP: return exp(value);
        case OSEO_MATH_EXPM1: return expm1(value);
        case OSEO_MATH_F16ROUND: return math_round_to_format(value, true);
        case OSEO_MATH_FLOOR: return floor(value);
        case OSEO_MATH_FROUND: return math_round_to_format(value, false);
        case OSEO_MATH_LOG: return log(value);
        case OSEO_MATH_LOG1P: return log1p(value);
        case OSEO_MATH_LOG10: return log10(value);
        case OSEO_MATH_LOG2: return log2(value);
        case OSEO_MATH_ROUND: return math_round(value);
        case OSEO_MATH_SIGN: return math_sign(value);
        case OSEO_MATH_SIN: return sin(value);
        case OSEO_MATH_SINH: return sinh(value);
        case OSEO_MATH_SQRT: return sqrt(value);
        case OSEO_MATH_TAN: return tan(value);
        case OSEO_MATH_TANH: return tanh(value);
        case OSEO_MATH_TRUNC: return trunc(value);
        default: return NAN;
    }
}

static bool math_is_unary(size_t operation) {
    switch ((OseoMathOperation)operation) {
        case OSEO_MATH_ATAN2:
        case OSEO_MATH_HYPOT:
        case OSEO_MATH_IMUL:
        case OSEO_MATH_MAX:
        case OSEO_MATH_MIN:
        case OSEO_MATH_POW:
        case OSEO_MATH_RANDOM:
            return false;
        default:
            return true;
    }
}

/*
 * ToNumber over one argument position, reading `undefined` when the
 * call supplied no argument there. The operand stays rooted across the
 * conversion because a ToPrimitive method can allocate and collect.
 */
static OseoResult math_operand(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    size_t index,
    double *value
) {
    OseoValue slot =
        index < argument_count ? arguments[index] : oseo_undefined();
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_to_number(context, slot);
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *value = number_value(result.value);
    return result;
}

/*
 * Convert every argument of a variadic Math function in argument order,
 * replacing each rooted operand with its Number. Every conversion can
 * run user code, so the whole list stays rooted until the last one
 * completes.
 */
static OseoResult math_operand_list(
    OseoContext *context,
    size_t argument_count,
    const OseoRootFrame *frame
) {
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u; index < argument_count; index += 1u) {
        result = oseo_internal_to_number(context, frame->slots[index]);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        frame->slots[index] = result.value;
    }
    return result;
}

/*
 * Math.max and Math.min, 21.3.2.24 and 21.3.2.25. Every argument is
 * converted first, a NaN among them wins over every comparison, and
 * +0 is treated as larger than -0 in both directions.
 */
static double math_extremum(
    const OseoRootFrame *frame,
    size_t argument_count,
    bool maximum
) {
    double best = maximum ? -(double)INFINITY : (double)INFINITY;
    for (size_t index = 0u; index < argument_count; index += 1u) {
        double value = number_value(frame->slots[index]);
        if (isnan(value)) return NAN;
        if (value == 0.0 && best == 0.0) {
            bool value_negative = signbit(value) != 0;
            bool best_negative = signbit(best) != 0;
            if (maximum ? (best_negative && !value_negative)
                        : (!best_negative && value_negative)) {
                best = value;
            }
            continue;
        }
        if (maximum ? value > best : value < best) best = value;
    }
    return best;
}

/*
 * Math.hypot, 21.3.2.18. An infinite operand wins over a NaN one, and a
 * list of zeroes is +0. The finite case scales by the largest magnitude
 * so a representable result cannot overflow an intermediate square.
 */
static double math_hypot(
    const OseoRootFrame *frame,
    size_t argument_count
) {
    bool has_nan = false;
    double largest = 0.0;
    for (size_t index = 0u; index < argument_count; index += 1u) {
        double value = number_value(frame->slots[index]);
        if (isinf(value)) return (double)INFINITY;
        if (isnan(value)) has_nan = true;
        else if (fabs(value) > largest) largest = fabs(value);
    }
    if (has_nan) return NAN;
    if (largest == 0.0) return 0.0;
    double total = 0.0;
    for (size_t index = 0u; index < argument_count; index += 1u) {
        double scaled = number_value(frame->slots[index]) / largest;
        total += scaled * scaled;
    }
    return largest * sqrt(total);
}

static OseoResult math_variadic(
    OseoContext *context,
    size_t operation,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Math arguments are missing.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    /* One slot per argument and no more, so the count cannot overflow. */
    OseoResult result =
        oseo_roots_allocate(context, &frame, argument_count);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    for (size_t index = 0u; index < argument_count; index += 1u) {
        frame.slots[index] = arguments[index];
    }
    result = math_operand_list(context, argument_count, &frame);
    if (result.status == OSEO_STATUS_NORMAL) {
        double value = operation == OSEO_MATH_HYPOT
            ? math_hypot(&frame, argument_count)
            : math_extremum(
                &frame,
                argument_count,
                operation == OSEO_MATH_MAX
            );
        result = normal(oseo_number(value));
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult math_call(
    OseoContext *context,
    size_t operation,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (operation == OSEO_MATH_RANDOM) {
        return normal(oseo_number(math_random(context)));
    }
    if (operation == OSEO_MATH_HYPOT || operation == OSEO_MATH_MAX ||
        operation == OSEO_MATH_MIN) {
        return math_variadic(context, operation, argument_count, arguments);
    }
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "Math arguments are missing.");
    }
    double first = 0.0;
    OseoResult result =
        math_operand(context, argument_count, arguments, 0u, &first);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (math_is_unary(operation)) {
        return normal(oseo_number(math_unary_value(operation, first)));
    }
    double second = 0.0;
    result = math_operand(context, argument_count, arguments, 1u, &second);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (operation == OSEO_MATH_ATAN2) {
        return normal(oseo_number(atan2(first, second)));
    }
    if (operation == OSEO_MATH_IMUL) {
        return normal(oseo_number(math_imul(first, second)));
    }
    return normal(
        oseo_number(oseo_internal_number_exponentiate(first, second))
    );
}

OseoResult oseo_internal_math_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    if (code_id < OSEO_MATH_FUNCTION_CODE_ID_FIRST ||
        code_id > OSEO_MATH_FUNCTION_CODE_ID_LAST) {
        return oseo_unknown_function(context, code_id);
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Math function is not a constructor."
        );
    }
    size_t operation = OSEO_MATH_FUNCTION_CODE_ID_LAST - code_id;
    return math_call(context, operation, argument_count, arguments);
}

static OseoResult create_math_function(
    OseoContext *context,
    size_t operation
) {
    const OseoMathFunction *entry = &math_functions[operation];
    size_t name_length = strlen(entry->name);
    uint16_t units[16];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)entry->name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_MATH_FUNCTION_CODE_ID_LAST - operation,
            environment,
            units,
            name_length,
            entry->length,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_math_property(
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

OseoResult oseo_internal_math_intrinsic(OseoContext *context) {
    OseoValue *slot = &context->intrinsics[OSEO_INTRINSIC_MATH];
    if (is_object(*slot)) return normal(*slot);
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
        *slot = frame.slots[0];
    }
    static const OseoPropertyAttributes constant_attributes =
        {false, false, false, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_MATH_CONSTANT_COUNT;
         index += 1u) {
        result = define_math_property(
            context,
            frame.slots[0],
            math_constants[index].name,
            oseo_number(math_constants[index].value),
            constant_attributes
        );
    }
    static const OseoPropertyAttributes method_attributes =
        {true, false, true, false};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_MATH_FUNCTION_COUNT;
         index += 1u) {
        result = create_math_function(context, index);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_math_property(
            context,
            frame.slots[0],
            math_functions[index].name,
            frame.slots[1],
            method_attributes
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "Math");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        *slot = oseo_undefined();
    } else if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(*slot) : result;
}

OseoResult oseo_internal_install_math_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_math_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_math_property(
            context,
            slots[0],
            "Math",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
