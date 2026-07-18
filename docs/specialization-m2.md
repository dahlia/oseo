M2 guarded specialization contract
==================================

Status
------

Implemented. This document records the optimization contract added in M2. The
accepted source language remains the M1 profile in
[*language-profile-m1.md*](./language-profile-m1.md).


Policy
------

Compiler orchestration passes an explicit `enabled` or `disabled`
specialization policy. The compiler core does not read an environment variable
or other process-global setting. The CLI enables specialization by default and
accepts `--no-specialization` for generic-only MIR and native code.

Disabled mode preserves the M1 generic control-flow graph. Enabled mode may
change code shape only. It does not change source acceptance, diagnostics,
results, output, errors, or visible side-effect order.


Eligibility
-----------

M2 selects one deliberately narrow form:

 -  a declared function has exactly two distinct plain parameters;
 -  every retained hint on each parameter is `number`;
 -  each parameter has at least one TypeScript or JSDoc hint;
 -  the function body contains only `return left + right;`; and
 -  `left` and `right` resolve to the two parameter binding identities in that
    order.

Equivalent TypeScript and JSDoc hints select the same path. An absent hint or a
hint named `any`, `unknown`, `string`, `boolean`, `null`, or `undefined`
suppresses selection. Conflicting TypeScript and JSDoc hints also suppress
selection. None of those cases rejects otherwise valid M1 source.


MIR and fallback
----------------

The selected function retains the generic parameter reads and one generic
addition block. Guarded MIR adds:

 -  two `guard-smi` operations carrying source range and hint provenance;
 -  private `unbox-smi` values;
 -  one `add-smi-checked` operation with an overflow successor;
 -  `box-smi` on the successful result;
 -  test-only hit, tag-miss, and overflow-miss observations; and
 -  an explicit block parameter that joins the specialized and generic values.

Both tag failures enter one miss block. That block and the overflow block jump
to the same generic addition block. The generic operation is not copied into a
fallback function. Both results reach one continuation, so a guard miss does
not evaluate arguments or another source expression again.

`printMir` records the policy, selected hint provenance, guard successors,
overflow successor, generic block, and join block. IDs depend only on the owned
source representations and remain equal under Node.js and Deno.


Native path
-----------

The runtime's immediate signed integer range is −140737488355328 through
140737488355327. Both arguments must carry the private small-integer tag. The
checked helper validates both operands and proves the addition stays within
that range before performing C signed addition. The result is boxed immediately
before the join.

Negative zero is stored as binary64 rather than as an immediate. Non-integers,
subnormal numbers, `NaN`, infinities, strings, Booleans, `null`, and
`undefined` fail a tag guard. Results outside the immediate range fail checked
addition. Every such case reaches `oseo_add`, which remains the semantic
authority for numeric conversion and string concatenation.

Optimized x86-64 and AArch64 assembly tests confirm that the private tag,
unbox, range-check, and box helpers inline. The emitted unit retains a reference
to `oseo_add` for the generic block. The successful path contains no call to
that helper and performs no heap allocation.


Test-only observations
----------------------

Observation-enabled fixture builds record:

 -  guard hits;
 -  tag guard misses;
 -  checked-addition overflow misses;
 -  generic addition calls;
 -  successful JavaScript heap allocations; and
 -  collections.

The native runtime writes one private observation record after successful
execution. `@oseo/testkit` removes that record from stderr and exposes typed
counters beside the ordinary process observation. The CLI does not enable or
print these observations.


Evidence
--------

`mise run test:native` runs every M1 and M2 fixture under Node.js, Deno,
generic native code, and specialization-enabled native code. Reviewed M2 cases
cover TypeScript and JSDoc selection, hint mutations, conflicting hints,
immediate boundaries, overflow, negative zero, the admitted primitive kinds,
recursion, repeated calls, argument evaluation order, string allocation, and
forced collection. M2 fixtures also compile and link in both modes for
`linux-aarch64-musl`.

Strict C11 warnings and undefined-behavior sanitization apply to native x86-64
execution. The assembly inspection compiles the same selected path with `-O2`
for both configured targets. These checks demonstrate code shape and fallback;
they are not a broad performance comparison with another engine.


Limits
------

M2 does not widen the source profile. It does not specialize floating-point,
strings, Booleans, objects, polymorphic call sites, or code selected from run
time profiles. It does not introduce an interpreter, deoptimization, or a
second generic implementation.

[*0007-guarded-small-integer-addition.md*](./adr/0007-guarded-small-integer-addition.md)
records why this representation and control-flow shape were accepted.
