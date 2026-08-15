#include "runtime_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

/*
 * The ArrayBuffer constructor, the Data Block its instances own, the
 * prototype accessors, resize, transfer, transferToFixedLength, slice,
 * and the species accessor.
 */

/* 2^53 - 1, the largest integer ToIndex admits. */
#define OSEO_ARRAY_BUFFER_INDEX_LIMIT 9007199254740991.0

/*
 * The largest Data Block this runtime creates, in bytes. CreateByteDataBlock
 * throws a RangeError when a block of the requested size cannot be created
 * and leaves the threshold to the implementation. Stating it here keeps the
 * boundary the same on every supported target instead of inheriting whatever
 * size the host allocator happens to refuse.
 */
#define OSEO_ARRAY_BUFFER_DATA_LIMIT 8589934592.0

/*
 * Converts one admitted integer index to a host size. The caller has
 * already run ToIndex, so `length` is an integer in [0, 2^53 - 1]; this
 * additionally rejects a request past the Data Block limit or past what
 * a host size_t can express.
 */
static bool array_buffer_size(double length, size_t *size) {
    if (!(length >= 0.0)) return false;
    if (length > OSEO_ARRAY_BUFFER_DATA_LIMIT) return false;
    if (length > (double)SIZE_MAX) return false;
    *size = (size_t)length;
    return true;
}

/* ToIndex(value), reported as the integer it admits. */
static OseoResult array_buffer_to_index(
    OseoContext *context,
    OseoValue value,
    double *index
) {
    OseoResult number = oseo_internal_to_number(context, value);
    if (number.status != OSEO_STATUS_NORMAL) return number;
    double integer = number_value(number.value);
    if (isnan(integer)) {
        integer = 0.0;
    } else if (isfinite(integer)) {
        integer = trunc(integer);
    }
    if (!(integer >= 0.0) || integer > OSEO_ARRAY_BUFFER_INDEX_LIMIT) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer length is outside the admitted index range."
        );
    }
    *index = integer;
    return normal(oseo_number(integer));
}

/*
 * RequireInternalSlot(this, [[ArrayBufferData]]). A SharedArrayBuffer
 * cannot exist in this realm, so the specification's separate
 * IsSharedArrayBuffer rejection is the same TypeError as this one.
 */
static OseoResult array_buffer_receiver(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_array_buffer(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer method receiver is not an ArrayBuffer."
        );
    }
    return normal(receiver);
}

void oseo_internal_array_buffer_release(OseoHeapObject *object) {
    OseoArrayBuffer *buffer = (OseoArrayBuffer *)object;
    free(buffer->data);
    buffer->data = NULL;
    buffer->byte_length = 0u;
    buffer->detached = true;
}

/*
 * AllocateArrayBuffer(constructor, byteLength, maxByteLength). The
 * object exists before its Data Block does, so a block the host refuses
 * leaves an already-created instance behind exactly as the specification
 * describes. A resizable buffer reserves its whole maximum up front, so
 * `resize` never moves the block and no pointer into it can go stale.
 */
