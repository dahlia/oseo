#include "runtime_internal.h"

#include <math.h>
#include <stdint.h>
#include <stdlib.h>

/*
 * The runtime module evaluation driver: Evaluate, InnerModuleEvaluation,
 * ExecuteAsyncModule, GatherAvailableAncestors,
 * AsyncModuleExecutionFulfilled, and AsyncModuleExecutionRejected of
 * ECMA-262 16th edition clause 16.2.1.6, over the module table the build
 * emits. The driver dispatches compiled evaluators and runs no source.
 *
 * Every record's evaluator, top-level capability promise, and evaluation
 * error stay reachable through the context's table, so a value stored in
 * a record is rooted from that point on. Indices are plain integers that
 * name table entries; the stack and the ancestor lists hold no values.
 * Internal reactions use PerformPromiseThen directly and never read
 * `then`, call `Promise.all`, or consult the global `Promise` binding.
 */

static OseoModuleTable *module_table(OseoContext *context) {
    return (OseoModuleTable *)context->module_table;
}

static OseoModuleRecord *module_record(OseoContext *context, size_t index) {
    return &module_table(context)->records[index];
}

/* A record's [[CycleRoot]], or the record itself while it has none. */
static size_t module_cycle_root(OseoContext *context, size_t index) {
    size_t root = module_record(context, index)->cycle_root;
    return root == OSEO_MODULE_NONE ? index : root;
}

static bool module_async_pending(const OseoModuleRecord *record) {
    return record->async_evaluation_order != OSEO_MODULE_ASYNC_UNSET &&
        record->async_evaluation_order != OSEO_MODULE_ASYNC_DONE;
}

static OseoResult module_allocation_failure(OseoContext *context) {
    return failure(
        context,
        "OSEO2001",
        "Module evaluation state allocation failed."
    );
}

/* A ThrowCompletion of a recorded [[EvaluationError]]. */
static OseoResult module_throw(OseoContext *context, OseoValue error) {
    oseo_context_clear_language_error(context);
    return (OseoResult){OSEO_STATUS_THROW, error};
}

static OseoResult module_add_async_parent(
    OseoContext *context,
    size_t required,
    size_t parent
) {
    OseoModuleRecord *record = module_record(context, required);
    if (record->async_parent_count == record->async_parent_capacity) {
        size_t capacity = record->async_parent_capacity == 0u
            ? 4u
            : record->async_parent_capacity * 2u;
        size_t *parents = realloc(
            record->async_parents,
            capacity * sizeof(*parents)
        );
        if (parents == NULL) return module_allocation_failure(context);
        record->async_parents = parents;
        record->async_parent_capacity = capacity;
    }
    record->async_parents[record->async_parent_count] = parent;
    record->async_parent_count += 1u;
    return normal(oseo_undefined());
}

/* Calls a module's compiled evaluator with no arguments. */
static OseoResult module_call_evaluator(OseoContext *context, size_t index) {
    return oseo_call_function(
        context,
        module_record(context, index)->evaluator,
        oseo_undefined(),
        0u,
        NULL,
        oseo_undefined()
    );
}

/*
 * ExecuteAsyncModule. The asynchronous evaluator's own result promise is
 * the capability the body settles: it runs to its first await before the
 * call returns, and a body that never suspends has already settled it,
 * so attaching the reaction afterwards queues the same job at the same
 * point as attaching it first.
 */
