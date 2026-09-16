#include "runtime_internal.h"

#include <float.h>
#include <inttypes.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * %TypedArray%, the eleven concrete constructors, and the core prototype.
 * This component owns construction, element conversion, the
 * integer-indexed exotic element operations the generic property paths
 * delegate to, the prototype accessors, at, set, subarray, and the
 * iterator methods. The iterative, mutation, search and join, and sorting
 * prototype methods and the from and of statics remain later graph nodes.
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
    object->immutable_prototype = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->virtual_string_iterator = false;
    object->virtual_string_iterator_configurable = false;
    object->virtual_string_iterator_enumerable = false;
    object->virtual_string_iterator_writable = false;
    object->iterator_kind = OSEO_ITERATOR_NONE;
    object->iterator_target = oseo_undefined();
    object->iterator_index = 0u;
    object->regexp_string_iterator = false;
    object->regexp_iterator_regexp = oseo_undefined();
    object->regexp_iterator_subject = oseo_undefined();
    object->regexp_iterator_global = false;
    object->regexp_iterator_unicode = false;
    object->regexp_iterator_complete = false;
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

static bool typed_array_out_of_bounds(const OseoTypedArray *view) {
    if (!is_array_buffer(view->viewed_buffer)) return true;
    const OseoArrayBuffer *buffer =
        array_buffer_object(view->viewed_buffer);
    if (buffer->detached || view->byte_offset > buffer->byte_length) {
        return true;
    }
    if (view->array_length == SIZE_MAX) return false;
    return view->array_length >
        (buffer->byte_length - view->byte_offset) /
            typed_array_bytes[view->element_kind];
}

