ADR 0027: Realms beyond the initial realm
=========================================

Status
------

Accepted for M5c node `cross-realm-host`. The coordinator reserved this
record's number, runtime ABI `m5-127`, and property seed block `0x60008300`
through `0x600083ff` for this node.

This is a design record. It authorizes no M5 exclusion and keeps the claim
boundary of [ADR 0013](./0013-m5-edition-and-manifest.md): realm creation
beyond the initial realm stays inside the claim, and every path this record
leaves unsupported keeps a remediation owner or the authorization of an
existing accepted record.


Context
-------

ADR 0013 keeps realm creation beyond the initial realm inside the M5 claim
and classifies a case that needs the optional `$262.createRealm` harness
capability as unsupported until the runtime and harness can observe it. The
`unsupported-ownership-audit` node assigned the 84 reviewed paths whose
unadmitted frontmatter feature is `cross-realm` to this node.

Until this record, `OseoContext` fused one agent's heap, collector, job
queues, and agent state with its only realm: the intrinsic table, the
global object, the literal caches, and the Math.random state lived directly
in the context, about 280 runtime sites indexed the intrinsic table through
it, and GetFunctionRealm was documented as having one possible answer.
Creating a second realm in the same agent therefore needs a decision about
where realm state lives, which realm a function belongs to, when the running
realm changes, how a created realm is collected, and how a test262 case
reaches the capability.

Two constraints shape the decision. First, a created realm must share the
agent's heap: test262's realm cases pass objects between realms and compare
identities, which separate heaps cannot express. Second, [ADR
0016](./0016-dynamic-source-boundary.md) keeps every form that compiles
source text at run time outside the profile. A created realm therefore never
evaluates Script source of its own, and the upstream cases that build their
cross-realm functions with `other.eval(...)` or `new other.Function(...)`
reach that boundary instead.


Required contract
-----------------

 -  A program built for the test262 host has a `$262` global whose
    `createRealm` creates a realm and returns that realm's own host object,
    and whose `global` is the realm's global object. An ordinary program has
    no `$262` binding.
 -  Each realm owns its intrinsic graph, its global object with every
    standard global this profile installs, its template and regular
    expression literal caches, and its Math.random state. All realms of one
    agent share the heap, the collector, the job queues, the well-known
    symbols, and the GlobalSymbolRegistry, as ECMA-262 shares them.
 -  Every function records its [[Realm]], and calling a function makes that
    realm the running realm until the call returns or throws.
    GetFunctionRealm, GetPrototypeFromConstructor, ArraySpeciesCreate, and
    the realm of each promise job follow the specification.
 -  A created realm that nothing reaches is collected with its intrinsics.
 -  No source text is compiled at run time.


Alternatives considered
-----------------------

Postponing kept the 84 reviewed paths unsupported with no owner, which ADR
0019 does not permit for a behavior inside the claim.

A realm as a separate `OseoContext` would reuse the agent machinery of [ADR
0026](./0026-agent-clusters-and-shared-memory.md), but every context owns
its heap, so an object could not cross realms. Sharing one heap between
contexts would need a second owner for every collection decision.

Swapping the intrinsic table's contents in place on every realm change
would leave the 280 indexing sites untouched, but it copies the table on
each cross-realm call and makes any pointer into the table stale across a
nested switch. A pointer to the running realm costs one indirection and has
neither problem.

Compiling the program once more for each created realm would let created
realms run user code, but a created realm has no source of its own in any
reviewed case: upstream cases supply it through `eval`, `Function`, or
`$262.evalScript`, all of which are dynamic source.