static OseoResult array_buffer_allocate(
    OseoContext *context,
    OseoValue prototype,
    double byte_length,
    double max_byte_length,
    bool resizable
) {
    if (resizable && byte_length > max_byte_length) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer length exceeds its maximum byte length."
        );
    }
    double requested = resizable ? max_byte_length : byte_length;
    size_t allocation = 0u;
    size_t length = 0u;
    size_t maximum = 0u;
    if (!array_buffer_size(requested, &allocation) ||
        !array_buffer_size(byte_length, &length) ||
        (resizable && !array_buffer_size(max_byte_length, &maximum))) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer data block is too large."
        );
    }
    OseoValue slot = prototype;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    OseoArrayBuffer *buffer =
        oseo_internal_allocate_heap_bytes(context, sizeof(*buffer));
    if (buffer == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "ArrayBuffer allocation failed."
        );
    }
    buffer->ordinary.prototype = slot;
    buffer->ordinary.properties = NULL;
    buffer->ordinary.property_capacity = 0u;
    buffer->ordinary.property_count = 0u;
    buffer->ordinary.private_elements = NULL;
    buffer->ordinary.private_element_capacity = 0u;
    buffer->ordinary.private_element_count = 0u;
    buffer->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    buffer->ordinary.array_length = 0u;
    buffer->ordinary.dictionary = false;
    buffer->ordinary.length_writable = false;
    buffer->ordinary.extensible = true;
    buffer->ordinary.module_namespace = false;
    buffer->ordinary.global_object = false;
    buffer->ordinary.error_data = false;
    buffer->ordinary.number_data = false;
    buffer->ordinary.number_value = oseo_undefined();
    buffer->ordinary.primitive_data = false;
    buffer->ordinary.primitive_value = oseo_undefined();
    buffer->ordinary.primitive_wrapper_methods_initialized = false;
    buffer->ordinary.virtual_string_iterator = false;
    buffer->ordinary.virtual_string_iterator_configurable = false;
    buffer->ordinary.virtual_string_iterator_enumerable = false;
    buffer->ordinary.virtual_string_iterator_writable = false;
    buffer->ordinary.array_iterator = false;
    buffer->ordinary.iterator_array = oseo_undefined();
    buffer->ordinary.iterator_index = 0u;
    buffer->ordinary.regexp_string_iterator = false;
    buffer->ordinary.regexp_iterator_subject = oseo_undefined();
    buffer->ordinary.regexp_iterator_pattern = oseo_undefined();
    buffer->ordinary.regexp_iterator_index = 0u;
    buffer->ordinary.regexp_iterator_complete = false;
    buffer->ordinary.async_from_sync = false;
    buffer->ordinary.async_sync_iterator = oseo_undefined();
    buffer->ordinary.wrap_for_valid_iterator = false;
    buffer->ordinary.wrapped_iterator = oseo_undefined();
    buffer->ordinary.wrapped_next = oseo_undefined();
    buffer->ordinary.generator = NULL;
    buffer->ordinary.arguments_object = false;
    buffer->ordinary.mapped_arguments = false;
    buffer->data = NULL;
    buffer->byte_length = 0u;
    buffer->max_byte_length = maximum;
    buffer->resizable = resizable;
    buffer->detached = false;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &buffer->ordinary.header,
        OSEO_HEAP_ARRAY_BUFFER
    );
    oseo_roots_pop(context, &frame);
    if (published.status != OSEO_STATUS_NORMAL) return published;
    if (allocation == 0u) return published;
    OseoValue created = published.value;
    OseoRootFrame created_frame = {NULL, &created, 1u};
    oseo_roots_push(context, &created_frame);
    /* A safepoint, so the block is requested while the instance is
     * rooted and the record is reacquired from that root afterwards. */
    void *block = oseo_internal_allocate_heap_bytes(context, allocation);
    oseo_roots_pop(context, &created_frame);
    if (block == NULL) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer data block allocation failed."
        );
    }
    memset(block, 0, allocation);
    buffer = array_buffer_object(created);
    buffer->data = block;
    buffer->byte_length = length;
    return normal(created);
}

/* One fresh %ArrayBuffer%-prototyped buffer, which is what
 * AllocateArrayBuffer(%ArrayBuffer%, ...) produces for transfer and for
 * the default species path. */
static OseoResult array_buffer_create(
    OseoContext *context,
    double byte_length,
    double max_byte_length,
    bool resizable
) {
    OseoResult prototype = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_ARRAY_BUFFER_PROTOTYPE
    );
    if (prototype.status != OSEO_STATUS_NORMAL) return prototype;
    return array_buffer_allocate(
        context,
        prototype.value,
        byte_length,
        max_byte_length,
        resizable
    );
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%ArrayBuffer.prototype%").
 * The `prototype` read is the specified Get, so a new target whose
 * property is an accessor runs it, and a non-object result falls back to
 * the realm prototype.
 */
