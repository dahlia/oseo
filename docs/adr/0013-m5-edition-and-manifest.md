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
    harness observation. `harness-failure` records a defect in the test
    adapter or its harness, while `infrastructure-failure` records a host,
    process, toolchain, or temporary-storage failure. The reviewed gate rejects
    any manifest containing either. Every unsupported result
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
progress. This section freezes the accepted schema. The record-partitioning
and infrastructure-classification amendment below replaces the earlier
single-file result layout and `harnessFailed` observation field.

The reviewed subset (*subset.yaml*) pins the suite revision, the supported
feature list, and one entry per sorted unique path holding the expected
classification and reviewed semantic dependency tags. One upstream path is
one manifest row; strictness and specialization variants are recorded
inside the row and never multiply the counted total.

The result index (*results.yaml*) lists each nonempty path-group bucket in
sorted partition-path order, pins the suite revision, and carries the derived
summary:

~~~~ yaml
partitions:
  - group: language/module-code
    key: a3
    path: results/language/module-code/a3.yaml
suiteRevision: <revision>
summary:
  passes: 0
  expectedNegatives: 0
  semanticFailures: 0
  unsupportedProfileFeatures: 0
  harnessFailures: 0
  infrastructureFailures: 0
  groups: []
  dependencies: []
~~~~

Each partition repeats its group, key, and revision around an ordered
`results` array. A record retains the earlier per-case contract, with
`failureKind` replacing the boolean `harnessFailed` field:

~~~~ yaml
group: language/module-code
key: a3
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
      scheduler: deterministic-logical-clock   # module, async; no agent host
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
      failureKind: infrastructure   # optional harness | infrastructure
      unsupportedCapability: <name>   # optional named capability
      detail: <text>                  # optional human-readable evidence
    classification: expected-negative
    unsupportedFeatures: []
suiteRevision: <revision>
~~~~

