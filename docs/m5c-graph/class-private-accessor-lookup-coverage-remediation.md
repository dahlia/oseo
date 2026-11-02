Private accessor lookup replacement evidence
============================================

Scope and accounting
--------------------

Item 3 of the 2026-10-28 *m5c-scope-big-node-split* decision closes a mixed
Annex B path under ADR 0013's optional Annex B boundary only when reviewed
replacement observations cover every core subject and a fresh-digest audit
record names them. The 2026-11-01 maintainer decision applies that rule to
the two class expression paths below and to no other path. ADR 0013's
optional boundary, ADR 0016, and ADR 0019 are unchanged.

The two closed paths are under *test/language/expressions/class/elements/*:

 -  *private-getter-is-not-a-own-property.js*, recorded in
    *tests/test262/results/language/expressions/c5.yaml*;
 -  *private-setter-is-not-a-own-property.js*, recorded in
    *tests/test262/results/language/expressions/eb.yaml*.

Both remain `unsupported-profile-feature` with dependency `classes`. Their
actual `OSEO1001` observations reject the optional `__lookupGetter__` or
`__lookupSetter__` call, respectively, before the later core assertion, and
the replacement fixtures below witness every core subject. Their ledger owner
is now `adr:0013-m5-edition-and-manifest`, and they are not counted as passes.
Original sources, assertions, source and observation digests, subset, result
records, and batch 11's 1,199-path reservation are preserved.

The class declaration getter and setter paths of the same shape under
*test/language/statements/class/elements/*, admitted by observation batch
22b, are outside the 2026-11-01 decision. The 2026-11-02 decision closes
them through
[`class-declaration-private-accessor-closure`](./class-declaration-private-accessor-closure.md),
which adds class declaration fixtures to the same evidence files. This node no
longer owns any path.


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
lookup observer is omitted. A failing comparison throws.

Additional checks cover descriptor absence, absence after access, and
independence from a public property with spelling `"#m"`, followed by
deletion and repetition.

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

Root owns D3, any UPDATE, outer review, candidate CI, publication, rebase,
merge, and landed state. The decision also requires the closing commit to
land through CI that includes macOS.


Audit record
------------

*docs/m5c-closure/exclusion-audit.yaml* keeps both path rows with their
source and observation digests and moves them to the
`annex-b-legacy-lookup-class-expression` assessment, with
`disposition: exclusion` and `normativeDependency: annex-b-only`. The
assessment names both replacement fixtures and binds the digests of
*tests/native/fixtures/classes.ts* and
*tests/class-private-accessor-coverage-native.test.ts*. The exclusion audit
checker admits an exclusion over a lookup rejection only for the paths
listed in `m5cAnnexLookupClosedPaths`, now these two and the two class
declaration paths, and requires every listed row. The ledger moves both paths
to `adr:0013-m5-edition-and-manifest` through the ledger API and
`mise run m5c:closure-ledger:update`.

| Path                                                                 | Outcome | Assessment                               |
| -------------------------------------------------------------------- | ------- | ---------------------------------------- |
| *expressions/class/elements/private-getter-is-not-a-own-property.js* | closed  | `annex-b-legacy-lookup-class-expression` |
| *expressions/class/elements/private-setter-is-not-a-own-property.js* | closed  | `annex-b-legacy-lookup-class-expression` |

The evidence reopens on changed source, observation, or replacement
evidence, on an amendment of ADR 0013's optional Annex B policy or ADR 0020,
or on ADR 0019's reopening triggers.
