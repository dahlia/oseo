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

This comparison reflects Oseo at commit `4cbe20c9` and, unless noted otherwise,
public sources checked on 19 November 2026. Version-sensitive observations
below identify the source or revision used.

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
all occupy the same layer. The implementation column names the language
used to write the compiler or engine, not the language it accepts or the
code it emits. For Node.js it refers to V8; for Bun it refers to the AOT
compiler in the canary discussed below.

| Project                | Input language                                                          | Compiler implementation             | Execution model                                                                  | Role of types                                                               | Primary boundary or goal                                               |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node.js                | JavaScript, with TypeScript normally erased before execution            | [C++][V8 source]                    | V8 interpreter and several JIT tiers                                             | No role in V8 after ordinary TypeScript erasure                             | A general server runtime and the Node.js API ecosystem                 |
| Bun (experimental AOT) | JavaScript and TypeScript                                               | [Rust][Bun AOT source]              | Native code in a JIT-free JavaScriptCore runtime; interpreter for dynamic source | TypeScript checking at build time; annotations guide guarded specialization | Bun executables with build-time compilation of reachable code          |
| AssemblyScript         | A strictly typed TypeScript-like language                               | [TypeScript][AssemblyScript source] | Ahead-of-time compilation to WebAssembly                                         | Types define what programs mean and which programs are valid                | Small, efficient WebAssembly modules                                   |
| Perry                  | A practical TypeScript and JavaScript subset                            | [Rust][Perry source]                | LLVM native code; a limited evaluator for runtime source                         | Types are erased; compiler inference guides native code generation          | Native applications and broad practical API compatibility              |
| scriptc                | TypeScript and JavaScript checked against a compiler-owned type surface | [TypeScript][scriptc source]        | LLVM native or WASI output; in-process Node.js for selected modules              | Checker results choose representations; dynamic operations are checked      | Small native programs with practical Node.js and package compatibility |
| Porffor                | An experimental JavaScript/TypeScript sub- and superset                 | [JavaScript][Porffor source]        | Ahead-of-time native code through C                                              | Annotations can guide optimization without a type check                     | Small artifacts and compiler self-hosting                              |
| Static Hermes          | A sound typed JavaScript dialect beside untyped JavaScript              | [C++][Hermes source]                | Native compilation for both modes; Hermes also runs bytecode                     | Typed mode enforces annotations with static checks and runtime casts        | JavaScript compilation and the React Native engine                     |
| QuickJS                | JavaScript                                                              | [C][QuickJS source]                 | Stack bytecode interpreted by QuickJS                                            | No TypeScript optimization contract                                         | A small embeddable JavaScript engine                                   |
| Oseo                   | An explicit JavaScript profile plus erasable TypeScript syntax          | [TypeScript][Oseo source]           | Generic native code plus guarded specialized native code                         | Annotations are fallible hints and must not affect behavior                 | A standards-measured, whole-program native server runtime              |

Oseo shares its implementation language with AssemblyScript and scriptc.
The Oseo compiler currently runs on Node.js or Deno, emits C11, and links
in Oseo's C runtime. The resulting executable does not need Node.js or
Deno to run. Compiling Oseo with itself is still a roadmap milestone.

This table describes architectural intent, not maturity. Node.js is a mature
runtime. AssemblyScript is an established language and toolchain. Perry is
shipping a fast-moving product, as is scriptc. Porffor, Static Hermes, and Oseo
are still research or active implementation efforts in relevant respects.
Oseo cannot yet run the broad programs that its M6 and M7 plans target.

[V8 source]: https://github.com/nodejs/node/tree/v26.13.1/deps/v8/src/compiler
[Bun AOT source]: https://github.com/oven-sh/bun/tree/8206e7e27918ba10b8819ea3c13ecea32606abb6/src/aot
[AssemblyScript source]: https://github.com/AssemblyScript/assemblyscript/tree/v0.28.20/src
[Perry source]: https://github.com/PerryTS/perry/tree/08b384fa365bf1a656498f629f97d6a9e688cffd/crates/perry-codegen/src
[scriptc source]: https://github.com/vercel-labs/scriptc/tree/04d854f64341fea7c5a23f40478b7cfd2ee52908/packages/compiler/src
[Porffor source]: https://github.com/CanadaHonk/porffor/tree/c9af40c8c6913e04d491412ae9fe0f34b97b51df/compiler
[Hermes source]: https://github.com/meta/hermes/tree/e5d8795020c304dfad439a09f5a7ad14e061457d/lib/CompilerDriver
[QuickJS source]: https://github.com/bellard/quickjs/blob/e585640ffa2cf88ce7c2d587583c6fe15928ec2f/qjsc.c
[Oseo source]: ./packages/compiler/src/


