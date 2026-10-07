#include "runtime_internal.h"

/*
 * Realms beyond the initial realm (ADR 0027): realm records and the
 * running realm, GetFunctionRealm and the realm-aware defaults of
 * GetPrototypeFromConstructor, %eval%, and the test262 host's
 * `$262.createRealm`.
 *
 * A context is one agent. Its initial realm lives in the context, and
 * every later realm is a collected heap record. All realms of a context
 * share the heap, the collector, the job queues, the well-known symbols,
 * and the symbol registry; each owns its intrinsic graph, global object,
 * literal caches, and Math.random state. Generated code always runs in
 * the initial realm, because no source text is compiled for a created
 * realm; a created realm runs only its own built-in functions.
 */

OseoResult oseo_internal_function_realm(
    OseoContext *context,
    OseoValue constructor
) {
    OseoValue current = constructor;
    while (true) {
        if (is_proxy(current)) {
            if (proxy_object(current)->revoked) {
                return oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "Cannot get the realm of a revoked Proxy."
                );
            }
            current = proxy_object(current)->target;
            continue;
        }
        if (!is_function(current)) return normal(context->realm_record);
        if (function_object(current)->function_kind == OSEO_FUNCTION_BOUND) {
            current = function_object(current)->bound_target;
            continue;
        }
        return normal(function_object(current)->realm);
    }
}

OseoValue oseo_internal_callee_realm(OseoContext *context, OseoValue function) {
    OseoValue current = function;
    while (is_callable(current)) {
        if (is_proxy(current)) {
            if (proxy_object(current)->revoked) break;
            current = proxy_object(current)->target;
            continue;
        }
        if (!is_function(current)) break;
        if (function_object(current)->function_kind == OSEO_FUNCTION_BOUND) {
            current = function_object(current)->bound_target;
            continue;
        }
        return function_object(current)->realm;
    }
    return context->realm_record;
}

OseoRealm *oseo_internal_realm_state(
    OseoContext *context,
    OseoValue realm_value
) {
    return is_realm_record(realm_value)
        ? &realm_record_object(realm_value)->realm
        : &context->initial_realm;
}

void oseo_internal_realm_enter(
    OseoContext *context,
    OseoRealmScope *scope,
    OseoValue realm_value
) {
    scope->realm = context->realm;
    scope->record = context->realm_record;
    scope->frame.previous = NULL;
    scope->frame.slots = &scope->record;
    scope->frame.slot_count = 1u;
    scope->entered = realm_value != context->realm_record;
    if (!scope->entered) return;
    oseo_roots_push(context, &scope->frame);
    context->realm = oseo_internal_realm_state(context, realm_value);
    context->realm_record = realm_value;
}

void oseo_internal_realm_leave(OseoContext *context, OseoRealmScope *scope) {
    if (!scope->entered) return;
    context->realm = oseo_internal_realm_state(context, scope->record);
    context->realm_record = scope->record;
    oseo_roots_pop(context, &scope->frame);
}

OseoResult oseo_internal_realm_intrinsic(
    OseoContext *context,
    OseoValue realm_value,
    OseoIntrinsic intrinsic
) {
    OseoRealmScope scope;
    oseo_internal_realm_enter(context, &scope, realm_value);
    OseoResult result = oseo_internal_intrinsic(context, intrinsic);
    oseo_internal_realm_leave(context, &scope);
    return result;
}

OseoResult oseo_internal_constructor_realm_default(
    OseoContext *context,
    OseoValue constructor,
    OseoIntrinsic intrinsic
) {
    OseoResult result = oseo_internal_function_realm(context, constructor);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return oseo_internal_realm_intrinsic(context, result.value, intrinsic);
}

