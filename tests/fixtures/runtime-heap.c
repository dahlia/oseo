#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue make_text(OseoContext *context, const char *text);

static void test_primitive_prototype_intrinsics(OseoContext *context) {
    static const OseoIntrinsic intrinsics[] = {
        OSEO_INTRINSIC_BOOLEAN_PROTOTYPE,
        OSEO_INTRINSIC_STRING_PROTOTYPE,
        OSEO_INTRINSIC_BIGINT_PROTOTYPE,
    };
    for (size_t index = 0u;
         index < sizeof(intrinsics) / sizeof(intrinsics[0]);
         index += 1u) {
        OseoIntrinsic intrinsic = intrinsics[index];
        assert(context->intrinsics[intrinsic] == oseo_undefined());
        OseoValue first = require_normal(oseo_intrinsic(context, intrinsic));
        assert(first != oseo_undefined());
        assert(require_normal(oseo_intrinsic(context, intrinsic)) == first);
    }
}

static void test_deep_graph(OseoContext *context, OseoValue *roots) {
    const size_t depth = 4096u;
    roots[0] = require_normal(oseo_environment_create(context, 1u));
    for (size_t index = 0u; index < depth; index += 1u) {
        roots[1] = require_normal(oseo_environment_create(context, 1u));
        (void)require_normal(
            oseo_environment_set(context, roots[1], 0u, roots[0])
        );
        roots[0] = roots[1];
    }
    oseo_collect(context);
    OseoValue current = roots[0];
    for (size_t index = 0u; index < depth; index += 1u) {
        current = require_normal(oseo_environment_get(context, current, 0u));
    }
    (void)require_normal(oseo_environment_get(context, current, 0u));
}

static void test_forward_graph(OseoContext *context, OseoValue *roots) {
    const size_t depth = 16384u;
    roots[0] = require_normal(oseo_environment_create(context, 1u));
    roots[1] = roots[0];
    for (size_t index = 0u; index < depth; index += 1u) {
        roots[2] = require_normal(oseo_environment_create(context, 1u));
        (void)require_normal(
            oseo_environment_set(context, roots[1], 0u, roots[2])
        );
        roots[1] = roots[2];
    }
    roots[1] = oseo_undefined();
    roots[2] = oseo_undefined();
    oseo_collect(context);
    OseoValue current = roots[0];
    for (size_t index = 0u; index < depth; index += 1u) {
        current = require_normal(oseo_environment_get(context, current, 0u));
    }
    (void)require_normal(oseo_environment_get(context, current, 0u));
}

static void test_cycle_and_sharing(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_environment_create(context, 2u));
    roots[1] = require_normal(oseo_environment_create(context, 1u));
    roots[2] = require_normal(oseo_environment_create(context, 1u));
    (void)require_normal(
        oseo_environment_set(context, roots[0], 0u, roots[1])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[0], 1u, roots[1])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[1], 0u, roots[2])
    );
    (void)require_normal(
        oseo_environment_set(context, roots[2], 0u, roots[0])
    );
    context->collect_every_safepoint = true;
    oseo_collect(context);
    OseoValue first = require_normal(
        oseo_environment_get(context, roots[0], 0u)
    );
    OseoValue second = require_normal(
        oseo_environment_get(context, roots[0], 1u)
    );
    assert(first == second);
    OseoValue tail = require_normal(
        oseo_environment_get(context, first, 0u)
    );
    assert(
        require_normal(oseo_environment_get(context, tail, 0u)) == roots[0]
    );
    context->collect_every_safepoint = false;
}

static void test_allocation_failure(
    OseoContext *context,
    OseoValue *roots
) {
    oseo_context_fail_allocation_at(context, 2u);
    roots[0] = require_normal(oseo_environment_create(context, 1u));
    OseoResult failed = oseo_environment_create(context, 1u);
    assert(failed.status == OSEO_STATUS_THROW);
    assert(context->allocation_attempts == 2u);
    oseo_collect(context);
    (void)require_normal(oseo_environment_get(context, roots[0], 0u));
    oseo_context_fail_allocation_at(context, 0u);
}

static void test_bigint_survival(OseoContext *context, OseoValue *roots) {
    roots[0] = require_normal(oseo_bigint_literal(
        context,
        "123456789012345678901234567890",
        10u
    ));
    roots[1] = require_normal(oseo_bigint_literal(context, "2", 10u));
    roots[2] = require_normal(oseo_add(context, roots[0], roots[1]));
    roots[3] = require_normal(oseo_bigint_literal(
        context,
        "123456789012345678901234567892",
        10u
    ));
    assert(
        require_normal(oseo_strict_equal(context, roots[2], roots[3])) ==
        oseo_boolean(true)
    );
    context->collect_every_safepoint = true;
    roots[4] = require_normal(oseo_shift_left(context, roots[2], roots[1]));
    roots[6] = require_normal(oseo_to_string(context, roots[3]));
    assert(require_normal(oseo_loose_equal(
        context,
        roots[3],
        roots[6]
    )) == oseo_boolean(true));
    roots[7] = make_text(context, "999");
    assert(require_normal(oseo_greater_than(
        context,
        roots[3],
        roots[7]
    )) == oseo_boolean(true));
    context->collect_every_safepoint = false;
    oseo_collect(context);
    roots[5] = require_normal(oseo_shift_right(context, roots[4], roots[1]));
    assert(
        require_normal(oseo_strict_equal(context, roots[5], roots[3])) ==
        oseo_boolean(true)
    );
    assert(oseo_add(context, roots[0], oseo_number(1.0)).status ==
           OSEO_STATUS_THROW);
}

typedef enum {
    BIGINT_ALLOCATION_CLUSTER,
    BIGINT_ALLOCATION_PUBLICATION,
    BIGINT_ALLOCATION_NUMBER,
    BIGINT_ALLOCATION_RADIX,
    BIGINT_ALLOCATION_WRAPPER,
    BIGINT_ALLOCATION_OPERATION_COUNT,
} BigIntAllocationOperation;

static void prepare_bigint_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    BigIntAllocationOperation operation
) {
    if (operation == BIGINT_ALLOCATION_CLUSTER) {
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_OBJECT)
        );
    } else if (operation == BIGINT_ALLOCATION_NUMBER) {
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT)
        );
    } else if (operation == BIGINT_ALLOCATION_RADIX) {
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT_TO_STRING)
        );
        roots[1] = require_normal(oseo_bigint_literal(
            context,
            "123456789012345678901234567890",
            10u
        ));
        roots[2] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT)
        );
    } else if (operation == BIGINT_ALLOCATION_WRAPPER) {
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_OBJECT)
        );
        roots[1] = require_normal(
            oseo_bigint_literal(context, "12345678901234567890", 10u)
        );
        roots[2] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT)
        );
    }
}

static OseoResult run_bigint_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    BigIntAllocationOperation operation
) {
    if (operation == BIGINT_ALLOCATION_CLUSTER) {
        return oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT);
    }
    if (operation == BIGINT_ALLOCATION_PUBLICATION) {
        return oseo_bigint_literal(
            context,
            "123456789012345678901234567890",
            10u
        );
    }
    if (operation == BIGINT_ALLOCATION_NUMBER) {
        OseoValue argument = oseo_number(0x1p70);
        return oseo_call_function(
            context,
            roots[0],
            oseo_undefined(),
            1u,
            &argument,
            oseo_undefined()
        );
    }
    if (operation == BIGINT_ALLOCATION_RADIX) {
        OseoValue radix = oseo_number(16.0);
        return oseo_call_function(
            context,
            roots[0],
            roots[1],
            1u,
            &radix,
            oseo_undefined()
        );
    }
    return oseo_call_function(
        context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        oseo_undefined()
    );
}

static void assert_bigint_cluster_unpublished(const OseoContext *context) {
    assert(
        context->intrinsics[OSEO_INTRINSIC_BIGINT_PROTOTYPE] ==
        oseo_undefined()
    );
    for (size_t intrinsic = OSEO_INTRINSIC_BIGINT;
         intrinsic <= OSEO_INTRINSIC_BIGINT_VALUE_OF;
         intrinsic += 1u) {
        assert(context->intrinsics[intrinsic] == oseo_undefined());
    }
}

static size_t bigint_allocation_attempt_count(
    BigIntAllocationOperation operation
) {
    OseoContext context;
    OseoValue roots[6] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 6u};
    oseo_context_init(&context, "runtime-heap.c", 14u);
    oseo_roots_push(&context, &frame);
    prepare_bigint_allocation_operation(&context, roots, operation);
    context.collect_every_safepoint = true;
    oseo_context_fail_allocation_at(&context, 0u);
    roots[3] = require_normal(
        run_bigint_allocation_operation(&context, roots, operation)
    );
    size_t attempts = context.allocation_attempts;
    assert(attempts > 0u && attempts <= 128u);
    oseo_collect(&context);
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
    return attempts;
}

static void validate_bigint_allocation_retry(
    OseoContext *context,
    OseoValue *roots,
    BigIntAllocationOperation operation
) {
    if (operation == BIGINT_ALLOCATION_CLUSTER) {
        assert(
            roots[3] ==
            require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_BIGINT))
        );
        for (size_t intrinsic = OSEO_INTRINSIC_BIGINT;
             intrinsic <= OSEO_INTRINSIC_BIGINT_VALUE_OF;
             intrinsic += 1u) {
            assert(context->intrinsics[intrinsic] != oseo_undefined());
        }
        return;
    }
    if (operation == BIGINT_ALLOCATION_WRAPPER) {
        assert(
            require_normal(oseo_loose_equal(context, roots[3], roots[1])) ==
            oseo_boolean(true)
        );
        return;
    }
    roots[4] = require_normal(oseo_to_string(context, roots[3]));
    const char *expected = operation == BIGINT_ALLOCATION_RADIX
        ? "18ee90ff6c373e0ee4e3f0ad2"
        : operation == BIGINT_ALLOCATION_NUMBER
          ? "1180591620717411303424"
          : "123456789012345678901234567890";
    roots[5] = make_text(context, expected);
    assert(
        require_normal(oseo_strict_equal(context, roots[4], roots[5])) ==
        oseo_boolean(true)
    );
}

/* Every allocation in each BigInt-owned path fails once in a fresh context.
 * No attempt publishes a result or partial cluster. Collection then runs and
 * the same context retries with stable intrinsic identity and rooted output. */
static void test_bigint_allocation_sweep(void) {
    for (BigIntAllocationOperation operation = BIGINT_ALLOCATION_CLUSTER;
         operation < BIGINT_ALLOCATION_OPERATION_COUNT;
         operation += 1) {
        size_t attempts = bigint_allocation_attempt_count(operation);
        for (size_t attempt = 1u; attempt <= attempts; attempt += 1u) {
            OseoContext context;
            OseoValue roots[6] = {
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
            };
            OseoRootFrame frame = {NULL, roots, 6u};
            oseo_context_init(&context, "runtime-heap.c", 14u);
            oseo_roots_push(&context, &frame);
            prepare_bigint_allocation_operation(&context, roots, operation);
            OseoValue identity = roots[2];
            if (operation == BIGINT_ALLOCATION_NUMBER) identity = roots[0];
            context.collect_every_safepoint = true;
            oseo_context_fail_allocation_at(&context, attempt);
            OseoResult failed = run_bigint_allocation_operation(
                &context,
                roots,
                operation
            );
            assert(failed.status == OSEO_STATUS_THROW);
            assert(failed.value == oseo_undefined());
            assert(context.has_diagnostic);
            if (operation == BIGINT_ALLOCATION_CLUSTER) {
                assert_bigint_cluster_unpublished(&context);
            } else if (identity != oseo_undefined()) {
                assert(
                    require_normal(oseo_intrinsic(
                        &context,
                        OSEO_INTRINSIC_BIGINT
                    )) == identity
                );
            }
            oseo_collect(&context);
            oseo_context_fail_allocation_at(&context, 0u);
            context.has_diagnostic = false;
            context.error_code = NULL;
            context.error_message = NULL;
            roots[3] = require_normal(run_bigint_allocation_operation(
                &context,
                roots,
                operation
            ));
            oseo_collect(&context);
            validate_bigint_allocation_retry(&context, roots, operation);
            oseo_roots_pop(&context, &frame);
            oseo_context_destroy(&context);
        }
    }
}

