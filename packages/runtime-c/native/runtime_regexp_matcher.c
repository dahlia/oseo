#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

/*
 * The generic regular expression matcher: the pattern compiler that turns
 * one already validated pattern into an owned instruction program, and the
 * executor that runs one program over UTF-16 input.
 *
 * This component is the runtime's semantic authority for choice order,
 * capture visibility, assertion and lookaround behavior, backreference
 * resolution, quantifier priority, empty-progress failure, UTF-16 and
 * code-point traversal, and canonicalization. It reproduces the artifact
 * and executor `@oseo/compiler` owns, so a later ahead-of-time lowering
 * has one behavior to match rather than two.
 *
 * Nothing here allocates managed memory or calls user code, so a compile
 * and a match reach no safepoint and observe no managed state. The
 * program and the work area are unmanaged memory taken through the
 * runtime's work-area allocator, which shares the deterministic
 * allocation-attempt counter without collecting, so a sweep can fail any
 * of them and observe the cleanup. Both stacks the executor needs are
 * explicit and checked, so a deeply backtracking pattern reports an owned
 * boundary rather than consuming a native call stack.
 */

#define OSEO_REGEXP_INSTRUCTION_LIMIT ((size_t)0x100000u)
#define OSEO_REGEXP_REGISTER_LIMIT ((size_t)0x40000u)
#define OSEO_REGEXP_STEP_LIMIT ((uint64_t)0x1000000u)
#define OSEO_REGEXP_BACKTRACK_LIMIT ((size_t)0x400000u)
#define OSEO_REGEXP_TRAIL_LIMIT ((size_t)0x400000u)

#define OSEO_REGEXP_CODE_POINT_LIMIT ((uint32_t)0x110000u)
#define OSEO_REGEXP_UNSET ((int64_t)-1)

/*
 * One growable array of code-point boundaries.
 *
 * Every character set is an inversion list: a strictly increasing,
 * even-length list of boundaries where membership toggles, so
 * `{0x41, 0x5b}` is U+0041 through U+005A. A closing boundary may equal
 * one past the largest code point, which is the only value the list may
 * hold that is not itself a code point.
 */
typedef struct {
    uint32_t *values;
    size_t count;
    size_t capacity;
} OseoRegExpBuffer;

static void buffer_initialize(OseoRegExpBuffer *buffer) {
    buffer->values = NULL;
    buffer->count = 0u;
    buffer->capacity = 0u;
}

static void buffer_release(OseoRegExpBuffer *buffer) {
    free(buffer->values);
    buffer_initialize(buffer);
}

static bool buffer_reserve(
    OseoContext *context,
    OseoRegExpBuffer *buffer,
    size_t additional
) {
    if (buffer->capacity - buffer->count >= additional) return true;
    size_t needed = buffer->count + additional;
    if (needed < additional) return false;
    size_t capacity = buffer->capacity == 0u ? 8u : buffer->capacity;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2u) return false;
        capacity *= 2u;
    }
    if (capacity > SIZE_MAX / sizeof(uint32_t)) return false;
    uint32_t *values = oseo_internal_reallocate_work_bytes(
        context,
        buffer->values,
        capacity * sizeof(uint32_t)
    );
    if (values == NULL) return false;
    buffer->values = values;
    buffer->capacity = capacity;
    return true;
}

static bool buffer_push(
    OseoContext *context,
    OseoRegExpBuffer *buffer,
    uint32_t value
) {
    if (!buffer_reserve(context, buffer, 1u)) return false;
    buffer->values[buffer->count] = value;
    buffer->count += 1u;
    return true;
}

/* Whether one inversion list holds one code point. */
static bool set_has(
    const uint32_t *values,
    size_t count,
    uint32_t code_point
) {
    size_t low = 0u;
    size_t high = count;
    while (low < high) {
        size_t middle = low + (high - low) / 2u;
        if (values[middle] <= code_point) low = middle + 1u;
        else high = middle;
    }
    return (low & 1u) == 1u;
}

/* The union of two inversion lists, appended to an empty output. */
static bool set_union(
    OseoContext *context,
    const uint32_t *left,
    size_t left_count,
    const uint32_t *right,
    size_t right_count,
    OseoRegExpBuffer *output
) {
    output->count = 0u;
    size_t left_index = 0u;
    size_t right_index = 0u;
    int depth = 0;
    while (left_index < left_count || right_index < right_count) {
        uint32_t left_value = left_index < left_count
            ? left[left_index]
            : UINT32_MAX;
        uint32_t right_value = right_index < right_count
            ? right[right_index]
            : UINT32_MAX;
        uint32_t value = left_value < right_value ? left_value : right_value;
        int opening = 0;
        if (left_index < left_count && left_value == value) {
            opening += (left_index & 1u) == 0u ? 1 : -1;
            left_index += 1u;
        }
        if (right_index < right_count && right_value == value) {
            opening += (right_index & 1u) == 0u ? 1 : -1;
            right_index += 1u;
        }
        int previous = depth;
        depth += opening;
        if ((previous == 0 && depth > 0) || (previous > 0 && depth == 0)) {
            if (!buffer_push(context, output, value)) return false;
        }
    }
    return true;
}

/* The complement of one inversion list over the whole code-point range. */
static bool set_complement(
    OseoContext *context,
    const uint32_t *values,
    size_t count,
    OseoRegExpBuffer *output
) {
    output->count = 0u;
    uint32_t position = 0u;
    for (size_t index = 0u; index + 1u < count; index += 2u) {
        uint32_t start = values[index];
        if (start > position) {
            if (!buffer_push(context, output, position)) return false;
            if (!buffer_push(context, output, start)) return false;
        }
        position = values[index + 1u];
    }
    if (position < OSEO_REGEXP_CODE_POINT_LIMIT) {
        if (!buffer_push(context, output, position)) return false;
        if (!buffer_push(context, output, OSEO_REGEXP_CODE_POINT_LIMIT)) {
            return false;
        }
    }
    return true;
}

/*
 * Whether every member of one inversion list is a member of another.
 *
 * Both lists are normalized, so adjacent ranges never touch and one
 * inner range is covered only when a single outer range contains it.
 */
static bool set_contains_set(
    const uint32_t *outer,
    size_t outer_count,
    const uint32_t *inner,
    size_t inner_count
) {
    size_t position = 0u;
    for (size_t index = 0u; index + 1u < inner_count; index += 2u) {
        uint32_t start = inner[index];
        uint32_t end = inner[index + 1u];
        while (position + 1u < outer_count && outer[position + 1u] <= start) {
            position += 2u;
        }
        if (position + 1u >= outer_count) return false;
        if (outer[position] > start || outer[position + 1u] < end) {
            return false;
        }
    }
    return true;
}

/* Whether two inversion lists share at least one code point. */
static bool set_intersects(
    const uint32_t *left,
    size_t left_count,
    const uint32_t *right,
    size_t right_count
) {
    size_t left_index = 0u;
    size_t right_index = 0u;
    while (left_index + 1u < left_count && right_index + 1u < right_count) {
        uint32_t left_start = left[left_index];
        uint32_t left_end = left[left_index + 1u];
        uint32_t right_start = right[right_index];
        uint32_t right_end = right[right_index + 1u];
        if (left_start < right_end && right_start < left_end) return true;
        if (left_end <= right_end) left_index += 2u;
        else right_index += 2u;
    }
    return false;
}

static int compare_ranges(const void *first, const void *second) {
    const uint32_t *left = first;
    const uint32_t *right = second;
    if (left[0] != right[0]) return left[0] < right[0] ? -1 : 1;
    if (left[1] != right[1]) return left[1] < right[1] ? -1 : 1;
    return 0;
}

/*
 * Normalize a list of half-open ranges into one inversion list.
 *
 * `ranges` is rewritten in place while sorting, so a caller that still
 * needs its ranges must copy them first.
 */
static bool set_of_ranges(
    OseoContext *context,
    uint32_t *ranges,
    size_t range_count,
    OseoRegExpBuffer *output
) {
    output->count = 0u;
    if (range_count == 0u) return true;
    qsort(ranges, range_count, 2u * sizeof(uint32_t), compare_ranges);
    uint32_t start = ranges[0];
    uint32_t end = ranges[1];
    for (size_t index = 1u; index < range_count; index += 1u) {
        uint32_t next_start = ranges[2u * index];
        uint32_t next_end = ranges[2u * index + 1u];
        if (next_start <= end) {
            if (next_end > end) end = next_end;
            continue;
        }
        if (!buffer_push(context, output, start)) return false;
        if (!buffer_push(context, output, end)) return false;
        start = next_start;
        end = next_end;
    }
    if (!buffer_push(context, output, start)) return false;
    return buffer_push(context, output, end);
}

/* The four code points the LineTerminator production names. */
static const uint32_t regexp_line_terminators[] = {
    0x0au, 0x0bu, 0x0du, 0x0eu, 0x2028u, 0x202au,
};

/* The sixty-three characters `WordCharacters` calls basic. */
static const uint32_t regexp_basic_word[] = {
    0x30u, 0x3au, 0x41u, 0x5bu, 0x5fu, 0x60u, 0x61u, 0x7bu,
};

/* The decimal digits `\d` names. */
static const uint32_t regexp_decimal_digits[] = {0x30u, 0x3au};

/*
 * The `WhiteSpace`, `LineTerminator`, and Unicode 17.0.0
 * `General_Category=Space_Separator` code points `\s` names, already
 * merged. The differential fixture compares every boundary of this list
 * with the reference hosts, which is what keeps it pinned to the same
 * Unicode release the compiler-side matcher resolves from `@oseo/unicode`.
 */
static const uint32_t regexp_white_space[] = {
    0x09u, 0x0eu, 0x20u, 0x21u, 0xa0u, 0xa1u, 0x1680u, 0x1681u,
    0x2000u, 0x200bu, 0x2028u, 0x202au, 0x202fu, 0x2030u, 0x205fu,
    0x2060u, 0x3000u, 0x3001u, 0xfeffu, 0xff00u,
};

/*
 * The non-ASCII code points every `Canonicalize` rule leaves alone that
 * the sets above can name.
 *
 * Only `\s`, `\S`, `.`, and a negated class can put a code point outside
 * ASCII into a set this component builds without naming it, and all of
 * them are the caseless separators and format characters listed here.
 * Recording them lets the ignore-case closure prove that a set meets no
 * case-equivalence class it has no data for.
 */
static const uint32_t regexp_caseless_non_ascii[] = {
    0xa0u, 0xa1u, 0x1680u, 0x1681u, 0x2000u, 0x200bu, 0x2028u, 0x202au,
    0x202fu, 0x2030u, 0x205fu, 0x2060u, 0x3000u, 0x3001u, 0xfeffu,
    0xff00u,
};

/*
 * The two case-equivalence classes that mix ASCII with non-ASCII.
 *
 * Simple case folding maps U+017F to `s` and U+212A to `k` and nothing
 * else outside ASCII to an ASCII code point, and the code-unit
 * uppercase rule maps nothing outside ASCII into ASCII at all. Every
 * remaining class of two or more characters therefore lies entirely
 * inside ASCII or entirely outside it.
 */
static const uint32_t regexp_folded_k[] = {0x4bu, 0x6bu, 0x212au};
static const uint32_t regexp_folded_s[] = {0x53u, 0x73u, 0x17fu};

#define OSEO_REGEXP_SET_COUNT(array) (sizeof(array) / sizeof(uint32_t))

/* One decoded escape, whatever production it came from. */
typedef enum {
    OSEO_REGEXP_ESCAPE_CHARACTER = 0,
    OSEO_REGEXP_ESCAPE_CLASS = 1,
    OSEO_REGEXP_ESCAPE_BOUNDARY = 2,
    OSEO_REGEXP_ESCAPE_BACKREFERENCE = 3,
} OseoRegExpEscapeKind;

