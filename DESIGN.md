Oseo design
===========

Status
------

This is a living design document. It records the constraints that should remain
true as Oseo grows, the boundaries between its major components, and the
decisions that later implementation work must preserve.
The [white paper](./WHITEPAPER.md) explains why Oseo should exist;
this document describes how it is intended to work.

The design may change at any point during development. Experiments, conformance
tests, implementation experience, and compatibility work will expose mistakes
and missing constraints. When they do, this document should change with the
implementation. A statement here describes the current design, not an immutable
promise. Changes that affect the core guarantees require an explicit rationale;
changes to provisional mechanisms are expected as evidence accumulates.

Several low-level choices are deliberately provisional. They need small,
measured prototypes before they become architecture decisions. Those choices
are called out below and should be recorded as architecture decision records
once settled.


Design goals
------------

Oseo compiles JavaScript and TypeScript functions ahead of time into native
code. A compiled function has a generic path that implements the language
semantics available in that Oseo release. It may also have specialized paths
guarded by cheap runtime checks. A failed guard transfers control to generic
code that is already present in the binary.

The following rules define the design:

 -  TypeScript annotations and JSDoc types are optimization hints. Adding,
    removing, or falsifying a hint must not change a program's observable
    behavior.
 -  Specialization must be removable. Compiling a program with specialization
    disabled must preserve its result, output, exceptions, and externally
    visible side effects.
 -  Generic execution is native execution. Oseo does not require an interpreter,
    runtime profiling tier, or deoptimization mechanism to preserve correctness.
 -  Oseo reports unsupported syntax and unsupported host capabilities
    explicitly. It must not silently assign partial or approximate semantics to
    them.
 -  The compiler must remain usable under Node.js and Deno. The compiler core
    must also stay within the TypeScript subset that Oseo intends to compile
    when it becomes self-hosting.
 -  Correctness comes before peak performance. A fast path is accepted only when
    its guard, overflow behavior, exceptional behavior, and fallback are covered
    by tests.


Supported semantics
-------------------

“Generic” does not mean that the first Oseo release implements all of
ECMA-262. Early releases will support an explicit language profile. Within that
profile, every accepted construct must have defined JavaScript behavior for
every value that can reach it. Syntax outside the profile is a compile-time
error.

The profile expands by adding complete semantic units. For example, supporting
the `+` operator for objects also requires the relevant primitive-conversion
behavior and user-observable calls. Oseo must not accept an object-valued `+`
expression and quietly substitute numeric addition.

Each release should publish its supported language profile and test262 results.
Passing selected test262 tests is evidence for a profile; it is not a claim of
ECMAScript conformance. Oseo should claim conformance only when it meets the
requirements of the applicable ECMA-262 edition.


Initial technical direction
---------------------------

Some choices follow directly from the white paper. Others are starting points
that may change after the first vertical slice.

| Area                   | Direction                                                     | Status               |
| ---------------------- | ------------------------------------------------------------- | -------------------- |
| Compiler language      | TypeScript                                                    | Decided              |
| Bootstrap hosts        | Node.js and Deno                                              | Decided              |
| Type information       | Syntax-level hints, without TypeScript type checking          | Decided              |
| Optimization model     | Guarded specialized paths beside a generic path               | Decided              |
| Initial target         | Linux on x86-64                                               | Provisional          |
| Initial native backend | Generate C11, then invoke Zig's C toolchain by default        | Provisional          |
| Generic value          | One 64-bit tagged word                                        | Decided in principle |
| Initial value layout   | NaN-boxing with an immediate small-integer form               | Provisional          |
| Initial collector      | Non-moving, stop-the-world mark and sweep with explicit roots | Provisional          |

Provisional choices require an architecture decision record. A decision record
must include the alternatives considered, the experiment used to choose among
them, and the conditions that would justify revisiting the choice.


Compiler architecture
---------------------

The compiler is split into stages with owned representations between them:

