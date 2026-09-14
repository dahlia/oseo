#ifndef OSEO_DETERMINISTIC_CLOCK_H
#define OSEO_DETERMINISTIC_CLOCK_H

#include "oseo_runtime.h"

#include <stdatomic.h>
#include <stdio.h>

/*
 * The deterministic clock adapter of ADR 0025, the semantic oracle for the
 * scheduler's clock boundary.
 *
 * It implements OseoClockAdapter over two independent injected values: a
 * monotonic reading in nanoseconds and an epoch real-time reading in
 * milliseconds. A wait never sleeps. Each one consumes the next scripted
 * step, which may fail it, return a spurious wakeup halfway to the
 * deadline, resume a chosen number of nanoseconds late, or move real time
 * forward or backward as the wait returns. With an empty script every wait
 * resumes exactly at its deadline, which is the logical clock of ADR 0012.
 *
 * The functions below that change the clocks directly are synthetic test
 * commands. They belong to this adapter alone; a platform adapter
 * implements none of them.
 */

typedef struct {
    /* Nanoseconds past the deadline at which a completed wait resumes. */
    uint64_t late;
    /* Milliseconds added to real time when the wait returns. */
    double jump;
    /* Returns a wakeup halfway to the deadline instead of reaching it. */
    bool spurious;
    /* Reports a failed wait without changing either clock. */
    bool fail;
} DeterministicWait;

typedef struct {
    uint64_t monotonic;
    double real_time;
    const DeterministicWait *script;
    size_t script_length;
    size_t waits;
    /* Written by `wake`, which another thread may call. */
    atomic_bool pending_wakeup;
    bool monotonic_available;
    bool real_time_available;
    bool closed;
    FILE *trace;
} DeterministicClock;

extern const OseoClockAdapter deterministic_clock_adapter;

void deterministic_clock_init(
    DeterministicClock *clock,
    uint64_t monotonic,
    double real_time,
    const DeterministicWait *script,
    size_t script_length,
    FILE *trace
);
void deterministic_clock_set_real_time(
    DeterministicClock *clock,
    double real_time
);
void deterministic_clock_advance(
    DeterministicClock *clock,
    uint64_t nanoseconds
);

#endif
