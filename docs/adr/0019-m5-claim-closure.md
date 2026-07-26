M5 completion and the conformance label
=======================================

Status
------

Accepted. This record defines the M5 completion condition and moves the
unqualified ECMA-262 conformance label to a separate later gate.


Context
-------

[*PLAN-M5.md*](../../PLAN-M5.md) states that M5 is complete only when no
semantic failure, harness failure, or unsupported result remains inside the
claim, including one caused only by a missing observation capability.
[*ROADMAP.md*](../../ROADMAP.md) states that M5 is complete only when Oseo can
make and substantiate an ECMA-262 conformance claim for a named edition.

[ADR 0013](./0013-m5-edition-and-manifest.md) names that claim as the 16th
edition, ECMAScript 2025. It excludes Annex B, ECMA-402, and the upstream
*staging/* and *sm/* directories, and it places host hooks, realms, agents,
and shared memory inside the claim.

[ADR 0016](./0016-dynamic-source-boundary.md) keeps `eval`, the `Function`
constructor family, and dynamic import explicitly unsupported, and records
its own consequence directly:

> Closing M5's conformance claim therefore depends on a later decision that
> either admits these features through staged compilation or revises the claim
> boundary.

That later decision does not exist.
[*PLAN-DYN.md*](../../PLAN-DYN.md) holds the staged-compilation track as
deferred and explicitly adds no work to the M5 delivery queue. The current M5
queue therefore has no reachable exit state: ADR 0016 leaves dynamic source
unsupported, and the existing exit criteria forbid every unsupported result
inside the claim. Staged compilation would satisfy the criteria, but no work
in the M5 queue can.


Required contract
-----------------

A resolution must give later milestones:

 -  an M5 completion condition that implementation work can actually reach;
 -  a conformance label whose eventual use stays honest, which ADR 0016 and
    [*PLAN-M5.md*](../../PLAN-M5.md) already require by refusing an unqualified
    label while known gaps stand;
 -  a stable denominator for coverage reporting, so a percentage means
    something across checkpoints;
 -  no reclassification of a deliberate architectural exclusion as a pass; and
 -  an unchanged ADR 0016 conclusion, which was decided on architectural
    grounds and is not reopened by a scheduling problem.


Alternatives considered
-----------------------

1.  **Admit staged compilation during M5.** Rejected. It satisfies the current
    exit criteria by implementing the excluded family, but it contradicts the
    reasoning in ADR 0016, pulls a deferred track into the milestone with the
    largest open scope, and makes closed ahead-of-time binaries depend on a
    capability the project decided to keep optional.
2.  **Narrow the claim boundary.** Deferred, not decided. The dynamic source
    family would be excluded in the way Annex B and ECMA-402 already are, and
    the claim would name a documented profile of the 16th edition. This is
    mechanically simple. Its cost is that Annex B and ECMA-402 are optional or
    separate specifications, while `eval` and the `Function` constructor are
    normative core, so a claim that excludes them reads as conformance while
    omitting required sections. It stays available to a successor record.
3.  **Separate the milestone from the label.** Selected. M5 completes on
    complete measured coverage, with every remaining gap covered by a record
    that explicitly authorizes an M5 exclusion, and the unqualified conformance
    label becomes its own later gate that depends on ADR 0016 being superseded.
    This keeps the label honest and makes the milestone reachable, at the cost
    of M5 no longer being the milestone that produces a conformance claim. It
    leaves the decision ADR 0016 asked for still open.
4.  **Postpone.** Rejected. The exit criteria stay unsatisfiable, progress
    continues, and the project keeps a milestone that cannot close. This is
    the current state.


Probe evidence
--------------

Counts of *.js* test files at the pinned upstream revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`, excluding `_FIXTURE` files:
*test/language* holds 23,713 and *test/built-ins* holds 23,668. The
directories ADR 0013 excludes hold 1,086 in *annexB/*, 3,341 in *intl402/*,
and 1,482 in *staging/*, of which 1,406 are the *staging/sm/* files ADR 0013
names separately.

Not every remaining file is inside the 16th edition.
*test/built-ins/Temporal/* alone holds 4,603 files for a proposal outside that
edition.

The checked-in manifest at commit `0bd5f38` records 681 reviewed paths: 310
passes, 245 expected negatives, and 126 unsupported profile features.


Observed results
----------------

[ADR 0020](./0020-m5-applicable-test-inventory.md) now classifies all 47,381
candidate paths. It includes 41,092 paths inside the 16th edition and excludes
6,289 proposal, post-edition, or Annex B paths. The 681 reviewed result rows
therefore cover 1.66 percent of the exact denominator.

The denominator and label remain independent. The checked-in inventory makes
coverage measurable. ADR 0016 separately prevents use of the unqualified
label.


Decision
--------

M5 is separated from the label.

M5 completes when the complete applicable-test inventory is checked in and
every result inside it is a pass, an expected negative, or an unsupported
result covered by an accepted record that explicitly authorizes an M5
exclusion and bounds its surface.

Naming a record as owner is not sufficient. ADR 0013 keeps realms, agents,
shared memory, and missing harness capabilities inside the claim, so citing it
as the owner of those results would let all of them survive M5 unexamined. An
authorizing record states which behaviors it excludes, why the exclusion is
architectural rather than unfinished work, and what would reopen it. ADR 0016
is such a record for the dynamic source family. No record currently authorizes
excluding realms, agents, or shared memory, so those remain M5 work.

The unqualified ECMA-262 conformance label moves out of M5 and becomes its own
gate. That gate requires ADR 0016 to be superseded, or a successor to this
record to decide that a documented narrowed profile is worth publishing under
a qualified name.

This record is therefore not the decision ADR 0016 asked for. It neither
admits dynamic source nor revises the ADR 0013 boundary. It removes the
milestone's dependence on that decision and leaves the decision open.

Coverage reporting states the reviewed count, the inventory size, and the
owned-exclusion count separately. A percentage is published only against the
checked-in inventory.


Consequences
------------

The M5 exit criteria in [*PLAN-M5.md*](../../PLAN-M5.md) and
[*ROADMAP.md*](../../ROADMAP.md) change. The criterion that no unsupported
result remains becomes the criterion that no unowned unsupported result
remains, and the conformance-claim criterion moves to the new label gate.

Producing the applicable-test inventory becomes explicit M5 work rather than
an implicit prerequisite of the label. Because it is what makes the remaining
scope measurable, it is produced during M5a rather than at M5c, before the
built-in families whose size it would otherwise hide. M5c closes against it.

Once the inventory is checked in, the remaining result rows can be counted.
The inventory bounds the remaining scope; it does not estimate the
implementation time needed to close it.

The project keeps its refusal to use an unqualified conformance label while
the dynamic source family stands. That refusal is stated by ADR 0016 and
[*PLAN-M5.md*](../../PLAN-M5.md), not by
[*WHITEPAPER.md*](../../WHITEPAPER.md). Releases continue to publish measured
coverage without the label, as ADR 0016 already specifies.


Failure modes and replacement triggers
--------------------------------------

 -  Evidence that a normative section inside the claim depends on the excluded
    dynamic source family for behavior other than source evaluation reopens
    the boundary rather than this record.
 -  An owned unsupported result whose owning record is later withdrawn becomes
    unowned and blocks M5 until a successor record owns it.
 -  If the checked-in inventory proves unmaintainable at the corpus size the
    claim requires, the record format is replaced under
    the record partitioning checkpoint in
    [*PLAN-GATE.md*](../../PLAN-GATE.md) rather than by dropping
    the inventory requirement.
 -  If staged compilation lands earlier than expected under
    [*PLAN-DYN.md*](../../PLAN-DYN.md), the label gate may open before the
    milestone criteria are revisited, and this record's separation becomes
    unnecessary rather than wrong.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the claim boundary,
    the counting rule, and the inventory requirement.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) records the exclusion that
    creates the conflict. This record removes M5 completion's dependence on the
    later decision ADR 0016 requests; it does not supply that decision, and the
    dynamic source boundary stays open.
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) defines the classifier
    and checked-in denominator required by this record.
 -  [*PLAN-M5.md*](../../PLAN-M5.md) and [*ROADMAP.md*](../../ROADMAP.md) hold
    the exit criteria this record changes.
 -  [*PLAN-DYN.md*](../../PLAN-DYN.md) owns the deferred capability the label
    gate depends on.
 -  [*PLAN-GATE.md*](../../PLAN-GATE.md) owns the manifest record format the
    inventory needs.
