#include "runtime_internal.h"

#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>

/*
 * The GlobalSymbolRegistry is shared by every realm in one process. Each
 * realm owns its Symbol heap values: `Symbol.for` resolves the key to one
 * immortal entry here and then to the realm's single rooted representative
 * of that entry, so identity inside a realm stays heap-pointer identity and
 * no collector ever traces another realm's heap. Entries are never removed
 * because a registered key stays observable for the agent's lifetime.
 */
typedef struct OseoSymbolRegistryEntry {
    size_t hash;
    size_t length;
    uint16_t units[];
} OseoSymbolRegistryEntry;

/*
 * An open-addressed table of entry pointers, grown before it is half full,
 * so a lookup takes an expected constant number of probes. The hash is
 * deterministic, like every other runtime table, so keys chosen to collide
 * degrade toward a linear scan rather than failing. The table and its
 * entries change only under the lock.
 */
static atomic_flag symbol_registry_lock = ATOMIC_FLAG_INIT;
static OseoSymbolRegistryEntry **symbol_registry;
static size_t symbol_registry_count;
static size_t symbol_registry_capacity;

static void lock_symbol_registry(void) {
    while (atomic_flag_test_and_set_explicit(
        &symbol_registry_lock,
        memory_order_acquire
    )) {}
}

static void unlock_symbol_registry(void) {
    atomic_flag_clear_explicit(&symbol_registry_lock, memory_order_release);
}

static size_t symbol_key_hash(const uint16_t *units, size_t length) {
    uint64_t hash = UINT64_C(14695981039346656037);
    for (size_t index = 0u; index < length; index += 1u) {
        hash ^= (uint64_t)units[index];
        hash *= UINT64_C(1099511628211);
    }
    return (size_t)(hash ^ (hash >> 32u));
}

/* Doubles the process table; the caller holds the lock. */
static bool symbol_registry_grow(void) {
    size_t capacity = symbol_registry_capacity == 0u
        ? 64u
        : symbol_registry_capacity;
    if (symbol_registry_capacity != 0u) {
        if (capacity > SIZE_MAX / 2u / sizeof(*symbol_registry)) return false;
        capacity *= 2u;
    }
    OseoSymbolRegistryEntry **table = calloc(capacity, sizeof(*table));
    if (table == NULL) return false;
    for (size_t index = 0u; index < symbol_registry_capacity; index += 1u) {
        OseoSymbolRegistryEntry *entry = symbol_registry[index];
        if (entry == NULL) continue;
        size_t slot = entry->hash & (capacity - 1u);
        while (table[slot] != NULL) slot = (slot + 1u) & (capacity - 1u);
        table[slot] = entry;
    }
    free(symbol_registry);
    symbol_registry = table;
    symbol_registry_capacity = capacity;
    return true;
}

static OseoResult symbol_registry_find_or_create(
    OseoContext *context,
    OseoValue key,
    const OseoSymbolRegistryEntry **entry
) {
    OseoString *string = string_object(key);
    if (string->length >
        (SIZE_MAX - sizeof(OseoSymbolRegistryEntry)) / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "Symbol registry key is long.");
    }
    size_t hash = symbol_key_hash(string->units, string->length);
    lock_symbol_registry();
    if ((symbol_registry_count + 1u) * 2u > symbol_registry_capacity &&
        !symbol_registry_grow()) {
        unlock_symbol_registry();
        return failure(
            context,
            "OSEO2001",
            "Symbol registry allocation failed."
        );
    }
    size_t mask = symbol_registry_capacity - 1u;
    size_t slot = hash & mask;
    for (OseoSymbolRegistryEntry *candidate = symbol_registry[slot];
         candidate != NULL;
         candidate = symbol_registry[slot]) {
        if (candidate->hash == hash &&
            candidate->length == string->length &&
            (string->length == 0u || memcmp(
                candidate->units,
                string->units,
                string->length * sizeof(uint16_t)
            ) == 0)) {
            *entry = candidate;
            unlock_symbol_registry();
            return normal(key);
        }
        slot = (slot + 1u) & mask;
    }
    size_t size = sizeof(OseoSymbolRegistryEntry) +
        string->length * sizeof(uint16_t);
    OseoSymbolRegistryEntry *created = malloc(size);
    if (created == NULL) {
        unlock_symbol_registry();
        return failure(
            context,
            "OSEO2001",
            "Symbol registry allocation failed."
        );
    }
    created->hash = hash;
    created->length = string->length;
    if (string->length > 0u) {
        memcpy(
            created->units,
            string->units,
            string->length * sizeof(uint16_t)
        );
    }
    symbol_registry[slot] = created;
    symbol_registry_count += 1u;
    *entry = created;
    unlock_symbol_registry();
    return normal(key);
}

