Guarded small-integer addition
==============================

Status
------

Accepted for the M2 specialization proof.


Context
-------

Oseo's first specialization must prove that a hint-selected native path can
miss without an interpreter, deoptimization, duplicated source evaluation, or
a second generic implementation. The existing M1 MIR and runtime already own
complete primitive addition.


Required contract
-----------------

The selected path must check both values and arithmetic range before committing
a result. Every failed check must enter the existing generic addition block.
Disabling specialization must remove the guarded graph while preserving all
observable behavior.


Alternatives considered
-----------------------

A separate specialized function with a generic call on failure would preserve
the call ABI, but it would obscure the shared continuation and add another call
around the smallest proof. Copying generic addition into a fallback function
would create two semantic authorities. Trusting TypeScript annotations would
make false hints unsafe. Using compiler overflow builtins would tie MIR
correctness to one C toolchain facility.


Evidence
--------

[*docs/specialization-m2.md*](../specialization-m2.md) records the implemented
MIR, native path, counter contract, and fixture matrix. `mise run test:native`
compares enabled and disabled execution with Node.js and Deno, forces
collection on allocating fallback, cross-links M2 fixtures for AArch64, and
inspects optimized assembly for both configured targets.


Decision
--------

Select only an exact two-parameter return addition when both parameters have
consistent `number` hints. Place two tag guards, checked signed 48-bit addition,
and boxing in the function's MIR. Route both tag misses and overflow to one
existing generic addition block. Join the boxed and generic results through an
explicit block parameter.

Use private C runtime inline primitives for tag recognition, sign-correct
unboxing, checked addition, and boxing. The checked helper validates its operand
contract and result range before performing signed addition. Keep tag masks out
of public TypeScript declarations.

Pass specialization policy through compiler orchestration. Keep counters
test-only and separate their record from program stdout and stderr before
differential comparison.


Consequences
------------

The M2 hit path is allocation-free and does not call generic addition. A miss
does not replay parameter or argument evaluation. Generic ABI calls remain
unchanged, and independently compiled units need know nothing about the private
path. Broader selection needs new analysis proving that every guard precedes
visible effects that a fallback would otherwise repeat.


Failure modes and replacement triggers
--------------------------------------

Reopen this decision if another target cannot validate the NaN-boxed immediate
layout, if C lowering introduces undefined behavior, if MIR cannot express a
needed resume point without copying generic operations, or if measured code
shows the inline primitives do not remain cheap. Object specialization requires
a separate record after generic property semantics and shape invalidation are
implemented.


Links
-----

[*0004-generic-tagged-value.md*](./0004-generic-tagged-value.md) defines the
immediate representation.
[*0005-generic-call-and-abrupt-completion.md*](./0005-generic-call-and-abrupt-completion.md)
defines the stable generic ABI.
[*0006-root-stack-and-safepoints.md*](./0006-root-stack-and-safepoints.md)
defines fallback rooting.
