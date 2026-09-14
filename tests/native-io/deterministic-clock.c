#include "deterministic-clock.h"

#include <inttypes.h>

static DeterministicClock *clock_state(void *state) {
    return (DeterministicClock *)state;
}

static bool deterministic_monotonic(void *state, uint64_t *nanoseconds) {
    DeterministicClock *clock = clock_state(state);
    if (!clock->monotonic_available) return false;
    *nanoseconds = clock->monotonic;
    return true;
}

static bool deterministic_real_time(void *state, double *milliseconds) {
    DeterministicClock *clock = clock_state(state);
    if (!clock->real_time_available) return false;
    *milliseconds = clock->real_time;
    return true;
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

static OseoClockWaitResult deterministic_wait(
    void *state,
    bool has_deadline,
    uint64_t deadline
) {
    DeterministicClock *clock = clock_state(state);
    DeterministicWait step = {0u, 0.0, false, false};
    if (clock->waits < clock->script_length) {
        step = clock->script[clock->waits];
    }
    clock->waits += 1u;
    OseoClockWaitResult result = OSEO_CLOCK_WAIT_FAILED;
    if (step.fail) {
        result = OSEO_CLOCK_WAIT_FAILED;
    } else if (atomic_exchange(&clock->pending_wakeup, false)) {
        result = OSEO_CLOCK_WAIT_WAKEUP;
    } else if (!has_deadline) {
        /* Nothing can end this wait, so the oracle reports it. */
        result = OSEO_CLOCK_WAIT_FAILED;
    } else if (step.spurious && clock->monotonic < deadline) {
        clock->monotonic += (deadline - clock->monotonic) / 2u;
        result = OSEO_CLOCK_WAIT_WAKEUP;
    } else {
        uint64_t resumed = UINT64_MAX - deadline < step.late
            ? UINT64_MAX
            : deadline + step.late;
        if (resumed > clock->monotonic) clock->monotonic = resumed;
        result = OSEO_CLOCK_WAIT_DEADLINE;
    }
    if (result != OSEO_CLOCK_WAIT_FAILED) clock->real_time += step.jump;
    if (clock->trace != NULL) {
        (void)fprintf(
            clock->trace,
            "wait %" PRIu64 " %s %" PRIu64 " %.0f\n",
            deadline,
            wait_name(result),
            clock->monotonic,
            clock->real_time
        );
    }
    return result;
}

static bool deterministic_wake(void *state) {
    atomic_store(&clock_state(state)->pending_wakeup, true);
    return true;
}

static void deterministic_describe(
    void *state,
    OseoClockCapabilities *capabilities
) {
    DeterministicClock *clock = clock_state(state);
    capabilities->backend = "deterministic";
    capabilities->monotonic = clock->monotonic_available
        ? "injected"
        : NULL;
    capabilities->real_time = clock->real_time_available
        ? "injected"
        : NULL;
    capabilities->wait = "scripted";
    capabilities->wakeup = "scripted";
    capabilities->fallback = false;
}

static void deterministic_close(void *state) {
    DeterministicClock *clock = clock_state(state);
    clock->closed = true;
    if (clock->trace != NULL) (void)fputs("close\n", clock->trace);
}

const OseoClockAdapter deterministic_clock_adapter = {
    deterministic_monotonic,
    deterministic_real_time,
    deterministic_wait,
    deterministic_wake,
    deterministic_describe,
    deterministic_close,
};

void deterministic_clock_init(
    DeterministicClock *clock,
    uint64_t monotonic,
    double real_time,
    const DeterministicWait *script,
    size_t script_length,
    FILE *trace
) {
    clock->monotonic = monotonic;
    clock->real_time = real_time;
    clock->script = script;
    clock->script_length = script_length;
    clock->waits = 0u;
    atomic_init(&clock->pending_wakeup, false);
    clock->monotonic_available = true;
    clock->real_time_available = true;
    clock->closed = false;
    clock->trace = trace;
}

void deterministic_clock_set_real_time(
    DeterministicClock *clock,
    double real_time
) {
    clock->real_time = real_time;
}

void deterministic_clock_advance(
    DeterministicClock *clock,
    uint64_t nanoseconds
) {
    clock->monotonic = UINT64_MAX - clock->monotonic < nanoseconds
        ? UINT64_MAX
        : clock->monotonic + nanoseconds;
}
