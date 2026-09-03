#include "runtime_internal.h"

#include <math.h>
#include <string.h>

/*
 * The DataView constructor, its prototype accessors, and the eleven get
 * and eleven set element accessors.
 *
 * A view never owns a Data Block. It holds only its buffer's value, so
 * every access rereads that buffer's current pointer, byte length, and
 * detached flag, and the collector keeps the block alive through the
 * buffer rather than through the view. Nothing here frees a block, and
 * nothing here caches one across a safepoint.
 */

/* Element Size for each element type, in bytes. */
static const size_t data_view_element_size[OSEO_DATA_VIEW_ELEMENT_COUNT] = {
    1u, 1u, 2u, 2u, 4u, 4u, 2u, 4u, 8u, 8u, 8u,
};

static const char *const data_view_get_names[OSEO_DATA_VIEW_ELEMENT_COUNT] = {
    "getInt8",
    "getUint8",
    "getInt16",
    "getUint16",
    "getInt32",
    "getUint32",
    "getFloat16",
    "getFloat32",
    "getFloat64",
    "getBigInt64",
    "getBigUint64",
};

static const char *const data_view_set_names[OSEO_DATA_VIEW_ELEMENT_COUNT] = {
    "setInt8",
    "setUint8",
    "setInt16",
    "setUint16",
    "setInt32",
    "setUint32",
    "setFloat16",
    "setFloat32",
    "setFloat64",
    "setBigInt64",
    "setBigUint64",
};

/* IsBigIntElementType(type). */
static bool data_view_element_is_bigint(OseoDataViewElement element) {
    return element == OSEO_DATA_VIEW_BIGINT64 ||
        element == OSEO_DATA_VIEW_BIGUINT64;
}

/*
 * The IEEE 754 binary interchange encoding of `value` in the format with
 * `significand_bits` stored significand bits and `exponent_bits`
 * exponent bits, rounded to nearest with ties to even.
 *
 * The whole computation is exact integer arithmetic over the operand's
 * own binary64 encoding, so no narrowing floating conversion happens and
 * an operand outside the destination range cannot reach one. ECMA-262
 * leaves the encoding of a NaN to the implementation for every format,
 * so a NaN becomes this format's canonical quiet NaN. A zero keeps its
 * sign.
 */
static uint64_t encode_ieee(
    double value,
    unsigned significand_bits,
    unsigned exponent_bits
) {
    uint64_t source;
    memcpy(&source, &value, sizeof(source));
    uint64_t sign = (source >> 63u) << (significand_bits + exponent_bits);
    uint64_t exponent_mask = (UINT64_C(1) << exponent_bits) - 1u;
    uint64_t infinity = exponent_mask << significand_bits;
    uint64_t implicit = UINT64_C(1) << significand_bits;
    uint64_t mantissa = source & UINT64_C(0x000fffffffffffff);
    int source_exponent = (int)((source >> 52u) & UINT64_C(0x7ff));
    if (source_exponent == 0x7ff) {
        if (mantissa != 0u) return sign | infinity | (implicit >> 1u);
        return sign | infinity;
    }
    /* |value| is exactly `magnitude` times 2**scale. */
    uint64_t magnitude;
    int scale;
    if (source_exponent == 0) {
        magnitude = mantissa;
        scale = -1074;
    } else {
        magnitude = mantissa | (UINT64_C(1) << 52u);
        scale = source_exponent - 1075;
    }
    if (magnitude == 0u) return sign;
    int highest = 63;
    while ((magnitude >> (unsigned)highest) == 0u) highest -= 1;
    int exponent = highest + scale;
    int bias = (int)(exponent_mask >> 1u);
    if (exponent > bias) return sign | infinity;
    /* A normal of this exponent has its own quantum; every subnormal
     * shares one, and rounding a subnormal up can reach the smallest
     * normal, which is why the two cases stay distinct below. */
    int minimum = 1 - bias;
    bool subnormal = exponent < minimum;
    int quantum = (subnormal ? minimum : exponent) - (int)significand_bits;
    int shift = quantum - scale;
    uint64_t rounded;
    if (shift <= 0) {
        /* The operand is already a multiple of the quantum; the result
         * stays below 2**(significand_bits + 1), so the shift is exact. */
        rounded = magnitude << (unsigned)(-shift);
    } else if (shift >= 64) {
        /* The exact quotient is below one half, so nothing rounds up. */
        rounded = 0u;
    } else {
        uint64_t truncated = magnitude >> (unsigned)shift;
        uint64_t remainder =
            magnitude & ((UINT64_C(1) << (unsigned)shift) - 1u);
        uint64_t half = UINT64_C(1) << (unsigned)(shift - 1);
        if (remainder > half || (remainder == half && (truncated & 1u) != 0u)) {
            truncated += 1u;
        }
        rounded = truncated;
    }
    if (subnormal) {
        /* A subnormal, or the smallest normal the rounding carried into. */
        if (rounded < implicit) return sign | rounded;
        return sign | implicit;
    }
    if (rounded == implicit << 1u) {
        rounded >>= 1u;
        exponent += 1;
        if (exponent > bias) return sign | infinity;
    }
    return sign | ((uint64_t)(exponent + bias) << significand_bits) |
        (rounded - implicit);
}

