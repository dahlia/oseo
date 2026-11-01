Named deferral policy
=====================

This node sets the policy that lets `m5-exit-audit` account for measured
residue that neither reviewed evidence nor an approved M5 track closes. It
depends on landed `unsupported-ownership-audit`, and
`m5c-deferral-ledger-checker` and `m5-exit-audit` depend on it.


Decision
--------

[ADR 0031](../adr/0031-m5-named-deferral.md) is accepted, dated
2026-11-01, by maintainer decision. The decisions behind it are
*~/.local/state/oseo-m5c/decisions/answers/20261031T1409-umbrella-residual.md*,
item 4, and item 1 of *20261101-remaining-node-decisions.answer.md* in
*~/.local/state/oseo-m5c/decisions/done/*.

M5 may close with an explicit named deferral beside authorized exclusions.
A deferral is a per-path entry giving the reason, the remaining contract,
and the target milestone or deferred track, in the manner of the bounded
exclusions under ADR 0019. It is never a silent exclusion or a scope cut.
Public wording is “measured residue was deferred by name and M5 closed.”

A path may be deferred only when work the maintainer did not approve for M5
or declined is its one remaining closure route: general `eval` and
`Function` construction, or the static-specifier import track deferred past
M5. A path that implementation inside M5 would close, such as a realm
defect, a RegExp gap, or an iterator gap, stays with remediation. The
approved M5 tracks are literal host Script evidence for DS-10 and the eleven
completion-value paths, and the four exhaustive RegExp paths with their
generated budget.

Before `m5-exit-audit` uses the list, Root mails the maintainer the complete
*docs/m5c-closure/deferrals.yaml*, attached or as a commit link, with a
summary of the total path count, per-family counts, each distinct reason
with its count, and the target milestones. The summary flags every entry
outside the dynamic source family. The audit proceeds when no objection
arrives within the coordination wait period.

`targetMilestone` names either a numbered *ROADMAP.md* milestone after M5 or
the plan of a track that *ROADMAP.md* lists as deferred, such as
*PLAN-DYN.md*.


Scope of this node
------------------

 -  [ADR 0031](../adr/0031-m5-named-deferral.md) with status Accepted.
 -  The exit criteria in [*PLAN-M5C.md*](../../PLAN-M5C.md),
    [*PLAN-M5.md*](../../PLAN-M5.md), and [*ROADMAP.md*](../../ROADMAP.md),
    and the `m5-exit-audit` delivers text, matched to the record.
 -  Move no ledger owner, add no deferral entry, and change neither
    *tools/m5c-closure-ledger.ts* nor *tools/m5c-exclusion-audit.ts*.
 -  Leave ADR 0013, ADR 0016, and ADR 0019 unchanged. No closure or audit
    record binds ADR 0031 by digest yet; the deferral file will.

At base `9f21b607aef9399cc2a1f61d382f535af5161a2e` the ledger held 1,939
unsupported paths: 1,573 owned by accepted ADRs and 366 by remediation
nodes. None is deferred, and this node does not estimate how many will be.


New record rather than an ADR 0019 amendment
--------------------------------------------

ADR 0031 is a new record for three reasons.

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


Checker follow-up
-----------------

The [`m5c-deferral-ledger-checker`](./m5c-deferral-ledger-checker.md) node
owns the deferral file, the `deferred` ledger owner, the `deferral` audit
disposition, the `targetMilestone` check, and their tests. Until it lands,
no path can be deferred. It is high priority because it must land before
the 2026-11-17 implementation deadline. The summary mail precedes the
terminal audit's use of the list, not that node's landing.


Checks and review
-----------------

This node is documentation and graph data only. It changes nothing under
*packages/*, *tools/*, or *tests/test262/harness/* and therefore does not
affect observations. Checks are `mise run check`, the graph tests, and the
fast non-native repository tests. Root owns outer review, publication, and
landing.
