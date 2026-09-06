#include "runtime_internal.h"

#include <string.h>

/*
 * The four URI handling functions of 19.2.6: encodeURI,
 * encodeURIComponent, decodeURI, and decodeURIComponent, together with
 * the Encode and Decode operations they share and the UTF-8
 * transformation both directions run. Each function is an ordinary
 * built-in function that is not a constructor, and the global object
 * binds each as a writable, non-enumerable, configurable property.
 */

/*
 * One URI handling function. The array order is the order the global
 * installation creates its properties in and the order the code IDs
 * count down from `OSEO_URI_FUNCTION_CODE_ID_LAST`, so an entry's index
 * is the only identity the builder and the dispatcher share.
 */
typedef enum {
    OSEO_URI_DECODE_URI = 0,
    OSEO_URI_DECODE_URI_COMPONENT = 1,
    OSEO_URI_ENCODE_URI = 2,
    OSEO_URI_ENCODE_URI_COMPONENT = 3,
} OseoUriOperation;

typedef struct {
    const char *name;
    OseoIntrinsic intrinsic;
} OseoUriFunction;

static const OseoUriFunction uri_functions[] = {
    {"decodeURI", OSEO_INTRINSIC_DECODE_URI},
    {"decodeURIComponent", OSEO_INTRINSIC_DECODE_URI_COMPONENT},
    {"encodeURI", OSEO_INTRINSIC_ENCODE_URI},
    {"encodeURIComponent", OSEO_INTRINSIC_ENCODE_URI_COMPONENT},
};

_Static_assert(
    sizeof(uri_functions) / sizeof(uri_functions[0]) ==
        OSEO_URI_FUNCTION_COUNT,
    "The URI function table must match its reviewed code-ID range."
);

/*
 * The reserved code units both `encodeURI` and `decodeURI` name. Encode
 * leaves them unescaped and Decode preserves their escape sequences, so
 * one round trip through the pair is the identity on them.
 */
static const char uri_reserved_units[] = ";/?:@&=+$,#";

/*
 * The eight marks 19.2.6.5 leaves unescaped beside the ASCII word
 * characters, which are the letters, the digits, and the underscore.
 */
static const char uri_unreserved_marks[] = "-.!~*'()";

/*
 * True when `unit` is one of the ASCII units `set` lists. A unit outside
 * ASCII can never be one, so the comparison never truncates a code unit
 * into a char.
 */
static bool uri_member(const char *set, uint16_t unit) {
    if (unit == 0u || unit > 0x7fu) return false;
    for (const char *entry = set; *entry != '\0'; entry += 1) {
        if ((uint16_t)(unsigned char)*entry == unit) return true;
    }
    return false;
}

/*
 * The unreserved set every Encode leaves alone: the ASCII word
 * characters and the eight marks 19.2.6.5 names. `encodeURIComponent`
 * escapes everything else.
 */
static bool uri_always_unescaped(uint16_t unit) {
    if (unit >= (uint16_t)'A' && unit <= (uint16_t)'Z') return true;
    if (unit >= (uint16_t)'a' && unit <= (uint16_t)'z') return true;
    if (unit >= (uint16_t)'0' && unit <= (uint16_t)'9') return true;
    if (unit == (uint16_t)'_') return true;
    return uri_member(uri_unreserved_marks, unit);
}

/* True when `unit` is one of the reserved units listed above. */
static bool uri_reserved(uint16_t unit) {
    return uri_member(uri_reserved_units, unit);
}

/* The URIError every malformed operand raises, 19.2.6.5 and 19.2.6.6. */
static OseoResult uri_error(OseoContext *context, const char *message) {
    return oseo_internal_throw_error(context, OSEO_ERROR_URI, message);
}

/*
 * The UTF-8 octets of one Unicode code point, written into `octets` and
 * counted by the return value. The code point is already known to be a
 * scalar value, so the encoding is between one and four octets.
 */
