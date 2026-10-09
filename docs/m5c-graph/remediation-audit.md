M5c remediation graph audit
===========================

Evidence snapshot
-----------------

This audit uses main `e30aafca` at the pinned Test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. The current machine-readable
baseline remains [*graph.yaml*](./graph.yaml); these counts describe this
snapshot rather than a new observation or a future landing.

| Measured state                               |  Paths |
| -------------------------------------------- | -----: |
| Applicable inventory                         | 41,091 |
| Reviewed pass                                | 19,571 |
| Reviewed expected negative                   |  1,982 |
| Reviewed unsupported profile feature         |  1,490 |
| Unreviewed                                   | 18,048 |
| Semantic, harness, or infrastructure failure |      0 |

The reviewed total is 23,043. Passes and expected negatives account for 21,553
paths; the ledger's 19,538 open paths include all unsupported results and
unreviewed paths. Within the unsupported total, 82 paths have bounded ADR 0016
authorization and 1,408 retain remediation owners. An authorized unsupported
result remains recorded as unsupported. Unreviewed paths have neither a pass
nor a failure classification.

*AGENTS.md* and *CLAUDE.md* both link to *CONTRIBUTING.md*. The applicable
contracts are [*PLAN-M5C.md*](../../PLAN-M5C.md), the measurement contract in
[*PLAN-M5.md*](../../PLAN-M5.md),
[ADR 0013](../adr/0013-m5-edition-and-manifest.md),
[ADR 0016](../adr/0016-dynamic-source-boundary.md),
[ADR 0019](../adr/0019-m5-claim-closure.md), and
[ADR 0020](../adr/0020-m5-applicable-test-inventory.md).


Existing expansion
------------------

The 78-node graph already supplies bounded observation, implementation,
harness, decision, and evidence work. No checked-in gap requires another node
at this snapshot. The original observation plan created 32 nodes; four batches,
02, 04, 07, and 09, have finished their selectors. The other 28 selectors cover
every remaining unreviewed path exactly once. Those batches contain 9,680
review units in sum, each within 3,000 paths and 500 units. The sum counts a
generator used by two batches once in each batch.

The exact selectors are the `selector.prerequisiteSets` and `selector.prefixes`
fields in
[*observation-batches.yaml*](../m5c-closure/observation-batches.yaml). For each
included path absent from the manifest, the planner parses its pinned upstream
source against that file's frozen `basis`. It derives the sorted
prerequisite-node set from frontmatter, harness availability, flags, and
unresolved host reads, then selects the longest matching prefix within that
set. A directory name alone is never an owner or a support judgment.

| Batch | Unreviewed paths | Review units |
| ----- | ---------------: | -----------: |
| 01    |              306 |          306 |
| 03    |              315 |          315 |
| 05    |              387 |          335 |
| 06    |              334 |          242 |
| 08    |              467 |          386 |
| 10    |            2,304 |          303 |
| 11    |            1,199 |          473 |
| 12    |              501 |          469 |
| 13    |              757 |          484 |
| 14    |              359 |          351 |
| 15    |              836 |          456 |
| 16    |              467 |          469 |
| 17    |              287 |          287 |
| 18    |              336 |          336 |
| 19    |              471 |          471 |
| 20    |              430 |          209 |
| 21    |            2,408 |          396 |
| 22    |            1,219 |          494 |
| 23    |              273 |          276 |
| 24    |              794 |          228 |
| 25    |              646 |          500 |
| 26    |            1,029 |          495 |
| 27    |              640 |          464 |
| 28    |              348 |          349 |
| 29    |               89 |           89 |
| 30    |              535 |          213 |
| 31    |               65 |           46 |
| 32    |              246 |          238 |
| Total |           18,048 |        9,680 |

The batch checker reconstructs those selectors from upstream source, rejects an
unknown prerequisite key, checks every required graph dependency, and compares
each path with its ledger owner. Batch nodes may add dependencies beyond the
frozen source-derived sets when observations expose a gap. Batches 01, 03, 05,
06, and 08 already wait for such bounded repairs. Batch 03 waits for Annex B
classification and TypedArray construction order; that dependency does not
authorize excluding its mixed core assertions. Batch 31 waits for import
attributes, and batch 32 for the union of its small prerequisite sets. Landed
realm and dynamic-import accounting prerequisites remain dependencies even
though their capabilities no longer block scheduling.

Parsed unresolved dynamic-source references occur in 998 remaining paths for
`eval` and 176 for `Function`; these counts can overlap. They identify review
work within existing batches. They do not predict an unsupported result or
approve an exclusion. Dynamic-import batches retain the exact diagnostic and
subject-assessment procedure in
[*exclusion-audit.md*](../m5c-closure/exclusion-audit.md).


Reviewed unsupported ownership
------------------------------

