RegExp helper observations and bounded matcher owner
====================================================

The fresh Reg-only Full read U
`6e5ebf2effdcedc5f0205e1af22f71606d7b9726`, tree
`1675bcb961d0a54b3dadeddd2d50cea307a42bac`, on successful Array/B Main
`d4d81be99c224af282f9e3da5945f6675958e4c5`. Its five helper, BSD license
and test blobs match accepted source `78bdbd0f`; the WKI scan parses only
JavaScript while retaining the license in its inventory. Main's Set/Array/B
implementation and contracts remain unchanged, including public `m5-135`.
The helper retains original Unicode 17 data, 10,000-code-point chunks,
assertions, variants and generic fallback. No TCO source or observation
enters this independent Reg-only result.

The bounded remediation plan below is retained from old Reg U
`2868cf66250c072e6f0d5072564b3e1ec64df2f4` and result
`f68583d5df8ce7ee3e88fe94d6688ea4482d223d`. Their 2026-10-26 Full also
observed 450 promotions and three matcher-limit subjects, under its own
compiler/runtime. Its reviews, Native, Full and old publication narrative
remain historical; none establishes the present result. The preliminary
mixed Set/Reg/TCO U `afb6bf78` and R `3981a380`, and old owner assignment
`2b95055d`, likewise supply no current observation or ownership approval.


Fresh normal Full and exact ownership
-------------------------------------

The stock `mise run test262:update -- --accept-promotions` ran from
2026-10-26T22:52:48.301365Z to 2026-10-27T00:42:18.272375Z and exited
naturally zero in 6,569.970938 seconds. It observed all 29,901 reviewed
paths: 26,052 passes, 2,802 expected negatives and 1,047 unsupported, with
no semantic, harness or infrastructure failure. Exactly 450 RegExp paths
promoted: all 441 property-escape paths and nine CharacterClassEscapes
paths, each in all four actual variants. All other 29,448 complete records
remain byte-identical to U. All 11,190 unreviewed paths remain unobserved.

The exact three remaining original subjects are:

| Original pinned test262 path                                                                                | Current assembled diagnostic |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| *test/built-ins/RegExp/CharacterClassEscapes/character-class-non-digit-class-escape-positive-cases.js*      | 235:8                        |
| *test/built-ins/RegExp/CharacterClassEscapes/character-class-non-whitespace-class-escape-positive-cases.js* | 244:8                        |
| *test/built-ins/RegExp/CharacterClassEscapes/character-class-non-word-class-escape-positive-cases.js*       | 239:8                        |

The pin is `f2d1435644797268dca1f7988cad5a4e89ccd8d2`. Each current record
contains only the first deciding non-strict/disabled variant, exit 1, empty
stdout and `OSEO2001`: “Regular expression matching exceeds the reviewed
matcher limit.” Its capability is `regexp-matcher-limit`. No later
strictness or policy variant ran. The unchanged originals test standard,
`u` and `v` patterns in that order; the diagnostic establishes no later-pattern
outcome or particular internal limit producer. The actual Reg union contains
1,803 variants, not the 1,812 conditional four-per-path planning count.

Root accepted the actual raw outputs, complete generated union, exact source
and two empty descendant drains on 2026-10-27 before result preparation.
The retained *FULL-RAW-REPORT.md*, *FULL-RAW-AUDIT.json* and stock raw outputs
bind task `task_b37691673a89`, dispatch `ctx_5a047fc6c8f8`, under
[the source-bound packet](/data/m5c-regexp-source-finisher-20261027/task_b37691673a89/ctx_5a047fc6c8f8/solo-source-preparation/FULL-RAW-REPORT.md).

Canonical ledger derivation makes the 450 passes ordinary observations.
Only the three remaining unsupported owners then transfer to
`node:regexp-anchored-repeat-state-remediation`. All other 41,088 entries
from that fresh derived ledger remain unchanged. The owner is blocked and
unlanded, depends on the helper and ownership audit, and is an exit-audit
prerequisite. Current independent manifest publishers have explicit
collisions. Existing nodes retain their landing marks and status. This is
active bounded remediation, with no exclusion, runtime repair or predicted
promotion; dependency tags remain remediation prerequisites.


Static lead and bounded candidate
---------------------------------

The original subjects' calculated input lengths are 2,162,678, 2,162,663 and
2,162,625 UTF-16 units. The strongest source-first lead is avoidable undo-trail
growth: initial writes plus two writes per repeat enter predict exhaustion
of the 4,194,304-entry trail on iteration 2,097,152, before the step/backtrack
bounds. These are static calculations. The actual diagnostic names no internal
counter, and no measured subject length or counter trace proves the lead.

The sources below are byte- and mode-identical between old result
`f68583d5`, Full input U `6e5ebf2e` and result `376067d9`.

