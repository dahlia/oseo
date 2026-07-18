ADR 0013: M5 candidate edition and compatibility manifest
=========================================================

Status
------

Accepted. This record freezes the first M5 checkpoint required by
[*PLAN-M5.md*](../../PLAN-M5.md): the candidate ECMA-262 edition, the
optional-section policy, and the compatibility manifest schema that measures
every later M5 change.


Context
-------

M4 finished with a documented language subset and a reviewed test262 manifest
scoped to synchronous Script cases. M5 grows that subset toward a conformance
claim, but a percentage is meaningless until the project names the edition
being claimed, states which optional and adjacent specifications are inside
the claim, and fixes the record format that later coverage reports must keep
comparable. Without this record, every new test batch would silently redefine
the denominator.


Required contract
-----------------

Later M5 checkpoints need:

 -  one named ECMA-262 edition whose normative clauses define the eventual
    claim;
 -  an explicit classification for Annex B, ECMA-402, host hooks, realms,
    agents, and shared memory rather than silent inclusion or omission;
 -  a manifest schema that records enough per-case metadata to reproduce and
    audit each observation; and
 -  classification rules that can never fold unsupported or infrastructure
    results into the pass count.


Decision
--------

### Candidate edition

The M5 conformance candidate is the ECMA-262 16th edition, ECMAScript 2025.
A newer edition exists, but the candidate stays at the 16th edition because
the reviewed feature classifications below were made against its clause set.
Moving the claim to a later edition is a reviewed boundary change to this
record and to the compatibility manifest, never an automatic update.

The pinned test262 revision remains
`f2d1435644797268dca1f7988cad5a4e89ccd8d2` until a reviewed manifest change
adopts a newer revision. Substantiating the final claim is expected to require
a newer pin that covers the complete 16th-edition surface; adopting one
re-reviews every affected classification in the same change.

