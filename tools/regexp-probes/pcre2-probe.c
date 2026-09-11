/*
 * The external-component probe harness.
 *
 * This program is not part of Oseo. It exists so that the
 * external-component probe compares one candidate engine against the
 * owned matcher over the same patterns and the same UTF-16 subjects,
 * with the option mapping written down in one place rather than
 * described in prose.
 *
 * Every request line is `id`, `flags`, `pattern`, and `subject`
 * separated by tabs, where a pattern and a subject are hexadecimal
 * UTF-16 code units, four digits each. Every answer line is `id`
 * followed by one of `compile-error`, `no-match`, `match`, or
 * `match-error`, the measured nanoseconds of one attempt, and the
 * capture spans. A refusal also carries the component's own numeric
 * code and, in the same encoding a request uses, the message that code
 * maps to, so that error translation is observed rather than assumed:
 * an Oseo adapter would carry exactly that pair into a located
 * diagnostic.
 *
 * The option mapping is the closest PCRE2 offers to the edition:
 *
 *  -  PCRE2_UTF only for a `u` or `v` pattern, because without those
 *     flags the edition matches over UTF-16 code units and a surrogate
 *     pair is two characters, which is what non-UTF 16-bit mode does;
 *  -  PCRE2_DOLLAR_ENDONLY because `$` in the edition never matches
 *     before a final line terminator;
 *  -  PCRE2_MATCH_UNSET_BACKREF because a reference to a group that did
 *     not participate matches the empty string;
 *  -  PCRE2_ALT_BSUX with PCRE2_EXTRA_ALT_BSUX for the edition's `\u`
 *     escapes; and
 *  -  no PCRE2_UCP, because the edition's `\d` is ASCII whatever the
 *     Unicode mode says.
 *
 * `\s` and `\w` have no faithful mapping in either direction and are
 * left unmapped. The edition's WhiteSpace holds NBSP, ZWNBSP, and every
 * Space_Separator, and its LineTerminator holds U+2028 and U+2029, so
 * this component's ASCII `\s` is too narrow and its PCRE2_UCP `\s`,
 * the Unicode White_Space property, is a different set again. The
 * edition's WordCharacters is ASCII until `i` and a unicode-mode flag
 * are both set, when U+017F and U+212A fold into the basic set and `\w`
 * admits them, which is neither this component's ASCII `\w` nor its
 * PCRE2_UCP `\w`. The corpus carries one case for each rather than
 * describing them.
 *
 * `y` maps to PCRE2_ANCHORED, because the owned side of a comparison
 * honors it: a matcher program carries the flag and the owned search
 * stops after the attempt at its starting position. `g` is not mapped,
 * because it is a behavior of the edition's exec above the matcher
 * artifact and moves no single attempt.
 *
 * The newline convention is set to PCRE2_NEWLINE_ANY rather than left at
 * whatever the installed component was built with, so a comparison does
 * not depend on how a host configured its PCRE2. It remains an
 * approximation: the edition's LineTerminator is LF, CR, U+2028, and
 * U+2029, and ANY adds VT, FF, and NEL to that set. The corpus carries
 * a case that measures where the two disagree.
 */

/* clock_gettime and strtok_r are POSIX rather than C11. */
#define _POSIX_C_SOURCE 200809L

#define PCRE2_CODE_UNIT_WIDTH 16

#include <pcre2.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define PROBE_LINE_LIMIT 1048576
#define PROBE_ATTEMPTS 5

static int hex_digit(int character) {
    if (character >= '0' && character <= '9') return character - '0';
    if (character >= 'a' && character <= 'f') return character - 'a' + 10;
    if (character >= 'A' && character <= 'F') return character - 'A' + 10;
    return -1;
}

/* Decode four-digit hexadecimal UTF-16 code units into a fresh array. */
static PCRE2_UCHAR16 *decode_units(const char *text, size_t *length) {
    size_t digits = strlen(text);
    if (digits % 4u != 0u) return NULL;
    size_t count = digits / 4u;
    PCRE2_UCHAR16 *units = malloc((count + 1u) * sizeof(PCRE2_UCHAR16));
    if (units == NULL) return NULL;
    for (size_t index = 0; index < count; index += 1) {
        int unit = 0;
        for (size_t digit = 0; digit < 4u; digit += 1) {
            int value = hex_digit(text[index * 4u + digit]);
            if (value < 0) {
                free(units);
                return NULL;
            }
            unit = unit * 16 + value;
        }
        units[index] = (PCRE2_UCHAR16)unit;
    }
    units[count] = 0;
    *length = count;
    return units;
}

/*
 * Print the message one error code maps to, as hexadecimal UTF-16.
 *
 * This is the half of error translation the component owns. A code the
 * component does not recognize prints `-`, which is not a message, so
 * that an absent translation is never read as an empty one.
 */