/* The exact Number one binary interchange encoding denotes. */
static double decode_ieee(
    uint64_t bits,
    unsigned significand_bits,
    unsigned exponent_bits
) {
    uint64_t exponent_mask = (UINT64_C(1) << exponent_bits) - 1u;
    uint64_t implicit = UINT64_C(1) << significand_bits;
    bool negative =
        ((bits >> (significand_bits + exponent_bits)) & 1u) != 0u;
    uint64_t field = (bits >> significand_bits) & exponent_mask;
    uint64_t fraction = bits & (implicit - 1u);
    int bias = (int)(exponent_mask >> 1u);
    double magnitude;
    if (field == exponent_mask) {
        magnitude = fraction == 0u ? (double)INFINITY : (double)NAN;
    } else if (field == 0u) {
        magnitude =
            ldexp((double)fraction, 1 - bias - (int)significand_bits);
    } else {
        magnitude = ldexp(
            (double)(fraction | implicit),
            (int)field - bias - (int)significand_bits
        );
    }
    return negative ? -magnitude : magnitude;
}

/*
 * ToInt8, ToUint8, ToInt16, ToUint16, ToInt32, and ToUint32 over an
 * already converted Number: the exact truncated value modulo 2**bits.
 * `fmod` is exact for binary64 operands, so the wrapped value is the
 * specified integer and its conversion to an unsigned host integer is
 * in range.
 */
static uint64_t number_to_wrapped(double value, size_t bytes) {
    if (!isfinite(value)) return 0u;
    double modulus = ldexp(1.0, (int)(bytes * 8u));
    double wrapped = fmod(trunc(value), modulus);
    if (wrapped < 0.0) wrapped += modulus;
    return (uint64_t)wrapped;
}

/*
 * The signed reading of a `bytes`-wide two's-complement encoding. Only
 * the one, two, and four byte element types reach it, so the value and
 * the modulus are both exact binary64 integers.
 */
static double wrapped_to_signed(uint64_t bits, size_t bytes) {
    double modulus = ldexp(1.0, (int)(bytes * 8u));
    double magnitude = (double)bits;
    return magnitude >= modulus / 2.0 ? magnitude - modulus : magnitude;
}

/* NumericToRawBytes for every element type whose value is a Number. */
static uint64_t number_to_raw_bytes(
    double value,
    OseoDataViewElement element
) {
    if (element == OSEO_DATA_VIEW_FLOAT16) return encode_ieee(value, 10u, 5u);
    if (element == OSEO_DATA_VIEW_FLOAT32) return encode_ieee(value, 23u, 8u);
    if (element == OSEO_DATA_VIEW_FLOAT64) {
        uint64_t bits;
        memcpy(&bits, &value, sizeof(bits));
        return bits;
    }
    return number_to_wrapped(value, data_view_element_size[element]);
}

