#include "runtime_internal.h"

#include <math.h>

/*
 * The platform-neutral clock and wakeup boundary of ADR 0025: adapter
 * installation and selection, the realm's monotonic origin and cached
 * scheduler time, deadline waits in whole milliseconds, epoch real-time
 * reads, and cross-thread wakeup.
 *
 * This component never names an operating-system facility. The platform
 * adapter in runtime_clock_posix.c and any embedder-installed adapter
 * reach the scheduler only through OseoClockAdapter, and the scheduler
 * reaches them only through the functions here. Real time and the
 * monotonic domain never meet: no deadline is derived from an epoch
 * reading, and no epoch reading is derived from the monotonic origin.
 */

#define OSEO_NANOSECONDS_PER_MILLISECOND UINT64_C(1000000)

static void clock_open(OseoContext *context) {
    if (context->clock_adapter != NULL) return;
    context->clock_adapter = oseo_internal_platform_clock_open(
        context->clock_restrictions,
        &context->clock_state
    );
}

static void clock_close(OseoContext *context) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    if (adapter != NULL) adapter->close(context->clock_state);
    context->clock_adapter = NULL;
    context->clock_state = NULL;
    context->clock_started = false;
    context->clock_origin = 0u;
}

void oseo_internal_clock_destroy(OseoContext *context) {
    clock_close(context);
}

void oseo_context_set_clock(
    OseoContext *context,
    const OseoClockAdapter *adapter,
    void *state
) {
    clock_close(context);
    context->clock_adapter = adapter;
    context->clock_state = state;
}

void oseo_context_restrict_clock(
    OseoContext *context,
    unsigned restrictions
) {
    context->clock_restrictions = restrictions;
}

bool oseo_clock_open(OseoContext *context) {
    OseoClockCapabilities capabilities;
    oseo_clock_capabilities(context, &capabilities);
    return capabilities.wakeup != NULL;
}

bool oseo_clock_wake(OseoContext *context) {
    const OseoClockAdapter *adapter = context->clock_adapter;
    return adapter != NULL && adapter->wake(context->clock_state);
}

bool oseo_clock_real_time(OseoContext *context, double *milliseconds) {
    clock_open(context);
    double value = 0.0;
    if (!context->clock_adapter->real_time(context->clock_state, &value) ||
        !isfinite(value)) {
        return false;
    }
    *milliseconds = value;
    return true;
}

void oseo_clock_capabilities(
    OseoContext *context,
    OseoClockCapabilities *capabilities
) {
    clock_open(context);
    context->clock_adapter->describe(context->clock_state, capabilities);
}

static OseoResult monotonic_failure(OseoContext *context) {
    return failure(
        context,
        "OSEO2001",
        "The host monotonic clock is unavailable."
    );
}

OseoResult oseo_internal_clock_start(OseoContext *context) {
    if (context->clock_started) return normal(oseo_undefined());
    clock_open(context);
    uint64_t origin = 0u;
    if (!context->clock_adapter->monotonic(context->clock_state, &origin)) {
        return monotonic_failure(context);
    }
    context->clock_origin = origin;
    context->clock_started = true;
    context->clock_milliseconds = 0u;
    return normal(oseo_undefined());
}

OseoResult oseo_internal_clock_now(
    OseoContext *context,
    uint64_t *milliseconds
) {
    OseoResult result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint64_t now = 0u;
    if (!context->clock_adapter->monotonic(context->clock_state, &now)) {
        return monotonic_failure(context);
    }
    uint64_t elapsed = now > context->clock_origin
        ? (now - context->clock_origin) / OSEO_NANOSECONDS_PER_MILLISECOND
        : 0u;
    /*
     * An adapter that reports a smaller reading than an earlier one
     * breaks its own contract; the scheduler still never moves backward.
     */
    *milliseconds = elapsed < context->clock_milliseconds
        ? context->clock_milliseconds
        : elapsed;
    return normal(oseo_undefined());
}

OseoResult oseo_internal_clock_wait_until(
    OseoContext *context,
    uint64_t deadline
) {
    OseoResult result = oseo_internal_clock_start(context);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    uint64_t span = deadline > UINT64_MAX / OSEO_NANOSECONDS_PER_MILLISECOND
        ? UINT64_MAX
        : deadline * OSEO_NANOSECONDS_PER_MILLISECOND;
    uint64_t target = UINT64_MAX - context->clock_origin < span
        ? UINT64_MAX
        : context->clock_origin + span;
    OseoClockWaitResult outcome = context->clock_adapter->wait(
        context->clock_state,
        true,
        target
    );
    if (outcome == OSEO_CLOCK_WAIT_FAILED) {
        return failure(context, "OSEO2001", "The host clock wait failed.");
    }
    return normal(oseo_undefined());
}
