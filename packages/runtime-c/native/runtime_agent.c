/*
 * Feature-test macros must precede every system header, including the
 * ones runtime_internal.h includes, so they come before it here. Beside
 * runtime_clock_posix.c, this is the one runtime translation unit that
 * asks for operating-system interfaces beyond C11: POSIX threads.
 */
#if defined(__linux__)
#define _GNU_SOURCE
#elif defined(__APPLE__)
#define _DARWIN_C_SOURCE
#endif

#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(__linux__) || defined(__APPLE__)
#include <pthread.h>
#define OSEO_AGENT_THREADS 1
typedef pthread_mutex_t AgentMutex;
typedef pthread_t AgentThread;
#else
#define OSEO_AGENT_THREADS 0
typedef int AgentMutex;
typedef int AgentThread;
#endif

/*
 * Agent clusters and the test262 host object `$262` (ADR 0026).
 *
 * A program compiled for the test262 host makes its realm the main agent
 * of a cluster. `$262.agent.start` evaluates one of the agent programs the
 * compiler built ahead of time from the case's source templates, each in
 * a new agent with its own realm, heap, clock adapter, and event loop, on
 * a POSIX thread of its own. The agents share Shared Data Blocks, the
 * WaiterList store, and the report queue, all of which live here.
 *
 * Agents of one cluster share one executing thread in the sense of
 * ECMA-262's forward progress rules: exactly one agent, the one holding
 * the turn, evaluates at a time. The turn passes only when the holder
 * suspends (Atomics.wait, `$262.agent.sleep`, a broadcast, a start, or an
 * event loop with nothing due), finishes, or reaches a yield point (every
 * Atomics operation and `$262.agent.getReport`), where it goes to the
 * longest-ready agent. One agent therefore always makes progress, and
 * every access to shared memory happens on the thread that holds the turn
 * after the mutex handoff that gave it the turn, so no two threads ever
 * touch a block or any cluster state concurrently. A blocked agent waits
 * in its own clock adapter, and whoever makes it ready wakes that adapter.
 *
 * All cluster state is guarded by `lock`. Heap values never cross agents:
 * a waiter entry names its owner's heap waiter, which only the owner
 * dereferences, a broadcast carries a referenced Shared Data Block and a
 * scalar id, and a report carries copied UTF-16 units.
 */

typedef enum {
    AGENT_STARTING = 0,
    AGENT_READY = 1,
    AGENT_RUNNING = 2,
    AGENT_BLOCKED = 3,
    AGENT_FINISHED = 4,
} AgentState;

struct Agent;

/* One waiter of the cluster's WaiterList store. */
typedef struct AgentWaiter {
    struct AgentWaiter *next;
    /* The owner's list of waitAsync waiters another agent notified. */
    struct AgentWaiter *resolved_next;
    struct Agent *agent;
    const OseoSharedBlock *block;
    size_t byte_index;
    /* The owner's OseoAtomicsWaiter for a waitAsync waiter. */
    OseoValue waiter;
    bool asynchronous;
    bool listed;
    bool notified;
} AgentWaiter;

typedef enum {
    AGENT_ID_UNDEFINED = 0,
    AGENT_ID_NUMBER = 1,
    AGENT_ID_BIGINT = 2,
} AgentIdKind;

/* One broadcast waiting in an agent's inbox. */
typedef struct AgentBroadcast {
    struct AgentBroadcast *next;
    OseoSharedBlock *block;
    AgentIdKind id_kind;
    double id_number;
    /* A BigInt id as its BigInt64 two's-complement bits. */
    uint64_t id_bits;
} AgentBroadcast;

/* One `$262.agent.report` value, copied out of the reporting heap. */
typedef struct AgentReport {
    struct AgentReport *next;
    size_t length;
    uint16_t units[];
} AgentReport;

/*
 * One matched numeric hole: a decimal integer literal, or a BigInt literal
 * when `bigint` is set, whose digits create the value on each read.
 */
typedef struct {
    double number;
    char *digits;
    bool bigint;
} AgentHole;

struct AgentCluster;

typedef struct Agent {
    struct AgentCluster *cluster;
    struct Agent *next;
    struct Agent *ready_next;
    /* The agent's realm, NULL until its thread has initialized it. */
    OseoContext *context;
    const OseoAgentProgram *program;
    AgentHole *holes;
    size_t hole_count;
    AgentThread thread;
    AgentState state;
    bool main;
    /* A blocked agent waits for a deadline of its own as well. */
    bool has_deadline;
    /* A blocked agent's event loop is idle, so incoming work ends it. */
    bool wakes_on_work;
    bool leaving;
    size_t listed_async;
    AgentWaiter *resolved_head;
    AgentWaiter *resolved_tail;
    AgentBroadcast *broadcast_head;
    AgentBroadcast *broadcast_tail;
} Agent;

typedef struct AgentCluster {
    AgentMutex lock;
    Agent *main;
    /* Every agent other than the main one, in start order. */
    Agent *agents_head;
    Agent *agents_tail;
    Agent *running;
    Agent *ready_head;
    Agent *ready_tail;
    AgentWaiter *waiters_head;
    AgentWaiter *waiters_tail;
    AgentReport *reports_head;
    AgentReport *reports_tail;
    /* Agents that have not yet retrieved the current broadcast. */
    size_t broadcast_remaining;
    const OseoAgentProgram *programs;
    size_t program_count;
    /* The adapter reading `$262.agent.monotonicNow` counts from. */
    uint64_t origin;
} AgentCluster;

/* The stack each agent thread gets, which the main thread usually has. */
#define AGENT_STACK_SIZE ((size_t)8u << 20u)
#define AGENT_NANOSECONDS_PER_MILLISECOND 1000000.0

static Agent *agent_of(const OseoContext *context) {
    return (Agent *)context->agent;
}

/*
 * The two thread facilities the cluster needs, over POSIX threads where the
 * target has them. A target without them keeps every lock a no-op and
 * refuses to start a thread, so `$262.agent.start` reports an owned failure
 * and no second agent ever exists to need the lock.
 */
#if OSEO_AGENT_THREADS
static bool agent_mutex_init(AgentMutex *mutex) {
    return pthread_mutex_init(mutex, NULL) == 0;
}

