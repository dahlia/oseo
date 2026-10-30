Observation batch 18: reviewed admission
========================================

Focused observations on base `68b026bb` selected 336 paths
from the pinned batch selector. Admit 326 paths: 150 pass,
167 expected-negative, and 9 unsupported-profile-feature.
Ten Unicode class tests remain unreviewed after runtime OSEO2001
reported “Maximum active native frame budget exceeded” in the first
non-strict variant with specialization disabled. Root approved admitting
the other 944 train paths and retaining these ten under batch 18;
*unicode-class-native-frame-budget.md* records the bounded prerequisite.
No frame budget, source, or test assertion changes in this train.
The nine eval-rejected line-terminator subjects belong to
`node:dynamic-source-coverage-remediation`. These ownership assignments
add no exclusion or change to ADR 0016.


Evidence
--------

The
[focused observations](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/observations.json)
preserve every classification, strictness/specialization variant, and source
SHA-256. The
[driver result](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/gate/observe-built.json)
records a natural exit 0 after 1,617.5 seconds for all 954 selected paths. The
[admission proof](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/u-preservation.json)
binds the exact base and shows byte preservation of every existing subset row.


Dependency self-audit
---------------------

The
[row audit](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/reviewed-tags.json)
records each admitted source hash, tag witnesses, and rejected candidates. All
944 admitted rows were checked against the approved observation-tag rules
before U.

Tags describe asserted source operations or their prerequisites. The
audit removes candidates whose only sites are diagnostic arguments,
uncalled bodies, or unreached operations, and normal try completion is
not an abrupt-completion witness. Asserted throws and runtime negatives
retain their abrupt-completion tags. Implicit iterator consumers and
object conversions carry their reached symbol/protocol dependencies.
The TypedArray audit distinguishes static methods, construction, and
indexed access, including the explicit makeCtorArg factory variants.

Parse-only negatives retain syntax families of the rejected subject;
no promise-settlement, module-linking, or abrupt-completion runtime tag
is inferred from nested syntax. Generic source tags use the primary
test. No fixture-derived rows are admitted: all four selected import
tests reject during parsing, before any fixture can be evaluated.

The
[candidate analysis](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/source-reach-all.json)
is supporting source analysis, not execution evidence. The actual
classifications come only from the focused runner. Root owns the scoped UPDATE
and its agreement check; candidate CI, landing, and publication remain later
gates.


Scoped UPDATE agreement
-----------------------

Root ran `test262:update:changed --baseline 68b026bb` at U `904bef8c`.
The run finished naturally with exit 0 in 971.25 seconds: 944 selected
paths, 689 pass, 167 expected-negative, 88 unsupported, and zero retries.
It wrote no partitions. These totals cover the full train; the batch
counts above remain separate. The
[raw UPDATE output](/data/m5c-b01-b03-b18-20261029/root-scoped-904bef8c/scoped.stdout)
and [stderr](/data/m5c-b01-b03-b18-20261029/root-scoped-904bef8c/scoped.stderr)
are the execution evidence.

The
[strict agreement proof](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/materialization-proof.json)
compares every admitted record with its focused observation, changing only its
reviewed dependency tags, and preserves every old record. Root accepted the
unchanged result set. The graph snapshot assertions are refreshed for the one
new prerequisite and blocked batch 18. This bookkeeping adds no runtime
evidence; internal review and publication remain separate gates.


First internal correction round
-------------------------------

The first paired internal review completed all four scopes. It found
missing implicit symbol dispatch, TypedArray getter and construction
phase mistakes, uncalled mapper/factory operations, async-only generator
claims, normal try completion, and incidental parser-recovery syntax.
The
[full-row pattern audit](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-1/all-row-pattern-audit.json)
sweeps all 944 admitted rows before this bundled correction. The
[exact delta](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-1/changes.json)
changes 152 rows across the train and 1 rows in this batch, preserving every
classification, source hash, owner, original assertion, and prior Main row. The
[review resolutions](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-1/finding-resolutions.json)
name all 19 blocking finding identities, including duplicate reports of a
pattern.

