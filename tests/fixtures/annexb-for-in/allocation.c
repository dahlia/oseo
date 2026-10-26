#include "runtime_internal.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

/* Configure the stored bootstrap accessor before the acquisition-only sweep.
 * Keep both reflected identities rooted and preserve them when changing only
 * enumerability; the retired virtual metadata is not the own descriptor. */
static void prepare_enumerable_proto(OseoContext *context, OseoValue *roots) {
    roots[2] = require_normal(oseo_internal_ascii_string(context, "__proto__"));
    OseoValue value = oseo_undefined();
    OseoPropertyAttributes attributes = {false, false, false, false};
    uint8_t omitted = 0u;
    bool found = oseo_internal_own_descriptor(
        roots[0], roots[2], &value, &attributes, &roots[3], &roots[4], &omitted
    );
    assert(found);
    assert(attributes.accessor && attributes.configurable && omitted == 0u);
    assert(is_callable(roots[3]) && is_callable(roots[4]));
    attributes.enumerable = true;
    (void)require_normal(oseo_object_define_accessor(
        context, roots[0], roots[2], roots[3], roots[4], true, true, attributes
    ));
    OseoValue getter = oseo_undefined();
    OseoValue setter = oseo_undefined();
    found = oseo_internal_own_descriptor(
        roots[0], roots[2], &value, &attributes, &getter, &setter, &omitted
    );
    assert(found);
    assert(attributes.enumerable && omitted == 0u);
    assert(getter == roots[3] && setter == roots[4]);
    roots[2] = oseo_undefined();
    roots[3] = oseo_undefined();
    roots[4] = oseo_undefined();
}

static void prepare_value(OseoContext *context, OseoValue *roots, size_t kind) {
    static const uint16_t units[] = {'a', 'b'};
    roots[1] = kind == 0u ? oseo_boolean(false) : oseo_number(-0.0);
    if (kind == 2u || kind == 3u) {
        roots[1] = require_normal(oseo_string_from_units(context, units, 2u));
    }
    if (kind == 3u) {
        roots[4] = require_normal(oseo_symbol_intrinsic(context));
        roots[1] = require_normal(oseo_call_function(
            context, roots[4], oseo_undefined(), 1u, &roots[1], oseo_undefined()
        ));
    }
    if (kind == 4u) {
        roots[1] = require_normal(oseo_bigint_literal(context, "123", 10u));
    }
}

/* Exercise only acquisition's actual allocation attempts. Each fresh context
 * is warmed identically; every failure must unwind the primitive wrapper and
 * candidate roots, preserve the caller realm and allow the same retry. */
static size_t exercise(size_t kind, size_t fail_at) {
    OseoContext context;
    static const char source_id[] = "annexb-for-in-allocation.c";
    oseo_context_init(&context, source_id, sizeof(source_id) - 1u);
    OseoValue roots[5];
    for (size_t index = 0u; index < 5u; index += 1u) {
        roots[index] = oseo_undefined();
    }
    OseoRootFrame frame = {NULL, roots, 5u};
    oseo_roots_push(&context, &frame);
    roots[0] = require_normal(oseo_internal_intrinsic(
        &context, OSEO_INTRINSIC_OBJECT_PROTOTYPE));
    prepare_enumerable_proto(&context, roots);
    prepare_value(&context, roots, kind);
    context.observe_specialization = true;
    context.collect_every_safepoint = true;
    OseoValue original_realm = context.realm_record;
    bool done = true;
    (void)require_normal(oseo_enumerate_get(
        &context, roots[1], &roots[2], &done));
    assert(!done);
    roots[2] = oseo_undefined();
    oseo_collect(&context);

    oseo_context_fail_allocation_at(&context, fail_at);
    OseoResult acquired = oseo_enumerate_get(
        &context, roots[1], &roots[2], &done);
    size_t attempts = context.allocation_attempts;
    assert(context.roots == &frame);
    assert(context.realm_record == original_realm);
    if (fail_at != 0u) {
        assert(acquired.status == OSEO_STATUS_THROW);
        assert(context.has_diagnostic);
        assert(strcmp(context.error_code, "OSEO2001") == 0);
        assert(done && roots[2] == oseo_undefined());
        oseo_context_fail_allocation_at(&context, 0u);
        context.has_diagnostic = false;
        context.error_code = NULL;
        context.error_message = NULL;
        oseo_context_clear_language_error(&context);
        oseo_collect(&context);
        acquired = oseo_enumerate_get(
            &context, roots[1], &roots[2], &done);
    }
    (void)require_normal(acquired);
    assert(!done);
    size_t count = 0u;
    while (!done) {
        (void)require_normal(oseo_enumerate_next(
            &context, roots[2], &roots[3], &done));
        if (done) break;
        const char *expected = kind == 2u && count < 2u
            ? (count == 0u ? "0" : "1") : "__proto__";
        assert(oseo_internal_string_is_ascii(roots[3], expected));
        count += 1u;
    }
    assert(count == (kind == 2u ? 3u : 1u));
    assert(context.collections > 0u);
    assert(context.roots == &frame);
    assert(context.realm_record == original_realm);
    assert(context.active_frame_slots == 0u && context.call_depth == 0u);
    oseo_roots_pop(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
    return attempts;
}

int main(void) {
    for (size_t kind = 0u; kind < 5u; kind += 1u) {
        size_t attempts = exercise(kind, 0u);
        assert(attempts > 0u && attempts <= 512u);
        for (size_t failure = 1u; failure <= attempts; failure += 1u) {
            (void)exercise(kind, failure);
        }
    }
    puts("for-in allocation roots and retry passed");
    return 0;
}