static OseoResult module_execute_async(OseoContext *context, size_t index) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[1] = module_record(context, index)->evaluator;
    result = module_call_evaluator(context, index);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        /*
         * An abrupt call, such as an exhausted native stack, rejects the
         * capability the way an abrupt body would.
         */
        oseo_context_clear_language_error(context);
        result = oseo_internal_promise_create(context);
        if (result.status == OSEO_STATUS_NORMAL) {
            OseoValue error = frame.slots[0];
            frame.slots[0] = result.value;
            frame.slots[1] = error;
            result = oseo_promise_reject_into(context, frame.slots[0], error);
            frame.slots[1] = module_record(context, index)->evaluator;
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_promise_then_module(
            context,
            frame.slots[0],
            frame.slots[1],
            index
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * InnerModuleEvaluation. A THROW without a diagnostic is the abrupt
 * completion Evaluate records; one with a diagnostic ends the program.
 */
static OseoResult module_inner_evaluation(
    OseoContext *context,
    size_t index,
    size_t *dfs_index
) {
    OseoModuleRecord *record = module_record(context, index);
    if (record->status == OSEO_MODULE_EVALUATING_ASYNC ||
        record->status == OSEO_MODULE_EVALUATED) {
        return record->errored
            ? module_throw(context, record->evaluation_error)
            : normal(oseo_undefined());
    }
    if (record->status == OSEO_MODULE_EVALUATING) {
        return normal(oseo_undefined());
    }
    record->status = OSEO_MODULE_EVALUATING;
    record->dfs_index = *dfs_index;
    record->dfs_ancestor_index = *dfs_index;
    record->pending_async_dependencies = 0u;
    *dfs_index += 1u;
    OseoModuleTable *table = module_table(context);
    table->stack[table->stack_count] = index;
    table->stack_count += 1u;
    for (size_t position = 0u;
         position < module_record(context, index)->requested_count;
         position += 1u) {
        size_t required = module_record(context, index)->requested[position];
        OseoResult result =
            module_inner_evaluation(context, required, dfs_index);
        if (result.status != OSEO_STATUS_NORMAL) return result;
        record = module_record(context, index);
        OseoModuleRecord *required_record = module_record(context, required);
        if (required_record->status == OSEO_MODULE_EVALUATING) {
            if (required_record->dfs_ancestor_index <
                record->dfs_ancestor_index) {
                record->dfs_ancestor_index =
                    required_record->dfs_ancestor_index;
            }
        } else {
            required = module_cycle_root(context, required);
            required_record = module_record(context, required);
            if (required_record->errored) {
                return module_throw(
                    context,
                    required_record->evaluation_error
                );
            }
        }
        if (module_async_pending(required_record)) {
            record->pending_async_dependencies += 1u;
            result = module_add_async_parent(context, required, index);
            if (result.status != OSEO_STATUS_NORMAL) return result;
        }
    }
    record = module_record(context, index);
    if (record->pending_async_dependencies > 0u ||
        record->has_top_level_await) {
        table->async_evaluation_count += 1u;
        record->async_evaluation_order = table->async_evaluation_count;
        if (record->pending_async_dependencies == 0u) {
            OseoResult result = module_execute_async(context, index);
            if (result.status != OSEO_STATUS_NORMAL) return result;
        }
    } else {
        OseoResult result = module_call_evaluator(context, index);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    record = module_record(context, index);
    if (record->dfs_ancestor_index == record->dfs_index) {
        size_t member;
        do {
            table->stack_count -= 1u;
            member = table->stack[table->stack_count];
            OseoModuleRecord *popped = module_record(context, member);
            popped->status =
                popped->async_evaluation_order == OSEO_MODULE_ASYNC_UNSET
                    ? OSEO_MODULE_EVALUATED
                    : OSEO_MODULE_EVALUATING_ASYNC;
            popped->cycle_root = index;
        } while (member != index);
    }
    return normal(oseo_undefined());
}

/* Settles a record's top-level capability when it has one. */
static OseoResult module_settle_capability(
    OseoContext *context,
    size_t index,
    bool fulfilled
) {
    OseoModuleRecord *record = module_record(context, index);
    if (!is_promise(record->top_level_capability)) {
        return normal(oseo_undefined());
    }
    return fulfilled
        ? oseo_promise_resolve_into(
              context,
              record->top_level_capability,
              oseo_undefined()
          )
        : oseo_promise_reject_into(
              context,
              record->top_level_capability,
              record->evaluation_error
          );
}

/* Evaluate. Returns the cycle root's top-level capability promise. */
static OseoResult module_evaluate(OseoContext *context, size_t index) {
    OseoModuleRecord *record = module_record(context, index);
    if (record->status == OSEO_MODULE_EVALUATING_ASYNC ||
        record->status == OSEO_MODULE_EVALUATED) {
        index = module_cycle_root(context, index);
        record = module_record(context, index);
    }
    if (is_promise(record->top_level_capability)) {
        return normal(record->top_level_capability);
    }
    OseoResult result = oseo_internal_promise_create(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    module_record(context, index)->top_level_capability = result.value;
    OseoModuleTable *table = module_table(context);
    table->stack_count = 0u;
    size_t dfs_index = 0u;
    result = module_inner_evaluation(context, index, &dfs_index);
    if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
        OseoValue error = result.value;
        oseo_context_clear_language_error(context);
        for (size_t position = 0u;
             position < table->stack_count;
             position += 1u) {
            OseoModuleRecord *member =
                module_record(context, table->stack[position]);
            member->status = OSEO_MODULE_EVALUATED;
            member->errored = true;
            member->evaluation_error = error;
        }
        table->stack_count = 0u;
        record = module_record(context, index);
        if (!record->errored) {
            record->errored = true;
            record->evaluation_error = error;
        }
        result = module_settle_capability(context, index, false);
    } else if (result.status == OSEO_STATUS_NORMAL &&
               module_record(context, index)->async_evaluation_order ==
                   OSEO_MODULE_ASYNC_UNSET) {
        result = module_settle_capability(context, index, true);
    }
    if (result.status != OSEO_STATUS_NORMAL) return result;
    return normal(module_record(context, index)->top_level_capability);
}

typedef struct {
    size_t *items;
    size_t count;
    size_t capacity;
} OseoModuleList;

static bool module_list_contains(const OseoModuleList *list, size_t index) {
    for (size_t position = 0u; position < list->count; position += 1u) {
        if (list->items[position] == index) return true;
    }
    return false;
}

static bool module_list_append(OseoModuleList *list, size_t index) {
    if (list->count == list->capacity) {
        size_t capacity = list->capacity == 0u ? 8u : list->capacity * 2u;
        size_t *items = realloc(list->items, capacity * sizeof(*items));
        if (items == NULL) return false;
        list->items = items;
        list->capacity = capacity;
    }
    list->items[list->count] = index;
    list->count += 1u;
    return true;
}

/* GatherAvailableAncestors. Returns false when the list cannot grow. */
static bool module_gather_available_ancestors(
    OseoContext *context,
    size_t index,
    OseoModuleList *list
) {
    for (size_t position = 0u;
         position < module_record(context, index)->async_parent_count;
         position += 1u) {
        size_t parent = module_record(context, index)->async_parents[position];
        size_t root = module_cycle_root(context, parent);
        if (module_list_contains(list, parent) ||
            module_record(context, root)->errored) {
            continue;
        }
        OseoModuleRecord *record = module_record(context, parent);
        record->pending_async_dependencies -= 1u;
        if (record->pending_async_dependencies == 0u) {
            if (!module_list_append(list, parent)) return false;
            if (!record->has_top_level_await &&
                !module_gather_available_ancestors(context, parent, list)) {
                return false;
            }
        }
    }
    return true;
}

/* AsyncModuleExecutionRejected. The error is rooted by the caller. */
static OseoResult module_async_rejected(
    OseoContext *context,
    size_t index,
    OseoValue error
) {
    OseoModuleRecord *record = module_record(context, index);
    if (record->status == OSEO_MODULE_EVALUATED) {
        return normal(oseo_undefined());
    }
    record->errored = true;
    record->evaluation_error = error;
    record->status = OSEO_MODULE_EVALUATED;
    record->async_evaluation_order = OSEO_MODULE_ASYNC_DONE;
    OseoResult result = module_settle_capability(context, index, false);
    for (size_t position = 0u;
         result.status == OSEO_STATUS_NORMAL &&
         position < module_record(context, index)->async_parent_count;
         position += 1u) {
        result = module_async_rejected(
            context,
            module_record(context, index)->async_parents[position],
            module_record(context, index)->evaluation_error
        );
    }
    return result;
}

/* AsyncModuleExecutionFulfilled. */
static OseoResult module_async_fulfilled(OseoContext *context, size_t index) {
    OseoModuleRecord *record = module_record(context, index);
    if (record->status == OSEO_MODULE_EVALUATED) {
        return normal(oseo_undefined());
    }
    record->async_evaluation_order = OSEO_MODULE_ASYNC_DONE;
    record->status = OSEO_MODULE_EVALUATED;
    OseoResult result = module_settle_capability(context, index, true);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoModuleList list = {NULL, 0u, 0u};
    if (!module_gather_available_ancestors(context, index, &list)) {
        free(list.items);
        return module_allocation_failure(context);
    }
    /*
     * Sort by [[AsyncEvaluationOrder]]. Every listed record is still
     * pending, so its order is an integer and the orders are distinct.
     */
    for (size_t position = 1u; position < list.count; position += 1u) {
        size_t item = list.items[position];
        uint64_t order = module_record(context, item)->async_evaluation_order;
        size_t target = position;
        while (target > 0u &&
               module_record(context, list.items[target - 1u])
                       ->async_evaluation_order > order) {
            list.items[target] = list.items[target - 1u];
            target -= 1u;
        }
        list.items[target] = item;
    }
    for (size_t position = 0u;
         result.status == OSEO_STATUS_NORMAL && position < list.count;
         position += 1u) {
        size_t member = list.items[position];
        record = module_record(context, member);
        if (record->status == OSEO_MODULE_EVALUATED) continue;
        if (record->has_top_level_await) {
            result = module_execute_async(context, member);
            continue;
        }
        result = module_call_evaluator(context, member);
        if (result.status == OSEO_STATUS_THROW && !context->has_diagnostic) {
            OseoValue slots[1] = {result.value};
            OseoRootFrame frame = {NULL, slots, 1u};
            oseo_roots_push(context, &frame);
            oseo_context_clear_language_error(context);
            result = module_async_rejected(context, member, frame.slots[0]);
            oseo_roots_pop(context, &frame);
        } else if (result.status == OSEO_STATUS_NORMAL) {
            record = module_record(context, member);
            record->async_evaluation_order = OSEO_MODULE_ASYNC_DONE;
            record->status = OSEO_MODULE_EVALUATED;
            result = module_settle_capability(context, member, true);
        }
    }
    free(list.items);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

OseoResult oseo_internal_module_async_settled(
    OseoContext *context,
    size_t module_index,
    OseoValue argument,
    bool fulfilled
) {
    OseoModuleTable *table = module_table(context);
    if (table == NULL || module_index >= table->count) {
        return failure(
            context,
            "OSEO2001",
            "The module reaction names no module table entry."
        );
    }
    if (fulfilled) return module_async_fulfilled(context, module_index);
    OseoValue slots[1] = {argument};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result =
        module_async_rejected(context, module_index, frame.slots[0]);
    oseo_roots_pop(context, &frame);
    return result;
}

void oseo_internal_module_table_release(OseoContext *context) {
    OseoModuleTable *table = module_table(context);
    if (table == NULL) return;
    for (size_t index = 0u; index < table->count; index += 1u) {
        free(table->records[index].async_parents);
        free(table->records[index].requested);
    }
    free(table->records);
    free(table->stack);
    free(table);
    context->module_table = NULL;
}

/* Reads one non-negative integer table field below `limit`. */
static bool module_table_index(
    const OseoValue *arguments,
    size_t argument_count,
    size_t *position,
    size_t limit,
    size_t *out
) {
    if (*position >= argument_count) return false;
    OseoValue value = arguments[*position];
    *position += 1u;
    if (!is_number(value)) return false;
    double number = number_value(value);
    if (!(number >= 0.0) || number >= (double)limit ||
        floor(number) != number) {
        return false;
    }
    *out = (size_t)number;
    return true;
}

static OseoResult module_table_invalid(OseoContext *context) {
    oseo_internal_module_table_release(context);
    return failure(context, "OSEO2001", "The module table is malformed.");
}

OseoResult oseo_module_graph_evaluate(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (context->module_table != NULL) {
        return failure(
            context,
            "OSEO2001",
            "The module table is already installed."
        );
    }
    size_t position = 0u;
    size_t entry = 0u;
    size_t count = 0u;
    if (!module_table_index(
            arguments, argument_count, &position, SIZE_MAX, &entry) ||
        !module_table_index(
            arguments, argument_count, &position, argument_count, &count) ||
        count == 0u || entry >= count) {
        return failure(context, "OSEO2001", "The module table is malformed.");
    }
    OseoModuleTable *table = calloc(1u, sizeof(*table));
    if (table == NULL) return module_allocation_failure(context);
    context->module_table = table;
    table->records = calloc(count, sizeof(*table->records));
    table->stack = calloc(count, sizeof(*table->stack));
    if (table->records == NULL || table->stack == NULL) {
        oseo_internal_module_table_release(context);
        return module_allocation_failure(context);
    }
    table->count = count;
    for (size_t index = 0u; index < count; index += 1u) {
        OseoModuleRecord *record = &table->records[index];
        record->evaluator = oseo_undefined();
        record->top_level_capability = oseo_undefined();
        record->evaluation_error = oseo_undefined();
        record->status = OSEO_MODULE_LINKED;
        record->dfs_index = OSEO_MODULE_NONE;
        record->dfs_ancestor_index = OSEO_MODULE_NONE;
        record->cycle_root = OSEO_MODULE_NONE;
        record->async_evaluation_order = OSEO_MODULE_ASYNC_UNSET;
    }
    for (size_t index = 0u; index < count; index += 1u) {
        OseoModuleRecord *record = &table->records[index];
        if (position >= argument_count ||
            !is_function(arguments[position])) {
            return module_table_invalid(context);
        }
        record->evaluator = arguments[position];
        position += 1u;
        size_t flag = 0u;
        size_t requested_count = 0u;
        if (!module_table_index(
                arguments, argument_count, &position, 2u, &flag) ||
            !module_table_index(
                arguments,
                argument_count,
                &position,
                argument_count,
                &requested_count
            )) {
            return module_table_invalid(context);
        }
        record->has_top_level_await = flag == 1u;
        if (requested_count > 0u) {
            record->requested =
                calloc(requested_count, sizeof(*record->requested));
            if (record->requested == NULL) {
                oseo_internal_module_table_release(context);
                return module_allocation_failure(context);
            }
        }
        record->requested_count = requested_count;
        for (size_t request = 0u; request < requested_count; request += 1u) {
            if (!module_table_index(
                    arguments,
                    argument_count,
                    &position,
                    count,
                    &record->requested[request]
                )) {
                return module_table_invalid(context);
            }
        }
    }
    if (position != argument_count) return module_table_invalid(context);
    return module_evaluate(context, entry);
}