static void print_error_message(int code) {
    PCRE2_UCHAR16 message[256];
    int written = pcre2_get_error_message(
        code,
        message,
        sizeof(message) / sizeof(message[0])
    );
    if (written <= 0) {
        printf("-");
        return;
    }
    for (int index = 0; index < written; index += 1) {
        printf("%04x", (unsigned)message[index]);
    }
}

static uint64_t now_nanoseconds(void) {
    struct timespec moment;
    clock_gettime(CLOCK_MONOTONIC, &moment);
    return (uint64_t)moment.tv_sec * 1000000000u + (uint64_t)moment.tv_nsec;
}

/* The probe's own allocator, which proves allocator injection works. */
static size_t probe_allocated = 0;

static void *probe_malloc(size_t size, void *data) {
    (void)data;
    probe_allocated += size;
    return malloc(size);
}

static void probe_free(void *pointer, void *data) {
    (void)data;
    free(pointer);
}

static uint32_t compile_options(const char *flags) {
    uint32_t options = PCRE2_DOLLAR_ENDONLY | PCRE2_ALT_BSUX |
                       PCRE2_MATCH_UNSET_BACKREF;
    if (strchr(flags, 'u') != NULL || strchr(flags, 'v') != NULL) {
        options |= PCRE2_UTF;
    }
    if (strchr(flags, 'i') != NULL) options |= PCRE2_CASELESS;
    if (strchr(flags, 'm') != NULL) options |= PCRE2_MULTILINE;
    if (strchr(flags, 's') != NULL) options |= PCRE2_DOTALL;
    if (strchr(flags, 'y') != NULL) options |= PCRE2_ANCHORED;
    return options;
}

static void report_facts(void) {
    PCRE2_UCHAR16 version[128];
    pcre2_config(PCRE2_CONFIG_VERSION, version);
    printf("version\t");
    for (size_t index = 0; version[index] != 0; index += 1) {
        printf("%c", (char)version[index]);
    }
    printf("\n");
    PCRE2_UCHAR16 unicode[128];
    pcre2_config(PCRE2_CONFIG_UNICODE_VERSION, unicode);
    printf("unicode\t");
    for (size_t index = 0; unicode[index] != 0; index += 1) {
        printf("%c", (char)unicode[index]);
    }
    printf("\n");
    uint32_t jit = 0;
    pcre2_config(PCRE2_CONFIG_JIT, &jit);
    printf("jit\t%u\n", jit);
    uint32_t newline = 0;
    pcre2_config(PCRE2_CONFIG_NEWLINE, &newline);
    /*
     * This is what the component was built with, which is not what a
     * corpus pattern compiles under: every compile context here sets
     * PCRE2_NEWLINE_ANY. Both are reported so that the build-time
     * default is never read as the setting the comparison used.
     */
    printf("newline\t%u\n", newline);
    printf("newlineoption\t%u\n", (unsigned)PCRE2_NEWLINE_ANY);
    uint32_t link = 0;
    pcre2_config(PCRE2_CONFIG_LINKSIZE, &link);
    printf("linksize\t%u\n", link);
    uint32_t depth = 0;
    pcre2_config(PCRE2_CONFIG_DEPTHLIMIT, &depth);
    printf("depthlimit\t%u\n", depth);
}

