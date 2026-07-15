#ifndef OSEO_RUNTIME_H
#define OSEO_RUNTIME_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef uint64_t OseoValue;

typedef enum {
    OSEO_STATUS_NORMAL = 0,
    OSEO_STATUS_THROW = 1,
} OseoStatus;

typedef struct {
    OseoStatus status;
    OseoValue value;
} OseoResult;

typedef struct OseoRootFrame OseoRootFrame;
typedef struct OseoHeapObject OseoHeapObject;

struct OseoRootFrame {
    OseoRootFrame *previous;
    OseoValue *slots;
    size_t slot_count;
};

typedef struct {
    OseoRootFrame *roots;
    OseoHeapObject *objects;
    const char *source_id;
    size_t source_id_length;
    const char *error_code;
    const char *error_message;
    size_t active_frame_slots;
    size_t call_depth;
    size_t line;
    size_t column;
    bool collect_every_safepoint;
} OseoContext;

void oseo_context_init(
    OseoContext *context,
    const char *source_id,
    size_t source_id_length
);
void oseo_context_destroy(OseoContext *context);
void oseo_context_location(
    OseoContext *context,
    size_t line,
    size_t column
);
void oseo_context_print_error(const OseoContext *context);

OseoResult oseo_call_enter(OseoContext *context);
void oseo_call_leave(OseoContext *context);
OseoResult oseo_frame_enter(OseoContext *context, size_t slot_count);
void oseo_frame_leave(OseoContext *context, size_t slot_count);

void oseo_roots_push(OseoContext *context, OseoRootFrame *frame);
void oseo_roots_pop(OseoContext *context, OseoRootFrame *frame);
OseoResult oseo_roots_allocate(
    OseoContext *context,
    OseoRootFrame *frame,
    size_t slot_count
);
void oseo_roots_release(OseoContext *context, OseoRootFrame *frame);
void oseo_collect(OseoContext *context);

OseoValue oseo_undefined(void);
OseoValue oseo_uninitialized(void);
OseoResult oseo_read_binding(OseoContext *context, OseoValue value);
OseoValue oseo_null(void);
OseoValue oseo_boolean(bool value);
OseoValue oseo_number(double value);
bool oseo_to_boolean(OseoValue value);

OseoResult oseo_string_from_units(
    OseoContext *context,
    const uint16_t *units,
    size_t length
);
OseoResult oseo_negate(OseoContext *context, OseoValue value);
OseoResult oseo_add(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_subtract(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_multiply(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_divide(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_not_strict_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_less_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_less_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_greater_than(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_greater_equal(
    OseoContext *context,
    OseoValue left,
    OseoValue right
);
OseoResult oseo_console_log(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
);

#endif