static void agent_mutex_destroy(AgentMutex *mutex) {
    (void)pthread_mutex_destroy(mutex);
}

static void agent_mutex_lock(AgentMutex *mutex) {
    (void)pthread_mutex_lock(mutex);
}

static void agent_mutex_unlock(AgentMutex *mutex) {
    (void)pthread_mutex_unlock(mutex);
}

static bool agent_thread_start(
    AgentThread *thread,
    void *(*run)(void *),
    void *argument
) {
    pthread_attr_t attributes;
    if (pthread_attr_init(&attributes) != 0) return false;
    (void)pthread_attr_setstacksize(&attributes, AGENT_STACK_SIZE);
    int created = pthread_create(thread, &attributes, run, argument);
    (void)pthread_attr_destroy(&attributes);
    return created == 0;
}

static void agent_thread_join(AgentThread thread) {
    (void)pthread_join(thread, NULL);
}
#else
static bool agent_mutex_init(AgentMutex *mutex) {
    *mutex = 0;
    return true;
}

static void agent_mutex_destroy(AgentMutex *mutex) {
    (void)mutex;
}

static void agent_mutex_lock(AgentMutex *mutex) {
    (void)mutex;
}

static void agent_mutex_unlock(AgentMutex *mutex) {
    (void)mutex;
}

static bool agent_thread_start(
    AgentThread *thread,
    void *(*run)(void *),
    void *argument
) {
    (void)thread;
    (void)run;
    (void)argument;
    return false;
}

static void agent_thread_join(AgentThread thread) {
    (void)thread;
}
#endif

static void cluster_lock(AgentCluster *cluster) {
    agent_mutex_lock(&cluster->lock);
}

static void cluster_unlock(AgentCluster *cluster) {
    agent_mutex_unlock(&cluster->lock);
}

static void holes_free(AgentHole *holes, size_t count) {
    if (holes == NULL) return;
    for (size_t index = 0u; index < count; index += 1u) {
        free(holes[index].digits);
    }
    free(holes);
}

/*
 * Wakes one blocked agent's own clock wait. Only an agent whose thread is
 * blocked is ever signaled, so its realm and adapter are alive.
 */
static void agent_signal(Agent *agent) {
    if (agent->context != NULL) (void)oseo_clock_wake(agent->context);
}

static void ready_push(AgentCluster *cluster, Agent *agent) {
    agent->ready_next = NULL;
    if (cluster->ready_tail == NULL) {
        cluster->ready_head = agent;
    } else {
        cluster->ready_tail->ready_next = agent;
    }
    cluster->ready_tail = agent;
}

static Agent *ready_pop(AgentCluster *cluster) {
    Agent *agent = cluster->ready_head;
    if (agent == NULL) return NULL;
    cluster->ready_head = agent->ready_next;
    if (cluster->ready_head == NULL) cluster->ready_tail = NULL;
    agent->ready_next = NULL;
    return agent;
}

/* Hands a free turn to the longest-ready agent, if there is one. */
static void cluster_dispatch(AgentCluster *cluster) {
    if (cluster->running != NULL) return;
    Agent *next = ready_pop(cluster);
    if (next == NULL) return;
    next->state = AGENT_RUNNING;
    cluster->running = next;
    agent_signal(next);
}

static void agent_make_ready(Agent *agent) {
    if (agent->state != AGENT_BLOCKED) return;
    agent->state = AGENT_READY;
    agent->has_deadline = false;
    agent->wakes_on_work = false;
    ready_push(agent->cluster, agent);
    cluster_dispatch(agent->cluster);
}

static bool agent_has_work(const Agent *agent, const OseoContext *context) {
    return agent->resolved_head != NULL ||
        (agent->broadcast_head != NULL &&
         tag_of(context->agent_broadcast_callback) != OSEO_TAG_UNDEFINED);
}

/*
 * Whether an agent other than `self` can still make progress on its own:
 * it holds or awaits the turn, is starting, waits for a deadline, or has
 * incoming work its idle event loop will take.
 */
static bool cluster_other_progresses(AgentCluster *cluster, Agent *self) {
    Agent *main = cluster->main;
    for (Agent *agent = main; agent != NULL;
         agent = agent == main ? cluster->agents_head : agent->next) {
        if (agent == self) continue;
        if (agent->state == AGENT_STARTING ||
            agent->state == AGENT_READY ||
            agent->state == AGENT_RUNNING) {
            return true;
        }
        if (agent->state == AGENT_BLOCKED && agent->has_deadline) {
            return true;
        }
    }
    return false;
}

static void cluster_print_stall(const Agent *agent) {
    const OseoContext *context = agent->context;
    (void)fflush(stdout);
    if (context != NULL) {
        (void)fwrite(
            context->source_id,
            1u,
            context->source_id_length,
            stderr
        );
    }
    (void)fprintf(
        stderr,
        ": error[OSEO3001]: The agent cluster cannot make progress.\n"
    );
    (void)fflush(stderr);
}

/*
 * Runs after the turn became free with no agent ready. When every
 * remaining agent waits without a deadline, nothing can wake any of them:
 * an idle main agent is made ready so its event loop can end, and a main
 * agent suspended in a blocking operation is a deadlock the process
 * reports and exits on, rather than hanging.
 */
static void cluster_check_progress(AgentCluster *cluster, Agent *self) {
    if (cluster->running != NULL || cluster->ready_head != NULL) return;
    if (cluster_other_progresses(cluster, NULL)) return;
    Agent *main = cluster->main;
    if (main->state == AGENT_FINISHED) return;
    if (main->state == AGENT_BLOCKED && main->wakes_on_work) {
        agent_make_ready(main);
        return;
    }
    cluster_print_stall(self);
    exit(EXIT_FAILURE);
}

/* An infinite or deadline wait on the agent's own clock adapter. */
static OseoResult agent_clock_wait(
    OseoContext *context,
    bool has_deadline,
    uint64_t deadline
) {
    if (has_deadline) return oseo_internal_clock_wait_until(context, deadline);
    OseoResult result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (context->clock_adapter->wait(context->clock_state, false, 0u) ==
        OSEO_CLOCK_WAIT_FAILED) {
        return failure(context, "OSEO2001", "The host clock wait failed.");
    }
    return normal(oseo_undefined());
}

