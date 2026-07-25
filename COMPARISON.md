Oseo among JavaScript and TypeScript compilers
==============================================

Many projects can turn a JavaScript-looking file into something called a
binary. That description covers several very different operations: putting
source or bytecode beside an interpreter, compiling a statically typed
JavaScript variant to WebAssembly, lowering a practical TypeScript subset to
machine code, or compiling JavaScript semantics themselves ahead of time.
The output suffix does not tell us which one happened.

Oseo belongs to the last category, with an additional constraint that gives the
project its identity. It compiles a generic native implementation of every
accepted function, then may place guarded specialized code beside it.
TypeScript annotations and JSDoc types can help select the specialized code,
but they are never trusted as facts about a value. A failed guard transfers
control to generic code that was compiled into the same binary. There is no
interpreter to fall back to, no hotness profiler to consult, and no optimized
frame to deoptimize.

The shortest accurate description is therefore not “TypeScript to native.”
Oseo compiles both the dynamic answer and selected checked shortcuts before the
program starts.

This comparison reflects Oseo at commit `9eb7de2` and the public sources
inspected on 26 July 2026. Version-sensitive observations below identify the
source or revision used.

That distinction is already implemented in a deliberately narrow but real
case. The M2 small-integer addition path contains tag guards, checked
arithmetic, and a compiled generic `+` fallback. Specialization can be
disabled, and the two builds must have identical observable behavior. The
architecture requires the same relationship for every later specialization. The
[*WHITEPAPER.md*](./WHITEPAPER.md) states the idea, while
[*DESIGN.md*](./DESIGN.md) and
[*docs/specialization-m2.md*](./docs/specialization-m2.md) turn it into a
testable compiler contract.


What the comparison is actually comparing
-----------------------------------------

The projects below overlap in syntax, output format, or use case. They do not
all occupy the same layer.

| Project        | Source language                                                         | Execution model                                                            | Role of types                                                           | Primary boundary or goal                                               |
| -------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js        | JavaScript, with TypeScript normally erased before execution            | V8 interpreter and several JIT tiers                                       | No role in V8 after ordinary TypeScript erasure                         | A general server runtime and the Node.js API ecosystem                 |
| AssemblyScript | A strictly typed TypeScript-like language                               | Ahead-of-time compilation to WebAssembly                                   | Types define what programs mean and which programs are valid            | Small, efficient WebAssembly modules                                   |
| Perry          | A practical TypeScript and JavaScript subset                            | Ahead-of-time LLVM native code, with an optional JavaScript evaluator path | Types are erased; compiler inference guides native code generation      | Native applications and broad practical API compatibility              |
| scriptc        | TypeScript and JavaScript checked against a compiler-owned type surface | Typed LLVM or C native code, with an opt-in QuickJS-ng island              | Checker results choose representations; dynamic crossings are validated | Small native programs with practical Node.js and package compatibility |
| Porffor        | An experimental JavaScript/TypeScript sub- and superset                 | Ahead-of-time WebAssembly, with a separate IR-to-C native path             | Annotations can be enabled as unchecked optimization input              | Tiny, from-scratch AOT JavaScript research                             |
| Static Hermes  | A sound typed JavaScript subset plus untyped JavaScript                 | Native compilation for typed code alongside evolving VM tiers              | Typed annotations are enforced with compile-time and checked casts      | High-performance typed JavaScript and React Native                     |
| QuickJS        | JavaScript                                                              | Stack bytecode interpreted by QuickJS                                      | No TypeScript optimization contract                                     | A small embeddable JavaScript engine                                   |
| Oseo           | An explicit JavaScript profile plus erasable TypeScript syntax          | Generic native code plus guarded specialized native code                   | Annotations are fallible hints and must not affect behavior             | A standards-measured, whole-program native server runtime              |

This table describes architectural intent, not maturity. Node.js is a mature
runtime. AssemblyScript is an established language and toolchain. Perry is
shipping a fast-moving product, as is scriptc. Porffor, Static Hermes, and Oseo
are still research or active implementation efforts in relevant respects.
Oseo cannot yet run the broad programs that its M6 and M7 plans target.


