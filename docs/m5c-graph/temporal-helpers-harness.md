temporalHelpers.js harness
==========================

This record backs the M5c graph node `temporal-helpers-harness` (IH-B). The
maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as IH-B of the
`iterator-helpers` split. It depends on `iterator-helpers-tag-activation`,
which assigns it these paths. [*iterator-helpers.md*](./iterator-helpers.md)
records the umbrella.


Selection rule
--------------

This node owns exactly the three `iterator-helpers` paths that include
*temporalHelpers.js*:

 -  *test/built-ins/Iterator/from/get-return-method-when-call-return.js*
 -  *test/built-ins/Iterator/from/return-method-calls-base-return-method.js*
 -  *test/built-ins/Iterator/from/return-method-throws-for-invalid-this.js*

PLAN-M5.md records the scoped classification in which they failed in the
harness because the reviewed harness set does not supply that include.


Evidence obligations
--------------------

 -  Decide whether the reviewed harness set admits the upstream
    *temporalHelpers.js* unchanged or a reviewed subset providing the
    `propertyBagObserver` and `observeMethod` helpers these paths use. The
    upstream file references Temporal and Intl widely; admitting the harness
    must not admit Temporal or Intl behavior.
 -  Observe the three paths and assign any still-unsupported path a bounded
    owner. Do not predict passes.


Harness decision
----------------