typedef enum {
    OSEO_REGEXP_CLASS_DIGIT = 0,
    OSEO_REGEXP_CLASS_SPACE = 1,
    OSEO_REGEXP_CLASS_WORD = 2,
} OseoRegExpClassEscape;

typedef struct {
    OseoRegExpEscapeKind kind;
    OseoRegExpClassEscape class_escape;
    uint32_t code_point;
    size_t capture;
    bool negated;
} OseoRegExpEscapeResult;

/* One growable array of UTF-16 code units, used for group names. */
typedef struct {
    uint16_t *values;
    size_t count;
    size_t capacity;
} OseoRegExpUnitBuffer;

static bool unit_buffer_push(
    OseoContext *context,
    OseoRegExpUnitBuffer *buffer,
    uint16_t value
) {
    if (buffer->count == buffer->capacity) {
        size_t capacity = buffer->capacity == 0u ? 16u : buffer->capacity * 2u;
        if (capacity > SIZE_MAX / sizeof(uint16_t)) return false;
        uint16_t *values = oseo_internal_reallocate_work_bytes(
            context,
            buffer->values,
            capacity * sizeof(uint16_t)
        );
        if (values == NULL) return false;
        buffer->values = values;
        buffer->capacity = capacity;
    }
    buffer->values[buffer->count] = value;
    buffer->count += 1u;
    return true;
}

/*
 * The emitter and parser state of one compilation.
 *
 * A target operand holds a label while instructions are emitted and the
 * address that label was placed at afterwards, so a forward branch never
 * needs a mutable instruction and moving a block only moves labels.
 */
typedef struct {
    OseoContext *context;
    const OseoString *source;
    size_t index;
    uint16_t flag_mask;
    bool unicode;
    bool ignore_case;
    bool multiline;
    bool dot_all;

    size_t capture_count;
    size_t next_capture;
    size_t registers;
    size_t fail_label;
    bool has_ignore_case_backreference;
    bool sets_reach_unknown_case;
    OseoRegExpValidation status;

    OseoRegExpInstruction *instructions;
    size_t instruction_count;
    size_t instruction_capacity;

    uint32_t *addresses;
    size_t label_count;
    size_t label_capacity;

    OseoRegExpBuffer set_boundaries;
    uint32_t *set_offsets;
    uint32_t *set_hashes;
    size_t set_count;
    size_t set_capacity;
    size_t word_set;
    bool word_set_ready;

    OseoRegExpRepeat *repeats;
    size_t repeat_count;
    size_t repeat_capacity;

    OseoRegExpCapture *captures;
    OseoRegExpUnitBuffer names;

    OseoRegExpBuffer unknown_region;
    /*
     * Working sets. Every production names the buffers it writes, so a
     * nested build never overwrites a set its caller still holds.
     * `close_additions` and `close_ranges` belong to the ignore-case
     * closure alone, and `blocks` is a stack of term-block starts.
     */
    OseoRegExpBuffer work[5];
    OseoRegExpBuffer close_additions;
    OseoRegExpBuffer close_ranges;
    OseoRegExpBuffer class_ranges;
    OseoRegExpBuffer blocks;
} OseoRegExpCompiler;

static void compiler_fail(
    OseoRegExpCompiler *compiler,
    OseoRegExpValidation status
) {
    if (compiler->status == OSEO_REGEXP_VALID) compiler->status = status;
}

static bool compiler_ok(const OseoRegExpCompiler *compiler) {
    return compiler->status == OSEO_REGEXP_VALID;
}

static bool compiler_allocate(OseoRegExpCompiler *compiler, bool succeeded) {
    if (succeeded) return true;
    compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
    return false;
}

static size_t new_label(OseoRegExpCompiler *compiler) {
    if (compiler->label_count == compiler->label_capacity) {
        size_t capacity = compiler->label_capacity == 0u
            ? 16u
            : compiler->label_capacity * 2u;
        if (capacity > SIZE_MAX / sizeof(uint32_t)) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        uint32_t *addresses = oseo_internal_reallocate_work_bytes(
            compiler->context,
            compiler->addresses,
            capacity * sizeof(uint32_t)
        );
        if (addresses == NULL) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        compiler->addresses = addresses;
        compiler->label_capacity = capacity;
    }
    compiler->addresses[compiler->label_count] = UINT32_MAX;
    compiler->label_count += 1u;
    return compiler->label_count - 1u;
}

static void place_label_at(
    OseoRegExpCompiler *compiler,
    size_t label,
    size_t address
) {
    if (label < compiler->label_count) {
        compiler->addresses[label] = (uint32_t)address;
    }
}

static void place_label(OseoRegExpCompiler *compiler, size_t label) {
    place_label_at(compiler, label, compiler->instruction_count);
}

static bool reserve_instructions(
    OseoRegExpCompiler *compiler,
    size_t additional
) {
    if (compiler->instruction_capacity - compiler->instruction_count >=
        additional) {
        return true;
    }
    size_t needed = compiler->instruction_count + additional;
    size_t capacity = compiler->instruction_capacity == 0u
        ? 16u
        : compiler->instruction_capacity;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2u) return false;
        capacity *= 2u;
    }
    if (capacity > SIZE_MAX / sizeof(OseoRegExpInstruction)) return false;
    OseoRegExpInstruction *instructions = oseo_internal_reallocate_work_bytes(
        compiler->context,
        compiler->instructions,
        capacity * sizeof(OseoRegExpInstruction)
    );
    if (instructions == NULL) return false;
    compiler->instructions = instructions;
    compiler->instruction_capacity = capacity;
    return true;
}

static void emit(
    OseoRegExpCompiler *compiler,
    uint8_t opcode,
    uint8_t modifiers,
    uint32_t first,
    uint32_t second,
    uint32_t third,
    uint32_t fourth
) {
    if (!compiler_ok(compiler)) return;
    if (compiler->instruction_count >= OSEO_REGEXP_INSTRUCTION_LIMIT) {
        compiler_fail(compiler, OSEO_REGEXP_LIMIT);
        return;
    }
    if (!compiler_allocate(compiler, reserve_instructions(compiler, 1u))) {
        return;
    }
    OseoRegExpInstruction *instruction =
        &compiler->instructions[compiler->instruction_count];
    instruction->opcode = opcode;
    instruction->modifiers = modifiers;
    instruction->operands[0] = first;
    instruction->operands[1] = second;
    instruction->operands[2] = third;
    instruction->operands[3] = fourth;
    compiler->instruction_count += 1u;
}

/*
 * Open a gap of `count` instructions at `at`.
 *
 * A quantifier and an alternation are both discovered only after the
 * code they wrap has been emitted, so their prologue is written into a
 * gap rather than by re-parsing. A label after the gap moves with the
 * block it named. A label exactly at the gap stays, because every label
 * placed at an address names the position execution reaches *before*
 * whatever is emitted there next: the preceding term's continuation and
 * a lookaround body entry both belong in front of the new prologue.
 */
static bool emit_insert(
    OseoRegExpCompiler *compiler,
    size_t at,
    size_t count
) {
    if (!compiler_ok(compiler)) return false;
    if (compiler->instruction_count + count > OSEO_REGEXP_INSTRUCTION_LIMIT) {
        compiler_fail(compiler, OSEO_REGEXP_LIMIT);
        return false;
    }
    if (!compiler_allocate(compiler, reserve_instructions(compiler, count))) {
        return false;
    }
    memmove(
        &compiler->instructions[at + count],
        &compiler->instructions[at],
        (compiler->instruction_count - at) * sizeof(OseoRegExpInstruction)
    );
    memset(
        &compiler->instructions[at],
        0,
        count * sizeof(OseoRegExpInstruction)
    );
    compiler->instruction_count += count;
    for (size_t label = 0u; label < compiler->label_count; label += 1u) {
        uint32_t address = compiler->addresses[label];
        if (address != UINT32_MAX && address > at) {
            compiler->addresses[label] = address + (uint32_t)count;
        }
    }
    return true;
}

static size_t allocate_registers(OseoRegExpCompiler *compiler, size_t count) {
    if (compiler->registers + count > OSEO_REGEXP_REGISTER_LIMIT) {
        compiler_fail(compiler, OSEO_REGEXP_LIMIT);
        return 0u;
    }
    size_t base = compiler->registers;
    compiler->registers += count;
    return base;
}

static size_t allocate_repeat(
    OseoRegExpCompiler *compiler,
    uint64_t minimum,
    uint64_t maximum,
    uint32_t clear_from,
    uint32_t clear_to
) {
    if (compiler->repeat_count == compiler->repeat_capacity) {
        size_t capacity = compiler->repeat_capacity == 0u
            ? 8u
            : compiler->repeat_capacity * 2u;
        if (capacity > SIZE_MAX / sizeof(OseoRegExpRepeat)) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        OseoRegExpRepeat *repeats = oseo_internal_reallocate_work_bytes(
            compiler->context,
            compiler->repeats,
            capacity * sizeof(OseoRegExpRepeat)
        );
        if (repeats == NULL) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        compiler->repeats = repeats;
        compiler->repeat_capacity = capacity;
    }
    compiler->repeats[compiler->repeat_count].minimum = minimum;
    compiler->repeats[compiler->repeat_count].maximum = maximum;
    compiler->repeats[compiler->repeat_count].clear_from = clear_from;
    compiler->repeats[compiler->repeat_count].clear_to = clear_to;
    compiler->repeat_count += 1u;
    return compiler->repeat_count - 1u;
}

/*
 * Intern one set, so equal sets share one program entry.
 *
 * A hash narrows the comparison to sets that could be equal, which keeps
 * a pattern with many distinct classes linear in the number of sets
 * rather than quadratic.
 */
static size_t intern_set(
    OseoRegExpCompiler *compiler,
    const uint32_t *values,
    size_t count
) {
    uint32_t hash = 0x811c9dc5u;
    for (size_t index = 0u; index < count; index += 1u) {
        hash = (hash ^ values[index]) * 0x01000193u;
    }
    for (size_t index = 0u; index < compiler->set_count; index += 1u) {
        if (compiler->set_hashes[index] != hash) continue;
        uint32_t start = compiler->set_offsets[index];
        uint32_t end = compiler->set_offsets[index + 1u];
        if ((size_t)(end - start) != count) continue;
        if (count == 0u ||
            memcmp(
                &compiler->set_boundaries.values[start],
                values,
                count * sizeof(uint32_t)
            ) == 0) {
            return index;
        }
    }
    if (compiler->set_count == compiler->set_capacity) {
        size_t capacity = compiler->set_capacity == 0u
            ? 8u
            : compiler->set_capacity * 2u;
        if (capacity > SIZE_MAX / sizeof(uint32_t) - 1u) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        uint32_t *offsets = oseo_internal_reallocate_work_bytes(
            compiler->context,
            compiler->set_offsets,
            (capacity + 1u) * sizeof(uint32_t)
        );
        if (offsets == NULL) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        compiler->set_offsets = offsets;
        uint32_t *hashes = oseo_internal_reallocate_work_bytes(
            compiler->context,
            compiler->set_hashes,
            capacity * sizeof(uint32_t)
        );
        if (hashes == NULL) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
        compiler->set_hashes = hashes;
        compiler->set_capacity = capacity;
        if (compiler->set_count == 0u) compiler->set_offsets[0] = 0u;
    }
    if (compiler->set_boundaries.count + count > UINT32_MAX) {
        compiler_fail(compiler, OSEO_REGEXP_LIMIT);
        return 0u;
    }
    if (!compiler_allocate(
            compiler,
            buffer_reserve(
                compiler->context,
                &compiler->set_boundaries,
                count
            )
        )) {
        return 0u;
    }
    if (count > 0u) {
        memcpy(
            &compiler->set_boundaries.values[compiler->set_boundaries.count],
            values,
            count * sizeof(uint32_t)
        );
        compiler->set_boundaries.count += count;
    }
    compiler->set_hashes[compiler->set_count] = hash;
    compiler->set_count += 1u;
    compiler->set_offsets[compiler->set_count] =
        (uint32_t)compiler->set_boundaries.count;
    return compiler->set_count - 1u;
}