static size_t uri_utf8_octets(uint32_t code_point, uint8_t octets[4]) {
    if (code_point <= 0x7fu) {
        octets[0] = (uint8_t)code_point;
        return 1u;
    }
    if (code_point <= 0x7ffu) {
        octets[0] = (uint8_t)(0xc0u | (code_point >> 6u));
        octets[1] = (uint8_t)(0x80u | (code_point & 0x3fu));
        return 2u;
    }
    if (code_point <= 0xffffu) {
        octets[0] = (uint8_t)(0xe0u | (code_point >> 12u));
        octets[1] = (uint8_t)(0x80u | ((code_point >> 6u) & 0x3fu));
        octets[2] = (uint8_t)(0x80u | (code_point & 0x3fu));
        return 3u;
    }
    octets[0] = (uint8_t)(0xf0u | (code_point >> 18u));
    octets[1] = (uint8_t)(0x80u | ((code_point >> 12u) & 0x3fu));
    octets[2] = (uint8_t)(0x80u | ((code_point >> 6u) & 0x3fu));
    octets[3] = (uint8_t)(0x80u | (code_point & 0x3fu));
    return 4u;
}

/*
 * Decode one well-formed UTF-8 sequence of `count` octets into
 * `code_point`, reporting false for every sequence the Unicode standard
 * does not admit. That rejects a continuation octet out of the 0x80 to
 * 0xBF range, an overlong encoding, a surrogate code point, and a value
 * past U+10FFFF, which is what "a valid UTF-8 encoding of a Unicode code
 * point" means in step 4.c.viii.6 of Decode.
 */
static bool uri_utf8_code_point(
    const uint8_t *octets,
    size_t count,
    uint32_t *code_point
) {
    for (size_t index = 1u; index < count; index += 1u) {
        if (octets[index] < 0x80u || octets[index] > 0xbfu) return false;
    }
    uint32_t value;
    if (count == 2u) {
        value = ((uint32_t)(octets[0] & 0x1fu) << 6u) |
            (uint32_t)(octets[1] & 0x3fu);
        if (value < 0x80u) return false;
    } else if (count == 3u) {
        value = ((uint32_t)(octets[0] & 0x0fu) << 12u) |
            ((uint32_t)(octets[1] & 0x3fu) << 6u) |
            (uint32_t)(octets[2] & 0x3fu);
        if (value < 0x800u) return false;
        if (value >= 0xd800u && value <= 0xdfffu) return false;
    } else {
        value = ((uint32_t)(octets[0] & 0x07u) << 18u) |
            ((uint32_t)(octets[1] & 0x3fu) << 12u) |
            ((uint32_t)(octets[2] & 0x3fu) << 6u) |
            (uint32_t)(octets[3] & 0x3fu);
        if (value < 0x10000u || value > 0x10ffffu) return false;
    }
    *code_point = value;
    return true;
}

/* The value of one hexadecimal digit, or 16 for every other unit. */
static unsigned uri_hex_digit(uint16_t unit) {
    if (unit >= (uint16_t)'0' && unit <= (uint16_t)'9') {
        return (unsigned)(unit - (uint16_t)'0');
    }
    if (unit >= (uint16_t)'A' && unit <= (uint16_t)'F') {
        return (unsigned)(unit - (uint16_t)'A') + 10u;
    }
    if (unit >= (uint16_t)'a' && unit <= (uint16_t)'f') {
        return (unsigned)(unit - (uint16_t)'a') + 10u;
    }
    return 16u;
}

/*
 * ParseHexOctet(string, position), 19.2.6.4. The caller has already
 * checked that two units follow `position`. A unit pair the HexDigits
 * grammar does not accept reports false rather than an octet.
 */
static bool uri_hex_octet(
    const uint16_t *units,
    size_t position,
    uint8_t *octet
) {
    unsigned high = uri_hex_digit(units[position]);
    unsigned low = uri_hex_digit(units[position + 1u]);
    if (high > 15u || low > 15u) return false;
    *octet = (uint8_t)(high * 16u + low);
    return true;
}

