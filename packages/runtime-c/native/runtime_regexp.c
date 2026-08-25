#include "runtime_internal.h"

#include <limits.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

/*
 * The RegExp constructor, initialization state, dynamic matcher artifact,
 * built-in execution, and the prototype methods and accessors. The
 * matcher program and its executor live in runtime_regexp_matcher.c; the
 * well-known symbol methods and the String integration they dispatch to
 * replace the explicit boundary functions below in their own graph nodes.
 */

#define OSEO_REGEXP_PATTERN_LENGTH_LIMIT ((size_t)0x100000u)
#define OSEO_REGEXP_CAPTURE_LIMIT ((size_t)0xffffu)
#define OSEO_REGEXP_NESTING_LIMIT ((size_t)256u)
#define OSEO_REGEXP_MATCHER_INSTRUCTION_LIMIT ((size_t)0x100000u)

typedef struct {
    size_t declaration;
    size_t name_start;
    size_t name_end;
    size_t next;
    size_t path;
} OseoRegExpNamedCapture;

typedef struct {
    size_t parent;
    size_t scope;
    size_t alternative;
    size_t depth;
} OseoRegExpAlternativeNode;

typedef struct {
    void *storage;
    size_t *buckets;
    OseoRegExpNamedCapture *records;
    OseoRegExpAlternativeNode *paths;
    size_t bucket_count;
    size_t count;
    size_t path_count;
    OseoRegExpValidation duplicate_status;
    bool has_unicode_name;
} OseoRegExpNamedCaptureRegistry;

static bool regexp_ascii_alpha(uint16_t unit) {
    return (unit >= 'A' && unit <= 'Z') ||
        (unit >= 'a' && unit <= 'z');
}

static bool regexp_ascii_digit(uint16_t unit) {
    return unit >= '0' && unit <= '9';
}

static bool regexp_hex_digit(uint16_t unit) {
    return regexp_ascii_digit(unit) ||
        (unit >= 'A' && unit <= 'F') ||
        (unit >= 'a' && unit <= 'f');
}

static bool regexp_name_start(uint16_t unit) {
    return regexp_ascii_alpha(unit) || unit == '_' || unit == '$';
}

static bool regexp_name_continue(uint16_t unit) {
    return regexp_name_start(unit) || regexp_ascii_digit(unit);
}

static uint16_t regexp_flag_bit(uint16_t unit) {
    switch (unit) {
        case 'd': return OSEO_REGEXP_FLAG_D;
        case 'g': return OSEO_REGEXP_FLAG_G;
        case 'i': return OSEO_REGEXP_FLAG_I;
        case 'm': return OSEO_REGEXP_FLAG_M;
        case 's': return OSEO_REGEXP_FLAG_S;
        case 'u': return OSEO_REGEXP_FLAG_U;
        case 'v': return OSEO_REGEXP_FLAG_V;
        case 'y': return OSEO_REGEXP_FLAG_Y;
        default: return 0u;
    }
}

static OseoRegExpValidation regexp_validate_flags(
    const OseoString *flags,
    uint16_t *mask
) {
    uint16_t seen = 0u;
    for (size_t index = 0u; index < flags->length; index += 1u) {
        uint16_t bit = regexp_flag_bit(flags->units[index]);
        if (bit == 0u || (seen & bit) != 0u) return OSEO_REGEXP_INVALID;
        seen = (uint16_t)(seen | bit);
    }
    if ((seen & OSEO_REGEXP_FLAG_U) != 0u &&
        (seen & OSEO_REGEXP_FLAG_V) != 0u) {
        return OSEO_REGEXP_INVALID;
    }
    *mask = seen;
    return OSEO_REGEXP_VALID;
}

static bool regexp_group_name(
    const OseoString *source,
    size_t start,
    size_t *end
) {
    if (start >= source->length ||
        !regexp_name_start(source->units[start])) {
        return false;
    }
    size_t index = start + 1u;
    while (index < source->length && source->units[index] != '>') {
        if (!regexp_name_continue(source->units[index])) return false;
        index += 1u;
    }
    if (index >= source->length) return false;
    *end = index;
    return true;
}

static bool regexp_group_name_needs_unicode(
    const OseoString *source,
    size_t start
) {
    bool found = false;
    for (size_t index = start;
         index < source->length && source->units[index] != '>';
         index += 1u) {
        if (source->units[index] > 0x7fu) {
            found = true;
            continue;
        }
        if (source->units[index] == '\\' &&
            index + 1u < source->length &&
            source->units[index + 1u] == 'u') {
            if (index + 2u < source->length &&
                source->units[index + 2u] == '{') {
                size_t hc = index + 3u;
                bool has_hex = false;
                uint32_t cp = 0u;
                while (hc < source->length &&
                       source->units[hc] != '}') {
                    uint16_t ch = source->units[hc];
                    if (!regexp_hex_digit(ch)) {
                        return false;
                    }
                    uint32_t dv = ch <= '9'
                        ? (uint32_t)(ch - '0')
                        : ch <= 'F'
                          ? (uint32_t)(ch - 'A' + 10u)
                          : (uint32_t)(ch - 'a' + 10u);
                    if (cp >
                        (UINT32_C(0x10ffff) - dv) /
                            UINT32_C(16)) {
                        return false;
                    }
                    cp = cp * UINT32_C(16) + dv;
                    has_hex = true;
                    hc += 1u;
                }
                if (!has_hex || hc >= source->length) {
                    return false;
                }
                index = hc;
                found = true;
                continue;
            }
            if (index + 5u < source->length &&
                regexp_hex_digit(source->units[index + 2u]) &&
                regexp_hex_digit(source->units[index + 3u]) &&
                regexp_hex_digit(source->units[index + 4u]) &&
                regexp_hex_digit(source->units[index + 5u])) {
                index += 5u;
                found = true;
                continue;
            }
            return false;
        }
    }
    return found;
}

static bool regexp_control_escape_point(
    uint16_t escape,
    uint32_t *point
) {
    switch (escape) {
        case '0': *point = 0u; return true;
        case 'b': *point = 0x08u; return true;
        case 't': *point = 0x09u; return true;
        case 'n': *point = 0x0au; return true;
        case 'v': *point = 0x0bu; return true;
        case 'f': *point = 0x0cu; return true;
        case 'r': *point = 0x0du; return true;
        default: return false;
    }
}

static size_t regexp_name_hash(
    const OseoString *source,
    size_t start,
    size_t end
) {
    size_t hash = (size_t)UINT32_C(2166136261);
    for (size_t index = start; index < end; index += 1u) {
        hash ^= (size_t)source->units[index];
        hash *= (size_t)UINT32_C(16777619);
    }
    return hash;
}

static bool regexp_name_equal(
    const OseoString *source,
    size_t first_start,
    size_t first_end,
    size_t second_start,
    size_t second_end
) {
    size_t first_length = first_end - first_start;
    return first_length == second_end - second_start &&
        memcmp(
            source->units + first_start,
            source->units + second_start,
            first_length * sizeof(uint16_t)
        ) == 0;
}

static bool regexp_named_captures_may_coexist(
    const OseoRegExpNamedCaptureRegistry *registry,
    size_t first,
    size_t second
) {
    while (registry->paths[first].depth > registry->paths[second].depth) {
        first = registry->paths[first].parent;
    }
    while (registry->paths[second].depth > registry->paths[first].depth) {
        second = registry->paths[second].parent;
    }
    if (first == second) return true;
    while (registry->paths[first].parent !=
        registry->paths[second].parent) {
        first = registry->paths[first].parent;
        second = registry->paths[second].parent;
    }
    return registry->paths[first].scope != registry->paths[second].scope;
}

