#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/*
 * Heap allocation, publication, tracing, collection, and
 * destruction for every runtime heap kind.
 */

static bool mark_value(
    OseoValue value,
    OseoHeapObject **worklist
) {
    if (tag_of(value) != OSEO_TAG_HEAP) return false;
    OseoHeapObject *object = heap_object(value);
    if (object->marked) return false;
    object->marked = true;
    object->trace_next = *worklist;
    *worklist = object;
    return true;
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
    if (object->kind == OSEO_HEAP_REGEXP_MATCHER) {
        OseoRegExpMatcher *matcher = (OseoRegExpMatcher *)object;
        mark_value(matcher->source, worklist);
        mark_value(matcher->flags, worklist);
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
    } else if (object->kind == OSEO_HEAP_EPHEMERON_TABLE) {
        OseoEphemeronTable *table = (OseoEphemeronTable *)object;
        mark_value(table->head, worklist);
        mark_value(table->tail, worklist);
    } else if (object->kind == OSEO_HEAP_EPHEMERON_ENTRY) {
        /* `key` and `value` are processed by the fixed-point phase. */
        mark_value(((OseoEphemeronEntry *)object)->next, worklist);
    } else if (object->kind == OSEO_HEAP_WEAK_REFERENCE) {
        /* `target` is cleared after the ephemeron fixed point. */
        return;
    } else if (object->kind == OSEO_HEAP_FINALIZATION_REGISTRY) {
        OseoFinalizationRegistry *registry =
            (OseoFinalizationRegistry *)object;
        mark_value(registry->callback, worklist);
        mark_value(registry->cell_head, worklist);
        mark_value(registry->cell_tail, worklist);
    } else if (object->kind == OSEO_HEAP_FINALIZATION_CELL) {
        OseoFinalizationCell *cell = (OseoFinalizationCell *)object;
        mark_value(cell->next, worklist);
        mark_value(cell->queue_next, worklist);
        mark_value(cell->registry, worklist);
        if (!cell->processed) mark_value(cell->holdings, worklist);
        /* `target` and `unregister_token` are weak and never enter
         * ordinary tracing. */
    } else if (object->kind == OSEO_HEAP_ENUMERATION) {
        /* The receiver, candidates, and visited keys are reachable only
         * through the record a for-in head roots, so a suspended body keeps
         * all three alive. */
        OseoEnumeration *enumeration = (OseoEnumeration *)object;
        mark_value(enumeration->receiver, worklist);
        mark_value(enumeration->candidates, worklist);
        mark_value(enumeration->visited, worklist);
    } else if (object->kind == OSEO_HEAP_OBJECT ||
               object->kind == OSEO_HEAP_ARRAY ||
               object->kind == OSEO_HEAP_FUNCTION ||
               object->kind == OSEO_HEAP_PROMISE ||
               object->kind == OSEO_HEAP_ARRAY_BUFFER ||
               object->kind == OSEO_HEAP_MAP ||
               object->kind == OSEO_HEAP_MAP_ITERATOR ||
               object->kind == OSEO_HEAP_DATA_VIEW ||
               object->kind == OSEO_HEAP_DATE ||
               object->kind == OSEO_HEAP_REGEXP ||
               object->kind == OSEO_HEAP_ITERATOR_HELPER ||
               object->kind == OSEO_HEAP_PROXY ||
               object->kind == OSEO_HEAP_SET ||
               object->kind == OSEO_HEAP_SET_ITERATOR ||
               object->kind == OSEO_HEAP_TYPED_ARRAY ||
               object->kind == OSEO_HEAP_WEAK_MAP ||
               object->kind == OSEO_HEAP_WEAK_SET ||
               object->kind == OSEO_HEAP_WEAK_REF ||
               object->kind == OSEO_HEAP_FINALIZATION_REGISTRY_OBJECT) {
        OseoOrdinaryObject *ordinary = (OseoOrdinaryObject *)object;
        mark_value(ordinary->prototype, worklist);
        if (ordinary->primitive_data) {
            mark_value(ordinary->primitive_value, worklist);
        }
        if (ordinary->iterator_kind != OSEO_ITERATOR_NONE) {
            mark_value(ordinary->iterator_target, worklist);
        }
        if (ordinary->regexp_string_iterator) {
            mark_value(ordinary->regexp_iterator_subject, worklist);
            mark_value(ordinary->regexp_iterator_regexp, worklist);
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
        } else if (object->kind == OSEO_HEAP_DATA_VIEW) {
            /* A view holds no Data Block of its own; tracing its buffer
             * is what keeps that buffer's block alive. */
            mark_value(((OseoDataView *)object)->buffer, worklist);
        } else if (object->kind == OSEO_HEAP_TYPED_ARRAY) {
            mark_value(
                ((OseoTypedArray *)object)->viewed_buffer,
                worklist
            );
        } else if (object->kind == OSEO_HEAP_REGEXP) {
            mark_value(((OseoRegExp *)object)->matcher, worklist);
        } else if (object->kind == OSEO_HEAP_ITERATOR_HELPER) {
            /* A helper's underlying iterator record, callback, and
             * in-flight inner iterator are reachable only through the
             * helper, so a collection at any safepoint inside one
             * resumption keeps every one of them alive. */
            OseoIteratorHelper *helper = (OseoIteratorHelper *)object;
            mark_value(helper->underlying_iterator, worklist);
            mark_value(helper->underlying_next, worklist);
            mark_value(helper->callback, worklist);
            mark_value(helper->inner_iterator, worklist);
            mark_value(helper->inner_next, worklist);
        } else if (object->kind == OSEO_HEAP_PROXY) {
            OseoProxy *proxy = (OseoProxy *)object;
            mark_value(proxy->target, worklist);
            mark_value(proxy->handler, worklist);
        } else if (object->kind == OSEO_HEAP_SET) {
            OseoSet *set = (OseoSet *)object;
            for (size_t index = 0u;
                 index < set->element_count;
                 index += 1u) {
                if (set->elements[index].present) {
                    mark_value(set->elements[index].value, worklist);
                }
            }
        } else if (object->kind == OSEO_HEAP_SET_ITERATOR) {
            mark_value(((OseoSetIterator *)object)->set, worklist);
        } else if (object->kind == OSEO_HEAP_WEAK_MAP ||
                   object->kind == OSEO_HEAP_WEAK_SET) {
            /* The table is strong; its entries stay ephemerons. */
            mark_value(((OseoWeakCollection *)object)->table, worklist);
        } else if (object->kind == OSEO_HEAP_WEAK_REF) {
            mark_value(((OseoWeakRef *)object)->reference, worklist);
        } else if (object->kind == OSEO_HEAP_FINALIZATION_REGISTRY_OBJECT) {
            mark_value(
                ((OseoFinalizationRegistryObject *)object)->registry,
                worklist
            );
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
        mark_value(timer->waiter, worklist);
    } else if (object->kind == OSEO_HEAP_ATOMICS_WAITER) {
        OseoAtomicsWaiter *waiter = (OseoAtomicsWaiter *)object;
        mark_value(waiter->next, worklist);
        mark_value(waiter->buffer, worklist);
        mark_value(waiter->promise, worklist);
        mark_value(waiter->timer, worklist);
    }
}

static bool value_is_marked(OseoValue value) {
    return tag_of(value) == OSEO_TAG_HEAP && heap_object(value)->marked;
}

static OseoValue heap_value(OseoHeapObject *object) {
    return tagged(OSEO_TAG_HEAP, (uint64_t)(uintptr_t)object);
}

/*
 * The collector never moves an object, so a key's heap address is a stable
 * identity. Multiplicative hashing spreads the aligned low bits.
 */
static size_t ephemeron_index_start(OseoValue key, size_t capacity) {
    uint64_t hash = ((key & OSEO_PAYLOAD_MASK) >> 3u) *
        UINT64_C(0x9e3779b97f4a7c15);
    return (size_t)(hash >> 20u) & (capacity - 1u);
}

/* Returns the index slot holding `key`'s entry, or NULL. */
static OseoValue *ephemeron_index_find(
    OseoEphemeronTable *table,
    OseoValue key
) {
    if (table->index_capacity == 0u) return NULL;
    size_t mask = table->index_capacity - 1u;
    size_t slot = ephemeron_index_start(key, table->index_capacity);
    for (size_t probe = 0u; probe < table->index_capacity; probe += 1u) {
        OseoValue *candidate = &table->index[slot];
        if (*candidate == 0u) return NULL;
        if (*candidate != OSEO_EPHEMERON_INDEX_TOMBSTONE &&
            ephemeron_entry_object(*candidate)->key == key) {
            return candidate;
        }
        slot = (slot + 1u) & mask;
    }
    return NULL;
}

/*
 * Inserts into a reserved index; the key must not be present. Returns
 * whether the insertion consumed an empty slot rather than reusing a
 * tombstone, which is the only case that grows the used-slot count.
 */
static bool ephemeron_index_insert(
    OseoValue *index,
    size_t capacity,
    OseoValue key,
    OseoValue entry
) {
    size_t slot = ephemeron_index_start(key, capacity);
    while (index[slot] != 0u &&
           index[slot] != OSEO_EPHEMERON_INDEX_TOMBSTONE) {
        slot = (slot + 1u) & (capacity - 1u);
    }
    bool empty = index[slot] == 0u;
    index[slot] = entry;
    return empty;
}

/* Activate entries that waited for this key to finish marking. */
static void activate_ephemeron_values(
    OseoHeapObject *key,
    OseoHeapObject **worklist
) {
    OseoHeapObject *pending = key->ephemeron_pending;
    key->ephemeron_pending = NULL;
    while (pending != NULL) {
        OseoEphemeronEntry *entry = (OseoEphemeronEntry *)pending;
        pending = entry->header.trace_next;
        entry->header.trace_next = NULL;
        mark_value(entry->value, worklist);
    }
}

/*
 * Drain strong edges and activate ephemeron values as their keys become
 * reachable. An entry discovered before its key parks on the key object's
 * collector-only pending list. Processing that key activates every waiting
 * value, so the worklist computes the fixed point without repeated scans.
 */
static void trace_ephemeron_fixed_point(OseoHeapObject **worklist) {
    while (*worklist != NULL) {
        OseoHeapObject *object = *worklist;
        *worklist = object->trace_next;
        object->trace_next = NULL;
        trace_object(object, worklist);
        if (object->kind == OSEO_HEAP_EPHEMERON_ENTRY) {
            OseoEphemeronEntry *entry = (OseoEphemeronEntry *)object;
            OseoHeapObject *key = heap_object(entry->key);
            if (key->marked) {
                mark_value(entry->value, worklist);
            } else {
                entry->header.trace_next = key->ephemeron_pending;
                key->ephemeron_pending = &entry->header;
            }
        }
        activate_ephemeron_values(object, worklist);
    }
}

/*
 * An entry is reachable only through its table's chain, so walking every
 * marked table visits every marked entry exactly once. A dead-key entry is
 * unlinked and unmarked here, which lets the same sweep reclaim it: weak
 * tables must not retain per-entry records after their keys die.
 */
static void clear_dead_weak_edges(OseoContext *context) {
    for (OseoHeapObject *object = context->objects;
         object != NULL;
         object = object->next) {
        if (!object->marked) continue;
        if (object->kind == OSEO_HEAP_WEAK_REFERENCE) {
            OseoWeakReference *reference = (OseoWeakReference *)object;
            if (tag_of(reference->target) == OSEO_TAG_HEAP &&
                !value_is_marked(reference->target)) {
                reference->target = oseo_undefined();
            }
        } else if (object->kind == OSEO_HEAP_EPHEMERON_TABLE) {
            OseoEphemeronTable *table = (OseoEphemeronTable *)object;
            OseoValue *link = &table->head;
            OseoHeapObject *last = NULL;
            while (tag_of(*link) == OSEO_TAG_HEAP) {
                OseoEphemeronEntry *entry = ephemeron_entry_object(*link);
                if (value_is_marked(entry->key)) {
                    last = &entry->header;
                    link = &entry->next;
                    continue;
                }
                OseoValue *slot = ephemeron_index_find(table, entry->key);
                if (slot != NULL) *slot = OSEO_EPHEMERON_INDEX_TOMBSTONE;
                *link = entry->next;
                if (tag_of(entry->next) == OSEO_TAG_HEAP) {
                    ephemeron_entry_object(entry->next)->previous =
                        last == NULL ? oseo_undefined() : heap_value(last);
                }
                entry->next = oseo_undefined();
                entry->previous = oseo_undefined();
                entry->key = oseo_undefined();
                entry->value = oseo_undefined();
                entry->header.marked = false;
                if (table->live_count > 0u) table->live_count -= 1u;
            }
            table->tail =
                last == NULL ? oseo_undefined() : heap_value(last);
        } else if (object->kind == OSEO_HEAP_FINALIZATION_CELL) {
            OseoFinalizationCell *cell = (OseoFinalizationCell *)object;
            if (tag_of(cell->unregister_token) == OSEO_TAG_HEAP &&
                !value_is_marked(cell->unregister_token)) {
                cell->unregister_token = oseo_undefined();
            }
        }
    }
}

/*
 * A consumed cleanup cell has no further observable state, so unlinking
 * it from its registry's chain and dropping its mark lets the sweep free
 * it. Without this, a long-lived registry would retain one dead record
 * per registration forever.
 */
static void compact_finalization_registries(OseoContext *context) {
    for (OseoHeapObject *object = context->objects;
         object != NULL;
         object = object->next) {
        if (object->kind != OSEO_HEAP_FINALIZATION_REGISTRY ||
            !object->marked) {
            continue;
        }
        OseoFinalizationRegistry *registry =
            (OseoFinalizationRegistry *)object;
        OseoValue *link = &registry->cell_head;
        OseoHeapObject *last = NULL;
        while (tag_of(*link) == OSEO_TAG_HEAP) {
            OseoFinalizationCell *cell = finalization_cell_object(*link);
            if (cell->processed) {
                *link = cell->next;
                cell->next = oseo_undefined();
                /* An unregistered record still on the cleanup FIFO stays
                 * alive until the dequeue skips it. */
                if (!cell->queued) cell->header.marked = false;
            } else {
                last = &cell->header;
                link = &cell->next;
            }
        }
        registry->cell_tail =
            last == NULL ? oseo_undefined() : heap_value(last);
    }
}

/*
 * Scheduling is allocation-free and deterministic: each collection sorts
 * its newly eligible cells by registration order and appends that batch to
 * the FIFO, so the order is by registration within a batch, not globally.
 * The collector only publishes cleanup records; a later checkpoint decides
 * when to invoke the JavaScript callback that will consume them. One pass
 * gathers the newly eligible cells onto an ordinal-sorted list threaded
 * through their free `trace_next` links, so the heap is scanned once
 * rather than once per queued cell.
 */
static void schedule_finalization(OseoContext *context) {
    OseoHeapObject *candidates = NULL;
    for (OseoHeapObject *object = context->objects;
         object != NULL;
         object = object->next) {
        if (object->kind != OSEO_HEAP_FINALIZATION_CELL ||
            !object->marked) {
            continue;
        }
        OseoFinalizationCell *cell = (OseoFinalizationCell *)object;
        if (cell->processed || cell->queued ||
            tag_of(cell->target) != OSEO_TAG_HEAP ||
            value_is_marked(cell->target)) {
            continue;
        }
        OseoHeapObject **link = &candidates;
        while (*link != NULL &&
               ((OseoFinalizationCell *)*link)->registration_order <
                   cell->registration_order) {
            link = &(*link)->trace_next;
        }
        cell->header.trace_next = *link;
        *link = &cell->header;
    }
    while (candidates != NULL) {
        OseoFinalizationCell *cell = (OseoFinalizationCell *)candidates;
        candidates = cell->header.trace_next;
        cell->header.trace_next = NULL;
        OseoValue cell_value = heap_value(&cell->header);
        cell->target = oseo_undefined();
        cell->queue_next = oseo_undefined();
        cell->queued = true;
        if (tag_of(context->finalization_tail) == OSEO_TAG_HEAP) {
            finalization_cell_object(context->finalization_tail)->queue_next =
                cell_value;
        } else {
            context->finalization_head = cell_value;
        }
        context->finalization_tail = cell_value;
        context->finalization_pending_count += 1u;
    }
}

static void destroy_heap_object(OseoHeapObject *object) {
    if (object->kind == OSEO_HEAP_OBJECT ||
        object->kind == OSEO_HEAP_ARRAY ||
        object->kind == OSEO_HEAP_FUNCTION ||
        object->kind == OSEO_HEAP_PROMISE ||
        object->kind == OSEO_HEAP_ARRAY_BUFFER ||
        object->kind == OSEO_HEAP_MAP ||
        object->kind == OSEO_HEAP_MAP_ITERATOR ||
        object->kind == OSEO_HEAP_DATA_VIEW ||
        object->kind == OSEO_HEAP_DATE ||
        object->kind == OSEO_HEAP_REGEXP ||
        object->kind == OSEO_HEAP_ITERATOR_HELPER ||
        object->kind == OSEO_HEAP_PROXY ||
        object->kind == OSEO_HEAP_SET ||
        object->kind == OSEO_HEAP_SET_ITERATOR ||
        object->kind == OSEO_HEAP_TYPED_ARRAY ||
        object->kind == OSEO_HEAP_WEAK_MAP ||
        object->kind == OSEO_HEAP_WEAK_SET ||
        object->kind == OSEO_HEAP_WEAK_REF ||
        object->kind == OSEO_HEAP_FINALIZATION_REGISTRY_OBJECT) {
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
        } else if (object->kind == OSEO_HEAP_SET) {
            free(((OseoSet *)object)->elements);
        }
    } else if (object->kind == OSEO_HEAP_ARGUMENT_LIST) {
        free(((OseoArgumentList *)object)->values);
    } else if (object->kind == OSEO_HEAP_EPHEMERON_TABLE) {
        free(((OseoEphemeronTable *)object)->index);
    } else if (object->kind == OSEO_HEAP_REGEXP_MATCHER) {
        /* A dynamic pattern's compiled program is unmanaged memory this
         * artifact alone owns, so its lifetime ends with the artifact.
         * An ahead-of-time literal's program is static generated data
         * this artifact only borrows. */
        OseoRegExpMatcher *matcher = (OseoRegExpMatcher *)object;
        if (matcher->owns_program) {
            oseo_internal_regexp_program_release(matcher->program);
        }
    }
    free(object);
}

