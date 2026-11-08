#define _XOPEN_SOURCE 700
#include "runtime_internal.h"

#include <errno.h>
#include <math.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#if defined(__APPLE__)
#include <mach-o/dyld.h>
#include <crt_externs.h>
#else
extern char **environ;
#endif

/* Ordinary objects own all visible properties; intrinsic slots root the
 * startup snapshots even after user code deletes or replaces a property. */
static OseoValue *process_slots(OseoContext *context) {
    return context->initial_realm.intrinsics;
}

void oseo_process_start(OseoContext *context, int argc, char **argv) {
    context->process_argc = argc;
    context->process_argv = argv;
    (void)signal(SIGPIPE, SIG_IGN);
}

/* Decode maximal valid UTF-8 prefixes, keeping a BOM and replacing each
 * ill-formed subsequence as Node's UTF-8 decoder does. Input is host/work
 * memory, never an unrooted pointer into the managed heap. */
static OseoResult process_decode(
    OseoContext *context, const unsigned char *bytes, size_t length
) {
    if (length > OSEO_MAX_STRING_LENGTH ||
        length > SIZE_MAX / sizeof(uint16_t)) {
        return failure(context, "OSEO3001", "Process text is too large.");
    }
    uint16_t *units = length == 0u ? NULL :
        oseo_internal_allocate_work_bytes(context, length * sizeof(*units));
    if (length != 0u && units == NULL) {
        return failure(context, "OSEO2001", "Process text allocation failed.");
    }
    size_t count = 0u;
    size_t cursor = 0u;
    while (cursor < length) {
        unsigned char lead = bytes[cursor++];
        uint32_t point = lead;
        size_t trailing = 0u;
        unsigned char low = 0x80u;
        unsigned char high = 0xbfu;
        if (lead < 0x80u) {
            units[count++] = lead;
            continue;
        } else if (lead >= 0xc2u && lead <= 0xdfu) {
            point = lead & 0x1fu;
            trailing = 1u;
        } else if (lead >= 0xe0u && lead <= 0xefu) {
            point = lead & 0x0fu;
            trailing = 2u;
            if (lead == 0xe0u) low = 0xa0u;
            if (lead == 0xedu) high = 0x9fu;
        } else if (lead >= 0xf0u && lead <= 0xf4u) {
            point = lead & 0x07u;
            trailing = 3u;
            if (lead == 0xf0u) low = 0x90u;
            if (lead == 0xf4u) high = 0x8fu;
        } else {
            units[count++] = 0xfffdu;
            continue;
        }
        bool valid = true;
        for (size_t index = 0u; index < trailing; index += 1u) {
            if (cursor == length || bytes[cursor] < low ||
                bytes[cursor] > high) {
                valid = false;
                break;
            }
            point = (point << 6u) | (bytes[cursor++] & 0x3fu);
            low = 0x80u;
            high = 0xbfu;
        }
        if (!valid) point = 0xfffdu;
        if (point <= 0xffffu) {
            units[count++] = (uint16_t)point;
        } else {
            point -= 0x10000u;
            units[count++] = (uint16_t)(0xd800u | (point >> 10u));
            units[count++] = (uint16_t)(0xdc00u | (point & 0x3ffu));
        }
    }
    OseoResult result = oseo_string_from_units(context, units, count);
    free(units);
    return result;
}