static OseoValue make_key(
    OseoContext *context,
    uint16_t unit
) {
    return require_normal(oseo_string_from_units(context, &unit, 1u));
}

static OseoValue make_text(OseoContext *context, const char *text) {
    size_t length = strlen(text);
    assert(length <= 64u);
    uint16_t units[64];
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return require_normal(oseo_string_from_units(context, units, length));
}

static void test_ordinary_properties(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_object_create(context, oseo_null()));
    roots[1] = require_normal(oseo_object_create(context, roots[0]));
    roots[2] = make_key(context, UINT16_C(0x0078));
    roots[3] = make_key(context, UINT16_C(0x0066));
    roots[4] = make_key(context, UINT16_C(0x0075));
    (void)require_normal(
        oseo_object_set(
            context, roots[0], roots[2], oseo_number(1.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[1], roots[2])) ==
        oseo_number(1.0)
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[1], roots[2], oseo_number(2.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[1], roots[2])) ==
        oseo_number(2.0)
    );
    OseoPropertyAttributes fixed = {false, false, false, false};
    (void)require_normal(
        oseo_object_define(
            context,
            roots[1],
            roots[3],
            oseo_number(3.0),
            fixed
        )
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[1], roots[3], oseo_number(4.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[1], roots[3])) ==
        oseo_number(3.0)
    );
    assert(
        require_normal(
            oseo_object_delete(context, roots[1], roots[3], false)
        ) ==
        oseo_boolean(false)
    );
    assert(
        oseo_object_delete(context, roots[1], roots[3], true).status ==
        OSEO_STATUS_THROW
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[1], roots[4], oseo_undefined(), false
        )
    );
    assert(
        require_normal(oseo_object_has_own(context, roots[1], roots[4])) ==
        oseo_boolean(true)
    );
    assert(
        require_normal(
            oseo_object_delete(context, roots[1], roots[2], false)
        ) ==
        oseo_boolean(true)
    );
    assert(
        require_normal(oseo_object_get(context, roots[1], roots[2])) ==
        oseo_number(1.0)
    );
    assert(
        oseo_object_set_prototype(context, roots[0], roots[1]).status ==
        OSEO_STATUS_THROW
    );
    roots[5] = require_normal(oseo_object_create(context, oseo_null()));
    (void)require_normal(
        oseo_object_set(
            context, roots[5], roots[2], oseo_number(5.0), false
        )
    );
    roots[6] = require_normal(oseo_object_literal_create(context));
    (void)require_normal(
        oseo_object_literal_set_prototype(context, roots[6], roots[5])
    );
    assert(
        require_normal(oseo_object_get(context, roots[6], roots[2])) ==
        oseo_number(5.0)
    );
    roots[7] = require_normal(oseo_object_literal_create(context));
    assert(
        require_normal(oseo_object_literal_set_prototype(
            context,
            roots[7],
            oseo_number(1.0)
        )) == roots[7]
    );
    assert(
        require_normal(oseo_object_has_own(context, roots[7], roots[2])) ==
        oseo_boolean(false)
    );
    (void)require_normal(
        oseo_object_set(context, roots[1], roots[2], roots[1], false)
    );
    oseo_collect(context);
    assert(
        require_normal(oseo_object_get(context, roots[1], roots[2])) == roots[1]
    );
}

static void test_arrays(OseoContext *context, OseoValue *roots) {
    roots[0] = require_normal(oseo_array_create(context, 3u));
    roots[1] = make_text(context, "0");
    roots[2] = make_text(context, "2");
    roots[3] = make_text(context, "5");
    roots[4] = make_text(context, "length");
    (void)require_normal(
        oseo_object_set(
            context, roots[0], roots[1], oseo_number(1.0), false
        )
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[0], roots[2], oseo_number(3.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[4])) ==
        oseo_number(3.0)
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[0], roots[3], oseo_number(6.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[4])) ==
        oseo_number(6.0)
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[0], roots[4], oseo_number(1.0), false
        )
    );
    assert(
        require_normal(oseo_object_has_own(context, roots[0], roots[2])) ==
        oseo_boolean(false)
    );
    OseoPropertyAttributes fixed = {false, true, true, false};
    (void)require_normal(
        oseo_object_define(
            context,
            roots[0],
            roots[2],
            oseo_number(3.0),
            fixed
        )
    );
    assert(
        require_normal(oseo_object_set(
            context,
            roots[0],
            roots[4],
            oseo_number(1.0),
            false
        )) == oseo_number(1.0)
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[4])) ==
        oseo_number(3.0)
    );
    oseo_collect(context);
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[1])) ==
        oseo_number(1.0)
    );
    roots[0] = require_normal(oseo_array_create(context, 0u));
    roots[1] = make_text(context, "4");
    roots[2] = make_text(context, "2");
    roots[3] = make_text(context, "length");
    OseoPropertyAttributes retained = {false, true, true, false};
    OseoPropertyAttributes removable = {true, true, true, false};
    (void)require_normal(
        oseo_object_define(
            context,
            roots[0],
            roots[1],
            oseo_number(4.0),
            retained
        )
    );
    (void)require_normal(
        oseo_object_define(
            context,
            roots[0],
            roots[2],
            oseo_number(2.0),
            removable
        )
    );
    assert(
        require_normal(oseo_object_set(
            context,
            roots[0],
            roots[3],
            oseo_number(1.0),
            false
        )) == oseo_number(1.0)
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[3])) ==
        oseo_number(5.0)
    );
    assert(
        require_normal(oseo_object_has_own(context, roots[0], roots[2])) ==
        oseo_boolean(true)
    );
}

static void test_array_accumulation(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_array_create(context, 0u));
    roots[5] = make_text(context, "ten");
    context->collect_every_safepoint = true;
    assert(
        require_normal(
            oseo_array_append(context, roots[0], roots[5])
        ) == roots[0]
    );
    assert(
        require_normal(oseo_array_append_hole(context, roots[0])) == roots[0]
    );
    assert(
        require_normal(
            oseo_array_append(context, roots[0], oseo_number(30.0))
        ) == roots[0]
    );
    context->collect_every_safepoint = false;

    roots[1] = make_text(context, "0");
    roots[2] = make_text(context, "1");
    roots[3] = make_text(context, "2");
    roots[4] = make_text(context, "length");
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[4])) ==
        oseo_number(3.0)
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[1])) ==
        roots[5]
    );
    assert(
        require_normal(oseo_object_has_own(context, roots[0], roots[2])) ==
        oseo_boolean(false)
    );
    assert(
        require_normal(oseo_object_get(context, roots[0], roots[3])) ==
        oseo_number(30.0)
    );

    roots[5] = require_normal(oseo_object_create(context, oseo_null()));
    assert(
        oseo_array_append(context, roots[5], oseo_number(1.0)).status ==
        OSEO_STATUS_THROW
    );
    assert(
        oseo_array_append_hole(context, roots[5]).status ==
        OSEO_STATUS_THROW
    );
    OseoPropertyAttributes fixed = {false, true, true, false};
    (void)require_normal(oseo_object_define(
        context,
        roots[5],
        roots[1],
        oseo_number(99.0),
        fixed
    ));
    roots[6] = require_normal(oseo_array_create(context, 0u));
    (void)require_normal(
        oseo_object_set_prototype(context, roots[6], roots[5])
    );
    (void)require_normal(
        oseo_array_append(context, roots[6], oseo_number(1.0))
    );
    assert(
        require_normal(oseo_object_get(context, roots[6], roots[1])) ==
        oseo_number(1.0)
    );
}

static void test_argument_lists(
    OseoContext *context,
    OseoValue *roots
) {
    size_t count = SIZE_MAX;
    const OseoValue *arguments = (const OseoValue *)1;
    roots[0] = require_normal(oseo_argument_list_create(context));
    assert(
        require_normal(oseo_argument_list_view(
            context,
            roots[0],
            &count,
            &arguments
        )) == roots[0]
    );
    assert(count == 0u);
    assert(arguments == NULL);

    roots[1] = make_text(context, "kept");
    OseoValue kept = roots[1];
    context->collect_every_safepoint = true;
    assert(
        require_normal(oseo_argument_list_append(
            context,
            roots[0],
            roots[1]
        )) == roots[0]
    );
    for (size_t index = 1u; index < 7u; index += 1u) {
        assert(
            require_normal(oseo_argument_list_append(
                context,
                roots[0],
                oseo_number((double)index)
            )) == roots[0]
        );
    }
    context->collect_every_safepoint = false;
    roots[1] = oseo_undefined();
    oseo_collect(context);
    (void)require_normal(oseo_argument_list_view(
        context,
        roots[0],
        &count,
        &arguments
    ));
    assert(count == 7u);
    assert(arguments != NULL);
    assert(arguments[0] == kept);
    for (size_t index = 1u; index < count; index += 1u) {
        assert(arguments[index] == oseo_number((double)index));
    }

    roots[1] = require_normal(oseo_argument_list_create(context));
    oseo_context_fail_allocation_at(context, 1u);
    assert(
        oseo_argument_list_append(
            context,
            roots[1],
            oseo_number(1.0)
        ).status == OSEO_STATUS_THROW
    );
    oseo_context_fail_allocation_at(context, 0u);
    (void)require_normal(oseo_argument_list_view(
        context,
        roots[1],
        &count,
        &arguments
    ));
    assert(count == 0u);
    assert(arguments == NULL);
    assert(
        oseo_argument_list_append(
            context,
            oseo_undefined(),
            oseo_number(1.0)
        ).status == OSEO_STATUS_THROW
    );
    assert(
        oseo_argument_list_view(
            context,
            oseo_undefined(),
            &count,
            &arguments
        ).status == OSEO_STATUS_THROW
    );
}

