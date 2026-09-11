Regular expression matcher probes
=================================

Status
------

Measurement record for delivery item 8 of
[*PLAN-REGEXP.md*](../PLAN-REGEXP.md), written on September 11, 2026. It
runs the matcher-strategy, external-component, Unicode-table, resource,
and code-size probes over one reviewed corpus and reports what each one
measured.

This document selects nothing. Delivery item 9 is the architecture
decision that reads it, and until that decision lands, no measurement
here is a commitment to a matcher backend, a runtime split, or a fast
path. Where a probe could not answer a question the plan asks, the
question is named as an open limit rather than closed with an estimate.

Every number below was observed on one host in one run. A later
comparison run records its own host facts instead of reusing these.
Observed values and derived values are separated; a derived value names
the observations it comes from.


How to reproduce
----------------

~~~~ sh
mise run probe:regexp
mise run probe:regexp -- --json probe.json
mise run probe:regexp -- --no-native
~~~~

The task prints the complete report this document quotes. `--json`
retains the same measurements as structured data, and `--no-native`
skips the code-size probe on a host with no supported native target.
The probe corpus, the analysis, and the external harness live under
*tools/regexp-probes/*, and *tests/regexp-probes.test.ts* keeps the
host-independent half of the report reproducible inside the ordinary
gate.

The whole run took 40 seconds on the measurement host, and it compiles
no runtime source that the ordinary gates do not already compile. Every
artifact it builds for its own measurements lives in a temporary
directory it removes on every exit. Three things are written elsewhere
and are not that: the task depends on `build`, so the npm packages are
rebuilt where they always are; the pinned Zig toolchain writes its
compilation caches wherever `ZIG_GLOBAL_CACHE_DIR` and
`ZIG_LOCAL_CACHE_DIR` point, both of which its environment policy
inherits, so the local cache stays inside the working directory only
while it is not redirected; and `--json` writes the path it is given.


Measurement environment
-----------------------

| Fact              | Value                                      |
| ----------------- | ------------------------------------------ |
| Commit            | `d9db53e0d402e0643d0fd75ed089c24d3f791ef1` |
| Operating system  | Linux 7.1.12-200.fc44.x86\_64              |
| Processor         | AMD Ryzen 7 7700X, 8 cores, 16 threads     |
| Memory            | 61 GiB total, 41 GiB available             |
| Oseo target       | `linux-x86_64-gnu`, no sanitizer           |
| Zig               | 0.16.0                                     |
| Node.js           | 24.18.0                                    |
| Deno              | 2.9.2                                      |
| System C compiler | GCC 16.2.1 (Red Hat 16.2.1-2)              |
| PCRE2             | 10.47, 16-bit, shared library              |
| Unicode tables    | 17.0.0, pinned by `@oseo/unicode`          |

Four environment choices change what the numbers mean and are
deliberate:

 -  The measurement target carries no sanitizer. The reviewed native
    gates build with `address` and `undefined`, which change both size
    and time by more than most of the effects measured here, so a size
    or a duration in this document is smaller than the same build in
    those gates.
 -  Every Zig invocation runs under the snapshot the toolchain's own
    environment policy admits, which is what a composition root passes
    into its build plan. A build that fell back to ordinary inheritance
    would let a variable such as `CPATH` reach the compiler, so the
    report says which of the two happened; this run used the snapshot.
 -  The Zig compilation cache was warm, in the lane cache directory
    `ZIG_GLOBAL_CACHE_DIR`. The runtime archive took 0.43 s to build
    from that cache. A cold cache takes minutes, and the first link in
    one working directory pays a one-time cost that the probe discards
    by building a warm-up program before it measures.
 -  Timings are the smallest of several attempts where they are repeated
    at all: five attempts for one artifact build, seven executions for
    one native program, a repeat loop bounded at 20 ms or 2,000 attempts
    for one compiler-side match, and five for one external match. The
    archive build, one component compilation, the generated C
    compilation, the link, and one external pattern compilation are each
    measured once. The smallest attempt is reported because it is the
    one least contaminated by other work on the host, not because it is
    typical.


Corpus and pins
---------------

The corpus holds 29 patterns in *tools/regexp-probes/corpus.ts*. Nine
come from reviewed test262 paths and carry the exact pattern the cited
path executes, two come from a pinned dependency-free package, four are
patterns published by a specification or a standard document, and
fourteen are constructed stress cases. Every subject is described as a
repeated unit and an optional suffix so that a multi-kilobyte subject
stays one readable line.

| Pattern                    | Origin   | Flags | Provenance                                                                                            |
| -------------------------- | -------- | ----- | ----------------------------------------------------------------------------------------------------- |
| `choice-graph`             | test262  | none  | *test/built-ins/RegExp/S15.10.2.5\_A1\_T3.js*                                                         |
| `capture-reset`            | test262  | none  | *test/built-ins/RegExp/S15.10.2.5\_A1\_T4.js*                                                         |
| `lazy-bounded`             | test262  | none  | *test/built-ins/RegExp/prototype/exec/S15.10.6.2\_A1\_T4.js*                                          |
| `class-pair`               | test262  | none  | *test/built-ins/RegExp/prototype/exec/S15.10.6.2\_A1\_T21.js*                                         |
| `lookbehind-greedy`        | test262  | none  | *test/built-ins/RegExp/lookBehind/greedy-loop.js*                                                     |
| `lookbehind-backreference` | test262  | `i`   | *test/built-ins/RegExp/lookBehind/back-references.js*                                                 |
| `property-escape-negated`  | test262  | `u`   | *test/built-ins/RegExp/prototype/exec/regexp-builtin-exec-v-u-flag.js*                                |
| `named-group-alternation`  | test262  | none  | *test/built-ins/RegExp/named-groups/non-unicode-property-names-valid.js*                              |
| `class-set-difference`     | test262  | `v`   | *test/built-ins/RegExp/unicodeSets/generated/character-property-escape-difference-character-class.js* |
| `yaml-control-characters`  | package  | `u`   | yaml 2.9.0, *dist/stringify/stringifyString.js*                                                       |
| `yaml-tag-split`           | package  | `s`   | yaml 2.9.0, *dist/doc/directives.js*                                                                  |
| `semver`                   | standard | none  | The published SemVer 2.0.0 pattern                                                                    |
| `uri-reference`            | standard | none  | RFC 3986 appendix B                                                                                   |
| `email-address`            | standard | none  | The HTML email-input pattern                                                                          |
| `word-scan`                | standard | `g`   | ECMA-262 22.2.2.6, `\b` over `\w`                                                                     |
| `nested-quantifier`        | stress   | none  | `(a+)+$` against a run of `a` and one refusing character                                              |
| `ambiguous-alternation`    | stress   | none  | `^(a\|aa)+$` against the same shape                                                                   |
| `large-bounded-repetition` | stress   | none  | `a{0,2000}b`                                                                                          |
| `many-captures`            | stress   | none  | Forty capturing groups                                                                                |
| `empty-repetition`         | stress   | none  | `(a*)*b`                                                                                              |
| `deep-lookaround`          | stress   | none  | Three nested assertions                                                                               |
| `lazy-any-scan`            | stress   | none  | `[\s\S]*?jx` over a subject that never completes it                                                   |
| `script-run`               | stress   | `u`   | Two property escapes in one pattern                                                                   |
| `unicode-whitespace`       | stress   | none  | `\s+`, whose class the edition does not draw from ASCII                                               |
| `sticky-attempt`           | stress   | `y`   | `a` over a subject whose only `a` is not at the start                                                 |
| `line-terminator-class`    | stress   | `m`   | `^b` after a line separator and after a vertical tab                                                  |
| `folded-word-character`    | stress   | `iu`  | `\w+` over U+017F and U+212A, which fold into the word set                                            |
| `unset-backreference`      | stress   | none  | `(?:(a)\|b)\1c`, a reference to a group that did not participate                                      |
| `ignore-case-closure`      | stress   | `iu`  | An ignore-case class over a non-ASCII closure                                                         |

*tests/regexp-probes.test.ts* checks that every `test262` provenance is
a path the reviewed subset in *tests/test262/subset.yaml* still holds,
so a corpus entry cannot drift away from the evidence it cites. The two
package patterns come from `yaml`, which the workspace pins at 2.9.0 and
which declares no dependencies of its own.

The last four stress cases exist because each names one rule the
edition states and no candidate component reproduces for free. They are
described where the external-component probe reads them.

Two of the probes run over a subset of the corpus and say why:

 -  A dynamic program can carry only what the runtime's own pattern
    compiler admits, which is 25 of the 29. It excludes
    `property-escape-negated` and `script-run` for a property escape,
    `class-set-difference` for class set notation, and
    `ignore-case-closure` for a non-ASCII ignore-case closure. An
    ahead-of-time literal has no such boundary because its descriptor
    carries the resolved sets.
 -  A timed program repeats 20 of those 25. It excludes `word-scan` and
    `sticky-attempt` because a reused object keeps a `lastIndex` cursor
    that would be measured instead of the match, `empty-repetition`
    because the attempt reaches an owned boundary, and
    `nested-quantifier` and `lazy-any-scan` because one attempt costs
    1,834,918 and 667,851 steps, which would measure only themselves.


Artifact storage
----------------

What an ahead-of-time literal carries is measured from the artifacts
themselves rather than read back out of emitted C, which the code-size
probe measures separately below.

The 29 artifacts hold 1,976 bytes of resolved character sets, from 8 to
944 bytes each, and 9,352 bytes of canonicalization tables. All 9,352
of those belong to `lookbehind-backreference`, which is the one shape
that has to carry a complete `Canonicalize` table: `i` with a
backreference folds an input character at match time and cannot resolve
it while the artifact is built. `script-run` owns the largest set
storage at 944 bytes, from two property escapes.

Instruction counts run from 5 to 244 and register counts from 2 to 82,
both peaking at `many-captures`, whose forty groups are the corpus's
upper bound on descriptor size rather than on match work.


Matcher strategy
----------------

The plan names three shapes to compare: the compact ordered matcher that
exists, an automaton path for patterns proven regular, and direct
generated C.

### What each candidate could take

The probe walks the artifact's own instruction program, so the answer is
about the pattern as lowered rather than about its source text. A
configuration is one instruction address together with every repetition
counter, clamped to the bound above which no later decision changes. No
automaton is built or run: every automaton number here is a property of
the program.

| Pattern                    | Instructions | Registers | Configurations | Deterministic states | Symbols | Automaton blockers        |
| -------------------------- | ------------ | --------- | -------------- | -------------------- | ------- | ------------------------- |
| `choice-graph`             | 30           | 6         | 12             | 10                   | 5       | none                      |
| `capture-reset`            | 38           | 22        | 16             | 14                   | 7       | none                      |
| `lazy-bounded`             | 10           | 4         | 5              | 7                    | 4       | none                      |
| `class-pair`               | 6            | 2         | 2              | 4                    | 5       | none                      |
| `lookbehind-greedy`        | 19           | 9         | -              | -                    | -       | lookaround                |
| `lookbehind-backreference` | 15           | 7         | -              | -                    | -       | backreference, lookaround |
| `property-escape-negated`  | 5            | 2         | 1              | 3                    | 2       | none                      |
| `named-group-alternation`  | 14           | 4         | 6              | 7                    | 10      | none                      |
| `class-set-difference`     | 11           | 4         | 1              | -                    | -       | assertion                 |
| `yaml-control-characters`  | 5            | 2         | 1              | 3                    | 8       | none                      |
| `yaml-tag-split`           | 21           | 10        | 3              | -                    | -       | assertion                 |
| `semver`                   | 119          | 42        | 35             | -                    | -       | assertion                 |
| `uri-reference`            | 69           | 38        | 36             | -                    | -       | assertion                 |
| `email-address`            | 39           | 14        | 23,499         | -                    | -       | assertion                 |
| `word-scan`                | 11           | 4         | 1              | -                    | -       | assertion                 |
| `nested-quantifier`        | 16           | 8         | 1              | -                    | -       | assertion                 |
| `ambiguous-alternation`    | 17           | 6         | 3              | -                    | -       | assertion                 |
| `large-bounded-repetition` | 10           | 4         | 4,001          | 2,003                | 4       | none                      |
| `many-captures`            | 244          | 82        | 80             | 42                   | 4       | none                      |
| `empty-repetition`         | 16           | 8         | 2              | 3                    | 4       | none                      |
| `deep-lookaround`          | 16           | 5         | -              | -                    | -       | lookaround                |
| `lazy-any-scan`            | 11           | 4         | 3              | 3                    | 5       | none                      |
| `script-run`               | 15           | 6         | 3              | 5                    | 237     | none                      |
| `unicode-whitespace`       | 9            | 4         | 1              | 3                    | 21      | none                      |
| `sticky-attempt`           | 5            | 2         | 1              | 3                    | 3       | none                      |
| `line-terminator-class`    | 6            | 2         | 1              | -                    | -       | assertion                 |
| `folded-word-character`    | 9            | 4         | 1              | 3                    | 13      | none                      |
| `unset-backreference`      | 12           | 4         | -              | -                    | -       | backreference             |
| `ignore-case-closure`      | 9            | 4         | 1              | 3                    | 9       | none                      |

The ordered matcher takes all 29, which is what makes it the semantic
authority. A backreference or a lookaround has no automaton
representation at all, and that is 4 of the 29 here: `lookbehind-greedy`,
`lookbehind-backreference`, `deep-lookaround`, and
`unset-backreference`. An assertion is a weaker blocker: a simulation
evaluates `^`, `$`, and `\b` at each position, so the 9 patterns blocked
only by an assertion stay available to an automaton path, while a
deterministic automaton would have to widen its state with the preceding
character class to keep them. This probe does not measure that widening,
so those rows report a configuration count and no deterministic state
count. A deterministic state count includes the dead state a failed
transition leads to.

An alphabet symbol is the representative of one interval the program's
consuming sets induce. The closing sentinel of an inversion list that
reaches the top of the code space is not one, because the interval it
would open holds no code point, so a negated class such as
`property-escape-negated` reports 2 symbols rather than 3.

Two rows carry the state-explosion warning the plan asks about. The
counted repetition in `large-bounded-repetition` is one loop and one
counter in the artifact and 4,001 configurations in an automaton, and
`email-address` reaches 23,499 configurations from two `{0,61}` bounds
that an artifact stores in two registers. Neither exhausts the reviewed
caps of 65,536 configurations, 4,096 deterministic states, and 2,048
alphabet symbols, so no row in this corpus was capped.

### What the ordered matcher does today

`steps` is the executor's own deterministic work counter, so it is the
same on every host. The two columns beside it are bounds on a simulation
rather than measurements of one. `floor` is the number of input
positions any engine has to read before it can give this answer, which
is every position in the subject when there is no match and the
positions up to the end of the match when there is one. `ceiling` is the
configurations times one more than the subject's position count, which
bounds the configuration visits a simulation performs; it excludes the
epsilon-closure work each visit needs, so it understates the cost of a
visit while it overstates how many of them happen.

A position is not always a code unit. In unicode mode the matcher
advances over a surrogate pair once, so `positions` counts code points
there and code units otherwise, and both bounds are counted in
positions. `units` stays the subject's code-unit length, which is its
size and the unit every capture index is measured in. Only
`property-escape-negated` over its `mixed` subject separates the two in
this corpus, at 704 units and 640 positions.

| Pattern                    | Input       | Outcome   | Units | Positions | Steps      | Floor | Ceiling | Attempt      |
| -------------------------- | ----------- | --------- | ----- | --------- | ---------- | ----- | ------- | ------------ |
| `choice-graph`             | `long`      | matched   | 3,072 | 3,072     | 40         | 4     | 36,876  | 1.3 us       |
| `capture-reset`            | `long`      | matched   | 2,560 | 2,560     | 133        | 10    | 40,976  | 4.7 us       |
| `class-pair`               | `long`      | matched   | 7,168 | 7,168     | 41         | 14    | 14,338  | 3.0 us       |
| `lookbehind-greedy`        | `long`      | matched   | 2,816 | 2,816     | 225        | 11    | -       | 11.0 us      |
| `yaml-control-characters`  | `plain`     | unmatched | 704   | 704       | 1,410      | 704   | 705     | 167.6 us     |
| `yaml-tag-split`           | `long`      | matched   | 336   | 336       | 1,393      | 336   | 1,011   | 47.2 us      |
| `property-escape-negated`  | `ascii`     | unmatched | 1,024 | 1,024     | 2,050      | 1,024 | 1,025   | 220.0 us     |
| `semver`                   | `reject`    | unmatched | 7     | 7         | 70         | 7     | 280     | 10.8 us      |
| `email-address`            | `reject`    | unmatched | 29    | 29        | 301        | 29    | 704,970 | 21.9 us      |
| `word-scan`                | `prose`     | matched   | 3,456 | 3,456     | 21         | 3     | 3,457   | 1.0 us       |
| `nested-quantifier`        | `reject-16` | unmatched | 17    | 17        | 1,834,918  | 17    | 18      | 58,271.8 us  |
| `nested-quantifier`        | `reject-18` | unmatched | 19    | 19        | 7,339,932  | 19    | 20      | 228,024.2 us |
| `ambiguous-alternation`    | `reject-16` | unmatched | 17    | 17        | 42,820     | 17    | 54      | 1,210.2 us   |
| `large-bounded-repetition` | `reject`    | unmatched | 10    | 10        | 341        | 10    | 44,011  | 13.6 us      |
| `many-captures`            | `accept`    | matched   | 40    | 40        | 203        | 40    | 3,280   | 7.1 us       |
| `empty-repetition`         | `reject`    | limit     | 24    | 24        | 16,777,216 | 24    | 50      | 514,294.3 us |
| `lazy-any-scan`            | `late`      | unmatched | 2,560 | 2,560     | 16,734,726 | 2,560 | 7,683   | 565,766.8 us |
| `script-run`               | `greek`     | matched   | 512   | 512       | 36         | 7     | 1,539   | 1.6 us       |

The complete table is in the task's own output; the rows above are the
ones the comparison turns on. Two things follow from them, and the
second is the reason this probe exists:

 -  On an ordinary pattern the ordered matcher already works close to
    the floor, so an automaton path has little to win. It answers
    `choice-graph` over 3,072 characters in 40 steps and `word-scan`
    over 3,456 characters in 21, because an attempt stops at the first
    match and never reads the rest of the subject, and both are within
    a small factor of the positions any engine must read.
 -  On an adversarial pattern the ratio inverts without limit.
    `nested-quantifier` takes 1,834,918 steps where the ceiling on a
    simulation of the same program is 18, and two more input characters
    take it to 7,339,932 against a ceiling of 20, a factor of four for
    each character pair. `empty-repetition` reaches the reviewed step
    boundary at 16,777,216 against a ceiling of 50.

Both adversarial patterns are automaton-eligible except for their
anchor, so this is measured evidence that an automaton path would answer
the cases the ordered matcher answers worst, and that its headroom on
the ordinary cases is small.

Direct generated C was not measured. The candidate does not exist:
there is no lowering from the artifact to C control flow, and emitting
one for a probe would measure the probe's lowering rather than a
reviewed one. What this run does bound is the size budget such a
lowering would have to fit, which the code-size probe below records as
1,717 bytes of generated C and 1,149 bytes of executable for each
pattern in the current serialized-data form.


Resource behavior
-----------------

The peak entry counts are measured rather than estimated. Lowering an
owned limit can only replace an answer with that limit's failure, so the
smallest backtrack-entry and trail-entry limits at which an attempt
still reaches its ordinary answer are its peaks, and the probe searches
for them with the other limits at their reviewed defaults. It doubles
from one before it bisects, because a sufficient limit is the expensive
question: it runs the attempt to completion where an insufficient one
stops at the boundary.

The ordinary answer is whatever the reviewed defaults produce, and a
reached step boundary is one of them. A pattern that exhausts the step
limit still holds a finite stack and a finite trail while it does, so
`empty-repetition` reports its peaks like every other row. A dimension
is left empty only when the ordinary answer is that dimension's own
boundary. That says its peak is above the reviewed limit, which is the
largest value this search can ask about, not that the attempt has no
peak. No row in this corpus is in that position.

The entry counts are what this probe measures. The two byte columns
beside them are derived from those counts and from the runtime's own
layout, which charges 16 for a backtrack entry, a `uint32_t` resume
address with an `int64_t` input position and a `uint32_t` trail height,
and 12 for a trail entry, a `uint32_t` register index with its `int64_t`
previous value.

`packed` is what the peaks occupy at those widths. `arrays` is what the
runtime requests for them: each array is allocated at 64 entries,
doubles when it fills, and never shrinks within an attempt, so a peak is
rounded up to 64 or to the next power of two, and the `int64_t` register
array is added.

Neither is one attempt's total memory. `arrays` is exact for the five
growing arrays and the registers it names, and charges no allocator
rounding or bookkeeping, no machine structure, and nothing the matcher
holds outside them. Every conclusion below is about that work area
rather than about a process, and is drawn from `arrays` rather than from
`packed`.

| Pattern                    | Input        | Outcome      | Steps      | Backtrack peak | Trail peak | Packed | Arrays | Build    |
| -------------------------- | ------------ | ------------ | ---------- | -------------- | ---------- | ------ | ------ | -------- |
| `capture-reset`            | `spec`       | matched      | 133        | 11             | 106        | 1,448  | 2,736  | 18.6 us  |
| `lookbehind-backreference` | `short`      | matched      | 59         | 1              | 7          | 100    | 1,848  | 245.7 us |
| `yaml-tag-split`           | `long`       | matched      | 1,393      | 337            | 678        | 13,528 | 20,560 | 10.2 us  |
| `semver`                   | `prerelease` | matched      | 136        | 14             | 56         | 896    | 2,128  | 60.4 us  |
| `uri-reference`            | `absolute`   | matched      | 163        | 28             | 101        | 1,660  | 2,864  | 28.8 us  |
| `email-address`            | `reject`     | unmatched    | 301        | 25             | 61         | 1,132  | 1,904  | 30.3 us  |
| `nested-quantifier`        | `reject-18`  | unmatched    | 7,339,932  | 18             | 172        | 2,352  | 4,160  | 5.5 us   |
| `ambiguous-alternation`    | `reject-16`  | unmatched    | 42,820     | 33             | 103        | 1,764  | 2,608  | 11.6 us  |
| `many-captures`            | `accept`     | matched      | 203        | 21             | 82         | 1,320  | 3,216  | 90.3 us  |
| `empty-repetition`         | `reject`     | limit: steps | 16,777,216 | 46             | 198        | 3,112  | 4,160  | 5.6 us   |
| `lazy-any-scan`            | `late`       | unmatched    | 16,734,726 | 1              | 5,124      | 61,504 | 99,360 | 6.3 us   |
| `deep-lookaround`          | `accept`     | matched      | 15         | 3              | 5          | 108    | 1,832  | 5.7 us   |
| `unset-backreference`      | `unset`      | matched      | 9          | 1              | 2          | 40     | 1,824  | 5.5 us   |

Every row is stable: the measured peak is sufficient on a repeat and one
entry below it reaches exactly the boundary it names.

Three results matter for the decision:

 -  The matcher work area is small and is not what a pathological
    pattern consumes. The largest one the runtime reserves in the corpus
    is 99,360 bytes, for `lazy-any-scan`, and the patterns that burn
    millions of steps stay at 4,160. Backtracking depth tracks the
    subject length, not the size of the choice tree, because an
    exhausted alternative is popped rather than kept: the deepest stack
    in the corpus belongs to `yaml-tag-split`, whose greedy `.*` keeps
    one entry for each of 336 characters. `lazy-any-scan` is the trail's
    counterpart, keeping 5,124 register writes over a 2,560-character
    scan.
 -  Compile work is small and has one outlier.
    `lookbehind-backreference` costs 245.7 us to build against 2.8 to
    90.3 us for every other pattern, because `i` with a backreference is
    the one shape that has to carry a complete `Canonicalize` table into
    the artifact.
 -  The owned boundary behaves as the plan requires. `(a*)*b` reaches
    the step limit deterministically and reports which boundary it
    reached, rather than returning a wrong answer or stopping on a
    clock. The native runtime reaches the same boundary on the same
    input and reports it as one located `OSEO2001` diagnostic, which the
    code-size probe records below.

Two properties the plan lists for this probe are not measured here.
Native stack use is not, because the executor keeps its choices in an
explicit stack and the probe observes that stack's height rather than
the C call stack. Cleanup after failure is not, because the
compiler-side executor allocates nothing to release; the runtime's work
area is what would have to be observed, and the reviewed native gates
own that under their sanitizers.


Unicode data
------------

Every layout is measured from the pinned Unicode 17.0.0 tables. The
question the plan asks this probe to own is what a dynamic pattern must
carry into the runtime before the runtime's own property boundary can
move, and the answer is the whole of the first table below, because a
dynamic pattern names its property at run time.

| Group              | Sets | Boundaries | Code points | Inversion | Inversion varint | Bitmap    | Per-set trie | Search steps |
| ------------------ | ---- | ---------- | ----------- | --------- | ---------------- | --------- | ------------ | ------------ |
| Binary properties  | 53   | 25,212     | 2,574,088   | 100,848   | 26,593           | 464,080   | 520,640      | 11           |
| General categories | 38   | 13,270     | 2,232,424   | 53,080    | 14,423           | 330,328   | 376,192      | 11           |
| Scripts            | 176  | 3,434      | 1,114,112   | 13,736    | 4,039            | 1,448,616 | 1,553,376    | 11           |
| Script extensions  | 176  | 4,174      | 1,115,103   | 16,696    | 4,975            | 1,448,696 | 1,558,912    | 11           |
| Word characters    | 2    | 20         | 128         | 80        | 22               | 16,384    | 17,600       | 4            |

Two more tables complete the demand. Simple case folding is 1,512
entries, 12,096 bytes as code-point pairs and 3,480 bytes as base-128
deltas with a zigzag-encoded signed distance to the target; it is the
one table a matcher cannot resolve while it builds an artifact, because
an ignore-case backreference folds an input character at match time. The
seven properties of strings hold 7,906 sequences of at most 10 code
points, 114,924 bytes as sequences with their lengths.

The payload a dynamic pattern compiler would carry to reach all of it is
therefore 311,460 bytes: the five groups as inversion lists, the
case-folding mapping as pairs, and the properties of strings. That is a
total for one selected layout rather than a floor. It charges no
property-name table, no per-set index, and none of the code the lookups
need, and substituting a cheaper layout for one group lowers it:
answering the general categories from the classifier below instead of
from inversion lists takes the same payload to 308,708 bytes.

A per-set trie is the worst layout in every group, because each set pays
for its own block index. The layout that makes a constant-time lookup
affordable is one shared classifier over an enumerated property's
disjoint values, with one bit for each queryable value so that a union
such as `General_Category=L` is answered from the same table:

| Classifier         | Disjoint values | Queries | Unique blocks of 256 | Shared bytes | Mask bytes | Separate tries |
| ------------------ | --------------- | ------- | -------------------- | ------------ | ---------- | -------------- |
| `General_Category` | 30              | 38      | 162                  | 50,176       | 152        | 376,192        |
| `Script`           | 176             | 176     | 165                  | 50,944       | 4,048      | 1,553,376      |

So the candidate shapes have measured costs. Inversion lists as 32-bit
boundaries cost 184,440 bytes for the five groups and answer in at most
11 comparisons. The same lists as deltas cost 50,052 bytes and have to
be decoded before they can be searched. Shared classifiers for the two
enumerated properties cost 105,320 bytes with their masks and answer in
two loads, but they answer only about those two properties, so the 53
binary properties still need their own representation.

An ahead-of-time literal carries none of this. The builder resolves
every escape into an inversion list while it builds the artifact, so the
whole 29-pattern corpus carries 1,976 bytes of sets and one 9,352-byte
canonicalization table against the 311,460-byte payload a dynamic
pattern needs to reach every admitted property.


Code size and first-use cost
----------------------------

Every number here is from a real build through the same frontend, the
same C backend, and the pinned Zig toolchain, under the toolchain's own
environment snapshot. The runtime archive is 4,715,322 bytes and is
built once for every program. The C compilation of the generated source
and the link against that archive are separate timed steps.

| Program             | Patterns | Generated C | Object    | Object text | Executable | Text      | Compile | Link  | Run      |
| ------------------- | -------- | ----------- | --------- | ----------- | ---------- | --------- | ------- | ----- | -------- |
| `baseline`          | 0        | 2,866       | 15,288    | 2,477       | 6,484,952  | 896,378   | 33 ms   | 24 ms | 1.9 ms   |
| `literal-one`       | 1        | 9,074       | 46,840    | 12,090      | 6,503,296  | 905,994   | 42 ms   | 24 ms | 2.4 ms   |
| `literal-all`       | 29       | 160,050     | 627,408   | 201,864     | 6,867,760  | 1,095,770 | 210 ms  | 23 ms | 2.3 ms   |
| `literal-control`   | 29       | 110,248     | 590,584   | 201,860     | 6,834,440  | 1,095,770 | 207 ms  | 22 ms | 2.3 ms   |
| `literal-shared`    | 25       | 141,931     | 546,552   | 174,752     | 6,817,848  | 1,068,650 | 171 ms  | 21 ms | 2.2 ms   |
| `dynamic-shared`    | 25       | 179,134     | 1,135,336 | 418,881     | 7,155,640  | 1,312,794 | 409 ms  | 21 ms | 2.5 ms   |
| `literal-match`     | 20       | 154,757     | 623,856   | 210,484     | 6,865,344  | 1,104,394 | 216 ms  | 24 ms | 199.6 ms |
| `dynamic-match`     | 20       | 198,799     | 1,205,816 | 450,570     | 7,202,304  | 1,344,474 | 392 ms  | 23 ms | 175.4 ms |
| `dynamic-construct` | 20       | 178,021     | 1,092,208 | 406,594     | 7,132,416  | 1,300,506 | 346 ms  | 22 ms | 306.2 ms |
| `literal-boundary`  | 1        | 7,711       | 40,480    | 9,651       | 6,499,400  | 903,562   | 69 ms   | 20 ms | 45.2 ms  |

A timed program performs 2,000 rounds over 20 patterns, which is 40,000
match attempts, and prints how many of them matched as one count for
each pattern in corpus order. Every other program answers each pattern
once and prints one digit for each. Both shapes are compared pattern by
pattern rather than by a sum in which two disagreements could cancel.

`literal-control` is the paired control the per-literal figures come
from. It keeps the statements, the subjects, and the descriptor count of
`literal-all` and replaces only the pattern, in every case with the
smallest artifact there is. The difference between the two is therefore
what the corpus patterns cost above that floor, without the fixed cost
of reaching the matcher at all.

The three separately compiled runtime components that own this family
are *runtime\_regexp.c* at 220,584 object bytes and 21,783 text bytes,
*runtime\_regexp\_matcher.c* at 261,320 and 29,984, and
*runtime\_regexp\_symbol.c* at 136,416 and 12,499.

Derived from those observations:

 -  One corpus literal costs 1,717 bytes of generated C, 1,270 bytes of
    generated object, and 1,149 bytes of executable above the smallest
    artifact, from `literal-all` against `literal-control` over the same
    29 patterns.
 -  A literal costs no executable text at all. Those two programs report
    the same 1,095,770 text bytes and differ by 4 object text bytes over
    29 patterns, which says the artifact a literal adds is data the
    linker places outside `.text` rather than code. A candidate that
    lowered a pattern to C control flow instead would spend text where
    this one spends none, and 1,149 bytes for each pattern is the budget
    it would have to fit.
 -  Reaching the matcher at all costs 349,488 bytes of executable and
    199,392 bytes of text, from `baseline` against `literal-control`.
    That is the fixed cost a program pays for its first literal, and it
    is 304 times what one more literal then costs.
 -  Reaching pattern construction costs a further 337,792 bytes of
    executable and 244,144 bytes of text, from `literal-shared` against
    `dynamic-shared` over the same 25 patterns. The two programs link
    the same archive, so this is the code a literal-only program does
    not retain. It also costs 238 ms more C compilation and 588,784 more
    object bytes for the generated source itself.
 -  One match attempt costs about 4.9 us, from `literal-match` over
    40,000 attempts against a baseline process of 1.9 ms.
 -  Compiling one pattern at run time costs about 2.7 us, from
    `dynamic-construct` against `literal-match` over the same 40,000
    attempts. Those two are the pair that differ only in compilation:
    each evaluates a fresh object for every attempt, where
    `dynamic-match` reuses one object it hoisted out of the loop, so
    `dynamic-construct` against `dynamic-match` would charge the
    allocation to compilation as well. That is the first-use cost an
    ahead-of-time literal removes.
 -  Allocating a fresh object for each evaluation of a literal costs
    about 0.6 us, from `literal-match` against `dynamic-match` over the
    same attempts. It is the smallest of the three per-attempt figures
    and the least stable.

`literal-shared` and `dynamic-shared` print the same 25 digits, so the
ahead-of-time path and the dynamic path agree on every one of the
patterns and subjects they share. The three timed programs print the
same 20 counts, so they answered the same work before their durations
are compared.

`literal-boundary-empty-repetition` is the one program whose failure is
the observation. It evaluates `(a*)*b` over 24 characters of `a`, which
the compiler-side executor answers with its step boundary, and the
native runtime exits with status 1 and reports:

~~~~
literal-boundary-empty-repetition.js:1:16: error[OSEO2001]: Regular
expression matching exceeds the reviewed matcher limit.
~~~~

The probe requires both the nonzero status and that diagnostic on every
one of its seven executions, so a crash or a loader failure cannot be
counted as the boundary. Both implementations therefore reach the same
boundary on the same input, and the runtime reports it as one located
diagnostic rather than as a language value.

The three per-attempt figures are the least stable numbers in this
document. They are differences between whole-process durations of a few
hundred milliseconds, so the smallest of them, the 0.6 us allocation,
rests on a 24 ms gap and should be read as an order of magnitude rather
than a value.


External component
------------------

The candidate is PCRE2 in its 16-bit form, because a subject is UTF-16
and a component that accepts only UTF-8 would be measured through a
conversion. The harness in *tools/regexp-probes/pcre2-probe.c* owns the
option mapping: `PCRE2_UTF` only for a `u` or `v` pattern, because
without those flags the edition matches over UTF-16 code units;
`PCRE2_DOLLAR_ENDONLY` because `$` in the edition never matches before a
final line terminator; `PCRE2_MATCH_UNSET_BACKREF` because a reference
to a group that did not participate matches the empty string;
`PCRE2_ALT_BSUX` with `PCRE2_EXTRA_ALT_BSUX` for the edition's `\u`
escapes; and no `PCRE2_UCP`, because the edition's `\d` is ASCII
whatever the Unicode mode says.

Two class escapes have no faithful mapping in either direction, so they
are left unmapped and measured instead. The edition's `\s` is not
ASCII: it holds NBSP, ZWNBSP, and every `Space_Separator`, and its line
terminators add U+2028 and U+2029. Without `PCRE2_UCP` this component's
`\s` is narrower than that, and with `PCRE2_UCP` it becomes the Unicode
`White_Space` property, which is a third set again. The edition's `\w`
is ASCII only until `i` and a unicode-mode flag are both set: U+017F and
U+212A fold into the basic word set, so `\w` admits them there, and
neither this component's ASCII `\w` nor its `PCRE2_UCP` `\w` is that
set. The corpus carries `unicode-whitespace` and
`folded-word-character` so each difference is a measured row rather than
a claim.

`y` maps to `PCRE2_ANCHORED`, because the owned side honors it: a
matcher program carries the flag and the owned search stops after the
attempt at its starting position. `g` is not mapped, because it is a
behavior of the edition's `exec` above the matcher artifact and moves no
single attempt. The corpus carries `sticky-attempt` so that the mapping
is exercised rather than assumed.

The newline convention is set to `PCRE2_NEWLINE_ANY` rather than left at
whatever the installed component was built with, so that a comparison
does not depend on how a host configured its PCRE2. It stays an
approximation. The edition's LineTerminator is LF, CR, U+2028, and
U+2029; `PCRE2_NEWLINE_ANY` adds VT, FF, and NEL. The corpus carries
`line-terminator-class` so that the remaining difference is a measured
row. This build reports 2 as its own default and compiled every corpus
pattern under 4.

Of 52 corpus cases, 38 agreed with the owned matcher, 8 were refused at
compile time, 4 produced different captures, and 2 produced a different
outcome.

| Case                       | Verdict            | Detail                                                                    |
| -------------------------- | ------------------ | ------------------------------------------------------------------------- |
| `capture-reset`            | different captures | Group 4 is unset for the edition and `4,7` for PCRE2                      |
| `lookbehind-greedy`        | compile refused    | Error 125 at 0, the length of the lookbehind assertion is not limited     |
| `lookbehind-backreference` | compile refused    | Error 125 at 8, for the reason below                                      |
| `class-set-difference`     | compile refused    | Error 150 at 22, invalid range in character class                         |
| `yaml-control-characters`  | compile refused    | Error 173 at 36, disallowed code point in `D800` through `DFFF`           |
| `unicode-whitespace`       | different captures | The edition matches `0,4` where PCRE2 matches `3,4`                       |
| `folded-word-character`    | different captures | The edition matches `0,5` where PCRE2 matches `0,1`                       |
| `line-terminator-class`    | different outcome  | PCRE2 matches after a vertical tab where the edition does not             |
| `empty-repetition`         | different outcome  | PCRE2 answers no match in 30 ns where the owned matcher reaches its limit |

Seven of those are missing observable behavior rather than tuning, and
four of the seven are class or flag rules rather than grammar:

 -  The capture difference is the edition's own worked example. Each
    iteration of a quantified group resets the captures inside it, so
    `(z)((a+)?(b+)?(c))*` over `zaacbbbcac` leaves group 4 unset, and
    PCRE2 keeps the value from an earlier iteration.
 -  Unbounded-length lookbehind and class set notation are grammar the
    edition admits and this component does not.
 -  The lone-surrogate refusal is the sharpest, because the pattern is
    not constructed here: a real serializer runs
    `[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]` over every scalar
    it writes, and this component refuses the pattern outright.
 -  `\s`, `\w` under `iu`, and the line-terminator set are three class
    rules the edition states and no mode of this component reproduces.
    Each costs one measured row, and none can be closed by a different
    option.

Closing any of them means owning the behavior anyway, which is what the
plan forbids doing with an unreviewed wrapper.

The lookbehind refusal is a second kind of finding, because the option
mapping causes it. `PCRE2_MATCH_UNSET_BACKREF` is what makes a
reference to a non-participating group match the empty string, as the
edition requires; with that option a backreference is no longer
fixed-length, so a lookbehind that contains one becomes unlimited and
is refused. Compiling `((\w)\w)(?<=\1\2\1)` with `PCRE2_CASELESS`
alone succeeds and with `PCRE2_CASELESS | PCRE2_MATCH_UNSET_BACKREF`
fails with error 125. Two rules the edition states independently cannot
both be honored by this component at once.

The last difference runs the other way and is the most useful
measurement in this section, because it is not about semantics:

| Case                       | Input       | PCRE2       | Owned matcher |
| -------------------------- | ----------- | ----------- | ------------- |
| `empty-repetition`         | `reject`    | 30 ns       | 514,294.3 us  |
| `lazy-any-scan`            | `late`      | 19.5 us     | 565,766.8 us  |
| `large-bounded-repetition` | `reject`    | 30 ns       | 13.6 us       |
| `property-escape-negated`  | `ascii`     | 20.2 us     | 220.0 us      |
| `nested-quantifier`        | `reject-18` | 12,060.3 us | 228,024.2 us  |

PCRE2 is an ordered backtracking engine too, and `nested-quantifier`
shows it: 3,134,415 ns at 16 characters and 12,060,320 ns at 18, the
same factor of four for each character pair the owned matcher shows. So
the exponential case is a property of ordered matching rather than of
this implementation, and an external component does not remove it. What
PCRE2 does remove is the rest: an empty loop it recognizes at compile
time, a bounded repetition it makes possessive, and a scan it starts
with a first-character search. Those are the optimizations the plan
reserves for delivery item 10, measured here as the distance between an
engine that has them and one that does not. The comparison is between a
C engine and the compiler-side TypeScript executor, so the absolute
ratio is not a measurement of the runtime's own C executor; the shape of
each row is what carries.

The remaining rows compare compile cost and compiled size. PCRE2
compiles one corpus pattern in 0.1 to 14.5 us into 166 to 1,042 bytes.
The compiler-side artifact builder takes 2.8 to 245.7 us, and the
runtime's own pattern compiler takes about 2.7 us as measured natively
above.

What this probe could not answer on one host:

 -  Static linking. The installed component ships as
    */lib64/libpcre2-16.so.0* at 670,880 bytes with no *libpcre2-16.a*
    beside it, so no static-link or binary-size figure for a linked
    component was measured. That is one directory rather than the
    linker's search path, so it says no 16-bit archive is beside the
    shared library rather than that none is installed. Either way it
    needs a source build.
 -  Both execution targets and the AArch64 Linux cross-link. Only the
    host's own x86\_64 shared library exists here. A component decision
    needs PCRE2 built for `macos-aarch64` and cross-linked for
    `linux-aarch64-musl` through the same Zig toolchain.
 -  Sanitizer behavior, which needs that same source build under
    `address` and `undefined`.
 -  Unicode version control. This build reports Unicode 16.0.0 while
    Oseo pins 17.0.0, so the two disagree today. Whether the component
    can be pinned to Oseo's release is a build question this probe did
    not settle.
 -  License. The installed package records BSD-3-Clause for the library
    with other licenses on its documentation and build files. A
    component decision needs its own review of the exact source tree it
    would vendor.
 -  Thread and locale assumptions, which
    [*PLAN-REGEXP.md*](../PLAN-REGEXP.md) lists for this probe. This run
    compiles and matches on one thread and never sets a locale, so it
    observes neither. Whether a compiled pattern may be shared across
    threads, what state a match context holds, and whether any match
    behavior reads the C locale are source and documentation questions
    this run did not answer.