static bool buffer_copy(
    OseoContext *context,
    OseoRegExpBuffer *output,
    const uint32_t *values,
    size_t count
) {
    output->count = 0u;
    if (!buffer_reserve(context, output, count)) return false;
    if (count > 0u) memcpy(output->values, values, count * sizeof(uint32_t));
    output->count = count;
    return true;
}

/*
 * Build the region of code points whose case-equivalence class this
 * component has no data for.
 *
 * Everything below U+0080 belongs to a class the closure knows exactly,
 * and so do the caseless separators and the two mixed classes. A set
 * that meets this region partially could be closed only by folding data
 * that is not linked, which is a located boundary rather than a guess.
 */
static bool build_unknown_region(OseoRegExpCompiler *compiler) {
    OseoRegExpBuffer *exempt = &compiler->work[0];
    OseoRegExpBuffer *combined = &compiler->work[1];
    exempt->count = 0u;
    OseoContext *context = compiler->context;
    if (!buffer_push(context, exempt, 0u)) return false;
    if (!buffer_push(context, exempt, 0x80u)) return false;
    if (!set_union(
            context,
            exempt->values,
            exempt->count,
            regexp_caseless_non_ascii,
            OSEO_REGEXP_SET_COUNT(regexp_caseless_non_ascii),
            combined
        )) {
        return false;
    }
    if (compiler->unicode) {
        static const uint32_t mixed[] = {
            0x17fu, 0x180u, 0x212au, 0x212bu,
        };
        if (!set_union(
                context,
                combined->values,
                combined->count,
                mixed,
                OSEO_REGEXP_SET_COUNT(mixed),
                exempt
            )) {
            return false;
        }
        return set_complement(
            context,
            exempt->values,
            exempt->count,
            &compiler->unknown_region
        );
    }
    return set_complement(
        context,
        combined->values,
        combined->count,
        &compiler->unknown_region
    );
}

/*
 * Close one set under the pattern's canonicalization.
 *
 * `CharacterSetMatcher` compares the canonical form of the input
 * character with the canonical form of every set member, so a set
 * matches exactly the characters whose equivalence class meets it. Only
 * a character with a case sibling can join a set it was not already in,
 * so closing walks the known equivalence classes rather than the whole
 * code-point range, and refuses a set that meets an unknown class.
 */
static bool close_set(
    OseoRegExpCompiler *compiler,
    const uint32_t *values,
    size_t count,
    OseoRegExpBuffer *output
) {
    OseoContext *context = compiler->context;
    if (!compiler->ignore_case) {
        return compiler_allocate(
            compiler,
            buffer_copy(context, output, values, count)
        );
    }
    const uint32_t *region = compiler->unknown_region.values;
    size_t region_count = compiler->unknown_region.count;
    if (set_intersects(values, count, region, region_count) &&
        !set_contains_set(values, count, region, region_count)) {
        compiler_fail(compiler, OSEO_REGEXP_UNSUPPORTED);
        return false;
    }
    OseoRegExpBuffer *ranges = &compiler->close_ranges;
    ranges->count = 0u;
    for (uint32_t offset = 0u; offset < 26u; offset += 1u) {
        uint32_t upper = 0x41u + offset;
        uint32_t lower = 0x61u + offset;
        if (!set_has(values, count, upper) &&
            !set_has(values, count, lower)) {
            continue;
        }
        if (!buffer_push(context, ranges, upper) ||
            !buffer_push(context, ranges, upper + 1u) ||
            !buffer_push(context, ranges, lower) ||
            !buffer_push(context, ranges, lower + 1u)) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return false;
        }
    }
    if (compiler->unicode) {
        const uint32_t *classes[2] = {regexp_folded_k, regexp_folded_s};
        for (size_t index = 0u; index < 2u; index += 1u) {
            bool meets = false;
            for (size_t member = 0u; member < 3u; member += 1u) {
                if (set_has(values, count, classes[index][member])) {
                    meets = true;
                }
            }
            if (!meets) continue;
            for (size_t member = 0u; member < 3u; member += 1u) {
                uint32_t code_point = classes[index][member];
                if (!buffer_push(context, ranges, code_point) ||
                    !buffer_push(context, ranges, code_point + 1u)) {
                    compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
                    return false;
                }
            }
        }
    }
    if (ranges->count == 0u) {
        return compiler_allocate(
            compiler,
            buffer_copy(context, output, values, count)
        );
    }
    OseoRegExpBuffer *additions = &compiler->close_additions;
    if (!set_of_ranges(
            context,
            ranges->values,
            ranges->count / 2u,
            additions
        )) {
        compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
        return false;
    }
    return compiler_allocate(
        compiler,
        set_union(
            context,
            values,
            count,
            additions->values,
            additions->count,
            output
        )
    );
}

/* The raw set one `\d`, `\s`, or `\w` escape names, before closing. */
static bool class_escape_set(
    OseoRegExpCompiler *compiler,
    OseoRegExpClassEscape kind,
    OseoRegExpBuffer *output
) {
    if (kind == OSEO_REGEXP_CLASS_DIGIT) {
        return compiler_allocate(
            compiler,
            buffer_copy(
                compiler->context,
                output,
                regexp_decimal_digits,
                OSEO_REGEXP_SET_COUNT(regexp_decimal_digits)
            )
        );
    }
    if (kind == OSEO_REGEXP_CLASS_SPACE) {
        return compiler_allocate(
            compiler,
            buffer_copy(
                compiler->context,
                output,
                regexp_white_space,
                OSEO_REGEXP_SET_COUNT(regexp_white_space)
            )
        );
    }
    /*
     * The edition adds a character outside the basic sixty-three only
     * when both `i` and a unicode-mode flag are set, and closing the
     * basic set under the code-unit rule adds nothing, so one expression
     * covers every flag combination.
     */
    return close_set(
        compiler,
        regexp_basic_word,
        OSEO_REGEXP_SET_COUNT(regexp_basic_word),
        output
    );
}

/*
 * Record one consuming set and note whether it can match a character
 * whose case-equivalence class is unknown, which is what decides
 * afterwards whether a backreference under `i` can be lowered.
 */
static uint32_t intern_consuming_set(
    OseoRegExpCompiler *compiler,
    const OseoRegExpBuffer *set
) {
    if (compiler->ignore_case &&
        set_intersects(
            set->values,
            set->count,
            compiler->unknown_region.values,
            compiler->unknown_region.count
        )) {
        compiler->sets_reach_unknown_case = true;
    }
    return (uint32_t)intern_set(compiler, set->values, set->count);
}

static bool ascii_alpha(uint16_t unit) {
    return (unit >= 'A' && unit <= 'Z') || (unit >= 'a' && unit <= 'z');
}

static bool ascii_digit(uint16_t unit) {
    return unit >= '0' && unit <= '9';
}

static bool hex_digit(uint16_t unit, uint32_t *value) {
    if (ascii_digit(unit)) {
        *value = (uint32_t)(unit - '0');
        return true;
    }
    if (unit >= 'A' && unit <= 'F') {
        *value = (uint32_t)(unit - 'A') + 10u;
        return true;
    }
    if (unit >= 'a' && unit <= 'f') {
        *value = (uint32_t)(unit - 'a') + 10u;
        return true;
    }
    return false;
}

static uint16_t unit_at(const OseoRegExpCompiler *compiler, size_t index) {
    return index < compiler->source->length
        ? compiler->source->units[index]
        : (uint16_t)0u;
}

static bool at_end(const OseoRegExpCompiler *compiler) {
    return compiler->index >= compiler->source->length;
}

/* Read one pattern code point, pairing surrogates in unicode mode. */
static uint32_t read_code_point(OseoRegExpCompiler *compiler) {
    uint16_t lead = unit_at(compiler, compiler->index);
    compiler->index += 1u;
    if (!compiler->unicode || lead < 0xd800u || lead > 0xdbffu) {
        return lead;
    }
    uint16_t trail = unit_at(compiler, compiler->index);
    if (compiler->index >= compiler->source->length || trail < 0xdc00u ||
        trail > 0xdfffu) {
        return lead;
    }
    compiler->index += 1u;
    return 0x10000u + (((uint32_t)lead - 0xd800u) << 10u) +
        ((uint32_t)trail - 0xdc00u);
}

/*
 * The capture index one group name names.
 *
 * Names are collected before emission because a reference may precede
 * its declaration, and duplicate names are refused before this point, so
 * one name resolves to exactly one capture.
 */
static size_t lookup_group(
    const OseoRegExpCompiler *compiler,
    const uint16_t *units,
    size_t length
) {
    for (size_t index = 0u; index < compiler->capture_count; index += 1u) {
        const OseoRegExpCapture *capture = &compiler->captures[index];
        if (!capture->named || capture->name_length != length) continue;
        if (memcmp(
                &compiler->names.values[capture->name_offset],
                units,
                length * sizeof(uint16_t)
            ) == 0) {
            return index + 1u;
        }
    }
    return SIZE_MAX;
}

/*
 * Assign capture indices and record group names in source order.
 *
 * The walk mirrors the validator's group recognition, which has already
 * accepted the pattern, so it needs no error path of its own.
 */
static bool collect_captures(OseoRegExpCompiler *compiler) {
    const OseoString *source = compiler->source;
    bool character_class = false;
    size_t assigned = 0u;
    for (size_t index = 0u; index < source->length; index += 1u) {
        uint16_t unit = source->units[index];
        if (unit == '\\') {
            if (index + 1u < source->length) index += 1u;
            continue;
        }
        if (character_class) {
            if (unit == ']') character_class = false;
            continue;
        }
        if (unit == '[') {
            character_class = true;
            continue;
        }
        if (unit != '(') continue;
        bool named = index + 3u < source->length &&
            source->units[index + 1u] == '?' &&
            source->units[index + 2u] == '<' &&
            source->units[index + 3u] != '=' &&
            source->units[index + 3u] != '!';
        bool capture = index + 1u >= source->length ||
            source->units[index + 1u] != '?' || named;
        if (!capture) continue;
        if (assigned >= compiler->capture_count) return false;
        OseoRegExpCapture *record = &compiler->captures[assigned];
        record->named = named;
        record->name_offset = 0u;
        record->name_length = 0u;
        if (named) {
            size_t start = index + 3u;
            size_t end = start;
            while (end < source->length && source->units[end] != '>') {
                end += 1u;
            }
            record->name_offset = (uint32_t)compiler->names.count;
            record->name_length = (uint32_t)(end - start);
            for (size_t offset = start; offset < end; offset += 1u) {
                if (!unit_buffer_push(
                        compiler->context,
                        &compiler->names,
                        source->units[offset]
                    )) {
                    return false;
                }
            }
            index = end;
        }
        assigned += 1u;
    }
    return assigned == compiler->capture_count;
}