/*
 * Rehashes the realm's open-addressed representative table into twice its
 * capacity. Empty slots hold undefined so the collector can mark every slot.
 */
static bool registered_symbols_grow(OseoContext *context) {
    size_t old_capacity = context->registered_symbol_capacity;
    size_t capacity = old_capacity == 0u ? 16u : old_capacity;
    if (old_capacity != 0u) {
        if (capacity > SIZE_MAX / 2u / sizeof(OseoValue)) return false;
        capacity *= 2u;
    }
    OseoValue *table = malloc(capacity * sizeof(OseoValue));
    if (table == NULL) return false;
    for (size_t index = 0u; index < capacity; index += 1u) {
        table[index] = oseo_undefined();
    }
    for (size_t index = 0u; index < old_capacity; index += 1u) {
        OseoValue symbol = context->registered_symbols[index];
        if (tag_of(symbol) != OSEO_TAG_HEAP) continue;
        const OseoSymbolRegistryEntry *entry =
            symbol_object(symbol)->registry_entry;
        size_t slot = entry->hash & (capacity - 1u);
        while (tag_of(table[slot]) == OSEO_TAG_HEAP) {
            slot = (slot + 1u) & (capacity - 1u);
        }
        table[slot] = symbol;
    }
    free(context->registered_symbols);
    context->registered_symbols = table;
    context->registered_symbol_capacity = capacity;
    return true;
}

static OseoResult symbol_create(
    OseoContext *context,
    OseoValue description,
    const OseoSymbolRegistryEntry *registry_entry
);

static OseoResult symbol_this_value(
    OseoContext *context,
    OseoValue receiver
) {
    if (is_symbol(receiver)) return normal(receiver);
    if (is_object(receiver) && !is_proxy(receiver)) {
        OseoOrdinaryObject *object = ordinary_object(receiver);
        if (object->primitive_data && is_symbol(object->primitive_value)) {
            return normal(object->primitive_value);
        }
    }
    return oseo_internal_throw_error(
        context,
        OSEO_ERROR_TYPE,
        "Symbol method receiver has no SymbolData."
    );
}

