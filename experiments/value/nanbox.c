#include <assert.h>
#include <float.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef uint64_t OseoValue;

enum {
    NANBOX_TAG_SMI = 1,
    NANBOX_TAG_BOOLEAN = 2,
    NANBOX_TAG_NULL = 3,
    NANBOX_TAG_UNDEFINED = 4,
    NANBOX_TAG_HEAP = 5,
};

static const uint64_t NANBOX_QNAN = UINT64_C(0x7ff8000000000000);
static const uint64_t NANBOX_TAG_MASK = UINT64_C(0x0007000000000000);
static const uint64_t NANBOX_PAYLOAD_MASK = UINT64_C(0x0000ffffffffffff);
static const uint64_t NANBOX_PAYLOAD_SIGN = UINT64_C(0x0000800000000000);

static uint64_t double_bits(double value) {
    uint64_t bits = 0;
    memcpy(&bits, &value, sizeof(bits));
    return bits;
}

static double bits_double(uint64_t bits) {
    double value = 0.0;
    memcpy(&value, &bits, sizeof(value));
    return value;
}

static unsigned nanbox_tag(OseoValue value) {
    return (unsigned)((value & NANBOX_TAG_MASK) >> 48U);
}

OseoValue nanbox_box_number(double value) {
    if (isnan(value)) {
        return NANBOX_QNAN;
    }
    return double_bits(value);
}

double nanbox_unbox_number(OseoValue value) {
    return bits_double(value);
}

bool nanbox_is_number(OseoValue value) {
    return (value & NANBOX_QNAN) != NANBOX_QNAN || nanbox_tag(value) == 0U;
}

OseoValue nanbox_box_smi(int64_t value) {
    assert(value >= -INT64_C(140737488355328));
    assert(value <= INT64_C(140737488355327));
    return NANBOX_QNAN | ((uint64_t)NANBOX_TAG_SMI << 48U) |
           ((uint64_t)value & NANBOX_PAYLOAD_MASK);
}

bool nanbox_is_smi(OseoValue value) {
    return (value & NANBOX_QNAN) == NANBOX_QNAN &&
           nanbox_tag(value) == NANBOX_TAG_SMI;
}

int64_t nanbox_unbox_smi(OseoValue value) {
    const uint64_t payload = value & NANBOX_PAYLOAD_MASK;
    assert(nanbox_is_smi(value));
    if ((payload & NANBOX_PAYLOAD_SIGN) == 0U) {
        return (int64_t)payload;
    }
    return -1 - (int64_t)((~payload) & NANBOX_PAYLOAD_MASK);
}

OseoValue nanbox_box_heap(const void *pointer) {
    const uintptr_t address = (uintptr_t)pointer;
    assert(address != 0U);
    assert((address & ~(uintptr_t)NANBOX_PAYLOAD_MASK) == 0U);
    return NANBOX_QNAN | ((uint64_t)NANBOX_TAG_HEAP << 48U) | (uint64_t)address;
}

bool nanbox_is_heap(OseoValue value) {
    return (value & NANBOX_QNAN) == NANBOX_QNAN &&
           nanbox_tag(value) == NANBOX_TAG_HEAP;
}

void *nanbox_unbox_heap(OseoValue value) {
    assert(nanbox_is_heap(value));
    return (void *)(uintptr_t)(value & NANBOX_PAYLOAD_MASK);
}

static OseoValue nanbox_immediate(unsigned tag, uint64_t payload) {
    return NANBOX_QNAN | ((uint64_t)tag << 48U) | payload;
}

static void test_numbers(void) {
    const double values[] = {
        0.0,
        -0.0,
        DBL_TRUE_MIN,
        -DBL_TRUE_MIN,
        DBL_MIN,
        -DBL_MIN,
        DBL_MAX,
        -DBL_MAX,
        INFINITY,
        -INFINITY,
        NAN,
    };
    for (size_t index = 0;
         index < sizeof(values) / sizeof(values[0]);
         index++) {
        const OseoValue boxed = nanbox_box_number(values[index]);
        const double round_trip = nanbox_unbox_number(boxed);
        assert(nanbox_is_number(boxed));
        if (isnan(values[index])) {
            assert(isnan(round_trip));
            assert(boxed == NANBOX_QNAN);
        } else {
            assert(double_bits(round_trip) == double_bits(values[index]));
        }
    }

    const uint64_t nan_patterns[] = {
        UINT64_C(0x7ff0000000000001),
        UINT64_C(0x7ff8123456789abc),
        UINT64_C(0xfff0000000000001),
        UINT64_C(0xfff8fedcba987654),
    };
    for (size_t index = 0;
         index < sizeof(nan_patterns) / sizeof(nan_patterns[0]);
         index++) {
        const double nan_value = bits_double(nan_patterns[index]);
        assert(isnan(nan_value));
        assert(nanbox_box_number(nan_value) == NANBOX_QNAN);
    }
}

int main(void) {
    const int64_t integers[] = {
        -INT64_C(140737488355328),
        -1,
        0,
        1,
        INT64_C(140737488355327),
    };
    test_numbers();
    for (size_t index = 0;
         index < sizeof(integers) / sizeof(integers[0]);
         index++) {
        const OseoValue boxed = nanbox_box_smi(integers[index]);
        assert(nanbox_is_smi(boxed));
        assert(!nanbox_is_number(boxed));
        assert(nanbox_unbox_smi(boxed) == integers[index]);
    }

    const OseoValue boolean_false = nanbox_immediate(NANBOX_TAG_BOOLEAN, 0U);
    const OseoValue boolean_true = nanbox_immediate(NANBOX_TAG_BOOLEAN, 1U);
    const OseoValue null_value = nanbox_immediate(NANBOX_TAG_NULL, 0U);
    const OseoValue undefined_value = nanbox_immediate(
        NANBOX_TAG_UNDEFINED,
        0U
    );
    assert(boolean_false != boolean_true);
    assert(nanbox_tag(null_value) == NANBOX_TAG_NULL);
    assert(nanbox_tag(undefined_value) == NANBOX_TAG_UNDEFINED);

    uint64_t *heap = malloc(sizeof(*heap));
    assert(heap != NULL);
    *heap = UINT64_C(0x5a5a5a5a);
    const OseoValue heap_value = nanbox_box_heap(heap);
    assert(nanbox_is_heap(heap_value));
    assert(nanbox_unbox_heap(heap_value) == heap);
    assert(*(uint64_t *)nanbox_unbox_heap(heap_value) == UINT64_C(0x5a5a5a5a));
    free(heap);

    puts("nanbox: all correctness cases passed");
    return 0;
}
