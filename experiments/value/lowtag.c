#include <assert.h>
#include <float.h>
#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

typedef uint64_t OseoValue;

enum {
    LOWTAG_POINTER = 0,
    LOWTAG_SMI = 1,
    LOWTAG_BOOLEAN = 2,
    LOWTAG_NULL = 3,
    LOWTAG_UNDEFINED = 4,
};

enum {
    LOWTAG_KIND_NUMBER = 1,
    LOWTAG_KIND_OBJECT = 2,
};

typedef struct {
    uint64_t kind;
    double value;
} NumberBox;

typedef struct {
    uint64_t kind;
    uint64_t marker;
} ObjectBox;

static const uint64_t LOWTAG_MASK = UINT64_C(7);
static const uint64_t LOWTAG_PAYLOAD_MASK = UINT64_C(0x1fffffffffffffff);
static const uint64_t LOWTAG_PAYLOAD_SIGN = UINT64_C(0x1000000000000000);

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

static OseoValue lowtag_box_pointer(const void *pointer) {
    const uintptr_t address = (uintptr_t)pointer;
    assert(address != 0U);
    assert((address & LOWTAG_MASK) == 0U);
    return (OseoValue)address;
}

static void *lowtag_unbox_pointer(OseoValue value) {
    assert((value & LOWTAG_MASK) == LOWTAG_POINTER);
    assert(value != 0U);
    return (void *)(uintptr_t)value;
}

OseoValue lowtag_box_number(NumberBox *box, double value) {
    box->kind = LOWTAG_KIND_NUMBER;
    box->value = value;
    return lowtag_box_pointer(box);
}

bool lowtag_is_number(OseoValue value) {
    if ((value & LOWTAG_MASK) == LOWTAG_SMI) {
        return true;
    }
    if ((value & LOWTAG_MASK) != LOWTAG_POINTER || value == 0U) {
        return false;
    }
    return *(const uint64_t *)lowtag_unbox_pointer(value) == LOWTAG_KIND_NUMBER;
}

double lowtag_unbox_number(OseoValue value) {
    const NumberBox *box = lowtag_unbox_pointer(value);
    assert(box->kind == LOWTAG_KIND_NUMBER);
    return box->value;
}

OseoValue lowtag_box_smi(int64_t value) {
    assert(value >= -INT64_C(1152921504606846976));
    assert(value <= INT64_C(1152921504606846975));
    return ((uint64_t)value << 3U) | LOWTAG_SMI;
}

bool lowtag_is_smi(OseoValue value) {
    return (value & LOWTAG_MASK) == LOWTAG_SMI;
}

int64_t lowtag_unbox_smi(OseoValue value) {
    const uint64_t payload = value >> 3U;
    assert(lowtag_is_smi(value));
    if ((payload & LOWTAG_PAYLOAD_SIGN) == 0U) {
        return (int64_t)payload;
    }
    return -1 - (int64_t)((~payload) & LOWTAG_PAYLOAD_MASK);
}

bool lowtag_is_heap(OseoValue value) {
    return (value & LOWTAG_MASK) == LOWTAG_POINTER && value != 0U;
}

static OseoValue lowtag_immediate(unsigned tag, uint64_t payload) {
    return (payload << 3U) | tag;
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
    NumberBox boxes[sizeof(values) / sizeof(values[0])];
    for (size_t index = 0;
         index < sizeof(values) / sizeof(values[0]);
         index++) {
        const OseoValue boxed = lowtag_box_number(&boxes[index], values[index]);
        const double round_trip = lowtag_unbox_number(boxed);
        assert(lowtag_is_number(boxed));
        if (isnan(values[index])) {
            assert(isnan(round_trip));
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
    NumberBox nan_boxes[sizeof(nan_patterns) / sizeof(nan_patterns[0])];
    for (size_t index = 0;
         index < sizeof(nan_patterns) / sizeof(nan_patterns[0]);
         index++) {
        const double nan_value = bits_double(nan_patterns[index]);
        const OseoValue boxed = lowtag_box_number(&nan_boxes[index], nan_value);
        assert(lowtag_is_number(boxed));
        assert(isnan(lowtag_unbox_number(boxed)));
        assert(double_bits(lowtag_unbox_number(boxed)) == nan_patterns[index]);
    }
}

int main(void) {
    const int64_t integers[] = {
        -INT64_C(1152921504606846976),
        -1,
        0,
        1,
        INT64_C(1152921504606846975),
    };
    test_numbers();
    for (size_t index = 0;
         index < sizeof(integers) / sizeof(integers[0]);
         index++) {
        const OseoValue boxed = lowtag_box_smi(integers[index]);
        assert(lowtag_is_smi(boxed));
        assert(lowtag_is_number(boxed));
        assert(lowtag_unbox_smi(boxed) == integers[index]);
    }

    const OseoValue boolean_false = lowtag_immediate(LOWTAG_BOOLEAN, 0U);
    const OseoValue boolean_true = lowtag_immediate(LOWTAG_BOOLEAN, 1U);
    const OseoValue null_value = lowtag_immediate(LOWTAG_NULL, 0U);
    const OseoValue undefined_value = lowtag_immediate(LOWTAG_UNDEFINED, 0U);
    assert(boolean_false != boolean_true);
    assert((null_value & LOWTAG_MASK) == LOWTAG_NULL);
    assert((undefined_value & LOWTAG_MASK) == LOWTAG_UNDEFINED);

    ObjectBox object = { LOWTAG_KIND_OBJECT, UINT64_C(0x5a5a5a5a) };
    const OseoValue heap_value = lowtag_box_pointer(&object);
    assert(lowtag_is_heap(heap_value));
    assert(!lowtag_is_number(heap_value));
    assert(((ObjectBox *)lowtag_unbox_pointer(heap_value))->marker ==
           UINT64_C(0x5a5a5a5a));

    puts("lowtag: all correctness cases passed");
    return 0;
}
