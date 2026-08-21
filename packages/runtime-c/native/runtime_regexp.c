#include "runtime_internal.h"

#include <limits.h>
#include <stdlib.h>
#include <string.h>

/*
 * The RegExp constructor, initialization state, and dynamic matcher
 * artifact. Prototype execution and the pattern-extension families replace
 * the explicit boundary functions below in their own graph nodes.
 */

#define OSEO_REGEXP_PATTERN_LENGTH_LIMIT ((size_t)0x100000u)
#define OSEO_REGEXP_CAPTURE_LIMIT ((size_t)0xffffu)
#define OSEO_REGEXP_NESTING_LIMIT ((size_t)256u)
#define OSEO_REGEXP_MATCHER_INSTRUCTION_LIMIT ((size_t)0x100000u)

#define OSEO_REGEXP_FLAG_D ((uint16_t)1u << 0u)
#define OSEO_REGEXP_FLAG_G ((uint16_t)1u << 1u)
#define OSEO_REGEXP_FLAG_I ((uint16_t)1u << 2u)
#define OSEO_REGEXP_FLAG_M ((uint16_t)1u << 3u)
#define OSEO_REGEXP_FLAG_S ((uint16_t)1u << 4u)
#define OSEO_REGEXP_FLAG_U ((uint16_t)1u << 5u)
#define OSEO_REGEXP_FLAG_V ((uint16_t)1u << 6u)
#define OSEO_REGEXP_FLAG_Y ((uint16_t)1u << 7u)

typedef enum {
    OSEO_REGEXP_VALID = 0,
    OSEO_REGEXP_INVALID = 1,
    OSEO_REGEXP_UNSUPPORTED = 2,
    OSEO_REGEXP_LIMIT = 3,
    OSEO_REGEXP_ALLOCATION_FAILURE = 4,
} OseoRegExpValidation;

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
        if (!regexp_group_name(source, index + 3u, &end)) continue;
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
            } else if (previous_same != SIZE_MAX &&
                       registry->duplicate_status == OSEO_REGEXP_VALID) {
                registry->duplicate_status = OSEO_REGEXP_UNSUPPORTED;
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
        return unicode && cursor + 1u < source->length &&
                source->units[cursor + 1u] == '{'
            ? OSEO_REGEXP_UNSUPPORTED
            : OSEO_REGEXP_INVALID;
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
        if (!regexp_group_name(source, cursor + 2u, &end) ||
            !regexp_named_capture_exists(
                named_captures,
                source,
                cursor + 2u,
                end
            )) {
            return OSEO_REGEXP_INVALID;
        }
        *index = end;
        return OSEO_REGEXP_VALID;
    }
    if (regexp_ascii_digit(unit)) {
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
            if (escape == 'b') {
                point = 0x08u;
            } else if (escape == 'c') {
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
            } else if (single) {
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
    uint64_t minimum = 0u;
    OseoRegExpValidation minimum_status = regexp_decimal_bound(
        source,
        minimum_start,
        cursor,
        &minimum
    );
    if (minimum_status != OSEO_REGEXP_VALID) return minimum_status;
    if (cursor < source->length && source->units[cursor] == '}') {
        *index = cursor;
        return OSEO_REGEXP_VALID;
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
        if (maximum_status != OSEO_REGEXP_VALID) return maximum_status;
        if (minimum > maximum) {
            return OSEO_REGEXP_INVALID;
        }
    }
    *index = cursor;
    return OSEO_REGEXP_VALID;
}

static OseoRegExpValidation regexp_validate_pattern(
    const OseoString *source,
    uint16_t flag_mask,
    size_t capture_count,
    const OseoRegExpNamedCaptureRegistry *named_captures,
    size_t *instruction_count
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
            OseoRegExpValidation status = regexp_escape(
                source,
                &index,
                flag_mask,
                capture_count,
                named_captures,
                false
            );
            if (status != OSEO_REGEXP_VALID) return status;
            can_quantify = true;
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
                            if (source->units[index + 3u] > 0x7fu) {
                                return OSEO_REGEXP_UNSUPPORTED;
                            }
                            return OSEO_REGEXP_INVALID;
                        }
                        index = end;
                    }
                } else if (kind == 'i' || kind == 'm' || kind == 's' ||
                           kind == '-') {
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
    *instruction_count = source->length + capture_count * 2u + 1u;
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
    };
    if (status == OSEO_REGEXP_VALID) {
        status = regexp_named_capture_registry_create(
            context,
            string_object(source),
            &named_captures
        );
    }
    size_t instruction_count = 0u;
    if (status == OSEO_REGEXP_VALID) {
        status = regexp_validate_pattern(
            string_object(source),
            flag_mask,
            capture_count,
            &named_captures,
            &instruction_count
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
    OseoValue slots[2] = {source, flags};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoRegExpMatcher *matcher = oseo_internal_allocate_heap_bytes(
        context,
        sizeof(*matcher)
    );
    OseoResult result;
    if (matcher == NULL) {
        result = failure(
            context,
            "OSEO2001",
            "RegExp matcher allocation failed."
        );
    } else {
        matcher->source = slots[0];
        matcher->flags = slots[1];
        matcher->capture_count = capture_count;
        matcher->instruction_count = instruction_count;
        matcher->flag_mask = flag_mask;
        result = oseo_internal_publish_heap(
            context,
            &matcher->header,
            OSEO_HEAP_REGEXP_MATCHER
        );
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
    if (code_id == OSEO_REGEXP_DEFERRED_CODE_ID) {
        return failure(
            context,
            "OSEO2001",
            "RegExp prototype execution is not admitted yet."
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
    static const char *const deferred_methods[] = {
        "exec",
        "test",
        "toString",
    };
    static const size_t deferred_lengths[] = {1u, 1u, 0u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = create_regexp_builtin(
            context,
            OSEO_REGEXP_DEFERRED_CODE_ID,
            deferred_methods[index],
            deferred_lengths[index],
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_regexp_property(
                context,
                frame.slots[0],
                deferred_methods[index],
                frame.slots[2],
                method
            );
        }
    }
    static const char *const deferred_accessors[] = {
        "dotAll",
        "flags",
        "global",
        "hasIndices",
        "ignoreCase",
        "multiline",
        "source",
        "sticky",
        "unicode",
        "unicodeSets",
    };
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 10u;
         index += 1u) {
        result = create_regexp_builtin(
            context,
            OSEO_REGEXP_DEFERRED_CODE_ID,
            deferred_accessors[index],
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_regexp_accessor(
                context,
                frame.slots[0],
                deferred_accessors[index],
                frame.slots[2]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_regexp_builtin(
            context,
            OSEO_REGEXP_DEFERRED_CODE_ID,
            "[Symbol.search]",
            0u,
            OSEO_FUNCTION_INTERNAL,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_SEARCH
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define_accessor(
            context,
            frame.slots[0],
            frame.slots[3],
            frame.slots[2],
            oseo_undefined(),
            true,
            false,
            (OseoPropertyAttributes){true, false, false, true}
        );
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
