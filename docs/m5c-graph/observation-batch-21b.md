Observation batch 21b: complete admission
=========================================

The focused observations on base 8f4202628356e172e1b4093a371d086070619de3 admit
all 640 original paths selected by this batch: 592 pass, 48 expected-negative,
and 0 unsupported-profile-feature. No semantic-failure row is admitted. The
batch remains unlanded; Root owns UPDATE, the outer gate, and publication.

Evidence is saved under */data/m5c-d17-20261031/train-a/*:
*input.json* binds the base tree, pinned suite, exact selected paths, and
harness hashes; *observations.json* retains every focused runner result;
_request-\*.json_ and _execution-\*.json_ retain executor inputs and outputs.
*reviewed-tag-evidence.json* records source hashes, source-level tag
witnesses, and corrections from the full-row self-audit.


Dependency self-audit
---------------------

Every original row was checked against the consolidated rules and all
2026-10-30 clarifications. Tags describe asserted subjects and their
prerequisites. Failure messages, failure-only throws, helper internals,
expected descriptors passed only to verifyProperty, test-body gates, and
driver loops supply no coverage. Branches that change an asserted iterator
result retain control-flow. Normally completing try/catch wrappers do not
supply abrupt-completion; asserted errors and rejections do.

Parse-only negatives carry grammar families of the rejected subject,
with runtime tags suppressed. Executed array patterns carry the implicit
iterator and Symbol dispatch prerequisites; a nested null array binding
that fails before iterator acquisition supplies no Symbol witness.
Async generator syntax, Promise reaction chains, object rest enumeration,
and top-level await are audited separately. No imported fixture contributes
incidental tags; this cohort uses no imported fixture modules.

Existing subset rows retain their classifications, owners, and tags. The
canonical serializer materializes the admitted observations and regenerates
the index and target parity. The owner, audit, batch, and graph tools
validate the derived records. No property test file is added.

All original paths pass or are phase/type-correct expected negatives. No
unsupported owner or new remediation node is needed for this batch.


Internal review corrections
---------------------------

Internal reviews prompted syntax and reachability audits of all 1,768
train rows. ADR 0013 reserves generators for synchronous generators:
548 rows in this batch have no executed or asserted synchronous witness.
The other 92 retain that tag. Async iteration and async-function
prerequisites remain recorded.

The syntax audit is *sync-generator-full-row-audit.json*; the executed
witness follow-up is *sync-generator-reachability-followup.json* beside
the focused evidence. Every train row was also checked for the other
review patterns in *known-pattern-full-row-audit.json*.


Round two reachability audit
----------------------------

A full-train audit removes expression-operators from 12 destructuring
rows whose sole increment cannot execute: either parameter initialization
throws before a later default initializer, or an iterator throws before
a following counter update. The zero-counter assertions confirm that
those operations are skipped. Other rows with executed body counters
retain expression-operators.

A reachability follow-up also removes generators from eight rows whose
sole synchronous generator helper is in a skipped default initializer.
The final batch has 92 rows with synchronous-generator witnesses; the
other 548 have none. Details are in
*sync-generator-reachability-followup.json*.

The records are *round-2-full-row-pattern-audit.json* and
*zero-asserted-operator-ast-audit.json* beside the focused evidence.
Classifications, owners, observations, and landed flags are unchanged.
