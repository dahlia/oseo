Harness fragment ABI
====================

This amendment to [ADR 0003](adr/0003-c11-runtime-and-zig-boundary.md)
selects an ordered harness translation unit, a case translation unit, and a
case-owned launcher. The ABI identifier is `oseo-script-fragments-v1`.
It is a private compiler/backend contract, versioned independently of the
runtime ABI. Changes to either ABI invalidate cached harness objects.

Stage 1 exposes opt-in compiler fragments and connection metadata. They are
not standalone executable programs. The existing `compileSource`, CLI, C
backend, and test262 runner retain their whole-Script behavior. Stage 2 adds
native emission and linking through opt-in APIs; stage 3 will admit runner
inputs.


Identity and storage
--------------------

Resolve the complete ordered harness before resolving any case declaration.
Allocate binding and function IDs monotonically from zero, including nested
functions, parameters, local bindings, hidden cells, and class helpers. The
case starts at the harness's exclusive binding and function limits. There is
no relocation pass: `localBindingIds` and every reference acquire their final
IDs when HIR is built. A harness's limits depend only on its own sources and
policy. IDs are stable within that bundle and ABI, not across different
bundles or compiler versions.

The case imports the harness's Script binding descriptors, including
mutability and global-object ownership. Both units access the same cells.
Global-object bindings must continue to read, write, and delete the realm's
properties, including accesses from nested closures. Importing a function
binding does not copy its current value or authorize cross-unit inlining.

The launcher allocates and roots the shared Script environment. Its capacity
is the case's exclusive binding limit, covering both units' locals as well as
globals under the current flat-slot convention. Function environments clone the
captured environment, retaining its runtime capacity without a case-dependent
constant in harness C. Fragment metadata gives both limits explicitly; do not
infer capacity from reachable functions or emitted operations. Check IDs and
capacities against the target's representable limits before C emission.

JavaScript function IDs keep the backend's existing code-ID mapping. Harness
IDs precede case IDs; runtime built-in IDs retain the runtime header's separate
reserved space. Each unit owns its generic and specialized implementations and
its generator/async resume dispatch. The launcher routes normal calls and
resumptions to the owning unit and delegates built-ins to the runtime. Each
unit retains all of its own functions, regardless of the case's reachability.
The Script entry sentinel `-1` is unit-local and is never a callable code ID.


Native linkage selected for stage 2
-----------------------------------

The launcher exports `const size_t oseo_fragment_binding_count`. The launcher
uses this symbol when creating the shared environment. Inspection during stage
2 corrected the earlier requirement that function prologues load it: the
existing runtime environment clone already preserves capacity, so function
prologues need no capacity argument. It is immutable for the lifetime of one
executable. Cross-unit LTO is disabled so this value cannot enter a cached
harness object. Each unit exports an instantiation entry, an evaluation entry,
and dispatch entries with distinct `oseo_harness_` and `oseo_case_` prefixes.
Evaluation and instantiation accept `OseoContext *` and the rooted `OseoValue`
environment, and return `OseoResult`. Dispatch entries retain the runtime's
existing call arguments and additionally accept the already-decoded function
code ID. Generator dispatch accepts that ID and the generator object.

The launcher routes IDs using the harness's exclusive function limit. Each
unit's dispatcher owns its frame allocation and its own function root counts;
the launcher never embeds a case-dependent root count in a harness dispatch.
Function code IDs are the nonnegative HIR IDs themselves. Unknown IDs go to
the runtime's existing unknown/built-in dispatch path.

A launcher-owned `oseo_fragment_location` helper accepts the context, unit
kind, and fragment-local line/column. It applies the logical source map before
calling the existing runtime location API. Function source text remains
unit-owned. These generated symbols are private to one executable and are
versioned by the fragment ABI key; no installed public C header promises
compatibility with a different fragment version.


Declaration instantiation and execution
---------------------------------------

The launcher combines global-object declarations by kind: all functions first,
then all vars, with harness-before-case order within each kind. This preserves
the whole-Script path's global property insertion order. Simple concatenation
of the fragment tables would place harness vars before case functions, which
changes `Object.keys(this)` and related observations. Lexical declarations
remain in harness-then-case order. The launcher performs one
GlobalDeclarationInstantiation before evaluating either unit.
It checks lexical/object conflicts and restricted global properties, allocates
uninitialized lexical cells, initializes var bindings, and installs hoisted
functions. Initially, redeclarations across units make the case ineligible for
reuse, even when a whole Script could accept them. Redeclarations within one
fragment keep the existing frontend and resolver rules, including last-function
selection.

