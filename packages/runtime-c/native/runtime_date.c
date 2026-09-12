#include "runtime_internal.h"

#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

/*
 * The Date family: the %Date% constructor with its call and construct
 * behavior, the `now`, `parse`, and `UTC` statics, %Date.prototype% and
 * its forty-four own methods, and the time-value arithmetic of 21.4.1.
 *
 * The realm's local time zone is UTC, so LocalTZA is +0 for every time
 * value and LocalTime and UTC are identities on a finite operand. That
 * is a host choice ECMA-262 permits, and it is the deliberate boundary
 * PLAN-M5.md gives this landing: the clock and wakeup checkpoint in
 * PLAN-NIO.md owns the host time-zone and real-time adapter, and a later
 * integration unit replaces both boundaries at once. Until then the only
 * host facility this component reads is the current epoch time, through
 * `date_current_time_value` alone.
 */

/*
 * 21.4.1.11 and 21.4.1.13 specify MakeTime and MakeDate as IEEE 754-2019
 * arithmetic in a fixed order, so every product must round to a double
 * before it reaches the sum that follows it. A contracted multiply-add
 * skips that rounding, which changes the answer: on a target whose
 * baseline has a fused multiply-add, C11 leaves the compiler free to
 * contract `day * msPerDay + time`, and
 * `Date.UTC(1970, 0, 213503982336, 0, 0, 0, -18446744073709552000)` then
 * reports 34448384 rather than the specified 34447360. Pinning
 * contraction off for this component makes every step round where the
 * specification says it rounds, on every target.
 */
#pragma STDC FP_CONTRACT OFF

#define OSEO_MS_PER_SECOND 1000.0
#define OSEO_MS_PER_MINUTE 60000.0
#define OSEO_MS_PER_HOUR 3600000.0
#define OSEO_MS_PER_DAY 86400000.0
/* The reviewed time-value range of 21.4.1.1, 100,000,000 days either
 * way from the epoch. */
#define OSEO_TIME_VALUE_LIMIT 8.64e15

/* One `Date.prototype` method's own `name` and `length`. */
typedef struct {
    const char *name;
    size_t length;
} OseoDateMethodEntry;

/*
 * The prototype methods in creation order. `[Symbol.toPrimitive]` holds
 * the function name the specification gives it; its property key is the
 * well-known symbol rather than that text.
 */
static const OseoDateMethodEntry date_methods[] = {
    {"getDate", 0u},
    {"getDay", 0u},
    {"getFullYear", 0u},
    {"getHours", 0u},
    {"getMilliseconds", 0u},
    {"getMinutes", 0u},
    {"getMonth", 0u},
    {"getSeconds", 0u},
    {"getTime", 0u},
    {"getTimezoneOffset", 0u},
    {"getUTCDate", 0u},
    {"getUTCDay", 0u},
    {"getUTCFullYear", 0u},
    {"getUTCHours", 0u},
    {"getUTCMilliseconds", 0u},
    {"getUTCMinutes", 0u},
    {"getUTCMonth", 0u},
    {"getUTCSeconds", 0u},
    {"setDate", 1u},
    {"setFullYear", 3u},
    {"setHours", 4u},
    {"setMilliseconds", 1u},
    {"setMinutes", 3u},
    {"setMonth", 2u},
    {"setSeconds", 2u},
    {"setTime", 1u},
    {"setUTCDate", 1u},
    {"setUTCFullYear", 3u},
    {"setUTCHours", 4u},
    {"setUTCMilliseconds", 1u},
    {"setUTCMinutes", 3u},
    {"setUTCMonth", 2u},
    {"setUTCSeconds", 2u},
    {"toDateString", 0u},
    {"toISOString", 0u},
    {"toJSON", 1u},
    {"toLocaleDateString", 0u},
    {"toLocaleString", 0u},
    {"toLocaleTimeString", 0u},
    {"toString", 0u},
    {"toTimeString", 0u},
    {"toUTCString", 0u},
    {"valueOf", 0u},
    {"[Symbol.toPrimitive]", 1u},
};

_Static_assert(
    sizeof(date_methods) / sizeof(date_methods[0]) ==
        (size_t)OSEO_DATE_METHOD_COUNT,
    "The Date method table must match its reviewed code-ID range."
);

static const char *const date_weekday_names[] = {
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
};

static const char *const date_month_names[] = {
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
};

/*
 * The broken-down civil fields of one time value. `year` is the full
 * proleptic Gregorian year, `month` is 0 through 11 as MonthFromTime
 * reports it, and `weekday` is 0 for Sunday.
 */
typedef struct {
    int64_t year;
    int64_t month;
    int64_t day;
    int64_t weekday;
    int64_t hour;
    int64_t minute;
    int64_t second;
    int64_t millisecond;
} OseoDateFields;

/* The seven MakeDay and MakeTime operands, in specification order. */
typedef enum {
    OSEO_DATE_FIELD_YEAR = 0,
    OSEO_DATE_FIELD_MONTH = 1,
    OSEO_DATE_FIELD_DAY = 2,
    OSEO_DATE_FIELD_HOUR = 3,
    OSEO_DATE_FIELD_MINUTE = 4,
    OSEO_DATE_FIELD_SECOND = 5,
    OSEO_DATE_FIELD_MILLISECOND = 6,
    OSEO_DATE_FIELD_COUNT = 7,
} OseoDateField;

/* One component setter's argument window over those seven fields. */
typedef struct {
    OseoDateField first;
    size_t count;
    bool local;
} OseoDateSetter;

/*
 * ECMA-262's modulo, whose result takes the sign of the divisor. Both
 * operands are finite here, so `fmod` is exact and the correction is
 * one addition.
 */
static double date_modulo(double value, double divisor) {
    double remainder = fmod(value, divisor);
    if (remainder != 0.0 && ((remainder < 0.0) != (divisor < 0.0))) {
        remainder += divisor;
    }
    return remainder;
}

/* Day(t), 21.4.1.3. */
static double date_day(double t) {
    return floor(t / OSEO_MS_PER_DAY);
}

/* TimeWithinDay(t), 21.4.1.4. */
static double date_time_within_day(double t) {
    return date_modulo(t, OSEO_MS_PER_DAY);
}

/*
 * The civil year, month, and day of a day number, using the exact
 * integer era arithmetic of the proleptic Gregorian calendar. `days` is
 * bounded by the reviewed time-value range before any caller reaches
 * this, so every intermediate stays far inside int64_t.
 */