/*
 * Waits, with the cluster lock held on entry and on return, until this
 * agent holds the turn. A blocked agent whose deadline passes first
 * becomes ready by itself; `timed_out` reports that, and a blocking
 * waiter still listed at that moment leaves the store.
 */
static OseoResult agent_await_turn(
    OseoContext *context,
    Agent *self,
    uint64_t deadline,
    AgentWaiter *waiter,
    bool *timed_out
) {
    AgentCluster *cluster = self->cluster;
    OseoResult result = normal(oseo_undefined());
    while (cluster->running != self) {
        if (self->state == AGENT_BLOCKED && self->has_deadline) {
            uint64_t now = 0u;
            result = oseo_internal_clock_now(context, &now);
            if (result.status != OSEO_STATUS_NORMAL) return result;
            if (now >= deadline) {
                if (waiter != NULL && waiter->listed) {
                    AgentWaiter **link = &cluster->waiters_head;
                    AgentWaiter *previous = NULL;
                    while (*link != waiter) {
                        previous = *link;
                        link = &(*link)->next;
                    }
                    *link = waiter->next;
                    if (cluster->waiters_tail == waiter) {
                        cluster->waiters_tail = previous;
                    }
                    waiter->listed = false;
                }
                if (timed_out != NULL) *timed_out = true;
                agent_make_ready(self);
                continue;
            }
        }
        bool has_deadline =
            self->state == AGENT_BLOCKED && self->has_deadline;
        cluster_unlock(cluster);
        result = agent_clock_wait(context, has_deadline, deadline);
        cluster_lock(cluster);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    return result;
}

/*
 * Gives up the turn and blocks until another agent makes this one ready
 * or, with `has_deadline`, until the deadline passes, then waits for the
 * turn again. The cluster lock is held on entry and on return.
 */
static OseoResult agent_block(
    OseoContext *context,
    Agent *self,
    bool has_deadline,
    uint64_t deadline,
    bool wakes_on_work,
    AgentWaiter *waiter,
    bool *timed_out
) {
    AgentCluster *cluster = self->cluster;
    self->state = AGENT_BLOCKED;
    self->has_deadline = has_deadline;
    self->wakes_on_work = wakes_on_work;
    cluster->running = NULL;
    cluster_dispatch(cluster);
    if (!has_deadline) cluster_check_progress(cluster, self);
    return agent_await_turn(context, self, deadline, waiter, timed_out);
}

/*
 * The whole-millisecond deadline `milliseconds` after now. The current
 * whole millisecond is counted as already started, so the wait lasts at
 * least the requested time however far into it the call began, and a
 * fractional request rounds up, which is a permitted additional timeout.
 */
static OseoResult agent_deadline(
    OseoContext *context,
    double milliseconds,
    uint64_t *deadline
) {
    uint64_t now = 0u;
    OseoResult result = oseo_internal_clock_now(context, &now);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double rounded = ceil(milliseconds > 0.0 ? milliseconds : 0.0) + 1.0;
    uint64_t delay = rounded >= 18446744073709549568.0
        ? UINT64_MAX
        : (uint64_t)rounded;
    *deadline = UINT64_MAX - now < delay ? UINT64_MAX : now + delay;
    return result;
}

OseoResult oseo_internal_agent_yield(OseoContext *context) {
    Agent *self = agent_of(context);
    if (self == NULL) return normal(oseo_undefined());
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    OseoResult result = normal(oseo_undefined());
    if (cluster->ready_head != NULL) {
        self->state = AGENT_READY;
        ready_push(cluster, self);
        cluster->running = NULL;
        cluster_dispatch(cluster);
        result = agent_await_turn(context, self, 0u, NULL, NULL);
    }
    cluster_unlock(cluster);
    return result;
}

static void waiter_link(AgentCluster *cluster, AgentWaiter *waiter) {
    waiter->next = NULL;
    if (cluster->waiters_tail == NULL) {
        cluster->waiters_head = waiter;
    } else {
        cluster->waiters_tail->next = waiter;
    }
    cluster->waiters_tail = waiter;
    waiter->listed = true;
}

static void waiter_unlink(AgentCluster *cluster, AgentWaiter *waiter) {
    AgentWaiter *previous = NULL;
    AgentWaiter *current = cluster->waiters_head;
    while (current != NULL && current != waiter) {
        previous = current;
        current = current->next;
    }
    if (current == NULL) return;
    if (previous == NULL) {
        cluster->waiters_head = waiter->next;
    } else {
        previous->next = waiter->next;
    }
    if (cluster->waiters_tail == waiter) cluster->waiters_tail = previous;
    waiter->next = NULL;
    waiter->listed = false;
}

OseoResult oseo_internal_agent_suspend(
    OseoContext *context,
    const OseoSharedBlock *block,
    size_t byte_index,
    double timeout,
    bool *notified
) {
    Agent *self = agent_of(context);
    AgentCluster *cluster = self->cluster;
    bool finite = isfinite(timeout);
    uint64_t deadline = 0u;
    if (finite) {
        OseoResult result = agent_deadline(context, timeout, &deadline);
        if (result.status != OSEO_STATUS_NORMAL) return result;
    }
    AgentWaiter waiter;
    waiter.next = NULL;
    waiter.resolved_next = NULL;
    waiter.agent = self;
    waiter.block = block;
    waiter.byte_index = byte_index;
    waiter.waiter = oseo_undefined();
    waiter.asynchronous = false;
    waiter.listed = false;
    waiter.notified = false;
    cluster_lock(cluster);
    waiter_link(cluster, &waiter);
    OseoResult result = agent_block(
        context,
        self,
        finite,
        deadline,
        false,
        &waiter,
        NULL
    );
    if (waiter.listed) waiter_unlink(cluster, &waiter);
    *notified = waiter.notified;
    cluster_unlock(cluster);
    return result;
}

OseoResult oseo_internal_agent_list_waiter(
    OseoContext *context,
    OseoValue waiter
) {
    Agent *self = agent_of(context);
    OseoAtomicsWaiter *record = atomics_waiter_object(waiter);
    AgentWaiter *entry = malloc(sizeof(*entry));
    if (entry == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Atomics waiter allocation failed."
        );
    }
    entry->next = NULL;
    entry->resolved_next = NULL;
    entry->agent = self;
    entry->block = record->block;
    entry->byte_index = record->byte_index;
    entry->waiter = waiter;
    entry->asynchronous = true;
    entry->listed = false;
    entry->notified = false;
    record->record = entry;
    cluster_lock(self->cluster);
    waiter_link(self->cluster, entry);
    self->listed_async += 1u;
    cluster_unlock(self->cluster);
    return normal(oseo_undefined());
}

