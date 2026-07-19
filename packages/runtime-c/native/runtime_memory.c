#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Heap allocation, publication, tracing, collection, and
 * destruction for every runtime heap kind.
 */

static void mark_value(
    OseoValue value,
    OseoHeapObject **worklist
) {
    if (tag_of(value) != OSEO_TAG_HEAP) return;
    OseoHeapObject *object = heap_object(value);
    if (object->marked) return;
    object->marked = true;
    object->trace_next = *worklist;
    *worklist = object;
}

static void trace_object(
    OseoHeapObject *object,
    OseoHeapObject **worklist
) {
    if (object->kind == OSEO_HEAP_ENVIRONMENT) {
        OseoEnvironment *environment = (OseoEnvironment *)object;
        for (size_t index = 0u; index < environment->slot_count; index += 1u) {
            mark_value(environment->slots[index], worklist);
        }
    } else if (object->kind == OSEO_HEAP_CELL) {
        mark_value(((OseoCell *)object)->value, worklist);
    } else if (object->kind == OSEO_HEAP_OBJECT ||
               object->kind == OSEO_HEAP_ARRAY ||
               object->kind == OSEO_HEAP_FUNCTION ||
               object->kind == OSEO_HEAP_PROMISE) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        mark_value(ordinary->prototype, worklist);
        for (size_t index = 0u; index < ordinary->property_count; index += 1u) {
            mark_value(ordinary->properties[index].key, worklist);
            mark_value(ordinary->properties[index].value, worklist);
        }
        if (object->kind == OSEO_HEAP_FUNCTION) {
            OseoFunction *function = (OseoFunction *)object;
            mark_value(function->environment, worklist);
            mark_value(function->lexical_this, worklist);
            mark_value(function->prototype_object, worklist);
        } else if (object->kind == OSEO_HEAP_PROMISE) {
            OseoPromise *promise = (OseoPromise *)object;
            mark_value(promise->result, worklist);
            mark_value(promise->reaction_head, worklist);
            mark_value(promise->reaction_tail, worklist);
            mark_value(promise->unhandled_next, worklist);
        }
    } else if (object->kind == OSEO_HEAP_PROMISE_REACTION) {
        OseoPromiseReaction *reaction = (OseoPromiseReaction *)object;
        mark_value(reaction->next, worklist);
        mark_value(reaction->on_fulfilled, worklist);
        mark_value(reaction->on_rejected, worklist);
        mark_value(reaction->capability, worklist);
        mark_value(reaction->aggregate, worklist);
    } else if (object->kind == OSEO_HEAP_JOB) {
        OseoJob *job = (OseoJob *)object;
        mark_value(job->next, worklist);
        mark_value(job->primary, worklist);
        mark_value(job->secondary, worklist);
        mark_value(job->argument, worklist);
    } else if (object->kind == OSEO_HEAP_PROMISE_AGGREGATE) {
        OseoPromiseAggregate *aggregate = (OseoPromiseAggregate *)object;
        mark_value(aggregate->capability, worklist);
        mark_value(aggregate->values, worklist);
    } else if (object->kind == OSEO_HEAP_TIMER) {
        OseoTimer *timer = (OseoTimer *)object;
        mark_value(timer->next, worklist);
        mark_value(timer->callback, worklist);
        mark_value(timer->arguments, worklist);
    }
}

static void destroy_heap_object(OseoHeapObject *object) {
    if (object->kind == OSEO_HEAP_OBJECT ||
        object->kind == OSEO_HEAP_ARRAY ||
        object->kind == OSEO_HEAP_FUNCTION ||
        object->kind == OSEO_HEAP_PROMISE) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        free(ordinary->properties);
    }
    free(object);
}

void oseo_collect(OseoContext *context) {
    if (context->observe_specialization) context->collections += 1u;
    OseoHeapObject *worklist = NULL;
    for (OseoRootFrame *frame = context->roots;
         frame != NULL;
         frame = frame->previous) {
        for (size_t index = 0u; index < frame->slot_count; index += 1u) {
            mark_value(frame->slots[index], &worklist);
        }
    }
    mark_value(context->microtask_head, &worklist);
    mark_value(context->async_call_capability, &worklist);
    mark_value(context->microtask_tail, &worklist);
    mark_value(context->pending_rejections, &worklist);
    mark_value(context->pending_rejection_tail, &worklist);
    mark_value(context->promise_catch_function, &worklist);
    mark_value(context->promise_finally_function, &worklist);
    mark_value(context->promise_then_function, &worklist);
    for (size_t kind = 0u; kind < OSEO_ERROR_KIND_COUNT; kind += 1u) {
        mark_value(context->error_constructors[kind], &worklist);
        mark_value(context->error_prototypes[kind], &worklist);
    }
    mark_value(context->timer_head, &worklist);
    while (worklist != NULL) {
        OseoHeapObject *object = worklist;
        worklist = object->trace_next;
        object->trace_next = NULL;
        trace_object(object, &worklist);
    }
    OseoHeapObject **link = &context->objects;
    while (*link != NULL) {
        OseoHeapObject *object = *link;
        if (object->marked) {
            object->marked = false;
            link = &object->next;
        } else {
            *link = object->next;
            destroy_heap_object(object);
        }
    }
}

void *oseo_internal_allocate_heap_bytes(OseoContext *context, size_t size) {
    if (context->collect_every_safepoint) oseo_collect(context);
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return NULL;
    }
    return malloc(size);
}

OseoResult oseo_internal_publish_heap(
    OseoContext *context,
    OseoHeapObject *object,
    OseoHeapKind kind
) {
    uintptr_t address = (uintptr_t)object;
    if (address == 0u || address > OSEO_PAYLOAD_MASK) {
        free(object);
        return failure(
            context,
            "OSEO3001",
            "The host cannot represent a heap address in 48 bits."
        );
    }
    object->next = context->objects;
    object->trace_next = NULL;
    object->kind = kind;
    object->marked = false;
    context->objects = object;
    if (context->observe_specialization &&
        kind != OSEO_HEAP_ENVIRONMENT && kind != OSEO_HEAP_CELL &&
        kind != OSEO_HEAP_FUNCTION) {
        context->allocations += 1u;
    }
    return normal(tagged(OSEO_TAG_HEAP, (uint64_t)address));
}
