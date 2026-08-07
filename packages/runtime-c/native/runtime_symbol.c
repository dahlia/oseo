#include "runtime_internal.h"

#include <stdlib.h>
#include <string.h>

OseoResult oseo_internal_symbol_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)new_target;
    if (code_id != OSEO_SYMBOL_CONSTRUCT_CODE_ID) {
        return oseo_unknown_function(context, code_id);
    }
    OseoValue description_input = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (tag_of(description_input) == OSEO_TAG_UNDEFINED) {
        return oseo_internal_symbol_create(context, oseo_undefined());
    }
    OseoResult result =
        oseo_internal_value_string(context, description_input);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_symbol_create(context, result.value);
    }
    return result;
}

/*
 * Symbol values: unique heap primitives with an optional description,
 * the lazily created Symbol intrinsic, and the well-known symbols
 * stored on it.
 */

OseoResult oseo_internal_symbol_create(
    OseoContext *context,
    OseoValue description
) {
    OseoValue slots[1] = {description};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoSymbol *symbol =
        oseo_internal_allocate_heap_bytes(context, sizeof(*symbol));
    oseo_roots_pop(context, &frame);
    if (symbol == NULL) {
        return failure(context, "OSEO2001", "Symbol allocation failed.");
    }
    symbol->description = slots[0];
    return oseo_internal_publish_heap(
        context,
        &symbol->header,
        OSEO_HEAP_SYMBOL
    );
}

