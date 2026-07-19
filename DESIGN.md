Oseo design
===========

Status
------

This is a living design document. It records the constraints that should remain
true as Oseo grows, the boundaries between its major components, and the
decisions that later implementation work must preserve.
The [*WHITEPAPER.md*](./WHITEPAPER.md) white paper explains why Oseo should
exist; this document describes how it is intended to work.

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

| Area                   | Direction                                                     | Status                              |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------- |
| Compiler language      | TypeScript                                                    | Decided                             |
| Bootstrap hosts        | Node.js and Deno                                              | Decided                             |
| Type information       | Syntax-level hints, without TypeScript type checking          | Decided                             |
| Optimization model     | Guarded specialized paths beside a generic path               | Decided                             |
| Execution targets      | `linux-x86_64-gnu` and `macos-aarch64`                        | Implemented                         |
| Portability target     | `linux-aarch64-musl` compile-link and inspection              | Implemented                         |
| Initial native backend | Generate C11, then invoke Zig's C toolchain by default        | Implemented in M1                   |
| Generic value          | One 64-bit tagged word                                        | Decided in principle                |
| Initial value layout   | NaN-boxing with an immediate signed 48-bit integer            | Accepted for both execution targets |
| Initial collector      | Non-moving, stop-the-world mark and sweep with explicit roots | Implemented in M1                   |
| First specialization   | Guarded signed 48-bit addition with one generic fallback      | Implemented in M2                   |