/* RawBytesToNumeric for every element type whose value is a Number. */
static double raw_bytes_to_number(
    uint64_t bits,
    OseoDataViewElement element
) {
    if (element == OSEO_DATA_VIEW_FLOAT16) return decode_ieee(bits, 10u, 5u);
    if (element == OSEO_DATA_VIEW_FLOAT32) return decode_ieee(bits, 23u, 8u);
    if (element == OSEO_DATA_VIEW_FLOAT64) {
        double value;
        memcpy(&value, &bits, sizeof(value));
        return value;
    }
    if (element == OSEO_DATA_VIEW_INT8 || element == OSEO_DATA_VIEW_INT16 ||
        element == OSEO_DATA_VIEW_INT32) {
        return wrapped_to_signed(bits, data_view_element_size[element]);
    }
    return (double)bits;
}

/* RequireInternalSlot(this, [[DataView]]). */
static OseoResult data_view_receiver(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_data_view(receiver)) return normal(receiver);
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "DataView method receiver is not a DataView."
    );
}

/*
 * IsViewOutOfBounds over a witness record taken now. A detached buffer
 * is out of bounds, a length-tracking view only needs its offset to
 * still be inside the buffer, and a zero-length view exactly at the end
 * of the buffer is in bounds.
 */
static bool data_view_out_of_bounds(const OseoDataView *view) {
    const OseoArrayBuffer *buffer = array_buffer_object(view->buffer);
    if (buffer->detached) return true;
    size_t length = buffer->byte_length;
    if (view->byte_offset > length) return true;
    if (view->track_length) return false;
    return view->byte_length > length - view->byte_offset;
}

/*
 * GetViewByteLength. The caller has already rejected an out-of-bounds
 * view, so a tracking view's offset is inside its buffer and the
 * subtraction cannot wrap.
 */
static size_t data_view_length(const OseoDataView *view) {
    if (!view->track_length) return view->byte_length;
    return array_buffer_object(view->buffer)->byte_length - view->byte_offset;
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%DataView.prototype%"). The
 * `prototype` read is the specified Get, so a new target whose property
 * is an accessor runs it, and a non-object result falls back to the
 * realm prototype.
 */
static OseoResult data_view_prototype_from_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue *prototype
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_ascii_string(context, "prototype");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_DATA_VIEW_PROTOTYPE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * One DataView over `buffer`. The record is published with its final
 * slots, so the collector traces the buffer from the moment the view
 * exists and the view never appears with an untraced or absent buffer.
 */
static OseoResult data_view_allocate(
    OseoContext *context,
    OseoValue prototype,
    OseoValue buffer,
    size_t byte_offset,
    size_t byte_length,
    bool track_length
) {
    OseoValue slots[2] = {prototype, buffer};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoDataView *view =
        oseo_internal_allocate_heap_bytes(context, sizeof(*view));
    if (view == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "DataView allocation failed.");
    }
    view->ordinary.prototype = slots[0];
    view->ordinary.properties = NULL;
    view->ordinary.property_capacity = 0u;
    view->ordinary.property_count = 0u;
    view->ordinary.private_elements = NULL;
    view->ordinary.private_element_capacity = 0u;
    view->ordinary.private_element_count = 0u;
    view->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    view->ordinary.array_length = 0u;
    view->ordinary.dictionary = false;
    view->ordinary.length_writable = false;
    view->ordinary.extensible = true;
    view->ordinary.module_namespace = false;
    view->ordinary.global_object = false;
    view->ordinary.error_data = false;
    view->ordinary.number_data = false;
    view->ordinary.number_value = oseo_undefined();
    view->ordinary.primitive_data = false;
    view->ordinary.primitive_value = oseo_undefined();
    view->ordinary.primitive_wrapper_methods_initialized = false;
    view->ordinary.virtual_string_iterator = false;
    view->ordinary.virtual_string_iterator_configurable = false;
    view->ordinary.virtual_string_iterator_enumerable = false;
    view->ordinary.virtual_string_iterator_writable = false;
    view->ordinary.array_iterator = false;
    view->ordinary.iterator_array = oseo_undefined();
    view->ordinary.iterator_index = 0u;
    view->ordinary.regexp_string_iterator = false;
    view->ordinary.regexp_iterator_regexp = oseo_undefined();
    view->ordinary.regexp_iterator_subject = oseo_undefined();
    view->ordinary.regexp_iterator_global = false;
    view->ordinary.regexp_iterator_unicode = false;
    view->ordinary.regexp_iterator_complete = false;
    view->ordinary.async_from_sync = false;
    view->ordinary.async_sync_iterator = oseo_undefined();
    view->ordinary.wrap_for_valid_iterator = false;
    view->ordinary.wrapped_iterator = oseo_undefined();
    view->ordinary.wrapped_next = oseo_undefined();
    view->ordinary.generator = NULL;
    view->ordinary.arguments_object = false;
    view->ordinary.mapped_arguments = false;
    view->buffer = slots[1];
    view->byte_offset = byte_offset;
    view->byte_length = byte_length;
    view->track_length = track_length;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &view->ordinary.header,
        OSEO_HEAP_DATA_VIEW
    );
    oseo_roots_pop(context, &frame);
    return published;
}