static void date_civil_from_days(
    int64_t days,
    int64_t *year,
    int64_t *month,
    int64_t *day
) {
    int64_t shifted = days + 719468;
    int64_t era = (shifted >= 0 ? shifted : shifted - 146096) / 146097;
    int64_t day_of_era = shifted - era * 146097;
    int64_t year_of_era = (day_of_era - day_of_era / 1460 +
                           day_of_era / 36524 - day_of_era / 146096) /
        365;
    int64_t civil_year = year_of_era + era * 400;
    int64_t day_of_year = day_of_era -
        (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    int64_t shifted_month = (5 * day_of_year + 2) / 153;
    *day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    *month = shifted_month < 10 ? shifted_month + 3 : shifted_month - 9;
    *year = civil_year + (*month <= 2 ? 1 : 0);
}

/*
 * The day number of one civil date, the inverse of
 * `date_civil_from_days`. `year` is bounded by `date_make_day` before
 * this runs, so the products stay inside int64_t.
 */
static int64_t date_days_from_civil(
    int64_t year,
    int64_t month,
    int64_t day
) {
    int64_t shifted_year = year - (month <= 2 ? 1 : 0);
    int64_t era = (shifted_year >= 0 ? shifted_year : shifted_year - 399) /
        400;
    int64_t year_of_era = shifted_year - era * 400;
    int64_t day_of_year =
        (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1;
    int64_t day_of_era = year_of_era * 365 + year_of_era / 4 -
        year_of_era / 100 + day_of_year;
    return era * 146097 + day_of_era - 719468;
}

/*
 * YearFromTime, MonthFromTime, DateFromTime, WeekDay, HourFromTime,
 * MinFromTime, SecFromTime, and msFromTime of one finite time value,
 * computed once. `t` is always a finite time value within the reviewed
 * range or a MakeDate result a caller has already clipped.
 */
static void date_fields(double t, OseoDateFields *fields) {
    double day_number = date_day(t);
    double within_day = date_time_within_day(t);
    date_civil_from_days(
        (int64_t)day_number,
        &fields->year,
        &fields->month,
        &fields->day
    );
    fields->month -= 1;
    fields->weekday = (int64_t)date_modulo(day_number + 4.0, 7.0);
    fields->hour =
        (int64_t)floor(within_day / OSEO_MS_PER_HOUR);
    fields->minute = (int64_t)date_modulo(
        floor(within_day / OSEO_MS_PER_MINUTE),
        60.0
    );
    fields->second = (int64_t)date_modulo(
        floor(within_day / OSEO_MS_PER_SECOND),
        60.0
    );
    fields->millisecond = (int64_t)date_modulo(within_day, 1000.0);
}

/*
 * LocalTZA(t, isUTC), 21.4.1.7. The realm's local time zone is UTC, so
 * the offset is +0 for every time value and neither argument can change
 * it. Every LocalTime and UTC call routes through this one definition so
 * the later host time-zone adapter has exactly one place to replace.
 */
static double date_local_time_zone_adjustment(void) {
    return 0.0;
}

/* LocalTime(t), 21.4.1.8. */
static double date_local_time(double t) {
    if (!isfinite(t)) return (double)NAN;
    return t + date_local_time_zone_adjustment();
}

/* UTC(t), 21.4.1.9. */
static double date_utc_time(double t) {
    if (!isfinite(t)) return (double)NAN;
    return t - date_local_time_zone_adjustment();
}

/* ToIntegerOrInfinity over an already converted Number, 7.1.5. */
static double date_to_integer(double value) {
    if (isnan(value)) return 0.0;
    if (!isfinite(value)) return value;
    double truncated = trunc(value);
    return truncated == 0.0 ? 0.0 : truncated;
}

/* MakeTime(hour, min, sec, ms), 21.4.1.11. */
static double date_make_time(
    double hour,
    double minute,
    double second,
    double millisecond
) {
    if (!isfinite(hour) || !isfinite(minute) || !isfinite(second) ||
        !isfinite(millisecond)) {
        return (double)NAN;
    }
    return date_to_integer(hour) * OSEO_MS_PER_HOUR +
        date_to_integer(minute) * OSEO_MS_PER_MINUTE +
        date_to_integer(second) * OSEO_MS_PER_SECOND +
        date_to_integer(millisecond);
}

/*
 * MakeDay(year, month, date), 21.4.1.12. Step 6 asks for a finite time
 * value naming the first day of the resolved year and month; a year
 * whose magnitude passes this bound has none, because MakeDate would
 * leave the reviewed range by more than the day count can recover, so it
 * takes the specified NaN.
 */
static double date_make_day(double year, double month, double day) {
    if (!isfinite(year) || !isfinite(month) || !isfinite(day)) {
        return (double)NAN;
    }
    double integral_year = date_to_integer(year);
    double integral_month = date_to_integer(month);
    double integral_day = date_to_integer(day);
    double resolved_year = integral_year + floor(integral_month / 12.0);
    if (!isfinite(resolved_year) || fabs(resolved_year) > 1e9) {
        return (double)NAN;
    }
    double resolved_month = date_modulo(integral_month, 12.0);
    int64_t days = date_days_from_civil(
        (int64_t)resolved_year,
        (int64_t)resolved_month + 1,
        1
    );
    return (double)days + integral_day - 1.0;
}

/* MakeDate(day, time), 21.4.1.13. */
static double date_make_date(double day, double time) {
    if (!isfinite(day) || !isfinite(time)) return (double)NAN;
    double value = day * OSEO_MS_PER_DAY + time;
    if (!isfinite(value)) return (double)NAN;
    return value;
}

/* TimeClip(time), 21.4.1.14. */
static double date_time_clip(double time) {
    if (!isfinite(time)) return (double)NAN;
    if (fabs(time) > OSEO_TIME_VALUE_LIMIT) return (double)NAN;
    return date_to_integer(time);
}

/* MakeFullYear(year), 21.4.1.15. */
static double date_make_full_year(double year) {
    if (isnan(year)) return (double)NAN;
    double truncated = date_to_integer(year);
    if (truncated >= 0.0 && truncated <= 99.0) return 1900.0 + truncated;
    return truncated;
}

/*
 * The host's current epoch time in integral milliseconds, the single
 * clock boundary of this component. C11's `timespec_get` with `TIME_UTC`
 * is the primary read; `time` is the fallback for a host that reports no
 * time base for it. A host that answers neither has no clock, and the
 * caller reports that as an owned non-catchable diagnostic rather than
 * inventing a time value.
 */
static bool date_current_time_value(double *value) {
    struct timespec now;
    if (timespec_get(&now, TIME_UTC) == TIME_UTC) {
        *value = (double)now.tv_sec * OSEO_MS_PER_SECOND +
            floor((double)now.tv_nsec / 1e6);
        return isfinite(*value);
    }
    time_t seconds = time(NULL);
    if (seconds == (time_t)-1) return false;
    *value = (double)seconds * OSEO_MS_PER_SECOND;
    return isfinite(*value);
}

static OseoResult date_clock_failure(OseoContext *context) {
    return failure(context, "OSEO2001", "The host clock is unavailable.");
}

/* thisTimeValue(value), 21.4.4.1's RequireInternalSlot. */
static OseoResult date_receiver(
    OseoContext *context,
    OseoValue receiver,
    double *time_value
) {
    if (!is_date(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Date method requires a Date receiver."
        );
    }
    *time_value = date_object(receiver)->time_value;
    return normal(receiver);
}

/* One argument of a built-in call, or undefined past the end. */
static OseoValue date_argument(
    size_t argument_count,
    const OseoValue *arguments,
    size_t index
) {
    return index < argument_count ? arguments[index] : oseo_undefined();
}

/* The getters of 21.4.4.2 through 21.4.4.21, over one field selection. */
static OseoResult date_get_field(
    OseoContext *context,
    OseoValue receiver,
    OseoDateMethod method
) {
    double time_value = 0.0;
    OseoResult required = date_receiver(context, receiver, &time_value);
    if (required.status != OSEO_STATUS_NORMAL) return required;
    if (isnan(time_value)) return normal(oseo_number((double)NAN));
    if (method == OSEO_DATE_GET_TIME) {
        return normal(oseo_number(time_value));
    }
    if (method == OSEO_DATE_GET_TIMEZONE_OFFSET) {
        double local = date_local_time(time_value);
        return normal(
            oseo_number((time_value - local) / OSEO_MS_PER_MINUTE)
        );
    }
    bool local = method <= OSEO_DATE_GET_SECONDS;
    OseoDateFields fields;
    date_fields(local ? date_local_time(time_value) : time_value, &fields);
    int64_t component = 0;
    switch (method) {
        case OSEO_DATE_GET_DATE:
        case OSEO_DATE_GET_UTC_DATE:
            component = fields.day;
            break;
        case OSEO_DATE_GET_DAY:
        case OSEO_DATE_GET_UTC_DAY:
            component = fields.weekday;
            break;
        case OSEO_DATE_GET_FULL_YEAR:
        case OSEO_DATE_GET_UTC_FULL_YEAR:
            component = fields.year;
            break;
        case OSEO_DATE_GET_HOURS:
        case OSEO_DATE_GET_UTC_HOURS:
            component = fields.hour;
            break;
        case OSEO_DATE_GET_MILLISECONDS:
        case OSEO_DATE_GET_UTC_MILLISECONDS:
            component = fields.millisecond;
            break;
        case OSEO_DATE_GET_MINUTES:
        case OSEO_DATE_GET_UTC_MINUTES:
            component = fields.minute;
            break;
        case OSEO_DATE_GET_MONTH:
        case OSEO_DATE_GET_UTC_MONTH:
            component = fields.month;
            break;
        default:
            component = fields.second;
            break;
    }
    return normal(oseo_number((double)component));
}

/*
 * The argument window and time zone of each component setter. The table
 * is indexed by `method - OSEO_DATE_SET_DATE` and skips `setTime`, whose
 * own clause has no window.
 */
static bool date_setter_shape(
    OseoDateMethod method,
    OseoDateSetter *setter
) {
    switch (method) {
        case OSEO_DATE_SET_DATE:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_DAY, 1u, true};
            return true;
        case OSEO_DATE_SET_FULL_YEAR:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_YEAR, 3u, true};
            return true;
        case OSEO_DATE_SET_HOURS:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_HOUR, 4u, true};
            return true;
        case OSEO_DATE_SET_MILLISECONDS:
            *setter =
                (OseoDateSetter){OSEO_DATE_FIELD_MILLISECOND, 1u, true};
            return true;
        case OSEO_DATE_SET_MINUTES:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_MINUTE, 3u, true};
            return true;
        case OSEO_DATE_SET_MONTH:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_MONTH, 2u, true};
            return true;
        case OSEO_DATE_SET_SECONDS:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_SECOND, 2u, true};
            return true;
        case OSEO_DATE_SET_UTC_DATE:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_DAY, 1u, false};
            return true;
        case OSEO_DATE_SET_UTC_FULL_YEAR:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_YEAR, 3u, false};
            return true;
        case OSEO_DATE_SET_UTC_HOURS:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_HOUR, 4u, false};
            return true;
        case OSEO_DATE_SET_UTC_MILLISECONDS:
            *setter =
                (OseoDateSetter){OSEO_DATE_FIELD_MILLISECOND, 1u, false};
            return true;
        case OSEO_DATE_SET_UTC_MINUTES:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_MINUTE, 3u, false};
            return true;
        case OSEO_DATE_SET_UTC_MONTH:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_MONTH, 2u, false};
            return true;
        case OSEO_DATE_SET_UTC_SECONDS:
            *setter = (OseoDateSetter){OSEO_DATE_FIELD_SECOND, 2u, false};
            return true;
        default:
            return false;
    }
}