Probe evidence
--------------

 -  *packages/runtime-c/native/runtime\_realm.c* implements realm records,
    the running-realm scope, GetFunctionRealm, the realm-aware defaults of
    GetPrototypeFromConstructor, `%eval%`, and `$262.createRealm`;
    *runtime\_function.c* enters the callee's realm in `oseo_call_function`;
    *runtime\_array.c* normalizes another realm's `%Array%` in
    ArraySpeciesCreate; and *runtime\_promise.c* gives each job its realm.
 -  *tests/fixtures/runtime-heap.c* creates and drops realms through the
    public runtime API, collects between them, and checks that the initial
    realm runs again after every call and that created realms draw distinct
    Math.random sequences.
 -  *tests/native/fixtures/cross-realm.ts* holds six fixtures that Node.js
    and Deno, through the `node:vm` prelude in
    *tests/native/realm-reference.ts*, and both native specialization
    policies run with collection forced at every safepoint.
 -  *tests/native/scenarios/realms.ts* holds the native-only checks.
 -  *tests/property/m5-cross-realm.property.test.ts* generates realm
    programs at seed `0x60008300` against an independent realm model.
 -  `mise run test262:update` executes the 84 reviewed realm paths.


Observed results
----------------

On Linux AMD64, 43 of the 84 reviewed paths pass under all four variants.
40 reach the ADR 0016 boundary at run time: 30 construct `other.Function`
and 10 call `other.eval` with a source string, each before any realm
assertion runs. The exclusion audit gives the 5 that construct through
another realm's `GeneratorFunction`, `AsyncFunction`, or
`AsyncGeneratorFunction` to `adr:0016-dynamic-source-boundary` and the 35 that
need dynamic source only to obtain a function of another realm or to observe
its template registry to `node:dynamic-source-coverage-remediation`.
*test/built-ins/Iterator/proto-from-ctor-realm.js* also needs the unadmitted
`iterator-helpers` feature, so it is not executed and its owner moves to
`node:iterator-helpers`; it constructs `other.Function` as well, so after
that feature lands it reaches the ADR 0016 boundary like the other 30. The
fixtures and the generated suite agree with Node.js and Deno. macOS AArch64
execution is not observed on this host; the runtime component compiles for
`aarch64-macos` and `aarch64-linux-musl`.


Decision
--------

**Realm state.** `OseoRealm` holds the intrinsic table, the global this
value, the template and regular expression literal caches, and the
Math.random state. The context embeds its initial realm and points at the
running realm. Every later realm is a collected heap record of the new
kind `OSEO_HEAP_REALM`; the collector traces its state and frees its caches
with it. Wherever a realm is stored as a value, undefined names the initial
realm and a realm record names any other. The well-known symbols and the
registered symbol representatives stay context-wide, because ECMA-262
shares them across realms; `Symbol.for` in any realm returns the same
symbol.

**[[Realm]] and the running realm.** A function records the running realm
when it is created, which is the realm whose built-in or generated code
created it. `oseo_call_function` makes the callee's realm the running realm
for the duration of an ordinary or built-in function's [[Call]] and
[[Construct]], and restores the caller's realm afterwards, so an error a
built-in throws, an object it allocates, and a closure it creates belong to
the built-in's realm. A bound function and a Proxy have no realm and never
switch. The class-constructor check runs after the switch, so its TypeError
belongs to the class's realm. Entering a realm roots the realm it leaves
until the matching leave restores it. A generator resumption enters the
generator function's realm. A promise job runs in the realm
HostEnqueuePromiseJob receives: GetFunctionRealm of the reaction's handler
or of the thenable's `then`, or the enqueuing realm when there is no
function or the walk reaches a revoked Proxy. A promise records the realm it
was created in, which is also the realm of its resolving functions, so
settling the allocation-free capability of the intrinsic `%Promise%` enters
that realm, as calling those functions would. The shortcuts that convert an
array to a string through the intrinsic `toString` and `join` apply only
when the method belongs to the running realm; another realm's method takes
the ordinary call that enters its realm.

**Realm-dependent operations.** GetFunctionRealm walks bound targets and
Proxy targets, throws for a revoked Proxy, and returns the running realm for
any non-function object. Every GetPrototypeFromConstructor fallback reads
the named intrinsic of that realm, materializing it there if needed, and an
ordinary [[Construct]] that allocates its receiver uses that realm's
`%Object.prototype%` for a non-object `prototype`. ArraySpeciesCreate treats
another realm's `%Array%` as undefined before its species read. Checks that
compare with “the” intrinsic, such as the `RegExp.prototype` flag getters,
compare with the running realm's, which the call switch makes the getter's
own realm.

