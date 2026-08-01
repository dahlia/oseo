#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static OseoValue make_text(OseoContext *context, const char *text);

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

int main(void) {
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "runtime-heap.c", 14u);
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
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
