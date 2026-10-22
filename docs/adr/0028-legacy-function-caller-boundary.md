ADR 0028: Legacy function caller boundary
=========================================

Status
------

Accepted. The maintainer approved this boundary on 2026-10-20 for M5c node
`function-caller-restrictions`. Under [ADR 0019](./0019-m5-claim-closure.md),
it authorizes a bounded M5 exclusion of an optional legacy caller expectation
for an exact set of 23 test262 paths. It changes no runtime behavior.


Context
-------

The pinned test262 revision `f2d1435644797268dca1f7988cad5a4e89ccd8d2` has
exactly 23 paths with `features: [caller]`. All 23 are inside the fixed
41,091-path inventory of [ADR 0020](./0020-m5-applicable-test-inventory.md),
because *features.txt* lists `caller` among the standard language features.
All have `flags: [noStrict]`, and none is a negative test.

These paths do not test the strict-function caller restriction. Each one
needs a read of a non-strict ordinary function's `caller` property to
complete normally:

 -  The 21 _test/built-ins/Function/15.3.5.4\_2-\*gs.js_ paths reach a
    non-strict `gNonStrict` from strict code, directly from strict eval code
    or through a non-strict `f`. It returns `gNonStrict.caller`, and the
    test asserts nothing about the value.
 -  *test/language/arguments-object/10.6-13-a-2.js* and
    *10.6-13-a-3.js* read `arguments.callee.caller`. They skip the callback
    assertion when the value is `undefined` and otherwise call it.

The 16th edition does not require such a property on a non-strict function.
CreateIntrinsics applies AddRestrictedFunctionProperties to
%Function.prototype%. That operation installs the realm's %ThrowTypeError%
as both getter and setter of `caller` and `arguments`, non-enumerable and
configurable. Clause 17.1 then restricts an implementation that adds its own
`caller` property. That property must not reveal a strict function, and
built-in functions, strict functions, and the arrow, method, generator,
async, and class forms must not have one. A non-strict ordinary function with
no own `caller` property inherits the %ThrowTypeError% accessor, so each of the
23 reads throws a `TypeError` in a conforming implementation without the
extension.

Oseo installs those accessors on %Function.prototype% in
*packages/runtime-c/native/runtime\_function.c*, and creates every ordinary
function with an empty own-property store. The reviewed
*test/built-ins/Function/prototype/caller-arguments/accessor-properties.js*
pass covers the prototype accessors. The `function-prototype` node of the
[M5 profile](../language-profile-m5.md) records this behavior.

ADR 0019 completes M5 only when every unsupported result inside the claim
has an accepted record that explicitly authorizes and bounds its exclusion.
The Annex B exclusion of [ADR 0013](./0013-m5-edition-and-manifest.md) does
not cover these paths, and a frontmatter feature tag authorizes nothing.
Without a decision, the 23 paths would stay unowned.


Required contract
-----------------

M5 accounting needs:

 -  an explicit decision on whether the optional caller extension enters the
    M5 profile;
 -  the standard inherited %ThrowTypeError% accessors, kept as they are;
 -  every mandatory restricted-function obligation kept inside the claim;
 -  a bounded, exact path scope that later paths cannot join silently; and
 -  the denominator, classification vocabulary, and pass count unchanged.


Alternatives considered
-----------------------

1.  **Implement a real legacy caller extension.** Deferred. A meaningful
    extension needs a defined contract for caller identity, inactive and
    top-level results, strict callers, recursion and reentrancy, exception
    unwinding, forwarding through `call`, `apply`, and `bind`, realms,
    descriptors, and excluded function kinds. Its implementation would cross
    callable metadata, generic dispatch, and every optimization that changes
    observable call relationships. It would need fixed and generated cases,
    specialization invariance, forced collection, and native target
    evidence. The 23 tests do not specify that contract, and the five
    dynamic-source paths below would still reach ADR 0016.
