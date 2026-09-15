/*
 * Feature-test macros must precede every system header, including the
 * ones runtime_internal.h includes, so they come before it here. This
 * is the one runtime translation unit that asks for operating-system
 * interfaces beyond C11.
 */
#if defined(__linux__)
#define _GNU_SOURCE
#elif defined(__APPLE__)
#define _DARWIN_C_SOURCE
#endif

#include "runtime_internal.h"

#include <errno.h>
#include <stdlib.h>
#include <time.h>

#if defined(__linux__) || defined(__APPLE__)
#include <fcntl.h>
#include <limits.h>
#include <poll.h>
#include <unistd.h>
#endif
#if defined(__linux__)
#include <sys/eventfd.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif

/*
 * The platform clock adapter that ADR 0025 selects for the supported
 * targets.
 *
 * Linux reads CLOCK_MONOTONIC and waits in `ppoll` on an eventfd. macOS
 * reads CLOCK_UPTIME_RAW, which like Linux CLOCK_MONOTONIC does not
 * advance while the system sleeps, and waits in `kevent` on an
 * EVFILT_USER event. Both read epoch real time from CLOCK_REALTIME. When
 * the primary wakeup facility cannot be created, the adapter falls back
 * to a nonblocking self-pipe waited on with `poll`; when no descriptor
 * can be created at all, it sleeps toward the deadline and reports
 * cross-thread wakeup as absent. A real-time failure falls back to the
 * C11 `time` function at whole-second resolution. A missing monotonic
 * clock has no fallback: substituting real time for it would let a
 * wall-clock adjustment move deadlines, so the scheduler reports it as an
 * owned failure instead.
 *
 * The adapter never starts a thread, never polls without blocking, and
 * holds nothing that outlives `close`. Any other operating system gets
 * no monotonic clock and a C11 real-time read, so a timer there fails
 * with an owned diagnostic rather than misbehaving.
 */

typedef enum {
    PLATFORM_WAKEUP_NONE = 0,
    PLATFORM_WAKEUP_PRIMARY = 1,
    PLATFORM_WAKEUP_PIPE = 2,
} PlatformWakeup;

typedef struct {
    unsigned restrictions;
    /*
     * Whether real time still comes from CLOCK_REALTIME. It is chosen at
     * open and cleared the first time that read fails, so the capability
     * record names the facility that actually answers. Only the realm's
     * own thread reads real time, so no waker races this field.
     */
    bool real_time_primary;
    PlatformWakeup wakeup;
    int wait_descriptor;
    int wake_descriptor;
} PlatformClock;

#define PLATFORM_RESTRICTION_MASK \
    (OSEO_CLOCK_RESTRICT_MONOTONIC | OSEO_CLOCK_RESTRICT_REAL_TIME | \
     OSEO_CLOCK_RESTRICT_PRIMARY_WAKEUP | OSEO_CLOCK_RESTRICT_PIPE_WAKEUP)
#define PLATFORM_UNALLOCATED(bits) \
    {(bits), false, PLATFORM_WAKEUP_NONE, -1, -1}

/*
 * The states used when the adapter cannot allocate its own, one per
 * restriction set so an allocation failure never lifts a restriction.
 * Each has no wakeup facility, which selects the sleep fallback. They are
 * never written, so every realm that reaches one may share it, and
 * `close` has nothing to release for them.
 */
static PlatformClock unallocated_clocks[PLATFORM_RESTRICTION_MASK + 1u] = {
    PLATFORM_UNALLOCATED(0u),
    PLATFORM_UNALLOCATED(1u),
    PLATFORM_UNALLOCATED(2u),
    PLATFORM_UNALLOCATED(3u),
    PLATFORM_UNALLOCATED(4u),
    PLATFORM_UNALLOCATED(5u),
    PLATFORM_UNALLOCATED(6u),
    PLATFORM_UNALLOCATED(7u),
    PLATFORM_UNALLOCATED(8u),
    PLATFORM_UNALLOCATED(9u),
    PLATFORM_UNALLOCATED(10u),
    PLATFORM_UNALLOCATED(11u),
    PLATFORM_UNALLOCATED(12u),
    PLATFORM_UNALLOCATED(13u),
    PLATFORM_UNALLOCATED(14u),
    PLATFORM_UNALLOCATED(15u),
};