/*
 * The component setters of 21.4.4.20 through 21.4.4.31. Each reads the
 * receiver's [[DateValue]] first and then runs ToNumber over every
 * present argument in specification order, so an abrupt conversion is
 * observed whatever that time value is. The NaN test and every
 * component read that one snapshot, so a conversion that stores a new
 * time value into the same Date does not change the result; the pinned
 * Node.js host instead rereads the slot after the conversions. A
 * year-first setter starts from +0 when the snapshot is NaN; every
 * other window leaves the slot untouched and reports NaN.
 *
 * Recomposing all seven fields is the same arithmetic the individual
 * clauses perform: MakeDay over the receiver's own year, month, and day
 * reproduces Day(t), and MakeTime over its hour, minute, second, and
 * millisecond reproduces TimeWithinDay(t).
 */
static OseoResult date_set_fields(
    OseoContext *context,
    OseoValue receiver,
    OseoDateMethod method,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoDateSetter setter = {OSEO_DATE_FIELD_YEAR, 0u, true};
    if (!date_setter_shape(method, &setter)) {
        return failure(context, "OSEO2001", "Unknown Date setter.");
    }
    double time_value = 0.0;
    OseoResult required = date_receiver(context, receiver, &time_value);
    if (required.status != OSEO_STATUS_NORMAL) return required;
    double supplied[OSEO_DATE_FIELD_COUNT];
    bool present[OSEO_DATE_FIELD_COUNT];
    for (size_t index = 0u; index < OSEO_DATE_FIELD_COUNT; index += 1u) {
        supplied[index] = 0.0;
        present[index] = false;
    }
    OseoValue slots[1] = {receiver};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = normal(oseo_undefined());
    /*
     * The first parameter of every component setter is converted whether
     * or not the call supplied it, because its clause reads it
     * unconditionally: `setDate()` converts undefined and reports NaN. The
     * trailing parameters are the ones the clauses guard with "if present",
     * so an absent one takes its component from the receiver instead.
     */
    for (size_t index = 0u; index < setter.count; index += 1u) {
        if (index > 0u && index >= argument_count) break;
        result = oseo_internal_to_number(
            context,
            date_argument(argument_count, arguments, index)
        );
        if (result.status != OSEO_STATUS_NORMAL) {
            oseo_roots_pop(context, &frame);
            return result;
        }
        supplied[(size_t)setter.first + index] = number_value(result.value);
        present[(size_t)setter.first + index] = true;
    }
    bool year_first = setter.first == OSEO_DATE_FIELD_YEAR;
    if (isnan(time_value) && !year_first) {
        oseo_roots_pop(context, &frame);
        return normal(oseo_number((double)NAN));
    }
    double base = isnan(time_value)
        ? 0.0
        : (setter.local ? date_local_time(time_value) : time_value);
    OseoDateFields fields;
    date_fields(base, &fields);
    double components[OSEO_DATE_FIELD_COUNT] = {
        (double)fields.year,
        (double)fields.month,
        (double)fields.day,
        (double)fields.hour,
        (double)fields.minute,
        (double)fields.second,
        (double)fields.millisecond,
    };
    for (size_t index = 0u; index < OSEO_DATE_FIELD_COUNT; index += 1u) {
        if (present[index]) components[index] = supplied[index];
    }
    double day = date_make_day(
        components[OSEO_DATE_FIELD_YEAR],
        components[OSEO_DATE_FIELD_MONTH],
        components[OSEO_DATE_FIELD_DAY]
    );
    double time = date_make_time(
        components[OSEO_DATE_FIELD_HOUR],
        components[OSEO_DATE_FIELD_MINUTE],
        components[OSEO_DATE_FIELD_SECOND],
        components[OSEO_DATE_FIELD_MILLISECOND]
    );
    double composed = date_make_date(day, time);
    double updated = date_time_clip(
        setter.local ? date_utc_time(composed) : composed
    );
    date_object(slots[0])->time_value = updated;
    oseo_roots_pop(context, &frame);
    return normal(oseo_number(updated));
}

/* Date.prototype.setTime(time), 21.4.4.27. */
static OseoResult date_set_time(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    double time_value = 0.0;
    OseoResult required = date_receiver(context, receiver, &time_value);
    if (required.status != OSEO_STATUS_NORMAL) return required;
    OseoValue slots[1] = {receiver};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoResult converted = oseo_internal_to_number(
        context,
        date_argument(argument_count, arguments, 0u)
    );
    if (converted.status != OSEO_STATUS_NORMAL) {
        oseo_roots_pop(context, &frame);
        return converted;
    }
    double updated = date_time_clip(number_value(converted.value));
    date_object(slots[0])->time_value = updated;
    oseo_roots_pop(context, &frame);
    return normal(oseo_number(updated));
}