Node.js: the runtime Oseo declines to carry
-------------------------------------------

Node.js is the practical baseline for server-side JavaScript, but it is not an
ahead-of-time JavaScript compiler. Its language engine is V8. In V8, JavaScript
first becomes Ignition bytecode and begins execution without assumptions about
future values. The engine gathers type and object-shape feedback while the
program runs. Sparkplug, Maglev, and TurboFan then occupy progressively more
optimized tiers. Maglev can emit a checked fixed-offset property load after
observing a stable shape, but it also emits frame-state metadata so a failed
assumption can reconstruct less optimized execution. V8's own
[Maglev description] calls out both the runtime feedback and the deoptimization
metadata.

The two shapes can be reduced to this:

~~~~ mermaid
flowchart TD
    sourceV8[JavaScript source] --> bytecode[Ignition bytecode]
    bytecode --> execute[Execute and collect feedback]
    execute --> jit[Speculative JIT code]
    jit -->|failed assumption| deopt[Reconstruct less optimized state]
    deopt --> execute

    sourceOseo[JavaScript or TypeScript source]
    sourceOseo --> generic[Generic native path]
    sourceOseo --> specialized[Compiled guarded path]
    specialized -->|failed guard| generic
~~~~

V8's design has a major advantage: it can learn what a particular deployment
actually does. Oseo deliberately gives that up. It has no runtime hotness data,
cannot specialize again when a workload changes, and cannot use an interpreter
as a compact home for cold code. In return, its executable does not need the
profiling, tiering, on-stack replacement, and deoptimization machinery that
makes adaptive optimization possible.

Node.js single-executable applications do not change this distinction. The
current [Node.js SEA documentation] says that a prepared blob containing a
bundled script is injected into the `node` binary and executed when that binary
starts. Code cache and startup snapshots can reduce startup work, but the
result remains a Node.js and V8 executable. “One file” describes distribution,
not whole-program native compilation.

Current Node.js can also execute files that contain erasable TypeScript syntax.
Its [TypeScript documentation] says that Node.js replaces the syntax with
whitespace, performs no type checking, and ignores `tsconfig.json`. This
narrows the tooling gap without giving V8 TypeScript-derived assumptions.
For Node.js, an annotation is erased before execution. Oseo retains it as an
untrusted optimization candidate, then compiles both guarded and generic
outcomes.

Oseo also treats Node.js APIs as a compatibility layer rather than the
definition of its host. Its planned order is ECMAScript, the
[Minimum common web API], then selected Node.js APIs and package conventions.
The stable C ABI for Node.js native addons remains a non-goal. This makes
Node.js both a reference runtime and a future compatibility target, not Oseo's
architectural base. The distinction matters whenever a package assumes
`process`, CommonJS resolution, or a native addon: none of those follows
automatically from compiling JavaScript semantics.

[Maglev description]: https://v8.dev/blog/maglev
[Node.js SEA documentation]: https://nodejs.org/api/single-executable-applications.html
[TypeScript documentation]: https://nodejs.org/api/typescript.html
[Minimum common web API]: https://min-common-api.proposal.wintertc.org/


AssemblyScript: familiar syntax, a different language
-----------------------------------------------------

AssemblyScript is sometimes described as TypeScript compiled to WebAssembly.
Its own documentation is more precise: it is a TypeScript-like variant, partly
a subset and partly a superset, and existing TypeScript is unlikely to compile
without porting. The language is intentionally strict. It has WebAssembly
integer types, no `any`, no general `undefined`, restricted objects, and no
prototype patching. Several dynamic JavaScript features are omitted because
supporting them would pull the implementation toward an interpreter. The
[AssemblyScript concepts guide] makes that trade explicit.

This is not a temporary gap on the way to becoming Oseo. It is a different
answer to AOT compilation. AssemblyScript obtains predictable WebAssembly by
narrowing the language and asking types to prove what machine operations are
valid. An `i32` annotation is a semantic commitment. A TypeScript assertion
acts as a conversion. Code that violates the type rules is not another dynamic
case for a generic JavaScript operator.

