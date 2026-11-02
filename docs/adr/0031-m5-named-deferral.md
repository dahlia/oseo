ADR 0031: Named deferral of measured M5 residue
===============================================

Status
------

Accepted on 2026-11-01 by maintainer decision. This record supplements the
completion condition of [ADR 0019](./0019-m5-claim-closure.md). It authorizes
no exclusion, defers no path by itself, and does not reopen
[ADR 0016](./0016-dynamic-source-boundary.md).


Context
-------

ADR 0019 completes M5 when every result inside the applicable inventory is a
pass, an expected negative, or an unsupported result covered by an accepted
record that explicitly authorizes an M5 exclusion and bounds its surface.
Such a record must explain why the exclusion is architectural rather than
unfinished work. The M5c plan adds that active remediation is empty at the
exit audit.

The reviewed manifest at M5c bundle 5,
`9f21b607aef9399cc2a1f61d382f535af5161a2e`, covers all 41,091 applicable
paths. The closure ledger records 1,939 unsupported results: 1,573 owned by
accepted ADRs and 366 owned by remediation nodes. Of those, 334 belong to
`dynamic-source-coverage-remediation`, the umbrella for paths that use
dynamic source as scaffolding for another subject.

The maintainer's decisions of 2026-11-01 on that residue approve two closure
tracks inside M5: literal host Script evidence for further dynamic source
paths, and four exhaustive RegExp paths with their generated budget. They
decline a bounded general `eval` or `Function` construction implementation;
paths in that family close only through faithful evidence of their
non-source subjects. The build-time static-specifier import track is not
implemented in M5: its reviewed
[design](../static-specifier-import-design.md) is the post-M5 plan that
[*PLAN-DYN.md*](../../PLAN-DYN.md) links.

Some residue may therefore have no closure route inside M5. An architectural
exclusion is wrong for it: its non-source subject is ordinary core behavior,
and the exclusion audit already rejects an ADR owner while subject coverage is
`not-demonstrated`. Remediation is also unavailable, because the only
remaining remedy is work the maintainer declined for M5. Without another
disposition the exit audit is again unreachable, which is the state ADR 0019
was written to end.


Required contract
-----------------

A resolution must give the exit audit and later milestones:

 -  a reachable M5 completion condition that does not depend on work the
    maintainer declined for M5;
 -  no silent exclusion or scope cut: each residual path is named, with a
    reviewed reason, the contract it leaves unproven, and the milestone that
    inherits it;
 -  no reclassification of unfinished work as a pass, an expected negative,
    or an architectural exclusion, in the ledger or in coverage reports;
 -  unchanged failure criteria: semantic, harness, and infrastructure
    failures stay zero and are never deferred;
 -  binding to reviewed inputs, so a changed source, observation, or policy
    text invalidates an entry instead of silently keeping it; and
 -  the complete list, not only its summary, sent to the maintainer before
    the exit audit relies on it.


Alternatives considered
-----------------------

1.  **Keep remediation empty and implement the residue in M5.** Rejected for
    the dynamic source family. The maintainer declined a bounded general
    `eval` and `Function` construction implementation, and ADR 0016 keeps
    that family outside the profile on architectural grounds.
2.  **Widen the ADR 0016 exclusion over the residue.** Rejected. The residue
    asserts core behavior through dynamic source scaffolding. Excluding it
    would call unfinished non-source coverage architectural, which ADR 0019
    forbids and the exclusion audit rejects.
3.  **Amend ADR 0019.** Considered. ADR 0019 already owns the completion
    condition. An amendment would put unfinished work under a rule that
    admits only architectural exclusions, weakening the meaning of every
    existing `adr:` owner. The exclusion audit also pins the digest of the
    complete ADR 0019 text and quotes its authorization, so an amendment
    forces re-review of every row citing it for no semantic gain.
4.  **Record a named deferral in a separate record.** Selected. Deferred
    paths keep their own owner kind, count, and report line, and the
    existing exclusion records stay byte-identical.
5.  **Postpone.** Rejected. M5 stays open while the declined work remains
    the only route to closing it.


Probe evidence
--------------

The counts above come from the header of
[*docs/m5c-closure/ledger.yaml*](../m5c-closure/ledger.yaml) at
`9f21b607aef9399cc2a1f61d382f535af5161a2e`, validated by
`mise run check:m5c-closure-ledger`, and from
`mise run check:m5c-graph`, which derives the same baseline from the
partitioned manifest.


Observed results
----------------

No path is deferred. Whether the residue at the exit audit is empty, small,
or large is not known when this record is accepted. This record fixes the
rule, not the count.


Decision
--------

M5 may complete with a named deferral list. A named deferral states that a
reviewed unsupported result stays open after M5, why, what remains unproven,
and which later milestone inherits it. It is neither an exclusion nor a
closure.

### Deferral record

A reviewed file, *docs/m5c-closure/deferrals.yaml*, holds the list. Its header
records the schema version, the test262 suite revision, and the SHA-256 digest
of this record's complete text. Each entry is keyed by inventory path and
records:

 -  `family`: a stable family key, such as the remediation node or the
    dynamic source family, used for per-family counts;
 -  `section`: the normative section of the unproven subject;
 -  `remainingContract`: the observable behavior that stays unproven, stated
    precisely enough that later evidence can be checked against it;
 -  `reason`: the reviewed reason that neither evidence nor an approved track
    closes the path in M5;
 -  `attempts`: the graph nodes whose reviewed evidence work examined the
    path, and the maintainer track decisions that were assessed against it;
 -  `targetMilestone`: what inherits the path after M5. It is either a
    numbered [*ROADMAP.md*](../../ROADMAP.md) milestone after M5, or the
    plan file of a track that *ROADMAP.md* lists as deferred, such as
    *PLAN-DYN.md*. The check reads both from *ROADMAP.md* and rejects M0
    through M5, an unknown milestone, and a plan that *ROADMAP.md* does not
    link from a deferred track;
 -  `sourceDigest` and `observationDigest`: the pinned test source and
    normalized reviewed observation, computed with the same helpers as the
    exclusion audit.

