#include "runtime_internal.h"

#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * %TypedArray% and the eleven concrete constructors. This component owns
 * construction and element conversion. The complete integer-indexed exotic
 * descriptor surface and prototype algorithms remain later graph nodes.
 */

#define TYPED_ARRAY_KIND_COUNT ((size_t)11u)
#define TYPED_ARRAY_INDEX_LIMIT 9007199254740991.0

static const char *const typed_array_names[TYPED_ARRAY_KIND_COUNT] = {
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "BigInt64Array",
    "BigUint64Array",
};

static const size_t typed_array_bytes[TYPED_ARRAY_KIND_COUNT] = {
    1u, 1u, 1u, 2u, 2u, 4u, 4u, 4u, 8u, 8u, 8u,
};

static const OseoIntrinsic typed_array_prototypes[TYPED_ARRAY_KIND_COUNT] = {
    OSEO_INTRINSIC_INT8_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_UINT8_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_UINT8_CLAMPED_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_INT16_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_UINT16_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_INT32_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_UINT32_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_FLOAT32_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_FLOAT64_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_BIGINT64_ARRAY_PROTOTYPE,
    OSEO_INTRINSIC_BIGUINT64_ARRAY_PROTOTYPE,
};

static const OseoIntrinsic typed_array_constructors[TYPED_ARRAY_KIND_COUNT] = {
    OSEO_INTRINSIC_INT8_ARRAY,
    OSEO_INTRINSIC_UINT8_ARRAY,
    OSEO_INTRINSIC_UINT8_CLAMPED_ARRAY,
    OSEO_INTRINSIC_INT16_ARRAY,
    OSEO_INTRINSIC_UINT16_ARRAY,
    OSEO_INTRINSIC_INT32_ARRAY,
    OSEO_INTRINSIC_UINT32_ARRAY,
    OSEO_INTRINSIC_FLOAT32_ARRAY,
    OSEO_INTRINSIC_FLOAT64_ARRAY,
    OSEO_INTRINSIC_BIGINT64_ARRAY,
    OSEO_INTRINSIC_BIGUINT64_ARRAY,
};

static const size_t typed_array_codes[TYPED_ARRAY_KIND_COUNT] = {
    OSEO_INT8_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_UINT8_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_UINT8_CLAMPED_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_INT16_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_UINT16_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_INT32_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_UINT32_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_FLOAT32_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_FLOAT64_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_BIGINT64_ARRAY_CONSTRUCTOR_CODE_ID,
    OSEO_BIGUINT64_ARRAY_CONSTRUCTOR_CODE_ID,
};

static bool typed_array_bigint_kind(OseoTypedArrayKind kind) {
    return kind == OSEO_TYPED_ARRAY_BIGINT64 ||
        kind == OSEO_TYPED_ARRAY_BIGUINT64;
}

static void initialize_ordinary(
    OseoContext *context,
    OseoOrdinaryObject *object,
    OseoValue prototype
) {
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->private_elements = NULL;
    object->private_element_capacity = 0u;
    object->private_element_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    object->extensible = true;
    object->module_namespace = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->array_iterator = false;
    object->iterator_array = oseo_undefined();
    object->iterator_index = 0u;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->wrap_for_valid_iterator = false;
    object->wrapped_iterator = oseo_undefined();
    object->wrapped_next = oseo_undefined();
    object->generator = NULL;
    object->arguments_object = false;
    object->mapped_arguments = false;
}

static OseoResult typed_array_to_index(
    OseoContext *context,
    OseoValue value,
    double *index
) {
    OseoResult converted = oseo_internal_to_number(context, value);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    double integer = number_value(converted.value);
    if (isnan(integer) || integer == 0.0) integer = 0.0;
    else if (isfinite(integer)) integer = trunc(integer);
    if (!(integer >= 0.0) || integer > TYPED_ARRAY_INDEX_LIMIT) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray index is outside the admitted range."
        );
    }
    *index = integer;
    return normal(oseo_number(integer));
}

