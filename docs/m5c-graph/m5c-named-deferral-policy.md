Named deferral policy
=====================

This node drafts the policy that lets `m5-exit-audit` account for measured
residue that neither reviewed evidence nor an approved track closes. It
starts ready and unlanded at base
`9f21b607aef9399cc2a1f61d382f535af5161a2e`, depending on landed
`unsupported-ownership-audit`, and `m5-exit-audit` depends on it.


Authority
---------

The maintainer's answer of 2026-11-01, item 4, is
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*.
It replaces the exit condition that active remediation is empty with one
that also admits an explicit named deferral. A deferral is a per-path list
giving the reason, the remaining contract, and the target milestone, in the
manner of the bounded exclusions under ADR 0019. It is never a silent
exclusion or a scope cut. Before `m5-exit-audit` uses the list, Root mails
the maintainer a summary of path count, per-family counts, and reasons, and
proceeds when no objection arrives within the coordination wait period.
Public wording is “measured residue was deferred by name and M5 closed.”

Items 1 to 3 of the same answer bound what counts as an approved track:
literal host Script evidence for DS-10 and the eleven completion-value
paths, the four exhaustive RegExp paths with their generated budget, and
the design review of the static-specifier import track. General `eval` and
`Function` construction are not approved and close only by evidence.


Scope of this node
------------------

 -  Draft [ADR 0031](../adr/0031-m5-named-deferral.md) with status
    `Proposed`, defining the deferral record.
 -  Update the exit criteria in [*PLAN-M5C.md*](../../PLAN-M5C.md) and the
    `m5-exit-audit` delivers text to match the draft.
 -  Move no ledger owner, add no deferral entry, and change neither
    *tools/m5c-closure-ledger.ts* nor *tools/m5c-exclusion-audit.ts*.
 -  Leave ADR 0013, ADR 0016, and ADR 0019 unchanged.

At this base the ledger holds 1,939 unsupported paths: 1,573 owned by
accepted ADRs and 366 by remediation nodes. None is deferred, and this node
does not estimate how many will be.


New record rather than an ADR 0019 amendment
--------------------------------------------

The draft is a new record for three reasons.

 -  A deferral is unfinished work by definition. ADR 0019 admits an
    unsupported result only under a record that explains why its exclusion
    is architectural rather than unfinished work. Folding deferrals into
    that rule would weaken the meaning of every existing `adr:` owner.
 -  *docs/m5c-closure/exclusion-audit.yaml* pins the SHA-256 digest of the
    complete ADR 0019 text and quotes its authorization and reopening
    sentences. Amending ADR 0019 changes that digest and forces a
    re-review of every row citing it. A separate record keeps the existing
    exclusion audit unchanged.
 -  ADR 0019 deliberately separated the milestone from the label and left
    the dynamic source decision open. ADR 0031 refines only the completion
    condition and keeps that separation, so it supplements ADR 0019 rather
    than replacing its decision.

If review prefers an amendment, the follow-up must refresh the ADR 0019
digest and quotes in the exclusion audit in the same change.


Follow-up checker scope
-----------------------

Accepting ADR 0031 does not by itself let a path be deferred. A separate
graph node, depending on this one and required by `m5-exit-audit`, owns
these changes:

 -  a reviewed *docs/m5c-closure/deferrals.yaml* holding the ADR 0031 record
    digest and one entry per deferred path, with the fields ADR 0031 lists;
 -  a `deferred` owner kind in *tools/m5c-closure-ledger.ts*, accepted only
    for an `unsupported-profile-feature` path with a matching entry, and
    reported in a separate header count so that `closedPaths`, authorized
    exclusions, and deferrals stay distinct;
 -  a check that rejects an entry whose source or observation digest is
    stale, whose path lacks the `deferred` owner, whose family or reason is
    absent, or whose attempts name no reviewed evidence node and no track
    decision;
 -  in *tools/m5c-exclusion-audit.ts*, a `deferral` disposition for audited
    rows, which requires the `deferred` ledger owner and is never counted as
    an exclusion; and
 -  `mise run check` coverage for the new file and a test for each
    rejection.

That node moves owners only for paths whose entries it adds after review.
The summary mail precedes the terminal audit's use of the list, not the
follow-up node's landing.


Checks and review
-----------------

This node is documentation and graph data only. It changes nothing under
*packages/*, *tools/*, or *tests/test262/harness/* and therefore does not
affect observations. Checks are `mise run check`, the graph tests, and the
fast non-native repository tests. Root owns outer review, publication, and
landing.