Node.js: the runtime Oseo declines to carry
-------------------------------------------

Node.js is the practical baseline for server-side JavaScript, but it is not an
ahead-of-time JavaScript compiler. Its language engine is V8. In V8, JavaScript
first becomes Ignition bytecode and begins execution without assumptions about
future values. The engine gathers type and object-shape feedback while the
program runs. Sparkplug is the baseline JIT; Maglev and TurboFan are
optimizing tiers.

Maglev can emit a checked fixed-offset property load after observing a stable
shape, but it also emits frame-state metadata so a failed assumption can
reconstruct less optimized execution. V8's own [Maglev description] calls out
both the runtime feedback and the deoptimization metadata.

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

V8's design has an advantage: it can learn what a particular deployment
actually does. Oseo deliberately gives that up. It has no runtime hotness data,
cannot specialize again when a workload changes, and cannot use an interpreter
as a compact home for cold code. In return, its executable does not need the
profiling, tiering, on-stack replacement, and deoptimization machinery that
makes adaptive optimization possible.

Node.js single-executable applications do not change this distinction.
In Node.js 26.13.1, [`node --build-sea`][Node.js SEA documentation] embeds a
CommonJS or ES module entry point in the `node` executable. Code cache and
startup snapshots can reduce startup work, but the result still runs on V8.
“One file” describes distribution, not whole-program native compilation.

[`deno compile`][Deno compile documentation] similarly packages the program
with a stripped Deno runtime. It uses V8 by default and offers an experimental
QuickJS option. Replacing the JIT-capable engine with an interpreter still
does not compile the application to native code.

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
[Node.js SEA documentation]: https://nodejs.org/download/release/v26.13.1/docs/api/single-executable-applications.html
[Deno compile documentation]: https://docs.deno.com/runtime/reference/cli/compile/#choosing-a-javascript-engine
[TypeScript documentation]: https://nodejs.org/download/release/v26.13.1/docs/api/typescript.html
[Minimum common web API]: https://min-common-api.proposal.wintertc.org/


Bun: native AOT with a JavaScriptCore interpreter
-------------------------------------------------

The experimental `bun compile` command (`bun build --compile --aot`) compiles
JavaScript and TypeScript to machine code, including reachable functions from
npm dependencies. Without `--aot`, `bun build --compile` packages the program
with the ordinary Bun runtime, where JavaScriptCore can still JIT-compile
code as it runs. The AOT executable keeps JavaScriptCore's value model,
garbage collector, and interpreter but leaves out its JIT tiers.

Bun and Oseo both handle guard failures in compiled code without
reconstructing an interpreter frame. Bun's [AOT design] describes local
generic branches and cases where a loop iteration restarts in another
compiled version. Oseo's fallback must not replay visible work. Bun keeps
an interpreter for supported runtime source strings and for code loaded from
disk with `--aot-allow-code-from-disk`. Oseo does not retain an interpreter
for either case.

Bun checks TypeScript at build time and can reject type errors. In code
that compiles, a TypeScript annotation can guide speculation but does not
by itself prove that a run-time check can be omitted. Oseo shares that
distinction between a hint and a proof, but it does not use a TypeScript
checker to decide which programs to accept. Bun also restricts some
mutations in AOT mode: replacing `Array.prototype.push()`, for example,
is disallowed. The ability to compile a program ahead of time does not
imply that it behaves the same as under `bun run`.

The [Bun AOT documentation] describes the canary at `8206e7e`. Stable Bun
1.4.4 does not include this AOT compiler.

[AOT design]: https://bun.com/bun-aot-how
[Bun AOT documentation]: https://github.com/oven-sh/bun/blob/8206e7e27918ba10b8819ea3c13ecea32606abb6/docs/compiler/aot.mdx


