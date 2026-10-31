Non-blocking agent
==================

Scope and ownership
-------------------

This node owns exactly these checked-in unsupported rows at base
`fcf124f3b03903fc6ba45bbc77a9349b94fb84d1`:

 -  `test/built-ins/Atomics/wait/cannot-suspend-throws.js`
 -  `test/built-ins/Atomics/wait/bigint/cannot-suspend-throws.js`

Their manifest partitions are *built-ins/Atomics/ef.yaml* and
*built-ins/Atomics/12.yaml*. Both name capability `non-blocking-agent` and
dependency `atomics-single-agent`; both have `CanBlockIsFalse` and no
includes. Source inspection confirms they assert TypeError for a valid
shared waitable view with timeout zero. Neither path is removed, retagged,
or reclassified by this implementation. Root owns UPDATE and admission.


Implementation
--------------

Root's 2026-10-31 decision approves option 1 of the design note at
*/data/m5c-d17-20261031/non-blocking-agent/design-note.md*. The explicit
main-agent policy defaults true. The reviewed runner selects false only
for `CanBlockIsFalse`, through CLI, host MIR, generated host setup, and
`OseoContext.agent_can_block`. Child contexts initialize true; realm
switches retain their context. Runtime ABI is `m5-145`.

`Atomics.wait` checks this policy after validating the view/index and
converting the expected value and timeout, before the memory comparison.
Non-blocking agents therefore throw TypeError even with a mismatching
element or zero timeout. Conversion errors retain their precedence.
`waitAsync` and blocking paths keep their behavior. ADR 0026 and the
normative Atomics profile record this bounded change. ADR 0013/0016/0019
boundaries and both specialization policies remain intact.


Evidence and gates
------------------

CLI tests cover MIR/setup propagation, default true, and source-located
rejection of invalid CLI configurations. Native fixed cases cover both
waitable widths, conversion order and throws, mismatch, zero/infinite
timeout, waitAsync notification, realm policy and error identity, and
child-agent defaults, with forced collection and both specialization
policies. The default-policy fixture is selected for guard-structure checks
and forced collection in the native fixture runner.

The generated suite uses a separate family with seed block
`0x60009400` through `0x600094ff`, slot zero, five ordinary cases, and up
to six calls per case. Its independent model predicts conversion traces
and errors for view/index/type/throw combinations under both policies.
Shrinking retains structured inputs and zero timeouts. Root must assign
shard weights before publication.

Local validation passed on Linux x86\_64:

 -  Capacity-wrapped `mise run check`, without ratchet overrides.
 -  The 53 fast non-native root files: 709 tests passed.
 -  Compiler/backend/CLI and focused runtime package tests: the only initial
    failure was an adjacency assertion invalidated by the new context field;
    its corrected suite passed all 61 tests. The other 274 package tests
    passed, and the CLI/runner combination passed all 89 tests separately.
 -  Fixed native probes and five generated cases on Zig and host-cc with
    ASan/UBSan, both specialization policies and forced collection. The
    generated cases always include one call that reaches the policy check.
 -  Both owned upstream paths through the production reviewed executor on
    both toolchains: pass in all four variants, without manifest writes.

No subset/results/dependency tags changed; the tag audit therefore has no
edited rows. Full gates, D3/UPDATE, outer review, publication and landing
remain Root's. Internal review follows the committed implementation.