static bool is_unallocated(const PlatformClock *clock) {
    for (size_t index = 0u; index <= PLATFORM_RESTRICTION_MASK; index += 1u) {
        if (clock == &unallocated_clocks[index]) return true;
    }
    return false;
}

#if defined(__linux__) || defined(__APPLE__)

#define PLATFORM_NANOSECONDS_PER_SECOND UINT64_C(1000000000)
#define PLATFORM_NANOSECONDS_PER_MILLISECOND UINT64_C(1000000)

#if defined(__APPLE__)
#define PLATFORM_MONOTONIC_CLOCK CLOCK_UPTIME_RAW
#define PLATFORM_MONOTONIC_NAME "clock_gettime(CLOCK_UPTIME_RAW)"
#define PLATFORM_PRIMARY_WAIT_NAME "kevent"
#define PLATFORM_PRIMARY_WAKEUP_NAME "EVFILT_USER"
#define PLATFORM_BACKEND_NAME "macos-kqueue"
#else
#define PLATFORM_MONOTONIC_CLOCK CLOCK_MONOTONIC
#define PLATFORM_MONOTONIC_NAME "clock_gettime(CLOCK_MONOTONIC)"
#define PLATFORM_PRIMARY_WAIT_NAME "ppoll"
#define PLATFORM_PRIMARY_WAKEUP_NAME "eventfd"
#define PLATFORM_BACKEND_NAME "linux-eventfd"
#endif

static PlatformClock *platform_clock(void *state) {
    return state == NULL ? &unallocated_clocks[0] : (PlatformClock *)state;
}

static bool timespec_nanoseconds(const struct timespec *time, uint64_t *out) {
    if (time->tv_sec < 0 || time->tv_nsec < 0 ||
        (uint64_t)time->tv_nsec >= PLATFORM_NANOSECONDS_PER_SECOND ||
        (uint64_t)time->tv_sec >
            (UINT64_MAX - (uint64_t)time->tv_nsec) /
                PLATFORM_NANOSECONDS_PER_SECOND) {
        return false;
    }
    *out = (uint64_t)time->tv_sec * PLATFORM_NANOSECONDS_PER_SECOND +
        (uint64_t)time->tv_nsec;
    return true;
}

static struct timespec nanoseconds_timespec(uint64_t nanoseconds) {
    struct timespec time;
    uint64_t seconds = nanoseconds / PLATFORM_NANOSECONDS_PER_SECOND;
    /*
     * time_t is at least 64 bits wide on every supported target, where
     * UINT64_MAX nanoseconds is about 584 years; the clamp only keeps a
     * narrower time_t from wrapping.
     */
    if (seconds > (uint64_t)INT32_MAX && sizeof(time_t) < 8u) {
        seconds = (uint64_t)INT32_MAX;
    }
    time.tv_sec = (time_t)seconds;
    time.tv_nsec = (long)(nanoseconds % PLATFORM_NANOSECONDS_PER_SECOND);
    return time;
}

static bool platform_monotonic(void *state, uint64_t *nanoseconds) {
    PlatformClock *clock = platform_clock(state);
    if ((clock->restrictions & OSEO_CLOCK_RESTRICT_MONOTONIC) != 0u) {
        return false;
    }
    struct timespec now;
    if (clock_gettime(PLATFORM_MONOTONIC_CLOCK, &now) != 0) return false;
    return timespec_nanoseconds(&now, nanoseconds);
}

/*
 * The shared unallocated states are never written, so for them the selection
 * is observed again on each call instead of being remembered.
 */
static bool platform_real_time_primary(const PlatformClock *clock) {
    if (!is_unallocated(clock)) return clock->real_time_primary;
    struct timespec now;
    return (clock->restrictions & OSEO_CLOCK_RESTRICT_REAL_TIME) == 0u &&
        clock_gettime(CLOCK_REALTIME, &now) == 0;
}

static bool platform_real_time(void *state, double *milliseconds) {
    PlatformClock *clock = platform_clock(state);
    if (platform_real_time_primary(clock)) {
        struct timespec now;
        if (clock_gettime(CLOCK_REALTIME, &now) == 0) {
            /*
             * Whole milliseconds, rounded toward negative infinity for a
             * reading before the epoch, as a time value requires.
             */
            long long seconds = (long long)now.tv_sec;
            long long millis = (long long)(now.tv_nsec / 1000000L);
            *milliseconds = (double)seconds * 1000.0 + (double)millis;
            return true;
        }
        if (!is_unallocated(clock)) clock->real_time_primary = false;
    }
    time_t seconds = time(NULL);
    if (seconds == (time_t)-1) return false;
    *milliseconds = (double)seconds * 1000.0;
    return true;
}

