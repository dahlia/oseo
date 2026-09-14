/*
 * The native clock and wakeup probe of PLAN-NIO.md delivery item 3.
 *
 * It opens the platform clock adapter once per facility configuration and
 * drives it only through the OseoClockAdapter table the scheduler uses:
 * monotonic and real-time reads, deadline waits, indefinite waits, wakeups
 * from this thread and another one, capability description, and close.
 * Each configuration prints one JSON object on its own line. The probe is
 * read-only toward the host clocks: it never sets the real-time clock and
 * never induces a discontinuity, and its only comparison for epoch time is
 * the independent C11 `timespec_get` reading of the same host.
 *
 * Usage: clock-wakeup [WAIT_MS]. WAIT_MS, 200 by default, is the idle
 * deadline wait whose CPU time shows whether the adapter busy-polls.
 */
#if defined(__linux__)
#define _GNU_SOURCE
#elif defined(__APPLE__)
#define _DARWIN_C_SOURCE
#endif

#include "oseo_runtime.h"

#include <dirent.h>
#include <inttypes.h>
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/utsname.h>
#include <time.h>

#define PROBE_NANOSECONDS_PER_MILLISECOND UINT64_C(1000000)
#define PROBE_READS 100000u

#if defined(__APPLE__)
#define PROBE_MONOTONIC_CLOCK CLOCK_UPTIME_RAW
#else
#define PROBE_MONOTONIC_CLOCK CLOCK_MONOTONIC
#endif

typedef struct {
    const char *name;
    unsigned restrictions;
} ProbeConfiguration;

typedef struct {
    const OseoClockAdapter *adapter;
    void *state;
    uint64_t delay;
    uint64_t woke_at;
    bool woke;
} ProbeWaker;

static const ProbeConfiguration configurations[] = {
    {"primary", 0u},
    {"pipe-fallback", OSEO_CLOCK_RESTRICT_PRIMARY_WAKEUP},
    {
        "sleep-fallback",
        OSEO_CLOCK_RESTRICT_PRIMARY_WAKEUP | OSEO_CLOCK_RESTRICT_PIPE_WAKEUP,
    },
    {"real-time-fallback", OSEO_CLOCK_RESTRICT_REAL_TIME},
    {"monotonic-absent", OSEO_CLOCK_RESTRICT_MONOTONIC},
};

static uint64_t host_monotonic(void) {
    struct timespec now;
    if (clock_gettime(PROBE_MONOTONIC_CLOCK, &now) != 0) abort();
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

/* Counts entries of a /proc directory, or -1 where the host has none. */
static long count_entries(const char *path) {
    DIR *directory = opendir(path);
    if (directory == NULL) return -1;
    long count = 0;
    struct dirent *entry = NULL;
    while ((entry = readdir(directory)) != NULL) {
        if (entry->d_name[0] != '.') count += 1;
    }
    (void)closedir(directory);
    /* The open directory stream itself holds one descriptor. */
    return strcmp(path, "/proc/self/fd") == 0 ? count - 1 : count;
}

/*
 * The thread count once joined helper threads have left the task list. A
 * joined thread can stay listed for a moment while the kernel reaps it,
 * so the count is reread briefly; a thread the adapter kept would stay.
 */
static long settled_threads(void) {
    long count = count_entries("/proc/self/task");
    for (int attempt = 0; count > 1 && attempt < 1000; attempt += 1) {
        struct timespec interval = {0, 1000000L};
        (void)nanosleep(&interval, NULL);
        count = count_entries("/proc/self/task");
    }
    return count;
}

static void print_string(const char *key, const char *value, bool comma) {
    (void)printf("\"%s\":", key);
    if (value == NULL) {
        (void)fputs("null", stdout);
    } else {
        (void)putchar('"');
        for (const char *cursor = value; *cursor != '\0'; cursor += 1) {
            unsigned char unit = (unsigned char)*cursor;
            if (unit == '"' || unit == '\\') {
                (void)printf("\\%c", unit);
            } else if (unit < 0x20u) {
                (void)printf("\\u%04x", unit);
            } else {
                (void)putchar(unit);
            }
        }
        (void)putchar('"');
    }
    if (comma) (void)putchar(',');
}

static const char *wait_name(OseoClockWaitResult result) {
    switch (result) {
    case OSEO_CLOCK_WAIT_DEADLINE:
        return "deadline";
    case OSEO_CLOCK_WAIT_WAKEUP:
        return "wakeup";
    case OSEO_CLOCK_WAIT_FAILED:
    default:
        return "failed";
    }
}

static long resolution(clockid_t clock) {
    struct timespec value;
    if (clock_getres(clock, &value) != 0) return -1;
    return (long)value.tv_sec * 1000000000L + value.tv_nsec;
}

static void *wake_later(void *argument) {
    ProbeWaker *waker = (ProbeWaker *)argument;
    struct timespec interval = {
        (time_t)(waker->delay / 1000u),
        (long)(waker->delay % 1000u) * 1000000L,
    };
    while (nanosleep(&interval, &interval) != 0) {}
    waker->woke_at = host_monotonic();
    waker->woke = waker->adapter->wake(waker->state);
    return NULL;
}

static void probe_monotonic(
    OseoContext *context,
    const OseoClockCapabilities *capabilities
) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    uint64_t previous = 0u;
    bool available = adapter->monotonic(context->clock_state, &previous);
    bool non_decreasing = available;
    uint64_t started = host_monotonic();
    for (size_t index = 0u; available && index < PROBE_READS; index += 1u) {
        uint64_t reading = 0u;
        if (!adapter->monotonic(context->clock_state, &reading)) {
            available = false;
            break;
        }
        if (reading < previous) non_decreasing = false;
        previous = reading;
    }
    uint64_t spent = host_monotonic() - started;
    (void)printf(
        "\"monotonic\":{\"available\":%s,\"nonDecreasing\":%s,"
        "\"reads\":%u,\"nanosecondsPerRead\":%.1f,"
        "\"resolutionNanoseconds\":%ld},",
        available ? "true" : "false",
        non_decreasing ? "true" : "false",
        PROBE_READS,
        available ? (double)spent / (double)PROBE_READS : 0.0,
        capabilities->monotonic == NULL
            ? -1L
            : resolution(PROBE_MONOTONIC_CLOCK)
    );
}

