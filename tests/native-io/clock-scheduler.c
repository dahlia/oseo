/*
 * The clock boundary scheduler harness.
 *
 * It reads one schedule from standard input, builds its callbacks as
 * runtime functions, and runs the runtime's own timer queue, microtask
 * checkpoints, and shutdown against either the deterministic adapter or
 * the platform adapter. Every callback prints the scheduler time it
 * observes, so a trace shows task order, microtask order, and the cached
 * monotonic base together with the adapter's waits and real-time reads.
 *
 * Input lines, whitespace separated:
 *
 *   mode deterministic|platform
 *   clock MONOTONIC_NS REAL_MS        deterministic initial readings
 *   step LATE_NS JUMP_MS SPURIOUS FAIL one scripted deterministic wait
 *   unavailable monotonic|real        a deterministic absent capability
 *   restrict BITS                     OSEO_CLOCK_RESTRICT_* bits
 *   measure                           report platform elapsed and CPU time
 *   do NODE timer CHILD DELAY_MS      schedule CHILD with setTimeout
 *   do NODE cancel TARGET             clearTimeout on TARGET's handle
 *   do NODE micro CHILD               queue CHILD as a promise reaction
 *   do NODE real                      read epoch real time
 *   do NODE wake                      request a wakeup on this thread
 *   do NODE advance NS                deterministic monotonic advance
 *   do NODE set-real MS               deterministic real-time jump
 *   do NODE thread-wake MS            platform wakeup from another thread
 *
 * Node 0 is the entry task; every other node runs when the timer or
 * microtask that names it runs.
 */
#if defined(__linux__)
#define _GNU_SOURCE
#elif defined(__APPLE__)
#define _DARWIN_C_SOURCE
#endif

#include "deterministic-clock.h"
#include "oseo_runtime.h"

#include <dirent.h>
#include <inttypes.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <time.h>

#define HARNESS_NODES 128u
#define HARNESS_ACTIONS 512u
#define HARNESS_STEPS 256u
#define HARNESS_THREADS 8u

typedef enum {
    ACTION_TIMER,
    ACTION_CANCEL,
    ACTION_MICRO,
    ACTION_REAL,
    ACTION_WAKE,
    ACTION_ADVANCE,
    ACTION_SET_REAL,
    ACTION_THREAD_WAKE,
} ActionKind;

typedef struct {
    size_t node;
    ActionKind kind;
    size_t target;
    uint64_t amount;
    double value;
} Action;

typedef struct {
    OseoContext *context;
    uint64_t delay;
} ThreadWake;

static Action actions[HARNESS_ACTIONS];
static size_t action_count;
static DeterministicWait steps[HARNESS_STEPS];
static size_t step_count;
static OseoValue handles[HARNESS_NODES];
static DeterministicClock deterministic;
static bool platform_mode;
static pthread_t threads[HARNESS_THREADS];
static ThreadWake thread_wakes[HARNESS_THREADS];
static size_t thread_count;
/* The shared empty callback environment, rooted for the whole run. */
static OseoValue environment_slot[1];

static void fail_input(const char *line) {
    (void)fprintf(stderr, "invalid harness input: %s", line);
    exit(2);
}

static size_t parse_node(const char *token, const char *line) {
    char *end = NULL;
    unsigned long value = token == NULL ? 0ul : strtoul(token, &end, 10);
    if (token == NULL || *end != '\0' || value >= HARNESS_NODES) {
        fail_input(line);
    }
    return (size_t)value;
}

static uint64_t parse_unsigned(const char *token, const char *line) {
    char *end = NULL;
    if (token == NULL) fail_input(line);
    unsigned long long value = strtoull(token, &end, 10);
    if (*end != '\0') fail_input(line);
    return (uint64_t)value;
}

static double parse_double(const char *token, const char *line) {
    char *end = NULL;
    if (token == NULL) fail_input(line);
    double value = strtod(token, &end);
    if (*end != '\0') fail_input(line);
    return value;
}

static void add_action(Action action, const char *line) {
    if (action_count == HARNESS_ACTIONS) fail_input(line);
    actions[action_count] = action;
    action_count += 1u;
}