Oseo preserves the opposite rule. A parameter annotated as `number` may receive
a string through `any`, an assertion, plain JavaScript, or an untyped package.
The annotation may justify generating a numeric fast path, but only a runtime
guard may enter it. If the value is a string, the already compiled generic `+`
path must perform JavaScript concatenation. Adding, removing, or lying in a
type annotation must not change the result.

The deployment boundary differs as much as the type system. AssemblyScript
produces a WebAssembly module whose access to the outside world comes through
explicit imports. That gives it a strong sandbox and makes a JavaScript or
standalone WebAssembly host part of the application design. Oseo currently
emits native executables and owns a private runtime ABI, collector, module
linker, promise jobs, and scheduler. Its future web and Node.js layers are
intended to make the executable itself a server runtime. WebAssembly appears in
Oseo's roadmap as a JavaScript and web API that the runtime must eventually
provide, not as the current program-code target.

AssemblyScript is a good choice when a developer can write or port a
computation into a statically typed WebAssembly-oriented language. Oseo is
taking on the more expensive problem of accepting dynamic JavaScript behavior
without retaining a JavaScript VM tier.

[AssemblyScript concepts guide]: https://www.assemblyscript.org/concepts.html


Perry: a broad native application compiler
------------------------------------------

Perry is the easiest project to mistake for Oseo from a feature list. It parses
TypeScript with SWC, lowers through its own HIR, emits native code through LLVM,
uses NaN-boxed values, and links a garbage-collected runtime. Its documentation
shows native UI, operating-system threads, a large Node.js-compatible standard
library, Web APIs, and native extension support. This is real compiler and
runtime work, not a Node.js single-file wrapper. Perry's
[compiler introduction] and [memory model] describe that pipeline directly.

The product center is different. Perry asks how much useful TypeScript,
JavaScript, npm, Node.js, and platform UI code can become a deployable native
application now. It supports a practical subset, infers types for native code,
and offers an optional JavaScript evaluator for packages that are not compiled
natively. Its [runtime opt-in policy] treats that evaluator as privileged and
requires an explicit build choice, which is a thoughtful boundary, but it is
still a compatibility route that Oseo's present design excludes.

Oseo asks a narrower engine question before it asks the product question:
what generic ECMAScript semantics does an accepted construct have for every
value, and can a removable guarded path accelerate it? The difference appears
in several policies:

 -  Perry documents broad feature and package success. Oseo refuses a language
    feature until its generic semantics, negative cases, collector behavior,
    specialization invariance, and standards evidence land together.
 -  Perry lowers an application to optimized LLVM code. Oseo requires
    inspectable generic and specialized paths in its own MIR before a backend
    sees them. C11 is currently the reference backend, but
    [*PLAN-BACKEND.md*](./PLAN-BACKEND.md) keeps that choice replaceable.
 -  Perry erases TypeScript types and can optionally invoke a TypeScript
    checker. Oseo neither type-checks nor makes type correctness a build
    contract. It attaches provenance to hints and tests deliberately false
    hints against generic execution.
 -  Perry has already invested in native UI, native libraries, Node.js APIs,
    and package adoption. Oseo has deliberately deferred most of that surface
    until its ECMAScript and native I/O foundations can support measured
    compatibility.

Perry's public documentation changes quickly and currently disagrees about
some implementation details. For example, its runtime opt-in page describes a
QuickJS-based evaluator, while its [CLI flag reference] calls the optional
runtime V8. The stable fact for this comparison is the explicit optional
evaluator boundary, not which engine implements it in a particular release.
The same caution applies to advertised compatibility percentages. Oseo's
current capability is much smaller, but its checked-in manifest has a fixed
denominator, exact upstream revision, and classifications that do not turn
unsupported cases into passes.

[compiler introduction]: https://docs.perryts.com/
[memory model]: https://docs.perryts.com/internals/memory-model.html
[runtime opt-in policy]: https://docs.perryts.com/cli/allow-js-runtime.html
[CLI flag reference]: https://docs.perryts.com/cli/flags.html