/*
 * One short ASCII text this component assembles. `oseo_internal_ascii_string`
 * is bounded by the property-name ceiling, which every Date text but
 * "Invalid Date" exceeds, so the units are widened here instead.
 */
static OseoResult date_text_string(
    OseoContext *context,
    const char *text,
    size_t length
) {
    uint16_t units[128];
    if (length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Date text is too long.");
    }
    for (size_t index = 0u; index < length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)text[index];
    }
    return oseo_string_from_units(context, units, length);
}

/* One nonnegative integer, zero-padded to at least `width` digits. */
static void date_append_padded(
    char *text,
    size_t *length,
    int64_t value,
    int width
) {
    char digits[24];
    int written = snprintf(digits, sizeof(digits), "%lld", (long long)value);
    if (written < 0) written = 0;
    for (int index = written; index < width; index += 1) {
        text[*length] = '0';
        *length += 1u;
    }
    memcpy(text + *length, digits, (size_t)written);
    *length += (size_t)written;
}

static void date_append_text(
    char *text,
    size_t *length,
    const char *appended
) {
    size_t appended_length = strlen(appended);
    memcpy(text + *length, appended, appended_length);
    *length += appended_length;
}

/* DateString(tv), 21.4.4.41.2. */
static void date_append_date_string(
    char *text,
    size_t *length,
    const OseoDateFields *fields
) {
    date_append_text(text, length, date_weekday_names[fields->weekday]);
    date_append_text(text, length, " ");
    date_append_text(text, length, date_month_names[fields->month]);
    date_append_text(text, length, " ");
    date_append_padded(text, length, fields->day, 2);
    date_append_text(text, length, " ");
    if (fields->year < 0) date_append_text(text, length, "-");
    date_append_padded(
        text,
        length,
        fields->year < 0 ? -fields->year : fields->year,
        4
    );
}

/* TimeString(tv), 21.4.4.41.1, including its trailing " GMT". */
static void date_append_time_string(
    char *text,
    size_t *length,
    const OseoDateFields *fields
) {
    date_append_padded(text, length, fields->hour, 2);
    date_append_text(text, length, ":");
    date_append_padded(text, length, fields->minute, 2);
    date_append_text(text, length, ":");
    date_append_padded(text, length, fields->second, 2);
    date_append_text(text, length, " GMT");
}

/*
 * TimeZoneString(tv), 21.4.4.41.3. The realm's local time zone is UTC,
 * so the offset is always +0000 and the implementation-defined name is
 * that zone's own.
 */
static void date_append_time_zone_string(char *text, size_t *length) {
    date_append_text(text, length, "+0000 (Coordinated Universal Time)");
}

/*
 * ToDateString(tv), 21.4.4.41.4, and the three prototype methods that
 * report one of its parts. The complete text is short ASCII, so it is
 * assembled in a local buffer and published once.
 */
static OseoResult date_to_date_string(
    OseoContext *context,
    double time_value,
    OseoDateMethod method
) {
    if (isnan(time_value)) {
        return date_text_string(context, "Invalid Date", 12u);
    }
    OseoDateFields fields;
    date_fields(date_local_time(time_value), &fields);
    char text[128];
    size_t length = 0u;
    if (method != OSEO_DATE_TO_TIME_STRING) {
        date_append_date_string(text, &length, &fields);
    }
    if (method != OSEO_DATE_TO_DATE_STRING) {
        if (method != OSEO_DATE_TO_TIME_STRING) {
            date_append_text(text, &length, " ");
        }
        date_append_time_string(text, &length, &fields);
        date_append_time_zone_string(text, &length);
    }
    return date_text_string(context, text, length);
}

/* Date.prototype.toUTCString(), 21.4.4.43. */
static OseoResult date_to_utc_string(
    OseoContext *context,
    double time_value
) {
    if (isnan(time_value)) {
        return date_text_string(context, "Invalid Date", 12u);
    }
    OseoDateFields fields;
    date_fields(time_value, &fields);
    char text[128];
    size_t length = 0u;
    date_append_text(text, &length, date_weekday_names[fields.weekday]);
    date_append_text(text, &length, ", ");
    date_append_padded(text, &length, fields.day, 2);
    date_append_text(text, &length, " ");
    date_append_text(text, &length, date_month_names[fields.month]);
    date_append_text(text, &length, " ");
    if (fields.year < 0) date_append_text(text, &length, "-");
    date_append_padded(
        text,
        &length,
        fields.year < 0 ? -fields.year : fields.year,
        4
    );
    date_append_text(text, &length, " ");
    date_append_time_string(text, &length, &fields);
    return date_text_string(context, text, length);
}

/* Date.prototype.toISOString(), 21.4.4.36. */
static OseoResult date_to_iso_string(
    OseoContext *context,
    double time_value
) {
    if (isnan(time_value)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_RANGE,
            "Date.prototype.toISOString requires a valid time value."
        );
    }
    OseoDateFields fields;
    date_fields(time_value, &fields);
    char text[64];
    size_t length = 0u;
    if (fields.year < 0) {
        date_append_text(text, &length, "-");
        date_append_padded(text, &length, -fields.year, 6);
    } else if (fields.year > 9999) {
        date_append_text(text, &length, "+");
        date_append_padded(text, &length, fields.year, 6);
    } else {
        date_append_padded(text, &length, fields.year, 4);
    }
    date_append_text(text, &length, "-");
    date_append_padded(text, &length, fields.month + 1, 2);
    date_append_text(text, &length, "-");
    date_append_padded(text, &length, fields.day, 2);
    date_append_text(text, &length, "T");
    date_append_padded(text, &length, fields.hour, 2);
    date_append_text(text, &length, ":");
    date_append_padded(text, &length, fields.minute, 2);
    date_append_text(text, &length, ":");
    date_append_padded(text, &length, fields.second, 2);
    date_append_text(text, &length, ".");
    date_append_padded(text, &length, fields.millisecond, 3);
    date_append_text(text, &length, "Z");
    return date_text_string(context, text, length);
}

/*
 * Date.prototype.toJSON(key), 21.4.4.37. The receiver need not be a
 * Date: the conversion and the `toISOString` invocation are ordinary
 * operations on whatever object ToObject produces.
 */
static OseoResult date_to_json(OseoContext *context, OseoValue receiver) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 3u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    result = oseo_internal_to_object(context, receiver);
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_to_primitive(
            context,
            frame.slots[0],
            OSEO_TO_PRIMITIVE_NUMBER
        );
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL &&
        is_number(frame.slots[1]) &&
        !isfinite(number_value(frame.slots[1]))) {
        oseo_roots_release(context, &frame);
        return normal(oseo_null());
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_internal_ascii_string(context, "toISOString");
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_get(context, frame.slots[0], frame.slots[2]);
        frame.slots[2] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL && !is_callable(frame.slots[2])) {
        result = oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Date.prototype.toJSON requires a callable toISOString."
        );
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_call_function(
            context,
            frame.slots[2],
            frame.slots[0],
            0u,
            NULL,
            oseo_undefined()
        );
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* Date.prototype[Symbol.toPrimitive](hint), 21.4.4.45. */
static OseoResult date_to_primitive(
    OseoContext *context,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (!is_object(receiver)) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Date.prototype[Symbol.toPrimitive] requires an object "
            "receiver."
        );
    }
    OseoValue hint = date_argument(argument_count, arguments, 0u);
    OseoToPrimitiveHint resolved;
    if (oseo_internal_string_is_ascii(hint, "string") ||
        oseo_internal_string_is_ascii(hint, "default")) {
        resolved = OSEO_TO_PRIMITIVE_STRING;
    } else if (oseo_internal_string_is_ascii(hint, "number")) {
        resolved = OSEO_TO_PRIMITIVE_NUMBER;
    } else {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Date.prototype[Symbol.toPrimitive] requires the hint "
            "'string', 'default', or 'number'."
        );
    }
    return oseo_internal_ordinary_to_primitive(context, receiver, resolved);
}

