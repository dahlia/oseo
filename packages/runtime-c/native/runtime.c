#include "oseo_runtime.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define OSEO_CANONICAL_NAN UINT64_C(0x7ff8000000000000)
#define OSEO_MAX_ACTIVE_FRAME_SLOTS ((size_t)32768u)
#define OSEO_MAX_CALL_DEPTH ((size_t)256u)
#define OSEO_PAYLOAD_MASK UINT64_C(0x0000ffffffffffff)
#define OSEO_TAG_SHIFT 48u
#define OSEO_TAG_SMI UINT64_C(1)
#define OSEO_TAG_UNDEFINED UINT64_C(2)
#define OSEO_TAG_NULL UINT64_C(3)
#define OSEO_TAG_BOOLEAN UINT64_C(4)
#define OSEO_TAG_HEAP UINT64_C(5)
#define OSEO_TAG_UNINITIALIZED UINT64_C(6)
#define OSEO_SMI_MIN INT64_C(-140737488355328)
#define OSEO_SMI_MAX INT64_C(140737488355327)

typedef enum {
    OSEO_HEAP_STRING = 1,
    OSEO_HEAP_ENVIRONMENT = 2,
    OSEO_HEAP_OBJECT = 3,
    OSEO_HEAP_ARRAY = 4,
    OSEO_HEAP_CELL = 5,
    OSEO_HEAP_FUNCTION = 6,
} OseoHeapKind;

struct OseoHeapObject {
    OseoHeapObject *next;
    OseoHeapKind kind;
    bool marked;
    bool traced;
};

typedef struct {
    OseoHeapObject header;
    size_t length;
    uint16_t units[];
} OseoString;

typedef struct {
    OseoHeapObject header;
    size_t slot_count;
    OseoValue slots[];
} OseoEnvironment;

typedef struct {
    OseoHeapObject header;
    OseoValue value;
} OseoCell;

typedef struct {
    OseoPropertyAttributes attributes;
    OseoValue key;
    OseoValue value;
} OseoProperty;

typedef struct {
    OseoHeapObject header;
    OseoValue prototype;
    OseoProperty *properties;
    size_t property_capacity;
    size_t property_count;
    size_t shape_id;
    uint32_t array_length;
    bool dictionary;
    bool length_writable;
} OseoOrdinaryObject;

typedef struct {
    OseoOrdinaryObject ordinary;
    OseoValue environment;
    OseoValue prototype_object;
    size_t code_id;
} OseoFunction;

static OseoValue tagged(uint64_t tag, uint64_t payload) {
    return OSEO_CANONICAL_NAN | (tag << OSEO_TAG_SHIFT) |
        (payload & OSEO_PAYLOAD_MASK);
}

static uint64_t tag_of(OseoValue value) {
    if ((value & OSEO_CANONICAL_NAN) != OSEO_CANONICAL_NAN) {
        return 0u;
    }
    return (value >> OSEO_TAG_SHIFT) & UINT64_C(7);
}

static OseoHeapObject *heap_object(OseoValue value) {
    uintptr_t address = (uintptr_t)(value & OSEO_PAYLOAD_MASK);
    return (OseoHeapObject *)address;
}

static OseoString *string_object(OseoValue value) {
    return (OseoString *)heap_object(value);
}

static OseoEnvironment *environment_object(OseoValue value) {
    return (OseoEnvironment *)heap_object(value);
}

static OseoOrdinaryObject *ordinary_object(OseoValue value) {
    return (OseoOrdinaryObject *)heap_object(value);
}

static OseoCell *cell_object(OseoValue value) {
    return (OseoCell *)heap_object(value);
}

static OseoFunction *function_object(OseoValue value) {
    return (OseoFunction *)heap_object(value);
}

static OseoResult normal(OseoValue value) {
    OseoResult result = {OSEO_STATUS_NORMAL, value};
    return result;
}

static OseoResult failure(
    OseoContext *context,
    const char *code,
    const char *message
) {
    context->error_code = code;
    context->error_message = message;
    context->has_diagnostic = true;
    OseoResult result = {OSEO_STATUS_THROW, oseo_undefined()};
    return result;
}

static OseoResult language_failure(void) {
    OseoResult result = {OSEO_STATUS_THROW, oseo_undefined()};
    return result;
}

static uint64_t double_bits(double value) {
    uint64_t bits;
    memcpy(&bits, &value, sizeof(bits));
    return bits;
}

static double bits_double(uint64_t bits) {
    double value;
    memcpy(&value, &bits, sizeof(value));
    return value;
}

static bool is_number(OseoValue value) {
    return tag_of(value) == 0u || tag_of(value) == OSEO_TAG_SMI;
}

static bool is_string(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_STRING;
}

static bool is_environment(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ENVIRONMENT;
}

static bool is_cell(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_CELL;
}

static bool is_function(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_FUNCTION;
}

static bool is_object(OseoValue value) {
    if (tag_of(value) != OSEO_TAG_HEAP) return false;
    OseoHeapKind kind = heap_object(value)->kind;
    return kind == OSEO_HEAP_OBJECT || kind == OSEO_HEAP_ARRAY ||
        kind == OSEO_HEAP_FUNCTION;
}

static bool is_array(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
        heap_object(value)->kind == OSEO_HEAP_ARRAY;
}

static int64_t smi_value(OseoValue value) {
    uint64_t payload = value & OSEO_PAYLOAD_MASK;
    if ((payload & UINT64_C(0x0000800000000000)) != 0u) {
        payload |= UINT64_C(0xffff000000000000);
    }
    return (int64_t)payload;
}

static double number_value(OseoValue value) {
    if (tag_of(value) == OSEO_TAG_SMI) return (double)smi_value(value);
    return bits_double(value);
}

static void mark_value(OseoValue value) {
    if (tag_of(value) != OSEO_TAG_HEAP) return;
    OseoHeapObject *object = heap_object(value);
    object->marked = true;
}

static void trace_object(OseoHeapObject *object) {
    if (object->kind == OSEO_HEAP_ENVIRONMENT) {
        OseoEnvironment *environment = (OseoEnvironment *)object;
        for (size_t index = 0u; index < environment->slot_count; index += 1u) {
            mark_value(environment->slots[index]);
        }
    } else if (object->kind == OSEO_HEAP_CELL) {
        mark_value(((OseoCell *)object)->value);
    } else if (object->kind == OSEO_HEAP_OBJECT ||
               object->kind == OSEO_HEAP_ARRAY ||
               object->kind == OSEO_HEAP_FUNCTION) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        mark_value(ordinary->prototype);
        for (size_t index = 0u; index < ordinary->property_count; index += 1u) {
            mark_value(ordinary->properties[index].key);
            mark_value(ordinary->properties[index].value);
        }
        if (object->kind == OSEO_HEAP_FUNCTION) {
            OseoFunction *function = (OseoFunction *)object;
            mark_value(function->environment);
            mark_value(function->prototype_object);
        }
    }
}

static void destroy_heap_object(OseoHeapObject *object) {
    if (object->kind == OSEO_HEAP_OBJECT ||
        object->kind == OSEO_HEAP_ARRAY ||
        object->kind == OSEO_HEAP_FUNCTION) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        free(ordinary->properties);
    }
    free(object);
}