static OseoResult symbol_for(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue key = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    OseoRootFrame frame = {NULL, &key, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_value_string(context, key);
    key = result.value;
    const OseoSymbolRegistryEntry *entry = NULL;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = symbol_registry_find_or_create(context, key, &entry);
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        (context->registered_symbol_count + 1u) * 2u >
            context->registered_symbol_capacity &&
        !registered_symbols_grow(context)) {
        result = failure(
            context,
            "OSEO2001",
            "Symbol registry allocation failed."
        );
    }
    size_t slot = 0u;
    if (result.status == OSEO_STATUS_NORMAL) {
        size_t mask = context->registered_symbol_capacity - 1u;
        slot = entry->hash & mask;
        while (tag_of(context->registered_symbols[slot]) == OSEO_TAG_HEAP) {
            OseoValue candidate = context->registered_symbols[slot];
            if (symbol_object(candidate)->registry_entry == entry) {
                oseo_roots_pop(context, &frame);
                return normal(candidate);
            }
            slot = (slot + 1u) & mask;
        }
        result = symbol_create(context, key, entry);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * Allocation may collect but never resizes this table, so the empty
         * slot found before it is still the insertion point.
         */
        context->registered_symbols[slot] = result.value;
        context->registered_symbol_count += 1u;
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult symbol_key_for(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue symbol = argument_count > 0u
        ? arguments[0]
        : oseo_undefined();
    if (!is_symbol(symbol)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Symbol.keyFor requires a Symbol."
        );
    }
    const OseoSymbolRegistryEntry *entry =
        symbol_object(symbol)->registry_entry;
    if (entry == NULL) return normal(oseo_undefined());
    return oseo_internal_allocate_string(context, entry->units, entry->length);
}

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
    bool constructing = tag_of(new_target) != OSEO_TAG_UNDEFINED;
    if (code_id == OSEO_SYMBOL_CONSTRUCT_CODE_ID) {
        if (constructing) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_TYPE,
                "Symbol is not a constructor."
            );
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
    if (constructing) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Symbol built-in method is not a constructor."
        );
    }
    if (code_id == OSEO_SYMBOL_FOR_CODE_ID) {
        return symbol_for(context, argument_count, arguments);
    }
    if (code_id == OSEO_SYMBOL_KEY_FOR_CODE_ID) {
        return symbol_key_for(context, argument_count, arguments);
    }
    if (code_id == OSEO_SYMBOL_TO_STRING_CODE_ID) {
        OseoResult value = symbol_this_value(context, receiver);
        return value.status == OSEO_STATUS_NORMAL
            ? oseo_internal_symbol_text(context, value.value)
            : value;
    }
    if (code_id == OSEO_SYMBOL_VALUE_OF_CODE_ID ||
        code_id == OSEO_SYMBOL_TO_PRIMITIVE_CODE_ID) {
        return symbol_this_value(context, receiver);
    }
    if (code_id == OSEO_SYMBOL_DESCRIPTION_GETTER_CODE_ID) {
        OseoResult value = symbol_this_value(context, receiver);
        return value.status == OSEO_STATUS_NORMAL
            ? normal(symbol_object(value.value)->description)
            : value;
    }
    return oseo_unknown_function(context, code_id);
}

/*
 * Symbol values: unique heap primitives with an optional description,
 * the lazily created Symbol intrinsic, and the well-known symbols
 * stored on it.
 */

static OseoResult symbol_create(
    OseoContext *context,
    OseoValue description,
    const OseoSymbolRegistryEntry *registry_entry
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
    symbol->registry_entry = registry_entry;
    return oseo_internal_publish_heap(
        context,
        &symbol->header,
        OSEO_HEAP_SYMBOL
    );
}

