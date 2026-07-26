#include "runtime_internal.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Named error intrinsics: lazily created constructor and prototype
 * pairs, typed runtime error creation, the Error.prototype.toString
 * algorithm, and unhandled-throw rendering.
 */

static const char *const error_names[OSEO_ERROR_KIND_COUNT] = {
    "Error",
    "EvalError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "TypeError",
    "URIError",
};

static OseoResult ascii_runtime_string(
    OseoContext *context,
    const char *text
) {
    size_t length = strlen(text);
    uint16_t *units = NULL;
    if (length > 0u) {
        units = malloc(length * sizeof(uint16_t));
        if (units == NULL) {
            return failure(
                context,
                "OSEO2001",
                "String allocation failed."
            );
        }
        for (size_t index = 0u; index < length; index += 1u) {
            units[index] = (uint16_t)(unsigned char)text[index];
        }
    }
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    free(units);
    return result;
}

/* Define one ASCII-named data property; object and value stay rooted. */
static OseoResult define_ascii_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = ascii_runtime_string(context, name);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[2] = result.value;
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

static OseoResult error_intrinsic_pair(
    OseoContext *context,
    OseoErrorKind kind
) {
    if (tag_of(context->error_constructors[kind]) != OSEO_TAG_UNDEFINED) {
        return normal(context->error_constructors[kind]);
    }
    size_t entry_allocations = context->allocations;
    if (kind != OSEO_ERROR_ERROR) {
        OseoResult base = error_intrinsic_pair(context, OSEO_ERROR_ERROR);
        if (base.status != OSEO_STATUS_NORMAL) return base;
    }
    const OseoPropertyAttributes hidden = {true, false, true, false};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_object_create(
        context,
        kind == OSEO_ERROR_ERROR
            ? oseo_null()
            : context->error_prototypes[OSEO_ERROR_ERROR]
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[0])->default_intrinsics = true;
        result = ascii_runtime_string(context, error_names[kind]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_property(
            context,
            frame.slots[0],
            "name",
            frame.slots[1],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_runtime_string(context, "");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_ascii_property(
            context,
            frame.slots[0],
            "message",
            frame.slots[2],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && kind == OSEO_ERROR_ERROR) {
        result = oseo_environment_create(context, 0u);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            static const uint16_t to_string_units[] = {
                't', 'o', 'S', 't', 'r', 'i', 'n', 'g',
            };
            result = oseo_function_create(
                context,
                OSEO_ERROR_TO_STRING_CODE_ID,
                frame.slots[2],
                to_string_units,
                sizeof(to_string_units) / sizeof(*to_string_units),
                0u,
                OSEO_FUNCTION_INTERNAL,
                oseo_undefined(),
                oseo_undefined(),
                OSEO_FUNCTION_NAME_PREFIX_NONE
            );
            frame.slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_ascii_property(
                context,
                frame.slots[0],
                "toString",
                frame.slots[3],
                hidden
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_environment_create(context, 0u);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        uint16_t name_units[16];
        size_t name_length = strlen(error_names[kind]);
        for (size_t index = 0u; index < name_length; index += 1u) {
            name_units[index] =
                (uint16_t)(unsigned char)error_names[kind][index];
        }
        result = oseo_function_create(
            context,
            OSEO_ERROR_CONSTRUCT_LAST_CODE_ID - (size_t)kind,
            frame.slots[2],
            name_units,
            name_length,
            1u,
            OSEO_FUNCTION_ORDINARY,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoFunction *constructor = function_object(frame.slots[3]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        constructor->ordinary.prototype = kind == OSEO_ERROR_ERROR
            ? oseo_null()
            : context->error_constructors[OSEO_ERROR_ERROR];
        constructor->ordinary.default_intrinsics = true;
        result = define_ascii_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[3],
            hidden
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->error_prototypes[kind] = frame.slots[0];
        context->error_constructors[kind] = frame.slots[3];
        result.value = frame.slots[3];
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_error_intrinsic(OseoContext *context, OseoErrorKind kind) {
    if ((size_t)kind >= OSEO_ERROR_KIND_COUNT) {
        return failure(context, "OSEO2001", "Unknown error intrinsic.");
    }
    return error_intrinsic_pair(context, kind);
}

OseoResult oseo_internal_error_prototype(
    OseoContext *context,
    OseoErrorKind kind
) {
    OseoResult result = error_intrinsic_pair(context, kind);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->error_prototypes[kind]);
}

OseoResult oseo_internal_throw_error(
    OseoContext *context,
    OseoErrorKind kind,
    const char *message
) {
    OseoResult result = oseo_internal_error_prototype(context, kind);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[2] = {result.value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    result = oseo_object_create(context, slots[0]);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[1] = result.value;
        ordinary_object(slots[1])->default_intrinsics = true;
        ordinary_object(slots[1])->error_data = true;
        result = ascii_runtime_string(context, message);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        const OseoPropertyAttributes hidden = {true, false, true, false};
        result = define_ascii_property(
            context,
            slots[1],
            "message",
            result.value,
            hidden
        );
    }
    oseo_roots_pop(context, &frame);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    context->error_code = "OSEO2001";
    context->error_message = message;
    context->has_diagnostic = false;
    result.status = OSEO_STATUS_THROW;
    result.value = slots[1];
    return result;
}

OseoResult oseo_internal_error_construct(
    OseoContext *context,
    OseoValue callee,
    size_t code_id,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoErrorKind kind =
        (OseoErrorKind)(OSEO_ERROR_CONSTRUCT_LAST_CODE_ID - code_id);
    const OseoPropertyAttributes hidden = {true, false, true, false};
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = argument_count > 0u ? arguments[0] : oseo_undefined();
    frame.slots[1] = argument_count > 1u ? arguments[1] : oseo_undefined();
    OseoValue prototype = is_function(callee)
        ? function_object(callee)->prototype_object
        : oseo_undefined();
    if (is_object(prototype)) {
        result = normal(prototype);
    } else {
        result = oseo_internal_error_prototype(context, kind);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, result.value);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[2])->default_intrinsics = true;
        ordinary_object(frame.slots[2])->error_data = true;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(frame.slots[0]) != OSEO_TAG_UNDEFINED) {
        result = oseo_internal_value_string(context, frame.slots[0]);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_ascii_property(
                context,
                frame.slots[2],
                "message",
                result.value,
                hidden
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && is_object(frame.slots[1])) {
        result = ascii_runtime_string(context, "cause");
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_has_property(
                context,
                frame.slots[3],
                frame.slots[1]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value)) {
            result = oseo_object_get(
                context,
                frame.slots[1],
                frame.slots[3]
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = define_ascii_property(
                    context,
                    frame.slots[2],
                    "cause",
                    result.value,
                    hidden
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result.value = frame.slots[2];
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* Concatenate "name: message" without entering generic addition. */
static OseoResult error_text(
    OseoContext *context,
    OseoValue name,
    OseoValue message
) {
    OseoString *name_string = string_object(name);
    OseoString *message_string = string_object(message);
    if (name_string->length == 0u) return normal(message);
    if (message_string->length == 0u) return normal(name);
    size_t maximum = (SIZE_MAX - sizeof(OseoString)) / sizeof(uint16_t);
    if (name_string->length > maximum - 2u ||
        message_string->length > maximum - 2u - name_string->length) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t length = name_string->length + 2u + message_string->length;
    uint16_t *units = malloc(length * sizeof(uint16_t));
    if (units == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    memcpy(
        units,
        name_string->units,
        name_string->length * sizeof(uint16_t)
    );
    units[name_string->length] = ':';
    units[name_string->length + 1u] = ' ';
    memcpy(
        units + name_string->length + 2u,
        message_string->units,
        message_string->length * sizeof(uint16_t)
    );
    OseoValue slots[2] = {name, message};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    oseo_roots_pop(context, &frame);
    free(units);
    return result;
}

OseoResult oseo_internal_error_to_string(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Error.prototype.toString requires an object receiver."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = ascii_runtime_string(context, "name");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED
            ? ascii_runtime_string(context, "Error")
            : oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = ascii_runtime_string(context, "message");
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED
            ? ascii_runtime_string(context, "")
            : oseo_internal_value_string(context, frame.slots[3]);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = error_text(context, frame.slots[2], frame.slots[3]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

static int write_stderr_code_point(uint32_t point) {
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
    return fwrite(bytes, 1u, length, stderr) == length ? 0 : 1;
}

static void write_stderr_string(OseoValue value) {
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
        if (write_stderr_code_point(point) != 0) return;
    }
}

/*
 * The intrinsic error kind of a thrown value, taken from the first
 * intrinsic error prototype on its chain, or OSEO_ERROR_KIND_COUNT for
 * a value that is not an error instance. This is the stable identity
 * used for the machine-readable throw marker, independent of the
 * mutable name property.
 */
static size_t error_instance_kind(OseoContext *context, OseoValue thrown) {
    if (!is_object(thrown)) return OSEO_ERROR_KIND_COUNT;
    /*
     * The walk starts at the thrown value itself so a thrown intrinsic
     * prototype object, such as TypeError.prototype, keeps its exact
     * identity rather than reporting its own prototype's kind.
     */
    OseoValue current = thrown;
    while (is_object(current)) {
        for (size_t kind = 0u; kind < OSEO_ERROR_KIND_COUNT; kind += 1u) {
            if (context->error_prototypes[kind] == current) return kind;
        }
        current = ordinary_object(current)->prototype;
    }
    return OSEO_ERROR_KIND_COUNT;
}

void oseo_context_print_thrown(OseoContext *context, OseoValue thrown) {
    size_t kind = error_instance_kind(context, thrown);
    if (context->has_diagnostic || kind >= OSEO_ERROR_KIND_COUNT) {
        oseo_context_print_error(context);
        return;
    }
    /*
     * Converting an object-valued name or message runs user JavaScript,
     * which moves the context's source location. The original throw or
     * rejection site is restored so the diagnostic points there rather
     * than into the conversion method.
     */
    const char *error_code = context->error_code;
    const char *error_message = context->error_message;
    const char *source_id = context->source_id;
    size_t source_id_length = context->source_id_length;
    size_t line = context->line;
    size_t column = context->column;
    OseoValue slots[2] = {thrown, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_error_to_string(context, slots[0]);
    slots[1] = result.value;
    oseo_roots_pop(context, &frame);
    context->error_code = error_code;
    context->error_message = error_message;
    context->source_id = source_id;
    context->source_id_length = source_id_length;
    context->line = line;
    context->column = column;
    context->has_diagnostic = false;
    if (result.status != OSEO_STATUS_NORMAL || !is_string(slots[1]) ||
        string_object(slots[1])->length == 0u) {
        /*
         * An empty or failed rendering falls back to the stored
         * diagnostic, but the error is still a typed instance, so the
         * marker is printed either way.
         */
        oseo_context_print_error(context);
    } else {
        (void)fwrite(
            context->source_id,
            1u,
            context->source_id_length,
            stderr
        );
        (void)fprintf(
            stderr,
            ":%zu:%zu: error[%s]: ",
            context->line,
            context->column,
            context->error_code
        );
        write_stderr_string(slots[1]);
        (void)fprintf(stderr, "\n");
    }
    /*
     * A stable machine-readable marker records the intrinsic error kind
     * separately from the human diagnostic, whose name and message can
     * be mutated to arbitrary or non-identifier values. Tooling reads
     * this for throw detection and type comparison and strips it before
     * comparing observable output.
     */
    (void)fprintf(stderr, "OSEO_THROWN %s\n", error_names[kind]);
}
