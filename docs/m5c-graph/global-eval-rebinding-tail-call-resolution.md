Rebound global eval tail-call resolution
========================================

The source assigns its statically declared ordinary function to the global
eval binding, then calls that function recursively with numeric arguments.
It never invokes source evaluation. At the original Main base
`1f3ade138ea7cbee80b2d62940e8f497db2bc1a2`, its stored classification
was `unsupported-profile-feature`, with `OSEO1001: Unknown binding 'eval'.` in
*tests/test262/results/language/expressions/64.yaml*. A fresh compile probe
reproduced that rejection at the recursive call.

Original path:

 -  `test/language/expressions/call/tco-non-eval-global.js`

Pinned source SHA-256:
`f94189f89e34ede682bb5745abb28cb8dd75b60e1d5011037bfbc49b737d1cce`.
The source is test262 revision
`f2d1435644797268dca1f7988cad5a4e89ccd8d2`.

Root approved this bounded owner after the first internal review round.
The ordinary binding/call rejection grants no ADR exclusion and does not
change ADR 0016. Repair the reference resolution without allowing dynamic
source compilation, then re-observe the exact original.

[Raw observations](/data/m5c-b23-b28-b29-b32-20261029/task_96812c4ba689/ctx_b3822e0f35ef/all-observations.json)
retain the historical unsupported result. Its dynamic-source tag and former
exclusion assessment were removed without rewriting that observation.


Semantic bundle prerequisite
----------------------------

Root authorized moving this worker onto semantic bundle candidate
`e631083413daa87cb4d37acf96553ce8411e7883`, which is the base for this
node's checks and internal review. That candidate contains the resolver
change from `39f0c47e3`: direct calls read the current global property
instead of rejecting the identifier `eval` before looking up its value.
This node adds no duplicate resolver or runtime change.

The original Script assigns `f` to `eval` in sloppy top-level code. Its
recursive function is strict and calls `eval(n - 1)`. Since the value is
`f`, not `%eval%`, EvaluateCall uses the ordinary dynamic tail-call path.
The existing trampoline handles all 100,000 calls without nesting ordinary
call frames. Removing the name-based resolver rejection therefore delivers
this node's complete binding and tail-call unit. It does not admit source
compilation or alter ADR 0013, ADR 0016, or ADR 0019.

The bundle's Full UPDATE at source
`37d65f7d64957664c552cd0ed9ae697325da5b6b` promoted this exact path to
`pass`. The packet under */data/m5c-d17-20261031/sem-bundle/* includes
*promoted.txt* and the source-bound Full directory. Candidate `e6310834`
records its unchanged upstream source with *base.js* and *tcoHelper.js*,
non-strict Script mode and both specialization policies. That observation
belongs to the bundle; it is not a new UPDATE by this node. This worker
changes no subset, result record, ledger owner, or landed state.


Regression coverage
-------------------

*packages/parser-babel/tests/tail-calls.test.ts* pins the dynamic tail-call
MIR operation for the strict recursive body and an ordinary call for its
sloppy control. *tests/global-eval-tail-calls.test.ts* executes the exact
original, verifies its SHA-256 above, and requires both original policy
variants to pass with the reviewed 100,000-step helper.

The new `global-eval-tail-calls` fixture in
*tests/native/fixtures/proper-tail-calls.ts* checks a 1,500-step chain,
strict undefined receiver, heap argument identity, subsequent replacement
by a function accepting a String unchanged, and a noncallable TypeError.
It runs under both policies and forced collection in the focused suite
and is included in both forced-collection lists in *tests/native.ts*.

The existing *m5-proper-tail-calls.property.test.ts* family adds a bounded
domain at previously unused seed `0x60008903`: generated recursion depths
above the ordinary call limit, plain or spread arguments, and String
payloads inside a heap object. An independent output model checks step
count, receiver and argument identity against Node.js, Deno and both native
policies. The existing seed block, other domains and their budgets remain.
No property file or shard weight is added. The normative proper-tail-calls
profile now names the ordinary global-binding contract and its evidence.


Author validation
-----------------

The first complete `mise run check` passed. External command metadata and
raw outputs are under */data/m5c-d17-20261031/global-eval-rebind/*.
The first focused Node/Zig vector passed 73 of 75 registrations, including
the exact original under both policies. Its two failures were reference
setup errors: Deno parsed the new fixture and generated source as modules,
where assignment to `eval` is an early error. The retained *focused1*
outputs include the generated failure and its minimized replay. The
reference setup now evaluates these sources as global Scripts through
indirect eval, as the existing native fixture runner supports. Native
source, assertions, depths, seed and budgets are unchanged by that repair.

The corrected Node/Zig vector, *focused2*, passed 74 of 75 registrations,
including the original and every property domain. The fixed fixture's
stdout matched its references, but its counter assertion failed because
the focused test had omitted `observeSpecialization: true`. Enabling
observation corrects that instrumentation; no assertion or fixture source
was removed or weakened. The failure's native artifacts were retained at
*/tmp/oseo-native-j2wE1J*.

The final serial vector, *focused3*, exited zero in 246.03 seconds. It
passed 75 Node/Zig registrations (including the parser file), seven
Deno/Zig registrations, seven sanitizer self-checks, seven Node/host-cc
registrations, and all 839 fast non-native repository registrations.
These counts overlap across frameworks and policies; they are not counts
of test262 paths. Both fixed registrations and the whole property file
ran on both toolchain lanes. The fixed fixture retained both policies and
positive forced-collection counters; the property helper retains its
existing enabled-policy forced collection.

Both frameworks use NodeHost literally in these focused files. The fixed
fixture explicitly compares against Node.js and Deno. The property
helper's first reference follows `process.execPath`, so its Node.js run
compares both hosts while its Deno run invokes Deno twice. These are Linux
AMD64 author checks, not macOS execution, extended properties, a new Full
UPDATE, candidate/Main gates, or publication. The exact vectors, raw
outputs and metadata remain in the external directory above; Root owns
D3 and any observation reuse decision.