void oseo_collect(OseoContext *context) {
    if (context->observe_specialization) context->collections += 1u;
    for (OseoRootFrame *frame = context->roots;
         frame != NULL;
         frame = frame->previous) {
        for (size_t index = 0u; index < frame->slot_count; index += 1u) {
            mark_value(frame->slots[index]);
        }
    }
    bool traced_object;
    do {
        traced_object = false;
        for (OseoHeapObject *object = context->objects;
             object != NULL;
             object = object->next) {
            if (object->marked && !object->traced) {
                object->traced = true;
                trace_object(object);
                traced_object = true;
            }
        }
    } while (traced_object);
    OseoHeapObject **link = &context->objects;
    while (*link != NULL) {
        OseoHeapObject *object = *link;
        if (object->marked) {
            object->marked = false;
            object->traced = false;
            link = &object->next;
        } else {
            *link = object->next;
            destroy_heap_object(object);
        }
    }
}

void oseo_context_init(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length
) {
    context->roots = NULL;
    context->objects = NULL;
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    context->error_code = "OSEO2001";
    context->error_message = "Unsupported runtime behavior.";
    context->has_diagnostic = false;
    context->active_frame_slots = 0u;
    context->call_depth = 0u;
    context->line = 1u;
    context->column = 1u;
    context->guard_hits = 0u;
    context->guard_misses = 0u;
    context->overflow_misses = 0u;
    context->generic_addition_calls = 0u;
    context->next_shape_id = 1u;
    context->allocations = 0u;
    context->allocation_attempts = 0u;
    context->collections = 0u;
    context->fail_allocation_at = 0u;
    context->observe_specialization = false;
    context->collect_every_safepoint =
        getenv("OSEO_GC_EVERY_SAFEPOINT") != NULL;
}

void oseo_context_fail_allocation_at(OseoContext *context, size_t attempt) {
    context->allocation_attempts = 0u;
    context->fail_allocation_at = attempt;
}

void oseo_context_destroy(OseoContext *context) {
    context->roots = NULL;
    oseo_collect(context);
}

void oseo_context_location(
    OseoContext *context,
    size_t line,
    size_t column
) {
    context->line = line;
    context->column = column;
}

void oseo_context_print_error(const OseoContext *context) {
    (void)fwrite(
        context->source_id,
        1u,
        context->source_id_length,
        stderr
    );
    (void)fprintf(
        stderr,
        ":%zu:%zu: error[%s]: %s\n",
        context->line,
        context->column,
        context->error_code,
        context->error_message
    );
}

void oseo_context_print_observations(const OseoContext *context) {
    (void)fprintf(
        stderr,
        "OSEO_OBSERVATIONS "
        "{\"guardHits\":%zu,\"guardMisses\":%zu,"
        "\"overflowMisses\":%zu,\"genericAdditionCalls\":%zu,"
        "\"allocations\":%zu,\"collections\":%zu}\n",
        context->guard_hits,
        context->guard_misses,
        context->overflow_misses,
        context->generic_addition_calls,
        context->allocations,
        context->collections
    );
}

OseoResult oseo_call_enter(OseoContext *context) {
    if (context->call_depth >= OSEO_MAX_CALL_DEPTH) {
        return failure(
            context,
            "OSEO2001",
            "Maximum call depth exceeded."
        );
    }
    context->call_depth += 1u;
    return normal(oseo_undefined());
}

void oseo_call_leave(OseoContext *context) {
    if (context->call_depth > 0u) context->call_depth -= 1u;
}

OseoResult oseo_frame_enter(OseoContext *context, size_t slot_count) {
    if (slot_count >
        OSEO_MAX_ACTIVE_FRAME_SLOTS - context->active_frame_slots) {
        return failure(
            context,
            "OSEO2001",
            "Maximum active native frame budget exceeded."
        );
    }
    context->active_frame_slots += slot_count;
    return normal(oseo_undefined());
}

void oseo_frame_leave(OseoContext *context, size_t slot_count) {
    if (slot_count <= context->active_frame_slots) {
        context->active_frame_slots -= slot_count;
    } else {
        context->active_frame_slots = 0u;
    }
}

void oseo_roots_push(OseoContext *context, OseoRootFrame *frame) {
    frame->previous = context->roots;
    context->roots = frame;
}

void oseo_roots_pop(OseoContext *context, OseoRootFrame *frame) {
    if (context->roots == frame) context->roots = frame->previous;
}

OseoResult oseo_roots_allocate(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t slot_count
) {
    OseoValue *slots = NULL;
    if (slot_count > 0u) {
        if (slot_count > SIZE_MAX / sizeof(OseoValue)) {
            return failure(
                context,
                "OSEO2001",
                "Root frame allocation is too large."
            );
        }
        slots = calloc(slot_count, sizeof(OseoValue));
        if (slots == NULL) {
            return failure(
                context,
                "OSEO2001",
                "Root frame allocation failed."
            );
        }
    }
    frame->previous = NULL;
    frame->slots = slots;
    frame->slot_count = slot_count;
    oseo_roots_push(context, frame);
    return normal(oseo_undefined());
}

void oseo_roots_release(OseoContext *context, OseoRootFrame *frame) {
    oseo_roots_pop(context, frame);
    free(frame->slots);
    frame->previous = NULL;
    frame->slots = NULL;
    frame->slot_count = 0u;
}

OseoValue oseo_undefined(void) {
    return tagged(OSEO_TAG_UNDEFINED, 0u);
}

OseoValue oseo_uninitialized(void) {
    return tagged(OSEO_TAG_UNINITIALIZED, 0u);
}

OseoResult oseo_read_binding(OseoContext *context, OseoValue value) {
    if (tag_of(value) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "Binding is read before initialization."
        );
    }
    return normal(value);
}

OseoValue oseo_null(void) {
    return tagged(OSEO_TAG_NULL, 0u);
}

OseoValue oseo_boolean(bool value) {
    return tagged(OSEO_TAG_BOOLEAN, value ? 1u : 0u);
}

OseoValue oseo_number(double value) {
    if (isnan(value)) return OSEO_CANONICAL_NAN;
    if (value == 0.0 && signbit(value)) return double_bits(value);
    if (isfinite(value) && trunc(value) == value &&
        value >= (double)OSEO_SMI_MIN && value <= (double)OSEO_SMI_MAX) {
        int64_t integer = (int64_t)value;
        return tagged(OSEO_TAG_SMI, (uint64_t)integer);
    }
    return double_bits(value);
}

bool oseo_to_boolean(OseoValue value) {
    uint64_t tag = tag_of(value);
    if (tag == OSEO_TAG_UNDEFINED || tag == OSEO_TAG_NULL) return false;
    if (tag == OSEO_TAG_BOOLEAN) return (value & 1u) != 0u;
    if (is_number(value)) {
        double number = number_value(value);
        return number != 0.0 && !isnan(number);
    }
    if (is_string(value)) return string_object(value)->length != 0u;
    return tag == OSEO_TAG_HEAP;
}

static void *allocate_heap_bytes(OseoContext *context, size_t size) {
    if (context->collect_every_safepoint) oseo_collect(context);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return NULL;
    }
    return malloc(size);
}

static OseoResult publish_heap(
    OseoContext *context,
    OseoHeapObject *object,
    OseoHeapKind kind
) {
    uintptr_t address = (uintptr_t)object;
    if (address == 0u || address > OSEO_PAYLOAD_MASK) {
        free(object);
        return failure(
            context,
            "OSEO3001",
            "The host cannot represent a heap address in 48 bits."
        );
    }
    object->next = context->objects;
    object->kind = kind;
    object->marked = false;
    object->traced = false;
    context->objects = object;
    if (context->observe_specialization &&
        kind != OSEO_HEAP_ENVIRONMENT && kind != OSEO_HEAP_CELL &&
        kind != OSEO_HEAP_FUNCTION) {
        context->allocations += 1u;
    }
    return normal(tagged(OSEO_TAG_HEAP, (uint64_t)address));
}

