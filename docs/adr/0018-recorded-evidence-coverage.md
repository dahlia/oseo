Recorded evidence coverage for admitted families
================================================

Status
------

Accepted. This record makes the existing evidence applicability judgment
auditable by recording it per family in the language profile.


Context
-------

[*CONTRIBUTING.md*](../../CONTRIBUTING.md) already scales evidence to the work.
It introduces its list of classes with “Depending on the work, this may
include,” and the property rule says to use property tests “when a semantic
unit has a useful generated domain or state model.” An earlier draft of this
record claimed the rule was uniform and proposed replacing it. That reading was
wrong, and the correction is retained here so the same framing is not proposed
again.

What the repository does not have is a record of that judgment. The choice of
which classes apply is made once, by whoever writes the change, and it survives
only in the commit that made it. The language profile states what behavior is
admitted; it does not state which evidence classes cover that behavior, or
which class was judged inapplicable and why.

That gap matters for the conformance claim in
[ADR 0013](./0013-m5-edition-and-manifest.md). A reader auditing the claim can
see the reviewed standards results and the checked-in property seeds, but
cannot tell a deliberate omission from an oversight. As M5 adds built-in
families whose applicable evidence differs widely, the number of such
judgments grows faster than any reviewer's memory of them.


Required contract
-----------------

A resolution must give later milestones:

 -  a way to determine, for any admitted family, which evidence classes cover
    it;
 -  omissions that are visible and justified rather than silent;
 -  no path by which a hint, a specialization, or a fast path becomes a
    correctness requirement;
 -  evidence for the ADR 0013 claim that a reviewer can audit without reading
    the history of every change; and
 -  a mechanism that restores an omitted class when a defect shows the
    judgment was wrong.


Alternatives considered
-----------------------

1.  **Leave the judgment implicit.** Rejected for the claim audit, not for
    ordinary work. Evidence stays scaled to the work and the reasoning stays
    in commit messages and review. This is the current state and costs nothing
    to keep. Its cost arrives when the claim needs an audit and the reasoning
    has to be reconstructed for several hundred families.
2.  **Record the judgment in the profile.** Selected. Each admitted family
    names its covering evidence classes, and an omitted class names the
    evidence that replaces it. This adds a field to the profile template and a
    question to review. It does not change what any unit is required to prove.
3.  **Per-family evidence manifests.** Rejected. Each family would declare an
    evidence set in its own vocabulary. This is the most flexible option and
    the least auditable, because two families can omit the same class for
    reasons a reader cannot compare.


Probe evidence
--------------

Line counts come from `git log --numstat`, counting additions only and
assigning each file to one category by path: *packages/* and *tools/* sources
to implementation, *tests/property/* to generated properties, other paths under
*tests/* to fixed and standards evidence, and *.md* files to documentation.
The 13 measured units are the non-merge commits between `cc32e7d` and
`e57a184` that admit a semantic unit, excluding the refactoring commits
`2d42a89`, `f3909b1`, `43d5304`, `e99146c`, `da78283`, and `61d3dfe`, the plan
commits `010e6a9` and `ece8690`, and the one-line export `d30a713`.


Observed results
----------------

Additions for each of the 13 measured units, on average:

| Category                  | Lines | Authored by |
| ------------------------- | ----- | ----------- |
| Implementation            | 117   | Hand        |
| Generated property suites | 182   | Hand        |
| Fixed native fixtures     | 51    | Hand        |
| Reviewed subset entries   | 16    | Hand        |
| Result manifest           | 223   | Generated   |
| Documentation             | 80    | Hand        |

The hint-mapping work merged as `0bd5f38` adds 448 implementation lines, 721
test lines, and 304 documentation lines under the same rule. Its ratio of test
to implementation is 1.6 against the 13-unit average of 2.1, so these samples
give an order of magnitude rather than a constant.

That work added no reviewed standards case. It admitted no new observable
behavior, since a hint that changed behavior would violate the optimization
rule in *CONTRIBUTING.md*, and the existing rule already permits the omission.
Nothing in the profile records it.


Decision
--------

The evidence judgment is recorded per family in the language profile. This
record does not change what any unit must prove.

A family records the evidence classes that cover it. When a class listed in
*CONTRIBUTING.md* does not apply, the family records which class was omitted
and what evidence covers the same contract instead, such as the reviewed
standards cases that enumerate a fixed descriptor surface.

A generated domain is recorded as covering any family with a value domain, an
observable evaluation order, a cleanup or suspension schedule, a collector
interaction, or a specialization guard. Omitting a generated domain for such a
family requires a stated reason rather than a default.

This record authorizes no omission. It requires that an omission be recorded
with the evidence that replaces it, and the applicability rule in
*CONTRIBUTING.md* continues to decide which classes a given family owes.
Differential execution against Node.js and Deno, execution under both
specialization policies, forced collection, and the applicable standards cases
are the classes whose recorded omission deserves the most scrutiny in review,
because a family that genuinely cannot use one of them is rare.

A family admitted after the profile template exists, and recorded with no
omission, is read as covered by every class. A family admitted before the
template exists is `unassessed` until it is annotated. `unassessed` is not a
claim of coverage and not a claim of absence; it means the judgment has not
been written down yet.


Consequences
------------

The profile template gains an evidence field, which the per-family evidence
lanes checkpoint in [*PLAN-GATE.md*](../../PLAN-GATE.md) defines alongside the
rest of that template. *CONTRIBUTING.md* gains a sentence requiring the record;
its list of classes does not change.

Accepting this record changes no unit's obligations today. Until that
checkpoint defines the field, there is nowhere to write the judgment, so units
in flight are unaffected and no existing family is retroactively annotated.
Every family admitted before the checkpoint therefore enters `unassessed`, and
the restructuring annotates them. The conformance claim cannot be audited
through this record while any family inside the inventory remains
`unassessed`.

Review gains a question: whether a recorded omission is the one the family
actually justifies. That question is the point of the record.

A family that records an omitted generated domain adds no new suite to the
ordinary or extended property budget. This follows from the judgment rather
than motivating it, and the existing rule already allowed it; the change is
that the reader can now see it.


Failure modes and replacement triggers
--------------------------------------

 -  A defect in a family that recorded an omitted generated domain, which that
    domain would have caught, restores the class for that family, adds the
    minimized case as an ordinary regression fixture, and reopens this record.
 -  Two or more such defects mean the recorded judgments are not being made
    carefully, and the record is replaced by a requirement to supply every
    class.
 -  A recorded omission whose stated replacement evidence does not exist
    invalidates the record for that family and blocks the claim until it is
    corrected.
 -  If the field is filled in mechanically rather than judged, it adds cost
    without adding auditability, and it should be removed rather than kept.


Links
-----

 -  [*CONTRIBUTING.md*](../../CONTRIBUTING.md) states the applicability rule
    this record makes auditable.
 -  [*PLAN-GATE.md*](../../PLAN-GATE.md) owns the profile template that
    carries the record.
 -  [*PLAN-PT.md*](../../PLAN-PT.md) owns the generated domains a family
    records.
 -  [ADR 0013](./0013-m5-edition-and-manifest.md) defines the claim this
    evidence substantiates.