static OseoRegExpValidation regexp_named_capture_registry_create(
    OseoContext *context,
    const OseoString *source,
    OseoRegExpNamedCaptureRegistry *registry
) {
    registry->storage = NULL;
    registry->buckets = NULL;
    registry->records = NULL;
    registry->paths = NULL;
    registry->bucket_count = 0u;
    registry->count = 0u;
    registry->path_count = 0u;
    registry->duplicate_status = OSEO_REGEXP_VALID;
    registry->has_unicode_name = false;

    size_t named_count = 0u;
    size_t path_capacity = 1u;
    bool character_class = false;
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
        if (unit == '|') {
            path_capacity += 1u;
            continue;
        }
        if (unit != '(') continue;
        path_capacity += 1u;
        if (index + 3u >= source->length ||
            source->units[index + 1u] != '?' ||
            source->units[index + 2u] != '<' ||
            source->units[index + 3u] == '=' ||
            source->units[index + 3u] == '!') {
            continue;
        }
        size_t end = 0u;
        if (!regexp_group_name(source, index + 3u, &end)) {
            if (regexp_group_name_needs_unicode(source, index + 3u)) {
                registry->has_unicode_name = true;
            }
            continue;
        }
        named_count += 1u;
        index = end;
    }
    if (named_count == 0u) return OSEO_REGEXP_VALID;

    size_t bucket_count = 8u;
    while (bucket_count < named_count * 2u) bucket_count *= 2u;
    size_t bucket_bytes = bucket_count * sizeof(size_t);
    if (named_count >
        (SIZE_MAX - bucket_bytes) / sizeof(OseoRegExpNamedCapture)) {
        return OSEO_REGEXP_LIMIT;
    }
    size_t bytes = bucket_bytes +
        named_count * sizeof(OseoRegExpNamedCapture);
    if (path_capacity >
        (SIZE_MAX - bytes) / sizeof(OseoRegExpAlternativeNode)) {
        return OSEO_REGEXP_LIMIT;
    }
    bytes += path_capacity * sizeof(OseoRegExpAlternativeNode);
    registry->storage = oseo_internal_allocate_heap_bytes(context, bytes);
    if (registry->storage == NULL) {
        return OSEO_REGEXP_ALLOCATION_FAILURE;
    }
    registry->buckets = registry->storage;
    registry->records = (OseoRegExpNamedCapture *)(
        (unsigned char *)registry->storage + bucket_bytes
    );
    registry->paths = (OseoRegExpAlternativeNode *)(
        registry->records + named_count
    );
    registry->bucket_count = bucket_count;
    for (size_t index = 0u; index < bucket_count; index += 1u) {
        registry->buckets[index] = SIZE_MAX;
    }
    registry->paths[0] = (OseoRegExpAlternativeNode){
        SIZE_MAX,
        SIZE_MAX,
        0u,
        0u,
    };
    registry->path_count = 1u;

    character_class = false;
    size_t current_path = 0u;
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
        if (unit == ')') {
            size_t parent = registry->paths[current_path].parent;
            if (parent != SIZE_MAX) current_path = parent;
            continue;
        }
        if (unit == '|') {
            OseoRegExpAlternativeNode *current =
                &registry->paths[current_path];
            registry->paths[registry->path_count] =
                (OseoRegExpAlternativeNode){
                    current->parent,
                    current->scope,
                    current->alternative + 1u,
                    current->depth,
                };
            current_path = registry->path_count;
            registry->path_count += 1u;
            continue;
        }
        if (unit != '(') continue;

        size_t end = 0u;
        bool named = index + 3u < source->length &&
            source->units[index + 1u] == '?' &&
            source->units[index + 2u] == '<' &&
            source->units[index + 3u] != '=' &&
            source->units[index + 3u] != '!' &&
            regexp_group_name(source, index + 3u, &end);
        if (named) {
            size_t name_start = index + 3u;
            size_t bucket = regexp_name_hash(source, name_start, end) &
                (bucket_count - 1u);
            size_t previous_same = SIZE_MAX;
            for (size_t previous = registry->buckets[bucket];
                 previous != SIZE_MAX;
                 previous = registry->records[previous].next) {
                OseoRegExpNamedCapture *record =
                    &registry->records[previous];
                if (regexp_name_equal(
                        source,
                        record->name_start,
                        record->name_end,
                        name_start,
                        end
                    )) {
                    previous_same = previous;
                    break;
                }
            }
            /*
             * Source order is the compiler parser's alternative-path order.
             * Exclusivity is transitive there, so the adjacent declaration
             * decides whether the whole same-name set can participate.
             */
            if (previous_same != SIZE_MAX &&
                regexp_named_captures_may_coexist(
                    registry,
                    registry->records[previous_same].path,
                    current_path
                )) {
                registry->duplicate_status = OSEO_REGEXP_INVALID;
            }
            OseoRegExpNamedCapture *record =
                &registry->records[registry->count];
            record->declaration = index;
            record->name_start = name_start;
            record->name_end = end;
            record->next = registry->buckets[bucket];
            record->path = current_path;
            registry->buckets[bucket] = registry->count;
            registry->count += 1u;
        }
        registry->paths[registry->path_count] =
            (OseoRegExpAlternativeNode){
                current_path,
                index,
                0u,
                registry->paths[current_path].depth + 1u,
            };
        current_path = registry->path_count;
        registry->path_count += 1u;
        if (named) index = end;
    }
    return OSEO_REGEXP_VALID;
}

static void regexp_named_capture_registry_destroy(
    OseoRegExpNamedCaptureRegistry *registry
) {
    free(registry->storage);
    registry->storage = NULL;
}

/* Count captures before validating backreferences, which may point forward. */
static OseoRegExpValidation regexp_count_captures(
    const OseoString *source,
    size_t *capture_count
) {
    bool character_class = false;
    size_t count = 0u;
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
        bool capture = index + 1u >= source->length ||
            source->units[index + 1u] != '?';
        if (!capture && index + 3u < source->length &&
            source->units[index + 2u] == '<' &&
            source->units[index + 3u] != '=' &&
            source->units[index + 3u] != '!') {
            capture = true;
        }
        if (!capture) continue;
        if (count == OSEO_REGEXP_CAPTURE_LIMIT) return OSEO_REGEXP_LIMIT;
        count += 1u;
    }
    *capture_count = count;
    return OSEO_REGEXP_VALID;
}

static bool regexp_named_capture_exists(
    const OseoRegExpNamedCaptureRegistry *registry,
    const OseoString *source,
    size_t name_start,
    size_t name_end
) {
    if (registry->bucket_count == 0u) return false;
    size_t bucket = regexp_name_hash(source, name_start, name_end) &
        (registry->bucket_count - 1u);
    for (size_t index = registry->buckets[bucket];
         index != SIZE_MAX;
         index = registry->records[index].next) {
        const OseoRegExpNamedCapture *record = &registry->records[index];
        if (regexp_name_equal(
                source,
                record->name_start,
                record->name_end,
                name_start,
                name_end
            )) {
            return true;
        }
    }
    return false;
}

static OseoRegExpValidation regexp_escape(
    const OseoString *source,
    size_t *index,
    uint16_t flag_mask,
    size_t capture_count,
    const OseoRegExpNamedCaptureRegistry *named_captures,
    bool character_class
) {
    size_t cursor = *index + 1u;
    if (cursor >= source->length) return OSEO_REGEXP_INVALID;
    uint16_t unit = source->units[cursor];
    bool unicode = (flag_mask &
        (OSEO_REGEXP_FLAG_U | OSEO_REGEXP_FLAG_V)) != 0u;
    if (character_class && unit == 'B') {
        return OSEO_REGEXP_INVALID;
    }
    if (unit == 'p' || unit == 'P') {
        if (!unicode || cursor + 1u >= source->length ||
            source->units[cursor + 1u] != '{') {
            return OSEO_REGEXP_INVALID;
        }
        size_t prop = cursor + 2u;
        bool has_content = false;
        bool has_equals = false;
        while (prop < source->length &&
               source->units[prop] != '}') {
            uint16_t pc = source->units[prop];
            if (pc == '=') {
                if (has_equals || !has_content) {
                    return OSEO_REGEXP_INVALID;
                }
                has_equals = true;
                has_content = false;
            } else if (regexp_ascii_alpha(pc) || pc == '_' ||
                       (has_equals && regexp_ascii_digit(pc))) {
                has_content = true;
            } else {
                return OSEO_REGEXP_INVALID;
            }
            prop += 1u;
        }
        if (!has_content || prop >= source->length) {
            return OSEO_REGEXP_INVALID;
        }
        return OSEO_REGEXP_UNSUPPORTED;
    }
    if (character_class && unit == 'q') {
        return (flag_mask & OSEO_REGEXP_FLAG_V) != 0u
            ? OSEO_REGEXP_UNSUPPORTED
            : OSEO_REGEXP_INVALID;
    }
    if (unit == 'u') {
        if (cursor + 1u < source->length &&
            source->units[cursor + 1u] == '{') {
            if (!unicode) return OSEO_REGEXP_INVALID;
            size_t digit = cursor + 2u;
            size_t count = 0u;
            uint32_t value = 0u;
            while (digit < source->length &&
                   source->units[digit] != '}') {
                uint16_t character = source->units[digit];
                if (!regexp_hex_digit(character)) {
                    return OSEO_REGEXP_INVALID;
                }
                uint32_t part = character <= '9'
                    ? (uint32_t)(character - '0')
                    : character <= 'F'
                      ? (uint32_t)(character - 'A' + 10u)
                      : (uint32_t)(character - 'a' + 10u);
                if (value >
                    (UINT32_C(0x10ffff) - part) / UINT32_C(16)) {
                    return OSEO_REGEXP_INVALID;
                }
                value = value * UINT32_C(16) + part;
                count += 1u;
                digit += 1u;
            }
            if (count == 0u || digit >= source->length) {
                return OSEO_REGEXP_INVALID;
            }
            *index = digit;
            return OSEO_REGEXP_VALID;
        }
        if (cursor + 4u >= source->length) return OSEO_REGEXP_INVALID;
        for (size_t offset = 1u; offset <= 4u; offset += 1u) {
            if (!regexp_hex_digit(source->units[cursor + offset])) {
                return OSEO_REGEXP_INVALID;
            }
        }
        *index = cursor + 4u;
        return OSEO_REGEXP_VALID;
    }
    if (unit == 'x') {
        if (cursor + 2u >= source->length ||
            !regexp_hex_digit(source->units[cursor + 1u]) ||
            !regexp_hex_digit(source->units[cursor + 2u])) {
            return OSEO_REGEXP_INVALID;
        }
        *index = cursor + 2u;
        return OSEO_REGEXP_VALID;
    }
    if (unit == 'c') {
        if (cursor + 1u >= source->length ||
            !regexp_ascii_alpha(source->units[cursor + 1u])) {
            return OSEO_REGEXP_INVALID;
        }
        *index = cursor + 1u;
        return OSEO_REGEXP_VALID;
    }
    if (unit == 'k') {
        if (character_class || cursor + 1u >= source->length ||
            source->units[cursor + 1u] != '<') {
            return OSEO_REGEXP_INVALID;
        }
        size_t end = 0u;
        if (!regexp_group_name(source, cursor + 2u, &end)) {
            return regexp_group_name_needs_unicode(source, cursor + 2u)
                ? OSEO_REGEXP_UNSUPPORTED
                : OSEO_REGEXP_INVALID;
        }
        if (!regexp_named_capture_exists(
                named_captures,
                source,
                cursor + 2u,
                end
            )) {
            return named_captures->has_unicode_name
                ? OSEO_REGEXP_UNSUPPORTED
                : OSEO_REGEXP_INVALID;
        }
        *index = end;
        return OSEO_REGEXP_VALID;
    }
    if (regexp_ascii_digit(unit)) {
        if (character_class && unit != '0') {
            return OSEO_REGEXP_INVALID;
        }
        if (unit == '0') {
            if (cursor + 1u < source->length &&
                regexp_ascii_digit(source->units[cursor + 1u])) {
                return OSEO_REGEXP_INVALID;
            }
            *index = cursor;
            return OSEO_REGEXP_VALID;
        }
        size_t value = 0u;
        while (cursor < source->length &&
               regexp_ascii_digit(source->units[cursor])) {
            size_t digit = (size_t)(source->units[cursor] - '0');
            if (value > (SIZE_MAX - digit) / 10u) {
                return OSEO_REGEXP_INVALID;
            }
            value = value * 10u + digit;
            cursor += 1u;
        }
        if (value == 0u || value > capture_count) {
            return OSEO_REGEXP_INVALID;
        }
        *index = cursor - 1u;
        return OSEO_REGEXP_VALID;
    }
    if (unit == 'd' || unit == 'D' || unit == 's' || unit == 'S' ||
        unit == 'w' || unit == 'W' || unit == 'b' || unit == 'B' ||
        unit == 'f' || unit == 'n' || unit == 'r' || unit == 't' ||
        unit == 'v' || unit == '/' || unit == '^' || unit == '$' ||
        unit == '\\' || unit == '.' || unit == '*' || unit == '+' ||
        unit == '?' || unit == '(' || unit == ')' || unit == '[' ||
        unit == ']' || unit == '{' || unit == '}' || unit == '|' ||
        (character_class && unicode && unit == '-')) {
        *index = cursor;
        return OSEO_REGEXP_VALID;
    }
    if (!unicode && unit > 0x7fu) return OSEO_REGEXP_UNSUPPORTED;
    if (unicode || regexp_ascii_alpha(unit) || regexp_ascii_digit(unit) ||
        unit == '_' || unit == '$') {
        return OSEO_REGEXP_INVALID;
    }
    *index = cursor;
    return OSEO_REGEXP_VALID;
}