/* One ASCII digit of a parsed string, or -1 for anything else. */
static int date_digit(const uint16_t *units, size_t length, size_t index) {
    if (index >= length) return -1;
    uint16_t unit = units[index];
    if (unit < '0' || unit > '9') return -1;
    return (int)(unit - '0');
}

/* `count` consecutive digits read as one nonnegative integer. */
static bool date_read_digits(
    const uint16_t *units,
    size_t length,
    size_t *cursor,
    size_t count,
    int64_t *value
) {
    int64_t accumulated = 0;
    for (size_t index = 0u; index < count; index += 1u) {
        int digit = date_digit(units, length, *cursor + index);
        if (digit < 0) return false;
        accumulated = accumulated * 10 + digit;
    }
    *cursor += count;
    *value = accumulated;
    return true;
}

static bool date_expect(
    const uint16_t *units,
    size_t length,
    size_t *cursor,
    uint16_t unit
) {
    if (*cursor >= length || units[*cursor] != unit) return false;
    *cursor += 1u;
    return true;
}

/*
 * The Date Time String Format of 21.4.1.32. An absent UTC offset makes a
 * date-only form UTC and a date-time form local time, which this realm
 * resolves the same way because its local time zone is UTC. `-000000` is
 * rejected as an extended year, an hour of 24 requires a zero minute,
 * second, and millisecond, and every other out-of-range component is a
 * NaN rather than a wrapped value.
 */
static bool date_parse_iso(
    const uint16_t *units,
    size_t length,
    double *time_value
) {
    size_t cursor = 0u;
    int64_t year = 0;
    bool negative_year = false;
    if (cursor < length && (units[cursor] == '+' || units[cursor] == '-')) {
        negative_year = units[cursor] == '-';
        cursor += 1u;
        if (!date_read_digits(units, length, &cursor, 6u, &year)) {
            return false;
        }
        if (negative_year && year == 0) return false;
        if (negative_year) year = -year;
    } else if (!date_read_digits(units, length, &cursor, 4u, &year)) {
        return false;
    }
    int64_t month = 1;
    int64_t day = 1;
    if (cursor < length && units[cursor] == '-') {
        cursor += 1u;
        if (!date_read_digits(units, length, &cursor, 2u, &month)) {
            return false;
        }
        if (month < 1 || month > 12) return false;
        if (cursor < length && units[cursor] == '-') {
            cursor += 1u;
            if (!date_read_digits(units, length, &cursor, 2u, &day)) {
                return false;
            }
            if (day < 1 || day > 31) return false;
        }
    }
    int64_t hour = 0;
    int64_t minute = 0;
    int64_t second = 0;
    int64_t millisecond = 0;
    bool has_time = false;
    if (cursor < length && units[cursor] == 'T') {
        has_time = true;
        cursor += 1u;
        if (!date_read_digits(units, length, &cursor, 2u, &hour)) {
            return false;
        }
        if (hour > 24) return false;
        if (!date_expect(units, length, &cursor, ':')) return false;
        if (!date_read_digits(units, length, &cursor, 2u, &minute)) {
            return false;
        }
        if (minute > 59) return false;
        if (cursor < length && units[cursor] == ':') {
            cursor += 1u;
            if (!date_read_digits(units, length, &cursor, 2u, &second)) {
                return false;
            }
            if (second > 59) return false;
            if (cursor < length && units[cursor] == '.') {
                cursor += 1u;
                if (!date_read_digits(
                        units,
                        length,
                        &cursor,
                        3u,
                        &millisecond
                    )) {
                    return false;
                }
            }
        }
        if (hour == 24 &&
            (minute != 0 || second != 0 || millisecond != 0)) {
            return false;
        }
    }
    /*
     * A UTC offset representation is appended to a date-time form only,
     * so a date-only form followed by `Z` or by a numeric offset is not
     * a production of the format even though both reference hosts accept
     * one.
     */
    double offset_minutes = 0.0;
    if (cursor < length && !has_time) return false;
    if (cursor < length) {
        if (units[cursor] == 'Z') {
            cursor += 1u;
        } else if (units[cursor] == '+' || units[cursor] == '-') {
            bool negative_offset = units[cursor] == '-';
            cursor += 1u;
            int64_t offset_hour = 0;
            int64_t offset_minute = 0;
            if (!date_read_digits(units, length, &cursor, 2u, &offset_hour)) {
                return false;
            }
            if (offset_hour > 23) return false;
            if (!date_expect(units, length, &cursor, ':')) return false;
            if (!date_read_digits(
                    units,
                    length,
                    &cursor,
                    2u,
                    &offset_minute
                )) {
                return false;
            }
            if (offset_minute > 59) return false;
            offset_minutes =
                (double)(offset_hour * 60 + offset_minute);
            if (negative_offset) offset_minutes = -offset_minutes;
        } else {
            return false;
        }
    } else if (has_time) {
        /* An offsetless date-time form is local time, and this realm's
         * local time zone is UTC, so the two resolutions coincide. */
        offset_minutes = -date_local_time_zone_adjustment() /
            OSEO_MS_PER_MINUTE;
    }
    if (cursor != length) return false;
    double composed = date_make_date(
        date_make_day((double)year, (double)(month - 1), (double)day),
        date_make_time(
            (double)hour,
            (double)minute,
            (double)second,
            (double)millisecond
        )
    );
    *time_value = date_time_clip(
        composed - offset_minutes * OSEO_MS_PER_MINUTE
    );
    return true;
}

/* One three-letter name of `names`, or -1 when the text does not match. */
static int64_t date_named_index(
    const uint16_t *units,
    size_t length,
    size_t cursor,
    const char *const *names,
    size_t count
) {
    if (cursor + 3u > length) return -1;
    for (size_t index = 0u; index < count; index += 1u) {
        bool matched = true;
        for (size_t unit = 0u; unit < 3u; unit += 1u) {
            if (units[cursor + unit] !=
                (uint16_t)(unsigned char)names[index][unit]) {
                matched = false;
                break;
            }
        }
        if (matched) return (int64_t)index;
    }
    return -1;
}

/*
 * The two texts 21.4.3.2 asks Date.parse to recover: this realm's own
 * `Date.prototype.toString` and `Date.prototype.toUTCString` output.
 * Both are recognized exactly, including the weekday, which must agree
 * with the date it precedes, so no other text reaches this fallback.
 */