bool oseo_internal_agent_unlist_waiter(OseoContext *context, OseoValue waiter) {
    Agent *self = agent_of(context);
    OseoAtomicsWaiter *record = atomics_waiter_object(waiter);
    AgentWaiter *entry = record->record;
    if (entry == NULL) return false;
    cluster_lock(self->cluster);
    bool listed = entry->listed;
    if (listed) {
        waiter_unlink(self->cluster, entry);
        self->listed_async -= 1u;
    }
    cluster_unlock(self->cluster);
    if (!listed) return false;
    record->record = NULL;
    free(entry);
    return true;
}

bool oseo_internal_agent_notify_one(
    OseoContext *context,
    const OseoSharedBlock *block,
    size_t byte_index,
    OseoValue *own_waiter
) {
    Agent *self = agent_of(context);
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    AgentWaiter *entry = cluster->waiters_head;
    while (entry != NULL &&
           (entry->block != block || entry->byte_index != byte_index)) {
        entry = entry->next;
    }
    if (entry == NULL) {
        cluster_unlock(cluster);
        return false;
    }
    waiter_unlink(cluster, entry);
    entry->notified = true;
    Agent *owner = entry->agent;
    if (!entry->asynchronous) {
        agent_make_ready(owner);
    } else if (owner == self) {
        owner->listed_async -= 1u;
        *own_waiter = entry->waiter;
        atomics_waiter_object(entry->waiter)->record = NULL;
        free(entry);
    } else {
        /* EnqueueResolveInAgentJob: the owner resolves it as a task. */
        owner->listed_async -= 1u;
        entry->resolved_next = NULL;
        if (owner->resolved_tail == NULL) {
            owner->resolved_head = entry;
        } else {
            owner->resolved_tail->resolved_next = entry;
        }
        owner->resolved_tail = entry;
        if (owner->state == AGENT_BLOCKED && owner->wakes_on_work) {
            agent_make_ready(owner);
        }
    }
    cluster_unlock(cluster);
    return true;
}

/*
 * Whether this realm's next broadcast can be taken: a callback is
 * registered and one is waiting. The lock is held.
 */
static AgentBroadcast *take_broadcast(OseoContext *context, Agent *self) {
    if (tag_of(context->agent_broadcast_callback) == OSEO_TAG_UNDEFINED) {
        return NULL;
    }
    AgentBroadcast *broadcast = self->broadcast_head;
    if (broadcast == NULL) return NULL;
    self->broadcast_head = broadcast->next;
    if (self->broadcast_head == NULL) self->broadcast_tail = NULL;
    broadcast->next = NULL;
    AgentCluster *cluster = self->cluster;
    if (cluster->broadcast_remaining > 0u) {
        cluster->broadcast_remaining -= 1u;
        if (cluster->broadcast_remaining == 0u) {
            agent_make_ready(cluster->main);
        }
    }
    return broadcast;
}

static OseoResult broadcast_id(
    OseoContext *context,
    const AgentBroadcast *broadcast
) {
    if (broadcast->id_kind == AGENT_ID_NUMBER) {
        return normal(oseo_number(broadcast->id_number));
    }
    if (broadcast->id_kind == AGENT_ID_BIGINT) {
        bool negative = (broadcast->id_bits >> 63u) != 0u;
        return oseo_internal_bigint_from_uint64(
            context,
            negative ? UINT64_C(0) - broadcast->id_bits : broadcast->id_bits,
            negative
        );
    }
    return normal(oseo_undefined());
}

/*
 * Turns one retrieved broadcast into a task of this agent: the callback
 * runs as a due timer callback with this realm's own SharedArrayBuffer
 * over the broadcast block and the id, so it follows every timer turn
 * rule, including the checkpoint after it.
 */
static OseoResult deliver_broadcast(
    OseoContext *context,
    AgentBroadcast *broadcast
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) {
        oseo_internal_shared_block_release(broadcast->block);
        free(broadcast);
        return result;
    }
    frame.slots[0] = context->agent_broadcast_callback;
    frame.slots[1] = oseo_number(0.0);
    result = oseo_internal_shared_array_buffer_from_block(
        context,
        broadcast->block
    );
    frame.slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = broadcast_id(context, broadcast);
        frame.slots[3] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_set_timeout(context, 4u, frame.slots);
    }
    oseo_roots_release(context, &frame);
    oseo_internal_shared_block_release(broadcast->block);
    free(broadcast);
    return result;
}

OseoResult oseo_internal_agent_receive(OseoContext *context, bool *ran) {
    *ran = false;
    Agent *self = agent_of(context);
    if (self == NULL) return normal(oseo_undefined());
    AgentCluster *cluster = self->cluster;
    OseoResult result = normal(oseo_undefined());
    for (;;) {
        cluster_lock(cluster);
        AgentWaiter *entry = self->resolved_head;
        if (entry != NULL) {
            self->resolved_head = entry->resolved_next;
            if (self->resolved_head == NULL) self->resolved_tail = NULL;
        }
        AgentBroadcast *broadcast =
            entry == NULL ? take_broadcast(context, self) : NULL;
        cluster_unlock(cluster);
        if (entry == NULL && broadcast == NULL) break;
        *ran = true;
        if (entry != NULL) {
            OseoValue waiter = entry->waiter;
            atomics_waiter_object(waiter)->record = NULL;
            free(entry);
            result = oseo_internal_atomics_waiter_notified(context, waiter);
        } else {
            result = deliver_broadcast(context, broadcast);
        }
        if (result.status != OSEO_STATUS_NORMAL) break;
    }
    return result;
}