/*
 * The resolution reported is the selected facility's: the host clock's
 * for clock_gettime, and one second for the C11 `time` fallback.
 */
static void probe_real_time(
    OseoContext *context,
    const OseoClockCapabilities *capabilities
) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    double reading = 0.0;
    struct timespec reference;
    bool available = adapter->real_time(context->clock_state, &reading);
    bool referenced = timespec_get(&reference, TIME_UTC) == TIME_UTC;
    double expected = (double)reference.tv_sec * 1000.0 +
        floor((double)reference.tv_nsec / 1e6);
    uint64_t started = host_monotonic();
    for (size_t index = 0u; available && index < PROBE_READS; index += 1u) {
        double ignored = 0.0;
        (void)adapter->real_time(context->clock_state, &ignored);
    }
    uint64_t spent = host_monotonic() - started;
    (void)printf(
        "\"realTime\":{\"available\":%s,\"integral\":%s,"
        "\"differenceFromTimespecGetMilliseconds\":%.0f,"
        "\"nanosecondsPerRead\":%.1f,\"resolutionNanoseconds\":%ld},",
        available ? "true" : "false",
        available && trunc(reading) == reading ? "true" : "false",
        available && referenced ? fabs(reading - expected) : -1.0,
        available ? (double)spent / (double)PROBE_READS : 0.0,
        capabilities->real_time == NULL
            ? -1L
            : strcmp(capabilities->real_time, "time") == 0
                ? 1000000000L
                : resolution(CLOCK_REALTIME)
    );
}

static uint64_t deadline_after(OseoContext *context, uint64_t milliseconds) {
    uint64_t now = 0u;
    if (!context->clock_adapter->monotonic(context->clock_state, &now)) {
        return 0u;
    }
    return now + milliseconds * PROBE_NANOSECONDS_PER_MILLISECOND;
}

static void probe_deadline_wait(OseoContext *context, uint64_t milliseconds) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    uint64_t deadline = deadline_after(context, milliseconds);
    uint64_t cpu_started = cpu_microseconds();
    uint64_t started = host_monotonic();
    OseoClockWaitResult result = adapter->wait(
        context->clock_state,
        true,
        deadline
    );
    uint64_t elapsed = host_monotonic() - started;
    uint64_t cpu = cpu_microseconds() - cpu_started;
    uint64_t reached = 0u;
    bool read = adapter->monotonic(context->clock_state, &reached);
    (void)printf(
        "\"deadlineWait\":{\"requestedMilliseconds\":%" PRIu64
        ",\"result\":\"%s\",\"reachedDeadline\":%s,"
        "\"elapsedMicroseconds\":%" PRIu64 ",\"cpuMicroseconds\":%" PRIu64
        "},",
        milliseconds,
        wait_name(result),
        read && reached >= deadline ? "true" : "false",
        elapsed / UINT64_C(1000),
        cpu
    );
}

static void probe_pending_wakeup(OseoContext *context) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    bool first_wake = adapter->wake(context->clock_state);
    bool second_wake = adapter->wake(context->clock_state);
    uint64_t deadline = deadline_after(context, 20u);
    uint64_t started = host_monotonic();
    OseoClockWaitResult first = adapter->wait(
        context->clock_state,
        true,
        deadline
    );
    uint64_t first_elapsed = host_monotonic() - started;
    OseoClockWaitResult second = adapter->wait(
        context->clock_state,
        true,
        deadline
    );
    (void)printf(
        "\"pendingWakeup\":{\"accepted\":%s,\"first\":\"%s\","
        "\"firstElapsedMicroseconds\":%" PRIu64 ",\"second\":\"%s\"},",
        first_wake && second_wake ? "true" : "false",
        wait_name(first),
        first_elapsed / UINT64_C(1000),
        wait_name(second)
    );
}