static void test_function_cells(OseoContext *context, OseoValue *roots) {
    static const uint16_t function_name[] = {
        'f', 'i', 'x', 't', 'u', 'r', 'e',
    };
    roots[0] = require_normal(oseo_environment_create(context, 2u));
    roots[1] = require_normal(
        oseo_cell_create(context, oseo_number(1.0))
    );
    (void)require_normal(
        oseo_environment_set(context, roots[0], 0u, roots[1])
    );
    roots[2] = require_normal(oseo_function_create(
        context,
        7u,
        roots[0],
        function_name,
        sizeof(function_name) / sizeof(*function_name),
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    roots[3] = require_normal(oseo_environment_clone(context, roots[0]));
    roots[4] = require_normal(oseo_environment_get(context, roots[3], 0u));
    roots[7] = make_text(context, "constructor");
    assert(roots[4] == roots[1]);
    (void)require_normal(oseo_cell_set(context, roots[4], oseo_number(2.0)));
    assert(
        require_normal(oseo_cell_get(context, roots[1])) == oseo_number(2.0)
    );
    context->collect_every_safepoint = true;
    oseo_collect(context);
    roots[5] = require_normal(
        oseo_function_environment(context, roots[2])
    );
    roots[6] = require_normal(oseo_environment_get(context, roots[5], 0u));
    assert(
        require_normal(oseo_cell_get(context, roots[6])) == oseo_number(2.0)
    );
    OseoValue prototype = require_normal(
        oseo_function_prototype(context, roots[2])
    );
    assert(
        require_normal(oseo_object_get(context, prototype, roots[7])) ==
        roots[2]
    );
    size_t code_id = 0u;
    (void)require_normal(
        oseo_function_code_id(context, roots[2], &code_id)
    );
    assert(code_id == 7u);
    context->collect_every_safepoint = false;
    assert(
        oseo_function_environment(context, oseo_number(1.0)).status ==
        OSEO_STATUS_THROW
    );
}

static void test_cell_initialization(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_cell_create(context, oseo_uninitialized()));
    assert(
        oseo_cell_set(context, roots[0], oseo_number(1.0)).status ==
        OSEO_STATUS_THROW
    );
    oseo_context_clear_language_error(context);
    assert(strcmp(context->error_code, "OSEO2001") == 0);
    assert(strcmp(context->error_message, "Unhandled JavaScript throw.") == 0);
    (void)require_normal(
        oseo_cell_initialize(context, roots[0], oseo_number(2.0))
    );
    assert(
        require_normal(oseo_cell_get(context, roots[0])) == oseo_number(2.0)
    );
}

static void test_delete_object_coercible(
    OseoContext *context,
    OseoValue *roots
) {
    OseoResult result =
        oseo_require_delete_object_coercible(context, oseo_null());
    assert(result.status == OSEO_STATUS_THROW);
    roots[0] = result.value;
    roots[1] = require_normal(
        oseo_object_get(context, roots[0], make_text(context, "message"))
    );
    roots[2] = make_text(
        context,
        "Cannot delete properties of a nullish value."
    );
    assert(
        require_normal(oseo_strict_equal(context, roots[1], roots[2])) ==
        oseo_boolean(true)
    );
}

static void test_loose_equality_boundary(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_object_create(context, oseo_null()));
    assert(
        require_normal(oseo_loose_equal(context, roots[0], oseo_null())) ==
        oseo_boolean(false)
    );
    assert(
        require_normal(
            oseo_loose_equal(context, oseo_undefined(), roots[0])
        ) == oseo_boolean(false)
    );
    assert(
        require_normal(
            oseo_not_loose_equal(context, roots[0], oseo_null())
        ) == oseo_boolean(true)
    );
    roots[1] = make_text(context, "text");
    OseoValue operands[3] = {
        oseo_number(0.0),
        roots[1],
        oseo_boolean(false),
    };
    for (size_t index = 0u; index < 3u; index += 1u) {
        assert(
            oseo_loose_equal(context, roots[0], operands[index]).status ==
            OSEO_STATUS_THROW
        );
        assert(strcmp(context->error_code, "OSEO2001") == 0);
        assert(
            oseo_loose_equal(context, operands[index], roots[0]).status ==
            OSEO_STATUS_THROW
        );
        assert(strcmp(context->error_code, "OSEO2001") == 0);
    }
}

static void test_to_primitive_conversion(
    OseoContext *context,
    OseoValue *roots
) {
    roots[0] = require_normal(oseo_object_literal_create(context));
    roots[1] = make_text(context, "[object Object]");
    assert(
        require_normal(oseo_loose_equal(context, roots[0], roots[1])) ==
        oseo_boolean(true)
    );
    assert(
        require_normal(
            oseo_loose_equal(context, roots[0], oseo_number(0.0))
        ) == oseo_boolean(false)
    );
    roots[2] = require_normal(oseo_to_string(context, roots[0]));
    assert(
        require_normal(oseo_strict_equal(context, roots[1], roots[2])) ==
        oseo_boolean(true)
    );
    OseoResult numeric = oseo_to_number(context, roots[0]);
    assert(numeric.status == OSEO_STATUS_NORMAL);
    /* A default object converts to "[object Object]", so its number
     * is NaN, the one value that is not loosely equal to itself. */
    assert(
        require_normal(
            oseo_loose_equal(context, numeric.value, numeric.value)
        ) == oseo_boolean(false)
    );
    roots[3] = require_normal(oseo_array_create(context, 1u));
    roots[4] = make_text(context, "0");
    (void)require_normal(oseo_object_set(
        context,
        roots[3],
        roots[4],
        oseo_number(2.0),
        true
    ));
    numeric = oseo_to_number(context, roots[3]);
    assert(numeric.status == OSEO_STATUS_NORMAL);
    assert(
        require_normal(
            oseo_strict_equal(context, numeric.value, oseo_number(2.0))
        ) == oseo_boolean(true)
    );
}

static void test_error_intrinsics(OseoContext *context, OseoValue *roots) {
    roots[0] = require_normal(
        oseo_error_intrinsic(context, OSEO_ERROR_TYPE)
    );
    assert(
        require_normal(oseo_error_intrinsic(context, OSEO_ERROR_TYPE)) ==
        roots[0]
    );
    oseo_collect(context);
    assert(
        require_normal(oseo_error_intrinsic(context, OSEO_ERROR_TYPE)) ==
        roots[0]
    );
    roots[1] = make_text(context, "boom");
    roots[2] = require_normal(oseo_call_function(
        context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        oseo_undefined()
    ));
    assert(
        require_normal(oseo_instanceof(context, roots[2], roots[0])) ==
        oseo_boolean(true)
    );
    roots[3] = require_normal(
        oseo_error_intrinsic(context, OSEO_ERROR_ERROR)
    );
    assert(
        require_normal(oseo_instanceof(context, roots[2], roots[3])) ==
        oseo_boolean(true)
    );
    roots[4] = require_normal(
        oseo_error_intrinsic(context, OSEO_ERROR_RANGE)
    );
    assert(
        require_normal(oseo_instanceof(context, roots[2], roots[4])) ==
        oseo_boolean(false)
    );
    OseoResult uninitialized_read =
        oseo_read_binding(context, oseo_uninitialized());
    assert(uninitialized_read.status == OSEO_STATUS_THROW);
    assert(!context->has_diagnostic);
    roots[5] = uninitialized_read.value;
    roots[6] = require_normal(
        oseo_error_intrinsic(context, OSEO_ERROR_REFERENCE)
    );
    assert(
        require_normal(oseo_instanceof(context, roots[5], roots[6])) ==
        oseo_boolean(true)
    );
}

static void test_symbols(OseoContext *context, OseoValue *roots) {
    roots[0] = require_normal(oseo_symbol_intrinsic(context));
    assert(
        require_normal(oseo_symbol_intrinsic(context)) == roots[0]
    );
    oseo_collect(context);
    assert(
        require_normal(oseo_symbol_intrinsic(context)) == roots[0]
    );
    roots[1] = make_text(context, "mark");
    roots[2] = require_normal(oseo_call_function(
        context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        oseo_undefined()
    ));
    roots[3] = require_normal(oseo_call_function(
        context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        oseo_undefined()
    ));
    assert(roots[2] != roots[3]);
    roots[5] = require_normal(oseo_typeof(context, roots[2]));
    roots[6] = require_normal(oseo_typeof(context, roots[3]));
    assert(
        require_normal(
            oseo_strict_equal(context, roots[5], roots[6])
        ) == oseo_boolean(true)
    );
    roots[4] = require_normal(oseo_object_literal_create(context));
    (void)require_normal(oseo_object_set(
        context,
        roots[4],
        roots[2],
        oseo_number(1.0),
        true
    ));
    oseo_collect(context);
    assert(
        require_normal(oseo_object_get(context, roots[4], roots[2])) ==
        oseo_number(1.0)
    );
    assert(
        require_normal(oseo_object_get(context, roots[4], roots[3])) ==
        oseo_undefined()
    );
    OseoResult numeric = oseo_to_number(context, roots[2]);
    assert(numeric.status == OSEO_STATUS_THROW);
    assert(!context->has_diagnostic);
}

/*
 * Drive array iteration through the generated-code ABI so forced
 * collection exercises every rooted iterator-record value.
 */
static void test_iterators(OseoContext *context, OseoValue *roots) {
    roots[0] = require_normal(oseo_array_create(context, 2u));
    roots[1] = make_text(context, "0");
    roots[2] = make_text(context, "1");
    (void)require_normal(
        oseo_object_set(context, roots[0], roots[1], oseo_number(7.0), true)
    );
    (void)require_normal(
        oseo_object_set(context, roots[0], roots[2], oseo_number(8.0), true)
    );
    OseoValue next_method = oseo_undefined();
    roots[3] = require_normal(
        oseo_iterator_get(context, roots[0], &next_method)
    );
    roots[4] = next_method;
    assert(oseo_value_is_object(roots[3]));
    context->collect_every_safepoint = true;
    oseo_collect(context);
    OseoValue value = oseo_undefined();
    bool done = true;
    OseoValue has_value = require_normal(oseo_iterator_next(
        context, roots[3], roots[4], &value, &done
    ));
    roots[5] = value;
    assert(has_value == oseo_boolean(true));
    assert(!done);
    assert(roots[5] == oseo_number(7.0));
    has_value = require_normal(oseo_iterator_next(
        context, roots[3], roots[4], &value, &done
    ));
    roots[5] = value;
    assert(has_value == oseo_boolean(true));
    assert(!done);
    assert(roots[5] == oseo_number(8.0));
    has_value = require_normal(oseo_iterator_next(
        context, roots[3], roots[4], &value, &done
    ));
    roots[5] = value;
    assert(has_value == oseo_boolean(false));
    assert(done);
    (void)require_normal(oseo_iterator_close(context, roots[3], false));
    context->collect_every_safepoint = false;
}

/* Each call allocates a fresh object tagged with the call index, so a
 * later call's own allocation-triggered collection can be observed
 * corrupting or freeing an earlier call's unrooted result. */
static size_t accessor_gc_probe_calls = 0u;

static OseoResult accessor_gc_probe_dispatcher(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)argument_count;
    (void)arguments;
    (void)new_target;
    accessor_gc_probe_calls += 1u;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult allocated = oseo_roots_allocate(context, &frame, 2u);
    if (allocated.status != OSEO_STATUS_NORMAL) return allocated;
    OseoResult created = oseo_object_create(context, oseo_null());
    frame.slots[0] = created.value;
    if (created.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return created;
    }
    frame.slots[1] = make_text(context, "tag");
    OseoResult tagged = oseo_object_set(
        context,
        frame.slots[0],
        frame.slots[1],
        oseo_number((double)accessor_gc_probe_calls),
        true
    );
    OseoValue result = frame.slots[0];
    oseo_roots_release(context, &frame);
    if (tagged.status != OSEO_STATUS_NORMAL) return tagged;
    return (OseoResult){OSEO_STATUS_NORMAL, result};
}

/* Object.defineProperty's descriptor argument can itself carry
 * accessor-valued fields (a getter for "value", "writable", and so
 * on). Each field read that invokes such a getter can allocate, and
 * under the forced-collection policy every allocation collects. An
 * earlier field's freshly returned heap value must stay reachable
 * through a later field's getter call and its own allocations. */