The launcher owns top-level hoisted function installation and each fragment's
hidden intrinsic-global-object initializer. Ownership is identified by HIR
statement kind and the explicit intrinsic binding ID, never by source ranges.
Hidden missing-intrinsic cells remain uninitialized. A fragment may have its
own hidden cell for the same realm object; those cells hold the same object
and occupy disjoint slots. This avoids making harness allocation depend on
which intrinsics a case uses. The initializer metadata also identifies the
frontend's synthetic var initialization by its global-object binding
descriptors. Source-level var initializer assignments stay in evaluation order.

After successful instantiation, execute harness evaluation then case
evaluation, short-circuiting abrupt completions. The launcher retains the
shared environment root across both calls. Each fragment entry and function
owns its MIR value IDs, root frame, temporary slots, completion slots, local
string arrays, regexp/template data, and property caches. Frame size depends
only on that function or entry. Never concatenate the two Script MIR entries
or size a harness frame from the case's maximum value ID.

Shape IDs belong to the shared runtime context. Property caches are local to
a unit/function and learn shapes from that context. Intrinsic enums continue
to come from the common runtime header. No global string-ID or shape-ID
relocation table crosses this boundary. One fresh process/context per case
preserves the current static-cache lifetime contract.


Admission and source locations
------------------------------

The resolver records names resolved in the Script scope or beyond it,
including nested closures, unresolved `typeof`, assignment/delete targets,
and the special console/timer call paths. Local bindings and property keys
are excluded. Compare all case global lexical and global-object declarations
against these names and all harness Script declarations. Any overlap returns
an explicit fallback result. This covers `let Object`, destructuring, class
names, hoisted var declarations, and function replacements conservatively.

An unresolved initializing `with` write in either fragment also requires
fallback. Whole-Script resolution checks these writes against unresolved
`typeof` folds anywhere in the Script; resolving fragments independently
would otherwise discard that check. This restriction preserves both directions
of the dependency without adding body inputs to harness lowering.

Compilation failure does not establish eligibility for reuse. Stage 3 sends
parse failures, unsupported inputs, unknown metadata, and collisions to the
unchanged whole-Script path with the exact original assembled source and source
ID. That path owns TDZ behavior, early errors, and diagnostic locations. A case
whose standalone directive prologue changes strictness also falls back. Module
graphs and raw tests initially use the whole-program path. Module support needs
separate linking and initialization evidence before admission.

Stage 1 parses ordered harness sources joined by newlines under a fixed
virtual source ID, with an optional leading strict directive. It parses the
case separately under the same requested strictness. Locations are local to
these compiler inputs. Stage 2 passes a logical source-map descriptor through
the launcher: harness errors use the case's original assembled source ID and
line mapping; case errors apply the harness-prefix offset. No case path may
be baked into the harness object. Stage 3 must verify that source boundaries,
directive prologues, automatic semicolon insertion, and source text retained
for functions match the runner's original assembly before admitting reuse.
A source boundary that cannot be represented exactly falls back.


Object reuse and variants
-------------------------

The content-addressed key uses a canonical, length-delimited encoding of the
ABI identifier; ordered harness names and exact source bytes, including
repeated includes and async helpers; effective strictness; specialization and
observation policy; frontend/compiler/backend identity; runtime ABI and all
runtime/header bytes; complete target description; sanitizer requirements;
compiler/toolchain identity and version; all compilation/link flags; admitted
process environment; and canonical emitted harness C bytes. Compiler identity
must cover local code changes, not merely the package release version.
Cache metadata is separate from the reviewed manifest.

Non-strict/enabled, non-strict/disabled, strict/enabled, and strict/disabled
have separate keys and objects. Object reuse never removes an executed
variant. Module fallback still executes its existing strict variants. A
future module implementation may use two strict objects only after proving
its environment contract; it cannot assume a Script object is interchangeable.

Both Zig and host-cc adapters compile relative `harness.c` in a normalized
staging layout with fixed relative header paths. Apply compiler-supported
file/debug prefix maps and a fixed debug compilation directory. Absolute input
paths must not survive in debug records, sanitizer records, or macros. Prefix
mapping alone is insufficient according to the prototype. Verify objects
from two distinct absolute directories byte for byte, under every admitted
variant and target/toolchain policy. Until proven, do not claim deterministic
objects. Retain sanitizer instrumentation on both generated units and runtime.
The host-cc adapter's instrumentation probe remains required; historical Zig
flags alone do not prove ASan coverage.


Evidence and remaining stages
-----------------------------