Entries never share a reason by reference alone. A shared reason may be
written once per family, as exclusion audit assessments are, but each entry
still names its own remaining contract.

### Who may add an entry

A path may be deferred only when its one remaining closure route is work
the maintainer did not approve for M5 or declined: general `eval` and
`Function` construction, or the static-specifier import track deferred past
M5. A path that implementation inside M5 would close, such as a realm
defect, a RegExp gap, or an iterator gap, cannot be deferred and stays with
remediation.

Only an M5c graph node on the dependency path of `m5-exit-audit` may add an
entry, in the same change that assigns the path its `deferred` owner. The
entry is admitted only when all of these hold:

 -  the path's state is `unsupported-profile-feature`; no failure, pass,
    expected negative, or unreviewed path can be deferred;
 -  the reason names the unapproved or declined work that is the path's only
    remaining closure route;
 -  the path's remediation owner has attempted reviewed evidence for its
    non-source subjects and recorded why faithful evidence is unattainable;
 -  every maintainer-approved track that could reach the path has been
    assessed and either does not apply or was tried and did not close it;
 -  no accepted ADR already authorizes excluding the path; and
 -  the reason passes the internal M5c review gate before landing.

A tool never assigns a deferral from a directory, dependency tag, filename,
or prior cohort. The exit audit uses the list; it does not add to it.

### Binding

Each entry is bound to its pinned source and observation digests, and the
file is bound to this record's digest. A changed test source, a regenerated
observation that changes the normalized rejection, or an edit to this record
makes the affected entries stale and fails the check until they are reviewed
again. A path whose observation becomes a pass or expected negative leaves
the list and takes the `observation` owner in the same change.

### Ledger and exclusion audit representation

The closure ledger gains a `deferred` owner kind, distinct from
`observation`, `unassigned`, `node:<id>`, and `adr:<stem>`. It is valid only
for an unsupported path with a matching deferral entry, and every entry must
name a path with that owner. The header's per-owner counts report deferrals
separately. `closedPaths` keeps counting only passes and expected negatives.

The exclusion audit gains a `deferral` disposition beside `exclusion` and
`remediation`. An audited path with that disposition requires the
`deferred` ledger owner and is counted neither as an exclusion nor as
remediation. Paths that were never proposed for exclusion need no audit row;
the deferral entry alone records them.

### Exit audit

At the exit audit, every unsupported result has either an accepted ADR owner
or the `deferred` owner. Remediation owners and `unassigned` are empty, and
failure counts are zero.

Before the exit audit uses the list, Root mails the maintainer a summary
together with the complete *docs/m5c-closure/deferrals.yaml*, attached or as
a commit link. The summary gives the total path count, the count per family,
each distinct reason with its count, and the target milestones. It flags
separately every entry outside the dynamic source family. The audit proceeds
when no objection
arrives within the coordination wait period. An objection blocks the audit
until the list is revised and a new summary and list are sent.

### Reporting

Coverage reports state the reviewed count, the inventory size, the
authorized exclusion count, and the deferral count separately. A deferred
path is never reported as passing, excluded, or closed. Public wording is:
measured residue was deferred by name and M5 closed.

The unqualified ECMA-262 conformance label remains the separate gate of ADR
0019 and additionally requires the deferral list to be empty.


Consequences
------------

The M5c closure states in
[*docs/m5c-closure/README.md*](../m5c-closure/README.md) and the M5 exit
criteria in [*ROADMAP.md*](../../ROADMAP.md) name deferred results beside
authorized exclusions.

The graph node `m5c-deferral-ledger-checker` owns the checker change: the
deferral file and its check, including the `targetMilestone` rule, the
ledger owner kind, the exclusion audit disposition, and their tests. Until
that node lands, no path can be deferred, because the ledger checker rejects
the owner.

Each target milestone or deferred track inherits its deferred paths as entry
work. Its plan
names the list rather than rediscovering the residue.

The cost is a second open category at M5 completion. M5 no longer means
every applicable path outside architectural exclusions is proven; it means
every such path is proven or named with its remaining contract.


Failure modes and replacement triggers
--------------------------------------

 -  A deferral whose path is found to produce a wrong result rather than an
    owned rejection is invalid. The path is a failure and blocks M5.
 -  A deferral whose path falls inside an approved track that was not tried
    is invalid until the track is assessed.
 -  A deferral whose path implementation inside M5 would close is invalid.
    The path returns to remediation.
 -  A maintainer objection to the summary blocks the exit audit until the
    list is revised.
 -  If staged compilation or a successor to ADR 0016 makes the deferred
    dynamic source paths reachable before the exit audit, their entries are
    withdrawn and the paths return to remediation.
 -  A target milestone or track plan that drops an inherited path without
    evidence or an accepted exclusion reverses the deferral and needs a
    successor record.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) fixes the claim boundary and
    the dependency vocabulary.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) keeps dynamic source outside
    the profile; this record does not change it.
 -  [ADR 0019](./0019-m5-claim-closure.md) defines the completion condition
    and label gate this record supplements.
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) fixes the denominator.
 -  [*docs/m5c-closure/README.md*](../m5c-closure/README.md) describes the M5c
    closure states and the closure ledger layout.
 -  [*PLAN-DYN.md*](../../PLAN-DYN.md) owns the deferred staged compilation
    track.
