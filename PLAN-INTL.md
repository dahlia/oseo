Internationalization plan
=========================

Status
------

Implementation status: planned, not scheduled. This plan records the
boundaries an ECMA-402 implementation needs before work can start. It reserves
no milestone and adds no repository command. ECMA-402 stays outside the
measured claim under
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) and proposed
[ADR 0032](./docs/adr/0032-post-m5-edition-boundary.md).

This plan is governed by [*DESIGN.md*](./DESIGN.md),
[*ROADMAP.md*](./ROADMAP.md),
[*docs/language-profile-es2026.md*](./docs/language-profile-es2026.md#claim-boundary),
[*PLAN-TEMPORAL.md*](./PLAN-TEMPORAL.md), [*PLAN-DYN.md*](./PLAN-DYN.md),
[*PLAN-GC.md*](./PLAN-GC.md), [*PLAN-PT.md*](./PLAN-PT.md), and the
[*M5 language profile*](./docs/language-profile-m5.md).


Scope
-----

The track covers the `Intl` namespace and its constructors: `Collator`,
`NumberFormat`, `PluralRules`, `DateTimeFormat`, `RelativeTimeFormat`,
`ListFormat`, `DisplayNames`, `Locale`, `Segmenter`, and `DurationFormat`. It
also covers `Intl.getCanonicalLocales` and `Intl.supportedValuesOf`, and the
ECMA-402 replacements of `localeCompare`, `toLocaleUpperCase`,
`toLocaleLowerCase`, and the `toLocaleString` methods of `Number`, `BigInt`,
`Date`, `Array`, and `%TypedArray%`.

*test/intl402/* holds 3,341 files at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The largest directories are
*Temporal/* (2,029), *NumberFormat/* (249), *DateTimeFormat/* (244), and
*Locale/* (152). Across the directory, 2,100 files carry the `Temporal` flag.
At least 1,699 carry a proposal flag: 1,556 `Intl.Era-monthcode`, 99
`Intl.NumberFormat-v3`, and 44 `Intl.Locale-info`. Those stay excluded until
their proposals finish.


What exists today
-----------------

The M5 profile implements the ECMA-262 fallbacks, and every one is
deterministic and independent of host locale state:

 -  `localeCompare` normalizes both strings to NFD and compares UTF-16 code
    units;
 -  `toLocaleUpperCase` and `toLocaleLowerCase` apply the pinned Unicode
    17.0.0 default mappings;
 -  `Number`, `BigInt`, and `Date` `toLocaleString` return the base
    specification's fallback text, and `Date` uses the realm's UTC local time
    zone; and
 -  `Array.prototype.toLocaleString` and the TypedArray form call each
    element's `toLocaleString` with no arguments.

ECMA-402 changes each of these observably. Replacing one is a reviewed change
to its family record and re-observes the rows that call it.


Locale data
-----------

ECMA-402 needs CLDR locale data and algorithms for collation, segmentation,
plural rules, and number and date formatting. The data decision compares three
routes:

 -  linking ICU4C with its data library;
 -  linking ICU4X through its C interface, with data built for the selected
    locales; and
 -  an owned generator that converts pinned CLDR and Unicode data into
    generated C tables, as *packages/unicode/* does for Unicode properties,
    with owned algorithms.

Each route records its pinned version, license, update path, Zig and C
integration, static-link behavior, binary and data size, and replacement
boundary. The semantic layer stays separate from the data provider, the way
[*PLAN-CRYPTO.md*](./PLAN-CRYPTO.md) separates algorithm semantics from the
provider, so a later provider change does not change the intrinsic surface.

A standards profile keeps every observable intrinsic, as
[*PLAN-DYN.md*](./PLAN-DYN.md) explains, so locale data would enter every
executable. The size budget is a whole-program budget. A build policy that
selects the available locales is the expected way to bound it. The default
locale and the behavior for a request outside the selected set are part of the
same decision. Today no host locale reaches the realm, and the default should
stay a build input rather than a value read from the environment, unless a host
capability with a recorded fallback is added.


Temporal
--------

ECMA-402 supplies Temporal's non-ISO calendars, `era` and `eraYear`, IANA time
zone identifiers, and `Intl.DateTimeFormat` support for Temporal values. The
2,029 *test/intl402/Temporal/* paths need both tracks. Temporal's ISO-calendar
stage in [*PLAN-TEMPORAL.md*](./PLAN-TEMPORAL.md) does not wait for this plan,
and this plan's constructors do not wait for Temporal. The tz database data
that Temporal adds and the time zone names that `DateTimeFormat` reports must
come from one source.


Entering an inventory
---------------------

A later record adds *test/intl402/* as a candidate root. It keeps the proposal
rule, names the ECMA-402 edition, and records how implementation-defined
choices are classified: the available locales, the default locale, and data
versions. Tests that need a locale outside the selected set are classified by a
reviewed rule, not dropped. The harness needs the *testIntl.js* include and its
helpers.


Work units
----------

The units are a sketch for scheduling.

1.  Standards and data decision: the ECMA-402 edition, the data route, the
    locale policy, and the inventory rule.
2.  `Intl` namespace, locale negotiation, `Intl.Locale`, and
    `getCanonicalLocales`.
3.  `Collator` and the `localeCompare` replacement.
4.  `PluralRules`, `NumberFormat`, and the `Number` and `BigInt`
    `toLocaleString` replacements.
5.  `DateTimeFormat`, `RelativeTimeFormat`, `DurationFormat`, and the `Date`
    replacements.
6.  `ListFormat`, `DisplayNames`, `Segmenter`, and `supportedValuesOf`.
7.  Temporal integration, after the Temporal named-zone stage.
8.  Admission of the *test/intl402/* rows.

Units 3 through 6 depend on unit 2 and not on each other. Differential tests
compare Node.js 24.21.0 and Deno 2.9.7 only for locales and options whose
output both hosts agree on, because their ICU data versions may differ from
the pinned data.


Open questions
--------------

 -  Which data route meets the size budget on both supported targets?
 -  Which locales does the default build carry, and what is the default
    locale?
 -  Should a program be able to select locales at build time, and how does
    the build record that choice?