/* Decode one escape sequence, leaving the cursor past it. */
static bool parse_escape(
    OseoRegExpCompiler *compiler,
    bool in_class,
    OseoRegExpEscapeResult *result
) {
    result->kind = OSEO_REGEXP_ESCAPE_CHARACTER;
    result->class_escape = OSEO_REGEXP_CLASS_DIGIT;
    result->code_point = 0u;
    result->capture = 0u;
    result->negated = false;
    compiler->index += 1u;
    if (at_end(compiler)) {
        compiler_fail(compiler, OSEO_REGEXP_INVALID);
        return false;
    }
    uint16_t unit = unit_at(compiler, compiler->index);
    switch (unit) {
        case 'd':
        case 'D':
            result->kind = OSEO_REGEXP_ESCAPE_CLASS;
            result->class_escape = OSEO_REGEXP_CLASS_DIGIT;
            result->negated = unit == 'D';
            compiler->index += 1u;
            return true;
        case 's':
        case 'S':
            result->kind = OSEO_REGEXP_ESCAPE_CLASS;
            result->class_escape = OSEO_REGEXP_CLASS_SPACE;
            result->negated = unit == 'S';
            compiler->index += 1u;
            return true;
        case 'w':
        case 'W':
            result->kind = OSEO_REGEXP_ESCAPE_CLASS;
            result->class_escape = OSEO_REGEXP_CLASS_WORD;
            result->negated = unit == 'W';
            compiler->index += 1u;
            return true;
        case 'b':
            compiler->index += 1u;
            if (in_class) {
                result->code_point = 0x08u;
                return true;
            }
            result->kind = OSEO_REGEXP_ESCAPE_BOUNDARY;
            return true;
        case 'B':
            compiler->index += 1u;
            result->kind = OSEO_REGEXP_ESCAPE_BOUNDARY;
            result->negated = true;
            return true;
        case 'f':
            compiler->index += 1u;
            result->code_point = 0x0cu;
            return true;
        case 'n':
            compiler->index += 1u;
            result->code_point = 0x0au;
            return true;
        case 'r':
            compiler->index += 1u;
            result->code_point = 0x0du;
            return true;
        case 't':
            compiler->index += 1u;
            result->code_point = 0x09u;
            return true;
        case 'v':
            compiler->index += 1u;
            result->code_point = 0x0bu;
            return true;
        case 'p':
        case 'P':
        case 'q':
            compiler_fail(compiler, OSEO_REGEXP_UNSUPPORTED);
            return false;
        default:
            break;
    }
    if (unit == 'c' && ascii_alpha(unit_at(compiler, compiler->index + 1u))) {
        result->code_point =
            (uint32_t)(unit_at(compiler, compiler->index + 1u) & 0x1fu);
        compiler->index += 2u;
        return true;
    }
    if (unit == 'x') {
        uint32_t high = 0u;
        uint32_t low = 0u;
        if (!hex_digit(unit_at(compiler, compiler->index + 1u), &high) ||
            !hex_digit(unit_at(compiler, compiler->index + 2u), &low)) {
            compiler_fail(compiler, OSEO_REGEXP_INVALID);
            return false;
        }
        result->code_point = high * 16u + low;
        compiler->index += 3u;
        return true;
    }
    if (unit == 'u') {
        compiler->index += 1u;
        if (unit_at(compiler, compiler->index) == '{') {
            compiler->index += 1u;
            uint32_t value = 0u;
            while (!at_end(compiler) &&
                   unit_at(compiler, compiler->index) != '}') {
                uint32_t digit = 0u;
                if (!hex_digit(unit_at(compiler, compiler->index), &digit)) {
                    compiler_fail(compiler, OSEO_REGEXP_INVALID);
                    return false;
                }
                value = value * 16u + digit;
                compiler->index += 1u;
            }
            compiler->index += 1u;
            result->code_point = value;
            return true;
        }
        uint32_t value = 0u;
        for (size_t offset = 0u; offset < 4u; offset += 1u) {
            uint32_t digit = 0u;
            if (!hex_digit(
                    unit_at(compiler, compiler->index + offset),
                    &digit
                )) {
                compiler_fail(compiler, OSEO_REGEXP_INVALID);
                return false;
            }
            value = value * 16u + digit;
        }
        compiler->index += 4u;
        if (compiler->unicode && value >= 0xd800u && value <= 0xdbffu &&
            unit_at(compiler, compiler->index) == '\\' &&
            unit_at(compiler, compiler->index + 1u) == 'u') {
            uint32_t trail = 0u;
            bool paired = true;
            for (size_t offset = 0u; offset < 4u; offset += 1u) {
                uint32_t digit = 0u;
                if (!hex_digit(
                        unit_at(compiler, compiler->index + 2u + offset),
                        &digit
                    )) {
                    paired = false;
                    break;
                }
                trail = trail * 16u + digit;
            }
            if (paired && trail >= 0xdc00u && trail <= 0xdfffu) {
                value = 0x10000u + ((value - 0xd800u) << 10u) +
                    (trail - 0xdc00u);
                compiler->index += 6u;
            }
        }
        result->code_point = value;
        return true;
    }
    if (unit == 'k' && !in_class) {
        compiler->index += 2u;
        size_t start = compiler->index;
        while (!at_end(compiler) &&
               unit_at(compiler, compiler->index) != '>') {
            compiler->index += 1u;
        }
        size_t capture = lookup_group(
            compiler,
            &compiler->source->units[start],
            compiler->index - start
        );
        compiler->index += 1u;
        if (capture == SIZE_MAX) {
            compiler_fail(compiler, OSEO_REGEXP_INVALID);
            return false;
        }
        result->kind = OSEO_REGEXP_ESCAPE_BACKREFERENCE;
        result->capture = capture;
        return true;
    }
    if (ascii_digit(unit)) {
        if (unit == '0' || in_class) {
            compiler->index += 1u;
            result->code_point = unit == '0' ? 0u : (uint32_t)unit;
            return true;
        }
        size_t value = 0u;
        while (!at_end(compiler) &&
               ascii_digit(unit_at(compiler, compiler->index))) {
            value = value * 10u +
                (size_t)(unit_at(compiler, compiler->index) - '0');
            compiler->index += 1u;
            if (value > compiler->capture_count) break;
        }
        if (value == 0u || value > compiler->capture_count) {
            compiler_fail(compiler, OSEO_REGEXP_INVALID);
            return false;
        }
        result->kind = OSEO_REGEXP_ESCAPE_BACKREFERENCE;
        result->capture = value;
        return true;
    }
    result->code_point = read_code_point(compiler);
    return true;
}

static void buffer_swap(OseoRegExpBuffer *first, OseoRegExpBuffer *second) {
    OseoRegExpBuffer temporary = *first;
    *first = *second;
    *second = temporary;
}

typedef struct {
    bool is_set;
    bool negated;
    uint32_t code_point;
    OseoRegExpClassEscape class_escape;
} OseoRegExpClassAtom;

static bool parse_class_atom(
    OseoRegExpCompiler *compiler,
    OseoRegExpClassAtom *atom
) {
    atom->is_set = false;
    atom->negated = false;
    atom->code_point = 0u;
    atom->class_escape = OSEO_REGEXP_CLASS_DIGIT;
    if (unit_at(compiler, compiler->index) != '\\') {
        atom->code_point = read_code_point(compiler);
        return true;
    }
    OseoRegExpEscapeResult escape;
    if (!parse_escape(compiler, true, &escape)) return false;
    if (escape.kind == OSEO_REGEXP_ESCAPE_CLASS) {
        atom->is_set = true;
        atom->negated = escape.negated;
        atom->class_escape = escape.class_escape;
        return true;
    }
    if (escape.kind != OSEO_REGEXP_ESCAPE_CHARACTER) {
        compiler_fail(compiler, OSEO_REGEXP_INVALID);
        return false;
    }
    atom->code_point = escape.code_point;
    return true;
}

/*
 * Compile one character class into an interned set.
 *
 * Closing comes before negation because `CharacterSetMatcher` inverts a
 * class after canonicalizing its members: `[^a]` under `i` rejects `A`,
 * while closing the complement instead would accept it.
 */
static uint32_t parse_character_class(OseoRegExpCompiler *compiler) {
    OseoContext *context = compiler->context;
    compiler->index += 1u;
    bool negated = unit_at(compiler, compiler->index) == '^';
    if (negated) compiler->index += 1u;
    OseoRegExpBuffer *accumulator = &compiler->work[0];
    accumulator->count = 0u;
    compiler->class_ranges.count = 0u;
    while (!at_end(compiler) && unit_at(compiler, compiler->index) != ']') {
        OseoRegExpClassAtom first;
        if (!parse_class_atom(compiler, &first)) return 0u;
        if (first.is_set) {
            if (!class_escape_set(
                    compiler,
                    first.class_escape,
                    &compiler->work[1]
                )) {
                return 0u;
            }
            if (first.negated) {
                if (!compiler_allocate(
                        compiler,
                        set_complement(
                            compiler->context,
                            compiler->work[1].values,
                            compiler->work[1].count,
                            &compiler->work[2]
                        )
                    )) {
                    return 0u;
                }
                buffer_swap(&compiler->work[1], &compiler->work[2]);
            }
            if (!compiler_allocate(
                    compiler,
                    set_union(
                        compiler->context,
                        accumulator->values,
                        accumulator->count,
                        compiler->work[1].values,
                        compiler->work[1].count,
                        &compiler->work[2]
                    )
                )) {
                return 0u;
            }
            buffer_swap(accumulator, &compiler->work[2]);
            continue;
        }
        uint32_t start = first.code_point;
        uint32_t end = start;
        if (unit_at(compiler, compiler->index) == '-' &&
            compiler->index + 1u < compiler->source->length &&
            unit_at(compiler, compiler->index + 1u) != ']') {
            compiler->index += 1u;
            OseoRegExpClassAtom second;
            if (!parse_class_atom(compiler, &second)) return 0u;
            if (second.is_set || second.code_point < start) {
                compiler_fail(compiler, OSEO_REGEXP_INVALID);
                return 0u;
            }
            end = second.code_point;
        }
        if (!buffer_push(compiler->context, &compiler->class_ranges, start) ||
            !buffer_push(
                compiler->context,
                &compiler->class_ranges,
                end + 1u
            )) {
            compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
            return 0u;
        }
    }
    if (at_end(compiler)) {
        compiler_fail(compiler, OSEO_REGEXP_INVALID);
        return 0u;
    }
    compiler->index += 1u;
    if (!compiler_allocate(
            compiler,
            set_of_ranges(
                context,
                compiler->class_ranges.values,
                compiler->class_ranges.count / 2u,
                &compiler->work[1]
            )
        )) {
        return 0u;
    }
    if (!compiler_allocate(
            compiler,
            set_union(
                context,
                accumulator->values,
                accumulator->count,
                compiler->work[1].values,
                compiler->work[1].count,
                &compiler->work[2]
            )
        )) {
        return 0u;
    }
    if (!close_set(
            compiler,
            compiler->work[2].values,
            compiler->work[2].count,
            &compiler->work[3]
        )) {
        return 0u;
    }
    if (!negated) {
        return intern_consuming_set(compiler, &compiler->work[3]);
    }
    if (!compiler_allocate(
            compiler,
            set_complement(
                context,
                compiler->work[3].values,
                compiler->work[3].count,
                &compiler->work[4]
            )
        )) {
        return 0u;
    }
    return intern_consuming_set(compiler, &compiler->work[4]);
}

/* The set one single-character atom matches, already closed. */
static uint32_t single_character_set(
    OseoRegExpCompiler *compiler,
    uint32_t code_point
) {
    compiler->work[0].count = 0u;
    if (!compiler_allocate(
            compiler,
            buffer_push(compiler->context, &compiler->work[0], code_point) &&
                buffer_push(
                    compiler->context,
                    &compiler->work[0],
                    code_point + 1u
                )
        )) {
        return 0u;
    }
    if (!close_set(
            compiler,
            compiler->work[0].values,
            compiler->work[0].count,
            &compiler->work[1]
        )) {
        return 0u;
    }
    return intern_consuming_set(compiler, &compiler->work[1]);
}