static void parse_do(char *line, const char *original) {
    const char *delimiters = " \t\r\n";
    size_t node = parse_node(strtok(line, delimiters), original);
    const char *verb = strtok(NULL, delimiters);
    Action action = {node, ACTION_REAL, 0u, 0u, 0.0};
    if (verb == NULL) fail_input(original);
    if (strcmp(verb, "timer") == 0) {
        action.kind = ACTION_TIMER;
        action.target = parse_node(strtok(NULL, delimiters), original);
        action.amount = parse_unsigned(strtok(NULL, delimiters), original);
    } else if (strcmp(verb, "cancel") == 0) {
        action.kind = ACTION_CANCEL;
        action.target = parse_node(strtok(NULL, delimiters), original);
    } else if (strcmp(verb, "micro") == 0) {
        action.kind = ACTION_MICRO;
        action.target = parse_node(strtok(NULL, delimiters), original);
    } else if (strcmp(verb, "real") == 0) {
        action.kind = ACTION_REAL;
    } else if (strcmp(verb, "wake") == 0) {
        action.kind = ACTION_WAKE;
    } else if (strcmp(verb, "advance") == 0) {
        action.kind = ACTION_ADVANCE;
        action.amount = parse_unsigned(strtok(NULL, delimiters), original);
    } else if (strcmp(verb, "set-real") == 0) {
        action.kind = ACTION_SET_REAL;
        action.value = parse_double(strtok(NULL, delimiters), original);
    } else if (strcmp(verb, "thread-wake") == 0) {
        action.kind = ACTION_THREAD_WAKE;
        action.amount = parse_unsigned(strtok(NULL, delimiters), original);
    } else {
        fail_input(original);
    }
    add_action(action, original);
}

static uint64_t host_monotonic(void) {
    struct timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) abort();
    return (uint64_t)now.tv_sec * UINT64_C(1000000000) +
        (uint64_t)now.tv_nsec;
}

static uint64_t cpu_microseconds(void) {
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) != 0) abort();
    return (uint64_t)usage.ru_utime.tv_sec * UINT64_C(1000000) +
        (uint64_t)usage.ru_utime.tv_usec +
        (uint64_t)usage.ru_stime.tv_sec * UINT64_C(1000000) +
        (uint64_t)usage.ru_stime.tv_usec;
}

static long count_threads(void) {
    DIR *directory = opendir("/proc/self/task");
    if (directory == NULL) return -1;
    long count = 0;
    struct dirent *entry = NULL;
    while ((entry = readdir(directory)) != NULL) {
        if (entry->d_name[0] != '.') count += 1;
    }
    (void)closedir(directory);
    return count;
}

/*
 * Prints the thread count after shutdown. A joined helper thread can stay
 * listed for a moment while the kernel reaps it, so the count is reread
 * briefly; a thread the runtime kept alive would stay listed.
 */
static void print_threads(void) {
    long count = count_threads();
    for (int attempt = 0; count > 1 && attempt < 1000; attempt += 1) {
        struct timespec interval = {0, 1000000L};
        (void)nanosleep(&interval, NULL);
        count = count_threads();
    }
    if (count < 0) {
        (void)puts("threads unavailable");
    } else {
        (void)printf("threads %ld\n", count);
    }
}

static void *wake_later(void *argument) {
    ThreadWake *wake = (ThreadWake *)argument;
    struct timespec interval = {
        (time_t)(wake->delay / 1000u),
        (long)(wake->delay % 1000u) * 1000000L,
    };
    while (nanosleep(&interval, &interval) != 0) {}
    if (!oseo_clock_wake(wake->context)) abort();
    return NULL;
}

static OseoResult create_function(OseoContext *context, size_t node) {
    return oseo_function_create(
        context,
        node + 1u,
        environment_slot[0],
        NULL,
        0u,
        0u,
        OSEO_FUNCTION_ORDINARY,
        oseo_undefined(),
        oseo_undefined(),
        OSEO_FUNCTION_NAME_PREFIX_NONE
    );
}