/* Render "Symbol(description)" for console output and diagnostics. */
OseoResult oseo_internal_symbol_text(
    OseoContext *context,
    OseoValue symbol
) {
    if (!is_symbol(symbol)) {
        return failure(context, "OSEO2001", "Value is not a symbol.");
    }
    OseoValue description = symbol_object(symbol)->description;
    size_t description_length = is_string(description)
        ? string_object(description)->length
        : 0u;
    if (description_length > SIZE_MAX / sizeof(uint16_t) - 8u) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t length = description_length + 8u;
    uint16_t *units = malloc(length * sizeof(uint16_t));
    if (units == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    static const char prefix[] = "Symbol(";
    for (size_t index = 0u; index < 7u; index += 1u) {
        units[index] = (uint16_t)(unsigned char)prefix[index];
    }
    if (description_length > 0u) {
        memcpy(
            units + 7u,
            string_object(description)->units,
            description_length * sizeof(uint16_t)
        );
    }
    units[length - 1u] = ')';
    OseoValue slots[1] = {symbol};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    oseo_roots_pop(context, &frame);
    free(units);
    return result;
}

/*
 * SetFunctionName for a symbol key: "[description]" for a described
 * symbol, or the empty string for a descriptionless symbol.
 */
OseoResult oseo_internal_symbol_name(
    OseoContext *context,
    OseoValue symbol
) {
    if (!is_symbol(symbol)) {
        return failure(context, "OSEO2001", "Value is not a symbol.");
    }
    OseoValue description = symbol_object(symbol)->description;
    /* SetFunctionName leaves a descriptionless symbol key nameless. */
    if (!is_string(description)) {
        return oseo_internal_allocate_string(context, NULL, 0u);
    }
    size_t description_length = string_object(description)->length;
    if (description_length > SIZE_MAX / sizeof(uint16_t) - 2u) {
        return failure(context, "OSEO2001", "String allocation is too large.");
    }
    size_t length = description_length + 2u;
    uint16_t *units = malloc(length * sizeof(uint16_t));
    if (units == NULL) {
        return failure(context, "OSEO2001", "String allocation failed.");
    }
    units[0] = '[';
    if (description_length > 0u) {
        memcpy(
            units + 1u,
            string_object(description)->units,
            description_length * sizeof(uint16_t)
        );
    }
    units[length - 1u] = ']';
    OseoValue slots[1] = {symbol};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_allocate_string(context, units, length);
    oseo_roots_pop(context, &frame);
    free(units);
    return result;
}

static OseoResult define_symbol_property(
    OseoContext *context,
    OseoValue target,
    const char *name,
    OseoValue value
) {
    size_t name_length = strlen(name);
    uint16_t units[20];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Symbol property name is long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue slots[3] = {target, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_string_from_units(context, units, name_length);
    if (result.status == OSEO_STATUS_NORMAL) {
        slots[2] = result.value;
        const OseoPropertyAttributes fixed = {false, false, false, false};
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            fixed
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult symbol_intrinsic_create(OseoContext *context) {
    static const char *const well_known_names[OSEO_WELL_KNOWN_SYMBOL_COUNT] = {
        "asyncIterator",
        "hasInstance",
        "isConcatSpreadable",
        "iterator",
        "match",
        "matchAll",
        "replace",
        "search",
        "species",
        "split",
        "toPrimitive",
        "toStringTag",
        "unscopables",
    };
    static const char *const well_known_descriptions[
        OSEO_WELL_KNOWN_SYMBOL_COUNT
    ] = {
        "Symbol.asyncIterator",
        "Symbol.hasInstance",
        "Symbol.isConcatSpreadable",
        "Symbol.iterator",
        "Symbol.match",
        "Symbol.matchAll",
        "Symbol.replace",
        "Symbol.search",
        "Symbol.species",
        "Symbol.split",
        "Symbol.toPrimitive",
        "Symbol.toStringTag",
        "Symbol.unscopables",
    };
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_environment_create(context, 0u);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        static const uint16_t name_units[] = {
            'S', 'y', 'm', 'b', 'o', 'l',
        };
        result = oseo_function_create(
            context,
            OSEO_SYMBOL_CONSTRUCT_CODE_ID,
            frame.slots[0],
            name_units,
            sizeof(name_units) / sizeof(*name_units),
            0u,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[1] = result.value;
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_WELL_KNOWN_SYMBOL_COUNT;
         index += 1u) {
        const char *description = well_known_descriptions[index];
        size_t description_length = strlen(description);
        uint16_t units[32];
        if (description_length > sizeof(units) / sizeof(*units)) {
            result = failure(
                context,
                "OSEO2001",
                "Well-known symbol description is long."
            );
            break;
        }
        for (size_t unit = 0u; unit < description_length; unit += 1u) {
            units[unit] = (uint16_t)(unsigned char)description[unit];
        }
        result = oseo_string_from_units(context, units, description_length);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_internal_symbol_create(context, frame.slots[2]);
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        context->well_known_symbols[index] = frame.slots[2];
        result = define_symbol_property(
            context,
            frame.slots[1],
            well_known_names[index],
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * Symbol is non-constructible, so the object layer does not
         * synthesize its prototype property. The prototype object still
         * exists and is exposed here as a fixed own property; only its
         * methods are the deferred boundary.
         */
        result = define_symbol_property(
            context,
            frame.slots[1],
            "prototype",
            function_object(frame.slots[1])->prototype_object
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE] =
            function_object(frame.slots[1])->prototype_object;
        context->intrinsics[OSEO_INTRINSIC_SYMBOL] = frame.slots[1];
        result = oseo_internal_install_primitive_wrapper_methods(
            context,
            context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE],
            false
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result.value = frame.slots[1];
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE] = oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_SYMBOL] = oseo_undefined();
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_symbol_intrinsic(OseoContext *context) {
    OseoValue value = context->intrinsics[OSEO_INTRINSIC_SYMBOL];
    if (tag_of(value) != OSEO_TAG_UNDEFINED) {
        return normal(value);
    }
    return symbol_intrinsic_create(context);
}

OseoResult oseo_internal_well_known_symbol(
    OseoContext *context,
    size_t index
) {
    if (index >= OSEO_WELL_KNOWN_SYMBOL_COUNT) {
        return failure(context, "OSEO2001", "Unknown well-known symbol.");
    }
    OseoResult result = oseo_symbol_intrinsic(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->well_known_symbols[index]);
}
