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

/* The outcome of entering one module in InnerModuleEvaluation. */
typedef enum {
    OSEO_MODULE_VISIT_ENTERED,
    OSEO_MODULE_VISIT_SKIPPED,
} OseoModuleVisit;

/*
 * Steps 2 through 6 of InnerModuleEvaluation: a module already evaluated
 * or on the stack is skipped, an errored one throws its recorded error,
 * and a linked one is pushed with a fresh frame.
 */
static OseoResult module_enter(
    OseoContext *context,
    size_t index,
    size_t *dfs_index,
    OseoModuleVisit *visit
) {
    OseoModuleRecord *record = module_record(context, index);
    *visit = OSEO_MODULE_VISIT_SKIPPED;
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
    table->frames[table->frame_count] =
        (OseoModuleFrame){index, 0u, false};
    table->frame_count += 1u;
    *visit = OSEO_MODULE_VISIT_ENTERED;
    return normal(oseo_undefined());
}

/* Step 7.b of InnerModuleEvaluation for one evaluated request. */
static OseoResult module_after_request(
    OseoContext *context,
    size_t index,
    size_t required
) {
    OseoModuleRecord *record = module_record(context, index);
    OseoModuleRecord *required_record = module_record(context, required);
    if (required_record->status == OSEO_MODULE_EVALUATING) {
        if (required_record->dfs_ancestor_index <
            record->dfs_ancestor_index) {
            record->dfs_ancestor_index = required_record->dfs_ancestor_index;
        }
    } else {
        required = module_cycle_root(context, required);
        required_record = module_record(context, required);
        if (required_record->errored) {
            return module_throw(context, required_record->evaluation_error);
        }
    }
    if (module_async_pending(required_record)) {
        record->pending_async_dependencies += 1u;
        return module_add_async_parent(context, required, index);
    }
    return normal(oseo_undefined());
}