/*
 * Drops every mark this heap carries. A mark belongs to one collection of
 * one context, but a context that holds a value another context owns in
 * its roots marks that value while collecting, and only the owning
 * context's sweep clears a mark on its own heap. Such a mark therefore
 * survives until this heap sweeps again, which the final sweep of a
 * destroyed context never does: the object would stay linked with nothing
 * left to free it. Clearing the marks first makes that sweep unconditional.
 */
void oseo_internal_clear_heap_marks(OseoContext *context) {
    for (OseoHeapObject *object = context->objects;
         object != NULL;
         object = object->next) {
        object->marked = false;
    }
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
    for (size_t index = 0u;
         index < context->registered_symbol_capacity;
         index += 1u) {
        mark_value(context->registered_symbols[index], &worklist);
    }
    OseoTemplateCacheEntry *template_cache = context->template_cache;
    for (size_t index = 0u;
         index < context->template_cache_count;
         index += 1u) {
        mark_value(template_cache[index].object, &worklist);
    }
    OseoRegExpLiteralCacheEntry *regexp_cache = context->regexp_literal_cache;
    for (size_t index = 0u;
         index < context->regexp_literal_cache_capacity;
         index += 1u) {
        if (regexp_cache[index].literal == NULL) continue;
        mark_value(regexp_cache[index].matcher, &worklist);
    }
    mark_value(context->timer_head, &worklist);
    mark_value(context->atomics_waiter_head, &worklist);
    mark_value(context->atomics_waiter_tail, &worklist);
    mark_value(context->finalization_head, &worklist);
    mark_value(context->finalization_tail, &worklist);
    OseoValue *kept_objects = context->kept_objects;
    for (size_t index = 0u;
         index < context->kept_object_capacity;
         index += 1u) {
        mark_value(kept_objects[index], &worklist);
    }
    trace_ephemeron_fixed_point(&worklist);
    clear_dead_weak_edges(context);
    schedule_finalization(context);
    compact_finalization_registries(context);
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

void *oseo_internal_allocate_work_bytes(OseoContext *context, size_t size) {
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return NULL;
    }
    return malloc(size);
}

