#include "runtime_internal.h"

#include <math.h>
#include <string.h>

/*
 * The BigInt object model: the callable %BigInt% intrinsic, its
 * fixed-width statics, %BigInt.prototype% and its methods, and the
 * value conversions ECMA-262 shares with every consumer of the
 * primitive. Nothing here reads a limb; the representation stays behind
 * the private operations runtime_bigint.c exports.
 */

/* 2**53 - 1, the largest integer ToIndex admits. */
#define BIGINT_INDEX_LIMIT 9007199254740991.0

static OseoValue bigint_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

/*
 * ToBigInt over an already primitive value. Both the callable
 * intrinsic and ToBigInt itself reach this after their own
 * ToPrimitive, so neither observes the operand's conversion twice.
 */
static OseoResult bigint_from_primitive(
    OseoContext *context,
    OseoValue value
) {
    if (is_bigint(value)) return normal(value);
    uint64_t tag = tag_of(value);
    if (tag == OSEO_TAG_BOOLEAN) {
        const char *digit = (value & 1u) != 0u ? "1" : "0";
        return oseo_bigint_literal(context, digit, 10u);
    }
    if (is_string(value)) {
        OseoValue slot = value;
        OseoRootFrame frame = {NULL, &slot, 1u};
        oseo_roots_push(context, &frame);
        bool valid = false;
        OseoResult result = oseo_internal_string_to_bigint(
            context,
            string_object(slot),
            &valid
        );
        oseo_roots_pop(context, &frame);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        if (!valid) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_SYNTAX,
                "Cannot convert this string to a BigInt."
            );
        }
        return result;
    }
    const char *message = is_number(value)
        ? "Cannot convert a number to a BigInt."
        : is_symbol(value)
          ? "Cannot convert a symbol to a BigInt."
          : tag == OSEO_TAG_UNDEFINED
            ? "Cannot convert undefined to a BigInt."
            : tag == OSEO_TAG_NULL
              ? "Cannot convert null to a BigInt."
              : NULL;
    if (message == NULL) {
        return failure(context, "OSEO2001", "Value is not a BigInt operand.");
    }
    return oseo_internal_throw_error(context, OSEO_ERROR_TYPE, message);
}

OseoResult oseo_internal_to_bigint(OseoContext *context, OseoValue value) {
    OseoValue slot = value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_to_primitive(
        context,
        slot,
        OSEO_TO_PRIMITIVE_NUMBER
    );
    slot = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = bigint_from_primitive(context, slot);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * NumberToBigInt(number), 7.1.14. Only an integral Number has an exact
 * BigInt, so NaN, an infinity, and a fractional value are the specified
 * RangeError rather than a rounded result.
 */
static OseoResult bigint_from_number(OseoContext *context, double number) {
    if (!isfinite(number) || trunc(number) != number) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Cannot convert a non-integral number to a BigInt."
        );
    }
    return oseo_internal_bigint_from_integral_number(context, number);
}

/*
 * BigInt ( value ), 21.2.1.1. Its [[Construct]] path always throws before
 * conversion. Its [[Call]] path uses the ToPrimitive result to choose the
 * Number branch or shared ToBigInt without converting the operand again.
 */
static OseoResult bigint_call(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    bool constructing
) {
    if (constructing) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "BigInt is not a constructor."
        );
    }
    OseoValue slot = bigint_argument(argument_count, arguments, 0u);
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_to_primitive(
        context,
        slot,
        OSEO_TO_PRIMITIVE_NUMBER
    );
    slot = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = is_number(slot)
            ? bigint_from_number(context, number_value(slot))
            : bigint_from_primitive(context, slot);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToIndex(value), 7.1.22, reported as the integer it admits. */
static OseoResult bigint_to_index(
    OseoContext *context,
    OseoValue value,
    double *index
) {
    OseoResult number = oseo_internal_to_number(context, value);
    if (number.status != OSEO_STATUS_NORMAL) return number;
    double integer = number_value(number.value);
    if (isnan(integer) || integer == 0.0) integer = 0.0;
    else if (isfinite(integer)) integer = trunc(integer);
    if (!(integer >= 0.0) || integer > BIGINT_INDEX_LIMIT) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "BigInt fixed-width bit count is outside the index range."
        );
    }
    *index = integer;
    return normal(oseo_number(integer));
}