scriptc: typed native code with an explicit VM boundary
-------------------------------------------------------

scriptc is a direct product comparison because its default artifact looks much
like the artifact Oseo eventually wants to ship: a small native executable,
compiled ahead of time, without Node.js, V8, or a JavaScript engine. At
scriptc commit [`ee1f869`], TypeScript 7 parses and checks the program, the
compiler converts the checker output into a typed IR, and the default backend
lowers that IR through LLVM. A C emitter remains as a reference and fallback
backend. The executable links only the feature-selected parts of scriptc's C
runtime.

That last detail gives “zero-runtime TypeScript” a precise meaning. A static
scriptc artifact has no general JavaScript engine, but it does have a native
runtime for strings, collections, memory management, asynchronous work,
networking, and other selected features. This is close to Oseo's deployment
goal and unlike a QuickJS bytecode executable. It is not the same compilation
contract.

The largest difference is what types are allowed to prove. scriptc's typed IR
records a concrete type on every expression. It has monomorphic arrays, exact
records, tagged unions, and distinct representations for values that cross its
dynamic boundary. The compiler can monomorphize generic code and select native
operations for supported generic functions because the TypeScript checker
result is part of the admitted program. Its [documented limitations] make the
consequences explicit: structures are exact, arrays are dense, several
JavaScript coercions and reflection cases are rejected or differ, and a false
assertion can fail a runtime validation.

Oseo reads the same annotation as fallible provenance. A `number` annotation
may justify adding a guarded numeric path, but it cannot remove the generic
JavaScript path or make a false assertion throw merely because the assertion
was false. scriptc preserves familiar TypeScript syntax and tooling while
defining a compiler-owned type and runtime model. Oseo is instead trying to
preserve the behavior of its declared ECMAScript profile when annotations are
erased, added, or falsified.

scriptc handles code outside its static type model through an explicit second
choice. The `--dynamic` flag links QuickJS-ng for npm packages that ship
JavaScript and for values typed as `any`. Values are copied and validated when
they cross the boundary, and the island has its own heap and microtask queue.
This makes the compatibility cost visible and opt-in. It also means scriptc
does not require a compiled generic ECMAScript path beside every typed native
function. Oseo's closed profile excludes this VM tier. Its generic fallback
must be native code in the same artifact, while any future runtime source
compiler must also produce native code as an explicit capability.

scriptc's LLVM-to-C fallback should not be confused with that dynamic island.
Both backends consume the same typed IR and produce native code. When the
default LLVM backend does not yet cover an IR feature, the compiler retries
only emission through C; it does not repeat the frontend or switch the program
to interpreted JavaScript. Pinning the LLVM backend turns the same limitation
into a diagnostic. The execution-model boundary is between the static compiler
and opt-in QuickJS-ng, not between the LLVM and C emitters.

The runtimes reflect the two semantic models. scriptc uses typed layouts,
reference counting with a synchronous cycle collector, stackful fibers, and a
native server stack. Oseo uses a tagged generic value ABI, tracing collection,
and explicit continuation frames so that generic JavaScript values can survive
calls, suspension, and guard failure without changing representation. scriptc
already exposes a substantially broader server and package surface. Oseo is
spending more of its current effort on the generic semantic substrate that
scriptc's type contract lets it narrow.

Their compatibility evidence also answers different questions. scriptc's
[architecture guide] says correctness means matching Node.js on differential
tests, not claiming that a feature has been implemented directly from the
specification. The [scriptc overview] reports more than 800 differential
tests, along with sanitizer and reference-counting audits. Oseo compares with
Node.js and Deno too, but M5 additionally pins an ECMA-262 edition and test262
revision and records every reviewed pass, negative, and unsupported case in a
manifest. scriptc is measuring whether its supported programs behave like
Node.js. Oseo is building a versioned standards claim before broadening its
host APIs.

Finally, scriptc demonstrates why Oseo's lack of a `tsc` dependency is a
choice rather than a technical impossibility. The compiler pins TypeScript
7.0.2 and its [TypeScript frontend adapter] imports
`typescript/unstable/sync`. That gives scriptc authoritative checker types at
the cost of tracking an explicitly unstable API. Oseo avoids that dependency
because checker authority would conflict with its false-hint invariant, and
because syntax-level hints are enough for the guarded optimizations it permits.

