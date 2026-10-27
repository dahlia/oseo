Iterator helpers tag activation
===============================

This record backs the M5c graph node `iterator-helpers-tag-activation`
(IH-A). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as IH-A of the
`iterator-helpers` split, and its priority note puts IH-A first.
[*iterator-helpers.md*](./iterator-helpers.md) records the umbrella.


Selection rule
--------------

This node owns the 393 paths assigned to `node:iterator-helpers` in the
derived closure ledger, except these three, which include
*temporalHelpers.js* and belong to `temporal-helpers-harness`:

 -  *test/built-ins/Iterator/from/get-return-method-when-call-return.js*
 -  *test/built-ins/Iterator/from/return-method-calls-base-return-method.js*
 -  *test/built-ins/Iterator/from/return-method-throws-for-invalid-this.js*

That leaves 390 paths. The umbrella owns all 393 until this node lands.


Evidence obligations
--------------------

 -  Admit the `iterator-helpers` feature tag. Activation is atomic, so the
    node cannot split by method. Split review scopes by
    *test/built-ins/Iterator/prototype/* method directory instead.
 -  First check whether the runner classifies a missing harness include as
    unsupported. At the split baseline, *tools/test262.ts* threw on an
    unknown include, yielding a harness failure the manifest rejects. If needed,
    add the bounded runner change that classifies the three
    *temporalHelpers.js* paths as an explicit unsupported capability, and
    regenerate the full manifest.
 -  Observe actual classifications. Apply the reviewed exclusion-audit
    procedure, and assign every still-unsupported path a bounded remediation
    or authorized exclusion owner. The node contract already expects
    *test/built-ins/Iterator/proto-from-ctor-realm.js* to keep a
    source-constructor rejection. Do not predict passes.


U source preparation and focused observations
---------------------------------------------

This source starts at `6db426dd0cf788f7c69c08eb5644af6c9e8c77de`.
Only `iterator-helpers` is added to the reviewed `supportedFeatures`.
All 393 reviewed paths carrying that feature are the umbrella-owned paths
selected above; there are no other reviewed tagged paths outside that owner.
No subset entry, stored expectation, manifest, ledger owner or landed flag
is changed in U. Root owns the full UPDATE and resulting accounting.

The M5b implementation already supplies Iterator, Iterator.from, the helper
prototype, all five lazy methods and all six eager methods. Existing fixed
fixtures and property suites cover descriptors, receiver/callback checks,
captured next, early/abrupt close, callback counters, generator state,
flatMap close order, specialization fallback and forced collection.
The first completed precheck nevertheless exposed an obsolete String
primitive rejection in `iterator_from`, before its existing lookup path.
Root authorized a bounded repair: allow strings through GetV and Call with
the primitive receiver; other primitive receivers still throw TypeError.
The existing intrinsic fixture and property now cover that repair without
changing their seed, case budget or deadline. *PLAN-M5.md* names the details.

Root also authorized a generic missing-include capability check. Before
assembly, a non-raw case naming an include absent from the reviewed registry
returns `unsupported-profile-feature`, capability `harness-include`, with
the include named in its detail. This preserves the ADR 0013 classification
and dependency vocabularies, existing tags, admitted include behavior and
raw source behavior. The assembly API still throws when called directly
with a missing include. The runner regression tests cover missing and
admitted includes, raw cases and preserved dependency tags.

Three paths listed above remain unexecuted `harness-include` observations
and are assigned to `temporal-helpers-harness` (IH-B) in this note. No copy
of *temporalHelpers.js* is admitted. The fourth unsupported path is
*test/built-ins/Iterator/proto-from-ctor-realm.js*: its first
non-strict/disabled variant reports the existing `OSEO1001` rejection,
“Function compiles source text at run time, which is outside the admitted
profile.” Its non-source realm/constructor subject remains active coverage
debt for `dynamic-source-coverage-remediation`; it is not a pass or an
approved exclusion. Root's post-Full audit must bind fresh digests and the
actual owner rather than infer an exclusion from the tag.

Raw packets are under */data/m5c-iha/*:

 -  *precheck-gate/* preserves the failed initialization: missing built
    `@oseo/backend-c/dist/index.js`, before any case executed. Root
    authorized the build and a fresh run; this is not an observation.
 -  *precheck2/* and *precheck2-gate/* preserve the first completed run:
    393 observed, 387 pass, four unsupported and two semantic failures.
    *Iterator/from/iterable-primitives.js* and *Iterator/from/primitives.js*
    each reported `OSEO2001`, “String iteration is not admitted yet.”
    Root authorized the repair before any product change.
 -  *precheck3/* and *precheck3-gate/* preserve the single repaired run:
    393 observed, 389 pass and four unsupported, with zero semantic,
    harness or infrastructure failures. The 390 IH-A paths therefore
    comprise 389 passes and one unsupported result. All 184 lazy and
    173 eager method paths pass.

Each completed precheck called exported `executeTest262Case` once per path,
mirroring the current runner's native executor, 24-include registry, pool,
FIFO gate and single process-resource retry policy. Both used pool eight,
zero retries, both ordinary specialization/strictness policies as reached,
and no timeout, scaling, filters or budget overrides. The repaired run
records 1,557 actual native variants: 389 passing paths times four, plus
the one deciding source-constructor variant. The three missing includes
executed no variant. Later variants of the rejected path are not inferred.

The packets contain *inputs.json* with tracked-source and upstream digests,
*paths/*.json\* with raw attempts/stdout/stderr and *summary.json* with counts
and before/after source preservation. Both completed runs report unchanged
tracked inputs. *observe2.mjs* and *observe3.mjs* retain the mirrored drivers;
*run-gate.py* supplied the heavy lock, fresh capacity prefix, choom1000,
jobs1 and */data/zig-cache/m5c-iha-tag-20261028*. Each background process
was awaited once through `m5c-wait`. Subsequent edits affect documentation
and property output serialization, not the prechecked product or runner.
These focused observations do not replace D3's full regeneration, an
exclusion audit, candidate/Main CI, outer review or publication.