/*
 * BigInt.asIntN ( bits, bigint ) and BigInt.asUintN ( bits, bigint ),
 * 21.2.2.1 and 21.2.2.2. The width converts before the operand, so a
 * bad width is observed first even when both arguments have side
 * effects.
 */
static OseoResult bigint_as_width(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    bool signed_result
) {
    OseoValue slots[2] = {
        bigint_argument(argument_count, arguments, 0u),
        bigint_argument(argument_count, arguments, 1u),
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    double bits = 0.0;
    OseoResult result = bigint_to_index(context, slots[0], &bits);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_bigint(context, slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_bigint_as_width(
            context,
            slots[1],
            bits,
            signed_result
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * thisBigIntValue(value), 21.2.3. %BigInt.prototype% is an ordinary
 * object without a [[BigIntData]] slot, so calling a method directly on
 * it is the same TypeError as calling it on any other receiver.
 */
static OseoResult bigint_this_value(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_bigint(receiver)) return normal(receiver);
    if (is_object(receiver) && ordinary_object(receiver)->primitive_data &&
        is_bigint(ordinary_object(receiver)->primitive_value)) {
        return normal(ordinary_object(receiver)->primitive_value);
    }
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "BigInt.prototype method requires a BigInt receiver."
    );
}

/*
 * BigInt.prototype.toString ( [ radix ] ), 21.2.3.3. The receiver brand
 * check precedes the radix conversion, so an unbranded receiver reports
 * its TypeError even when the radix is also invalid.
 */
static OseoResult bigint_to_string(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = bigint_this_value(context, frame.slots[0]);
    frame.slots[1] = result.value;
    OseoValue radix_argument = bigint_argument(argument_count, arguments, 0u);
    uint32_t radix = 10u;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(radix_argument) != OSEO_TAG_UNDEFINED) {
        frame.slots[0] = radix_argument;
        OseoResult number = oseo_internal_to_number(context, frame.slots[0]);
        if (number.status != OSEO_STATUS_NORMAL) {
            result = number;
        } else {
            double value = number_value(number.value);
            if (isnan(value) || value == 0.0) value = 0.0;
            else if (isfinite(value)) value = trunc(value);
            if (!(value >= 2.0 && value <= 36.0)) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_RANGE,
                    "BigInt.prototype.toString radix must be within 2..36."
                );
            } else {
                radix = (uint32_t)value;
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_bigint_radix_string(
            context,
            frame.slots[1],
            radix
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * BigInt.prototype.toLocaleString ( [ reserved1 [ , reserved2 ] ] ),
 * 21.2.3.2. Without the ECMA-402 Internationalization API, the base
 * specification's own recommended behavior is thisBigIntValue followed
 * by ToString, so the reserved positions are ignored rather than read.
 */
static OseoResult bigint_to_locale_string(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult result = bigint_this_value(context, receiver);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_internal_bigint_string(context, result.value);
}

OseoResult oseo_internal_bigint_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    bool constructing = tag_of(new_target) != OSEO_TAG_UNDEFINED;
    if (code_id == OSEO_BIGINT_CONSTRUCTOR_CODE_ID) {
        return bigint_call(context, argument_count, arguments, constructing);
    }
    if (constructing) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "BigInt method is not a constructor."
        );
    }
    if (code_id == OSEO_BIGINT_AS_INT_N_CODE_ID) {
        return bigint_as_width(context, argument_count, arguments, true);
    }
    if (code_id == OSEO_BIGINT_AS_UINT_N_CODE_ID) {
        return bigint_as_width(context, argument_count, arguments, false);
    }
    if (code_id == OSEO_BIGINT_TO_STRING_CODE_ID) {
        return bigint_to_string(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_BIGINT_TO_LOCALE_STRING_CODE_ID) {
        return bigint_to_locale_string(context, receiver);
    }
    if (code_id == OSEO_BIGINT_VALUE_OF_CODE_ID) {
        return bigint_this_value(context, receiver);
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_bigint_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
) {
    size_t name_length = strlen(name);
    if (name_length > 31u) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    uint16_t units[31];
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoFunctionKind kind = code_id == OSEO_BIGINT_CONSTRUCTOR_CODE_ID
            ? OSEO_FUNCTION_ORDINARY
            : OSEO_FUNCTION_INTERNAL;
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

static OseoResult define_bigint_property(
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

/*
 * Materializes %BigInt% and %BigInt.prototype% together, so a BigInt
 * wrapper reached without naming `BigInt` still finds every specified
 * own property on its prototype chain.
 *
 * `OSEO_INTRINSIC_BIGINT_VALUE_OF` is filled last, so it doubles as the
 * completion marker: a partially built cluster leaves it undefined and
 * the failure path clears every slot the attempt filled, while the
 * uninitialized sentinel reports a reentrant build attempt instead of
 * splitting identities across two concurrent attempts.
 */
static OseoResult bigint_intrinsic_build(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_BIGINT_VALUE_OF];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The BigInt intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();

    result = create_bigint_builtin(
        context,
        OSEO_BIGINT_CONSTRUCTOR_CODE_ID,
        "BigInt",
        1u
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * The ordinary function kind supplies [[Construct]] and its synthetic
         * `prototype` property. Dispatch still rejects every construction
         * before conversion, while IsConstructor consumers can observe the
         * specified slot. %BigInt.prototype% remains an ordinary object with
         * no [[BigIntData]] slot.
         */
        frame.slots[1] = function_object(frame.slots[0])->prototype_object;
        OseoFunction *constructor = function_object(frame.slots[0]);
        constructor->prototype_writable = false;
        context->intrinsics[OSEO_INTRINSIC_BIGINT] = frame.slots[0];
        context->intrinsics[OSEO_INTRINSIC_BIGINT_PROTOTYPE] = frame.slots[1];
    }
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_BIGINT_AS_INT_N,
        OSEO_INTRINSIC_BIGINT_AS_UINT_N,
    };
    static const size_t static_codes[] = {
        OSEO_BIGINT_AS_INT_N_CODE_ID,
        OSEO_BIGINT_AS_UINT_N_CODE_ID,
    };
    static const char *const static_names[] = {"asIntN", "asUintN"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_bigint_builtin(
            context,
            static_codes[index],
            static_names[index],
            2u
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[static_intrinsics[index]] = frame.slots[2];
            result = define_bigint_property(
                context,
                frame.slots[0],
                static_names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_bigint_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[0],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const size_t method_codes[] = {
        OSEO_BIGINT_TO_STRING_CODE_ID,
        OSEO_BIGINT_TO_LOCALE_STRING_CODE_ID,
    };
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_BIGINT_TO_STRING,
        OSEO_INTRINSIC_BIGINT_TO_LOCALE_STRING,
    };
    static const char *const method_names[] = {"toString", "toLocaleString"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_bigint_builtin(
            context,
            method_codes[index],
            method_names[index],
            0u
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[method_intrinsics[index]] = frame.slots[2];
            result = define_bigint_property(
                context,
                frame.slots[1],
                method_names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "BigInt");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_bigint_builtin(
            context,
            OSEO_BIGINT_VALUE_OF_CODE_ID,
            "valueOf",
            0u
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_bigint_property(
            context,
            frame.slots[1],
            "valueOf",
            frame.slots[2],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_BIGINT_PROTOTYPE] =
            oseo_undefined();
        for (size_t index = OSEO_INTRINSIC_BIGINT;
             index <= OSEO_INTRINSIC_BIGINT_VALUE_OF;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue value_of = frame.slots[2];
    context->intrinsics[OSEO_INTRINSIC_BIGINT_VALUE_OF] = value_of;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(value_of);
}

OseoResult oseo_internal_bigint_intrinsic(OseoContext *context) {
    OseoResult built = bigint_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_BIGINT]);
}

OseoResult oseo_internal_install_bigint_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_bigint_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_bigint_property(
            context,
            slots[0],
            "BigInt",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