static OseoResult run_node(OseoContext *context, size_t node) {
    (void)printf("run %zu %" PRIu64 "\n", node, context->clock_milliseconds);
    OseoValue slots[2] = {oseo_undefined(), oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = {OSEO_STATUS_NORMAL, oseo_undefined()};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < action_count;
         index += 1u) {
        const Action *action = &actions[index];
        if (action->node != node) continue;
        switch (action->kind) {
        case ACTION_TIMER:
            result = create_function(context, action->target);
            if (result.status != OSEO_STATUS_NORMAL) break;
            slots[0] = result.value;
            slots[1] = oseo_number((double)action->amount);
            result = oseo_set_timeout(context, 2u, slots);
            if (result.status == OSEO_STATUS_NORMAL) {
                handles[action->target] = result.value;
            }
            break;
        case ACTION_CANCEL:
            result = oseo_clear_timeout(context, handles[action->target]);
            break;
        case ACTION_MICRO:
            result = create_function(context, action->target);
            if (result.status != OSEO_STATUS_NORMAL) break;
            slots[0] = result.value;
            result = oseo_promise_resolve(context, oseo_undefined());
            if (result.status != OSEO_STATUS_NORMAL) break;
            slots[1] = result.value;
            result = oseo_promise_then(
                context,
                slots[1],
                slots[0],
                oseo_undefined()
            );
            break;
        case ACTION_REAL: {
            double real_time = 0.0;
            if (oseo_clock_real_time(context, &real_time)) {
                (void)printf("real %zu %.0f\n", node, real_time);
            } else {
                (void)printf("real %zu unavailable\n", node);
            }
            break;
        }
        case ACTION_WAKE:
            (void)printf("wake %zu %d\n", node, oseo_clock_wake(context));
            break;
        case ACTION_ADVANCE:
            if (!platform_mode) {
                deterministic_clock_advance(&deterministic, action->amount);
            }
            break;
        case ACTION_SET_REAL:
            if (!platform_mode) {
                deterministic_clock_set_real_time(
                    &deterministic,
                    action->value
                );
            }
            break;
        case ACTION_THREAD_WAKE:
            if (thread_count == HARNESS_THREADS || !oseo_clock_open(context)) {
                (void)fputs("thread wakeup unavailable\n", stderr);
                exit(4);
            }
            thread_wakes[thread_count].context = context;
            thread_wakes[thread_count].delay = action->amount;
            if (pthread_create(
                    &threads[thread_count],
                    NULL,
                    wake_later,
                    &thread_wakes[thread_count]
                ) != 0) {
                abort();
            }
            thread_count += 1u;
            break;
        }
        slots[0] = oseo_undefined();
        slots[1] = oseo_undefined();
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL
        ? (OseoResult){OSEO_STATUS_NORMAL, oseo_undefined()}
        : result;
}

static OseoResult dispatch(
    OseoContext *context,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    size_t code_id = 0u;
    (void)receiver;
    (void)argument_count;
    (void)arguments;
    (void)new_target;
    OseoResult result = oseo_function_code_id(context, callee, &code_id);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    if (code_id == 0u || code_id > HARNESS_NODES) {
        return oseo_unknown_function(context, code_id);
    }
    return run_node(context, code_id - 1u);
}

int main(void) {
    char line[256];
    uint64_t monotonic = 0u;
    double real_time = 0.0;
    unsigned restrictions = 0u;
    bool measure = false;
    bool monotonic_available = true;
    bool real_time_available = true;
    while (fgets(line, sizeof(line), stdin) != NULL) {
        char copy[256];
        memcpy(copy, line, sizeof(copy));
        const char *delimiters = " \t\r\n";
        const char *command = strtok(copy, delimiters);
        if (command == NULL) continue;
        if (strcmp(command, "mode") == 0) {
            const char *mode = strtok(NULL, delimiters);
            if (mode == NULL) fail_input(line);
            if (strcmp(mode, "platform") == 0) {
                platform_mode = true;
            } else if (strcmp(mode, "deterministic") != 0) {
                fail_input(line);
            }
        } else if (strcmp(command, "clock") == 0) {
            monotonic = parse_unsigned(strtok(NULL, delimiters), line);
            real_time = parse_double(strtok(NULL, delimiters), line);
        } else if (strcmp(command, "step") == 0) {
            if (step_count == HARNESS_STEPS) fail_input(line);
            DeterministicWait *step = &steps[step_count];
            step->late = parse_unsigned(strtok(NULL, delimiters), line);
            step->jump = parse_double(strtok(NULL, delimiters), line);
            step->spurious =
                parse_unsigned(strtok(NULL, delimiters), line) != 0u;
            step->fail = parse_unsigned(strtok(NULL, delimiters), line) != 0u;
            step_count += 1u;
        } else if (strcmp(command, "unavailable") == 0) {
            const char *name = strtok(NULL, delimiters);
            if (name != NULL && strcmp(name, "monotonic") == 0) {
                monotonic_available = false;
            } else if (name != NULL && strcmp(name, "real") == 0) {
                real_time_available = false;
            } else {
                fail_input(line);
            }
        } else if (strcmp(command, "restrict") == 0) {
            restrictions =
                (unsigned)parse_unsigned(strtok(NULL, delimiters), line);
        } else if (strcmp(command, "measure") == 0) {
            measure = true;
        } else if (strcmp(command, "do") == 0) {
            parse_do(copy + strlen(command) + 1u, line);
        } else {
            fail_input(line);
        }
    }
    for (size_t index = 0u; index < HARNESS_NODES; index += 1u) {
        handles[index] = oseo_undefined();
    }

    OseoContext context;
    oseo_context_init(&context, "clock-scheduler", 15u);
    oseo_context_set_function_dispatcher(&context, dispatch);
    if (platform_mode) {
        oseo_context_restrict_clock(&context, restrictions);
    } else {
        deterministic_clock_init(
            &deterministic,
            monotonic,
            real_time,
            steps,
            step_count,
            stdout
        );
        deterministic.monotonic_available = monotonic_available;
        deterministic.real_time_available = real_time_available;
        oseo_context_set_clock(
            &context,
            &deterministic_clock_adapter,
            &deterministic
        );
    }
    environment_slot[0] = oseo_undefined();
    OseoRootFrame environment_frame = {NULL, environment_slot, 1u};
    oseo_roots_push(&context, &environment_frame);
    OseoResult environment = oseo_environment_create(&context, 0u);
    if (environment.status != OSEO_STATUS_NORMAL) abort();
    environment_slot[0] = environment.value;
    uint64_t started = host_monotonic();
    uint64_t cpu_started = cpu_microseconds();
    OseoResult result = run_node(&context, 0u);
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_event_loop_run(&context, oseo_undefined());
    } else {
        result = oseo_entry_task_checkpoint(&context, result);
    }
    for (size_t index = 0u; index < thread_count; index += 1u) {
        if (pthread_join(threads[index], NULL) != 0) abort();
    }
    uint64_t elapsed = host_monotonic() - started;
    uint64_t cpu = cpu_microseconds() - cpu_started;
    if (result.status == OSEO_STATUS_NORMAL) {
        (void)puts("exit 0 none");
    } else {
        (void)printf(
            "exit 1 %s\n",
            context.has_diagnostic ? context.error_code : "thrown"
        );
    }
    if (measure) {
        OseoClockCapabilities capabilities;
        oseo_clock_capabilities(&context, &capabilities);
        (void)printf(
            "capabilities %s %s %s %s %s %d\n",
            capabilities.backend,
            capabilities.monotonic == NULL ? "absent" : capabilities.monotonic,
            capabilities.real_time == NULL ? "absent" : capabilities.real_time,
            capabilities.wait == NULL ? "absent" : capabilities.wait,
            capabilities.wakeup == NULL ? "absent" : capabilities.wakeup,
            capabilities.fallback
        );
        (void)printf("elapsed %" PRIu64 "\n", elapsed / UINT64_C(1000000));
        (void)printf("cpu %" PRIu64 "\n", cpu);
    }
    (void)fflush(stdout);
    oseo_roots_pop(&context, &environment_frame);
    oseo_context_destroy(&context);
    if (measure) print_threads();
    return result.status == OSEO_STATUS_NORMAL ? 0 : 1;
}
