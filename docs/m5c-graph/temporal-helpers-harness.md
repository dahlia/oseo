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
next to its `defines`. When a reviewed copy keeps fewer keys, the object
runs behind the omitted-member trap described under “Runtime trap” below.
A sweep over every reviewed include found exactly one affected object,
`TemporalHelpers`, with 43 omitted members, and exactly the three paths in
the selection rule load it. Within the pinned suite, the only other
*temporalHelpers.js* includes outside the Temporal and Intl directories
are nine unreviewed *Array/fromAsync/* paths. Seven of them call the
omitted `observeProperty` and would be harness failures if a later node
reviewed them.

*tests/test262-runner.test.ts* runs the reviewed and upstream files in
fresh realms and compares one probe's complete call log and results over
every `formatPropertyName` key branch, primitive, object, function and
undefined property values, `skipToPrimitive`, all four traps and
`observeMethod` with and without an object name. It also pins the kept
member list and the reviewed copy's unresolved globals. A further test
covers the literal-key parser; the trap's tests are listed below.
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


Runtime trap
------------

The first design withheld a case when a syntactic walk predicted that it
might read an omitted member. Outer review pass 1 found two bypasses: an
object environment that lacks the name falls through to the global
binding inside `with`, and a Script `var TemporalHelpers` shares the
harness binding instead of shadowing it. The guard-fix rounds then found
nested Script `var`, inherited `valueOf` returning the object, replaced
kept members, and computed class keys seeing the outer `this`. The
maintainer decision of 2026-10-29 replaced the static guard with a runtime
trap, because adding cases could not make the prediction sound. The four
guard-fix commits are not carried; this U removes `omittedMemberReaders`
and restores the shared reference walk.

*tools/test262-harness-trap.ts* generates an installer Script that the
runner places after the includes of every case whose includes keep fewer
members than upstream. It replaces each such global object with a proxy
over the reviewed object. Reading, writing, describing, defining,
deleting, or testing an omitted key, and listing the object's own keys,
prints `Test262:HarnessTrap:<token>:<member>` and then throws. Listing
traps because the upstream key list includes every omitted member. Kept
and unknown keys forward to the reviewed object with the same receiver, so
kept members behave as upstream, and a write to a kept member changes only
that member. Every access path reaches the proxy's internal methods, so
the global object, `with`, `eval`, `Function`, `Reflect`, getters,
prototype chains, and enumeration need no case of their own. After arming,
the installer prints `Test262:HarnessArmed:<token>`.

The runner reads each executed variant's standard output before any other
classification. A trap line with the case's token makes the case a
`harness-failure`, and so does a started program that printed no armed
line. Neither can then become a pass or an expected negative. A test
cannot suppress or forge either line, for these reasons:

 -  The token is 128 random bits drawn for each case and shared by its
    variants. It appears only in the installer's own closure, which no
    case code can reach: the proxy hides its handler, and no reachable
    function's source text contains it. A forged line with any other
    token is ordinary program output.
 -  The admitted profile compiles `console.log(...)` as a direct call to
    the runtime's output intrinsic unless a declaration binds `console`;
    `console` is not a run-time value a case can replace. A Script-level
    `console` binding makes the arming call throw before it prints, so
    that case is unarmed.
 -  The installer runs before any statement of the case. Only hoisted
    declarations exist by then, and they rebind names without running
    code, so every intrinsic property the installer reads is unmodified.
    It captures `Proxy`, `TypeError`, and six `Reflect` methods and
    requires each one's `Function.prototype.toString` text to read as
    native code, which no user function's source can. A rebound or
    uninitialized intrinsic leaves the case unarmed. Later replacements
    reach nothing, because the traps call only captured functions, and
    the handler and omitted-key table have null prototypes.
 -  The trap prints before it throws, so catching the throw, finishing in
    a later job, or completing normally cannot remove the line. Standard
    output is flushed whenever the program returns, which every pass and
    every expected negative requires. A process killed by a signal
    flushes nothing more; it is a harness failure when the armed line was
    lost too, and otherwise, when an earlier full buffer carried the
    armed line out but not a later trap line, a semantic failure. It
    never has the clean exit a pass needs or the runtime's final thrown
    identity line an expected negative needs.

A Module case runs its imports before the harness, and a case built with
the test262 host reads `console` from the global object. The runner
withholds a case that loads a trapped object in either form as
`unsupported-profile-feature` with capability `harness-definition`; no
reviewed path is one. A host failure, an owned compile-stage rejection, or
an infrastructure diagnostic does not count as an unarmed start, so those
keep their existing classification.

*tests/test262-harness-trap.test.ts* runs each previously found bypass,
together with the global object, getter, prototype, enumeration,
`Reflect`, `eval`, and `Function` paths, in a fresh realm through
`executeTest262Case`, both as an ordinary case and as a runtime negative
expecting `TypeError`; each is a harness failure. It also covers caught
traps, kept members including `with` over the object, forged marker
lines, hoisted rebinding of each captured intrinsic and of `console`, the
Module and test262-host withholding, and scripted variant outputs: a
pass, a matching negative, a marker without its line break, a killed
process with all, none, or only the armed line of its output, a trap only in a
later variant, and a trap beside an infrastructure diagnostic.
*tests/test262-harness-trap-native.test.ts* builds nine cases natively through
the split-harness executor: kept members pass, a forged marker passes, and the
`with` and Script `var` bypasses, a caught trap, a replaced kept member,
`Object.keys`, a trap caught in a later job, and a hoisted `Proxy` are harness
failures.

The trap U starts at Main `915ec6df8eaf237e807b263c06a4139a8418a940` with
this node's two source commits and the carried records above. A sweep
(*/data/m5c-ihb-redesign-20261029/sweep/*) compared every one of the 27
reviewed includes with upstream and parsed all 31,310 reviewed subset
paths: only *temporalHelpers.js* omits members, and only the three Script
paths in the selection rule load it, so no other reviewed classification
can change. The focused driver from the first U, with its selection fixed
to those three paths, ran under *run-gate.py* in *precheck1/* and
*precheck1-gate/*: 12 split native variants, each armed and none trapped,
all three paths pass, zero retries, and unchanged tracked inputs.
*focused2/* ran the earlier 12 runner-adjacent files plus the two trap
files: 187/187 under Node on the Zig lane, 187/187 under Deno, and the
seven native-building files 54/54 under Node on the host-cc lane.
*focused1/* found two raw-case regressions and a Deno-only type error,
fixed before *focused2/*. Root owns the full UPDATE on this U.