static bool date_parse_own_format(
    const uint16_t *units,
    size_t length,
    double *time_value
) {
    int64_t weekday = date_named_index(
        units,
        length,
        0u,
        date_weekday_names,
        7u
    );
    if (weekday < 0) return false;
    size_t cursor = 3u;
    bool utc_format = cursor < length && units[cursor] == ',';
    if (utc_format) cursor += 1u;
    if (!date_expect(units, length, &cursor, ' ')) return false;
    int64_t month = 0;
    int64_t day = 0;
    if (utc_format) {
        if (!date_read_digits(units, length, &cursor, 2u, &day)) return false;
        if (!date_expect(units, length, &cursor, ' ')) return false;
        month = date_named_index(units, length, cursor, date_month_names, 12u);
        if (month < 0) return false;
        cursor += 3u;
    } else {
        month = date_named_index(units, length, cursor, date_month_names, 12u);
        if (month < 0) return false;
        cursor += 3u;
        if (!date_expect(units, length, &cursor, ' ')) return false;
        if (!date_read_digits(units, length, &cursor, 2u, &day)) return false;
    }
    if (!date_expect(units, length, &cursor, ' ')) return false;
    bool negative_year = cursor < length && units[cursor] == '-';
    if (negative_year) cursor += 1u;
    /*
     * `DateString` pads the year to four digits and never writes more
     * than the six an expanded year needs, so the digit count is bounded
     * before any digit is accumulated and no product can overflow.
     */
    size_t year_digits = 0u;
    while (date_digit(units, length, cursor + year_digits) >= 0) {
        year_digits += 1u;
    }
    if (year_digits < 4u || year_digits > 6u) return false;
    int64_t year = 0;
    if (!date_read_digits(units, length, &cursor, year_digits, &year)) {
        return false;
    }
    if (negative_year) year = -year;
    if (!date_expect(units, length, &cursor, ' ')) return false;
    int64_t hour = 0;
    int64_t minute = 0;
    int64_t second = 0;
    if (!date_read_digits(units, length, &cursor, 2u, &hour)) return false;
    if (!date_expect(units, length, &cursor, ':')) return false;
    if (!date_read_digits(units, length, &cursor, 2u, &minute)) return false;
    if (!date_expect(units, length, &cursor, ':')) return false;
    if (!date_read_digits(units, length, &cursor, 2u, &second)) return false;
    if (hour > 24 || minute > 59 || second > 59) return false;
    if (!date_expect(units, length, &cursor, ' ')) return false;
    static const char gmt[] = "GMT";
    for (size_t index = 0u; index < 3u; index += 1u) {
        if (!date_expect(
                units,
                length,
                &cursor,
                (uint16_t)(unsigned char)gmt[index]
            )) {
            return false;
        }
    }
    double offset_minutes = 0.0;
    if (!utc_format) {
        bool negative_offset = cursor < length && units[cursor] == '-';
        if (!negative_offset &&
            !date_expect(units, length, &cursor, '+')) {
            return false;
        }
        if (negative_offset) cursor += 1u;
        int64_t offset_hour = 0;
        int64_t offset_minute = 0;
        if (!date_read_digits(units, length, &cursor, 2u, &offset_hour)) {
            return false;
        }
        if (!date_read_digits(units, length, &cursor, 2u, &offset_minute)) {
            return false;
        }
        if (offset_hour > 23 || offset_minute > 59) return false;
        offset_minutes = (double)(offset_hour * 60 + offset_minute);
        if (negative_offset) offset_minutes = -offset_minutes;
        /* The parenthesized zone name is the implementation-defined part
         * of TimeZoneString, so it is accepted and ignored. */
        if (cursor < length) {
            if (!date_expect(units, length, &cursor, ' ')) return false;
            if (!date_expect(units, length, &cursor, '(')) return false;
            if (length == 0u || units[length - 1u] != ')') return false;
            cursor = length;
        }
    }
    if (cursor != length) return false;
    double day_number = date_make_day(
        (double)year,
        (double)month,
        (double)day
    );
    if (isnan(day_number)) return false;
    if (date_modulo(day_number + 4.0, 7.0) != (double)weekday) return false;
    double composed = date_make_date(
        day_number,
        date_make_time((double)hour, (double)minute, (double)second, 0.0)
    );
    *time_value = date_time_clip(
        composed - offset_minutes * OSEO_MS_PER_MINUTE
    );
    return true;
}

/* The complete parse of 21.4.3.2 over one already converted String. */
static double date_parse_string(OseoValue text) {
    const OseoString *string = string_object(text);
    double time_value = (double)NAN;
    if (date_parse_iso(string->units, string->length, &time_value)) {
        return time_value;
    }
    if (date_parse_own_format(string->units, string->length, &time_value)) {
        return time_value;
    }
    return (double)NAN;
}

/*
 * OrdinaryCreateFromConstructor(newTarget, "%Date.prototype%"). The
 * `prototype` read is the specified Get, so a new target whose property
 * is an accessor runs it, and a non-object result falls back to the
 * realm prototype.
 */
static OseoResult date_prototype_from_target(
    OseoContext *context,
    OseoValue new_target,
    OseoValue *prototype
) {
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 2u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    result = oseo_internal_constructor_prototype(context, frame.slots[0]);
    frame.slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL && !is_object(frame.slots[1])) {
        result = oseo_internal_validate_function_realm(
            context,
            frame.slots[0]
        );
        if (result.status == OSEO_STATUS_NORMAL) {
            result = oseo_internal_intrinsic(
                context,
                OSEO_INTRINSIC_DATE_PROTOTYPE
            );
        }
        frame.slots[1] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) *prototype = frame.slots[1];
    oseo_roots_release(context, &frame);
    return result;
}

/*
 * One Date record. The time value is published with the record, so a
 * Date never exists with an unset [[DateValue]].
 */
static OseoResult date_allocate(
    OseoContext *context,
    OseoValue prototype,
    double time_value
) {
    OseoValue slots[1] = {prototype};
    OseoRootFrame frame = {NULL, slots, 1u};
    oseo_roots_push(context, &frame);
    OseoDate *date = oseo_internal_allocate_heap_bytes(context, sizeof(*date));
    if (date == NULL) {
        oseo_roots_pop(context, &frame);
        return failure(context, "OSEO2001", "Date allocation failed.");
    }
    date->ordinary.prototype = slots[0];
    date->ordinary.properties = NULL;
    date->ordinary.property_capacity = 0u;
    date->ordinary.property_count = 0u;
    date->ordinary.private_elements = NULL;
    date->ordinary.private_element_capacity = 0u;
    date->ordinary.private_element_count = 0u;
    date->ordinary.shape_id = context->next_shape_id;
    context->next_shape_id += 1u;
    date->ordinary.array_length = 0u;
    date->ordinary.dictionary = false;
    date->ordinary.length_writable = false;
    date->ordinary.extensible = true;
    date->ordinary.module_namespace = false;
    date->ordinary.immutable_prototype = false;
    date->ordinary.global_object = false;
    date->ordinary.error_data = false;
    date->ordinary.number_data = false;
    date->ordinary.number_value = oseo_undefined();
    date->ordinary.primitive_data = false;
    date->ordinary.primitive_value = oseo_undefined();
    date->ordinary.primitive_wrapper_methods_initialized = false;
    date->ordinary.virtual_string_iterator = false;
    date->ordinary.virtual_string_iterator_configurable = false;
    date->ordinary.virtual_string_iterator_enumerable = false;
    date->ordinary.virtual_string_iterator_writable = false;
    date->ordinary.iterator_kind = OSEO_ITERATOR_NONE;
    date->ordinary.iterator_target = oseo_undefined();
    date->ordinary.iterator_index = 0u;
    date->ordinary.regexp_string_iterator = false;
    date->ordinary.regexp_iterator_regexp = oseo_undefined();
    date->ordinary.regexp_iterator_subject = oseo_undefined();
    date->ordinary.regexp_iterator_global = false;
    date->ordinary.regexp_iterator_unicode = false;
    date->ordinary.regexp_iterator_complete = false;
    date->ordinary.async_from_sync = false;
    date->ordinary.async_sync_iterator = oseo_undefined();
    date->ordinary.wrap_for_valid_iterator = false;
    date->ordinary.wrapped_iterator = oseo_undefined();
    date->ordinary.wrapped_next = oseo_undefined();
    date->ordinary.generator = NULL;
    date->ordinary.arguments_object = false;
    date->ordinary.mapped_arguments = false;
    date->time_value = time_value;
    OseoResult published = oseo_internal_publish_heap(
        context,
        &date->ordinary.header,
        OSEO_HEAP_DATE
    );
    oseo_roots_pop(context, &frame);
    return published;
}