static void test_accessor_descriptor_gc_safety(
    OseoContext *context,
    OseoValue *roots
) {
    static const uint16_t getter_name[] = {'g', 'e', 't', 't', 'e', 'r'};
    accessor_gc_probe_calls = 0u;
    oseo_context_set_function_dispatcher(
        context,
        accessor_gc_probe_dispatcher
    );
    roots[0] = require_normal(oseo_environment_create(context, 0u));
    roots[1] = require_normal(oseo_function_create(
        context,
        200u,
        roots[0],
        getter_name,
        sizeof(getter_name) / sizeof(*getter_name),
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    roots[2] = require_normal(oseo_function_create(
        context,
        201u,
        roots[0],
        getter_name,
        sizeof(getter_name) / sizeof(*getter_name),
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    roots[3] = require_normal(oseo_object_create(context, oseo_null()));
    (void)require_normal(oseo_object_define_accessor(
        context,
        roots[3],
        make_text(context, "value"),
        roots[1],
        oseo_undefined(),
        true,
        false,
        (OseoPropertyAttributes){true, true, false, true}
    ));
    (void)require_normal(oseo_object_define_accessor(
        context,
        roots[3],
        make_text(context, "writable"),
        roots[2],
        oseo_undefined(),
        true,
        false,
        (OseoPropertyAttributes){true, true, false, true}
    ));
    roots[4] = require_normal(oseo_object_create(context, oseo_null()));
    roots[5] = make_text(context, "item");
    OseoValue arguments[3] = {roots[4], roots[5], roots[3]};
    context->collect_every_safepoint = true;
    OseoResult defined =
        oseo_object_builtin_define_property(context, 3u, arguments);
    context->collect_every_safepoint = false;
    (void)require_normal(defined);
    OseoValue item = require_normal(
        oseo_object_get(context, roots[4], roots[5])
    );
    OseoValue tag = require_normal(
        oseo_object_get(context, item, make_text(context, "tag"))
    );
    assert(tag == oseo_number(1.0));
    assert(accessor_gc_probe_calls == 2u);
    oseo_context_set_function_dispatcher(context, NULL);
}

static void test_this_value(OseoContext *context, OseoValue *roots) {
    /* An object receiver stands unchanged and allocates nothing. Primitive
     * wrapper allocation remains outside the admitted runtime. */
    roots[0] = require_normal(oseo_object_create(context, oseo_null()));
    assert(require_normal(oseo_this_value(context, roots[0])) == roots[0]);
    assert(
        oseo_this_value(context, oseo_number(1.0)).status == OSEO_STATUS_THROW
    );
    /* Both nullish receivers resolve to the one global this value. */
    roots[1] = require_normal(oseo_this_value(context, oseo_undefined()));
    assert(roots[1] != oseo_undefined());
    assert(require_normal(oseo_this_value(context, oseo_null())) == roots[1]);
    roots[2] = make_text(context, "marker");
    /* The value starts with no own properties of its own. */
    assert(
        require_normal(oseo_object_has_own(context, roots[1], roots[2])) ==
        oseo_boolean(false)
    );
    roots[3] = require_normal(oseo_object_create(context, oseo_null()));
    (void)require_normal(
        oseo_object_set(context, roots[1], roots[2], roots[3], false)
    );
    /*
     * The context roots the value permanently, so a collection between
     * two reads keeps both its identity and everything reachable from
     * it even when no local root frame holds them.
     */
    roots[1] = oseo_undefined();
    roots[3] = oseo_undefined();
    oseo_collect(context);
    roots[1] = require_normal(oseo_this_value(context, oseo_undefined()));
    roots[3] = require_normal(oseo_object_get(context, roots[1], roots[2]));
    assert(
        require_normal(oseo_object_has_own(context, roots[1], roots[2])) ==
        oseo_boolean(true)
    );
    (void)require_normal(
        oseo_object_set(
            context, roots[3], roots[2], oseo_number(7.0), false
        )
    );
    assert(
        require_normal(oseo_object_get(context, roots[3], roots[2])) ==
        oseo_number(7.0)
    );
}

/* A failed standard-global installation must not publish the partial
 * object. The last deterministic allocation fails after every earlier
 * install step, then the same context retries and publishes a complete
 * global object. */
static void test_global_this_install_failure(void) {
    OseoContext probe;
    oseo_context_init(&probe, "runtime-heap.c", 14u);
    (void)require_normal(oseo_this_value(&probe, oseo_undefined()));
    size_t final_attempt = probe.allocation_attempts;
    assert(final_attempt > 0u);
    oseo_context_destroy(&probe);

    OseoContext injected;
    oseo_context_init(&injected, "runtime-heap.c", 14u);
    oseo_context_fail_allocation_at(&injected, final_attempt);
    assert(
        oseo_this_value(&injected, oseo_undefined()).status ==
        OSEO_STATUS_THROW
    );
    assert(injected.global_this == oseo_undefined());
    oseo_context_fail_allocation_at(&injected, 0u);
    OseoValue global = require_normal(
        oseo_this_value(&injected, oseo_undefined())
    );
    OseoValue object_key = make_text(&injected, "Object");
    assert(
        require_normal(oseo_object_has_own(
            &injected,
            global,
            object_key
        )) == oseo_boolean(true)
    );
    oseo_context_destroy(&injected);
}

typedef enum {
    DATA_VIEW_ALLOCATION_CLUSTER,
    DATA_VIEW_ALLOCATION_VIEW,
    DATA_VIEW_ALLOCATION_ELEMENT,
    DATA_VIEW_ALLOCATION_OPERATION_COUNT,
} DataViewAllocationOperation;

/* new ArrayBuffer(byteLength), for a context that already has %ArrayBuffer%. */
static OseoValue make_array_buffer(OseoContext *context, double byte_length) {
    OseoValue constructor =
        require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_ARRAY_BUFFER));
    OseoValue argument = oseo_number(byte_length);
    return require_normal(oseo_call_function(
        context,
        constructor,
        oseo_undefined(),
        1u,
        &argument,
        constructor
    ));
}

static void prepare_data_view_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    DataViewAllocationOperation operation
) {
    if (operation == DATA_VIEW_ALLOCATION_CLUSTER) {
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_OBJECT)
        );
        return;
    }
    roots[0] = require_normal(
        oseo_intrinsic(context, OSEO_INTRINSIC_DATA_VIEW)
    );
    roots[1] = make_array_buffer(context, 8.0);
    roots[2] = roots[0];
    if (operation == DATA_VIEW_ALLOCATION_ELEMENT) {
        OseoValue arguments[2] = {roots[1], oseo_number(0.0)};
        roots[1] = require_normal(oseo_call_function(
            context,
            roots[0],
            oseo_undefined(),
            2u,
            arguments,
            roots[0]
        ));
        roots[0] = require_normal(
            oseo_intrinsic(context, OSEO_INTRINSIC_DATA_VIEW_GET_BIG_INT64)
        );
    }
}

static OseoResult run_data_view_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    DataViewAllocationOperation operation
) {
    if (operation == DATA_VIEW_ALLOCATION_CLUSTER) {
        return oseo_intrinsic(context, OSEO_INTRINSIC_DATA_VIEW);
    }
    if (operation == DATA_VIEW_ALLOCATION_VIEW) {
        OseoValue arguments[2] = {roots[1], oseo_number(0.0)};
        return oseo_call_function(
            context,
            roots[0],
            oseo_undefined(),
            2u,
            arguments,
            roots[0]
        );
    }
    OseoValue offset = oseo_number(0.0);
    return oseo_call_function(
        context,
        roots[0],
        roots[1],
        1u,
        &offset,
        oseo_undefined()
    );
}

static void assert_data_view_cluster_unpublished(const OseoContext *context) {
    for (size_t intrinsic = OSEO_INTRINSIC_DATA_VIEW_PROTOTYPE;
         intrinsic <= OSEO_INTRINSIC_DATA_VIEW_SET_BIG_UINT64;
         intrinsic += 1u) {
        assert(context->intrinsics[intrinsic] == oseo_undefined());
    }
}

static size_t data_view_allocation_attempt_count(
    DataViewAllocationOperation operation
) {
    OseoContext context;
    OseoValue roots[6] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 6u};
    oseo_context_init(&context, "runtime-heap.c", 14u);
    oseo_roots_push(&context, &frame);
    prepare_data_view_allocation_operation(&context, roots, operation);
    context.collect_every_safepoint = true;
    oseo_context_fail_allocation_at(&context, 0u);
    roots[3] = require_normal(
        run_data_view_allocation_operation(&context, roots, operation)
    );
    size_t attempts = context.allocation_attempts;
    assert(attempts > 0u && attempts <= 512u);
    oseo_collect(&context);
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
    return attempts;
}

/* One byte length read through the %DataView.prototype% byteLength getter. */
static OseoValue data_view_byte_length_of(
    OseoContext *context,
    OseoValue view
) {
    OseoValue getter = require_normal(
        oseo_intrinsic(context, OSEO_INTRINSIC_DATA_VIEW_BYTE_LENGTH)
    );
    return require_normal(oseo_call_function(
        context,
        getter,
        view,
        0u,
        NULL,
        oseo_undefined()
    ));
}

static void validate_data_view_allocation_retry(
    OseoContext *context,
    OseoValue *roots,
    DataViewAllocationOperation operation
) {
    if (operation == DATA_VIEW_ALLOCATION_CLUSTER) {
        assert(
            roots[3] ==
            require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_DATA_VIEW))
        );
        for (size_t intrinsic = OSEO_INTRINSIC_DATA_VIEW_PROTOTYPE;
             intrinsic <= OSEO_INTRINSIC_DATA_VIEW_SET_BIG_UINT64;
             intrinsic += 1u) {
            assert(context->intrinsics[intrinsic] != oseo_undefined());
        }
        return;
    }
    if (operation == DATA_VIEW_ALLOCATION_VIEW) {
        roots[4] = data_view_byte_length_of(context, roots[3]);
        assert(
            require_normal(
                oseo_strict_equal(context, roots[4], oseo_number(8.0))
            ) == oseo_boolean(true)
        );
        return;
    }
    roots[4] = require_normal(oseo_to_string(context, roots[3]));
    roots[5] = make_text(context, "0");
    assert(
        require_normal(oseo_strict_equal(context, roots[4], roots[5])) ==
        oseo_boolean(true)
    );
}

/*
 * Every allocation in each DataView-owned path fails once in a fresh
 * context. A view owns no Data Block, so the only records these paths
 * publish are the intrinsic cluster, the view itself, and the BigInt a
 * 64-bit load produces; none of them is published by a failed attempt.
 * Collection then runs and the same context retries with stable
 * intrinsic identity and a complete, rooted result.
 */
static void test_data_view_allocation_sweep(void) {
    for (DataViewAllocationOperation operation = DATA_VIEW_ALLOCATION_CLUSTER;
         operation < DATA_VIEW_ALLOCATION_OPERATION_COUNT;
         operation += 1) {
        size_t attempts = data_view_allocation_attempt_count(operation);
        for (size_t attempt = 1u; attempt <= attempts; attempt += 1u) {
            OseoContext context;
            OseoValue roots[6] = {
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
            };
            OseoRootFrame frame = {NULL, roots, 6u};
            oseo_context_init(&context, "runtime-heap.c", 14u);
            oseo_roots_push(&context, &frame);
            prepare_data_view_allocation_operation(&context, roots, operation);
            OseoValue identity = roots[2];
            context.collect_every_safepoint = true;
            oseo_context_fail_allocation_at(&context, attempt);
            OseoResult failed = run_data_view_allocation_operation(
                &context,
                roots,
                operation
            );
            assert(failed.status == OSEO_STATUS_THROW);
            assert(failed.value == oseo_undefined());
            assert(context.has_diagnostic);
            if (operation == DATA_VIEW_ALLOCATION_CLUSTER) {
                assert_data_view_cluster_unpublished(&context);
            } else {
                assert(
                    require_normal(oseo_intrinsic(
                        &context,
                        OSEO_INTRINSIC_DATA_VIEW
                    )) == identity
                );
            }
            oseo_collect(&context);
            oseo_context_fail_allocation_at(&context, 0u);
            context.has_diagnostic = false;
            context.error_code = NULL;
            context.error_message = NULL;
            roots[3] = require_normal(run_data_view_allocation_operation(
                &context,
                roots,
                operation
            ));
            oseo_collect(&context);
            validate_data_view_allocation_retry(&context, roots, operation);
            oseo_roots_pop(&context, &frame);
            oseo_context_destroy(&context);
        }
    }
}