/*
 * The DataView constructor, 25.3.2.1. Both length arguments run through
 * ToIndex before the buffer is inspected again, the new target's
 * `prototype` read sits between the two validations the specification
 * performs, and the second validation observes whatever that arbitrary
 * code did to the buffer.
 */
static OseoResult data_view_construct(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView requires new."
        );
    }
    OseoValue buffer = argument_count == 0u ? oseo_undefined() : arguments[0];
    if (!is_array_buffer(buffer)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView requires an ArrayBuffer."
        );
    }
    OseoValue slots[3] = {new_target, buffer, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    double offset = 0.0;
    OseoResult result = oseo_internal_to_index(
        context,
        argument_count < 2u ? oseo_undefined() : arguments[1],
        "DataView byte offset is outside the admitted index range.",
        &offset
    );
    /* The conversion is a safepoint and can run arbitrary code, so the
     * buffer record is reacquired from the rooted value every time. */
    if (result.status == OSEO_STATUS_NORMAL &&
        array_buffer_object(slots[1])->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView requires an attached ArrayBuffer."
        );
    }
    double buffer_length = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        buffer_length = (double)array_buffer_object(slots[1])->byte_length;
        if (offset > buffer_length) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "DataView byte offset is past the end of its buffer."
            );
        }
    }
    OseoValue requested =
        argument_count < 3u ? oseo_undefined() : arguments[2];
    bool track_length = false;
    double length = 0.0;
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(requested) == OSEO_TAG_UNDEFINED) {
        /* A resizable buffer gives an absent length the specification's
         * `auto`; a fixed-length buffer fixes it now. */
        track_length = array_buffer_object(slots[1])->resizable;
        length = track_length ? 0.0 : buffer_length - offset;
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_index(
            context,
            requested,
            "DataView byte length is outside the admitted index range.",
            &length
        );
        /*
         * The specification compares against the byte length it read
         * before this conversion, not a fresh one, so a conversion that
         * grows a resizable buffer still fails this bound.
         */
        if (result.status == OSEO_STATUS_NORMAL &&
            offset + length > buffer_length) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "DataView byte length is past the end of its buffer."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = data_view_prototype_from_target(
            context,
            slots[0],
            &slots[2]
        );
    }
    /* The `prototype` read is arbitrary code, so the buffer may have
     * been detached or resized while it ran. */
    if (result.status == OSEO_STATUS_NORMAL &&
        array_buffer_object(slots[1])->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView buffer became detached."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        double current = (double)array_buffer_object(slots[1])->byte_length;
        if (offset > current) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "DataView byte offset is past the end of its buffer."
            );
        } else if (tag_of(requested) != OSEO_TAG_UNDEFINED &&
                   offset + length > current) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "DataView byte length is past the end of its buffer."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /* Both values passed a comparison against a live byte length, so
         * each is inside the reviewed Data Block limit and converts
         * exactly. */
        result = data_view_allocate(
            context,
            slots[2],
            slots[1],
            (size_t)offset,
            (size_t)length,
            track_length
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult data_view_buffer_accessor(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult checked = data_view_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return normal(data_view_object(receiver)->buffer);
}

/*
 * Both length accessors reject a view whose buffer detached or shrank
 * out from under it, which is the one place a detached buffer is a
 * TypeError rather than a reported zero.
 */
static OseoResult data_view_measure(
    OseoContext *context,
    OseoValue receiver,
    bool report_offset
) {
    OseoResult checked = data_view_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    const OseoDataView *view = data_view_object(receiver);
    if (data_view_out_of_bounds(view)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView is outside the bounds of its buffer."
        );
    }
    return normal(oseo_number(
        (double)(report_offset ? view->byte_offset : data_view_length(view))
    ));
}