Focused validation uses the same capacity wrapper and heavy lock. The whole
Node command selected *tests/test262-runner.test.ts*,
*tests/test262-incremental.test.ts* and the existing Iterator intrinsic,
lazy and eager property files. It passed 91 of 92 registrations: the sole
failure was an old missing-include unit expectation for `harness-failure`,
which conflicts with Root's authorized capability change. After correcting
that assertion, the whole runner file passed 80/80 under Node. The other
12 registrations, including all three property domains, passed in the
original run. The same five whole files passed 92/92 under Deno. Raw logs
are in *focused-node/*, *runner-node/* and *focused-deno/*.

*fixed.mjs*, run through the wrapper, executes the complete existing
Iterator intrinsic, lazy and eager fixture sources under both native
specialization policies with collection at every safepoint. All six
fixture/policy observations match independent Node and Deno outputs and
have positive collection counters; disabled-policy guard counters remain
zero. *fixed/* and *fixed-observations.json* preserve the outputs and
counters. This focused driver does not claim all inspections, cross-links
or native-only preludes of the complete *tests/native.ts* runner. No macOS,
sanitizer, extended-property or hosted-CI result is supplied here. The
property commands preserve 12/10/10 cases, seeds `0x60003400`,
`0x60005e00`, `0x60006700` and their 180/240/240-second limits; there
is no override.

After line wrapping and preserving the ratchet's original domain key,
*intrinsic-final/* records a whole intrinsic property pass under each host
and *runner-final/* records 80/80 runner registrations under each host.
*check4/* records natural exit zero for capacity-wrapped `mise run check`,
including the compatibility ratchet with zero overrides and unchanged
205 domains, 205 seeds and 7,908 ordinary cases. Earlier CHECK packets
retain the domain-key, line-length and lint failures corrected before U.