This comparison uses scriptc 0.0.14 at the fixed revision above. It compares
contracts rather than benchmark results: scriptc is already much broader as a
native TypeScript product, while Oseo currently implements a smaller
ECMAScript profile with a stricter generic-fallback requirement.

[`ee1f869`]: https://github.com/vercel-labs/scriptc/tree/ee1f8697b800d00f0cc674f806b4960aa5f9e291
[documented limitations]: https://github.com/vercel-labs/scriptc/blob/ee1f8697b800d00f0cc674f806b4960aa5f9e291/docs/src/app/limitations/page.mdx
[architecture guide]: https://github.com/vercel-labs/scriptc/blob/ee1f8697b800d00f0cc674f806b4960aa5f9e291/docs/src/app/how-it-works/page.mdx
[scriptc overview]: https://github.com/vercel-labs/scriptc/blob/ee1f8697b800d00f0cc674f806b4960aa5f9e291/README.md
[TypeScript frontend adapter]: https://github.com/vercel-labs/scriptc/blob/ee1f8697b800d00f0cc674f806b4960aa5f9e291/packages/compiler/src/frontend/ts7/program.ts#L1-L27


Porffor: the nearest compiler research comparison
-------------------------------------------------

Porffor shares more of Oseo's starting point than any other project considered
here. It is written in JavaScript, uses an external parser behind a
from-scratch compiler, has no interpreter or JIT in the ordinary path, accepts
JavaScript and TypeScript syntax, runs test262, and can produce both WebAssembly
and native binaries. Its [project site] and [current README] describe it as an
experimental JavaScript/TypeScript-to-WebAssembly/C engine, compiler, and
runtime. It even offers `--opt-types`, which uses unchecked type annotations as
compiler hints.

Those similarities make the remaining differences more revealing.

Porffor's primary artifact is WebAssembly. Its experimental native path lowers
its own generated low-level instruction arrays through the 2c IR-to-C compiler
and then a system compiler. Oseo's MIR is backend-neutral, but its current
primary artifact path is native C11 and a statically linked runtime. C is meant
to remain an inspectable reference even if a later LLVM, code-generation
library, or direct emitter becomes primary. Oseo target identities, runtime
ABI, collector metadata, and JavaScript semantics are not defined by
WebAssembly or C.

More important, Porffor does not publish Oseo's hint-safety invariant. Its
README says type annotations can be optimization hints without type checking,
but the current implementation also treats assignment to an annotated local as
a TypeScript assertion and may lower the value according to that annotation.
This is observable today.

At Porffor commit
[`8ef8aaa`], the following deliberately ill-typed program was run in three
configurations:

~~~~ typescript
function f(x: number) {
    return x + 1;
}

console.log(f("2"));
~~~~

| Execution                         | Output |
| --------------------------------- | -----: |
| Porffor's default TypeScript path |     17 |
| Porffor with `--no-opt-types`     |     21 |
| Node.js after TypeScript erasure  |     21 |

The exact `17` is an implementation artifact, not a meaningful alternate
language rule. The useful result is that the annotation changed observable
behavior. Porffor is explicit that it implements a limited sub- and superset of
JavaScript and is not based on a particular specification version, so this
experiment does not show Porffor breaking its stated contract. It shows that
its contract is not Oseo's contract. The relevant Porffor source makes
[`optTypes` a default preference], turns [writes to annotated locals] into
type-assertion nodes, and [lowers those assertions] according to the annotated
representation.

Under Oseo's design, this is the canonical false-hint test. Provided that the
source forms are in the active profile, both specialization-enabled and
specialization-disabled builds must print `21`. A `number` hint may put guards
and numeric code in the binary. It cannot authorize the numeric code to consume
the string.

