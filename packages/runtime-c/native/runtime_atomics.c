#include "runtime_internal.h"

#include <math.h>
#include <string.h>

/*
 * The %Atomics% namespace object: the read-modify-write family, load,
 * store, compareExchange, isLockFree, wait, waitAsync, and notify, over
 * integer TypedArray views of ArrayBuffer and SharedArrayBuffer storage.
 *
 * This realm is the only agent of its agent cluster, and the agent can
 * suspend. Every atomic step therefore runs without interference, a
 * critical section is never contended, and the WaiterList store is the
 * context-owned FIFO of `Atomics.waitAsync` waiters. `Atomics.wait` never
 * enters that store: once the agent suspends, no code in the cluster can
 * run to notify it, so it can only time out. A notification or timeout
 * in this agent resolves the waiter's promise synchronously, as
 * NotifyWaiter specifies for a waiter of the surrounding agent. The
 * `$262.agent` capability that would add a second agent is outside this
 * component.
 */

typedef struct {
    const char *name;
    size_t length;
} OseoAtomicsFunction;

static const OseoAtomicsFunction
    atomics_functions[OSEO_ATOMICS_OPERATION_COUNT] = {
        {"add", 3u},
        {"and", 3u},
        {"compareExchange", 4u},
        {"exchange", 3u},
        {"isLockFree", 1u},
        {"load", 2u},
        {"notify", 3u},
        {"or", 3u},
        {"store", 3u},
        {"sub", 3u},
        {"wait", 4u},
        {"waitAsync", 4u},
        {"xor", 3u},
    };

#define ATOMICS_TWO_TO_32 4294967296.0

static OseoValue atomics_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static bool atomics_bigint_kind(OseoTypedArrayKind kind) {
    return kind == OSEO_TYPED_ARRAY_BIGINT64 ||
        kind == OSEO_TYPED_ARRAY_BIGUINT64;
}

/* ToIntegerOrInfinity, with -0 normalized to +0. */
static OseoResult atomics_integer_or_infinity(
    OseoContext *context,
    OseoValue value,
    double *integer
) {
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double number = number_value(result.value);
    if (isnan(number) || number == 0.0) number = 0.0;
    else if (isfinite(number)) number = trunc(number);
    *integer = number;
    return normal(oseo_undefined());
}

/*
 * The low 32 bits of an integral Number, which is every bit NumericToRawBytes
 * keeps for an integer element of at most four bytes. Reducing modulo 2^32
 * rather than 2^64 keeps every intermediate exactly representable.
 */
static uint64_t atomics_number_bits(double integer) {
    if (!isfinite(integer)) return UINT64_C(0);
    double wrapped = fmod(integer, ATOMICS_TWO_TO_32);
    if (wrapped < 0.0) wrapped += ATOMICS_TWO_TO_32;
    return (uint64_t)wrapped;
}

static uint64_t atomics_element_mask(size_t size) {
    return size >= 8u ? UINT64_MAX : (UINT64_C(1) << (size * 8u)) - 1u;
}

/*
 * ValidateIntegerTypedArray(typedArray, waitable). It reports
 * TypedArrayLength from the same witness, because ValidateAtomicAccess
 * reads the length before it converts the index.
 */
static OseoResult atomics_validate_integer(
    OseoContext *context,
    OseoValue value,
    bool waitable,
    size_t *length
) {
    OseoResult result =
        oseo_internal_typed_array_validate(context, value, length);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoTypedArrayKind kind = typed_array_object(value)->element_kind;
    bool admitted = waitable
        ? kind == OSEO_TYPED_ARRAY_INT32 ||
            kind == OSEO_TYPED_ARRAY_BIGINT64
        : kind != OSEO_TYPED_ARRAY_UINT8_CLAMPED &&
            kind != OSEO_TYPED_ARRAY_FLOAT32 &&
            kind != OSEO_TYPED_ARRAY_FLOAT64;
    if (!admitted) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            waitable
                ? "Atomics waiting needs an Int32Array or a BigInt64Array."
                : "Atomics needs an integer TypedArray."
        );
    }
    return normal(value);
}

/*
 * ValidateAtomicAccess against the length read before the conversion,
 * reporting the byte index in the viewed buffer.
 */