/* Encode(string, extraUnescaped), 19.2.6.5, appended into `builder`. */
static OseoResult uri_encode(
    OseoContext *context,
    OseoValue string_value,
    bool escape_reserved,
    OseoStringBuilder *builder
) {
    static const char hex_digits[] = "0123456789ABCDEF";
    const OseoString *string = string_object(string_value);
    size_t length = string->length;
    size_t index = 0u;
    OseoResult result = normal(oseo_undefined());
    while (index < length) {
        uint16_t unit = string->units[index];
        if (uri_always_unescaped(unit) ||
            (!escape_reserved && uri_reserved(unit))) {
            result = oseo_internal_string_builder_append(
                context,
                builder,
                &unit,
                1u
            );
            if (result.status != OSEO_STATUS_NORMAL) return result;
            index += 1u;
            continue;
        }
        /* CodePointAt(string, index), 11.1.4. */
        uint32_t code_point = (uint32_t)unit;
        size_t consumed = 1u;
        if (unit >= 0xd800u && unit <= 0xdbffu && index + 1u < length &&
            string->units[index + 1u] >= 0xdc00u &&
            string->units[index + 1u] <= 0xdfffu) {
            code_point = 0x10000u +
                (((uint32_t)unit - 0xd800u) << 10u) +
                ((uint32_t)string->units[index + 1u] - 0xdc00u);
            consumed = 2u;
        } else if (unit >= 0xd800u && unit <= 0xdfffu) {
            return uri_error(
                context,
                "URI encoding received an unpaired surrogate."
            );
        }
        index += consumed;
        uint8_t octets[4];
        size_t octet_count = uri_utf8_octets(code_point, octets);
        for (size_t octet = 0u; octet < octet_count; octet += 1u) {
            uint16_t escape[3] = {
                (uint16_t)'%',
                (uint16_t)hex_digits[octets[octet] >> 4u],
                (uint16_t)hex_digits[octets[octet] & 0x0fu],
            };
            result = oseo_internal_string_builder_append(
                context,
                builder,
                escape,
                3u
            );
            if (result.status != OSEO_STATUS_NORMAL) return result;
        }
    }
    return result;
}