static OseoResult allocate_string(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    if (length > (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t size = sizeof(OseoString) + length * sizeof(uint16_t);
    OseoString *object = allocate_heap_bytes(context, size);
    if (object == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    object->length = length;
    if (length > 0u) memcpy(object->units, units, length * sizeof(uint16_t));
    return publish_heap(context, &object->header, OSEO_HEAP_STRING);
}

OseoResult oseo_string_from_units(
    OseoContext *context,
    const uint16_t *units,
    size_t length
) {
    return allocate_string(context, units, length);
}

OseoResult oseo_environment_create(OseoContext *context, size_t slot_count) {
    if (slot_count >
        (SIZE_MAX - sizeof(OseoEnvironment)) / sizeof(OseoValue)) {
        return failure(
            context,
            "OSEO2001",
            "Environment allocation is too large."
        );
    }
    size_t size = sizeof(OseoEnvironment) +
        slot_count * sizeof(OseoValue);
    OseoEnvironment *environment = allocate_heap_bytes(context, size);
    if (environment == NULL) {
        return failure(context, "OSEO2001", "Environment allocation failed.");
    }
    environment->slot_count = slot_count;
    for (size_t index = 0u; index < slot_count; index += 1u) {
        environment->slots[index] = oseo_undefined();
    }
    return publish_heap(
        context,
        &environment->header,
        OSEO_HEAP_ENVIRONMENT
    );
}

OseoResult oseo_environment_get(
    OseoContext *context,
    OseoValue environment_value,
    size_t index
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    OseoEnvironment *environment = environment_object(environment_value);
    if (index >= environment->slot_count) {
        return failure(context, "OSEO2001", "Environment index is invalid.");
    }
    return normal(environment->slots[index]);
}

OseoResult oseo_environment_set(
    OseoContext *context,
    OseoValue environment_value,
    size_t index,
    OseoValue value
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    OseoEnvironment *environment = environment_object(environment_value);
    if (index >= environment->slot_count) {
        return failure(context, "OSEO2001", "Environment index is invalid.");
    }
    environment->slots[index] = value;
    return normal(value);
}

OseoResult oseo_environment_clone(
    OseoContext *context,
    OseoValue environment_value
) {
    if (!is_environment(environment_value)) {
        return failure(context, "OSEO2001", "Value is not an environment.");
    }
    size_t slot_count = environment_object(environment_value)->slot_count;
    OseoResult created = oseo_environment_create(context, slot_count);
    if (created.status != OSEO_STATUS_NORMAL) return created;
    OseoEnvironment *source = environment_object(environment_value);
    OseoEnvironment *target = environment_object(created.value);
    if (slot_count > 0u) {
        memcpy(
            target->slots,
            source->slots,
            slot_count * sizeof(*target->slots)
        );
    }
    return created;
}

OseoResult oseo_cell_create(OseoContext *context, OseoValue value) {
    OseoCell *cell = allocate_heap_bytes(context, sizeof(*cell));
    if (cell == NULL) {
        return failure(context, "OSEO2001", "Binding cell allocation failed.");
    }
    cell->value = value;
    return publish_heap(context, &cell->header, OSEO_HEAP_CELL);
}

OseoResult oseo_cell_get(OseoContext *context, OseoValue cell_value) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    return oseo_read_binding(context, cell_object(cell_value)->value);
}

OseoResult oseo_cell_set(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (tag_of(cell_object(cell_value)->value) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "Binding was assigned before initialization."
        );
    }
    cell_object(cell_value)->value = value;
    return normal(value);
}

OseoResult oseo_cell_initialize(
    OseoContext *context,
    OseoValue cell_value,
    OseoValue value
) {
    if (!is_cell(cell_value)) {
        return failure(context, "OSEO2001", "Value is not a binding cell.");
    }
    if (tag_of(cell_object(cell_value)->value) != OSEO_TAG_UNINITIALIZED) {
        return failure(context, "OSEO2001", "Binding is already initialized.");
    }
    cell_object(cell_value)->value = value;
    return normal(value);
}

OseoResult oseo_function_create(
    OseoContext *context,
    size_t code_id,
    OseoValue environment
) {
    if (!is_environment(environment)) {
        return failure(context, "OSEO2001", "Invalid function environment.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_create(context, oseo_null());
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL &&
        context->observe_specialization && context->allocations > 0u) {
        context->allocations -= 1u;
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoFunction *function = allocate_heap_bytes(context, sizeof(*function));
    if (function == NULL) {
        oseo_roots_release(context, &frame);
        return failure(context, "OSEO2001", "Function allocation failed.");
    }
    function->ordinary.prototype = oseo_null();
    function->ordinary.properties = NULL;
    function->ordinary.property_capacity = 0u;
    function->ordinary.property_count = 0u;
    function->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    function->ordinary.array_length = 0u;
    function->ordinary.dictionary = false;
    function->ordinary.length_writable = false;
    function->environment = environment;
    function->prototype_object = frame.slots[0];
    function->code_id = code_id;
    result = publish_heap(
        context,
        &function->ordinary.header,
        OSEO_HEAP_FUNCTION
    );
    frame.slots[1] = result.value;
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_function_environment(
    OseoContext *context,
    OseoValue function_value
) {
    if (!is_function(function_value)) {
        return failure(context, "OSEO2001", "Value is not callable.");
    }
    return normal(function_object(function_value)->environment);
}

OseoResult oseo_function_code_id(
    OseoContext *context,
    OseoValue function_value,
    size_t *code_id
) {
    if (!is_function(function_value)) {
        return failure(context, "OSEO2001", "Value is not callable.");
    }
    *code_id = function_object(function_value)->code_id;
    return normal(function_value);
}

OseoResult oseo_unknown_function(OseoContext *context, size_t code_id) {
    (void)code_id;
    return failure(context, "OSEO2001", "Function code identity is invalid.");
}

OseoResult oseo_function_prototype(
    OseoContext *context,
    OseoValue function_value
) {
    if (!is_function(function_value)) {
        return failure(context, "OSEO2001", "Value is not a constructor.");
    }
    return normal(function_object(function_value)->prototype_object);
}

OseoResult oseo_constructor_result(
    OseoContext *context,
    OseoValue returned,
    OseoValue receiver
) {
    (void)context;
    return normal(is_object(returned) ? returned : receiver);
}

static bool string_equal(OseoValue left, OseoValue right) {
    if (!is_string(left) || !is_string(right)) return false;
    OseoString *left_string = string_object(left);
    OseoString *right_string = string_object(right);
    return left_string->length == right_string->length &&
        memcmp(
            left_string->units,
            right_string->units,
            left_string->length * sizeof(uint16_t)
        ) == 0;
}

static bool same_property_value(OseoValue left, OseoValue right) {
    if (is_number(left) && is_number(right)) {
        double left_number = number_value(left);
        double right_number = number_value(right);
        if (isnan(left_number) && isnan(right_number)) return true;
        if (left_number == 0.0 && right_number == 0.0) {
            return signbit(left_number) == signbit(right_number);
        }
        return left_number == right_number;
    }
    if (is_string(left) && is_string(right)) return string_equal(left, right);
    return left == right;
}

static size_t own_property_index(
    const OseoOrdinaryObject *object,
    OseoValue key
) {
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (string_equal(object->properties[index].key, key)) return index;
    }
    return SIZE_MAX;
}

static bool string_is_ascii(OseoValue value, const char *text) {
    if (!is_string(value)) return false;
    OseoString *string = string_object(value);
    size_t length = strlen(text);
    if (string->length != length) return false;
    for (size_t index = 0u; index < length; index += 1u) {
        if (string->units[index] !=
            (uint16_t)(unsigned char)text[index]) return false;
    }
    return true;
}

static bool array_index(OseoValue key, uint32_t *result) {
    if (!is_string(key)) return false;
    OseoString *string = string_object(key);
    if (string->length == 0u || string->length > 10u) return false;
    if (string->length > 1u && string->units[0] == UINT16_C(0x30)) {
        return false;
    }
    uint64_t value = 0u;
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint16_t unit = string->units[index];
        if (unit < UINT16_C(0x30) || unit > UINT16_C(0x39)) return false;
        value = value * UINT64_C(10) + (uint64_t)(unit - UINT16_C(0x30));
        if (value > UINT64_C(4294967294)) return false;
    }
    *result = (uint32_t)value;
    return true;
}

static bool remove_property(OseoOrdinaryObject *object, size_t index) {
    if (!object->properties[index].attributes.configurable) return false;
    for (size_t next = index + 1u; next < object->property_count; next += 1u) {
        object->properties[next - 1u] = object->properties[next];
    }
    object->property_count -= 1u;
    return true;
}

static OseoResult set_array_length(
    OseoContext *context,
    OseoOrdinaryObject *array,
    OseoValue value
) {
    if (!is_number(value)) {
        return language_failure();
    }
    double number = number_value(value);
    if (!isfinite(number) || number < 0.0 ||
        number > 4294967295.0 || floor(number) != number) {
        return language_failure();
    }
    if (!array->length_writable) return normal(value);
    uint32_t requested = (uint32_t)number;
    if (requested < array->array_length) {
        while (true) {
            size_t selected = SIZE_MAX;
            uint32_t selected_index = 0u;
            for (
                size_t index = 0u;
                index < array->property_count;
                index += 1u
            ) {
                uint32_t property_index;
                if (array_index(
                        array->properties[index].key,
                        &property_index
                    ) &&
                    property_index >= requested &&
                    (selected == SIZE_MAX || property_index > selected_index)) {
                    selected = index;
                    selected_index = property_index;
                }
            }
            if (selected == SIZE_MAX) break;
            uint32_t property_index;
            if (!array_index(
                    array->properties[selected].key,
                    &property_index
                ) ||
                !remove_property(array, selected)) {
                array->array_length = selected_index + 1u;
                return language_failure();
            }
        }
    }
    array->array_length = requested;
    array->dictionary = true;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(value);
}

static OseoResult require_object_and_key(
    OseoContext *context,
    OseoValue object,
    OseoValue key
) {
    if (!is_object(object)) {
        return failure(context, "OSEO2001", "Value is not an ordinary object.");
    }
    if (!is_string(key)) {
        return failure(context, "OSEO2001", "Property key is not a string.");
    }
    return normal(object);
}

OseoResult oseo_object_create(OseoContext *context, OseoValue prototype) {
    if (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype)) {
        return failure(context, "OSEO2001", "Prototype is not object or null.");
    }
    OseoOrdinaryObject *object = allocate_heap_bytes(context, sizeof(*object));
    if (object == NULL) {
        return failure(context, "OSEO2001", "Object allocation failed.");
    }
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    return publish_heap(context, &object->header, OSEO_HEAP_OBJECT);
}

OseoResult oseo_array_create(OseoContext *context, size_t length) {
    if (length > UINT32_MAX) {
        return failure(context, "OSEO2001", "Array length is too large.");
    }
    OseoOrdinaryObject *array = allocate_heap_bytes(context, sizeof(*array));
    if (array == NULL) {
        return failure(context, "OSEO2001", "Array allocation failed.");
    }
    array->prototype = oseo_null();
    array->properties = NULL;
    array->property_capacity = 0u;
    array->property_count = 0u;
    array->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    array->array_length = (uint32_t)length;
    array->dictionary = false;
    array->length_writable = true;
    return publish_heap(context, &array->header, OSEO_HEAP_ARRAY);
}

static OseoResult grow_properties(
    OseoContext *context,
    OseoValue object_value
) {
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (object->property_count < object->property_capacity) {
        return normal(object_value);
    }
    size_t capacity = object->property_capacity == 0u
        ? 4u
        : object->property_capacity * 2u;
    if (capacity < object->property_capacity ||
        capacity > SIZE_MAX / sizeof(OseoProperty)) {
        return failure(context, "OSEO2001", "Property storage is too large.");
    }
    if (context->collect_every_safepoint) oseo_collect(context);
    object = ordinary_object(object_value);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    OseoProperty *properties = malloc(capacity * sizeof(*properties));
    if (properties == NULL) {
        return failure(context, "OSEO2001", "Property allocation failed.");
    }
    if (object->property_count > 0u) {
        memcpy(
            properties,
            object->properties,
            object->property_count * sizeof(*properties)
        );
    }
    free(object->properties);
    object->properties = properties;
    object->property_capacity = capacity;
    return normal(object_value);
}

OseoResult oseo_object_get(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    OseoResult valid = require_object_and_key(context, object_value, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        return normal(function_object(object_value)->prototype_object);
    }
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        return normal(oseo_number(ordinary_object(object_value)->array_length));
    }
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoOrdinaryObject *object = ordinary_object(current);
        size_t index = own_property_index(object, key);
        if (index != SIZE_MAX) return normal(object->properties[index].value);
        current = object->prototype;
    }
    return normal(oseo_undefined());
}