void *oseo_internal_reallocate_work_bytes(
    OseoContext *context,
    void *block,
    size_t size
) {
    context->allocation_attempts += 1u;
    if (context->fail_allocation_at != 0u &&
        context->allocation_attempts == context->fail_allocation_at) {
        return NULL;
    }
    return realloc(block, size);
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
    object->ephemeron_pending = NULL;
    object->kind = kind;
    object->marked = false;
    object->retained = false;
    context->objects = object;
    if (context->observe_specialization &&
        kind != OSEO_HEAP_ENVIRONMENT && kind != OSEO_HEAP_CELL &&
        kind != OSEO_HEAP_FUNCTION) {
        context->allocations += 1u;
    }
    return normal(tagged(OSEO_TAG_HEAP, (uint64_t)address));
}

static bool has_heap_kind(OseoValue value, OseoHeapKind kind) {
    return tag_of(value) == OSEO_TAG_HEAP && heap_object(value)->kind == kind;
}

OseoResult oseo_internal_ephemeron_table_create(OseoContext *context) {
    OseoEphemeronTable *table =
        oseo_internal_allocate_heap_bytes(context, sizeof(*table));
    if (table == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Ephemeron table allocation failed."
        );
    }
    table->head = oseo_undefined();
    table->tail = oseo_undefined();
    table->live_count = 0u;
    table->index = NULL;
    table->index_capacity = 0u;
    table->index_used = 0u;
    return oseo_internal_publish_heap(
        context,
        &table->header,
        OSEO_HEAP_EPHEMERON_TABLE
    );
}

