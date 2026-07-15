M3 plan for the dynamic language core
=====================================

Status
------

Implementation status: ready, not started. M2 established removable guarded
specialization, one compiled generic fallback, and observation evidence that
must remain active throughout M3.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*docs/language-profile-m1.md*](./docs/language-profile-m1.md),
[*docs/specialization-m2.md*](./docs/specialization-m2.md), and the accepted
records under *docs/adr/*. Implementation evidence that changes one of those
contracts must update the affected document in the same change.


Entry evidence
--------------

M3 begins with these repeatable contracts:

 -  owned syntax, HIR, MIR, C11 lowering, and the runtime are separate package
    boundaries;
 -  the M1 primitive profile has complete generic behavior for every admitted
    value;
 -  generic calls use `OseoResult`, explicit call-depth accounting, and
    heap-backed root frames;
 -  every current allocation is a MIR safepoint, and collection can be forced
    at every string safepoint;
 -  the x86-64 value layout has a checked 48-bit heap-reference payload and an
    accepted non-moving collector;
 -  M2 specialization can be enabled or disabled through compiler options and
    `--no-specialization`;
 -  both M2 tag failures and checked-addition overflow enter one compiled
    generic addition block;
 -  test-only counters remain separate from JavaScript-visible observations;
 -  Node.js, Deno, native x86-64, and AArch64 compile-link evidence is part of
    the ordinary test matrix; and
 -  npm, JSR, package-boundary, version, strict C11 warning, sanitizer, and
    source checks remain repository gates.

M3 may generalize the runtime and IR contracts. It must not weaken the M1
primitive semantics, the generic call ABI, explicit rooting, or M2 invariance
to make objects or property specialization easier to implement.


Goal
----

M3 makes heap-backed values, dynamic property behavior, closures, and
language-visible abrupt completion usable together. Each new source construct
enters through a complete generic semantic unit. Shape specialization is the
last M3 capability, not the mechanism used to finish generic objects.

The milestone is intentionally ordered as checkpoints. A checkpoint may land
independently when its own tests and documents pass. M3 is complete only after
every exit criterion in this plan is repeatable.


Source profile
--------------

The first M3 change creates *docs/language-profile-m3.md*. That document freezes
the exact grammar and built-ins admitted by each checkpoint before the frontend
accepts them. The intended final M3 profile includes:

 -  object literals and ordinary data properties;
 -  computed and named property reads, writes, definitions, and deletion;
 -  ordinary prototypes and property attributes;
 -  array literals, indexed properties, and `length` behavior;
 -  nested functions, function expressions, function values, and closures;
 -  dynamic calls, methods, `this`, and constructor calls;
 -  mutable lexical bindings required by the admitted operations;
 -  `throw`, `try`, `catch`, and `finally`; and
 -  the control-flow forms required to test mutation and abrupt completion.

The profile may admit a smaller syntax surface when the same semantic contract
can be tested through owned compiler or runtime interfaces. Such an internal
checkpoint does not count as final M3 source support until the public syntax and
differential fixtures land.

Symbols, big integers, classes, private fields, proxies, weak references,
finalization, typed arrays, regular expressions, generators, asynchronous
functions, modules, promises, and host web APIs remain out of scope. Accessor
properties enter only if the admitted function-value and exception semantics
are already complete. A withheld case receives a source-located diagnostic; it
does not receive an approximate object behavior.


Object and collector contract
-----------------------------

Before ordinary objects become a source feature, an architecture record must
settle the initial object header, immutable shape, transition, indexed storage,
and dictionary layouts. The record must compare at least:

 -  shape-owned property metadata with object-owned value slots;
 -  dictionary fallback for deletion and incompatible redefinition;
 -  prototype identity and mutation invalidation;
 -  array index storage and the ordinary-property namespace;
 -  collector tracing of shapes, prototypes, values, and environments; and
 -  the replacement boundary for another native backend or moving collector.

The initial collector remains non-moving and stop-the-world. M3 generalizes its
mark phase from strings to an explicit heap-kind trace dispatch. Every heap kind
defines which `OseoValue` fields it owns. Shape metadata is either traced or
owned by an explicit lifetime arena documented in the decision record.

Allocation collects before publishing a new object. Generated code roots every
live generic value across allocation and any runtime operation declared as a
safepoint. Tests can force collection at every safepoint and can request a
deterministic allocation failure. No raw pointer may survive a safepoint unless
the root protocol or a later accepted stack-map decision describes it.


Generic property semantics
--------------------------

The generic runtime is the only semantic authority for M3 property behavior.
It must distinguish:

 -  own and inherited properties;
 -  missing properties and properties whose value is `undefined`;
 -  writable, enumerable, and configurable attributes;
 -  creation, replacement, compatible redefinition, and rejected
    redefinition;
 -  deletion success and failure;
 -  prototype traversal and a `null` prototype;
 -  receiver and owner identity for inherited access;
 -  canonical array-index keys and ordinary string keys; and
 -  the source-visible order of key conversion, lookup, value conversion,
    mutation, calls, and exceptions.

Property-key conversion must be defined for every value admitted at its
checkpoint. If object-to-primitive conversion is not available yet, object
keys remain rejected until it is. Prototype cycles must be prevented or
detected at the mutation boundary rather than causing unbounded native
recursion.

Dictionary fallback must preserve the same property descriptors and observable
order as the shape-backed path. Deletion, prototype mutation, and incompatible
definition are deliberate transition fixtures, not unsupported fast-path
cases.


Arrays
------

Arrays use a distinct runtime heap kind but participate in ordinary object and
prototype behavior. M3 defines:

 -  canonical index recognition without integer overflow;
 -  holes as absence rather than stored `undefined`;
 -  reads and writes through indexed and named properties;
 -  `length` growth, truncation, attributes, and failure behavior;
 -  prototype lookup for holes;
 -  sparse transition behavior; and
 -  enumeration order for the APIs admitted by the M3 profile.

Packed or holey element layouts are replaceable mechanisms. Tests compare them
with the generic property contract. An optimization may not change how a sparse
index, inherited index, or non-writable `length` behaves.


Functions, environments, and calls
----------------------------------

Function values are heap objects carrying code identity and an optional lexical
environment. Environments contain mutable binding cells so captured writes are
visible to every closure. MIR distinguishes static direct calls from dynamic
value calls without exposing a C function pointer in generic values.

M3 extends the existing generic ABI rather than replacing it. Dynamic calls
validate callability, preserve left-to-right callee and argument evaluation,
pass the receiver for methods, and retain `new.target` for constructors.
Constructors allocate and root the receiver before user code and implement the
documented return-value rule. Missing and extra arguments keep the M1 behavior.

Closure tests cover sibling closures, nested capture, mutation, recursion,
escaped environments, collection between capture and use, and abrupt completion
through a captured call. No environment pointer remains untraced across a
safepoint.


Exceptions and abrupt completion
--------------------------------

M3 makes thrown JavaScript values visible to source programs. HIR and MIR
represent normal, return, throw, break, and continue completion explicitly
before backend lowering. `try`, `catch`, and `finally` preserve ECMAScript
ordering, including a `finally` completion replacing an earlier completion.

Every normal and abrupt edge releases owned root frames exactly once. A catch
binding roots its thrown value. A constructor, property conversion, accessor,
or dynamic call that throws must reach the same language-level handler as an
explicit `throw`.

Runtime resource and host failures remain owned `OSEO2001` or `OSEO3001`
diagnostics unless the M3 profile explicitly defines a JavaScript exception for
that operation. The plan must not silently turn an implementation limit into a
catchable language value.


Shape specialization
--------------------

Shape-guarded property reads begin only after generic get, mutation, prototype,
and descriptor tests pass. The first selector should be narrower than the full
property surface, for example a repeated named read from an ordinary object
with a stable own data property.

The guarded MIR must expose object-kind and shape checks, the fixed slot, the
generic property block, invalidation-sensitive inputs, and one result join. A
miss caused by another shape, dictionary conversion, deletion, prototype
change, accessor, or non-object receiver enters generic lookup without replaying
key conversion or another visible source effect.

Specialization-disabled mode remains an M3-wide oracle. The M2 small-integer
path and the M3 shape path must compose in the same function without changing
results, exceptions, allocation behavior visible to the program, or side-effect
order.


Test262 harness
---------------

M3 introduces a repository-owned test262 adapter before using test262 results
as an exit gate. It records the suite revision, test path, frontmatter features,
strictness modes, harness includes, expected phase, and actual observation.
Results are classified as:

 -  pass;
 -  semantic failure;
 -  unsupported profile feature;
 -  expected parse failure; or
 -  harness or infrastructure failure.

Unsupported and harness failures do not count as passes. The checked-in result
manifest contains only reviewed subsets tied to the M3 profile. Differential
fixtures remain the primary evidence for Oseo-specific guard, root, and native
code shape contracts.


Work sequence
-------------

1.  Freeze M3 semantics and evidence infrastructure.

    Write *docs/language-profile-m3.md*, add the test262 adapter and result
    classes, and add negative fixtures for every deferred feature. Record the
    object, shape, dictionary, and lifetime decision before runtime layout code
    becomes a dependency.

2.  Generalize heap tracing and allocation tests.

    Add heap-kind trace dispatch, object graph marking, deterministic allocation
    failure, and forced collection at every new safepoint. Prove cycles,
    shared references, deep graphs, and abrupt paths without property syntax.

3.  Implement generic ordinary objects.

    Add owned syntax, HIR, MIR, and runtime operations in semantic units for
    object creation, keys, own lookup, prototypes, descriptors, writes,
    definitions, and deletion. Keep every operation backend-neutral and
    source-located.

4.  Implement arrays on the generic property model.

    Add literals, canonical indices, holes, sparse storage, `length`, inherited
    indices, and required enumeration behavior. Force collection during growth,
    truncation, and dictionary transitions.

5.  Implement heap function values and closures.

    Add dynamic calls, lexical environments, mutable captured cells, methods,
    `this`, and constructors in prerequisite order. Retain the stable generic
    ABI across separately compiled boundaries.

6.  Implement language-visible abrupt completion.

    Add `throw`, `try`, `catch`, and `finally`, then complete abrupt property,
    conversion, call, constructor, and closure fixtures. Inspect root-frame
    balance on every completion edge.

7.  Add the first shape guard.

    Freeze enabled and disabled observations first. Add explicit shape-guard
    MIR, a shared generic property fallback, test-only counters, mutation
    misses, and deterministic C11 lowering. Inspect optimized code on both
    configured targets.

8.  Close M3 evidence.

    Run reviewed test262 subsets, differential generation, forced collection,
    sanitizers, package checks, and the full M2 invariance corpus. Update
    design, roadmap, package documentation, decisions, and the next plan.


Required fixtures
-----------------

Reviewed fixtures cover at least:

 -  empty, populated, nested, shared, and cyclic object graphs;
 -  own, inherited, missing, and explicitly `undefined` properties;
 -  descriptor combinations and incompatible redefinition;
 -  shape transitions, dictionary conversion, deletion, and prototype changes;
 -  numeric-looking keys at every array-index boundary;
 -  packed, holey, sparse, truncated, and inherited array elements;
 -  receiver identity and left-to-right computed-key evaluation;
 -  captured reads and writes across sibling and escaped closures;
 -  direct, dynamic, method, recursive, and constructor calls;
 -  normal return, throw, catch, rethrow, and every `finally` override;
 -  collection before and after every object, array, function, environment, and
    thrown-value allocation;
 -  generic property fallback after every deliberate shape-guard miss; and
 -  M2 addition hits and misses combined with every new heap value kind.

Generated cases mutate property insertion order, attributes, prototypes,
indices, closure nesting, completion kind, hints, and specialization policy.
They compare Node.js, Deno, specialization-disabled native execution, and
specialization-enabled native execution where the source profile is shared.


Test matrix
-----------

| Surface      | Generic only               | Specialized                 | Forced collection   | AArch64  |
| ------------ | -------------------------- | --------------------------- | ------------------- | -------- |
| Heap tracing | Object graph survives      | Same graph                  | Every safepoint     | Link     |
| Properties   | Generic operations         | Guard hit or same fallback  | Mutation paths      | Link     |
| Arrays       | Ordinary/indexed semantics | No array fast path required | Growth/truncate     | Link     |
| Closures     | Generic environment/call   | M2 paths may compose        | Capture and escape  | Link     |
| Exceptions   | Explicit completion CFG    | Identical completion        | Throw/catch/finally | Link     |
| Shape read   | Generic property helper    | Checked fixed slot          | Miss may collect    | Assembly |
| test262      | Classified subset          | Same observations           | Applicable cases    | Not run  |
| Packages     | npm and JSR contracts      | No private layouts exported | Not applicable      | Assets   |


Exit criteria
-------------

M3 is complete when all of the following are true:

 -  *docs/language-profile-m3.md* names every accepted construct, value,
    built-in, and withheld prerequisite;
 -  the accepted object-layout record matches the runtime and collector;
 -  every heap kind has explicit tracing and survives forced collection in
    cycles, shared graphs, closures, prototypes, arrays, and thrown values;
 -  generic property get, set, define, and delete match the documented semantics
    for own, inherited, descriptor, prototype, and dictionary cases;
 -  array indices, holes, sparse storage, and `length` behavior match the M3
    profile;
 -  escaped closures preserve binding identity and mutation across collection;
 -  dynamic calls, methods, `this`, and constructors preserve evaluation and
    generic ABI behavior;
 -  `throw`, `try`, `catch`, and `finally` preserve completion values and
    release roots on every edge;
 -  every allocation and collecting call has a MIR safepoint and a deliberate
    forced-collection fixture;
 -  the first shape-specialized read has a tested miss for shape, dictionary,
    deletion, prototype, accessor, and non-object changes admitted by the
    profile;
 -  the shape hit path avoids generic lookup and allocation, and every miss
    reaches one compiled generic property block without replaying effects;
 -  enabled and disabled modes have identical JavaScript-visible observations
    for the full M1, M2, and M3 corpora;
 -  M2 counter expectations and assembly checks remain unchanged;
 -  reviewed test262 results distinguish failures, unsupported cases, and
    harness errors without inflating pass counts;
 -  strict C11 warnings, undefined-behavior sanitization, and memory-safety
    tooling report no known errors on native x86-64 fixtures;
 -  every reviewed M3 native fixture compile-links for
    `aarch64-linux-musl` with an explicit target;
 -  npm and JSR checks expose no private value, object, shape, environment, or
    collector layout; and
 -  `mise run check` and `mise run test` pass from a clean checkout.


Out of scope
------------

M3 does not add modules, package resolution, promises, asynchronous functions,
an event loop, web APIs, Node.js APIs, or native addons. It does not add a
moving or generational collector, profile-guided optimization, polymorphic
inline caches, proxies, weak references, finalization, or broad benchmark
claims.

A feature moves into M3 only when its complete generic prerequisites, abrupt
behavior, root behavior, and differential fixtures fit this plan. Otherwise it
remains a source-located unsupported feature for a later milestone.