/* Decode(string, preserveEscapeSet), 19.2.6.6, appended into `builder`. */
static OseoResult uri_decode(
    OseoContext *context,
    OseoValue string_value,
    bool preserve_reserved,
    OseoStringBuilder *builder
) {
    const OseoString *string = string_object(string_value);
    size_t length = string->length;
    size_t index = 0u;
    OseoResult result = normal(oseo_undefined());
    while (index < length) {
        uint16_t unit = string->units[index];
        if (unit != (uint16_t)'%') {
            result = oseo_internal_string_builder_append(
                context,
                builder,
                &unit,
                1u
            );
            if (result.status != OSEO_STATUS_NORMAL) return result;
            index += 1u;
            continue;
        }
        size_t escape_start = index;
        uint8_t octets[4];
        if (index + 3u > length ||
            !uri_hex_octet(string->units, index + 1u, &octets[0])) {
            return uri_error(
                context,
                "URI decoding received a malformed escape sequence."
            );
        }
        index += 2u;
        /* The number of leading 1 bits in the first octet. */
        size_t sequence_length = 0u;
        for (uint8_t probe = octets[0]; (probe & 0x80u) != 0u; probe <<= 1u) {
            sequence_length += 1u;
        }
        if (sequence_length == 0u) {
            uint16_t decoded = (uint16_t)octets[0];
            if (preserve_reserved && uri_reserved(decoded)) {
                result = oseo_internal_string_builder_append(
                    context,
                    builder,
                    string->units + escape_start,
                    3u
                );
            } else {
                result = oseo_internal_string_builder_append(
                    context,
                    builder,
                    &decoded,
                    1u
                );
            }
            if (result.status != OSEO_STATUS_NORMAL) return result;
            index += 1u;
            continue;
        }
        if (sequence_length == 1u || sequence_length > 4u) {
            return uri_error(
                context,
                "URI decoding received a malformed UTF-8 sequence."
            );
        }
        for (size_t octet = 1u; octet < sequence_length; octet += 1u) {
            index += 1u;
            if (index + 3u > length ||
                string->units[index] != (uint16_t)'%' ||
                !uri_hex_octet(string->units, index + 1u, &octets[octet])) {
                return uri_error(
                    context,
                    "URI decoding received a malformed escape sequence."
                );
            }
            index += 2u;
        }
        uint32_t code_point = 0u;
        if (!uri_utf8_code_point(octets, sequence_length, &code_point)) {
            return uri_error(
                context,
                "URI decoding received a malformed UTF-8 sequence."
            );
        }
        /* UTF16EncodeCodePoint(code_point), 11.1.1. */
        if (code_point <= 0xffffu) {
            uint16_t decoded = (uint16_t)code_point;
            result = oseo_internal_string_builder_append(
                context,
                builder,
                &decoded,
                1u
            );
        } else {
            uint32_t remainder = code_point - 0x10000u;
            uint16_t pair[2] = {
                (uint16_t)(0xd800u + (remainder >> 10u)),
                (uint16_t)(0xdc00u + (remainder & 0x3ffu)),
            };
            result = oseo_internal_string_builder_append(
                context,
                builder,
                pair,
                2u
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) return result;
        index += 1u;
    }
    return result;
}

/*
 * One URI handling function call. Every operation converts its single
 * argument with ToString first, so an abrupt conversion is observed
 * before any escape sequence is inspected.
 */
static OseoResult uri_call(
    OseoContext *context,
    size_t operation,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (argument_count > 0u && arguments == NULL) {
        return failure(context, "OSEO2001", "URI arguments are missing.");
    }
    OseoValue slots[1] = {
        argument_count > 0u ? arguments[0] : oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoStringBuilder builder = {NULL, 0u, 0u};
    OseoResult result = oseo_internal_value_string(context, slots[0]);
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        if (operation == OSEO_URI_ENCODE_URI ||
            operation == OSEO_URI_ENCODE_URI_COMPONENT) {
            result = uri_encode(
                context,
                slots[0],
                operation == OSEO_URI_ENCODE_URI_COMPONENT,
                &builder
            );
        } else {
            result = uri_decode(
                context,
                slots[0],
                operation == OSEO_URI_DECODE_URI,
                &builder
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
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_uri_builtin_dispatch(
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
    if (code_id < OSEO_URI_FUNCTION_CODE_ID_FIRST ||
        code_id > OSEO_URI_FUNCTION_CODE_ID_LAST) {
        return oseo_unknown_function(context, code_id);
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "URI handling function is not a constructor."
        );
    }
    size_t operation = OSEO_URI_FUNCTION_CODE_ID_LAST - code_id;
    return uri_call(context, operation, argument_count, arguments);
}

/* The table index of one URI handling function intrinsic. */
static size_t uri_operation(OseoIntrinsic intrinsic) {
    return (size_t)(intrinsic - OSEO_INTRINSIC_DECODE_URI);
}

OseoResult oseo_internal_uri_intrinsic(
    OseoContext *context,
    OseoIntrinsic intrinsic
) {
    OseoValue *slot = &context->intrinsics[intrinsic];
    if (is_object(*slot)) return normal(*slot);
    size_t operation = uri_operation(intrinsic);
    const OseoUriFunction *entry = &uri_functions[operation];
    size_t name_length = strlen(entry->name);
    uint16_t units[24];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)entry->name[index];
    }
    size_t entry_allocations = context->allocations;
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_URI_FUNCTION_CODE_ID_LAST - operation,
            environment,
            units,
            name_length,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *slot = result.value;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    return normal(*slot);
}

OseoResult oseo_internal_install_uri_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(slots[0]);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_URI_FUNCTION_COUNT;
         index += 1u) {
        result = oseo_internal_uri_intrinsic(
            context,
            uri_functions[index].intrinsic
        );
        slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_ascii_string(
            context,
            uri_functions[index].name
        );
        slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