static bool typed_array_size(double length, size_t *size) {
    if (!isfinite(length) || length < 0.0 ||
        length > (double)SIZE_MAX) return false;
    size_t converted = (size_t)length;
    if ((double)converted != length) return false;
    *size = converted;
    return true;
}

static size_t typed_array_length(const OseoTypedArray *view) {
    if (!is_array_buffer(view->viewed_buffer)) return 0u;
    const OseoArrayBuffer *buffer =
        array_buffer_object(view->viewed_buffer);
    if (buffer->detached || view->byte_offset > buffer->byte_length) {
        return 0u;
    }
    size_t bytes = typed_array_bytes[view->element_kind];
    if (view->array_length == SIZE_MAX) {
        return (buffer->byte_length - view->byte_offset) / bytes;
    }
    if (view->array_length >
        (buffer->byte_length - view->byte_offset) / bytes) return 0u;
    return view->array_length;
}

static OseoResult typed_array_default_prototype(
    OseoContext *context,
    OseoTypedArrayKind kind
) {
    return oseo_internal_intrinsic(context, typed_array_prototypes[kind]);
}

static OseoResult typed_array_allocate_object(
    OseoContext *context,
    OseoTypedArrayKind kind,
    OseoValue new_target
) {
    if (!function_is_constructible(new_target)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray constructor requires new."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_ascii_string(context, "prototype");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_object(frame.slots[2])) {
        result = typed_array_default_prototype(context, kind);
        frame.slots[2] = result.value;
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoTypedArray *view =
        oseo_internal_allocate_heap_bytes(context, sizeof(*view));
    if (view == NULL) {
        oseo_roots_release(context, &frame);
        return failure(context, "OSEO2001", "TypedArray allocation failed.");
    }
    initialize_ordinary(context, &view->ordinary, frame.slots[2]);
    view->viewed_buffer = oseo_undefined();
    view->byte_offset = 0u;
    view->array_length = 0u;
    view->element_kind = kind;
    result = oseo_internal_publish_heap(
        context,
        &view->ordinary.header,
        OSEO_HEAP_TYPED_ARRAY
    );
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult typed_array_allocate_buffer(
    OseoContext *context,
    OseoValue view_value,
    size_t length
) {
    OseoTypedArray *view = typed_array_object(view_value);
    size_t bytes = typed_array_bytes[view->element_kind];
    if (length > SIZE_MAX / bytes) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray allocation is too large."
        );
    }
    OseoValue slot = view_value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_buffer_create(
        context,
        (double)(length * bytes),
        0.0,
        false
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        view = typed_array_object(slot);
        view->viewed_buffer = result.value;
        view->byte_offset = 0u;
        view->array_length = length;
        result.value = slot;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static uint8_t clamped_uint8(double number) {
    if (!(number > 0.0)) return 0u;
    if (number >= 255.0) return UINT8_MAX;
    double lower = floor(number);
    double fraction = number - lower;
    if (fraction > 0.5 ||
        (fraction == 0.5 && fmod(lower, 2.0) != 0.0)) lower += 1.0;
    return (uint8_t)lower;
}

static uint64_t integer_bits(double number, unsigned bits) {
    if (!isfinite(number) || number == 0.0) return UINT64_C(0);
    double modulus = ldexp(1.0, (int)bits);
    double wrapped = fmod(trunc(number), modulus);
    if (wrapped < 0.0) wrapped += modulus;
    return (uint64_t)wrapped;
}

static uint64_t bigint_low_bits(OseoValue value) {
    const OseoBigInt *integer = bigint_object(value);
    uint64_t result = UINT64_C(0);
    for (size_t index = integer->length; index > 0u; index -= 1u) {
        result = (result << 30u) | integer->limbs[index - 1u];
    }
    return integer->negative ? UINT64_C(0) - result : result;
}

static OseoResult typed_array_to_bigint_bits(
    OseoContext *context,
    OseoValue value,
    uint64_t *bits
) {
    OseoValue slot = value;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_to_primitive(
        context,
        slot,
        OSEO_TO_PRIMITIVE_NUMBER
    );
    slot = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_bigint(slot)) {
        *bits = bigint_low_bits(slot);
    } else if (result.status == OSEO_STATUS_NORMAL &&
               tag_of(slot) == OSEO_TAG_BOOLEAN) {
        result = oseo_bigint_literal(
            context,
            (slot & UINT64_C(1)) == 0u ? "0" : "1",
            10u
        );
        slot = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            *bits = bigint_low_bits(slot);
        }
    } else if (result.status == OSEO_STATUS_NORMAL && is_string(slot)) {
        bool valid = false;
        result = oseo_internal_string_to_bigint(
            context,
            string_object(slot),
            &valid
        );
        slot = result.value;
        if (result.status == OSEO_STATUS_NORMAL && !valid) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_SYNTAX,
                "Cannot convert the string to BigInt."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            *bits = bigint_low_bits(slot);
        }
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot convert the value to BigInt."
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slot) : result;
}

