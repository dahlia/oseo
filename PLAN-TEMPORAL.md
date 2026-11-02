Temporal plan
=============

Status
------

Implementation status: planned, not scheduled. This plan records the
boundaries Temporal needs before work can start. It reserves no milestone and
adds no repository command. Temporal stays outside the measured claim: proposed
[ADR 0032](./docs/adr/0032-post-m5-edition-boundary.md) excludes it, as
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md) did for M5.

This plan is governed by [*DESIGN.md*](./DESIGN.md),
[*ROADMAP.md*](./ROADMAP.md), [*PLAN-LANGUAGE.md*](./PLAN-LANGUAGE.md),
[*PLAN-INTL.md*](./PLAN-INTL.md), [*PLAN-NIO.md*](./PLAN-NIO.md),
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md),
[ADR 0025](./docs/adr/0025-native-clock-and-wakeup.md), and the
[*M5 language profile*](./docs/language-profile-m5.md).


Scope
-----

Temporal is an ECMAScript 2027 feature. It adds the `Temporal` namespace with
`Now`, `Instant`, `ZonedDateTime`, `PlainDate`, `PlainTime`, `PlainDateTime`,
`PlainYearMonth`, `PlainMonthDay`, and `Duration`, plus
`Date.prototype.toTemporalInstant`.

At test262 revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`, 4,611 paths in
*test/built-ins/* carry the `Temporal` flag. Of those, 4,603 lie under
*test/built-ins/Temporal/* and 8 under
*test/built-ins/Date/prototype/toTemporalInstant/*. Ten also carry the
`Intl.Era-monthcode` proposal flag and stay excluded under the proposal rule
even after Temporal enters, so 4,601 would enter the inventory.

*test/intl402/* holds another 2,100 Temporal-tagged paths, 2,029 of them under
*test/intl402/Temporal/*. They test calendars, time zone names, and formatting
that ECMA-402 adds, and they enter only with
[*PLAN-INTL.md*](./PLAN-INTL.md).

Deno 2.9.7 exposes `Temporal`; Node.js 24.21.0 does not. Differential evidence
therefore has one reference host. An independent model fills the gaps.


Specification boundary without ECMA-402
---------------------------------------

The first checkpoint fixes what ECMA-262 alone requires, from the pinned
specification text. The expected result is that the ISO 8601 calendar and the
`UTC` time zone are mandatory, that other named time zones are
implementation-defined, and that ECMA-402 adds IANA time zone identifiers and
the non-ISO calendars. If the text says otherwise, this plan changes before
implementation.

That boundary allows two stages. A first stage can support only `iso8601` and
offset or `UTC` zones and still pass every ECMA-262 Temporal row that names no
other zone. A second stage adds named zones from the IANA time zone database.
Non-ISO calendars wait for ECMA-402.


Time zone data
--------------

Named zones need transition data. The source is a pinned IANA tz database
release, converted at build time into compact generated C tables by an owned
generator, the way *packages/unicode/* converts the pinned Unicode data. A
regeneration check rejects stale tables, like `check:unicode-tables`.

A standards profile keeps every observable intrinsic, as
[*PLAN-DYN.md*](./PLAN-DYN.md) explains, so Temporal's code and data would
enter every executable, not only programs that use it. The size budget is
therefore a whole-program budget. The data decision compares:

 -  embedding every zone;
 -  embedding a subset selected by an explicit build policy, with an owned
    `RangeError` for any other identifier; and
 -  reading the host's compiled zone files at run time.

The third option makes output depend on the host and needs a host capability
with a recorded fallback. It cannot be the default without a target decision.
Each option records the generated C size, executable size, startup cost, and
lookup cost on Linux AMD64 and macOS AArch64.

The tz database publishes several releases a year. The update path is a
reviewed regeneration that names the release, and the profile records which
release a build carries.


Clock and host boundary
-----------------------

`Temporal.Now` reads the current time and the host time zone.

The [ADR 0025](./docs/adr/0025-native-clock-and-wakeup.md) clock adapter
reports real time in whole milliseconds, which `Date` needs.
`Temporal.Now.instant()` needs epoch nanoseconds. Both supported targets read
`CLOCK_REALTIME`, which has nanosecond fields, so the adapter gains a
nanosecond reading. That changes ADR 0025's contract and needs its own decision
and deterministic-adapter support. `Date` keeps rounding down to the
millisecond, and the two readings must agree when both are taken from the same
sample.

The realm's local time zone is UTC, as the M5 profile records for `Date`, and
the clock adapter has no time zone capability. `Temporal.Now.timeZoneId()`
must report the same zone that `Date`'s LocalTZA uses. A later host time zone
capability changes both together, never one alone.

Epoch nanoseconds are BigInt values, which
[*PLAN-BIGINT.md*](./PLAN-BIGINT.md) already supplies.


Work units
----------

The units are a sketch for scheduling, not reservations.

1.  Standards decision: confirm the boundary above from the specification,
    choose the stage-one zone set, and decide how Temporal enters the
    inventory.
2.  Clock decision: add nanosecond real time to the clock adapter.
3.  Duration and calendar arithmetic over the ISO calendar, as pure runtime
    operations with exact integer and BigInt intermediates.
4.  ISO 8601 and RFC 9557 string parsing and formatting, shared by every
    type.
5.  The `Plain` types, `Instant`, and `Duration`, with their rounding modes and
    option handling.
6.  `ZonedDateTime` and offset and `UTC` zones.
7.  The tz database generator, tables, and named zones.
8.  `Temporal.Now` and `Date.prototype.toTemporalInstant`.
9.  Admission of the Temporal rows and their exit audit.

Units 3 and 4 have no dependency on each other. Unit 6 needs units 3 through 5.
Unit 7 can start after unit 1.

Every unit follows the evidence rules in
[*PLAN-LANGUAGE.md*](./PLAN-LANGUAGE.md). Property tests carry most of the
weight: date arithmetic against an independent days-from-civil model, round
trips through string forms, rounding against exact rational arithmetic, and
zone transitions against the source data. Each property family reserves its
own seed block.


Entering the inventory
----------------------

A record that supersedes ADR 0032's Temporal exclusion moves the 4,601 paths
in. It may admit them in stages: rows that need no named zone first, then the
rows that do once unit 7 lands. A staged admission names each stage's selector,
so no row enters without an owner. The 2,100 *test/intl402/* rows follow the
ECMA-402 inventory in [*PLAN-INTL.md*](./PLAN-INTL.md).


Open questions
--------------

 -  Which time zone data option is the default, and what size budget does it
    have to meet?
 -  Should a build without named-zone data reject unknown identifiers at run
    time only, or also diagnose a literal identifier at build time?
 -  Should Temporal wait for ECMAScript 2027's publication, or enter as a
    named finished feature the way ADR 0032 admits three others?
