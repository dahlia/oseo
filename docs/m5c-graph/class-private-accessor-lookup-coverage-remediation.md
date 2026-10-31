Private accessor lookup replacement evidence
============================================

Scope and accounting
--------------------

This node supplies replacement evidence up to the separate maintainer
coverage-accounting decision. The 2026-10-28 *m5c-scope-big-node-split*
decision, item 3, permits Annex B mixed-coverage closure only after reviewed
replacement observations cover every core subject and fresh audit records
name them. Root's dispatch retains both existing owners pending that decision.
ADR 0013's optional boundary, ADR 0016, and ADR 0019 are unchanged.

Exactly two admitted paths are owned here, under
*test/language/expressions/class/elements/*:

 -  *private-getter-is-not-a-own-property.js*, recorded in
    *tests/test262/results/language/expressions/c5.yaml*;
 -  *private-setter-is-not-a-own-property.js*, recorded in
    *tests/test262/results/language/expressions/eb.yaml*.

Both remain `unsupported-profile-feature`, dependency `classes`, and owner
`node:class-private-accessor-lookup-coverage-remediation`. Their actual
`OSEO1001` observations reject the optional `__lookupGetter__` or
`__lookupSetter__` call, respectively, before the later core assertion.
The `annex-b-legacy-lookup` audit assessment remains remediation. Original
sources, assertions, source and observation digests, subset, result records,
ledger, and batch 11's 1,199-path reservation are preserved.

Train B's statement-family getter and setter paths under
*test/language/statements/class/elements/* are pending. At this base both
are unreviewed and owned by `node:observation-batch-22b`. This worker does
not take them over or claim reviewed replacement equivalence for them.


Replacement contract
--------------------

The existing `class-private-accessors` fixture proves private access and
missing-half TypeErrors, but does not include the two owned tests' public
property absence assertions. No compiler or runtime gap is assumed.

Two new fixed fixtures in *tests/native/fixtures/classes.ts* are
`class-private-getter-public-absence` and
`class-private-setter-public-absence`. Each keeps the upstream class
expression, private `#m` accessor, public own-property and `in` assertions,
and zero return checked by the caller. The getter still returns `"Test262"`;
the setter still stores `"Test262"` in `this._v`. Only the optional legacy
lookup observer is omitted. A failing comparison throws. Additional checks
cover descriptor absence, absence after access, and independence from a
public property with spelling `"#m"`, followed by deletion and repetition.

*tests/class-private-accessor-coverage-native.test.ts* compares fixed
expected output against Node.js and Deno references and native execution.
Each native fixture executes as strict and non-strict Script with both
specialization policies and forced collection; collection counters must be
positive. The fixtures also enter both forced-collection lists in
*tests/native.ts*. No optimization or generator contract changes, new
property file, seed allocation, or shard weight is introduced. The normative
*class-private-elements.yaml* record names this evidence without changing
the existing generated or guard-fallback evidence.


Validation and remaining gate
-----------------------------

The replacement sources compile without diagnostics. On Linux AMD64:

 -  `mise run check` passed with the capacity prefix, recorded in
    *check.json*, *check.stdout*, and *check.stderr*.
 -  `node --test tests/class-private-accessor-coverage-native.test.ts`
    passed both registrations on Zig, covering eight native executions
    with no skips (*zig2.json* and *zig2.stdout*).
 -  The host-cc vector first passed all seven sanitizer self-tests, then
    the same two registrations and eight native executions with Clang 22
    ASan/UBSan and no skips (*hostcc.json* and *hostcc.stdout*).
 -  The fast non-native root vector passed 832 registrations in 58 files,
    with no skips (*fast.json* and *fast.stdout*); *fast-files.json* lists
    the exact vector.

Raw commands and results are retained under
*/data/m5c-d17-20261031/private-accessor/*. Heavy vectors used the shared
lock through `run-gate.py --wait-lock`, one at a time. Dependency install
and package build corrected the initial missing-package/artifact setup;
*zig.json* is that failed setup attempt, not a semantic observation.
No macOS execution, AArch64 cross-link, full repository test, extended
property gate, or Test262 UPDATE is claimed by these focused runs.
Internal review and Root's D3 judgment follow the committed source.

Root owns D3, any UPDATE, maintainer accounting, outer review, candidate CI,
publication, rebase, merge, and landed state. Replacement evidence alone
neither closes nor excludes either path and never counts as upstream passes.
