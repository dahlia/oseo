M5c inventory closure plan
==========================

Status
------

Implementation status: active. M5a fixed the applicable ECMA-262 16th edition
inventory and M5b completed the built-in and intrinsic dependency graph. M5c
closes every path in that inventory by observation, remediation, an
explicitly authorized exclusion, or, under
[ADR 0031](./docs/adr/0031-m5-named-deferral.md), a reviewed named deferral.
It does not reopen M5b.

M5c started from 41,091 applicable paths at test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The reviewed manifest then
covered 21,383 paths: 18,343 passes, 1,560 expected negatives, and 1,480
unsupported profile features, with no semantic, harness, or infrastructure
failures. The other 19,708 paths were unreviewed, which meant neither
presumed failures nor passes, and they were never planned as one
implementation unit. Figures in this plan that describe the first ledger,
ownership audit, and batch plan refer to that starting point.

Every included path has since been reviewed, and the mechanical conditions
of the M5 exit audit hold. The
[M5 exit report](./docs/m5c-closure/m5-exit-report.md) gives the coverage
counts, and [Remaining work](#remaining-work) lists what still stands between
the graph and the landing of the audit.

[*docs/m5c-graph/graph.yaml*](./docs/m5c-graph/graph.yaml) is the source of
truth for M5c work. `mise run check:m5c-graph` derives the current baseline
from the inventory and partitioned reviewed manifest, rejects stale graph
counts, and validates the dependency and terminal-exit structure.


Goal
----

M5c produces a complete, reproducible closure account for the fixed applicable
inventory. Every included path ends in exactly one of these states:

 -  a reviewed pass;
 -  a reviewed expected negative;
 -  a reviewed unsupported profile feature whose remediation is still active;
 -  a reviewed unsupported profile feature covered by an accepted record that
    explicitly authorizes an M5 exclusion and bounds its surface;
 -  a reviewed unsupported profile feature named in the ADR 0031 deferral
    list with its reason, remaining contract, and the milestone or deferred
    track that inherits it; or
 -  unreviewed, which is allowed only while M5c remains active.

M5 completes only when the last state is empty, all semantic, harness, and
infrastructure failure counts are zero, and no unsupported result lacks active
remediation, an accepted exclusion, or a named deferral. At the exit audit,
active remediation is also empty.

A named deferral is the disposition for measured residue that neither
reviewed evidence nor a maintainer-approved track closes. It is never a
silent exclusion or a scope cut: it is not an exclusion, a pass, or a
closure, and a failure can never be deferred. A path qualifies only when
work the maintainer did not approve for M5 or declined is its one remaining
closure route; a path that implementation inside M5 would close stays with
remediation. No path could be deferred until the `m5c-deferral-ledger-checker`
node taught the ledger checker its `deferred` owner.

Coverage reporting keeps the reviewed count, inventory size, classifications,
authorized-exclusion count, and deferral count separate. A percentage always
uses the 41,091 path inventory as its denominator.


Non-goals
---------

This plan does not change the edition, optional-section policy, inventory
policy, reviewed Test262 revision, manifest schema, or classification
vocabulary fixed by [ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md) and
[ADR 0020](./docs/adr/0020-m5-applicable-test-inventory.md).

It does not reopen the dynamic source boundary in
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md). Dynamic source may
remain unsupported for M5 only through the authorization rule in
[ADR 0019](./docs/adr/0019-m5-claim-closure.md). An unqualified ECMA-262
conformance label remains a separate later gate.

It does not weaken gates, lower property budgets, delete reviewed paths, turn a
failure into an expected result, or add compatibility-ratchet overrides to
make a batch close.


Closure ledger
--------------

The first active node creates a canonical path-indexed ledger over all 41,091
included inventory paths. The inventory supplies membership and the reviewed
manifest supplies observations. Paths absent from the reviewed manifest are
recorded as unreviewed rather than inferred from their directory or dependency
tags.

Each reviewed unsupported path records two different facts:

 -  its semantic or harness prerequisite, using the frozen ADR 0013 dependency
    vocabulary; and
 -  its closure owner, which is either a remediation node or an accepted ADR
    that authorizes a bounded M5 exclusion.

A dependency tag is not an exclusion authorization. In particular, ADR 0013
keeps realms, agents, shared memory, and missing harness capabilities inside
the claim. Those tags identify work until a separate accepted record says
otherwise. ADR 0016 and ADR 0019 authorize only the bounded dynamic source
surface they describe and retain their documented reopening triggers.

The ledger is derived data. Tools regenerate its classification counts from
the reviewed manifest and reject duplicate, absent, or out-of-inventory paths.
Manual notes may explain ownership, but they never override an observation.

### Ledger layout

[*docs/m5c-closure/ledger.yaml*](./docs/m5c-closure/ledger.yaml) is
regenerated by `mise run m5c:closure-ledger:update` and validated by
`mise run check:m5c-closure-ledger`, which `mise run check` includes. Its
header records the suite revision, the inventory size, the closed, open, and
deferred path counts, one count per state, and one entry per owner with its
path count and an optional note. Below the header, `paths` holds one line per
included path in code-unit order:

~~~~ yaml
paths:
  test/built-ins/Error/cause_property.js: [pass, observation]
  test/built-ins/Error/constructor.js: [unreviewed, node:observation-batch-plan]
~~~~

One line per path keeps a classification or ownership change to a one-line
diff in a file of about 4.4 MB. The state is the manifest classification, or
`unreviewed` for a path the manifest omits. An unsupported entry also lists
its ADR 0013 dependency tags as a third element, as in
`[unsupported-profile-feature, unassigned, [symbols]]`; no other state does. The
checker requires the state and tags to match the manifest exactly, the header
counts to match counts regenerated from the manifest, and the text to match
its canonical serialization. Entry lines are exempt from the 80-column rule
because the checker owns their layout; header lines still wrap.

The owner is the only per-path fact an M5c node edits:

 -  `observation` owns a pass or expected negative, which the observation
    closes;
 -  `unassigned` marks a reviewed unsupported or failed path that has no
    remediation owner or authorization yet, and the checker reports it as
    open;
 -  `node:<id>` names an M5c graph node: the remediation owner of a reviewed
    open path, or the node that will observe an unreviewed path;
 -  `adr:<stem>` names the record *docs/adr/<stem>.md* as the authorization
    of an unsupported path's M5 exclusion;
 -  `deferred` marks an unsupported path with an ADR 0031 entry in
    [*docs/m5c-closure/deferrals.yaml*](./docs/m5c-closure/deferrals.yaml).
    It stays open and counts neither as closed nor as excluded.

The ledger checker accepts `deferred` only for an unsupported path whose
entry exists, and requires it for every entry.
`mise run check:m5c-deferrals` validates the list. Its header pins the suite
revision and the digest of the complete ADR 0031 text, and it may hold
entries only while ADR 0031 is accepted. An entry is rejected when its
source or observation digest is stale, its path lacks the `deferred` owner
or is not unsupported, its family, reason, section, or remaining contract is
absent, or its attempts name neither a graph node nor a track decision. Its
`targetMilestone` must be a numbered *ROADMAP.md* milestone after M5 or the
plan file of a track that *ROADMAP.md* records as deferred, such as
*PLAN-DYN.md*. An exclusion audit row with the `deferral` disposition
requires the `deferred` owner and the `not-demonstrated` assessment, and is
counted neither as an exclusion nor as remediation. A deferred path may lack
an audit row only when its rejection falls on no accepted record's surface.

The checker accepts an `adr:` owner only for an unsupported path, only when
the paragraph under the record's Status heading begins with `Accepted`, and
only with an owner note. The note quotes the text that authorizes and bounds
the exclusion and states the path selector. A failure can never cite a
record. `mise run check:m5c-exclusion-audit` additionally binds each human
boundary assessment to the accepted record text, pinned source, and observed
rejection. It verifies quoted authorization and reopening text and rejects
an ADR owner when non-source subject coverage remains unresolved.

Regeneration keeps an owner while its path keeps the same state and resets it
to the default for the new state otherwise: `observation`, `unassigned`, or
`node:observation-batch-plan`. A remediation node whose landing leaves a path
unsupported for a different reason reassigns that path in the same change.

### Unsupported ownership

The `unsupported-ownership-audit` node initially assigned all 1,480
reviewed unsupported paths from its observed reason, not from its dependency
tags. The observed reason is the unsupported frontmatter feature, the named
unsupported capability, or the `OSEO1001` diagnostic recorded in the
manifest.

| Owner                                      | Paths | Observed reason                                               |
| ------------------------------------------ | ----: | ------------------------------------------------------------- |
| `node:regexp-property-escape-harness`      |   453 | *regExpUtils.js* omits `buildString`                          |
| `node:iterator-helpers`                    |   392 | only `iterator-helpers` is unadmitted                         |
| `adr:0016-dynamic-source-boundary`         |    56 | bounded source evaluation or construction                     |
| `node:dynamic-source-coverage-remediation` |   121 | unresolved non-source coverage behind an authorized rejection |
| `node:resizable-array-buffer-harness`      |   168 | *resizableArrayBufferUtils.js* include                        |
| `node:cross-realm-host`                    |    84 | `cross-realm` is unadmitted                                   |
| `node:typed-array-feature-admission`       |    42 | concrete TypedArray tags or `typeof Float16Array`             |
| `node:primitive-wrapper-objects`           |    36 | `primitive-wrapper`                                           |
| `node:promise-feature-admission`           |    30 | `Promise` or `Promise.prototype.finally` is unadmitted        |
| `node:module-export-forms`                 |    28 | unadmitted export forms                                       |
| `node:unhandled-rejection-observation`     |    19 | `unhandled-rejection-policy`                                  |
| `node:eval-intrinsic-value`                |    16 | `eval` read only as a value                                   |
| `node:test262-host-script-bindings`        |    14 | `$262.evalScript` or `print`                                  |
| `node:well-known-intrinsics-harness`       |     6 | *wellKnownIntrinsicObjects.js* include                        |
| `node:regexp-pattern-extensions`           |     5 | `regexp-pattern-extension`                                    |
| `node:frontmatter-feature-tags`            |     5 | `super` or `dynamic-import` tag the source does not use       |
| `node:non-blocking-agent`                  |     2 | `non-blocking-agent`                                          |
| `node:proper-tail-calls`                   |     2 | Retained feature-gated unsupported observations               |
| `node:regexp-split-coverage-remediation`   |     1 | mixed Annex B/core split coverage                             |

