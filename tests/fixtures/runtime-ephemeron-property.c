#include "runtime_internal.h"

#include <assert.h>
#include <stdbool.h>
#include <inttypes.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_NODES ((size_t)6u)

static OseoValue require_normal(OseoResult result) {
    assert(result.status == OSEO_STATUS_NORMAL);
    return result.value;
}

static size_t digit_index(char digit, size_t node_count) {
    assert(digit >= '0' && digit <= '5');
    size_t index = (size_t)(digit - '0');
    assert(index < node_count);
    return index;
}

int main(int argument_count, char **arguments) {
    assert(argument_count == 7);
    size_t node_count = (size_t)strtoul(arguments[2], NULL, 10);
    assert(node_count > 0u && node_count <= MAX_NODES);
    assert(strlen(arguments[3]) == node_count);
    assert(strlen(arguments[4]) == node_count);
    assert(strlen(arguments[5]) % 2u == 0u);
    assert(strlen(arguments[6]) == node_count);

    OseoContext context;
    OseoRootFrame frame = {NULL, NULL, 0u};
    oseo_context_init(&context, "ephemeron-property", 18u);
    context.observe_specialization = arguments[1][0] == '1';
    require_normal(oseo_roots_allocate(&context, &frame, 16u));
    frame.slots[0] = require_normal(
        oseo_internal_ephemeron_table_create(&context)
    );
    frame.slots[1] = require_normal(
        oseo_internal_finalization_registry_create(
            &context,
            oseo_undefined()
        )
    );

    for (size_t index = 0u; index < node_count; index += 1u) {
        frame.slots[4u + index] = require_normal(
            oseo_environment_create(&context, 1u)
        );
    }
    for (size_t index = 0u; index < node_count; index += 1u) {
        char target = arguments[4][index];
        if (target == 'x') continue;
        require_normal(oseo_environment_set(
            &context,
            frame.slots[4u + index],
            0u,
            frame.slots[4u + digit_index(target, node_count)]
        ));
    }
    for (size_t index = 0u; arguments[5][index] != '\0'; index += 2u) {
        size_t key = digit_index(arguments[5][index], node_count);
        size_t value = digit_index(arguments[5][index + 1u], node_count);
        require_normal(oseo_internal_ephemeron_set(
            &context,
            frame.slots[0],
            frame.slots[4u + key],
            frame.slots[4u + value]
        ));
    }
    for (size_t index = 0u; index < node_count; index += 1u) {
        frame.slots[10u + index] = require_normal(
            oseo_internal_weak_reference_create(
                &context,
                frame.slots[4u + index]
            )
        );
    }
    for (size_t index = 0u; index < node_count; index += 1u) {
        size_t target = digit_index(arguments[6][index], node_count);
        require_normal(oseo_internal_finalization_register(
            &context,
            frame.slots[1],
            frame.slots[4u + target],
            oseo_number((double)(target + 1u))
        ));
    }
    assert(context.finalization_pending_count == 0u);

    for (size_t index = 0u; index < node_count; index += 1u) {
        if (arguments[3][index] == '0') {
            frame.slots[4u + index] = oseo_undefined();
        }
    }
    oseo_collect(&context);

    (void)fputs("live ", stdout);
    for (size_t index = 0u; index < node_count; index += 1u) {
        OseoValue target = oseo_internal_weak_reference_target(
            frame.slots[10u + index]
        );
        (void)fputc(target == oseo_undefined() ? '0' : '1', stdout);
    }
    (void)fputs("\ncleanup", stdout);
    bool first = true;
    while (oseo_internal_finalization_take_cleanup(
        &context,
        &frame.slots[2],
        &frame.slots[3]
    )) {
        assert(oseo_value_is_smi(frame.slots[3]));
        (void)fprintf(
            stdout,
            first ? " %" PRId64 : ",%" PRId64,
            oseo_value_unbox_smi(frame.slots[3])
        );
        first = false;
    }
    (void)fputc('\n', stdout);
    assert(context.finalization_pending_count == 0u);

    oseo_roots_release(&context, &frame);
    oseo_context_destroy(&context);
    return 0;
}