static OseoResult atomics_access(
    OseoContext *context,
    OseoValue view,
    OseoValue request,
    size_t length,
    size_t *byte_index
) {
    OseoValue slot = view;
    OseoRootFrame frame = {NULL, &slot, 1u};
    oseo_roots_push(context, &frame);
    double index = 0.0;
    OseoResult result = oseo_internal_to_index(
        context,
        request,
        "Atomics index is outside the admitted index range.",
        &index
    );
    if (result.status == OSEO_STATUS_NORMAL && !(index < (double)length)) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Atomics index is outside the TypedArray."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoTypedArray *typed = typed_array_object(slot);
        *byte_index = (size_t)index *
                oseo_internal_typed_array_element_size(typed->element_kind) +
            typed->byte_offset;
        result = normal(slot);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * RevalidateAtomicAccess: argument conversions may have detached,
 * shrunk, or otherwise invalidated the view since the first validation.
 * The specification compares only the element's first byte against the
 * buffer length, so an element of a length-tracking view that a shrink
 * left straddling the new end still passes. Its trailing bytes stay
 * inside the block, because a resizable buffer reserves its maximum
 * length and a shared buffer never shrinks.
 */
static OseoResult atomics_revalidate(
    OseoContext *context,
    OseoValue view,
    size_t byte_index
) {
    size_t buffer_length = 0u;
    if (oseo_internal_typed_array_out_of_bounds(view, &buffer_length)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The TypedArray is detached or out of bounds."
        );
    }
    if (byte_index >= buffer_length) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Atomics index is outside the TypedArray."
        );
    }
    return normal(view);
}

/* The element's bytes at `byte_index`, zero-extended. */
static uint64_t atomics_read_raw(OseoValue view, size_t byte_index) {
    const OseoTypedArray *typed = typed_array_object(view);
    const uint8_t *source =
        array_buffer_object(typed->viewed_buffer)->data + byte_index;
    switch (oseo_internal_typed_array_element_size(typed->element_kind)) {
        case 1u: {
            uint8_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored;
        }
        case 2u: {
            uint16_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored;
        }
        case 4u: {
            uint32_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored;
        }
        default: {
            uint64_t stored;
            memcpy(&stored, source, sizeof(stored));
            return stored;
        }
    }
}

static void atomics_write_raw(
    OseoValue view,
    size_t byte_index,
    uint64_t bits
) {
    const OseoTypedArray *typed = typed_array_object(view);
    uint8_t *target =
        array_buffer_object(typed->viewed_buffer)->data + byte_index;
    switch (oseo_internal_typed_array_element_size(typed->element_kind)) {
        case 1u: {
            uint8_t stored = (uint8_t)bits;
            memcpy(target, &stored, sizeof(stored));
            break;
        }
        case 2u: {
            uint16_t stored = (uint16_t)bits;
            memcpy(target, &stored, sizeof(stored));
            break;
        }
        case 4u: {
            uint32_t stored = (uint32_t)bits;
            memcpy(target, &stored, sizeof(stored));
            break;
        }
        default:
            memcpy(target, &bits, sizeof(bits));
            break;
    }
}

/* RawBytesToNumeric for an integer element kind. */
static OseoResult atomics_decode(
    OseoContext *context,
    OseoTypedArrayKind kind,
    uint64_t bits
) {
    switch (kind) {
        case OSEO_TYPED_ARRAY_INT8:
            return normal(oseo_number(
                bits >= UINT64_C(0x80) ? (double)bits - 256.0 : (double)bits
            ));
        case OSEO_TYPED_ARRAY_INT16:
            return normal(oseo_number(
                bits >= UINT64_C(0x8000)
                    ? (double)bits - 65536.0
                    : (double)bits
            ));
        case OSEO_TYPED_ARRAY_INT32:
            return normal(oseo_number(
                bits >= UINT64_C(0x80000000)
                    ? (double)bits - ATOMICS_TWO_TO_32
                    : (double)bits
            ));
        case OSEO_TYPED_ARRAY_BIGINT64: {
            bool negative = (bits >> 63u) != 0u;
            return oseo_internal_bigint_from_uint64(
                context,
                negative ? UINT64_C(0) - bits : bits,
                negative
            );
        }
        case OSEO_TYPED_ARRAY_BIGUINT64:
            return oseo_internal_bigint_from_uint64(context, bits, false);
        default:
            return normal(oseo_number((double)bits));
    }
}

/*
 * The conversion Atomics applies to a value it stores: ToBigInt for a
 * BigInt view and 𝔽(ToIntegerOrInfinity) otherwise. `result.value` is the
 * converted value `store` returns, and `bits` is its raw element image.
 */
