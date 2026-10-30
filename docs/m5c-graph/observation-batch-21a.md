Observation batch 21a: complete admission
=========================================

The focused observations on base 8f4202628356e172e1b4093a371d086070619de3 admit
all 488 original paths selected by this batch: 388 pass, 95 expected-negative,
and 5 unsupported-profile-feature. No semantic-failure row is admitted. The
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


Unsupported ownership
---------------------

The four OSEO1001 unknown-eval observations have source and normalized
observation digests in *docs/m5c-closure/exclusion-audit.yaml*. The parameter
var collision in eval source and break target rejected in eval source use
the existing eval-semantics assessment under ADR 0016. Their originals are
*async-function/eval-var-scope-syntax-err.js* and *break/S12.8\_A7.js*.

The async function and class declaration completion-value probes stay with
node:dynamic-source-coverage-remediation under completion-observation.
Their rejected eval calls expose ordinary Completion Records, which remain
in-claim. Their originals are *async-function/cptn-decl.js* and
*class/cptn-decl.js*. All four are below *test/language/statements/*.

The fifth unsupported path,
*test/language/statements/async-function/evaluation-body.js*, belongs to
node:unhandled-rejection-observation. It asserts immediate body execution
and constructs a Promise without an executor, triggering the existing
unhandled-rejection-policy capability. No new remediation node or
exclusion boundary is introduced; ADR 0013, 0016, and 0019 are unchanged.


Internal review corrections
---------------------------

The first internal round prompted another audit of all 1,768 train rows.
ADR 0013 reserves generators for synchronous generators: 199 async-only
rows in this batch lose that tag, while 19 synchronous witnesses retain it.
Reserved-word negatives retain their class and async-method grammar;
incidental void expressions supply no expression-operators coverage.

The audit adds asserted rejection completions, implicit Symbol lookup for
generator-object property keys, and restricted-production line terminators.
It removes unreachable descriptor literals, an inherited failure-trap
setter, and a constructor guard that only gates repeated test probes.
The guard is executed by both positive and negative constructor calls;
its removal is based on test-body gating, not an unreachable-branch claim.
Iterator helpers that change asserted protocol results retain control-flow.

The complete pattern audit is *known-pattern-full-row-audit.json* beside
the focused evidence. It also covers batch 21b's async-only wrappers and
confirms all 640 batch 21c rows have synchronous-generator witnesses.
Classifications, owners, source observations, and landed flags are unchanged.


Round two reachability audit
----------------------------

A second full-train audit removes expression-operators from 15 rows whose
parameter initialization aborts before their body counter can execute.
It also removes iterator-protocol from 72 async-only cases. ADR 0013
assigns asynchronous acquisition and stepping to async-iteration;
failure-trap Symbol.iterator getters supply no synchronous coverage.
Synchronous fallback cases and executed iterable spreads retain their
tags, and async Symbol dispatch retains symbols.

The audit covers all 1,768 train rows. Its records are
*round-2-full-row-pattern-audit.json* and
*zero-asserted-operator-ast-audit.json* beside the focused evidence.
Executed counters, logical-assignment subjects with zero results, and
helpers that change asserted protocol results remain tagged.