~~~~ mermaid
flowchart TD
    source[JavaScript or TypeScript source] --> parser[Bootstrap parser]
    parser --> syntax[Oseo syntax tree and extracted hints]
    syntax --> hir[Normalized high-level IR]
    hir --> mir[Control-flow MIR]
    mir --> generic[Generic lowering]
    mir --> specialized[Guarded specialization]
    generic --> operations[Backend-neutral machine operations]
    specialized --> operations
    operations --> backend[Initial C11 backend]
    backend --> native[Native object code and Oseo runtime]
~~~~

No stage after the source frontend may depend on the bootstrap parser's AST.
The frontend converts parser-specific nodes, comments, and source locations into
Oseo-owned data structures immediately. This boundary lets Oseo use a mature
parser during bootstrap and replace it later without rewriting optimization or
code generation.


Source frontend
---------------

The frontend parses JavaScript, TypeScript syntax, and JSDoc comments. It does
not invoke `tsc`, resolve TypeScript types, or reject a program because its type
annotations are inconsistent.

The frontend produces two kinds of information:

 -  a syntax tree containing only constructs understood by the current language
    profile;
 -  hints attached to parameters, bindings, expressions, properties, and return
    sites.

Hints must retain their provenance. Diagnostics and IR dumps should distinguish
an explicit TypeScript annotation, a JSDoc annotation, and a fact proven from
syntax or control flow. Proven facts may remove a guard; user annotations may
select a specialization but do not remove the guard that makes it safe.

Parser dependencies belong behind the frontend boundary. Code in the compiler
core must not import them or rely on their object layout, traversal helpers, or
host-specific module behavior.


Intermediate representations
----------------------------

The high-level IR normalizes syntax while retaining JavaScript evaluation
order, lexical scope, source locations, and abrupt completion behavior.
Syntactic sugar should disappear here rather than leak into every backend.

The mid-level IR is a control-flow graph. It makes guards, conversions, runtime
calls, exceptional edges, and boxing explicit. Its initial operation set should
be small, including operations equivalent to:

~~~~ text
guard_tag
guard_shape
unbox_smi
unbox_number
box_number
add_smi_checked
call_generic
call_runtime
branch
phi
return
throw
~~~~

The names and exact grouping may change. The required property is that a test
can tell whether a guard exists, where its failure edge goes, and whether a
specialized block allocates or calls a generic helper.

JavaScript evaluation order must be fixed before specialization. An optimizer
may not reorder property access, conversion, calls, or exceptions merely because
a hint suggests a primitive type.


Generic and specialized paths
-----------------------------

Every accepted function has a generic entry or generic continuation capable of
executing that function for every value supported by the current language
profile. Specialization adds guarded blocks to the same compiled unit or adds
private specialized entries that converge on the same generic implementation.
The representation is an implementation choice; the following behavior is not:

1.  A call reaches a guard selected from static facts and source hints.
2.  Passing the guard enters code that may use unboxed machine values and known
    object layouts.
3.  Failing the guard branches directly to generic code.
4.  Overflow, a shape mismatch, or any invalidated local assumption also returns
    to an appropriate generic continuation.
5.  No state visible to JavaScript may be committed before a guard that can
    still fail, unless the generic continuation is defined to resume after that
    state.

The first specialization should be a checked small-integer addition selected by
`number` parameter hints. It must cover wrong annotations, integer overflow,
negative zero, non-integer numbers, strings, and any other value admitted by the
language profile at that milestone.

Object specialization follows the same rule. A shape guard can enable fixed-slot
property access, but a miss must use generic property lookup without
reconstructing or deoptimizing a speculative frame.


Value representation
--------------------

The generic ABI passes and returns a single machine word named `OseoValue` in
this document. It must represent at least numbers, strings, booleans, `null`,
`undefined`, symbols, big integers, and heap object references as those values
enter the supported language profile.

The initial experiment should compare a NaN-boxed layout with a conventional
low-bit tagged layout. NaN-boxing is the current candidate because JavaScript
numbers are IEEE 754 doubles and should not all require heap allocation. The
experiment must cover pointer-width assumptions, NaN canonicalization, integer
range, generated guard sequences, garbage-collector recognition, and both
x86-64 and likely AArch64 constraints.