static OseoResult typed_array_store(
    OseoContext *context,
    OseoValue view_value,
    size_t index,
    OseoValue value
) {
    OseoValue slots[2] = {view_value, value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoTypedArray *view = typed_array_object(slots[0]);
    size_t bytes = typed_array_bytes[view->element_kind];
    OseoResult result = normal(slots[1]);
    uint64_t bits = UINT64_C(0);
    double number = 0.0;
    if (typed_array_bigint_kind(view->element_kind)) {
        result = typed_array_to_bigint_bits(context, slots[1], &bits);
    } else {
        result = oseo_internal_to_number(context, slots[1]);
        if (result.status == OSEO_STATUS_NORMAL) {
            number = number_value(result.value);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        view = typed_array_object(slots[0]);
        if (index >= typed_array_length(view)) {
            oseo_roots_pop(context, &frame);
            return normal(slots[1]);
        }
        OseoArrayBuffer *buffer = array_buffer_object(view->viewed_buffer);
        size_t offset = view->byte_offset + index * bytes;
        uint8_t *target = buffer->data + offset;
        switch (view->element_kind) {
            case OSEO_TYPED_ARRAY_INT8: {
                uint8_t stored = (uint8_t)integer_bits(number, 8u);
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_UINT8: {
                uint8_t stored = (uint8_t)integer_bits(number, 8u);
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_UINT8_CLAMPED: {
                uint8_t stored = clamped_uint8(number);
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_INT16:
            case OSEO_TYPED_ARRAY_UINT16: {
                uint16_t stored = (uint16_t)integer_bits(number, 16u);
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_INT32:
            case OSEO_TYPED_ARRAY_UINT32: {
                uint32_t stored = (uint32_t)integer_bits(number, 32u);
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_FLOAT32: {
                float stored = (float)number;
                memcpy(target, &stored, sizeof(stored));
                break;
            }
            case OSEO_TYPED_ARRAY_FLOAT64:
                memcpy(target, &number, sizeof(number));
                break;
            case OSEO_TYPED_ARRAY_BIGINT64:
            case OSEO_TYPED_ARRAY_BIGUINT64:
                memcpy(target, &bits, sizeof(bits));
                break;
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult bigint_from_bits(
    OseoContext *context,
    uint64_t bits,
    bool signed_kind
) {
    bool negative = signed_kind &&
        (bits & (UINT64_C(1) << 63u)) != 0u;
    uint64_t magnitude = negative ? UINT64_C(0) - bits : bits;
    char digits[17];
    int written = snprintf(digits, sizeof(digits), "%" PRIx64, magnitude);
    if (written <= 0 || (size_t)written >= sizeof(digits)) {
        return failure(context, "OSEO2001", "BigInt conversion failed.");
    }
    OseoResult result = oseo_bigint_literal(context, digits, 16u);
    if (result.status == OSEO_STATUS_NORMAL && negative) {
        OseoValue slot = result.value;
        OseoRootFrame frame = {NULL, &slot, 1u};
        oseo_roots_push(context, &frame);
        result = oseo_internal_bigint_negate(context, slot);
        oseo_roots_pop(context, &frame);
    }
    return result;
}

static OseoResult typed_array_load(
    OseoContext *context,
    OseoValue view_value,
    size_t index
) {
    OseoTypedArray *view = typed_array_object(view_value);
    size_t bytes = typed_array_bytes[view->element_kind];
    const OseoArrayBuffer *buffer =
        array_buffer_object(view->viewed_buffer);
    const uint8_t *source = buffer->data + view->byte_offset + index * bytes;
    switch (view->element_kind) {
        case OSEO_TYPED_ARRAY_INT8: {
            uint8_t stored;
            memcpy(&stored, source, sizeof(stored));
            double number = stored >= UINT8_C(128)
                ? (double)stored - 256.0
                : (double)stored;
            return normal(oseo_number(number));
        }
        case OSEO_TYPED_ARRAY_UINT8:
        case OSEO_TYPED_ARRAY_UINT8_CLAMPED: {
            uint8_t stored;
            memcpy(&stored, source, sizeof(stored));
            return normal(oseo_number((double)stored));
        }
        case OSEO_TYPED_ARRAY_INT16: {
            uint16_t stored;
            memcpy(&stored, source, sizeof(stored));
            double number = stored >= UINT16_C(32768)
                ? (double)stored - 65536.0
                : (double)stored;
            return normal(oseo_number(number));
        }
        case OSEO_TYPED_ARRAY_UINT16: {
            uint16_t stored;
            memcpy(&stored, source, sizeof(stored));
            return normal(oseo_number((double)stored));
        }
        case OSEO_TYPED_ARRAY_INT32: {
            uint32_t stored;
            memcpy(&stored, source, sizeof(stored));
            double number = stored >= UINT32_C(2147483648)
                ? (double)stored - 4294967296.0
                : (double)stored;
            return normal(oseo_number(number));
        }
        case OSEO_TYPED_ARRAY_UINT32: {
            uint32_t stored;
            memcpy(&stored, source, sizeof(stored));
            return normal(oseo_number((double)stored));
        }
        case OSEO_TYPED_ARRAY_FLOAT32: {
            float stored;
            memcpy(&stored, source, sizeof(stored));
            return normal(oseo_number((double)stored));
        }
        case OSEO_TYPED_ARRAY_FLOAT64: {
            double stored;
            memcpy(&stored, source, sizeof(stored));
            return normal(oseo_number(stored));
        }
        case OSEO_TYPED_ARRAY_BIGINT64:
        case OSEO_TYPED_ARRAY_BIGUINT64: {
            uint64_t stored;
            memcpy(&stored, source, sizeof(stored));
            return bigint_from_bits(
                context,
                stored,
                view->element_kind == OSEO_TYPED_ARRAY_BIGINT64
            );
        }
    }
    return failure(context, "OSEO2001", "Unknown TypedArray element kind.");
}

static OseoResult typed_array_index_string(
    OseoContext *context,
    size_t index
) {
    char text[32];
    int written = snprintf(text, sizeof(text), "%zu", index);
    if (written <= 0 || (size_t)written >= sizeof(text)) {
        return failure(context, "OSEO2001", "TypedArray index is too large.");
    }
    return oseo_internal_ascii_string(context, text);
}

OseoResult oseo_internal_typed_array_get_index(
    OseoContext *context,
    OseoValue view,
    uint32_t index,
    bool *present
) {
    *present = false;
    if (!is_typed_array(view)) {
        return failure(context, "OSEO2001", "Value is not a TypedArray.");
    }
    size_t length = typed_array_length(typed_array_object(view));
    if ((size_t)index >= length) return normal(oseo_undefined());
    *present = true;
    return typed_array_load(context, view, index);
}

bool oseo_internal_typed_array_has_index(OseoValue view, uint32_t index) {
    return is_typed_array(view) &&
        (size_t)index < typed_array_length(typed_array_object(view));
}

OseoResult oseo_internal_typed_array_set_index(
    OseoContext *context,
    OseoValue view,
    uint32_t index,
    OseoValue value,
    bool *present
) {
    *present = false;
    if (!is_typed_array(view)) {
        return failure(context, "OSEO2001", "Value is not a TypedArray.");
    }
    size_t length = typed_array_length(typed_array_object(view));
    if ((size_t)index >= length) return normal(value);
    *present = true;
    OseoResult result = typed_array_store(context, view, index, value);
    return result.status == OSEO_STATUS_NORMAL ? normal(value) : result;
}

static OseoResult typed_array_from_length(
    OseoContext *context,
    OseoValue view_value,
    OseoValue value
) {
    double requested = 0.0;
    OseoResult result = typed_array_to_index(context, value, &requested);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL &&
        !typed_array_size(requested, &length)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray length is too large."
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return typed_array_allocate_buffer(context, view_value, length);
}

static OseoResult typed_array_from_buffer(
    OseoContext *context,
    OseoValue view_value,
    OseoValue buffer_value,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[2] = {view_value, buffer_value};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    double offset_number = 0.0;
    OseoValue offset_value = argument_count > 1u
        ? arguments[1] : oseo_undefined();
    OseoResult result =
        typed_array_to_index(context, offset_value, &offset_number);
    size_t offset = 0u;
    if (result.status == OSEO_STATUS_NORMAL &&
        !typed_array_size(offset_number, &offset)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray byte offset is too large."
        );
    }
    OseoTypedArray *view = typed_array_object(slots[0]);
    size_t bytes = typed_array_bytes[view->element_kind];
    if (result.status == OSEO_STATUS_NORMAL && offset % bytes != 0u) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray byte offset is not element-aligned."
        );
    }
    OseoArrayBuffer *buffer = array_buffer_object(slots[1]);
    size_t length = 0u;
    bool length_tracking = argument_count < 3u ||
        tag_of(arguments[2]) == OSEO_TAG_UNDEFINED;
    if (result.status == OSEO_STATUS_NORMAL && !length_tracking) {
        double length_number = 0.0;
        result = typed_array_to_index(context, arguments[2], &length_number);
        if (result.status == OSEO_STATUS_NORMAL &&
            !typed_array_size(length_number, &length)) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "TypedArray length is too large."
            );
        }
        buffer = array_buffer_object(slots[1]);
        if (result.status == OSEO_STATUS_NORMAL && buffer->detached) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Cannot construct a TypedArray over a detached buffer."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            offset > buffer->byte_length) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "TypedArray byte offset exceeds the buffer."
            );
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            (length > (buffer->byte_length - offset) / bytes)) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "TypedArray length exceeds the buffer."
            );
        }
    } else if (result.status == OSEO_STATUS_NORMAL && buffer->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot construct a TypedArray over a detached buffer."
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               offset > buffer->byte_length) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray byte offset exceeds the buffer."
        );
    } else if (result.status == OSEO_STATUS_NORMAL && !buffer->resizable) {
        size_t remaining = buffer->byte_length - offset;
        if (remaining % bytes != 0u) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "TypedArray buffer length is not element-aligned."
            );
        } else {
            length = remaining / bytes;
            length_tracking = false;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        view = typed_array_object(slots[0]);
        view->viewed_buffer = slots[1];
        view->byte_offset = offset;
        view->array_length = length_tracking ? SIZE_MAX : length;
        result.value = slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult typed_array_copy_values(
    OseoContext *context,
    OseoValue target,
    OseoValue source,
    size_t length,
    bool source_typed
) {
    OseoValue slots[4] = {target, source, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(slots[0]);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        if (source_typed) {
            result = typed_array_load(context, slots[1], index);
        } else {
            result = typed_array_index_string(context, index);
            slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_object_get(context, slots[1], slots[2]);
            }
        }
        slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = typed_array_store(context, slots[0], index, slots[3]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[0];
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult typed_array_from_typed_array(
    OseoContext *context,
    OseoValue target,
    OseoValue source
) {
    OseoTypedArray *source_view = typed_array_object(source);
    OseoTypedArray *target_view = typed_array_object(target);
    if (typed_array_bigint_kind(source_view->element_kind) !=
        typed_array_bigint_kind(target_view->element_kind)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot mix BigInt and Number TypedArrays."
        );
    }
    if (array_buffer_object(source_view->viewed_buffer)->detached) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot copy a detached TypedArray."
        );
    }
    size_t length = typed_array_length(source_view);
    OseoValue slots[2] = {target, source};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        typed_array_allocate_buffer(context, slots[0], length);
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_copy_values(
            context,
            slots[0],
            slots[1],
            length,
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult typed_array_array_like_length(
    OseoContext *context,
    OseoValue source,
    size_t *length
) {
    OseoValue slots[2] = {source, oseo_undefined()};
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
    if (result.status == OSEO_STATUS_NORMAL) {
        double number = number_value(result.value);
        double integer = isnan(number) || number <= 0.0
            ? 0.0
            : isfinite(number) ? trunc(number) : TYPED_ARRAY_INDEX_LIMIT;
        if (integer > TYPED_ARRAY_INDEX_LIMIT) {
            integer = TYPED_ARRAY_INDEX_LIMIT;
        }
        if (!typed_array_size(integer, length)) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "TypedArray source length is too large."
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult typed_array_from_array_like(
    OseoContext *context,
    OseoValue target,
    OseoValue source
) {
    OseoValue slots[2] = {target, source};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    size_t length = 0u;
    OseoResult result =
        typed_array_array_like_length(context, slots[1], &length);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_allocate_buffer(context, slots[0], length);
        slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_copy_values(
            context,
            slots[0],
            slots[1],
            length,
            false
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult typed_array_from_iterable(
    OseoContext *context,
    OseoValue target,
    OseoValue source,
    OseoValue method
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = target;
    frame.slots[1] = source;
    frame.slots[2] = method;
    result = oseo_call_function(
        context,
        frame.slots[2],
        frame.slots[1],
        0u,
        NULL,
        oseo_undefined()
    );
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[3])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray iterator is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "next");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[3], frame.slots[4]);
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        !is_function(frame.slots[4])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray iterator next is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        frame.slots[5] = result.value;
    }
    bool done = false;
    while (result.status == OSEO_STATUS_NORMAL && !done) {
        result = oseo_iterator_next(
            context,
            frame.slots[3],
            frame.slots[4],
            &frame.slots[6],
            &done
        );
        if (result.status == OSEO_STATUS_NORMAL && !done) {
            result = oseo_argument_list_append(
                context,
                frame.slots[5],
                frame.slots[6]
            );
        }
    }
    size_t length = 0u;
    const OseoValue *values = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_view(
            context,
            frame.slots[5],
            &length,
            &values
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_allocate_buffer(context, frame.slots[0], length);
        frame.slots[0] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = typed_array_store(
            context,
            frame.slots[0],
            index,
            values[index]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult typed_array_from_object(
    OseoContext *context,
    OseoValue target,
    OseoValue source
) {
    if (is_typed_array(source)) {
        return typed_array_from_typed_array(context, target, source);
    }
    OseoValue slots[4] = {target, source, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_ITERATOR
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[1], slots[2]);
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(slots[3])) {
        result = typed_array_from_array_like(
            context,
            slots[0],
            slots[1]
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               !is_function(slots[3])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray source iterator is not callable."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_from_iterable(
            context,
            slots[0],
            slots[1],
            slots[3]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static bool typed_array_kind_for_code(
    size_t code_id,
    OseoTypedArrayKind *kind
) {
    for (size_t index = 0u; index < TYPED_ARRAY_KIND_COUNT; index += 1u) {
        if (typed_array_codes[index] == code_id) {
            *kind = (OseoTypedArrayKind)index;
            return true;
        }
    }
    return false;
}

static OseoResult typed_array_construct(
    OseoContext *context,
    size_t code_id,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    OseoTypedArrayKind kind;
    if (!typed_array_kind_for_code(code_id, &kind)) {
        return failure(context, "OSEO2001", "Unknown TypedArray constructor.");
    }
    OseoResult result =
        typed_array_allocate_object(context, kind, new_target);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[2] = {result.value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    if (argument_count == 0u) {
        result = typed_array_allocate_buffer(context, slots[0], 0u);
    } else {
        slots[1] = arguments[0];
        if (is_array_buffer(slots[1])) {
            result = typed_array_from_buffer(
                context,
                slots[0],
                slots[1],
                argument_count,
                arguments
            );
        } else if (is_object(slots[1])) {
            result = typed_array_from_object(context, slots[0], slots[1]);
        } else {
            result = typed_array_from_length(context, slots[0], slots[1]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_typed_array_builtin_dispatch(
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
    if (code_id == OSEO_TYPED_ARRAY_CONSTRUCTOR_CODE_ID) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "%TypedArray% cannot be called or constructed directly."
        );
    }
    return typed_array_construct(
        context,
        code_id,
        argument_count,
        arguments,
        new_target
    );
}

static OseoResult create_typed_array_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
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
            OSEO_FUNCTION_ORDINARY,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_typed_array_property(
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

static OseoResult typed_array_intrinsic_build(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_BIGUINT64_ARRAY];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The TypedArray intrinsic cluster is already being built."
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
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY_PROTOTYPE] =
            frame.slots[1];
        result = create_typed_array_builtin(
            context,
            OSEO_TYPED_ARRAY_CONSTRUCTOR_CODE_ID,
            "TypedArray",
            0u
        );
        frame.slots[2] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    const OseoPropertyAttributes constant = {false, false, false, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY] = frame.slots[2];
        OseoFunction *constructor = function_object(frame.slots[2]);
        constructor->prototype_object = frame.slots[1];
        constructor->prototype_writable = false;
        result = define_typed_array_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[2],
            method
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < TYPED_ARRAY_KIND_COUNT;
         index += 1u) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[typed_array_prototypes[index]] = frame.slots[3];
        result = create_typed_array_builtin(
            context,
            typed_array_codes[index],
            typed_array_names[index],
            3u
        );
        frame.slots[4] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        ordinary_object(frame.slots[4])->prototype = frame.slots[2];
        OseoFunction *constructor = function_object(frame.slots[4]);
        constructor->prototype_object = frame.slots[3];
        constructor->prototype_writable = false;
        if (typed_array_constructors[index] !=
            OSEO_INTRINSIC_BIGUINT64_ARRAY) {
            context->intrinsics[typed_array_constructors[index]] =
                frame.slots[4];
        }
        result = define_typed_array_property(
            context,
            frame.slots[3],
            "constructor",
            frame.slots[4],
            method
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_typed_array_property(
                context,
                frame.slots[3],
                "BYTES_PER_ELEMENT",
                oseo_number((double)typed_array_bytes[index]),
                constant
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_typed_array_property(
                context,
                frame.slots[4],
                "BYTES_PER_ELEMENT",
                oseo_number((double)typed_array_bytes[index]),
                constant
            );
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_TYPED_ARRAY_PROTOTYPE;
             index < OSEO_INTRINSIC_COUNT;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    *marker = frame.slots[4];
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    OseoValue value = context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY];
    oseo_roots_release(context, &frame);
    return normal(value);
}

OseoResult oseo_internal_typed_array_intrinsic(OseoContext *context) {
    return typed_array_intrinsic_build(context);
}

OseoResult oseo_internal_install_typed_array_globals(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_typed_array_intrinsic(context);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < TYPED_ARRAY_KIND_COUNT;
         index += 1u) {
        slots[1] = context->intrinsics[typed_array_constructors[index]];
        result = define_typed_array_property(
            context,
            slots[0],
            typed_array_names[index],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
