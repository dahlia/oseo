@oseo/compiler
==============

This package owns Oseo syntax, hint metadata, lexical resolution, HIR, MIR,
specialization policy, diagnostics, targets, and extension interfaces.
Concrete parser, backend, runtime, toolchain, and host packages implement these
contracts without becoming compiler-core dependencies.

Native target descriptions contain immutable artifact facts, including the
architecture, operating system, ABI, executable format, C standard, and
sanitizer policy. Stable Oseo target IDs use operating-system, architecture,
and optional ABI order. Concrete toolchain spellings do not enter the compiler
core. Execution-host descriptions are separate capabilities.
`targetForExecutionHost` selects the one supported target for a normalized
host, while `canExecuteTarget` rejects mismatched pairs before process
execution.

MIR is self-contained: constants, lexical binding reads and writes, MIR-owned
parameters and hints, operators, call targets, control-flow blocks, and
terminators do not retain HIR nodes. M3 bindings use shared mutable cells in
traced environments, so escaped closures retain binding identity. MIR also owns
dynamic calls, receiver and constructor operations, ordinary properties,
arrays, and explicit completion state for `catch` and `finally`.
Binding reads retain runtime temporal-dead-zone checks, and every collecting
operation has an explicit safepoint.
Non-strict duplicate parameters share one binding while retaining every
argument position. Repeated declarations resolve to one function binding whose
body comes from the last declaration. Named function expressions retain a
private self binding.

M4 adds owned module syntax, canonical graph discovery interfaces, static
linking, strongly connected components, and whole-graph lowering. Imported and
exported names share one traced cell identity, and namespace creation retains
sorted live-cell mappings. MIR call targets also name promise operations,
timers, and top-level await checkpoints without importing a concrete runtime or
event loop into compiler core. Function creation retains ordinary, arrow,
asynchronous, and asynchronous-arrow identity through HIR and MIR.

`compileSource` and `buildMir` accept an explicit enabled or disabled
specialization policy. Enabled mode selects the M2 checked small-integer path
only for the reviewed two-parameter return form. Its MIR retains hint
provenance, two tag guards, checked arithmetic, a shared generic fallback, and
an explicit result join. Disabled mode emits the unchanged generic graph.