AssemblyScript: familiar syntax, a different language
-----------------------------------------------------

AssemblyScript is sometimes described as TypeScript compiled to WebAssembly.
Its own documentation is more precise: it is a TypeScript-like variant, partly
a subset and partly a superset, and existing TypeScript is unlikely to compile
without porting. The language is intentionally strict. It has WebAssembly
integer types, no `any`, no general `undefined`, restricted objects, and no
prototype patching. Several dynamic JavaScript features are omitted because
supporting them would pull the implementation toward an interpreter. The
[AssemblyScript concepts guide] makes that trade explicit. The release
checked here is [AssemblyScript 0.28.20].

This is not a temporary gap on the way to becoming Oseo. It is a different
answer to AOT compilation. AssemblyScript obtains predictable WebAssembly by
narrowing the language and asking types to prove what machine operations are
valid. An `i32` annotation is a semantic commitment. TypeScript-style
[assertions in AssemblyScript] are explicit conversions. Code that violates
the type rules is not another dynamic case for a generic JavaScript operator.

Oseo preserves the opposite rule. A parameter annotated as `number` may receive
a string through `any`, an assertion, plain JavaScript, or an untyped package.
The annotation may justify generating a numeric fast path, but only a runtime
guard may enter it. If the value is a string, the already compiled generic `+`
path must perform JavaScript concatenation. Adding, removing, or lying in a
type annotation must not change the result.

The deployment boundary differs as much as the type system. AssemblyScript
produces a WebAssembly module whose access to the outside world comes through
explicit imports. A JavaScript or standalone WebAssembly host controls which
external capabilities it supplies through those imports.

Oseo currently emits native executables and owns a private runtime ABI,
collector, module linker, promise jobs, and scheduler. Its future web and
Node.js layers are intended to make the executable itself a server runtime.
Oseo plans to compile statically imported *.wasm* dependencies into the same
native executable and later provide the dynamic JavaScript and web APIs.
Neither capability makes WebAssembly the output target for Oseo's JavaScript
compiler.

AssemblyScript is a good choice when a developer can write or port a
computation into a statically typed WebAssembly-oriented language. Oseo is
taking on the more expensive problem of accepting dynamic JavaScript behavior
without retaining a JavaScript VM tier.

[AssemblyScript concepts guide]: https://www.assemblyscript.org/concepts.html
[AssemblyScript 0.28.20]: https://github.com/AssemblyScript/assemblyscript/releases/tag/v0.28.20
[assertions in AssemblyScript]: https://www.assemblyscript.org/types.html#casting


Perry: a broad native application compiler
------------------------------------------

Perry is the easiest project to mistake for Oseo from a feature list. It parses
TypeScript with SWC, lowers through its own HIR, emits native code through LLVM,
uses NaN-boxed values, and links a garbage-collected runtime. Its documentation
shows native UI, operating-system threads, a large Node.js-compatible standard
library, Web APIs, and native extension support. This is real compiler and
runtime work, not a Node.js single-file wrapper. Perry's
[compiler introduction] and [memory model] describe that pipeline directly.

Perry focuses on compiling applications that use TypeScript, npm packages,
Node.js APIs, and platform UI libraries. In [Perry 0.5.1665], the
[compile gate] rejects modules that would require a separate JavaScript
engine. The [old V8 integration] has been removed, despite older flag
documentation still describing it. Perry does retain a [limited evaluator]
that walks SWC syntax trees for supported runtime source, including some
`new Function()` patterns used by libraries. That is not a general npm
fallback or an Oseo-style compiled guard miss.

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

[compiler introduction]: https://docs.perryts.com/
[memory model]: https://github.com/PerryTS/perry/blob/08b384fa365bf1a656498f629f97d6a9e688cffd/docs/src/internals/memory-model.md
[Perry 0.5.1665]: https://github.com/PerryTS/perry/releases/tag/v0.5.1665
[compile gate]: https://github.com/PerryTS/perry/blob/08b384fa365bf1a656498f629f97d6a9e688cffd/crates/perry/src/commands/compile/bootstrap.rs#L360-L369
[old V8 integration]: https://github.com/PerryTS/perry/blob/08b384fa365bf1a656498f629f97d6a9e688cffd/crates/perry-runtime/src/closure/v8_stubs.rs#L1-L15
[limited evaluator]: https://github.com/PerryTS/perry/blob/08b384fa365bf1a656498f629f97d6a9e688cffd/crates/perry-runtime/src/dyn_eval/mod.rs#L1-L23


