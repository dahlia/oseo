#include "runtime_internal.h"

#include <assert.h>
#include <stdio.h>

/* Direct construction tests a foreign ordinary callee without dynamic source.
 * The dispatcher follows the emitted strict/sloppy entry contract, checked
 * independently by the structural TypeScript test. This is fixture source,
 * not evidence of successful execution until the selected native lane runs. */
static OseoValue *live;

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoResult dispatch(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)new_target;
    assert(argument_count == 1u);
    assert(context->realm_record == live[0]);
    OseoValue slots[2] = {receiver, arguments[0]};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    size_t code_id = 0u;
    OseoResult result = oseo_function_code_id(context, callee, &code_id);
    if (result.status == OSEO_STATUS_NORMAL && code_id == 2u) {
        result = oseo_this_value(context, slots[0]);
        slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        live[7] = slots[0];
        live[8] = slots[1];
        oseo_collect(context);
        assert(live[8] == live[4]);
        if (code_id == 1u) assert(live[7] == live[1]);
        else {
            assert(is_object(live[7]));
            assert(ordinary_object(live[7])->prototype == live[6]);
            assert(ordinary_object(live[7])->primitive_value == live[1]);
        }
        result = normal(oseo_undefined());
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static void prepare(OseoContext *context, size_t kind, bool strict_setter) {
    static const OseoIntrinsic prototypes[] = {
        OSEO_INTRINSIC_BOOLEAN_PROTOTYPE, OSEO_INTRINSIC_NUMBER_PROTOTYPE,
        OSEO_INTRINSIC_STRING_PROTOTYPE, OSEO_INTRINSIC_SYMBOL_PROTOTYPE,
        OSEO_INTRINSIC_BIGINT_PROTOTYPE
    };
    static const uint16_t text[] = {'a', 0xd800u, 'b'};
    static const uint16_t name[] = {'p', 'r', 'o', 'b', 'e'};
    live[1] = kind == 0u ? oseo_boolean(false) : oseo_number(-0.0);
    if (kind == 2u || kind == 3u) {
        live[1] = require_normal(oseo_string_from_units(context, text, 3u));
    }
    if (kind == 3u) {
        live[5] = require_normal(oseo_symbol_intrinsic(context));
        live[1] = require_normal(oseo_call_function(
            context, live[5], oseo_undefined(), 1u, &live[1], oseo_undefined()
        ));
    }
    if (kind == 4u) {
        live[1] = require_normal(oseo_bigint_literal(
            context, "123456789012345678901234567890", 10u
        ));
    }
    live[2] = require_normal(oseo_intrinsic(context, prototypes[kind]));
    live[3] = require_normal(oseo_string_from_units(context, name, 5u));
    live[4] = require_normal(oseo_object_create(context, oseo_null()));
    live[0] = require_normal(oseo_internal_realm_create(context));
    OseoRealmScope scope;
    oseo_internal_realm_enter(context, &scope, live[0]);
    live[6] = require_normal(oseo_intrinsic(context, prototypes[kind]));
    live[5] = require_normal(oseo_environment_create(context, 0u));
    live[5] = require_normal(oseo_function_create(
        context, strict_setter ? 1u : 2u, live[5], name, 5u, 1u,
        OSEO_FUNCTION_ORDINARY, oseo_undefined(), oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    oseo_internal_realm_leave(context, &scope);
    (void)require_normal(oseo_object_define_accessor(
        context, live[2], live[3], oseo_undefined(), live[5], false, true,
        (OseoPropertyAttributes){false, false, true, true}
    ));
    oseo_context_set_function_dispatcher(context, dispatch);
    context->collect_every_safepoint = true;
    context->observe_specialization = true;
}

/* Sweep warmed PutValue/boxing allocations. Every failed allocation must
 * restore the caller's root frame and realm and permit a successful retry.
 */
static size_t exercise(size_t kind, bool strict_setter, size_t fail_at) {
    OseoContext context;
    static const char source_id[] = "primitive-set-allocation.c";
    oseo_context_init(&context, source_id, sizeof(source_id) - 1u);
    OseoValue roots[9];
    for (size_t index = 0u; index < 9u; index += 1u) {
        roots[index] = oseo_undefined();
    }
    live = roots;
    OseoRootFrame frame = {NULL, roots, 9u};
    oseo_roots_push(&context, &frame);
    prepare(&context, kind, strict_setter);
    oseo_context_fail_allocation_at(&context, fail_at);
    OseoResult result = oseo_object_set(
        &context, roots[1], roots[3], roots[4], true
    );
    size_t attempts = context.allocation_attempts;
    assert(context.roots == &frame);
    assert(context.realm_record == oseo_undefined());
    if (fail_at != 0u) {
        assert(result.status == OSEO_STATUS_THROW);
        assert(context.has_diagnostic);
        oseo_context_fail_allocation_at(&context, 0u);
        context.has_diagnostic = false;
        context.error_code = NULL;
        context.error_message = NULL;
        oseo_context_clear_language_error(&context);
        oseo_collect(&context);
        result = oseo_object_set(&context, roots[1], roots[3], roots[4], true);
    }
    assert(require_normal(result) == roots[4]);
    assert(roots[8] == roots[4]);
    assert(context.collections > 0u);
    assert(context.roots == &frame);
    assert(context.realm_record == oseo_undefined());
    oseo_roots_pop(&context, &frame);
    assert(context.roots == NULL);
    oseo_context_destroy(&context);
    live = NULL;
    return attempts;
}

int main(void) {
    for (size_t kind = 0u; kind < 5u; kind += 1u) {
        for (size_t mode = 0u; mode < 2u; mode += 1u) {
            size_t attempts = exercise(kind, mode != 0u, 0u);
            assert(attempts > 0u && attempts <= 128u);
            for (size_t fail_at = 1u; fail_at <= attempts; fail_at += 1u) {
                (void)exercise(kind, mode != 0u, fail_at);
            }
        }
    }
    puts("primitive Set roots and realms passed");
    return 0;
}