OseoResult oseo_internal_symbol_create(
    OseoContext *context,
    OseoValue description
) {
    return symbol_create(context, description, NULL);
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
    OseoResult valid = oseo_internal_validate_string_length(context, length);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
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
    OseoResult valid = oseo_internal_validate_string_length(context, length);
    if (valid.status != OSEO_STATUS_NORMAL) return valid;
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
    OseoValue value,
    OseoPropertyAttributes attributes
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

static OseoResult create_symbol_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionNamePrefix prefix
) {
    size_t name_length = strlen(name);
    if (name_length > 31u) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    uint16_t units[31];
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * Only the constructor has [[Construct]]: IsConstructor observes it,
         * while dispatch still rejects every construction before conversion.
         */
        OseoFunctionKind kind = code_id == OSEO_SYMBOL_CONSTRUCT_CODE_ID
            ? OSEO_FUNCTION_ORDINARY
            : OSEO_FUNCTION_INTERNAL;
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

static OseoResult define_symbol_accessor(
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
    OseoValue *marker = &context->intrinsics[
        OSEO_INTRINSIC_SYMBOL_DESCRIPTION_GETTER
    ];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The Symbol intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) {
        return normal(context->intrinsics[OSEO_INTRINSIC_SYMBOL]);
    }
    *marker = oseo_uninitialized();
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) {
        *marker = oseo_undefined();
        return result;
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
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_symbol_builtin(
            context,
            OSEO_SYMBOL_CONSTRUCT_CODE_ID,
            "Symbol",
            0u,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        /*
         * The ordinary kind synthesizes the fixed `prototype` property, so
         * only its writability needs to match the specified descriptor.
         */
        OseoFunction *constructor = function_object(frame.slots[0]);
        constructor->prototype_writable = false;
        frame.slots[1] = constructor->prototype_object;
        context->intrinsics[OSEO_INTRINSIC_SYMBOL] = frame.slots[0];
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE] = frame.slots[1];
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < OSEO_WELL_KNOWN_SYMBOL_COUNT;
         index += 1u) {
        frame.slots[2] = context->well_known_symbols[index];
        result = define_symbol_property(
            context,
            frame.slots[0],
            well_known_names[index],
            frame.slots[2],
            (OseoPropertyAttributes){false, false, false, false}
        );
    }
    static const size_t static_codes[] = {
        OSEO_SYMBOL_FOR_CODE_ID,
        OSEO_SYMBOL_KEY_FOR_CODE_ID,
    };
    static const OseoIntrinsic static_intrinsics[] = {
        OSEO_INTRINSIC_SYMBOL_FOR,
        OSEO_INTRINSIC_SYMBOL_KEY_FOR,
    };
    static const char *const static_names[] = {"for", "keyFor"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_symbol_builtin(
            context,
            static_codes[index],
            static_names[index],
            1u,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[static_intrinsics[index]] = frame.slots[2];
            result = define_symbol_property(
                context,
                frame.slots[0],
                static_names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_symbol_property(
            context,
            frame.slots[1],
            "constructor",
            frame.slots[0],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    static const size_t method_codes[] = {
        OSEO_SYMBOL_TO_STRING_CODE_ID,
        OSEO_SYMBOL_VALUE_OF_CODE_ID,
    };
    static const OseoIntrinsic method_intrinsics[] = {
        OSEO_INTRINSIC_SYMBOL_TO_STRING,
        OSEO_INTRINSIC_SYMBOL_VALUE_OF,
    };
    static const char *const method_names[] = {"toString", "valueOf"};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 2u;
         index += 1u) {
        result = create_symbol_builtin(
            context,
            method_codes[index],
            method_names[index],
            0u,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            context->intrinsics[method_intrinsics[index]] = frame.slots[2];
            result = define_symbol_property(
                context,
                frame.slots[1],
                method_names[index],
                frame.slots[2],
                (OseoPropertyAttributes){true, false, true, false}
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_symbol_builtin(
            context,
            OSEO_SYMBOL_DESCRIPTION_GETTER_CODE_ID,
            "description",
            0u,
            OSEO_FUNCTION_NAME_PREFIX_GET
        );
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_symbol_accessor(
            context,
            frame.slots[1],
            "description",
            frame.slots[2]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        frame.slots[3] =
            context->well_known_symbols[OSEO_WELL_KNOWN_TO_STRING_TAG];
        result = oseo_internal_ascii_string(context, "Symbol");
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = create_symbol_builtin(
            context,
            OSEO_SYMBOL_TO_PRIMITIVE_CODE_ID,
            "[Symbol.toPrimitive]",
            1u,
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
        frame.slots[4] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_TO_PRIMITIVE] =
            frame.slots[4];
        frame.slots[3] =
            context->well_known_symbols[OSEO_WELL_KNOWN_TO_PRIMITIVE];
        result = oseo_object_define(
            context,
            frame.slots[1],
            frame.slots[3],
            frame.slots[4],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_DESCRIPTION_GETTER] =
            frame.slots[2];
        result.value = frame.slots[0];
        if (context->observe_specialization) {
            context->allocations = entry_allocations;
        }
    } else {
        context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE] =
            oseo_undefined();
        context->intrinsics[OSEO_INTRINSIC_SYMBOL] = oseo_undefined();
        for (size_t intrinsic = OSEO_INTRINSIC_SYMBOL_FOR;
             intrinsic <= OSEO_INTRINSIC_SYMBOL_DESCRIPTION_GETTER;
             intrinsic += 1u) {
            context->intrinsics[intrinsic] = oseo_undefined();
        }
        for (size_t index = 0u;
             index < OSEO_WELL_KNOWN_SYMBOL_COUNT;
             index += 1u) {
            context->well_known_symbols[index] = oseo_undefined();
        }
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
    OseoValue value = context->well_known_symbols[index];
    if (tag_of(value) != OSEO_TAG_UNDEFINED) return normal(value);
    OseoResult result = oseo_symbol_intrinsic(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(context->well_known_symbols[index]);
}