scriptc: typed native code with an explicit VM boundary
-------------------------------------------------------

An island-free [scriptc 0.4.14] executable resembles Oseo's output: native
code compiled ahead of time, without a general JavaScript engine. The
compiler uses a TypeScript checker to build a typed IR and LLVM 22 to emit
native or WASI output. The old C code generator is gone, but the compiler still
links in C runtime support.

That last detail gives “zero-runtime TypeScript” a precise meaning. A static
scriptc artifact has no general JavaScript engine, but it does have a native
runtime for strings, collections, memory management, asynchronous work,
networking, and other selected features. This is close to Oseo's deployment
goal and unlike a QuickJS bytecode executable. It is not the same compilation
contract.

The largest difference is what types are allowed to prove. scriptc uses
checker results to choose representations and lower supported generic code.
Values typed as `any` or `unknown` can compile natively in its
[checked-dynamic model]. An operation that crosses into a typed
representation can fail validation rather than take a generic JavaScript
path.

Oseo reads the same annotation as fallible provenance. A `number` annotation
may justify adding a guarded numeric path, but it cannot remove the generic
JavaScript path or make a false assertion throw merely because the assertion
was false. scriptc preserves familiar TypeScript syntax and tooling while
defining a compiler-owned type and runtime model. Oseo is instead trying to
preserve the behavior of its declared ECMAScript profile when annotations are
erased, added, or falsified.

Modules that scriptc cannot compile natively are a separate case. Under the
[default Node island policy], unsupported npm dependencies can run in an
in-process Node.js runtime. Application modules must be marked explicitly;
`--node-islands=off` disables that fallback altogether. An executable with
an island is not engine-free.

Oseo's closed profile excludes this VM tier. Its generic fallback must be
native code in the same artifact, while any future runtime source compiler must
also produce native code as an explicit capability.

The runtimes reflect the two semantic models. scriptc uses typed layouts,
reference counting with a cycle collector, and both stackless coroutines and
stackful fibers. Oseo uses a tagged generic value ABI, tracing collection,
and explicit continuation frames so that generic JavaScript values can survive
calls, suspension, and guard failure without changing representation. scriptc
already exposes a substantially broader server and package surface. Oseo is
spending more of its current effort on the generic semantic substrate that
scriptc's type contract lets it narrow.

Their compatibility evidence also answers different questions. scriptc's
[architecture guide] describes differential tests against Node.js alongside
sanitizer checks. Oseo also compares behavior with Node.js and Deno, but
its language profile additionally pins an ECMA-262 edition and a test262
revision and records each reviewed pass, expected negative, and unsupported
case.

[scriptc 0.4.14]: https://github.com/vercel-labs/scriptc/releases/tag/v0.4.14
[checked-dynamic model]: https://github.com/vercel-labs/scriptc/blob/04d854f64341fea7c5a23f40478b7cfd2ee52908/docs/content/limitations/untyped-values.mdx
[default Node island policy]: https://github.com/vercel-labs/scriptc/blob/04d854f64341fea7c5a23f40478b7cfd2ee52908/packages/compiler/src/node-islands/policy.ts
[architecture guide]: https://github.com/vercel-labs/scriptc/blob/04d854f64341fea7c5a23f40478b7cfd2ee52908/docs/content/docs/how-it-works.mdx


Porffor: the nearest compiler research comparison
-------------------------------------------------

Porffor shares Oseo's starting point as a compiler built apart from an
existing JavaScript VM. In [Porffor alpha 25], the compiler uses its own parser
and lowers JavaScript through an IR to C, with no interpreter or JIT. The
release ships native Linux and macOS binaries. Its [CI workflow] builds the
self-hosted compiler through C and checks it with a test262 harness. Oseo also
emits C today, but self-hosting is still a roadmap milestone.

Porffor does not publish Oseo's hint-safety invariant. In alpha 25, the
compiler still [enables `optTypes` by default], turns
[writes to annotated locals] into assertion nodes, and
[lowers those assertions] according to the annotated representation.

