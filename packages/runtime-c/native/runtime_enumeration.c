#include "runtime_internal.h"

#include <stdio.h>

/*
 * EnumerateObjectProperties (14.7.5.9).
 *
 * The specification leaves the mechanics and order unspecified and
 * states rules the iterator must obey instead, so a conforming
 * implementation must choose when it obtains each level's own keys. This
 * implementation makes the choice both reference hosts make, because the
 * choice is observable and no rule prefers the other one: the whole
 * prototype chain is collected once, when the enumeration is acquired.
 *
 * Collection walks the chain outward. Each level's own string keys are
 * obtained in OrdinaryOwnPropertyKeys order, symbol keys are dropped,
 * and a key already recorded at a nearer level is skipped, whether or
 * not that nearer property was enumerable, which is the specified shadow
 * rule. A key that survives is reported only if its own property was
 * enumerable when the level was read.
 *
 * Each step then reports the next collected key if the receiver still
 * has a property of that name anywhere on its chain. That is what makes
 * a property deleted before it is processed ignored, as the rules
 * require, while a property added during the enumeration stays invisible
 * to it and no name is ever reported twice.
 *
 * No step runs user code: this realm has no proxy and no exotic object
 * whose own-key, descriptor, or prototype access is observable, so the
 * enumeration cannot be reentered and reports no abrupt completion of
 * its own.
 */