| Role                   | Source path                                            | Git blob                                   |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------ |
| TypeScript matcher     | *packages/compiler/src/regexp-matcher.ts*              | `adcc1f802c56d90db103456752cb74fa8f9f6070` |
| C pattern emitter      | *packages/backend-c/src/regexp-program.ts*             | `b61fbc005325950a6b36577f3eea9fa8a9c3943a` |
| C wrapper              | *packages/runtime-c/native/runtime\_regexp.c*          | `9ed4f73c4ff958fac59844880e73d113aaf19e2a` |
| C repeat/undo executor | *packages/runtime-c/native/runtime\_regexp\_matcher.c* | `b5d45fb3f8cb7d43cbc9f0f0f7c9d7ebecfa9b81` |

The repeat/undo executor identity preserves the static lead's source basis;
it does not measure which internal counter failed.

A candidate remedy is a deterministic scan for a proved complete-pattern
shape: start anchor, one capture-free greedy single-consuming-set `+`, and
terminal end anchor without multiline mode, initially with no flags or
`u`/`v`. Prove applicability before exposing partial state. Non-multiline
`$` succeeds only at InputLength; a line-terminator boundary is available
only in multiline mode, which is outside this initial selected shape.
Preserve actual result spans generally rather than imposing full-input
consumption on other matcher shapes. Preserve `lastIndex`, surrogate and
code-point traversal, explicit limit outcomes and deterministic work charging.

Mirror selection and semantics in both TypeScript and C executors. Every
guard miss selects the existing ordered matcher before partial state. Keep
all existing numeric limits and counters; do not raise caps, relax timeouts,
shrink or split original inputs, rewrite assertions, delegate to a host matcher
or redesign the artifact. A broader or different remedy needs Root's scope
judgment. This preparation implements no matcher path.


Required evidence and review scope
----------------------------------

 -  Observe all three exact originals with unchanged data and assertions,
    every standard/`u`/`v` pattern, both strictness modes and both
    specialization policies. No future classification is assumed.
 -  Add independent small set-boundary and surrogate cases, literal/dynamic
    equivalence, result spans, assertion and `lastIndex` behavior, and large
    inputs around the derived trail threshold without lowering budgets.
 -  Prove applicability hits and generic fallback for captures, suffix
    continuations, lazy or nested repetitions, lookaround, backreferences
    and unsupported shapes or flags. Retain ordered step/backtrack/trail
    limit and allocation-failure evidence and define selected-path charging.
 -  Complete affected differential/generated, native, sanitizer and
    forced-collection evidence and actual source-bound conformance gates.
    The unchanged helper suites are focused evidence when executed, not a
    replacement for those obligations or for a fresh Full.


D1.9 and remaining publication evidence
---------------------------------------

Root retained source internal12, outer10 and author Native4/16 from exact
accepted source `78bdbd0f` after the solo port's interface and physical-input
fidelity proof. Those Native invocations cover the four whole registrations,
not all 453 standards subjects. The 44 whole-Script baseline remains exact
blob `43a6e39af8dcd1695024e7d0a0b3e168d773ea19`. Result preparation changes
no helper, program, matcher, runtime, toolchain or scheduling input.

The new required review concerns actual observations, classifications and
canonical derivation; three owner assignments and their note; the bounded
owner/delivers, exit edge and collisions; Reg family and PLAN contracts; and
source-qualified cost and variant claims. Review interfaces include the
unchanged helper/Array/apply/call/root/abrupt boundaries and both matcher
executors' limits, without supplying historical review reports as inputs.
Later matcher implementation must review both executors' repeat/write/undo/
search and character-width contracts, recognizer/fallback, result/assertion/
lastIndex/resource semantics and normative resource contracts. This worknote
adds no review approval.

Array Main `d4d81be9` completed all 79 jobs and workflow SUCCESS with the
exact candidate tree before this source port. Main remains 56 landed and
90 nodes; this prepared result adds one blocked owner, making 91 nodes,
87 ready and four blocked, without marking the helper landed. The separate
TCO candidate contributes no source or result to this packet. Root owns D3,
actual result/ownership internal and outer review, final CHECK/canonical,
source-qualified per-shard cost assessment and exact candidate/Main gates.

The 109.499515-minute stock Full is one Linux local observation, not a
hosted-CI forecast or a causal speedup comparison. Original helper timings
and the faithful private comparison remain qualified by their exact source,
cache, concurrency and tracing. The unchanged reviewed path order has eight
Linux and twelve Mac test262 shards; exact per-shard current costs, Mac
behavior, runner mix, variability and critical-path margin remain unknown.
The unchanged helper adds no property file or weight. B retains 79 jobs,
40 Mac jobs and the 137-file property inventory with unchanged seeds, cases,
policies and deadlines. Root will use exact-source candidate job logs and
stock failed-job replay after diagnosis; no lowered budget, new shard total,
benchmark, Native duplicate or Full duplicate is authorized by this plan.


2026-10-31 bounded implementation
---------------------------------

The implementation starts at Main `8f4202628356e172e1b4093a371d086070619de3`
without rebasing. Its three owned checked-in records still classify the
originals as `unsupported-profile-feature` with `regexp-matcher-limit`;
only non-strict/disabled is stored for each. No subset, result, ledger,
owner or landed-state change is made by this implementation.