OseoResult oseo_object_get_cached(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoPropertyCache *cache
) {
    if (is_object(object_value)) {
        OseoOrdinaryObject *object = ordinary_object(object_value);
        if (!object->dictionary && cache->shape_id != 0u &&
            cache->shape_id == object->shape_id &&
            cache->slot < object->property_count &&
            string_equal(object->properties[cache->slot].key, key)) {
            if (context->observe_specialization) context->guard_hits += 1u;
            return normal(object->properties[cache->slot].value);
        }
    }
    if (context->observe_specialization) context->guard_misses += 1u;
    OseoResult result = oseo_object_get(context, object_value, key);
    if (result.status != OSEO_STATUS_NORMAL || !is_object(object_value)) {
        return result;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t slot = own_property_index(object, key);
    if (!object->dictionary && slot != SIZE_MAX) {
        cache->shape_id = object->shape_id;
        cache->slot = slot;
    } else {
        cache->shape_id = 0u;
        cache->slot = 0u;
    }
    return result;
}

OseoResult oseo_object_has_own(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    OseoResult valid = require_object_and_key(context, object_value, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        return normal(oseo_boolean(true));
    }
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        return normal(oseo_boolean(true));
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    return normal(oseo_boolean(own_property_index(object, key) != SIZE_MAX));
}

OseoResult oseo_object_set(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value
) {
    OseoResult valid = require_object_and_key(context, object_value, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        function_object(object_value)->prototype_object = value;
        return normal(value);
    }
    OseoOrdinaryObject *receiver = ordinary_object(object_value);
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        return set_array_length(context, receiver, value);
    }
    uint32_t receiver_index = 0u;
    bool extends_array = is_array(object_value) &&
        array_index(key, &receiver_index) &&
        receiver_index >= receiver->array_length;
    if (extends_array && !receiver->length_writable) return normal(value);
    OseoValue current = object_value;
    while (is_object(current)) {
        OseoOrdinaryObject *owner = ordinary_object(current);
        size_t index = own_property_index(owner, key);
        if (index != SIZE_MAX) {
            OseoProperty *property = &owner->properties[index];
            if (!property->attributes.writable) {
                return normal(value);
            }
            if (current == object_value) {
                property->value = value;
                if (extends_array) receiver->array_length = receiver_index + 1u;
                return normal(value);
            }
            break;
        }
        current = owner->prototype;
    }
    OseoResult grown = grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    OseoOrdinaryObject *object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = (OseoPropertyAttributes){true, true, true};
    property->key = key;
    property->value = value;
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = receiver_index + 1u;
    return normal(value);
}