static OseoResult process_define(
    OseoContext *context, OseoValue object, const char *name, OseoValue value,
    bool enumerable
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(context, slots[0], slots[2], slots[1],
            (OseoPropertyAttributes){true, enumerable, true, false});
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult process_function(
    OseoContext *context, OseoIntrinsic intrinsic, size_t offset,
    const char *name, size_t length
) {
    uint16_t units[32];
    size_t count = strlen(name);
    if (count > sizeof(units) / sizeof(units[0])) {
        return failure(context, "OSEO2001", "Invalid process function name.");
    }
    for (size_t index = 0u; index < count; index += 1u) {
        units[index] = (unsigned char)name[index];
    }
    OseoResult result = oseo_environment_create(context, 0u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[1] = {result.value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    result = oseo_function_create(context,
        OSEO_PROCESS_CODE_ID_RANGE_LAST - offset,
        slots[0], units, count, length, OSEO_FUNCTION_INTERNAL,
        oseo_undefined(), oseo_undefined(), OSEO_FUNCTION_NAME_PREFIX_NONE);
    if (result.status == OSEO_STATUS_NORMAL) {
        process_slots(context)[intrinsic] = result.value;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult process_executable(OseoContext *context) {
    size_t capacity = 256u;
    for (;;) {
        char *path = oseo_internal_allocate_work_bytes(context, capacity);
        if (path == NULL) {
            return failure(context, "OSEO2001",
                "Executable path allocation failed.");
        }
        size_t length = 0u;
        bool retry = false;
#if defined(__APPLE__)
        uint32_t size = capacity > UINT32_MAX ? UINT32_MAX : (uint32_t)capacity;
        if (_NSGetExecutablePath(path, &size) != 0) {
            retry = true;
        } else {
            char *absolute = realpath(path, NULL);
            if (absolute != NULL) {
                OseoResult result = process_decode(context,
                    (const unsigned char *)absolute, strlen(absolute));
                free(absolute);
                free(path);
                return result;
            }
        }
#else
        ssize_t observed = readlink("/proc/self/exe", path, capacity);
        if (observed >= 0) {
            length = (size_t)observed;
            retry = length == capacity;
        }
#endif
        if (!retry && length > 0u) {
            OseoResult result = process_decode(context,
                (const unsigned char *)path, length);
            free(path);
            return result;
        }
        free(path);
        if (!retry || capacity > SIZE_MAX / 2u) {
            return failure(context, "OSEO3001", "Cannot read executable path.");
        }
        capacity *= 2u;
    }
}

static OseoResult process_arguments(OseoContext *context) {
    OseoValue *slots = process_slots(context);
    OseoResult result = oseo_array_create(context, 0u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    slots[OSEO_INTRINSIC_PROCESS_ARGV] = result.value;
    OseoValue roots[1] = {oseo_undefined()};
    OseoRootFrame frame = {NULL, roots, 1u};
    oseo_roots_push(context, &frame);
    result = process_executable(context);
    roots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context,
            slots[OSEO_INTRINSIC_PROCESS_ARGV], roots[0]);
    }
    for (int index = 0; result.status == OSEO_STATUS_NORMAL &&
         index < context->process_argc; index += 1) {
        const char *argument = context->process_argv[index];
        result = process_decode(context,
            (const unsigned char *)argument, strlen(argument));
        roots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(context,
                slots[OSEO_INTRINSIC_PROCESS_ARGV], roots[0]);
        }
    }
    /* Direct ABI users may not have a native invocation to supply. */
    if (result.status == OSEO_STATUS_NORMAL && context->process_argc == 0) {
        result = oseo_internal_ascii_string(context, "");
        roots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(context,
                slots[OSEO_INTRINSIC_PROCESS_ARGV], roots[0]);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult process_environment(OseoContext *context) {
    OseoResult result = oseo_object_literal_create(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    process_slots(context)[OSEO_INTRINSIC_PROCESS_ENV] = result.value;
    OseoValue roots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, roots, 2u};
    oseo_roots_push(context, &frame);
#if defined(__APPLE__)
    char **entries = *_NSGetEnviron();
#else
    char **entries = environ;
#endif
    for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL &&
         entries != NULL && entries[index] != NULL; index += 1u) {
        const char *entry = entries[index];
        const char *equal = strchr(entry, '=');
        if (equal == NULL) continue;
        result = process_decode(context, (const unsigned char *)entry,
            (size_t)(equal - entry));
        roots[0] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = process_decode(context,
                (const unsigned char *)(equal + 1), strlen(equal + 1));
            roots[1] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(context,
                process_slots(context)[OSEO_INTRINSIC_PROCESS_ENV],
                roots[0], roots[1],
                (OseoPropertyAttributes){true, true, true, false});
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_process_intrinsic(OseoContext *context) {
    OseoValue *slots = process_slots(context);
    if (is_object(slots[OSEO_INTRINSIC_PROCESS])) {
        return normal(slots[OSEO_INTRINSIC_PROCESS]);
    }
    size_t allocations = context->allocations;
    OseoResult result = process_arguments(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = process_environment(context);
    }
    const OseoIntrinsic objects[] = {OSEO_INTRINSIC_PROCESS,
        OSEO_INTRINSIC_PROCESS_STDOUT, OSEO_INTRINSIC_PROCESS_STDERR,
        OSEO_INTRINSIC_PROCESS_FS};
    for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL &&
         index < sizeof(objects) / sizeof(objects[0]); index += 1u) {
        result = oseo_object_literal_create(context);
        if (result.status == OSEO_STATUS_NORMAL) {
            slots[objects[index]] = result.value;
        }
    }
    const struct {
        OseoIntrinsic intrinsic;
        const char *name;
        size_t length;
    } functions[] = {
        {OSEO_INTRINSIC_PROCESS_EXIT, "exit", 1u},
        {OSEO_INTRINSIC_PROCESS_STDOUT_WRITE, "write", 1u},
        {OSEO_INTRINSIC_PROCESS_STDERR_WRITE, "write", 1u},
        {OSEO_INTRINSIC_PROCESS_READ_FILE_SYNC, "readFileSync", 2u},
        {OSEO_INTRINSIC_PROCESS_EXIT_CODE_GET, "get exitCode", 0u},
        {OSEO_INTRINSIC_PROCESS_EXIT_CODE_SET, "set exitCode", 1u},
    };
    for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL &&
         index < sizeof(functions) / sizeof(functions[0]); index += 1u) {
        result = process_function(context, functions[index].intrinsic, index,
            functions[index].name, functions[index].length);
    }
    const struct {
        OseoIntrinsic object;
        const char *name;
        OseoIntrinsic value;
    } properties[] = {
        {OSEO_INTRINSIC_PROCESS, "argv", OSEO_INTRINSIC_PROCESS_ARGV},
        {OSEO_INTRINSIC_PROCESS, "env", OSEO_INTRINSIC_PROCESS_ENV},
        {OSEO_INTRINSIC_PROCESS, "exit", OSEO_INTRINSIC_PROCESS_EXIT},
        {OSEO_INTRINSIC_PROCESS, "stdout", OSEO_INTRINSIC_PROCESS_STDOUT},
        {OSEO_INTRINSIC_PROCESS, "stderr", OSEO_INTRINSIC_PROCESS_STDERR},
        {OSEO_INTRINSIC_PROCESS_STDOUT, "write",
            OSEO_INTRINSIC_PROCESS_STDOUT_WRITE},
        {OSEO_INTRINSIC_PROCESS_STDERR, "write",
            OSEO_INTRINSIC_PROCESS_STDERR_WRITE},
        {OSEO_INTRINSIC_PROCESS_FS, "readFileSync",
            OSEO_INTRINSIC_PROCESS_READ_FILE_SYNC},
    };
    for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL &&
         index < sizeof(properties) / sizeof(properties[0]); index += 1u) {
        result = process_define(context, slots[properties[index].object],
            properties[index].name, slots[properties[index].value], true);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoValue key = oseo_undefined();
        OseoRootFrame frame = {NULL, &key, 1u};
        oseo_roots_push(context, &frame);
        result = oseo_internal_ascii_string(context, "exitCode");
        key = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define_accessor(context,
                slots[OSEO_INTRINSIC_PROCESS], key,
                slots[OSEO_INTRINSIC_PROCESS_EXIT_CODE_GET],
                slots[OSEO_INTRINSIC_PROCESS_EXIT_CODE_SET], true, true,
                (OseoPropertyAttributes){true, true, false, true});
        }
        oseo_roots_pop(context, &frame);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_PROCESS;
             index <= OSEO_INTRINSIC_PROCESS_EXIT_CODE_SET; index += 1u) {
            slots[index] = oseo_undefined();
        }
    } else if (context->observe_specialization) {
        context->allocations = allocations;
    }
    return result.status == OSEO_STATUS_NORMAL
        ? normal(slots[OSEO_INTRINSIC_PROCESS]) : result;
}

OseoResult oseo_internal_install_process_global(
    OseoContext *context, OseoValue global
) {
    OseoValue roots[1] = {global};
    OseoRootFrame frame = {NULL, roots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_process_intrinsic(context);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = process_define(context, roots[0], "process",
            result.value, false);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_builtin_export(
    OseoContext *context, size_t count, const OseoValue *arguments
) {
    if (count != 2u || !is_number(arguments[0]) || !is_number(arguments[1])) {
        return failure(context, "OSEO2001", "Invalid builtin export request.");
    }
    const OseoIntrinsic process[] = {OSEO_INTRINSIC_PROCESS,
        OSEO_INTRINSIC_PROCESS_ARGV, OSEO_INTRINSIC_PROCESS_ENV,
        OSEO_INTRINSIC_PROCESS_EXIT, OSEO_INTRINSIC_PROCESS_STDOUT,
        OSEO_INTRINSIC_PROCESS_STDERR};
    const OseoIntrinsic fs[] = {OSEO_INTRINSIC_PROCESS_FS,
        OSEO_INTRINSIC_PROCESS_READ_FILE_SYNC};
    double module = number_value(arguments[0]);
    double index = number_value(arguments[1]);
    const OseoIntrinsic *table = module == 0.0 ? process : fs;
    size_t length = module == 0.0
        ? sizeof(process) / sizeof(process[0]) : sizeof(fs) / sizeof(fs[0]);
    if ((module != 0.0 && module != 1.0) || !isfinite(index) ||
        index < 0.0 || index >= (double)length || trunc(index) != index) {
        return failure(context, "OSEO2001", "Unknown builtin export.");
    }
    OseoResult result = oseo_internal_process_intrinsic(context);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(process_slots(context)[table[(size_t)index]]) : result;
}

static OseoResult process_write_error(
    OseoContext *context, bool standard_error, bool strict, int error
) {
    if (error == EPIPE) {
        if (standard_error) context->process_stderr_closed = true;
        else context->process_stdout_closed = true;
        if (!strict) return normal(oseo_undefined());
        return failure(context, "OSEO3001",
            "Standard stream write failed: EPIPE.");
    }
    return failure(context, "OSEO3001", "Standard stream write failed.");
}

OseoResult oseo_internal_process_write(
    OseoContext *context, bool standard_error,
    const unsigned char *bytes, size_t length, bool strict
) {
    bool closed = standard_error ? context->process_stderr_closed
        : context->process_stdout_closed;
    if (closed) {
        return process_write_error(context, standard_error, strict, EPIPE);
    }
    FILE *stream = standard_error ? stderr : stdout;
    errno = 0;
    if (length != 0u && fwrite(bytes, 1u, length, stream) != length) {
        int error = errno;
        clearerr(stream);
        return process_write_error(context, standard_error, strict, error);
    }
    return normal(oseo_undefined());
}

static OseoResult process_flush(
    OseoContext *context, bool standard_error, bool strict
) {
    FILE *stream = standard_error ? stderr : stdout;
    bool closed = standard_error ? context->process_stderr_closed
        : context->process_stdout_closed;
    if (closed) {
        return process_write_error(context, standard_error, strict, EPIPE);
    }
    errno = 0;
    if (fflush(stream) != 0) {
        int error = errno;
        clearerr(stream);
        return process_write_error(context, standard_error, strict, error);
    }
    return normal(oseo_undefined());
}

OseoResult oseo_internal_process_write_string(
    OseoContext *context, bool standard_error, OseoValue value, bool strict
) {
    OseoString *string = string_object(value);
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint32_t point = string->units[index];
        if (point >= 0xd800u && point <= 0xdbffu &&
            index + 1u < string->length &&
            string->units[index + 1u] >= 0xdc00u &&
            string->units[index + 1u] <= 0xdfffu) {
            point = 0x10000u + ((point - 0xd800u) << 10u) +
                (string->units[++index] - 0xdc00u);
        } else if (point >= 0xd800u && point <= 0xdfffu) {
            point = 0xfffdu;
        }
        unsigned char bytes[4];
        size_t length = 0u;
        if (point <= 0x7fu) {
            bytes[length++] = (unsigned char)point;
        } else if (point <= 0x7ffu) {
            bytes[length++] = (unsigned char)(0xc0u | (point >> 6u));
            bytes[length++] = (unsigned char)(0x80u | (point & 0x3fu));
        } else if (point <= 0xffffu) {
            bytes[length++] = (unsigned char)(0xe0u | (point >> 12u));
            bytes[length++] = (unsigned char)(0x80u | ((point >> 6u) & 0x3fu));
            bytes[length++] = (unsigned char)(0x80u | (point & 0x3fu));
        } else {
            bytes[length++] = (unsigned char)(0xf0u | (point >> 18u));
            bytes[length++] = (unsigned char)(0x80u | ((point >> 12u) & 0x3fu));
            bytes[length++] = (unsigned char)(0x80u | ((point >> 6u) & 0x3fu));
            bytes[length++] = (unsigned char)(0x80u | (point & 0x3fu));
        }
        OseoResult result = oseo_internal_process_write(context,
            standard_error, bytes, length, strict);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    return normal(oseo_undefined());
}

static bool process_encoding(OseoValue encoding) {
    return is_string(encoding) &&
        (oseo_internal_string_is_ascii(encoding, "utf8") ||
         oseo_internal_string_is_ascii(encoding, "utf-8"));
}

static OseoResult process_code_error(
    OseoContext *context, OseoErrorKind kind, const char *code
) {
    OseoResult result = oseo_internal_throw_error(context, kind,
        "Invalid process exit code.");
    if (result.status != OSEO_STATUS_THROW) return result;
    OseoValue roots[1] = {result.value};
    OseoRootFrame frame = {NULL, roots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult text = oseo_internal_ascii_string(context, code);
    if (text.status == OSEO_STATUS_NORMAL) {
        text = process_define(context, roots[0], "code", text.value, true);
    }
    result = text.status == OSEO_STATUS_NORMAL
        ? (OseoResult){OSEO_STATUS_THROW, roots[0]} : text;
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult process_set_code(OseoContext *context, OseoValue code) {
    if (is_nullish(code)) {
        context->process_has_exit_code = false;
        return normal(oseo_undefined());
    }
    if (!is_number(code) &&
        (!is_string(code) || string_object(code)->length == 0u)) {
        return process_code_error(context, OSEO_ERROR_TYPE,
            "ERR_INVALID_ARG_TYPE");
    }
    OseoResult converted = oseo_internal_to_number(context, code);
    if (converted.status != OSEO_STATUS_NORMAL) return converted;
    double number = number_value(converted.value);
    if (is_string(code) && isnan(number)) {
        return process_code_error(context, OSEO_ERROR_TYPE,
            "ERR_INVALID_ARG_TYPE");
    }
    if (!isfinite(number) || trunc(number) != number ||
        fabs(number) > 9007199254740991.0) {
        return process_code_error(context, OSEO_ERROR_RANGE,
            "ERR_OUT_OF_RANGE");
    }
    double wrapped = fmod(number, 4294967296.0);
    if (wrapped < 0.0) wrapped += 4294967296.0;
    if (wrapped >= 2147483648.0) wrapped -= 4294967296.0;
    context->process_exit_code = (int32_t)wrapped;
    context->process_has_exit_code = true;
    return normal(oseo_undefined());
}

int oseo_process_finish(OseoContext *context) {
    OseoResult result = process_flush(context, false, false);
    OseoResult error = process_flush(context, true, false);
    if (result.status == OSEO_STATUS_NORMAL) result = error;
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_context_print_thrown(context, result.value);
        return 1;
    }
    return context->process_has_exit_code
        ? (int)((uint32_t)context->process_exit_code & 255u) : 0;
}

static OseoResult process_read(OseoContext *context, size_t count,
    const OseoValue *arguments) {
    if (count == 0u || !is_number(arguments[0]) ||
        number_value(arguments[0]) != 0.0 || count > 2u) {
        return failure(context, "OSEO3001",
            "Supported input form: readFileSync(0[, utf8 options]).");
    }
    OseoValue roots[3] = {
        count > 1u ? arguments[1] : oseo_undefined(),
        oseo_undefined(), oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    if (is_object(roots[0])) {
        result = oseo_internal_own_key_array(
            context, roots[0], OSEO_OWN_KEY_ALL);
        roots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_array_like_list(
                context, roots[1], &roots[2]);
        }
        size_t key_count = 0u;
        const OseoValue *keys = NULL;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_argument_list_view(
                context, roots[2], &key_count, &keys);
        }
        for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL &&
             index < key_count; index += 1u) {
            if (!is_string(keys[index]) ||
                !oseo_internal_string_is_ascii(keys[index], "encoding")) {
                result = failure(context, "OSEO3001",
                    "Supported input options: encoding only.");
            }
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(context, "encoding");
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, roots[0], result.value);
            roots[0] = result.value;
        }
    }
    bool text = process_encoding(roots[0]);
    if (result.status == OSEO_STATUS_NORMAL && !is_nullish(roots[0]) && !text) {
        result = failure(context, "OSEO3001",
            "Supported input encoding: utf8 or utf-8.");
    }
    size_t capacity = 0u;
    size_t length = 0u;
    unsigned char *bytes = NULL;
    while (result.status == OSEO_STATUS_NORMAL) {
        if (length == capacity) {
            if (capacity > OSEO_MAX_STRING_LENGTH / 2u) {
                result = failure(context, "OSEO3001",
                    "Standard input is too large.");
                break;
            }
            size_t next = capacity == 0u ? 4096u : capacity * 2u;
            unsigned char *grown = oseo_internal_allocate_work_bytes(
                context, next);
            if (grown == NULL) {
                result = failure(context, "OSEO2001",
                    "Standard input allocation failed.");
                break;
            }
            if (length != 0u) memcpy(grown, bytes, length);
            free(bytes);
            bytes = grown;
            capacity = next;
        }
        size_t received = fread(bytes + length, 1u, capacity - length, stdin);
        length += received;
        if (feof(stdin)) break;
        if (ferror(stdin)) {
            if (errno == EINTR) { clearerr(stdin); continue; }
            result = failure(context, "OSEO3001",
                "Standard input read failed.");
            break;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && text) {
        result = process_decode(context, bytes, length);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_UINT8_ARRAY);
        roots[1] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue size = oseo_number((double)length);
            result = oseo_call_function(context, roots[1], oseo_undefined(),
                1u, &size, roots[1]);
        }
        if (result.status == OSEO_STATUS_NORMAL && length != 0u) {
            OseoTypedArray *view = typed_array_object(result.value);
            memcpy(array_buffer_object(view->viewed_buffer)->data,
                bytes, length);
        }
    }
    free(bytes);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_process_builtin_dispatch(
    OseoContext *context, size_t code_id, OseoValue callee,
    OseoValue receiver, size_t count, const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee; (void)receiver; (void)new_target;
    size_t method = OSEO_PROCESS_CODE_ID_RANGE_LAST - code_id;
    if (method == 4u) {
        return normal(context->process_has_exit_code
            ? oseo_number((double)context->process_exit_code)
            : oseo_undefined());
    }
    if (method == 5u) {
        return process_set_code(context,
            count > 0u ? arguments[0] : oseo_undefined());
    }
    if (method == 0u) {
        OseoResult result = count == 0u ? normal(oseo_undefined())
            : process_set_code(context, arguments[0]);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        int status = oseo_process_finish(context);
        if (context->observe_specialization) {
            oseo_context_print_observations(context);
        }
        oseo_context_destroy(context);
        exit(status);
    }
    if (method == 3u) return process_read(context, count, arguments);
    if (method == 1u || method == 2u) {
        if (count == 0u || count > 2u ||
            (count == 2u && !is_nullish(arguments[1]) &&
             !process_encoding(arguments[1]))) {
            return oseo_internal_throw_error(context, OSEO_ERROR_TYPE,
                "A stream write accepts a chunk and "
                "an optional UTF-8 encoding.");
        }
        bool standard_error = method == 2u;
        OseoResult result;
        if (is_string(arguments[0])) {
            result = oseo_internal_process_write_string(context,
                standard_error, arguments[0], true);
        } else if (is_typed_array(arguments[0]) &&
                   typed_array_object(arguments[0])->element_kind ==
                       OSEO_TYPED_ARRAY_UINT8) {
            size_t length = 0u;
            result = oseo_internal_typed_array_validate(
                context, arguments[0], &length);
            if (result.status == OSEO_STATUS_NORMAL) {
                OseoTypedArray *view = typed_array_object(arguments[0]);
                result = oseo_internal_process_write(context, standard_error,
                    length == 0u ? NULL :
                        array_buffer_object(view->viewed_buffer)->data +
                            view->byte_offset,
                    length, true);
            }
        } else {
            return oseo_internal_throw_error(context, OSEO_ERROR_TYPE,
                "A stream write requires a string or Uint8Array.");
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = process_flush(context, standard_error, true);
        }
        return result.status == OSEO_STATUS_NORMAL
            ? normal(oseo_boolean(true)) : result;
    }
    return failure(context, "OSEO2001", "Unknown process function.");
}