static uint32_t dot_set(OseoRegExpCompiler *compiler) {
    compiler->work[0].count = 0u;
    if (compiler->dot_all) {
        if (!compiler_allocate(
                compiler,
                buffer_push(compiler->context, &compiler->work[0], 0u) &&
                    buffer_push(
                        compiler->context,
                        &compiler->work[0],
                        OSEO_REGEXP_CODE_POINT_LIMIT
                    )
            )) {
            return 0u;
        }
    } else if (!compiler_allocate(
                   compiler,
                   set_complement(
                       compiler->context,
                       regexp_line_terminators,
                       OSEO_REGEXP_SET_COUNT(regexp_line_terminators),
                       &compiler->work[0]
                   )
               )) {
        return 0u;
    }
    if (!close_set(
            compiler,
            compiler->work[0].values,
            compiler->work[0].count,
            &compiler->work[1]
        )) {
        return 0u;
    }
    return intern_consuming_set(compiler, &compiler->work[1]);
}

static uint32_t class_escape_atom_set(
    OseoRegExpCompiler *compiler,
    OseoRegExpClassEscape kind,
    bool negated
) {
    if (!class_escape_set(compiler, kind, &compiler->work[0])) return 0u;
    if (negated) {
        if (!compiler_allocate(
                compiler,
                set_complement(
                    compiler->context,
                    compiler->work[0].values,
                    compiler->work[0].count,
                    &compiler->work[1]
                )
            )) {
            return 0u;
        }
        buffer_swap(&compiler->work[0], &compiler->work[1]);
    }
    if (!close_set(
            compiler,
            compiler->work[0].values,
            compiler->work[0].count,
            &compiler->work[1]
        )) {
        return 0u;
    }
    return intern_consuming_set(compiler, &compiler->work[1]);
}

static uint32_t word_boundary_set(OseoRegExpCompiler *compiler) {
    if (compiler->word_set_ready) return (uint32_t)compiler->word_set;
    if (!class_escape_set(
            compiler,
            OSEO_REGEXP_CLASS_WORD,
            &compiler->work[0]
        )) {
        return 0u;
    }
    compiler->word_set = intern_set(
        compiler,
        compiler->work[0].values,
        compiler->work[0].count
    );
    compiler->word_set_ready = compiler_ok(compiler);
    return (uint32_t)compiler->word_set;
}

static void parse_disjunction(OseoRegExpCompiler *compiler, bool backward);

static void parse_group(OseoRegExpCompiler *compiler, bool backward) {
    compiler->index += 1u;
    bool capturing = true;
    if (unit_at(compiler, compiler->index) == '?') {
        uint16_t kind = unit_at(compiler, compiler->index + 1u);
        if (kind == ':') {
            compiler->index += 2u;
            capturing = false;
        } else if (kind == '<') {
            compiler->index += 2u;
            while (!at_end(compiler) &&
                   unit_at(compiler, compiler->index) != '>') {
                compiler->index += 1u;
            }
            compiler->index += 1u;
        } else {
            compiler_fail(compiler, OSEO_REGEXP_UNSUPPORTED);
            return;
        }
    }
    size_t capture = 0u;
    if (capturing) {
        capture = compiler->next_capture;
        compiler->next_capture += 1u;
        if (capture > compiler->capture_count) {
            compiler_fail(compiler, OSEO_REGEXP_INVALID);
            return;
        }
        emit(
            compiler,
            OSEO_REGEXP_OP_SAVE,
            0u,
            (uint32_t)(backward ? 2u * capture + 1u : 2u * capture),
            0u,
            0u,
            0u
        );
    }
    parse_disjunction(compiler, backward);
    if (!compiler_ok(compiler)) return;
    if (unit_at(compiler, compiler->index) != ')') {
        compiler_fail(compiler, OSEO_REGEXP_INVALID);
        return;
    }
    compiler->index += 1u;
    if (capturing) {
        emit(
            compiler,
            OSEO_REGEXP_OP_SAVE,
            0u,
            (uint32_t)(backward ? 2u * capture : 2u * capture + 1u),
            0u,
            0u,
            0u
        );
    }
}

static void parse_atom(OseoRegExpCompiler *compiler, bool backward) {
    uint8_t direction = backward
        ? OSEO_REGEXP_INSTRUCTION_BACKWARD
        : (uint8_t)0u;
    uint16_t unit = unit_at(compiler, compiler->index);
    if (unit == '(') {
        parse_group(compiler, backward);
        return;
    }
    uint32_t set = 0u;
    if (unit == '.') {
        compiler->index += 1u;
        set = dot_set(compiler);
    } else if (unit == '[') {
        set = parse_character_class(compiler);
    } else if (unit == '\\') {
        OseoRegExpEscapeResult escape;
        if (!parse_escape(compiler, false, &escape)) return;
        if (escape.kind == OSEO_REGEXP_ESCAPE_BACKREFERENCE) {
            uint8_t modifiers = direction;
            if (compiler->ignore_case) {
                modifiers = (uint8_t)(
                    modifiers | OSEO_REGEXP_INSTRUCTION_IGNORE_CASE
                );
                compiler->has_ignore_case_backreference = true;
            }
            emit(
                compiler,
                OSEO_REGEXP_OP_BACKREFERENCE,
                modifiers,
                (uint32_t)(2u * escape.capture),
                0u,
                0u,
                0u
            );
            return;
        }
        if (escape.kind == OSEO_REGEXP_ESCAPE_CLASS) {
            set = class_escape_atom_set(
                compiler,
                escape.class_escape,
                escape.negated
            );
        } else if (escape.kind == OSEO_REGEXP_ESCAPE_CHARACTER) {
            set = single_character_set(compiler, escape.code_point);
        } else {
            compiler_fail(compiler, OSEO_REGEXP_INVALID);
            return;
        }
    } else {
        set = single_character_set(compiler, read_code_point(compiler));
    }
    if (!compiler_ok(compiler)) return;
    emit(compiler, OSEO_REGEXP_OP_CONSUME, direction, set, 0u, 0u, 0u);
}

static void parse_lookaround(
    OseoRegExpCompiler *compiler,
    bool behind,
    bool negated
) {
    compiler->index += behind ? 4u : 3u;
    size_t frame = allocate_registers(compiler, 1u);
    size_t body = new_label(compiler);
    size_t exit_label = new_label(compiler);
    if (!compiler_ok(compiler)) return;
    emit(
        compiler,
        OSEO_REGEXP_OP_LOOK_START,
        negated ? OSEO_REGEXP_INSTRUCTION_NEGATED : (uint8_t)0u,
        (uint32_t)frame,
        (uint32_t)body,
        (uint32_t)(negated ? exit_label : compiler->fail_label),
        0u
    );
    place_label(compiler, body);
    parse_disjunction(compiler, behind);
    if (!compiler_ok(compiler)) return;
    if (unit_at(compiler, compiler->index) != ')') {
        compiler_fail(compiler, OSEO_REGEXP_INVALID);
        return;
    }
    compiler->index += 1u;
    emit(
        compiler,
        OSEO_REGEXP_OP_LOOK_END,
        negated ? OSEO_REGEXP_INSTRUCTION_NEGATED : (uint8_t)0u,
        (uint32_t)frame,
        (uint32_t)exit_label,
        0u,
        0u
    );
    place_label(compiler, exit_label);
}

/*
 * Read the quantifier that follows an atom, if any.
 *
 * A validated pattern only reaches `{` where a braced quantifier is
 * well formed, so the decimal bounds below need no separate rejection.
 */
static bool parse_quantifier(
    OseoRegExpCompiler *compiler,
    uint64_t *minimum,
    uint64_t *maximum,
    bool *greedy
) {
    uint16_t unit = unit_at(compiler, compiler->index);
    if (at_end(compiler)) return false;
    if (unit == '*') {
        *minimum = 0u;
        *maximum = UINT64_MAX;
    } else if (unit == '+') {
        *minimum = 1u;
        *maximum = UINT64_MAX;
    } else if (unit == '?') {
        *minimum = 0u;
        *maximum = 1u;
    } else if (unit == '{') {
        size_t cursor = compiler->index + 1u;
        uint64_t low = 0u;
        while (cursor < compiler->source->length &&
               ascii_digit(compiler->source->units[cursor])) {
            low = low * 10u +
                (uint64_t)(compiler->source->units[cursor] - '0');
            cursor += 1u;
        }
        uint64_t high = low;
        if (cursor < compiler->source->length &&
            compiler->source->units[cursor] == ',') {
            cursor += 1u;
            if (cursor < compiler->source->length &&
                compiler->source->units[cursor] == '}') {
                high = UINT64_MAX;
            } else {
                high = 0u;
                while (cursor < compiler->source->length &&
                       ascii_digit(compiler->source->units[cursor])) {
                    high = high * 10u +
                        (uint64_t)(compiler->source->units[cursor] - '0');
                    cursor += 1u;
                }
            }
        }
        if (cursor >= compiler->source->length ||
            compiler->source->units[cursor] != '}') {
            return false;
        }
        *minimum = low;
        *maximum = high;
        compiler->index = cursor;
    } else {
        return false;
    }
    compiler->index += 1u;
    *greedy = true;
    if (!at_end(compiler) && unit_at(compiler, compiler->index) == '?') {
        *greedy = false;
        compiler->index += 1u;
    }
    return true;
}

static void build_quantified(
    OseoRegExpCompiler *compiler,
    size_t atom_start,
    size_t capture_before,
    size_t capture_after,
    uint64_t minimum,
    uint64_t maximum,
    bool greedy
) {
    size_t counter = allocate_registers(compiler, 2u);
    size_t position = counter + 1u;
    uint32_t clear_from = 0u;
    uint32_t clear_to = 0u;
    if (capture_after > capture_before) {
        clear_from = (uint32_t)(2u * capture_before);
        clear_to = (uint32_t)(2u * (capture_after - 1u) + 2u);
    }
    size_t repeat = allocate_repeat(
        compiler,
        minimum,
        maximum,
        clear_from,
        clear_to
    );
    if (!compiler_ok(compiler)) return;
    if (!emit_insert(compiler, atom_start, 3u)) return;
    size_t head = new_label(compiler);
    size_t enter = new_label(compiler);
    size_t body = new_label(compiler);
    size_t exit_label = new_label(compiler);
    if (!compiler_ok(compiler)) return;
    place_label_at(compiler, head, atom_start + 1u);
    place_label_at(compiler, enter, atom_start + 2u);
    place_label_at(compiler, body, atom_start + 3u);
    OseoRegExpInstruction *prologue = &compiler->instructions[atom_start];
    prologue[0].opcode = OSEO_REGEXP_OP_REPEAT_INIT;
    prologue[0].modifiers = 0u;
    prologue[0].operands[0] = (uint32_t)counter;
    prologue[1].opcode = OSEO_REGEXP_OP_REPEAT;
    prologue[1].modifiers = greedy
        ? OSEO_REGEXP_INSTRUCTION_GREEDY
        : (uint8_t)0u;
    prologue[1].operands[0] = (uint32_t)counter;
    prologue[1].operands[1] = (uint32_t)enter;
    prologue[1].operands[2] = (uint32_t)exit_label;
    prologue[1].operands[3] = (uint32_t)repeat;
    prologue[2].opcode = OSEO_REGEXP_OP_REPEAT_ENTER;
    prologue[2].modifiers = 0u;
    prologue[2].operands[0] = (uint32_t)counter;
    prologue[2].operands[1] = (uint32_t)position;
    prologue[2].operands[2] = (uint32_t)body;
    prologue[2].operands[3] = (uint32_t)repeat;
    emit(
        compiler,
        OSEO_REGEXP_OP_REPEAT_END,
        0u,
        (uint32_t)counter,
        (uint32_t)head,
        (uint32_t)position,
        (uint32_t)repeat
    );
    place_label(compiler, exit_label);
}