OseoResult oseo_object_define(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoResult valid = require_object_and_key(context, object_value, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        if (attributes.configurable || attributes.enumerable) {
            return language_failure();
        }
        function_object(object_value)->prototype_object = value;
        return normal(object_value);
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        if (attributes.configurable || attributes.enumerable) {
            return language_failure();
        }
        if (!object->length_writable && attributes.writable) {
            return language_failure();
        }
        OseoResult changed = set_array_length(context, object, value);
        if (changed.status != OSEO_STATUS_NORMAL) return changed;
        object->length_writable = attributes.writable;
        return normal(object_value);
    }
    uint32_t defined_index = 0u;
    bool extends_array = is_array(object_value) &&
        array_index(key, &defined_index) &&
        defined_index >= object->array_length;
    if (extends_array && !object->length_writable) {
        return language_failure();
    }
    size_t index = own_property_index(object, key);
    if (index != SIZE_MAX) {
        OseoProperty *property = &object->properties[index];
        if (!property->attributes.configurable &&
            (attributes.configurable ||
             attributes.enumerable != property->attributes.enumerable ||
             (!property->attributes.writable && attributes.writable) ||
             (!property->attributes.writable &&
              !same_property_value(property->value, value)))) {
            return language_failure();
        }
        property->attributes = attributes;
        property->value = value;
        object->dictionary = true;
        object->shape_id = context->next_shape_id;
        context->next_shape_id += 1u;
        if (extends_array) object->array_length = defined_index + 1u;
        return normal(object_value);
    }
    OseoResult grown = grow_properties(context, object_value);
    if (grown.status != OSEO_STATUS_NORMAL) return grown;
    object = ordinary_object(object_value);
    OseoProperty *property = &object->properties[object->property_count];
    property->attributes = attributes;
    property->key = key;
    property->value = value;
    object->property_count += 1u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    if (extends_array) object->array_length = defined_index + 1u;
    return normal(object_value);
}

OseoResult oseo_object_delete(
    OseoContext *context,
    OseoValue object_value,
    OseoValue key
) {
    OseoResult valid = require_object_and_key(context, object_value, key);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        return normal(oseo_boolean(false));
    }
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        return normal(oseo_boolean(false));
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = own_property_index(object, key);
    if (index == SIZE_MAX) return normal(oseo_boolean(true));
    if (!object->properties[index].attributes.configurable) {
        return normal(oseo_boolean(false));
    }
    (void)remove_property(object, index);
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(oseo_boolean(true));
}

OseoResult oseo_object_set_prototype(
    OseoContext *context,
    OseoValue object_value,
    OseoValue prototype
) {
    if (!is_object(object_value) ||
        (tag_of(prototype) != OSEO_TAG_NULL && !is_object(prototype))) {
        return failure(context, "OSEO2001", "Invalid prototype mutation.");
    }
    OseoValue current = prototype;
    while (is_object(current)) {
        if (current == object_value) {
            return failure(context, "OSEO2001", "Prototype cycle rejected.");
        }
        current = ordinary_object(current)->prototype;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    object->prototype = prototype;
    object->dictionary = true;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    return normal(object_value);
}

static OseoValue builtin_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static size_t own_ascii_property_index(
    const OseoOrdinaryObject *object,
    const char *name
) {
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (string_is_ascii(object->properties[index].key, name)) return index;
    }
    return SIZE_MAX;
}

static bool own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes
);

static OseoResult ascii_string(OseoContext *context, const char *text) {
    uint16_t units[32];
    size_t length = strlen(text);
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Internal property name is long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return allocate_string(context, units, length);
}

static OseoResult define_ascii_value(
    OseoContext *context,
    OseoRootFrame *frame,
    const char *name,
    OseoValue value
) {
    OseoResult result = ascii_string(context, name);
    frame->slots[1] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_set(context, frame->slots[0], frame->slots[1], value);
}

OseoResult oseo_object_builtin_create(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return oseo_object_create(
        context,
        builtin_argument(argument_count, arguments, 0u)
    );
}