Specialized blocks may hold raw integers, doubles, or pointers in native
registers. A value must be converted back to `OseoValue` before it crosses a
generic ABI boundary, becomes visible to the garbage collector, or is stored in
a generic heap slot.

All C operations used by the initial backend must avoid undefined behavior.
Checked integer arithmetic, shifts, pointer conversion, and floating-point
corner cases need explicit helpers where the C abstract machine does not match
ECMAScript.


Runtime and object model
------------------------

The runtime supplies generic semantic operations, allocation, garbage
collection, strings, objects, host hooks, and diagnostics needed by generated
code. It is a private ABI during early development. Native-addon compatibility
does not constrain it.

An ordinary object is expected to contain a header and indexed storage. The
header identifies the object's runtime kind, garbage-collector state, and shape.
Shapes are immutable descriptions of property layout and attributes. Adding a
property normally follows a shape transition; objects that cannot use stable
shapes fall back to dictionary storage.

Prototype lookup, accessors, proxies, property descriptors, and enumeration
order are observable language semantics. Fixed-slot specialized access is added
only after the corresponding generic behavior exists. Arrays, functions,
closures, typed arrays, and other exotic objects build on the same collector
and property model but may have distinct layouts.


Memory management
-----------------

The initial collector should favor an inspectable rooting protocol over an
advanced collection strategy. Generated code records live generic values in an
explicit root stack around allocation points and runtime calls that may collect.
A non-moving mark-and-sweep collector then avoids relocation barriers while the
object representation and compiler ABI are still changing.

MIR must identify allocation and collection safepoints. Specialized raw values
that denote heap objects must either be described to the collector or be boxed
and rooted before a safepoint. Tests should be able to request collection at
every safepoint.

A moving or generational collector is a later performance decision. Introducing
one will require a separate decision record covering write barriers, interior
pointers, pinned objects, and generated-code metadata.


Calls, exceptions, and abrupt completion
----------------------------------------

The call ABI must support generic calls, specialized private entries, closures,
constructors, rest parameters, and eventual host calls. Only the generic ABI is
stable across independently compiled units. Specialized entries are private to
the linked program and may change between builds.

Exceptions, `return`, `break`, and `continue` are represented explicitly before
backend lowering. The first C backend needs a documented abrupt-completion ABI;
whether it uses explicit result values, exception continuations, or another
mechanism remains an initial architecture decision. The choice must preserve
garbage-collector roots and allow non-throwing specialized blocks to stay small.


Modules and whole-program compilation
-------------------------------------

Oseo compiles a resolved module graph rather than compiling one source file in
isolation and discovering ordinary imports at run time. Static ECMAScript
imports are resolved before native code generation. The linker records module
instantiation order, live bindings, and top-level evaluation order.

Dynamic import, `eval()`, and the `Function` constructor conflict with a purely
ahead-of-time model because they can introduce new source after the native
binary has been built. They remain outside the initial language profile.
Supporting any of them requires an explicit design that does not quietly
introduce an interpreter or JIT tier.

Package resolution is separate from module semantics. Early milestones use
explicit files or URLs. *package.json* `exports` and `imports`, CommonJS, and
the long tail of Node.js resolution belong to later compatibility work.


Host boundary and event loop
----------------------------

Generated programs use runtime host interfaces rather than calling Node.js or
Deno. The native runtime eventually provides an event loop, timers, networking,
cryptography, files, and other capabilities required by its selected
compatibility profiles.

The compiler itself uses narrow host adapters for file access, subprocesses,
environment variables, and diagnostics. Node.js and Deno adapters implement the
same internal interface. Compiler-core tests run against both adapters.

Promises and the ECMAScript job queue precede web APIs that depend on them.
Unhandled-rejection tracking, timers, streams, and `fetch()` must share one
documented scheduling model.


Native backend
--------------

The initial backend emits C11 for the selected target. A separate native
toolchain adapter invokes `zig cc` by default. This keeps the first
implementation in TypeScript, produces native functions, and makes generated
control flow easy to inspect. The compiler should support `--emit-c` and
`--dump-mir` from the first executable milestone.

