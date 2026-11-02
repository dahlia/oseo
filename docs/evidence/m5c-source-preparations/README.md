M5c source preparation records
==============================

These records describe how several M5c landings were prepared: sources
composed from more than one node, sources split after a candidate failed,
and batches reobserved on a new base. They moved here verbatim from
[*PLAN-M5C.md*](../../../PLAN-M5C.md#source-preparation-records), which now
states only the plan and links each record by the node it served.

Each record binds its facts to the source commit, tree, and commands it
names. Totals are those of that source's observation, not the current
manifest; the reviewed manifest and
[*docs/m5c-closure/ledger.yaml*](../../m5c-closure/ledger.yaml) hold the
current state.
Links to */data/* name raw packets kept outside the repository. Where a
record refers to a section above or below that is not in this file, it
means a section of *PLAN-M5C.md*, such as its Gates section.


Source preparation after the four-source candidate
--------------------------------------------------

The four-source candidate at `cbe81ee1` did not complete its gates. Root's
D6 decision removes the proper-tail-call implementation from the next source
preparation while retaining that candidate and its original source and
observation refs. The Linux extended-property liveness failure and ordinary
native fixture timeout remain unresolved; neither a semantic counterexample
nor a runner flake was established. No test budget or timeout changes.

Eval, RegExp, and computed Reference retain their source contracts and have
no graph dependency on `proper-tail-calls`. Their source preparation restores
successful Main `52a868c9`'s complete canonical observation set, subset,
closure ledger, exclusion audit, and batch accounting. Its 28,311 reviewed
paths contain 24,234 passes, 2,581 expected negatives, and 1,496 unsupported
results. These are Main observations, not observations of the new source.
All original owners remain, and a new full UPDATE is required. Root later
authorized adding the ready `primitive-wrapper-objects` source as the fourth
unit. Its 40 paths retain Main's unsupported observations and owners. The
TCO-specific strict tail-forwarding registration stays only in the original
Wrapper source; every earlier wrapper assertion and property budget remains.
At that source preparation, all four source nodes remained unlanded. The
optional-call receiver and primitive inherited-Set contracts stay on the exit
path with their unmet prerequisites.

The complete update on clean source `6e54c5d5` finished naturally with exit 0.
It observed all 28,311 reviewed paths: 24,305 passes, 2,581 expected negatives,
and 1,425 unsupported results, with no failure classifications. All 24,234
successful Main passes remain passes. The 71 promotions comprise 26 Eval-value,
five RegExp, and 40 Wrapper paths. Another 49 unsupported observations now
reach the existing run-time Eval source-compilation boundary: 42 retain their
bounded ADR 0016 ownership with refreshed observation digests, and seven
private-class subjects move to `dynamic-source-coverage-remediation` under
the existing fixture-construction assessment. That owner now has 265 paths;
those private name and brand subjects remain inside the claim. That update
added no exclusion, reviewed path, feature, inventory entry, or node landing;
it retained the source preparation's graph state with 44 landed nodes.
Post-observation review and exact candidate CI remain pending.

This publication candidate prospectively marks `eval-intrinsic-value`,
`regexp-pattern-extensions`, `computed-member-reference-key-order`, and
`primitive-wrapper-objects` landed, bringing its graph to 48 landed nodes.
Successful Main `52a868c9` still has 44 landed nodes. The four candidate
transitions take effect only after exact candidate CI succeeds, an equal-tree
merge, and successful main CI for that exact merge commit, as the Gates
section below requires.


Observation batch 15 current-source preparation
-----------------------------------------------

The historical scoped UPDATE observed the 836 reserved paths (456 review
units) from clean B15 input U,
`ca53384ab035661df8fa8e611c9f1959da682caf`, with accepted Source4 R,
`f2c306680af07fea8011e6737d5b21100d9654d0`, as its explicit baseline. It
left U's tree unchanged, so the original B15 result R is also `ca53384a`.
That execution recorded 661 passes, 151 expected negatives, and 24 unsupported
profile features. The B15-only delta was later replayed as `0381835e` onto
the corrected Source4 documentation at `e6994838`; that replay made no new
observations.

The reduced source preparation below retains those B15 records on green
Main `de491133`, whose tree equals Source4 candidate `8387dc9a`. All prior
28,311 records remain unchanged. The combined manifest totals are 29,147
reviewed paths: 24,966 passes, 2,732 expected negatives, and 1,449 unsupported
profile features, with 11,944
inventory paths still unreviewed. The subset retains the original B15 U/R's
pinned revision and 146 supported features. These totals are historical
preparation accounting, not fresh observations of the combined source. They
do not replace the successful Main baseline or land any node. The corrected
classes dependencies and two async-only iterator-protocol removals come from
the preserved B15 admission metadata at `29d5f8fd`. Its old failed-source
observations are historical and were not reused.

The unsupported rows retain source-bound assessments: 16 eval-semantic subjects
retain the existing bounded ADR 0016 approval and resume conditions, while eight
object-literal fixture subjects remain in-claim under dynamic source coverage
remediation. Tags do not authorize exclusions. At that preparation point,
B15 was ready and unlanded. The fresh combined observation and publication
candidate accounting are recorded below; exact candidate and Main CI still
control when the landing becomes effective.


Generator continuation stack source preparation
-----------------------------------------------

The existing `generator-dispatch-stack-charge` node charges resumed bodies
through the callable native-frame model in both standalone and fragment
emission. The contract and focused regression evidence are recorded in
[*PLAN-M5.md*](../../../PLAN-M5.md#generator-continuation-stack-accounting).
Source preparation does not mark the node landed, admit test262 paths, or
replace source reviews, the full UPDATE, and exact-candidate CI gates.


Reduced three-unit source preparation on green Main
---------------------------------------------------

The user-approved reduced preparation starts from successful Main
`de491133b74b2f6893399cb32b7e05e21f6667c1`, tree
`2281f0c3979e2d40aed08659ed8b576d8520aa28`. It retains observation-batch-15,
script-module-declaration-early-error, and generator-dispatch-stack-charge
from preserved reviewed source `eb045685` and equal-tree preparation
`3bc6ab35`. The accepted B15 input is `0381835e`, Script is `a0cebe45`, and
Generator is `04d7d7d4`. Their original commits, authors, review history, and
observation refs remain preserved. The reviewed fragment baseline corrections
at `d4467a6e` and later B15 and Script provenance corrections remain intact.
The split itself has no new model review or review-retention verdict.

The excluded `regexp-property-escape-harness` unit at `98c42049` contributes
no helper, license, test, or family-evidence addition to this tree. Its 453
existing Main paths remain reviewed unsupported under their original owner;
none is removed from the subset, inventory, manifest, or closure ledger.
The node remains ready and unlanded. The user requires Array performance to
land before a later candidate containing that property harness is pushed.
This source-only preparation introduces no Array node or graph dependency.

Of the 29,147 adopted reviewed records, B15's 836 records and 24 bounded
assessments retain the historical B15 observation input and result
`ca53384ab035661df8fa8e611c9f1959da682caf`. The other 28,311 records come
from Main: 24,305 passes, 2,581 expected negatives, and 1,425 unsupported
profile features, all unchanged. These are historical preparation counts,
not fresh observations of this implementation. The original full UPDATE on
`57a2b491bd5619455363c7facfc7bfef98896520` was allowed to finish naturally
in its separate worktree. At that preparation point, actual R adoption was
pending, and R was not identified with U. Root subsequently made the actual
D3 decision and completed the fresh full observation recorded below.

At source preparation, Main's effective 48 landed flags remained unchanged,
and all three selected nodes and the deferred property harness were
unlanded. The split changed no runtime ABI, property budget, seed, deadline,
shard total, toolchain pin, accepted exclusion, or additional admission.


Reduced three-unit observation and publication candidate
--------------------------------------------------------

Root applied D3 to original full input `57a2b491` and actual result
`2626a059`, with reduced source `86c845d0` on green Main `de491133`.
It required a full UPDATE because the removed harness license and
*regExpUtils.js* are runner data. The original four-unit result remains
preserved; none of its 450 deferred RegExp promotions was adopted.

The new complete `mise run test262:update -- --accept-promotions` read
clean input `86c845d00892d1101e0fb863d369c8104e16b30c`.
It ran from 2026-10-24T08:14:16.805768Z to
2026-10-24T09:26:03.185827Z, exiting naturally with zero retries in
4306.380 seconds. Actual result
`8ee78291a9a6f2a54bf90f3f0668fb3ad24c466f` is a distinct normal-hook
observation commit. Its tree equals the input tree because all 6,484
partitions, the index, parity, subset, and other tracked files are
byte-identical. An empty result delta does not substitute for that run.

The fresh manifest records 29,147 paths: 24,966 passes, 2,732 expected
negatives, and 1,449 unsupported results, with no failures or promotions.
All 28,311 old Main records and 24,305 Main passes remain exact. B15's
836 records remain 661 passes, 151 expected negatives, and 24 unsupported
results; all pinned source identities and 24 bounded audit rows are exact.
The 453 deferred RegExp paths retain their original Main unsupported
records. Inventory remains 41,091 paths, with 11,944 still unreviewed.
No existing owner, exclusion, assessment, tag, seed, or budget was rewritten.

Root retained the three source and classification review gates under
D1.9: implementation, interfaces, contracts, and observed row meanings are
unchanged from their accepted sources and preparation. No new model review
or observation from the excluded helper is claimed. D3 on the actual
input/result and clean result commit was neutral on green Main `de491133`.
Full execution and canonical preservation evidence is retained under
*/data/m5c-reduced-source3-full-update-20261024/*.

The publication candidate marks observation-batch-15,
script-module-declaration-early-error, and generator-dispatch-stack-charge
landed together, and makes observation-batch-17 ready. Its graph has 88
nodes, 85 ready, three blocked, none parked, and 51 landed marks. These
marks become effective only after the exact candidate and matching Main
workflows succeed; this record does not claim those CI results in advance.
The property harness stays unlanded and subject to the user's Array
performance publication prerequisite. This candidate adds no Array source,
node, or exclusion and changes no test budgets, seeds, or shard totals.


F3-only source preparation after the Array candidate failure
------------------------------------------------------------

D6.5 removes the failed Array node from the next publication source. This
preparation starts at successful Main `f100ab8e` and restores only existing
node `yield-star-throw-callability`: GetMethod of a noncallable delegate
throw raises TypeError without reading return. Nullish/absent closing,
callable dispatch, abrupt getters, result validation, roots and teardown
retain their original contracts. The independent backend helper asserts
public context balance and imports no Array completion layout or TCO code.

The minimized regression and 88 boundary cases retain independent Node/Deno
references, both native policies, forced collection, positive allocation and
collection counters, and public context balance checks. The added delegated
throw property uses the same checks with seed `0x60001b01`. The original
throw-resumption domain uses default compiler options and the C backend,
comparing native stdout with a constructed expected string. It retains seed
`0x60001b00`; both domains retain 15 cases, 180-second deadlines and replay.
All fourteen pinned B16 subjects remain whole and unadmitted. Their loop
requires pass and four variants per subject through its original runner and
collector settings. Their earlier diagnostic passes are distinct from the
minimized counterexample and establish no new row.

Main's inventory, subset, results, parity, ledger, owners and exclusions
remain byte-identical. The source graph adds only F3 as ready/unlanded:
89 nodes, 86 ready, three blocked and 51 landed. Final landed transitions
and test expectations stay Root-owned. Array, Set, RegExp and TCO source
and admission are not restored. No native, model or Full run is claimed;
exact-source validation, D3, affected review and publication remain pending.


Observation batch 16 source-bound preparation
---------------------------------------------

This branch prepares 467 original rows from the accepted leading
observation on Source4 R db4104, with 407 passes, 41 expected
negatives and 19 unsupported results. No fresh execution or publication is
claimed. The original path/variant/source identities, active mixed-core
owners and bounded existing-record assessments are documented in
[the batch preparation](../../../docs/m5c-graph/observation-batch-16.md).
Independent review, Root integration/D3 and required later observation
remain pending; B18 and its failed partial evidence are untouched.


Observation batch 17 source-bound preparation
---------------------------------------------

This branch prepares 287 original rows from the accepted leading
observation on Source4 R db4104, with 229 passes, 29 expected
negatives and 29 unsupported results. No fresh execution or publication is
claimed. The original path/variant/source identities, active mixed-core
owners and bounded existing-record assessments are documented in
[the batch preparation](../../../docs/m5c-graph/observation-batch-17.md).
Independent review, Root integration/D3 and required later observation
remain pending; B18 and its failed partial evidence are untouched.


Main-only reanchor preparation
------------------------------

The earlier source-bound preparation and leading-run descriptions are
historical evidence on R db4104; that original run failed later in B18.
All original sources, negative phases, assertions and B18 reservations
remain unchanged, with 304 active remediation owners and 17 existing ADR 0016
assessment bindings. They grant no new exclusion or publication approval.

The subsequent Main-only execution used actual clean U
`44d2c4f03d65f8742c043532a9bef909c852cce1`, tree
`b83c495e945e76a508b76aef63e1e8859caeef8d`, with product code exact successful
Main `128d63`. Its single stock scoped command was:

~~~~ sh
mise run test262:update:changed -- \
    --baseline 128d63fcec3a625eca799f5bd9df8b9267b8c6b2
~~~~

It naturally completed with exit 0 on 2026-10-25: all 754 originals freshly
observed, 636 passes, 70 expected negatives and 48 unsupported, pool 8, retries
0. The actual manifest update wrote 0 partitions with 6,688 unchanged
index/partition files; all 29,147 old Main records and all 754 prepared
values/tags remain exact. No expected value, owner, source or failure was
normalized. Two naturally empty owned drains were 15.106281 s apart;
source/dist/tool bindings held.

[Actual command output, argv, bindings and owned drains](/data/m5c-b16-b17-main-scoped-observation-20261025/task_3335cb68b22b/ctx_fb50e986ca95/)
are the fresh execution evidence. This observation-provenance commit records
the genuine zero record delta after that actual U; it does not relabel the
older R as a new U/R. The original leading packet and B18's semantic failure
plus 264 unreached paths remain preserved separately. All 336 B18 paths remain
unreviewed. Root owns actual D3, affected internal/outer review judgment, final
owners/exclusions, candidate gates and publication; no node is marked landed or
final gate claimed here.

The following Set contracts are restored for the standalone source
preparation on Main `cf0902db`. Every historical execution result remains
bound to its named source; none validates this new composition. Fresh
in-memory structural checks and CHECK/hooks are recorded in the source
preparation report. Runtime, reference and native execution, affected review,
fresh full observations and exact candidate/Main gates remain pending.

Earlier Set focus remains source-bound: `43b84b70` supplied the initial
Linux ordinary/host-cc and sanitizer evidence. Source `c4bcb412`, recorded
by `f5eff4b9`, later passed nine whole Linux commands with 23 total
registrations, including twelve Set registrations and seven sanitizer
self tests. Its Set loops derive 344 JavaScript subject/policy invocations
plus four C registrations, which are not framework test counts. The first
supervisor failure and two lock admissions remain historical facts. Neither
source validates the subsequent integrity, identity or Main composition.


Primitive Set C2 Annex boundary repair
--------------------------------------

Exact C2 ceca0314 failed one Mac Node registration with OSEO1001 at line
130 of the unchanged preservedWrites Script, after successful deletion of a
user-defined Object.prototype.__proto__ setter. The complete source matches
independent Node and Deno Script references. This is a semantic candidate
failure, not a deadline or runner-variation diagnosis.

The first repair passed six complete Node/Deno focused commands on Linux
AMD64, with 20 actual test registrations and natural drain. The original
Script, deletion/realm controls and Set resource assertions remain intact.
Those observations bind to 1c96126b. A later independent native review probe
found an additional freeze/seal metadata defect, so the initial passes do
not establish a clean or complete integrity correction.

The current source correction represents private accessor metadata and
unavailable getter/setter halves explicitly. Ordinary and Proxy own-key,
descriptor and integrity paths share presence, attributes and creation order;
core reflection exposes stable native identities while invocation of an
excluded getter/setter body keeps the Annex dependency diagnostic.
Real descriptors, failed deletion, user function identity, trap/abrupt order,
realm isolation, primitive Receiver identity and strict/sloppy Set behavior
retain their core contracts. *PLAN-M5.md* records the bounded representation,
unchanged static layouts and logical policy functions, dynamic snapshot
root counts and exact pending validation limits.

The original arbitrary, seeds, cases, limits and assertions remain; the
existing property adds a fresh bounded integrity subject without replacing
its old program. No classification, exclusion, admission, owner, graph flag
or result changes. Source-only reference checks do not replace focused
native, affected review, fresh full observations or exact candidate/Main
requirements. Root separately owns D6 composition and any later integration
of this repair; Core Ucda contained none of this source.


Set integrity native8 on the fixed no-TCO source
------------------------------------------------

After separate execution authorization, exact clean
`eab6f36600fa8863d17a84533711392e07d9955f`, tree
`2b70928606de831887956979f09e03d179da6db7`, ran these whole commands
once, sequentially, on Linux AMD64. All naturally exited zero: 28 actual
passing registrations, 14 per bootstrap host, with no skipped registrations.

| Whole command                                                                      | Passed | Wall seconds |
| ---------------------------------------------------------------------------------- | -----: | -----------: |
| `node --test tests/annexb-proto-boundary.test.ts`                                  |      9 |    92.387790 |
| `deno test -A tests/annexb-proto-boundary.test.ts`                                 |      9 |    67.327571 |
| `node --test tests/property/m5-annexb-proto-boundary.property.test.ts`             |      1 |    35.376709 |
| `deno test -A tests/property/m5-annexb-proto-boundary.property.test.ts`            |      1 |    37.520988 |
| `node --test tests/property/m5-primitive-receiver-inherited-set.property.test.ts`  |      3 |   111.521138 |
| `deno test -A tests/property/m5-primitive-receiver-inherited-set.property.test.ts` |      3 |   131.585252 |
| `node --test tests/primitive-set-array-interop.test.ts`                            |      1 |     1.903703 |
| `deno test -A tests/primitive-set-array-interop.test.ts`                           |      1 |     4.741917 |

All 8,043 tracked hashes/modes and exact clean HEAD/tree were verified after
each command, followed by natural owned PID/starttick and scope drain with
two observations 15 seconds apart, without signals. Each installed heavy
gate used a fresh capacity prefix with gates=1, choom1000, jobs1, the assigned
Wrapper Zig cache and an external task TMPDIR. Full argv, raw outputs,
framework counts, walls, source inventories and process/scope observations
are sealed under
*/data/m5c-set-integrity-native8-20261025/task\_af9240358454/*.

Original domains, seeds, 12-case budgets, 180/240-second limits, both policies,
forced collection, guard misses/fallbacks, diagnostic oracles and root/realm
retry checks remain. The allocation registrations actually compiled the
old-prefix and full old-property layout assertions on this Linux ABI. The
generic driver passed its seven callback assertions and balanced teardown.
Numeric successful-case counters/sizes and temporary C/MIR/binaries were not
retained as output. Dynamic snapshot key/root counts and costs can differ.

These are ordinary focused command walls, not extended case sums, macOS
measurements, sanitizer proof or cost bounds. The 134-entry 409/296 fallbacks
remain unmeasured estimates; no 900 entry or budget change follows. The
native input remains eab6 even when later evidence documentation has a new
commit identity. Affected review, fresh D3/full observations, outer/owner
checks and exact candidate/Main gates remain pending under Root ownership.


For-in virtual-key consumer correction
--------------------------------------

The later for-in correction preserves the source-bound eab6 native8 facts
above while preparing a changed implementation. Ordinary enumeration must
include enumerable omitted metadata in creation order and retain hidden own
metadata for shadowing; inherited primitive enumeration uses rooted ToObject.
The new fixed programs, independent reference/emission test, allocation-failure
fixture and third fresh Annex property subject are named in *PLAN-M5.md*.
All old programs/oracles, arbitrary inputs, seeds, cases and hard limits stay.

The required focused validation now has 40 actual passing registrations
across two explicitly bound inputs. Whole commands 1-8 passed 28 on clean
`46933fd3ec1a16362350ccc32b5dec27a2d1c496`, tree
`5e37a71dee909cf911e50580f30ff09e81e28f98`. Command 9 then naturally
failed its C fixture's positive collection assertion: the counter required
observation to be enabled. That phase remains 29 passes/one failure;
commands 10-14 never started there. Its raw output, failed C/binary and
natural drain are retained unchanged.

The fixture-only correction on clean
`97f06518d12f5fb9c8af8b8037299c6197b55845`, tree
`8f98244f38d468c0ea058c10ae9ed2c89144e24f`, adds only
`context.observe_specialization = true;`. Every assertion, five-kind sweep,
retry, realm/root check, teardown and default limit remains. All other
8,046 tracked files/modes are exact, including runtime, test programs,
oracles, generators and flags. Under the explicit unchanged-input evidence
rule, commands 1-8 retain their 46933 binding; they were not rerun on 97.
After separate execution GO, the six whole commands 9-14 passed 12 actual
registrations on 97. No all-fourteen-on-97 result is claimed.

| Ordinal | Whole command                                                                      | Source | Passed | Wall seconds |
| ------- | ---------------------------------------------------------------------------------- | ------ | -----: | -----------: |
| 1       | `node --test tests/annexb-proto-boundary.test.ts`                                  | 46933  |      9 |    99.520975 |
| 2       | `deno test -A tests/annexb-proto-boundary.test.ts`                                 | 46933  |      9 |    87.007306 |
| 3       | `node --test tests/property/m5-annexb-proto-boundary.property.test.ts`             | 46933  |      1 |    64.951403 |
| 4       | `deno test -A tests/property/m5-annexb-proto-boundary.property.test.ts`            | 46933  |      1 |    62.961854 |
| 5       | `node --test tests/property/m5-primitive-receiver-inherited-set.property.test.ts`  | 46933  |      3 |   153.286201 |
| 6       | `deno test -A tests/property/m5-primitive-receiver-inherited-set.property.test.ts` | 46933  |      3 |   150.355762 |
| 7       | `node --test tests/primitive-set-array-interop.test.ts`                            | 46933  |      1 |     2.106310 |
| 8       | `deno test -A tests/primitive-set-array-interop.test.ts`                           | 46933  |      1 |     3.455743 |
| 9       | `node --test tests/annexb-for-in.test.ts`                                          | 97f065 |      2 |    14.573503 |
| 10      | `deno test -A tests/annexb-for-in.test.ts`                                         | 97f065 |      2 |    18.845015 |
| 11      | `node --test tests/property/m5-for-in.property.test.ts`                            | 97f065 |      2 |    30.717361 |
| 12      | `deno test -A tests/property/m5-for-in.property.test.ts`                           | 97f065 |      2 |    33.836163 |
| 13      | `node --test tests/property/m5-for-in-object-pattern.property.test.ts`             | 97f065 |      2 |    36.476596 |
| 14      | `deno test -A tests/property/m5-for-in-object-pattern.property.test.ts`            | 97f065 |      2 |    39.730977 |

Each admitted command ran whole once with default limits, original seeds,
cases, policies, forced-GC/assertion/oracle behavior and no filters, scaling
or retry. Every source freeze covered 8,047 hashes/modes and exact clean
HEAD/tree. Natural owned PID/starttick and scope drain passed after each
return, with two observations 15 seconds apart and no signals. Every
installed HEAVY gate used fresh local capacity/gates1, choom1000, jobs1,
the Wrapper cache and an external task TMPDIR; no compiler probe or warmup.
The positive collection assertion passed after the observation correction;
no numeric successful-case counters or sizeof values were printed.

The immutable source-bound packets are
*/data/m5c-set-forin-native14-20261025/task\_af9240358454/* for the original
28 passes and real command 9 failure,
*/data/m5c-set-forin-observation-fix-20261025/task\_af9240358454/* for the
one-line correction and normal hook, and
*/data/m5c-set-forin-followup6-20261025/task\_af9240358454/* for the six
follow-up passes. Their recursive SHA lists contain 133, 170 and 92 entries.
The earlier eab6 packet remains historical evidence on its own input.

These ordinary Linux walls are not extended case sums, macOS measurements,
sanitizer proof, CI gates or scheduling bounds. Dynamic candidate/root
allocations may differ despite unchanged static layouts. The 134-entry
409/296 fallbacks remain unmeasured estimates; no weights, shards, budgets,
Array/F3 contracts, owners or classification data change. Affected review,
fresh observations and exact candidate/Main gates remain pending. The
required Array CI failure blocked that historical bundle, not standalone
Set preparation. Old PASS samples cannot establish a current deadline bound.


Standalone Set source preparation on successful Main
----------------------------------------------------

This private source candidate starts from exact successful Main
`cf0902db05ee8a51a2801f5d70372bfc5ca37b48`. It retains only the complete
Set Receiver, descriptor/integrity, reflected-identity and for-in consumer
unit from fixed source `2992ee7ca78516449e4f569a7f494ebbb6a1743d`.
The two generic interop preparation/helper files use exact `b45d28ea`
versions, preserving the original fifth Script/oracle without TCO assertions.
Main's linear own-index lookup, array truncation, call/GC/realm and backend
source, and public `m5-135` ABI remain. Both actual graph dependencies,
computed-member-reference-key-order and primitive-wrapper-objects, are
already landed; no unlanded Array or TCO prerequisite is introduced.

Source preparation permits only focused pure structural/unit checks and
normal CHECK/hooks. These do not execute the runtime, validate native
layout/allocation/realm/GC assertions, or create observation evidence.
Historical results above retain their exact inputs. Fresh source review,
whole reference/native/sanitizer scopes, actual D3 and full UPDATE, and exact
candidate/Main CI were Root-owned later stages at that initial preparation
step. All inventory paths, reviewed observations, classifications, owners,
exclusions, pins, budgets and graph state then remained exact Main; Set was
ready and unlanded. Publication candidates mark landed prospectively; only
successful equal-tree Main CI makes that state effective.


Reg helper source preparation on fixed Set/Array/B
--------------------------------------------------

This private Reg-only source starts from successful Array/B Main
`d4d81be99c224af282f9e3da5945f6675958e4c5`, tree
`7d8956d5748c925f2e143b937cb1cb82428cbeaf`. Its five Reg helper, BSD
license and test blobs remain exact accepted source
`78bdbd0fe1b05c5d28b0eaf1f7a74a441341d6bf`, which restored them from
`2868cf66250c072e6f0d5072564b3e1ec64df2f4`. The JavaScript-only WKI scan
retains the license in its filesystem inventory without parsing it as code.
No compiler, runtime, Array, Set, TCO, scheduling, Unicode data or baseline
change is imported from that old source.

The helper keeps the original operations, 10,000-code-point chunks, data and
assertions, aggregate matching and symbol fallback, UTF-16 behavior, abrupt
effects and `lastIndex`. The pure suite retains all 441 supplied Unicode 17
property sets and complements. The native suite retains all four whole
registrations and 16 invocations; its presence is not a current execution.
The original 44 whole-Script baseline remains blob
`43a6e39af8dcd1695024e7d0a0b3e168d773ea19`. All Set/Array/B source and
contracts, observations, subset expectations, ledger owners, feature pins,
profile classes outside the Reg hunks, seeds and budgets stayed intact at
that source preparation step.

At that source preparation step, all 453 inherited helper-owned rows
remained harness-definition unsupported:
441 property-escape paths and 12 CharacterClassEscapes paths. The old Full
on source `2868cf66`, result `f68583d5`, observed 450 promotions and three
matcher-limit results under its different compiler/runtime. Those records,
promotions and owner transfers are not copied here. New classifications and
any exact remaining matcher ownership require Root's fresh actual Full and
judgment; Array performance alone establishes no matcher repair or exclusion.
The historical prospective matcher plan and its graph/test-count changes
were deferred to Root's observation and ownership phase.

Root confirmed Array Main `d4d81be9`, all 79 jobs and workflow success,
with the exact candidate tree, before authorizing this port. Main's 90-node,
56-landed graph and B's unchanged routing, aggregate, budgets and 137-file
property inventory remain. No source, admission, observation or ownership
from the separate TCO option enters this Reg-only preparation.

All production packages, runner interfaces, toolchain and input data are
compared with original accepted source `78bdbd0f`. Root owns D1.9 retention
of that source's internal12, outer10 and author Native4/16 after the exact
fidelity proof; no new model or Native is implied by a provenance port.
At source preparation, Reg still required a fresh Full on its actual source.
Old Full, review, Native and cost observations retain their original sources.
Root owns review retention, later execution and publication.


Reg helper fresh result and bounded matcher ownership
-----------------------------------------------------

The normal Full read clean Reg-only U
`6e5ebf2effdcedc5f0205e1af22f71606d7b9726`, tree
`1675bcb961d0a54b3dadeddd2d50cea307a42bac`, on successful Main
`d4d81be99c224af282f9e3da5945f6675958e4c5`. The stock
`mise run test262:update -- --accept-promotions` ran from
2026-10-26T22:52:48.301365Z to 2026-10-27T00:42:18.272375Z and exited
naturally zero after 6,569.970938 seconds. Root accepted the preserved raw
outputs and two empty descendant drains before result preparation. The
source-qualified packet is *FULL-RAW-REPORT.md* under
[the source-bound packet](/data/m5c-regexp-source-finisher-20261027/task_b37691673a89/ctx_5a047fc6c8f8/solo-source-preparation/FULL-RAW-REPORT.md).

Actual totals are 29,901 reviewed, 26,052 passes, 2,802 expected negatives
and 1,047 unsupported, with no semantic, harness or infrastructure failure.
Exactly 450 paths promoted: all 441 property escapes and nine
CharacterClassEscapes, each with all four actual variants. All other 29,448
complete records remain byte-identical to U, and all 11,190 unreviewed paths
remain unobserved. The original three positive non-digit, non-whitespace
and non-word CharacterClassEscapes subjects retain matcher-limit diagnostics.
Each contains only the first deciding non-strict/disabled variant; no later
strictness, policy or standard/Unicode-pattern result is inferred.

Canonical ledger derivation makes the 450 passes ordinary observations.
At result preparation, only the three remaining unsupported owners moved
to the then-blocked, unlanded
*regexp-anchored-repeat-state-remediation* node. Its linked worknote
preserves the bounded historical plan and qualifies its static undo-trail
lead against unchanged matcher sources. This adds no runtime repair,
accepted exclusion or predicted promotion. That result-preparation graph
had 56 landed, 91 nodes, 87 ready and four blocked.

The preserved publication candidate `98460f7c` instead records 91 nodes,
88 ready, three blocked and 57 prospective landed marks. It marks Reg
landed prospectively and the remediation ready and unlanded. These marks
are not evidence of successful exact merge/Main CI; Root owns effective
landing and final publication state.

This single Linux Full is neither a current hosted-CI cost measurement nor
a macOS observation. The 1,803 actual Reg variants are 450 times four plus
three deciding variants. The unchanged reviewed path order still partitions
into eight Linux and twelve macOS test262 shards. Current per-shard duration,
variance and Mac cost remain unknown until source-qualified candidate CI.
The helper adds no property file or weight change; B's 79-job workflow,
40 Mac jobs, 137 property files and all budgets remain unchanged. Actual
result/ownership internal and outer review, D3, final CHECK/canonical and
exact candidate/Main gates remain Root-owned pending work.


Historical TCO source on the Array base
---------------------------------------

Initial preparation composed TCO `145819bd` on Set candidate
`a111c31eacb22f07ee514dab4372504b7470b161`, tree
`072862e2760631542d41cf777d4e75c5d6014924`. That candidate failed CI:
the prototype-root allocation injection still matched `3u` instead of
Set's actual `4u`. Its provisional TCO child `54973309` remains preserved.

The complete owned TCO delta `9945b7b8` to `b1eaeff0` is now prepared on
Array U`cccb7195c1eb01a3963ffa043bafe045c333ff73`, tree
`89d907b342885089374ffadd53eff606d31e6131`. All thirteen Array paths remain
exact, including three runtime hunks, six coverage files, graph contract
and the final source-qualified worknote. Set's locator correction and both
Root state-paragraph corrections remain. TCO `1a305507`/incomplete32 and
`b1eaeff0`/normal33 keep their original targets and outcomes; neither is
new-source execution or a complete admission gate.

At initial preparation, successful effective Main was `cf0902db` with 54
landed nodes. The base has prospective Set55; Array and TCO remain unlanded.
Root's then-running standalone Array Full used immutable `cccb7195`,
which excluded TCO and had 146 features. It is distinct from the later
combined-source U`68e298a9` Full recorded below. All fifteen TCO production
postimages stay exact
`b1eaeff0`; thirteen product postimages
remain exact `145819bd`/`baf6f7d7`. The header and Proxy merge only the TCO
record declarations and two Call forwarding changes over Set's omitted
accessor/signature/descriptor/identity/invariant state. Set/Get/descriptor
traps retain post-call work; Construct is unchanged. GC `795d3c82` remains
origin, not `baf6f7d7` or `833c99ef` ancestry; `ed7b5ddd` changed prose only.

The original Main chunk/include/static/coordinate/frame contracts and both
completion-reachability repairs remain. Complete Set Receiver/key/RHS/
wrapper roots surround the setter's public call, which drains tail steps
before returning normal; assignment returns its original RHS. The existing
Set fifth Script/oracle retains all callbacks and source bytes, with exact
positive tail/owner/host/fragment assertions replacing deferred no-tail
checks. All four TCO programs, generator frame guards, policies and budgets
remain. No old fifth-case replacement, rejected Array packing or B8/RegExp
source is imported. The guarded Array lookup/insertion/truncation paths
are preserved, including all generic fallbacks, coercion and rollback.

Their interactions with apply argument-list roots, primitive Receiver/RHS,
pending tail arguments, reentry and collector ownership received bounded
D1.9 interaction review and the U`68e298a9` focused execution below. The Array
worknote's compiler, Native and performance statements
speak to its named standalone sources, including `cccb7195` before this TCO
overlay. They are not new combined-source claims. Set U`071e447d`/R`868da1d6`,
TCO `145819bd` checks, `b1eaeff0` reviews and frozen older Array proofs keep
their exact sources. Pure checks, current-source Native, actual D3/Full/R,
outer review and exact candidate/Main gates remain separate Root phases.

The faithful helper keeps MAX\_ITERATIONS 100,000 with its original license.
Only its runner entry and the one source feature admission return. The two
reviewed subjects now have actual U`68e298a9` pass observations, with
exactly their two expected classifications promoted by the original Full.
The other 29,899 stored records remain byte-identical. The derived ledger
moves these two paths to observation ownership; inventory, policy, ADRs
and all other ownership assignments remain unchanged. The historical
Array-bound author runs below do not validate this composition; the current
U`68e298a9` evidence is separate and supplies no candidate/Main gate pass.
The other 33 TCO paths remain unreviewed under batch32. The accepted B32
source packet still covers 199 unreviewed
paths/191 units; it grants no execution, admission or observation authority
here.

Historical internal24 Fable/outer14 Astra completed on `833c99ef`, retaining
prior `05c1f074` scopes under D1.9. Native10's 76 passing registrations and
935 hashes belong to `05c1f074`; matching donor/test bytes do not certify this
new composition. Shared internal26 was a clean Set-profile review counted
25/cap25, not new TCO execution or permission for another review. The old
`1fd374f6`/CI40165660431 liveness interruption at 39/60 remains failed
incomplete coverage, without a proven semantic counterexample, runner
variance, new-source performance benefit or deadline margin.

Root owns affected independent review and its permission, later source
validation, actual D3, full observation, exact candidate/Main gates and
adoption. The focused results below belong only to their fixed source; they
are separate from restoration and this Main-specific composition.


Historical focused TCO execution on Array 353a9f17
--------------------------------------------------

Six serial command vectors completed naturally with exit zero on
`353a9f17631b808a5131f49fcff0b16396aa72f4`, tree
`3f35347e3c680523283a978e2658520340d6e9ab`. Product, test and stored
observation inputs stayed unchanged across these runs. The table gives
actual UTC start/end times on 2026-10-26 and whole-command wall seconds,
including normal build dependencies where present. Counts are framework
registrations and overlap between vectors; they are not unique program or
standards-path totals. Each linked command record retains the exact argv;
the adjacent raw output retains the original framework results.

| Vector and command record                                                                                                                                          | Framework result           | UTC start → end                   |  Wall seconds | Raw output                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Runtime C, Node](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/runtime-c-native01/whole.json)                             | 3 passed                   | 06:42:46.034303 → 06:43:02.837694 |  16.803306844 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/runtime-c-native01/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/runtime-c-native01/whole.stderr)           |
| [Seven files, Node/Zig](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native02-node/whole.json)                    | 27 passed                  | 07:01:43.038141 → 07:03:35.406845 | 112.368594562 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native02-node/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native02-node/whole.stderr)     |
| [Seven files, Deno/Zig](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native03-deno/whole.json)                    | 27 passed                  | 07:06:02.940529 → 07:08:18.225431 | 135.284805903 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native03-deno/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/backend-native03-deno/whole.stderr)     |
| [Sanitizer self then seven files, Node/host-cc](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused04-hostcc/whole.json) | 7 self + 27 focused passed | 07:24:18.929764 → 07:26:46.918346 | 147.988489038 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused04-hostcc/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused04-hostcc/whole.stderr)               |
| [Ordinary TCO property, Node/Zig](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused05-property-node/whole.json)        | 4 passed                   | 07:32:43.187008 → 07:33:12.879089 |  29.692002525 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused05-property-node/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused05-property-node/whole.stderr) |
| [Ordinary TCO property, Deno/Zig](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused06-property-deno/whole.json)        | 4 passed                   | 07:34:30.262674 → 07:35:02.645763 |  32.383001814 | [stdout](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused06-property-deno/whole.stdout), [stderr](/data/m5c-tco-on-array-source-preparation-20261026/task_5050fd25ca66/ctx_001ac7c9581a/focused06-property-deno/whole.stderr) |

The runtime-C command used `mise run test:node --` with
*tests/runtime-tail-calls.test.ts*, *tests/runtime-ephemeron.test.ts* and
*tests/runtime-weak-collection.test.ts*. It compiled handwritten C fixtures
for Linux AMD64 with the original ASan/UBSan flags and ordinary/forced-GC
weak-record checks. Its two AArch64 Linux outputs were compile-link checks,
not executions. It does not exercise backend-generated JavaScript bodies.

The seven-file vectors retain this ordered whole-file input set:

~~~~ text
tests/proper-tail-calls.test.ts
tests/test262-tail-call-optimization.test.ts
tests/tco-generator-interop.test.ts
tests/primitive-wrapper-objects.test.ts
tests/materialized-body-native.test.ts
tests/completion-target-native.test.ts
tests/yield-star-throw-callability.test.ts
~~~~

The Node vector used `mise run test:node --`; Deno used `deno test -A`.
The host-cc vector used the failclosed shell chain

~~~~ sh
mise run test:sanitizer:self &&
  env OSEO_NATIVE_TOOLCHAIN=host-cc mise run test:node --
~~~~

with the same seven files. Its seven selftests include four genuine positive
ASan/UBSan runtime/generated-C detections and three separate fake compiler
selection controls. The focused host-cc run selected Clang and retained its
normal sanitizer checks. All focused native execution targets Linux AMD64.
The ordinary completion AArch64 cross-link remains a compile-link check;
its existing host-cc guard omits that cross-link in the sanitizer vector.
No macOS native execution is supplied by these runs.

The whole files retain both specialization policies, their original forced
collection and root/frame/balance/resource guards, all original upstream
variants and materialized physical-unit assertions. Node versus Deno names
the test framework. Under Deno, the TCO-subject, interop and F3 files select
DenoHost; proper-tail, wrapper, materialized and completion files literally
create NodeHost. Reference commands retain their original selection:
`process.execPath` follows the framework executable, while explicit Node and
Deno references keep their named executable. Framework counts establish no
global equivalence between those host paths or other semantic families.

The property vectors used `mise run test:node --` and `deno test -A` on the
single *tests/property/m5-proper-tail-calls.property.test.ts* file. Each ran
three native domains and one pure generator-contract registration. They
retain the original 8/8/6 draws, seeds `0x60008900` through `0x60008902`,
small size, 500-depth/6-extra-argument limits, shrinking/replay and 180-second
per-domain interruption. Both policies and enabled forced collection remain
active. No property override was set. The file literally creates NodeHost
under both frameworks. These ordinary runs do not complete the historical
failed extended 39/60 run, establish new scheduling weights or prove deadline
margin. The frame ceiling, call limit and host-cc charge remain unchanged.

At that historical checkpoint, focused execution included the two original
pinned TCO subjects without changing their unsupported expectations or
stored records. All 29,901 rows, parity, owners, the 147-feature source list
and seeds/budgets remained unchanged. `TCO-ADMIT-GATE` remained open pending
fresh Full observations, actual promotions/R and affected review.
Full UPDATE on that old Array-bound source did not run.
Native935 remains evidence on `05c1f074`; these results cannot be relabeled
as evidence on a later Array source or a completed internal review gate.


Historical U68 TCO observations on the Array source
---------------------------------------------------

The current execution source is
`68e298a9a96a6d22dc2e33b9e70b7c6a86720e41`, tree
`dcca1b0bf57b63d0446fab54c676f42a2ca19739`, directly on Array U`cccb7195`.
Six focused whole-command vectors completed naturally on that fixed source:
runtime C 3 registrations; Node integration 27; Deno integration 27;
sanitizer self 7 followed by host-cc integration 28; ordinary Node
properties 5; ordinary Deno properties 5. These overlapping framework counts
include the whole Array property where named; they are not unique programs.
All original TCO and Array domains, cases, seeds, budgets, policies, source
oracles and shrinking/replay controls remained unchanged.

The original whole Full UPDATE then ran as Root's explicit D10.1 leading
execution, while the admission data finding awaited actual observations.
It completed naturally on Linux AMD64 with exit zero, pool eight and zero
retries. It observed all 29,901 reviewed paths: 25,604 pass, 2,802 expected
negatives, 1,495 unsupported, and zero semantic, harness or infrastructure
failures. Only the two owned strict tagged-template subjects changed from
unsupported to pass. Their recorded execution retains the original helper,
both specialization policies and the pinned source revision. No reviewed
path was removed; all other 29,899 result records are byte-identical.
The five generated output changes are preserved as actual Full output,
without regeneration or normalization by hand.

[*Current U68 evidence*](../proper-tail-calls-u68-20261027.md)
records the commands, source, raw locations, timing and limits. Actual Full
observations resolve the prior stale-data condition; the admission data
gate closes only after its result commit and required affected reviews.
Candidate/Main gates and adoption remain separate Root work. No old Native
proof, mixed Reg/TCO promotion, unreviewed batch32 subject, macOS execution
or failed extended interruption is relabeled as current-source evidence.


TCO source preparation on the fixed Reg candidate
-------------------------------------------------

This D10.4 preparation stacks final bitmap source `f5bdd44d` on Reg
publication candidate `98460f7c2b6605850c0889aea6efbe70dc24d27a`, tree
`d6723be80209aca0fcf0606c5c3e5959f152ad0c`, based on successful Main
`d4d81be99c224af282f9e3da5945f6675958e4c5`. Reg is prospective until
Root verifies its exact candidate/merge Main CI; TCO stays unlanded.
Compiler/runtime, tests, generators, the accepted native runner logger
and ABI `m5-139` retain final f5 source. The separate leaf proposal is absent.

The source admission adds only the original U`68e298a9`
`tail-call-optimization` entry. Reg's 29,901 complete records, 450 observed
promotions, three matcher-limit owners, 41,091 ledger paths and 11,190
unreviewed reservations stayed exact at source preparation. Both TCO path
expectations then remained unsupported until a new Full actually observed
promotions. No historical
R`7cb0ce0d` output or publication state is transplanted. The approved
sanitizer property job backstop remains 60 minutes; ordinary fixture
limits, seeds, budgets, depths and shard totals remain unchanged.

The evidence contract records source-bound f5 author checks and their
limits. They did not run on this composition. New implementation inputs
require fresh Full observations under D3; Root owns the actual decision,
execution, affected independent review and publication.

After Root accepted the source review of U`e2dba363`, one unchanged
`mise run test262:update -- --accept-promotions` ran on that clean source
from 2026-10-27T04:28:26Z to 06:22:20Z and exited zero. It observed all
29,901 reviewed paths: 26,054 pass, 2,802 expected negatives and 1,045
unsupported, with zero retries. Exactly the two owned tagged-template paths
were promoted from unsupported to pass, with no demotion. The result commit
keeps that output unchanged and derives ledger ownership, batch counts and
the graph baseline from it; the node stays unlanded pending affected review
and exact candidate/Main gates. The
[TCO evidence contract](../proper-tail-calls-u68-20261027.md)
records the raw packet and limits.