typedef enum {
    REGEXP_ALLOCATION_CLUSTER,
    REGEXP_ALLOCATION_INSTANCE,
    REGEXP_ALLOCATION_NAMED_CAPTURE,
    REGEXP_ALLOCATION_SYNTAX_ERROR,
    REGEXP_ALLOCATION_LITERAL,
    REGEXP_ALLOCATION_EXEC,
    REGEXP_ALLOCATION_EXEC_INDICES,
    REGEXP_ALLOCATION_TO_STRING,
    REGEXP_ALLOCATION_OPERATION_COUNT,
} RegExpAllocationOperation;

/*
 * One ahead-of-time literal descriptor, written the way the C backend
 * emits `/(a)b/g`.
 *
 * The program is generated data an artifact only borrows, so the sweep
 * proves that a failure anywhere in the literal path publishes no partial
 * artifact and frees nothing the next attempt still needs.
 */
static uint16_t literal_source_units[] = {40u, 97u, 41u, 98u};
static uint16_t literal_flag_units[] = {103u};
static OseoRegExpInstruction literal_instructions[] = {
    {OSEO_REGEXP_OP_SAVE, 0u, {0u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_SAVE, 0u, {2u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_CONSUME, 0u, {0u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_SAVE, 0u, {3u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_CONSUME, 0u, {1u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_SAVE, 0u, {1u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_ACCEPT, 0u, {0u, 0u, 0u, 0u}},
    {OSEO_REGEXP_OP_FAIL, 0u, {0u, 0u, 0u, 0u}},
};
static uint32_t literal_set_boundaries[] = {97u, 98u, 98u, 99u};
static uint32_t literal_set_offsets[] = {0u, 2u, 4u};
static OseoRegExpCapture literal_captures[] = {{0u, 0u, false}};
static OseoRegExpProgram literal_program = {
    literal_instructions, 8u,
    literal_set_boundaries, literal_set_offsets, 2u,
    NULL, 0u,
    NULL, 0u,
    literal_captures, 1u,
    4u,
    NULL, NULL, 0u,
    false, false, false,
};
static const OseoRegExpLiteral literal_descriptor = {
    literal_source_units, 4u,
    literal_flag_units, 1u,
    &literal_program,
    OSEO_REGEXP_FLAG_G,
};

static bool regexp_allocation_uses_method(RegExpAllocationOperation op) {
    return op == REGEXP_ALLOCATION_EXEC ||
        op == REGEXP_ALLOCATION_EXEC_INDICES ||
        op == REGEXP_ALLOCATION_TO_STRING;
}

static void prepare_regexp_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    RegExpAllocationOperation operation
) {
    roots[0] = require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_OBJECT));
    if (operation == REGEXP_ALLOCATION_CLUSTER) return;
    roots[0] = require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_REGEXP));
    if (operation == REGEXP_ALLOCATION_INSTANCE) {
        roots[1] = oseo_number(12345.0);
    } else if (operation == REGEXP_ALLOCATION_NAMED_CAPTURE) {
        roots[1] = make_text(
            context,
            "(?:(?<name>a)|(?<name>b))\\k<name>"
        );
    } else if (operation != REGEXP_ALLOCATION_LITERAL) {
        roots[1] = make_text(context, "[");
    }
    roots[2] = roots[0];
    if (operation == REGEXP_ALLOCATION_SYNTAX_ERROR) {
        roots[4] = require_normal(
            oseo_error_intrinsic(context, OSEO_ERROR_SYNTAX)
        );
    }
    if (!regexp_allocation_uses_method(operation)) return;
    /*
     * Execution and stringification need a constructed instance and the
     * method they call, so both are prepared before the sweep starts
     * failing allocations: only the operation itself is under test.
     */
    roots[3] = make_text(context, "(?<pair>a+)(b*)");
    roots[4] = make_text(
        context,
        operation == REGEXP_ALLOCATION_EXEC_INDICES ? "d" : ""
    );
    roots[5] = require_normal(
        oseo_call_function(context, roots[0], oseo_undefined(), 2u,
                           &roots[3], roots[0])
    );
    roots[3] = oseo_undefined();
    roots[4] = oseo_undefined();
    roots[6] = make_text(
        context,
        operation == REGEXP_ALLOCATION_TO_STRING ? "toString" : "exec"
    );
    roots[6] = require_normal(
        oseo_object_get(context, roots[5], roots[6])
    );
    roots[1] = make_text(context, "xaabby");
}

static OseoResult run_regexp_allocation_operation(
    OseoContext *context,
    OseoValue *roots,
    RegExpAllocationOperation operation
) {
    if (operation == REGEXP_ALLOCATION_CLUSTER) {
        return oseo_intrinsic(context, OSEO_INTRINSIC_REGEXP);
    }
    if (operation == REGEXP_ALLOCATION_LITERAL) {
        (void)roots;
        return oseo_regexp_literal(context, &literal_descriptor);
    }
    if (regexp_allocation_uses_method(operation)) {
        return oseo_call_function(
            context,
            roots[6],
            roots[5],
            operation == REGEXP_ALLOCATION_TO_STRING ? 0u : 1u,
            &roots[1],
            oseo_undefined()
        );
    }
    return oseo_call_function(
        context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        roots[0]
    );
}

static void assert_regexp_cluster_unpublished(const OseoContext *context) {
    for (size_t intrinsic = OSEO_INTRINSIC_REGEXP_PROTOTYPE;
         intrinsic <= OSEO_INTRINSIC_REGEXP_SPECIES;
         intrinsic += 1u) {
        assert(context->intrinsics[intrinsic] == oseo_undefined());
    }
}

static size_t regexp_allocation_attempt_count(
    RegExpAllocationOperation operation
) {
    OseoContext context;
    OseoValue roots[7] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 7u};
    oseo_context_init(&context, "runtime-heap.c", 14u);
    oseo_roots_push(&context, &frame);
    prepare_regexp_allocation_operation(&context, roots, operation);
    context.collect_every_safepoint = true;
    oseo_context_fail_allocation_at(&context, 0u);
    OseoResult result = run_regexp_allocation_operation(
        &context,
        roots,
        operation
    );
    if (operation == REGEXP_ALLOCATION_SYNTAX_ERROR) {
        assert(result.status == OSEO_STATUS_THROW);
        assert(result.value != oseo_undefined());
    } else {
        roots[3] = require_normal(result);
    }
    size_t attempts = context.allocation_attempts;
    /*
     * The RegExp operations reach further than the other sweeps: the
     * matcher compiles a program and the executor grows a work area, and
     * both are unmanaged allocations the same counter now covers.
     */
    assert(attempts > 0u && attempts <= 2048u);
    oseo_collect(&context);
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
    return attempts;
}

static void validate_regexp_allocation_retry(
    OseoContext *context,
    OseoValue *roots,
    RegExpAllocationOperation operation,
    OseoResult result
) {
    if (operation == REGEXP_ALLOCATION_CLUSTER) {
        assert(result.status == OSEO_STATUS_NORMAL);
        assert(
            result.value ==
            require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_REGEXP))
        );
        for (size_t intrinsic = OSEO_INTRINSIC_REGEXP_PROTOTYPE;
             intrinsic <= OSEO_INTRINSIC_REGEXP_SPECIES;
             intrinsic += 1u) {
            assert(context->intrinsics[intrinsic] != oseo_undefined());
        }
        return;
    }
    if (operation == REGEXP_ALLOCATION_SYNTAX_ERROR) {
        assert(result.status == OSEO_STATUS_THROW);
        assert(result.value != oseo_undefined());
        roots[3] = result.value;
        assert(
            require_normal(oseo_instanceof(context, roots[3], roots[4])) ==
            oseo_boolean(true)
        );
        return;
    }
    if (regexp_allocation_uses_method(operation)) {
        assert(result.status == OSEO_STATUS_NORMAL);
        roots[3] = result.value;
        if (operation == REGEXP_ALLOCATION_TO_STRING) {
            assert(!oseo_value_is_object(roots[3]));
            return;
        }
        assert(oseo_value_is_object(roots[3]));
        roots[4] = make_text(context, "index");
        assert(
            require_normal(oseo_object_get(context, roots[3], roots[4])) ==
            oseo_number(1.0)
        );
        roots[4] = make_text(
            context,
            operation == REGEXP_ALLOCATION_EXEC_INDICES ? "indices" : "groups"
        );
        assert(
            oseo_value_is_object(
                require_normal(oseo_object_get(context, roots[3], roots[4]))
            )
        );
        return;
    }
    assert(result.status == OSEO_STATUS_NORMAL);
    roots[3] = result.value;
    roots[4] = make_text(context, "lastIndex");
    assert(
        require_normal(oseo_object_get(context, roots[3], roots[4])) ==
        oseo_number(0.0)
    );
}

/*
 * Every allocation in the RegExp cluster, successful constructor,
 * catchable SyntaxError, ahead-of-time literal, built-in execution,
 * match-indices, and
 * stringification paths fails once. Collection follows each failure, and
 * the same context then retries without publishing a partial intrinsic,
 * instance, matcher artifact, result object, or language error.
 */
static void test_regexp_allocation_sweep(void) {
    for (RegExpAllocationOperation operation = REGEXP_ALLOCATION_CLUSTER;
         operation < REGEXP_ALLOCATION_OPERATION_COUNT;
         operation += 1) {
        size_t attempts = regexp_allocation_attempt_count(operation);
        for (size_t attempt = 1u; attempt <= attempts; attempt += 1u) {
            OseoContext context;
            OseoValue roots[7] = {
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
                oseo_undefined(),
            };
            OseoRootFrame frame = {NULL, roots, 7u};
            oseo_context_init(&context, "runtime-heap.c", 14u);
            oseo_roots_push(&context, &frame);
            prepare_regexp_allocation_operation(&context, roots, operation);
            OseoValue identity = roots[2];
            context.collect_every_safepoint = true;
            oseo_context_fail_allocation_at(&context, attempt);
            OseoResult failed = run_regexp_allocation_operation(
                &context,
                roots,
                operation
            );
            assert(failed.status == OSEO_STATUS_THROW);
            assert(failed.value == oseo_undefined());
            assert(context.has_diagnostic);
            if (operation == REGEXP_ALLOCATION_CLUSTER) {
                assert_regexp_cluster_unpublished(&context);
            } else {
                assert(
                    require_normal(oseo_intrinsic(
                        &context,
                        OSEO_INTRINSIC_REGEXP
                    )) == identity
                );
            }
            oseo_collect(&context);
            oseo_context_fail_allocation_at(&context, 0u);
            context.has_diagnostic = false;
            context.error_code = NULL;
            context.error_message = NULL;
            OseoResult retried = run_regexp_allocation_operation(
                &context,
                roots,
                operation
            );
            validate_regexp_allocation_retry(
                &context,
                roots,
                operation,
                retried
            );
            oseo_collect(&context);
            oseo_roots_pop(&context, &frame);
            oseo_context_destroy(&context);
        }
    }
}

