Resolve var loop heads through with environments
================================================

Resolves var loop heads and array-pattern identifier leaves inside with
statements through the with object environment in the order ECMA-262 specifies,
on the ordinary and host targets.

This ready, unlanded node owns no test262 path yet. It depends on
`unsupported-ownership-audit` and is an `m5-exit-audit` prerequisite.

The retained repro and raw files are external evidence from the host lane:

| Evidence                                      | Pointer                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Repro, source diagnosis and stdout comparison | /data/m5c-host-script-bindings-20261027/claude-native/diag-with02/README.md                        |
| Raw stdout, stderr and gate metadata          | /data/m5c-host-script-bindings-20261027/claude-native/diag-with02/diag-with02.{stdout,stderr,json} |

The combined with-hit case prints `g 6 z undefined` in Node and Deno,
while both native targets print `g 6 0 string`. The all-miss host Script
repro prints `1 3` natively against Node's `3 0`. These are stdout
discrepancies, not compiler diagnostics. Preserve the ordinary and host
target contracts, including array-pattern identifier leaves.


Implementation
--------------

Source preparation starts at Main
`74bb8e47c26e47c765c98c86bb37c41d152c699d`. The checked-in ledger and
partitioned results assign zero paths to this node. Entry manifest counts
are 31,337 reviewed paths: 26,963 passes, 3,263 expected negatives and
1,111 unsupported results, with zero semantic, harness or infrastructure
failures. No subset, result, ownership, inventory or policy is changed.

The HIR resolver sends a simple `var` for-in/of head with intervening
`with` environments through the existing assignment-head resolution.
It keeps the hoisted declaration identity, resolves each iteration through
the active object environments and uses the host Script global fallback
when needed. Lexical heads keep their own environment, and ordinary heads
without an intervening `with` keep their previous representation.
Classic `for` var initializers use a resolved identifier pattern when a
`with` environment intervenes, preparing the reference before the value.

MIR reference preparation now handles a pattern's identifier leaf along
with its existing member and private targets. Array elements and rest
identifiers retain the selected environment before iterator steps,
defaults and rest accumulation, following ECMA-262 2025 section 8.6.3.
The keyed object ordering is preserved, while object rest preparation remains
unchanged. Existing generic writes, strict checks, iterator closing, rooting
and specialization policies are reused.

The fixed fixture retains the original combined repro. Additional cases
cover nested hit and miss, unscopables, inherited and frozen properties,
per-iteration deletion, lexical heads, for-await-of and abrupt lookup
with IteratorClose.
The fixed reference-order trace uses specification expectations because
Node.js and Deno resolve var-binding identifier leaves and mutating classic
var initializers later than ECMA-262 2025 sections 8.6.3 and 14.3.2.1 require.
The later host Script lexical-shadow repro uses Node.js as reference; Deno's
legacy var-name check rejects that shadowing declaration. Both native target
modes run both specialization policies with collection forced at every
safepoint.

*tests/property/m5-with-var-loop-head.property.test.ts* reserves seed block
`0x60009200` through `0x600092ff`. Its two independent destination/order
models use seeds `0x60009200` and `0x60009201`, 8 ordinary cases each,
small structured domains, shrinking and replay, with a 180-second limit
per domain. The first generates nested hit, miss, blocking and deletion
sequences with in/of/classic heads; the second generates array element,
rest, default, assignment and var-loop leaves whose iterator or default
adds or deletes a property. Both modes and both policies run per draw.

Validation and review evidence is recorded under
*/data/m5c-withvar-20261030/*. Root owns D3, any full UPDATE, affected
review, publication and landed state. No local result establishes those
gates, and the node remains unlanded.


Author validation
-----------------

The final source passed the following focused Linux AMD64 commands,
each under the capacity wrapper with natural exit zero. Framework
registration counts overlap; they are not counts of standards paths.
No property override, full test gate, extended property gate or test262
UPDATE was run by this worker.

| Raw record under */data/m5c-withvar-20261030/checks/* | Command scope                                                         | Result                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| *check04.json*                                        | `mise run check`                                                      | Passed                                 |
| *native09-zig.json*                                   | Node.js source and native suites plus ordinary generated domains, Zig | 20 passed                              |
| *native07-deno.json*                                  | The same four files under Deno, Zig                                   | 20 passed                              |
| *native08-hostcc.json*                                | The same four files under Node.js, host-cc                            | 20 passed                              |
| *native05-hostcc.json*                                | Sanitizer selftests before the earlier focused host-cc suites         | 7 selftests and 8 focused tests passed |

The four files are *tests/with-var-loop-head-source.test.ts*,
*tests/host-script-source.test.ts*, *tests/with-var-loop-head.test.ts* and
*tests/property/m5-with-var-loop-head.property.test.ts*. The native helper
uses NodeHost in both framework runs. The Deno framework result is not
DenoHost native evidence. Both compiler target modes and policies retain
forced collection. The host-cc lane selected Clang 22 with its ordinary
sanitizer instrumentation. No macOS or AArch64 execution is claimed.
The tested source file hashes are retained in
*/data/m5c-withvar-20261030/tested-source.json*.

Earlier attempts remain in the raw directory: initial checks found line
length, lint and a missing required `hints` field; the first native run
used V8's differing classic-initializer order as its oracle; and the
second native run caught a keyed-reference call-site regression during
helper reuse. All were corrected before the final runs above. Busy-lock
launch failures started no test and are not validation evidence.