Zig is a pinned bootstrap tool, not part of the generated program's semantic
contract. Toolchain selection stays behind an interface so another C compiler
can replace Zig without changing backend lowering or runtime semantics.

The C backend is downstream of a backend-neutral interface. Oseo may later emit
LLVM IR, use another code generator, or write object files directly without
changing source semantics or specialization decisions. Backend-specific
optimizations must not become prerequisites for correctness.

Runtime code is linked as a static library in the initial design. Generated
programs may still depend on selected system libraries. Those dependencies must
be listed as part of the target definition and must not be confused with
Node-API addon support.


Self-hosting
------------

Self-hosting is a constraint on the compiler from its first implementation, not
a cleanup phase at the end. The repository should keep three dependency layers:

~~~~ mermaid
flowchart BT
    hosts[Node.js and Deno host entry points]
    adapters[Source frontend and backend adapters]
    core[Restricted compiler core]
    hosts --> adapters
    adapters --> core
~~~~

The restricted compiler core uses only the TypeScript and JavaScript features
tracked in a machine-readable compiler profile. Host-specific APIs enter through
interfaces. Bootstrap-only parser dependencies remain outside the core.

As Oseo's language profile grows, continuous integration should compile an
increasing portion of the compiler core. The self-hosting milestone is reached
when an existing trusted Oseo compiler builds a native compiler, and that native
compiler can build an equivalent compiler from the same source. Reproducible or
bit-for-bit identical output is a separate goal.


Compatibility layers
--------------------

ECMAScript semantics, web-platform APIs, Node.js APIs, and package resolution
are separate layers. A package may be useful before Oseo conforms to every
standard, but compatibility claims must name the layer and tested surface.

WinterTC's [Minimum common web API] is not merely a list of globals.
Conformance requires the referenced web-platform behavior and ECMA-262
conformance. During development, Oseo should report API coverage and
web-platform-test results without describing partial coverage as WinterTC
conformance.

Selected Node.js APIs come after a useful web-platform runtime exists. Native
addons remain a non-goal. Package experiments should begin earlier, however, so
measured failures can inform the order in which language, web, Node.js, and
resolution features are built.

[Minimum common web API]: https://min-common-api.proposal.wintertc.org/


Testing and observability
-------------------------

Oseo needs tests that distinguish semantic correctness from successful
compilation. The test strategy has five layers:

 -  Unit tests cover parsing, hint extraction, normalization, MIR construction,
    value tags, and runtime helpers.
 -  Differential tests run the same source under Oseo and a reference JavaScript
    runtime, comparing output, exit status, returned values, and exceptions.
 -  Specialization-invariance tests compile with specialization enabled and
    disabled, then compare all observable behavior. Generated tests should
    mutate or remove hints.
 -  Structural tests inspect MIR, generated C, and selected machine code to
    confirm that guards and fallback edges exist and that important fast paths
    avoid allocation and generic helper calls.
 -  Standards tests add applicable test262 and web-platform-test cases as the
    supported profiles expand.

Test builds should expose counters for guard hits, guard misses, generic helper
calls, allocations, and collections. These counters are diagnostics, not part of
the program-visible runtime API.

The compiler must print stable source locations for unsupported syntax and
failed compilation. IR and C dumps should retain enough source information to
trace a native block back to the originating expression.


Open architecture decisions
---------------------------

The following questions must be settled by decision records before the affected
implementation becomes a dependency of later milestones:

 -  the exact tagged-value layout and supported address-space assumptions;
 -  the bootstrap parser and the plan for replacing or absorbing it;
 -  the initial C ABI for calls and abrupt completion;
 -  the garbage-collector root format and safepoint protocol;
 -  the object shape and dictionary layouts;
 -  the long-term native code-generation backend;
 -  the native event-loop and system-library boundary;
 -  the treatment of dynamic source evaluation;
 -  the WebAssembly implementation strategy required by the intended WinterTC
    profile.

[*ROADMAP.md*](./ROADMAP.md) orders the experiments and implementation work that
resolve these questions.