Core view operations now use AST-bound TypedArray receivers and numeric
keys; ordinary Symbol property writes are not indexed operations.
Selected buffer factories supply no buffer witness when element
conversion throws before allocation. Static method validation and
collection supply no concrete-construction witness when they exit early.
Synchronous generators are distinct from async generators. Primary
Object.prototype.toString, object source conversion, and Promise species
lookups supply the missing symbol witnesses. The lexical correction
removes operator tags recovered from deliberately invalid English prose.

The saved observations remain unchanged. Root verified correction U2
`5627d317` against baseline `6bdf3176` on the remote Linux pool. The
scoped UPDATE finished naturally with exit 0: 152 selected records,
138 pass, one expected-negative, 13 unsupported, and zero retries. It
wrote no partitions and produced an empty diff. The
[raw UPDATE output](/data/m5c-b01-b03-b18-20261029/root-scoped-5627d317/remote-20261029T155848Z-10dafd8b0ab5/stdout)
and
[metadata](/data/m5c-b01-b03-b18-20261029/root-scoped-5627d317/remote-20261029T155848Z-10dafd8b0ab5/meta.json)
bind that result. The
[post-UPDATE agreement proof](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-1/post-update-agreement.json)
compares all 944 admitted records with the original focused evidence, changing
only the reviewed tags. Root accepted the unchanged result set.

The remediation and graph scope passed both initial review stages.
Root accepted its D1.9 carry because all eleven required paths remain
byte-identical, as the
[scope preservation proof](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-1/graph-carry-path-proof.json)
shows. The three affected row scopes receive the next independent pair; this
bookkeeping does not claim candidate CI, landing, or publication.


Third internal correction round
-------------------------------

The third paired review passed batch 03 in both stages. Its four B01
finding identities cover expected-descriptor literals and failure-only
conditional guards. The
[full-row audit](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-3/all-row-pattern-audit.json)
checks the pinned source hashes of all 944 admissions and records each matching
syntax witness and its decision. The
[exact delta](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-3/changes.json)
changes 45 rows across the train and 12 in this batch.

Expected descriptors passed only to verifyProperty are assertion
plumbing; the 30 matching rows lose object-literals. Actual descriptor
objects passed to Object.defineProperty remain prerequisite witnesses.
Fifteen rows lose control-flow because their conditionals only report
or propagate assertion failure, including the analogous B18 identifier
and line-terminator cases. Independent condition operators remain
tagged. Expected runtime-negative comment tests retain their branches
and abrupt-completion contracts. Unsupported asserted contracts remain
intact. Classifications, owners, observations, existing Main rows, and
ADR boundaries do not change. The
[finding resolutions](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-3/finding-resolutions.json)
link every reported identity to this bundled correction.


Fourth internal correction round
--------------------------------

The fourth paired review identified scaffolding loops and an incorrectly
assigned module early-error family. Root clarified that the review cap
counts complete node rounds, including both stages and all scopes, so
the next review is pass 5 of cap 10. The
[full-row audit](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-4/all-row-pattern-audit.json)
checks all 944 source hashes and applies both patterns across the train. The
[exact delta](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-4/changes.json)
changes 10 rows in total and 1 in this batch, preserving classifications,
owners, and observations.

Nine rows lose control-flow from input enumeration, oracle assertions,
or branches that only gate the test body. Independent properties,
operators, protocols, and actual error-producing branches retain their
tags. The duplicate BoundNames ImportDeclaration negative carries
module-linking as its module static-semantics syntax family, as Root
ruled under rule 6. It supplies no runtime linking evidence. The other
three import negatives assert escaped contextual keywords and retain
lexical-grammar. No fixture is evaluated, no exclusion changes, and
all prior Main rows remain unchanged. The
[finding resolutions](/data/m5c-b01-b03-b18-20261029/task_b827cc9b95b8/ctx_3dcead5a3eca/fix-round-4/finding-resolutions.json)
record both review identities and the approved adjudication.