/* One level's own string keys in OrdinaryOwnPropertyKeys order. */
static OseoResult enumeration_keys(OseoContext *context, OseoValue level) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = level;
    result = oseo_argument_list_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_string(frame.slots[0])) {
        /* A String exotic object owns one enumerable property per code
         * unit index, then a non-enumerable `length`. */
        size_t length = string_object(frame.slots[0])->length;
        for (size_t index = 0u;
             result.status == OSEO_STATUS_NORMAL && index < length;
             index += 1u) {
            char key_text[24];
            (void)snprintf(key_text, sizeof(key_text), "%zu", index);
            result = oseo_internal_ascii_string(context, key_text);
            frame.slots[2] = result.value;
            if (result.status != OSEO_STATUS_NORMAL) break;
            result = oseo_argument_list_append(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_ascii_string(context, "length");
            frame.slots[2] = result.value;
        }
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_argument_list_append(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        }
    } else if (result.status == OSEO_STATUS_NORMAL &&
               is_object(frame.slots[0])) {
        uint64_t previous = UINT64_MAX;
        while (result.status == OSEO_STATUS_NORMAL) {
            OseoOrdinaryObject *object = ordinary_object(frame.slots[0]);
            size_t selected = SIZE_MAX;
            uint32_t selected_number = 0u;
            for (size_t index = 0u;
                 index < object->property_count;
                 index += 1u) {
                uint32_t number = 0u;
                if (!oseo_internal_array_index(
                        object->properties[index].key, &number) ||
                    (previous != UINT64_MAX && number <= previous)) continue;
                if (selected == SIZE_MAX || number < selected_number) {
                    selected = index;
                    selected_number = number;
                }
            }
            if (selected == SIZE_MAX) break;
            frame.slots[2] = object->properties[selected].key;
            result = oseo_argument_list_append(
                context,
                frame.slots[1],
                frame.slots[2]
            );
            previous = selected_number;
        }
        /* An Array's `length` and a function's `prototype` are own
         * non-enumerable properties this runtime keeps outside the
         * property vector, and both are created before any string key
         * source code can add. */
        const char *reserved = is_array(frame.slots[0])
            ? "length"
            : (function_has_prototype_property(frame.slots[0])
                ? "prototype"
                : NULL);
        if (result.status == OSEO_STATUS_NORMAL && reserved != NULL) {
            result = oseo_internal_ascii_string(context, reserved);
            frame.slots[2] = result.value;
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_argument_list_append(
                    context,
                    frame.slots[1],
                    frame.slots[2]
                );
            }
        }
        for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL; ) {
            OseoOrdinaryObject *object = ordinary_object(frame.slots[0]);
            if (index >= object->property_count) break;
            OseoValue key = object->properties[index].key;
            index += 1u;
            uint32_t ignored = 0u;
            if (is_symbol(key) ||
                oseo_internal_array_index(key, &ignored)) continue;
            if (reserved != NULL &&
                oseo_internal_string_is_ascii(key, reserved)) continue;
            frame.slots[2] = key;
            result = oseo_argument_list_append(
                context,
                frame.slots[1],
                frame.slots[2]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

static bool enumeration_recorded(
    OseoContext *context,
    OseoValue list,
    OseoValue key
) {
    size_t count = 0u;
    const OseoValue *values = NULL;
    OseoResult viewed = oseo_argument_list_view(
        context,
        list,
        &count,
        &values
    );
    if (viewed.status != OSEO_STATUS_NORMAL) return false;
    for (size_t index = 0u; index < count; index += 1u) {
        if (oseo_internal_property_key_equal(values[index], key)) return true;
    }
    return false;
}

/*
 * [[GetOwnProperty]] of one collected level, reduced to what collection
 * observes: whether the key is an own property, and whether it is
 * enumerable.
 */
static bool enumeration_own_key(
    OseoValue level,
    OseoValue key,
    bool *enumerable
) {
    if (is_string(level)) {
        uint32_t index = 0u;
        if (oseo_internal_string_is_ascii(key, "length")) {
            *enumerable = false;
            return true;
        }
        if (oseo_internal_array_index(key, &index) &&
            index < string_object(level)->length) {
            *enumerable = true;
            return true;
        }
        return false;
    }
    if (!is_object(level)) return false;
    OseoValue value = oseo_undefined();
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    if (!oseo_internal_own_descriptor(
            level,
            key,
            &value,
            &attributes,
            &getter,
            &setter
        )) return false;
    *enumerable = attributes.enumerable;
    return true;
}

/*
 * HasProperty over the receiver's chain, which runs no user code here.
 * It consults the virtualized intrinsic table as well as stored
 * properties, so a collected own key whose deletion uncovers an
 * inherited intrinsic of the same name stays reportable.
 */
static bool enumeration_reachable(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key
) {
    bool enumerable = false;
    if (is_string(receiver)) {
        return enumeration_own_key(receiver, key, &enumerable);
    }
    OseoValue current = receiver;
    while (is_object(current)) {
        if (enumeration_own_key(current, key, &enumerable)) return true;
        if (oseo_internal_virtual_property(context, current, key)) return true;
        current = ordinary_object(current)->prototype;
    }
    return false;
}

/* The next level of the chain, or a non-object when the walk ends. */
static OseoValue enumeration_parent(OseoValue level) {
    /* A string level stands for a String exotic object whose
     * %String.prototype% this realm never creates. */
    return is_object(level) ? ordinary_object(level)->prototype : oseo_null();
}

/*
 * Collect the receiver's own and inherited enumerable string keys, with
 * every nearer own key suppressing the same name behind it.
 */
static OseoResult enumeration_collect(
    OseoContext *context,
    OseoValue receiver
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 5u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = oseo_argument_list_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        frame.slots[2] = result.value;
    }
    while (result.status == OSEO_STATUS_NORMAL &&
           (is_object(frame.slots[0]) || is_string(frame.slots[0]))) {
        result = enumeration_keys(context, frame.slots[0]);
        frame.slots[3] = result.value;
        for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL; ) {
            size_t count = 0u;
            const OseoValue *values = NULL;
            result = oseo_argument_list_view(
                context,
                frame.slots[3],
                &count,
                &values
            );
            if (result.status != OSEO_STATUS_NORMAL || index >= count) break;
            frame.slots[4] = values[index];
            index += 1u;
            if (enumeration_recorded(context, frame.slots[2], frame.slots[4])) {
                continue;
            }
            bool enumerable = false;
            if (!enumeration_own_key(
                    frame.slots[0],
                    frame.slots[4],
                    &enumerable
                )) continue;
            result = oseo_argument_list_append(
                context,
                frame.slots[2],
                frame.slots[4]
            );
            if (result.status != OSEO_STATUS_NORMAL || !enumerable) continue;
            result = oseo_argument_list_append(
                context,
                frame.slots[1],
                frame.slots[4]
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        frame.slots[0] = enumeration_parent(frame.slots[0]);
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_enumerate_get(
    OseoContext *context,
    OseoValue subject,
    OseoValue *record,
    bool *done
) {
    *record = oseo_undefined();
    *done = true;
    /* ForIn/OfHeadEvaluation returns a break completion for a nullish
     * subject, so the whole statement is skipped without an error and
     * without a ToObject conversion. */
    if (is_nullish(subject)) return normal(oseo_undefined());
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    /*
     * ToObject, modeled rather than materialized while primitive wrapper
     * objects stay outside the profile. A String exotic object's own
     * index properties are enumerable and are described by the string
     * itself, and %String.prototype% is not an object this realm
     * creates. Every other primitive wrapper owns no property at all, so
     * enumerating one is enumerating its prototype: only `Symbol` has a
     * reachable prototype here, and a symbol value can exist only after
     * the intrinsic that owns it was created, so an absent constructor
     * means no symbol and no chain to walk.
     */
    OseoValue symbol_prototype = oseo_undefined();
    if (is_symbol(subject) && is_function(context->symbol_constructor)) {
        symbol_prototype =
            function_object(context->symbol_constructor)->prototype_object;
    }
    frame.slots[0] = is_object(subject) || is_string(subject)
        ? subject
        : symbol_prototype;
    result = enumeration_collect(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoEnumeration *enumeration = oseo_internal_allocate_heap_bytes(
            context,
            sizeof(*enumeration)
        );
        if (enumeration == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Enumeration allocation failed."
            );
        } else {
            enumeration->receiver = frame.slots[0];
            enumeration->keys = frame.slots[1];
            enumeration->index = 0u;
            result = oseo_internal_publish_heap(
                context,
                &enumeration->header,
                OSEO_HEAP_ENUMERATION
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        *record = result.value;
        *done = false;
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_enumerate_next(
    OseoContext *context,
    OseoValue record,
    OseoValue *key,
    bool *done
) {
    *key = oseo_undefined();
    *done = true;
    if (!is_enumeration(record)) {
        return failure(
            context,
            "OSEO2001",
            "Enumeration step requires an enumeration record."
        );
    }
    OseoEnumeration *enumeration = enumeration_object(record);
    size_t count = 0u;
    const OseoValue *values = NULL;
    OseoResult result = oseo_argument_list_view(
        context,
        enumeration->keys,
        &count,
        &values
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    while (enumeration->index < count) {
        OseoValue candidate = values[enumeration->index];
        enumeration->index += 1u;
        /* A key deleted before it is processed is ignored. */
        if (!enumeration_reachable(context, enumeration->receiver, candidate)) {
            continue;
        }
        *key = candidate;
        *done = false;
        break;
    }
    return normal(oseo_undefined());
}