static void parse_term(OseoRegExpCompiler *compiler, bool backward) {
    uint16_t unit = unit_at(compiler, compiler->index);
    if (unit == '^' || unit == '$') {
        compiler->index += 1u;
        uint8_t modifiers = unit == '$'
            ? OSEO_REGEXP_INSTRUCTION_END_EDGE
            : (uint8_t)0u;
        if (compiler->multiline) {
            modifiers = (uint8_t)(
                modifiers | OSEO_REGEXP_INSTRUCTION_MULTILINE
            );
        }
        emit(compiler, OSEO_REGEXP_OP_EDGE, modifiers, 0u, 0u, 0u, 0u);
        return;
    }
    if (unit == '\\') {
        uint16_t next = unit_at(compiler, compiler->index + 1u);
        if (next == 'b' || next == 'B') {
            compiler->index += 2u;
            uint32_t set = word_boundary_set(compiler);
            if (!compiler_ok(compiler)) return;
            emit(
                compiler,
                OSEO_REGEXP_OP_BOUNDARY,
                next == 'B' ? OSEO_REGEXP_INSTRUCTION_NEGATED : (uint8_t)0u,
                set,
                0u,
                0u,
                0u
            );
            return;
        }
    }
    if (unit == '(' && unit_at(compiler, compiler->index + 1u) == '?') {
        uint16_t kind = unit_at(compiler, compiler->index + 2u);
        if (kind == '=' || kind == '!') {
            parse_lookaround(compiler, false, kind == '!');
            return;
        }
        if (kind == '<') {
            uint16_t behind = unit_at(compiler, compiler->index + 3u);
            if (behind == '=' || behind == '!') {
                parse_lookaround(compiler, true, behind == '!');
                return;
            }
        }
    }
    size_t atom_start = compiler->instruction_count;
    size_t capture_before = compiler->next_capture;
    parse_atom(compiler, backward);
    if (!compiler_ok(compiler)) return;
    uint64_t minimum = 0u;
    uint64_t maximum = 0u;
    bool greedy = true;
    if (!parse_quantifier(compiler, &minimum, &maximum, &greedy)) return;
    build_quantified(
        compiler,
        atom_start,
        capture_before,
        compiler->next_capture,
        minimum,
        maximum,
        greedy
    );
}

/*
 * Lay one backward alternative's terms out in reverse.
 *
 * A lookbehind body evaluates its rightmost term first, so the emitted
 * blocks are permuted once the alternative is complete. Every label
 * placed inside a block moves with it, and a label at a block boundary
 * belongs to the block that ends there, which is the position execution
 * continues from once that block has run.
 */
static bool reverse_alternative(OseoRegExpCompiler *compiler, size_t base) {
    size_t block_count = compiler->blocks.count - base;
    if (block_count < 2u) return true;
    size_t alt_start = compiler->blocks.values[base];
    size_t alt_end = compiler->instruction_count;
    size_t span = alt_end - alt_start;
    if (span == 0u) return true;
    OseoRegExpInstruction *scratch = oseo_internal_allocate_work_bytes(
        compiler->context,
        span * sizeof(OseoRegExpInstruction)
    );
    if (scratch == NULL) return false;
    uint32_t *new_starts = oseo_internal_allocate_work_bytes(
        compiler->context,
        block_count * sizeof(uint32_t)
    );
    if (new_starts == NULL) {
        free(scratch);
        return false;
    }
    size_t cursor = alt_start;
    for (size_t offset = block_count; offset > 0u; offset -= 1u) {
        size_t block = offset - 1u;
        size_t start = compiler->blocks.values[base + block];
        size_t end = block + 1u < block_count
            ? compiler->blocks.values[base + block + 1u]
            : alt_end;
        new_starts[block] = (uint32_t)cursor;
        if (end > start) {
            memcpy(
                &scratch[cursor - alt_start],
                &compiler->instructions[start],
                (end - start) * sizeof(OseoRegExpInstruction)
            );
        }
        cursor += end - start;
    }
    memcpy(
        &compiler->instructions[alt_start],
        scratch,
        span * sizeof(OseoRegExpInstruction)
    );
    free(scratch);
    for (size_t label = 0u; label < compiler->label_count; label += 1u) {
        uint32_t address = compiler->addresses[label];
        /*
         * A label at the alternative's own start names its entry rather
         * than the first term, which the reversal leaves where it is:
         * no label is ever placed at the start of a term block.
         */
        if (address == UINT32_MAX || address <= alt_start ||
            address > alt_end) {
            continue;
        }
        size_t low = 0u;
        size_t high = block_count;
        while (low < high) {
            size_t middle = low + (high - low) / 2u;
            if (compiler->blocks.values[base + middle] < address) {
                low = middle + 1u;
            } else {
                high = middle;
            }
        }
        size_t block = low - 1u;
        uint32_t start = compiler->blocks.values[base + block];
        compiler->addresses[label] = new_starts[block] + (address - start);
    }
    free(new_starts);
    return true;
}

static void parse_alternative(OseoRegExpCompiler *compiler, bool backward) {
    size_t base = compiler->blocks.count;
    while (compiler_ok(compiler) && !at_end(compiler)) {
        uint16_t unit = unit_at(compiler, compiler->index);
        if (unit == '|' || unit == ')') break;
        if (!compiler_allocate(
                compiler,
                buffer_push(
                    compiler->context,
                    &compiler->blocks,
                    (uint32_t)compiler->instruction_count
                )
            )) {
            break;
        }
        parse_term(compiler, backward);
    }
    if (compiler_ok(compiler) && backward &&
        !reverse_alternative(compiler, base)) {
        compiler_fail(compiler, OSEO_REGEXP_ALLOCATION_FAILURE);
    }
    compiler->blocks.count = base;
}

/*
 * Emit one disjunction.
 *
 * The label that names an alternative's entry is placed only once that
 * alternative's own prologue exists, because the fork an alternation
 * needs is itself written into a gap at that address. Placing it earlier
 * would leave it in front of the fork it is supposed to reach.
 */
static void parse_disjunction(OseoRegExpCompiler *compiler, bool backward) {
    size_t end_label = new_label(compiler);
    if (!compiler_ok(compiler)) return;
    size_t pending = SIZE_MAX;
    for (;;) {
        size_t alternative_start = compiler->instruction_count;
        parse_alternative(compiler, backward);
        if (!compiler_ok(compiler)) return;
        bool more = !at_end(compiler) &&
            unit_at(compiler, compiler->index) == '|';
        if (more) {
            if (!emit_insert(compiler, alternative_start, 1u)) return;
            size_t preferred = new_label(compiler);
            size_t next = new_label(compiler);
            if (!compiler_ok(compiler)) return;
            place_label_at(compiler, preferred, alternative_start + 1u);
            OseoRegExpInstruction *fork =
                &compiler->instructions[alternative_start];
            fork->opcode = OSEO_REGEXP_OP_FORK;
            fork->modifiers = 0u;
            fork->operands[0] = (uint32_t)preferred;
            fork->operands[1] = (uint32_t)next;
            emit(
                compiler,
                OSEO_REGEXP_OP_JUMP,
                0u,
                (uint32_t)end_label,
                0u,
                0u,
                0u
            );
            if (!compiler_ok(compiler)) return;
            compiler->index += 1u;
            if (pending != SIZE_MAX) {
                place_label_at(compiler, pending, alternative_start);
            }
            pending = next;
            continue;
        }
        if (pending != SIZE_MAX) {
            place_label_at(compiler, pending, alternative_start);
        }
        break;
    }
    place_label(compiler, end_label);
}

/* Rewrite every label reference into the address it was placed at. */
static bool resolve_targets(OseoRegExpCompiler *compiler) {
    for (size_t index = 0u; index < compiler->instruction_count; index += 1u) {
        OseoRegExpInstruction *instruction = &compiler->instructions[index];
        size_t first = SIZE_MAX;
        size_t second = SIZE_MAX;
        switch (instruction->opcode) {
            case OSEO_REGEXP_OP_FORK:
                first = 0u;
                second = 1u;
                break;
            case OSEO_REGEXP_OP_JUMP:
                first = 0u;
                break;
            case OSEO_REGEXP_OP_REPEAT:
                first = 1u;
                second = 2u;
                break;
            case OSEO_REGEXP_OP_REPEAT_ENTER:
                first = 2u;
                break;
            case OSEO_REGEXP_OP_REPEAT_END:
                first = 1u;
                break;
            case OSEO_REGEXP_OP_LOOK_START:
                first = 1u;
                second = 2u;
                break;
            case OSEO_REGEXP_OP_LOOK_END:
                first = 1u;
                break;
            default:
                continue;
        }
        const size_t operands[2] = {first, second};
        for (size_t slot = 0u; slot < 2u; slot += 1u) {
            if (operands[slot] == SIZE_MAX) continue;
            uint32_t label = instruction->operands[operands[slot]];
            if (label >= compiler->label_count) return false;
            uint32_t address = compiler->addresses[label];
            if (address == UINT32_MAX) return false;
            instruction->operands[operands[slot]] = address;
        }
    }
    return true;
}

void oseo_internal_regexp_program_release(OseoRegExpProgram *program) {
    if (program == NULL) return;
    free(program->instructions);
    free(program->set_boundaries);
    free(program->set_offsets);
    free(program->repeats);
    free(program->name_units);
    free(program->captures);
    free(program);
}

static void compiler_release(OseoRegExpCompiler *compiler) {
    free(compiler->instructions);
    free(compiler->addresses);
    free(compiler->set_offsets);
    free(compiler->set_hashes);
    free(compiler->repeats);
    free(compiler->names.values);
    free(compiler->captures);
    buffer_release(&compiler->set_boundaries);
    buffer_release(&compiler->unknown_region);
    for (size_t index = 0u; index < 5u; index += 1u) {
        buffer_release(&compiler->work[index]);
    }
    buffer_release(&compiler->close_additions);
    buffer_release(&compiler->close_ranges);
    buffer_release(&compiler->class_ranges);
    buffer_release(&compiler->blocks);
}

