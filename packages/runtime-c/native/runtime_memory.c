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
    if (object->kind == OSEO_HEAP_BIGINT ||
        object->kind == OSEO_HEAP_STRING ||
        object->kind == OSEO_HEAP_PRIVATE_NAME) {
        return;
    }
    if (object->kind == OSEO_HEAP_ENVIRONMENT) {
        OseoEnvironment *environment = (OseoEnvironment *)object;
        for (size_t index = 0u; index < environment->slot_count; index += 1u) {
            mark_value(environment->slots[index], worklist);
        }
    } else if (object->kind == OSEO_HEAP_CELL) {
        OseoCell *cell = (OseoCell *)object;
        mark_value(cell->value, worklist);
        if (cell->object_environment) {
            mark_value(cell->object, worklist);
            mark_value(cell->key, worklist);
        }
    } else if (object->kind == OSEO_HEAP_SYMBOL) {
        mark_value(((OseoSymbol *)object)->description, worklist);
    } else if (object->kind == OSEO_HEAP_ARGUMENT_LIST) {
        OseoArgumentList *list = (OseoArgumentList *)object;
        for (size_t index = 0u; index < list->length; index += 1u) {
            mark_value(list->values[index], worklist);
        }
    } else if (object->kind == OSEO_HEAP_ENUMERATION) {
        /* The collected key list and the receiver each step consults
         * are reachable only through the record a for-in head roots, so
         * a suspended body keeps both alive. */
        OseoEnumeration *enumeration = (OseoEnumeration *)object;
        mark_value(enumeration->receiver, worklist);
        mark_value(enumeration->keys, worklist);
    } else if (object->kind == OSEO_HEAP_OBJECT ||
               object->kind == OSEO_HEAP_ARRAY ||
               object->kind == OSEO_HEAP_FUNCTION ||
               object->kind == OSEO_HEAP_PROMISE ||
               object->kind == OSEO_HEAP_ARRAY_BUFFER ||
               object->kind == OSEO_HEAP_MAP ||
               object->kind == OSEO_HEAP_MAP_ITERATOR) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        mark_value(ordinary->prototype, worklist);
        if (ordinary->primitive_data) {
            mark_value(ordinary->primitive_value, worklist);
        }
        if (ordinary->array_iterator) {
            mark_value(ordinary->iterator_array, worklist);
        }
        if (ordinary->regexp_string_iterator) {
            mark_value(ordinary->regexp_iterator_subject, worklist);
            mark_value(ordinary->regexp_iterator_pattern, worklist);
        }
        if (ordinary->async_from_sync) {
            mark_value(ordinary->async_sync_iterator, worklist);
        }
        if (ordinary->wrap_for_valid_iterator) {
            mark_value(ordinary->wrapped_iterator, worklist);
            mark_value(ordinary->wrapped_next, worklist);
        }
        if (ordinary->generator != NULL) {
            OseoGenerator *generator = ordinary->generator;
            mark_value(generator->callee, worklist);
            mark_value(generator->receiver, worklist);
            mark_value(generator->sent, worklist);
            mark_value(generator->async_function_capability, worklist);
            /* The pending AsyncGeneratorRequest queue is reachable only
             * through the generator that accepted it. */
            mark_value(generator->request_head, worklist);
            mark_value(generator->request_tail, worklist);
            /* The suspended body's roots, including its saved
             * completion values, live only here. */
            for (size_t index = 0u;
                 index < generator->slot_count;
                 index += 1u) {
                mark_value(generator->slots[index], worklist);
            }
        }
        for (size_t index = 0u; index < ordinary->property_count; index += 1u) {
            mark_value(ordinary->properties[index].key, worklist);
            mark_value(ordinary->properties[index].value, worklist);
            mark_value(ordinary->properties[index].getter, worklist);
            mark_value(ordinary->properties[index].setter, worklist);
        }
        /* [[PrivateElements]] is reachable only through the object that
         * carries it, so nothing else keeps a private name or a private
         * method alive once the instance dies. */
        for (size_t index = 0u;
             index < ordinary->private_element_count;
             index += 1u) {
            mark_value(ordinary->private_elements[index].key, worklist);
            mark_value(ordinary->private_elements[index].value, worklist);
            mark_value(ordinary->private_elements[index].getter, worklist);
            mark_value(ordinary->private_elements[index].setter, worklist);
        }
        if (object->kind == OSEO_HEAP_FUNCTION) {
            OseoFunction *function = (OseoFunction *)object;
            mark_value(function->environment, worklist);
            mark_value(function->lexical_this, worklist);
            mark_value(function->lexical_new_target, worklist);
            mark_value(function->lexical_super, worklist);
            mark_value(function->prototype_object, worklist);
            mark_value(function->home_object, worklist);
            mark_value(function->initial_name, worklist);
            mark_value(function->source_text, worklist);
            mark_value(function->bound_target, worklist);
            mark_value(function->bound_this, worklist);
            mark_value(function->bound_arguments, worklist);
            for (size_t index = 0u;
                 index < function->element_count;
                 index += 1u) {
                mark_value(function->elements[index].key, worklist);
                mark_value(function->elements[index].value, worklist);
                mark_value(function->elements[index].getter, worklist);
                mark_value(function->elements[index].setter, worklist);
            }
        } else if (object->kind == OSEO_HEAP_PROMISE) {
            OseoPromise *promise = (OseoPromise *)object;
            mark_value(promise->result, worklist);
            mark_value(promise->reaction_head, worklist);
            mark_value(promise->reaction_tail, worklist);
            mark_value(promise->unhandled_next, worklist);
        } else if (object->kind == OSEO_HEAP_MAP) {
            OseoMap *map = (OseoMap *)object;
            for (size_t index = 0u; index < map->entry_count; index += 1u) {
                if (!map->entries[index].live) continue;
                mark_value(map->entries[index].key, worklist);
                mark_value(map->entries[index].value, worklist);
            }
        } else if (object->kind == OSEO_HEAP_MAP_ITERATOR) {
            mark_value(((OseoMapIterator *)object)->target, worklist);
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
    } else if (object->kind == OSEO_HEAP_ASYNC_GENERATOR_REQUEST) {
        OseoAsyncGeneratorRequest *request =
            (OseoAsyncGeneratorRequest *)object;
        mark_value(request->next, worklist);
        mark_value(request->capability, worklist);
        mark_value(request->value, worklist);
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
        object->kind == OSEO_HEAP_PROMISE ||
        object->kind == OSEO_HEAP_ARRAY_BUFFER ||
        object->kind == OSEO_HEAP_MAP ||
        object->kind == OSEO_HEAP_MAP_ITERATOR) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        free(ordinary->properties);
        free(ordinary->private_elements);
        free(ordinary->generator);
        if (object->kind == OSEO_HEAP_FUNCTION) {
            free(((OseoFunction *)object)->elements);
        } else if (object->kind == OSEO_HEAP_ARRAY_BUFFER) {
            /* The Data Block is owned by this buffer alone, and the
             * release leaves the record detached, so a block already
             * given up by a transfer is never freed a second time. */
            oseo_internal_array_buffer_release(object);
        } else if (object->kind == OSEO_HEAP_MAP) {
            free(((OseoMap *)object)->entries);
        }
    } else if (object->kind == OSEO_HEAP_ARGUMENT_LIST) {
        free(((OseoArgumentList *)object)->values);
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
    for (size_t index = 0u; index < OSEO_INTRINSIC_COUNT; index += 1u) {
        mark_value(context->intrinsics[index], &worklist);
    }
    for (size_t index = 0u;
         index < OSEO_WELL_KNOWN_SYMBOL_COUNT;
         index += 1u) {
        mark_value(context->well_known_symbols[index], &worklist);
    }
    mark_value(context->global_this, &worklist);
    OseoTemplateCacheEntry *template_cache = context->template_cache;
    for (size_t index = 0u;
         index < context->template_cache_count;
         index += 1u) {
        mark_value(template_cache[index].object, &worklist);
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