The accepted M0 choices and their replacement triggers are recorded under
[*docs/adr/*](./docs/adr/). Choices that remain provisional require an
architecture decision record with alternatives, probe evidence, and the
conditions that would justify revisiting the choice.


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

M0 established this architecture as eight publishable packages under
*packages/*. `@oseo/compiler` owns the interfaces, and concrete parser, backend,
runtime, toolchain, and host packages depend inward on those contracts. The CLI
is the composition root. `@oseo/testkit` consumes injected public interfaces
rather than package-private source. Automated checks reject dependency cycles,
private cross-package imports, and concrete dependencies from compiler core.

M1 removed the synthetic backend input. Production input now traverses owned
syntax, resolved HIR, generic MIR, deterministic C11 lowering, static runtime
linking, and native execution. M2 added guarded specialization to this same
pipeline without creating a second composition path.


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

The bootstrap adapter uses `@babel/parser` with TypeScript syntax, comments,
tokens, and recoverable errors enabled. Parser dependencies belong behind the
frontend boundary. Code in the compiler core must not import them or rely on
their object layout, traversal helpers, or host-specific module behavior. Fatal
and recoverable parser failures become Oseo-owned diagnostics before leaving
the adapter.


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

M2 implements `guard-smi`, `unbox-smi`, checked addition, boxing, explicit
fallback blocks, and block-parameter result joins. Textual MIR names the
enabled or disabled policy, selected hint provenance, both guard successors,
the overflow successor, the one generic block, and the join. Disabled mode
retains the M1 graph without guarded operations.

MIR is the complete semantic input to native backends. It owns primitive
constants, binding reads and writes, operators, direct call targets, basic
blocks, parameters, hint provenance, and terminators. MIR parameters are copied
instead of retaining HIR parameter objects. A backend must not replay attached
HIR or source syntax, because doing so would let optimized MIR and native
execution diverge.

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

The first specialization is a checked small-integer addition selected by
consistent `number` parameter hints. M2 restricts selection to an exact
two-parameter return addition. Wrong annotations, integer overflow, negative
zero, non-integer numbers, strings, and every other admitted primitive enter
the same compiled generic addition block. The detailed implemented contract is
recorded in [*docs/specialization-m2.md*](./docs/specialization-m2.md).

Object specialization follows the same rule. A shape guard can enable fixed-slot
property access, but a miss must use generic property lookup without
reconstructing or deoptimizing a speculative frame.


Value representation
--------------------

The generic ABI passes and returns a single machine word named `OseoValue` in
this document. It must represent at least numbers, strings, booleans, `null`,
`undefined`, symbols, big integers, and heap object references as those values
enter the supported language profile.

The initial runtime uses a NaN-boxed layout on both supported execution
targets. It canonicalizes numeric NaN
to `0x7ff8000000000000`, stores signed 48-bit small integers immediately, and
uses a distinct tag for heap references below the checked 48-bit user-address
limit. The tag masks are private runtime ABI. ADR 0014 accepts this layout for
macOS AArch64 only with the checked publication boundary, allocator evidence,
forced collection, and address and undefined-behavior sanitizer coverage. The
runtime rejects a pointer with high address or metadata bits before publishing
it and never silently strips pointer authentication or top-byte metadata.

Specialized blocks may hold raw integers, doubles, or pointers in native
registers. A value must be converted back to `OseoValue` before it crosses a
generic ABI boundary, becomes visible to the garbage collector, or is stored in
a generic heap slot.

The M2 path recognizes and unboxes immediate values through private runtime
inline primitives. Checked addition validates both operand and result ranges
before C signed arithmetic. Overflow branches to generic addition before a
boxed result is committed.

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

The C runtime is not the intended home of every standard built-in. Once the
language profile can express them, built-in families may be self-hosted in
the compiled TypeScript subset and compiled by Oseo, with only primitive
operations remaining native, following the practice of mainstream engines.
[*ROADMAP.md*](./ROADMAP.md) records this direction under M8; the choice is
made per family with recorded evidence when the family lands.

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

The initial collector uses an inspectable rooting protocol. Generated code
records live generic values in linked root frames around allocation points and
runtime calls that may collect. Each frame points to a contiguous slot array and
the previous frame. A non-moving mark-and-sweep collector avoids relocation
barriers while the object representation and compiler ABI are still changing.
Root slot arrays are allocated independently of generated C stack frames. A
deterministic aggregate root-slot budget is checked before entering generated C
so compiler spill space for wide functions cannot bypass the owned runtime
failure boundary.

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
backend lowering. A generic call returns a two-word `OseoResult` containing an
`OseoStatus` and an `OseoValue`. Normal and thrown values use the same value
field. `return`, `break`, and `continue` are resolved within a compiled
function; only thrown completion crosses an ordinary call boundary. Private
helpers that are proven not to throw may return a value directly.


Modules and whole-program compilation
-------------------------------------

Oseo compiles a resolved module graph rather than compiling one source file in
isolation and discovering ordinary imports at run time. Static ECMAScript
imports are resolved before native code generation. The linker records module
instantiation order, live bindings, and top-level evaluation order.

M4 canonicalizes `file:` identities through a host-neutral resolver and records
source hashes before linking. Tarjan components make cycles inspectable. The
compiler allocates every exported cell and shared namespace before lowering
each module body into a private evaluator. Imports reuse exporter cell
identifiers, so evaluator boundaries do not copy a binding or make C
declaration order semantic.

An evaluator with top-level await returns a promise backed by generated
continuation closures. Evaluation starts every dependency-ready module in
source order, so an independent sibling can run while another module is
suspended. Importers wait for their asynchronous dependencies before their own
evaluator runs. The entry task reports an owned diagnostic when no runtime-owned
job or timer can make progress. Asynchronous module cycles remain outside M4.

Dynamic import, `eval()`, and the `Function` constructor conflict with a purely
ahead-of-time model because they can introduce new source after the native
binary has been built.
[ADR 0016](./docs/adr/0016-dynamic-source-boundary.md) keeps them outside
the language profile with owned diagnostics and honest manifest
classifications. Supporting any of them requires an explicit design that
does not quietly introduce an interpreter or JIT tier; staged compilation
is the recorded candidate for `eval`, and build-time-resolvable dynamic
import remains a deferred admission with its own plan.

Package resolution is separate from module semantics. Early milestones use
explicit files or URLs. *package.json* `exports` and `imports`, CommonJS, and
the long tail of Node.js resolution belong to later compatibility work.


Host boundary and event loop
----------------------------

Generated programs use runtime host interfaces rather than calling Node.js or
Deno. The M4 native runtime provides promise jobs, a timer scheduler, and
shutdown. Later compatibility profiles add networking, cryptography, files, and
other capabilities through the same boundary.

The compiler itself uses narrow host adapters for file access, subprocesses,
environment variables, and diagnostics. Node.js and Deno adapters implement the
same internal interface. Compiler-core tests run against both adapters.

The adapters also normalize execution-host operating-system and architecture
facts without selecting a native target. The CLI and test composition layers
choose a host-native target or reject an unknown or mismatched pair before the
toolchain runs. Target descriptions contain only immutable artifact and
sanitizer facts; they do not claim universal executability.

Promises and the ECMAScript job queue precede web APIs that depend on them. M4
owns promises, reactions, thenable jobs, rejection checkpoints, a timer queue,
and a deterministic logical clock in the C runtime. Asynchronous functions use
generated continuation closures, so a suspension returns from the native C
frame before a queued reaction resumes it. Each timer task drains microtasks
before the next timer, and pending promises alone do not keep the executable
alive.

The runtime ABI is the replacement boundary for a future platform event
adapter. Streams, `fetch()`, I/O readiness, wakeups, and wall-clock observation
remain outside M4 and must extend the same documented scheduling and liveness
model.


Native backend
--------------

The initial backend emits shared C11 for `linux-x86_64-gnu`, `macos-aarch64`,
and `linux-aarch64-musl`. A separate native toolchain adapter invokes pinned
`zig cc` with an explicit target by default. Linux on AMD64 and macOS on
AArch64 execute their matching artifacts. AArch64 Linux remains compile-link
and inspection evidence. This keeps the first implementation in TypeScript,
produces native functions, and makes generated control flow easy to inspect.
The compiler supports `--emit-c` and `--dump-mir` from the first executable
milestone.

Zig is a pinned bootstrap tool, not part of the generated program's semantic
contract. Toolchain selection stays behind an interface so another C compiler
can replace Zig without changing backend lowering or runtime semantics.

Oseo target IDs use operating-system, architecture, and optional ABI order.
They are stable compiler identifiers, not Zig or LLVM target strings. Concrete
toolchain adapters own the mapping from structured target facts to their
external spelling. `NativeOperatingSystem` remains an operating-system type;
only execution-host detection may report `unknown`.

The C backend is downstream of a backend-neutral interface. Oseo may later emit
LLVM IR, use another code generator, or write object files directly without
changing source semantics or specialization decisions. Backend-specific
optimizations must not become prerequisites for correctness.

The backend lowers MIR blocks, operations, and terminators directly. HIR is not
retained in `MirFunction`, and changing a MIR operation changes emitted C. This
keeps `--dump-mir`, specialization passes, and native execution on one semantic
path.

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
compilation. The test strategy has six layers:

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
 -  Property tests generate structured programs, values, module graphs, and
    schedules, then compare reference, specialization, collection, or model
    observations.

Property suites use explicit reviewed seeds, case budgets, and size limits.
They retain structured inputs through source printing so failures shrink within
the admitted profile. A failure report records enough metadata to replay the
same case directly. Interrupted or incomplete runs are failures, not shortened
passes. M4 begins this infrastructure with `fast-check`; M5 extends the same
models and replay contract into grammar-based differential generation.

The M4 native schedule property prints promise commands, repeated async
suspensions, timer deadlines, cancellations, and task-created microtasks from
one structured model. It compares the model with Node.js, Deno,
specialization-disabled native execution, and specialization-enabled execution
with collection forced at each safepoint. The ordinary gate runs ten native
cases; the extended task increases both case count and schedule size.
Each run records the normalized execution host, exact native target, and
sanitizer modes in its retained failure context.

Test builds should expose counters for guard hits, guard misses, generic helper
calls, allocations, and collections. These counters are diagnostics, not part of
the program-visible runtime API.

M2 observation-enabled builds emit one private counter record. The testkit
removes it from process stderr before differential comparison. Ordinary CLI
builds neither update specialized counters nor print an observation record.

M3 pinned a reviewed test262 subset and retained its complete frontmatter
and native observations in a deterministic manifest. M5 freezes the
measurement boundary and manifest schema in
[ADR 0013](./docs/adr/0013-m5-edition-and-manifest.md): one counted row per
upstream path with executed variants, execution mode, dependency tags, and
module-graph evidence recorded inside it, and exactly five classifications
with expected-negative covering matched parse, resolution, and runtime
negatives. Applicable Script cases run in every requested strictness mode
with specialization disabled and enabled; module and asynchronous cases run
under the deterministic native scheduler through the explicit CLI module
goal. The gate rejects semantic failures, harness failures, or changes from
the reviewed classification instead of counting unsupported cases as
passes, and summaries keep raw, path-group, and dependency-tag totals.
ADR 0015 keeps `linux-x86_64-gnu` as the canonical manifest target, while ADR
0014 adds a digest-pinned parity record. Each supported execution host reruns
the complete reviewed subset and normalizes only the target ID before comparing
the manifest, so target evidence cannot duplicate compatibility counts.

The compiler must print stable source locations for unsupported syntax and
failed compilation. IR and C dumps should retain enough source information to
trace a native block back to the originating expression.


Remaining architecture decisions
--------------------------------

M0 accepted the bootstrap parser, initial C boundary, x86-64 value layout,
generic call result, and explicit root protocol. ADR 0016 keeps `eval`, the
`Function` constructor, and dynamic import explicitly unsupported during M5
and names staged compilation as the only design-compatible route to
admitting them later. The following questions still need decision records
before the affected implementation becomes a dependency of later
milestones:

 -  the long-term native code-generation backend;
 -  the native event-loop and system-library boundary;
 -  the WebAssembly implementation strategy required by the intended WinterTC
    profile.

[*ROADMAP.md*](./ROADMAP.md) orders the experiments and implementation work that
resolve these questions.