static void assert_regexp_diagnostic(
    const uint16_t *units,
    size_t length,
    const char *message
) {
    OseoContext context;
    OseoValue roots[3] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 3u};
    oseo_context_init(&context, "runtime-heap.c", 15u);
    oseo_roots_push(&context, &frame);
    roots[0] = require_normal(
        oseo_intrinsic(&context, OSEO_INTRINSIC_REGEXP)
    );
    roots[1] = require_normal(
        oseo_string_from_units(&context, units, length)
    );
    OseoResult result = oseo_call_function(
        &context,
        roots[0],
        oseo_undefined(),
        1u,
        &roots[1],
        roots[0]
    );
    assert(result.status == OSEO_STATUS_THROW);
    assert(result.value == oseo_undefined());
    assert(context.has_diagnostic);
    assert(strcmp(context.error_code, "OSEO2001") == 0);
    assert(strcmp(context.error_message, message) == 0);
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
}

static uint16_t *allocate_regexp_units(size_t length) {
    assert(length <= SIZE_MAX / sizeof(uint16_t));
    uint16_t *units = malloc(length * sizeof(uint16_t));
    assert(units != NULL);
    return units;
}

/* Each reviewed dynamic-matcher limit retains an explicit OSEO2001 edge. */
static void test_regexp_matcher_limits(void) {
    static const char limit_message[] =
        "Regular expression pattern exceeds the reviewed matcher limit.";
    size_t pattern_length = ((size_t)0x100000u) + 1u;
    uint16_t *pattern = allocate_regexp_units(pattern_length);
    for (size_t index = 0u; index < pattern_length; index += 1u) {
        pattern[index] = 'a';
    }
    assert_regexp_diagnostic(pattern, pattern_length, limit_message);
    free(pattern);

    size_t capture_count = ((size_t)0xffffu) + 1u;
    size_t capture_length = capture_count * 2u;
    pattern = allocate_regexp_units(capture_length);
    for (size_t index = 0u; index < capture_count; index += 1u) {
        pattern[index * 2u] = '(';
        pattern[index * 2u + 1u] = ')';
    }
    assert_regexp_diagnostic(pattern, capture_length, limit_message);
    free(pattern);

    size_t nesting = 257u;
    size_t nesting_length = nesting * 2u + 1u;
    pattern = allocate_regexp_units(nesting_length);
    for (size_t index = 0u; index < nesting; index += 1u) {
        pattern[index] = '(';
        pattern[nesting + 1u + index] = ')';
    }
    pattern[nesting] = 'a';
    assert_regexp_diagnostic(pattern, nesting_length, limit_message);
    free(pattern);

    static const uint16_t quantifier[] = {
        'a', '{', '9', '0', '0', '7', '1', '9', '9', '2', '5', '4',
        '7', '4', '0', '9', '9', '2', '}',
    };
    assert_regexp_diagnostic(
        quantifier,
        sizeof(quantifier) / sizeof(quantifier[0]),
        limit_message
    );

    capture_count = (size_t)0xffffu;
    capture_length = capture_count * 2u;
    size_t instruction_length = 917510u;
    size_t literal_count = instruction_length - capture_length;
    pattern = allocate_regexp_units(instruction_length);
    for (size_t index = 0u; index < literal_count; index += 1u) {
        pattern[index] = 'a';
    }
    for (size_t index = 0u; index < capture_count; index += 1u) {
        size_t offset = literal_count + index * 2u;
        pattern[offset] = '(';
        pattern[offset + 1u] = ')';
    }
    assert_regexp_diagnostic(pattern, instruction_length, limit_message);
    free(pattern);
}

static void test_regexp_duplicate_name_scale(void) {
    static const uint16_t group[] = {'(', '?', '<', 'a', '>', 'x', ')'};
    const size_t group_count = 20000u;
    const size_t group_length = sizeof(group) / sizeof(group[0]);
    size_t pattern_length = group_count * (group_length + 1u) - 1u;
    uint16_t *pattern = allocate_regexp_units(pattern_length);
    size_t offset = 0u;
    for (size_t index = 0u; index < group_count; index += 1u) {
        if (index != 0u) pattern[offset++] = '|';
        memcpy(pattern + offset, group, sizeof(group));
        offset += group_length;
    }
    assert(offset == pattern_length);
    OseoContext context;
    OseoValue roots[3] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 3u};
    oseo_context_init(&context, "runtime-heap.c", 16u);
    oseo_roots_push(&context, &frame);
    roots[0] = require_normal(
        oseo_intrinsic(&context, OSEO_INTRINSIC_REGEXP)
    );
    roots[1] = require_normal(
        oseo_string_from_units(&context, pattern, pattern_length)
    );
    roots[2] = require_normal(
        oseo_call_function(
            &context,
            roots[0],
            oseo_undefined(),
            1u,
            &roots[1],
            roots[0]
        )
    );
    oseo_collect(&context);
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
    free(pattern);
}

static OseoValue *regexp_order_roots = NULL;
static size_t regexp_order_step = 0u;

static OseoResult regexp_order_dispatcher(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)receiver;
    (void)argument_count;
    (void)arguments;
    (void)new_target;
    size_t code_id = 0u;
    OseoResult code = oseo_function_code_id(context, callee, &code_id);
    if (code.status != OSEO_STATUS_NORMAL) return code;
    if (code_id == 310u) {
        assert(regexp_order_step == 0u);
        regexp_order_step = 1u;
        OseoResult prototype = oseo_object_create(context, oseo_null());
        if (prototype.status == OSEO_STATUS_NORMAL) {
            regexp_order_roots[7] = prototype.value;
        }
        return prototype;
    }
    if (code_id == 311u) {
        assert(regexp_order_step == 1u);
        regexp_order_step = 2u;
        return (OseoResult){OSEO_STATUS_NORMAL, make_text(context, "a+")};
    }
    assert(code_id == 312u);
    assert(regexp_order_step == 2u);
    regexp_order_step = 3u;
    return (OseoResult){OSEO_STATUS_NORMAL, make_text(context, "g")};
}

static OseoValue make_regexp_order_function(
    OseoContext *context,
    OseoValue environment,
    size_t code_id,
    const uint16_t *name,
    size_t name_length
) {
    return require_normal(oseo_function_create(
        context,
        code_id,
        environment,
        name,
        name_length,
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
}

/*
 * Direct native construction supplies the observable newTarget accessor that
 * the admitted source profile cannot spell without Reflect.construct. The
 * prototype read must finish before pattern conversion, which must finish
 * before flags conversion, under collection at every allocation.
 */
static void test_regexp_prototype_and_conversion_order(void) {
    static const uint16_t prototype_name[] = {
        'p', 'r', 'o', 't', 'o', 't', 'y', 'p', 'e',
    };
    static const uint16_t to_string_name[] = {
        't', 'o', 'S', 't', 'r', 'i', 'n', 'g',
    };
    OseoContext context;
    OseoValue roots[10] = {
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
        oseo_undefined(),
    };
    OseoRootFrame frame = {NULL, roots, 10u};
    oseo_context_init(&context, "runtime-heap.c", 14u);
    oseo_roots_push(&context, &frame);
    roots[0] = require_normal(
        oseo_intrinsic(&context, OSEO_INTRINSIC_REGEXP)
    );
    roots[1] = require_normal(oseo_environment_create(&context, 0u));
    roots[2] = make_regexp_order_function(
        &context,
        roots[1],
        310u,
        prototype_name,
        sizeof(prototype_name) / sizeof(*prototype_name)
    );
    roots[3] = make_regexp_order_function(
        &context,
        roots[1],
        311u,
        to_string_name,
        sizeof(to_string_name) / sizeof(*to_string_name)
    );
    roots[4] = make_regexp_order_function(
        &context,
        roots[1],
        312u,
        to_string_name,
        sizeof(to_string_name) / sizeof(*to_string_name)
    );
    OseoValue bind = require_normal(
        oseo_intrinsic(&context, OSEO_INTRINSIC_FUNCTION_BIND)
    );
    roots[5] = require_normal(oseo_call_function(
        &context,
        bind,
        roots[0],
        0u,
        NULL,
        oseo_undefined()
    ));
    roots[6] = make_text(&context, "prototype");
    (void)require_normal(oseo_object_define_accessor(
        &context,
        roots[5],
        roots[6],
        roots[2],
        oseo_undefined(),
        true,
        false,
        (OseoPropertyAttributes){true, true, false, true}
    ));
    roots[8] = require_normal(oseo_object_create(&context, oseo_null()));
    roots[9] = require_normal(oseo_object_create(&context, oseo_null()));
    roots[6] = make_text(&context, "toString");
    (void)require_normal(oseo_object_set(
        &context,
        roots[8],
        roots[6],
        roots[3],
        true
    ));
    (void)require_normal(oseo_object_set(
        &context,
        roots[9],
        roots[6],
        roots[4],
        true
    ));
    regexp_order_roots = roots;
    regexp_order_step = 0u;
    oseo_context_set_function_dispatcher(&context, regexp_order_dispatcher);
    context.collect_every_safepoint = true;
    OseoValue arguments[2] = {roots[8], roots[9]};
    roots[6] = require_normal(oseo_call_function(
        &context,
        roots[0],
        oseo_undefined(),
        2u,
        arguments,
        roots[5]
    ));
    assert(regexp_order_step == 3u);
    roots[3] = require_normal(
        oseo_intrinsic(&context, OSEO_INTRINSIC_OBJECT_GET_PROTOTYPE_OF)
    );
    OseoValue instance = roots[6];
    assert(
        require_normal(oseo_call_function(
            &context,
            roots[3],
            oseo_undefined(),
            1u,
            &instance,
            oseo_undefined()
        )) ==
        roots[7]
    );
    roots[4] = make_text(&context, "lastIndex");
    assert(
        require_normal(oseo_object_get(&context, roots[6], roots[4])) ==
        oseo_number(0.0)
    );
    oseo_context_set_function_dispatcher(&context, NULL);
    regexp_order_roots = NULL;
    oseo_roots_pop(&context, &frame);
    oseo_context_destroy(&context);
}

/*
 * The DataView constructor revalidates its buffer after
 * OrdinaryCreateFromConstructor reads the new target's `prototype`,
 * because that read is the specified Get and can run arbitrary code.
 * No admitted source construct reaches that Get with an accessor: a
 * class's `prototype` is a non-configurable data property, and
 * `Reflect.construct` and `Proxy` stay unadmitted. The revalidation is
 * therefore driven here, through a bound `%DataView%` carrying an own
 * accessor `prototype` that detaches or resizes the buffer the first
 * validation already accepted. A bound function is constructible and
 * starts without an own `prototype`, so it is the one new target this
 * runtime can build that both satisfies the [[Construct]] invariant and
 * accepts the accessor.
 */

typedef enum {
    DATA_VIEW_TARGET_DETACH,
    DATA_VIEW_TARGET_RESIZE,
} DataViewTargetAction;

typedef struct {
    /* What the `prototype` getter does to the buffer under the
     * constructor. */
    DataViewTargetAction action;
    double resized_byte_length;
    /* The constructor's own arguments over an eight-byte buffer that is
     * resizable to sixteen. An absent byte length tracks, because the
     * buffer is resizable. */
    double byte_offset;
    bool has_byte_length;
    double byte_length;
    /* What the constructor must then do. `error` is read only when
     * `throws` is true, and `view_byte_length` only when it is false. */
    bool throws;
    OseoErrorKind error;
    double view_byte_length;
} DataViewPrototypeScenario;

static const DataViewPrototypeScenario data_view_prototype_scenarios[] = {
    /* Detaching under the read reaches the second detached check. */
    {
        DATA_VIEW_TARGET_DETACH,
        0.0,
        0.0,
        true,
        4.0,
        true,
        OSEO_ERROR_TYPE,
        0.0,
    },
    /* Shrinking past the byte offset reaches the second offset check,
     * which is the only bound a tracking view has left. */
    {
        DATA_VIEW_TARGET_RESIZE,
        2.0,
        4.0,
        false,
        0.0,
        true,
        OSEO_ERROR_RANGE,
        0.0,
    },
    /* Shrinking exactly to the byte offset leaves that check satisfied
     * and yields an empty tracking view, so the comparison is a strict
     * one over the offset rather than an inclusive one. */
    {
        DATA_VIEW_TARGET_RESIZE,
        2.0,
        2.0,
        false,
        0.0,
        false,
        OSEO_ERROR_TYPE,
        0.0,
    },
    /* Shrinking past an explicit byte length reaches the second length
     * check, which the tracking cases above cannot reach. */
    {
        DATA_VIEW_TARGET_RESIZE,
        2.0,
        0.0,
        true,
        8.0,
        true,
        OSEO_ERROR_RANGE,
        0.0,
    },
    /* Shrinking exactly to the requested end stays in bounds, so that
     * check is a bound rather than a rejection of every resize. */
    {
        DATA_VIEW_TARGET_RESIZE,
        2.0,
        0.0,
        true,
        2.0,
        false,
        OSEO_ERROR_TYPE,
        2.0,
    },
    /* A grow stays in bounds and does not widen a fixed-length view. */
    {
        DATA_VIEW_TARGET_RESIZE,
        16.0,
        0.0,
        true,
        8.0,
        false,
        OSEO_ERROR_TYPE,
        8.0,
    },
};

/*
 * The getter reads its buffer from, and publishes its returned object
 * to, the running test's root slots, so neither survives a collection
 * unrooted. The constructor runs under the forced-collection policy, so
 * every allocation the getter performs collects.
 */
static OseoValue *data_view_target_roots = NULL;
static DataViewTargetAction data_view_target_action =
    DATA_VIEW_TARGET_DETACH;
static double data_view_target_size = 0.0;
static size_t data_view_target_prototype_reads = 0u;

static OseoResult data_view_target_prototype_dispatcher(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    (void)argument_count;
    (void)arguments;
    (void)new_target;
    data_view_target_prototype_reads += 1u;
    bool detach = data_view_target_action == DATA_VIEW_TARGET_DETACH;
    OseoResult method = oseo_intrinsic(
        context,
        detach ? OSEO_INTRINSIC_ARRAY_BUFFER_TRANSFER
               : OSEO_INTRINSIC_ARRAY_BUFFER_RESIZE
    );
    if (method.status != OSEO_STATUS_NORMAL) return method;
    OseoValue size = oseo_number(data_view_target_size);
    OseoResult mutated = oseo_call_function(
        context,
        method.value,
        data_view_target_roots[0],
        detach ? 0u : 1u,
        &size,
        oseo_undefined()
    );
    if (mutated.status != OSEO_STATUS_NORMAL) return mutated;
    /* An ordinary object, so the Get succeeds and the constructor uses
     * it rather than falling back to %DataView.prototype%. The marker
     * property below is how a successful case proves that. The object
     * and its key are rooted before the property write, because that
     * write allocates and every allocation here collects. */
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult allocated = oseo_roots_allocate(context, &frame, 2u);
    if (allocated.status != OSEO_STATUS_NORMAL) return allocated;
    OseoResult created = oseo_object_create(context, oseo_null());
    frame.slots[0] = created.value;
    if (created.status != OSEO_STATUS_NORMAL) {
        oseo_roots_release(context, &frame);
        return created;
    }
    frame.slots[1] = make_text(context, "tag");
    OseoResult tagged = oseo_object_set(
        context,
        frame.slots[0],
        frame.slots[1],
        oseo_number(1.0),
        true
    );
    OseoValue marked = frame.slots[0];
    oseo_roots_release(context, &frame);
    if (tagged.status != OSEO_STATUS_NORMAL) return tagged;
    data_view_target_roots[5] = marked;
    return (OseoResult){OSEO_STATUS_NORMAL, marked};
}

/*
 * new ArrayBuffer(byteLength, { maxByteLength }), through two rooted
 * scratch slots so that neither the options object nor its key depends
 * on a collection not running.
 */
static OseoValue make_resizable_array_buffer(
    OseoContext *context,
    OseoValue *scratch,
    double byte_length,
    double max_byte_length
) {
    scratch[0] = require_normal(oseo_object_create(context, oseo_null()));
    scratch[1] = make_text(context, "maxByteLength");
    (void)require_normal(oseo_object_set(
        context,
        scratch[0],
        scratch[1],
        oseo_number(max_byte_length),
        true
    ));
    OseoValue constructor =
        require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_ARRAY_BUFFER));
    OseoValue arguments[2] = {oseo_number(byte_length), scratch[0]};
    OseoValue buffer = require_normal(oseo_call_function(
        context,
        constructor,
        oseo_undefined(),
        2u,
        arguments,
        constructor
    ));
    scratch[0] = oseo_undefined();
    scratch[1] = oseo_undefined();
    return buffer;
}

