Class declaration private accessor closure
==========================================

The 2026-11-02 maintainer decision closes exactly two class declaration paths
under ADR 0013's optional Annex B boundary, on the conditions of item 3 of
the 2026-11-01 decision. Both are under
*test/language/statements/class/elements/*:

 -  *private-getter-is-not-a-own-property.js*;
 -  *private-setter-is-not-a-own-property.js*.

Observation batch 22b admitted both as `unsupported-profile-feature` with
dependency `classes`. Each observes the owned `OSEO1001` rejection of the
optional `__lookupGetter__` or `__lookupSetter__` call before its private
accessor assertions. Original sources, assertions, source and observation
digests, subset, and result records are unchanged, and neither path counts
as a pass.

The conditions are a new fresh-digest exclusion audit record that names the
replacement fixtures and passes review, and a closing commit that lands
through CI that includes macOS. The class expression pair closed the same
way; its
[work note](./class-private-accessor-lookup-coverage-remediation.md)
describes the replacement contract this node extends.


Replacement fixtures
--------------------

The two upstream tests differ from their class expression forms only in
declaring `class C` instead of assigning a class expression to `var C`.
Their private accessor subjects are the same: `#m` is neither an own
property nor found by public-name membership, the private getter returns
`"Test262"`, the private setter stores `"Test262"` in `this._v`, and the
method returns the zero the caller checks.

*tests/native/fixtures/classes.ts* adds
`class-declaration-private-getter-public-absence` and
`class-declaration-private-setter-public-absence` beside the expression
fixtures. Each keeps the upstream class declaration and every upstream
assertion except the legacy lookup call, with the same descriptor, repeated
absence, and public `"#m"` controls as the expression fixtures. The one
declaration-specific check is that the declaration binds `C` without a
property on the global object, where `var C` creates one. A failing
comparison throws.

*tests/class-private-accessor-coverage-native.test.ts* now runs both forms.
For each fixture it compares fixed expected output with Node.js and Deno
Script references, then executes it natively as strict and non-strict
Script under both specialization policies with collection at every
safepoint; collection counters must be positive and the enabled policy must
record a guard miss. The declaration fixtures also run in the ordinary
native fixture suite. They are not added to the forced-collection lists in
*tests/native.ts*, whose digest binds several dynamic source assessments;
the dedicated test already forces collection.


Audit record
------------

*docs/m5c-closure/exclusion-audit.yaml* keeps both path rows with their
source and observation digests and moves them to the new
`annex-b-legacy-lookup-class-declaration` assessment, with
`disposition: exclusion` and `normativeDependency: annex-b-only`. The
assessment names both declaration fixtures and binds fresh digests of
*tests/native/fixtures/classes.ts* and
*tests/class-private-accessor-coverage-native.test.ts*. The class expression
assessment binds the same refreshed digests. The `annex-b-legacy-lookup`
remediation assessment had no other rows and is removed.

`m5cAnnexLookupClosedPaths` in *tools/m5c-exclusion-audit.ts* lists these
two paths after the expression pair, so the checker admits an exclusion over
a lookup rejection for exactly four paths and requires all four rows. The
ledger moves both paths to `adr:0013-m5-edition-and-manifest` through the
ledger API and `mise run m5c:closure-ledger:update`, and
`node:class-private-accessor-lookup-coverage-remediation` no longer owns a
path.

| Path                                                                | Outcome | Assessment                                |
| ------------------------------------------------------------------- | ------- | ----------------------------------------- |
| *statements/class/elements/private-getter-is-not-a-own-property.js* | closed  | `annex-b-legacy-lookup-class-declaration` |
| *statements/class/elements/private-setter-is-not-a-own-property.js* | closed  | `annex-b-legacy-lookup-class-declaration` |

The evidence reopens on changed source, observation, or replacement
evidence, on an amendment of ADR 0013's optional Annex B policy or ADR 0020,
or on ADR 0019's reopening triggers.