/*
 * The bounds shared by GetViewValue and SetViewValue, run after every
 * conversion the specification orders first. `offset` reports the index
 * of the element inside the buffer's Data Block.
 */
static OseoResult data_view_locate(
    OseoContext *context,
    OseoValue receiver,
    double request,
    OseoDataViewElement element,
    size_t *offset
) {
    const OseoDataView *view = data_view_object(receiver);
    if (data_view_out_of_bounds(view)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView is outside the bounds of its buffer."
        );
    }
    size_t view_size = data_view_length(view);
    size_t element_size = data_view_element_size[element];
    /* The first comparison keeps the conversion below in range; the
     * second is `request + elementSize > viewSize` written so that no
     * host addition can wrap. */
    if (!(request <= (double)view_size) ||
        element_size > view_size - (size_t)request) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "DataView access is outside the bounds of its view."
        );
    }
    *offset = view->byte_offset + (size_t)request;
    return normal(oseo_undefined());
}

/*
 * GetValueFromBuffer's byte order. The bytes are assembled through a
 * local copy rather than a cast, so no access depends on the Data Block
 * being aligned for the element type.
 */
static uint64_t data_view_load(
    const OseoDataView *view,
    size_t offset,
    size_t element_size,
    bool little_endian
) {
    const OseoArrayBuffer *buffer = array_buffer_object(view->buffer);
    uint8_t raw[8] = {0};
    /* The bounds proved that `element_size` bytes lie inside the block,
     * so the block exists and the copy stays in range. */
    memcpy(raw, buffer->data + offset, element_size);
    uint64_t bits = 0u;
    for (size_t index = element_size; index > 0u; index -= 1u) {
        size_t byte = little_endian ? index - 1u : element_size - index;
        bits = (bits << 8u) | (uint64_t)raw[byte];
    }
    return bits;
}

/* SetValueInBuffer's byte order, with the same alignment independence. */
static void data_view_store(
    const OseoDataView *view,
    size_t offset,
    size_t element_size,
    bool little_endian,
    uint64_t bits
) {
    OseoArrayBuffer *buffer = array_buffer_object(view->buffer);
    uint8_t raw[8] = {0};
    for (size_t index = 0u; index < element_size; index += 1u) {
        size_t byte = little_endian ? index : element_size - 1u - index;
        raw[byte] = (uint8_t)(bits & 0xffu);
        bits >>= 8u;
    }
    memcpy(buffer->data + offset, raw, element_size);
}

