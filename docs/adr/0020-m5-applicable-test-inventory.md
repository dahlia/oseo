M5 applicable-test inventory
============================

Status
------

Accepted. This record defines how the pinned Test262 corpus is mapped to the
ECMA-262 16th edition boundary and keeps that denominator separate from
execution results.


Context
-------

[ADR 0013](./0013-m5-edition-and-manifest.md) fixes the M5 candidate at the
ECMA-262 16th edition, ECMAScript 2025. It excludes Annex B, ECMA-402, and
the upstream *staging/* and *sm/* directories. The two remaining candidate
roots at the pinned revision contain 47,381 non-fixture *.js* files:
23,713 under *test/language/* and 23,668 under *test/built-ins/*.

That count is not the edition denominator. *test/built-ins/Temporal/* alone
contains 4,603 files for a proposal assigned after the 16th edition. Upstream
*features.txt* distinguishes proposed features from standard features, but
its standard section does not state the edition in which each feature was
published.

The suite also contains tests with no `features` frontmatter. A rule that
requires a feature tag would silently omit core grammar and long-standing
built-ins. A rule that includes every untagged path needs to state why an
untagged proposal test does not silently enter the denominator.

The compatibility result manifest is not an appropriate index format for
this decision. It records execution variants, target facts, failure phases,
and observations. At 681 paths it occupies 19,676 lines. Expanding that
schema to the complete denominator would create a large observation record
before most paths had run and would exceed the single-file scale that
[*PLAN-GATE.md*](../../PLAN-GATE.md) already identifies.


Required contract
-----------------

M5a and later checkpoints need:

 -  one deterministic enumeration of every candidate path at the pinned
    revision;
 -  an auditable rule that classifies each path inside or outside the 16th
    edition;
 -  an authoritative edition source in addition to upstream feature metadata;
 -  a deliberate answer for tests with no `features` frontmatter;
 -  no execution, support, or failure claim in the denominator artifact;
 -  a checked regeneration and validation command; and
 -  the existing result manifest to remain the single source of truth for
    measured progress.


Alternatives considered
-----------------------

1.  **Include all 47,381 candidate files.** Rejected. It includes Temporal
    and other proposals published after ECMAScript 2025, so the denominator
    would not describe the edition ADR 0013 names.
2.  **Classify by directory.** Rejected. Proposal tests cross directory
    boundaries, and one directory can hold tests for several proposal
    dependencies. A path prefix alone is not an edition source.
3.  **Map every `esid` to the published specification.** Rejected. Not every
    test carries an `esid`, proposal suites may use identifiers that resemble
    future specification clauses, and one test can depend on several features.
4.  **Use *features.txt* without another source.** Rejected. The proposed
    section is useful, but the standard section includes features assigned to
    editions after 2025.
5.  **Use feature metadata with a reviewed post-edition map.** Selected.
    Upstream defines which flags denote proposals, and TC39's finished-proposal
    table supplies the publication year for flags that have left that section.
    Tests without flags follow upstream's rule that proposal tests carry a
    dedicated flag and enter as unflagged edition core.
6.  **Postpone the inventory until M5c.** Rejected. M5b would proceed without
    knowing the built-in denominator whose size is meant to guide its order.


Probe evidence
--------------

The authoritative edition source is the signed
[`es2025`] tag at commit
`84b38ad852ff426795fa29cebc06949027336c64`.

The feature registry is
[*features.txt*]
at the pinned Test262 revision. Its proposal policy says tests for proposed
language features should carry a dedicated flag so consumers can omit them.

The reviewed publication-year map comes from TC39's
[*finished-proposals.md*]
at revision `1eb7ced36bcb794e75af0b0a24c8199fba6bc6f3`, the last change to
that table before the pinned Test262 commit. It assigns the following flags
after 2025:

| Expected edition | Test262 feature flags                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026             | `Array.fromAsync`, `Error.isError`, `Math.sumPrecise`, `iterator-sequencing`, `json-parse-with-source`, `uint8array-base64`, `upsert` |
| 2027             | `Atomics.pause`, `Temporal`, `explicit-resource-management`, `joint-iteration`                                                        |

The pinned Test262 commit is dated July 13, 2026, after publication of
ECMAScript 2025. No missing 16th-edition feature family was identified while
classifying its registered flags. This is enough to produce the current
inventory, but it is not a claim that Test262 can never add more
16th-edition evidence.

Every one of the 47,381 candidate files has parseable frontmatter after
normalizing upstream line endings. Of these, 16,027 have no feature flag.
The current reviewed subset's 681 paths all classify inside the edition.

[`es2025`]: https://github.com/tc39/ecma262/releases/tag/es2025
[*features.txt*]: https://github.com/tc39/test262/blob/f2d1435644797268dca1f7988cad5a4e89ccd8d2/features.txt
[*finished-proposals.md*]: https://github.com/tc39/proposals/blob/1eb7ced36bcb794e75af0b0a24c8199fba6bc6f3/finished-proposals.md


Observed results
----------------

The generated inventory contains:

| Candidate root    | Included | Excluded |  Total |
| ----------------- | -------: | -------: | -----: |
| *test/language/*  |   22,998 |      715 | 23,713 |
| *test/built-ins/* |   18,163 |    5,505 | 23,668 |
| Total             |   41,161 |    6,220 | 47,381 |

The post-edition flag rule matches 5,434 paths. The proposed-feature rule
matches 798 paths, and 12 paths match both, producing 6,220 unique
exclusions. The 41,161 included paths are the exact M5 denominator at the
pinned revision.

The compact inventory occupies 47,390 lines and 4,821,288 bytes: nine header
lines and one tab-separated row per candidate. It records no execution
variants or observations.

An isolated `mise run check:test262-inventory` sample completed in 5.02 s of
wall time, 4.63 s of user time, and 1.16 s of system time, for a 1.15
processor-time-to-wall ratio. Peak resident memory was 364,128 KiB. The host
facts and reproduction command are recorded in
[*gate-cost-baseline.md*](../gate-cost-baseline.md).


Decision
--------

The machine-readable policy is
*tests/test262/inventory-policy.yaml*. It pins the edition, suite revision,
candidate roots, authoritative sources, and the reviewed post-edition feature
map.

The classifier applies these rules in order:

1.  Enumerate sorted non-fixture *.js* paths under *test/built-ins/* and
    *test/language/*. The ADR 0013 directory exclusions never enter this
    candidate set.
2.  Exclude a path when any frontmatter feature belongs to the proposed
    section of the pinned *features.txt*. Record each such reason as
    `proposal:<feature>`.
3.  Exclude a path when any frontmatter feature belongs to the reviewed
    post-edition map. Record each reason as
    `edition-<year>:<feature>`.
4.  Include every other path. A tagged path records `edition-2025`; a path
    with no feature flag records `edition-2025:unflagged-core`.
5.  Reject an unknown feature flag, malformed frontmatter, duplicate path,
    policy mismatch, or reviewed subset path outside the edition instead of
    guessing.

The generated *tests/test262/inventory.tsv* is a separate denominator
artifact. Each row contains only `path`, `boundary`, and `basis`. The header
records the format, revision, edition, and derived counts. The path is the
counted identity.

`included` does not mean implemented, executed, or passing. In particular,
the `eval`, `Function` constructor, and dynamic import families remain
included because they are normative 16th-edition core. Their result rows
remain `unsupported-profile-feature` under
[ADR 0016](./0016-dynamic-source-boundary.md) until M5c closes or authorizes
them. The inventory does not duplicate that observation.

*tests/test262/results.yaml* remains the single source of truth for measured
progress, and *tests/test262/subset.yaml* remains the small reviewed selection.
Neither file grows merely because the inventory exists.

`mise run test262:inventory:update` regenerates the inventory without executing
a test. `mise run check:test262-inventory`, included by `mise run check`,
regenerates it in memory and requires an exact match.

The pinned Test262 revision does not change in this decision. Replacing it
would require the classification review and result-manifest work that ADR 0013
already requires, while this checkpoint deliberately performs no corpus
execution. The later label gate must still review newer upstream evidence
before deciding whether this pin is sufficient for the final claim.


Consequences
------------

M5 coverage can now report the reviewed result count, the exact denominator
of 41,161, and owned exclusions separately. The current 681 reviewed paths
cover 1.65 percent of that denominator; the percentage does not imply that
unreviewed paths have passed or failed.

The inventory resolves the denominator-size problem without resolving the
result-manifest partitioning checkpoint. Expanding measured results toward
41,161 rows still requires the partitioned observation format in
[*PLAN-GATE.md*](../../PLAN-GATE.md).

The default for an unflagged path relies on Test262's proposal-tagging policy.
The explicit `unflagged-core` basis makes all 16,027 uses of that default
auditable and lets a later correction select exactly the affected rows.

No standards case runs as part of inventory generation. M5b and M5c retain
ownership of execution, support classification, harness work, and result
closure.


Failure modes and replacement triggers
--------------------------------------

 -  Finding an unflagged proposal or post-edition test at the pinned revision
    invalidates the unflagged-core rule. The policy and every affected row are
    reviewed in one change.
 -  A TC39 publication-year correction changes the reviewed map and regenerates
    the complete inventory.
 -  Adopting another Test262 revision re-reviews every added, removed, or
    metadata-changed path and updates every affected result classification in
    the same change, as ADR 0013 requires.
 -  Adopting another ECMA-262 edition replaces this record's edition map.
 -  If the tab-separated index proves unreviewable, it is partitioned by a
    deterministic path key. Execution fields are not added to make it resemble
    the result manifest.
 -  If exact regeneration becomes part of the default check's critical path,
    it keeps the full comparison but moves to bounded reads or a separate CI
    comparison. A header-only or digest-only check cannot replace validation
    against the pinned corpus.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the edition,
    optional-section policy, result schema, and revision-change rule this
    record applies.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) owns the unsupported dynamic
    source results that remain inside this inventory.
 -  [ADR 0019](./0019-m5-claim-closure.md) makes this inventory the M5
    denominator and separates M5 completion from the conformance label.
 -  [*PLAN-M5.md*](../../PLAN-M5.md) and
    [*ROADMAP.md*](../../ROADMAP.md) assign the inventory to M5a.
 -  [*PLAN-GATE.md*](../../PLAN-GATE.md) owns result-record partitioning.
 -  [*gate-cost-baseline.md*](../gate-cost-baseline.md) records the inventory
    validation cost.