Porffor also optimizes for very small artifacts, advertising no constant
prelude and as few WebAssembly imports as possible. Oseo expects an owned
runtime with generic semantic helpers, a collector, scheduler, and host
components. It plans capability-aware composition so closed programs do not
retain unused compiler or loader machinery, but it does not make “no runtime”
the semantic goal. The runtime is where much of JavaScript's generic meaning
lives.

Finally, Porffor describes current language support pragmatically and warns
that it is seriously limited. Oseo is building toward a named ECMA-262 edition
with one reviewed manifest row per upstream test path. The difference is not
that Oseo is presently more compatible. It is not. The difference is that a
versioned standards claim, including negative and unsupported results, is part
of Oseo's architecture rather than a later scorecard.

[project site]: https://porffor.dev/
[current README]: https://github.com/CanadaHonk/porffor/blob/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a/README.md
[`8ef8aaa`]: https://github.com/CanadaHonk/porffor/tree/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a
[`optTypes` a default preference]: https://github.com/CanadaHonk/porffor/blob/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a/compiler/prefs.js#L1-L7
[writes to annotated locals]: https://github.com/CanadaHonk/porffor/blob/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a/compiler/codegen.js#L2360-L2364
[lowers those assertions]: https://github.com/CanadaHonk/porffor/blob/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a/compiler/codegen.js#L632-L645


Static Hermes: sound typed JavaScript beside untyped JavaScript
---------------------------------------------------------------

Static Hermes is an important neighboring design because it takes types more
seriously than either ordinary TypeScript or Oseo. Its
[typed-language guide] describes a sound subset with exact object types,
homogeneous arrays without holes, compile-time type errors, and runtime checked
casts from `any`. If a declaration has an annotation, the annotation wins.
Those rules let the compiler use layouts and operations that ordinary
JavaScript cannot promise.

The price is a language boundary. Typed arrays are explicitly incompatible with
untyped JavaScript arrays, and typed code has stricter behavior than ordinary
JavaScript. Current work on the `static_h` branch also includes untyped
JavaScript execution with interpreter and JIT configurations, as the project's
[December 2024 update] and [June 2025 performance update] describe.

Oseo avoids both halves of that split. It does not turn annotated code into a
sound JavaScript dialect, and it does not reserve a VM tier for untyped code.
Typed and untyped inputs enter the same JavaScript value model. An annotation
can change code shape only behind a guard. This sacrifices many optimizations
that a sound type system can justify, but it preserves ordinary TypeScript's
erasable-type expectation.

[typed-language guide]: https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md
[December 2024 update]: https://github.com/facebook/hermes/blob/static_h/doc/blog/2024-12-19-static-hermes-update-dec-2024.md
[June 2025 performance update]: https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md


QuickJS: why an executable can still be interpreted
---------------------------------------------------

QuickJS provides the cleanest counterexample to “executable means native
JavaScript.” Its `qjsc` tool compiles JavaScript to compact stack bytecode,
serializes that bytecode into generated C, and can add a `main()` function plus
the QuickJS engine. The system C compiler then produces an ordinary executable.
The [QuickJS internals documentation] is explicit that the C source contains
bytecode and initializes the engine to evaluate it.

This is a useful and coherent design. It offers small deployment, fast
compilation, broad JavaScript behavior, and optional removal of the source
compiler when `eval` is not needed. It simply solves a different problem.
Generic execution is bytecode interpretation. In Oseo, generic execution is
native code generated from MIR, and generated C contains the function's control
flow rather than a serialized instruction stream for a JavaScript VM.

[QuickJS internals documentation]: https://bellard.org/quickjs/quickjs.html


What is fundamental in Oseo
---------------------------

The comparisons leave four properties that are individually uncommon and,
together, define Oseo.

### The fallback is compiled semantics, not another execution tier

A guard miss is an ordinary control-flow edge inside the native program. It
does not reconstruct an interpreter frame, call a bytecode evaluator, or ask a
runtime compiler for a less specialized function. Generic MIR is the semantic
authority, and specialized MIR must rejoin it without replaying visible work.
This is the part of the design inherited more from SBCL and Chez Scheme than
from JavaScript VMs.

### Types choose opportunities, not meanings

