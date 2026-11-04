#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * The JSON namespace and JSON.parse. The parser consumes the already
 * converted UTF-16 string directly, so this data grammar does not compile or
 * execute JavaScript source and does not cross the dynamic-source boundary.
 */

typedef struct {
    OseoContext *context;
    OseoValue text;
    size_t cursor;
    /* Build a JSON Parse Record for every value, for a callable reviver. */
    bool records;
} OseoJsonParser;

/*
 * A JSON Parse Record is a four-slot environment: the parsed value, the
 * start and end code-unit offsets of its source text, and its child
 * records. An array's children are an internal array of records in
 * element order. An object's children are a null-prototype object that
 * maps each member name to its record, so a later duplicate name
 * replaces the earlier record, as the last such member also gives the
 * property its value. A primitive has no children.
 */
enum {
    JSON_RECORD_VALUE = 0u,
    JSON_RECORD_START,
    JSON_RECORD_END,
    JSON_RECORD_CHILDREN,
    JSON_RECORD_SLOT_COUNT,
};

static OseoResult json_record_create(
    OseoContext *context,
    OseoValue value,
    size_t start,
    size_t end,
    OseoValue children
) {
    OseoValue slots[3] = {value, children, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(
        context,
        JSON_RECORD_SLOT_COUNT
    );
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        (void)oseo_environment_set(
            context, slots[2], JSON_RECORD_VALUE, slots[0]);
        (void)oseo_environment_set(
            context, slots[2], JSON_RECORD_START, oseo_number((double)start));
        (void)oseo_environment_set(
            context, slots[2], JSON_RECORD_END, oseo_number((double)end));
        (void)oseo_environment_set(
            context, slots[2], JSON_RECORD_CHILDREN, slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoValue json_record_slot(OseoValue record, size_t index) {
    return environment_object(record)->slots[index];
}

static OseoResult json_syntax_error(OseoJsonParser *parser) {
    return oseo_internal_throw_error(
        parser->context,
        OSEO_ERROR_SYNTAX,
        "Invalid JSON text."
    );
}

static OseoString *json_text(const OseoJsonParser *parser) {
    return string_object(parser->text);
}

static void json_skip_whitespace(OseoJsonParser *parser) {
    OseoString *text = json_text(parser);
    while (parser->cursor < text->length) {
        uint16_t unit = text->units[parser->cursor];
        if (unit != UINT16_C(0x0009) && unit != UINT16_C(0x000a) &&
            unit != UINT16_C(0x000d) && unit != UINT16_C(0x0020)) {
            break;
        }
        parser->cursor += 1u;
    }
}

static bool json_consume(OseoJsonParser *parser, uint16_t unit) {
    OseoString *text = json_text(parser);
    if (parser->cursor >= text->length ||
        text->units[parser->cursor] != unit) {
        return false;
    }
    parser->cursor += 1u;
    return true;
}

static int json_hex_digit(uint16_t unit) {
    if (unit >= UINT16_C('0') && unit <= UINT16_C('9')) {
        return (int)(unit - UINT16_C('0'));
    }
    if (unit >= UINT16_C('a') && unit <= UINT16_C('f')) {
        return (int)(unit - UINT16_C('a')) + 10;
    }
    if (unit >= UINT16_C('A') && unit <= UINT16_C('F')) {
        return (int)(unit - UINT16_C('A')) + 10;
    }
    return -1;
}

static OseoResult json_parse_string(OseoJsonParser *parser) {
    if (!json_consume(parser, UINT16_C('"'))) {
        return json_syntax_error(parser);
    }
    OseoString *text = json_text(parser);
    size_t capacity = text->length - parser->cursor;
    uint16_t *units = NULL;
    if (capacity > 0u) {
        if (capacity > SIZE_MAX / sizeof(*units)) {
            return failure(
                parser->context,
                "OSEO2001",
                "JSON string is too large."
            );
        }
        units = oseo_internal_allocate_work_bytes(
            parser->context,
            capacity * sizeof(*units)
        );
        if (units == NULL) {
            return failure(
                parser->context,
                "OSEO2001",
                "JSON string allocation failed."
            );
        }
    }
    size_t length = 0u;
    while (parser->cursor < json_text(parser)->length) {
        uint16_t unit = json_text(parser)->units[parser->cursor];
        parser->cursor += 1u;
        if (unit == UINT16_C('"')) {
            OseoResult result = oseo_string_from_units(
                parser->context,
                units,
                length
            );
            free(units);
            return result;
        }
        if (unit < UINT16_C(0x0020)) {
            free(units);
            return json_syntax_error(parser);
        }
        if (unit != UINT16_C('\\')) {
            units[length] = unit;
            length += 1u;
            continue;
        }
        text = json_text(parser);
        if (parser->cursor >= text->length) {
            free(units);
            return json_syntax_error(parser);
        }
        uint16_t escape = text->units[parser->cursor];
        parser->cursor += 1u;
        if (escape == UINT16_C('"') || escape == UINT16_C('\\') ||
            escape == UINT16_C('/')) {
            unit = escape;
        } else if (escape == UINT16_C('b')) {
            unit = UINT16_C(0x0008);
        } else if (escape == UINT16_C('f')) {
            unit = UINT16_C(0x000c);
        } else if (escape == UINT16_C('n')) {
            unit = UINT16_C(0x000a);
        } else if (escape == UINT16_C('r')) {
            unit = UINT16_C(0x000d);
        } else if (escape == UINT16_C('t')) {
            unit = UINT16_C(0x0009);
        } else if (escape == UINT16_C('u')) {
            uint16_t decoded = 0u;
            for (size_t index = 0u; index < 4u; index += 1u) {
                text = json_text(parser);
                if (parser->cursor >= text->length) {
                    free(units);
                    return json_syntax_error(parser);
                }
                int digit = json_hex_digit(text->units[parser->cursor]);
                if (digit < 0) {
                    free(units);
                    return json_syntax_error(parser);
                }
                parser->cursor += 1u;
                decoded = (uint16_t)(decoded * UINT16_C(16) +
                    (uint16_t)digit);
            }
            unit = decoded;
        } else {
            free(units);
            return json_syntax_error(parser);
        }
        units[length] = unit;
        length += 1u;
    }
    free(units);
    return json_syntax_error(parser);
}

static bool json_match_literal(OseoJsonParser *parser, const char *literal) {
    size_t length = strlen(literal);
    OseoString *text = json_text(parser);
    if (length > text->length - parser->cursor) return false;
    for (size_t index = 0u; index < length; index += 1u) {
        if (text->units[parser->cursor + index] !=
            (uint16_t)(unsigned char)literal[index]) {
            return false;
        }
    }
    parser->cursor += length;
    return true;
}

static bool json_decimal_digit(uint16_t unit) {
    return unit >= UINT16_C('0') && unit <= UINT16_C('9');
}

static OseoResult json_parse_number(OseoJsonParser *parser) {
    OseoString *text = json_text(parser);
    size_t start = parser->cursor;
    if (parser->cursor < text->length &&
        text->units[parser->cursor] == UINT16_C('-')) {
        parser->cursor += 1u;
    }
    if (parser->cursor >= text->length) return json_syntax_error(parser);
    uint16_t first = text->units[parser->cursor];
    if (first == UINT16_C('0')) {
        parser->cursor += 1u;
        if (parser->cursor < text->length &&
            json_decimal_digit(text->units[parser->cursor])) {
            return json_syntax_error(parser);
        }
    } else if (first >= UINT16_C('1') && first <= UINT16_C('9')) {
        do {
            parser->cursor += 1u;
        } while (parser->cursor < text->length &&
                 json_decimal_digit(text->units[parser->cursor]));
    } else {
        return json_syntax_error(parser);
    }
    if (parser->cursor < text->length &&
        text->units[parser->cursor] == UINT16_C('.')) {
        parser->cursor += 1u;
        if (parser->cursor >= text->length ||
            !json_decimal_digit(text->units[parser->cursor])) {
            return json_syntax_error(parser);
        }
        do {
            parser->cursor += 1u;
        } while (parser->cursor < text->length &&
                 json_decimal_digit(text->units[parser->cursor]));
    }
    if (parser->cursor < text->length &&
        (text->units[parser->cursor] == UINT16_C('e') ||
         text->units[parser->cursor] == UINT16_C('E'))) {
        parser->cursor += 1u;
        if (parser->cursor < text->length &&
            (text->units[parser->cursor] == UINT16_C('+') ||
             text->units[parser->cursor] == UINT16_C('-'))) {
            parser->cursor += 1u;
        }
        if (parser->cursor >= text->length ||
            !json_decimal_digit(text->units[parser->cursor])) {
            return json_syntax_error(parser);
        }
        do {
            parser->cursor += 1u;
        } while (parser->cursor < text->length &&
                 json_decimal_digit(text->units[parser->cursor]));
    }
    size_t length = parser->cursor - start;
    char *buffer = oseo_internal_allocate_work_bytes(
        parser->context,
        length + 1u
    );
    if (buffer == NULL) {
        return failure(
            parser->context,
            "OSEO2001",
            "JSON number allocation failed."
        );
    }
    text = json_text(parser);
    for (size_t index = 0u; index < length; index += 1u) {
        buffer[index] = (char)text->units[start + index];
    }
    buffer[length] = '\0';
    double number = strtod(buffer, NULL);
    free(buffer);
    return normal(oseo_number(number));
}

static OseoResult json_parse_value(
    OseoJsonParser *parser,
    size_t depth,
    OseoValue *record
);

static OseoResult json_index_key(OseoContext *context, size_t index) {
    char text[32];
    (void)snprintf(text, sizeof(text), "%zu", index);
    return oseo_internal_ascii_string(context, text);
}

/* Stores a container's record once its closing token is consumed. */
static OseoResult json_container_record(
    OseoJsonParser *parser,
    OseoResult result,
    OseoValue value,
    size_t start,
    OseoValue children,
    OseoValue *record
) {
    if (result.status != OSEO_STATUS_NORMAL || !parser->records) {
        return result;
    }
    OseoResult created = json_record_create(
        parser->context,
        value,
        start,
        parser->cursor,
        children
    );
    if (created.status != OSEO_STATUS_NORMAL) return created;
    *record = created.value;
    return result;
}

static OseoResult json_parse_array(
    OseoJsonParser *parser,
    size_t depth,
    OseoValue *record
) {
    size_t start = parser->cursor;
    parser->cursor += 1u;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(parser->context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 3: the children array, 4: the current element's record. */
    result = oseo_array_create(parser->context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && parser->records) {
        result = oseo_array_create(parser->context, 0u);
        frame.slots[3] = result.value;
    }
    json_skip_whitespace(parser);
    if (result.status == OSEO_STATUS_NORMAL &&
        json_consume(parser, UINT16_C(']'))) {
        result.value = frame.slots[0];
        result = json_container_record(
            parser, result, frame.slots[0], start, frame.slots[3], record);
        oseo_roots_release(parser->context, &frame);
        return result;
    }
    size_t index = 0u;
    while (result.status == OSEO_STATUS_NORMAL) {
        result = json_parse_value(parser, depth + 1u, &frame.slots[4]);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (parser->records) {
            result = oseo_array_append(
                parser->context,
                frame.slots[3],
                frame.slots[4]
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        }
        result = json_index_key(parser->context, index);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            parser->context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            (OseoPropertyAttributes){true, true, true, false}
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        index += 1u;
        json_skip_whitespace(parser);
        if (json_consume(parser, UINT16_C(']'))) break;
        if (!json_consume(parser, UINT16_C(','))) {
            result = json_syntax_error(parser);
            break;
        }
        json_skip_whitespace(parser);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    result = json_container_record(
        parser, result, frame.slots[0], start, frame.slots[3], record);
    oseo_roots_release(parser->context, &frame);
    return result;
}

static OseoResult json_parse_object(
    OseoJsonParser *parser,
    size_t depth,
    OseoValue *record
) {
    size_t start = parser->cursor;
    parser->cursor += 1u;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(parser->context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 3: the member-name map of records, 4: the current record. */
    result = oseo_object_literal_create(parser->context);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && parser->records) {
        result = oseo_object_create(parser->context, oseo_null());
        frame.slots[3] = result.value;
    }
    json_skip_whitespace(parser);
    if (result.status == OSEO_STATUS_NORMAL &&
        json_consume(parser, UINT16_C('}'))) {
        result.value = frame.slots[0];
        result = json_container_record(
            parser, result, frame.slots[0], start, frame.slots[3], record);
        oseo_roots_release(parser->context, &frame);
        return result;
    }
    while (result.status == OSEO_STATUS_NORMAL) {
        result = json_parse_string(parser);
        frame.slots[1] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        json_skip_whitespace(parser);
        if (!json_consume(parser, UINT16_C(':'))) {
            result = json_syntax_error(parser);
            break;
        }
        json_skip_whitespace(parser);
        result = json_parse_value(parser, depth + 1u, &frame.slots[4]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            parser->context,
            frame.slots[0],
            frame.slots[1],
            frame.slots[2],
            (OseoPropertyAttributes){true, true, true, false}
        );
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (parser->records) {
            result = oseo_object_define(
                parser->context,
                frame.slots[3],
                frame.slots[1],
                frame.slots[4],
                (OseoPropertyAttributes){true, true, true, false}
            );
            if (result.status != OSEO_STATUS_NORMAL) break;
        }
        json_skip_whitespace(parser);
        if (json_consume(parser, UINT16_C('}'))) break;
        if (!json_consume(parser, UINT16_C(','))) {
            result = json_syntax_error(parser);
            break;
        }
        json_skip_whitespace(parser);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    result = json_container_record(
        parser, result, frame.slots[0], start, frame.slots[3], record);
    oseo_roots_release(parser->context, &frame);
    return result;
}

static OseoResult json_parse_primitive(OseoJsonParser *parser);

/*
 * Parses one value. With records requested, `record` receives its JSON
 * Parse Record; it must be a rooted slot.
 */
static OseoResult json_parse_value(
    OseoJsonParser *parser,
    size_t depth,
    OseoValue *record
) {
    if (depth >= OSEO_MAX_CALL_DEPTH) {
        return oseo_internal_throw_error(
            parser->context,
            OSEO_ERROR_RANGE,
            "Maximum JSON nesting depth exceeded."
        );
    }
    json_skip_whitespace(parser);
    OseoString *text = json_text(parser);
    if (parser->cursor >= text->length) return json_syntax_error(parser);
    uint16_t unit = text->units[parser->cursor];
    if (unit == UINT16_C('[')) return json_parse_array(parser, depth, record);
    if (unit == UINT16_C('{')) {
        return json_parse_object(parser, depth, record);
    }
    size_t start = parser->cursor;
    OseoResult result = json_parse_primitive(parser);
    if (result.status != OSEO_STATUS_NORMAL || !parser->records) {
        return result;
    }
    OseoValue slots[1] = {result.value};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(parser->context, &frame);
    OseoResult created = json_record_create(
        parser->context,
        slots[0],
        start,
        parser->cursor,
        oseo_undefined()
    );
    if (created.status == OSEO_STATUS_NORMAL) {
        *record = created.value;
        created.value = slots[0];
    }
    oseo_roots_pop(parser->context, &frame);
    return created;
}

/* A string, number, or literal name at the cursor. */
static OseoResult json_parse_primitive(OseoJsonParser *parser) {
    OseoString *text = json_text(parser);
    uint16_t unit = text->units[parser->cursor];
    if (unit == UINT16_C('"')) return json_parse_string(parser);
    if (unit == UINT16_C('-') || json_decimal_digit(unit)) {
        return json_parse_number(parser);
    }
    if (json_match_literal(parser, "null")) return normal(oseo_null());
    if (json_match_literal(parser, "false")) {
        return normal(oseo_boolean(false));
    }
    if (json_match_literal(parser, "true")) {
        return normal(oseo_boolean(true));
    }
    return json_syntax_error(parser);
}

static OseoResult json_parse_text(
    OseoContext *context,
    OseoValue text,
    OseoValue *record
) {
    OseoJsonParser parser = {context, text, 0u, record != NULL};
    OseoResult result = json_parse_value(&parser, 0u, record);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    json_skip_whitespace(&parser);
    if (parser.cursor != json_text(&parser)->length) {
        return json_syntax_error(&parser);
    }
    return result;
}

static OseoResult json_define_revived(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    OseoValue value
) {
    const char *refusal = NULL;
    return oseo_internal_define_data_reported(
        context,
        object,
        key,
        value,
        (OseoPropertyAttributes){true, true, true, false},
        true,
        false,
        &refusal
    );
}

static OseoResult json_array_length(
    OseoContext *context,
    OseoValue array,
    size_t *length
) {
    *length = 0u;
    if (is_array(array)) {
        *length = ordinary_object(array)->array_length;
        return normal(oseo_undefined());
    }
    OseoValue slots[2] = {array, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, "length");
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, slots[0], slots[1]);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_number(context, slots[1]);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        double value = number_value(result.value);
        if (value > 0.0) {
            value = floor(value);
            if (value > OSEO_INDEX_LIMIT) value = OSEO_INDEX_LIMIT;
            if (value > (double)SIZE_MAX) value = (double)SIZE_MAX;
            *length = (size_t)value;
        }
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_number((double)*length))
        : result;
}

static OseoResult json_own_enumerable(
    OseoContext *context,
    OseoValue object,
    OseoValue key,
    bool *enumerable
) {
    OseoValue ignored = oseo_undefined();
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    bool found = false;
    bool numeric = false;
    OseoResult element = oseo_internal_typed_array_own_property(
        context,
        object,
        key,
        &numeric,
        &found
    );
    if (element.status != OSEO_STATUS_NORMAL || numeric) {
        /* A valid TypedArray element is always enumerable. */
        *enumerable = element.status == OSEO_STATUS_NORMAL && found;
        return element;
    }
    OseoResult result = is_proxy(object)
        ? oseo_internal_proxy_get_own_property(
            context,
            object,
            key,
            &found,
            &ignored,
            &attributes,
            &getter,
            &setter
        )
        : normal(oseo_boolean(
            (found = oseo_internal_own_property_descriptor(
                context,
                object,
                key,
                &ignored,
                &attributes,
                &getter,
                &setter
            ))
        ));
    if (result.status == OSEO_STATUS_NORMAL && found) {
        result = oseo_internal_namespace_export_ready(
            context, object, ignored);
    }
    *enumerable = result.status == OSEO_STATUS_NORMAL &&
        found && attributes.enumerable;
    return result;
}

/*
 * The record of one child of a container whose own record still
 * describes it: element `index` of an array's children or the member
 * `key` of an object's map. A child added after parsing has none.
 */
static OseoResult json_child_record(
    OseoContext *context,
    OseoValue children,
    OseoValue key,
    size_t index,
    bool array
) {
    if (!is_object(children)) return normal(oseo_undefined());
    if (array && index >= ordinary_object(children)->array_length) {
        return normal(oseo_undefined());
    }
    /* Both maps are internal own data properties, so no user code runs. */
    return oseo_object_get(context, children, key);
}

/*
 * InternalizeJSONProperty with a JSON Parse Record. The record applies
 * only while the holder's property still has the parsed value: then a
 * primitive's context gets its `source` text and a container's children
 * keep their records. A value a reviver replaced has neither.
 */
static OseoResult json_internalize(
    OseoContext *context,
    OseoValue holder,
    OseoValue name,
    OseoValue reviver,
    OseoValue record,
    OseoValue source,
    size_t depth
) {
    if (depth >= OSEO_MAX_CALL_DEPTH) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Maximum JSON reviver depth exceeded."
        );
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 14u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 9: the record, 10: the source text, 11: the children, 12: the
     * reviver's context object, 13: a child record. */
    frame.slots[0] = holder;
    frame.slots[1] = name;
    frame.slots[2] = reviver;
    frame.slots[9] = record;
    frame.slots[10] = source;
    result = oseo_object_get(context, frame.slots[0], frame.slots[1]);
    frame.slots[3] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_literal_create(context);
        frame.slots[12] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_environment(frame.slots[9]) &&
        oseo_internal_same_value(
            json_record_slot(frame.slots[9], JSON_RECORD_VALUE),
            frame.slots[3]
        )) {
        frame.slots[11] = json_record_slot(
            frame.slots[9],
            JSON_RECORD_CHILDREN
        );
        if (!is_object(frame.slots[3])) {
            size_t start = (size_t)number_value(
                json_record_slot(frame.slots[9], JSON_RECORD_START));
            size_t end = (size_t)number_value(
                json_record_slot(frame.slots[9], JSON_RECORD_END));
            result = oseo_string_from_units(
                context,
                string_object(frame.slots[10])->units + start,
                end - start
            );
            frame.slots[13] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_internal_ascii_string(context, "source");
                frame.slots[6] = result.value;
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_object_define(
                    context,
                    frame.slots[12],
                    frame.slots[6],
                    frame.slots[13],
                    (OseoPropertyAttributes){true, true, true, false}
                );
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && is_object(frame.slots[3])) {
        result = oseo_internal_is_array(context, frame.slots[3]);
        bool array = result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value);
        if (result.status == OSEO_STATUS_NORMAL && array) {
            size_t length = 0u;
            result = json_array_length(context, frame.slots[3], &length);
            for (size_t index = 0u;
                 result.status == OSEO_STATUS_NORMAL && index < length;
                 index += 1u) {
                result = json_index_key(context, index);
                frame.slots[6] = result.value;
                if (result.status != OSEO_STATUS_NORMAL) break;
                result = json_child_record(
                    context,
                    frame.slots[11],
                    frame.slots[6],
                    index,
                    true
                );
                frame.slots[13] = result.value;
                if (result.status != OSEO_STATUS_NORMAL) break;
                result = json_internalize(
                    context,
                    frame.slots[3],
                    frame.slots[6],
                    frame.slots[2],
                    frame.slots[13],
                    frame.slots[10],
                    depth + 1u
                );
                frame.slots[7] = result.value;
                if (result.status != OSEO_STATUS_NORMAL) break;
                if (tag_of(frame.slots[7]) == OSEO_TAG_UNDEFINED) {
                    result = oseo_object_delete(
                        context,
                        frame.slots[3],
                        frame.slots[6],
                        false
                    );
                } else {
                    result = json_define_revived(
                        context,
                        frame.slots[3],
                        frame.slots[6],
                        frame.slots[7]
                    );
                }
            }
        } else if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_own_key_array(
                context,
                frame.slots[3],
                OSEO_OWN_KEY_STRINGS
            );
            frame.slots[4] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_argument_list_create(context);
                frame.slots[5] = result.value;
            }
            size_t key_count = result.status == OSEO_STATUS_NORMAL
                ? ordinary_object(frame.slots[4])->array_length
                : 0u;
            for (size_t index = 0u;
                 result.status == OSEO_STATUS_NORMAL && index < key_count;
                 index += 1u) {
                result = json_index_key(context, index);
                frame.slots[6] = result.value;
                if (result.status == OSEO_STATUS_NORMAL) {
                    result = oseo_object_get(
                        context,
                        frame.slots[4],
                        frame.slots[6]
                    );
                    frame.slots[6] = result.value;
                }
                if (result.status != OSEO_STATUS_NORMAL) break;
                bool enumerable = false;
                result = json_own_enumerable(
                    context,
                    frame.slots[3],
                    frame.slots[6],
                    &enumerable
                );
                if (result.status == OSEO_STATUS_NORMAL && enumerable) {
                    result = oseo_argument_list_append(
                        context,
                        frame.slots[5],
                        frame.slots[6]
                    );
                }
            }
            size_t enumerable_count = 0u;
            if (result.status == OSEO_STATUS_NORMAL) {
                const OseoValue *ignored = NULL;
                result = oseo_argument_list_view(
                    context,
                    frame.slots[5],
                    &enumerable_count,
                    &ignored
                );
            }
            for (size_t index = 0u;
                 result.status == OSEO_STATUS_NORMAL &&
                     index < enumerable_count;
                 index += 1u) {
                size_t current_count = 0u;
                const OseoValue *keys = NULL;
                result = oseo_argument_list_view(
                    context,
                    frame.slots[5],
                    &current_count,
                    &keys
                );
                if (result.status != OSEO_STATUS_NORMAL ||
                    index >= current_count) {
                    break;
                }
                frame.slots[6] = keys[index];
                result = json_child_record(
                    context,
                    frame.slots[11],
                    frame.slots[6],
                    0u,
                    false
                );
                frame.slots[13] = result.value;
                if (result.status != OSEO_STATUS_NORMAL) break;
                result = json_internalize(
                    context,
                    frame.slots[3],
                    frame.slots[6],
                    frame.slots[2],
                    frame.slots[13],
                    frame.slots[10],
                    depth + 1u
                );
                frame.slots[7] = result.value;
                if (result.status != OSEO_STATUS_NORMAL) break;
                if (tag_of(frame.slots[7]) == OSEO_TAG_UNDEFINED) {
                    result = oseo_object_delete(
                        context,
                        frame.slots[3],
                        frame.slots[6],
                        false
                    );
                } else {
                    result = json_define_revived(
                        context,
                        frame.slots[3],
                        frame.slots[6],
                        frame.slots[7]
                    );
                }
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /* name, value, and context occupy slots 7 to 9. */
        frame.slots[7] = frame.slots[1];
        frame.slots[8] = frame.slots[3];
        frame.slots[9] = frame.slots[12];
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            3u,
            &frame.slots[7],
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

static OseoValue json_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

static OseoResult json_parse(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /* 5: the root's JSON Parse Record, 6: the source text. */
    frame.slots[0] = json_argument(argument_count, arguments, 0u);
    frame.slots[1] = json_argument(argument_count, arguments, 1u);
    /* IsCallable runs no user code, so asking it before parsing decides
     * whether the parser builds records without changing any order. */
    bool reviving = is_callable(frame.slots[1]);
    result = oseo_to_string(context, frame.slots[0]);
    frame.slots[2] = result.value;
    frame.slots[6] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_parse_text(
            context,
            frame.slots[2],
            reviving ? &frame.slots[5] : NULL
        );
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && reviving) {
        result = oseo_object_literal_create(context);
        frame.slots[4] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(context, "");
            frame.slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_define(
                context,
                frame.slots[4],
                frame.slots[2],
                frame.slots[3],
                (OseoPropertyAttributes){true, true, true, false}
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = json_internalize(
                context,
                frame.slots[4],
                frame.slots[2],
                frame.slots[1],
                frame.slots[5],
                frame.slots[6],
                0u
            );
        }
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result.value = frame.slots[3];
    }
    oseo_roots_release(context, &frame);
    return result;
}

typedef struct OseoJsonAncestor OseoJsonAncestor;
struct OseoJsonAncestor {
    OseoValue value;
    const OseoJsonAncestor *parent;
};

typedef struct {
    OseoContext *context;
    OseoValue replacer;
    OseoValue property_list;
    OseoValue to_json_key;
    uint16_t gap[10];
    size_t gap_length;
    OseoStringBuilder *builder;
} OseoJsonStringifier;

static bool json_is_property_list(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP &&
           heap_object(value)->kind == OSEO_HEAP_ARGUMENT_LIST;
}

static OseoResult json_append_units(OseoJsonStringifier *stringifier,
                                    const uint16_t *units,
                                    size_t length) {
    return oseo_internal_string_builder_append(
        stringifier->context, stringifier->builder, units, length);
}

static OseoResult json_append_ascii(OseoJsonStringifier *stringifier,
                                    const char *text) {
    size_t length = strlen(text);
    uint16_t units[16];
    if (length > sizeof(units) / sizeof(units[0])) {
        return failure(stringifier->context,
                       "OSEO2001",
                       "Internal JSON fragment is too large.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return json_append_units(stringifier, units, length);
}

static OseoResult json_quote_string(OseoJsonStringifier *stringifier,
                                    OseoValue value) {
    static const uint16_t hex[] = {'0',
                                   '1',
                                   '2',
                                   '3',
                                   '4',
                                   '5',
                                   '6',
                                   '7',
                                   '8',
                                   '9',
                                   'a',
                                   'b',
                                   'c',
                                   'd',
                                   'e',
                                   'f'};
    OseoResult result = json_append_ascii(stringifier, "\"");
    OseoString *string = string_object(value);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < string->length;
         index += 1u) {
        uint16_t unit = string->units[index];
        const char *escape = NULL;
        if (unit == UINT16_C('"'))
            escape = "\\\"";
        else if (unit == UINT16_C('\\'))
            escape = "\\\\";
        else if (unit == UINT16_C(0x0008))
            escape = "\\b";
        else if (unit == UINT16_C(0x000c))
            escape = "\\f";
        else if (unit == UINT16_C(0x000a))
            escape = "\\n";
        else if (unit == UINT16_C(0x000d))
            escape = "\\r";
        else if (unit == UINT16_C(0x0009))
            escape = "\\t";
        if (escape != NULL) {
            result = json_append_ascii(stringifier, escape);
            continue;
        }
        bool leading = unit >= UINT16_C(0xd800) && unit <= UINT16_C(0xdbff);
        bool trailing = unit >= UINT16_C(0xdc00) && unit <= UINT16_C(0xdfff);
        bool paired = leading && index + 1u < string->length &&
                      string->units[index + 1u] >= UINT16_C(0xdc00) &&
                      string->units[index + 1u] <= UINT16_C(0xdfff);
        if (unit < UINT16_C(0x0020) || trailing || (leading && !paired)) {
            uint16_t escaped[] = {'\\',
                                  'u',
                                  hex[(unit >> 12u) & 0x0fu],
                                  hex[(unit >> 8u) & 0x0fu],
                                  hex[(unit >> 4u) & 0x0fu],
                                  hex[unit & 0x0fu]};
            result = json_append_units(stringifier, escaped, 6u);
        } else {
            result = json_append_units(stringifier, &unit, 1u);
            if (result.status == OSEO_STATUS_NORMAL && paired) {
                index += 1u;
                unit = string->units[index];
                result = json_append_units(stringifier, &unit, 1u);
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_append_ascii(stringifier, "\"");
    }
    return result;
}

static OseoResult json_append_indent(OseoJsonStringifier *stringifier,
                                     size_t depth) {
    if (stringifier->gap_length == 0u) {
        return normal(oseo_undefined());
    }
    OseoResult result = json_append_ascii(stringifier, "\n");
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < depth;
         index += 1u) {
        result = json_append_units(
            stringifier, stringifier->gap, stringifier->gap_length);
    }
    return result;
}

static bool json_has_ancestor(const OseoJsonAncestor *ancestor,
                              OseoValue value) {
    while (ancestor != NULL) {
        if (ancestor->value == value) return true;
        ancestor = ancestor->parent;
    }
    return false;
}

static OseoResult json_serialize_property(OseoJsonStringifier *stringifier,
                                          OseoValue holder,
                                          OseoValue key,
                                          const OseoJsonAncestor *ancestor,
                                          size_t depth,
                                          bool *serialized);

static OseoResult json_cycle_error(OseoContext *context) {
    return oseo_internal_throw_error(
        context, OSEO_ERROR_TYPE, "Converting circular structure to JSON.");
}

static OseoResult json_serialize_array(OseoJsonStringifier *stringifier,
                                       OseoValue value,
                                       const OseoJsonAncestor *ancestor,
                                       size_t depth) {
    if (json_has_ancestor(ancestor, value)) {
        return json_cycle_error(stringifier->context);
    }
    if (depth >= OSEO_MAX_CALL_DEPTH) {
        return oseo_internal_throw_error(
            stringifier->context,
            OSEO_ERROR_RANGE,
            "Maximum JSON stringify depth exceeded.");
    }
    OseoValue slots[2] = {value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(stringifier->context, &frame);
    size_t length = 0u;
    OseoResult result =
        json_array_length(stringifier->context, slots[0], &length);
    OseoJsonAncestor current = {slots[0], ancestor};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_append_ascii(stringifier, "[");
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        if (index > 0u) result = json_append_ascii(stringifier, ",");
        if (result.status == OSEO_STATUS_NORMAL &&
            stringifier->gap_length > 0u) {
            result = json_append_indent(stringifier, depth + 1u);
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = json_index_key(stringifier->context, index);
        slots[1] = result.value;
        bool element = false;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = json_serialize_property(stringifier,
                                             slots[0],
                                             slots[1],
                                             &current,
                                             depth + 1u,
                                             &element);
        }
        if (result.status == OSEO_STATUS_NORMAL && !element) {
            result = json_append_ascii(stringifier, "null");
        }
    }
    if (result.status == OSEO_STATUS_NORMAL && length > 0u &&
        stringifier->gap_length > 0u) {
        result = json_append_indent(stringifier, depth);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_append_ascii(stringifier, "]");
    }
    oseo_roots_pop(stringifier->context, &frame);
    return result;
}

static OseoResult json_snapshot_object_keys(OseoJsonStringifier *stringifier,
                                            OseoValue object) {
    if (json_is_property_list(stringifier->property_list)) {
        return normal(stringifier->property_list);
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(stringifier->context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = object;
    result = oseo_internal_own_key_array(
        stringifier->context, frame.slots[0], OSEO_OWN_KEY_STRINGS);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(stringifier->context);
        frame.slots[2] = result.value;
    }
    size_t count = result.status == OSEO_STATUS_NORMAL
                       ? ordinary_object(frame.slots[1])->array_length
                       : 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < count;
         index += 1u) {
        result = json_index_key(stringifier->context, index);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                stringifier->context, frame.slots[1], frame.slots[3]);
            frame.slots[3] = result.value;
        }
        bool enumerable = false;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = json_own_enumerable(stringifier->context,
                                         frame.slots[0],
                                         frame.slots[3],
                                         &enumerable);
        }
        if (result.status == OSEO_STATUS_NORMAL && enumerable) {
            result = oseo_argument_list_append(
                stringifier->context, frame.slots[2], frame.slots[3]);
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[2];
    oseo_roots_release(stringifier->context, &frame);
    return result;
}

static OseoResult json_serialize_object(OseoJsonStringifier *stringifier,
                                        OseoValue value,
                                        const OseoJsonAncestor *ancestor,
                                        size_t depth) {
    if (json_has_ancestor(ancestor, value)) {
        return json_cycle_error(stringifier->context);
    }
    if (depth >= OSEO_MAX_CALL_DEPTH) {
        return oseo_internal_throw_error(
            stringifier->context,
            OSEO_ERROR_RANGE,
            "Maximum JSON stringify depth exceeded.");
    }
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(stringifier->context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = value;
    result = json_snapshot_object_keys(stringifier, frame.slots[0]);
    frame.slots[1] = result.value;
    OseoArgumentList *keys =
        result.status == OSEO_STATUS_NORMAL
            ? (OseoArgumentList *)heap_object(frame.slots[1])
            : NULL;
    OseoJsonAncestor current = {frame.slots[0], ancestor};
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_append_ascii(stringifier, "{");
    }
    size_t emitted = 0u;
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < keys->length;
         index += 1u) {
        OseoStringBuilder member = {NULL, 0u, 0u};
        OseoStringBuilder *outer = stringifier->builder;
        stringifier->builder = &member;
        bool present = false;
        result = json_serialize_property(stringifier,
                                         frame.slots[0],
                                         keys->values[index],
                                         &current,
                                         depth + 1u,
                                         &present);
        stringifier->builder = outer;
        if (result.status == OSEO_STATUS_NORMAL && present) {
            if (emitted > 0u) result = json_append_ascii(stringifier, ",");
            if (result.status == OSEO_STATUS_NORMAL &&
                stringifier->gap_length > 0u) {
                result = json_append_indent(stringifier, depth + 1u);
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = json_quote_string(stringifier, keys->values[index]);
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result = json_append_ascii(
                    stringifier, stringifier->gap_length > 0u ? ": " : ":");
            }
            if (result.status == OSEO_STATUS_NORMAL) {
                result =
                    json_append_units(stringifier, member.units, member.length);
            }
            emitted += 1u;
        }
        oseo_internal_string_builder_release(&member);
    }
    if (result.status == OSEO_STATUS_NORMAL && emitted > 0u &&
        stringifier->gap_length > 0u) {
        result = json_append_indent(stringifier, depth);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_append_ascii(stringifier, "}");
    }
    oseo_roots_release(stringifier->context, &frame);
    return result;
}

static OseoResult json_serialize_property(OseoJsonStringifier *stringifier,
                                          OseoValue holder,
                                          OseoValue key,
                                          const OseoJsonAncestor *ancestor,
                                          size_t depth,
                                          bool *serialized) {
    *serialized = false;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(stringifier->context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = holder;
    frame.slots[1] = key;
    result =
        oseo_object_get(stringifier->context, frame.slots[0], frame.slots[1]);
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL &&
        (is_object(frame.slots[2]) || is_bigint(frame.slots[2]))) {
        result = oseo_object_get(
            stringifier->context, frame.slots[2], stringifier->to_json_key);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL &&
            is_callable(frame.slots[3])) {
            frame.slots[4] = frame.slots[1];
            result = oseo_call_function(stringifier->context,
                                        frame.slots[3],
                                        frame.slots[2],
                                        1u,
                                        &frame.slots[4],
                                        oseo_undefined());
            frame.slots[2] = result.value;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_callable(stringifier->replacer)) {
        frame.slots[3] = frame.slots[1];
        frame.slots[4] = frame.slots[2];
        result = oseo_call_function(stringifier->context,
                                    stringifier->replacer,
                                    frame.slots[0],
                                    2u,
                                    &frame.slots[3],
                                    oseo_undefined());
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_object(frame.slots[2]) &&
        heap_object(frame.slots[2])->raw_json) {
        /* A raw JSON object's frozen own `rawJSON` text is emitted as is;
         * reading it runs no user code. */
        result = oseo_internal_ascii_string(stringifier->context, "rawJSON");
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(
                stringifier->context, frame.slots[2], frame.slots[3]);
            frame.slots[3] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoString *text = string_object(frame.slots[3]);
            result = json_append_units(stringifier, text->units, text->length);
            *serialized = result.status == OSEO_STATUS_NORMAL;
        }
        oseo_roots_release(stringifier->context, &frame);
        return result;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_object(frame.slots[2]) &&
        !is_proxy(frame.slots[2]) &&
        heap_object(frame.slots[2])->kind == OSEO_HEAP_OBJECT) {
        OseoOrdinaryObject *wrapper = ordinary_object(frame.slots[2]);
        if (wrapper->number_data) {
            result = oseo_internal_to_number(
                stringifier->context,
                frame.slots[2]
            );
            frame.slots[2] = result.value;
        } else if (wrapper->primitive_data) {
            OseoValue primitive = wrapper->primitive_value;
            if (is_string(primitive)) {
                result = oseo_to_string(
                    stringifier->context,
                    frame.slots[2]
                );
                frame.slots[2] = result.value;
            } else if (is_bigint(primitive) ||
                tag_of(primitive) == OSEO_TAG_BOOLEAN) {
                frame.slots[2] = primitive;
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        uint64_t tag = tag_of(frame.slots[2]);
        if (tag == OSEO_TAG_NULL) {
            result = json_append_ascii(stringifier, "null");
            *serialized = result.status == OSEO_STATUS_NORMAL;
        } else if (tag == OSEO_TAG_BOOLEAN) {
            result = json_append_ascii(
                stringifier,
                oseo_to_boolean(frame.slots[2]) ? "true" : "false");
            *serialized = result.status == OSEO_STATUS_NORMAL;
        } else if (is_string(frame.slots[2])) {
            result = json_quote_string(stringifier, frame.slots[2]);
            *serialized = result.status == OSEO_STATUS_NORMAL;
        } else if (is_number(frame.slots[2])) {
            double number = number_value(frame.slots[2]);
            if (!isfinite(number)) {
                result = json_append_ascii(stringifier, "null");
            } else {
                result = oseo_to_string(stringifier->context, frame.slots[2]);
                frame.slots[3] = result.value;
                if (result.status == OSEO_STATUS_NORMAL) {
                    OseoString *text = string_object(frame.slots[3]);
                    result = json_append_units(
                        stringifier, text->units, text->length);
                }
            }
            *serialized = result.status == OSEO_STATUS_NORMAL;
        } else if (is_bigint(frame.slots[2])) {
            result = oseo_internal_throw_error(
                stringifier->context,
                OSEO_ERROR_TYPE,
                "Do not know how to serialize a BigInt.");
        } else if (is_object(frame.slots[2]) && !is_callable(frame.slots[2])) {
            result =
                oseo_internal_is_array(stringifier->context, frame.slots[2]);
            if (result.status == OSEO_STATUS_NORMAL) {
                bool array = oseo_to_boolean(result.value);
                result =
                    array ? json_serialize_array(
                                stringifier, frame.slots[2], ancestor, depth)
                          : json_serialize_object(
                                stringifier, frame.slots[2], ancestor, depth);
                *serialized = result.status == OSEO_STATUS_NORMAL;
            }
        }
    }
    oseo_roots_release(stringifier->context, &frame);
    return result;
}

static bool json_string_or_number_wrapper(OseoValue value) {
    if (!is_object(value) || is_proxy(value) ||
        heap_object(value)->kind != OSEO_HEAP_OBJECT)
        return false;
    OseoOrdinaryObject *wrapper = ordinary_object(value);
    return wrapper->number_data ||
           (wrapper->primitive_data && is_string(wrapper->primitive_value));
}

static OseoResult json_replacer_property_list(OseoContext *context,
                                              OseoValue replacer) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = replacer;
    result = oseo_argument_list_create(context);
    frame.slots[1] = result.value;
    size_t length = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_array_length(context, frame.slots[0], &length);
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < length;
         index += 1u) {
        result = json_index_key(context, index);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_object_get(context, frame.slots[0], frame.slots[2]);
            frame.slots[2] = result.value;
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (is_string(frame.slots[2]) || is_number(frame.slots[2]) ||
            json_string_or_number_wrapper(frame.slots[2])) {
            result = oseo_to_string(context, frame.slots[2]);
            frame.slots[2] = result.value;
            if (result.status != OSEO_STATUS_NORMAL) break;
            OseoArgumentList *list =
                (OseoArgumentList *)heap_object(frame.slots[1]);
            bool duplicate = false;
            for (size_t item = 0u; item < list->length; item += 1u) {
                if (oseo_internal_string_equal(list->values[item],
                                               frame.slots[2])) {
                    duplicate = true;
                    break;
                }
            }
            if (!duplicate) {
                result = oseo_argument_list_append(
                    context, frame.slots[1], frame.slots[2]);
            }
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static OseoResult json_stringify(OseoContext *context,
                                 size_t argument_count,
                                 const OseoValue *arguments) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 8u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = json_argument(argument_count, arguments, 0u);
    frame.slots[1] = json_argument(argument_count, arguments, 1u);
    frame.slots[2] = json_argument(argument_count, arguments, 2u);
    frame.slots[3] =
        is_callable(frame.slots[1]) ? frame.slots[1] : oseo_undefined();
    frame.slots[4] = oseo_undefined();
    if (!is_callable(frame.slots[1])) {
        result = oseo_internal_is_array(context, frame.slots[1]);
        if (result.status == OSEO_STATUS_NORMAL &&
            oseo_to_boolean(result.value)) {
            result = json_replacer_property_list(context, frame.slots[1]);
            frame.slots[4] = result.value;
        }
    }
    OseoJsonStringifier stringifier = {context,
                                       frame.slots[3],
                                       frame.slots[4],
                                       oseo_undefined(),
                                       {0u},
                                       0u,
                                       NULL};
    if (result.status == OSEO_STATUS_NORMAL &&
        json_string_or_number_wrapper(frame.slots[2])) {
        OseoOrdinaryObject *wrapper = ordinary_object(frame.slots[2]);
        result = wrapper->number_data
                     ? oseo_internal_to_number(context, frame.slots[2])
                     : oseo_to_string(context, frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && is_number(frame.slots[2])) {
        double width = number_value(frame.slots[2]);
        if (isnan(width) || width <= 0.0)
            width = 0.0;
        else if (width >= 10.0)
            width = 10.0;
        else
            width = floor(width);
        stringifier.gap_length = (size_t)width;
        for (size_t index = 0u; index < stringifier.gap_length; index += 1u) {
            stringifier.gap[index] = UINT16_C(' ');
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_string(frame.slots[2])) {
        OseoString *gap = string_object(frame.slots[2]);
        stringifier.gap_length = gap->length < 10u ? gap->length : 10u;
        memcpy(stringifier.gap,
               gap->units,
               stringifier.gap_length * sizeof(uint16_t));
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "toJSON");
        frame.slots[5] = result.value;
        stringifier.to_json_key = frame.slots[5];
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_literal_create(context);
        frame.slots[6] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "");
        frame.slots[7] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[6],
            frame.slots[7],
            frame.slots[0],
            (OseoPropertyAttributes){true, true, true, false});
    }
    OseoStringBuilder builder = {NULL, 0u, 0u};
    stringifier.builder = &builder;
    bool serialized = false;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_serialize_property(&stringifier,
                                         frame.slots[6],
                                         frame.slots[7],
                                         NULL,
                                         0u,
                                         &serialized);
    }
    if (result.status == OSEO_STATUS_NORMAL && serialized) {
        result = oseo_string_from_units(context, builder.units, builder.length);
    } else if (result.status == OSEO_STATUS_NORMAL) {
        result = normal(oseo_undefined());
    }
    oseo_internal_string_builder_release(&builder);
    oseo_roots_release(context, &frame);
    return result;
}

static bool json_raw_edge(uint16_t unit) {
    return unit == UINT16_C(0x09) || unit == UINT16_C(0x0a) ||
        unit == UINT16_C(0x0d) || unit == UINT16_C(0x20);
}

/*
 * JSON.rawJSON(text): the text must be one JSON null, boolean, number,
 * or string with no surrounding whitespace. The result is a frozen
 * null-prototype object with [[IsRawJSON]] and one `rawJSON` property.
 */
static OseoResult json_raw_json(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_to_string(
        context,
        json_argument(argument_count, arguments, 0u)
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoString *text = string_object(frame.slots[0]);
        if (text->length == 0u || json_raw_edge(text->units[0]) ||
            json_raw_edge(text->units[text->length - 1u]) ||
            text->units[0] == UINT16_C('[') ||
            text->units[0] == UINT16_C('{')) {
            result = oseo_internal_throw_error(
                context,
                OSEO_ERROR_SYNTAX,
                "Invalid raw JSON text."
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_parse_text(context, frame.slots[0], NULL);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, oseo_null());
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "rawJSON");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /* CreateDataPropertyOrThrow and then SetIntegrityLevel frozen. */
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[2],
            frame.slots[0],
            (OseoPropertyAttributes){false, true, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        ordinary_object(frame.slots[1])->extensible = false;
        heap_object(frame.slots[1])->raw_json = true;
        result = normal(frame.slots[1]);
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_internal_json_builtin_dispatch(OseoContext *context,
                                               size_t code_id,
                                               OseoValue callee,
                                               OseoValue receiver,
                                               size_t argument_count,
                                               const OseoValue *arguments,
                                               OseoValue new_target) {
    (void)callee;
    if (code_id == OSEO_JSON_STRINGIFY_CODE_ID) {
        if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "JSON.stringify is not a constructor.");
        }
        return json_stringify(context, argument_count, arguments);
    }
    (void)receiver;
    if (code_id == OSEO_JSON_RAW_JSON_CODE_ID ||
        code_id == OSEO_JSON_IS_RAW_JSON_CODE_ID) {
        if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "JSON built-in is not a constructor.");
        }
        if (code_id == OSEO_JSON_RAW_JSON_CODE_ID) {
            return json_raw_json(context, argument_count, arguments);
        }
        OseoValue value = json_argument(argument_count, arguments, 0u);
        return normal(oseo_boolean(
            is_object(value) && heap_object(value)->raw_json));
    }
    if (code_id != OSEO_JSON_PARSE_CODE_ID) {
        return oseo_unknown_function(context, code_id);
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context, OSEO_ERROR_TYPE, "JSON.parse is not a constructor.");
    }
    return json_parse(context, argument_count, arguments);
}

static OseoResult json_parse_function(OseoContext *context) {
    static const uint16_t name[] = {'p', 'a', 'r', 's', 'e'};
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_JSON_PARSE_CODE_ID,
            environment,
            name,
            sizeof(name) / sizeof(name[0]),
            2u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult json_stringify_function(OseoContext *context) {
    static const uint16_t name[] = {
        's', 't', 'r', 'i', 'n', 'g', 'i', 'f', 'y'
    };
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            OSEO_JSON_STRINGIFY_CODE_ID,
            environment,
            name,
            sizeof(name) / sizeof(name[0]),
            3u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/* JSON.rawJSON and JSON.isRawJSON own no intrinsic slot. */
static OseoResult json_define_method(
    OseoContext *context,
    OseoValue namespace_object,
    size_t code_id,
    const char *name
) {
    size_t name_length = strlen(name);
    uint16_t units[16];
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue slots[3] = {namespace_object, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            slots[1],
            units,
            name_length,
            1u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, name);
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_json_intrinsic(OseoContext *context) {
    OseoValue *slot = &context->realm->intrinsics[OSEO_INTRINSIC_JSON];
    if (is_object(*slot)) return normal(*slot);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
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
        *slot = frame.slots[0];
        result = json_parse_function(context);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->realm->intrinsics[OSEO_INTRINSIC_JSON_PARSE] = frame.slots[1];
        result = oseo_internal_ascii_string(context, "parse");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_stringify_function(context);
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "stringify");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_define_method(
            context,
            frame.slots[0],
            OSEO_JSON_RAW_JSON_CODE_ID,
            "rawJSON"
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = json_define_method(
            context,
            frame.slots[0],
            OSEO_JSON_IS_RAW_JSON_CODE_ID,
            "isRawJSON"
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_STRING_TAG
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "JSON");
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[2],
            frame.slots[3],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        *slot = oseo_undefined();
        context->realm->intrinsics[OSEO_INTRINSIC_JSON_PARSE] =
            oseo_undefined();
    } else if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(*slot) : result;
}

OseoResult oseo_internal_install_json_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[3] = {global, oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_json_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "JSON");
        slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