bool oseo_internal_agent_keeps_alive(OseoContext *context) {
    Agent *self = agent_of(context);
    if (self == NULL) return false;
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    bool alive;
    if (agent_has_work(self, context)) {
        alive = true;
    } else if (!self->main) {
        alive = self->listed_async > 0u ||
            (tag_of(context->agent_broadcast_callback) !=
                 OSEO_TAG_UNDEFINED &&
             !self->leaving);
    } else {
        alive = self->listed_async > 0u &&
            cluster_other_progresses(cluster, self);
    }
    cluster_unlock(cluster);
    return alive;
}

OseoResult oseo_internal_agent_idle(
    OseoContext *context,
    bool has_deadline,
    uint64_t deadline
) {
    Agent *self = agent_of(context);
    if (self == NULL) {
        return has_deadline
            ? oseo_internal_clock_wait_until(context, deadline)
            : normal(oseo_undefined());
    }
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    OseoResult result = normal(oseo_undefined());
    if (!agent_has_work(self, context)) {
        result = agent_block(
            context,
            self,
            has_deadline,
            deadline,
            true,
            NULL,
            NULL
        );
    }
    cluster_unlock(cluster);
    return result;
}

/* Drops everything an agent that stops evaluating still holds. */
static void agent_discard_work(AgentCluster *cluster, Agent *agent) {
    AgentWaiter *entry = cluster->waiters_head;
    while (entry != NULL) {
        AgentWaiter *next = entry->next;
        if (entry->agent == agent) {
            waiter_unlink(cluster, entry);
            if (entry->asynchronous) free(entry);
        }
        entry = next;
    }
    while (agent->resolved_head != NULL) {
        AgentWaiter *resolved = agent->resolved_head;
        agent->resolved_head = resolved->resolved_next;
        free(resolved);
    }
    agent->resolved_tail = NULL;
    agent->listed_async = 0u;
    while (agent->broadcast_head != NULL) {
        AgentBroadcast *broadcast = agent->broadcast_head;
        agent->broadcast_head = broadcast->next;
        oseo_internal_shared_block_release(broadcast->block);
        free(broadcast);
        if (cluster->broadcast_remaining > 0u) {
            cluster->broadcast_remaining -= 1u;
            if (cluster->broadcast_remaining == 0u) {
                agent_make_ready(cluster->main);
            }
        }
    }
    agent->broadcast_tail = NULL;
}

static void cluster_reap(AgentCluster *cluster);

static void cluster_free(AgentCluster *cluster) {
    while (cluster->reports_head != NULL) {
        AgentReport *report = cluster->reports_head;
        cluster->reports_head = report->next;
        free(report);
    }
    Agent *agent = cluster->agents_head;
    while (agent != NULL) {
        Agent *next = agent->next;
        holes_free(agent->holes, agent->hole_count);
        free(agent);
        agent = next;
    }
    free(cluster->main);
    agent_mutex_destroy(&cluster->lock);
    free(cluster);
}

void oseo_internal_agent_context_destroy(OseoContext *context) {
    Agent *self = agent_of(context);
    if (self == NULL || !self->main) return;
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    /*
     * The main agent keeps the turn from here on, so an agent that is
     * still waiting never evaluates again while the process exits. The
     * agents that finished are joined and the cluster is released only
     * when all of them did; a waiting agent's thread still refers to it.
     */
    agent_discard_work(cluster, self);
    bool finished = true;
    for (Agent *agent = cluster->agents_head; agent != NULL;
         agent = agent->next) {
        if (agent->state != AGENT_FINISHED) finished = false;
    }
    cluster_unlock(cluster);
    context->agent = NULL;
    if (!finished) return;
    cluster_reap(cluster);
    cluster_free(cluster);
}

/*
 * Matches a start source against one program's template: the literal
 * runs must match exactly, and each hole must be a decimal integer
 * literal without a leading zero, optionally followed by the BigInt
 * suffix `n`. The runs never start or end with a digit or an identifier
 * character, so each hole is the maximal digit run at its position and a
 * following `n` can only be its suffix. `false` with `*failed` set
 * reports an allocation failure rather than a mismatch.
 */
static bool program_matches(
    const OseoAgentProgram *program,
    const OseoString *source,
    AgentHole *holes,
    bool *failed
) {
    size_t position = 0u;
    for (size_t index = 0u; index < program->segment_count; index += 1u) {
        const OseoAgentSegment *segment = &program->segments[index];
        if (index > 0u) {
            size_t start = position;
            while (position < source->length &&
                   source->units[position] >= '0' &&
                   source->units[position] <= '9') {
                position += 1u;
            }
            size_t length = position - start;
            if (length == 0u) return false;
            if (source->units[start] == '0' && length > 1u) return false;
            AgentHole *hole = &holes[index - 1u];
            hole->bigint = position < source->length &&
                source->units[position] == 'n';
            if (hole->bigint) position += 1u;
            hole->digits = malloc(length + 1u);
            if (hole->digits == NULL) {
                *failed = true;
                return false;
            }
            for (size_t digit = 0u; digit < length; digit += 1u) {
                hole->digits[digit] = (char)source->units[start + digit];
            }
            hole->digits[length] = '\0';
            /* One correctly rounded conversion of the exact literal text. */
            hole->number = strtod(hole->digits, NULL);
        }
        if (source->length - position < segment->length ||
            memcmp(
                source->units + position,
                segment->units,
                segment->length * sizeof(uint16_t)
            ) != 0) {
            return false;
        }
        position += segment->length;
    }
    return position == source->length;
}

static OseoResult install_host(OseoContext *context, bool main);

static void agent_report_failure(OseoContext *context, OseoResult result) {
    (void)fflush(stdout);
    oseo_context_print_thrown(context, result.value);
    (void)fflush(stderr);
    exit(EXIT_FAILURE);
}

/*
 * The body of one agent thread. It initializes the agent's realm, makes
 * itself ready ahead of the main agent that started it, and once it holds
 * the turn evaluates its program. An abrupt completion of an agent ends
 * the process with the agent's error, because a test that lost an agent
 * could otherwise only hang. A finished agent destroys its realm while it
 * still holds the turn and then passes the turn on for good.
 */