OseoRegExpProgram *oseo_internal_regexp_program_build(
    OseoContext *context,
    const OseoString *source,
    uint16_t flag_mask,
    size_t capture_count,
    OseoRegExpValidation *status
) {
    OseoRegExpCompiler compiler;
    memset(&compiler, 0, sizeof(compiler));
    compiler.context = context;
    compiler.source = source;
    compiler.flag_mask = flag_mask;
    compiler.unicode = (flag_mask &
        (OSEO_REGEXP_FLAG_U | OSEO_REGEXP_FLAG_V)) != 0u;
    compiler.ignore_case = (flag_mask & OSEO_REGEXP_FLAG_I) != 0u;
    compiler.multiline = (flag_mask & OSEO_REGEXP_FLAG_M) != 0u;
    compiler.dot_all = (flag_mask & OSEO_REGEXP_FLAG_S) != 0u;
    compiler.capture_count = capture_count;
    compiler.next_capture = 1u;
    compiler.status = OSEO_REGEXP_VALID;
    buffer_initialize(&compiler.set_boundaries);
    buffer_initialize(&compiler.unknown_region);
    for (size_t index = 0u; index < 5u; index += 1u) {
        buffer_initialize(&compiler.work[index]);
    }
    buffer_initialize(&compiler.close_additions);
    buffer_initialize(&compiler.close_ranges);
    buffer_initialize(&compiler.class_ranges);
    buffer_initialize(&compiler.blocks);
    if (capture_count > 0u) {
        if (capture_count > SIZE_MAX / sizeof(OseoRegExpCapture)) {
            compiler_release(&compiler);
            *status = OSEO_REGEXP_LIMIT;
            return NULL;
        }
        compiler.captures = oseo_internal_allocate_work_bytes(
            context,
            capture_count * sizeof(OseoRegExpCapture)
        );
        if (compiler.captures != NULL) {
            memset(
                compiler.captures,
                0,
                capture_count * sizeof(OseoRegExpCapture)
            );
        }
        if (compiler.captures == NULL) {
            compiler_release(&compiler);
            *status = OSEO_REGEXP_ALLOCATION_FAILURE;
            return NULL;
        }
    }
    if (!collect_captures(&compiler)) {
        compiler_release(&compiler);
        *status = OSEO_REGEXP_ALLOCATION_FAILURE;
        return NULL;
    }
    if (compiler.ignore_case && !build_unknown_region(&compiler)) {
        compiler_release(&compiler);
        *status = OSEO_REGEXP_ALLOCATION_FAILURE;
        return NULL;
    }
    compiler.registers = 2u * (capture_count + 1u);
    if (compiler.registers > OSEO_REGEXP_REGISTER_LIMIT) {
        compiler_release(&compiler);
        *status = OSEO_REGEXP_LIMIT;
        return NULL;
    }
    compiler.fail_label = new_label(&compiler);
    emit(&compiler, OSEO_REGEXP_OP_SAVE, 0u, 0u, 0u, 0u, 0u);
    parse_disjunction(&compiler, false);
    if (compiler_ok(&compiler) && !at_end(&compiler)) {
        compiler_fail(&compiler, OSEO_REGEXP_INVALID);
    }
    emit(&compiler, OSEO_REGEXP_OP_SAVE, 0u, 1u, 0u, 0u, 0u);
    emit(&compiler, OSEO_REGEXP_OP_ACCEPT, 0u, 0u, 0u, 0u, 0u);
    place_label(&compiler, compiler.fail_label);
    emit(&compiler, OSEO_REGEXP_OP_FAIL, 0u, 0u, 0u, 0u, 0u);
    /*
     * Only a backreference compares two input characters at run time.
     * Every other ignore-case decision was folded into a set while the
     * program was built, so this is the one place that needs case data
     * for a character the pattern never names, and a program whose sets
     * can reach a class this component has no data for keeps the
     * boundary rather than answering from an incomplete table.
     */
    if (compiler_ok(&compiler) && compiler.has_ignore_case_backreference &&
        compiler.sets_reach_unknown_case) {
        compiler_fail(&compiler, OSEO_REGEXP_UNSUPPORTED);
    }
    if (compiler_ok(&compiler) && !resolve_targets(&compiler)) {
        compiler_fail(&compiler, OSEO_REGEXP_INVALID);
    }
    if (!compiler_ok(&compiler)) {
        OseoRegExpValidation failure = compiler.status;
        compiler_release(&compiler);
        *status = failure;
        return NULL;
    }
    OseoRegExpProgram *program = oseo_internal_allocate_work_bytes(
        context,
        sizeof(OseoRegExpProgram)
    );
    if (program != NULL) memset(program, 0, sizeof(OseoRegExpProgram));
    if (program == NULL) {
        compiler_release(&compiler);
        *status = OSEO_REGEXP_ALLOCATION_FAILURE;
        return NULL;
    }
    program->instructions = compiler.instructions;
    program->instruction_count = compiler.instruction_count;
    program->set_boundaries = compiler.set_boundaries.values;
    program->set_offsets = compiler.set_offsets;
    program->set_count = compiler.set_count;
    program->repeats = compiler.repeats;
    program->repeat_count = compiler.repeat_count;
    program->name_units = compiler.names.values;
    program->name_unit_count = compiler.names.count;
    program->captures = compiler.captures;
    program->capture_count = capture_count;
    program->registers = compiler.registers;
    program->unicode_mode = compiler.unicode;
    program->ignore_case = compiler.ignore_case;
    program->has_group_names = false;
    for (size_t index = 0u; index < capture_count; index += 1u) {
        if (compiler.captures[index].named) program->has_group_names = true;
    }
    compiler.instructions = NULL;
    compiler.set_boundaries.values = NULL;
    compiler.set_boundaries.count = 0u;
    compiler.set_boundaries.capacity = 0u;
    compiler.set_offsets = NULL;
    compiler.repeats = NULL;
    compiler.names.values = NULL;
    compiler.captures = NULL;
    compiler_release(&compiler);
    *status = OSEO_REGEXP_VALID;
    return program;
}

/*
 * The mutable state of one attempt.
 *
 * Every register write is recorded on a trail, so one backtrack entry
 * restores the whole state by truncating the trail to a recorded height
 * rather than by copying the registers.
 */
typedef struct {
    OseoContext *context;
    const OseoRegExpProgram *program;
    const OseoString *subject;
    int64_t *registers;
    uint32_t *stack_program;
    int64_t *stack_index;
    uint32_t *stack_trail;
    size_t stack_count;
    size_t stack_capacity;
    uint32_t *trail_register;
    int64_t *trail_value;
    size_t trail_count;
    size_t trail_capacity;
    int64_t index;
    uint64_t steps;
    uint64_t step_limit;
    OseoRegExpExecution outcome;
} OseoRegExpMachine;

static bool program_set_has(
    const OseoRegExpProgram *program,
    uint32_t set,
    uint32_t code_point
) {
    uint32_t start = program->set_offsets[set];
    uint32_t end = program->set_offsets[set + 1u];
    return set_has(
        &program->set_boundaries[start],
        (size_t)(end - start),
        code_point
    );
}

/*
 * One character of the input read forward from `index`.
 *
 * A pattern with `u` or `v` matches a list of code points and every
 * other pattern matches a list of UTF-16 code units, which is the only
 * place the flag set changes what one position advances by. A lone
 * surrogate is one character in both readings.
 */
static uint32_t character_at(
    const OseoString *subject,
    size_t index,
    bool unicode_mode
) {
    uint16_t unit = subject->units[index];
    if (!unicode_mode || unit < 0xd800u || unit > 0xdbffu) return unit;
    if (index + 1u >= subject->length) return unit;
    uint16_t trail = subject->units[index + 1u];
    if (trail < 0xdc00u || trail > 0xdfffu) return unit;
    return 0x10000u + (((uint32_t)unit - 0xd800u) << 10u) +
        ((uint32_t)trail - 0xdc00u);
}

static size_t width_at(
    const OseoString *subject,
    size_t index,
    bool unicode_mode
) {
    if (index >= subject->length) return 1u;
    return character_at(subject, index, unicode_mode) > 0xffffu ? 2u : 1u;
}

static size_t width_before(
    const OseoString *subject,
    size_t index,
    bool unicode_mode
) {
    if (!unicode_mode || index < 2u) return 1u;
    uint16_t trail = subject->units[index - 1u];
    uint16_t lead = subject->units[index - 2u];
    bool paired = trail >= 0xdc00u && trail <= 0xdfffu &&
        lead >= 0xd800u && lead <= 0xdbffu;
    return paired ? 2u : 1u;
}

/* The character ending at `index`, or -1 at the start of the input. */
static int64_t character_before(
    const OseoString *subject,
    size_t index,
    bool unicode_mode
) {
    if (index == 0u) return -1;
    size_t width = width_before(subject, index, unicode_mode);
    return (int64_t)character_at(subject, index - width, unicode_mode);
}

/*
 * The position one attempt actually starts at.
 *
 * Under `u` or `v` both code units of a surrogate pair belong to the one
 * character they encode, so a start index that splits a pair names that
 * character rather than its trailing code unit.
 */
static size_t aligned_start(
    const OseoString *subject,
    size_t index,
    bool unicode_mode
) {
    if (!unicode_mode || index == 0u || index >= subject->length) {
        return index;
    }
    uint16_t trail = subject->units[index];
    uint16_t lead = subject->units[index - 1u];
    bool paired = trail >= 0xdc00u && trail <= 0xdfffu &&
        lead >= 0xd800u && lead <= 0xdbffu;
    return paired ? index - 1u : index;
}

static bool is_line_terminator(int64_t character) {
    return character == 0x0a || character == 0x0d || character == 0x2028 ||
        character == 0x2029;
}

/*
 * The canonical form of one input character under `i`.
 *
 * The program build refuses a pattern whose sets can reach a character
 * whose equivalence class is unknown, so every character a capture can
 * hold is covered exactly here, and a character outside these classes is
 * its own canonical form for every comparison this rule can decide.
 */
static uint32_t canonicalize(
    const OseoRegExpProgram *program,
    uint32_t character
) {
    if (character >= 0x61u && character <= 0x7au) return character - 32u;
    if (program->unicode_mode) {
        if (character == 0x17fu) return 0x53u;
        if (character == 0x212au) return 0x4bu;
    }
    return character;
}

static bool machine_write(
    OseoRegExpMachine *machine,
    uint32_t reg,
    int64_t value
) {
    if (machine->trail_count >= OSEO_REGEXP_TRAIL_LIMIT) {
        machine->outcome = OSEO_REGEXP_EXECUTION_LIMIT;
        return false;
    }
    if (machine->trail_count == machine->trail_capacity) {
        size_t capacity = machine->trail_capacity == 0u
            ? 64u
            : machine->trail_capacity * 2u;
        uint32_t *registers = oseo_internal_reallocate_work_bytes(
            machine->context,
            machine->trail_register,
            capacity * sizeof(uint32_t)
        );
        if (registers == NULL) {
            machine->outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
            return false;
        }
        machine->trail_register = registers;
        int64_t *values = oseo_internal_reallocate_work_bytes(
            machine->context,
            machine->trail_value,
            capacity * sizeof(int64_t)
        );
        if (values == NULL) {
            machine->outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
            return false;
        }
        machine->trail_value = values;
        machine->trail_capacity = capacity;
    }
    machine->trail_register[machine->trail_count] = reg;
    machine->trail_value[machine->trail_count] = machine->registers[reg];
    machine->trail_count += 1u;
    machine->registers[reg] = value;
    return true;
}

static void machine_undo(OseoRegExpMachine *machine, size_t height) {
    while (machine->trail_count > height) {
        machine->trail_count -= 1u;
        machine->registers[machine->trail_register[machine->trail_count]] =
            machine->trail_value[machine->trail_count];
    }
}

static bool machine_push(OseoRegExpMachine *machine, uint32_t address) {
    if (machine->stack_count >= OSEO_REGEXP_BACKTRACK_LIMIT) {
        machine->outcome = OSEO_REGEXP_EXECUTION_LIMIT;
        return false;
    }
    if (machine->stack_count == machine->stack_capacity) {
        size_t capacity = machine->stack_capacity == 0u
            ? 64u
            : machine->stack_capacity * 2u;
        uint32_t *addresses = oseo_internal_reallocate_work_bytes(
            machine->context,
            machine->stack_program,
            capacity * sizeof(uint32_t)
        );
        if (addresses == NULL) {
            machine->outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
            return false;
        }
        machine->stack_program = addresses;
        int64_t *indexes = oseo_internal_reallocate_work_bytes(
            machine->context,
            machine->stack_index,
            capacity * sizeof(int64_t)
        );
        if (indexes == NULL) {
            machine->outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
            return false;
        }
        machine->stack_index = indexes;
        uint32_t *trails = oseo_internal_reallocate_work_bytes(
            machine->context,
            machine->stack_trail,
            capacity * sizeof(uint32_t)
        );
        if (trails == NULL) {
            machine->outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
            return false;
        }
        machine->stack_trail = trails;
        machine->stack_capacity = capacity;
    }
    machine->stack_program[machine->stack_count] = address;
    machine->stack_index[machine->stack_count] = machine->index;
    machine->stack_trail[machine->stack_count] =
        (uint32_t)machine->trail_count;
    machine->stack_count += 1u;
    return true;
}

/* The address one backtrack entry resumes at, or -1 when none is left. */
static int64_t machine_pop(OseoRegExpMachine *machine) {
    if (machine->stack_count == 0u) return -1;
    machine->stack_count -= 1u;
    machine->index = machine->stack_index[machine->stack_count];
    machine_undo(machine, machine->stack_trail[machine->stack_count]);
    return (int64_t)machine->stack_program[machine->stack_count];
}

