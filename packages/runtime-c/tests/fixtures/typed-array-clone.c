/*
 * Same-kind TypedArray clone evidence. The admitted constructor surface
 * cannot observe a clone's backing bytes, because the `buffer` accessor
 * is deferred, so this fixture reads the Data Blocks through the
 * package-private representation. A NaN payload that survives the clone
 * proves the same-kind branch copies bytes instead of loading and storing
 * canonicalized numbers; the BigInt64 case proves the copy also skips
 * the per-element BigInt round trip while keeping every byte.
 */
#include "runtime_internal.h"

#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

/* `new %Intrinsic%(...arguments)` through the public construction protocol. */
static OseoValue construct(
    OseoContext *context,
    OseoIntrinsic intrinsic,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue slots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    slots[0] = require_normal(oseo_intrinsic(context, intrinsic));
    OseoValue prototype =
        require_normal(oseo_function_prototype(context, slots[0]));
    slots[1] = require_normal(oseo_constructor_receiver(context, prototype));
    OseoValue returned = require_normal(oseo_call_function(
        context,
        slots[0],
        slots[1],
        argument_count,
        arguments,
        slots[0]
    ));
    OseoValue value =
        require_normal(oseo_constructor_result(context, returned, slots[1]));
    oseo_roots_pop(context, &frame);
    return value;
}

static OseoArrayBuffer *viewed_buffer(OseoValue view) {
    return array_buffer_object(typed_array_object(view)->viewed_buffer);
}

static uint8_t *view_bytes(OseoValue view) {
    return viewed_buffer(view)->data + typed_array_object(view)->byte_offset;
}

/*
 * Clone `source` through `new %Intrinsic%(source)` and require a fresh
 * buffer holding exactly `byte_length` bytes equal to `expected`.
 */
static void expect_clone(
    OseoContext *context,
    OseoIntrinsic intrinsic,
    OseoValue *slots,
    const uint8_t *expected,
    size_t byte_length
) {
    slots[1] = construct(context, intrinsic, 1u, &slots[0]);
    oseo_collect(context);
    assert(viewed_buffer(slots[1]) != viewed_buffer(slots[0]));
    assert(typed_array_object(slots[1])->byte_offset == 0u);
    assert(viewed_buffer(slots[1])->byte_length == byte_length);
    assert(memcmp(view_bytes(slots[1]), expected, byte_length) == 0);
}

int main(void) {
    /*
     * Every pattern below is a NaN in both byte orders: the leading and
     * trailing bytes set the sign and every exponent bit, and the middle
     * bytes leave a nonzero, non-canonical mantissa.
     */
    static const uint8_t float64_payload[8] =
        {0xffu, 0xf1u, 0x02u, 0x03u, 0x04u, 0x05u, 0xf6u, 0xffu};
    static const uint8_t float32_payload[4] = {0xffu, 0xc1u, 0xc2u, 0xffu};
    static const uint8_t bigint64_payload[16] = {
        0x80u, 0x81u, 0x82u, 0x83u, 0x84u, 0x85u, 0x86u, 0x87u,
        0xffu, 0xfeu, 0xfdu, 0xfcu, 0xfbu, 0xfau, 0xf9u, 0xf8u,
    };
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "typed-array-clone.c", 19u);
    (void)require_normal(oseo_roots_allocate(&context, &frame, 4u));
    OseoValue *slots = frame.slots;

    OseoValue length = oseo_number(1.0);
    slots[0] = construct(&context, OSEO_INTRINSIC_FLOAT64_ARRAY, 1u, &length);
    memcpy(view_bytes(slots[0]), float64_payload, sizeof(float64_payload));
    expect_clone(
        &context,
        OSEO_INTRINSIC_FLOAT64_ARRAY,
        slots,
        float64_payload,
        sizeof(float64_payload)
    );

    slots[0] = construct(&context, OSEO_INTRINSIC_FLOAT32_ARRAY, 1u, &length);
    memcpy(view_bytes(slots[0]), float32_payload, sizeof(float32_payload));
    expect_clone(
        &context,
        OSEO_INTRINSIC_FLOAT32_ARRAY,
        slots,
        float32_payload,
        sizeof(float32_payload)
    );

    length = oseo_number(2.0);
    slots[0] =
        construct(&context, OSEO_INTRINSIC_BIGINT64_ARRAY, 1u, &length);
    memcpy(view_bytes(slots[0]), bigint64_payload, sizeof(bigint64_payload));
    expect_clone(
        &context,
        OSEO_INTRINSIC_BIGINT64_ARRAY,
        slots,
        bigint64_payload,
        sizeof(bigint64_payload)
    );

    /*
     * A view that starts inside its buffer clones only its own range, so
     * the copy honors the source byte offset rather than the block start.
     */
    slots[2] = typed_array_object(slots[0])->viewed_buffer;
    slots[3] = oseo_number(8.0);
    slots[0] =
        construct(&context, OSEO_INTRINSIC_BIGINT64_ARRAY, 2u, &slots[2]);
    assert(typed_array_object(slots[0])->byte_offset == 8u);
    expect_clone(
        &context,
        OSEO_INTRINSIC_BIGINT64_ARRAY,
        slots,
        bigint64_payload + 8u,
        8u
    );

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
