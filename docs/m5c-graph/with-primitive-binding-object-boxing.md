Box primitive with binding objects
==================================

Apply ToObject when entering with over Number, Boolean, and String values
before object environment HasBinding. All three observed runtime failures
report TypeError: The in operator requires an object.

Focused observation on base `68b026bb8275b9b7ddd15b9bdd02ef90ef3b123f`,
native target `linux-x86_64-gnu`, found these failures. The original train
retained these paths unreviewed under observation-batch-28. This paragraph
records the original failure; the source repair and its evidence are recorded
below.

 -  `test/language/statements/with/12.10-2-1.js`
 -  `test/language/statements/with/12.10-2-2.js`
 -  `test/language/statements/with/12.10-2-3.js`

Raw source hashes, runner scheduling and results are in
[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json).
The first segment is `observations/`; the continuation is `continuation/`.
Repair and re-observe these exact originals before closing this dependency.


Source repair
-------------

This section records semantic U
`d7808583c66ad45ef870ea4a28b394d9420fa7dd`. The later admission below is
separate from that source repair.

On base `1f3ade138ea7cbee80b2d62940e8f497db2bc1a2`, the three paths
are absent from the checked-in result partitions and remain unreviewed in
the closure ledger under `node:observation-batch-28`. Their original sources
assign the lexical fallback inside with over Number, Boolean and String.
No subset, result, ownership or classification is changed by this source
repair; Root owns admission and re-observation.

The old with lowering called RequireObjectCoercible, which passed a
primitive unchanged to HasBinding's `in` operation. A dedicated `to-object`
MIR operation now materializes one binding object through the runtime's
existing ToObject implementation. Its safepoint, abrupt check and root store
precede environment initialization. ABI `m5-143` exports `oseo_to_object`;
ordinary property References retain their existing primitive receiver rules.
No hint or specialization policy controls boxing.

The fixed native fixture covers Number (including NaN, negative zero and
Infinity), Boolean, String, BigInt and Symbol wrappers; retained wrapper
identity and mutation through escaped closures; String indexed and length
descriptors; inherited strict-call receivers; unscopables fallback; object
and proxy identity; mutable Object shadowing; nullish entry and throwing
operand order. The focused suite executes the three original upstream
bodies with a minimal sameValue assertion, without modifying them or their
stored classifications. It compares Node.js and Deno Script observations
and executes both specialization policies with forced collection in ordinary
and host Script modes where named.

The property family `m5-with-primitive-boxing` reserves seed block
`0x60009300` through `0x600093ff`; domain slot `0x60009300` runs eight
ordinary draws of Number, Boolean or String values, inherited or blocked
lookup, wrapper identity and closure mutation. Its independent expected
output follows the selected property versus lexical fallback model. Both
policies, both compilation modes, false object hints, forced collection,
shrinking and replay remain active. Root must supply shard scheduling
weights for the new file before publication. Root subsequently authorized
one focused extended-budget measurement, recorded below.


Author validation
-----------------

The final focused Linux AMD64 Zig command passed six registrations in
40.60 seconds; the same host-cc command selected Clang 22 with ASan/UBSan
and passed six registrations in 71.05 seconds. Each ran the two MIR policy
checks, the fixed fixture in ordinary and host Script modes, the three
unchanged upstream bodies in host Script mode, and the eight-draw property.
Property registration walls were 24.80 seconds on Zig and 46.71 seconds on
host-cc. These are ordinary author runs, not extended scheduling evidence.
The package command passed 146 compiler, parser, C backend and runtime
registrations. The capacity-wrapped `mise run check` exited zero.

[Raw command records and outputs](/data/m5c-d17-20261031/with-boxing/)
retain the exact argv, timings and ordinary budgets. The final vectors are
*zig.json*, *hostcc.json*, *packages.json* and *check3.json*. Earlier failed
attempts remain preserved: the fixed Proxy trace initially included the
runtime-owned console lookup, then asserted an exact HasProperty count
that differs in the reference engines. The final fixture observes only
whether the probe lookup occurs and whether its receiver retains proxy
identity. No product change or Test262 expectation hides those trace
differences. Earlier line-length and generator lint failures were fixed.