The exact source selector for every row below is an entry in
[*ledger.yaml*](../m5c-closure/ledger.yaml) with state
`unsupported-profile-feature` and owner `node:<id>`. The manifest supplies its
observation and dependency tags. Each owner has an existing node record; none
is landed. This table covers all 1,408 remediation-owned unsupported paths
without assigning an owner to an unobserved outcome.

| Node ID                               | Paths |
| ------------------------------------- | ----: |
| `dynamic-source-coverage-remediation` |   178 |
| `eval-intrinsic-value`                |    26 |
| `frontmatter-feature-tags`            |     4 |
| `iterator-helpers`                    |   393 |
| `module-export-forms`                 |    28 |
| `module-top-level-await-patterns`     |     1 |
| `non-blocking-agent`                  |     2 |
| `primitive-wrapper-objects`           |    36 |
| `promise-feature-admission`           |    30 |
| `proper-tail-calls`                   |     2 |
| `regexp-pattern-extensions`           |     5 |
| `regexp-property-escape-harness`      |   453 |
| `regexp-split-coverage-remediation`   |     1 |
| `resizable-array-buffer-harness`      |   168 |
| `test262-host-script-bindings`        |    14 |
| `typed-array-feature-admission`       |    42 |
| `unhandled-rejection-observation`     |    19 |
| `well-known-intrinsics-harness`       |     6 |
| Total                                 | 1,408 |

Three unlanded contracts needed their selectors refreshed after earlier
landings: dynamic-source coverage now owns 178 paths, bare eval owns 26, and
iterator helpers own 393, including the reassigned realm case. The iterator
case still needs source construction after feature admission; its actual
subsequent observation must choose its next owner.

The exclusion audit binds 261 paths to source and observation digests and
reviewed normative assessments: 82 exclusions, 178 dynamic-source coverage
gaps, and one mixed Annex B RegExp split gap. Exactly 154 records still have
`missingDynamicTag: true`, matching the existing retagging contract. Dependency
tags identify prerequisites; they cannot authorize an exclusion. No record or
tag is changed by this audit.

The 178 dynamic-source and one mixed split subject gaps retain their bounded
evidence nodes and pending accounting decisions. ADR 0019's non-source
normative-dependence trigger has not been established merely by an upstream
test's choice of observer. The audit accepts no additional exclusion and keeps
ADR 0016's other reopening triggers in force. Realms, agents, shared memory,
and missing harness facilities remain inside the claim.


Collisions and terminal path
----------------------------

The graph already listed collisions among remediation lanes and among
observation batches, but omitted explicit batch-versus-remediation pairs. The
added manifest groups cover all 930 independent pairs between the 28 active
batches and 34 unlanded manifest-writing remediation nodes named by the
existing collision records. Groups separate ordered prerequisite pairs; for
example, batch 03 and Annex B classification cannot share a collision group,
nor can classification and its TypedArray coverage successor.

Each publication serializes *subset.yaml*, the manifest index and partitions,
*target-parity.yaml*, the derived ledger, batch counts, and graph state. The
graph now names the parity digest and batch plan as serialization points.
Retagging, eval identifier remediation, dynamic-source coverage, and
independent Annex B assessments also have explicit exclusion-audit collision
groups. A collision names a shared edit, not a dependency on another lane's
behavior.

The baseline has 13 landed nodes, 69 ready nodes, nine blocked nodes, and no
parked nodes. All 77 non-exit nodes reach `m5-exit-audit`. Removing the exit
node leaves 49 terminal nodes, all named directly in its dependency list. The
existing validator proves reachability and rejects cycles, stale status,
ordered collision groups, stale evidence counts, and orphan nodes. Its
current-tree test now compares node count with the record directory while
retaining the landed-count floor and independent invalid-graph fixtures.
A separate current-tree test requires every independent unlanded manifest
publisher pair to occur in a declared group. Only the staged-import plan,
this graph audit, and the exit audit are exempt source-only contracts; new
source-only nodes must record their bounded exemption.

This node stays `landed: false` until coordinator CI. Pending batch 10
observations, the proposal-only staged-import plan, and the Annex B
classification lane supply no baseline data to this audit. No subset entry,
manifest record, ledger state, inventory policy, property budget, seed, or
runtime behavior changes. Future observations must add any genuinely missing
bounded owner and place its terminal result on the same exit path.


Reproduction
------------

The following existing commands check the authoritative inputs and ownership;
they do not observe new standards paths:

~~~~ sh
mise run check:m5c-graph
mise run check:m5c-closure-ledger
mise run check:m5c-observation-batches
mise run check:m5c-exclusion-audit
mise run check:compatibility-ratchet
~~~~

Run the ordinary `mise run check` and `mise run test` gates on the final tree.
The cost estimates in the batch plan retain their named historical measurement
from *PLAN-M5C.md* and *docs/gate-cost-baseline.md*. This audit changes no cost
model or gate budget and adds no runtime or generator change requiring an
extended property run.