### Optional-section and adjacent-specification policy

 -  Annex B legacy web semantics are excluded from the claim. ECMA-262 makes
    Annex B normative only for web browsers. Oseo targets server workloads,
    so the *annexB/* test262 directory is outside the boundary and Annex B
    behavior is reported as unsupported when a test inside the boundary
    depends on it.
 -  ECMA-402 is excluded. The `Intl` object is not part of the claim, and the
    *intl402/* test262 directory is outside the boundary. The 16th edition's
    own locale-sensitive fallbacks, such as the `toLocaleString` defaults,
    remain inside the boundary; every implementation-defined choice they
    permit is recorded in the M5 language profile when the affected built-in
    lands.
 -  The *staging/* and *sm/* test262 directories are not conformance
    evidence and never enter the manifest.
 -  Host hooks stay inside the boundary. Each implemented hook documents its
    host-defined choice in the M5 language profile; an unimplemented hook is
    an explicit gap, not an exclusion.
 -  Realm creation beyond the initial realm, agent clusters, and shared
    memory are inside the 16th edition and therefore inside the claim.
    Tests that require the optional `$262.createRealm` or `$262.agent`
    harness capabilities are classified as unsupported with the missing
    capability named until the runtime and harness can observe them. They
    are never counted as passes and never silently dropped. The named
    capability distinguishes a missing language feature from a missing
    harness observation; the `harness-failure` classification stays
    reserved for faults during an attempted execution, because the reviewed
    gate rejects any manifest containing one. Every unsupported result
    inside the claim boundary, including one caused only by a missing
    observation capability, blocks the conformance label until it is
    resolved.
 -  `eval`, the `Function` constructor, and dynamic import remain inside the
    boundary. Each needs the ahead-of-time architecture decision required by
    [*PLAN-M5.md*](../../PLAN-M5.md) before support lands. Until then they
    are explicit unsupported results, and the conformance label stays
    unused.

### Compatibility manifest schema

The checked-in manifest under *tests/test262/* is the source of truth for M5
progress. This section freezes the accepted schema; the runner and manifest
migration land in the M5 measurement changes that follow this record, and
until they land the checked-in files keep the M3-era shape.

The reviewed subset (*subset.yaml*) pins the suite revision, the supported
feature list, and one entry per sorted unique path holding the expected
classification and reviewed semantic dependency tags. One upstream path is
one manifest row; strictness and specialization variants are recorded
inside the row and never multiply the counted total. The result manifest
(*results.yaml*) is shaped as:

~~~~ yaml
suiteRevision: <revision>
results:
  - case:
      path: test/language/module-code/example.js
      suiteRevision: <revision>
      features: [top-level-await]
      flags: [module, async]
      includes: [compareArray.js]
      strictness: [strict]
      mode: module        # script | module
      async: true         # asynchronous completion marker required
      expectedFailurePhase: resolution   # optional requested phase
      expectedErrorType: SyntaxError     # optional requested type
    dependencies: [module-linking, top-level-await]
    execution:            # omitted when nothing executed
      harnessIncludes: [base.js, doneprintHandle.js, compareArray.js]
      target: linux-x86_64-gnu
      scheduler: deterministic-logical-clock   # module and async cases
      variants:           # every executed combination, in order
        - { strictness: strict, specialization: disabled }
        - { strictness: strict, specialization: enabled }
      moduleGraph:        # module cases: linked identity and edges
        - id: test/language/module-code/example.js
          dependencies: [test/language/module-code/example_FIXTURE.js]
          sourceHash: <hash>
    observation:
      passed: false
      failedPhase: resolution   # actual phase when a failure occurred
      errorType: SyntaxError    # observed type when observable
      harnessFailed: false
      unsupportedCapability: <name>   # optional named capability
      detail: <text>                  # optional human-readable evidence
    classification: expected-negative
    unsupportedFeatures: []
summary:
  passes: 0
  expectedNegatives: 0
  semanticFailures: 0
  unsupportedProfileFeatures: 0
  harnessFailures: 0
  groups:
    - group: language/module-code
      passes: 0
      expectedNegatives: 0
      semanticFailures: 0
      unsupportedProfileFeatures: 0
      harnessFailures: 0
  dependencies:
    - dependency: top-level-await
      passes: 0
      expectedNegatives: 0
      semanticFailures: 0
      unsupportedProfileFeatures: 0
      harnessFailures: 0
~~~~

`classification` has exactly five values: `pass`, `semantic-failure`,
`expected-negative`, `unsupported-profile-feature`, and `harness-failure`.
`expected-negative` generalizes the earlier `expected-parse-failure`
classification so parse, resolution, and runtime negatives share one
reviewed category with the actual phase recorded. Optional fields are
omitted rather than recorded as null, and every field above is otherwise
required. Extending this schema, including its dependency-tag vocabulary,
is a reviewed change to this record; removing a field requires a
superseding record.

One observation per row is deliberate: the runner rejects any difference
between executed variants as a semantic failure whose recorded detail names
the diverging strictness and specialization combination, so a recorded
observation is proven identical across every listed variant. The `variants`
list is the evidence that each combination executed.

Module-graph identities are recorded relative to the pinned suite root, and
the entry records its upstream test path, so the checked-in manifest never
contains host-specific canonical URLs. The entry's `sourceHash` hashes the
executed input, which includes the assembled harness.

Unsupported and harness results never increase the pass count. Summaries
keep raw totals, dependency-indexed group totals derived deterministically
from the upstream path (a group is the first two directory segments under
*test/*), and totals per reviewed dependency tag. Path groups are a
navigation view; the `mode` and `async` fields index module and
asynchronous behavior directly, and the reviewed `dependencies` tags name
the syntax families, abstract operations, intrinsics, and built-in objects
a case exercises, because a path alone cannot name those dependencies.
Every reviewed entry carries at least one tag. The complete initial
vocabulary is `abrupt-completion`, `async-functions`, `functions`,
`lexical-bindings`, `module-linking`, `object-properties`,
`promise-settlement`, `timers`, and `top-level-await`; any other value is
a validation error until a reviewed change to this record admits it.

The M5 core expression work extends the vocabulary with three reviewed
tags: `expression-operators` for scalar operator cases such as `typeof`,
`void`, the remainder operator, logical operators, and the conditional
operator; `control-flow` for statement-level control-flow cases such as
`do-while`; and `dynamic-source` for cases that need `eval`, the
`Function` constructor, or dynamic import, as decided by
[ADR 0016](./0016-dynamic-source-boundary.md).


Alternatives considered
-----------------------

 -  Claiming the newest edition immediately was rejected: its clause set was
    not the review basis for the current classifications, and chasing a
    moving target would make intermediate percentages incomparable.
 -  Including Annex B was rejected because Oseo is not a web browser and the
    16th edition does not require it for other hosts.
 -  A minimal manifest recording only path and pass or fail was rejected
    because it cannot prove which variant, target, or policy produced an
    observation, which the measurement contract in
    [*PLAN-M5.md*](../../PLAN-M5.md) requires.
 -  Postponing the decision was rejected because every subsequent M5 batch
    would create records in an unfixed format and need migration.


Probe evidence
--------------

The M3 and M4 manifest at revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2` reproduces through
`mise run test:test262` and regenerates through `mise run test262:update`.
The M4 language profile in
[*language-profile-m4.md*](../language-profile-m4.md) defines the semantics
the first M5 measurements observe.


Consequences
------------

The M5 language profile document names the claim boundary and tracks each
group's status against it. Coverage reports become comparable across M5
checkpoints because the boundary definition, counting rule, and record
format are fixed; the reviewed subset still grows checkpoint by checkpoint,
and the complete applicable-test inventory for the claim is checked in
before the conformance label is used. Renaming the classification is a
breaking manifest change and lands together with the schema expansion so
the manifest never mixes vocabularies.


Failure modes and replacement triggers
--------------------------------------

 -  Adopting the 17th or a later edition replaces the candidate-edition
    section of this record in a reviewed change.
 -  Evidence that a claimed-excluded section is required by a dependency
    inside the boundary reopens the optional-section policy.
 -  A manifest field that proves insufficient to reproduce an observation
    extends the schema in a reviewed change; removing a field requires a
    superseding record.


Links
-----

 -  [*PLAN-M5.md*](../../PLAN-M5.md) defines the measurement contract this
    record freezes.
 -  [*language-profile-m5.md*](../language-profile-m5.md) tracks the profile
    against this boundary.
 -  [ADR 0009](./0009-module-identity-and-linking.md) through
    [ADR 0012](./0012-native-event-loop.md) define the M4 semantics the
    first expanded measurements observe.