2.  **Give each eligible function a constant own `caller: undefined`.**
    Rejected. It changes own keys and descriptors of every non-strict
    ordinary function, and it skips the callback branch of the two
    arguments tests rather than exercising it. No standard requires that
    change, and its only justification would be the pass count.
3.  **Retain the standard accessors and exclude the optional expectation for
    the exact paths.** Selected. It keeps the minimum standard behavior and
    keeps the 23 paths visible as unsupported in coverage reports.
4.  **Postpone.** Rejected. The paths would remain unreviewed or unowned,
    and the M5 exit audit could not close.


Probe evidence
--------------

The selector below was compared against the pinned upstream sources. Every
pinned path that has the `caller` frontmatter feature is in it, and each
listed path has that feature. Each source reads a `caller` member.

A bounded probe on main commit
`272455145b4339b1b611ee3d90b317d33f6dc717` called the public
`executeTest262Case` API of *tools/test262.ts* on these 23 sources with the
checked-in `supportedFeatures`, which omit `caller`. It used an executor
that refuses every call and a Node.js permission model that denied child
processes and file writes. Every result was `unsupported-profile-feature`
with `unsupportedFeatures: [caller]` and the observation detail “Not
executed: the frontmatter needs an unsupported feature.” The executor and
compiler were never called, and no variant executed. This shows the current
frontmatter rejection only. It is not a semantic observation of any source
program and not a checked-in manifest record. The reviewed records come from
the normal manifest regeneration.


Observed results
----------------

Before this record, all 23 paths were unreviewed and owned by
`node:observation-batch-32` in the closure ledger. None was in the reviewed
subset, the result partitions, or the exclusion audit.

Five paths also evaluate dynamic source: *15.3.5.4\_2-12gs.js*,
*15.3.5.4\_2-14gs.js*, and *15.3.5.4\_2-76gs.js* call `eval`, and
*15.3.5.4\_2-77gs.js* and *15.3.5.4\_2-78gs.js* call `Function` or
`new Function`. The frontmatter rejection precedes compilation, so their
observation is the same caller rejection as that of the other 18 paths.


Decision
--------

The M5 profile keeps ordinary prototype inheritance and the standard
%ThrowTypeError% `caller` and `arguments` accessors on %Function.prototype%.
Oseo implements neither stack introspection nor a synthesized own `caller`
property for these tests.

The optional legacy caller extension is outside the M5 profile.
This record authorizes an M5 exclusion of the expectation that reading the
`caller` property of a non-strict ordinary function completes normally, and
only for the exact 23 paths listed under “Exact selector” below.

Each of those paths is reviewed as `unsupported-profile-feature` through the
existing frontmatter rejection of the `caller` feature. Its ledger owner is
`adr:0028-legacy-function-caller-boundary`. An excluded path is never a pass,
and coverage reports count it separately from passes and from other
unsupported results.

The exclusion does not waive any mandatory obligation, and these stay inside
the claim with their own evidence or remediation owners:

 -  the %Function.prototype% `caller` and `arguments` accessor descriptors
    and the realm's %ThrowTypeError%;
 -  the clause 17.1 restrictions: no own `caller` or `arguments` property on
    built-in functions, strict functions, or the arrow, method, generator,
    async, and class forms, and no exposure of a strict function through
    any extension; and
 -  the absence of an own `caller` property on arguments objects.

The other 76 _test/built-ins/Function/15.3.5.4\_2-\*gs.js_ paths test the
strict-function restriction without the `caller` feature. They keep their
observation batch and are outside this selector.

The five dynamic-source paths carry the existing `dynamic-source` dependency
tag beside `functions`. That tag names a prerequisite and authorizes nothing.
This record does not broaden [ADR 0016](./0016-dynamic-source-boundary.md),
and ADR 0016 does not own these paths. Each path has exactly one owner.

New paths never join this selector. Changing the pinned suite revision, or
adding a path with the `caller` feature, requires a new reviewed scope
decision.


