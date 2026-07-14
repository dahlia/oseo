#include <assert.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef uint64_t OseoValue;

typedef enum {
    OSEO_STATUS_OK = 0,
    OSEO_STATUS_THROW = 1,
} OseoStatus;

typedef struct {
    OseoStatus status;
    OseoValue value;
} OseoResult;

typedef struct OseoObject OseoObject;
struct OseoObject {
    OseoObject *next;
    bool marked;
    int64_t payload;
};

typedef struct OseoRootFrame OseoRootFrame;
struct OseoRootFrame {
    OseoRootFrame *previous;
    OseoValue *slots;
    size_t count;
};

typedef struct {
    OseoObject *objects;
    OseoRootFrame *roots;
    size_t object_count;
    size_t collection_count;
} OseoContext;

static const uint64_t TAG_MASK = UINT64_C(7);
static const uint64_t SMI_TAG = UINT64_C(1);
static const uint64_t SMI_PAYLOAD_MASK = UINT64_C(0x1fffffffffffffff);
static const uint64_t SMI_PAYLOAD_SIGN = UINT64_C(0x1000000000000000);

static OseoValue box_smi(int64_t value) {
    assert(value >= -INT64_C(1152921504606846976));
    assert(value <= INT64_C(1152921504606846975));
    return ((uint64_t)value << 3U) | SMI_TAG;
}

static int64_t unbox_smi(OseoValue value) {
    const uint64_t payload = value >> 3U;
    assert((value & TAG_MASK) == SMI_TAG);
    if ((payload & SMI_PAYLOAD_SIGN) == 0U) {
        return (int64_t)payload;
    }
    return -1 - (int64_t)((~payload) & SMI_PAYLOAD_MASK);
}

static OseoValue box_object(OseoObject *object) {
    const uintptr_t address = (uintptr_t)object;
    assert((address & TAG_MASK) == 0U);
    return (OseoValue)address;
}

static OseoObject *find_object(OseoContext *context, OseoValue value) {
    if (value == 0U || (value & TAG_MASK) != 0U) {
        return NULL;
    }
    for (OseoObject *object = context->objects;
         object != NULL;
         object = object->next) {
        if ((uintptr_t)object == (uintptr_t)value) {
            return object;
        }
    }
    return NULL;
}

static void push_roots(OseoContext *context, OseoRootFrame *frame) {
    frame->previous = context->roots;
    context->roots = frame;
}

static void pop_roots(OseoContext *context, OseoRootFrame *frame) {
    assert(context->roots == frame);
    context->roots = frame->previous;
}

static void collect(OseoContext *context) {
    context->collection_count += 1U;
    for (OseoRootFrame *frame = context->roots;
         frame != NULL;
         frame = frame->previous) {
        for (size_t index = 0; index < frame->count; index++) {
            OseoObject *object = find_object(context, frame->slots[index]);
            if (object != NULL) {
                object->marked = true;
            }
        }
    }

    OseoObject **cursor = &context->objects;
    while (*cursor != NULL) {
        OseoObject *object = *cursor;
        if (!object->marked) {
            *cursor = object->next;
            free(object);
            context->object_count -= 1U;
        } else {
            object->marked = false;
            cursor = &object->next;
        }
    }
}

static OseoValue allocate(OseoContext *context, int64_t payload) {
    collect(context);
    OseoObject *object = malloc(sizeof(*object));
    assert(object != NULL);
    object->next = context->objects;
    object->marked = false;
    object->payload = payload;
    context->objects = object;
    context->object_count += 1U;
    return box_object(object);
}

static int64_t object_payload(OseoContext *context, OseoValue value) {
    OseoObject *object = find_object(context, value);
    assert(object != NULL);
    return object->payload;
}

OseoValue oseo_smi_add_nonthrow(OseoValue left, OseoValue right) {
    return box_smi(unbox_smi(left) + unbox_smi(right));
}

OseoStatus oseo_add_status(
    OseoContext *context,
    const OseoValue *arguments,
    size_t argument_count,
    OseoValue *output
) {
    (void)context;
    if (argument_count != 2U) {
        *output = box_smi(-1);
        return OSEO_STATUS_THROW;
    }
    *output = oseo_smi_add_nonthrow(arguments[0], arguments[1]);
    return OSEO_STATUS_OK;
}

OseoResult oseo_add_result(
    OseoContext *context,
    const OseoValue *arguments,
    size_t argument_count
) {
    OseoResult result = { OSEO_STATUS_OK, 0U };
    result.status = oseo_add_status(
        context,
        arguments,
        argument_count,
        &result.value
    );
    return result;
}

static OseoStatus allocating_call(
    OseoContext *context,
    bool should_throw,
    OseoValue *output
) {
    OseoValue slots[] = { 0U };
    OseoRootFrame frame = { NULL, slots, 1U };
    push_roots(context, &frame);
    slots[0] = allocate(context, 42);
    collect(context);
    assert(object_payload(context, slots[0]) == 42);
    if (should_throw) {
        *output = box_smi(-99);
        pop_roots(context, &frame);
        return OSEO_STATUS_THROW;
    }
    *output = box_smi(object_payload(context, slots[0]));
    pop_roots(context, &frame);
    return OSEO_STATUS_OK;
}

static OseoStatus nested_call(OseoContext *context, OseoValue *output) {
    OseoValue inner = 0U;
    const OseoStatus status = allocating_call(context, false, &inner);
    if (status != OSEO_STATUS_OK) {
        *output = inner;
        return status;
    }
    const OseoValue arguments[] = { inner, box_smi(8) };
    return oseo_add_status(context, arguments, 2U, output);
}

static void destroy_context(OseoContext *context) {
    assert(context->roots == NULL);
    collect(context);
    assert(context->object_count == 0U);
}

int main(void) {
    OseoContext context = { NULL, NULL, 0U, 0U };
    const OseoValue arguments[] = { box_smi(19), box_smi(23) };
    OseoValue output = 0U;

    assert(oseo_add_status(&context, arguments, 2U, &output) == OSEO_STATUS_OK);
    assert(unbox_smi(output) == 42);
    const OseoResult result = oseo_add_result(&context, arguments, 2U);
    assert(result.status == OSEO_STATUS_OK);
    assert(unbox_smi(result.value) == 42);

    assert(nested_call(&context, &output) == OSEO_STATUS_OK);
    assert(unbox_smi(output) == 50);
    assert(context.roots == NULL);

    assert(allocating_call(&context, true, &output) == OSEO_STATUS_THROW);
    assert(unbox_smi(output) == -99);
    assert(context.roots == NULL);

    OseoValue slots[] = { allocate(&context, 7) };
    OseoRootFrame outer = { NULL, slots, 1U };
    push_roots(&context, &outer);
    (void)allocate(&context, 8);
    collect(&context);
    assert(object_payload(&context, slots[0]) == 7);
    assert(context.object_count == 1U);
    pop_roots(&context, &outer);

    destroy_context(&context);
    assert(context.collection_count >= 8U);
    puts(
        "abi-roots: normal, nested, abrupt, allocation, and forced "
        "collection passed"
    );
    return 0;
}