OseoResult oseo_object_builtin_define_property(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    OseoValue descriptor_value =
        builtin_argument(argument_count, arguments, 2u);
    if (!is_object(object_value) || !is_object(descriptor_value)) {
        return failure(context, "OSEO2001", "Invalid property descriptor.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    frame.slots[0] = result.value;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return result;
    }
    OseoOrdinaryObject *descriptor = ordinary_object(descriptor_value);
    if (own_ascii_property_index(descriptor, "get") != SIZE_MAX ||
        own_ascii_property_index(descriptor, "set") != SIZE_MAX) {
        oseo_roots_release(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Accessor property descriptors are unsupported."
        );
    }
    size_t value_index = own_ascii_property_index(descriptor, "value");
    size_t writable_index = own_ascii_property_index(descriptor, "writable");
    size_t enumerable_index =
        own_ascii_property_index(descriptor, "enumerable");
    size_t configurable_index =
        own_ascii_property_index(descriptor, "configurable");
    OseoValue current_value = oseo_undefined();
    OseoPropertyAttributes current_attributes = {false, false, false};
    bool exists = own_descriptor(
        object_value,
        frame.slots[0],
        &current_value,
        &current_attributes
    );
    OseoValue value = value_index == SIZE_MAX
        ? current_value
        : descriptor->properties[value_index].value;
    OseoPropertyAttributes attributes = {
        configurable_index == SIZE_MAX
            ? exists && current_attributes.configurable
            : oseo_to_boolean(
                  descriptor->properties[configurable_index].value
              ),
        enumerable_index == SIZE_MAX
            ? exists && current_attributes.enumerable
            : oseo_to_boolean(descriptor->properties[enumerable_index].value),
        writable_index == SIZE_MAX
            ? exists && current_attributes.writable
            : oseo_to_boolean(descriptor->properties[writable_index].value),
    };
    result = oseo_object_define(
        context,
        object_value,
        frame.slots[0],
        value,
        attributes
    );
    if (result.status == OSEO_STATUS_NORMAL) result.value = object_value;
    oseo_roots_release(context, &frame);
    return result;
}

static bool own_descriptor(
    OseoValue object_value,
    OseoValue key,
    OseoValue *value,
    OseoPropertyAttributes *attributes
) {
    if (is_function(object_value) && string_is_ascii(key, "prototype")) {
        *value = function_object(object_value)->prototype_object;
        *attributes = (OseoPropertyAttributes){false, false, true};
        return true;
    }
    if (is_array(object_value) && string_is_ascii(key, "length")) {
        OseoOrdinaryObject *array = ordinary_object(object_value);
        *value = oseo_number(array->array_length);
        *attributes = (OseoPropertyAttributes){
            false,
            false,
            array->length_writable,
        };
        return true;
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t index = own_property_index(object, key);
    if (index == SIZE_MAX) return false;
    *value = object->properties[index].value;
    *attributes = object->properties[index].attributes;
    return true;
}

OseoResult oseo_object_builtin_get_own_property_descriptor(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(object_value)) {
        return failure(context, "OSEO2001", "Value is not an ordinary object.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_property_key(
        context,
        builtin_argument(argument_count, arguments, 1u)
    );
    frame.slots[1] = result.value;
    OseoValue value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false};
    if (result.status == OSEO_STATUS_NORMAL &&
        !own_descriptor(
            object_value,
            frame.slots[1],
            &value,
            &attributes
        )) {
        oseo_roots_release(context, &frame);
        return normal(oseo_undefined());
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(context, &frame, "value", value);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(
            context,
            &frame,
            "writable",
            oseo_boolean(attributes.writable)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(
            context,
            &frame,
            "enumerable",
            oseo_boolean(attributes.enumerable)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_value(
            context,
            &frame,
            "configurable",
            oseo_boolean(attributes.configurable)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult append_key(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t output_index,
    OseoValue key
) {
    char index_text[24];
    (void)snprintf(index_text, sizeof(index_text), "%zu", output_index);
    OseoResult result = ascii_string(context, index_text);
    frame->slots[1] = result.value;
    frame->slots[2] = key;
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_object_set(
        context,
        frame->slots[0],
        frame->slots[1],
        frame->slots[2]
    );
}

OseoResult oseo_object_builtin_keys(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue object_value = builtin_argument(argument_count, arguments, 0u);
    if (!is_object(object_value)) {
        return failure(context, "OSEO2001", "Value is not an ordinary object.");
    }
    OseoOrdinaryObject *object = ordinary_object(object_value);
    size_t count = 0u;
    for (size_t index = 0u; index < object->property_count; index += 1u) {
        if (object->properties[index].attributes.enumerable) count += 1u;
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_array_create(context, count);
    frame.slots[0] = result.value;
    size_t output_index = 0u;
    uint64_t previous = UINT64_MAX;
    while (result.status == OSEO_STATUS_NORMAL) {
        size_t selected = SIZE_MAX;
        uint32_t selected_number = 0u;
        for (size_t index = 0u; index < object->property_count; index += 1u) {
            uint32_t number = 0u;
            OseoProperty *property = &object->properties[index];
            if (!property->attributes.enumerable ||
                !array_index(property->key, &number) ||
                (previous != UINT64_MAX && number <= previous)) continue;
            if (selected == SIZE_MAX || number < selected_number) {
                selected = index;
                selected_number = number;
            }
        }
        if (selected == SIZE_MAX) break;
        result = append_key(
            context,
            &frame,
            output_index,
            object->properties[selected].key
        );
        output_index += 1u;
        previous = selected_number;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < object->property_count;
         index += 1u) {
        OseoProperty *property = &object->properties[index];
        uint32_t ignored = 0u;
        if (!property->attributes.enumerable ||
            array_index(property->key, &ignored)) continue;
        result = append_key(
            context,
            &frame,
            output_index,
            property->key
        );
        output_index += 1u;
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_object_builtin_set_prototype_of(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    return oseo_object_set_prototype(
        context,
        builtin_argument(argument_count, arguments, 0u),
        builtin_argument(argument_count, arguments, 1u)
    );
}

static bool numeric_whitespace(uint16_t unit) {
    return unit == UINT16_C(0x0009) || unit == UINT16_C(0x000a) ||
        unit == UINT16_C(0x000b) || unit == UINT16_C(0x000c) ||
        unit == UINT16_C(0x000d) || unit == UINT16_C(0x0020) ||
        unit == UINT16_C(0x00a0) || unit == UINT16_C(0x1680) ||
        (unit >= UINT16_C(0x2000) && unit <= UINT16_C(0x200a)) ||
        unit == UINT16_C(0x2028) || unit == UINT16_C(0x2029) ||
        unit == UINT16_C(0x202f) || unit == UINT16_C(0x205f) ||
        unit == UINT16_C(0x3000) || unit == UINT16_C(0xfeff);
}

static int radix_digit(char character) {
    if (character >= '0' && character <= '9') return character - '0';
    if (character >= 'a' && character <= 'f') {
        return character - 'a' + 10;
    }
    if (character >= 'A' && character <= 'F') {
        return character - 'A' + 10;
    }
    return -1;
}

static double prefixed_integer(
    const char *text,
    size_t length,
    int radix
) {
    if (length <= 2u) return NAN;
    int bits_per_digit = radix == 2 ? 1 : radix == 8 ? 3 : 4;
    size_t first_nonzero = length;
    for (size_t index = 2u; index < length; index += 1u) {
        int digit = radix_digit(text[index]);
        if (digit < 0 || digit >= radix) return NAN;
        if (first_nonzero == length && digit != 0) first_nonzero = index;
    }
    if (first_nonzero == length) return 0.0;

    int first_digit = radix_digit(text[first_nonzero]);
    size_t first_bits = 0u;
    for (int digit = first_digit; digit != 0; digit >>= 1) {
        first_bits += 1u;
    }
    size_t remaining_digits = length - first_nonzero - 1u;
    if (remaining_digits >
        (SIZE_MAX - first_bits) / (size_t)bits_per_digit) {
        return INFINITY;
    }
    size_t bit_length = first_bits +
        remaining_digits * (size_t)bits_per_digit;
    uint64_t significant = 0u;
    size_t seen_bits = 0u;
    bool round_bit = false;
    bool sticky_bit = false;
    for (size_t index = first_nonzero; index < length; index += 1u) {
        int digit = radix_digit(text[index]);
        int highest_bit = index == first_nonzero
            ? (int)first_bits - 1
            : bits_per_digit - 1;
        for (int bit = highest_bit; bit >= 0; bit -= 1) {
            bool set = (digit & (1 << bit)) != 0;
            if (seen_bits < 53u) {
                significant = (significant << 1u) | (set ? 1u : 0u);
            } else if (seen_bits == 53u) {
                round_bit = set;
            } else if (set) {
                sticky_bit = true;
            }
            seen_bits += 1u;
        }
    }
    if (bit_length <= 53u) return (double)significant;

    size_t shift = bit_length - 53u;
    if (round_bit && (sticky_bit || (significant & 1u) != 0u)) {
        significant += 1u;
        if (significant == (UINT64_C(1) << 53u)) {
            significant >>= 1u;
            shift += 1u;
        }
    }
    if (shift > 971u) return INFINITY;
    return ldexp((double)significant, (int)shift);
}

static OseoResult string_number(
    OseoContext *context,
    const OseoString *string
) {
    size_t start = 0u;
    size_t end_index = string->length;
    while (start < end_index && numeric_whitespace(string->units[start])) {
        start += 1u;
    }
    while (end_index > start &&
           numeric_whitespace(string->units[end_index - 1u])) {
        end_index -= 1u;
    }
    if (start == end_index) return normal(oseo_number(0.0));
    size_t length = end_index - start;
    char *text = malloc(length + 1u);
    if (text == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Numeric conversion allocation failed."
        );
    }
    for (size_t index = 0u; index < length; index += 1u) {
        uint16_t unit = string->units[start + index];
        if (unit == 0u || unit > UINT16_C(0x7f)) {
            free(text);
            return normal(oseo_number(NAN));
        }
        text[index] = (char)unit;
    }
    text[length] = '\0';
    if (strcmp(text, "Infinity") == 0 || strcmp(text, "+Infinity") == 0) {
        free(text);
        return normal(oseo_number(INFINITY));
    }
    if (strcmp(text, "-Infinity") == 0) {
        free(text);
        return normal(oseo_number(-INFINITY));
    }
    double result;
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'b' || text[1] == 'B')) {
        result = prefixed_integer(text, length, 2);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'o' || text[1] == 'O')) {
        result = prefixed_integer(text, length, 8);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 2u && text[0] == '0' &&
        (text[1] == 'x' || text[1] == 'X')) {
        result = prefixed_integer(text, length, 16);
        free(text);
        return normal(oseo_number(result));
    }
    if (length >= 3u && (text[0] == '+' || text[0] == '-') &&
        text[1] == '0' &&
        (text[2] == 'b' || text[2] == 'B' || text[2] == 'o' ||
         text[2] == 'O' || text[2] == 'x' || text[2] == 'X')) {
        free(text);
        return normal(oseo_number(NAN));
    }
    if ((text[0] < '0' || text[0] > '9') && text[0] != '+' &&
        text[0] != '-' && text[0] != '.') {
        free(text);
        return normal(oseo_number(NAN));
    }
    for (size_t index = 0u; index < length; index += 1u) {
        char character = text[index];
        bool lower_non_exponent = character >= 'a' && character <= 'z' &&
            character != 'e';
        bool upper_non_exponent = character >= 'A' && character <= 'Z' &&
            character != 'E';
        if (lower_non_exponent || upper_non_exponent) {
            free(text);
            return normal(oseo_number(NAN));
        }
    }
    char *parse_end;
    result = strtod(text, &parse_end);
    if (parse_end == text || *parse_end != '\0') result = NAN;
    free(text);
    return normal(oseo_number(result));
}

static OseoResult to_number(OseoContext *context, OseoValue value) {
    uint64_t tag = tag_of(value);
    if (is_number(value)) return normal(value);
    if (tag == OSEO_TAG_UNDEFINED) return normal(oseo_number(NAN));
    if (tag == OSEO_TAG_NULL) return normal(oseo_number(0.0));
    if (tag == OSEO_TAG_BOOLEAN) {
        double number = (value & 1u) != 0u ? 1.0 : 0.0;
        return normal(oseo_number(number));
    }
    if (is_string(value)) {
        return string_number(context, string_object(value));
    }
    return failure(
        context,
        "OSEO2001",
        "Object-to-primitive conversion is unsupported."
    );
}

static void append_character(
    char *text,
    size_t capacity,
    size_t *length,
    char character
) {
    if (*length + 1u < capacity) text[*length] = character;
    *length += 1u;
}

static size_t format_shortest_decimal(
    const char *candidate,
    char *output,
    size_t capacity
) {
    char digits[32];
    size_t digit_count = 0u;
    size_t digits_before_point = 0u;
    bool before_point = true;
    bool negative = candidate[0] == '-';
    const char *cursor = candidate + (negative ? 1u : 0u);
    const char *exponent_marker = strchr(cursor, 'e');
    const char *mantissa_end = exponent_marker == NULL
        ? cursor + strlen(cursor)
        : exponent_marker;
    for (const char *part = cursor; part < mantissa_end; part += 1) {
        if (*part == '.') {
            before_point = false;
        } else {
            digits[digit_count] = *part;
            digit_count += 1u;
            if (before_point) digits_before_point += 1u;
        }
    }
    int exponent = 0;
    if (exponent_marker != NULL) {
        const char *part = exponent_marker + 1;
        int sign = 1;
        if (*part == '+' || *part == '-') {
            if (*part == '-') sign = -1;
            part += 1;
        }
        while (*part >= '0' && *part <= '9') {
            exponent = exponent * 10 + (*part - '0');
            part += 1;
        }
        exponent *= sign;
    }
    int decimal_position = (int)digits_before_point + exponent;
    char formatted[96];
    size_t length = 0u;
    if (negative) {
        append_character(formatted, sizeof(formatted), &length, '-');
    }
    if (decimal_position <= 0 && decimal_position > -6) {
        append_character(formatted, sizeof(formatted), &length, '0');
        append_character(formatted, sizeof(formatted), &length, '.');
        for (int index = 0; index < -decimal_position; index += 1) {
            append_character(formatted, sizeof(formatted), &length, '0');
        }
        for (size_t index = 0u; index < digit_count; index += 1u) {
            append_character(
                formatted,
                sizeof(formatted),
                &length,
                digits[index]
            );
        }
    } else if (decimal_position > 0 && decimal_position <= 21) {
        for (int index = 0; index < decimal_position; index += 1) {
            char digit = index < (int)digit_count
                ? digits[(size_t)index]
                : '0';
            append_character(formatted, sizeof(formatted), &length, digit);
        }
        if (decimal_position < (int)digit_count) {
            append_character(formatted, sizeof(formatted), &length, '.');
            for (size_t index = (size_t)decimal_position;
                 index < digit_count;
                 index += 1u) {
                append_character(
                    formatted,
                    sizeof(formatted),
                    &length,
                    digits[index]
                );
            }
        }
    } else {
        append_character(formatted, sizeof(formatted), &length, digits[0]);
        if (digit_count > 1u) {
            append_character(formatted, sizeof(formatted), &length, '.');
            for (size_t index = 1u; index < digit_count; index += 1u) {
                append_character(
                    formatted,
                    sizeof(formatted),
                    &length,
                    digits[index]
                );
            }
        }
        int scientific_exponent = decimal_position - 1;
        char exponent_text[16];
        (void)snprintf(
            exponent_text,
            sizeof(exponent_text),
            "e%+d",
            scientific_exponent
        );
        for (const char *part = exponent_text; *part != '\0'; part += 1) {
            append_character(
                formatted,
                sizeof(formatted),
                &length,
                *part
            );
        }
    }
    size_t stored = length < sizeof(formatted) - 1u
        ? length
        : sizeof(formatted) - 1u;
    formatted[stored] = '\0';
    return (size_t)snprintf(output, capacity, "%s", formatted);
}

static size_t number_text(double value, char *output, size_t capacity) {
    if (isnan(value)) return (size_t)snprintf(output, capacity, "NaN");
    if (isinf(value)) {
        return (size_t)snprintf(
            output,
            capacity,
            signbit(value) ? "-Infinity" : "Infinity"
        );
    }
    if (value == 0.0) return (size_t)snprintf(output, capacity, "0");
    for (int precision = 1; precision <= 17; precision += 1) {
        char candidate[64];
        (void)snprintf(
            candidate,
            sizeof(candidate),
            "%.*g",
            precision,
            value
        );
        char *end;
        double parsed = strtod(candidate, &end);
        if (*end == '\0' && double_bits(parsed) == double_bits(value)) {
            return format_shortest_decimal(candidate, output, capacity);
        }
    }
    char fallback[64];
    (void)snprintf(fallback, sizeof(fallback), "%.17g", value);
    return format_shortest_decimal(fallback, output, capacity);
}

static OseoResult value_string(OseoContext *context, OseoValue value) {
    if (is_string(value)) return normal(value);
    const char *constant = NULL;
    uint64_t tag = tag_of(value);
    char number[64];
    if (tag == OSEO_TAG_UNDEFINED) constant = "undefined";
    else if (tag == OSEO_TAG_NULL) constant = "null";
    else if (tag == OSEO_TAG_BOOLEAN) {
        constant = (value & 1u) != 0u ? "true" : "false";
    } else if (is_number(value)) {
        (void)number_text(number_value(value), number, sizeof(number));
        constant = number;
    }
    if (constant == NULL) {
        return failure(context, "OSEO2001", "Value is outside M1 semantics.");
    }
    size_t length = strlen(constant);
    uint16_t units[64];
    if (length > 64u) {
        return failure(context, "OSEO2001", "Primitive text is too long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)constant[index];
    }
    return allocate_string(context, units, length);
}

OseoResult oseo_property_key(OseoContext *context, OseoValue value) {
    return value_string(context, value);
}

OseoResult oseo_negate(OseoContext *context, OseoValue value) {
    OseoResult number = to_number(context, value);
    if (number.status != OSEO_STATUS_NORMAL) return number;
    return normal(oseo_number(-number_value(number.value)));
}

static OseoResult numeric_binary(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    char operator
) {
    OseoResult left_number = to_number(context, left);
    if (left_number.status != OSEO_STATUS_NORMAL) return left_number;
    OseoResult right_number = to_number(context, right);
    if (right_number.status != OSEO_STATUS_NORMAL) return right_number;
    double left_value = number_value(left_number.value);
    double right_value = number_value(right_number.value);
    double value;
    if (operator == '+') value = left_value + right_value;
    else if (operator == '-') value = left_value - right_value;
    else if (operator == '*') value = left_value * right_value;
    else value = left_value / right_value;
    return normal(oseo_number(value));
}

OseoResult oseo_add(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    if (context->observe_specialization) {
        context->generic_addition_calls += 1u;
    }
    if (!is_string(left) && !is_string(right)) {
        return numeric_binary(context, left, right, '+');
    }
    OseoValue slots[2] = {left, right};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult left_string = value_string(context, slots[0]);
    if (left_string.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return left_string;
    }
    slots[0] = left_string.value;
    OseoResult right_string = value_string(context, slots[1]);
    if (right_string.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return right_string;
    }
    slots[1] = right_string.value;
    OseoString *left_object = string_object(slots[0]);
    OseoString *right_object = string_object(slots[1]);
    size_t maximum_length =
        (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t);
    if (left_object->length > maximum_length ||
        right_object->length > maximum_length - left_object->length) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "String allocation is too large."
        );
    }
    size_t length = left_object->length + right_object->length;
    uint16_t *units = length == 0u
        ? NULL
        : malloc(length * sizeof(uint16_t));
    if (units == NULL && length > 0u) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    if (left_object->length > 0u) {
        memcpy(
            units,
            left_object->units,
            left_object->length * sizeof(uint16_t)
        );
    }
    if (right_object->length > 0u) {
        memcpy(
            units + left_object->length,
            right_object->units,
            right_object->length * sizeof(uint16_t)
        );
    }
    OseoResult result = allocate_string(context, units, length);
    free(units);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_subtract(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '-');
}

OseoResult oseo_multiply(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '*');
}

OseoResult oseo_divide(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return numeric_binary(context, left, right, '/');
}

static bool strict_equal_value(OseoValue left, OseoValue right) {
    if (is_number(left) && is_number(right)) {
        double left_number = number_value(left);
        double right_number = number_value(right);
        return !isnan(left_number) && !isnan(right_number) &&
            left_number == right_number;
    }
    uint64_t left_tag = tag_of(left);
    if (left_tag != tag_of(right)) return false;
    if (left_tag == OSEO_TAG_UNDEFINED || left_tag == OSEO_TAG_NULL) {
        return true;
    }
    if (left_tag == OSEO_TAG_BOOLEAN) return (left & 1u) == (right & 1u);
    if (is_string(left) && is_string(right)) {
        OseoString *left_string = string_object(left);
        OseoString *right_string = string_object(right);
        return left_string->length == right_string->length &&
            memcmp(
                left_string->units,
                right_string->units,
                left_string->length * sizeof(uint16_t)
            ) == 0;
    }
    if (left_tag == OSEO_TAG_HEAP) return left == right;
    return false;
}

OseoResult oseo_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    (void)context;
    return normal(oseo_boolean(strict_equal_value(left, right)));
}

OseoResult oseo_not_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    (void)context;
    return normal(oseo_boolean(!strict_equal_value(left, right)));
}

static int compare_strings(
    const OseoString *left,
    const OseoString *right
) {
    size_t length = left->length < right->length
        ? left->length
        : right->length;
    for (size_t index = 0u; index < length; index += 1u) {
        if (left->units[index] < right->units[index]) return -1;
        if (left->units[index] > right->units[index]) return 1;
    }
    if (left->length < right->length) return -1;
    if (left->length > right->length) return 1;
    return 0;
}

static OseoResult relational(
    OseoContext *context,
    OseoValue left,
    OseoValue right,
    char operator
) {
    if (is_string(left) && is_string(right)) {
        int order = compare_strings(string_object(left), string_object(right));
        bool result;
        if (operator == '<') result = order < 0;
        else if (operator == 'l') result = order <= 0;
        else if (operator == '>') result = order > 0;
        else result = order >= 0;
        return normal(oseo_boolean(result));
    }
    OseoResult left_number = to_number(context, left);
    if (left_number.status != OSEO_STATUS_NORMAL) return left_number;
    OseoResult right_number = to_number(context, right);
    if (right_number.status != OSEO_STATUS_NORMAL) return right_number;
    double left_value = number_value(left_number.value);
    double right_value = number_value(right_number.value);
    bool result = false;
    if (!isnan(left_value) && !isnan(right_value)) {
        if (operator == '<') result = left_value < right_value;
        else if (operator == 'l') result = left_value <= right_value;
        else if (operator == '>') result = left_value > right_value;
        else result = left_value >= right_value;
    }
    return normal(oseo_boolean(result));
}

OseoResult oseo_less_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, '<');
}