static OseoRegExpValidation regexp_character_class(
    const OseoString *source,
    size_t *index,
    uint16_t flag_mask,
    size_t capture_count,
    const OseoRegExpNamedCaptureRegistry *named_captures
) {
    bool unicode_sets = (flag_mask & OSEO_REGEXP_FLAG_V) != 0u;
    bool unicode = (flag_mask &
        (OSEO_REGEXP_FLAG_U | OSEO_REGEXP_FLAG_V)) != 0u;
    if (unicode_sets) return OSEO_REGEXP_UNSUPPORTED;
    size_t cursor = *index + 1u;
    if (cursor < source->length && source->units[cursor] == '^') cursor += 1u;
    bool have_previous = false;
    bool previous_single = false;
    uint32_t previous = 0u;
    bool range = false;
    for (; cursor < source->length; cursor += 1u) {
        uint16_t unit = source->units[cursor];
        if (unit == ']' && !range) {
            *index = cursor;
            return OSEO_REGEXP_VALID;
        }
        if (unicode_sets &&
            (unit == '[' ||
             (cursor + 1u < source->length &&
              ((unit == '&' && source->units[cursor + 1u] == '&') ||
               (unit == '-' && source->units[cursor + 1u] == '-'))))) {
            return OSEO_REGEXP_UNSUPPORTED;
        }
        bool single = true;
        uint32_t point = unit;
        if (unicode && unit >= UINT16_C(0xd800) &&
            unit <= UINT16_C(0xdbff) && cursor + 1u < source->length) {
            uint16_t trail = source->units[cursor + 1u];
            if (trail >= UINT16_C(0xdc00) && trail <= UINT16_C(0xdfff)) {
                point = UINT32_C(0x10000) +
                    ((uint32_t)(unit - UINT16_C(0xd800)) << 10u) +
                    (uint32_t)(trail - UINT16_C(0xdc00));
                cursor += 1u;
            }
        }
        if (unit == '\\') {
            size_t escape_start = cursor;
            size_t escaped = cursor;
            OseoRegExpValidation status = regexp_escape(
                source,
                &escaped,
                flag_mask,
                capture_count,
                named_captures,
                true
            );
            if (status != OSEO_REGEXP_VALID) return status;
            uint16_t escape = source->units[escape_start + 1u];
            single = escape != 'd' && escape != 'D' && escape != 's' &&
                escape != 'S' && escape != 'w' && escape != 'W';
            if (escape == 'c') {
                point = source->units[escape_start + 2u] & 0x1fu;
            } else if (escape == 'x') {
                point = 0u;
                for (size_t offset = escape_start + 2u;
                     offset <= escaped;
                     offset += 1u) {
                    uint16_t digit = source->units[offset];
                    point = point * 16u + (digit <= '9'
                        ? (uint32_t)(digit - '0')
                        : digit <= 'F'
                          ? (uint32_t)(digit - 'A' + 10u)
                          : (uint32_t)(digit - 'a' + 10u));
                }
            } else if (escape == 'u') {
                size_t start = escape_start + 2u;
                size_t end = escaped + 1u;
                bool braced = source->units[start] == '{';
                if (braced) {
                    start += 1u;
                    end -= 1u;
                }
                point = 0u;
                for (size_t offset = start; offset < end; offset += 1u) {
                    uint16_t digit = source->units[offset];
                    point = point * 16u + (digit <= '9'
                        ? (uint32_t)(digit - '0')
                        : digit <= 'F'
                          ? (uint32_t)(digit - 'A' + 10u)
                          : (uint32_t)(digit - 'a' + 10u));
                }
                if (unicode && !braced &&
                    point >= UINT32_C(0xd800) &&
                    point <= UINT32_C(0xdbff) &&
                    escaped + 6u < source->length &&
                    source->units[escaped + 1u] == '\\' &&
                    source->units[escaped + 2u] == 'u') {
                    uint32_t trail = 0u;
                    bool valid_trail = true;
                    for (size_t offset = escaped + 3u;
                         offset <= escaped + 6u;
                         offset += 1u) {
                        uint16_t digit = source->units[offset];
                        if (!regexp_hex_digit(digit)) {
                            valid_trail = false;
                            break;
                        }
                        trail = trail * 16u + (digit <= '9'
                            ? (uint32_t)(digit - '0')
                            : digit <= 'F'
                              ? (uint32_t)(digit - 'A' + 10u)
                              : (uint32_t)(digit - 'a' + 10u));
                    }
                    if (valid_trail && trail >= UINT32_C(0xdc00) &&
                        trail <= UINT32_C(0xdfff)) {
                        point = UINT32_C(0x10000) +
                            ((point - UINT32_C(0xd800)) << 10u) +
                            (trail - UINT32_C(0xdc00));
                        escaped += 6u;
                    }
                }
            } else if (!regexp_control_escape_point(escape, &point) &&
                       single) {
                point = source->units[escape_start + 1u];
            }
            cursor = escaped;
        }
        if (unit == '-' && have_previous &&
            cursor + 1u < source->length &&
            source->units[cursor + 1u] != ']') {
            if (!previous_single) return OSEO_REGEXP_INVALID;
            range = true;
            continue;
        }
        if (range) {
            if (!single) return OSEO_REGEXP_INVALID;
            if (single && previous > point) return OSEO_REGEXP_INVALID;
            range = false;
        }
        have_previous = true;
        previous_single = single;
        previous = point;
    }
    return OSEO_REGEXP_INVALID;
}

static OseoRegExpValidation regexp_decimal_bound(
    const OseoString *source,
    size_t start,
    size_t end,
    uint64_t *value
) {
    if (start == end) return OSEO_REGEXP_INVALID;
    uint64_t result = 0u;
    for (size_t index = start; index < end; index += 1u) {
        if (!regexp_ascii_digit(source->units[index])) {
            return OSEO_REGEXP_INVALID;
        }
        uint64_t digit = (uint64_t)(source->units[index] - '0');
        if (result > (UINT64_C(9007199254740991) - digit) / 10u) {
            return OSEO_REGEXP_LIMIT;
        }
        result = result * 10u + digit;
    }
    *value = result;
    return OSEO_REGEXP_VALID;
}