Both executors prove the complete eleven-instruction artifact before
selecting a constant-state `^set+$` scan. The proof checks zero captures,
four registers, all save slots, a forward consume of one existing set,
the greedy minimum-one/unbounded repeat, its counter and position links,
every continuation, non-multiline edges and the final accept/fail layout.
The exact flag allowlist is empty, `u`, or `v`; the C wrapper supplies
eligibility from the artifact mask because the program does not retain
all flags. Root confirmed this bound through the dispatch question on
2026-10-31. Other flags and shapes take the unchanged ordered executor
before any scan state is exposed.

A selected attempt charges one entry step, one per tested character and
one terminal decision at input exhaustion, under the unchanged step limit.
It uses no undo-trail or backtrack entries and allocates no matcher work
area. Capture/result allocation remains owned by the wrapper and is swept
for failure and retry in the existing heap fixture. Ordered stack/trail/
step limits and their counters remain unchanged. The scan advances by
code unit or code point according to the program, returns actual UTF-16
spans, rejects empty input, and requires InputLength for non-multiline `$`.
The wrapper retains ordinary `lastIndex` conversion and property effects;
flags that write it remain on the ordered path.

Fixed compiler tests cover set and line-terminator boundaries, paired and
lone surrogates, exact step accounting, fallback guards and input lengths
2,097,151 through 2,097,153. The existing matcher property family adds seed
`0x60004d02` for scan/forced-ordered span comparisons. The existing native
execution family adds seed `0x60005004` for literal/dynamic comparisons
against Node.js and Deno, both policies, false hints and forced collection.
No new property file, seed block, case-budget override or shard weight is
introduced. The new native fixture is registered in both forced-collection
lists. The original-subject native suite adds all three exact upstream
paths, preserving data, assertions and four actual execution variants.

Focused execution, internal review and Root's D3/UPDATE remain separate
requirements; their results are recorded below when obtained. No current
promotion, complete review or publication is inferred from source changes.


Initial focused checks
----------------------

The compiler matcher suites and both existing matcher property domains,
plus the new forced-ordered domain, passed 53 registrations. The capacity-
wrapped serial `mise run check` exited zero; the compatibility ratchet
reported zero overrides. Logs are under
*/data/m5c-d17-20261031/regexanchor/* and its sibling unit logs.

The first native vector observed all three original subjects as passes,
each with all four variants, but the vector as a whole failed because the
two new literal tests used the data-free frontend. Those tests now select
the production CLI frontend, which links the required Unicode data. This
is a test-composition correction, not a matcher or upstream-source change.
The failed vector is retained as *native-zig.stdout* and is not a clean
gate. A final vector on the corrected source is required below.

The next vector passed 13 of 14 registrations, including the updated C heap
controls, both native policies in the generated domain, and all original
subjects. Its fixed fixture reached the existing located dynamic `v`
class-set boundary for `new RegExp("^[a]+$", "v")`; that rejection is
preserved. The large literal/source comparison now uses `^a+$`, which has
the same single-consuming-set artifact and is dynamically admitted under
all three allowed flag strings. The native generator constructs `v` cases
from its admitted atom vocabulary directly; bracket class sets remain in
its other flag modes and in fixed ahead-of-time `v` evidence. It does not
filter generated draws or weaken an assertion. The failed vector remains
*native-zig-final.stdout*; its passing C heap and upstream scopes have
unchanged inputs after this test-only correction.


Final focused validation
------------------------

All required affected scopes passed with their ordinary seeds, cases,
policies and deadlines. The pure matcher/unit/property vector passed 53
registrations. The fast non-native root suite passed all 833 registrations
across 58 files, with no failure, skip or cancellation.

The final combined heavy gate ran from 2026-10-30T18:05:07Z to 18:07:52Z
and exited zero. Its host-cc lane passed all seven sanitizer self-tests,
then all fourteen registrations across the native execution property file,
original RegExp helper/subject file and runtime heap file. The corrected
whole execution property file then passed all six registrations on Zig.
The Zig runtime heap and original-subject scopes, eight registrations,
retain their passing observations in the earlier vector: their source and
test inputs are unchanged. This is scoped retention, not a claim that the
earlier failed fourteen-registration vector was clean. The retained source
and test digest comparison reported no changed validation inputs.

Both lanes observed each of the three exact owned originals as a pass in
all four actual strictness/policy variants. Their standard, `u` and `v`
patterns, data and assertions are unchanged. These are focused executions,
not a test262 UPDATE or an edit to checked-in classifications. The C heap
scope includes the new selected allocation-failure/retry sweep and the
unchanged-default-limit controls for selected and ordered execution; it
adds no counter trace for the original subjects.

The final gate metadata is *remaining-heavy.json*. Raw outputs are
*hostcc-clean.stdout*, *hostcc-clean.stderr*, *property-zig-clean.stdout*
and *property-zig-clean.stderr* under the external evidence directory
above. *non-native.stdout* records the fast suite. The earlier failed
vectors remain intact. No extended property or whole repository test task
was run. Internal review and Root's D3/UPDATE remain pending at this source
commit; Root owns any result changes and publication.
