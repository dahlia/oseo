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
 * enumerable when the level was read. The chain and keys are snapshotted
 * before descriptors are read, matching both reference hosts' observable
 * Proxy operation order.
 *
 * Each step then reports the next collected key if the receiver still
 * has a property of that name anywhere on its chain. That is what makes
 * a property deleted before it is processed ignored, as the rules
 * require, while a property added during the enumeration stays invisible
 * to it and no name is ever reported twice.
 *
 * Proxy own-key, descriptor, and prototype operations can run user code,
 * reenter enumeration, and complete abruptly. Each observable operation
 * therefore returns an OseoResult and the caller propagates its status.
 * A Proxy descriptor observation made during collection is cached so the
 * reachability check does not invoke the same trap a second time.
 */

/* One level's own string keys in OrdinaryOwnPropertyKeys order. */
static OseoResult enumeration_keys(OseoContext *context, OseoValue level) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = level;
    result = oseo_argument_list_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && is_proxy(frame.slots[0])) {
        result = oseo_internal_proxy_own_keys(
            context, frame.slots[0], OSEO_OWN_KEY_STRINGS);
        frame.slots[2] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_array_like_list(
                context, frame.slots[2], &frame.slots[1]);
        }
        if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[1];
        oseo_roots_release(context, &frame);
        return result;
    }
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

/* Record one Proxy [[GetOwnProperty]] result for a later reachability check. */
static OseoResult enumeration_cache_proxy_descriptor(
    OseoContext *context,
    OseoValue cache,
    OseoValue proxy,
    OseoValue key,
    bool found
) {
    OseoResult result = oseo_argument_list_append(context, cache, proxy);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_append(context, cache, key);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_append(
            context,
            cache,
            oseo_boolean(found)
        );
    }
    return result;
}