static bool regexp_bound_exceeds(
    const OseoString *source,
    size_t a_start,
    size_t a_end,
    size_t b_start,
    size_t b_end
) {
    while (a_start < a_end && source->units[a_start] == '0') {
        a_start += 1u;
    }
    while (b_start < b_end && source->units[b_start] == '0') {
        b_start += 1u;
    }
    size_t a_len = a_end - a_start;
    size_t b_len = b_end - b_start;
    if (a_len != b_len) return a_len > b_len;
    for (size_t i = 0u; i < a_len; i += 1u) {
        if (source->units[a_start + i] !=
            source->units[b_start + i]) {
            return source->units[a_start + i] >
                source->units[b_start + i];
        }
    }
    return false;
}

static OseoRegExpValidation regexp_braced_quantifier(
    const OseoString *source,
    size_t *index
) {
    size_t cursor = *index + 1u;
    size_t minimum_start = cursor;
    while (cursor < source->length &&
           regexp_ascii_digit(source->units[cursor])) {
        cursor += 1u;
    }
    size_t minimum_end = cursor;
    uint64_t minimum = 0u;
    OseoRegExpValidation minimum_status = regexp_decimal_bound(
        source,
        minimum_start,
        minimum_end,
        &minimum
    );
    if (minimum_status == OSEO_REGEXP_INVALID) {
        return OSEO_REGEXP_INVALID;
    }
    if (cursor < source->length && source->units[cursor] == '}') {
        *index = cursor;
        return minimum_status;
    }
    if (cursor >= source->length || source->units[cursor] != ',') {
        return OSEO_REGEXP_INVALID;
    }
    cursor += 1u;
    size_t maximum_start = cursor;
    while (cursor < source->length &&
           regexp_ascii_digit(source->units[cursor])) {
        cursor += 1u;
    }
    if (cursor >= source->length || source->units[cursor] != '}') {
        return OSEO_REGEXP_INVALID;
    }
    if (maximum_start != cursor) {
        uint64_t maximum = 0u;
        OseoRegExpValidation maximum_status = regexp_decimal_bound(
            source,
            maximum_start,
            cursor,
            &maximum
        );
        bool reversed = false;
        if (minimum_status == OSEO_REGEXP_VALID &&
            maximum_status == OSEO_REGEXP_VALID) {
            reversed = minimum > maximum;
        } else if (minimum_status == OSEO_REGEXP_LIMIT &&
                   maximum_status == OSEO_REGEXP_VALID) {
            reversed = true;
        } else if (minimum_status == OSEO_REGEXP_VALID &&
                   maximum_status == OSEO_REGEXP_LIMIT) {
            reversed = false;
        } else {
            reversed = regexp_bound_exceeds(
                source,
                minimum_start, minimum_end,
                maximum_start, cursor
            );
        }
        if (reversed) return OSEO_REGEXP_INVALID;
        if (minimum_status == OSEO_REGEXP_LIMIT ||
            maximum_status == OSEO_REGEXP_LIMIT) {
            *index = cursor;
            return OSEO_REGEXP_LIMIT;
        }
    } else if (minimum_status == OSEO_REGEXP_LIMIT) {
        *index = cursor;
        return OSEO_REGEXP_LIMIT;
    }
    *index = cursor;
    return OSEO_REGEXP_VALID;
}

static OseoRegExpValidation regexp_validate_pattern(
    const OseoString *source,
    uint16_t flag_mask,
    size_t capture_count,
    const OseoRegExpNamedCaptureRegistry *named_captures
) {
    if (source->length > OSEO_REGEXP_PATTERN_LENGTH_LIMIT) {
        return OSEO_REGEXP_LIMIT;
    }
    bool group_quantifiable[OSEO_REGEXP_NESTING_LIMIT];
    size_t depth = 0u;
    bool can_quantify = false;
    bool quantified = false;
    for (size_t index = 0u; index < source->length; index += 1u) {
        uint16_t unit = source->units[index];
        if (quantified && unit == '?') {
            quantified = false;
            can_quantify = false;
            continue;
        }
        quantified = false;
        if (unit == '\\') {
            size_t escape_start = index;
            OseoRegExpValidation status = regexp_escape(
                source,
                &index,
                flag_mask,
                capture_count,
                named_captures,
                false
            );
            if (status != OSEO_REGEXP_VALID) return status;
            uint16_t escape = source->units[escape_start + 1u];
            can_quantify = escape != 'b' && escape != 'B';
            continue;
        }
        if (unit == '[') {
            OseoRegExpValidation status = regexp_character_class(
                source,
                &index,
                flag_mask,
                capture_count,
                named_captures
            );
            if (status != OSEO_REGEXP_VALID) return status;
            can_quantify = true;
            continue;
        }
        if (unit == '(') {
            if (depth == OSEO_REGEXP_NESTING_LIMIT) {
                return OSEO_REGEXP_LIMIT;
            }
            bool group_can_quantify = true;
            if (index + 1u < source->length &&
                source->units[index + 1u] == '?') {
                if (index + 2u >= source->length) {
                    return OSEO_REGEXP_INVALID;
                }
                uint16_t kind = source->units[index + 2u];
                if (kind == ':') {
                    index += 2u;
                } else if (kind == '=' || kind == '!') {
                    group_can_quantify = false;
                    index += 2u;
                } else if (kind == '<') {
                    if (index + 3u >= source->length) {
                        return OSEO_REGEXP_INVALID;
                    }
                    uint16_t next = source->units[index + 3u];
                    if (next == '=' || next == '!') {
                        group_can_quantify = false;
                        index += 3u;
                    } else {
                        size_t end = 0u;
                        if (!regexp_group_name(source, index + 3u, &end)) {
                            if (regexp_group_name_needs_unicode(
                                    source,
                                    index + 3u
                                )) {
                                return OSEO_REGEXP_UNSUPPORTED;
                            }
                            return OSEO_REGEXP_INVALID;
                        }
                        index = end;
                    }
                } else if (kind == 'i' || kind == 'm' || kind == 's' ||
                           kind == '-') {
                    size_t mc = index + 2u;
                    uint16_t add = 0u;
                    uint16_t rem = 0u;
                    bool removing = false;
                    bool valid_mod = true;
                    while (mc < source->length) {
                        uint16_t mf = source->units[mc];
                        if (mf == ':') break;
                        if (mf == '-') {
                            if (removing) {
                                valid_mod = false;
                                break;
                            }
                            removing = true;
                            mc += 1u;
                            continue;
                        }
                        uint16_t fb = 0u;
                        if (mf == 'i') fb = OSEO_REGEXP_FLAG_I;
                        else if (mf == 'm') fb = OSEO_REGEXP_FLAG_M;
                        else if (mf == 's') fb = OSEO_REGEXP_FLAG_S;
                        else { valid_mod = false; break; }
                        uint16_t *tgt = removing ? &rem : &add;
                        if ((*tgt & fb) != 0u) {
                            valid_mod = false;
                            break;
                        }
                        *tgt = (uint16_t)(*tgt | fb);
                        mc += 1u;
                    }
                    if (!valid_mod ||
                        mc >= source->length ||
                        source->units[mc] != ':') {
                        return OSEO_REGEXP_INVALID;
                    }
                    if ((add | rem) == 0u ||
                        (add & rem) != 0u) {
                        return OSEO_REGEXP_INVALID;
                    }
                    return OSEO_REGEXP_UNSUPPORTED;
                } else {
                    return OSEO_REGEXP_INVALID;
                }
            }
            group_quantifiable[depth] = group_can_quantify;
            depth += 1u;
            can_quantify = false;
            continue;
        }
        if (unit == ')') {
            if (depth == 0u) return OSEO_REGEXP_INVALID;
            depth -= 1u;
            can_quantify = group_quantifiable[depth];
            continue;
        }
        if (unit == '|') {
            can_quantify = false;
            continue;
        }
        if (unit == '^' || unit == '$') {
            can_quantify = false;
            continue;
        }
        if (unit == '*' || unit == '+' || unit == '?') {
            if (!can_quantify) return OSEO_REGEXP_INVALID;
            can_quantify = false;
            quantified = true;
            continue;
        }
        if (unit == '{') {
            if (!can_quantify) return OSEO_REGEXP_INVALID;
            OseoRegExpValidation status = regexp_braced_quantifier(
                source,
                &index
            );
            if (status != OSEO_REGEXP_VALID) return status;
            can_quantify = false;
            quantified = true;
            continue;
        }
        if (unit == ']' || unit == '}') return OSEO_REGEXP_INVALID;
        can_quantify = true;
    }
    if (depth != 0u) return OSEO_REGEXP_INVALID;
    if (source->length > OSEO_REGEXP_MATCHER_INSTRUCTION_LIMIT - 1u ||
        capture_count >
            (OSEO_REGEXP_MATCHER_INSTRUCTION_LIMIT - source->length - 1u) /
                2u) {
        return OSEO_REGEXP_LIMIT;
    }
    return OSEO_REGEXP_VALID;
}

static OseoResult regexp_validation_result(
    OseoContext *context,
    OseoRegExpValidation status
) {
    if (status == OSEO_REGEXP_INVALID) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_SYNTAX,
            "Invalid regular expression pattern or flags."
        );
    }
    if (status == OSEO_REGEXP_UNSUPPORTED) {
        return failure(
            context,
            "OSEO2001",
            "Regular expression pattern extension is not admitted yet."
        );
    }
    if (status == OSEO_REGEXP_ALLOCATION_FAILURE) {
        return failure(
            context,
            "OSEO2001",
            "RegExp pattern validation allocation failed."
        );
    }
    return failure(
        context,
        "OSEO2001",
        "Regular expression pattern exceeds the reviewed matcher limit."
    );
}

