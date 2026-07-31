Oseo white paper
================

What Oseo is
------------

Oseo is a JavaScript and TypeScript engine that compiles every function
ahead of time into native code. Each function gets a generic path that
implements the full language semantics, and, wherever Oseo can generate a
cheap runtime guard for a value's kind, type, or shape, a specialized path
alongside it. A failed guard branches straight into the generic path, which
is already sitting there in the binary, compiled, not interpreted.

Mainstream JavaScript engines usually combine an interpreter with one or
more speculative JIT tiers, watching how a program actually runs and
compiling optimistically based on what they observe. That gets excellent
peak performance, but it also means carrying profiling machinery and a
deoptimization path for when the observations turn out wrong. Oseo follows
a different lineage, closer to Common Lisp implementations like SBCL and to
Chez Scheme: generic and specialized code are both generated ahead of time,
so there's no separate slow interpreter to fall into and nothing to
deoptimize, because there's nothing that wasn't already compiled. A
tagged-word value representation, in the SBCL tradition, makes common value
checks, small-integer tests especially, cheap and allocation-free; a simple
scalar guard can compile down to a comparison and a branch, though shape
checks on objects will usually need a load or two beyond that.


Why this, and why now
---------------------

Normally `tsc` erases annotations before a JavaScript engine ever sees the
code; by the time V8 gets your function, the types are long gone. Because
Oseo compiles from the original source, it can keep those annotations, and
JSDoc comments in plain JavaScript packages, around as optimization hints.
The annotations guide
which specialized path gets generated, but every resulting assumption stays
guarded at runtime, because TypeScript's type system exists to catch
programmer mistakes, not to guarantee anything about what actually shows up
at runtime. `any`, type assertions, and ordinary interop with untyped
JavaScript all mean a `: number` annotation can be wrong without the
compiler ever finding out. The model here is inspired by SBCL's `safety`
declarations: trust the hint enough to pick a fast path, but check it
anyway, and let a wrong guess fall through to the generic path instead of
corrupting memory.

Edge runtimes have also narrowed the compatibility problem. Cloudflare
Workers, Deno Deploy, and Vercel Edge Functions have spent several years
proving that a JavaScript runtime doesn't need full Node.js compatibility,
let alone Node-API native addon support, to be useful in production. Their
shared surface, `fetch`, `Request` and `Response`, streams, the Web Crypto
API, is documented and tested as WinterTC's
[Minimum common web API], with a conformance suite that gives a new runtime
a bounded, testable target instead of an open-ended compatibility chase.

[Minimum common web API]: https://min-common-api.proposal.wintertc.org/


Current non-goals
-----------------

Oseo doesn't aim for Node-API compatibility. Supporting native addons would
mean exposing handle scopes, persistent references, GC-rooting rules, and a
stable C ABI, and building that on top of a from-scratch engine is a
project of its own, one that would push the object model and implementation
language toward decisions that don't otherwise serve Oseo's goals. Whether
this omission matters in practice is going to depend a lot on what people
actually try to run: Fedify, another project I maintain, has zero native
dependencies anywhere in its production dependency tree, which is one data
point about web-standards-oriented server code rather than a claim about
npm as a whole. Native modules are common enough elsewhere, cryptography,
compression, databases, machine learning, that this gap will show up
somewhere; the bet is just that it won't show up in the code Oseo is
targeting first.

Oseo also doesn't perform TypeScript type checking, and doesn't treat
`tsc`, any version of it, as a dependency. It reads type annotations and
JSDoc comments at the syntax level and stops there. This is partly a matter
of principle (annotations affect which native path gets picked, never
whether the program's behavior is correct) and partly circumstance: as of
mid-2026, `tsc` itself is mid-transition, from a JavaScript-based compiler
with a long-stable programmatic API to a Go-based native port. The
[TypeScript 7.0 announcement] describes that release as shipping without an
API and expects a new one in 7.1. The package nevertheless exposes an
explicitly unstable surface that a compiler can use today, as
[scriptc's TypeScript frontend] does through `typescript/unstable/sync`.
Depending on it would couple Oseo's hint extraction to an interface that is
still changing. Depending on the legacy compiler or a compatibility shim
would bind Oseo to the other side of the same transition. Reading syntax
directly, independent of whichever `tsc` version happens to be installed,
avoids both dependencies.

[TypeScript 7.0 announcement]: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
[scriptc's TypeScript frontend]: https://github.com/vercel-labs/scriptc/blob/ee1f8697b800d00f0cc674f806b4960aa5f9e291/packages/compiler/src/frontend/ts7/program.ts#L1-L27


The roadmap
-----------

Oseo's compatibility targets are staged, each one building on what the last
one already guarantees.

### WinterTC baseline

Implement the shared web-platform surface: `fetch`, the URL and stream
types, Web Crypto, WebAssembly, and the rest of what every major edge runtime
already has. Static *.wasm* dependencies can join Oseo's closed native build
ahead of the complete runtime-byte API. This baseline should be enough to run
web-standards-oriented libraries and frameworks with no Node.js-specific
compatibility layer at all.

### Selected Node.js APIs

Add the handful of Node.js-specific pieces that WinterTC deliberately
leaves out of scope because they're Node.js's own rather than web-standard:
`node:fs`, `node:path`, `node:crypto`, the `Buffer` and `process` globals.
My guess, going by what tends to break npm packages on existing edge
runtimes, is that these account for more failures than missing native
bindings do, though that's an impression from watching the ecosystem rather
than something I've measured against Oseo directly yet.

### Package compatibility

Broader npm and *node\_modules* support: *package.json* `exports` and
`imports` resolution, CommonJS interop, and whatever long tail of
undocumented Node.js behavior turns up once real packages start getting
thrown at the engine.


Implementation, and the bootstrap question
------------------------------------------

I'm writing Oseo's compiler in TypeScript and running it under Node.js and
Deno during early development, so the usual debugger, error messages, and
ecosystem tooling are there from the start instead of needing to be rebuilt
alongside the engine itself. Once the core architecture settles, the tagged
value representation, the guarded code generation, the object model, the
plan is to refactor the compiler's own source down into the subset of
TypeScript it knows how to compile, and have Oseo compile itself into a
native binary. SBCL and Chez Scheme both reached this point in their own
histories. PyPy's RPython is probably the closest existing precedent: a
Python subset restricted enough that a translator can analyze and compile
it ahead of time, used to implement Python's own accelerated
implementation.

I'd like Oseo to keep running under Node.js and Deno as host environments
even after self-hosting works, which means the compiler's own source has to
stay within whatever TypeScript subset both Oseo and a conventional
JavaScript engine can execute, permanently, not just for the bootstrap. It's
worth stating that constraint now, since it'll quietly shape which language
features the compiler's own codebase is allowed to use for as long as the
project exists.


A note on the name
------------------

*Oseo* (/o.sʌ/, “OH-suh”) is the Sino-Korean reading of 鼯鼠, the flying
squirrel. The 鼯 character is rare enough that it's used almost exclusively for
this one animal: 鼠, the rodent radical, paired with a phonetic component. A
flying squirrel spends most of its time moving through the trees the way any
squirrel does, and then, when the terrain calls for it, spreads the patagium
along its sides and glides. That's the image I wanted for the name: generic
execution is always there and always correct, and a checked specialization
takes the faster route when the ground allows it.