static void *agent_thread(void *argument) {
    Agent *self = argument;
    AgentCluster *cluster = self->cluster;
    OseoContext context;
    oseo_context_init(
        &context,
        self->program->source_id,
        self->program->source_id_length
    );
    context.agent = self;
    if (!oseo_clock_open(&context)) {
        (void)fflush(stdout);
        (void)fwrite(
            context.source_id,
            1u,
            context.source_id_length,
            stderr
        );
        (void)fprintf(
            stderr,
            ": error[OSEO2001]: Cross-agent wakeup is unavailable.\n"
        );
        exit(EXIT_FAILURE);
    }
    cluster_lock(cluster);
    self->context = &context;
    self->state = AGENT_READY;
    ready_push(cluster, self);
    agent_make_ready(cluster->main);
    cluster_dispatch(cluster);
    OseoResult result = agent_await_turn(&context, self, 0u, NULL, NULL);
    cluster_unlock(cluster);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = install_host(&context, false);
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = self->program->entry(&context);
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        agent_report_failure(&context, result);
    }
    cluster_lock(cluster);
    agent_discard_work(cluster, self);
    cluster_unlock(cluster);
    context.agent = NULL;
    oseo_context_destroy(&context);
    cluster_lock(cluster);
    self->context = NULL;
    self->state = AGENT_FINISHED;
    cluster->running = NULL;
    cluster_dispatch(cluster);
    cluster_check_progress(cluster, self);
    cluster_unlock(cluster);
    return NULL;
}

/*
 * Joins and releases every agent that has finished. An agent marks itself
 * finished in its last critical section and touches nothing shared after
 * it, so the join outside the lock only waits for its thread to return.
 * The main agent reaps before each start, so a case that starts agents one
 * after another holds at most the threads of the agents still running.
 */
static void cluster_reap(AgentCluster *cluster) {
    Agent *finished = NULL;
    cluster_lock(cluster);
    Agent **link = &cluster->agents_head;
    Agent *previous = NULL;
    while (*link != NULL) {
        Agent *agent = *link;
        if (agent->state != AGENT_FINISHED) {
            previous = agent;
            link = &agent->next;
            continue;
        }
        *link = agent->next;
        if (cluster->agents_tail == agent) cluster->agents_tail = previous;
        agent->next = finished;
        finished = agent;
    }
    cluster_unlock(cluster);
    while (finished != NULL) {
        Agent *agent = finished;
        finished = agent->next;
        agent_thread_join(agent->thread);
        holes_free(agent->holes, agent->hole_count);
        free(agent);
    }
}

static OseoResult agent_start(
    OseoContext *context,
    Agent *self,
    OseoValue source
) {
    AgentCluster *cluster = self->cluster;
    cluster_reap(cluster);
    if (!is_string(source)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "$262.agent.start needs a source string."
        );
    }
    const OseoString *text = string_object(source);
    const OseoAgentProgram *program = NULL;
    AgentHole *holes = NULL;
    for (size_t index = 0u; index < cluster->program_count; index += 1u) {
        const OseoAgentProgram *candidate = &cluster->programs[index];
        size_t count = candidate->segment_count - 1u;
        AgentHole *values =
            count == 0u ? NULL : calloc(count, sizeof(AgentHole));
        bool failed = false;
        if (count > 0u && values == NULL) failed = true;
        if (!failed && program_matches(candidate, text, values, &failed)) {
            program = candidate;
            holes = values;
            break;
        }
        holes_free(values, count);
        if (failed) {
            return failure(context, "OSEO2001", "Agent allocation failed.");
        }
    }
    if (program == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Agent source text outside the ahead-of-time agent programs "
            "is not admitted."
        );
    }
    size_t hole_count = program->segment_count - 1u;
    if (!oseo_clock_open(context)) {
        holes_free(holes, hole_count);
        return failure(
            context,
            "OSEO2001",
            "Cross-agent wakeup is unavailable."
        );
    }
    Agent *agent = calloc(1u, sizeof(*agent));
    if (agent == NULL) {
        holes_free(holes, hole_count);
        return failure(context, "OSEO2001", "Agent allocation failed.");
    }
    agent->cluster = cluster;
    agent->program = program;
    agent->holes = holes;
    agent->hole_count = hole_count;
    agent->state = AGENT_STARTING;
    cluster_lock(cluster);
    if (!agent_thread_start(&agent->thread, agent_thread, agent)) {
        cluster_unlock(cluster);
        holes_free(holes, hole_count);
        free(agent);
        return failure(context, "OSEO2001", "Agent thread creation failed.");
    }
    if (cluster->agents_tail == NULL) {
        cluster->agents_head = agent;
    } else {
        cluster->agents_tail->next = agent;
    }
    cluster->agents_tail = agent;
    /* The start blocks until the new agent is running. */
    OseoResult result = agent_block(
        context,
        self,
        false,
        0u,
        false,
        NULL,
        NULL
    );
    cluster_unlock(cluster);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

/*
 * $262.agent.broadcast(sab, id). Every agent still evaluating receives
 * the block, and the main agent blocks until each of them has retrieved
 * it, which an agent does once it has registered a callback.
 */