Two accepted records initially owned 178 proposed exclusions. ADR 0016 owned
a path only when its
observed `OSEO1001` diagnostic rejects the `Function` constructor, a
constructor that compiles source text, or a call of `eval`, including
`eval?.()` and `(0, eval)()`. ADR 0013 initially owned the one path whose
diagnostic names an Annex B-only pattern; the audit below moves it to
remediation. Every realm, agent, shared memory, host
binding, and harness capability path has a remediation owner. So do `eval`
read as a value, `$262.evalScript`, and proper tail calls, because no
accepted record excludes them.

The reviewed subset gives 120 of the 177 proposed ADR 0016 paths no
`dynamic-source` tag. Their owner rests on the observed diagnostic, and their
ledger entries show the missing tag; retagging them is a separate manifest
change.

The initial audit selected a source-subject cohort when a path lay under
*test/built-ins/AsyncFunction/*, *test/built-ins/AsyncGeneratorFunction/*,
*test/built-ins/GeneratorFunction/*, *test/built-ins/Function/length/*,
*test/built-ins/Function/prototype/toString/*, or *test/language/eval-code/*;
when it is an `S15.3.5.2_*` case under *test/built-ins/Function/prototype/*;
when its file name contains `eval` or `new-function` outside
*test/built-ins/String/*; or when it is one of the two `scope-*-var-none.js`
cases. That selects 66 paths. The other 111 use `eval` or `Function` as
scaffolding for another subject. This selector is an audit cohort, not proof
of normative dependence or an exclusion authorization.

### Authorized exclusion audit

The audit retains 56 of the 178 proposed exclusions, all under ADR 0016. It
moves 121 paths to `node:dynamic-source-coverage-remediation` and the mixed
Annex B/core split path to `node:regexp-split-coverage-remediation`, both on
the `m5-exit-audit` dependency path. No observation, dependency tag, inventory
entry, or ADR changes. The ledger's `closedPaths` counts only passes and
expected negatives; authorized exclusions are reported separately.

[*docs/m5c-closure/exclusion-audit.yaml*](./docs/m5c-closure/exclusion-audit.yaml)
records every proposed path's normalized observation digest, source digest,
normative section, subject, prior cohort, and boundary assessment. Shared
assessments explain the same contract for each listed member. The record
entries quote the authorization and applicable reopening triggers from accepted
ADRs 0013, 0016, and 0019, and from ADR 0028 since the
`function-caller-restrictions` node. ADR 0020 fixes the denominator and
authorizes no new exclusion. ADR 0026 shows ahead-of-time host adaptation
without authorizing exclusions of other harness capabilities.

`mise run check:m5c-exclusion-audit`, included by `mise run check`, rejects
missing assessments for ADR owners, unaccepted or changed records, stale
sources or rejection observations, absent quotes, unrelated diagnostics,
value-only eval reads, and owners that differ from the assessment.

A promotion to pass or expected negative uses the observation owner. New
proposed exclusions require reviewed entries; the tool never assigns them from
a directory or dependency tag. It checks the freshness and consistency of human
judgments, not their normative truth.

The eval check parses actual call syntax, including optional and indirect
calls; reference resolution and correspondence to the rejected identifier
remain part of the human source assessment. Numeric locations in the outer
stderr diagnostic are normalized because harness composition can move them.

A changed message, capability, or source still needs a reviewed path update.
Use the exported `exclusionAuditDigest` and `exclusionObservationDigest`
helpers in *tools/m5c-exclusion-audit.ts* to compute its snapshots after
review, without regenerating observations merely to refresh the audit.

| Assessment                                                 | Paths | Disposition |
| ---------------------------------------------------------- | ----: | ----------- |
| Dynamic construction and its resulting instance            |    39 | ADR 0016    |
| Eval parsing, early errors, and eval-code binding behavior |    17 | ADR 0016    |
| Ordinary input or callable construction                    |    93 | Remediation |
| RegExp source escaping and literal round trips             |     5 | Remediation |
| Statement completion-value observation                     |    13 | Remediation |
| Template-site identity across dynamic parses               |     5 | Remediation |
| Variable-environment retention probes                      |     2 | Remediation |
| Mixed static/dynamic function assertions                   |     3 | Remediation |
| Mixed Annex B/core split assertions                        |     1 | Remediation |

For each of the 111 incidental-scaffolding paths, the observed call lies inside
ADR 0016's rejected surface, but the normative subject is not excluded. The
test's use of `eval` or `Function` does not itself prove that a normative
algorithm requires dynamic source for behavior other than source evaluation.
The audit therefore does not assert that ADR 0019's reopening trigger has been
met. It also cannot authorize excluding the unobserved in-claim subject without
replacement evidence or a maintainer coverage-accounting decision. All 111 keep
remediation ownership while that distinction is unresolved.

The 16th-edition algorithms for [GetTemplateObject], [EscapeRegExpPattern],
[CatchClauseEvaluation], and [Function.prototype.apply] define their own
caching, escaping, environment, and call contracts without requiring an eval
call. Their chosen test observers do use dynamic source. The audit maps six
legacy initializer-rule frontmatter identifiers to `sec-performeval`,
preserving the upstream identifier separately.

Ten paths from the earlier 66-path source-subject cohort join them. Five
_tagged-template/cache-\*.js_ cases observe template-site identity under
dynamic parsing, and two _scope-\*-var-none.js_ cases use eval-created `var`
bindings to distinguish retained variable environments. Three constructor
family cases also assert on statically declared functions:
*AsyncFunction/instance-construct-throws.js*,
*AsyncGeneratorFunction/has-instance.js*, and
*GeneratorFunction/has-instance.js*.

Their rejections are authorized, but template identity and environment
retention remain in the claim. These are possible reopening evidence, not a
decision to reopen or widen ADR 0016.

The five RegExp round trips need equivalent literal parsing and matching
evidence, and the 13 completion probes need evidence of Completion Record
values, not substitutions that merely return a function value. The Annex B
split path contains many core split assertions whose coverage cannot be
excluded with the legacy pattern. ADR 0013's reopening trigger is not proved by
a chosen optional input alone, so the same conservative rule retains this path
under its separate remediation node. This node produces no replacement semantic
evidence.

The audit preserves the 120 paths without the `dynamic-source` dependency tag
and names each in its path record. This is a reporting debt under ADR 0016, not
evidence that the rejection is unauthorized. The check reports their count
separately so dependency-indexed summaries cannot silently stand in for the
observed dynamic-source gap. Of these 120 paths, 29 retain exclusions and 91
move to remediation.

#### Maintainer decision requested

Choose how the 121 dynamic-source remediation paths, including all 111
incidental paths, and the one mixed Annex B/core split path may close. The
recommended option keeps their remediation owners until reviewed equivalent
ahead-of-time observation or existing replacement evidence proves each
non-source contract. This preserves the bounded exclusion, costs follow-up
evidence or harness work, and reports 56 authorized exclusions plus 1,424
unsupported remediation paths, including these 122. The original upstream paths
and assertions remain visible; replacement evidence alone does not turn a
recorded unsupported result into a pass.

Alternatively, explicitly accept the original 178 paths as bounded
compile-rejection exclusions, while continuing to report the 122 non-source
coverage gaps separately. That avoids adapting source-evaluating tests, but
does not substantiate their normative subjects and risks overstating closure
unless the reporting contract names those gaps. It would report 178 exclusions
and 1,302 unsupported remediation paths, with unchanged manifest
classifications and percentage. This worker does not make that accounting
decision or accept a new exclusion.

Separately, authorize a follow-up to add `dynamic-source` alongside the
existing tags on all 120 paths and regenerate the manifest. This makes the
dependency-indexed dynamic-source totals match the observed gap without
changing support or ownership. Leaving the tags as found avoids a manifest
update but requires the separate diagnostic-based count in every coverage
report. Adding the tags is recommended; this audit does not retag them.

Item 3 of the 2026-10-28 maintainer decision has since closed the mixed Annex
B/core split path under ADR 0013 on reviewed replacement evidence. The
dynamic-source remediation paths remain open, as
[Remaining work](#remaining-work) describes.

The `cross-realm-host` node implements realms beyond the initial realm and the
`$262.createRealm` capability under
[ADR 0027](./docs/adr/0027-realms-beyond-the-initial-realm.md). Of its 84
paths, 43 pass. 40 reach the ADR 0016 boundary at run time: 30 by constructing
another realm's `Function` and 10 by calling another realm's `%eval%` with a
source string, each before any realm assertion runs.

Of those 40, 5 construct through another realm's `GeneratorFunction`,
`AsyncFunction`, or `AsyncGeneratorFunction`, so their subject is dynamic
construction and `adr:0016-dynamic-source-boundary` owns them. 34 use
`Function` or `eval` only to obtain a function of another realm, and one
observes the template registry across realms, so those 35 belong to
`node:dynamic-source-coverage-remediation`. The assignments are recorded in
*docs/m5c-closure/exclusion-audit.yaml*.

One, *test/built-ins/Iterator/proto-from-ctor-realm.js*, still needs the
unadmitted `iterator-helpers` feature and moves to `node:iterator-helpers`.

By the selector above, 6 of the 40 have source evaluation as their subject: the
five under *test/built-ins/AsyncFunction/*,
*test/built-ins/AsyncGeneratorFunction/*, and
*test/built-ins/GeneratorFunction/*, and
*test/language/expressions/async-generator/eval-body-proto-realm.js*; the last
obtains its function through `eval` and is a fixture-construction case. The
dynamic surface the audit recognizes includes the run-time `Function` and
`eval` diagnostics of ADR 0027.

[GetTemplateObject]: https://262.ecma-international.org/16.0/#sec-gettemplateobject
[EscapeRegExpPattern]: https://262.ecma-international.org/16.0/#sec-escaperegexppattern
[CatchClauseEvaluation]: https://262.ecma-international.org/16.0/#sec-runtime-semantics-catchclauseevaluation
[Function.prototype.apply]: https://262.ecma-international.org/16.0/#sec-function.prototype.apply

### Dynamic import observation ownership

The maintainer decision of 2026-10-07 selects option C with interim A: dynamic
import remains unsupported, and ADR 0016 is unchanged. The fixed inventory
contains 630 paths whose frontmatter lists `dynamic-import`; 629 were
unreviewed when this accounting node verified the batch-plan cohort. The
`dynamic-import` node admits no new paths. Its runner uses an explicit
observe-only set containing only `dynamic-import`, leaving the supported
feature list unchanged. A case with any other unadmitted feature is still
blocked before compilation; otherwise its classification follows the actual
observation, including a pass when the tag names syntax the source does not
use. Already-reviewed paths are re-observed by a full manifest update.
Observation
batches 30, 31, and 32 review them using the existing parse-time diagnostic
`error[OSEO1001]: ImportExpression is outside the M1 profile.` The audit
accepts exactly this message, not another `OSEO1001` rejection. A parse
negative whose ImportCall begins a `new` operand reports the early error
`OSEO0001` instead, so the `dynamic-import-early-error-precedence` node
makes its 21 owned paths expected negatives rather than exclusions.

If a feature-tagged source has no `import()` call, or observation reports a
different rejection, retain its actual classification and identify the owner
of that separate gap. Do not force it into either dynamic-source owner or
invent an exclusion-audit record outside the accepted diagnostic surface.

The earlier dynamic-import re-observation changed only
*test/language/module-code/top-level-await/syntax/catch-parameter.js*: its
frontmatter gate became `OSEO1001`, with the message “Await inside a module
top-level binding or assignment pattern is unsupported.” It remains
unsupported and has no `import()` call. The
`module-top-level-await-patterns` node owns that separate gap. The later
`frontmatter-feature-tags` admission closes the four `super` parse negatives
as expected-negative observations. The catch-parameter case keeps its
classification and has no dynamic-source exclusion audit record.

Use `adr:0016-dynamic-source-boundary` only when `import()` itself is the
normative subject and the reviewed assessment bounds the assertions to source
evaluation. The *test/language/expressions/dynamic-import/* directory or an
`esid` naming ImportCall, EvaluateImportCall, or ContinueDynamicImport
identifies a source-subject candidate; review the description, normative
section, and assertions to confirm it. A filename or feature tag alone is
insufficient. If `import()` supplies scaffolding for another subject, or
non-source coverage remains unresolved, use
`node:dynamic-source-coverage-remediation`. Module evaluation order,
top-level-await behavior, and JSON module identity remain remediation subjects
unless the assessment demonstrates only the bounded source-evaluation contract.
Each owner requires a reviewed exclusion-audit record with fresh source and
observation digests; an ADR owner without that record closes nothing under ADR
0019.

Reviewed entries carry the existing ADR 0013 `dynamic-source` dependency tag
alongside any other prerequisites. The audit's `missingDynamicTag` must be
false when that tag is present and true when absent; tag debt never authorizes
an exclusion. The batches follow
[*docs/m5c-closure/exclusion-audit.md*](./docs/m5c-closure/exclusion-audit.md)
for the record procedure. The separate `dynamic-import-staged-plan` node plans
ADR 0016 alternative 3; it does not alter this interim ownership rule.

### Static-specifier import track

The build-time-resolvable `import()` track is not implemented in M5. The
maintainer reviewed its design and deferred the track past M5. The reviewed
[*docs/static-specifier-import-design.md*](./docs/static-specifier-import-design.md)
is the post-M5 plan, linked from [*PLAN-DYN.md*](./PLAN-DYN.md), which owns the
track. Its ADR 0016 amendment stays Proposed inside that document and is not
applied to ADR 0016, so the accepted rejection, the exclusion audit digests,
and the interim ownership rule above are unchanged.

The `static-specifier-import-design` node pins 20 module-loading rows; its
work note under *docs/m5c-graph/* holds the selector. Nineteen observe the
parse-time `ImportExpression` rejection. *usage-from-eval.js* instead
observes the run-time `OSEO1001` rejection of the direct eval call whose
source contains its `import()`. Every pinned row kept
`node:dynamic-source-coverage-remediation` until the
`m5c-deferral-ledger-checker` node landed. Each now has an ADR 0031 deferral
entry whose reason names the deferred track and whose `targetMilestone` is
*PLAN-DYN.md*, and the `deferred` ledger owner.

No implementation node for the track exists in this graph. The design's
five implementation units become graph work only under the plan that
inherits the track. Whether the M5 announcement needs a separate
demonstration of the design is decided at the D8 review on 2026-11-10.


Work graph construction
-----------------------

M5c begins with measurement because neither directory size nor an unsupported
count estimates the implementation work. The bootstrap graph therefore orders
these steps:

1.  Build the closure ledger from the exact inventory and reviewed manifest.
2.  Audit reviewed unsupported results for remediation or authorized exclusion
    ownership.
3.  Partition unreviewed paths into deterministic observation batches.
4.  Audit the proposed authorized exclusions against their accepted records.
5.  Replace the measured unknown tail with bounded remediation and evidence
    nodes.
6.  Run the terminal M5 exit audit after every generated terminal node lands.

The remediation graph is an expansion point for measured gaps. The
[*remediation audit*](./docs/m5c-graph/remediation-audit.md) verifies that the
existing 78 nodes already bound the remaining tail at its named baseline. This
audit adds no semantic node: current batches, unsupported owners, and later
observed prerequisites already cover that work. Future observations can still
justify a bounded node, whose terminal result must reach `m5-exit-audit`. The
graph validator rejects any node outside that path.

Each node record names its `id`, `title`, `delivers`, `dependencies`,
`landed`, `status`, and schema `version`. A parked node also gives a `reason`.
The optional `after` field is a sorted, unique array of node IDs, empty when
omitted. It means selection and publication wait until every named node has
landed. Both `dependencies` and `after` must name existing nodes, cannot name
the node itself, and together must be acyclic. A landed node must have landed
targets for both fields. An unparked node cannot wait on a parked target.

For an unparked node, `status` is `ready` only when all direct `dependencies`
and `after` targets have landed; otherwise it is `blocked`. The graph summary
counts these validated statuses. Ordering does not add transitive dependency
ancestry: the collision-group rule and the required dependency path to
`m5-exit-audit` follow only `dependencies`. Keep publication collisions even
when `after` orders the publishers. For example, DS-2 waits on batches 20 and
30, and DS-3 waits on batches 19, 20, and 30, without making their umbrella a
dependent of those batches.

Observation batches are deterministic and small enough for one reviewer to
inspect their applicability and classifications. A batch records its path
selector, exact path count, shared prerequisites, and expected manifest
regeneration cost. It does not mix unrelated semantic implementation with a
harness capability merely because both appear in one directory.

When an observation batch exposes a shared missing prerequisite, the graph
adds one prerequisite node and makes every affected batch depend on it. When a
path is already supported, the batch admits it without inventing a semantic
node. When a failure exposes a regression, the regression is repaired before
the batch lands.

### Observation batches

The `observation-batch-plan` node partitioned the 19,708 unreviewed paths into
32 deterministic batches, recorded in
[*docs/m5c-closure/observation-batches.yaml*](./docs/m5c-closure/observation-batches.yaml).
Each batch is the graph node `observation-batch-NN`, and the ledger owner of
each unreviewed path is `node:observation-batch-NN`. The commands are:

 -  `mise run m5c:observation-batches:plan` partitions the current unreviewed
    paths from scratch and moves their ledger owners to the new batches;
 -  `mise run m5c:observation-batches:update` keeps the selectors, drops the
    prefixes, sets, and batches that no longer select a path, and refreshes
    every count and cost, as a batch landing requires; and
 -  `mise run check:m5c-observation-batches`, which `mise run check` includes,
    regenerates the plan from the selectors and compares it with the
    checked-in text.

The check rejects a path that no batch selects, a prefix that two batches share
for one prerequisite set, a prefix or listed set that selects nothing, a batch
that selects a reviewed path, a batch without a graph node, a batch node
missing a required dependency, and a ledger owner that differs from the batch.

Three batches are split so that each part reviews and lands on its
own: `observation-batch-21` (2,408 paths) into `observation-batch-21a` through
`observation-batch-21d`, `observation-batch-22` (1,219) into
`observation-batch-22a` and `observation-batch-22b`, and `observation-batch-26`
(1,029) into `observation-batch-26a` and `observation-batch-26b`. Each part is
its own graph node with the dependencies of the batch it came from, and the
batch ID pattern accepts the one-letter suffix. The cuts follow directories
and, inside the flat *class/dstr/* and *class/elements/* directories, the file
name prefixes of the generator templates, so every handwritten test and every
template stays in one part. All paths are under *test/language/statements/*:

| Batch                   | Paths | Units | Selects                                                               |
| ----------------------- | ----: | ----: | --------------------------------------------------------------------- |
| `observation-batch-21a` |   488 |   267 | *async-*, *block/*, *break/*, *class/* `arguments/` to `definition/`  |
| `observation-batch-21b` |   640 |   105 | *class/dstr/async-*: async generator methods                          |
| `observation-batch-21c` |   640 |   105 | *class/dstr/gen-*, *private-gen-*: generator methods                  |
| `observation-batch-21d` |   640 |   105 | *class/dstr/meth-*, *private-meth-*: methods                          |
| `observation-batch-22a` |   579 |   212 | *class/elements/* `after-` to `nested-`, not `init-`, `intercalated-` |
| `observation-batch-22b` |   640 |   341 | the rest of *class/elements/* and 10 other *class/* prefixes          |
| `observation-batch-26a` |   384 |   209 | *for-of/* `uint*` and `yield` names, *for/*                           |
| `observation-batch-26b` |   645 |   378 | *function/*, *generators/*                                            |

A generated file combines one case file with one template, so a case read for
templates in two parts counts as a review unit in both. The split adds five
complete corpus gates to the remaining landings: the scoped schedule grows
from 34.4 to 43.6 hours. Running
`mise run m5c:observation-batches:plan` would renumber every batch and undo
the split; `mise run m5c:observation-batches:update` keeps it.

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

A fixed table in *tools/m5c-observation-batches.ts* maps each prerequisite key
to the graph node that removes it, and a key without a node stops planning.
The `eval` and `Function` references are counted per batch but do not split
batches: ADR 0016 decides such a path by its observed diagnostic, so the batch
review applies that boundary to the observation instead of predicting it.

The plan file records the basis these keys are computed against: the reviewed
`supportedFeatures` and harness files at planning time. A prerequisite node
that later admits a feature or a harness therefore neither moves nor orphans
the paths of a batch that waits on it. Only
`mise run m5c:observation-batches:plan` takes a new basis.

The prerequisite set of a path is the sorted set of its prerequisite nodes.
Paths without a prerequisite are planned by locality. Each set with at least
50 paths is planned separately. Every smaller set joins one tail batch that
waits for all of their nodes, because a separate batch for each costs a full
regeneration for a handful of paths.

A selector lists prerequisite sets and path prefixes. A path belongs to the
batch that lists its set and has the longest prefix the path starts with. The
planner splits a prefix at its next `/`, `-`, `_`, or `.` only when its paths
do not fit. It then packs adjacent results back together while they fit, so
locality decides every boundary.

A batch fits when it has at most 3,000 paths and 500 review units. A
handwritten test is one review unit. A generated test counts its generator
case and template files instead, because a reviewer reads those once for every
expanded file. At one to two minutes per unit, 500 units is one or two working
days for one reviewer. The path bound keeps the subset and manifest diff of
one landing reviewable.

The batches need seven new prerequisite nodes, in addition to remediation
nodes from `unsupported-ownership-audit` that the unreviewed paths also need:

| Node                           | Unreviewed paths | Prerequisite keys                                        |
| ------------------------------ | ---------------: | -------------------------------------------------------- |
| `dynamic-import`               |              629 | `feature:dynamic-import`                                 |
| `import-attributes`            |               89 | `feature:import-attributes`, `feature:json-modules`      |
| `fn-global-object-harness`     |               41 | `harness:fnGlobalObject.js`                              |
| `hashbang-comments`            |               29 | `feature:hashbang`                                       |
| `function-caller-restrictions` |               23 | `feature:caller`                                         |
| `import-meta`                  |               23 | `feature:import.meta`                                    |
| `minor-feature-tag-admission`  |               10 | `json-superset`, `__proto__`, and `proxy-missing-checks` |

The existing remediation nodes cover the remaining keys: `cross-realm-host`
(90 paths), `proper-tail-calls` (33), `typed-array-feature-admission` (18),
`resizable-array-buffer-harness` (17), `frontmatter-feature-tags` (15, the
`super` tag), `module-export-forms` (13), `promise-feature-admission` (2), and
`well-known-intrinsics-harness` (1). The upstream *fnGlobalObject.js* calls
the `Function` constructor, so its reviewed replacement must reach the global
object without compiling source text.

#### Regeneration cost

Every batch landing runs the complete `test:test262` gate in `mise run test`,
which observes the whole reviewed corpus as it stands at that landing. The
batch count therefore still sets the M5c schedule. The manifest update itself
no longer has to: a batch only adds entries to *tests/test262/subset.yaml*,
which `mise run test262:update:changed` accepts as observation-neutral. That
command observes just the batch's own paths and rewrites only the partitions
they occupy. A prerequisite node that changes `supportedFeatures`, a harness
file, or *tools/* still needs the complete `mise run test262:update`.

Two complete `test262:update` runs regenerated the 21,383 paths then reviewed
with a pool of 8 workers on 16 logical cores, and the manifest was unchanged
after both. Neither run had the host to itself. One took 2,922 seconds (48.7
minutes), with another lane's gate overlapping its first nine minutes and a
mean one-minute load average of 18.4. The other took 3,997 seconds (66.6
minutes), with a mean load average of 31.9 from other sessions.

Two `mise run test:test262` gates over the same 21,383 paths took 3,407 and
3,259 seconds. The cost model uses the slower 3,997-second update as its
conservative figure for both kinds of complete run. It executed 72,749 native
variants, giving 0.0549 seconds per variant. Each unreviewed path adds two
variants per strictness mode, counted as if its prerequisites had landed,
unless it is a parse or resolution negative. The 19,708 paths add 63,556
variants. The 43 paths that `cross-realm-host` moved to pass raised that corpus
to 72,921 executed variants. One complete run over the 41,091-path corpus costs
about 7,498 seconds (125.0 minutes).

The plan records, for each batch, the seconds of its scoped update and of the
complete corpus when it lands in plan order. A landing costs their sum, and the
schedule sums every landing. The last column shows the same landings with the
complete update instead of the scoped one:

| Limits (paths, units) | Batches | Largest batch (paths, units) | Scoped hours | Complete-update hours |
| --------------------- | ------: | ---------------------------: | -----------: | --------------------: |
| 2,000, 300            |      51 |                   1,920, 300 |         82.7 |                 163.6 |
| 3,000, 500 (chosen)   |      32 |                   2,408, 500 |         52.6 |                 103.3 |
| 4,000, 600            |      27 |                   3,422, 600 |         45.5 |                  89.0 |
| 8,000, 1,200          |      15 |                 4,045, 1,175 |         26.3 |                  50.7 |

The scoped update halves each landing, but each additional batch still adds one
complete gate of about 1.1 to 2.1 hours. The chosen limits accept 7.2 more
hours than the 600-unit alternative to keep each batch within one reviewer's
inspection. The 1,200-unit batches would halve the schedule again, but at 20 to
40 hours of inspection one reviewer could not check their applicability and
classifications. Prerequisite nodes add their own complete updates and gates
outside these totals. The model is linear in executed variants. Compile-stage
rejections cost less than a full execution, and a corpus with more agent or
module cases can cost more.

These estimates count one scoped update and one complete corpus gate per
landing. They exclude the candidate and main workflow runs of the landing
procedure under Gates and do not estimate elapsed time.

#### Result partition overlap

The reviewed manifest partitions results by ADR 0013 group and a two-character
hash key, so a group has up to 256 partition files. Path locality chooses the
groups a batch touches, not its keys. Any batch with more than about 200 paths
in one group touches most of that group's keys. 19 of the 32 batches touch one
group, and only the small prerequisite tail touches 13. The batches touch 7,090
partition files in sum, between 54 and 326 each. Group-confined batches bound
the files a scoped update rewrites to one group's partitions.


Concurrency and serialization
-----------------------------

Analysis, implementation, focused tests, and review may run in parallel for
ready, unlanded nodes, regardless of their collision groups. The collision
groups name publication files, not sources: of the 99 groups, 86 are
*results.yaml*, 10 *exclusion-audit.yaml*, and 3 *ledger.yaml*. Applied to
whole nodes, they made every pair of the 53 ready nodes conflict. Only one node
could progress at a time, even though the longest dependency path among
unlanded nodes is three nodes and no ready semantic node waits for another.

They therefore serialize the publication phase only. One node at a time rebases
onto main and regenerates the manifest when its observation inputs changed.
That node updates the closure ledger, graph state, parity, and normative
profile, passes its candidate verification, and merges. Two nodes that edit the
same source file may still be prepared concurrently. The later one to publish
rebases onto the earlier merge, and its review covers the overlapping files
again.

Every semantic node retains the evidence contract from
[*PLAN-M5.md*](./PLAN-M5.md): focused examples, applicable generated and
forced-collection evidence, generic fallback and specialization misses,
reviewed Test262 observations, and the normative family record. Observation and
audit nodes add no runtime behavior and must not create evidence merely to look
like semantic nodes.

The graph baseline moves whenever the reviewed manifest moves. The same change
updates the ledger and node state, so a clean checkout cannot describe one
manifest while scheduling work from another.


Gates
-----

Every graph change runs `mise run check:m5c-graph`. Semantic and evidence
changes also run the ordinary repository gates and the extended property gate
required by [*CONTRIBUTING.md*](./CONTRIBUTING.md). Manifest regeneration uses
the canonical task and preserves the compatibility ratchet.

For M5c landings, a successful run of the exact candidate commit satisfies the
ordinary and extended test requirements in
[*CONTRIBUTING.md*](./CONTRIBUTING.md). `mise run check` runs locally on the
candidate after it is rebased onto main, so the ratchet compares it with the
main head.

The candidate is then pushed to a new branch, and every job of that workflow
run must pass. The workflow runs the component suites of `mise run test` and
both extended property tasks, partitioned across jobs on both native hosts,
with the same case budgets and seeds as a local run, and adds the sanitizer
lanes. Its sharded test262 jobs compare record values rather than manifest
text, so the candidate's manifest is also checked for canonical text.

The merge tree must equal the candidate tree. Graph state, including the
node's `landed` field and the expectations in *tests/m5c-graph.test.ts*, is
part of the same candidate, which avoids an additional workflow run for a
separate graph-state commit; the candidate and main runs are both still
required.

Graph transitions recorded in the candidate take effect for scheduling only
after the main workflow succeeds for the exact merge commit. Until then, newly
unblocked successors are not scheduled and the landing is not reported as
complete. The terminal audit below still runs its gates locally from a clean
checkout.

The terminal audit additionally proves:

 -  the inventory and manifest use the same pinned revision;
 -  all 41,091 included paths occur exactly once in the closure ledger;
 -  the reviewed manifest covers all included paths;
 -  semantic, harness, and infrastructure failure counts are zero;
 -  every remaining unsupported result is covered by an accepted record that
    authorizes and bounds an M5 exclusion, or by a reviewed ADR 0031
    deferral entry whose source, observation, and record digests are fresh;
 -  every accepted exclusion retains a stated reopening trigger, and every
    deferral names its remaining contract and the milestone or deferred
    track that inherits it after M5;
 -  before the audit uses the deferral list, Root has mailed the maintainer
    the complete *docs/m5c-closure/deferrals.yaml* with a summary of its
    total path count, per-family counts, each distinct reason with its
    count, and target milestones, flagging every entry outside the dynamic
    source family, and no objection arrived within the coordination wait
    period;
 -  the coverage report can be reproduced from checked-in inputs, which
    `mise run report:m5-coverage` prints; and
 -  `mise run check`, `mise run test`, and the extended property task pass from
    a clean checkout.


Remaining work
--------------

No included path is unreviewed or failed, and no path keeps a remediation
owner. `dynamic-source-coverage-remediation` has landed with no path left.
Four child nodes gave its last 136 paths one outcome each: 88 close under
ADR 0016, by replacement evidence or an existing exclusion assessment, and 48
defer under ADR 0031 as run-time-source paths. The umbrella's
[work note](./docs/m5c-graph/dynamic-source-coverage-remediation.md) links
each child.

`class-declaration-private-accessor-closure` closes the last two remediation
paths, the class declaration paths that call `__lookupGetter__` or
`__lookupSetter__`, under ADR 0013 on the conditions of the 2026-11-02
maintainer decision.

`m5-exit-audit` lands last. Its `mise run check:m5-exit-audit` task proves
every condition under [Gates](#gates) that the repository can check, and the
[M5 exit report](./docs/m5c-closure/m5-exit-report.md) records the result.
Two conditions stay outside it: the record that Root mailed the maintainer the
complete *docs/m5c-closure/deferrals.yaml* as [Gates](#gates) describes and no
objection arrived, and the clean-checkout runs of `mise run check`,
`mise run test`, and the extended property task for the landing commit.


Exit and reporting
------------------

M5c is complete when `m5-exit-audit` lands. The
[M5 exit report](./docs/m5c-closure/m5-exit-report.md) records the final
classification totals, authorized-exclusion count per record, deferral count
per family, and exact inventory revision, and `mise run check:m5-exit-audit`
rejects a report that no longer matches the checked-in inputs. The landing
records the gate results. No queue-empty or all-current-nodes-landed
condition can substitute for that audit, because the remediation graph may
still need to expand after new observations.

The completion report describes Oseo's measured M5 profile. It does not call
the result unqualified ECMA-262 conformance while ADR 0016 remains accepted
or the deferral list is not empty. When the list is not empty, the report
says that measured residue was deferred by name and M5 closed, and never
reports a deferred path as passing, excluded, or closed.


Node decisions
--------------

These sections record the contracts and ownership decisions of individual
M5c nodes whose consequences outlast their landing: what each admits, which
boundary it reports, and which paths stay open. Each node's work note under
*docs/m5c-graph/* and its normative family record hold the evidence.

### Static import attributes and JSON modules

The `import-attributes` node admits static `with` clauses and default-only
JSON dependencies in the closed file graph. ADR 0009 records the bounded
module-kind contract, per-request validation before deduplication, generic
data construction, shared identity, and resolution/linking diagnostics.
*tests/property/m5-import-attributes.property.test.ts* supplies generated
valid graphs and invalid requests, independent observations under Node.js
and Deno, both specialization policies, guard misses, and forced collection.

Its exact pinned selector has 89 paths, comprising 24 static subjects and
65 dynamic-boundary subjects. Dynamic runtime options remain outside ADR
0016 admission. The separately approved 64-path reservation in
*docs/m5c-graph/import-attributes-dynamic-coverage.md* belongs to
`import-attributes-dynamic-coverage-remediation`. Under the maintainer
accounting decision of 2026-10-22, that node accounts for the reservation as
bounded ADR 0016 exclusions, because each subject is ImportCall syntax or
evaluation, or the dynamic import site of JSON module identity, reachable only
through `import()`; static JSON identity stays inside the claim. The paths stay
in the inventory, never count as passes, and reopen when an accepted ADR 0016
amendment admits any form of dynamic import. It does not widen the existing
dynamic-source remediation reservation.

### Module export forms

The `module-export-forms` node admits `export var`, `export * as name`,
and arbitrary module namespace names, which owned 28 reviewed paths: 15
gated by `arbitrary-module-namespace-names`, 7 by
`export-star-as-namespace-from-module`, and 6 whose fixtures used
`export var` and reported `This export is unsupported.` Eleven of the 28
are expected parse-phase negatives: two duplicate export names, six lone
surrogates, one string local name without `from`, and two missing
semicolons after a star export. They test early errors, not a missing
capability.

Five of the six lone-surrogate cases reject at the ill-formed
string itself: *early-export-ill-formed-string.js* at its first export
alias, `Moon as "\uD83C"` (`OSEO0001` at 96:17),
*export-expname-unpaired-surrogate.js* at a local export alias,
*export-expname-from-unpaired-surrogate.js* and
*export-expname-from-as-unpaired-surrogate.js* at a re-export specifier
name, and *export-expname-import-unpaired-surrogate.js* at an import
specifier name. The sixth, *export-expname-from-star-unpaired-surrogate.js*,
spells the star as the string `"*"`, which ExportFromClause does not
accept. Its observed `OSEO0001` points at that quoted star, before the
surrogate is read, so the case proves only that earlier syntax rejection;
it is still a correct expected negative.

The ill-formed name in `export * as "\uD83D" from` is covered instead by a
structural case in *packages/parser-babel/tests/module-export-forms.test.ts*,
beside a well-formed surrogate pair that parses as a namespace export name.
The test source states that parser rule; it is not a test262 observation
or a native execution.

ADR 0009 records the linking contract. Admitting `export var` required
creating every module `var` cell while linking, because the previous
evaluator-time initialization let a cyclic importer observe a temporal
dead zone where ECMA-262 gives `undefined`. The 13 unreviewed paths that
also need these features stay with `observation-batch-32`. The complete
update observed all 28 paths: the 11 negatives as expected negatives and
the other 17 as passes.

*packages/testkit/tests/module-graph.property.test.ts* checks generated
graphs of local, indirect, namespace, and star exports with string names,
including `"*"`, `"default"`, and the empty string, against an independent
transcription of ResolveExport and GetExportedNames. Structural tests in
*packages/parser-babel/tests/module-export-forms.test.ts* fix the module
records, namespace identity, ambiguity, and link-time var initialization.
The native module scenario in *tests/native/scenarios/shard-2.ts* compares
*tests/fixtures/module-export-forms/* with Node.js and Deno under both
specialization policies and forced collection.

A namespace's [[OwnPropertyKeys]] returns its sorted export names, so the
array-index names `"10"` and `"2"` follow `""` and precede ordinary names
in code-unit order. The runtime own-key, CopyDataProperties, and for-in
snapshots keep that order for a namespace and still move array-index keys
first for every other object. V8, and so both reference hosts, lists a
namespace's array-index names first, while Bun 1.4.3 (JavaScriptCore)
follows ECMA-262. The scenario therefore checks
*tests/fixtures/module-export-forms/key-order.mjs* against an explicit
expectation rather than a reference host.

Its `Object.keys`, `Object.getOwnPropertyNames`, `Reflect.ownKeys`, Proxy,
`Object.entries`, and `Object.assign` lines are required by ECMA-262. Its
for-in line is not: ECMA-262 2025 section 14.7.5.9 leaves the enumeration
order of a module namespace exotic object unspecified, so that line fixes
the order Oseo chooses, [[OwnPropertyKeys]] order, and V8's different order
there is not a conformance failure. A spread or rest copy rebuilds an
ordinary object, so only the `Object.assign` line observes copy order
directly. The generated ResolveExport model also draws `"10"` and `"2"`.

### Incidental Annex B prototype dependency

The `annexb-proto-dependency-classification` node admits exactly
*test/built-ins/TypedArrayConstructors/ctors/no-species.js*. Core
TypedArray cloning already ignores the ArrayBuffer subclass constructor
and species. A missing `__proto__` read that reaches the intrinsic
`Object.prototype` now reports its owned `OSEO1001` rejection. Own or
inherited user properties, proxy traps, null prototypes, and unrelated
abrupt completions retain their ordinary behavior; no Annex B accessor
is installed. Runtime ABI `m5-129` records this diagnostic boundary.

The reviewed path mixes core TypedArray assertions with an incidental
Annex B read. Its ledger owner was
`node:typed-array-proto-coverage-remediation`, supported by the reviewed
`typed-array-buffer-without-species-core` native fixture and existing
constructor properties. The exclusion audit records their source digests and
requires each mixed Annex B assessment to name its bounded owner. Item 3 of the
2026-10-28 maintainer decision later closed the path under ADR 0013 on that
replacement evidence, as
[*docs/m5c-closure/exclusion-audit.md*](./docs/m5c-closure/exclusion-audit.md)
records; ADR 0013 itself is unchanged.

The node has landed; the sole added record was the owned path, and every
previously reviewed observation was unchanged.

### Incidental legacy accessor lookup dependency

The `annexb-legacy-lookup-dependency-classification` node classifies the
incidental lookup in exactly two paths under
*test/language/expressions/class/elements/*:
*private-getter-is-not-a-own-property.js* and
*private-setter-is-not-a-own-property.js*. Each calls
`this.__lookupGetter__("#m")` or `this.__lookupSetter__("#m")` before its core
private getter read or private setter write. The 16th edition defines those
methods in clause 20.1.3.9 as normative optional legacy behavior. ADR 0020 maps
that clause onto the ADR 0013 Annex B exclusion, and the inventory excludes
their direct tests as `optional-section:annex-b`.

A missing lookup of either exact name reaching an intrinsic `Object.prototype`
now reports the owned `OSEO1001` rejection “The
Object.prototype.\_\_lookupGetter\_\_ method is excluded by the M5 optional
legacy accessor policy.” or its Setter counterpart. User properties and methods
with those names, non-callable shadows, null prototypes, proxy traps,
reflection, `__defineGetter__`, `__defineSetter__`, and unrelated or private
accessor TypeErrors keep their behavior. Runtime ABI `m5-130` records this
boundary. The `__proto__` rejection, its audit surface, and its owner are
unchanged.

This node admits no path and writes no audit row or ledger owner. Observation
batch 11 keeps its exact 1,199-path reservation and admits the two paths as
`unsupported-profile-feature` with the exact owned rejection at the end of
stderr and their unchanged `classes` dependency tag. Their
`annex-b-legacy-lookup` audit rows and ledger entries name the
`node:class-private-accessor-lookup-coverage-remediation` owner. The exclusion
audit accepts the new rejection only with that remediation owner, only when the
source contains a call of the named method in call syntax, and never as an
exclusion. The private accessor subjects remain mixed coverage debt, and ADR
0013 accepts no new exclusion.

The 2026-11-01 maintainer decision closes exactly these two paths under ADR
0013 on reviewed replacement evidence; see
[the work note](docs/m5c-graph/class-private-accessor-lookup-coverage-remediation.md).

Observation batch 22b admits the two class declaration paths of the same
shape under *test/language/statements/class/elements/* with the same
remediation owner. The 2026-11-02 maintainer decision closes exactly these
two under ADR 0013 on the same conditions, through node
`class-declaration-private-accessor-closure` and its class declaration
replacement fixtures; see
[its work note](docs/m5c-graph/class-declaration-private-accessor-closure.md).
No path keeps the remediation owner.

### Incidental Annex B prototype write dependency

The `__proto__` boundary above covered only the read. A write of `"__proto__"`
that reaches the intrinsic `Object.prototype` without the key needs the same
omitted normative-optional setter (16th edition 20.1.3.8.2); without a guard it
silently creates an own data property instead, so a test can pass without the
setup it intended. The `resizable-array-buffer-harness` node therefore enforces
the existing ADR 0013 dependency rule for writes. It adds no exclusion and no
policy waiver, and leaves the ADR 0013 vocabulary unchanged.

Both of *runtime\_property.c*'s `[[Set]]` walks report the existing owned
`OSEO1001` there, and runtime ABI `m5-134` records it. User properties, proxy
`set` traps, null prototypes, typed-array numeric keys, and the object-literal
prototype setter keep their behavior, and a primitive base keeps its existing
early return. This is the boundary of those walks, not a complete Annex B
detector.

*TypedArray/out-of-bounds-behaves-like-detached.js* is the one reviewed case
that writes `__proto__`: `i8a.__proto__ = { 2: 'wrong value' }` is meant to
give the view a prototype that answers index 2. Before this guard it passed
with an own `"__proto__"` property and the view still inheriting from
`Int8Array.prototype`, so none of its assertions could show that an
out-of-bounds read or `in` skips such a prototype. Its core subject remains
active coverage debt, not an exclusion.

The `typed-array-core` native fixture now supplies that subject with
`Object.setPrototypeOf`: an index-bearing prototype that inherits from
`Int8Array.prototype`, on a fixed-length and a length-tracking view, with
prototype identity and an inherited label as witnesses, `Get` and `in` before
shrinking, out of bounds, and after regrowing.
*tests/annexb-proto-boundary.test.ts* passes all four tests (guarded and
answered writes under both specialization policies), and the fixture passes
through `mise run test:native --shard 77/282` with Node.js, Deno, and native
outputs matching.

The path is unsupported in the reviewed `main` manifest. A static scan of
spelled `__proto__` keys finds no guard candidate among the `main` passes that
mention it, but it cannot see computed keys, so the complete manifest update of
this source must preserve every `main` pass. Its subset expectation is
`unsupported-profile-feature`, because the reviewed runner refuses a
pass-to-unsupported change as a demotion rather than recording it.

The complete update observes the assignment's owned `OSEO1001` before any
assertion. Its mixed Annex B subject remains coverage debt, with the
`typed-array-core` fixture as replacement evidence. The audit binds the
observed rejection and fixture. The ledger first assigned the path to
`node:typed-array-proto-coverage-remediation`; item 3 of the 2026-10-28
maintainer decision later closed it under ADR 0013 on that replacement evidence.

### Legacy function caller boundary

The `function-caller-restrictions` node accounts for exactly the 23 paths
with the `caller` frontmatter feature, all in the fixed inventory. They are
`noStrict` tests that need a read of a non-strict ordinary function's
`caller`, directly or as `arguments.callee.caller`, to complete normally.
That is the optional legacy extension restricted by ECMA-262 clause 17.1,
not the strict-function restriction the node's original premise described.

The maintainer approved
[ADR 0028](./docs/adr/0028-legacy-function-caller-boundary.md) on 2026-10-20.
M5 keeps the standard %ThrowTypeError% `caller` and `arguments` accessors on
%Function.prototype% and adds neither stack introspection nor a constant own
`caller` property. The record authorizes an M5 exclusion of the optional
expectation for its exact selector only. The `caller` feature stays out of
the checked-in `supportedFeatures`, so the paths keep their frontmatter
rejection.

The %Function.prototype% accessor descriptors, the clause 17.1 restrictions
on other function kinds and strict functions, and the absence of an own
`caller` property on arguments objects stay inside the claim. So do the other
76 _test/built-ins/Function/15.3.5.4\_2-\*gs.js_ paths, which keep their
observation batch.

The node adds the 23 paths to the reviewed subset as
`unsupported-profile-feature` with existing ADR 0013 tags: `functions` on
every path, `dynamic-source` on the five that call `eval` or a
source-compiling `Function` form, and `object-properties` on the two
arguments tests. The dependency and classification vocabularies, the
inventory policy, and the manifest schema are unchanged. Regeneration through
the normal tools supplies the result records, the observation-batch counts,
and the graph baseline. The node assigns the ledger owner
`adr:0028-legacy-function-caller-boundary` with a note that bounds its
surface. Coverage reports count these 23 exclusions separately from passes
and from remediation-owned unsupported results, against the 41,091-path
denominator.

The exclusion audit records each path under the `legacy-caller` assessment.
`mise run check:m5c-exclusion-audit` accepts the ADR 0028 owner only for a
selector path whose observation is the exact frontmatter rejection with
`caller` as the only unsupported feature, whose case has the `noStrict`
flag, and whose source reads a `caller` member. A selector path can use no
other ADR owner, and every reviewed selector path needs its audit row. The
five dynamic-source intersections do not broaden ADR 0016 and are not owned
by it. A later observation that reaches their dynamic-source rejection, or
that admits the `caller` feature, needs a new reviewed scope decision.

### Minor feature tag admission

The `minor-feature-tag-admission` node admits the `json-superset`,
`__proto__`, and `proxy-missing-checks` frontmatter features to the reviewed
`supportedFeatures`. Exactly ten included paths of the fixed inventory carry
one of them. All ten are unreviewed and owned by `node:observation-batch-32`.
This node adds no subset row: batch 32 keeps their first admission, their
observed classification, and any exclusion-audit row or ledger owner.

Each tag is admitted because the current profile already meets what its
included paths require. Source analysis found no defect to repair, so the node
changes no compiler or runtime code:

 -  `json-superset` gates four paths under *test/language/literals/string/*.
    ECMA-262 16th edition String Literals let U+2028 and U+2029 appear
    literally in a string literal. Babel accepts them, the compiler keeps each
    as one UTF-16 code unit of the string constant, and the C backend emits
    that constant as a code-unit array. *line-separator.js* and
    *paragraph-separator.js* need only that literal data. Their
    *line-separator-eval.js* and *paragraph-separator-eval.js* siblings pass
    the feature gate and then call `eval`, so their observation reaches the
    ADR 0016 boundary. This node claims neither a pass nor an exclusion for
    them, and the literal behavior above does not depend on them.

 -  `__proto__` gates three paths that ADR 0020 keeps in the inventory as
    core tests merely carrying the flag.
    *test/language/expressions/object/\_\_proto\_\_-permitted-dup.js*
    tests the core Object Initializer early error and
    PropertyDefinitionEvaluation that M5a Unit 8.1c admitted.
    *test/language/expressions/class/poisoned-underscore-proto.js* defines a
    user `__proto__` setter on `Object.prototype` and observes that
    ClassDefinitionEvaluation sets the new prototype object's `[[Prototype]]`
    directly.
    *test/built-ins/Proxy/set/call-parameters-prototype-dunder-proto.js*
    forwards OrdinarySet with the key `"__proto__"` to a proxy parent's `set`
    trap. None reads the optional `Object.prototype.__proto__` accessor.
    Admitting the tag installs no accessor and is not a blanket Annex B
    exclusion: a missing `__proto__` read that reaches an intrinsic
    `Object.prototype` still reports the `OSEO1001` rejection owned by
    `annexb-proto-dependency-classification`.

 -  `proxy-missing-checks` gates three paths under *test/built-ins/Proxy/*.
    The `proxy-exotic-object` implementation in
    *packages/runtime-c/native/runtime\_proxy.c* already applies the three
    post-trap invariants those paths observe. Its `[[DefineOwnProperty]]`
    throws a `TypeError` when the trap reports success for a descriptor with
    a false `[[Writable]]` while the target property is non-configurable
    writable data. Its `[[Delete]]` throws when the trap reports success for an
    existing configurable property of a non-extensible target. Its
    `[[GetOwnProperty]]` throws when the trap reports a non-configurable,
    non-writable descriptor while the target property is writable.

The node adds no generated domain, seed, or budget, because no runtime
behavior changes. It extends fixed evidence of the existing families instead.

The `proxy-exotic-object` native fixture triggers each of the three
invariants beside an accepted control, counts the trap calls, and writes
`"__proto__"` through a proxy parent with computed and static keys. The
*tests/native/fixtures/objects.ts* native fixture adds generator, async, and
async generator methods named `__proto__` beside a prototype setter. A
*packages/parser-babel/tests/basics.test.ts* case checks that literal
U+2028 and U+2029 stay single code units of their string constants while a
raw line feed or carriage return still leaves the literal unterminated. The
native fixtures compare Node.js, Deno, and both native specialization
policies with collection forced at every safepoint.

Changing `supportedFeatures` requires the complete `mise run test262:update`,
because the scoped update refuses that change. No reviewed path carries the
admitted tags, so every reviewed observation should stay unchanged; the
complete update's actual records decide. The node's two direct dependents
are `observation-batch-32` and `m5-exit-audit`. Landing this node alone does
not unblock batch 32, which also waits for its other prerequisite nodes.

### Resizable buffer harness

The `resizable-array-buffer-harness` node adds a reviewed
*tests/test262/harness/resizableArrayBufferUtils.js* and registers it with
the reviewed runner, which no longer lists that include as unavailable. The
harness admission changed no runtime, compiler, or feature list; the node's
later `__proto__` write guard is described under
[Incidental Annex B prototype write dependency](#incidental-annex-b-prototype-write-dependency).

With `well-known-intrinsics-harness`, which registers
*wellKnownIntrinsicObjects.js*, the runner's list of unavailable harness
includes becomes empty. The runner therefore no longer has that list or the
branch that classified a case naming a listed include as unsupported with the
`harness-include` capability. A case that names an include the reviewed
harness does not implement still fails as a harness defect.

Three of the six records that include *wellKnownIntrinsicObjects.js* pass:
the arguments and caller property descriptions and the built-in function
`toString` case. The three `is-a-constructor` records execute their
`IsConstructor` assertion and then report the ADR 0016 run-time `OSEO1001`
rejection from their trailing construction. They are remediation-owned
active coverage debt, not exclusions.

The complete update that landed this node observed all 168 paths of its
cohort: 162 pass and 6 remained unsupported, assigned as active coverage debt
without exclusions:

 -  The grow and shrink _user-provided-tolocalestring-\*.js_ cases of
    `Array.prototype.toLocaleString` and `%TypedArray%.prototype.toLocaleString`
    reported the `primitive-wrapper` capability. Their replacement
    `Number.prototype.toLocaleString` and `BigInt.prototype.toLocaleString`
    call the saved original with a non-strict `this`, which boxes the element.
    The first observed variant stopped at that call, so their remaining
    assertions did not run. These four went to `primitive-wrapper-objects`
    and now pass.
 -  *TypedArray/prototype/resizable-and-fixed-have-same-prototype.js* reports
    the run-time `OSEO1001` rejection of the Annex B
    `Object.prototype.__proto__` accessor. The program runs both buffer
    allocations and constructs the first listed constructor's two views,
    `ta_rab` over the resizable buffer and then `ta_ab` over the fixed-length
    buffer. It stops at the `ta_ab.__proto__` read, recorded at 275:20 as the
    first operand of the first prototype comparison, so no comparison
    completes. Its core subject, that fixed-length views over a resizable and
    a fixed-length buffer share the new target's prototype, does not depend
    on Annex B. It went to `typed-array-proto-coverage-remediation` beside
    *no-species.js* under a separate bounded audit assessment. Replacement
    evidence is the `typed-array-constructors` native fixture's case for
    every constructor the harness lists, including its three class
    subclasses, and the construction order property's fixed-buffer and
    length-tracking resizable-buffer cases. The native fixture covers the
    fixed-length view pairs over both buffer kinds; the property covers
    complementary shapes. Item 3 of the 2026-10-28 maintainer decision later
    closed the path under ADR 0013 on that evidence; ADR 0013 is not widened.
 -  *TypedArray/out-of-bounds-behaves-like-detached.js* is unsupported under
    the `__proto__` write guard, as
    [Incidental Annex B prototype write dependency](#incidental-annex-b-prototype-write-dependency)
    describes.

The CLI's `executed` fact is shared infrastructure needed by this node's
runtime `__proto__` boundaries. Only starting the compiled executable sets
it. The runner retains that variant as execution evidence when a run-time
`OSEO1001` stops the program, and the fragment executor counts the same fact.
Compile-stage rejections and failures before program start have no execution
fact. This contract does not depend on the intrinsics harness.

The copy keeps every upstream operation except how the three subclasses are
made. Upstream's internal `subClass` compiles
`return class My<type> extends <type> {}` through the `Function`
constructor, which ADR 0016 keeps outside the admitted dynamic source. That
body runs in the global environment and only declares a class, so the copy
declares `MyUint8Array`, `MyFloat32Array`, and `MyBigInt64Array` as `const`
bindings of the same named class expressions, in the same order and with the
same global heritage. This adaptation is bounded:

 -  `subClass` itself is not defined. It is outside the upstream `defines`,
    and no pinned test calls it.
 -  Upstream's `try`/`catch` yields `undefined` only on an engine without
    class syntax. This profile admits classes, so the three bindings always
    hold their classes.
 -  Both `typeof Float16Array` probes are kept verbatim, so `ctors` and
    `floatCtors` are exactly the lists upstream selects on the host that
    runs them. The probes are not dropped to avoid the Float16Array gap.

The upstream frontmatter of 188 pinned tests includes this file. Of the
included inventory, 168 form this node's original reviewed cohort and 17 were
unreviewed paths reserved for `observation-batch-32`. Three more are under
*test/staging/* and outside the inventory.

The source of that complete update contains `typed-array-feature-admission`,
which admits the Float16Array global. Without that admission both probes
would be the profile-syntax rejection for `typeof` of an unadmitted standard
global. This node does not touch the Float16Array source. A reference run
under Node.js and Deno on hosts that define Float16Array is evidence that the
copy is equivalent to upstream, not an Oseo observation. The classifications
come only from that complete update.

### Dynamic RegExp pattern extensions

The `regexp-pattern-extensions` node owns the five reviewed paths whose
observation names the `regexp-pattern-extension` capability. None of them is a
lexer, literal, flag, or harness gap. Each stops at the runtime C validator,
reached through RegExp construction at run time.

Four are the *test/built-ins/RegExp/named-groups/* `*-property-names*.js`
cases. Their literals already compile ahead of time, but
`RegExp("(?<\\u0041>.)")`, `RegExp("(?<a\u{104A4}>.)", "u")`, and
`new RegExp("(?<🦊>fox)")` need an escaped name decoded and a non-ASCII name
classified, which the runtime refused for lack of identifier data.

The fifth, *regexp-prototype-matchAll-v-u-flag.js* under
*test/built-ins/String/prototype/matchAll/*, reaches `@@matchAll` species
construction, which handed the literal `/\p{Script=Han}/gu` back to the dynamic
compiler that deliberately has no property tables.

The node links the pinned `ID_Start` and `ID_Continue` tables into the runtime
and shares one RegExpIdentifierName decoder between the validator and the
dynamic program builder. It lets a copy of a branded RegExp borrow an
ahead-of-time program when the parse flags agree. The profile record in
[*docs/language-profile-m5.md*](./docs/language-profile-m5.md) states both
contracts. Runtime ABI `m5-135` records them.

Dynamic Unicode properties, class sets, unlinked case folding, and the
non-ASCII identity escape without `u` keep their located boundary, so the
capability stays in the runner's vocabulary. No exclusion is proposed, and no
dynamic source text is admitted beyond the pattern grammar RegExp construction
already compiled.

### Proper tail calls

The `proper-tail-calls` node implements ECMA-262 15.10 rather than seeking an
exclusion; no accepted record excludes it. A call is a tail call exactly when
IsInTailPosition holds. Its body must be strict source code of an ordinary,
arrow, method, accessor, or class constructor function. Generator and async
bodies, class field initializers, static blocks, parameter defaults, and Script
or Module code have none. Within a body, a `return` qualifies only outside every
try Block, every Catch with a Finally, and every for-of body, which are the
statement contexts HasCallInTailPosition excludes. The expression rules then
select the returned call itself, both conditional arms, the right operand of
`&&`, `||`, and `??`, the last comma operand, an optional chain ending in a
call, and tagged templates of either form.

A tail call records its callee, receiver, copied arguments, and running realm
in the context and leaves its frame through the body's ordinary exit with
`OSEO_STATUS_TAIL_CALL`. `oseo_call_function` performs recorded calls one rooted
step at a time, so a chain of any length holds one step's native stack, call
depth, frame budget, and roots. `Function.prototype.call`,
`Function.prototype.apply`, and `Reflect.apply` record their final call as
their PrepareForTailCall steps require. Bound function and Proxy [[Call]]
forward the same way because neither creates an execution context. A derived
constructor's tail call carries its `this` binding cell, so the constructor
result rules apply to the chain's final value.

`console.log`, `setTimeout`, and `clearTimeout` also run as recorded host steps
in tail position. All arguments, including unused extras and spread iteration,
evaluate before recording and releasing the frame. `clearTimeout` keeps its
existing numeric-handle-only behavior and undefined result; no user conversion
runs. PrepareForTailCall requires releasing transient resources before the
target even when the target runs no user code or allocation.

A call outside tail position keeps nesting its frame and the 256-call limit.
A chain of wide frames can exhaust the active native frame budget first,
which the host C compiler lane reaches sooner because it charges each slot
past the 32-slot base eight times. Because forwarding no longer nests, a
non-tail call through a bound function or Proxy uses one call level fewer
for that wrapper. A strict chain of tail calls with no base case runs until
it is stopped instead of reporting `OSEO2001`, as the specification requires.
Runtime ABI `m5-136` reserved this contract. `m5-137` is used for the
additional owner-local collector counts. The environment bitmap source uses
`m5-139`.

The source implements proper tail calls and restores the
*tests/test262/harness/tcoHelper.js* that keeps `$MAX_ITERATIONS` at
100,000. It owns the two tagged-template paths
*test/language/expressions/tagged-template/tco-call.js* and *tco-member.js*;
both pass under both specialization policies. The `--accept-promotions`
output changes exactly their two expectations and records. The single
`tail-call-optimization` admission remains the 147th feature. The
[TCO evidence contract](docs/evidence/proper-tail-calls-u68-20261027.md)
records the current-source evidence and its limits, and
[the source preparation records](#source-preparation-records) hold the earlier
sources.

The fixed inventory tags 35 paths with the feature, all applicable and none a
negative test. The other 33 were reserved for `observation-batch-32`.

Evidence lives in *tests/property/m5-proper-tail-calls.property.test.ts*
(seeds `0x60008900` through `0x60008902`), *tests/proper-tail-calls.test.ts*,
*tests/native/fixtures/proper-tail-calls.ts*,
*tests/runtime-tail-calls.test.ts*, and the structural tests the family record
indexes. The native non-tail tests and the non-tail property draws predict
which resource guard a chain reaches, if any, with
*tests/proper-tail-call-resources.ts*. It replays the chain's calls against
the runtime's frame contract, the toolchain's `-D` overrides, and the slot
counts the backend declares in the emitted dispatcher, so it checks the
runtime's accounting rather than the compiler's slot allocation. A draw
predicted to exhaust the budget must stop with exactly that guard's
diagnostic; every other draw keeps the exact semantic comparison, and both
references always match the semantic model.

A completion target is entered only through a
`resume-completion` switch, which names every block emitted for its body.
Reachability once followed completion targets unconditionally, so a body whose
every `finally` leaves abruptly, such as one whose catch always returns or one
that a `break` or `continue` crosses before returning, emitted a label with no
`goto`, and both toolchains' `-Werror` rejected the program. The non-tail
property exposed this C backend defect; it predates this node and reproduces in
non-strict code with no tail call. Reachability defers completion targets until
a `resume-completion` terminator is reachable in the same body, including
generator entry and body partitions. The target block 0 that a `return`,
`throw`, or normal completion saves is a sentinel that no dispatch names, so
reachability never defers it: a generator, async, or async generator body that
starts after a non-simple parameter prologue does not emit that prologue's
blocks again. Blocks it drops had no incoming jump; a function whose only
dispatch lay in such dead code also loses that code, which can lower its
declared frame slots. *tests/completion-target-labels.test.ts* checks the
emitted labels and the dispatch it keeps, and the *proper-tail-calls* native
fixture and *tests/proper-tail-calls.test.ts* run the affected shapes.

### Iterator helpers tag activation

IH-A adds only `iterator-helpers` to `supportedFeatures`. A generic runner
check classifies an unadmitted include as `unsupported-profile-feature`
with capability `harness-include` before assembly; admitted includes and
raw cases keep their existing behavior and all dependency tags remain.
This follows ADR 0013's named-capability distinction between unavailable
harness support and defects in an admitted harness. The include itself
is not admitted.

The first 393-row precheck found two semantic failures in `Iterator.from`
for String primitives. *PLAN-M5.md* describes their bounded repair and its
fixed and generated evidence. The complete update then promoted 389 paths
with no demotions; promoted paths take the observation owner. The update
assigned the three *temporalHelpers.js* paths to `temporal-helpers-harness`
(IH-B), which later promoted them, and *Iterator/proto-from-ctor-realm.js* to
`dynamic-source-coverage-remediation`. The
[IH-A work note](./docs/m5c-graph/iterator-helpers-tag-activation.md) records
the exact paths, raw packets and remaining remediation boundaries.

### Temporal helpers harness

IH-B admits a reviewed subset of *temporalHelpers.js* for the three
*Iterator/from/* paths that include it. The copy keeps `observeMethod`,
`propertyBagObserver`, `toPrimitiveObserver`, and the upstream
`formatPropertyName` and `ASCII_IDENTIFIER` they log through; the other 43
`TemporalHelpers` members, which mostly need Temporal or Intl, are omitted.
`supportedFeatures` is unchanged.

Because the subset still declares `TemporalHelpers`, the runner's
`harness-definition` check also compares literal member keys of upstream
object-literal definitions. The 2026-10-29 maintainer decision replaced
the first, static prediction of omitted-member reads with a runtime trap:
the object runs behind a proxy that prints a per-case secret marker before
throwing on any observation of an omitted member, and the runner
classifies any marker, or a started program whose trap never armed, as a
harness failure ahead of every other outcome. No other reviewed include is
affected.

The complete update promoted exactly the three *Iterator/from/* paths from
`unsupported-profile-feature` to pass, with no demotions or failure
classifications. The ledger assigns them to `observation`, so
`temporal-helpers-harness` owns no path. The
[IH-B work note](./docs/m5c-graph/temporal-helpers-harness.md) records the
decision, its tests and the raw packets.


Source preparation records
--------------------------

Several landings were prepared as composed sources, split after a candidate
failed, or reobserved on a new base. Their exact commits, commands, wall
times, and raw packet locations are in
[*docs/evidence/m5c-source-preparations/README.md*](./docs/evidence/m5c-source-preparations/README.md).
Every node they served has landed, and the reviewed manifest and closure ledger
hold the observations that replaced them. The records, by node:

 -  `eval-intrinsic-value`, `regexp-pattern-extensions`,
    `computed-member-reference-key-order`, and `primitive-wrapper-objects`:
    [the source after the four-source candidate](./docs/evidence/m5c-source-preparations/README.md#source-preparation-after-the-four-source-candidate),
    which dropped the proper-tail-call source.
 -  `observation-batch-15`, `script-module-declaration-early-error`, and
    `generator-dispatch-stack-charge`:
    [batch 15](./docs/evidence/m5c-source-preparations/README.md#observation-batch-15-current-source-preparation),
    [the generator continuation stack](./docs/evidence/m5c-source-preparations/README.md#generator-continuation-stack-source-preparation),
    [the reduced three-unit source](./docs/evidence/m5c-source-preparations/README.md#reduced-three-unit-source-preparation-on-green-main),
    and
    [its observation](./docs/evidence/m5c-source-preparations/README.md#reduced-three-unit-observation-and-publication-candidate).
 -  `yield-star-throw-callability`:
    [the F3-only source](./docs/evidence/m5c-source-preparations/README.md#f3-only-source-preparation-after-the-array-candidate-failure),
    prepared without the failed Array node.
 -  `observation-batch-16` and `observation-batch-17`:
    [batch 16](./docs/evidence/m5c-source-preparations/README.md#observation-batch-16-source-bound-preparation),
    [batch 17](./docs/evidence/m5c-source-preparations/README.md#observation-batch-17-source-bound-preparation),
    and
    [their reobservation on Main](./docs/evidence/m5c-source-preparations/README.md#main-only-reanchor-preparation).
 -  `primitive-receiver-inherited-set`:
    [the Annex boundary repair](./docs/evidence/m5c-source-preparations/README.md#primitive-set-c2-annex-boundary-repair),
    [focused native runs](./docs/evidence/m5c-source-preparations/README.md#set-integrity-native8-on-the-fixed-no-tco-source),
    [the for-in consumer correction](./docs/evidence/m5c-source-preparations/README.md#for-in-virtual-key-consumer-correction),
    and
    [the standalone source](./docs/evidence/m5c-source-preparations/README.md#standalone-set-source-preparation-on-successful-main).
 -  `regexp-property-escape-harness`:
    [the helper source](./docs/evidence/m5c-source-preparations/README.md#reg-helper-source-preparation-on-fixed-setarrayb)
    and
    [its result](./docs/evidence/m5c-source-preparations/README.md#reg-helper-fresh-result-and-bounded-matcher-ownership),
    which moved three matcher-limit paths to
    `regexp-anchored-repeat-state-remediation`.
 -  `proper-tail-calls`:
    [the Array-base source](./docs/evidence/m5c-source-preparations/README.md#historical-tco-source-on-the-array-base),
    [its focused execution](./docs/evidence/m5c-source-preparations/README.md#historical-focused-tco-execution-on-array-353a9f17),
    [the U68 observations](./docs/evidence/m5c-source-preparations/README.md#historical-u68-tco-observations-on-the-array-source),
    and
    [the source on the Reg candidate](./docs/evidence/m5c-source-preparations/README.md#tco-source-preparation-on-the-fixed-reg-candidate).