The reviewed harness set admits a reviewed subset, not the upstream file
unchanged. The pinned *temporalHelpers.js* is 1,285 lines; 84 exceed the
repository's 80-column limit, and the repository formatter owns every file
under *tests/test262/harness/*, so no byte-identical copy can be checked in.
Of its 46 `TemporalHelpers` members, almost all construct, compare, or
assert on Temporal or Intl values. Compiled with the base harness and one
case, the unchanged file emits about 3.4 MB of C per variant against about
137 KB without it; */data/m5c-temporal-helpers-harness/c-size/* keeps both
inputs and their measured sizes.

*tests/test262/harness/temporalHelpers.js* keeps `observeMethod`,
`propertyBagObserver`, the `toPrimitiveObserver` that
`propertyBagObserver` returns for primitive property values, and the
upstream `formatPropertyName` function and `ASCII_IDENTIFIER` pattern they
log through. Each kept operation is unchanged apart from formatter spacing.
Upstream's `SKIP_SYMBOL` serves only omitted members and is not
reproduced. The copy reads no global outside `Number`, `Proxy`, `Reflect`,
`String`, `Symbol` and `undefined`, plus each function's implicit
`arguments`, so it admits no Temporal or Intl behavior;
`supportedFeatures` is unchanged and `Temporal` remains unsupported.

The existing `harness-definition` check compares only top-level `defines`
names, and the subset still declares `TemporalHelpers`. The runner now also
compares literal member keys. *tools/test262-source.ts* parses each
top-level object literal initializer of a harness Script, and
*tools/test262.ts* records the upstream keys of every reviewed include
next to its `defines`. When a reviewed copy keeps fewer keys, a case that
may read an omitted member is withheld as `unsupported-profile-feature`
with capability `harness-definition`. A static read such as
`TemporalHelpers.observeMethod` or `TemporalHelpers["observeMethod"]` of a
kept member executes as usual. Any other unresolved reference to the name,
including a computed key, an alias, destructuring, or passing the object to
a function, may reach an omitted member and is withheld. Scopes, `typeof`
operands and `with` bodies follow the existing reference walk. The check
is syntactic and sees only the name itself: a read through another object
that holds the global, such as `globalThis.TemporalHelpers`, or through
source compiled at run time is not withheld. No reviewed path reads either
way, and run-time source stays outside the admitted profile. An object
whose literal has a spread or a non-literal computed key infers no
omission. A sweep over every reviewed include found exactly one affected
object, `TemporalHelpers`, with 43 omitted members, so no other reviewed
classification can change. Within the pinned suite, the only other
*temporalHelpers.js* includes outside the Temporal and Intl directories are
nine unreviewed *Array/fromAsync/* paths. Seven of them call the omitted
`observeProperty` and would be withheld if a later node reviewed them.

*tests/test262-runner.test.ts* runs the reviewed and upstream files in
fresh realms and compares one probe's complete call log and results over
every `formatPropertyName` key branch, primitive, object, function and
undefined property values, `skipToPrimitive`, all four traps and
`observeMethod` with and without an object name. It also pins the kept
member list and the reviewed copy's unresolved globals. Further tests cover
the literal-key parser and the withheld and executed member reads above.
The missing-include regression now uses *testIntl.js* as its unadmitted
example.


U source preparation and focused observation
--------------------------------------------

The U source starts at `5eaf2c129b75582f4d84b95668d9efe90414cc62`. No
runtime, compiler, subset entry, stored expectation, manifest, ledger owner
or landed flag changes in U. Root owns the full UPDATE and its accounting.

*/data/m5c-temporal-helpers-harness/observe.mjs* mirrors the IH-A focused
driver with the current 25-include registry and the new upstream member
map. It calls exported `executeTest262Case` once for each of the three
paths with the runner's native executor, pool, FIFO gate and single
process-resource retry policy. *run-gate.py* supplied the heavy lock, a
fresh capacity prefix, jobs one and this worktree's Zig cache, and the
process was awaited once through `m5c-wait`. The run in *precheck1/* and
*precheck1-gate/* observed all three paths as pass: 12 split native
variants, zero retries, no errors, and unchanged tracked inputs. The
packet keeps *inputs.json*, per-path attempts with raw stdout and stderr,
and *summary.json*. This focused run was not the D3 regeneration; at the
time the checked-in manifest still recorded the three paths as
unsupported. The accepted full observation below supersedes it.

Capacity-wrapped `mise run check` exited zero naturally (*check1/*). The
focused validation in *focused1/* ran 12 runner-adjacent test files: the
11 that import *tools/test262.ts* or *tools/test262-source.ts* outside
*tests/native-io/*, plus *tests/native-toolchains.test.ts*, which scans
*tools/test262.ts*. They passed 170/170 registrations under Node on the
Zig lane and 170/170 under Deno. The six that build natively then passed
45/45 under Node on the host-cc lane. *focused2/* ran the remaining
importer, *tests/native-io/clock-wakeup.test.ts*: 7/7 under Node on the
Zig lane and 7/7 under Deno. Under the host-cc lane, 6/7 passed; the
AArch64 Linux cross-link registration failed with “Host C lane cannot
cross-compile aarch64-linux-musl.” That lane has no cross-compiler, and no
host-cc task runs this file. No native fixture,
property file, seed, case budget or deadline changes, because the runtime,
compiler and backend are untouched.


Accepted full observation
-------------------------

Root accepted exactly one normal
`mise run test262:update -- --accept-promotions` on clean U
`6c0d46bd`, which carries this node's two commits and the
`with-optional-call-receiver-non-tail` commits on base `5eaf2c12`. It ran
from 2026-10-28T18:04:59Z to 19:18:14Z with natural exit zero, 4,394.9
seconds of wall time, pool eight and zero retries. All 29,901 reviewed
paths were observed: 26,459 passes, 2,802 expected negatives and 640
unsupported paths, with no semantic, harness or infrastructure failures.
It records exactly three promotions, the three *Iterator/from/* paths in
the selection rule from `unsupported-profile-feature` to pass, and no
demotions. Raw argv, capacity, timing and exit status are in
*/data/m5c-ihb-woc1-20261029/full-6c0d46bd/full.json*; *full.stdout* and
*full.stderr* in that directory preserve the unfiltered output.

These records were carried onto Main `915ec6df`, which reviews 31,310
paths after observation batch 19 landed. The three partition records and
subset expectations apply unchanged; `mise run test262:reindex` and the
repository ledger and batch tasks recompute the derived files, giving
26,957 passes, 3,242 expected negatives and 1,111 unsupported paths. This
carry-forward observed nothing, so it is not a full UPDATE on Main.

The three paths now belong to `observation` in the regenerated closure
ledger, so `node:temporal-helpers-harness` owns no path. No other
classification moves. The landed flag and the dependency and
publication gates remain Root's.
