Resolve mixed Annex B ordinary-object prototype coverage
========================================================

This node owns exactly one reviewed unsupported path,
*test/language/types/object/S8.6.2\_A8.js*. Observation-batch-28 admits it
as `unsupported-profile-feature` with dependencies `object-literals`,
`object-properties` and `var-bindings`.


Observation
-----------

Focused observation on base `999f3416fdc62e2c28c2d067f22797306a781af2`,
native target `linux-x86_64-gnu`, rejects the source at compile time in all
four variants, non-strict and strict with specialization enabled and
disabled:

~~~~ text
error[OSEO1001]: The Object.prototype.__proto__ accessor is excluded by Annex B.
~~~~

The reviewed executor stops at its first variant and records the
`profile-syntax` capability. Raw records, source hashes and natural exits are
in [the observation packet](/data/m5c-d17-20261031/ob28/).


Mixed coverage
--------------

The source writes `x.__proto__ = y` on an object made non-extensible by
`Object.preventExtensions`, swallows any exception from that write, and
asserts that `Object.getPrototypeOf(x)` is still `Object.prototype`. The
write reaches the Annex B `Object.prototype.__proto__` setter, which ADR 0013
excludes. The asserted contract is the core OrdinarySetPrototypeOf rule that
a non-extensible ordinary object keeps its `[[Prototype]]`, which does not
normatively require Annex B. The exclusion audit therefore records the path
under assessment `annex-b-ordinary-object-prototype` with disposition
`remediation` and normative dependency `not-demonstrated`. No exclusion is
claimed.

These reviewed passing paths observe related core behavior. They are listed
as related evidence only; they are not bound replacement evidence:

 -  *return-false-if-target-is-not-extensible.js* in
    *test/built-ins/Reflect/setPrototypeOf/* asserts that
    `[[SetPrototypeOf]]` on a non-extensible ordinary object
    returns false and leaves `Object.getPrototypeOf` at `Object.prototype`.
 -  *test/built-ins/Object/setPrototypeOf/set-failure-non-extensible.js*
    asserts that `Object.setPrototypeOf` throws TypeError for a
    non-extensible ordinary object.

Closing this node requires an approved replacement observation with a
witness for every core subject of the original source, or a maintainer
accounting decision under PLAN-M5C.md. It must not admit Annex B, widen
ADR 0013, or change the RegExp split or TypedArray prototype remediation
scopes.