The following deliberately ill-typed program was run at the older Porffor
commit [`8ef8aaa`]. These results were not measured on alpha 25.

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
language rule. The annotation changed observable behavior. Porffor is explicit
that it implements a limited sub- and superset of JavaScript and is not based
on a particular specification version, so this experiment does not show Porffor
breaking its stated contract. It shows that its contract is not Oseo's
contract.

Under Oseo's design, this is the canonical false-hint test. Provided that the
source forms are in the active profile, both specialization-enabled and
specialization-disabled builds must print `21`. A `number` hint may put guards
and numeric code in the binary. It cannot authorize the numeric code to consume
the string.

Porffor also optimizes for small artifacts. Oseo uses its own
runtime with generic semantic helpers, a collector, scheduler, and host
components. It plans capability-aware composition so closed programs do not
retain unused compiler or loader machinery, but it does not make “no runtime”
the semantic goal. The runtime is where much of JavaScript's generic meaning
lives.

Porffor describes its language support as limited. Oseo publishes a measured
profile for a named ECMA-262 edition and records expected negatives and
unsupported paths alongside passes. These records do not rank the
compilers' compatibility against each other.

[Porffor alpha 25]: https://github.com/CanadaHonk/porffor/releases/tag/alpha-25
[CI workflow]: https://github.com/CanadaHonk/porffor/blob/c9af40c8c6913e04d491412ae9fe0f34b97b51df/.github/workflows/ci.yaml
[enables `optTypes` by default]: https://github.com/CanadaHonk/porffor/blob/c9af40c8c6913e04d491412ae9fe0f34b97b51df/compiler/prefs.js#L1
[writes to annotated locals]: https://github.com/CanadaHonk/porffor/blob/c9af40c8c6913e04d491412ae9fe0f34b97b51df/compiler/codegen.js#L2919-L2924
[lowers those assertions]: https://github.com/CanadaHonk/porffor/blob/c9af40c8c6913e04d491412ae9fe0f34b97b51df/compiler/codegen.js#L709-L724
[`8ef8aaa`]: https://github.com/CanadaHonk/porffor/tree/8ef8aaaad9199de14a35bd1aa214f4d3e23bf97a


Static Hermes: sound typed JavaScript beside untyped JavaScript
---------------------------------------------------------------

Static Hermes treats types more strictly than ordinary TypeScript or Oseo. Its
[typed-language guide] describes a sound subset with exact object types,
homogeneous arrays without holes, compile-time type errors, and runtime checked
casts from `any`. If a declaration has an annotation, the annotation wins.
Those rules let the compiler use layouts and operations that ordinary
JavaScript cannot promise.

The price is a language boundary. Arrays in the typed dialect are
incompatible with ordinary JavaScript arrays. The dialect is one part of
Hermes development on the [main development branch], `static_h`. At
`e5d8795`,
`shermes` compiles both typed and untyped JavaScript to native code, as
described in the [Hermes README].
That does not mean React Native ships typed native code: its production path
still compiles JavaScript to bytecode ahead of time and interprets that
bytecode. Hermes also has a baseline JIT.

Oseo does not turn annotated code into a sound JavaScript dialect or
reserve a VM tier for untyped code.
Typed and untyped inputs enter the same JavaScript value model. An annotation
can change code shape only behind a guard. This sacrifices many optimizations
that a sound type system can justify, but it preserves ordinary TypeScript's
erasable-type expectation.

[typed-language guide]: https://github.com/meta/hermes/blob/e5d8795020c304dfad439a09f5a7ad14e061457d/doc/TypedLanguage.md
[main development branch]: https://github.com/meta/hermes/blob/e5d8795020c304dfad439a09f5a7ad14e061457d/doc/Branches.md
[Hermes README]: https://github.com/meta/hermes/blob/e5d8795020c304dfad439a09f5a7ad14e061457d/README.md


QuickJS: why an executable can still be interpreted
---------------------------------------------------

Upstream [QuickJS 2026-06-04] provides a counterexample to “executable means
native JavaScript.” Its `qjsc` tool compiles JavaScript to stack bytecode,
serializes that bytecode into generated C, and can add a `main()` function plus
the QuickJS engine. The system C compiler then produces an ordinary executable.
The [QuickJS internals documentation] is explicit that the C source contains
bytecode and initializes the engine to evaluate it.