/*
 * Keeps one free index slot for an insertion at a load factor, counting
 * tombstones, of at most three quarters. The unmanaged allocation never
 * collects, and a later collection only turns slots into tombstones, so
 * the reservation survives the entry allocation that follows it.
 */
static OseoResult ephemeron_index_reserve(
    OseoContext *context,
    OseoValue table_value
) {
    OseoEphemeronTable *table = ephemeron_table_object(table_value);
    if (table->index_capacity != 0u &&
        (table->index_used + 1u) <= table->index_capacity / 4u * 3u) {
        return normal(table_value);
    }
    /* A rebuilt index is at most half full, so at least a quarter of its
     * slots accept insertions before the next rebuild. */
    size_t capacity = 8u;
    while (capacity / 2u < table->live_count + 1u) {
        if (capacity > SIZE_MAX / 2u / sizeof(OseoValue)) {
            return failure(
                context,
                "OSEO2001",
                "Ephemeron index is too large."
            );
        }
        capacity *= 2u;
    }
    OseoValue *index = oseo_internal_allocate_work_bytes(
        context,
        capacity * sizeof(*index)
    );
    if (index == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Ephemeron index allocation failed."
        );
    }
    for (size_t slot = 0u; slot < capacity; slot += 1u) index[slot] = 0u;
    size_t used = 0u;
    for (OseoValue cursor = table->head;
         tag_of(cursor) == OSEO_TAG_HEAP;
         cursor = ephemeron_entry_object(cursor)->next) {
        (void)ephemeron_index_insert(
            index,
            capacity,
            ephemeron_entry_object(cursor)->key,
            cursor
        );
        used += 1u;
    }
    free(table->index);
    table->index = index;
    table->index_capacity = capacity;
    table->index_used = used;
    return normal(table_value);
}