static bool remaining_until(
    uint64_t deadline,
    uint64_t *remaining,
    bool *expired
) {
    uint64_t now = 0u;
    struct timespec reading;
    if (clock_gettime(PLATFORM_MONOTONIC_CLOCK, &reading) != 0 ||
        !timespec_nanoseconds(&reading, &now)) {
        return false;
    }
    *expired = now >= deadline;
    *remaining = *expired ? 0u : deadline - now;
    return true;
}

static void drain_descriptor(int descriptor) {
    unsigned char buffer[64];
    for (;;) {
        ssize_t count = read(descriptor, buffer, sizeof(buffer));
        if (count > 0) continue;
        if (count < 0 && errno == EINTR) continue;
        break;
    }
}

static OseoClockWaitResult wait_primary(
    PlatformClock *clock,
    bool has_deadline,
    uint64_t remaining
) {
    struct timespec timeout = nanoseconds_timespec(remaining);
#if defined(__APPLE__)
    struct kevent event;
    int count = kevent(
        clock->wait_descriptor,
        NULL,
        0,
        &event,
        1,
        has_deadline ? &timeout : NULL
    );
#else
    struct pollfd descriptor = {clock->wait_descriptor, POLLIN, 0};
    int count = ppoll(&descriptor, 1u, has_deadline ? &timeout : NULL, NULL);
    if (count > 0) drain_descriptor(clock->wait_descriptor);
#endif
    if (count == 0) return OSEO_CLOCK_WAIT_DEADLINE;
    if (count > 0 || errno == EINTR) return OSEO_CLOCK_WAIT_WAKEUP;
    return OSEO_CLOCK_WAIT_FAILED;
}

static OseoClockWaitResult wait_pipe(
    PlatformClock *clock,
    bool has_deadline,
    uint64_t remaining
) {
    int timeout = -1;
    if (has_deadline) {
        uint64_t whole = remaining / PLATFORM_NANOSECONDS_PER_MILLISECOND;
        /* Round up so that poll never returns before the deadline. */
        uint64_t milliseconds = whole +
            (remaining % PLATFORM_NANOSECONDS_PER_MILLISECOND == 0u ? 0u : 1u);
        timeout = milliseconds > (uint64_t)INT_MAX
            ? INT_MAX
            : (int)milliseconds;
    }
    struct pollfd descriptor = {clock->wait_descriptor, POLLIN, 0};
    int count = poll(&descriptor, 1u, timeout);
    if (count > 0) drain_descriptor(clock->wait_descriptor);
    if (count == 0) return OSEO_CLOCK_WAIT_DEADLINE;
    if (count > 0 || errno == EINTR) return OSEO_CLOCK_WAIT_WAKEUP;
    return OSEO_CLOCK_WAIT_FAILED;
}

static OseoClockWaitResult wait_sleep(uint64_t deadline, uint64_t remaining) {
#if defined(__APPLE__)
    (void)deadline;
    struct timespec interval = nanoseconds_timespec(remaining);
    if (nanosleep(&interval, NULL) == 0) return OSEO_CLOCK_WAIT_DEADLINE;
    return errno == EINTR ? OSEO_CLOCK_WAIT_WAKEUP : OSEO_CLOCK_WAIT_FAILED;
#else
    (void)remaining;
    struct timespec absolute = nanoseconds_timespec(deadline);
    int error = clock_nanosleep(
        PLATFORM_MONOTONIC_CLOCK,
        TIMER_ABSTIME,
        &absolute,
        NULL
    );
    if (error == 0) return OSEO_CLOCK_WAIT_DEADLINE;
    return error == EINTR ? OSEO_CLOCK_WAIT_WAKEUP : OSEO_CLOCK_WAIT_FAILED;
#endif
}