The reviewed manifest schema, one row per upstream path, variant observations,
logical assembled-source hashes, path ordering, compatibility ratchet, seed
registry, and every evidence class remain unchanged. No compatibility counts
or budgets change in this work. Native semantics, forced collection,
specialization invariance and guard misses, negative diagnostics, structural
checks, sanitizer instrumentation, cross-link/assembly evidence, and target
parity keep their current meanings. Cache hits are not semantic evidence.

Stage 2 adds a compiler-owned multi-unit native interface, C entry/dispatcher
emission, and both toolchain adapters' object build/link/cache plans. Its gates
require whole-Script and split execution to match exactly in stdout, stderr,
and exit status. They also cover forced collection, hoisting, nested captures,
mutations of globals, async/generator resumptions, source locations, and object
determinism across directories. It must also measure stack/resource-limit
effects of the extra entry frames.

Stage 3 adds runner admission and fallback, a command-line bypass, concurrent
cache publication and corruption recovery, and key-change tests. Compare the
same small shards with and without reuse, preserve every observation and
manifest field, then measure cold/warm CI work on Linux and macOS. Update
*PLAN-GATE.md* and user documentation with measured results. The prior
765-to-511-minute macOS work projection and 102-to-106-minute wall-time floor
are estimates, not stage 1 measurements.

The design study identifies whole-Script numbering as a reuse
barrier. The prototype shows that stable IDs alone cannot preserve lexical
shadowing and that equal C does not imply equal object bytes. The corpus scan
found no declared-name collisions in 64,108 recorded variants, but does not
prove dynamic-global equivalence or eliminate the fallback requirement.


Stage 1 whole-Script baseline
-----------------------------

The initial baseline is main commit
`779e281908622d39e2a138548058438903019046`. Direct comparison covered 318
fixture/policy outputs from eight existing native fixture families: bindings,
functions, classes, objects, expressions, generators, async functions, and
global-object records. Printed HIR, printed MIR, and emitted C matched byte
for byte. The checked-in baseline retains 44 SHA-256 records in
*tests/harness-fragment-baseline.json*. These are measured code-generation
comparisons, not split-native execution or performance evidence.


Stage 2 interfaces and ownership
--------------------------------

`lowerFragmentPhases` lowers the compiler-owned initializer indices into
separate instantiation and evaluation MIR entries. `emitScriptFragments` in
*@oseo/backend-c* emits *harness.c*, *case.c*, and *launcher.c*. The launcher
allocates every Script cell and validates the combined global declaration
table before invoking either unit's instantiation helper. Those helpers own
the generated instructions, while the launcher owns when they run. Both
instantiations finish before harness evaluation starts.

The source-map descriptor supplies an assembled source ID and signed line
offsets. Strict fragments contain the compiler's leading directive, so the
body offset subtracts that extra line relative to the actual assembly. These
inputs belong to the caller's admission proof; this API does not admit runner
inputs or replace whole-Script fallback.

`NativeBuildInput` accepts ordered additional generated sources and prebuilt
objects. Omitting both retains the existing command plan. Each adapter exposes
`harnessObjectReuse`, and `prepareHarnessObject` stages relative source/header
names, locks a host cache key, builds on a miss, and atomically publishes the
object through the host cache. Without a cache, the caller owns the returned
object's temporary parent directory. Cache corruption recovery remains stage 3.

The composing caller supplies content identities for frontend, compiler, and
backend, plus exact runtime contents and toolchain identity. A package version
alone does not satisfy that contract. Adapters add their actual normalized
compile/link flags to the canonical key. Debug and sanitizer builds compile
relative *harness.c* and headers with file-prefix mapping; Zig additionally
sets a fixed debug compilation directory. No default-path invocation changes.

Separate phase root frames replace the combined Script frame. The launcher
holds two root slots across phase calls; each phase retains its own budget.
This changes resource accounting near the active-slot limit, so stage 3 must
not treat ordinary execution equivalence as proof of identical resource
thresholds.
Recursive-call depth, abrupt completions, and forced collection are separate
regression probes in *tests/harness-native.test.ts*.

The stage 2 entry-frame probe measures a harness function called by the case.
On Linux x86\_64, active root slots increased from 67 to 69. Measured native
frame-address depth increased from 2,432 to 2,592 bytes with Zig and from
2,624 to 2,816 bytes with host Clang 22 under ASan/UBSan. The test instruments
only its own generated C; equivalence tests use unmodified output. These
measurements describe that probe and build policy, not universal overhead or
identical resource thresholds. The call-depth-limit probe retains the same
exit status and diagnostic bytes in both builds.