Allocator injection and error translation were measured and both work.
Every compile and match ran through a general context whose allocator
the harness owns, and that allocator handed the engine 970,504 bytes
over the corpus. Every refusal came back as a numeric error code with an
offset that maps to a message, which is what an Oseo adapter would
translate into a located diagnostic.

Two further candidates were not measured and are named here so the item
9 decision knows what this run does not cover. RE2 and any other
automaton-only engine cannot take the 4 corpus patterns that use a
backreference or a lookaround, which the strategy probe already counts.
A JIT-compiled engine, including PCRE2's own, generates executable
memory at run time, which
[*PLAN-REGEXP.md*](../PLAN-REGEXP.md) already refuses for a dynamic
pattern, so the JIT column of this component is out of scope rather
than unmeasured.


What the measurements settle
----------------------------

They settle five things, none of which is a backend:

1.  The ordered matcher covers the whole admitted grammar, and every
    other candidate shape has a measured gap: an automaton loses 4 of
    29 corpus patterns outright, and PCRE2 loses 4 of 29 to grammar and
    4 more to class, flag, and capture rules, with one of those grammar
    losses caused by the option the edition's own backreference rule
    needs.
2.  An automaton path would help where the ordered matcher is worst and
    has little headroom where it is best. On `nested-quantifier` the
    ordered matcher takes 1,834,918 steps against a ceiling of 18 on a
    simulation of the same program; on `choice-graph` it takes 40 steps
    over 3,072 characters, which is already within a small factor of
    the 4 positions any engine must read.