/* Match one backreference, or report that the path fails. */
static bool match_backreference(
    OseoRegExpMachine *machine,
    uint32_t slot,
    bool backward,
    bool ignore_case
) {
    int64_t start = machine->registers[slot];
    int64_t end = machine->registers[slot + 1u];
    if (start == OSEO_REGEXP_UNSET || end == OSEO_REGEXP_UNSET) return true;
    int64_t length = end - start;
    int64_t target = backward ? machine->index - length : machine->index;
    if (target < 0 || target + length > (int64_t)machine->subject->length) {
        return false;
    }
    bool unicode_mode = machine->program->unicode_mode;
    int64_t source = start;
    int64_t compared = target;
    while (source < end) {
        size_t width = width_at(machine->subject, (size_t)source,
                                unicode_mode);
        uint32_t left = character_at(
            machine->subject,
            (size_t)source,
            unicode_mode
        );
        uint32_t right = character_at(
            machine->subject,
            (size_t)compared,
            unicode_mode
        );
        if (ignore_case) {
            left = canonicalize(machine->program, left);
            right = canonicalize(machine->program, right);
        }
        if (left != right) return false;
        source += (int64_t)width;
        compared += (int64_t)width;
    }
    machine->index = backward ? target : target + length;
    return true;
}

static bool matches_boundary(OseoRegExpMachine *machine, uint32_t set) {
    bool unicode_mode = machine->program->unicode_mode;
    int64_t before = character_before(
        machine->subject,
        (size_t)machine->index,
        unicode_mode
    );
    bool word_before = before >= 0 &&
        program_set_has(machine->program, set, (uint32_t)before);
    bool word_after = (size_t)machine->index < machine->subject->length &&
        program_set_has(
            machine->program,
            set,
            character_at(
                machine->subject,
                (size_t)machine->index,
                unicode_mode
            )
        );
    return word_before != word_after;
}

static bool matches_edge(
    OseoRegExpMachine *machine,
    bool end_edge,
    bool multiline
) {
    bool unicode_mode = machine->program->unicode_mode;
    if (!end_edge) {
        if (machine->index == 0) return true;
        if (!multiline) return false;
        return is_line_terminator(
            character_before(
                machine->subject,
                (size_t)machine->index,
                unicode_mode
            )
        );
    }
    if ((size_t)machine->index == machine->subject->length) return true;
    if (!multiline) return false;
    return is_line_terminator(
        (int64_t)character_at(
            machine->subject,
            (size_t)machine->index,
            unicode_mode
        )
    );
}

/* Run one anchored attempt at one already aligned position. */
static OseoRegExpExecution match_at(
    OseoRegExpMachine *machine,
    size_t start_index
) {
    const OseoRegExpProgram *program = machine->program;
    for (size_t index = 0u; index < program->registers; index += 1u) {
        machine->registers[index] = index < 2u * (program->capture_count + 1u)
            ? OSEO_REGEXP_UNSET
            : 0;
    }
    machine->stack_count = 0u;
    machine->trail_count = 0u;
    machine->index = (int64_t)start_index;
    machine->outcome = OSEO_REGEXP_EXECUTION_UNMATCHED;
    bool unicode_mode = program->unicode_mode;
    size_t address = 0u;
    for (;;) {
        if (machine->steps >= machine->step_limit) {
            return OSEO_REGEXP_EXECUTION_LIMIT;
        }
        machine->steps += 1u;
        if (address >= program->instruction_count) {
            return OSEO_REGEXP_EXECUTION_UNMATCHED;
        }
        const OseoRegExpInstruction *instruction =
            &program->instructions[address];
        bool failed = false;
        switch (instruction->opcode) {
            case OSEO_REGEXP_OP_ACCEPT:
                return OSEO_REGEXP_EXECUTION_MATCHED;
            case OSEO_REGEXP_OP_CONSUME: {
                bool backward = (instruction->modifiers &
                    OSEO_REGEXP_INSTRUCTION_BACKWARD) != 0u;
                size_t width = backward
                    ? width_before(
                          machine->subject,
                          (size_t)machine->index,
                          unicode_mode
                      )
                    : width_at(
                          machine->subject,
                          (size_t)machine->index,
                          unicode_mode
                      );
                int64_t at = backward
                    ? machine->index - (int64_t)width
                    : machine->index;
                int64_t next = backward
                    ? at
                    : machine->index + (int64_t)width;
                if (at < 0 || at >= (int64_t)machine->subject->length ||
                    next < 0 ||
                    next > (int64_t)machine->subject->length ||
                    !program_set_has(
                        program,
                        instruction->operands[0],
                        character_at(
                            machine->subject,
                            (size_t)at,
                            unicode_mode
                        )
                    )) {
                    failed = true;
                } else {
                    machine->index = next;
                    address += 1u;
                }
                break;
            }
            case OSEO_REGEXP_OP_EDGE:
                if (matches_edge(
                        machine,
                        (instruction->modifiers &
                            OSEO_REGEXP_INSTRUCTION_END_EDGE) != 0u,
                        (instruction->modifiers &
                            OSEO_REGEXP_INSTRUCTION_MULTILINE) != 0u
                    )) {
                    address += 1u;
                } else {
                    failed = true;
                }
                break;
            case OSEO_REGEXP_OP_BOUNDARY: {
                bool negated = (instruction->modifiers &
                    OSEO_REGEXP_INSTRUCTION_NEGATED) != 0u;
                if (matches_boundary(machine, instruction->operands[0]) !=
                    negated) {
                    address += 1u;
                } else {
                    failed = true;
                }
                break;
            }
            case OSEO_REGEXP_OP_SAVE:
                if (!machine_write(
                        machine,
                        instruction->operands[0],
                        machine->index
                    )) {
                    return machine->outcome;
                }
                address += 1u;
                break;
            case OSEO_REGEXP_OP_FORK:
                if (!machine_push(machine, instruction->operands[1])) {
                    return machine->outcome;
                }
                address = instruction->operands[0];
                break;
            case OSEO_REGEXP_OP_JUMP:
                address = instruction->operands[0];
                break;
            case OSEO_REGEXP_OP_REPEAT: {
                const OseoRegExpRepeat *repeat =
                    &program->repeats[instruction->operands[3]];
                uint64_t done =
                    (uint64_t)machine->registers[instruction->operands[0]];
                if (done < repeat->minimum) {
                    address = instruction->operands[1];
                } else if (done >= repeat->maximum) {
                    address = instruction->operands[2];
                } else if ((instruction->modifiers &
                            OSEO_REGEXP_INSTRUCTION_GREEDY) != 0u) {
                    if (!machine_push(machine, instruction->operands[2])) {
                        return machine->outcome;
                    }
                    address = instruction->operands[1];
                } else {
                    if (!machine_push(machine, instruction->operands[1])) {
                        return machine->outcome;
                    }
                    address = instruction->operands[2];
                }
                break;
            }
            case OSEO_REGEXP_OP_REPEAT_INIT:
                if (!machine_write(machine, instruction->operands[0], 0)) {
                    return machine->outcome;
                }
                address += 1u;
                break;
            case OSEO_REGEXP_OP_REPEAT_ENTER: {
                const OseoRegExpRepeat *repeat =
                    &program->repeats[instruction->operands[3]];
                int64_t done = machine->registers[instruction->operands[0]];
                if (!machine_write(
                        machine,
                        instruction->operands[0],
                        done + 1
                    )) {
                    return machine->outcome;
                }
                if (!machine_write(
                        machine,
                        instruction->operands[1],
                        machine->index
                    )) {
                    return machine->outcome;
                }
                for (uint32_t slot = repeat->clear_from;
                     slot < repeat->clear_to;
                     slot += 1u) {
                    if (!machine_write(
                            machine,
                            slot,
                            OSEO_REGEXP_UNSET
                        )) {
                        return machine->outcome;
                    }
                }
                address = instruction->operands[2];
                break;
            }
            case OSEO_REGEXP_OP_REPEAT_END: {
                const OseoRegExpRepeat *repeat =
                    &program->repeats[instruction->operands[3]];
                uint64_t done =
                    (uint64_t)machine->registers[instruction->operands[0]] -
                    1u;
                int64_t started =
                    machine->registers[instruction->operands[2]];
                if (done >= repeat->minimum && started == machine->index) {
                    failed = true;
                } else {
                    address = instruction->operands[1];
                }
                break;
            }
            case OSEO_REGEXP_OP_LOOK_START:
                if (!machine_push(machine, instruction->operands[2])) {
                    return machine->outcome;
                }
                if (!machine_write(
                        machine,
                        instruction->operands[0],
                        (int64_t)machine->stack_count - 1
                    )) {
                    return machine->outcome;
                }
                address = instruction->operands[1];
                break;
            case OSEO_REGEXP_OP_LOOK_END: {
                size_t frame =
                    (size_t)machine->registers[instruction->operands[0]];
                if (frame >= machine->stack_count) {
                    failed = true;
                    break;
                }
                int64_t entry_index = machine->stack_index[frame];
                uint32_t entry_trail = machine->stack_trail[frame];
                machine->stack_count = frame;
                machine->index = entry_index;
                if ((instruction->modifiers &
                     OSEO_REGEXP_INSTRUCTION_NEGATED) != 0u) {
                    machine_undo(machine, entry_trail);
                    failed = true;
                } else {
                    address = instruction->operands[1];
                }
                break;
            }
            case OSEO_REGEXP_OP_BACKREFERENCE:
                if (match_backreference(
                        machine,
                        instruction->operands[0],
                        (instruction->modifiers &
                            OSEO_REGEXP_INSTRUCTION_BACKWARD) != 0u,
                        (instruction->modifiers &
                            OSEO_REGEXP_INSTRUCTION_IGNORE_CASE) != 0u
                    )) {
                    address += 1u;
                } else {
                    failed = true;
                }
                break;
            case OSEO_REGEXP_OP_FAIL:
            default:
                failed = true;
                break;
        }
        if (failed) {
            int64_t resumed = machine_pop(machine);
            if (resumed < 0) return OSEO_REGEXP_EXECUTION_UNMATCHED;
            address = (size_t)resumed;
        }
    }
}

OseoRegExpExecution oseo_internal_regexp_program_search(
    OseoContext *context,
    const OseoRegExpProgram *program,
    const OseoString *subject,
    size_t start_index,
    bool sticky,
    int64_t *captures
) {
    size_t total = 2u * (program->capture_count + 1u);
    for (size_t index = 0u; index < total; index += 1u) {
        captures[index] = OSEO_REGEXP_UNSET;
    }
    if (start_index > subject->length) {
        return OSEO_REGEXP_EXECUTION_UNMATCHED;
    }
    OseoRegExpMachine machine;
    memset(&machine, 0, sizeof(machine));
    machine.program = program;
    machine.subject = subject;
    machine.step_limit = OSEO_REGEXP_STEP_LIMIT;
    machine.context = context;
    machine.registers = oseo_internal_allocate_work_bytes(
        context,
        program->registers * sizeof(int64_t)
    );
    OseoRegExpExecution outcome = OSEO_REGEXP_EXECUTION_UNMATCHED;
    if (machine.registers == NULL) {
        outcome = OSEO_REGEXP_EXECUTION_ALLOCATION;
    } else {
        size_t index = aligned_start(
            subject,
            start_index,
            program->unicode_mode
        );
        for (;;) {
            outcome = match_at(&machine, index);
            if (outcome == OSEO_REGEXP_EXECUTION_MATCHED) {
                for (size_t slot = 0u; slot < total; slot += 1u) {
                    captures[slot] = machine.registers[slot];
                }
                break;
            }
            if (outcome != OSEO_REGEXP_EXECUTION_UNMATCHED) break;
            if (sticky || index >= subject->length) break;
            index += width_at(subject, index, program->unicode_mode);
        }
    }
    free(machine.registers);
    free(machine.stack_program);
    free(machine.stack_index);
    free(machine.stack_trail);
    free(machine.trail_register);
    free(machine.trail_value);
    return outcome;
}