static OseoResult agent_broadcast(
    OseoContext *context,
    Agent *self,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoValue buffer = argument_count > 0u ? arguments[0] : oseo_undefined();
    OseoValue id = argument_count > 1u ? arguments[1] : oseo_undefined();
    if (!is_array_buffer(buffer) || !array_buffer_object(buffer)->shared) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "$262.agent.broadcast needs a SharedArrayBuffer."
        );
    }
    AgentIdKind kind = AGENT_ID_UNDEFINED;
    double number = 0.0;
    uint64_t bits = UINT64_C(0);
    if (is_number(id)) {
        kind = AGENT_ID_NUMBER;
        number = number_value(id);
    } else if (is_bigint(id)) {
        const OseoBigInt *value = bigint_object(id);
        uint64_t magnitude = UINT64_C(0);
        if (value->length > 0u) magnitude = value->limbs[0];
        if (value->length > 1u) {
            magnitude |= (uint64_t)value->limbs[1] << 32u;
        }
        if (value->length > 2u ||
            magnitude > (value->negative ? UINT64_C(0x8000000000000000)
                                         : UINT64_C(0x7fffffffffffffff))) {
            return oseo_internal_throw_error(
                context,
                OSEO_ERROR_RANGE,
                "$262.agent.broadcast id is outside the BigInt64 range."
            );
        }
        kind = AGENT_ID_BIGINT;
        bits = oseo_internal_bigint_to_raw_uint64(id);
    } else if (tag_of(id) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "$262.agent.broadcast id must be a Number or a BigInt."
        );
    }
    OseoSharedBlock *block = array_buffer_object(buffer)->block;
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    size_t delivered = 0u;
    OseoResult result = normal(oseo_undefined());
    for (Agent *agent = cluster->agents_head; agent != NULL;
         agent = agent->next) {
        if (agent->state == AGENT_FINISHED) continue;
        AgentBroadcast *broadcast = malloc(sizeof(*broadcast));
        if (broadcast == NULL) {
            result = failure(
                context,
                "OSEO2001",
                "Agent broadcast allocation failed."
            );
            break;
        }
        oseo_internal_shared_block_retain(block);
        broadcast->next = NULL;
        broadcast->block = block;
        broadcast->id_kind = kind;
        broadcast->id_number = number;
        broadcast->id_bits = bits;
        if (agent->broadcast_tail == NULL) {
            agent->broadcast_head = broadcast;
        } else {
            agent->broadcast_tail->next = broadcast;
        }
        agent->broadcast_tail = broadcast;
        delivered += 1u;
        if (agent->state == AGENT_BLOCKED && agent->wakes_on_work) {
            agent_make_ready(agent);
        }
    }
    if (delivered > 0u) {
        cluster->broadcast_remaining += delivered;
        OseoResult blocked = agent_block(
            context,
            self,
            false,
            0u,
            false,
            NULL,
            NULL
        );
        if (result.status == OSEO_STATUS_NORMAL) result = blocked;
        /* Reaching the turn again means every delivery was retrieved or
         * dropped by an agent that finished first. */
    }
    cluster_unlock(cluster);
    return result;
}

static OseoResult agent_get_report(OseoContext *context, Agent *self) {
    OseoResult result = oseo_internal_agent_yield(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    AgentReport *report = cluster->reports_head;
    if (report != NULL) {
        cluster->reports_head = report->next;
        if (cluster->reports_head == NULL) cluster->reports_tail = NULL;
    }
    cluster_unlock(cluster);
    if (report == NULL) return normal(oseo_null());
    result = oseo_string_from_units(context, report->units, report->length);
    free(report);
    return result;
}

static OseoResult agent_report(
    OseoContext *context,
    Agent *self,
    OseoValue value
) {
    OseoResult result = oseo_to_string(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    const OseoString *text = string_object(result.value);
    if (text->length > (SIZE_MAX - sizeof(AgentReport)) / sizeof(uint16_t)) {
        return failure(context, "OSEO2001", "Agent report allocation failed.");
    }
    AgentReport *report =
        malloc(sizeof(*report) + text->length * sizeof(uint16_t));
    if (report == NULL) {
        return failure(context, "OSEO2001", "Agent report allocation failed.");
    }
    report->next = NULL;
    report->length = text->length;
    if (text->length > 0u) {
        memcpy(report->units, text->units, text->length * sizeof(uint16_t));
    }
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    if (cluster->reports_tail == NULL) {
        cluster->reports_head = report;
    } else {
        cluster->reports_tail->next = report;
    }
    cluster->reports_tail = report;
    cluster_unlock(cluster);
    return normal(oseo_undefined());
}

static OseoResult agent_sleep(
    OseoContext *context,
    Agent *self,
    OseoValue value
) {
    OseoResult result = oseo_internal_to_number(context, value);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    double milliseconds = number_value(result.value);
    if (isnan(milliseconds)) milliseconds = 0.0;
    if (milliseconds == INFINITY) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "$262.agent.sleep needs a finite time."
        );
    }
    uint64_t deadline = 0u;
    result = agent_deadline(context, milliseconds, &deadline);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    AgentCluster *cluster = self->cluster;
    cluster_lock(cluster);
    result = agent_block(context, self, true, deadline, false, NULL, NULL);
    cluster_unlock(cluster);
    return result.status == OSEO_STATUS_NORMAL
        ? normal(oseo_undefined())
        : result;
}

static OseoResult agent_monotonic_now(OseoContext *context, Agent *self) {
    OseoResult result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint64_t now = 0u;
    if (!context->clock_adapter->monotonic(context->clock_state, &now)) {
        return failure(
            context,
            "OSEO2001",
            "The host monotonic clock is unavailable."
        );
    }
    uint64_t origin = self->cluster->origin;
    double elapsed = now > origin ? (double)(now - origin) : 0.0;
    return normal(oseo_number(elapsed / AGENT_NANOSECONDS_PER_MILLISECOND));
}

OseoResult oseo_internal_agent_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    (void)receiver;
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "$262.agent function is not a constructor."
        );
    }
    Agent *self = agent_of(context);
    if (self == NULL) {
        return failure(
            context,
            "OSEO2001",
            "The test262 agent host is not installed."
        );
    }
    OseoValue first = argument_count > 0u ? arguments[0] : oseo_undefined();
    switch (code_id) {
        case OSEO_AGENT_START_CODE_ID:
            return agent_start(context, self, first);
        case OSEO_AGENT_BROADCAST_CODE_ID:
            return agent_broadcast(context, self, argument_count, arguments);
        case OSEO_AGENT_GET_REPORT_CODE_ID:
            return agent_get_report(context, self);
        case OSEO_AGENT_SLEEP_CODE_ID:
            return agent_sleep(context, self, first);
        case OSEO_AGENT_MONOTONIC_NOW_CODE_ID:
            return agent_monotonic_now(context, self);
        case OSEO_AGENT_RECEIVE_BROADCAST_CODE_ID:
            if (!is_callable(first)) {
                return oseo_internal_throw_error(
                    context,
                    OSEO_ERROR_TYPE,
                    "$262.agent.receiveBroadcast needs a function."
                );
            }
            context->agent_broadcast_callback = first;
            return normal(oseo_undefined());
        case OSEO_AGENT_REPORT_CODE_ID:
            return agent_report(context, self, first);
        case OSEO_AGENT_LEAVING_CODE_ID:
            self->leaving = true;
            return normal(oseo_undefined());
        default:
            return oseo_unknown_function(context, code_id);
    }
}


typedef struct {
    const char *name;
    size_t code_id;
    size_t length;
} AgentFunction;