/*
 * %DataView%.bind(), which construction would forward to %DataView%
 * itself, carrying an own accessor `prototype`. Calling %DataView% with
 * this object as the new target is what an admitted `Reflect.construct`
 * would otherwise produce.
 */
static OseoValue make_data_view_prototype_target(
    OseoContext *context,
    OseoValue *roots
) {
    static const uint16_t getter_name[] = {
        'p', 'r', 'o', 't', 'o', 't', 'y', 'p', 'e',
    };
    roots[1] = require_normal(oseo_environment_create(context, 0u));
    roots[2] = require_normal(oseo_function_create(
        context,
        300u,
        roots[1],
        getter_name,
        sizeof(getter_name) / sizeof(*getter_name),
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    ));
    OseoValue bind =
        require_normal(oseo_intrinsic(context, OSEO_INTRINSIC_FUNCTION_BIND));
    OseoValue target = require_normal(oseo_call_function(
        context,
        bind,
        roots[4],
        0u,
        NULL,
        oseo_undefined()
    ));
    roots[3] = target;
    roots[6] = make_text(context, "prototype");
    (void)require_normal(oseo_object_define_accessor(
        context,
        roots[3],
        roots[6],
        roots[2],
        oseo_undefined(),
        true,
        false,
        (OseoPropertyAttributes){true, true, false, true}
    ));
    roots[6] = oseo_undefined();
    return roots[3];
}

static void test_data_view_prototype_revalidation(void) {
    const size_t scenario_count = sizeof(data_view_prototype_scenarios) /
        sizeof(data_view_prototype_scenarios[0]);
    for (size_t index = 0u; index < scenario_count; index += 1u) {
        const DataViewPrototypeScenario *scenario =
            &data_view_prototype_scenarios[index];
        OseoContext context;
        OseoValue roots[8] = {
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
            oseo_undefined(),
        };
        OseoRootFrame frame = {NULL, roots, 8u};
        oseo_context_init(&context, "runtime-heap.c", 14u);
        oseo_roots_push(&context, &frame);
        data_view_target_roots = roots;
        data_view_target_action = scenario->action;
        data_view_target_size = scenario->resized_byte_length;
        data_view_target_prototype_reads = 0u;
        oseo_context_set_function_dispatcher(
            &context,
            data_view_target_prototype_dispatcher
        );
        roots[0] =
            make_resizable_array_buffer(&context, &roots[6], 8.0, 16.0);
        roots[4] = require_normal(
            oseo_intrinsic(&context, OSEO_INTRINSIC_DATA_VIEW)
        );
        (void)make_data_view_prototype_target(&context, roots);
        OseoValue arguments[3] = {
            roots[0],
            oseo_number(scenario->byte_offset),
            oseo_number(scenario->byte_length),
        };
        /* Every allocation the getter performs collects, so a value the
         * constructor holds across the read must be rooted to survive. */
        context.collect_every_safepoint = true;
        OseoResult constructed = oseo_call_function(
            &context,
            roots[4],
            oseo_undefined(),
            scenario->has_byte_length ? 3u : 2u,
            arguments,
            roots[3]
        );
        roots[6] = constructed.value;
        context.collect_every_safepoint = false;
        /* The first validation accepted these arguments, so the read
         * ran and the outcome below is the second validation's. */
        assert(data_view_target_prototype_reads == 1u);
        if (scenario->throws) {
            assert(constructed.status == OSEO_STATUS_THROW);
            assert(!context.has_diagnostic);
            roots[7] = require_normal(
                oseo_error_intrinsic(&context, scenario->error)
            );
            assert(
                require_normal(
                    oseo_instanceof(&context, roots[6], roots[7])
                ) == oseo_boolean(true)
            );
        } else {
            assert(constructed.status == OSEO_STATUS_NORMAL);
            roots[7] = data_view_byte_length_of(&context, roots[6]);
            assert(
                require_normal(oseo_strict_equal(
                    &context,
                    roots[7],
                    oseo_number(scenario->view_byte_length)
                )) == oseo_boolean(true)
            );
            /* The view inherits the getter's marker, so it took the
             * object that Get returned. */
            roots[5] = make_text(&context, "tag");
            roots[7] = require_normal(
                oseo_object_get(&context, roots[6], roots[5])
            );
            assert(roots[7] == oseo_number(1.0));
        }
        oseo_collect(&context);
        oseo_context_set_function_dispatcher(&context, NULL);
        data_view_target_roots = NULL;
        oseo_roots_pop(&context, &frame);
        oseo_context_destroy(&context);
    }
}

static void test_string_length_limit(OseoContext *context) {
    OseoResult result = oseo_string_from_units(
        context,
        NULL,
        (size_t)536870889u
    );
    assert(result.status == OSEO_STATUS_THROW);
}

/*
 * The var-scoped Script bindings the global object exposes. Each
 * property is a view of the binding cell rather than a copy of its
 * value, so a write through either side is visible through the other,
 * and a forced collection between them keeps both alive.
 */
