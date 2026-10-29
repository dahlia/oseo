Optional-call receivers through with in tail position
=====================================================

This record backs the M5c graph node `with-optional-call-receiver-tail`
(WOC-2). The maintainer decision of 2026-10-28 on the big-node split review
(*20261028-m5c-scope-big-node-split.md*), item 4, approves it as WOC-2 of the
`with-optional-call-receiver` split and makes it depend on
`with-optional-call-receiver-non-tail` (WOC-1) and `proper-tail-calls`.
[*with-optional-call-receiver.md*](./with-optional-call-receiver.md)
records the defect and explains why tail position reaches the
`proper-tail-calls` trampoline.

This node owns no manifest path. It keeps the TCO review risk out of WOC-1.


Evidence obligations
--------------------

 -  Strict tail-position optional calls through a selected `with` object
    environment, such as `return f?.(args())` in a strict function nested in
    a sloppy `with` body, covering normal and abrupt completion, argument
    order, and the selected receiver, each beside the ordinary strict tail
    call `return f(args())` as a control.
 -  Both specialization policies, with collection forced across the tail call
    trampoline so that the receiver, callee, and arguments stay rooted and
    live until the callee runs.
 -  MIR structural evidence that a strict tail-position optional call through
    `with` remains a tail call returned directly.
 -  Generated oracle and family record updates that extend WOC-1's evidence
    to tail position without weakening it.


Source and evidence preparation
-------------------------------

The base is Main `74bb8e47c26e47c765c98c86bb37c41d152c699d`.
The checked-in closure ledger has no owner entry or path for this node,
and no manifest result is assigned to it. The existing WOC-1 lowering
already retains the receiver for a first optional call link regardless of
tail position. Compilation confirms that the strict call is marked tail
and returns directly; no additional compiler or runtime change is needed.
This node adds evidence for that composition rather than another lowering.

The fixed `with-optional-call-receiver-tail` fixture in
*tests/native/fixtures/bindings.ts* pairs strict optional and ordinary tail
calls for a getter-produced function, null, undefined, a non-callable value,
a throwing getter, a throwing first argument, and a throwing callee. The
callee checks the selected receiver and two distinct heap arguments after
allocating. The selected object and getter-produced callee have no global
owner. Both forced-GC lists in *tests/native.ts* include the fixture;
*tests/with-optional-call-receiver-tail.test.ts* runs it independently with
Node.js and Deno references and both native specialization policies, forcing
collection and requiring a positive collection count in each native run.

The existing optional-chaining property file adds seed `0x60002402` inside
its reserved `0x60002400` through `0x600024ff` block. Ten draws each run
strict optional and ordinary tail-call programs under both policies with
forced collection and a heap argument. The independent model retains WOC-1's
own, inherited, blocked, missing, nested-object and fallback selection
cases and its present, missing or abrupt second HasProperty. Ordinary calls
evaluate arguments before a non-callable error, including null and undefined;
optional nullish calls skip them. V8's second-HasProperty discrepancy still
precludes using it as the oracle for these traces. The earlier domains,
seeds, case counts and limits stay unchanged.

The parser's statement tests assert, under both policies, that optional,
parenthesized optional and ordinary strict calls take their receiver from
the callee/receiver join, whose incoming receivers are the selected object
and fallback undefined. Each call has `tail: true`, and its own block returns
its result directly. These assertions cover the MIR contract independently
of output matching.

No result classifications, feature admissions, ledger owners, exclusions,
or graph landed states change. ADR 0013, ADR 0016 and ADR 0019 retain their
boundaries. Root owns D3, any full UPDATE, affected review and publication.


Focused validation
------------------

The author commands use the capacity-scoped `run-gate.py` wrapper, one
heavy command at a time, with cache
*/data/zig-cache/m5c-woc2-20261030*. Raw metadata, stdout and stderr are in
*/data/m5c-semantic-lanes-20261030/woc2-checks/*.

| Packet         | Whole command                                                                                                               | Result                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `check04`      | `mise run check`                                                                                                            | passed                                 |
| `structural05` | `mise run test:node -- packages/parser-babel/tests/statements.test.ts`                                                      | 84 passed                              |
| `zig04`        | `mise run test:node -- tests/with-optional-call-receiver-tail.test.ts tests/property/m5-optional-chaining.property.test.ts` | 6 passed                               |
| `hostcc03`     | `mise run test:sanitizer:self` followed by the same two-file command with `OSEO_NATIVE_TOOLCHAIN=host-cc`                   | 7 selftests and 6 focused tests passed |

Each packet exited naturally with code zero. Native execution was Linux
AMD64 under the Node.js test framework; Deno was a reference executable,
not a second native test framework. Zig retains its qualified sanitizer
limitations; host-cc selected Clang 22.1.8 and passed the ASan/UBSan
selftests. There is no macOS, candidate CI, Main CI, full UPDATE or extended
property observation in these packets. Initial test setup failures (missing
counter instrumentation and a Deno module reference instead of sloppy
Script) are retained in `zig02`; the successful packets use the corrected
setup. The final structural packet includes the stricter assertion that the
selected receiver is the object operand of HasProperty. Concurrent
reference reads do not change native program source or expected output.


Internal review correction
--------------------------

Both stages of internal pass 1 identified `WOC2-PROFILE-STALE`: the central
*docs/language-profile-m5.md* still described tail calls through `with` as
a gap after the PLAN and family updates. The correction updates both the
optional-chaining summary and the identifier-read account with the same
contract, evidence and publication limits. It changes no test program,
oracle, seed, budget, compiler/runtime or manifest input.