OseoResult oseo_internal_ephemeron_set(
    OseoContext *context,
    OseoValue table_value,
    OseoValue key,
    OseoValue value
) {
    if (!has_heap_kind(table_value, OSEO_HEAP_EPHEMERON_TABLE)) {
        return failure(context, "OSEO2001", "Value is not an ephemeron table.");
    }
    if (tag_of(key) != OSEO_TAG_HEAP) {
        return failure(
            context,
            "OSEO2001",
            "Ephemeron key is not a heap value."
        );
    }
    OseoValue *existing =
        ephemeron_index_find(ephemeron_table_object(table_value), key);
    if (existing != NULL) {
        ephemeron_entry_object(*existing)->value = value;
        return normal(table_value);
    }

    OseoValue roots[] = {table_value, key, value};
    OseoRootFrame frame = {NULL, roots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult reserved = ephemeron_index_reserve(context, roots[0]);
    if (reserved.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return reserved;
    }
    OseoEphemeronEntry *entry =
        oseo_internal_allocate_heap_bytes(context, sizeof(*entry));
    if (entry == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Ephemeron entry allocation failed."
        );
    }
    entry->next = oseo_undefined();
    entry->previous = oseo_undefined();
    entry->key = roots[1];
    entry->value = roots[2];
    OseoResult published = oseo_internal_publish_heap(
        context,
        &entry->header,
        OSEO_HEAP_EPHEMERON_ENTRY
    );
    if (published.status == OSEO_STATUS_NORMAL) {
        OseoEphemeronTable *table = ephemeron_table_object(roots[0]);
        if (has_heap_kind(table->tail, OSEO_HEAP_EPHEMERON_ENTRY)) {
            ephemeron_entry_object(table->tail)->next = published.value;
            entry->previous = table->tail;
        } else {
            table->head = published.value;
        }
        table->tail = published.value;
        table->live_count += 1u;
        if (ephemeron_index_insert(
            table->index,
            table->index_capacity,
            roots[1],
            published.value
        )) {
            table->index_used += 1u;
        }
    }
    oseo_roots_pop(context, &frame);
    return published.status == OSEO_STATUS_NORMAL
        ? normal(roots[0])
        : published;
}