OseoResult oseo_less_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, 'l');
}

OseoResult oseo_greater_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, '>');
}

OseoResult oseo_greater_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
) {
    return relational(context, left, right, 'g');
}

static int write_code_point(uint32_t point) {
    unsigned char bytes[4];
    size_t length;
    if (point <= UINT32_C(0x7f)) {
        bytes[0] = (unsigned char)point;
        length = 1u;
    } else if (point <= UINT32_C(0x7ff)) {
        bytes[0] = (unsigned char)(UINT32_C(0xc0) | (point >> 6u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 2u;
    } else if (point <= UINT32_C(0xffff)) {
        bytes[0] = (unsigned char)(UINT32_C(0xe0) | (point >> 12u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | ((point >> 6u) & 0x3fu));
        bytes[2] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 3u;
    } else {
        bytes[0] = (unsigned char)(UINT32_C(0xf0) | (point >> 18u));
        bytes[1] = (unsigned char)(UINT32_C(0x80) | ((point >> 12u) & 0x3fu));
        bytes[2] = (unsigned char)(UINT32_C(0x80) | ((point >> 6u) & 0x3fu));
        bytes[3] = (unsigned char)(UINT32_C(0x80) | (point & 0x3fu));
        length = 4u;
    }
    return fwrite(bytes, 1u, length, stdout) == length ? 0 : 1;
}

static int write_string(OseoValue value) {
    OseoString *string = string_object(value);
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint32_t point = string->units[index];
        if (point >= UINT32_C(0xd800) && point <= UINT32_C(0xdbff) &&
            index + 1u < string->length) {
            uint32_t low = string->units[index + 1u];
            if (low >= UINT32_C(0xdc00) && low <= UINT32_C(0xdfff)) {
                point = UINT32_C(0x10000) +
                    ((point - UINT32_C(0xd800)) << 10u) +
                    (low - UINT32_C(0xdc00));
                index += 1u;
            } else {
                point = UINT32_C(0xfffd);
            }
        } else if (point >= UINT32_C(0xd800) &&
                   point <= UINT32_C(0xdfff)) {
            point = UINT32_C(0xfffd);
        }
        if (write_code_point(point) != 0) return 1;
    }
    return 0;
}

OseoResult oseo_console_log(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    for (size_t index = 0u; index < argument_count; index += 1u) {
        if (index > 0u && fputc(' ', stdout) == EOF) {
            return failure(context, "OSEO3001", "Standard output failed.");
        }
        OseoResult string = value_string(context, arguments[index]);
        if (string.status != OSEO_STATUS_NORMAL) return string;
        if (write_string(string.value) != 0) {
            return failure(context, "OSEO3001", "Standard output failed.");
        }
    }
    if (fputc('\n', stdout) == EOF) {
        return failure(context, "OSEO3001", "Standard output failed.");
    }
    return normal(oseo_undefined());
}
