#include "oseo_runtime.h"

#include <assert.h>
#include <stdio.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

/* Existing intrinsic initialization is outside this boundary's sweep. */
static void prepare(OseoContext *context, OseoValue *roots, size_t kind) {
    static const OseoIntrinsic constructors[] = {
        OSEO_INTRINSIC_BOOLEAN, OSEO_INTRINSIC_NUMBER,
        OSEO_INTRINSIC_STRING, OSEO_INTRINSIC_SYMBOL,
        OSEO_INTRINSIC_BIGINT
    };
    static const uint16_t units[] = {'a', 0xd800u, 'b'};
    static const uint16_t prototype_key[] = {
        'p', 'r', 'o', 't', 'o', 't', 'y', 'p', 'e'
    };
    static const uint16_t value_of_key[] = {
        'v', 'a', 'l', 'u', 'e', 'O', 'f'
    };
    roots[0] = kind == 0u ? oseo_boolean(false) : oseo_number(-0.0);
    if (kind >= 2u) {
        roots[0] = require_normal(oseo_string_from_units(context, units, 3u));
    }
    roots[1] = require_normal(oseo_intrinsic(context, constructors[kind]));
    if (kind == 3u) {
        roots[0] = require_normal(oseo_call_function(
            context, roots[1], oseo_undefined(), 1u, &roots[0],
            oseo_undefined()
        ));
    } else if (kind == 4u) {
        roots[0] = require_normal(oseo_bigint_literal(
            context, "123456789012345678901234567890", 10u
        ));
    }
    roots[2] = require_normal(oseo_string_from_units(
        context, prototype_key, 9u
    ));
    roots[1] = require_normal(oseo_object_get(
        context, roots[1], roots[2]
    ));
    roots[2] = require_normal(oseo_string_from_units(
        context, value_of_key, 7u
    ));
    roots[1] = require_normal(oseo_object_get(
        context, roots[1], roots[2]
    ));
    context->observe_specialization = true;
    context->collect_every_safepoint = true;
}

/* A failed boxing attempt must balance its roots and permit a full retry. */
static size_t exercise(size_t kind, size_t fail_at) {
    OseoContext context;
    oseo_context_init(&context, "wrapper-allocation.c", 20u);
    OseoValue roots[5];
    for (size_t index = 0u; index < 5u; index += 1u) {
        roots[index] = oseo_undefined();
    }
    OseoRootFrame frame = {NULL, roots, 5u};
    oseo_roots_push(&context, &frame);
    prepare(&context, roots, kind);
    oseo_context_fail_allocation_at(&context, fail_at);
    OseoResult result = oseo_this_value(&context, roots[0]);
    size_t attempts = context.allocation_attempts;
    assert(context.roots == &frame);
    if (fail_at != 0u) {
        assert(result.status == OSEO_STATUS_THROW);
        assert(result.value == oseo_undefined());
        assert(context.has_diagnostic);
        oseo_context_fail_allocation_at(&context, 0u);
        context.has_diagnostic = false;
        context.error_code = NULL;
        context.error_message = NULL;
        oseo_collect(&context);
        result = oseo_this_value(&context, roots[0]);
    }
    roots[3] = require_normal(result);
    roots[4] = require_normal(oseo_this_value(&context, roots[0]));
    assert(roots[3] != roots[4]);
    oseo_collect(&context);
    for (size_t index = 3u; index < 5u; index += 1u) {
        OseoValue value = require_normal(oseo_call_function(
            &context, roots[1], roots[index], 0u, NULL, oseo_undefined()
        ));
        assert(value == roots[0]);
    }
    assert(context.collections > 0u);
    assert(context.roots == &frame);
    oseo_roots_pop(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
    return attempts;
}

int main(void) {
    for (size_t kind = 0u; kind < 5u; kind += 1u) {
        size_t attempts = exercise(kind, 0u);
        assert(attempts > 0u && attempts <= 128u);
        for (size_t fail_at = 1u; fail_at <= attempts; fail_at += 1u) {
            (void)exercise(kind, fail_at);
        }
    }
    puts("wrapper allocation failures and retries passed");
    return 0;
}