OseoResult oseo_internal_function_receiver(
    OseoContext *context,
    OseoValue constructor,
    OseoValue prototype
) {
    if (is_object(prototype) || is_proxy(constructor)) {
        return oseo_constructor_receiver(context, prototype);
    }
    OseoValue slots[1] = {oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_constructor_realm_default(
        context,
        constructor,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, slots[0]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}
/* A built-in function of the running realm with one fixed ASCII name. */
static OseoResult realm_function(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length
) {
    size_t name_length = strlen(name);
    uint16_t units[16];
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
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_eval_intrinsic(OseoContext *context) {
    OseoValue *cache = &context->realm->intrinsics[OSEO_INTRINSIC_EVAL];
    if (tag_of(*cache) != OSEO_TAG_UNDEFINED) return normal(*cache);
    OseoResult result = realm_function(context, OSEO_EVAL_CODE_ID, "eval", 1u);
    if (result.status == OSEO_STATUS_NORMAL) *cache = result.value;
    return result;
}

/* Defines one writable, non-enumerable, configurable data property. */
static OseoResult define_realm_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
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
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_realm_global(
    OseoContext *context,
    OseoValue realm_value
) {
    OseoRealmScope scope;
    oseo_internal_realm_enter(context, &scope, realm_value);
    OseoResult result = oseo_this_value(context, oseo_undefined());
    oseo_internal_realm_leave(context, &scope);
    return result;
}

OseoResult oseo_internal_realm_create(OseoContext *context) {
    OseoRealmRecord *record =
        oseo_internal_allocate_heap_bytes(context, sizeof(*record));
    if (record == NULL) {
        return failure(context, "OSEO2001", "Realm allocation failed.");
    }
    oseo_internal_realm_init(&record->realm);
    OseoResult result = oseo_internal_publish_heap(
        context,
        &record->header,
        OSEO_HEAP_REALM
    );
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue realm = result.value;
    OseoRootFrame frame = {NULL, &realm, 1u};
    oseo_roots_push(context, &frame);
    /* SetDefaultGlobalBindings runs as part of creating the realm, so a
     * realm never exists without its global object. */
    result = oseo_internal_realm_global(context, realm);
    if (result.status == OSEO_STATUS_NORMAL) result = normal(realm);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_realm_host_install(
    OseoContext *context,
    OseoValue host
) {
    OseoValue slots[2] = {host, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = realm_function(
        context,
        OSEO_CREATE_REALM_CODE_ID,
        "createRealm",
        0u
    );
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_realm_property(
            context,
            slots[0],
            "createRealm",
            slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_this_value(context, oseo_undefined());
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_realm_property(context, slots[0], "global", slots[1]);
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * `$262.createRealm()`: a new realm and, created inside it, that realm's
 * own host object, whose `global` is the new global object and whose
 * `createRealm` belongs to the new realm. The host object carries no
 * `agent`, because agents belong to the cluster's main host object.
 */
static OseoResult create_realm(OseoContext *context) {
    OseoResult result = oseo_internal_realm_create(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[2] = {result.value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoRealmScope scope;
    oseo_internal_realm_enter(context, &scope, slots[0]);
    result = oseo_internal_intrinsic(context, OSEO_INTRINSIC_OBJECT_PROTOTYPE);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, result.value);
        slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_realm_host_install(context, slots[1]);
    }
    oseo_internal_realm_leave(context, &scope);
    if (result.status == OSEO_STATUS_NORMAL) result = normal(slots[1]);
    oseo_roots_pop(context, &frame);
    return result;
}

OseoResult oseo_internal_realm_builtin_dispatch(
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
    /* ADR 0016 keeps every form that compiles source text at run time
     * outside the profile. %eval% is a complete function value in every
     * realm. PerformEval returns a non-String argument unchanged without
     * parsing anything, and only a String, which it would parse as a
     * Script, reports the boundary. */
    if (code_id == OSEO_EVAL_CODE_ID) {
        OseoValue source = argument_count > 0u
            ? arguments[0]
            : oseo_undefined();
        if (!is_string(source)) return normal(source);
        return failure(
            context,
            "OSEO1001",
            "eval compiles source text at run time, which is outside the "
            "admitted profile."
        );
    }
    if (code_id == OSEO_CREATE_REALM_CODE_ID) return create_realm(context);
    return oseo_unknown_function(context, code_id);
}
