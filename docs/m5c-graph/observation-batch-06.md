Observation batch 06 admission preparation
==========================================

Scope and observations
----------------------

This train admits 332 of the 334 originals selected by
`observation-batch-06`, covering *test/language/eval-code/* and
_test/language/export/escaped-\*_. The observation used the original planning
basis and prerequisites: 242 review units. All source hashes and 100
generator-file hashes match the preserved preparation and the pinned suite
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`. No existing subset row,
classification, owner or dependency tag changes.

| Classification              | Paths |
| --------------------------- | ----: |
| Pass                        |     2 |
| Expected negative           |     3 |
| Unsupported profile feature |   327 |

The complete train's focused observation executed on clean
`68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`, tree
`6e4f884ea4c5f31e8094457b4ae0f9eb23c1d0a9`, targeting
`linux-x86_64-gnu`. The current `executeTest262Case` composition kept
the pinned native toolchain, reviewed harness assembly, fragment executor
and emitter, both specialization policies and each original strictness
variant. Its FIFO variant gate and single resource-exhaustion retry rule
match the runner; actual retries were zero. It completed naturally with
exit 0 in 623.37 seconds, with no semantic, harness or infrastructure
failure. These are fresh observations, not results reused from October 24.

Root authorized the focused observation outside the heavy lock after a
single PID wait and lock retry, with at most four parallel cases. This
run used one case at a time, the pinned variant gate, its own Zig cache
and a private temporary directory. Root owns subsequent UPDATE and
full-gate scheduling. The exact bindings and raw results are under
*/data/m5c-train-b06-b08-b14-20261029/task\_816c5a04798f/ctx\_6f53d3a87142/*:
*observer.mjs*, *focused-run.json*, *observation-report.json* and
*observed/observations.json*, with one *case-N-result.json* per original
and raw request, result, stdout and stderr files.


Held diagnostic portability prerequisite
----------------------------------------

Root holds *test/language/eval-code/indirect/export.js* and
*test/language/eval-code/indirect/import.js* unreviewed under this batch.
Their actual focused runtime rejections embed an absolute file URL under
this host's aube cache. Both raw results remain preserved, but neither is
admitted to the subset, manifest or exclusion audit. The focused batch
therefore observed 329 unsupported results; 327 are admitted here.

The new `test262-diagnostic-host-path-normalization` node depends on
`unsupported-ownership-audit` and is listed in `m5-exit-audit`. This batch
waits for that unlanded prerequisite and keeps its two-path selector.
It requires portable suite-relative diagnostic identifiers and a fresh
observation of both originals without altering rejection content or the
ADR boundaries. The entire train's result fields were scanned for
`file://`, `/home/`, `/tmp/` and `.cache`; these were the only two affected
records, and the remaining 1,153 records had zero hits.
[*absolute-host-path-audit.json*](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/absolute-host-path-audit.json)
retains both exact diagnostics and the scan scope. This is a partial B06
admission, not completion or landed status for the batch.


Unsupported ownership
---------------------

Root approved the train's exact 339-path extension of the existing source
coverage umbrella, preserving its previous 547 owners for a combined 886.
For this batch, 325 paths remain under
`node:dynamic-source-coverage-remediation`. The two direct non-String identity
paths use `node:direct-eval-non-string-dispatch`. Fresh
source/observation-bound audit rows retain the umbrella paths as active
remediation. ADR 0013, ADR 0016 and ADR 0019, including their authorization and
reopening text, remain unchanged.

The 54 admitted runtime String-eval rejections and 271 unknown-eval binding
rejections remain active source-contract remediation. The original source
subjects, including completion values and ordinary scope/property
assertions, remain in-claim pending the owning node's per-path review.
No new whole-path exclusion is authorized.

The exact two non-String paths are
*test/language/eval-code/direct/non-string-object.js* and
*test/language/eval-code/direct/non-string-primitive.js*. Both reject with
`OSEO1001` unknown-eval binding diagnostics; their indirect siblings pass.
They pass non-String values and assert the same values are returned. Their
source-compilation tag stays absent, and the new bounded node depends on
`unsupported-ownership-audit` and remains unlanded.

Root clarified that the three escaped export keyword parse negatives keep
`module-linking` solely for the asserted export-declaration grammar. They
claim no module evaluation coverage. `lexical-grammar` stays withheld
under ADR 0013; its vocabulary is not broadened.


Dependency self-audit
---------------------

All 334 rows were checked against Root's eight consolidated tag
rules before U; 57 proposed rows differ from the earlier source
preparation. The complete per-row reasons and source identities are in
[*tag-audit-first-pass.json*](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/tag-audit-first-pass.json).
The rule corrections are: add 56 symbols; add 7 object-properties; remove 1
abrupt-completion.

Tags name original asserted contracts and their required evaluation,
including implicit Symbol and iterator dispatch. Failure-only
`Test262Error` throws and assertion diagnostic strings do not supply
tags. A normally completing `try` alone supplies no abrupt-completion
evidence; specific thrown-error assertions and required rejection
propagation do. Every parse-only negative carries grammar families of
its directly rejected subject. Generic grammar/runtime tags come from
the primary source and relevant includes, excluding helper internals.
Fixture modules propagate only asserted or prerequisite semantics; this
cohort's observed module graphs have no fixture-module dependencies, so
fixture-derived rows are zero. Non-String eval identity is not source
compilation. Static scans are audit inputs, never observations or clean
review verdicts.


Verification and publication
----------------------------

Root authorized canonical bootstrap records from the completed focused
observations so U can satisfy the normal compatibility-ratchet hook.
The manifest serializer preserves all 31,310 existing records and adds
exactly the train's 1,153 admitted records, with final audited dependency
metadata. The ledger, source-bound audit and batch plan are derived from
those records. This bootstrap is not a scoped UPDATE or a new execution.

Root's scoped UPDATE ran at U
`c3adf3a6266d1d899a60bb45e9e6313f0ba6dd40`, against baseline
`68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`, outside the heavy lock under
Root's scheduling decision with `MISE_JOBS=2`. It completed naturally
with exit 0 in 224.62 seconds, selected 1,153 of 32,463 paths, and recorded
711 passes, 101 expected negatives and 341 unsupported results, with
`pool=8 retries=0` and zero partition writes. These are train-wide counts.
Every selected result strictly agrees with the focused observation after
attaching its final audited dependency metadata; all 32,463 manifest
records and every canonical file hash remain unchanged. Root accepted
R = U. The raw
[*scoped.stdout*](/data/m5c-train-b06-b08-b14-20261029/root-scoped-c3adf3a6/scoped.stdout)
and
[*scoped.stderr*](/data/m5c-train-b06-b08-b14-20261029/root-scoped-c3adf3a6/scoped.stderr)
retain the execution result.

Precheck and internal review use the following fixed graph/test target.
This preparation marks no batch or remediation node landed. Root owns
the outer gate, merge, push and publication. The two B06 diagnostic
portability subjects remain unreviewed pending their bounded prerequisite.


Internal review round 1 corrections
-----------------------------------

All seven train scopes completed both adapter v2x stages at
`a70acc71099dba55f188d3b62e4abf30919bcbea`: OpenCode DeepSeek followed by Codex
Astra at standard speed. Astra reported six blocking tag patterns across the
direct-eval, indirect-eval and destructuring scopes. The remaining scopes were
clean; this is a round history, not a final clean verdict for the corrected
tree. Raw reviews and all attempt metadata are under
[the raw review directory](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/internal-round1/).

Before this correction, all 1,153 admitted train rows were audited again against
the eight rules, with matching source identities. For this batch, all 332
admitted rows were included and 24 rows change: add 17 expression-operators; add
1 symbols; add 3 error-intrinsics; add 4 object-literals; add 1
abrupt-completion. The per-row audit and source-bound decisions are in
[the full-row audit](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/round1-full-row-self-audit.json).
Classification, ownership and actual observations are unchanged.

Root confirmed that an object literal used only as the expected descriptor
argument of `verifyProperty` is harness plumbing. Such a literal supplies no
`object-literals` tag, including the six direct/indirect eval expected
descriptors and ten assignment name-assertion descriptors. Actual
`Object.defineProperty` descriptor literals that establish the tested property
state remain prerequisites and carry that tag. The full pattern audit covers all
72 descriptor-call candidates.

The audit also covers eight `with` candidates, 41 eval/comparison candidates,
all three runtime-negative frontmatters and 15 tagged `thrower` candidates.
Original supplied eval comparisons and assignments that determine the assertion
are distinguished from outer assertion plumbing; runtime-negative SyntaxError
metadata supplies an asserted error contract. Only reached property hits in a
`with` environment require its implicit Symbol lookup. The unused thrower in
normal iterator exhaustion supplies no abrupt-completion claim. Parse-only and
fixture boundaries remain unchanged.

Root authorized the corrected U to use the reviewed target above as the scoped
UPDATE baseline, preserving the existing graph/test ancestry with no rebase or
side branch. The correction still requires that UPDATE, strict agreement,
precheck and review closure before worker completion.


Internal review round 2 correction
----------------------------------

The combined B06 scope completed both stages at
`189eb4dab170845328b8513743b35eb61b6e4fc5`. DeepSeek was clean; Astra
found one missing operator tag in
*test/language/eval-code/direct/var-env-var-strict-caller-2.js*. Its
original `assert.throws` callback executes `x = 9` in strict mode and
requires ReferenceError. The assignment is the asserted operation
proving the eval binding did not leak, rather than a helper value
snapshot. It gains `expression-operators`; its unsupported observation
and owner remain unchanged.

All 1,153 admitted train rows were audited again, with matching source
identities. All 22 remaining B06 missing-operator candidates were read
in full: outer failure comparisons and result/error snapshots remain
harness plumbing; only the strict unresolvable assignment needed a
tag. B08 and B14 rows and metadata are unchanged from their completed
round 2 reviews. The source-bound audit is
[the round 2 full-row audit](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/round2-full-row-self-audit.json).

The round 2 UPDATE and reviews remain raw historical evidence; this
correction requires its own Root-owned UPDATE and review closure.


Internal review round 3 and clarified scaffolding
-------------------------------------------------

Both B06 reviewers completed pass 3 at
`de688108ae02b19eff05c50b75500db43f7b2d36` and reported the same
assertion-guard control-flow issue. Root's consolidated rules gained
explicit scaffolding clarifications on October 30 while the train was
under review. The resulting pattern audit covers all 1,153 admitted
rows and reconciles all 315 rows that carried `control-flow`.

The single correction removes `control-flow` from 280 rows across the
train and retains it on 35 genuine statement/prerequisite subjects.
For this batch, 25 of 332 rows change. Expected-error
collection catches, failure-only nested guards, availability gates,
input-enumeration loops and an expected-value oracle are scaffolding.
Root confirmed that the lone oracle-only `functions` claim in
*test/language/expressions/modulus/S11.5.3\_A4\_T7.js* also goes; no other
tag-family audit was widened. The preliminary count of 281 control
removals double-counted one gate that was also an assertion guard;
the disjoint final count is 280.

Actual catch-environment and rejected for-grammar subjects retain
their tags. So do supplied `if(false)` completion subjects and the two
iterator counter branches that deliberately produce an error observed
by `assert.throws`. Asserted operators, conversions, property behavior
and iterator protocols remain tagged, including the property-name
enumeration needed to check that descriptors gain no extra attributes.
Classification, owner, raw observation, fixture and ADR boundaries are
unchanged. The complete per-row decisions and Root policy snapshot are
[the round 3 full-row audit](/data/m5c-train-b06-b08-b14-20261029/task_816c5a04798f/ctx_6f53d3a87142/round3-full-row-self-audit.json)
and its linked control-flow decision table. All batch row/metadata scopes
require review again after this correction; the earlier B08/B14 carry is
historical evidence for the preceding target.


Outer review: evaluated source prerequisites
--------------------------------------------

The follow-up audit at R5 (`449842a9`) checked all 332 admitted rows
in this batch and all 1,153 admitted rows across B06/B08/B14. Source
hashes match the preceding audit. The audit traced eval and Function
source arguments, including nested source strings, and distinguished
constructed subject prerequisites from assertion messages, non-String
identity probes and rejected grammar. Both held B06 sources were also
inspected and remain unreviewed.

Only B06-ROWS-001 changes a row: indirect *always-non-strict.js* gains
`object-literals` because its evaluated `with ({}) {}` constructs the
object required by the asserted strictness probe. Empty blocks in
completion tests construct no objects. Other supplied declarations,
operators and classes already have their applicable tags. No other tag
family, classification, owner or raw observation changes. B06's deliver
text now states partial observation: 332 admitted and two held from the
334-path cohort.

The full audit and candidate dispositions are recorded in
[the outer-fix audit](/data/m5c-train-b06-b08-b14-20261029/task_327a4df2e5ee/ctx_3d3c7fa767fb/full-row-audit.json).
Root owns the scoped UPDATE and the second outer review pass.


Portable diagnostic implementation
----------------------------------

The bounded prerequisite now has an implementation work note at
[*test262-diagnostic-host-path-normalization.md*](./test262-diagnostic-host-path-normalization.md).
It maps runtime diagnostic locations through the prepared module graph's
portable identities while preserving rejection and execution evidence. Both
original B06 paths remain held and unreviewed pending the focused checks,
internal review and Root's D3/UPDATE decision recorded there.