bool oseo_internal_ephemeron_get(
    OseoValue table_value,
    OseoValue key,
    OseoValue *value
) {
    if (!has_heap_kind(table_value, OSEO_HEAP_EPHEMERON_TABLE)) return false;
    OseoValue *slot =
        ephemeron_index_find(ephemeron_table_object(table_value), key);
    if (slot == NULL) return false;
    *value = ephemeron_entry_object(*slot)->value;
    return true;
}

bool oseo_internal_ephemeron_delete(OseoValue table_value, OseoValue key) {
    if (!has_heap_kind(table_value, OSEO_HEAP_EPHEMERON_TABLE)) return false;
    OseoEphemeronTable *table = ephemeron_table_object(table_value);
    OseoValue *slot = ephemeron_index_find(table, key);
    if (slot == NULL) return false;
    OseoEphemeronEntry *entry = ephemeron_entry_object(*slot);
    *slot = OSEO_EPHEMERON_INDEX_TOMBSTONE;
    if (tag_of(entry->previous) == OSEO_TAG_HEAP) {
        ephemeron_entry_object(entry->previous)->next = entry->next;
    } else {
        table->head = entry->next;
    }
    if (tag_of(entry->next) == OSEO_TAG_HEAP) {
        ephemeron_entry_object(entry->next)->previous = entry->previous;
    } else {
        table->tail = entry->previous;
    }
    entry->next = oseo_undefined();
    entry->previous = oseo_undefined();
    entry->key = oseo_undefined();
    entry->value = oseo_undefined();
    if (table->live_count > 0u) table->live_count -= 1u;
    return true;
}