/*
 * The Date constructor, 21.4.2.1. Every argument conversion runs before
 * the new target's `prototype` read, which is the position clause 21.4.2.1
 * gives OrdinaryCreateFromConstructor. A one-argument call copies an
 * existing Date's [[DateValue]] without converting it, so a Date whose
 * `valueOf` a program replaced still copies its slot.
 */
static OseoResult date_construct(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    double time_value = (double)NAN;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 8u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    frame.slots[0] = new_target;
    if (argument_count == 0u) {
        if (!date_current_time_value(&time_value)) {
            oseo_roots_release(context, &frame);
            return date_clock_failure(context);
        }
    } else if (argument_count == 1u) {
        frame.slots[1] = arguments[0];
        if (is_date(frame.slots[1])) {
            time_value = date_time_clip(
                date_object(frame.slots[1])->time_value
            );
        } else {
            result = oseo_internal_to_primitive(
                context,
                frame.slots[1],
                OSEO_TO_PRIMITIVE_DEFAULT
            );
            frame.slots[1] = result.value;
            if (result.status != OSEO_STATUS_NORMAL) {
                oseo_roots_release(context, &frame);
                return result;
            }
            if (is_string(frame.slots[1])) {
                time_value = date_time_clip(
                    date_parse_string(frame.slots[1])
                );
            } else {
                result = oseo_internal_to_number(context, frame.slots[1]);
                if (result.status != OSEO_STATUS_NORMAL) {
                    oseo_roots_release(context, &frame);
                    return result;
                }
                time_value = date_time_clip(number_value(result.value));
            }
        }
    } else {
        double components[OSEO_DATE_FIELD_COUNT] = {
            0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
        };
        for (size_t index = 0u;
             index < OSEO_DATE_FIELD_COUNT && index < argument_count;
             index += 1u) {
            result = oseo_internal_to_number(context, arguments[index]);
            if (result.status != OSEO_STATUS_NORMAL) {
                oseo_roots_release(context, &frame);
                return result;
            }
            components[index] = number_value(result.value);
        }
        double resolved_year =
            date_make_full_year(components[OSEO_DATE_FIELD_YEAR]);
        double composed = date_make_date(
            date_make_day(
                resolved_year,
                components[OSEO_DATE_FIELD_MONTH],
                components[OSEO_DATE_FIELD_DAY]
            ),
            date_make_time(
                components[OSEO_DATE_FIELD_HOUR],
                components[OSEO_DATE_FIELD_MINUTE],
                components[OSEO_DATE_FIELD_SECOND],
                components[OSEO_DATE_FIELD_MILLISECOND]
            )
        );
        time_value = date_time_clip(date_utc_time(composed));
    }
    result = date_prototype_from_target(
        context,
        frame.slots[0],
        &frame.slots[2]
    );
    if (result.status == OSEO_STATUS_NORMAL) {
        result = date_allocate(context, frame.slots[2], time_value);
    }
    oseo_roots_release(context, &frame);
    return result;
}

/* Date(), 21.4.2.1 step 1: the current time as a String, ignoring every
 * argument. */
static OseoResult date_call(OseoContext *context) {
    double time_value = 0.0;
    if (!date_current_time_value(&time_value)) {
        return date_clock_failure(context);
    }
    return date_to_date_string(
        context,
        date_time_clip(time_value),
        OSEO_DATE_TO_STRING
    );
}

/* Date.now(), 21.4.3.1. */
static OseoResult date_now(OseoContext *context) {
    double time_value = 0.0;
    if (!date_current_time_value(&time_value)) {
        return date_clock_failure(context);
    }
    return normal(oseo_number(date_time_clip(time_value)));
}

/* Date.parse(string), 21.4.3.2. */
static OseoResult date_parse(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    OseoResult text = oseo_to_string(
        context,
        date_argument(argument_count, arguments, 0u)
    );
    if (text.status != OSEO_STATUS_NORMAL) return text;
    return normal(oseo_number(date_parse_string(text.value)));
}

/* Date.UTC(year, month, date, hours, minutes, seconds, ms), 21.4.3.4. */
static OseoResult date_utc(
    OseoContext *context,
    size_t argument_count,
    const OseoValue *arguments
) {
    double components[OSEO_DATE_FIELD_COUNT] = {
        (double)NAN, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
    };
    /* `year` is converted whether or not the call supplied it; every
     * later parameter keeps its specified default when absent. */
    for (size_t index = 0u;
         index < OSEO_DATE_FIELD_COUNT &&
             (index == 0u || index < argument_count);
         index += 1u) {
        OseoResult converted = oseo_internal_to_number(
            context,
            date_argument(argument_count, arguments, index)
        );
        if (converted.status != OSEO_STATUS_NORMAL) return converted;
        components[index] = number_value(converted.value);
    }
    double resolved_year =
        date_make_full_year(components[OSEO_DATE_FIELD_YEAR]);
    double composed = date_make_date(
        date_make_day(
            resolved_year,
            components[OSEO_DATE_FIELD_MONTH],
            components[OSEO_DATE_FIELD_DAY]
        ),
        date_make_time(
            components[OSEO_DATE_FIELD_HOUR],
            components[OSEO_DATE_FIELD_MINUTE],
            components[OSEO_DATE_FIELD_SECOND],
            components[OSEO_DATE_FIELD_MILLISECOND]
        )
    );
    return normal(oseo_number(date_time_clip(composed)));
}

/* One prototype method, dispatched by its table index. */
static OseoResult date_prototype_method(
    OseoContext *context,
    OseoDateMethod method,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments
) {
    if (method <= OSEO_DATE_GET_UTC_SECONDS) {
        return date_get_field(context, receiver, method);
    }
    if (method == OSEO_DATE_SET_TIME) {
        return date_set_time(context, receiver, argument_count, arguments);
    }
    if (method <= OSEO_DATE_SET_UTC_SECONDS) {
        return date_set_fields(
            context,
            receiver,
            method,
            argument_count,
            arguments
        );
    }
    if (method == OSEO_DATE_TO_JSON) {
        return date_to_json(context, receiver);
    }
    if (method == OSEO_DATE_TO_PRIMITIVE) {
        return date_to_primitive(
            context,
            receiver,
            argument_count,
            arguments
        );
    }
    double time_value = 0.0;
    OseoResult required = date_receiver(context, receiver, &time_value);
    if (required.status != OSEO_STATUS_NORMAL) return required;
    switch (method) {
        case OSEO_DATE_VALUE_OF:
            return normal(oseo_number(time_value));
        case OSEO_DATE_TO_ISO_STRING:
            return date_to_iso_string(context, time_value);
        case OSEO_DATE_TO_UTC_STRING:
            return date_to_utc_string(context, time_value);
        case OSEO_DATE_TO_DATE_STRING:
        case OSEO_DATE_TO_LOCALE_DATE_STRING:
            return date_to_date_string(
                context,
                time_value,
                OSEO_DATE_TO_DATE_STRING
            );
        case OSEO_DATE_TO_TIME_STRING:
        case OSEO_DATE_TO_LOCALE_TIME_STRING:
            return date_to_date_string(
                context,
                time_value,
                OSEO_DATE_TO_TIME_STRING
            );
        default:
            /* toString and the two remaining locale methods. ECMA-402 is
             * outside the claim, so each locale method reports the same
             * text as the operation it localizes. */
            return date_to_date_string(
                context,
                time_value,
                OSEO_DATE_TO_STRING
            );
    }
}