Disabling `eval` lets the system compiler remove source-evaluation code
through link-time optimization. The resulting executable still interprets
bytecode. Oseo instead generates native code from MIR: the generated C
contains the function's control flow rather than a serialized instruction
stream for a JavaScript VM.

[QuickJS 2026-06-04]: https://bellard.org/quickjs/
[QuickJS internals documentation]: https://bellard.org/quickjs/quickjs.html#Executable-generation


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
language contract. Porffor's unchecked type optimization has affected
behavior in the experiment above.
scriptc lets checker results determine IR representations and validates
dynamic crossings. Perry uses inference to shape native code but does not make
specialization-disabled equivalence the center of its public model. Oseo's
stronger and more restrictive rule is:

> If adding, removing, or falsifying a type hint changes observable behavior,
> the compiler is wrong.

That statement reaches beyond a type-erasure promise. Oseo uses the annotation,
then proves through guards and differential tests that using it was
semantically harmless.

### Whole-program AOT is also a deployment policy

Oseo links a closed module graph before execution. A dynamic `import()` is
accepted only when its argument is a string literal and the target resolves
at build time. Oseo does not evaluate arbitrary source strings through
`eval()` or the `Function` constructor family. [*PLAN-DYN.md*](./PLAN-DYN.md)
divides future work into closed source, a finite precompiled dynamic module
set, late native artifacts, and optional runtime source compilation. A closed
binary must be able to prove that it contains no parser, compiler, incremental
loader, or dormant source-evaluation path.

This is stricter than merely having an AOT backend. It treats compiler presence,
code lifetime, executable-memory policy, module identity, and retained runtime
components as declared capabilities of an artifact. A future compiler-enabled
profile may compile dynamic source to native code, but it must not make every
Oseo executable pay that cost.

### Compatibility evidence is part of the implementation

Oseo separates ECMAScript, web APIs, Node.js APIs, package resolution, and
native dependencies. It does not turn a successful demo into a claim about the
whole layer. The language profile pins an ECMA-262 edition and test262
revision. The M6 plan calls for pinning the Minimum common web API and
web-platform tests in the same way. The M7 plan calls for reporting package
versions and exact scenarios instead of a context-free compatibility
percentage.

The property-testing plan applies the same suspicion to Oseo's own optimizer.
Generated programs run under Node.js, Deno, specialization-disabled Oseo,
specialization-enabled Oseo, and forced collection. Failures retain seeds,
structured inputs, source, target, and native artifacts. This testing model is
not unique. What matters is that false hints, guard misses, generic
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
profile and route selected modules through an embedded Node.js engine.
QuickJS can rely on one compact bytecode engine. Oseo intends to implement
generic ECMAScript behavior, native object and collector semantics, a
web-compatible server host, selected Node.js APIs, and self-hosting while
keeping the no-interpreter guarantee. Runtime source compilation,
WebAssembly integration, and a broader native I/O layer are separate pieces
of that work.

The [current language profile](./docs/language-profile-es2026.md) covers
ECMAScript 2026 plus three finished ECMAScript 2027 features. The
[language exit report](./docs/m5c-closure/language-exit-report.md) records
43,007 reviewed test262 paths: 36,408 passes, 4,480 expected negatives, and
2,119 unsupported paths. Of the unsupported paths, 2,062 are authorized
exclusions and 57 are named deferrals. This is not an unqualified ECMA-262
conformance claim. The [M5 exit report](./docs/m5c-closure/m5-exit-report.md)
preserves the earlier 41,091-path measurement. Linux on AMD64 and macOS on
AArch64 execute the native corpus; AArch64 Linux is a compile-link and
inspection target.

The Minimum common web API, real native I/O, selected Node.js compatibility,
broad package support, and self-hosting are plans, not current features. Oseo
should therefore be compared with Node.js, Perry, or scriptc on architectural
commitments, not present-day capability or benchmark totals.

If Oseo succeeds, its contribution will not be that JavaScript can be put in a
native file. Several projects already do that in several senses. It will be a
specific reconciliation of three facts that are usually handled separately:
JavaScript values remain dynamic, TypeScript annotations remain untrustworthy,
and every execution path can still be compiled before the program begins.
