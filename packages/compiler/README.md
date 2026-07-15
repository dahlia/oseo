@oseo/compiler
==============

This package owns Oseo syntax, hint metadata, lexical resolution, HIR, generic
MIR, diagnostics, targets, and extension interfaces. Concrete parser, backend,
runtime, toolchain, and host packages implement these contracts without
becoming compiler-core dependencies.

MIR is self-contained: constants, lexical binding reads and writes, MIR-owned
parameters and hints, operators, call targets, control-flow blocks, and
terminators do not retain HIR nodes. MIR identifies script-owned bindings that
declared functions share without treating them as function-local slots.
Binding reads retain runtime temporal-dead-zone checks, and generic addition is
marked as a possible string-allocation safepoint.
Non-strict duplicate parameters share one binding while retaining every
argument position. Repeated top-level function declarations resolve to one
function identity whose body comes from the last declaration.