/* Find an earlier Proxy descriptor result for this exact object and key. */
static OseoResult enumeration_cached_proxy_descriptor(
    OseoContext *context,
    OseoValue cache,
    OseoValue proxy,
    OseoValue key,
    bool *cached,
    bool *found
) {
    *cached = false;
    *found = false;
    size_t count = 0u;
    const OseoValue *values = NULL;
    OseoResult result = oseo_argument_list_view(
        context,
        cache,
        &count,
        &values
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    for (size_t index = 0u; index + 2u < count; index += 3u) {
        if (values[index] != proxy ||
            !oseo_internal_property_key_equal(values[index + 1u], key)) {
            continue;
        }
        *cached = true;
        *found = oseo_to_boolean(values[index + 2u]);
        break;
    }
    return normal(oseo_undefined());
}

/*
 * [[GetOwnProperty]] of one collected level, reduced to what collection
 * observes: whether the key is an own property, and whether it is
 * enumerable.
 */
static OseoResult enumeration_own_key(
    OseoContext *context,
    OseoValue level,
    OseoValue key,
    bool *found,
    bool *enumerable
) {
    *found = false;
    if (is_string(level)) {
        uint32_t index = 0u;
        if (oseo_internal_string_is_ascii(key, "length")) {
            *enumerable = false;
            *found = true;
            return normal(oseo_undefined());
        }
        if (oseo_internal_array_index(key, &index) &&
            index < string_object(level)->length) {
            *enumerable = true;
            *found = true;
            return normal(oseo_undefined());
        }
        return normal(oseo_undefined());
    }
    if (!is_object(level)) return normal(oseo_undefined());
    OseoValue value = oseo_undefined();
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    if (is_proxy(level)) {
        OseoResult result = oseo_internal_proxy_get_own_property(
            context, level, key, found, &value, &attributes, &getter, &setter);
        if (result.status != OSEO_STATUS_NORMAL || !*found) return result;
    } else if (!oseo_internal_own_descriptor(
            level,
            key,
            &value,
            &attributes,
            &getter,
            &setter
        )) return normal(oseo_undefined());
    else *found = true;
    *enumerable = attributes.enumerable;
    return normal(oseo_undefined());
}

/*
 * HasProperty over the receiver's chain. A collected own key whose deletion
 * uncovers an inherited property of the same name stays reportable. Proxy
 * descriptors already observed during collection are reused here.
 */
static OseoResult enumeration_reachable(
    OseoContext *context,
    OseoValue receiver,
    OseoValue key,
    OseoValue proxy_descriptors
) {
    bool found = false;
    bool enumerable = false;
    if (is_string(receiver)) {
        OseoResult result = enumeration_own_key(
            context, receiver, key, &found, &enumerable);
        if (result.status == OSEO_STATUS_NORMAL) {
            result.value = oseo_boolean(found);
        }
        return result;
    }
    OseoValue current = receiver;
    while (is_object(current)) {
        OseoResult result = normal(oseo_undefined());
        bool cached = false;
        if (is_proxy(current)) {
            result = enumeration_cached_proxy_descriptor(
                context,
                proxy_descriptors,
                current,
                key,
                &cached,
                &found
            );
        }
        if (result.status == OSEO_STATUS_NORMAL && !cached) {
            result = enumeration_own_key(
                context, current, key, &found, &enumerable);
        }
        if (result.status != OSEO_STATUS_NORMAL || found) {
            if (result.status == OSEO_STATUS_NORMAL) {
                result.value = oseo_boolean(true);
            }
            return result;
        }
        result = oseo_internal_get_prototype(context, current);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        current = result.value;
    }
    return normal(oseo_boolean(false));
}

/* The next level of the chain, or a non-object when the walk ends. */
static OseoResult enumeration_parent(
    OseoContext *context,
    OseoValue level
) {
    /* A string level stands for a String exotic object whose
     * %String.prototype% this realm never creates. */
    return is_object(level)
        ? oseo_internal_get_prototype(context, level)
        : normal(oseo_null());
}

/*
 * Collect the receiver's own and inherited enumerable string keys, with
 * every nearer own key suppressing the same name behind it.
 */
static OseoResult enumeration_collect(
    OseoContext *context,
    OseoValue receiver,
    OseoValue *proxy_descriptors
) {
    *proxy_descriptors = oseo_undefined();
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 7u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = receiver;
    result = oseo_argument_list_create(context);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        frame.slots[5] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_argument_list_create(context);
        frame.slots[6] = result.value;
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
            result = oseo_argument_list_append(
                context,
                frame.slots[6],
                frame.slots[0]
            );
            if (result.status == OSEO_STATUS_NORMAL) {
                result = oseo_argument_list_append(
                    context,
                    frame.slots[6],
                    frame.slots[4]
                );
            }
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = enumeration_parent(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    for (size_t index = 0u; result.status == OSEO_STATUS_NORMAL; ) {
        size_t count = 0u;
        const OseoValue *values = NULL;
        result = oseo_argument_list_view(
            context,
            frame.slots[6],
            &count,
            &values
        );
        if (result.status != OSEO_STATUS_NORMAL || index >= count) break;
        frame.slots[0] = values[index];
        frame.slots[4] = values[index + 1u];
        index += 2u;
        if (enumeration_recorded(context, frame.slots[2], frame.slots[4])) {
            continue;
        }
        bool enumerable = false;
        bool found = false;
        result = enumeration_own_key(
            context,
            frame.slots[0],
            frame.slots[4],
            &found,
            &enumerable
        );
        if (result.status == OSEO_STATUS_NORMAL && is_proxy(frame.slots[0])) {
            result = enumeration_cache_proxy_descriptor(
                context,
                frame.slots[5],
                frame.slots[0],
                frame.slots[4],
                found
            );
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (!found) continue;
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
    if (result.status == OSEO_STATUS_NORMAL) {
        result.value = frame.slots[1];
        *proxy_descriptors = frame.slots[5];
    }
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
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
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
    if (is_symbol(subject)) {
        symbol_prototype =
            context->intrinsics[OSEO_INTRINSIC_SYMBOL_PROTOTYPE];
    }
    frame.slots[0] = is_object(subject) || is_string(subject)
        ? subject
        : symbol_prototype;
    result = enumeration_collect(
        context,
        frame.slots[0],
        &frame.slots[2]
    );
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
            enumeration->proxy_descriptors = frame.slots[2];
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
        result = enumeration_reachable(
            context,
            enumeration->receiver,
            candidate,
            enumeration->proxy_descriptors
        );
        if (result.status != OSEO_STATUS_NORMAL) return result;
        if (!oseo_to_boolean(result.value)) {
            continue;
        }
        *key = candidate;
        *done = false;
        break;
    }
    return normal(oseo_undefined());
}