static size_t typed_array_length(const OseoTypedArray *view) {
    if (typed_array_out_of_bounds(view)) return 0u;
    const OseoArrayBuffer *buffer =
        array_buffer_object(view->viewed_buffer);
    if (view->array_length == SIZE_MAX) {
        size_t bytes = typed_array_bytes[view->element_kind];
        return (buffer->byte_length - view->byte_offset) / bytes;
    }
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
        /* GetPrototypeFromConstructor reads the fallback realm through
         * GetFunctionRealm, so a revoked Proxy new target throws here
         * instead of silently borrowing this realm's default. */
        result = oseo_internal_validate_function_realm(
            context,
            frame.slots[0]
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = typed_array_default_prototype(context, kind);
        }
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

static float float32_value(double number) {
    /* C11 leaves an out-of-range double-to-float conversion undefined.
     * The halfway value is the first finite double that ECMAScript rounds
     * to signed infinity; the smaller interval rounds to FLT_MAX. */
    const double overflow = 0x1.ffffffp+127;
    if (number >= overflow) return INFINITY;
    if (number <= -overflow) return -INFINITY;
    if (number > (double)FLT_MAX) return FLT_MAX;
    if (number < -(double)FLT_MAX) return -FLT_MAX;
    return (float)number;
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

/*
 * Writes one already converted element into its Data Block bytes. Number
 * kinds take `number` and BigInt kinds take `bits`; no user code runs and
 * nothing allocates, so a caller may hold a Data Block pointer across it.
 */
static void typed_array_write_raw(
    OseoTypedArrayKind kind,
    uint8_t *target,
    double number,
    uint64_t bits
) {
    switch (kind) {
        case OSEO_TYPED_ARRAY_INT8:
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
            float stored = float32_value(number);
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

/* Reads one Number-kind element from its Data Block bytes. */
static double typed_array_read_number(
    OseoTypedArrayKind kind,
    const uint8_t *source
) {
    switch (kind) {
        case OSEO_TYPED_ARRAY_INT8: {
            uint8_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored >= UINT8_C(128)
                ? (double)stored - 256.0
                : (double)stored;
        }
        case OSEO_TYPED_ARRAY_UINT8:
        case OSEO_TYPED_ARRAY_UINT8_CLAMPED: {
            uint8_t stored;
            memcpy(&stored, source, sizeof(stored));
            return (double)stored;
        }
        case OSEO_TYPED_ARRAY_INT16: {
            uint16_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored >= UINT16_C(32768)
                ? (double)stored - 65536.0
                : (double)stored;
        }
        case OSEO_TYPED_ARRAY_UINT16: {
            uint16_t stored;
            memcpy(&stored, source, sizeof(stored));
            return (double)stored;
        }
        case OSEO_TYPED_ARRAY_INT32: {
            uint32_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored >= UINT32_C(2147483648)
                ? (double)stored - 4294967296.0
                : (double)stored;
        }
        case OSEO_TYPED_ARRAY_UINT32: {
            uint32_t stored;
            memcpy(&stored, source, sizeof(stored));
            return (double)stored;
        }
        case OSEO_TYPED_ARRAY_FLOAT32: {
            float stored;
            memcpy(&stored, source, sizeof(stored));
            return (double)stored;
        }
        case OSEO_TYPED_ARRAY_FLOAT64:
        case OSEO_TYPED_ARRAY_BIGINT64:
        case OSEO_TYPED_ARRAY_BIGUINT64:
            break;
    }
    double stored;
    memcpy(&stored, source, sizeof(stored));
    return stored;
}

/*
 * TypedArraySetElement: the value converts first, which can
 * run user code that resizes or detaches the buffer, and only then does
 * IsValidIntegerIndex decide whether any byte changes. An index that was
 * never valid, such as SIZE_MAX for a non-integral key, still converts.
 */
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
        if (index < typed_array_length(view)) {
            size_t bytes = typed_array_bytes[view->element_kind];
            OseoArrayBuffer *buffer =
                array_buffer_object(view->viewed_buffer);
            typed_array_write_raw(
                view->element_kind,
                buffer->data + view->byte_offset + index * bytes,
                number,
                bits
            );
        }
        result = normal(slots[1]);
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
    if (typed_array_bigint_kind(view->element_kind)) {
        uint64_t stored;
        memcpy(&stored, source, sizeof(stored));
        return bigint_from_bits(
            context,
            stored,
            view->element_kind == OSEO_TYPED_ARRAY_BIGINT64
        );
    }
    return normal(oseo_number(
        typed_array_read_number(view->element_kind, source)
    ));
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

OseoResult oseo_internal_typed_array_numeric_key(
    OseoContext *context,
    OseoValue key,
    bool *numeric,
    size_t *index
) {
    *numeric = false;
    *index = SIZE_MAX;
    uint32_t array_index = 0u;
    if (oseo_internal_array_index(key, &array_index)) {
        *numeric = true;
        *index = (size_t)array_index;
        return normal(oseo_undefined());
    }
    OseoResult result =
        oseo_internal_canonical_numeric_index(context, key, numeric);
    if (result.status != OSEO_STATUS_NORMAL || !*numeric) return result;
    result = oseo_internal_to_number(context, key);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double number = number_value(result.value);
    /* "-0" is canonical but never an integer index, and no view can be
     * long enough to reach an index that does not fit size_t. */
    if (isfinite(number) && number >= 0.0 && !signbit(number) &&
        trunc(number) == number && number < (double)SIZE_MAX) {
        *index = (size_t)number;
    }
    return normal(oseo_undefined());
}

OseoResult oseo_internal_typed_array_get_index(
    OseoContext *context,
    OseoValue view,
    size_t index,
    bool *present
) {
    *present = false;
    if (!is_typed_array(view)) {
        return failure(context, "OSEO2001", "Value is not a TypedArray.");
    }
    size_t length = typed_array_length(typed_array_object(view));
    if (index >= length) return normal(oseo_undefined());
    *present = true;
    return typed_array_load(context, view, index);
}

bool oseo_internal_typed_array_has_index(OseoValue view, size_t index) {
    return is_typed_array(view) &&
        index < typed_array_length(typed_array_object(view));
}

OseoResult oseo_internal_typed_array_set_index(
    OseoContext *context,
    OseoValue view,
    size_t index,
    OseoValue value,
    bool *present
) {
    *present = false;
    if (!is_typed_array(view)) {
        return failure(context, "OSEO2001", "Value is not a TypedArray.");
    }
    OseoResult result = typed_array_store(context, view, index, value);
    if (result.status == OSEO_STATUS_NORMAL) {
        *present = index < typed_array_length(typed_array_object(view));
    }
    return result.status == OSEO_STATUS_NORMAL ? normal(value) : result;
}

OseoResult oseo_internal_typed_array_own_property(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    bool *handled,
    bool *found
) {
    *handled = false;
    *found = false;
    if (!is_typed_array(object)) return normal(oseo_undefined());
    size_t index = SIZE_MAX;
    OseoResult result = oseo_internal_typed_array_numeric_key(
        context,
        key,
        handled,
        &index
    );
    if (result.status != OSEO_STATUS_NORMAL || !*handled) return result;
    return oseo_internal_typed_array_get_index(context, object, index, found);
}

OseoResult oseo_internal_typed_array_define_index(
    OseoContext *context,
    OseoValue view,
    size_t index,
    const OseoConvertedDescriptor *descriptor,
    OseoValue value,
    const char **refusal
) {
    *refusal = NULL;
    if (!oseo_internal_typed_array_has_index(view, index)) {
        *refusal = "Cannot define an out-of-bounds TypedArray index.";
    } else if ((descriptor->has_configurable &&
                !descriptor->configurable) ||
               (descriptor->has_enumerable && !descriptor->enumerable) ||
               descriptor->has_getter || descriptor->has_setter ||
               (descriptor->has_writable && !descriptor->writable)) {
        *refusal =
            "A TypedArray element must stay a writable, enumerable, and "
            "configurable data property.";
    }
    if (*refusal != NULL || !descriptor->has_value) return normal(view);
    bool present = false;
    OseoResult result = oseo_internal_typed_array_set_index(
        context,
        view,
        index,
        value,
        &present
    );
    return result.status == OSEO_STATUS_NORMAL ? normal(view) : result;
}

size_t oseo_internal_typed_array_index_key_count(OseoValue object) {
    return is_typed_array(object)
        ? typed_array_length(typed_array_object(object))
        : 0u;
}

OseoResult oseo_internal_typed_array_index_key(
    OseoContext *context,
    size_t index
) {
    return typed_array_index_string(context, index);
}

bool oseo_internal_typed_array_out_of_bounds(
    OseoValue view,
    size_t *buffer_byte_length
) {
    const OseoTypedArray *typed = typed_array_object(view);
    bool out_of_bounds = typed_array_out_of_bounds(typed);
    *buffer_byte_length = out_of_bounds
        ? 0u
        : array_buffer_object(typed->viewed_buffer)->byte_length;
    return out_of_bounds;
}

size_t oseo_internal_typed_array_element_size(OseoTypedArrayKind kind) {
    return typed_array_bytes[kind];
}

bool oseo_internal_typed_array_fixed_length(OseoValue view) {
    const OseoTypedArray *typed = typed_array_object(view);
    if (typed->array_length == SIZE_MAX) return false;
    if (!is_array_buffer(typed->viewed_buffer)) return true;
    const OseoArrayBuffer *buffer =
        array_buffer_object(typed->viewed_buffer);
    /*
     * IsTypedArrayFixedLength step 3 excuses a shared buffer from the
     * fixed-length requirement: `resizable` means growable on a
     * SharedArrayBuffer, and a growable buffer only grows, so an
     * explicitly sized view of one can never fall out of bounds and
     * never gains an integer index.
     */
    return !buffer->resizable || buffer->shared;
}

OseoResult oseo_internal_typed_array_iteration_length(
    OseoContext *context,
    OseoValue view,
    double *length
) {
    const OseoTypedArray *typed = typed_array_object(view);
    if (typed_array_out_of_bounds(typed)) {
        *length = 0.0;
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot iterate a detached or out-of-bounds TypedArray."
        );
    }
    *length = (double)typed_array_length(typed);
    return normal(oseo_undefined());
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

/*
 * The same-kind branch of InitializeTypedArrayFromTypedArray clones the
 * source byte range verbatim, as CloneArrayBuffer does. Loading and
 * storing each element instead would canonicalize Float32 and Float64
 * NaN payloads through the number representation and allocate one
 * temporary BigInt per BigInt64 or BigUint64 element. The clamp keeps the
 * copy inside both blocks even if either view no longer covers `length`
 * elements, and memmove tolerates a source range that overlaps the target.
 */
static void typed_array_clone_bytes(
    const OseoTypedArray *target_view,
    const OseoTypedArray *source_view,
    size_t length
) {
    size_t byte_length = length * typed_array_bytes[source_view->element_kind];
    const OseoArrayBuffer *from =
        array_buffer_object(source_view->viewed_buffer);
    OseoArrayBuffer *to = array_buffer_object(target_view->viewed_buffer);
    size_t available = from->byte_length > source_view->byte_offset
        ? from->byte_length - source_view->byte_offset
        : 0u;
    size_t room = to->byte_length > target_view->byte_offset
        ? to->byte_length - target_view->byte_offset
        : 0u;
    if (byte_length > available) byte_length = available;
    if (byte_length > room) byte_length = room;
    if (byte_length > 0u && from->data != NULL && to->data != NULL) {
        memmove(
            to->data + target_view->byte_offset,
            from->data + source_view->byte_offset,
            byte_length
        );
    }
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
    if (typed_array_out_of_bounds(source_view)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot copy an out-of-bounds TypedArray."
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
        target_view = typed_array_object(slots[0]);
        source_view = typed_array_object(slots[1]);
        if (target_view->element_kind == source_view->element_kind) {
            typed_array_clone_bytes(target_view, source_view, length);
        } else {
            result = typed_array_copy_values(
                context,
                slots[0],
                slots[1],
                length,
                true
            );
        }
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
        !is_callable(frame.slots[4])) {
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
               !is_callable(slots[3])) {
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

static OseoValue typed_array_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

/* ToIntegerOrInfinity, with -0 normalized to +0. */
static OseoResult typed_array_integer_or_infinity(
    OseoContext *context,
    OseoValue value,
    double *integer
) {
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double number = number_value(result.value);
    if (isnan(number) || number == 0.0) number = 0.0;
    else if (isfinite(number)) number = trunc(number);
    if (number == 0.0) number = 0.0;
    *integer = number;
    return normal(oseo_undefined());
}

/* The relative-index clamp subarray applies to its start and end. */
static double typed_array_clamped_index(double relative, double length) {
    if (relative == -INFINITY) return 0.0;
    if (relative < 0.0) return fmax(length + relative, 0.0);
    return fmin(relative, length);
}

/*
 * ValidateTypedArray: the value must carry [[TypedArrayName]]
 * and its buffer must be neither detached nor too short for the view.
 */
static OseoResult typed_array_validate(OseoContext *context, OseoValue value) {
    if (!is_typed_array(value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The receiver is not a TypedArray."
        );
    }
    if (typed_array_out_of_bounds(typed_array_object(value))) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The TypedArray is detached or out of bounds."
        );
    }
    return normal(value);
}

OseoResult oseo_internal_typed_array_validate(
    OseoContext *context,
    OseoValue value,
    size_t *length
) {
    *length = 0u;
    OseoResult result = typed_array_validate(context, value);
    if (result.status == OSEO_STATUS_NORMAL) {
        *length = typed_array_length(typed_array_object(value));
    }
    return result;
}

/*
 * The buffer, byteLength, byteOffset, and length getters and the
 * [Symbol.toStringTag] getter. Each reads the view's internal slots, so
 * a shadowing own property or a replaced prototype never changes the
 * answer, and a detached or out-of-bounds view reports zero lengths.
 */
static OseoResult typed_array_accessor(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver
) {
    if (code_id == OSEO_TYPED_ARRAY_TO_STRING_TAG_CODE_ID) {
        if (!is_typed_array(receiver)) return normal(oseo_undefined());
        return oseo_internal_ascii_string(
            context,
            typed_array_names[typed_array_object(receiver)->element_kind]
        );
    }
    if (!is_typed_array(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray accessor requires a TypedArray receiver."
        );
    }
    const OseoTypedArray *view = typed_array_object(receiver);
    if (code_id == OSEO_TYPED_ARRAY_BUFFER_CODE_ID) {
        return normal(view->viewed_buffer);
    }
    bool out_of_bounds = typed_array_out_of_bounds(view);
    size_t length = typed_array_length(view);
    if (code_id == OSEO_TYPED_ARRAY_BYTE_OFFSET_CODE_ID) {
        return normal(oseo_number(
            out_of_bounds ? 0.0 : (double)view->byte_offset
        ));
    }
    if (code_id == OSEO_TYPED_ARRAY_BYTE_LENGTH_CODE_ID) {
        return normal(oseo_number(
            (double)length * (double)typed_array_bytes[view->element_kind]
        ));
    }
    return normal(oseo_number((double)length));
}

/* %TypedArray%.prototype.at. */
static OseoResult typed_array_at(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult result = typed_array_validate(context, receiver);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slot = receiver;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    double length = (double)typed_array_length(typed_array_object(slot));
    double relative = 0.0;
    result = typed_array_integer_or_infinity(
        context,
        typed_array_argument(argument_count, arguments, 0u),
        &relative
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        double index = relative >= 0.0 ? relative : length + relative;
        bool present = false;
        result = index < 0.0 || index >= length
            ? normal(oseo_undefined())
            : oseo_internal_typed_array_get_index(
                context,
                slot,
                (size_t)index,
                &present
            );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * SetTypedArrayFromTypedArray. No user code runs after the
 * offset conversion, so the Data Block pointers stay valid through the
 * copy. A source sharing the target's buffer is snapshotted first, as
 * CloneArrayBuffer does, unless a same-kind move can overlap safely.
 */
static OseoResult typed_array_set_from_typed_array(
    OseoContext *context,
    OseoValue target,
    OseoValue source,
    double offset
) {
    const OseoTypedArray *target_view = typed_array_object(target);
    const OseoTypedArray *source_view = typed_array_object(source);
    if (typed_array_out_of_bounds(target_view) ||
        typed_array_out_of_bounds(source_view)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray set requires in-bounds views."
        );
    }
    size_t target_length = typed_array_length(target_view);
    size_t source_length = typed_array_length(source_view);
    if (offset == INFINITY ||
        (double)source_length + offset > (double)target_length) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray set source does not fit the target."
        );
    }
    OseoTypedArrayKind target_kind = target_view->element_kind;
    OseoTypedArrayKind source_kind = source_view->element_kind;
    if (typed_array_bigint_kind(target_kind) !=
        typed_array_bigint_kind(source_kind)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Cannot mix BigInt and Number TypedArrays."
        );
    }
    size_t target_bytes = typed_array_bytes[target_kind];
    size_t source_bytes = typed_array_bytes[source_kind];
    size_t source_byte_length = source_length * source_bytes;
    if (source_byte_length == 0u) return normal(oseo_undefined());
    uint8_t *target_data =
        array_buffer_object(target_view->viewed_buffer)->data +
        target_view->byte_offset + (size_t)offset * target_bytes;
    const uint8_t *source_data =
        array_buffer_object(source_view->viewed_buffer)->data +
        source_view->byte_offset;
    if (target_kind == source_kind) {
        memmove(target_data, source_data, source_byte_length);
        return normal(oseo_undefined());
    }
    uint8_t *snapshot = NULL;
    if (target_view->viewed_buffer == source_view->viewed_buffer) {
        snapshot = malloc(source_byte_length);
        if (snapshot == NULL) {
            return failure(
                context,
                "OSEO2001",
                "TypedArray set snapshot allocation failed."
            );
        }
        memcpy(snapshot, source_data, source_byte_length);
        source_data = snapshot;
    }
    for (size_t index = 0u; index < source_length; index += 1u) {
        const uint8_t *from = source_data + index * source_bytes;
        uint64_t bits = UINT64_C(0);
        double number = 0.0;
        if (typed_array_bigint_kind(source_kind)) {
            memcpy(&bits, from, sizeof(bits));
        } else {
            number = typed_array_read_number(source_kind, from);
        }
        typed_array_write_raw(
            target_kind,
            target_data + index * target_bytes,
            number,
            bits
        );
    }
    free(snapshot);
    return normal(oseo_undefined());
}

/*
 * SetTypedArrayFromArrayLike. Every element read and
 * conversion can run user code that detaches or resizes the target, and
 * TypedArraySetElement then skips the write rather than throwing.
 */
static OseoResult typed_array_set_from_array_like(
    OseoContext *context,
    OseoValue target,
    OseoValue source,
    double offset
) {
    if (typed_array_out_of_bounds(typed_array_object(target))) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray set requires an in-bounds target."
        );
    }
    size_t target_length = typed_array_length(typed_array_object(target));
    OseoValue slots[4] = {target, source, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_to_object(context, slots[1]);
    slots[1] = result.value;
    size_t source_length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_array_like_length(
            context,
            slots[1],
            &source_length
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        (offset == INFINITY ||
         (double)source_length + offset > (double)target_length)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray set source does not fit the target."
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < source_length;
         index += 1u) {
        result = typed_array_index_string(context, index);
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, slots[1], slots[2]);
            slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = typed_array_store(
                context,
                slots[0],
                (size_t)offset + index,
                slots[3]
            );
        }
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

/* %TypedArray%.prototype.set. */
static OseoResult typed_array_set(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_typed_array(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The receiver is not a TypedArray."
        );
    }
    OseoValue slots[2] = {
        receiver,
        typed_array_argument(argument_count, arguments, 0u),
    };
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    double offset = 0.0;
    OseoResult result = typed_array_integer_or_infinity(
        context,
        typed_array_argument(argument_count, arguments, 1u),
        &offset
    );
    if (result.status == OSEO_STATUS_NORMAL && offset < 0.0) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "TypedArray set offset must not be negative."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = is_typed_array(slots[1])
            ? typed_array_set_from_typed_array(
                context,
                slots[0],
                slots[1],
                offset
            )
            : typed_array_set_from_array_like(
                context,
                slots[0],
                slots[1],
                offset
            );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Construct for a species constructor that may be a class, a
 * bound function, or a Proxy. `arguments` must already be rooted.
 */
static OseoResult typed_array_construct_with(
    OseoContext *context,
    OseoValue constructor,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[2] = {constructor, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        oseo_internal_construct_receiver(context, slots[0], slots[0]);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            slots[0],
            slots[1],
            argument_count,
            arguments,
            slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_result(context, result.value, slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * TypedArraySpeciesCreate with SpeciesConstructor and
 * TypedArrayCreateFromConstructor. `arguments` must already
 * be rooted by the caller.
 */
static OseoResult typed_array_species_create(
    OseoContext *context,
    OseoValue exemplar,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoTypedArrayKind kind = typed_array_object(exemplar)->element_kind;
    OseoValue slots[3] = {exemplar, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "constructor");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[1]) != OSEO_TAG_UNDEFINED) {
        if (!is_object(slots[1])) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "TypedArray constructor property is not an object."
            );
        } else {
            result = oseo_internal_well_known_symbol(
                context,
                OSEO_WELL_KNOWN_SPECIES
            );
            slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_object_get(context, slots[1], slots[2]);
                slots[1] = is_nullish(result.value)
                    ? oseo_undefined()
                    : result.value;
            }
            if (result.status == OSEO_STATUS_NORMAL &&
                tag_of(slots[1]) != OSEO_TAG_UNDEFINED &&
                !function_is_constructible(slots[1])) {
                result = oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "TypedArray species is not a constructor."
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(slots[1]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_intrinsic(
            context,
            typed_array_constructors[kind]
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_construct_with(
            context,
            slots[1],
            argument_count,
            arguments
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_validate(context, slots[2]);
    }
    if (result.status == OSEO_STATUS_NORMAL && argument_count == 1u &&
        is_number(arguments[0]) &&
        (double)typed_array_length(typed_array_object(slots[2])) <
            number_value(arguments[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray species result is too short."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        typed_array_bigint_kind(typed_array_object(slots[2])->element_kind) !=
            typed_array_bigint_kind(kind)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray species result has a different content type."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[2];
    oseo_roots_pop(context, &frame);
    return result;
}

/* %TypedArray%.prototype.subarray. */
static OseoResult typed_array_subarray(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_typed_array(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The receiver is not a TypedArray."
        );
    }
    const OseoTypedArray *view = typed_array_object(receiver);
    double source_length = typed_array_out_of_bounds(view)
        ? 0.0
        : (double)typed_array_length(view);
    OseoValue end = typed_array_argument(argument_count, arguments, 1u);
    OseoValue slots[5] = {
        receiver,
        end,
        view->viewed_buffer,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    double relative_start = 0.0;
    OseoResult result = typed_array_integer_or_infinity(
        context,
        typed_array_argument(argument_count, arguments, 0u),
        &relative_start
    );
    double start = typed_array_clamped_index(relative_start, source_length);
    view = typed_array_object(slots[0]);
    size_t bytes = typed_array_bytes[view->element_kind];
    slots[3] = oseo_number(
        (double)view->byte_offset + start * (double)bytes
    );
    size_t forwarded = 2u;
    if (result.status == OSEO_STATUS_NORMAL &&
        (view->array_length != SIZE_MAX ||
         tag_of(slots[1]) != OSEO_TAG_UNDEFINED)) {
        double relative_end = source_length;
        if (tag_of(slots[1]) != OSEO_TAG_UNDEFINED) {
            result = typed_array_integer_or_infinity(
                context,
                slots[1],
                &relative_end
            );
        }
        double end_index =
            typed_array_clamped_index(relative_end, source_length);
        slots[4] = oseo_number(fmax(end_index - start, 0.0));
        forwarded = 3u;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_species_create(
            context,
            slots[0],
            forwarded,
            &slots[2]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The entries, keys, and values methods. */
static OseoResult typed_array_iterator_method(
    OseoContext *context,
    size_t code_id,
    OseoValue receiver
) {
    OseoResult result = typed_array_validate(context, receiver);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoIteratorKind kind = OSEO_ARRAY_ITERATOR_VALUE;
    if (code_id == OSEO_TYPED_ARRAY_ENTRIES_CODE_ID) {
        kind = OSEO_ARRAY_ITERATOR_KEY_AND_VALUE;
    } else if (code_id == OSEO_TYPED_ARRAY_KEYS_CODE_ID) {
        kind = OSEO_ARRAY_ITERATOR_KEY;
    }
    return oseo_internal_array_iterator_create(context, receiver, kind);
}

/*
 * TypedArrayGetElement for an iteration length snapshotted before any
 * callback runs. A detach or shrink invalidates the stored index, and the
 * shared integer-indexed getter then reports undefined instead of reading
 * outside the Data Block.
 */
static OseoResult typed_array_iteration_element(
    OseoContext *context,
    OseoValue view,
    size_t index
) {
    bool present = false;
    return oseo_internal_typed_array_get_index(context, view, index, &present);
}

/*
 * every, some, and forEach share ValidateTypedArray and one element loop.
 * Each index is present by construction, so the callback always runs once
 * per snapshot index and no hole check is needed.
 */
static OseoResult typed_array_iteration(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    size_t code_id
) {
    OseoValue slots[7] = {
        receiver,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 7u};
    oseo_roots_push(context, &frame);
    slots[1] = typed_array_argument(argument_count, arguments, 0u);
    slots[2] = typed_array_argument(argument_count, arguments, 1u);
    OseoResult result = typed_array_validate(context, slots[0]);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        length = typed_array_length(typed_array_object(slots[0]));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray callback is not callable."
        );
    }
    bool decided = false;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = typed_array_iteration_element(
            context,
            slots[0],
            index
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[3] = result.value;
        slots[4] = oseo_number((double)index);
        slots[5] = slots[0];
        result = oseo_call_function(
            context,
            slots[1],
            slots[2],
            3u,
            &slots[3],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (code_id == OSEO_TYPED_ARRAY_EVERY_CODE_ID &&
            !oseo_to_boolean(result.value)) {
            result = normal(oseo_boolean(false));
            decided = true;
            break;
        }
        if (code_id == OSEO_TYPED_ARRAY_SOME_CODE_ID &&
            oseo_to_boolean(result.value)) {
            result = normal(oseo_boolean(true));
            decided = true;
            break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && !decided) {
        if (code_id == OSEO_TYPED_ARRAY_EVERY_CODE_ID) {
            result = normal(oseo_boolean(true));
        } else if (code_id == OSEO_TYPED_ARRAY_SOME_CODE_ID) {
            result = normal(oseo_boolean(false));
        } else {
            result = normal(oseo_undefined());
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * map allocates its result through TypedArraySpeciesCreate before the
 * first callback and stores each mapped value with TypedArraySetElement,
 * so a detach during a callback leaves the corresponding index unwritten
 * rather than throwing.
 */
static OseoResult typed_array_map(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[7] = {
        receiver,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 7u};
    oseo_roots_push(context, &frame);
    slots[1] = typed_array_argument(argument_count, arguments, 0u);
    slots[2] = typed_array_argument(argument_count, arguments, 1u);
    OseoResult result = typed_array_validate(context, slots[0]);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        length = typed_array_length(typed_array_object(slots[0]));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray callback is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[3] = oseo_number((double)length);
        result = typed_array_species_create(
            context,
            slots[0],
            1u,
            &slots[3]
        );
        slots[3] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = typed_array_iteration_element(
            context,
            slots[0],
            index
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[4] = result.value;
        slots[5] = oseo_number((double)index);
        slots[6] = slots[0];
        result = oseo_call_function(
            context,
            slots[1],
            slots[2],
            3u,
            &slots[4],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        bool present = false;
        result = oseo_internal_typed_array_set_index(
            context,
            slots[3],
            index,
            result.value,
            &present
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[3];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * filter collects every selected element into an argument list before
 * TypedArraySpeciesCreate runs, because the species constructor is
 * observable and must not learn the captured count until every callback
 * has finished.
 */
static OseoResult typed_array_filter(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[7] = {
        receiver,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 7u};
    oseo_roots_push(context, &frame);
    slots[1] = typed_array_argument(argument_count, arguments, 0u);
    slots[2] = typed_array_argument(argument_count, arguments, 1u);
    OseoResult result = typed_array_validate(context, slots[0]);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        length = typed_array_length(typed_array_object(slots[0]));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray callback is not callable."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        slots[3] = result.value;
    }
    size_t captured = 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = typed_array_iteration_element(
            context,
            slots[0],
            index
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[4] = result.value;
        slots[5] = oseo_number((double)index);
        slots[6] = slots[0];
        result = oseo_call_function(
            context,
            slots[1],
            slots[2],
            3u,
            &slots[4],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (oseo_to_boolean(result.value)) {
            result = oseo_argument_list_append(
                context,
                slots[3],
                slots[4]
            );
            captured += 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[4] = oseo_number((double)captured);
        result = typed_array_species_create(
            context,
            slots[0],
            1u,
            &slots[4]
        );
        slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        size_t count = 0u;
        const OseoValue *values = NULL;
        result = oseo_argument_list_view(context, slots[3], &count, &values);
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && index < count;
             index += 1u) {
            bool present = false;
            result = oseo_internal_typed_array_set_index(
                context,
                slots[4],
                index,
                values[index],
                &present
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = slots[4];
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * reduce and reduceRight. A typed array has no holes, so the traversal
 * reads every index and a missing accumulator takes the first element in
 * the chosen direction. The receiver, callback, accumulator, and current
 * element stay rooted across user code and forced collection.
 */
static OseoResult typed_array_reduction(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    bool from_right
) {
    OseoValue slots[8] = {
        receiver,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 8u};
    oseo_roots_push(context, &frame);
    slots[1] = typed_array_argument(argument_count, arguments, 0u);
    OseoResult result = typed_array_validate(context, slots[0]);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        length = typed_array_length(typed_array_object(slots[0]));
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(slots[1])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "TypedArray callback is not callable."
        );
    }
    bool has_accumulator = argument_count >= 2u;
    if (result.status == OSEO_STATUS_NORMAL && has_accumulator) {
        slots[2] = arguments[1];
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        length == 0u &&
        !has_accumulator) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Reduce of an empty TypedArray needs an initial value."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && !has_accumulator) {
        result = typed_array_iteration_element(
            context,
            slots[0],
            from_right ? length - 1u : 0u
        );
        slots[2] = result.value;
    }
    double cursor = has_accumulator
        ? (from_right ? (double)length - 1.0 : 0.0)
        : (from_right ? (double)length - 2.0 : 1.0);
    while (result.status == OSEO_STATUS_NORMAL &&
           (from_right ? cursor >= 0.0 : cursor < (double)length)) {
        result = typed_array_iteration_element(
            context,
            slots[0],
            (size_t)cursor
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[3] = slots[2];
        slots[4] = result.value;
        slots[5] = oseo_number(cursor);
        slots[6] = slots[0];
        result = oseo_call_function(
            context,
            slots[1],
            oseo_undefined(),
            4u,
            &slots[3],
            oseo_undefined()
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        slots[2] = result.value;
        cursor += from_right ? -1.0 : 1.0;
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(slots[2]);
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
    if (code_id == OSEO_TYPED_ARRAY_BUFFER_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_BYTE_LENGTH_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_BYTE_OFFSET_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_LENGTH_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_TO_STRING_TAG_CODE_ID) {
        return typed_array_accessor(context, code_id, receiver);
    }
    if (code_id == OSEO_TYPED_ARRAY_SPECIES_CODE_ID) return normal(receiver);
    if (code_id == OSEO_TYPED_ARRAY_AT_CODE_ID) {
        return typed_array_at(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_TYPED_ARRAY_SET_CODE_ID) {
        return typed_array_set(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_TYPED_ARRAY_SUBARRAY_CODE_ID) {
        return typed_array_subarray(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_TYPED_ARRAY_ENTRIES_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_KEYS_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_VALUES_CODE_ID) {
        return typed_array_iterator_method(context, code_id, receiver);
    }
    if (code_id == OSEO_TYPED_ARRAY_EVERY_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_FOR_EACH_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_SOME_CODE_ID) {
        return typed_array_iteration(
            context,
            receiver,
            argument_count,
            arguments,
            code_id
        );
    }
    if (code_id == OSEO_TYPED_ARRAY_MAP_CODE_ID) {
        return typed_array_map(context, receiver, argument_count, arguments);
    }
    if (code_id == OSEO_TYPED_ARRAY_FILTER_CODE_ID) {
        return typed_array_filter(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_TYPED_ARRAY_REDUCE_CODE_ID ||
        code_id == OSEO_TYPED_ARRAY_REDUCE_RIGHT_CODE_ID) {
        return typed_array_reduction(
            context,
            receiver,
            argument_count,
            arguments,
            code_id == OSEO_TYPED_ARRAY_REDUCE_RIGHT_CODE_ID
        );
    }
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

/*
 * Installs the core %TypedArray.prototype% surface and the
 * %TypedArray%[Symbol.species] getter subarray's species lookup needs.
 * `toString` is the original %Array.prototype.toString% function object,
 * read from its realm slot so a program that replaced the Array method
 * before this cluster materialized cannot change the identity. The
 * remaining prototype methods and the `from` and `of` statics stay with
 * their later graph owners.
 */
static OseoResult typed_array_install_core(
    OseoContext *context,
    OseoValue prototype,
    OseoValue constructor
) {
    OseoValue slots[4] = {
        prototype,
        constructor,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 4u};
    oseo_roots_push(context, &frame);
    const OseoPropertyAttributes method = {true, false, true, false};
    const OseoPropertyAttributes accessor = {true, false, false, true};
    static const size_t accessor_codes[] = {
        OSEO_TYPED_ARRAY_BUFFER_CODE_ID,
        OSEO_TYPED_ARRAY_BYTE_LENGTH_CODE_ID,
        OSEO_TYPED_ARRAY_BYTE_OFFSET_CODE_ID,
        OSEO_TYPED_ARRAY_LENGTH_CODE_ID,
    };
    static const char *const accessor_names[] = {
        "buffer",
        "byteLength",
        "byteOffset",
        "length",
    };
    OseoResult result = normal(oseo_undefined());
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 4u;
         index += 1u) {
        result = create_typed_array_builtin(
            context,
            accessor_codes[index],
            accessor_names[index],
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(
                context,
                accessor_names[index]
            );
            slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define_accessor(
                context,
                slots[0],
                slots[3],
                slots[2],
                oseo_undefined(),
                true,
                false,
                accessor
            );
        }
    }
    static const size_t method_codes[] = {
        OSEO_TYPED_ARRAY_AT_CODE_ID,
        OSEO_TYPED_ARRAY_ENTRIES_CODE_ID,
        OSEO_TYPED_ARRAY_KEYS_CODE_ID,
        OSEO_TYPED_ARRAY_SET_CODE_ID,
        OSEO_TYPED_ARRAY_SUBARRAY_CODE_ID,
        OSEO_TYPED_ARRAY_VALUES_CODE_ID,
    };
    static const char *const method_names[] = {
        "at",
        "entries",
        "keys",
        "set",
        "subarray",
        "values",
    };
    static const size_t method_lengths[] = {1u, 0u, 0u, 1u, 2u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 6u;
         index += 1u) {
        result = create_typed_array_builtin(
            context,
            method_codes[index],
            method_names[index],
            method_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_typed_array_property(
                context,
                slots[0],
                method_names[index],
                slots[2],
                method
            );
        }
    }
    /* `values` was created last, so slot 2 still holds it. */
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_ITERATOR
        );
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[3],
            slots[2],
            method
        );
    }
    /*
     * The iterative methods are a second loop so the first loop's final
     * `values` function stays the one installed under Symbol.iterator.
     */
    static const size_t iterative_codes[] = {
        OSEO_TYPED_ARRAY_EVERY_CODE_ID,
        OSEO_TYPED_ARRAY_FILTER_CODE_ID,
        OSEO_TYPED_ARRAY_FOR_EACH_CODE_ID,
        OSEO_TYPED_ARRAY_MAP_CODE_ID,
        OSEO_TYPED_ARRAY_REDUCE_CODE_ID,
        OSEO_TYPED_ARRAY_REDUCE_RIGHT_CODE_ID,
        OSEO_TYPED_ARRAY_SOME_CODE_ID,
    };
    static const char *const iterative_names[] = {
        "every",
        "filter",
        "forEach",
        "map",
        "reduce",
        "reduceRight",
        "some",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 7u;
         index += 1u) {
        result = create_typed_array_builtin(
            context,
            iterative_codes[index],
            iterative_names[index],
            1u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_typed_array_property(
                context,
                slots[0],
                iterative_names[index],
                slots[2],
                method
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ARRAY_TO_STRING
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_typed_array_property(
            context,
            slots[0],
            "toString",
            slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_typed_array_builtin(
            context,
            OSEO_TYPED_ARRAY_TO_STRING_TAG_CODE_ID,
            "[Symbol.toStringTag]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            slots[0],
            slots[3],
            slots[2],
            oseo_undefined(),
            true,
            false,
            accessor
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_typed_array_builtin(
            context,
            OSEO_TYPED_ARRAY_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            slots[1],
            slots[3],
            slots[2],
            oseo_undefined(),
            true,
            false,
            accessor
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
            0u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = typed_array_install_core(
            context,
            frame.slots[1],
            frame.slots[2]
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
            3u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
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
             index <= OSEO_INTRINSIC_BIGUINT64_ARRAY;
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

static bool typed_array_key_matches(
    OseoValue key,
    const char *const *names,
    size_t name_count
) {
    for (size_t index = 0u; index < name_count; index += 1u) {
        if (oseo_internal_string_is_ascii(key, names[index])) return true;
    }
    return false;
}

const char *oseo_internal_typed_array_deferred_diagnostic(
    OseoContext *context,
    OseoValue object,
    OseoValue key
) {
    if (object == context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY]) {
        if (oseo_internal_string_is_ascii(key, "from") ||
            oseo_internal_string_is_ascii(key, "of")) {
            return "TypedArray static APIs are not admitted yet.";
        }
        return NULL;
    }
    if (object !=
        context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY_PROTOTYPE]) {
        return NULL;
    }
    static const char *const mutation[] = {
        "copyWithin",
        "fill",
        "reverse",
        "slice",
        "toReversed",
        "with",
    };
    if (typed_array_key_matches(
            key, mutation, sizeof(mutation) / sizeof(*mutation))) {
        return "TypedArray mutation methods are not admitted yet.";
    }
    static const char *const search_and_join[] = {
        "find",
        "findIndex",
        "findLast",
        "findLastIndex",
        "includes",
        "indexOf",
        "join",
        "lastIndexOf",
        "toLocaleString",
    };
    if (typed_array_key_matches(
            key,
            search_and_join,
            sizeof(search_and_join) / sizeof(*search_and_join))) {
        return "TypedArray search and join methods are not admitted yet.";
    }
    static const char *const sorting[] = {"sort", "toSorted"};
    if (typed_array_key_matches(
            key, sorting, sizeof(sorting) / sizeof(*sorting))) {
        return "TypedArray sorting methods are not admitted yet.";
    }
    return NULL;
}

const char *oseo_internal_typed_array_deferred_own_keys_diagnostic(
    OseoContext *context,
    OseoValue object
) {
    /* The prototype's own-key list stays incomplete until every later
     * prototype method node lands, and the constructor's until the
     * statics node lands. */
    if (object ==
        context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY_PROTOTYPE]) {
        return "TypedArray prototype own-key reflection is not admitted yet.";
    }
    return object == context->intrinsics[OSEO_INTRINSIC_TYPED_ARRAY]
        ? "TypedArray static APIs are not admitted yet."
        : NULL;
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