OseoResult oseo_internal_is_regexp(
    OseoContext *context,
    OseoValue value,
    bool *regexp
) {
    if (!is_object(value)) {
        *regexp = false;
        return normal(oseo_boolean(false));
    }
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_well_known_symbol(
        context,
        OSEO_WELL_KNOWN_MATCH
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        tag_of(result.value) != OSEO_TAG_UNDEFINED) {
        *regexp = oseo_to_boolean(result.value);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        *regexp = is_regexp(frame.slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_boolean(*regexp))
        : result;
}

static OseoResult regexp_prototype_from_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue *prototype
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_ascii_string(context, "prototype");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_REGEXP_PROTOTYPE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static void regexp_initialize_ordinary(
    OseoContext *context,
    OseoOrdinaryObject *object,
    OseoValue prototype
) {
    object->prototype = prototype;
    object->properties = NULL;
    object->property_capacity = 0u;
    object->property_count = 0u;
    object->private_elements = NULL;
    object->private_element_capacity = 0u;
    object->private_element_count = 0u;
    object->shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    object->array_length = 0u;
    object->dictionary = false;
    object->length_writable = false;
    object->extensible = true;
    object->module_namespace = false;
    object->global_object = false;
    object->error_data = false;
    object->number_data = false;
    object->number_value = oseo_undefined();
    object->primitive_data = false;
    object->primitive_value = oseo_undefined();
    object->primitive_wrapper_methods_initialized = false;
    object->virtual_string_iterator = false;
    object->virtual_string_iterator_configurable = false;
    object->virtual_string_iterator_enumerable = false;
    object->virtual_string_iterator_writable = false;
    object->array_iterator = false;
    object->iterator_array = oseo_undefined();
    object->iterator_index = 0u;
    object->regexp_string_iterator = false;
    object->regexp_iterator_subject = oseo_undefined();
    object->regexp_iterator_pattern = oseo_undefined();
    object->regexp_iterator_index = 0u;
    object->regexp_iterator_complete = false;
    object->async_from_sync = false;
    object->async_sync_iterator = oseo_undefined();
    object->wrap_for_valid_iterator = false;
    object->wrapped_iterator = oseo_undefined();
    object->wrapped_next = oseo_undefined();
    object->arguments_object = false;
    object->mapped_arguments = false;
    object->generator = NULL;
}

/* RegExpAlloc, including the non-enumerable own lastIndex property. */
static OseoResult regexp_allocate(
    OseoContext *context,
    OseoValue new_target
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = regexp_prototype_from_target(
        context,
        frame.slots[0],
        &frame.slots[1]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoRegExp *regexp =
            oseo_internal_allocate_heap_bytes(context, sizeof(*regexp));
        if (regexp == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "RegExp allocation failed."
            );
        } else {
            regexp_initialize_ordinary(
                context,
                &regexp->ordinary,
                frame.slots[1]
            );
            regexp->matcher = oseo_undefined();
            result = oseo_internal_publish_heap(
                context,
                &regexp->ordinary.header,
                OSEO_HEAP_REGEXP
            );
            frame.slots[1] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "lastIndex");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            oseo_number(0.0),
            (OseoPropertyAttributes){false, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult regexp_matcher_create(
    OseoContext *context,
    OseoValue source,
    OseoValue flags
) {
    uint16_t flag_mask = 0u;
    OseoRegExpValidation status = regexp_validate_flags(
        string_object(flags),
        &flag_mask
    );
    if (status == OSEO_REGEXP_VALID &&
        string_object(source)->length > OSEO_REGEXP_PATTERN_LENGTH_LIMIT) {
        status = OSEO_REGEXP_LIMIT;
    }
    size_t capture_count = 0u;
    if (status == OSEO_REGEXP_VALID) {
        status = regexp_count_captures(
            string_object(source),
            &capture_count
        );
    }
    OseoRegExpNamedCaptureRegistry named_captures = {
        NULL,
        NULL,
        NULL,
        NULL,
        0u,
        0u,
        0u,
        OSEO_REGEXP_VALID,
        false,
    };
    if (status == OSEO_REGEXP_VALID) {
        status = regexp_named_capture_registry_create(
            context,
            string_object(source),
            &named_captures
        );
    }
    if (status == OSEO_REGEXP_VALID) {
        status = regexp_validate_pattern(
            string_object(source),
            flag_mask,
            capture_count,
            &named_captures
        );
    }
    if (status == OSEO_REGEXP_VALID &&
        named_captures.duplicate_status != OSEO_REGEXP_VALID) {
        status = named_captures.duplicate_status;
    }
    regexp_named_capture_registry_destroy(&named_captures);
    if (status != OSEO_REGEXP_VALID) {
        return regexp_validation_result(context, status);
    }
    /*
     * The program is compiled before the artifact is allocated. It is
     * unmanaged memory, so building it reaches no safepoint, and a
     * failure after it exists releases it rather than publishing an
     * artifact that owns nothing.
     */
    OseoRegExpProgram *program = oseo_internal_regexp_program_build(
        context,
        string_object(source),
        flag_mask,
        capture_count,
        &status
    );
    if (program == NULL) return regexp_validation_result(context, status);
    OseoValue slots[2] = {source, flags};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoRegExpMatcher *matcher = oseo_internal_allocate_heap_bytes(
        context,
        sizeof(*matcher)
    );
    OseoResult result;
    if (matcher == NULL) {
        oseo_internal_regexp_program_release(program);
        result = failure(
            context,
            "OSEO2001",
            "RegExp matcher allocation failed."
        );
    } else {
        matcher->source = slots[0];
        matcher->flags = slots[1];
        matcher->program = program;
        matcher->capture_count = capture_count;
        matcher->instruction_count = program->instruction_count;
        matcher->flag_mask = flag_mask;
        result = oseo_internal_publish_heap(
            context,
            &matcher->header,
            OSEO_HEAP_REGEXP_MATCHER
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_internal_regexp_program_release(program);
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* RegExpInitialize converts only after RegExpAlloc has completed. */
static OseoResult regexp_initialize(
    OseoContext *context,
    OseoValue regexp,
    OseoValue pattern,
    OseoValue flags
) {
    OseoValue slots[5] = {
        regexp,
        pattern,
        flags,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    OseoResult result = tag_of(frame.slots[1]) == OSEO_TAG_UNDEFINED
        ? oseo_internal_ascii_string(context, "")
        : oseo_internal_value_string(context, frame.slots[1]);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = tag_of(frame.slots[2]) == OSEO_TAG_UNDEFINED
            ? oseo_internal_ascii_string(context, "")
            : oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_matcher_create(
            context,
            frame.slots[3],
            frame.slots[4]
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        regexp_object(frame.slots[0])->matcher = frame.slots[3];
        result.value = frame.slots[0];
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_get_named(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue *value
) {
    OseoValue slots[2] = {object, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *value = frame.slots[1];
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_construct(
    OseoContext *context,
    OseoValue callee,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    OseoValue pattern = argument_count == 0u
        ? oseo_undefined()
        : arguments[0];
    OseoValue flags = argument_count < 2u
        ? oseo_undefined()
        : arguments[1];
    OseoValue slots[6] = {
        callee,
        new_target,
        pattern,
        flags,
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 6u};
    oseo_roots_push(context, &frame);
    bool called = tag_of(frame.slots[1]) == OSEO_TAG_UNDEFINED;
    if (called) frame.slots[1] = frame.slots[0];
    bool pattern_is_regexp = false;
    OseoResult result = oseo_internal_is_regexp(
        context,
        frame.slots[2],
        &pattern_is_regexp
    );
    if (result.status == OSEO_STATUS_NORMAL && called &&
        pattern_is_regexp &&
        tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED) {
        result = regexp_get_named(
            context,
            frame.slots[2],
            "constructor",
            &frame.slots[4]
        );
        if (result.status == OSEO_STATUS_NORMAL &&
            frame.slots[4] == frame.slots[1]) {
            result = normal(frame.slots[2]);
            oseo_roots_pop(context, &frame);
            return result;
        }
    }
    frame.slots[4] = frame.slots[2];
    if (result.status == OSEO_STATUS_NORMAL && is_regexp(frame.slots[2])) {
        OseoValue matcher = regexp_object(frame.slots[2])->matcher;
        frame.slots[4] = regexp_matcher_object(matcher)->source;
        if (tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED) {
            frame.slots[3] = regexp_matcher_object(matcher)->flags;
        }
    } else if (result.status == OSEO_STATUS_NORMAL && pattern_is_regexp) {
        result = regexp_get_named(
            context,
            frame.slots[2],
            "source",
            &frame.slots[4]
        );
        if (result.status == OSEO_STATUS_NORMAL &&
            tag_of(frame.slots[3]) == OSEO_TAG_UNDEFINED) {
            result = regexp_get_named(
                context,
                frame.slots[2],
                "flags",
                &frame.slots[5]
            );
            frame.slots[3] = frame.slots[5];
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_allocate(context, frame.slots[1]);
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_initialize(
            context,
            frame.slots[5],
            frame.slots[4],
            frame.slots[3]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* ToLength's clamp: 2^53 - 1. */
#define OSEO_REGEXP_MAX_SAFE_LENGTH 9007199254740991.0

/* ToLength (7.1.20) for the `lastIndex` read built-in execution makes. */
static OseoResult regexp_to_length(
    OseoContext *context,
    OseoValue value,
    double *length
) {
    *length = 0.0;
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (!is_number(result.value)) return normal(oseo_undefined());
    double number = number_value(result.value);
    /* NaN, negative zero, and every negative value clamp to zero. */
    if (!(number > 0.0)) return normal(oseo_undefined());
    number = floor(number);
    *length = number > OSEO_REGEXP_MAX_SAFE_LENGTH
        ? OSEO_REGEXP_MAX_SAFE_LENGTH
        : number;
    return normal(oseo_undefined());
}

/* Set(R, "lastIndex", value, true), which a read-only slot rejects. */
static OseoResult regexp_set_last_index(
    OseoContext *context,
    OseoValue regexp,
    double value
) {
    OseoValue slots[2] = {regexp, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "lastIndex");
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_set(
            context,
            frame.slots[0],
            frame.slots[1],
            oseo_number(value),
            true
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* CreateDataPropertyOrThrow for one owned result-object property. */
static OseoResult regexp_create_data_property(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value
) {
    return oseo_object_define(
        context,
        object,
        key,
        value,
        (OseoPropertyAttributes){true, true, true, false}
    );
}

static OseoResult regexp_create_named_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_create_data_property(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1]
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* The half-open substring of one rooted string value. */
static OseoResult regexp_substring(
    OseoContext *context,
    OseoValue subject,
    size_t start,
    size_t end
) {
    const OseoString *string = string_object(subject);
    return oseo_internal_allocate_string(
        context,
        &string->units[start],
        end - start
    );
}

/*
 * The two-element index pair one capture contributes to `indices`, or
 * undefined for a capture that did not participate.
 */
static OseoResult regexp_index_pair(
    OseoContext *context,
    int64_t start,
    int64_t end
) {
    if (start < 0 || end < 0) return normal(oseo_undefined());
    OseoValue array = oseo_undefined();
    OseoRootFrame frame = {NULL, &array, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_array_create(context, 0u);
    array = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, array, oseo_number((double)start));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_append(context, array, oseo_number((double)end));
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(array);
    oseo_roots_pop(context, &frame);
    return result;
}

/* The group name of one capture as a string value. */
static OseoResult regexp_group_name_string(
    OseoContext *context,
    const OseoRegExpProgram *program,
    size_t capture
) {
    const OseoRegExpCapture *record = &program->captures[capture - 1u];
    return oseo_internal_allocate_string(
        context,
        &program->name_units[record->name_offset],
        record->name_length
    );
}

/* Whether an earlier capture with the same name participated in the match. */
static bool regexp_earlier_named_capture_participated(
    const OseoRegExpProgram *program,
    const int64_t *captures,
    size_t capture
) {
    const OseoRegExpCapture *record = &program->captures[capture - 1u];
    for (size_t earlier = 1u; earlier < capture; earlier += 1u) {
        const OseoRegExpCapture *candidate =
            &program->captures[earlier - 1u];
        if (!candidate->named ||
            candidate->name_length != record->name_length ||
            captures[2u * earlier] < 0) {
            continue;
        }
        if (memcmp(
                &program->name_units[candidate->name_offset],
                &program->name_units[record->name_offset],
                record->name_length * sizeof(uint16_t)
            ) == 0) {
            return true;
        }
    }
    return false;
}

/*
 * MakeMatchIndicesIndexPairArray (22.2.7.7).
 *
 * The pair array mirrors the result array: element zero is the whole
 * match, element `index` is capturing group `index`, and a named group
 * repeats its pair on the `groups` object. Nothing here reads the input
 * string, so a capture that did not participate needs no span.
 */
static OseoResult regexp_match_indices(
    OseoContext *context,
    const OseoRegExpProgram *program,
    const int64_t *captures
) {
    OseoValue slots[3] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_array_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && program->has_group_names) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_create_named_property(
            context,
            frame.slots[0],
            "groups",
            frame.slots[1]
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index <= program->capture_count;
         index += 1u) {
        result = regexp_index_pair(
            context,
            captures[2u * index],
            captures[2u * index + 1u]
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[0],
                frame.slots[2]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL || index == 0u) continue;
        if (!program->captures[index - 1u].named) continue;
        if (captures[2u * index] < 0 &&
            regexp_earlier_named_capture_participated(
                program,
                captures,
                index
            )) {
            continue;
        }
        OseoValue pair = frame.slots[2];
        result = regexp_group_name_string(context, program, index);
        OseoValue name = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue nested[3] = {frame.slots[1], name, pair};
            OseoRootFrame inner = {NULL, nested, 3u};
            oseo_roots_push(context, &inner);
            result = regexp_create_data_property(
                context,
                nested[0],
                nested[1],
                nested[2]
            );
            oseo_roots_pop(context, &inner);
        }
        frame.slots[2] = pair;
    }
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[0]);
    oseo_roots_pop(context, &frame);
    return result;
}

/* The owned boundary a match attempt that ran out of resources reports. */
static OseoResult regexp_execution_failure(
    OseoContext *context,
    OseoRegExpExecution outcome
) {
    if (outcome == OSEO_REGEXP_EXECUTION_ALLOCATION) {
        return failure(
            context,
            "OSEO2001",
            "RegExp matcher work area allocation failed."
        );
    }
    return failure(
        context,
        "OSEO2001",
        "Regular expression matching exceeds the reviewed matcher limit."
    );
}

/*
 * RegExpBuiltinExec (22.2.7.2).
 *
 * The position loop, `lastIndex` conversion and update, and the result
 * object live here; the matcher component owns the match itself. A
 * global or sticky pattern writes `lastIndex` through the ordinary
 * property path, so a frozen or redefined slot is observed exactly where
 * the edition observes it.
 */
static OseoResult regexp_builtin_exec(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject
) {
    OseoValue slots[5] = {
        regexp,
        subject,
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, slots, 5u};
    oseo_roots_push(context, &frame);
    double last_index = 0.0;
    OseoResult result = regexp_get_named(
        context,
        frame.slots[0],
        "lastIndex",
        &frame.slots[2]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_to_length(context, frame.slots[2], &last_index);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    OseoRegExpMatcher *matcher =
        regexp_matcher_object(regexp_object(frame.slots[0])->matcher);
    uint16_t mask = matcher->flag_mask;
    bool global = (mask & OSEO_REGEXP_FLAG_G) != 0u;
    bool sticky = (mask & OSEO_REGEXP_FLAG_Y) != 0u;
    bool has_indices = (mask & OSEO_REGEXP_FLAG_D) != 0u;
    if (!global && !sticky) last_index = 0.0;
    const OseoRegExpProgram *program = matcher->program;
    size_t length = string_object(frame.slots[1])->length;
    size_t total = 2u * (program->capture_count + 1u);
    int64_t *captures = oseo_internal_allocate_work_bytes(
        context,
        total * sizeof(int64_t)
    );
    if (captures == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "RegExp capture allocation failed."
        );
    }
    OseoRegExpExecution outcome = OSEO_REGEXP_EXECUTION_UNMATCHED;
    if (last_index <= (double)length) {
        outcome = oseo_internal_regexp_program_search(
            context,
            program,
            string_object(frame.slots[1]),
            (size_t)last_index,
            sticky,
            captures
        );
    }
    if (outcome == OSEO_REGEXP_EXECUTION_LIMIT ||
        outcome == OSEO_REGEXP_EXECUTION_ALLOCATION) {
        free(captures);
        oseo_roots_pop(context, &frame);
        return regexp_execution_failure(context, outcome);
    }
    if (outcome == OSEO_REGEXP_EXECUTION_UNMATCHED) {
        free(captures);
        result = normal(oseo_null());
        if (global || sticky) {
            OseoResult reset = regexp_set_last_index(
                context,
                frame.slots[0],
                0.0
            );
            if (reset.status != OSEO_STATUS_NORMAL) result = reset;
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    size_t match_start = (size_t)captures[0];
    size_t match_end = (size_t)captures[1];
    if (global || sticky) {
        result = regexp_set_last_index(
            context,
            frame.slots[0],
            (double)match_end
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_array_create(context, 0u);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && program->has_group_names) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[3] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index <= program->capture_count;
         index += 1u) {
        frame.slots[4] = oseo_undefined();
        if (captures[2u * index] >= 0) {
            result = regexp_substring(
                context,
                frame.slots[1],
                (size_t)captures[2u * index],
                (size_t)captures[2u * index + 1u]
            );
            frame.slots[4] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_array_append(
                context,
                frame.slots[2],
                frame.slots[4]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL || index == 0u) continue;
        if (!program->captures[index - 1u].named) continue;
        if (captures[2u * index] < 0 &&
            regexp_earlier_named_capture_participated(
                program,
                captures,
                index
            )) {
            continue;
        }
        OseoValue captured = frame.slots[4];
        result = regexp_group_name_string(context, program, index);
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue nested[3] = {frame.slots[3], result.value, captured};
            OseoRootFrame inner = {NULL, nested, 3u};
            oseo_roots_push(context, &inner);
            result = regexp_create_data_property(
                context,
                nested[0],
                nested[1],
                nested[2]
            );
            oseo_roots_pop(context, &inner);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_create_named_property(
            context,
            frame.slots[2],
            "index",
            oseo_number((double)match_start)
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_create_named_property(
            context,
            frame.slots[2],
            "input",
            frame.slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_create_named_property(
            context,
            frame.slots[2],
            "groups",
            frame.slots[3]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL && has_indices) {
        result = regexp_match_indices(context, program, captures);
        frame.slots[4] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = regexp_create_named_property(
                context,
                frame.slots[2],
                "indices",
                frame.slots[4]
            );
        }
    }
    free(captures);
    if (result.status == OSEO_STATUS_NORMAL) result = normal(frame.slots[2]);
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * RegExpExec (22.2.7.1): an overridden `exec` is called where the
 * edition requires it, and only a branded RegExp reaches the built-in.
 */
static OseoResult regexp_exec_abstract(
    OseoContext *context,
    OseoValue regexp,
    OseoValue subject
) {
    OseoValue slots[3] = {regexp, subject, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = regexp_get_named(
        context,
        frame.slots[0],
        "exec",
        &frame.slots[2]
    );
    if (result.status == OSEO_STATUS_NORMAL && is_function(frame.slots[2])) {
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            1u,
            &frame.slots[1],
            oseo_undefined()
        );
        if (result.status == OSEO_STATUS_NORMAL &&
            !is_object(result.value) &&
            tag_of(result.value) != OSEO_TAG_NULL) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "A RegExp exec method must return an object or null."
            );
        }
        oseo_roots_pop(context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_regexp(frame.slots[0])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp execution requires a RegExp object receiver."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_builtin_exec(context, frame.slots[0], frame.slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_prototype_exec(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_regexp(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp.prototype.exec requires a RegExp object receiver."
        );
    }
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0]
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_builtin_exec(context, frame.slots[0], frame.slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_prototype_test(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp.prototype.test requires an object receiver."
        );
    }
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(
        context,
        argument_count == 0u ? oseo_undefined() : arguments[0]
    );
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_exec_abstract(
            context,
            frame.slots[0],
            frame.slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(
            oseo_boolean(tag_of(result.value) != OSEO_TAG_NULL)
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * EscapeRegExpPattern (22.2.6.13.1).
 *
 * The escaping is the smallest one that keeps `"/" + S + "/" + F` a
 * regular expression literal with the same behavior: an unescaped `/`
 * outside a character class is escaped, and every LineTerminator becomes
 * its own escape sequence wherever it appears. An empty pattern becomes
 * `(?:)`, which is the empty pattern's only literal spelling.
 */
static bool regexp_line_terminator(uint16_t unit) {
    return unit == 0x0au || unit == 0x0du || unit == 0x2028u ||
        unit == 0x2029u;
}

/* The code units one LineTerminator contributes after its backslash. */
static size_t regexp_line_terminator_escape(uint16_t unit, uint16_t *units) {
    if (unit == 0x0au || unit == 0x0du) {
        units[0] = unit == 0x0au ? (uint16_t)'n' : (uint16_t)'r';
        return 1u;
    }
    units[0] = 'u';
    units[1] = '2';
    units[2] = '0';
    units[3] = '2';
    units[4] = unit == 0x2028u ? (uint16_t)'8' : (uint16_t)'9';
    return 5u;
}

/*
 * EscapeRegExpPattern (22.2.6.13.1).
 *
 * The escaping is the smallest one that keeps `"/" + S + "/" + F` a
 * regular expression literal with the same behavior: an unescaped `/`
 * outside a character class is escaped, and every LineTerminator becomes
 * its own escape sequence wherever it appears, reusing a backslash that
 * already precedes it rather than adding a second one. An empty pattern
 * becomes `(?:)`, which is the empty pattern's only literal spelling.
 */
static OseoResult regexp_escape_pattern(
    OseoContext *context,
    OseoValue source
) {
    const OseoString *string = string_object(source);
    if (string->length == 0u) {
        return oseo_internal_ascii_string(context, "(?:)");
    }
    uint16_t escape[5];
    size_t extra = 0u;
    bool rewritten = false;
    bool character_class = false;
    bool escaped = false;
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint16_t unit = string->units[index];
        if (regexp_line_terminator(unit)) {
            /* An escaped LineTerminator keeps its length but not its
             * text, so the rewrite is not decided by the extra count. */
            extra += regexp_line_terminator_escape(unit, escape) - 1u;
            if (!escaped) extra += 1u;
            rewritten = true;
            escaped = false;
            continue;
        }
        if (escaped) {
            escaped = false;
            continue;
        }
        if (unit == '\\') {
            escaped = true;
        } else if (unit == '[') {
            character_class = true;
        } else if (unit == ']') {
            character_class = false;
        } else if (unit == '/' && !character_class) {
            extra += 1u;
            rewritten = true;
        }
    }
    if (!rewritten) return normal(source);
    if (string->length > SIZE_MAX - extra) {
        return failure(context, "OSEO2001", "Pattern escaping is too large.");
    }
    /* The escaped text is one ordinary string, so an over-long result is
     * the same catchable `RangeError` any other string length reports,
     * decided before a staging buffer that large is requested. */
    OseoResult length = oseo_internal_validate_string_length(
        context,
        string->length + extra
    );
    if (length.status != OSEO_STATUS_NORMAL) return length;
    uint16_t *units = oseo_internal_allocate_work_bytes(
        context,
        (string->length + extra) * sizeof(uint16_t)
    );
    if (units == NULL) {
        return failure(context, "OSEO2001", "Pattern escaping failed.");
    }
    size_t written = 0u;
    character_class = false;
    escaped = false;
    for (size_t index = 0u; index < string->length; index += 1u) {
        uint16_t unit = string->units[index];
        if (regexp_line_terminator(unit)) {
            size_t length = regexp_line_terminator_escape(unit, escape);
            if (!escaped) {
                units[written] = '\\';
                written += 1u;
            }
            for (size_t offset = 0u; offset < length; offset += 1u) {
                units[written] = escape[offset];
                written += 1u;
            }
            escaped = false;
            continue;
        }
        if (escaped) {
            escaped = false;
        } else if (unit == '\\') {
            escaped = true;
        } else if (unit == '[') {
            character_class = true;
        } else if (unit == ']') {
            character_class = false;
        } else if (unit == '/' && !character_class) {
            units[written] = '\\';
            written += 1u;
        }
        units[written] = unit;
        written += 1u;
    }
    OseoResult result = oseo_internal_allocate_string(
        context,
        units,
        written
    );
    free(units);
    return result;
}

/*
 * The answer an accessor owes a receiver without the internal slot.
 *
 * `%RegExp.prototype%` itself is the one such receiver the edition
 * admits, so it reports the empty pattern or `undefined` instead of
 * throwing. The receiver stays rooted while the realm materializes that
 * intrinsic, because materializing it allocates.
 */
static OseoResult regexp_prototype_receiver(
    OseoContext *context,
    OseoValue receiver,
    const char *message,
    bool source_accessor
) {
    OseoValue slots[1] = {receiver};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_REGEXP_PROTOTYPE
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        if (result.value != frame.slots[0]) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                message
            );
        } else if (source_accessor) {
            result = oseo_internal_ascii_string(context, "(?:)");
        } else {
            result = normal(oseo_undefined());
        }
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_prototype_source(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The RegExp source accessor requires an object receiver."
        );
    }
    if (!is_regexp(receiver)) {
        return regexp_prototype_receiver(
            context,
            receiver,
            "The RegExp source accessor requires a RegExp object.",
            true
        );
    }
    OseoValue source =
        regexp_matcher_object(regexp_object(receiver)->matcher)->source;
    OseoRootFrame frame = {NULL, &source, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = regexp_escape_pattern(context, source);
    oseo_roots_pop(context, &frame);
    return result;
}

/* The eight flag code units, in the order `flags` prints them. */
static const char regexp_flag_letters[] = "dgimsuvy";

static const uint16_t regexp_flag_bits[] = {
    OSEO_REGEXP_FLAG_D,
    OSEO_REGEXP_FLAG_G,
    OSEO_REGEXP_FLAG_I,
    OSEO_REGEXP_FLAG_M,
    OSEO_REGEXP_FLAG_S,
    OSEO_REGEXP_FLAG_U,
    OSEO_REGEXP_FLAG_V,
    OSEO_REGEXP_FLAG_Y,
};

/*
 * One individual flag accessor (22.2.6.4 and its neighbors).
 *
 * A receiver without the internal slot is a type error unless it is the
 * prototype itself, which answers undefined so that
 * `RegExp.prototype.flags` stays the empty string.
 */
static OseoResult regexp_flag_accessor(
    OseoContext *context,
    OseoValue receiver,
    size_t flag
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "A RegExp flag accessor requires an object receiver."
        );
    }
    if (!is_regexp(receiver)) {
        return regexp_prototype_receiver(
            context,
            receiver,
            "A RegExp flag accessor requires a RegExp object.",
            false
        );
    }
    uint16_t mask =
        regexp_matcher_object(regexp_object(receiver)->matcher)->flag_mask;
    return normal(oseo_boolean((mask & regexp_flag_bits[flag]) != 0u));
}

/*
 * The `flags` accessor (22.2.6.5), which reads the eight individual
 * accessors through ordinary property lookup rather than the internal
 * slot, so an overridden accessor is observed.
 */
static OseoResult regexp_prototype_flags(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "The RegExp flags accessor requires an object receiver."
        );
    }
    OseoValue slots[2] = {receiver, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    uint16_t units[8];
    size_t length = 0u;
    OseoResult result = normal(oseo_undefined());
    static const char *const names[] = {
        "hasIndices",
        "global",
        "ignoreCase",
        "multiline",
        "dotAll",
        "unicode",
        "unicodeSets",
        "sticky",
    };
    for (size_t index = 0u; index < 8u; index += 1u) {
        result = regexp_get_named(
            context,
            frame.slots[0],
            names[index],
            &frame.slots[1]
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (oseo_to_boolean(frame.slots[1])) {
            units[length] =
                (uint16_t)(unsigned char)regexp_flag_letters[index];
            length += 1u;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_allocate_string(context, units, length);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * `toString` (22.2.6.17), which reads `source` and `flags` generically
 * so that any object carrying them stringifies.
 */
static OseoResult regexp_prototype_to_string(
    OseoContext *context,
    OseoValue receiver
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp.prototype.toString requires an object receiver."
        );
    }
    OseoValue slots[3] = {receiver, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = regexp_get_named(
        context,
        frame.slots[0],
        "source",
        &frame.slots[1]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, frame.slots[1]);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = regexp_get_named(
            context,
            frame.slots[0],
            "flags",
            &frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_value_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    const OseoString *pattern = string_object(frame.slots[1]);
    const OseoString *flags = string_object(frame.slots[2]);
    /*
     * `source` and `flags` are arbitrary strings here, because this
     * method is generic. Two individually valid ones can concatenate
     * past the maximum string length, which is the same catchable
     * `RangeError` ordinary concatenation reports, so the length is
     * checked before a staging buffer that large is requested.
     */
    if (pattern->length > SIZE_MAX - flags->length - 2u) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "RegExp stringification is too large."
        );
    }
    size_t length = pattern->length + flags->length + 2u;
    result = oseo_internal_validate_string_length(context, length);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return result;
    }
    uint16_t *units = oseo_internal_allocate_work_bytes(
        context,
        length * sizeof(uint16_t)
    );
    if (units == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "RegExp stringification allocation failed."
        );
    }
    units[0] = '/';
    memcpy(&units[1], pattern->units, pattern->length * sizeof(uint16_t));
    units[pattern->length + 1u] = '/';
    memcpy(
        &units[pattern->length + 2u],
        flags->units,
        flags->length * sizeof(uint16_t)
    );
    result = oseo_internal_allocate_string(context, units, length);
    free(units);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_regexp_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    if (code_id == OSEO_REGEXP_CONSTRUCTOR_CODE_ID) {
        return regexp_construct(
            context,
            callee,
            argument_count,
            arguments,
            new_target
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "RegExp method is not a constructor."
        );
    }
    if (code_id == OSEO_REGEXP_SPECIES_CODE_ID) return normal(receiver);
    if (code_id == OSEO_REGEXP_EXEC_CODE_ID) {
        return regexp_prototype_exec(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_TEST_CODE_ID) {
        return regexp_prototype_test(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    if (code_id == OSEO_REGEXP_TO_STRING_CODE_ID) {
        return regexp_prototype_to_string(context, receiver);
    }
    if (code_id == OSEO_REGEXP_FLAGS_CODE_ID) {
        return regexp_prototype_flags(context, receiver);
    }
    if (code_id == OSEO_REGEXP_SOURCE_CODE_ID) {
        return regexp_prototype_source(context, receiver);
    }
    if (code_id >= OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_FIRST &&
        code_id <= OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_LAST) {
        return regexp_flag_accessor(
            context,
            receiver,
            OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_LAST - code_id
        );
    }
    if (code_id >= OSEO_REGEXP_REPLACE_DEFERRED_CODE_ID &&
        code_id <= OSEO_REGEXP_MATCH_DEFERRED_CODE_ID) {
        /* The reviewed String-dispatch boundary reports one message from
         * both sides, so a case that reaches it through the RegExp
         * prototype and one that reaches it through String.prototype
         * name the same owned capability. */
        return failure(
            context,
            "OSEO2001",
            "RegExp String dispatch is not admitted yet."
        );
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_regexp_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind,
    OseoFunctionNamePrefix prefix
) {
    size_t name_length = strlen(name);
    uint16_t units[32];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            environment,
            units,
            name_length,
            length,
            kind,
            oseo_undefined(),
            oseo_undefined(),
            prefix
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_regexp_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
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

static OseoResult define_regexp_accessor(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue getter
) {
    OseoValue slots[3] = {object, getter, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            slots[0],
            slots[2],
            slots[1],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult regexp_intrinsic_build(OseoContext *context) {
    OseoValue *marker =
        &context->intrinsics[OSEO_INTRINSIC_REGEXP_SPECIES];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The RegExp intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_REGEXP_PROTOTYPE] = frame.slots[0];
        result = create_regexp_builtin(
            context,
            OSEO_REGEXP_CONSTRUCTOR_CODE_ID,
            "RegExp",
            2u,
            OSEO_FUNCTION_ORDINARY,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_REGEXP] = frame.slots[1];
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_regexp_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            method
        );
    }
    static const char *const prototype_methods[] = {
        "exec",
        "test",
        "toString",
    };
    static const size_t prototype_method_lengths[] = {1u, 1u, 0u};
    static const size_t prototype_method_codes[] = {
        OSEO_REGEXP_EXEC_CODE_ID,
        OSEO_REGEXP_TEST_CODE_ID,
        OSEO_REGEXP_TO_STRING_CODE_ID,
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = create_regexp_builtin(
            context,
            prototype_method_codes[index],
            prototype_methods[index],
            prototype_method_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_regexp_property(
                context,
                frame.slots[0],
                prototype_methods[index],
                frame.slots[2],
                method
            );
        }
    }
    /*
     * The ten accessors are defined in one pass. `flags` and `source`
     * own their own code IDs, and the eight individual flag accessors
     * share one contiguous range in the order `flags` prints them, so an
     * accessor's code ID names the flag it reports.
     */
    static const char *const prototype_accessors[] = {
        "flags",
        "source",
        "hasIndices",
        "global",
        "ignoreCase",
        "multiline",
        "dotAll",
        "unicode",
        "unicodeSets",
        "sticky",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 10u;
         index += 1u) {
        size_t code_id = index == 0u
            ? OSEO_REGEXP_FLAGS_CODE_ID
            : index == 1u
              ? OSEO_REGEXP_SOURCE_CODE_ID
              : OSEO_REGEXP_FLAG_ACCESSOR_CODE_ID_LAST - (index - 2u);
        result = create_regexp_builtin(
            context,
            code_id,
            prototype_accessors[index],
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_regexp_accessor(
                context,
                frame.slots[0],
                prototype_accessors[index],
                frame.slots[2]
            );
        }
    }
    static const char *const deferred_symbol_methods[] = {
        "[Symbol.match]",
        "[Symbol.matchAll]",
        "[Symbol.replace]",
        "[Symbol.search]",
        "[Symbol.split]",
    };
    static const size_t deferred_symbols[] = {
        OSEO_WELL_KNOWN_MATCH,
        OSEO_WELL_KNOWN_MATCH_ALL,
        OSEO_WELL_KNOWN_REPLACE,
        OSEO_WELL_KNOWN_SEARCH,
        OSEO_WELL_KNOWN_SPLIT,
    };
    static const size_t deferred_symbol_code_ids[] = {
        OSEO_REGEXP_MATCH_DEFERRED_CODE_ID,
        OSEO_REGEXP_MATCH_ALL_DEFERRED_CODE_ID,
        OSEO_REGEXP_REPLACE_DEFERRED_CODE_ID,
        OSEO_REGEXP_SEARCH_DEFERRED_CODE_ID,
        OSEO_REGEXP_SPLIT_DEFERRED_CODE_ID,
    };
    static const size_t deferred_symbol_lengths[] = {1u, 1u, 2u, 1u, 2u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 5u;
         index += 1u) {
        result = create_regexp_builtin(
            context,
            deferred_symbol_code_ids[index],
            deferred_symbol_methods[index],
            deferred_symbol_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_well_known_symbol(
                context,
                deferred_symbols[index]
            );
            frame.slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[0],
                frame.slots[3],
                frame.slots[2],
                method
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_regexp_builtin(
            context,
            OSEO_REGEXP_SPECIES_CODE_ID,
            "[Symbol.species]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SPECIES
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[2],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        for (size_t index = OSEO_INTRINSIC_REGEXP_PROTOTYPE;
             index <= OSEO_INTRINSIC_REGEXP_SPECIES;
             index += 1u) {
            context->intrinsics[index] = oseo_undefined();
        }
        oseo_roots_release(context, &frame);
        return result;
    }
    context->intrinsics[OSEO_INTRINSIC_REGEXP_SPECIES] = frame.slots[2];
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(context->intrinsics[OSEO_INTRINSIC_REGEXP]);
}

OseoResult oseo_internal_regexp_intrinsic(OseoContext *context) {
    OseoResult built = regexp_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_REGEXP]);
}

OseoResult oseo_internal_install_regexp_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_regexp_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_regexp_property(
            context,
            slots[0],
            "RegExp",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