size_t oseo_internal_ephemeron_live_count(OseoValue table_value) {
    if (!has_heap_kind(table_value, OSEO_HEAP_EPHEMERON_TABLE)) return 0u;
    return ephemeron_table_object(table_value)->live_count;
}

OseoResult oseo_internal_weak_reference_create(
    OseoContext *context,
    OseoValue target
) {
    if (tag_of(target) != OSEO_TAG_HEAP) {
        return failure(context, "OSEO2001", "Weak target is not a heap value.");
    }
    OseoRootFrame frame = {NULL, &target, 1u};
    oseo_roots_push(context, &frame);
    OseoWeakReference *reference =
        oseo_internal_allocate_heap_bytes(context, sizeof(*reference));
    if (reference == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Weak reference allocation failed."
        );
    }
    reference->target = target;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &reference->header,
        OSEO_HEAP_WEAK_REFERENCE
    );
    oseo_roots_pop(context, &frame);
    return published;
}

OseoValue oseo_internal_weak_reference_target(OseoValue reference) {
    if (!has_heap_kind(reference, OSEO_HEAP_WEAK_REFERENCE)) {
        return oseo_undefined();
    }
    return weak_reference_object(reference)->target;
}

OseoResult oseo_internal_finalization_registry_create(
    OseoContext *context,
    OseoValue callback
) {
    OseoRootFrame frame = {NULL, &callback, 1u};
    oseo_roots_push(context, &frame);
    OseoFinalizationRegistry *registry =
        oseo_internal_allocate_heap_bytes(context, sizeof(*registry));
    if (registry == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Finalization registry allocation failed."
        );
    }
    registry->callback = callback;
    registry->cell_head = oseo_undefined();
    registry->cell_tail = oseo_undefined();
    OseoResult published = oseo_internal_publish_heap(
        context,
        &registry->header,
        OSEO_HEAP_FINALIZATION_REGISTRY
    );
    oseo_roots_pop(context, &frame);
    return published;
}

OseoResult oseo_internal_finalization_register(
    OseoContext *context,
    OseoValue registry_value,
    OseoValue target,
    OseoValue holdings
) {
    return oseo_internal_finalization_register_token(
        context,
        registry_value,
        target,
        holdings,
        oseo_undefined()
    );
}