static OseoResult atomics_operand(
    OseoContext *context,
    OseoTypedArrayKind kind,
    OseoValue value,
    uint64_t *bits
) {
    if (atomics_bigint_kind(kind)) {
        OseoResult result = oseo_internal_to_bigint(context, value);
        if (result.status == OSEO_STATUS_NORMAL) {
            *bits = oseo_internal_bigint_to_raw_uint64(result.value);
        }
        return result;
    }
    double integer = 0.0;
    OseoResult result = atomics_integer_or_infinity(context, value, &integer);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *bits = atomics_number_bits(integer);
    return normal(oseo_number(integer));
}

/*
 * AtomicReadModifyWrite together with store and load, selected by
 * `operation`. The view validates and the index converts first, then the
 * value converts, and the view revalidates before any byte is read, so a
 * conversion that detaches or shrinks the buffer throws instead of
 * touching the block.
 */
static OseoResult atomics_read_modify_write(
    OseoContext *context,
    OseoAtomicsOperation operation,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = atomics_argument(argument_count, arguments, 0u);
    size_t length = 0u;
    size_t byte_index = 0u;
    result = atomics_validate_integer(context, frame.slots[0], false, &length);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_access(
            context,
            frame.slots[0],
            atomics_argument(argument_count, arguments, 1u),
            length,
            &byte_index
        );
    }
    uint64_t operand = UINT64_C(0);
    if (result.status == OSEO_STATUS_NORMAL &&
        operation != OSEO_ATOMICS_LOAD) {
        result = atomics_operand(
            context,
            typed_array_object(frame.slots[0])->element_kind,
            atomics_argument(argument_count, arguments, 2u),
            &operand
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_revalidate(context, frame.slots[0], byte_index);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoTypedArrayKind kind =
            typed_array_object(frame.slots[0])->element_kind;
        uint64_t mask = atomics_element_mask(
            oseo_internal_typed_array_element_size(kind)
        );
        uint64_t previous = atomics_read_raw(frame.slots[0], byte_index);
        uint64_t next = previous;
        switch (operation) {
            case OSEO_ATOMICS_ADD:
                next = previous + operand;
                break;
            case OSEO_ATOMICS_AND:
                next = previous & operand;
                break;
            case OSEO_ATOMICS_OR:
                next = previous | operand;
                break;
            case OSEO_ATOMICS_SUB:
                next = previous - operand;
                break;
            case OSEO_ATOMICS_XOR:
                next = previous ^ operand;
                break;
            case OSEO_ATOMICS_EXCHANGE:
            case OSEO_ATOMICS_STORE:
                next = operand;
                break;
            default:
                break;
        }
        if (operation != OSEO_ATOMICS_LOAD) {
            atomics_write_raw(frame.slots[0], byte_index, next & mask);
        }
        result = operation == OSEO_ATOMICS_STORE
            ? normal(frame.slots[1])
            : atomics_decode(context, kind, previous & mask);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Atomics.compareExchange. Both values convert before the revalidation,
 * and the comparison is ByteListEqual over their raw element images, so
 * an expected value that wraps to the stored bits matches.
 */
static OseoResult atomics_compare_exchange(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = atomics_argument(argument_count, arguments, 0u);
    size_t length = 0u;
    size_t byte_index = 0u;
    result = atomics_validate_integer(context, frame.slots[0], false, &length);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_access(
            context,
            frame.slots[0],
            atomics_argument(argument_count, arguments, 1u),
            length,
            &byte_index
        );
    }
    uint64_t expected = UINT64_C(0);
    uint64_t replacement = UINT64_C(0);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_operand(
            context,
            typed_array_object(frame.slots[0])->element_kind,
            atomics_argument(argument_count, arguments, 2u),
            &expected
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_operand(
            context,
            typed_array_object(frame.slots[0])->element_kind,
            atomics_argument(argument_count, arguments, 3u),
            &replacement
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_revalidate(context, frame.slots[0], byte_index);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoTypedArrayKind kind =
            typed_array_object(frame.slots[0])->element_kind;
        uint64_t mask = atomics_element_mask(
            oseo_internal_typed_array_element_size(kind)
        );
        uint64_t previous = atomics_read_raw(frame.slots[0], byte_index);
        if ((previous & mask) == (expected & mask)) {
            atomics_write_raw(frame.slots[0], byte_index, replacement & mask);
        }
        result = atomics_decode(context, kind, previous & mask);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * Atomics.isLockFree. Every atomic step of this single agent runs
 * without a lock of any size, so the agent record reports true for 1, 2,
 * and 8 bytes as well as for the required 4.
 */
static OseoResult atomics_is_lock_free(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    double size = 0.0;
    OseoResult result = atomics_integer_or_infinity(
        context,
        atomics_argument(argument_count, arguments, 0u),
        &size
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(oseo_boolean(
        size == 1.0 || size == 2.0 || size == 4.0 || size == 8.0
    ));
}

/* Unlinks one listed waiter from the context's WaiterList store. */
static void atomics_unlink_waiter(OseoContext *context, OseoValue waiter) {
    OseoValue previous = oseo_undefined();
    OseoValue current = context->atomics_waiter_head;
    while (tag_of(current) != OSEO_TAG_UNDEFINED && current != waiter) {
        previous = current;
        current = atomics_waiter_object(current)->next;
    }
    if (tag_of(current) == OSEO_TAG_UNDEFINED) return;
    OseoAtomicsWaiter *record = atomics_waiter_object(current);
    if (tag_of(previous) == OSEO_TAG_UNDEFINED) {
        context->atomics_waiter_head = record->next;
    } else {
        atomics_waiter_object(previous)->next = record->next;
    }
    if (context->atomics_waiter_tail == current) {
        context->atomics_waiter_tail = previous;
    }
    record->next = oseo_undefined();
    record->listed = false;
}

/*
 * NotifyWaiter for a waiter of this agent, after its removal: its promise
 * resolves synchronously to `outcome`. Resolving with a string runs no
 * user code, so the waiter needs no further protection here.
 */
static OseoResult atomics_resolve_waiter(
    OseoContext *context,
    OseoValue waiter,
    const char *outcome
) {
    OseoValue slots[2] = {waiter, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoAtomicsWaiter *record = atomics_waiter_object(slots[0]);
    if (tag_of(record->timer) != OSEO_TAG_UNDEFINED) {
        timer_object(record->timer)->canceled = true;
        record->timer = oseo_undefined();
    }
    OseoResult result = oseo_internal_ascii_string(context, outcome);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_promise_resolve_into(
            context,
            atomics_waiter_object(slots[0])->promise,
            slots[1]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_atomics_waiter_timeout(
    OseoContext *context,
    OseoValue waiter
) {
    OseoAtomicsWaiter *record = atomics_waiter_object(waiter);
    if (!record->listed) return normal(oseo_undefined());
    /* The job is running, so the waiter no longer owns a pending timer. */
    record->timer = oseo_undefined();
    atomics_unlink_waiter(context, waiter);
    return atomics_resolve_waiter(context, waiter, "timed-out");
}

/*
 * Atomics.notify. A buffer that is not shared has no waiters and reports
 * zero after the validation and conversions. Otherwise the first `count`
 * waiters on the same block and byte index leave the store in FIFO order,
 * each resolving to "ok" as it leaves.
 */
static OseoResult atomics_notify(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = atomics_argument(argument_count, arguments, 0u);
    size_t length = 0u;
    size_t byte_index = 0u;
    result = atomics_validate_integer(context, frame.slots[0], true, &length);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_access(
            context,
            frame.slots[0],
            atomics_argument(argument_count, arguments, 1u),
            length,
            &byte_index
        );
    }
    double count = INFINITY;
    OseoValue requested = atomics_argument(argument_count, arguments, 2u);
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(requested) != OSEO_TAG_UNDEFINED) {
        result = atomics_integer_or_infinity(context, requested, &count);
        if (count < 0.0) count = 0.0;
    }
    double notified = 0.0;
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[1] = typed_array_object(frame.slots[0])->viewed_buffer;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        array_buffer_object(frame.slots[1])->shared) {
        while (result.status == OSEO_STATUS_NORMAL && notified < count) {
            OseoValue current = context->atomics_waiter_head;
            while (tag_of(current) != OSEO_TAG_UNDEFINED) {
                const OseoAtomicsWaiter *record =
                    atomics_waiter_object(current);
                if (record->buffer == frame.slots[1] &&
                    record->byte_index == byte_index) {
                    break;
                }
                current = record->next;
            }
            if (tag_of(current) == OSEO_TAG_UNDEFINED) break;
            frame.slots[2] = current;
            atomics_unlink_waiter(context, frame.slots[2]);
            result = atomics_resolve_waiter(context, frame.slots[2], "ok");
            notified += 1.0;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_number(notified));
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* CreateDataPropertyOrThrow on the fresh waitAsync result object. */
static OseoResult atomics_define_result(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
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
            (OseoPropertyAttributes){true, true, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The { async, value } record waitAsync returns. */
static OseoResult atomics_wait_result(
    OseoContext *context,
    bool asynchronous,
    OseoValue value
) {
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, result.value);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_define_result(
            context,
            slots[1],
            "async",
            oseo_boolean(asynchronous)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_define_result(context, slots[1], "value", slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(slots[1]);
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * The whole-millisecond deadline of a finite timeout `t` after `base`. A
 * fractional timeout rounds up, which is a permitted additionalTimeout.
 */
static uint64_t atomics_deadline(uint64_t base, double timeout) {
    double rounded = ceil(timeout);
    uint64_t delay = rounded >= 18446744073709549568.0
        ? UINT64_MAX
        : (uint64_t)rounded;
    return UINT64_MAX - base < delay ? UINT64_MAX : base + delay;
}

/*
 * SuspendThisAgent for a waiter no other agent can notify: the agent
 * blocks through the clock adapter until the deadline passes, or forever
 * for an infinite timeout, and the wait always ends "timed-out".
 */
static OseoResult atomics_suspend(OseoContext *context, double timeout) {
    OseoResult result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint64_t deadline = UINT64_MAX;
    if (isfinite(timeout)) {
        uint64_t now = 0u;
        result = oseo_internal_clock_now(context, &now);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        deadline = atomics_deadline(now, timeout);
    }
    for (;;) {
        uint64_t now = 0u;
        result = oseo_internal_clock_now(context, &now);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        if (isfinite(timeout) && now >= deadline) break;
        result = oseo_internal_clock_wait_until(context, deadline);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    return oseo_internal_ascii_string(context, "timed-out");
}

/*
 * Appends one pending waitAsync waiter to the WaiterList store. DoWait
 * computes the timeout time from the current time, not from the time the
 * task started, so a waiter created after a blocking wait or a long task
 * still waits its whole timeout before its timeout job becomes due.
 */
static OseoResult atomics_add_waiter(
    OseoContext *context,
    OseoValue buffer,
    size_t byte_index,
    OseoValue promise,
    double timeout
) {
    OseoValue slots[3] = {buffer, promise, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    uint64_t deadline = UINT64_MAX;
    if (isfinite(timeout)) {
        uint64_t now = 0u;
        result = oseo_internal_clock_now(context, &now);
        deadline = atomics_deadline(now, timeout);
    }
    OseoAtomicsWaiter *waiter = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        waiter = oseo_internal_allocate_heap_bytes(context, sizeof(*waiter));
        if (waiter == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Atomics waiter allocation failed."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        waiter->next = oseo_undefined();
        waiter->buffer = slots[0];
        waiter->promise = slots[1];
        waiter->timer = oseo_undefined();
        waiter->byte_index = byte_index;
        waiter->listed = true;
        result = oseo_internal_publish_heap(
            context,
            &waiter->header,
            OSEO_HEAP_ATOMICS_WAITER
        );
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        if (tag_of(context->atomics_waiter_tail) == OSEO_TAG_UNDEFINED) {
            context->atomics_waiter_head = slots[2];
        } else {
            atomics_waiter_object(context->atomics_waiter_tail)->next =
                slots[2];
        }
        context->atomics_waiter_tail = slots[2];
        if (isfinite(timeout)) {
            result = oseo_internal_atomics_timeout_enqueue(
                context,
                slots[2],
                deadline
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                atomics_waiter_object(slots[2])->timer = result.value;
            } else {
                atomics_unlink_waiter(context, slots[2]);
            }
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * DoWait(mode, typedArray, index, value, timeout). `asynchronous` selects
 * waitAsync. The comparison reads the element as the view's own type,
 * so an Int32Array compares ToInt32(value) and a BigInt64Array compares
 * ToBigInt64(value), both as two's-complement bits.
 */
static OseoResult atomics_wait(
    OseoContext *context,
    bool asynchronous,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = atomics_argument(argument_count, arguments, 0u);
    size_t length = 0u;
    size_t byte_index = 0u;
    result = atomics_validate_integer(context, frame.slots[0], true, &length);
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[1] = typed_array_object(frame.slots[0])->viewed_buffer;
        if (!array_buffer_object(frame.slots[1])->shared) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Atomics waiting needs a SharedArrayBuffer."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = atomics_access(
            context,
            frame.slots[0],
            atomics_argument(argument_count, arguments, 1u),
            length,
            &byte_index
        );
    }
    bool bigint = false;
    uint64_t expected = UINT64_C(0);
    if (result.status == OSEO_STATUS_NORMAL) {
        bigint = typed_array_object(frame.slots[0])->element_kind ==
            OSEO_TYPED_ARRAY_BIGINT64;
        OseoValue value = atomics_argument(argument_count, arguments, 2u);
        if (bigint) {
            result = oseo_internal_to_bigint(context, value);
            if (result.status == OSEO_STATUS_NORMAL) {
                expected = oseo_internal_bigint_to_raw_uint64(result.value);
            }
        } else {
            result = oseo_internal_to_number(context, value);
            if (result.status == OSEO_STATUS_NORMAL) {
                double number = number_value(result.value);
                expected = atomics_number_bits(
                    isfinite(number) ? trunc(number) : 0.0
                );
            }
        }
    }
    double timeout = INFINITY;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(
            context,
            atomics_argument(argument_count, arguments, 3u)
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            double number = number_value(result.value);
            timeout = isnan(number) ? INFINITY
                : number == -INFINITY ? 0.0
                : fmax(number, 0.0);
        }
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    /*
     * A shared buffer never detaches or shrinks, so the element the
     * access validated is still inside the block after the conversions.
     */
    uint64_t mask = bigint ? UINT64_MAX : UINT64_C(0xffffffff);
    uint64_t stored = atomics_read_raw(frame.slots[0], byte_index);
    if ((stored & mask) != (expected & mask)) {
        result = oseo_internal_ascii_string(context, "not-equal");
        if (asynchronous && result.status == OSEO_STATUS_NORMAL) {
            result = atomics_wait_result(context, false, result.value);
        }
    } else if (asynchronous && timeout == 0.0) {
        result = oseo_internal_ascii_string(context, "timed-out");
        if (result.status == OSEO_STATUS_NORMAL) {
            result = atomics_wait_result(context, false, result.value);
        }
    } else if (!asynchronous) {
        result = atomics_suspend(context, timeout);
    } else {
        result = oseo_internal_promise_create(context);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = atomics_add_waiter(
                context,
                frame.slots[1],
                byte_index,
                frame.slots[2],
                timeout
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = atomics_wait_result(context, true, frame.slots[2]);
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_atomics_builtin_dispatch(
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
    if (code_id < OSEO_ATOMICS_FUNCTION_CODE_ID_FIRST ||
        code_id > OSEO_ATOMICS_FUNCTION_CODE_ID_LAST) {
        return oseo_unknown_function(context, code_id);
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Atomics function is not a constructor."
        );
    }
    OseoAtomicsOperation operation = (OseoAtomicsOperation)(
        OSEO_ATOMICS_FUNCTION_CODE_ID_LAST - code_id
    );
    switch (operation) {
        case OSEO_ATOMICS_COMPARE_EXCHANGE:
            return atomics_compare_exchange(context, argument_count, arguments);
        case OSEO_ATOMICS_IS_LOCK_FREE:
            return atomics_is_lock_free(context, argument_count, arguments);
        case OSEO_ATOMICS_NOTIFY:
            return atomics_notify(context, argument_count, arguments);
        case OSEO_ATOMICS_WAIT:
            return atomics_wait(context, false, argument_count, arguments);
        case OSEO_ATOMICS_WAIT_ASYNC:
            return atomics_wait(context, true, argument_count, arguments);
        default:
            return atomics_read_modify_write(
                context,
                operation,
                argument_count,
                arguments
            );
    }
}

static OseoResult create_atomics_function(
    OseoContext *context,
    size_t operation
) {
    const OseoAtomicsFunction *entry = &atomics_functions[operation];
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
            OSEO_ATOMICS_FUNCTION_CODE_ID_LAST - operation,
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

static OseoResult define_atomics_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
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
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_atomics_intrinsic(OseoContext *context) {
    OseoValue *slot = &context->intrinsics[OSEO_INTRINSIC_ATOMICS];
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
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_ATOMICS_OPERATION_COUNT;
         index += 1u) {
        result = create_atomics_function(context, index);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_atomics_property(
            context,
            frame.slots[0],
            atomics_functions[index].name,
            frame.slots[1]
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
        result = oseo_internal_ascii_string(context, "Atomics");
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
    if (result.status == OSEO_STATUS_NORMAL) {
        *slot = frame.slots[0];
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(*slot) : result;
}

OseoResult oseo_internal_install_atomics_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_atomics_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_atomics_property(
            context,
            slots[0],
            "Atomics",
            slots[1]
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