static void probe_cross_thread(
    OseoContext *context,
    bool has_deadline,
    const char *key
) {
    ProbeWaker waker = {
        context->clock_adapter,
        context->clock_state,
        50u,
        0u,
        false,
    };
    pthread_t thread;
    /*
     * Without a wakeup facility the wait can only reach its deadline, so
     * that configuration uses a short one instead of stalling the probe.
     */
    OseoClockCapabilities capabilities;
    oseo_clock_capabilities(context, &capabilities);
    uint64_t deadline = deadline_after(
        context,
        capabilities.wakeup == NULL ? 300u : 5000u
    );
    uint64_t started = host_monotonic();
    if (pthread_create(&thread, NULL, wake_later, &waker) != 0) abort();
    OseoClockWaitResult result = context->clock_adapter->wait(
        context->clock_state,
        has_deadline,
        deadline
    );
    uint64_t returned = host_monotonic();
    if (pthread_join(thread, NULL) != 0) abort();
    /* Consume a wakeup that arrived after a failed or early return. */
    if (waker.woke && result != OSEO_CLOCK_WAIT_WAKEUP) {
        (void)context->clock_adapter->wait(
            context->clock_state,
            true,
            deadline_after(context, 0u)
        );
    }
    uint64_t latency = returned > waker.woke_at && waker.woke_at != 0u
        ? returned - waker.woke_at
        : 0u;
    (void)printf(
        "\"%s\":{\"accepted\":%s,\"result\":\"%s\","
        "\"elapsedMicroseconds\":%" PRIu64
        ",\"wakeLatencyMicroseconds\":%" PRIu64 "},",
        key,
        waker.woke ? "true" : "false",
        wait_name(result),
        (returned - started) / UINT64_C(1000),
        latency / UINT64_C(1000)
    );
}

static void probe_configuration(
    const ProbeConfiguration *configuration,
    uint64_t wait_milliseconds
) {
    long descriptors_before = count_entries("/proc/self/fd");
    OseoContext context;
    oseo_context_init(&context, "clock-wakeup", 12u);
    oseo_context_restrict_clock(&context, configuration->restrictions);
    bool wakeup = oseo_clock_open(&context);
    OseoClockCapabilities capabilities;
    oseo_clock_capabilities(&context, &capabilities);
    long descriptors_open = count_entries("/proc/self/fd");
    (void)printf("{\"configuration\":\"%s\",", configuration->name);
    (void)printf("\"restrictions\":%u,", configuration->restrictions);
    (void)printf("\"capabilities\":{");
    print_string("backend", capabilities.backend, true);
    print_string("monotonic", capabilities.monotonic, true);
    print_string("realTime", capabilities.real_time, true);
    print_string("wait", capabilities.wait, true);
    print_string("wakeup", capabilities.wakeup, true);
    (void)printf(
        "\"fallback\":%s},",
        capabilities.fallback ? "true" : "false"
    );
    (void)printf("\"wakeupAvailable\":%s,", wakeup ? "true" : "false");
    probe_monotonic(&context, &capabilities);
    probe_real_time(&context, &capabilities);
    if (capabilities.monotonic != NULL) {
        probe_deadline_wait(&context, wait_milliseconds);
        probe_pending_wakeup(&context);
        probe_cross_thread(&context, true, "crossThreadWakeup");
        probe_cross_thread(&context, false, "indefiniteWait");
    } else {
        OseoClockWaitResult result = context.clock_adapter->wait(
            context.clock_state,
            true,
            0u
        );
        (void)printf(
            "\"deadlineWait\":{\"result\":\"%s\"},",
            wait_name(result)
        );
    }
    long threads = settled_threads();
    oseo_context_destroy(&context);
    long descriptors_after = count_entries("/proc/self/fd");
    (void)printf(
        "\"shutdown\":{\"threadsBeforeClose\":%ld,"
        "\"descriptorsBefore\":%ld,\"descriptorsOpen\":%ld,"
        "\"descriptorsAfter\":%ld}}\n",
        threads,
        descriptors_before,
        descriptors_open,
        descriptors_after
    );
}

int main(int argc, char **argv) {
    uint64_t wait_milliseconds = 200u;
    if (argc > 1) {
        char *end = NULL;
        wait_milliseconds = strtoull(argv[1], &end, 10);
        if (*end != '\0' || wait_milliseconds == 0u) return 2;
    }
    struct utsname host;
    if (uname(&host) != 0) return 2;
    (void)printf("{\"host\":{");
    print_string("system", host.sysname, true);
    print_string("release", host.release, true);
    print_string("version", host.version, true);
    print_string("machine", host.machine, false);
    (void)printf("}}\n");
    for (size_t index = 0u;
         index < sizeof(configurations) / sizeof(configurations[0]);
         index += 1u) {
        probe_configuration(&configurations[index], wait_milliseconds);
    }
    return 0;
}