static const AgentFunction main_functions[] = {
    {"start", OSEO_AGENT_START_CODE_ID, 1u},
    {"broadcast", OSEO_AGENT_BROADCAST_CODE_ID, 2u},
    {"getReport", OSEO_AGENT_GET_REPORT_CODE_ID, 0u},
    {"sleep", OSEO_AGENT_SLEEP_CODE_ID, 1u},
    {"monotonicNow", OSEO_AGENT_MONOTONIC_NOW_CODE_ID, 0u},
};

static const AgentFunction agent_functions[] = {
    {"receiveBroadcast", OSEO_AGENT_RECEIVE_BROADCAST_CODE_ID, 1u},
    {"report", OSEO_AGENT_REPORT_CODE_ID, 1u},
    {"leaving", OSEO_AGENT_LEAVING_CODE_ID, 0u},
    {"sleep", OSEO_AGENT_SLEEP_CODE_ID, 1u},
    {"monotonicNow", OSEO_AGENT_MONOTONIC_NOW_CODE_ID, 0u},
};

static OseoResult define_host_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value
) {
    OseoValue slots[3] = {object, value, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 3u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_ascii_string(context, name);
    slots[2] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_define(
            context,
            slots[0],
            slots[2],
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult create_host_function(
    OseoContext *context,
    const AgentFunction *entry
) {
    size_t name_length = strlen(entry->name);
    uint16_t units[24];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)entry->name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            entry->code_id,
            environment,
            units,
            name_length,
            entry->length,
            OSEO_FUNCTION_INTERNAL,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Installs `$262` on this realm's global object: an ordinary object whose
 * `agent` object holds the main or the agent function set. Both are
 * writable and configurable, so a harness include can replace a member as
 * the upstream atomicsHelper.js replaces `getReport`.
 */
static OseoResult install_host(OseoContext *context, bool main) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_this_value(context, oseo_undefined());
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_intrinsic(
            context,
            OSEO_INTRINSIC_OBJECT_PROTOTYPE
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[1]);
        frame.slots[1] = result.value;
    }
    const AgentFunction *functions = main ? main_functions : agent_functions;
    size_t count = main
        ? sizeof(main_functions) / sizeof(*main_functions)
        : sizeof(agent_functions) / sizeof(*agent_functions);
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < count;
         index += 1u) {
        result = create_host_function(context, &functions[index]);
        frame.slots[3] = result.value;
        if (result.status == OSEO_STATUS_NORMAL) {
            result = define_host_property(
                context,
                frame.slots[1],
                functions[index].name,
                frame.slots[3]
            );
        }
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_host_property(
            context,
            frame.slots[2],
            "agent",
            frame.slots[1]
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_host_property(
            context,
            frame.slots[0],
            "$262",
            frame.slots[2]
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

OseoResult oseo_test262_host_install(
    OseoContext *context,
    const OseoAgentProgram *programs,
    size_t program_count
) {
    if (context->agent != NULL) {
        return failure(
            context,
            "OSEO2001",
            "The test262 agent host is already installed."
        );
    }
    AgentCluster *cluster = calloc(1u, sizeof(*cluster));
    Agent *main = calloc(1u, sizeof(*main));
    if (cluster == NULL || main == NULL ||
        !agent_mutex_init(&cluster->lock)) {
        free(cluster);
        free(main);
        return failure(context, "OSEO2001", "Agent cluster allocation failed.");
    }
    OseoResult result = oseo_internal_clock_start(context);
    uint64_t origin = 0u;
    if (result.status == OSEO_STATUS_NORMAL &&
        !context->clock_adapter->monotonic(context->clock_state, &origin)) {
        result = failure(
            context,
            "OSEO2001",
            "The host monotonic clock is unavailable."
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        agent_mutex_destroy(&cluster->lock);
        free(cluster);
        free(main);
        return result;
    }
    cluster->origin = origin;
    cluster->programs = programs;
    cluster->program_count = program_count;
    cluster->main = main;
    cluster->running = main;
    main->cluster = cluster;
    main->context = context;
    main->state = AGENT_RUNNING;
    main->main = true;
    context->agent = main;
    return install_host(context, true);
}

OseoResult oseo_agent_hole(OseoContext *context, size_t index) {
    const Agent *self = agent_of(context);
    if (self == NULL || index >= self->hole_count) {
        return failure(
            context,
            "OSEO2001",
            "The agent program has no such source hole."
        );
    }
    const AgentHole *hole = &self->holes[index];
    if (hole->bigint) return oseo_bigint_literal(context, hole->digits, 10u);
    return normal(oseo_number(hole->number));
}

OseoResult oseo_agent_function_set_source(
    OseoContext *context,
    OseoValue function_value,
    const OseoAgentSegment *runs,
    size_t run_count,
    const size_t *holes
) {
    const Agent *self = agent_of(context);
    size_t length = 0u;
    for (size_t index = 0u; index < run_count; index += 1u) {
        length += runs[index].length;
        if (index + 1u == run_count) break;
        if (self == NULL || holes[index] >= self->hole_count) {
            return failure(
                context,
                "OSEO2001",
                "The agent program has no such source hole."
            );
        }
        const AgentHole *hole = &self->holes[holes[index]];
        length += strlen(hole->digits) + (hole->bigint ? 1u : 0u);
    }
    uint16_t *units = malloc((length == 0u ? 1u : length) * sizeof(uint16_t));
    if (units == NULL) {
        return failure(
            context,
            "OSEO2001",
            "Function source allocation failed."
        );
    }
    size_t position = 0u;
    for (size_t index = 0u; index < run_count; index += 1u) {
        if (runs[index].length > 0u) {
            memcpy(
                units + position,
                runs[index].units,
                runs[index].length * sizeof(uint16_t)
            );
            position += runs[index].length;
        }
        if (index + 1u == run_count) break;
        const AgentHole *hole = &self->holes[holes[index]];
        for (const char *digit = hole->digits; *digit != '\0'; digit += 1) {
            units[position] = (uint16_t)(unsigned char)*digit;
            position += 1u;
        }
        if (hole->bigint) {
            units[position] = (uint16_t)'n';
            position += 1u;
        }
    }
    OseoResult result = oseo_function_set_source(
        context,
        function_value,
        units,
        length
    );
    free(units);
    return result;
}