static OseoClockWaitResult platform_wait(
    void *state,
    bool has_deadline,
    uint64_t deadline
) {
    PlatformClock *clock = platform_clock(state);
    uint64_t remaining = 0u;
    if (has_deadline) {
        bool expired = false;
        if ((clock->restrictions & OSEO_CLOCK_RESTRICT_MONOTONIC) != 0u ||
            !remaining_until(deadline, &remaining, &expired)) {
            return OSEO_CLOCK_WAIT_FAILED;
        }
        if (expired) return OSEO_CLOCK_WAIT_DEADLINE;
    }
    switch (clock->wakeup) {
    case PLATFORM_WAKEUP_PRIMARY:
        return wait_primary(clock, has_deadline, remaining);
    case PLATFORM_WAKEUP_PIPE:
        return wait_pipe(clock, has_deadline, remaining);
    case PLATFORM_WAKEUP_NONE:
    default:
        /* Nothing could end an indefinite wait without a wakeup facility. */
        if (!has_deadline) return OSEO_CLOCK_WAIT_FAILED;
        return wait_sleep(deadline, remaining);
    }
}

static bool platform_wake(void *state) {
    PlatformClock *clock = platform_clock(state);
    switch (clock->wakeup) {
    case PLATFORM_WAKEUP_PRIMARY: {
#if defined(__APPLE__)
        struct kevent event;
        EV_SET(&event, 1u, EVFILT_USER, 0, NOTE_TRIGGER, 0, NULL);
        for (;;) {
            if (kevent(clock->wake_descriptor, &event, 1, NULL, 0, NULL) == 0) {
                return true;
            }
            if (errno != EINTR) return false;
        }
#else
        uint64_t one = 1u;
        for (;;) {
            ssize_t count = write(clock->wake_descriptor, &one, sizeof(one));
            if (count == (ssize_t)sizeof(one)) return true;
            /* A saturated counter already holds a pending wakeup. */
            if (count < 0 && errno == EAGAIN) return true;
            if (count < 0 && errno == EINTR) continue;
            return false;
        }
#endif
    }
    case PLATFORM_WAKEUP_PIPE: {
        unsigned char byte = 1u;
        for (;;) {
            ssize_t count = write(clock->wake_descriptor, &byte, 1u);
            if (count == 1) return true;
            /* A full pipe already holds a pending wakeup. */
            if (count < 0 && errno == EAGAIN) return true;
            if (count < 0 && errno == EINTR) continue;
            return false;
        }
    }
    case PLATFORM_WAKEUP_NONE:
    default:
        return false;
    }
}

static void platform_describe(
    void *state,
    OseoClockCapabilities *capabilities
) {
    PlatformClock *clock = platform_clock(state);
    capabilities->backend = PLATFORM_BACKEND_NAME;
    capabilities->monotonic =
        (clock->restrictions & OSEO_CLOCK_RESTRICT_MONOTONIC) != 0u
            ? NULL
            : PLATFORM_MONOTONIC_NAME;
    capabilities->real_time = platform_real_time_primary(clock)
        ? "clock_gettime(CLOCK_REALTIME)"
        : "time";
    switch (clock->wakeup) {
    case PLATFORM_WAKEUP_PRIMARY:
        capabilities->wait = PLATFORM_PRIMARY_WAIT_NAME;
        capabilities->wakeup = PLATFORM_PRIMARY_WAKEUP_NAME;
        break;
    case PLATFORM_WAKEUP_PIPE:
        capabilities->wait = "poll";
        capabilities->wakeup = "pipe";
        break;
    case PLATFORM_WAKEUP_NONE:
    default:
#if defined(__APPLE__)
        capabilities->wait = "nanosleep";
#else
        capabilities->wait = "clock_nanosleep";
#endif
        capabilities->wakeup = NULL;
        break;
    }
    capabilities->fallback = clock->wakeup != PLATFORM_WAKEUP_PRIMARY ||
        !platform_real_time_primary(clock);
}

static void close_descriptor(int descriptor) {
    if (descriptor >= 0) (void)close(descriptor);
}

static void platform_close(void *state) {
    PlatformClock *clock = platform_clock(state);
    if (is_unallocated(clock)) return;
    close_descriptor(clock->wait_descriptor);
    if (clock->wake_descriptor != clock->wait_descriptor) {
        close_descriptor(clock->wake_descriptor);
    }
    free(clock);
}

static bool open_primary(PlatformClock *clock) {
#if defined(__APPLE__)
    int descriptor = kqueue();
    if (descriptor < 0) return false;
    struct kevent event;
    EV_SET(&event, 1u, EVFILT_USER, EV_ADD | EV_CLEAR, 0, 0, NULL);
    if (kevent(descriptor, &event, 1, NULL, 0, NULL) != 0) {
        (void)close(descriptor);
        return false;
    }
#else
    int descriptor = eventfd(0u, EFD_CLOEXEC | EFD_NONBLOCK);
    if (descriptor < 0) return false;
#endif
    clock->wait_descriptor = descriptor;
    clock->wake_descriptor = descriptor;
    return true;
}

