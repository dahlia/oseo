Optional-call receivers through with
====================================

This record backs the M5c graph node `with-optional-call-receiver`. It
records a known defect in admitted behavior, not an exemption, an
exclusion, or a pass. The node is unlanded and depends on
`eval-intrinsic-value` and `proper-tail-calls`, and `m5-exit-audit` depends
on it, so M5 cannot exit while the defect remains.

`eval-intrinsic-value` establishes the GetBindingValue order this repair
keeps. `proper-tail-calls` is a prerequisite because strict code nested in
a sloppy `with` body can return `f?.()`. HasCallInTailPosition (ECMA-262
2025 15.10.2) puts an optional chain whose last link is a call in tail
position, and that node lowers such a call through its tail call
trampoline. The repaired receiver must therefore reach a call whose
execution contract that node defines. That prerequisite remains unlanded;
the trampoline is not part of this source preparation.


Defect
------

ECMA-262 2025 EvaluateCall takes `this` from a Reference's base. For an
identifier resolved through a `with` Object Environment Record, the base is
that record and WithBaseObject supplies the selected object. OptionalExpression
evaluation keeps the callee's Reference, and the ChainEvaluation of `?.`
*Arguments* passes it to EvaluateCall. A non-nullish selected function called
as `f?.()` must therefore receive the selected object as `this`, exactly as
the ordinary call `f()` does.

~~~~ javascript
const o = { f: function () { "use strict"; return this === o; } };
with (o) { console.log(f?.()); }
~~~~

The specification prints `true`. Oseo prints `false`. The ordinary call
`with (o) { console.log(f()); }` prints `true`.


Native observation on the pinned source
---------------------------------------

The observations ran on clean source commit
`13ab5051b1f19213040bb5caed541dda1b17b9e3`, tree
`f73de53ee0f0280c377554fb61b8802631434ee5`, loading compiler and runtime
modules from that tree's source rather than built packages. Each program was
compiled, linked, and executed natively for `linux-x86_64-gnu` with Zig
0.16.0, requesting AddressSanitizer and UndefinedBehaviorSanitizer with
`-fsanitize=address,undefined`, and collection forced at every safepoint,
once under each specialization policy. The pinned Zig drops `address` from
that combined flag, so these runs do not establish ASan coverage. The
existing [sanitizer qualification](../sanitizer-activity.md) records the
known UBSan instrumentation and the missing ASan coverage for this pin.

| Program                 | Expected | Disabled | Enabled |
| ----------------------- | -------- | -------- | ------- |
| `with (o) { f?.() }`    | `true`   | `false`  | `false` |
| `with (o) { eval?.() }` | `true`   | `false`  | `false` |
| `with (o) { f() }`      | `true`   | `true`   | `true`  |

The second program names the selected property `eval`. An optional call is
never a direct eval, so it calls the selected function like any other name
and evaluates no source text. Every run exited 0 with empty stderr and a
positive collection count.

Limits:

 -  These six runs are the only native evidence. Base
    `0d63507b150bcbbab98a45603a1e85177205c829` was not executed natively;
    static inspection of its HIR and MIR shows the same lost receiver, so the
    defect predates `eval-intrinsic-value`.
 -  The `eval-intrinsic-value` GetBindingValue correction was not executed
    for this program. Commit `0ae8de515734142d9140519cd20e5af95a7e36f2`
    introduces it, and its only *mir-build.ts* change makes `lowerWithRead`
    perform GetBindingValue on the selected object. The tree inspected was
    `12ec5922047a305ea41584fc0bdc0471552ae6ad`, whose parent is `0ae8de51`
    and whose own diff changes no file under *packages/*; that tree
    therefore carries the compiler change unchanged. Static analysis of
    that tree shows the optional-chain lowering unchanged.
 -  A textual search of the pinned test262 revision
    `f2d1435644797268dca1f7988cad5a4e89ccd8d2` finds no file under *test/*
    that contains both a `with` statement and an optional call, so no
    reviewed or unreviewed path observes this defect and the manifest
    records none.


Source location
---------------

On the tree of `12ec5922`, which carries the `0ae8de51` correction,
`lowerOptionalChain` in *packages/compiler/src/mir-build.ts* (line 3572)
lowers the chain base with `lowerExpression` (line 3580). For a
`with-get` base, that reaches `lowerWithRead` with `retainReceiver` false, so
only the value survives. A first call link with no preceding member link then
passes a synthetic `undefined` receiver, at line 3667 for a chain-boundary call
and line 3685 otherwise. The ordinary call path asks `lowerWithRead` to retain
the receiver and passes the selected object, or `undefined` for a lexical or
global fallback. On `13ab5051` the same lines are 3564, 3572, 3659, and 3677.


Repair and evidence contract
----------------------------

The repair keeps the selected object, or `undefined` for a fallback binding,
as the receiver of the first call link of an optional chain whose base is an
identifier resolved through `with`. It leaves the GetBindingValue order that
`eval-intrinsic-value` establishes, nullish short-circuiting, argument
evaluation order, and optional member calls unchanged.

Its evidence follows the semantic contract in [*PLAN-M5.md*](../../PLAN-M5.md):

 -  fixed native examples under both specialization policies with forced
    collection, covering selected, inherited, `Symbol.unscopables`-blocked,
    and all-miss references, nested `with` environments, a nullish
    short-circuit, argument order, a strict GetBindingValue `ReferenceError`,
    and abrupt Proxy traps;
 -  strict tail-position optional calls through a selected `with` object
    environment, such as `return f?.(args())` in a strict function nested in
    a sloppy `with` body, covering normal and abrupt completion, argument
    order, and the selected receiver, each beside the ordinary strict tail
    call `return f(args())` as a control, under both specialization policies
    with collection forced across the tail call trampoline so that the
    receiver, callee, and arguments stay rooted and live until the callee
    runs;
 -  an independent generated oracle that extends an existing property domain
    without weakening its earlier domains, case counts, or budgets;
 -  MIR structural evidence that the call link receives the selected object,
    and that a strict tail-position optional call through `with` remains a
    tail call returned directly;
 -  updates to the `optional-chaining` and `with-statement` family records and
    the profile that replace the recorded gap with the admitted behavior.

The node lands only through the ordinary publication path; nothing here marks
it landed or ready.