3.  Pathological patterns cost time, not matcher work area. The largest
    the runtime reserves for one attempt in the corpus is 99,360 bytes
    of stacks, trail, and registers, and the reviewed step boundary is
    what stops the patterns that do not terminate quickly. Both
    implementations reach that boundary on the same input. That figure
    is the work area rather than a process, so it bounds what the
    matcher holds and not what a program does.
4.  A dynamic pattern is what makes the Unicode question expensive.
    Ahead-of-time literals carry 1,976 bytes of resolved sets for the
    whole corpus; reaching every admitted property from a run-time
    pattern is a 311,460-byte table payload before any name table or
    index is charged, and pattern construction already costs 337,792
    bytes of executable before any table is added.
5.  Ahead-of-time compilation removes about 2.7 us for each evaluation
    that would otherwise compile a pattern, and costs 1,717 bytes of
    generated C and 1,149 bytes of executable for each literal, none of
    it in `.text`.

Delivery item 9 owns what follows from that. This document deliberately
does not choose between an owned implementation, an external component
behind an adapter, or a composed design, and does not decide whether
the artifact stays serialized data.


Limits of this run
------------------

 -  One host, one target, one run. Nothing here is evidence about
    `macos-aarch64` or `linux-aarch64-musl`.
 -  The compiler-side executor is measured for work and for peak entry
    counts, not for throughput against the runtime, and its byte figures
    are derived from those counts afterward. It allocates one machine
    for each attempt, so a scan over many start positions measures that
    allocation: `property-escape-negated` over 1,024 characters spends
    220.0 us on 2,050 steps, against about 30 ns for each step
    elsewhere.
 -  The configuration walk treats `edge` and `boundary` as passable, so
    a configuration count is an upper bound on what a position-aware
    simulation would track.
 -  The subset construction models one anchored attempt rather than the
    search loop, and answers membership only. Capture positions are not
    part of a deterministic state, so a capture-bearing pattern would
    need a second pass that this probe does not measure.
 -  No automaton and no direct-C lowering was built or run, so both
    candidates are described by properties of the artifact rather than
    by measurements of an implementation.
 -  Native stack use and cleanup after failure are unmeasured, as
    described under resource behavior.
 -  The native programs measure matching through JavaScript, so a
    per-attempt figure includes the call, the receiver, and, for a
    literal, the fresh object each evaluation allocates. It is not a
    measurement of the C executor alone, and the three per-attempt
    figures are differences between whole-process durations.
 -  PCRE2 was measured as installed rather than as it would be vendored,
    which leaves static linking, cross-targets, sanitizers, Unicode
    pinning, license review, and thread and locale assumptions open.