static OseoResult array_buffer_prototype_from_target(
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
            OSEO_INTRINSIC_ARRAY_BUFFER_PROTOTYPE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/* GetArrayBufferMaxByteLengthOption(options). */
static OseoResult array_buffer_max_option(
    OseoContext *context,
    OseoValue options,
    double *maximum,
    bool *present
) {
    *present = false;
    if (!is_object(options)) return normal(oseo_undefined());
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = options;
    result = oseo_internal_ascii_string(context, "maxByteLength");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[1]) != OSEO_TAG_UNDEFINED) {
        result = array_buffer_to_index(context, frame.slots[1], maximum);
        if (result.status == OSEO_STATUS_NORMAL) *present = true;
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult array_buffer_construct(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer requires new."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    frame.slots[1] = argument_count == 0u ? oseo_undefined() : arguments[0];
    frame.slots[2] = argument_count < 2u ? oseo_undefined() : arguments[1];
    double byte_length = 0.0;
    result = array_buffer_to_index(context, frame.slots[1], &byte_length);
    double maximum = 0.0;
    bool resizable = false;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_buffer_max_option(
            context,
            frame.slots[2],
            &maximum,
            &resizable
        );
    }
    /* AllocateArrayBuffer compares the two lengths before it creates the
     * instance, so an over-long request never runs the new target's
     * `prototype` getter. */
    if (result.status == OSEO_STATUS_NORMAL && resizable &&
        byte_length > maximum) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer length exceeds its maximum byte length."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_buffer_prototype_from_target(
            context,
            frame.slots[0],
            &frame.slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_buffer_allocate(
            context,
            frame.slots[1],
            byte_length,
            maximum,
            resizable
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * ArrayBuffer.isView(arg). No admitted value carries
 * [[ViewedArrayBuffer]], because neither DataView nor a TypedArray is
 * part of this profile yet, so the predicate is false for every value
 * that can reach it. The node that materializes a view kind extends this
 * test with its own brand.
 */
static OseoResult array_buffer_is_view(
    size_t argument_count,
    const OseoValue *arguments
) {
    (void)argument_count;
    (void)arguments;
    return normal(oseo_boolean(false));
}

static OseoResult array_buffer_byte_length(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    const OseoArrayBuffer *buffer = array_buffer_object(receiver);
    if (buffer->detached) return normal(oseo_number(0.0));
    return normal(oseo_number((double)buffer->byte_length));
}

static OseoResult array_buffer_max_byte_length(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    const OseoArrayBuffer *buffer = array_buffer_object(receiver);
    if (buffer->detached) return normal(oseo_number(0.0));
    return normal(oseo_number(
        (double)(buffer->resizable ? buffer->max_byte_length
                                   : buffer->byte_length)
    ));
}

static OseoResult array_buffer_resizable(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return normal(oseo_boolean(array_buffer_object(receiver)->resizable));
}

static OseoResult array_buffer_detached(
    OseoContext *context,
    OseoValue receiver
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    return normal(oseo_boolean(array_buffer_object(receiver)->detached));
}

/*
 * ArrayBuffer.prototype.resize(newLength). The resizability brand is
 * checked before the length conversion, the detached state after it, so
 * an argument whose conversion detaches the buffer still observes the
 * specified TypeError. The reserved block never moves, and the bytes
 * outside the new length are cleared so a later grow cannot reveal what
 * a shrink discarded.
 */
static OseoResult array_buffer_resize(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (!array_buffer_object(receiver)->resizable) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer.prototype.resize needs a resizable ArrayBuffer."
        );
    }
    OseoValue slot = receiver;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    double requested = 0.0;
    OseoResult result = array_buffer_to_index(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0],
        &requested
    );
    /* The conversion is a safepoint, so the record is reacquired from
     * the rooted receiver rather than from a pointer taken before it. */
    OseoArrayBuffer *buffer = array_buffer_object(slot);
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL && buffer->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer.prototype.resize needs an attached ArrayBuffer."
        );
    } else if (result.status == OSEO_STATUS_NORMAL &&
               (!array_buffer_size(requested, &length) ||
                length > buffer->max_byte_length)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "ArrayBuffer resize length exceeds its maximum byte length."
        );
    } else if (result.status == OSEO_STATUS_NORMAL) {
        buffer = array_buffer_object(slot);
        size_t previous = buffer->byte_length;
        size_t lower = length < previous ? length : previous;
        size_t upper = length < previous ? previous : length;
        if (upper > lower && buffer->data != NULL) {
            memset(buffer->data + lower, 0, upper - lower);
        }
        buffer->byte_length = length;
        result = normal(oseo_undefined());
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * ArrayBufferCopyAndDetach(this, newLength, preserveResizability). The
 * destination owns a second Data Block rather than the source's, so the
 * source is detached only after the copy succeeded and no block is ever
 * reachable from two buffers.
 */
static OseoResult array_buffer_copy_and_detach(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    bool preserve_resizability
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoValue requested = argument_count == 0u
        ? oseo_undefined()
        : arguments[0];
    double length = (double)array_buffer_object(slots[0])->byte_length;
    OseoResult result = normal(oseo_undefined());
    if (tag_of(requested) != OSEO_TAG_UNDEFINED) {
        result = array_buffer_to_index(context, requested, &length);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    const OseoArrayBuffer *source = array_buffer_object(slots[0]);
    if (source->detached) {
        oseo_roots_pop(context, &frame);
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer transfer needs an attached ArrayBuffer."
        );
    }
    bool resizable = preserve_resizability && source->resizable;
    double maximum = resizable ? (double)source->max_byte_length : 0.0;
    result = array_buffer_create(context, length, maximum, resizable);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        /* Both records are reacquired after the allocation safepoint. */
        OseoArrayBuffer *from = array_buffer_object(slots[0]);
        OseoArrayBuffer *to = array_buffer_object(slots[1]);
        size_t copied = to->byte_length < from->byte_length
            ? to->byte_length
            : from->byte_length;
        if (copied > 0u && from->data != NULL && to->data != NULL) {
            memcpy(to->data, from->data, copied);
        }
        oseo_internal_array_buffer_release(&from->ordinary.header);
        /* A detached buffer keeps its resizability brand, so only the
         * block, the length, and the detached flag change. */
        result = normal(slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* SpeciesConstructor(O, %ArrayBuffer%). */
static OseoResult array_buffer_species_constructor(
    OseoContext *context,
    OseoValue object
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    result = oseo_internal_ascii_string(context, "constructor");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ARRAY_BUFFER
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The ArrayBuffer constructor property is not an object."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[2], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_nullish(frame.slots[2])) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_ARRAY_BUFFER
        );
        oseo_roots_release(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = function_is_constructible(frame.slots[2])
            ? normal(frame.slots[2])
            : oseo_internal_throw_error(
                  context,
                  OSEO_ERROR_TYPE,
                  "The ArrayBuffer species is not a constructor."
              );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* Construct(species, «newLength»). */
static OseoResult array_buffer_construct_species(
    OseoContext *context,
    OseoValue constructor,
    double length
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = constructor;
    frame.slots[1] = oseo_number(length);
    result = oseo_function_prototype(context, frame.slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_receiver(context, result.value);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[0],
            frame.slots[2],
            1u,
            &frame.slots[1],
            frame.slots[0]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_constructor_result(
            context,
            result.value,
            frame.slots[2]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* ArrayBuffer.prototype.slice(start, end). */
static OseoResult array_buffer_slice(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult checked = array_buffer_receiver(context, receiver);
    if (checked.status != OSEO_STATUS_NORMAL) return checked;
    if (array_buffer_object(receiver)->detached) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer.prototype.slice needs an attached ArrayBuffer."
        );
    }
    OseoValue slots[3] = {receiver, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    double length = (double)array_buffer_object(slots[0])->byte_length;
    OseoResult result = oseo_internal_to_number(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0]
    );
    double first = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        double relative = number_value(result.value);
        relative = isnan(relative) ? 0.0
            : isfinite(relative) ? trunc(relative)
                                 : relative;
        first = relative < 0.0 ? (length + relative > 0.0 ? length + relative
                                                          : 0.0)
                               : (relative < length ? relative : length);
    }
    double final = length;
    OseoValue end = argument_count < 2u ? oseo_undefined() : arguments[1];
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(end) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_to_number(context, end);
        if (result.status == OSEO_STATUS_NORMAL) {
            double relative = number_value(result.value);
            relative = isnan(relative) ? 0.0
                : isfinite(relative) ? trunc(relative)
                                     : relative;
            final = relative < 0.0
                ? (length + relative > 0.0 ? length + relative : 0.0)
                : (relative < length ? relative : length);
        }
    }
    double new_length = final - first > 0.0 ? final - first : 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_buffer_species_constructor(context, slots[0]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = array_buffer_construct_species(
            context,
            slots[1],
            new_length
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_array_buffer(slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The ArrayBuffer species did not return an ArrayBuffer."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        array_buffer_object(slots[2])->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The ArrayBuffer species returned a detached ArrayBuffer."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && slots[2] == slots[0]) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The ArrayBuffer species returned the source ArrayBuffer."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        (double)array_buffer_object(slots[2])->byte_length < new_length) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The ArrayBuffer species returned a buffer that is too small."
        );
    }
    /* The species constructor is arbitrary code, so the source may have
     * been detached while it ran. */
    if (result.status == OSEO_STATUS_NORMAL &&
        array_buffer_object(slots[0])->detached) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "ArrayBuffer.prototype.slice source became detached."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoArrayBuffer *from = array_buffer_object(slots[0]);
        OseoArrayBuffer *to = array_buffer_object(slots[2]);
        size_t start = (size_t)first;
        size_t copied = (size_t)new_length;
        /*
         * The species constructor is arbitrary code, so it may have
         * shrunk a resizable source between the bounds and this copy.
         * The reservation keeps that range inside the allocated block
         * either way, and the clamp keeps the read in bounds without
         * depending on the reservation policy.
         */
        size_t available = from->byte_length > start
            ? from->byte_length - start
            : 0u;
        if (copied > available) copied = available;
        if (copied > 0u && from->data != NULL && to->data != NULL) {
            memcpy(to->data, from->data + start, copied);
        }
        result = normal(slots[2]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_array_buffer_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_ARRAY_BUFFER_CONSTRUCTOR_CODE_ID) {
        return array_buffer_construct(
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
            "ArrayBuffer method is not a constructor."
        );
    }
    if (code_id == OSEO_ARRAY_BUFFER_IS_VIEW_CODE_ID) {
        return array_buffer_is_view(argument_count, arguments);
    }
    if (code_id == OSEO_ARRAY_BUFFER_SPECIES_CODE_ID) {
        return normal(receiver);
    }
    if (code_id == OSEO_ARRAY_BUFFER_BYTE_LENGTH_CODE_ID) {
        return array_buffer_byte_length(context, receiver);
    }
    if (code_id == OSEO_ARRAY_BUFFER_DETACHED_CODE_ID) {
        return array_buffer_detached(context, receiver);
    }
    if (code_id == OSEO_ARRAY_BUFFER_MAX_BYTE_LENGTH_CODE_ID) {
        return array_buffer_max_byte_length(context, receiver);
    }
    if (code_id == OSEO_ARRAY_BUFFER_RESIZABLE_CODE_ID) {
        return array_buffer_resizable(context, receiver);
    }
    if (code_id == OSEO_ARRAY_BUFFER_RESIZE_CODE_ID) {
        return array_buffer_resize(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_ARRAY_BUFFER_SLICE_CODE_ID) {
        return array_buffer_slice(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_ARRAY_BUFFER_TRANSFER_CODE_ID) {
        return array_buffer_copy_and_detach(
            context,
            receiver,
            argument_count,
            arguments,
            true
        );
    }
    if (code_id == OSEO_ARRAY_BUFFER_TRANSFER_TO_FIXED_LENGTH_CODE_ID) {
        return array_buffer_copy_and_detach(
            context,
            receiver,
            argument_count,
            arguments,
            false
        );
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_array_buffer_builtin(
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

static OseoResult define_array_buffer_property(
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

/* One getter-only own accessor of %ArrayBuffer.prototype%. */
static OseoResult define_array_buffer_accessor(
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
 * Materializes %ArrayBuffer%, %ArrayBuffer.prototype%, and every own
 * property ECMA-262 gives them.
 * `OSEO_INTRINSIC_ARRAY_BUFFER_SPECIES` is filled last, so it doubles as
 * the completion marker: a partially built cluster leaves it undefined
 * and the failure path clears every slot the attempt filled. The marker
 * holds the uninitialized sentinel while the attempt runs, so a
 * dependency that reentered the build reports that instead of splitting
 * the constructor and prototype identities across two attempts.
 */
static OseoResult array_buffer_intrinsic_build(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER_SPECIES];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The ArrayBuffer intrinsic cluster is already being built."
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
        context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER_PROTOTYPE] =
            frame.slots[0];
        result = create_array_buffer_builtin(
            context,
            OSEO_ARRAY_BUFFER_CONSTRUCTOR_CODE_ID,
            "ArrayBuffer",
            1u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_array_buffer_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            method
        );
    }
    static const OseoIntrinsic accessor_intrinsics[] = {
        OSEO_INTRINSIC_ARRAY_BUFFER_BYTE_LENGTH,
        OSEO_INTRINSIC_ARRAY_BUFFER_DETACHED,
        OSEO_INTRINSIC_ARRAY_BUFFER_MAX_BYTE_LENGTH,
        OSEO_INTRINSIC_ARRAY_BUFFER_RESIZABLE,
    };
    static const size_t accessor_codes[] = {
        OSEO_ARRAY_BUFFER_BYTE_LENGTH_CODE_ID,
        OSEO_ARRAY_BUFFER_DETACHED_CODE_ID,
        OSEO_ARRAY_BUFFER_MAX_BYTE_LENGTH_CODE_ID,
        OSEO_ARRAY_BUFFER_RESIZABLE_CODE_ID,
    };
    static const char *const accessor_names[] = {
        "byteLength",
        "detached",
        "maxByteLength",
        "resizable",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 4u;
         index += 1u) {
        result = create_array_buffer_builtin(
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
        result = define_array_buffer_accessor(
            context,
            frame.slots[0],
            accessor_names[index],
            frame.slots[2]
        );
    }
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_ARRAY_BUFFER_RESIZE,
        OSEO_INTRINSIC_ARRAY_BUFFER_SLICE,
        OSEO_INTRINSIC_ARRAY_BUFFER_TRANSFER,
        OSEO_INTRINSIC_ARRAY_BUFFER_TRANSFER_TO_FIXED_LENGTH,
    };
    static const size_t method_codes[] = {
        OSEO_ARRAY_BUFFER_RESIZE_CODE_ID,
        OSEO_ARRAY_BUFFER_SLICE_CODE_ID,
        OSEO_ARRAY_BUFFER_TRANSFER_CODE_ID,
        OSEO_ARRAY_BUFFER_TRANSFER_TO_FIXED_LENGTH_CODE_ID,
    };
    static const char *const method_names[] = {
        "resize",
        "slice",
        "transfer",
        "transferToFixedLength",
    };
    static const size_t method_lengths[] = {1u, 2u, 0u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 4u;
         index += 1u) {
        result = create_array_buffer_builtin(
            context,
            method_codes[index],
            method_names[index],
            method_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->intrinsics[method_intrinsics[index]] = frame.slots[2];
        result = define_array_buffer_property(
            context,
            frame.slots[0],
            method_names[index],
            frame.slots[2],
            method
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
        result = oseo_internal_ascii_string(context, "ArrayBuffer");
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_array_buffer_builtin(
            context,
            OSEO_ARRAY_BUFFER_IS_VIEW_CODE_ID,
            "isView",
            1u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER_IS_VIEW] =
            frame.slots[2];
        result = define_array_buffer_property(
            context,
            frame.slots[1],
            "isView",
            frame.slots[2],
            method
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_array_buffer_builtin(
            context,
            OSEO_ARRAY_BUFFER_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_ARRAY_BUFFER_PROTOTYPE;
             index <= OSEO_INTRINSIC_ARRAY_BUFFER_SPECIES;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoValue species = frame.slots[2];
    context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER_SPECIES] = species;
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(species);
}

OseoResult oseo_internal_array_buffer_intrinsic(OseoContext *context) {
    OseoResult built = array_buffer_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_ARRAY_BUFFER]);
}

OseoResult oseo_internal_install_array_buffer_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_array_buffer_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_array_buffer_property(
            context,
            slots[0],
            "ArrayBuffer",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