static void test_global_object_bindings(
    OseoContext *context,
    OseoValue *roots
) {
    static const uint16_t answer_units[] = {'a', 'n', 's', 'w', 'e', 'r'};
    static const uint16_t frozen_units[] = {'f', 'r', 'o', 'z', 'e', 'n'};
    static const uint16_t *const names[] = {answer_units, frozen_units};
    static const size_t lengths[] = {6u, 6u};
    static const size_t declaration_lines[] = {12u, 13u};
    static const size_t declaration_columns[] = {5u, 5u};
    static const size_t binding_ids[] = {0u, 1u};
    static const bool functions[] = {false, false};
    static const bool redeclared_function[] = {true};
    roots[0] = require_normal(oseo_environment_create(context, 2u));
    for (size_t index = 0u; index < 2u; index += 1u) {
        roots[1] = require_normal(oseo_cell_create(context, oseo_number(1.0)));
        (void)require_normal(
            oseo_environment_set(context, roots[0], index, roots[1])
        );
    }
    roots[2] = require_normal(
        oseo_global_object_create(
            context,
            roots[0],
            0u,
            NULL,
            NULL,
            NULL,
            NULL,
            2u,
            names,
            lengths,
            declaration_lines,
            declaration_columns,
            binding_ids,
            functions
        )
    );
    assert(roots[2] == require_normal(oseo_this_value(context,
        oseo_undefined())));
    roots[3] = make_text(context, "answer");
    /* A property read observes the binding's current value. */
    roots[1] = require_normal(oseo_environment_get(context, roots[0], 0u));
    (void)require_normal(oseo_cell_set(context, roots[1], oseo_number(2.0)));
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(2.0)
    );
    /* A property write reaches the binding rather than replacing it. */
    (void)require_normal(
        oseo_object_set(context, roots[2], roots[3], oseo_number(3.0), false)
    );
    assert(
        require_normal(oseo_cell_get(context, roots[1])) == oseo_number(3.0)
    );
    /* A cell-backed slot is never cached, because a fixed-slot load
     * would hand generated code the binding cell instead of the value it
     * holds. The exclusion is per slot, so an ordinary property the
     * program adds to the same object is still cached and loads its own
     * value. */
    OseoPropertyCache cache = {0u, 0u};
    oseo_property_cache_update(roots[2], roots[3], &cache);
    assert(!oseo_property_cache_matches(roots[2], &cache));
    roots[4] = make_text(context, "ordinary");
    (void)require_normal(
        oseo_object_set(context, roots[2], roots[4], oseo_number(7.0), false)
    );
    oseo_property_cache_update(roots[2], roots[4], &cache);
    assert(oseo_property_cache_matches(roots[2], &cache));
    assert(oseo_property_cache_load(roots[2], &cache) == oseo_number(7.0));
    /* A later Script function declaration reuses the first Script's cell,
     * restores the global-function descriptor, and invalidates caches for
     * the changed global-object shape. */
    roots[5] = require_normal(oseo_environment_create(context, 1u));
    roots[6] = require_normal(oseo_cell_create(context, oseo_number(8.0)));
    (void)require_normal(oseo_environment_set(
        context, roots[5], 0u, roots[6]
    ));
    (void)require_normal(oseo_global_object_create(
        context,
        roots[5],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        names,
        lengths,
        declaration_lines,
        declaration_columns,
        binding_ids,
        redeclared_function
    ));
    assert(!oseo_property_cache_matches(roots[2], &cache));
    roots[6] = require_normal(oseo_environment_get(context, roots[5], 0u));
    roots[7] = require_normal(oseo_environment_get(context, roots[0], 0u));
    assert(roots[6] == roots[7]);
    (void)require_normal(oseo_cell_set(context, roots[6], oseo_number(8.0)));
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(8.0)
    );
    OseoValue descriptor_arguments[2] = {roots[2], roots[3]};
    roots[6] = require_normal(oseo_object_builtin_get_own_property_descriptor(
        context, 2u, descriptor_arguments
    ));
    roots[7] = make_text(context, "configurable");
    assert(
        require_normal(oseo_object_get(context, roots[6], roots[7])) ==
        oseo_boolean(false)
    );
    roots[7] = make_text(context, "enumerable");
    assert(
        require_normal(oseo_object_get(context, roots[6], roots[7])) ==
        oseo_boolean(true)
    );
    roots[7] = make_text(context, "writable");
    assert(
        require_normal(oseo_object_get(context, roots[6], roots[7])) ==
        oseo_boolean(true)
    );
    roots[1] = require_normal(oseo_environment_get(context, roots[0], 0u));
    (void)require_normal(oseo_cell_set(context, roots[1], oseo_number(3.0)));
    /* The property is writable, enumerable, and non-configurable, so a
     * delete reports failure and changes nothing. */
    assert(
        require_normal(oseo_object_delete(context, roots[2], roots[3], false))
        == oseo_boolean(false)
    );
    assert(
        oseo_object_delete(context, roots[2], roots[3], true).status ==
        OSEO_STATUS_THROW
    );
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(3.0)
    );
    /* Nothing but the context roots the object now, and the binding, its
     * cell, and its property all survive collection together. */
    roots[1] = oseo_undefined();
    roots[2] = oseo_undefined();
    oseo_collect(context);
    roots[2] = require_normal(oseo_this_value(context, oseo_undefined()));
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(3.0)
    );
    /* Making the property non-writable through [[DefineOwnProperty]]
     * also stops the binding assignment the shared cell would otherwise
     * accept, silently outside strict code and by throwing inside it. */
    roots[3] = make_text(context, "frozen");
    roots[4] = require_normal(oseo_object_create(context, oseo_null()));
    (void)require_normal(oseo_object_set(context, roots[4],
        make_text(context, "writable"), oseo_boolean(false), false));
    (void)require_normal(oseo_object_set(context, roots[4],
        make_text(context, "value"), oseo_number(4.0), false));
    OseoValue arguments[3] = {roots[2], roots[3], roots[4]};
    (void)require_normal(
        oseo_object_builtin_define_property(context, 3u, arguments)
    );
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(4.0)
    );
    roots[1] = require_normal(oseo_environment_get(context, roots[0], 1u));
    assert(
        require_normal(
            oseo_global_binding_set(context, roots[1], oseo_number(5.0), false)
        ) == oseo_number(5.0)
    );
    assert(
        oseo_global_binding_set(context, roots[1], oseo_number(5.0), true)
            .status == OSEO_STATUS_THROW
    );
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(4.0)
    );
    /* A writable global binding still accepts the same assignment. */
    roots[1] = require_normal(oseo_environment_get(context, roots[0], 0u));
    (void)require_normal(
        oseo_global_binding_set(context, roots[1], oseo_number(6.0), true)
    );
    roots[3] = make_text(context, "answer");
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_number(6.0)
    );

    /* The realm's standard value properties retain one read-only,
     * non-configurable identity through var redeclaration and collection. */
    static const uint16_t undefined_units[] = {
        'u', 'n', 'd', 'e', 'f', 'i', 'n', 'e', 'd'
    };
    static const uint16_t infinity_units[] = {
        'I', 'n', 'f', 'i', 'n', 'i', 't', 'y'
    };
    static const uint16_t blocked_units[] = {
        'b', 'l', 'o', 'c', 'k', 'e', 'd'
    };
    static const uint16_t object_units[] = {
        'O', 'b', 'j', 'e', 'c', 't'
    };
    static const uint16_t *const undefined_name[] = {undefined_units};
    static const uint16_t *const infinity_name[] = {infinity_units};
    static const uint16_t *const blocked_name[] = {blocked_units};
    static const uint16_t *const object_name[] = {object_units};
    static const size_t undefined_length[] = {9u};
    static const size_t infinity_length[] = {8u};
    static const size_t blocked_length[] = {7u};
    static const size_t object_length[] = {6u};
    static const size_t declaration_line[] = {37u};
    static const size_t declaration_column[] = {5u};
    static const size_t first_binding[] = {0u};
    static const bool var_declaration[] = {false};
    static const bool function_declaration[] = {true};
    roots[3] = make_text(context, "undefined");
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_undefined()
    );
    assert(
        require_normal(oseo_object_set(
            context, roots[2], roots[3], oseo_number(9.0), false
        )) == oseo_number(9.0)
    );
    assert(
        require_normal(oseo_object_get(context, roots[2], roots[3])) ==
        oseo_undefined()
    );
    assert(
        oseo_object_set(context, roots[2], roots[3], oseo_number(9.0), true)
            .status == OSEO_STATUS_THROW
    );
    assert(
        require_normal(oseo_object_delete(context, roots[2], roots[3], false))
        == oseo_boolean(false)
    );

    roots[4] = require_normal(oseo_environment_create(context, 1u));
    roots[5] = require_normal(oseo_cell_create(context, oseo_uninitialized()));
    (void)require_normal(oseo_environment_set(
        context, roots[4], 0u, roots[5]
    ));
    assert(oseo_global_object_create(
        context,
        roots[4],
        1u,
        undefined_name,
        undefined_length,
        declaration_line,
        declaration_column,
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
    ).status == OSEO_STATUS_THROW);
    assert(oseo_global_object_create(
        context,
        roots[4],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        infinity_name,
        infinity_length,
        declaration_line,
        declaration_column,
        first_binding,
        function_declaration
    ).status == OSEO_STATUS_THROW);
    (void)require_normal(oseo_global_object_create(
        context,
        roots[4],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        undefined_name,
        undefined_length,
        declaration_line,
        declaration_column,
        first_binding,
        var_declaration
    ));
    roots[5] = require_normal(oseo_environment_get(context, roots[4], 0u));
    (void)require_normal(oseo_global_binding_set(
        context, roots[5], oseo_number(10.0), false
    ));
    assert(require_normal(oseo_cell_get(context, roots[5])) ==
           oseo_undefined());

    /* A plain-valued global property initializes the fresh Script cell
     * before the property becomes cell-backed. A var declaration preserves
     * that value and its descriptor rather than assigning through the
     * uninitialized cell. */
    roots[3] = make_text(context, "Object");
    roots[6] = require_normal(oseo_object_get(context, roots[2], roots[3]));
    roots[5] = require_normal(oseo_cell_create(context, oseo_uninitialized()));
    (void)require_normal(oseo_environment_set(
        context, roots[4], 0u, roots[5]
    ));
    (void)require_normal(oseo_global_object_create(
        context,
        roots[4],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        object_name,
        object_length,
        declaration_line,
        declaration_column,
        first_binding,
        var_declaration
    ));
    roots[5] = require_normal(oseo_environment_get(context, roots[4], 0u));
    assert(require_normal(oseo_cell_get(context, roots[5])) == roots[6]);

    /* A non-extensible global still admits an existing var property but
     * rejects an absent name before it creates a property. */
    roots[6] = require_normal(oseo_object_get(context, roots[2], roots[3]));
    roots[3] = make_text(context, "preventExtensions");
    roots[7] = require_normal(oseo_object_get(context, roots[6], roots[3]));
    OseoValue prevent_arguments[1] = {roots[2]};
    (void)require_normal(oseo_call_function(
        context,
        roots[7],
        roots[6],
        1u,
        prevent_arguments,
        oseo_undefined()
    ));
    assert(oseo_global_object_create(
        context,
        roots[4],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        blocked_name,
        blocked_length,
        declaration_line,
        declaration_column,
        first_binding,
        var_declaration
    ).status == OSEO_STATUS_THROW);
    roots[3] = make_text(context, "blocked");
    assert(require_normal(oseo_object_has_own(
        context, roots[2], roots[3]
    )) == oseo_boolean(false));
    (void)require_normal(oseo_global_object_create(
        context,
        roots[4],
        0u,
        NULL,
        NULL,
        NULL,
        NULL,
        1u,
        undefined_name,
        undefined_length,
        declaration_line,
        declaration_column,
        first_binding,
        var_declaration
    ));
}

int main(void) {
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "runtime-heap.c", 14u);
    test_primitive_prototype_intrinsics(&context);
    (void)require_normal(oseo_roots_allocate(&context, &frame, 8u));
    test_deep_graph(&context, frame.slots);
    test_forward_graph(&context, frame.slots);
    test_cycle_and_sharing(&context, frame.slots);
    test_allocation_failure(&context, frame.slots);
    test_bigint_survival(&context, frame.slots);
    test_ordinary_properties(&context, frame.slots);
    test_arrays(&context, frame.slots);
    test_array_accumulation(&context, frame.slots);
    test_argument_lists(&context, frame.slots);
    test_function_cells(&context, frame.slots);
    test_cell_initialization(&context, frame.slots);
    test_delete_object_coercible(&context, frame.slots);
    test_loose_equality_boundary(&context, frame.slots);
    test_to_primitive_conversion(&context, frame.slots);
    test_error_intrinsics(&context, frame.slots);
    test_symbols(&context, frame.slots);
    test_iterators(&context, frame.slots);
    test_accessor_descriptor_gc_safety(&context, frame.slots);
    test_global_this_install_failure();
    test_bigint_allocation_sweep();
    test_data_view_allocation_sweep();
    test_data_view_prototype_revalidation();
    test_regexp_allocation_sweep();
    test_regexp_matcher_limits();
    test_regexp_duplicate_name_scale();
    test_regexp_prototype_and_conversion_order();
    test_string_length_limit(&context);
    test_this_value(&context, frame.slots);
    test_global_object_bindings(&context, frame.slots);
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