OseoResult oseo_internal_finalization_register_token(
    OseoContext *context,
    OseoValue registry_value,
    OseoValue target,
    OseoValue holdings,
    OseoValue unregister_token
) {
    if (!has_heap_kind(registry_value, OSEO_HEAP_FINALIZATION_REGISTRY)) {
        return failure(
            context,
            "OSEO2001",
            "Value is not a finalization registry."
        );
    }
    if (tag_of(target) != OSEO_TAG_HEAP || target == holdings) {
        return failure(context, "OSEO2001", "Finalization target is invalid.");
    }
    if (context->next_finalization_order == UINT64_MAX) {
        return failure(
            context,
            "OSEO2001",
            "Finalization registration limit exceeded."
        );
    }
    OseoValue roots[] = {registry_value, target, holdings, unregister_token};
    OseoRootFrame frame = {NULL, roots, 4u};
    oseo_roots_push(context, &frame);
    OseoFinalizationCell *cell =
        oseo_internal_allocate_heap_bytes(context, sizeof(*cell));
    if (cell == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(
            context,
            "OSEO2001",
            "Finalization cell allocation failed."
        );
    }
    cell->next = oseo_undefined();
    cell->queue_next = oseo_undefined();
    cell->registry = roots[0];
    cell->target = roots[1];
    cell->holdings = roots[2];
    cell->unregister_token = roots[3];
    cell->registration_order = context->next_finalization_order;
    cell->queued = false;
    cell->processed = false;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &cell->header,
        OSEO_HEAP_FINALIZATION_CELL
    );
    if (published.status == OSEO_STATUS_NORMAL) {
        OseoFinalizationRegistry *registry =
            finalization_registry_object(roots[0]);
        if (has_heap_kind(
            registry->cell_tail,
            OSEO_HEAP_FINALIZATION_CELL
        )) {
            finalization_cell_object(registry->cell_tail)->next =
                published.value;
        } else {
            registry->cell_head = published.value;
        }
        registry->cell_tail = published.value;
        context->next_finalization_order += 1u;
    }
    oseo_roots_pop(context, &frame);
    return published.status == OSEO_STATUS_NORMAL
        ? normal(roots[0])
        : published;
}

bool oseo_internal_finalization_unregister(
    OseoContext *context,
    OseoValue registry_value,
    OseoValue unregister_token
) {
    if (!has_heap_kind(registry_value, OSEO_HEAP_FINALIZATION_REGISTRY) ||
        tag_of(unregister_token) != OSEO_TAG_HEAP) {
        return false;
    }
    bool removed = false;
    OseoValue cursor = finalization_registry_object(registry_value)->cell_head;
    while (has_heap_kind(cursor, OSEO_HEAP_FINALIZATION_CELL)) {
        OseoFinalizationCell *cell = finalization_cell_object(cursor);
        cursor = cell->next;
        if (cell->processed || cell->unregister_token != unregister_token) {
            continue;
        }
        cell->processed = true;
        cell->target = oseo_undefined();
        cell->holdings = oseo_undefined();
        cell->unregister_token = oseo_undefined();
        if (cell->queued && context->finalization_pending_count > 0u) {
            context->finalization_pending_count -= 1u;
        }
        removed = true;
    }
    return removed;
}

/*
 * Unlinks and consumes the oldest queued record, restricted to `registry`
 * unless it is undefined. A record an unregister already consumed has
 * given back its pending count, so the scan unlinks it without a callback.
 */
static bool take_queued_cleanup(
    OseoContext *context,
    OseoValue registry,
    OseoValue *registry_out,
    OseoValue *holdings
) {
    OseoValue previous = oseo_undefined();
    OseoValue cursor = context->finalization_head;
    while (has_heap_kind(cursor, OSEO_HEAP_FINALIZATION_CELL)) {
        OseoFinalizationCell *cell = finalization_cell_object(cursor);
        OseoValue next = cell->queue_next;
        bool matches = !cell->processed &&
            (tag_of(registry) == OSEO_TAG_UNDEFINED ||
             cell->registry == registry);
        if (!cell->processed && !matches) {
            previous = cursor;
            cursor = next;
            continue;
        }
        if (has_heap_kind(previous, OSEO_HEAP_FINALIZATION_CELL)) {
            finalization_cell_object(previous)->queue_next = next;
        } else {
            context->finalization_head = next;
        }
        if (context->finalization_tail == cursor) {
            context->finalization_tail = previous;
        }
        cell->queue_next = oseo_undefined();
        cell->queued = false;
        if (!matches) {
            cursor = next;
            continue;
        }
        cell->processed = true;
        *registry_out = cell->registry;
        *holdings = cell->holdings;
        cell->holdings = oseo_undefined();
        if (context->finalization_pending_count > 0u) {
            context->finalization_pending_count -= 1u;
        }
        return true;
    }
    return false;
}

bool oseo_internal_finalization_take_cleanup(
    OseoContext *context,
    OseoValue *registry,
    OseoValue *holdings
) {
    return take_queued_cleanup(
        context,
        oseo_undefined(),
        registry,
        holdings
    );
}

bool oseo_internal_finalization_take_registry_cleanup(
    OseoContext *context,
    OseoValue registry,
    OseoValue *holdings
) {
    OseoValue taken = oseo_undefined();
    return has_heap_kind(registry, OSEO_HEAP_FINALIZATION_REGISTRY) &&
        take_queued_cleanup(context, registry, &taken, holdings);
}
