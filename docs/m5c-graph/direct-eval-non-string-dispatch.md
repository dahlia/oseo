Non-String direct eval dispatch
===============================

Scope
-----

This node owns exactly two original test262 paths:

 -  *test/language/eval-code/direct/non-string-object.js*
 -  *test/language/eval-code/direct/non-string-primitive.js*

At base `8f4202628356e172e1b4093a371d086070619de3`, both are reviewed
`unsupported-profile-feature` with `OSEO1001: Unknown binding 'eval'.`
Their partitions are *language/eval-code/69.yaml* and *3b.yaml* under
*tests/test262/results/*. Both indirect siblings pass. The original
assertions require the same non-String value back; no source compilation
is needed. Their original sources, dependency tags and subset entries
remain unchanged. The [B06 note](./observation-batch-06.md) records the
original admission and bounded ownership.


Boundary and implementation
---------------------------

ADR 0016's Decision explicitly permits the rejection phase:

> Affected test262 cases are classified `unsupported-profile-feature`
> through the owned `OSEO1001` rejection, whether the frontend reports it
> before execution or the runtime reports it at the invocation

It also describes the existing runtime boundary as:

> on a call of `%eval%` with a String argument.

ADR 0019's Decision states:

> This record is therefore not the decision ADR 0016 asked for. It neither
> admits dynamic source nor revises the ADR 0013 boundary.

Neither record requires compile-time rejection of a direct non-String
call. Root approved using the existing runtime dispatch, conditional on
preserving the String rejection, argument order and fresh observation/audit
verification. ADR 0013, ADR 0016 and ADR 0019 remain unchanged.

The resolver now reads the current global `eval` property for a direct call
as it already does for indirect calls. The generic call path captures the
callee before evaluating every argument, including unused extras and spread
iteration. Existing runtime %eval% returns a non-String unchanged, without
ToString or any property access on it, and reports located `OSEO1001` for a
String before executing any supplied source. Replacement functions retain
ordinary behavior, and missing/noncallable bindings retain ordinary errors.
No runtime/backend implementation, ABI, specialization or source evaluation
capability changes.


Evidence and observation handoff
--------------------------------

The parser tests were changed first and failed against the old resolver.
The fixed native fixture covers strict/sloppy, parenthesized/spread and
zero-argument calls, primitive and object identity, boxed Strings, a revoked
Proxy, coercion traps, argument order and abrupt completion, callee capture,
replacement/deletion and false numeric hints. It is in the forced-collection
selector and positive collection-counter assertion of *tests/native.ts*. The
focused native suite compares Node.js and Deno references with both native
policies under forced collection and asserts specialized guard hits/misses and
generic addition fallback. Separate negative executions assert a located String
rejection and no source effect.

The existing *m5-global-object-record.property.test.ts* generator adds direct,
parenthesized and spread call forms plus non-String identity values to its
state model. Its seed block, case budgets, shrinking and deadlines remain.
No new property file or shard weight is added.

Author validation and the affected-row inventory are recorded below. Root owns
Full UPDATE, observed promotions, fresh rejection digests, result/owner
derivation, outer review, merge, push and effective landed state. Current
stored classifications are retained until Root's actual observation; this note
predicts no pass.

The conservative Full UPDATE impact list selects the 626 reviewed rows whose
stored diagnostic is `Unknown binding 'eval'.`, including the two owned
identity paths. Of these, 624 have existing exclusion-audit entries. The
complete path list and copied audit records are retained in
*/data/m5c-d17-20261031/directeval/affected-rows.json*. This selector is
planning evidence, not a claim that every row's new observation differs.
Root's re-verification must retain each direct String-eval result as
`unsupported-profile-feature` with the owned `OSEO1001` source-compilation
rejection and verify its phase/location change against its original source;
it must not infer passes or exclusions from this scan.


Author validation
-----------------

The focused parser/hashbang/CLI command passed 142 registrations. The fast
non-native repository list passed all 830 registrations, with no skips or
failures. Its exact 58-file argv and machine-capacity envelope are retained
in *non-native.sh*, *non-native.json* and their raw outputs under
*/data/m5c-d17-20261031/directeval/*. Types, formatting, line length, lint,
native host guards and the zero-override compatibility ratchet passed after
correction. The normal U commit's hooks run the complete `mise run check`;
the commit command record preserves its actual outcome separately.

The first Zig command passed both original paths in all four variants,
the String-boundary registration and all four property-file registrations.
Its broad fixed registration's stdout matched its references, but its
counter assertions failed because the test had omitted
`observeSpecialization: true`. The retained *focused3* command and
*native-instrumentation-failure.json* record that failure. Enabling
observation changes only the test instrumentation; no assertion, fixture
program, generator, seed or budget was removed or weakened.

The corrected serial vector is *focused-repair.sh*, recorded as *focused4*.
It passes three Node/Zig fixed registrations, seven Deno/Zig registrations
(the whole property and fixed files), and seven sanitizer self-checks.
The whole host-cc fixed/property command passed all seven registrations.
The corrected vector naturally exited zero in 205.92 seconds. Together
with the four retained Node/Zig property registrations, these are 28
successful framework registrations across the three execution vectors and
sanitizer self-checks; they overlap and are not unique test262 paths.
Both fixed and property suites literally use NodeHost under both test
frameworks; their references invoke the independent Node.js and Deno
executables. These are Linux AMD64 author checks, not macOS executions,
extended properties, full repository gates or stored test262 promotions.

The two original sources execute without edits through `executeTest262Case`
and the reviewed base harness, with four variants each. The fixed suite
checks every argument before the located String rejection and confirms a
throwing extra argument takes precedence over even a String first argument.
The generated state model retains all prior domains' seeds, case counts,
limits and source oracles. Current source/test hashes are retained in
*tested-inputs.json*; raw framework counts overlap and do not multiply the
two owned paths.

Post-UPDATE audit verification uses the preserved
*reverify-audit.mjs* script in the same external evidence directory. It
checks all 624 rows before writing anything, compares original sources,
case identities, dependency tags and all non-diagnostic observation fields,
requires the owned eval source-compilation `OSEO1001` rejection, and uses
`exclusionObservationDigest` from the unchanged owning tool. Any unexpected
change stops the operation and is reported to Root. Its per-row output is
separate from the original impact inventory. Root has authorized digest
refresh only after that successful verification of the actual Full result.


Internal pass 1 corrections
---------------------------

Both complete internal stages on `621ed751` found the same blocking stale
profile claim, `M5C-PROFILE-STALE-DIRECT-EVAL`: two older sections still
stated that direct calls reject before argument evaluation. Both passages
now describe non-String identity and the located String runtime boundary.
The nonblocking `M5C-DUPLICATE-FORCED-GC` finding removes one redundant OR
entry and clarifies the selector and positive collection-counter assertion.
All required fixture selection remains enabled. No compiler, runtime,
fixture program, generator, seed or budget changes in this correction.

Pass 1 artifacts, including both complete verdicts and their focused test
notes, are under the external *reviews/* directory. Those verdicts are
blocking history, not a clean result for the corrected source. The next
pass rechecks the same implementation scope after the normal-hook fix
commit and precheck. The author native evidence above remains bound to its
unchanged compiler, runtime, programs and property inputs; focused selector
and profile checks cover this correction separately.

The focused native-fixture, host-guard and evidence-lane command passed all
85 registrations after the correction, with no skips or failures. Its raw
output is *fix-p1-tests.log*. The fix commit retains normal hooks and the
full check; no native or property result is relabeled as a new execution.