AssemblyScript and Static Hermes gain power by making types part of the
language contract. Porffor's current type optimization can affect behavior.
scriptc lets checker results determine IR representations and validates
dynamic crossings. Perry uses inference to shape native code but does not make
specialization-disabled equivalence the center of its public model. Oseo's
stronger and more restrictive rule is:

> If adding, removing, or falsifying a type hint changes observable behavior,
> the compiler is wrong.

That statement reaches beyond a type-erasure promise. Oseo actually uses the
annotation, then proves through guards and differential tests that using it was
semantically harmless.

### Whole-program AOT is also a deployment policy

Oseo links a closed module graph before execution. `eval`, the `Function`
constructor family, and unrestricted dynamic import are currently rejected
rather than interpreted approximately. [*PLAN-DYN.md*](./PLAN-DYN.md) divides
future work into closed source, a finite precompiled dynamic module set, late
native artifacts, and optional runtime source compilation. A closed binary
must be able to prove that it contains no parser, compiler, incremental loader,
or dormant source-evaluation path.

This is stricter than merely having an AOT backend. It treats compiler presence,
code lifetime, executable-memory policy, module identity, and retained runtime
components as declared capabilities of an artifact. A future compiler-enabled
profile may compile dynamic source to native code, but it must not make every
Oseo executable pay that cost.

### Compatibility evidence is part of the implementation

Oseo separates ECMAScript, web APIs, Node.js APIs, package resolution, and
native dependencies. It does not turn a successful demo into a claim about the
whole layer. M5 pins an ECMA-262 edition and test262 revision. M6 plans the same
discipline for the Minimum common web API and web-platform tests. M7 intends to
report package versions and exact scenarios instead of a context-free
compatibility percentage.

The property-testing plan applies the same suspicion to Oseo's own optimizer.
Generated programs run under Node.js, Deno, specialization-disabled Oseo,
specialization-enabled Oseo, and forced collection. Failures retain seeds,
structured inputs, source, target, and native artifacts. This testing model is
not unique by itself. What matters is that false hints, guard misses, generic
fallbacks, collectors, targets, and standards classifications are tested as one
contract.


What Oseo gives up
------------------

The architecture does not make AOT JavaScript automatically faster than a JIT.
Oseo cannot see production hotness or specialize from observed values. A
generic path beside several specialized paths can increase code size. Guards
cost branches and sometimes loads. A mature V8 tier can use information that no
static compiler has, then recover by deoptimizing when it was wrong.

Oseo is also choosing the longest compatibility route. AssemblyScript can omit
dynamic behavior by defining another language. Perry can prioritize the
packages and APIs that unlock applications. scriptc can use a typed static
profile and route explicitly dynamic dependencies through an optional engine.
QuickJS can rely on one compact bytecode engine. Oseo intends to implement
generic ECMAScript behavior, native object and collector semantics, a
web-compatible server host, selected Node.js APIs, and self-hosting while
keeping the no-interpreter guarantee. Dynamic source, proxies, regular
expressions, WebAssembly, TLS, streams, and package resolution each expose a
large independent design problem.

The present status should be read with that cost in mind. Oseo has completed
its M4 closed module, promise, asynchronous continuation, timer, and scheduler
work. M5 is active. The current
[*PLAN-M5.md*](./PLAN-M5.md) reports 310 passes, 245 expected negatives, and
126 unsupported profile features in its reviewed test262 subset, with no
semantic or harness failures. Linux on AMD64 and macOS on AArch64 execute the
native corpus; AArch64 Linux is a compile-link and inspection target.

The Minimum common web API, real native I/O, selected Node.js compatibility,
broad package support, and self-hosting are plans, not current features. Oseo
should therefore be compared with Node.js, Perry, or scriptc on architectural
commitments, not present-day capability or benchmark totals.

If Oseo succeeds, its contribution will not be that JavaScript can be put in a
native file. Several projects already do that in several senses. It will be a
specific reconciliation of three facts that are usually handled separately:
JavaScript values remain dynamic, TypeScript annotations remain untrustworthy,
and every execution path can still be compiled before the program begins.
