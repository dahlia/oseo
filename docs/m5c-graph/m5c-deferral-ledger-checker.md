Deferral ledger checker
=======================

This node teaches the closure tooling the named deferral that
[ADR 0031](../adr/0031-m5-named-deferral.md) accepts. Until it lands, no
path can be deferred, because the ledger checker rejects the `deferred`
owner. It depends on `m5c-named-deferral-policy`, and `m5-exit-audit`
depends on it. It must land before the 2026-11-17 implementation deadline
so that deferral entries can follow.


Scope
-----

 -  A reviewed *docs/m5c-closure/deferrals.yaml* whose header records the
    schema version, the test262 suite revision, and the SHA-256 digest of
    the complete ADR 0031 text, with one entry per deferred path holding the
    fields ADR 0031 lists.
 -  A `deferred` owner kind in *tools/m5c-closure-ledger.ts*, accepted only
    for an `unsupported-profile-feature` path with a matching entry, and
    reported in a separate header count so that `closedPaths`, authorized
    exclusions, and deferrals stay distinct.
 -  A check that rejects an entry whose source, observation, or record
    digest is stale, whose path lacks the `deferred` owner, whose family or
    reason is absent, or whose attempts name no reviewed evidence node and
    no track decision.
 -  A `targetMilestone` check. The value is either a numbered
    [*ROADMAP.md*](../../ROADMAP.md) milestone after M5, parsed from that
    file, or the plan file of a track that *ROADMAP.md* links from a
    paragraph marking the track deferred, such as *PLAN-DYN.md*. M0 through
    M5, an unknown milestone, and an unlisted plan are rejected.
 -  In *tools/m5c-exclusion-audit.ts*, a `deferral` disposition for audited
    rows, which requires the `deferred` ledger owner and is never counted as
    an exclusion.
 -  `mise run check` coverage for the new file and a test for each
    rejection.

The node may land the file with no entries. It moves a ledger owner only
for a path whose entry it adds after review, and the entry must meet the
admission rule of ADR 0031: the path's one remaining closure route is work
the maintainer did not approve for M5 or declined. The 20 static-specifier
import rows of
[*static-specifier-import-design.md*](./static-specifier-import-design.md)
are the first expected entries, with *PLAN-DYN.md* as `targetMilestone`.


Checks and review
-----------------

The node changes tools and closure data but no compiler, runtime, runner,
harness, or manifest file, so it changes no observation. Checks are
`mise run check`, the closure ledger, exclusion audit, and graph tests, and
the fast non-native repository tests. Root owns outer review, publication,
and landing.