static int run_case(
    const char *id,
    const char *flags,
    const char *pattern_text,
    const char *subject_text,
    pcre2_general_context_16 *general
) {
    size_t pattern_length = 0;
    PCRE2_UCHAR16 *pattern = decode_units(pattern_text, &pattern_length);
    size_t subject_length = 0;
    PCRE2_UCHAR16 *subject = decode_units(subject_text, &subject_length);
    if (pattern == NULL || subject == NULL) {
        free(pattern);
        free(subject);
        /*
         * A request this program cannot decode is fatal rather than
         * reported. Printing it as an answer would attribute a failure
         * of this harness to the component it is measuring.
         */
        fprintf(stderr, "case %s did not decode\n", id);
        return 1;
    }
    pcre2_compile_context_16 *context = pcre2_compile_context_create(general);
    if (context == NULL) {
        free(pattern);
        free(subject);
        return 1;
    }
    pcre2_set_compile_extra_options(context, PCRE2_EXTRA_ALT_BSUX);
    pcre2_set_newline(context, PCRE2_NEWLINE_ANY);
    int error = 0;
    PCRE2_SIZE offset = 0;
    uint64_t compile_started = now_nanoseconds();
    pcre2_code_16 *code = pcre2_compile(
        pattern,
        pattern_length,
        compile_options(flags),
        &error,
        &offset,
        context
    );
    uint64_t compile_nanoseconds = now_nanoseconds() - compile_started;
    if (code == NULL) {
        printf(
            "%s\tcompile-error\t%d\t%lu\t",
            id,
            error,
            (unsigned long)offset
        );
        print_error_message(error);
        printf("\n");
        pcre2_compile_context_free(context);
        free(pattern);
        free(subject);
        return 0;
    }
    size_t compiled_size = 0;
    pcre2_pattern_info(code, PCRE2_INFO_SIZE, &compiled_size);
    pcre2_match_data_16 *data = pcre2_match_data_create_from_pattern(
        code,
        general
    );
    if (data == NULL) {
        pcre2_code_free(code);
        pcre2_compile_context_free(context);
        free(pattern);
        free(subject);
        return 1;
    }
    int count = 0;
    uint64_t best = UINT64_MAX;
    for (int attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
        uint64_t started = now_nanoseconds();
        count = pcre2_match(code, subject, subject_length, 0, 0, data, NULL);
        uint64_t taken = now_nanoseconds() - started;
        if (taken < best) best = taken;
    }
    if (count == PCRE2_ERROR_NOMATCH) {
        printf(
            "%s\tno-match\t%llu\t%llu\t%lu\n",
            id,
            (unsigned long long)best,
            (unsigned long long)compile_nanoseconds,
            (unsigned long)compiled_size
        );
    } else if (count < 0) {
        printf("%s\tmatch-error\t%d\t", id, count);
        print_error_message(count);
        printf("\n");
    } else {
        uint32_t pairs = 0;
        pcre2_pattern_info(code, PCRE2_INFO_CAPTURECOUNT, &pairs);
        PCRE2_SIZE *ovector = pcre2_get_ovector_pointer(data);
        printf(
            "%s\tmatch\t%llu\t%llu\t%lu\t%u",
            id,
            (unsigned long long)best,
            (unsigned long long)compile_nanoseconds,
            (unsigned long)compiled_size,
            pairs + 1u
        );
        for (uint32_t pair = 0; pair <= pairs; pair += 1) {
            PCRE2_SIZE start = ovector[2u * pair];
            PCRE2_SIZE end = ovector[2u * pair + 1u];
            if ((int)pair >= count || start == PCRE2_UNSET) {
                printf("\t-1\t-1");
            } else {
                printf("\t%lu\t%lu", (unsigned long)start, (unsigned long)end);
            }
        }
        printf("\n");
    }
    pcre2_match_data_free(data);
    pcre2_code_free(code);
    pcre2_compile_context_free(context);
    free(pattern);
    free(subject);
    return 0;
}

int main(int argc, char **argv) {
    FILE *requests = NULL;
    pcre2_general_context_16 *general = NULL;
    char *line = NULL;
    int status = 2;
    if (argc == 2 && strcmp(argv[1], "--facts") == 0) {
        report_facts();
        status = 0;
        goto cleanup;
    }
    if (argc != 2) {
        fprintf(stderr, "usage: pcre2-probe <requests|--facts>\n");
        goto cleanup;
    }
    requests = fopen(argv[1], "r");
    if (requests == NULL) {
        fprintf(stderr, "the request file could not be read\n");
        goto cleanup;
    }
    general = pcre2_general_context_create(probe_malloc, probe_free, NULL);
    if (general == NULL) goto cleanup;
    line = malloc(PROBE_LINE_LIMIT);
    if (line == NULL) goto cleanup;
    while (fgets(line, PROBE_LINE_LIMIT, requests) != NULL) {
        size_t length = strlen(line);
        while (length > 0u && (line[length - 1u] == '\n' ||
                               line[length - 1u] == '\r')) {
            line[length - 1u] = 0;
            length -= 1u;
        }
        if (length == 0u) continue;
        char *saved = NULL;
        char *id = strtok_r(line, "\t", &saved);
        char *flags = strtok_r(NULL, "\t", &saved);
        char *pattern = strtok_r(NULL, "\t", &saved);
        char *subject = strtok_r(NULL, "\t", &saved);
        /*
         * A request this program cannot read is fatal rather than
         * skipped: a partial answer set would be compared against the
         * complete corpus and would report agreement it never observed.
         */
        if (id == NULL || flags == NULL || pattern == NULL ||
            subject == NULL) {
            fprintf(stderr, "a request line is not four tab-separated "
                            "fields\n");
            goto cleanup;
        }
        if (run_case(id, flags, pattern, subject, general) != 0) {
            goto cleanup;
        }
    }
    printf("allocated\t%lu\n", (unsigned long)probe_allocated);
    status = 0;
cleanup:
    free(line);
    if (general != NULL) pcre2_general_context_free(general);
    if (requests != NULL) fclose(requests);
    return status;
}
