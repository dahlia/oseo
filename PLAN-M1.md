M1 plan for the generic native vertical slice
=============================================

Status
------

Implementation status: ready, not started. M0 established the publishable
workspace, package boundaries, dual-host tests, package validation, and native
fixture harness required by this plan.

M1 replaces the synthetic native fixture input with the first complete
source-to-executable compiler path. The result is intentionally generic-only.
It proves that accepted JavaScript and TypeScript syntax has defined semantics
before M2 adds hint-driven specialization.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*docs/language-profile-m1.md*](./docs/language-profile-m1.md), and the accepted
records under *docs/adr/*. When implementation evidence changes one of those
contracts, update the affected document in the same change.


Entry criteria
--------------

M1 begins with the following M0 contracts in place:

 -  all eight `@oseo/*` packages build as independent ESM packages for npm and
    expose TypeScript source for JSR;
 -  compiler-core source runs directly under Node.js and Deno;
 -  Babel is contained behind the source-frontend interface;
 -  target selection, C emission, runtime inputs, toolchain command
    construction, and host process execution are separate responsibilities;
 -  `OseoValue`, `OseoResult`, and root frames have accepted native contracts;
 -  the native harness executes an x86-64 Linux fixture and compile-links the
    same inputs for AArch64 Linux;
 -  `--emit-c` and `--dump-mir` are reserved CLI options;
 -  `mise run check` and `mise run test` cover the clean repository gates.

The synthetic M0 module remains test infrastructure until the first M1 source
fixture passes through owned syntax, HIR, MIR, generic lowering, C emission,
linking, and native execution. Remove the synthetic path only after the real
path covers the same backend, runtime, toolchain, and host boundaries.


Language profile
----------------

[*docs/language-profile-m1.md*](./docs/language-profile-m1.md) is the source of
truth for accepted syntax and behavior. M1 accepts one script containing the
following semantic units:

 -  `undefined`, `null`, Boolean, binary64 number, and string values;
 -  top-level function declarations, `const` declarations, and expression
    statements;
 -  function parameters, block-scoped `const` bindings, calls, and returns;
 -  block and `if` statements with ordinary JavaScript evaluation order;
 -  unary `-` and `!`;
 -  `+`, `-`, `*`, `/`, `===`, `!==`, `<`, `<=`, `>`, and `>=`;
 -  statically resolved direct calls and recursion;
 -  the exact `console.log(...)` host intrinsic defined by the profile;
 -  TypeScript and JSDoc hints retained as metadata but ignored by lowering.

Every accepted operator handles every M1 primitive that can reach it. In
particular, `+` implements string concatenation and numeric conversion rather
than assuming numeric inputs. Numbers preserve `NaN`, infinities, and negative
zero behavior. String comparison and concatenation use UTF-16 code units.

Function declarations are callable by statically resolved name but are not M1
language values. Internal function identifiers may appear in compiler data and
native linkage, but a program cannot store, return, or pass a function.

Features outside the profile produce `OSEO1001` at the smallest unsupported
source form. Parse failures produce `OSEO0001`. Runtime and host failures use
`OSEO2001` and `OSEO3001` at the boundaries defined by the profile. No failure
prints a Babel, Node.js, Deno, Zig, or C stack trace as the primary diagnostic.


Package ownership
-----------------

M1 extends the package boundaries established in M0 without adding a new
composition path.

| Package               | M1 responsibility                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@oseo/compiler`      | Owned syntax, hints, HIR, MIR, diagnostics, semantic operations, compiler orchestration, and textual dumps |
| `@oseo/parser-babel`  | Babel parsing and immediate conversion to owned syntax and owned diagnostics                               |
| `@oseo/backend-c`     | Deterministic lowering of backend-neutral M1 native input to C11                                           |
| `@oseo/runtime-c`     | Opaque tagged values, primitive semantic helpers, strings, call results, roots, and `console.log` support  |
| `@oseo/toolchain-zig` | Native and cross-target compilation and static linking plans                                               |
| `@oseo/host`          | Source and output file access, temporary directories, subprocesses, and diagnostic streams                 |
| `@oseo/cli`           | Command-line parsing, concrete adapter composition, and source-to-artifact workflow                        |
| `@oseo/testkit`       | Differential fixtures, structural assertions, native observations, and retained failure artifacts          |

The compiler package does not import concrete adapters. HIR and MIR do not
contain Babel nodes or C syntax. The C backend does not locate Zig, execute a
process, or select runtime files. Runtime helpers do not depend on the C
backend that emitted their callers.


Owned syntax and hints
----------------------

The frontend returns a production Oseo syntax tree for exactly the M1 profile.
Every node has an owned source range. Identifiers retain their spelling, and
string and number literals retain enough source information for diagnostics
without requiring Babel nodes after conversion.

The owned tree represents accepted forms directly. Parser-specific syntax is
converted or rejected before the result leaves `@oseo/parser-babel`. Parentheses
may disappear after their range has served diagnostics; their evaluation does
not change. Unsupported TypeScript syntax is not passed through as an opaque
node.

Hints use a small owned representation with provenance for TypeScript
annotations and JSDoc. M1 records the accepted primitive hint names on
parameters, bindings, and returns. Hints do not alter profile validation, HIR,
MIR operations, emitted C, or observable behavior. Tests compare compilations
with truthful, false, and absent hints even though specialization is disabled.

The parser adapter converts fatal and recoverable Babel errors into owned
diagnostics. UTF-8 byte offsets and one-based Unicode scalar-value line and
column positions follow the existing diagnostic contract for LF, CRLF, and
Unicode fixtures.


HIR contract
------------

HIR removes syntax that later stages should not need while preserving lexical
scope, source locations, and JavaScript evaluation order. It owns resolved
binding and function identities so later stages do not repeat name lookup.

HIR construction must make these rules testable:

 -  declarations have lexical scope and temporal-dead-zone behavior;
 -  a binding read resolves to one declaration or produces a diagnostic;
 -  duplicate declarations and invalid return placement fail before MIR;
 -  call operands and arguments evaluate from left to right;
 -  binary operands evaluate left before right;
 -  an abrupt completion prevents later evaluation;
 -  missing arguments become `undefined` and extra arguments are evaluated;
 -  direct recursion resolves without turning functions into language values.

The textual HIR printer is deterministic. It includes source identifiers,
owned ranges, binding identities, function identities, and retained hint
provenance. Snapshot tests normalize temporary paths but do not hide semantic
operations or ordering.


MIR contract
------------

MIR is a control-flow graph with explicit blocks, values, operations, and
terminators. It contains generic operations only. No M1 operation assumes a
hint is true, and no M1 block is a specialized entry.

The initial MIR needs operations for:

 -  primitive constants and binding reads;
 -  generic unary and binary semantic helpers;
 -  statically resolved generic calls;
 -  the `console.log` host intrinsic;
 -  conditional branches, joins, returns, and unreachable continuation;
 -  explicit normal and abrupt call results;
 -  root-slot updates and safepoints for heap-bearing values;
 -  source locations on operations that can fail or call the runtime.

Exact operation names belong to `@oseo/compiler` and may change while M1 is in
progress. Their required property is inspectability: tests can recover
evaluation order, call status checks, control-flow successors, root liveness,
and the helper selected for each semantic operation.

The textual MIR printer is stable enough for reviewed fixtures. It assigns
deterministic block and value identifiers and never includes object identity,
host paths, or iteration-order accidents.


Generic value and runtime semantics
-----------------------------------

M1 implements the x86-64 NaN-boxed layout accepted by
[*0004-generic-tagged-value.md*](./docs/adr/0004-generic-tagged-value.md).
Private C headers own all masks and payload operations. TypeScript packages see
only the opaque value and runtime-input contracts.

The runtime covers every M1 primitive:

 -  ordinary binary64 numbers cross the generic ABI without allocation;
 -  numeric NaN is canonicalized at every boxing boundary;
 -  signed 48-bit integers use the accepted immediate representation;
 -  Boolean, `null`, and `undefined` use distinct singleton tags;
 -  strings are heap values with ECMAScript UTF-16 code-unit contents;
 -  heap addresses are checked before entering the 48-bit payload.

Runtime helpers implement the M1 conversion and operator graph. C arithmetic
uses unsigned or checked operations where signed overflow would be undefined.
Division, negative zero, infinities, NaN, and integer-to-double transitions are
covered directly. String conversion produces the profile's required spellings
for every M1 primitive.

The first heap implementation only needs the allocation and tracing behavior
required by M1 strings. It uses the accepted non-moving collector and linked
root frames. Generated code registers every live heap-bearing value across an
allocation or collecting runtime call. Test builds can request collection at
every declared safepoint. Ordinary objects and their property semantics remain
M3 work.

Generic calls use the accepted two-word `OseoResult`. Callers inspect status
before using a normal value, balance roots on both paths, and propagate an
abrupt runtime result without evaluating later expressions. M1 source has no
`throw` statement, but runtime failures exercise the abrupt ABI.


C11 lowering and native build
-----------------------------

The C backend consumes backend-neutral MIR lowering output. Generated C has one
stable generic entry per declared function plus a script entry. It links to the
runtime as a separate static archive. Generated translation units do not embed
runtime source.

Lowering preserves these boundaries:

 -  source semantics are selected before C emission;
 -  generic helper calls are explicit in MIR and generated C;
 -  every generic call checks `OseoResult.status`;
 -  root frames are pushed before covered safepoints and popped on every exit;
 -  target assumptions come from the target description;
 -  all generated C passes strict C11 warnings and undefined-behavior
    sanitization on the native target.

`x86_64-linux-gnu` remains the only execution target in M1. Every fixture also
compile-links for `aarch64-linux-musl` to detect accidental host headers or ABI
inheritance. AArch64 execution and its tagged-pointer validation remain outside
the supported target claim.


CLI and artifacts
-----------------

The CLI turns its reserved options into working M1 behavior. A normal source
invocation parses, validates, lowers, emits C, compiles, links, and runs or
writes the requested executable according to the final command contract.

`--dump-mir` prints deterministic MIR for accepted source and performs no
native compilation. `--emit-c` prints deterministic C11 and performs no
toolchain invocation. Both modes report the same parser and profile diagnostics
as a normal build. `--help` and `--version` preserve their M0 behavior.

Temporary C, object, archive, and executable files are removed after success.
Failures retain the full native observation through `@oseo/testkit`: stdout,
stderr, exit status, target, emitted C, and exact compiler invocation. Source
identifiers survive into dumps and runtime diagnostics without exposing a host
stack trace.


Work sequence
-------------

1.  Freeze the M1 fixture corpus.

    Add positive and negative source fixtures for every rule in the language
    profile. Record Node.js and Deno observations before compiler work. The two
    hosts must agree for every fixture used as a native oracle.

2.  Implement production owned syntax.

    Write frontend tests first, then convert Babel output to owned declarations,
    statements, expressions, hints, and diagnostics. Reject every parseable
    form outside the profile at its smallest source range.

3.  Implement scope resolution and HIR.

    Add lexical binding and static function resolution, temporal-dead-zone
    checks, fixed evaluation order, and a deterministic HIR printer. Test HIR
    without involving the C backend.

4.  Implement generic control-flow MIR.

    Lower each accepted semantic unit to explicit generic operations, blocks,
    joins, call statuses, roots, and terminators. Add deterministic MIR dumps
    and structural tests before C emission.

5.  Implement the M1 C runtime.

    Add opaque tagged values, strings, primitive conversions, operators,
    `OseoResult`, root frames, string collection, and the deterministic
    `console.log` intrinsic. Test helpers as C units with sanitizers before
    generated code calls them.

6.  Replace synthetic backend input with MIR lowering.

    Emit deterministic C11 for generic functions and the script entry. Keep the
    synthetic fixture until one real source fixture passes the complete native
    path, then remove the synthetic public type and test-only emission branch.

7.  Complete compiler orchestration and the CLI.

    Connect the frontend, HIR, MIR, backend, runtime, toolchain, and host
    through injected public interfaces. Implement working `--dump-mir` and
    `--emit-c` modes without adding a second build pipeline.

8.  Expand differential and structural coverage.

    Run the full fixture matrix under Node.js, Deno, and native x86-64. Force
    collection at each safepoint, inspect MIR and C, compile-link AArch64, and
    verify that hint mutations leave every observation unchanged.

9.  Close M1 evidence.

    Update the language profile, design, roadmap, package documentation, and
    decision records to match the implementation. Record any garbage-collector,
    exception, target, or ABI evidence that changes the prerequisites for M2.


Test matrix
-----------

| Surface                  | Node.js                    | Deno                     | Native x86-64                   | AArch64 compile-only |
| ------------------------ | -------------------------- | ------------------------ | ------------------------------- | -------------------- |
| Compiler-core units      | Direct TypeScript source   | Direct TypeScript source | Not applicable                  | Not applicable       |
| Frontend and diagnostics | Babel adapter source       | Babel adapter source     | Not applicable                  | Not applicable       |
| HIR and MIR structure    | Deterministic dumps        | Deterministic dumps      | Selected generated C inspection | C compile and link   |
| Runtime helpers          | Build orchestration        | Build orchestration      | C units with sanitizers         | C compile and link   |
| Differential fixtures    | Reference observation      | Reference observation    | Compile, run, and compare       | Compile and link     |
| Package validation       | Built ESM and npm archives | JSR TypeScript dry run   | Runtime assets inspected        | Runtime assets used  |

Focused tests should use the smallest layer that proves the contract. A native
fixture is required when behavior crosses the compiler-runtime boundary, but it
does not replace an owned-syntax, HIR, MIR, or runtime-helper unit test.


Required fixture classes
------------------------

The differential corpus includes:

 -  every primitive literal, including escaped strings and Unicode;
 -  `NaN`, infinities, overflow to infinity, subnormal numbers, and negative
    zero;
 -  truthiness and `!` for every M1 primitive kind;
 -  numeric conversion for `-`, `*`, and `/`;
 -  numeric addition and string concatenation for every admitted operand pair;
 -  strict equality, inequality, and relational comparison edge cases;
 -  lexical shadowing, temporal dead zones, branches, and nested blocks;
 -  recursion, nested calls, missing arguments, and evaluated extra arguments;
 -  left-to-right evaluation with visible `console.log` side effects;
 -  normal returns, implicit `undefined`, and abrupt runtime propagation;
 -  truthful, false, and absent TypeScript and JSDoc hints;
 -  one negative fixture for every syntax form held back by prerequisites;
 -  LF, CRLF, Unicode identifier, parse failure, runtime failure, and missing
    host-capability diagnostics.

Generated cases may cover the primitive operand matrix, but reviewed fixtures
remain for evaluation order, source ranges, call behavior, and native output.


Exit criteria
-------------

M1 is complete when all of the following are true:

 -  at least one source fixture traverses owned syntax, HIR, MIR, generic C11
    lowering, Zig compilation, static runtime linking, and native execution;
 -  every accepted language-profile rule has a differential fixture whose
    native observation matches Node.js and Deno;
 -  every parseable feature outside the profile produces `OSEO1001`, and all
    four diagnostic classes have stable source-located fixtures;
 -  HIR and MIR dumps deterministically expose evaluation order, control flow,
    generic calls, abrupt edges, roots, and safepoints;
 -  the runtime represents every M1 primitive and passes conversion, operator,
    string, call-result, root, and forced-collection tests;
 -  generated and runtime C pass strict warnings and undefined-behavior
    sanitization on `x86_64-linux-gnu`;
 -  every accepted fixture compile-links for `aarch64-linux-musl` without
    inheriting host headers or a host target;
 -  `--dump-mir` and `--emit-c` produce useful output for accepted source and do
    not execute later pipeline stages;
 -  adding, removing, or falsifying an accepted hint does not change source
    acceptance, MIR semantics, native output, exceptions, or side effects;
 -  npm and JSR package checks continue to pass without exposing Babel nodes,
    runtime tag masks, or package-private source paths;
 -  the synthetic M0 native module has been removed from public contracts;
 -  `mise run check` passes from a clean checkout in Linux CI;
 -  Node.js and Deno source tests pass on Linux, macOS, and Windows CI;
 -  native fixtures and architecture probes pass in Linux x86-64 CI;
 -  [*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md), the language
    profile, package documentation, and decision records match the implemented
    compiler.


Out of scope
------------

M1 does not add hint-driven specialization, guard operations, unboxed fast
paths, deoptimization, or performance claims. Those belong to M2 after the
generic path is complete.

Objects, arrays, property access, closures, function values, constructors,
language-level exceptions, assignment, loops, modules, promises, asynchronous
execution, web APIs, Node.js compatibility, and package resolution remain
outside the profile. M1 may record evidence about their prerequisites, but it
must reject their syntax or host use rather than implement a placeholder.
