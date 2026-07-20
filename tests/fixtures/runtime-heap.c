#include "oseo_runtime.h"

#include <assert.h>
#include <stddef.h>
#include <string.h>

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
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

static OseoValue make_key(
    OseoContext *context,
    uint16_t unit
) {
    return require_normal(oseo_string_from_units(context, &unit, 1u));
}

static OseoValue make_text(OseoContext *context, const char *text) {
    size_t length = strlen(text);
    assert(length <= 16u);
    uint16_t units[16];
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
    OseoPropertyAttributes fixed = {false, false, false};
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
    OseoPropertyAttributes fixed = {false, true, true};
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
    OseoPropertyAttributes retained = {false, true, true};
    OseoPropertyAttributes removable = {true, true, true};
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
        oseo_undefined()
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

int main(void) {
    OseoContext context;
    OseoRootFrame frame;
    oseo_context_init(&context, "runtime-heap.c", 14u);
    (void)require_normal(oseo_roots_allocate(&context, &frame, 8u));
    test_deep_graph(&context, frame.slots);
    test_forward_graph(&context, frame.slots);
    test_cycle_and_sharing(&context, frame.slots);
    test_allocation_failure(&context, frame.slots);
    test_ordinary_properties(&context, frame.slots);
    test_arrays(&context, frame.slots);
    test_function_cells(&context, frame.slots);
    test_cell_initialization(&context, frame.slots);
    test_loose_equality_boundary(&context, frame.slots);
    test_to_primitive_conversion(&context, frame.slots);
    test_error_intrinsics(&context, frame.slots);
    test_symbols(&context, frame.slots);
    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