static bool configure_pipe_end(int descriptor) {
    int descriptor_flags = fcntl(descriptor, F_GETFD);
    int status_flags = fcntl(descriptor, F_GETFL);
    return descriptor_flags >= 0 && status_flags >= 0 &&
        fcntl(descriptor, F_SETFD, descriptor_flags | FD_CLOEXEC) == 0 &&
        fcntl(descriptor, F_SETFL, status_flags | O_NONBLOCK) == 0;
}

static bool open_pipe(PlatformClock *clock) {
    int descriptors[2];
    if (pipe(descriptors) != 0) return false;
    if (!configure_pipe_end(descriptors[0]) ||
        !configure_pipe_end(descriptors[1])) {
        (void)close(descriptors[0]);
        (void)close(descriptors[1]);
        return false;
    }
    clock->wait_descriptor = descriptors[0];
    clock->wake_descriptor = descriptors[1];
    return true;
}

static const OseoClockAdapter platform_adapter = {
    platform_monotonic,
    platform_real_time,
    platform_wait,
    platform_wake,
    platform_describe,
    platform_close,
};

static void select_facilities(PlatformClock *clock) {
    struct timespec now;
    clock->real_time_primary =
        (clock->restrictions & OSEO_CLOCK_RESTRICT_REAL_TIME) == 0u &&
        clock_gettime(CLOCK_REALTIME, &now) == 0;
    if ((clock->restrictions & OSEO_CLOCK_RESTRICT_PRIMARY_WAKEUP) == 0u &&
        open_primary(clock)) {
        clock->wakeup = PLATFORM_WAKEUP_PRIMARY;
    } else if ((clock->restrictions & OSEO_CLOCK_RESTRICT_PIPE_WAKEUP) == 0u &&
               open_pipe(clock)) {
        clock->wakeup = PLATFORM_WAKEUP_PIPE;
    }
}

#else

static bool unsupported_monotonic(void *state, uint64_t *nanoseconds) {
    (void)state;
    (void)nanoseconds;
    return false;
}

/*
 * `time` is already the recorded real-time fallback, so the restriction
 * that selects it on a supported target changes nothing here.
 */
static bool unsupported_real_time(void *state, double *milliseconds) {
    (void)state;
    time_t seconds = time(NULL);
    if (seconds == (time_t)-1) return false;
    *milliseconds = (double)seconds * 1000.0;
    return true;
}

static OseoClockWaitResult unsupported_wait(
    void *state,
    bool has_deadline,
    uint64_t deadline
) {
    (void)state;
    (void)has_deadline;
    (void)deadline;
    return OSEO_CLOCK_WAIT_FAILED;
}

static bool unsupported_wake(void *state) {
    (void)state;
    return false;
}

static void unsupported_describe(
    void *state,
    OseoClockCapabilities *capabilities
) {
    (void)state;
    capabilities->backend = "unsupported";
    capabilities->monotonic = NULL;
    capabilities->real_time = "time";
    capabilities->wait = NULL;
    capabilities->wakeup = NULL;
    capabilities->fallback = true;
}

static void unsupported_close(void *state) {
    if (state != NULL && !is_unallocated((PlatformClock *)state)) free(state);
}

static const OseoClockAdapter platform_adapter = {
    unsupported_monotonic,
    unsupported_real_time,
    unsupported_wait,
    unsupported_wake,
    unsupported_describe,
    unsupported_close,
};

static void select_facilities(PlatformClock *clock) {
    (void)clock;
}

#endif

const OseoClockAdapter *oseo_internal_platform_clock_open(
    unsigned restrictions,
    void **state
) {
    PlatformClock *clock = malloc(sizeof(*clock));
    if (clock == NULL) {
        *state = &unallocated_clocks[restrictions & PLATFORM_RESTRICTION_MASK];
        return &platform_adapter;
    }
    *state = clock;
    clock->restrictions = restrictions;
    clock->real_time_primary = false;
    clock->wakeup = PLATFORM_WAKEUP_NONE;
    clock->wait_descriptor = -1;
    clock->wake_descriptor = -1;
    select_facilities(clock);
    return &platform_adapter;
}