/* GetViewValue(view, requestIndex, isLittleEndian, type), 25.3.1.1. */
static OseoResult data_view_get(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoDataViewElement element
) {
    OseoResult checked = data_view_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue slot = receiver;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    double request = 0.0;
    OseoResult result = oseo_internal_to_index(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0],
        "DataView byte offset is outside the admitted index range.",
        &request
    );
    size_t element_size = data_view_element_size[element];
    /* A one-byte element has no byte order, so the specification passes
     * true rather than reading the argument. */
    bool little_endian = element_size == 1u ||
        (argument_count > 1u && oseo_to_boolean(arguments[1]));
    size_t offset = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        /* The conversion is a safepoint, so the view and its buffer are
         * reread from the rooted receiver. */
        result = data_view_locate(context, slot, request, element, &offset);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        uint64_t bits = data_view_load(
            data_view_object(slot),
            offset,
            element_size,
            little_endian
        );
        if (element == OSEO_DATA_VIEW_BIGINT64) {
            bool negative = (bits >> 63u) != 0u;
            result = oseo_internal_bigint_from_uint64(
                context,
                negative ? UINT64_C(0) - bits : bits,
                negative
            );
        } else if (element == OSEO_DATA_VIEW_BIGUINT64) {
            result = oseo_internal_bigint_from_uint64(context, bits, false);
        } else {
            result = normal(
                oseo_number(raw_bytes_to_number(bits, element))
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* SetViewValue(view, requestIndex, isLittleEndian, type, value). */
static OseoResult data_view_set(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoDataViewElement element
) {
    OseoResult checked = data_view_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    double request = 0.0;
    OseoResult result = oseo_internal_to_index(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0],
        "DataView byte offset is outside the admitted index range.",
        &request
    );
    OseoValue value = argument_count < 2u ? oseo_undefined() : arguments[1];
    /* The numeric conversion runs before every bounds check, so a value
     * whose conversion detaches the buffer still observes the specified
     * TypeError afterwards. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = data_view_element_is_bigint(element)
            ? oseo_internal_to_bigint(context, value)
            : oseo_internal_to_number(context, value);
        slots[1] = result.value;
    }
    size_t element_size = data_view_element_size[element];
    bool little_endian = element_size == 1u ||
        (argument_count > 2u && oseo_to_boolean(arguments[2]));
    size_t offset = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = data_view_locate(
            context,
            slots[0],
            request,
            element,
            &offset
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        uint64_t bits = data_view_element_is_bigint(element)
            ? oseo_internal_bigint_to_raw_uint64(slots[1])
            : number_to_raw_bytes(number_value(slots[1]), element);
        data_view_store(
            data_view_object(slots[0]),
            offset,
            element_size,
            little_endian,
            bits
        );
        result = normal(oseo_undefined());
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_data_view_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_DATA_VIEW_CONSTRUCTOR_CODE_ID) {
        return data_view_construct(
            context,
            argument_count,
            arguments,
            new_target
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "DataView method is not a constructor."
        );
    }
    if (code_id == OSEO_DATA_VIEW_BUFFER_CODE_ID) {
        return data_view_buffer_accessor(context, receiver);
    }
    if (code_id == OSEO_DATA_VIEW_BYTE_LENGTH_CODE_ID) {
        return data_view_measure(context, receiver, false);
    }
    if (code_id == OSEO_DATA_VIEW_BYTE_OFFSET_CODE_ID) {
        return data_view_measure(context, receiver, true);
    }
    if (code_id >= OSEO_DATA_VIEW_GET_CODE_ID_FIRST &&
        code_id <= OSEO_DATA_VIEW_GET_CODE_ID_LAST) {
        return data_view_get(
            context,
            receiver,
            argument_count,
            arguments,
            (OseoDataViewElement)(OSEO_DATA_VIEW_GET_CODE_ID_LAST - code_id)
        );
    }
    if (code_id >= OSEO_DATA_VIEW_SET_CODE_ID_FIRST &&
        code_id <= OSEO_DATA_VIEW_SET_CODE_ID_LAST) {
        return data_view_set(
            context,
            receiver,
            argument_count,
            arguments,
            (OseoDataViewElement)(OSEO_DATA_VIEW_SET_CODE_ID_LAST - code_id)
        );
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_data_view_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind,
    OseoFunctionNamePrefix prefix
) {
    size_t name_length = strlen(name);
    uint16_t units[32];
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
            prefix
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_data_view_property(
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

/* One getter-only own accessor of %DataView.prototype%. */
static OseoResult define_data_view_accessor(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue getter
) {
    OseoValue slots[3] = {object, getter, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            slots[0],
            slots[2],
            slots[1],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Materializes %DataView%, %DataView.prototype%, and every own property
 * ECMA-262 gives them.
 * `OSEO_INTRINSIC_DATA_VIEW_SET_BIG_UINT64` is filled last, so it
 * doubles as the completion marker: a partially built cluster leaves it
 * undefined and the failure path clears every slot the attempt filled.
 * The marker holds the uninitialized sentinel while the attempt runs, so
 * a dependency that reentered the build reports that instead of
 * splitting the constructor and prototype identities across two
 * attempts.
 */
static OseoResult data_view_intrinsic_build(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_DATA_VIEW_SET_BIG_UINT64];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The DataView intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
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
        context->intrinsics[OSEO_INTRINSIC_DATA_VIEW_PROTOTYPE] =
            frame.slots[0];
        result = create_data_view_builtin(
            context,
            OSEO_DATA_VIEW_CONSTRUCTOR_CODE_ID,
            "DataView",
            1u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_DATA_VIEW] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_data_view_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            method
        );
    }
    static const OseoIntrinsic accessor_intrinsics[] = {
        OSEO_INTRINSIC_DATA_VIEW_BUFFER,
        OSEO_INTRINSIC_DATA_VIEW_BYTE_LENGTH,
        OSEO_INTRINSIC_DATA_VIEW_BYTE_OFFSET,
    };
    static const size_t accessor_codes[] = {
        OSEO_DATA_VIEW_BUFFER_CODE_ID,
        OSEO_DATA_VIEW_BYTE_LENGTH_CODE_ID,
        OSEO_DATA_VIEW_BYTE_OFFSET_CODE_ID,
    };
    static const char *const accessor_names[] = {
        "buffer",
        "byteLength",
        "byteOffset",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = create_data_view_builtin(
            context,
            accessor_codes[index],
            accessor_names[index],
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[accessor_intrinsics[index]] = frame.slots[2];
        result = define_data_view_accessor(
            context,
            frame.slots[0],
            accessor_names[index],
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "DataView");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    /* The eleven get accessors and then the eleven set accessors, in
     * element order, so each intrinsic slot and code ID is its element
     * index away from the first of its group. */
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
         index < 2u * OSEO_DATA_VIEW_ELEMENT_COUNT;
         index += 1u) {
        bool setter = index >= OSEO_DATA_VIEW_ELEMENT_COUNT;
        size_t element =
            setter ? index - OSEO_DATA_VIEW_ELEMENT_COUNT : index;
        const char *name = setter
            ? data_view_set_names[element]
            : data_view_get_names[element];
        result = create_data_view_builtin(
            context,
            (setter ? OSEO_DATA_VIEW_SET_CODE_ID_LAST
                    : OSEO_DATA_VIEW_GET_CODE_ID_LAST) - element,
            name,
            setter ? 2u : 1u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[
            (size_t)OSEO_INTRINSIC_DATA_VIEW_GET_INT8 + index
        ] = frame.slots[2];
        result = define_data_view_property(
            context,
            frame.slots[0],
            name,
            frame.slots[2],
            method
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_DATA_VIEW_PROTOTYPE;
             index <= OSEO_INTRINSIC_DATA_VIEW_SET_BIG_UINT64;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(context->intrinsics[OSEO_INTRINSIC_DATA_VIEW]);
}

OseoResult oseo_internal_data_view_intrinsic(OseoContext *context) {
    OseoResult built = data_view_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_DATA_VIEW]);
}

OseoResult oseo_internal_install_data_view_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_data_view_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_data_view_property(
            context,
            slots[0],
            "DataView",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
