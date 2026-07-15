M2 plan for guarded specialization
==================================

Status
------

Implementation status: ready, not started. M1 established the complete generic
source-to-native path, the M1 language profile, and the differential evidence
required by this plan.

M2 proves Oseo's central optimization claim. A checked small-integer addition
path will sit beside the existing generic path. Every failed hint, tag check,
or arithmetic check transfers directly to compiled generic addition. M2 does
not add an interpreter, profiling tier, speculative frame, or deoptimization.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*docs/language-profile-m1.md*](./docs/language-profile-m1.md), and the accepted
records under *docs/adr/*. Implementation evidence that changes one of those
contracts must update the affected document in the same change.


Entry evidence
--------------

M2 begins with these repeatable M1 contracts:

 -  Babel output is converted immediately to Oseo-owned syntax and diagnostics;
 -  HIR owns lexical and function identities, source ranges, evaluation order,
    and TypeScript or JSDoc hint provenance;
 -  MIR contains generic semantic operations, calls, status checks, root-slot
    updates, safepoints, branch observations, explicit binding writes, and
    deterministic identifiers, with MIR-owned parameter and hint data and no
    retained HIR objects;
 -  the C11 backend lowers MIR blocks and terminators directly into one generic
    native entry per declared function and a script entry;
 -  the runtime implements every M1 primitive, conversion, operator, string
    operation, root frame, call result, and observable host intrinsic;
 -  generated code links the runtime as a separate static archive;
 -  eight reviewed fixture classes match Node.js and Deno during native x86-64
    execution and compile-link for `aarch64-linux-musl`;
 -  undefined-behavior sanitization and strict C11 warnings apply to native
    execution, and collection can be forced at every string safepoint;
 -  `--dump-mir`, `--emit-c`, and the asynchronous native CLI workflow use the
    same compiler pipeline;
 -  npm, JSR, package-boundary, version, and dual-host source checks remain part
    of `mise run check` and `mise run test`.

The M1 language profile remains the semantic source of truth. M2 may refine IR
or runtime interfaces, but it must not weaken any generic behavior to make the
specialized path easier to implement.


Scope
-----

M2 specializes direct calls to a declared function when all of these static
conditions hold:

 -  the selected function has two plain parameters;
 -  both parameters have an accepted `number` hint from TypeScript or JSDoc;
 -  the selected expression adds those two parameter bindings without an
    intervening side effect;
 -  the generic addition expression and its continuation already exist in MIR.

The first implementation may restrict selection to a function whose returned
expression is exactly the parameter addition. Broader local analysis requires
separate evidence that guards remain before every visible effect and that a
miss does not replay source evaluation.

At run time, the specialized entry checks both arguments for the accepted
signed 48-bit immediate representation. A hit unboxes both payloads, performs
checked addition without C signed-overflow undefined behavior, verifies that
the result remains in the immediate range, boxes it, and reaches the ordinary
continuation. Any failed tag or range check enters the existing generic
addition block.

Negative zero, non-integer numbers, `NaN`, infinities, strings, Booleans,
`null`, `undefined`, and integer overflow are deliberate guard misses. A false
hint can change code shape, but it cannot change acceptance, output, returned
values, errors, or side effects.


Specialization policy
---------------------

`@oseo/compiler` owns an explicit specialization policy. At minimum it has an
enabled mode and a disabled mode. Disabled mode produces the M1 generic MIR and
native behavior without guard operations or specialized entries.

The policy is an input to compiler orchestration, not a global variable or an
environment lookup inside compiler core. The CLI and testkit pass it through
public interfaces. Ordinary builds may default to enabled after the full M2
matrix passes, while structural and invariance tests always exercise both
modes.

Hint eligibility is deterministic and inspectable. TypeScript and JSDoc hints
select the same specialization when they name the same primitive. Conflicting
hints may suppress specialization, but cannot reject source. `any`, `unknown`,
`string`, `boolean`, `null`, and `undefined` do not select number addition.


MIR contract
------------

M2 extends MIR with operations equivalent to:

~~~~ text
guard_smi
unbox_smi
add_smi_checked
box_smi
count_guard_hit
count_guard_miss
~~~~

Exact names may change. The representation must let a structural test recover:

 -  which source hint selected the specialization;
 -  both tag checks and their shared failure successor;
 -  the checked arithmetic operation and overflow successor;
 -  the generic addition block used by every miss;
 -  the specialized result's join with the generic result;
 -  root liveness and safepoints on the generic path;
 -  the absence of allocation and generic helper calls on the hit path;
 -  the source range and function identity for every guard.

Generic operations remain backend-neutral. Tag masks, C expressions, labels,
and compiler-specific builtins do not enter MIR. The generic addition block is
not copied into a special fallback function. One compiled generic block remains
the semantic authority for all admitted operands.

The textual MIR printer shows specialization mode, hint provenance, guard
successors, failure successors, checked arithmetic, generic fallback, and the
join. Identifiers remain deterministic across Node.js and Deno. Disabling
specialization removes those operations while retaining equivalent generic MIR.


Runtime and C11 lowering
------------------------

Private runtime helpers expose the minimum operations needed to recognize,
unbox, range-check, and box the accepted immediate representation. Public
TypeScript declarations do not expose NaN-box masks or payload constants.

Checked addition must avoid undefined behavior independently of the C compiler.
The implementation may use unsigned arithmetic with explicit sign and range
checks or a compiler facility proven available through the pinned Zig C
toolchain. The chosen mechanism needs focused boundary tests and generated-C
inspection on both configured targets.

The C backend lowers each guard to explicit control flow. The hit path contains
no call to generic addition and no allocation. A miss branches to the same
generic helper call used when specialization is disabled. Overflow branches to
that fallback before a result or source-visible state is committed.

Generated code keeps the generic `OseoResult` and root-frame conventions. The
specialized entry is private to the linked program. Calls across independently
compiled units continue to use the generic ABI.


Test-only observation
---------------------

Test builds expose counters for:

 -  small-integer guard hits;
 -  small-integer guard misses;
 -  checked-addition overflow misses;
 -  generic addition helper calls;
 -  allocations and collections.

Counters live in `OseoContext` or another private test-only observation object.
They are not JavaScript-visible state and do not change production semantics.
Counter output is captured separately from program stdout and stderr.

Each fixture states its expected minimum observations. A truthful small-integer
case records a hit and no generic addition or allocation. Every deliberate miss
records the applicable miss and one generic addition. Forced collection cannot
turn a hit into a miss or change fallback behavior.


Required fixtures
-----------------

The M2 corpus starts from every M1 differential fixture and adds:

 -  truthful TypeScript `number` hints on both parameters;
 -  truthful JSDoc `number` hints on both parameters;
 -  absent hints and non-number hints;
 -  conflicting TypeScript and JSDoc hints;
 -  deliberately false number hints for every M1 primitive kind;
 -  minimum and maximum signed 48-bit immediate operands;
 -  results at both immediate boundaries;
 -  positive and negative overflow beyond the immediate range;
 -  positive zero and negative zero;
 -  non-integer finite numbers, subnormal numbers, `NaN`, and infinities;
 -  strings that trigger concatenation and strings that convert numerically in
    surrounding generic expressions;
 -  Boolean, `null`, and `undefined` operands;
 -  repeated and recursive calls that mix hits and misses;
 -  argument expressions with visible left-to-right `console.log` effects;
 -  generic fallback that allocates and collects while its inputs are rooted;
 -  generated mutations that add, remove, replace, or falsify hints.

Reviewed fixtures remain for boundary values, source ordering, overflow,
negative zero, string fallback, and recursion. Generated cases cover the wider
hint and primitive operand matrix.


Work sequence
-------------

1.  Freeze specialization-invariance observations.

    Add enabled and disabled compilation to testkit. Record Node.js, Deno,
    generic-native, and specialized-native observations before implementing a
    hit path. Add the complete guard-miss matrix first.

2.  Define specialization policy and MIR contracts.

    Add explicit compiler options, guard and checked-arithmetic operations,
    failure successors, generic fallback identity, joins, and deterministic
    dumps. Keep disabled output equivalent to M1 generic MIR.

3.  Select eligible hints.

    Connect parameter hint provenance to resolved binding identities. Restrict
    the first selector to the reviewed two-parameter addition form. Test absent,
    conflicting, and false hints without invoking the backend.

4.  Lower the checked small-integer path.

    Add private runtime primitives and deterministic C11 control flow. Test tag
    boundaries, payload sign extension, checked addition, overflow, boxing, and
    fallback with undefined-behavior sanitization.

5.  Add test-only counters.

    Observe hits, misses, overflow, generic helpers, allocations, and
    collections without changing program output. Assert counter expectations in
    the native differential harness.

6.  Prove specialization invariance.

    Run the full M1 and M2 corpora with specialization enabled and disabled,
    mutate hints, force collection, and compare output, errors, exit status, and
    side-effect ordering.

7.  Inspect generated code.

    Assert MIR and C structure for both paths. Record selected optimized
    x86-64 and AArch64 assembly showing the guard branch, helper-free hit path,
    and shared generic fallback.

8.  Close M2 evidence.

    Update design, roadmap, package documentation, decision records, and the
    next plan. Record measured limitations before broadening specialization.


Test matrix
-----------

| Surface               | Disabled                       | Enabled                                     | AArch64 compile-only |
| --------------------- | ------------------------------ | ------------------------------------------- | -------------------- |
| Hint selection        | Generic MIR only               | Provenance and eligible specialization      | Not applicable       |
| MIR structure         | No guards or specialized entry | Guards, checked add, fallback, and join     | Not applicable       |
| Differential fixtures | Generic native observation     | Identical specialized native observation    | Compile and link     |
| Guard counters        | Zero specialized counters      | Reviewed hit, miss, and overflow counts     | Not executed         |
| Runtime safety        | Existing generic sanitization  | Hit and fallback sanitization               | Strict compile       |
| Generated code        | Generic helper path            | Helper-free hit and shared generic fallback | Assembly inspection  |
| Package validation    | npm and JSR public contracts   | Same contracts, no private tag masks        | Runtime assets used  |


Exit criteria
-------------

M2 is complete when all of the following are true:

 -  enabled and disabled modes have identical observations for the full M1 and
    M2 fixture corpora;
 -  truthful TypeScript and JSDoc number hints select the same checked path;
 -  every guard has a deliberate, observed miss;
 -  wrong, absent, removed, and conflicting hints preserve source acceptance
    and generic behavior;
 -  negative zero, non-integer numbers, `NaN`, infinities, strings, Booleans,
    `null`, `undefined`, and overflow reach generic addition;
 -  the hit path contains two tag guards, checked addition, and immediate
    boxing, with no generic addition helper or heap allocation;
 -  every miss reaches the same compiled generic addition without replaying
    argument evaluation or another visible side effect;
 -  MIR and C dumps expose guard successors, overflow, fallback, roots, and the
    result join deterministically;
 -  test-only counters distinguish hits, tag misses, overflow misses, generic
    calls, allocations, and collections;
 -  generated and runtime C pass strict warnings and undefined-behavior
    sanitization on `x86_64-linux-gnu`;
 -  every M2 fixture compile-links for `aarch64-linux-musl` with an explicit
    target and no inherited host headers;
 -  selected assembly confirms a helper-free specialized hit path and a
    retained generic fallback in the same binary;
 -  npm and JSR checks pass without exposing runtime tag masks or
    package-private paths;
 -  `mise run check` and `mise run test` pass from a clean checkout;
 -  design, roadmap, package documentation, decision records, and the next plan
    match the implemented specialization.


Out of scope
------------

M2 does not add new source syntax or widen the M1 language profile. Object
shapes, property access, arrays, closures, function values, constructors,
language-level exceptions, assignment, loops, modules, promises, asynchronous
execution, web APIs, Node.js compatibility, and package resolution remain later
work.

M2 does not add floating-point, string, Boolean, object, call-site polymorphic,
or profile-guided specialization. It does not establish broad performance
claims. Those optimizations require their own generic prerequisites, invariance
tests, and measured plans.