OseoResult oseo_internal_date_builtin_dispatch(
    OseoContext *context,
    size_t code_id,
    OseoValue callee,
    OseoValue receiver,
    size_t argument_count,
    const OseoValue *arguments,
    OseoValue new_target
) {
    (void)callee;
    if (code_id == OSEO_DATE_CONSTRUCTOR_CODE_ID) {
        if (tag_of(new_target) == OSEO_TAG_UNDEFINED) {
            return date_call(context);
        }
        return date_construct(
            context,
            argument_count,
            arguments,
            new_target
        );
    }
    if (tag_of(new_target) != OSEO_TAG_UNDEFINED) {
        return oseo_internal_throw_error(
            context,
            OSEO_ERROR_TYPE,
            "Date method is not a constructor."
        );
    }
    if (code_id == OSEO_DATE_NOW_CODE_ID) return date_now(context);
    if (code_id == OSEO_DATE_PARSE_CODE_ID) {
        return date_parse(context, argument_count, arguments);
    }
    if (code_id == OSEO_DATE_UTC_CODE_ID) {
        return date_utc(context, argument_count, arguments);
    }
    if (code_id >= OSEO_DATE_METHOD_CODE_ID_FIRST &&
        code_id <= OSEO_DATE_METHOD_CODE_ID_LAST) {
        return date_prototype_method(
            context,
            (OseoDateMethod)(OSEO_DATE_METHOD_CODE_ID_LAST - code_id),
            receiver,
            argument_count,
            arguments
        );
    }
    return oseo_unknown_function(context, code_id);
}

static OseoResult create_date_builtin(
    OseoContext *context,
    size_t code_id,
    const char *name,
    size_t length,
    OseoFunctionKind kind
) {
    size_t name_length = strlen(name);
    uint16_t units[32];
    if (name_length > sizeof(units) / sizeof(*units)) {
        return failure(context, "OSEO2001", "Built-in name is too long.");
    }
    for (size_t index = 0u; index < name_length; index += 1u) {
        units[index] = (uint16_t)(unsigned char)name[index];
    }
    OseoValue environment = oseo_undefined();
    OseoRootFrame frame = {NULL, &environment, 1u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_environment_create(context, 0u);
    environment = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_function_create(
            context,
            code_id,
            environment,
            units,
            name_length,
            length,
            kind,
            oseo_undefined(),
            oseo_undefined(),
            OSEO_FUNCTION_NAME_PREFIX_NONE
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

static OseoResult define_date_property(
    OseoContext *context,
    OseoValue object,
    const char *name,
    OseoValue value,
    OseoPropertyAttributes attributes
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
            attributes
        );
    }
    oseo_roots_pop(context, &frame);
    return result;
}

/*
 * Materializes %Date%, %Date.prototype%, and every own property
 * ECMA-262 gives them. `OSEO_INTRINSIC_DATE` is filled last, so it
 * doubles as the completion marker: a partially built cluster leaves it
 * undefined and the failure path clears both slots. The marker holds the
 * uninitialized sentinel while the attempt runs, so a dependency that
 * reentered the build reports that instead of splitting the constructor
 * and prototype identities across two attempts.
 */
static OseoResult date_intrinsic_build(OseoContext *context) {
    OseoValue *marker = &context->intrinsics[OSEO_INTRINSIC_DATE];
    if (tag_of(*marker) == OSEO_TAG_UNINITIALIZED) {
        return failure(
            context,
            "OSEO2001",
            "The Date intrinsic cluster is already being built."
        );
    }
    if (tag_of(*marker) != OSEO_TAG_UNDEFINED) return normal(*marker);
    size_t entry_allocations = context->allocations;
    OseoRootFrame frame = {NULL, NULL, 0u};
    OseoResult result = oseo_roots_allocate(context, &frame, 4u);
    if (result.status != OSEO_STATUS_NORMAL) return result;
    *marker = oseo_uninitialized();
    result = oseo_internal_intrinsic(
        context,
        OSEO_INTRINSIC_OBJECT_PROTOTYPE
    );
    frame.slots[0] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = oseo_object_create(context, frame.slots[0]);
        frame.slots[0] = result.value;
    }
    if (result.status == OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_DATE_PROTOTYPE] = frame.slots[0];
        result = create_date_builtin(
            context,
            OSEO_DATE_CONSTRUCTOR_CODE_ID,
            "Date",
            7u,
            OSEO_FUNCTION_ORDINARY
        );
        frame.slots[1] = result.value;
    }
    const OseoPropertyAttributes method = {true, false, true, false};
    if (result.status == OSEO_STATUS_NORMAL) {
        OseoFunction *constructor = function_object(frame.slots[1]);
        constructor->prototype_object = frame.slots[0];
        constructor->prototype_writable = false;
        result = define_date_property(
            context,
            frame.slots[0],
            "constructor",
            frame.slots[1],
            method
        );
    }
    static const char *const static_names[] = {"now", "parse", "UTC"};
    static const size_t static_codes[] = {
        OSEO_DATE_NOW_CODE_ID,
        OSEO_DATE_PARSE_CODE_ID,
        OSEO_DATE_UTC_CODE_ID,
    };
    static const size_t static_lengths[] = {0u, 1u, 7u};
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL && index < 3u;
         index += 1u) {
        result = create_date_builtin(
            context,
            static_codes[index],
            static_names[index],
            static_lengths[index],
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = define_date_property(
            context,
            frame.slots[1],
            static_names[index],
            frame.slots[2],
            method
        );
    }
    for (size_t index = 0u;
         result.status == OSEO_STATUS_NORMAL &&
             index < (size_t)OSEO_DATE_METHOD_COUNT;
         index += 1u) {
        result = create_date_builtin(
            context,
            OSEO_DATE_METHOD_CODE_ID_LAST - index,
            date_methods[index].name,
            date_methods[index].length,
            OSEO_FUNCTION_INTERNAL
        );
        frame.slots[2] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        if (index != (size_t)OSEO_DATE_TO_PRIMITIVE) {
            result = define_date_property(
                context,
                frame.slots[0],
                date_methods[index].name,
                frame.slots[2],
                method
            );
            continue;
        }
        result = oseo_internal_well_known_symbol(
            context,
            OSEO_WELL_KNOWN_TO_PRIMITIVE
        );
        frame.slots[3] = result.value;
        if (result.status != OSEO_STATUS_NORMAL) break;
        result = oseo_object_define(
            context,
            frame.slots[0],
            frame.slots[3],
            frame.slots[2],
            (OseoPropertyAttributes){true, false, false, false}
        );
    }
    if (result.status != OSEO_STATUS_NORMAL) {
        context->intrinsics[OSEO_INTRINSIC_DATE_PROTOTYPE] =
            oseo_undefined();
        *marker = oseo_undefined();
        oseo_roots_release(context, &frame);
        return result;
    }
    *marker = frame.slots[1];
    if (context->observe_specialization) {
        context->allocations = entry_allocations;
    }
    oseo_roots_release(context, &frame);
    return normal(*marker);
}

OseoResult oseo_internal_date_intrinsic(OseoContext *context) {
    OseoResult built = date_intrinsic_build(context);
    if (built.status != OSEO_STATUS_NORMAL) return built;
    return normal(context->intrinsics[OSEO_INTRINSIC_DATE]);
}

OseoResult oseo_internal_install_date_global(
    OseoContext *context,
    OseoValue global
) {
    OseoValue slots[2] = {global, oseo_undefined()};
    OseoRootFrame frame = {NULL, slots, 2u};
    oseo_roots_push(context, &frame);
    OseoResult result = oseo_internal_date_intrinsic(context);
    slots[1] = result.value;
    if (result.status == OSEO_STATUS_NORMAL) {
        result = define_date_property(
            context,
            slots[0],
            "Date",
            slots[1],
            (OseoPropertyAttributes){true, false, true, false}
        );
    }
    oseo_roots_pop(context, &frame);
    return result.status == OSEO_STATUS_NORMAL ? normal(slots[0]) : result;
}
