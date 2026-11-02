M5c closure accounting
======================

M5c accounted for every path of the fixed M5 applicable-test inventory: 41,091
paths at test262 revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. Each
path is closed by a reviewed observation, covered by an authorized exclusion,
or named as a deferral. The [M5 exit report](./m5-exit-report.md) gives the
final counts and gate results.

This document describes the records in this directory and the rules their
checks enforce. `mise run check` still validates every record, so the rules
bind any later change to the reviewed manifest, the inventory, or an owning
decision record.

[ADR 0032](../adr/0032-post-m5-edition-boundary.md) moved the claim to
ECMAScript 2026 and grew the inventory to 43,007 included paths. The ledger,
exclusion audit, and deferral list now account for that inventory, and the
[ECMAScript 2026 profile](../language-profile-es2026.md) describes the
measurement. The closed M5b and M5c graphs and the observation batch plan
stay records of the M5 inventory, as the [M5 inventory view](#m5-inventory-view)
describes.


Closure states
--------------

Every included path is in exactly one of these states:

 -  a reviewed pass;
 -  a reviewed expected negative;
 -  a reviewed unsupported profile feature covered by an accepted record that
    explicitly authorizes an M5 exclusion and bounds its surface; or
 -  a reviewed unsupported profile feature named in the
    [ADR 0031](../adr/0031-m5-named-deferral.md) deferral list with its
    reason, remaining contract, and the milestone or deferred track that
    inherits it.

While M5c was active, a path could also be unreviewed or be an unsupported
result under active remediation. The exit audit requires both states to be
empty, and every semantic, harness, and infrastructure failure count to be
zero.

A named deferral is the disposition for measured residue that neither
reviewed evidence nor a maintainer-approved track closes. It is not an
exclusion, a pass, or a closure, and a failure can never be deferred. A path
qualifies only when work the maintainer did not approve for M5, or declined,
is its one remaining closure route. A path that implementation inside M5
would close stays with remediation.

After ADR 0032, an included path may also be unreviewed with a work-unit
owner, or unsupported under remediation by a work unit, until the
*PLAN-LANGUAGE.md* track closes it.

Coverage reports keep the reviewed count, inventory size, classifications,
authorized-exclusion count, and deferral count separate. A percentage of the
M5 result uses the 41,091-path M5 inventory as its denominator; a percentage
of the current claim uses the 43,007-path inventory.

The closure records change none of the edition, optional-section policy,
inventory policy, reviewed test262 revision, manifest schema, or
classification vocabulary. [ADR 0032](../adr/0032-post-m5-edition-boundary.md)
fixes the edition and inventory rule, and
[ADR 0013](../adr/0013-m5-edition-and-manifest.md) and
[ADR 0020](../adr/0020-m5-applicable-test-inventory.md) fix the rest. They do
not reopen the dynamic source boundary of
[ADR 0016](../adr/0016-dynamic-source-boundary.md); dynamic source stays
unsupported for M5 only through the authorization rule of
[ADR 0019](../adr/0019-m5-claim-closure.md). No closure may weaken a gate,
lower a property budget, delete a reviewed path, turn a failure into an
expected result, or add a compatibility-ratchet override.


Closure ledger
--------------

[*ledger.yaml*](./ledger.yaml) is a canonical path-indexed ledger over all
included inventory paths. The inventory supplies membership and the reviewed
manifest supplies observations. It is derived data:
`mise run m5c:closure-ledger:update` regenerates it, and
`mise run check:m5c-closure-ledger`, which `mise run check` includes,
validates it. The tools reject duplicate, absent, or out-of-inventory paths.
Owner notes may explain ownership, but they never override an observation.

The header records the suite revision, the inventory size, the closed, open,
and deferred path counts, one count per state, and one entry per owner with
its path count and an optional note. Below the header, `paths` holds one line
per included path in code-unit order:

~~~~ yaml
paths:
  test/built-ins/Error/cause_property.js: [pass, observation]
  test/built-ins/Error/constructor.js: [unreviewed, node:observation-batch-plan]
~~~~

One line per path keeps a classification or ownership change to a one-line
diff in a file of about 4.4 MB. The state is the manifest classification, or
`unreviewed` for a path the manifest omits. An unsupported entry also lists
its ADR 0013 dependency tags as a third element, as in
`[unsupported-profile-feature, unassigned, [symbols]]`; no other state does.
The checker requires the state and tags to match the manifest exactly, the
header counts to match counts regenerated from the manifest, and the text to
match its canonical serialization. Entry lines are exempt from the 80-column
rule because the checker owns their layout; header lines still wrap.

The owner is the only per-path fact a change edits by hand:

 -  `observation` owns a pass or expected negative, which the observation
    closes;
 -  `unassigned` marks a reviewed unsupported or failed path that has no
    remediation owner or authorization, and the checker reports it as open;
 -  `node:<id>` names an M5c graph node: the remediation owner of a reviewed
    open path, or the node that will observe an unreviewed path;
 -  `unit:<id>` names a work unit from the table in
    [*PLAN-LANGUAGE.md*](../../PLAN-LANGUAGE.md): the unit that admits and
    observes an unreviewed path, or the remediation owner of a reviewed open
    path;
 -  `adr:<stem>` names the record *docs/adr/<stem>.md* as the authorization
    of an unsupported path's M5 exclusion; and
 -  `deferred` marks an unsupported path with an ADR 0031 entry in
    [*deferrals.yaml*](./deferrals.yaml). It stays open and counts neither as
    closed nor as excluded.

A dependency tag is not an exclusion authorization. ADR 0013 keeps realms,
agents, shared memory, and missing harness capabilities inside the claim, and
those tags identify work until a separate accepted record says otherwise.
The checker accepts an `adr:` owner only for an unsupported path, only when
the paragraph under the record's Status heading begins with `Accepted`, and
only with an owner note. The note quotes the text that authorizes and bounds
the exclusion and states the path selector. A failure can never cite a
record. The ledger's `closedPaths` counts only passes and expected negatives;
authorized exclusions are reported separately.

Regeneration keeps an owner while its path keeps the same state and resets it
to the default for the new state otherwise: `observation`, `unassigned`, or
`node:observation-batch-plan`. A change that leaves a path unsupported for a
different reason reassigns that path in the same change. A promotion to pass
or expected negative takes the `observation` owner. A change that adds
inventory paths assigns each one a `unit:` owner, because the language claim
audit accepts an unreviewed path only with one.


Deferral list
-------------

The ledger checker accepts `deferred` only for an unsupported path whose
entry exists in *deferrals.yaml*, and requires it for every entry.
`mise run check:m5c-deferrals` validates the list. Its header pins the suite
revision and the digest of the complete ADR 0031 text, and it may hold
entries only while ADR 0031 is accepted.

An entry is rejected when its source or observation digest is stale, its path
lacks the `deferred` owner or is not unsupported, its family, reason, section,
or remaining contract is absent, or its attempts name neither a graph node nor
a track decision. Its `targetMilestone` must be a numbered
[*ROADMAP.md*](../../ROADMAP.md) milestone after M5, or the plan file of a
track that *ROADMAP.md* records as deferred, such as *PLAN-DYN.md*. The check
reads those tracks from paragraphs that begin “A deferred … track is recorded
in” and link the plan.

An exclusion audit row with the `deferral` disposition requires the
`deferred` owner and the `not-demonstrated` assessment, and it counts neither
as an exclusion nor as remediation. A deferred path may lack an audit row only
when its rejection falls on no accepted record's surface.


Exclusion audit
---------------

[*exclusion-audit.yaml*](./exclusion-audit.yaml) records, for every path
whose owner rests on an accepted record's surface, the normalized observation
digest, source digest, normative section, subject, prior cohort, and boundary
assessment. Shared assessments explain one contract for each listed member.
The record entries quote the authorization and applicable reopening text of
ADRs 0013, 0016, 0019, and 0028 and bind each record's complete text by
digest. ADR 0020 fixes the denominator and authorizes no exclusion.
[ADR 0026](../adr/0026-agent-clusters-and-shared-memory.md) shows
ahead-of-time host adaptation without authorizing exclusions of other harness
capabilities. The [audit procedure](./exclusion-audit.md) describes how a
reviewer writes a record.

`mise run check:m5c-exclusion-audit`, included by `mise run check`, rejects
missing assessments for ADR owners, unaccepted or changed records, stale
sources or rejection observations, absent quotes, unrelated diagnostics,
value-only `eval` reads, and owners that differ from the assessment. It also
rejects an ADR owner while non-source subject coverage remains unresolved.
The tool never assigns an exclusion from a directory or dependency tag. It
checks the freshness and consistency of human judgments, not their normative
truth.

The `eval` check parses actual call syntax, including optional and indirect
calls. Reference resolution and correspondence to the rejected identifier
remain part of the human source assessment. Numeric locations in the outer
stderr diagnostic are normalized because harness composition can move them.
A changed message, capability, or source still needs a reviewed path update.
The exported `exclusionAuditDigest` and `exclusionObservationDigest` helpers
in *tools/m5c-exclusion-audit.ts* compute the snapshots after review, without
regenerating observations merely to refresh the audit.

The `priorCohort` field records the first ownership audit's cohort. A path is
`source-subject` when it lies under *test/built-ins/AsyncFunction/*,
*test/built-ins/AsyncGeneratorFunction/*,
*test/built-ins/GeneratorFunction/*, *test/built-ins/Function/length/*,
*test/built-ins/Function/prototype/toString/*, or
*test/language/eval-code/*; when it is an `S15.3.5.2_*` case under
*test/built-ins/Function/prototype/*; when its file name contains `eval` or
`new-function` outside *test/built-ins/String/*; or when it is one of the two
`scope-*-var-none.js` cases. Other paths whose rejection lies on the ADR 0016
surface are `incidental-scaffolding`: they use `eval` or `Function` as
scaffolding for another subject. The `annex-b` and `legacy-caller` cohorts
name the ADR 0013 and ADR 0028 surfaces. A cohort is an audit selector, not
proof of normative dependence or an exclusion authorization.

When the observed call lies inside ADR 0016's rejected surface but the
normative subject is something else, the rejection is authorized and the
subject stays in the claim. A test's use of `eval` or `Function` does not
prove that a normative algorithm needs dynamic source for behavior other than
source evaluation, so such a path closes under ADR 0016 only with reviewed
replacement evidence for its subject or an existing exclusion assessment.
Template identity across dynamic parses and variable-environment retention
probes are possible reopening evidence for ADR 0016, not a decision to reopen
or widen it.

The ADR 0013 and ADR 0028 surfaces are bounded the same way. ADR 0013 owns
a mixed Annex B path only when reviewed replacement evidence observes every
core subject, under item 3 of the maintainer decision of 2026-10-28 and its
later extensions to exact paths; the profile's Annex B paragraphs name them,
and an `annex-b` assessment names its bounded owner. The check accepts the
owned `__lookupGetter__` or `__lookupSetter__` rejection only when the source
calls the named method in call syntax. It accepts the ADR 0028 owner only
for a selector path whose observation is the exact frontmatter rejection
with `caller` as the only unsupported feature, whose case has the `noStrict`
flag, and whose source reads a `caller` member. A selector path can use no
other ADR owner, and every reviewed selector path needs its audit row. Its
dynamic-source intersections do not broaden ADR 0016, and a later
observation that reaches their dynamic-source rejection, or that admits the
`caller` feature, needs a new reviewed scope decision.

Each path's `missingDynamicTag` must be false when the reviewed entry carries
the ADR 0013 `dynamic-source` dependency tag and true when it does not. Tag
debt never authorizes an exclusion, and the check counts it separately so
dependency-indexed summaries cannot stand in for the observed dynamic-source
gap.

### Dynamic import

Dynamic import stays unsupported, and ADR 0016 is unchanged. The audit
accepts exactly the parse-time diagnostic
`error[OSEO1001]: ImportExpression is outside the M1 profile.` for an
ImportCall rejection, not another `OSEO1001` rejection. A parse negative whose
ImportCall begins a `new` operand reports the early error `OSEO0001` instead
and is an expected negative.

`adr:0016-dynamic-source-boundary` owns a path only when `import()` itself is
the normative subject and the reviewed assessment bounds the assertions to
source evaluation. The *test/language/expressions/dynamic-import/* directory,
or an `esid` naming ImportCall, EvaluateImportCall, or ContinueDynamicImport,
identifies a candidate; the reviewer confirms it from the description,
normative section, and assertions. A filename or feature tag alone is
insufficient. Module evaluation order, top-level await behavior, and JSON
module identity stay remediation subjects unless the assessment demonstrates
only the bounded source-evaluation contract. If a feature-tagged source has
no `import()` call, or its observation reports a different rejection, it
keeps its actual classification and the owner of that separate gap.

The build-time-resolvable `import()` track is not implemented in M5. The
maintainer reviewed its design and deferred the track past M5.
[*docs/static-specifier-import-design.md*](../static-specifier-import-design.md)
is the post-M5 design, linked from [*PLAN-DYN.md*](../../PLAN-DYN.md), which
owns the track. Its ADR 0016 amendment stays Proposed inside that document and
is not applied to ADR 0016, so the accepted rejection, the exclusion audit
digests, and the rules above are unchanged.

The `static-specifier-import-design` node pins 20 module-loading rows; its
[work note](../m5c-graph/static-specifier-import-design.md) holds the
selector. Nineteen observe the parse-time `ImportExpression` rejection, and
*usage-from-eval.js* observes the run-time `OSEO1001` rejection of the direct
`eval` call whose source contains its `import()`. Each has an ADR 0031
deferral entry whose `targetMilestone` is *PLAN-DYN.md* and the `deferred`
ledger owner. The maintainer decides at the D8 review on 2026-11-10 whether
the M5 announcement needs a separate demonstration of the design.


Observation batches
-------------------

The `observation-batch-plan` node partitioned the paths that were unreviewed
at M5c entry into deterministic batches, recorded in
[*observation-batches.yaml*](./observation-batches.yaml). Each batch is the
graph node `observation-batch-NN`, and its paths had the ledger owner
`node:observation-batch-NN` until it landed. The commands are:

 -  `mise run m5c:observation-batches:plan` partitions the current unreviewed
    paths from scratch, renumbers every batch, and moves the ledger owners to
    the new batches;
 -  `mise run m5c:observation-batches:update` keeps the selectors, drops the
    prefixes, sets, and batches that no longer select a path, and refreshes
    every count and cost; and
 -  `mise run check:m5c-observation-batches`, which `mise run check` includes,
    regenerates the plan from the selectors and compares it with the
    checked-in text.

The check rejects a path that no batch selects, a prefix that two batches
share for one prerequisite set, a prefix or listed set that selects nothing, a
batch that selects a reviewed path, a batch without a graph node, a batch node
missing a required dependency, and a ledger owner that differs from the batch.

`observation-batch-21`, `observation-batch-22`, and `observation-batch-26`
were split into `observation-batch-21a` through `observation-batch-21d`,
`observation-batch-22a` and `observation-batch-22b`, and
`observation-batch-26a` and `observation-batch-26b`, so that each part could
be reviewed and land on its own. Each part is its own graph node with the
dependencies of the batch it came from, and the batch ID pattern accepts the
one-letter suffix. The cuts follow directories and, inside the flat
*class/dstr/* and *class/elements/* directories, the file name prefixes of
the generator templates, so every handwritten test and every template stays
in one part. `m5c:observation-batches:update` keeps the split; `plan` would
undo it.

### Prerequisites and selectors

Each path's facts come from its upstream source at the pinned revision and
from checked-in review state, never from its directory name:

 -  frontmatter features, includes, flags, and negative phase;
 -  the generator case and template files named in the header of a generated
    test;
 -  prerequisite keys: `feature:<tag>` for a feature absent from the reviewed
    `supportedFeatures`, `harness:<file>` for an include without a reviewed
    copy under *tests/test262/harness/* (except in a `raw` test),
    `flag:CanBlockIsFalse`, and `host:$262.<member>` for an unresolved `$262`
    read other than `$262.agent`; and
 -  unresolved references to `eval` and `Function` in the parsed source.

A fixed table in *tools/m5c-observation-batches.ts* maps each prerequisite
key to the graph node that removes it, and a key without a node stops
planning. The `eval` and `Function` references are counted per batch but do
not split batches: ADR 0016 decides such a path by its observed diagnostic.

The plan file records the basis these keys are computed against: the reviewed
`supportedFeatures` and harness files at planning time. A prerequisite node
that later admits a feature or a harness therefore neither moves nor orphans
the paths of a batch that waits on it. Only `plan` takes a new basis.

The prerequisite set of a path is the sorted set of its prerequisite nodes.
Paths without a prerequisite are planned by locality. Each set with at least
50 paths is planned separately, and every smaller set joins one tail batch
that waits for all of their nodes.

A selector lists prerequisite sets and path prefixes. A path belongs to the
batch that lists its set and has the longest prefix the path starts with. The
planner splits a prefix at its next `/`, `-`, `_`, or `.` only when its paths
do not fit, then packs adjacent results back together while they fit, so
locality decides every boundary.

A batch fits when it has at most 3,000 paths and 500 review units. A
handwritten test is one review unit. A generated test counts its generator
case and template files instead, because a reviewer reads those once for
every expanded file. A generated file combines one case file with one
template, so a case read for templates in two parts of a split batch counts
as a review unit in both. At one to two minutes per unit, 500 units is one or
two working days for one reviewer, and the path bound keeps the subset and
manifest diff of one landing reviewable.

### Regeneration cost

The plan records, for each batch, the seconds of its scoped update and of the
complete corpus gate when it lands in plan order. A batch only adds entries
to *tests/test262/subset.yaml*, which `mise run test262:update:changed`
accepts as observation-neutral, so its own update observes just its paths.
Every landing still runs the complete `test:test262` gate.

The cost model is linear in executed native variants. Two complete
`test262:update` runs over the 21,383 paths reviewed at M5c entry took 2,922
and 3,997 seconds with 8 workers on 16 logical cores, neither with the host
to itself. The model uses the slower run as its conservative figure for both
kinds of complete run: 72,749 executed variants, or 0.0549 seconds per
variant. Each unreviewed path adds two variants per strictness mode, counted
as if its prerequisites had landed, unless it is a parse or resolution
negative. Compile-stage rejections cost less than a full execution, and a
corpus with more agent or module cases can cost more.

The 3,000-path, 500-unit limits were chosen against smaller and larger
alternatives:

| Limits (paths, units) | Batches | Scoped hours | Complete-update hours |
| --------------------- | ------: | -----------: | --------------------: |
| 2,000, 300            |      51 |         82.7 |                 163.6 |
| 3,000, 500 (chosen)   |      32 |         52.6 |                 103.3 |
| 4,000, 600            |      27 |         45.5 |                  89.0 |
| 8,000, 1,200          |      15 |         26.3 |                  50.7 |

Each additional batch adds one complete gate of about 1.1 to 2.1 hours. The
chosen limits accept 7.2 more hours than the 600-unit alternative to keep
each batch within one reviewer's inspection; at 20 to 40 hours of inspection,
one reviewer could not check the applicability and classifications of a
1,200-unit batch. The three splits added five complete gates, raising the
scoped schedule from 34.4 to 43.6 hours for the landings that remained.
These totals exclude prerequisite nodes and candidate workflow runs, and they
do not estimate elapsed time.

The reviewed manifest partitions results by ADR 0013 group and a
two-character hash key, so a group has up to 256 partition files. Path
locality chooses the groups a batch touches, not its keys, and any batch with
more than about 200 paths in one group touches most of that group's keys.
Group-confined batches therefore bound the files a scoped update rewrites to
one group's partitions.


Work graphs
-----------

M5b and M5c were scheduled from checked-in, machine-validated graphs rather
than a phase scheme, so a session could take any item whose dependencies had
landed. Both graphs are complete and remain the implementation record.

[*docs/m5b-graph/graph.yaml*](../m5b-graph/graph.yaml) holds the M5b node
counts, advisory collision list, serialization points, and fallback backlog;
one record per node lives under *docs/m5b-graph/nodes/*. Ninety of its 92
nodes landed. The two parked nodes are the `eval-dynamic-source` and
`function-constructor-dynamic-source` boundaries that ADR 0016 keeps
unsupported. `mise run check:m5b-graph` rejects an unknown ID, a dependency
cycle, an unparked node that depends on a parked one, a status that disagrees
with the landed state of its dependencies, and a recorded path count that does
not match *tests/test262/inventory.tsv*. It also rejects a selector naming a
root the graph does not cover, two nodes claiming the same upstream path, and
any included path under *test/built-ins/* that no node claims, which keeps the
graph a partition of the built-in denominator.

[*docs/m5c-graph/graph.yaml*](../m5c-graph/graph.yaml) holds the M5c graph.
`mise run check:m5c-graph` derives the current baseline from the inventory and
the partitioned reviewed manifest, rejects stale graph counts, and validates
the dependency and terminal-exit structure. Each node record under
*docs/m5c-graph/nodes/* names its `id`, `title`, `delivers`, `dependencies`,
`landed`, `status`, and schema `version`; a parked node also gives a
`reason`. The optional `after` field is a sorted, unique array of node IDs
whose landing selection and publication wait for. Both `dependencies` and
`after` must name existing nodes other than the node itself and together be
acyclic. A landed node must have landed targets for both fields, and an
unparked node cannot wait on a parked target.

An unparked node's `status` is `ready` only when all direct `dependencies`
and `after` targets have landed; otherwise it is `blocked`. Ordering adds no
dependency ancestry: the collision-group rule and the required dependency
path to `m5-exit-audit` follow only `dependencies`. The validator rejects a
node whose terminal result does not reach `m5-exit-audit`. Each node's work
note under *docs/m5c-graph/* holds its evidence.

Collision groups name publication files, not sources, so they serialized only
the publication phase: one node at a time rebased, regenerated the manifest
when its observation inputs changed, and updated the ledger, graph state,
parity, and normative profile in the same change. The graph baseline moves
whenever the reviewed manifest moves, so a clean checkout cannot describe one
manifest while scheduling work from another.


M5 inventory view
-----------------

*tests/test262/inventory-policy-m5.yaml* keeps the ADR 0020 rule that defined
the M5 inventory. `mise run test262:inventory:update` classifies every
candidate under that rule and the ADR 0032 rule in one frontmatter read and
writes *tests/test262/inventory-m5-additions.txt*, the sorted 1,916 paths the
second rule includes and the first does not. `check:test262-inventory`
regenerates both files, and it rejects a path that the M5 rule included and
the current rule excludes.

The M5 inventory is the included set of *inventory.tsv* without the listed
paths. `check:m5b-graph`, `check:m5c-graph`, and
`check:m5c-observation-batches` read that view, so the closed graphs and the
batch plan keep validating against the 41,091 paths they describe. A test
pins the view to the inventory M5 closed against by its path count and
digest.


Exit audit
----------

M5c completed when `m5-exit-audit` landed in commit
`0423ae072a847e73a74f8dab4dcf81a2de59b38e`. Its `mise run check:m5-exit-audit`
proved the inventory, manifest, failure, exclusion, and deferral conditions
against the checked-in evidence, and the exit report lists what it checked and
the two conditions outside it. No queue-empty or all-nodes-landed condition
could substitute for that audit, because the remediation graph could still
expand after a new observation. That commit reproduces the report's coverage
section with `mise run report:m5-coverage`; the report keeps the section as
frozen text.

`mise run check:language-claim-audit` replaced it for the expanded inventory.
It keeps every consistency condition of the M5 audit and zero failures, and
it requires an owner for every unsupported path. It accepts a path that is in
neither the reviewed subset nor the manifest only when the ledger holds it as
unreviewed with a `unit:` owner, and it counts those paths and the
remediation-owned ones per owner. With `--require-closed`, which
`language-exit-audit` uses, both counts must be zero, as in the M5 audit.
`mise run report:language-coverage` prints the counts.

The report describes Oseo's measured M5 profile. It does not call the result
unqualified ECMA-262 conformance while ADR 0016 remains accepted or the
deferral list is not empty. While the list is not empty, the report says that
measured residue was deferred by name and M5 closed, and it never reports a
deferred path as passing, excluded, or closed.