/* Steps 8 through 12 of InnerModuleEvaluation, after every request. */
static OseoResult module_after_requests(OseoContext *context, size_t index) {
    OseoModuleTable *table = module_table(context);
    OseoModuleRecord *record = module_record(context, index);
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

/*
 * InnerModuleEvaluation over an explicit frame stack, so graph depth never
 * consumes native stack. Each frame names a module and its next request; a
 * frame whose request entered a module resumes at step 7.b once that
 * module's frame is gone. A THROW without a diagnostic is the abrupt
 * completion Evaluate records; one with a diagnostic ends the program.
 */
static OseoResult module_inner_evaluation(
    OseoContext *context,
    size_t index,
    size_t *dfs_index
) {
    OseoModuleTable *table = module_table(context);
    table->frame_count = 0u;
    OseoModuleVisit visit;
    OseoResult result = module_enter(context, index, dfs_index, &visit);
    while (result.status == OSEO_STATUS_NORMAL && table->frame_count > 0u) {
        OseoModuleFrame *frame = &table->frames[table->frame_count - 1u];
        size_t module = frame->module;
        OseoModuleRecord *record = module_record(context, module);
        if (frame->position == record->requested_count) {
            table->frame_count -= 1u;
            result = module_after_requests(context, module);
            continue;
        }
        size_t required = record->requested[frame->position];
        if (!frame->entered_request) {
            result = module_enter(context, required, dfs_index, &visit);
            if (result.status != OSEO_STATUS_NORMAL) break;
            if (visit == OSEO_MODULE_VISIT_ENTERED) {
                /* Resume this frame at step 7.b after the pushed one. */
                frame->entered_request = true;
                continue;
            }
        }
        frame->entered_request = false;
        frame->position += 1u;
        result = module_after_request(context, module, required);
    }
    table->frame_count = 0u;
    return result;
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
    OseoModuleTable *table = module_table(context);
    if (table->evaluating) {
        /*
         * Only a job drained inside a running evaluator, as an
         * asynchronous iteration step in synchronous code does, can
         * reach Evaluate while another Evaluate is on the stack.
         */
        return failure(
            context,
            "OSEO2001",
            "A module evaluation started inside another module evaluation."
        );
    }
    OseoResult result = oseo_internal_promise_create(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    module_record(context, index)->top_level_capability = result.value;
    table->stack_count = 0u;
    size_t dfs_index = 0u;
    table->evaluating = true;
    result = module_inner_evaluation(context, index, &dfs_index);
    table->evaluating = false;
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
               module_record(context, index)->status ==
                   OSEO_MODULE_EVALUATED) {
        /*
         * A root that finished synchronously, or whose asynchronous
         * evaluation completed before this capability existed, settles
         * the new capability now; nothing else would.
         */
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

/*
 * GatherAvailableAncestors over a worklist instead of recursion. The
 * edition's recursion only decides which ancestors join the list, and
 * the caller sorts the list by [[AsyncEvaluationOrder]], so visiting the
 * same modules in worklist order yields the same sorted list. Returns
 * false when a list cannot grow.
 */
static bool module_gather_available_ancestors(
    OseoContext *context,
    size_t index,
    OseoModuleList *list
) {
    OseoModuleList work = {NULL, 0u, 0u};
    bool grown = module_list_append(&work, index);
    while (grown && work.count > 0u) {
        work.count -= 1u;
        size_t module = work.items[work.count];
        for (size_t position = 0u;
             grown &&
             position < module_record(context, module)->async_parent_count;
             position += 1u) {
            size_t parent =
                module_record(context, module)->async_parents[position];
            size_t root = module_cycle_root(context, parent);
            if (module_record(context, parent)->gathered ||
                module_record(context, root)->errored) {
                continue;
            }
            OseoModuleRecord *record = module_record(context, parent);
            record->pending_async_dependencies -= 1u;
            if (record->pending_async_dependencies == 0u) {
                grown = module_list_append(list, parent);
                if (grown) record->gathered = true;
                if (grown && !record->has_top_level_await) {
                    grown = module_list_append(&work, parent);
                }
            }
        }
    }
    free(work.items);
    for (size_t position = 0u; position < list->count; position += 1u) {
        module_record(context, list->items[position])->gathered = false;
    }
    return grown;
}

/*
 * AsyncModuleExecutionRejected with an explicit stack of async-parent
 * cursors. Each module records the error and rejects its capability when
 * first reached, then its parents follow in list order before the next
 * sibling, which is the edition's depth-first order of capability
 * rejections. The error is rooted by the caller and then by each record.
 */
static OseoResult module_async_rejected(
    OseoContext *context,
    size_t index,
    OseoValue error
) {
    OseoModuleList modules = {NULL, 0u, 0u};
    OseoModuleList positions = {NULL, 0u, 0u};
    OseoResult result = normal(oseo_undefined());
    size_t next = index;
    bool reached = true;
    while (result.status == OSEO_STATUS_NORMAL) {
        if (reached) {
            OseoModuleRecord *record = module_record(context, next);
            if (record->status != OSEO_MODULE_EVALUATED) {
                record->errored = true;
                record->evaluation_error = error;
                record->status = OSEO_MODULE_EVALUATED;
                record->async_evaluation_order = OSEO_MODULE_ASYNC_DONE;
                result = module_settle_capability(context, next, false);
                if (result.status != OSEO_STATUS_NORMAL) break;
                if (!module_list_append(&modules, next) ||
                    !module_list_append(&positions, 0u)) {
                    result = module_allocation_failure(context);
                    break;
                }
            }
            reached = false;
        }
        if (modules.count == 0u) break;
        size_t top = modules.items[modules.count - 1u];
        size_t *position = &positions.items[positions.count - 1u];
        OseoModuleRecord *record = module_record(context, top);
        if (*position == record->async_parent_count) {
            modules.count -= 1u;
            positions.count -= 1u;
            continue;
        }
        next = record->async_parents[*position];
        *position += 1u;
        reached = true;
    }
    free(modules.items);
    free(positions.items);
    return result;
}

/* One gathered module and its [[AsyncEvaluationOrder]] for sorting. */
typedef struct {
    uint64_t order;
    size_t index;
} OseoModuleOrder;

static int module_order_compare(const void *left, const void *right) {
    uint64_t left_order = ((const OseoModuleOrder *)left)->order;
    uint64_t right_order = ((const OseoModuleOrder *)right)->order;
    return left_order < right_order ? -1 : left_order > right_order;
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
    OseoModuleOrder *sorted = NULL;
    if (list.count > 0u) {
        sorted = malloc(list.count * sizeof(*sorted));
        if (sorted == NULL) {
            free(list.items);
            return module_allocation_failure(context);
        }
    }
    for (size_t position = 0u; position < list.count; position += 1u) {
        size_t item = list.items[position];
        sorted[position] = (OseoModuleOrder){
            module_record(context, item)->async_evaluation_order,
            item,
        };
    }
    free(list.items);
    if (list.count > 1u) {
        qsort(sorted, list.count, sizeof(*sorted), module_order_compare);
    }
    for (size_t position = 0u;
         result.status == OSEO_STATUS_NORMAL && position < list.count;
         position += 1u) {
        size_t member = sorted[position].index;
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
    free(sorted);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

OseoResult oseo_module_evaluate(OseoContext *context, size_t module_index) {
    OseoModuleTable *table = module_table(context);
    if (table == NULL || module_index >= table->count) {
        return failure(
            context,
            "OSEO2001",
            "The module evaluation names no module table entry."
        );
    }
    return module_evaluate(context, module_index);
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
    free(table->frames);
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
        count == 0u || entry > count) {
        return failure(context, "OSEO2001", "The module table is malformed.");
    }
    OseoModuleTable *table = calloc(1u, sizeof(*table));
    if (table == NULL) return module_allocation_failure(context);
    context->module_table = table;
    table->records = calloc(count, sizeof(*table->records));
    table->stack = calloc(count, sizeof(*table->stack));
    table->frames = calloc(count, sizeof(*table->frames));
    if (table->records == NULL || table->stack == NULL ||
        table->frames == NULL) {
        oseo_internal_module_table_release(context);
        return module_allocation_failure(context);
    }
    table->count = count;
    for (size_t index = 0u; index < count; index += 1u) {
        OseoModuleRecord *record = &table->records[index];
        record->evaluator = oseo_undefined();
        record->namespace_object = oseo_undefined();
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
            position >= argument_count ||
            (tag_of(arguments[position]) != OSEO_TAG_UNDEFINED &&
             !is_object(arguments[position]))) {
            return module_table_invalid(context);
        }
        record->namespace_object = arguments[position];
        position += 1u;
        if (!module_table_index(
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
    if (entry == count) return normal(oseo_undefined());
    return module_evaluate(context, entry);
}

/* The module table entry an `import()` names, or a failure. */
static OseoResult module_import_target(
    OseoContext *context,
    size_t module_index,
    OseoModuleRecord **record
) {
    OseoModuleTable *table = module_table(context);
    if (table == NULL || module_index >= table->count ||
        !is_object(table->records[module_index].namespace_object)) {
        return failure(
            context,
            "OSEO2001",
            "The import() call names no module table entry."
        );
    }
    *record = &table->records[module_index];
    return normal(oseo_undefined());
}

/*
 * EvaluateImportCall with the build-time request. The specifier literal
 * has no conversion hooks, and the host completes HostLoadImportedModule
 * synchronously from the table, so ContinueDynamicImport runs at once:
 * LoadRequestedModules is already fulfilled, and its reaction job is
 * queued before the call returns the new promise.
 */
OseoResult oseo_module_import(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoModuleTable *table = module_table(context);
    size_t position = 0u;
    size_t index = 0u;
    if (table == NULL || argument_count != 1u ||
        !module_table_index(
            arguments, argument_count, &position, table->count, &index)) {
        return failure(
            context,
            "OSEO2001",
            "The import() call names no module table entry."
        );
    }
    OseoModuleRecord *record = NULL;
    OseoResult result = module_import_target(context, index, &record);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoRootFrame frame = {NULL, NULL, 0u};
    result = oseo_roots_allocate(context, &frame, 1u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_promise_create(context);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_promise_then_import(
            context,
            oseo_undefined(),
            frame.slots[0],
            module_record(context, index)->evaluator,
            index,
            OSEO_REACTION_IMPORT_EVALUATE
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) result.value = frame.slots[0];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * The two reaction steps of ContinueDynamicImport. Link has no work,
 * because the build linked and instantiated every module. Evaluate's
 * promise then settles the call's promise: fulfillment resolves it with
 * the namespace through ordinary promise resolution, so an exported
 * `then` is honored, and rejection passes the evaluation error on.
 */
OseoResult oseo_internal_module_import_step(
    OseoContext *context,
    OseoReactionKind kind,
    size_t module_index,
    OseoValue capability,
    OseoValue argument,
    bool fulfilled
) {
    OseoModuleRecord *record = NULL;
    OseoResult result = module_import_target(context, module_index, &record);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    OseoValue slots[2] = {capability, argument};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    if (kind == OSEO_REACTION_IMPORT_EVALUATE) {
        result = module_evaluate(context, module_index);
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_promise_then_import(
                context,
                result.value,
                frame.slots[0],
                module_record(context, module_index)->evaluator,
                module_index,
                OSEO_REACTION_IMPORT_SETTLE
            );
        }
    } else if (fulfilled) {
        result = oseo_promise_resolve_into(
            context,
            frame.slots[0],
            module_record(context, module_index)->namespace_object
        );
    } else {
        result = oseo_promise_reject_into(
            context,
            frame.slots[0],
            frame.slots[1]
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}
