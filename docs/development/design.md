Architecture and decisions
==========================

The frontend parses JavaScript and TypeScript into an Oseo representation.
The compiler builds a generic graph and, where applicable, a guarded
specialized path. The C11 backend emits code for those paths, and a native
toolchain links it with the Oseo runtime.

 -  The [whitepaper] explains the motivation and intended scope.
 -  The [design document] describes the compiler, backend, runtime, and the
    boundaries between them.
 -  The [architecture decision records] document choices such as the C11 and
    Zig boundary, generic values, and native target support.
 -  The [roadmap] separates measured milestones from future work.

[whitepaper]: ../overview/white-paper.md
[design document]: ./compiler-design.md
[architecture decision records]: ../adr/index.md
[roadmap]: ../overview/roadmap.md


Package internals
-----------------

 -  Front end: [Babel adapter](./package-parser-babel.md) and
    [Unicode data](./package-unicode.md).
 -  Compilation and execution: [compiler](./package-compiler.md),
    [C backend](./package-backend-c.md), [C runtime](./package-runtime-c.md),
    and [Zig adapter](./package-toolchain-zig.md).
 -  Integration and testing: [CLI](./package-cli.md),
    [host adapters](./package-host.md), and [test kit](./package-testkit.md).