**Generated code runs in the initial realm.** No source text is compiled
for a created realm, so every generated function belongs to the initial
realm, and the global bindings, the literal caches, and the sloppy-mode
`this` that generated code reaches are the initial realm's. A created
realm runs only its own built-in functions and calls back into generated
code only through `oseo_call_function`, which restores the initial realm.

**`%eval%`.** Every realm has a `%eval%` intrinsic, installed as the global
object's writable, non-enumerable, configurable `eval` property, with
`length` 1 and `name` `"eval"`. It returns a non-String argument unchanged,
as PerformEval does without parsing, and reports `OSEO1001` “eval compiles
source text at run time, which is outside the admitted profile.” for a
String, the ADR 0016 boundary. It never evaluates source. The compiler's
rejection of the bare `eval` identifier is unchanged, so the value exists
in every realm while the `eval-intrinsic-value` node keeps its decision
about the binding. `%Function%`'s [[Call]] and [[Construct]] now report the
same boundary with `OSEO1001`, as the generator and async function
constructors already did, rather than an `OSEO2001` diagnostic.

**The test262 host.** The `--test262-host` option of ADR 0026 installs
`$262` with `agent`, `createRealm`, and `global`. `createRealm` is a
non-constructible built-in of length 0 that creates a realm, runs
SetDefaultGlobalBindings for it, and returns a host object created in the
new realm whose `global` is the new global object and whose `createRealm`
belongs to the new realm. A created realm's host object has no `agent`,
because agents belong to the cluster's main host object. The reviewed
runner builds a case with the test262 host when it references `$262.agent`,
`$262.createRealm`, or `$262.global`, or loads *atomicsHelper.js*; any
other `$262` member, such as `evalScript` or `detachArrayBuffer`, remains
the `host-binding` capability. The manifest schema and classification
vocabulary are unchanged.


Consequences
------------

 -  `OseoContext` replaces its realm fields with `OseoRealm initial_realm`,
    the running `realm` pointer, and `realm_record`; `OseoFunction` gains
    `realm`; `OseoJob` and `OseoPromise` gain `realm`; the heap gains
    `OSEO_HEAP_REALM`; the intrinsic table gains `OSEO_INTRINSIC_EVAL`; the
    built-in code registry gains range index 29 for `%eval%` and `createRealm`;
    the runtime input gains *runtime\_realm.c*; and `abiVersion` moves to
    `m5-127`.
 -  Every runtime read of a realm-owned field goes through the running
    realm pointer, one more indirection than before.
 -  The main realm's global object gains `eval`, which a program can now
    read as `globalThis.eval`.
 -  Created realms observe no Script of their own, so a case that needs
    `$262.evalScript` or source evaluation in another realm keeps its
    current owner.


Failure modes and replacement triggers
--------------------------------------

 -  Admitting any dynamic source form, including `$262.evalScript`, would
    let a created realm run code of its own and requires generated code to
    run in a realm other than the initial one: the global bindings, the
    literal caches, and the realm a compiled closure records would then
    follow the running realm instead of the initial realm.
 -  A reviewed case whose observable result depends on a realm this record
    places differently, such as the realm of an object created by a job
    without a handler, reopens the job realm rule.
 -  A macOS AArch64 run that observes a different realm for any fixture
    reopens the record.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md): the claim boundary and the
    `$262.createRealm` classification this record resolves.
 -  [ADR 0016](./0016-dynamic-source-boundary.md): the dynamic source
    boundary `%eval%` and `%Function%` report.
 -  [ADR 0019](./0019-m5-claim-closure.md): the closure rule that requires a
    remediation owner for every unsupported path inside the claim.
 -  [ADR 0026](./0026-agent-clusters-and-shared-memory.md): the test262 host
    option and agent clusters this host object extends.
 -  [*PLAN-M5C.md*](../../PLAN-M5C.md): the M5c node this record serves.