The first non-native root command passed 833 of 835 registrations. Its
failures were the legitimate whole-Script HIR/MIR/C digest change and the
missing Linux weight for the new property. The digest refresh changes
exactly four entries: with-statements and global-object-record under both
policies. Each changed entry contains the new ToObject lowering; every
other entry stays identical. The 14 focused harness-fragment tests pass.

Root authorized one focused Linux Zig measurement using
`OSEO_PROPERTY_RUN_SCALE=10`, with unchanged seed, size and source limit.
The standard helper scales eight cases to 80 and its 180,000-millisecond
base interrupt to 1,800,000 milliseconds. No time-scale override was set.
The full property passed in 178,939.798128 milliseconds, and the whole
command exited zero in 179.26 seconds. This local per-test case sum yields
a Linux shard weight of 179 seconds, recorded as a retained later file with
three absent historical samples. macOS gains no entry. The regenerated
Linux model retains every other weight and reproduces every historical
source log's file order; its unchanged median rule derives 443 seconds.
The U6 cost evidence records the provenance and its single-run limitation.

The final non-native root command passed all 835 registrations across
60 test files, with no skipped registration, in 101.00 seconds. Its exact
argv and output are *fast-root-final.json*, *fast-root-final.stdout* and
*fast-root-final.stderr* in the raw evidence directory. The affected
harness and shard metadata tests also passed all 23 registrations.

Internal pass 1 on semantic U completed clean under DeepSeek and Astra,
with no findings, incomplete areas or snapshot drift. Root made D3 Full
and authorized the separate bootstrap admission below. Root owns the later
Full, R, outer review and publication; no full test, full extended property
gate or Test262 UPDATE ran in this worker.


U2 admission and dependency self-audit
--------------------------------------

Root's D3 reply authorizes admitting the three original paths because a
Full UPDATE does not add unreviewed subset paths. Fresh stock
`executeTest262Case` observations on semantic U passed all three complete
pinned sources, with both non-strict specialization variants and the
reviewed base harness. All six native executions returned zero with empty
stdout and stderr. Strict variants do not apply: each original has
`noStrict`. The raw source hashes, observations and natural exit are in
[the admission packet](/data/m5c-d17-20261031/with-boxing/admission-observations.json).
No upstream source or assertion was changed.

Before this admission, all three paths were absent from the manifest and
unreviewed under batch 28. Their canonical results and expected subset
classifications are now pass, and the ledger API assigns them to
`observation`. Existing subset rows, result records and off-scope ledger
entries remain unchanged; the source revision and supported feature list
are fixed. Graph and batch counts and the two current manifest-count
paragraphs are derived or refreshed without changing graph landed state,
policy, limits or ownership of another path. The canonical batch refresh
prunes only the now-exhausted with prefix from batch 28; its types prefix
remains. The new stored
manifest has 34,340 records: 29,007 pass, 3,627 expected-negative and 1,706
unsupported, with no failure classification. The 41,091-path inventory is
unchanged, leaving 6,751 unreviewed paths.

The row audit follows Root's consolidated 2026-10-29 tag rules. Every row
carries `expression-operators`, `object-properties` and `var-bindings`:
line 13 assigns the checked value 42 through with resolution to the outer
foo cell; line 12 requires ToObject and the binding object's HasProperty;
lines 10-11 bind the actual primitive operand and the outer var fallback.
The Number, Boolean and String originals share that contract. This is an
observed assignment destination and value, not only a reachability marker.
No tag comes from assert internals, a diagnostic string or a failure-only
throw. There is no fixture, observed abrupt completion, subject function,
object literal or branch/loop. HasProperty misses foo on each wrapper and
returns before the unscopables Get; ToObject performs no ToPrimitive, so
there is no reached Symbol dispatch to justify `symbols`. The packet
records all three source hashes and the same per-row audit.

The scoped allow-list is proved against semantic U, including unchanged
implementation and test sources, unchanged prior records and rows, and
canonical serialization. The repeated 60-file non-native gate passed all
835 registrations without skips in 105.27 seconds. U2 precheck and its
admission-only internal pair are recorded in the final worker packet. These
focused observations and bootstrap records do not claim the later Full,
candidate CI, outer review, landing or publication.