Exact selector
--------------

The list is exhaustive. Entries marked “dynamic source” also call `eval` or a
source-compiling `Function` form.

 -  *test/built-ins/Function/15.3.5.4\_2-12gs.js* (dynamic source)
 -  *test/built-ins/Function/15.3.5.4\_2-14gs.js* (dynamic source)
 -  *test/built-ins/Function/15.3.5.4\_2-75gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-76gs.js* (dynamic source)
 -  *test/built-ins/Function/15.3.5.4\_2-77gs.js* (dynamic source)
 -  *test/built-ins/Function/15.3.5.4\_2-78gs.js* (dynamic source)
 -  *test/built-ins/Function/15.3.5.4\_2-79gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-80gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-81gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-82gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-83gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-84gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-85gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-86gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-87gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-88gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-89gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-90gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-91gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-92gs.js*
 -  *test/built-ins/Function/15.3.5.4\_2-93gs.js*
 -  *test/language/arguments-object/10.6-13-a-2.js*
 -  *test/language/arguments-object/10.6-13-a-3.js*


Consequences
------------

The reviewed subset gains the 23 paths as unsupported, with the
`functions` tag, `dynamic-source` on the five intersections, and
`object-properties` on the two arguments tests. Their result records and
the observation batch counts come from the normal observation and
regeneration tools. The node assigns the closure ledger owner of this record
to exactly the selector's paths; normal ledger regeneration preserves that
owner while each path keeps its state, but does not create it. The
41,091-path denominator, edition, inventory policy, manifest schema, and
classification and dependency vocabularies stay unchanged.

`mise run check:m5c-exclusion-audit` accepts this record's owner only for a
path in the exact selector, only with the caller frontmatter rejection as
the observed reason and `caller` as the only unsupported feature, and only
when the reviewed source reads a `caller` member. Every reviewed selector
path needs an audit row. A promotion to pass or expected negative uses the
observation owner, as for the other records.

Software that relies on the caller extension stays unsupported. Admitting
the `caller` feature requires replacing this decision. No checked-in
observation has executed these paths, and with the standard accessors each
`caller` read is expected to throw a `TypeError`.


Failure modes and replacement triggers
--------------------------------------

 -  Evidence from target packages that caller introspection is required
    reopens this boundary.
 -  A reviewed runtime design that supports a useful, bounded caller
    contract at acceptable optimization and maintenance cost reopens it.
 -  A later edition or a revised claim that makes the behavior required
    reopens it.
 -  New source evidence that one of these paths mainly tests a mandatory
    contract this boundary would leave uncovered reopens it for that path.


Links
-----

 -  [ADR 0013](./0013-m5-edition-and-manifest.md) fixes the claim boundary,
    the classification vocabulary, and the dependency-tag vocabulary.
 -  [ADR 0016](./0016-dynamic-source-boundary.md) stays in force for
    `eval` and `Function` and owns none of these paths.
 -  [ADR 0019](./0019-m5-claim-closure.md) defines the accepted-record
    authorization this record supplies.
 -  [ADR 0020](./0020-m5-applicable-test-inventory.md) keeps these paths in
    the denominator.
 -  [*PLAN-M5C.md*](../../PLAN-M5C.md) and
    [*docs/m5c-closure/exclusion-audit.md*](../m5c-closure/exclusion-audit.md)
    describe the ledger and audit procedure.
 -  [CreateIntrinsics],
    [AddRestrictedFunctionProperties],
    and [Forbidden extensions]
    are the normative sources.

[CreateIntrinsics]: https://262.ecma-international.org/16.0/#sec-createintrinsics
[AddRestrictedFunctionProperties]: https://262.ecma-international.org/16.0/#sec-addrestrictedfunctionproperties
[Forbidden extensions]: https://262.ecma-international.org/16.0/#sec-forbidden-extensions