The deterministic partition group is the same path group used by the summary:
the first two directory segments under *test/*. Within that group, the key is
the first byte of the SHA-256 digest of the upstream path, written as two
lowercase hexadecimal digits. A partition path is exactly
*results/<group>/<key>.yaml*. This bounded hash bucket avoids recreating one
large file for a high-volume group while keeping nearby review changes within
the owning group. The index order, each partition's record order, group, key,
path, revision, and derived summary are validated when read. Regeneration also
removes a partition that no longer has a reviewed path.

`classification` has exactly six values: `pass`, `semantic-failure`,
`expected-negative`, `unsupported-profile-feature`, `harness-failure`, and
`infrastructure-failure`.
`expected-negative` generalizes the earlier `expected-parse-failure`
classification so parse, resolution, and runtime negatives share one
reviewed category with the actual phase recorded. `failureKind` is present
only for a harness or infrastructure failure and must match its classification.
Other optional fields are omitted rather than recorded as null, and every
field above is otherwise required. Extending this schema, including its
dependency-tag vocabulary, is a reviewed change to this record; removing a
field requires a superseding record.

One observation per row is deliberate: the runner rejects any difference
between executed variants as a semantic failure whose recorded detail names
the diverging strictness and specialization combination, so a recorded
observation is proven identical across every listed variant. The `variants`
list is the evidence that each combination executed.

Module-graph identities are recorded relative to the pinned suite root, and
the entry records its upstream test path, so the checked-in manifest never
contains host-specific canonical URLs. The entry's `sourceHash` hashes the
executed input, which includes the assembled harness.

Unsupported, harness, and infrastructure results never increase the pass
count. Summaries keep raw totals, dependency-indexed group totals derived
deterministically
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

*target-parity.yaml* retains *results.yaml* as the named canonical manifest,
but its digest covers the index followed by every partition in index order.
Each UTF-8 path and file body is length-framed before hashing, so no file
boundary or concatenation ambiguity can preserve a stale digest. The index is
therefore the entry point, while parity covers the complete record set.

The M5 core expression work extends the vocabulary with four reviewed
tags: `expression-operators` for scalar operator cases such as `typeof`,
`void`, the remainder operator, logical operators, and the conditional
operator; `control-flow` for statement-level control-flow cases such as
`do-while`; `var-bindings` for `var` declaration and hoisting cases; and
`dynamic-source` for cases that need `eval`, the `Function` constructor,
or dynamic import, as decided by
[ADR 0016](./0016-dynamic-source-boundary.md).

Later M5 semantic units extend the vocabulary with `error-intrinsics` for the
named error family and catchable runtime errors, `symbols` for symbol values
and well-known symbol behavior, and `iterator-protocol` for synchronous
iterator acquisition, stepping, closing, and consumers.
`destructuring-bindings` identifies binding-pattern initialization and
assignment semantics independently from the declaration kind that owns the
bound names. `default-parameters` identifies function parameter
initialization whose fallback expressions and reported function length differ
from a simple parameter list. `rest-parameters` identifies function parameter
initialization that collects the unbound argument suffix into a fresh array.
`generators` identifies synchronous generator functions, their suspension and
resumption behavior, and the generator objects and prototype methods that
drive them.

Seven further tags entered the enforced vocabulary in
*packages/testkit/src/index.ts* with the M5a semantic units that needed them,
and none of those changes amended this record. This amendment adopts them as
reviewed vocabulary without moving any classification: `object-literals`
identifies object literal expressions and their property definition forms;
`classes` identifies class declarations and expressions and the definitions in
a class body; `property-enumeration` identifies the `for-in` statement and the
property enumeration order it observes; `async-iteration` identifies
asynchronous iterator acquisition, stepping, and closing, including the
`for-await-of` statement; `bigint-primitive` identifies exact BigInt values
with their operators and conversions; `array-buffer` identifies the
`ArrayBuffer` intrinsic and its byte storage; and `data-view` identifies the
`DataView` intrinsic and the element access it performs over that storage. A
change that adds a tag to the enforced set amends this record in the same
change, so the enforced set and this record stay in agreement.

The M5b regular expression work extends the vocabulary with
`regular-expressions` for pattern syntax and early errors, the `RegExp`
intrinsic and its prototype, matcher execution and match result construction,
and the well-known symbol methods that dispatch to them. The tag is admitted
before any reviewed row carries it, so admitting it moves no count. Whether
the reviewed RegExp rows that currently carry `functions` or
`object-properties` gain this tag is a separate reviewed change. When they do,
they gain it alongside the tags they already carry rather than exchanging one
for another. The tagging rule above names every operation a case exercises, so
a case that builds a pattern and calls a function exercises both, and dropping
either tag would understate what the row covers.

The M5b `object-own-keys` node entered `object-own-keys` into the enforced
vocabulary in *packages/testkit/src/index.ts* alongside the reviewed rows that
carry it, and that change did not amend this record. This amendment adopts the
tag as reviewed vocabulary without moving any classification. The tag
identifies the realm-owned `Object` statics that read or produce an object's
own properties by key: `keys`, `values`, `entries`, `getOwnPropertyNames`,
`getOwnPropertySymbols`, `assign`, `fromEntries`, `hasOwn`, and `groupBy`.
`keys`, `values`, and `entries` snapshot the own keys, omit symbols, and
recheck each descriptor before reading an enumerable value.
`getOwnPropertyNames` and `getOwnPropertySymbols` filter that same key
ordering without reading values, and `assign` walks each source's own keys and
performs a Get followed by a Set on the target for every enumerable one.
`hasOwn` tests a single own property instead of a list, while `fromEntries`
and `groupBy` run in the other direction and define own properties from
iterated pairs or from callback results converted through `ToPropertyKey`. One
tag covers all nine because the node builds them on the same own-key ordering
and the same own-property representation. The node needs a tag of its own
because `object-properties` names property definition and descriptor semantics
without naming the constructor statics that reach them, and
`property-enumeration` names the `for-in` statement, whose enumeration walks
the prototype chain rather than one object's own keys. The 295 reviewed rows
under the node's inventory roots carry it. Whether reviewed rows outside those
roots that also observe own-key order gain this tag is a separate reviewed
change; when they do, they gain it alongside the tags they already carry.

The M5b `reflect-namespace` node extends the vocabulary with
`reflect-namespace`. The tag identifies the `Reflect` namespace object and the
thirteen function properties that expose one essential internal method each:
`apply`, `construct`, `defineProperty`, `deleteProperty`, `get`,
`getOwnPropertyDescriptor`, `getPrototypeOf`, `has`, `isExtensible`,
`ownKeys`, `preventExtensions`, `set`, and `setPrototypeOf`. One tag covers
all thirteen because each requires an object target and reports the
specification's boolean or its raw internal-method result rather than the
language error the matching `Object` static raises, which is the contract the
node adds. The node needs a tag distinct from `object-properties`, which names
property definition and descriptor semantics without naming the reflective
entry points that reach them, and from `object-own-keys`, which names the
`Object` statics that coerce their target and answer with strings or values
instead of an internal method's own result. The 152 reviewed rows under the
node's inventory root carry it. Whether reviewed rows outside that root that
also call a `Reflect` function gain this tag is a separate reviewed change;
when they do, they gain it alongside the tags they already carry. Admitting
the tag moves no classification.

The M5b `proxy-exotic-object` node extends the vocabulary with
`proxy-exotic-object`. The tag identifies `Proxy`, `Proxy.revocable`, and the
thirteen proxy internal methods whose handler traps interpose on prototype,
extensibility, property, own-key, call, and construction operations. One tag
covers the cluster because revocation and the target invariants apply across
those operations and because the constructor is the only way to create the
exotic object. The tag is distinct from `reflect-namespace`: Reflect exposes
essential internal methods on ordinary targets, while this tag names an
object whose internal methods dispatch to user traps and validate their
answers. The node's inventory root contains 311 included paths. Assigning the
tag to reviewed rows that observe a proxy is a separate reviewed change; when
they gain it, they gain it alongside the tags they already carry. Admitting
the tag moves no classification.

The reviewed dependency vocabulary includes `json-parse` for the M5b
`json-parse` node. The tag identifies the replaceable `JSON` namespace and its
`parse` function, including input conversion, the JSON lexical grammar,
ordinary Array and object construction, and the optional post-order reviver
walk. One tag covers these operations because they form the single parsing
semantic unit admitted by the node. The tag is distinct from `functions`,
which names general call behavior, and `object-properties`, which names
property definition and descriptor semantics rather than JSON text
interpretation and reviver traversal. The 72 reviewed rows under the node's
inventory root carry it. Reviewed rows outside that root that use the `JSON`
namespace as an ordinary object retain their existing tags.

The M5b `set-intrinsic` node extends the vocabulary with `set-intrinsic`. The
tag identifies the `Set` constructor, its insertion-ordered element storage
with SameValueZero lookup, the `add`, `clear`, `delete`, `entries`,
`forEach`, `has`, `keys`, `size`, and `values` members of `%Set.prototype%`,
the `Symbol.species` accessor, and `%SetIteratorPrototype%` with its live
forward cursor. One tag covers the cluster because every member reads or
writes the same element vector and the iterator observes that vector rather
than a snapshot, which is the contract the node adds. The tag is distinct
from `iterator-protocol`, which names the generic protocol a Set iterator
implements without naming the collection it walks, and from
`object-properties`, which names property definition and descriptor
semantics rather than element membership. The 201 reviewed rows under the
node's sixteen inventory roots carry it, and the one reviewed
*test/built-ins/Object/seal/* row whose only unmet prerequisite was `Set`
gains it alongside the tag it already carried. Admitting the tag moves no
classification by itself; the landing moves that row and eleven further
reviewed `Map` and `Symbol` rows that construct a Set to `pass`, and those
eleven retain their existing tags.

The reviewed dependency vocabulary includes `json-stringify` for the M5b
`json-stringify` node. The tag identifies the remaining reviewed `JSON`
namespace surface and the `stringify` function, including `toJSON` dispatch,
function and property-list replacers, gap normalization, recursive Array and
object serialization, and cycle detection. One tag covers these operations
because they form the single serialization semantic unit admitted by the
node. The tag is distinct from `json-parse`, which names text interpretation
and reviver traversal, and from `object-own-keys`, which names the general
own-key primitives rather than JSON's serialization order. The 72 reviewed
rows under the node's inventory roots carry it. Reviewed rows outside those
roots that call `JSON.stringify` retain their existing tags until a separate
reviewed dependency change assigns this tag alongside them.

The M5b `typed-array-constructors` node extends the vocabulary with
`typed-array-constructors`. The tag identifies the abstract `%TypedArray%`
constructor, the eleven concrete Number and BigInt element-type constructors
with their prototype pairs, and construction from a length, a buffer with a
byte offset and an optional length, an iterable, an array-like object, or
another typed array, including the element-kind conversion those paths
perform over the viewed `ArrayBuffer`. One tag covers the cluster because
every constructor produces the same view record and shares the same
construction and conversion semantics, which is the contract the node adds.
The tag is distinct from `array-buffer`, which names the buffer intrinsic
and its byte storage without naming the views that interpret it, and from
`data-view`, which names explicit method-based element access rather than
constructor-driven view creation. The reviewed rows under the node's
inventory root carry it. The twelve reviewed rows outside that root whose
only unmet prerequisite was a concrete TypedArray constructor move to `pass`
and retain their existing tags.

The M5b `typed-array-core` node extends the vocabulary with
`typed-array-core`. The tag identifies the integer-indexed exotic object's
internal methods over canonical numeric keys, the `%TypedArray.prototype%`
`buffer`, `byteLength`, `byteOffset`, `length`, and `Symbol.toStringTag`
getters, and the `at`, `set`, `subarray`, `entries`, `keys`, `values`, and
`Symbol.iterator` methods with the species construction and Array iterator
steps they perform. One tag covers the surface because every member reads the
same view record through the same bounds and conversion rules. The tag is
distinct from `typed-array-constructors`, which names view creation, and from
the later TypedArray method nodes, which add algorithms over this surface. The
reviewed rows under the node's thirteen inventory roots carry it. The
reviewed rows outside those roots whose only unmet prerequisites were this
surface, the reviewed *testTypedArray.js* harness, or the `TypedArray`
feature gate move to `pass` and retain their existing tags.

The M5b `set-composition-methods` node extends the vocabulary with
`set-composition-methods`. The tag identifies the `union`, `intersection`,
`difference`, `symmetricDifference`, `isSubsetOf`, `isSupersetOf`, and
`isDisjointFrom` members of `%Set.prototype%` together with the GetSetRecord
operation they share, including the size-selected `has` or `keys` branch, the
keys iterator they walk and close, and their fresh `%Set.prototype%` results.
One tag covers the seven methods because each consumes the same Set Record
contract over an arbitrary set-like operand, which is the contract the node
adds. The tag is distinct from `set-intrinsic`, which names the constructor,
element storage, and the core membership and iteration members without any
foreign operand, and from `iterator-protocol`, which names the generic
protocol the keys walk uses without naming the Set Record. The 186 reviewed
rows under the node's seven inventory roots carry it, and no reviewed row
outside those roots gains or loses a tag.

The M5b `atomics-single-agent` node extends the vocabulary with
`atomics-single-agent`. The tag identifies the `SharedArrayBuffer`
constructor, its prototype accessors, `grow`, `slice`, and species getter,
and the `Atomics` namespace with its read-modify-write, `load`, `store`,
`compareExchange`, `isLockFree`, `wait`, `waitAsync`, and `notify`
functions, as far as one agent can observe them. One tag covers the surface
because every member reads the same shared Data Block and the same
single-agent WaiterList store. The tag is distinct from `array-buffer`,
which names the unshared buffer and its detachment and resize semantics, and
from the later agent and shared-memory node, which adds the `$262.agent`
harness capability and cross-agent execution that the tagged rows still name
as an unsupported capability. The reviewed rows under the node's two
inventory roots carry it. The reviewed rows outside those roots whose only
unmet prerequisite was the `SharedArrayBuffer` feature gate move to `pass`
and retain their existing tags. Admitting the tag changes no classification
value.

The M5b `typed-array-iterative` node extends the vocabulary with
`typed-array-iterative`. The tag identifies the `every`, `some`, `forEach`,
`map`, `filter`, `reduce`, and `reduceRight` members of
`%TypedArray.prototype%`, including the ValidateTypedArray bounds check, the
snapshotted element traversal, the `TypedArraySpeciesCreate` allocation the
mapping and selecting members perform, and the detach and shrink observations
each member makes while it runs. One tag covers the seven methods because each
walks the same view record and shares the same element, callback, and result
contracts, and the tag is distinct from `typed-array-core`, which names the
prototype surface these algorithms operate over, and from
`typed-array-constructors`, which names view creation. The reviewed rows under
the node's seven inventory roots carry it, and no reviewed row outside those
roots gains or loses a tag.

The M5b `weak-collections` node extends the vocabulary with
`weak-collections`. The tag identifies the `WeakMap`, `WeakSet`, `WeakRef`,
and `FinalizationRegistry` constructors and prototypes, CanBeHeldWeakly,
ephemeron-backed membership, the job-scoped KeptAlive set, and registration,
unregistration, and cleanup-job scheduling. One tag covers the cluster because
every member stores its target through the same collector weak-edge contract
and differs only in which of its ephemeron, weak-reference, or finalization
records it exposes. The tag is distinct from `map-intrinsic` and
`set-intrinsic`, which name strong, ordered, iterable storage, and from
`symbols`, which names symbol values without their weak-key admissibility. The
249 reviewed rows under the node's four inventory roots carry it. The 25
reviewed rows outside those roots whose last unmet prerequisite was a weak
collection move to `pass` and retain their existing tags.

The M5b `typed-array-search-and-join` node extends the vocabulary with
`typed-array-search-and-join`. The tag identifies the `find`, `findIndex`,
`findLast`, `findLastIndex`, `includes`, `indexOf`, `lastIndexOf`, `join`, and
`toLocaleString` members of `%TypedArray.prototype%` and the `toString`
identity that reaches `join`, including the ValidateTypedArray bounds check,
the snapshotted element reads, the fromIndex, separator, and locale
conversions, and the detach and shrink observations those conversions and
predicates make. One tag covers the ten methods because each reads the same
view record through the same snapshot and element contracts and none
allocates a TypedArray result, and the tag is distinct from `typed-array-core`,
which names the prototype surface these algorithms operate over, and from
`typed-array-iterative`, whose members call a callback for every element and
may species-create a result. The reviewed rows under the node's ten inventory
roots carry it, and no reviewed row outside those roots gains or loses a tag.

The M5b `typed-array-mutation` node extends the vocabulary with
`typed-array-mutation`. The tag identifies the `copyWithin`, `fill`,
`reverse`, `slice`, `toReversed`, and `with` members of
`%TypedArray.prototype%`, including the ValidateTypedArray bounds check, the
relative-index clamps `copyWithin`, `fill`, and `slice` apply against the
snapshot length, the revalidation and surviving-length clamp that `fill`
reaches unconditionally and `copyWithin` and `slice` reach only for a
positive count, the negative index `with` resolves and validates instead,
the bit-level byte moves, the species and same-type result construction, and
the detach, shrink, and grow observations those conversions cause. One tag
covers the six methods because each moves or copies elements of one
validated TypedArray view, not because they share an index or revalidation
contract: `reverse` and `toReversed` take no index and convert no argument,
`with` resolves and validates an index rather than clamping it, and only
`fill` revalidates unconditionally. The tag is distinct from
`typed-array-core`, which names the integer-indexed surface they operate over,
from `typed-array-iterative`, whose members call a callback for every element,
and from `typed-array-search-and-join`, whose members allocate no TypedArray
result. The reviewed rows under the node's six inventory roots carry it, and
no reviewed row outside those roots gains or loses a tag.

The M5b `typed-array-sort` node extends the vocabulary with
`typed-array-sort`. The tag identifies the `sort` and `toSorted` members of
`%TypedArray.prototype%`, including comparator validation before receiver
validation, the captured element list, stable numeric default ordering for
Number and BigInt element kinds, comparator result conversion, and the
in-place and same-type-copy writeback contracts. One tag covers both methods
because they share CompareTypedArrayElements and the same stable sorting
algorithm; it does not imply identical allocation or writeback. The tag is
distinct from `array-prototype-sort`, whose default comparator is string
ordering and whose indexed collection preserves holes, and from
`typed-array-mutation`, whose copying methods do not invoke a comparator. The
reviewed rows under the node's two inventory roots carry it, and an already
reviewed row outside those roots may only move to pass when this was its last
unmet prerequisite.

The M5b `atomics-and-shared-memory` node extends the vocabulary with
`atomics-and-shared-memory`. The tag identifies the `$262.agent` harness
capability and the agent cluster behind it, as
[ADR 0026](./0026-agent-clusters-and-shared-memory.md) decides: starting an
agent from an ahead-of-time agent program, broadcasting a Shared Data Block,
reports, sleeps, and monotonic time, and the cross-agent WaiterList that
wakes a blocking waiter of another agent and resolves another agent's
`waitAsync` promise in that agent. One tag covers the capability because
every member reaches the same cluster and turn handoff. The tag is distinct
from `atomics-single-agent`, which names the `SharedArrayBuffer` and
`Atomics` surface one agent observes, and which the tagged rows keep. The
node declares no inventory roots. The 112 reviewed rows that name
`$262.agent` carry the tag, now execute, and all move to `pass`. Admitting
the tag changes no classification value.

The same node narrows when an execution records the `scheduler` field. A
module or asynchronous case built with the native test262 host runs its
agents under the real-clock agent cluster of ADR 0026, whose timers, waits,
and sleeps take monotonic time, so its `execution` omits `scheduler` rather
than claiming `deterministic-logical-clock`. Every other module or
asynchronous execution still records `deterministic-logical-clock`. The
field stays optional with its one value, so the schema and the
classification vocabulary are unchanged.


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
and [ADR 0020](./0020-m5-applicable-test-inventory.md) maps the pinned corpus
to a separate complete applicable-test inventory. The partitioned schema and
the `infrastructure-failure` classification landed as one breaking manifest
change, so no checked-in manifest mixes the old and new vocabularies.


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
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) defines the reviewed
    edition-mapping rule and the separate denominator artifact.
 -  [ADR 0009](./0009-module-identity-and-linking.md) through
    [ADR 0012](./0012-native-event-loop.md) define the M4 semantics the
    first expanded measurements observe.
