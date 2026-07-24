Compiler source decomposition plan
==================================

Status
------

Implementation status: in progress. The baseline checkpoint is complete on the
`refactor` branch. This temporary cross-milestone plan decomposes the compiler,
Babel frontend adapter, and native fixture runner before the next broad M5
language and built-in batches. It preserves the current language profile,
package interfaces, intermediate representations, generated behavior,
diagnostics, and compatibility classifications.

The plan is retired after its exit criteria pass and its durable ownership
rules move into [*DESIGN.md*](./DESIGN.md), package documentation, and the
applicable testing documentation. Its deletion is part of completion, not an
abandoned-plan signal.

This plan is governed by [*WHITEPAPER.md*](./WHITEPAPER.md),
[*DESIGN.md*](./DESIGN.md), [*ROADMAP.md*](./ROADMAP.md),
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md), [*PLAN-M5.md*](./PLAN-M5.md),
[*PLAN-PT.md*](./PLAN-PT.md), [*PLAN-REGEXP.md*](./PLAN-REGEXP.md), the frozen
language profiles, and accepted records under *docs/adr/*. Evidence that
changes one of those contracts updates the affected document in the same
change.


Goal
----

Give each compiler stage, frontend conversion family, and native test family a
clear source owner without changing what Oseo accepts or how accepted programs
behave. The public package entry points remain stable while their current
catch-all implementations become small composition and export surfaces.

The result should reduce the context needed for one semantic change and make
ownership visible in a diff. It should also let independent changes touch
independent files when their semantic prerequisites permit it. Parallel
development is a possible benefit, not an acceptance criterion.

File count and line count alone do not prove success. A split is useful only
when the resulting modules follow the compiler stage boundaries, avoid new
cycles, and keep one authoritative implementation of each invariant.


Non-goals
---------

This plan does not add ECMAScript syntax, built-ins, host APIs, optimizations,
specializations, or native backends. It does not advance the M5 compatibility
manifest or change an unsupported result into a pass.

It does not:

 -  redesign syntax, HIR, MIR, module linking, asynchronous lowering, the
    generic call ABI, or the runtime ABI;
 -  split `@oseo/compiler` or `@oseo/parser-babel` into new publishable
    packages;
 -  add public subpath exports or expose package-private modules;
 -  move JavaScript semantics from compiler core into the Babel adapter, C
    backend, runtime, testkit, or native fixtures;
 -  change diagnostic codes, phases, source ranges, or rendered messages;
 -  replace the C11 backend or reorganize the already componentized C runtime;
 -  change the test262 manifest schema, selected cases, classifications, or
    canonical result digest;
 -  adopt a repository-wide maximum file size; or
 -  combine unrelated cleanup, renaming, or formatting churn with a move.

If a mechanical move exposes a semantic defect, the move stops. The defect
gets a failing regression and a focused semantic fix in a separate reviewed
change before decomposition resumes.


Entry evidence
--------------

The baseline at source revision `434edeb` has a clean `main` worktree and these
manually maintained hotspots:

| File                                        |  Lines |
| ------------------------------------------- | -----: |
| *packages/compiler/src/index.ts*            |  8,867 |
| *packages/compiler/tests/index.test.ts*     |  2,686 |
| *packages/parser-babel/src/index.ts*        |  3,204 |
| *packages/parser-babel/tests/index.test.ts* |  2,146 |
| *tests/native.ts*                           |  4,517 |
| *tests/test262/subset.yaml*                 |  2,315 |
| *tests/test262/results.yaml*                | 17,654 |

The compiler source currently owns, in one module:

 -  diagnostics, source ranges, source inputs, and target descriptions;
 -  owned syntax declarations and frontend interfaces;
 -  module graph construction and linking;
 -  HIR declarations, name resolution, printing, and binding-pattern
    normalization;
 -  MIR declarations, generic lowering, specialization, and printing;
 -  top-level-await extraction and module evaluation lowering;
 -  source and module-graph compilation entry points; and
 -  backend, runtime, toolchain, and compiler-host interfaces.

The Babel adapter currently owns, in one module, raw-node guards, UTF-8 source
mapping, JSDoc hint extraction, expressions, binding and assignment patterns,
statements, functions, asynchronous continuation conversion, modules, and both
frontend values.

The native runner currently owns one ordered fixture array plus module,
diagnostic, assembly, runtime, and cross-target scenarios. Its
`--shard INDEX/TOTAL` contract selects from the reviewed fixture order, so
source movement must not change names, order, shard membership, or summary
counts accidentally.

The current package manifests expose only `"."`. Node.js and Deno execute the
same package test sources. Repository checks already reject package dependency
cycles and private cross-package imports. The decomposition extends those
contracts inside each package rather than weakening them.

### Recorded implementation baseline

The implementation baseline is source revision
`babe95cdf77bc1fea8760e29a55783544831abe0`. It retains the entry hotspot line
counts above and records these generated public declaration digests:

| Package              | Public declaration digest                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| `@oseo/compiler`     | `sha256:e689a24cd180fa97ec72108b1e07337e562556bc0ddff1dad1be6761e41e0833` |
| `@oseo/parser-babel` | `sha256:36e50ee398d3378f8399388846019b04d6d1ebf2efdf703dea828346bf32f489` |

The reviewed native catalog has 53 execution fixtures, 54 AArch64 Linux
cross-link fixtures, and all configured target assembly inspections. The
test262 manifest contains 635 cases with 224 passes, 226 expected negatives,
and 185 unsupported profile features. Its canonical digest is
`sha256:a682a3872c4213ad7cb6d770b6f54cf35abd03d69bb7e5af43f4717366a5440c`;
the target-parity record pins the same digest for `linux-x86_64-gnu` and
`macos-aarch64`.

`mise run check` and `mise run test` pass from this baseline. The aggregate
test reproduces the Node.js and Deno package tests, the complete native catalog
and cross-link, every architecture probe, and all 635 reviewed test262 cases.

### Compiler source checkpoint

The compiler implementation now follows the reviewed source map. Declarations,
module operations, HIR construction and printing, generic MIR lowering,
specialization, MIR printing, asynchronous module compilation, source
composition, and native interfaces each have one package-private owner.
The public *index.ts* retains the existing export names and package export map.
The repository boundary check now rejects cycles in the compiler and Babel
adapter source graphs. The package, type, formatting, lint, and archive checks
pass with the split source tree.

### Frontend and package test checkpoint

Compiler tests now have source, HIR, MIR, and module owners. Babel adapter tests
have basic conversion, binding, statement, module, and asynchronous owners.
All sources still run unchanged under Node.js and Deno.

The Babel adapter now separates raw parser shapes, source locations,
diagnostics, hints, mutually recursive grammar and asynchronous conversion,
module conversion, and public composition. The mutually recursive conversion
unit follows the documented exception rather than adding cyclic forwarding
modules. Babel nodes remain private to the adapter.


Ownership rules
---------------

The current public entry points remain:

 -  *packages/compiler/src/index.ts* for `@oseo/compiler`; and
 -  *packages/parser-babel/src/index.ts* for `@oseo/parser-babel`.

An entry point may re-export public declarations and compose public values. It
must not become a second implementation beside an extracted module. A
package-private module is imported only through a relative path from its own
package. No other package or repository test imports it unless that module is
the explicit subject of a same-package structural test.

Dependencies follow the compiler pipeline:

~~~~ mermaid
flowchart LR
    source[Source and diagnostics] --> syntax[Owned syntax]
    syntax --> modules[Module graph]
    syntax --> hir[HIR and resolution]
    modules --> hir
    hir --> mir[MIR and lowering]
    mir --> specialization[Specialization]
    mir --> compile[Compilation]
    specialization --> compile
    compile --> native[Backend and target contracts]
~~~~

A lower layer does not import a higher layer to reuse a convenience helper.
Shared code moves to the narrowest stable lower layer that owns its invariant.
Mutually recursive syntax or conversion functions stay together until an
acyclic interface exists. The refactoring must not introduce callback
registries, service locators, or duplicated type declarations merely to force
two tightly coupled functions into different files.

Types that cross an internal module boundary stay immutable by default.
Exported internal declarations receive JSDoc when they define an ownership
rule, representation invariant, or non-obvious ordering contract. They are not
added to the package export map.


Compiler source layout
----------------------

The initial compiler map is a hypothesis to verify with an import and call
inventory:

 -  *source.ts* owns diagnostics, byte and source ranges, source inputs, and
    diagnostic rendering;
 -  *syntax.ts* owns parser-independent syntax, hints, patterns, statements,
    functions, programs, and frontend interfaces;
 -  *modules.ts* owns module loading, resolution, graphs, components, and
    linking;
 -  *hir.ts* owns HIR declarations and public HIR result types;
 -  *hir-build.ts* owns name resolution, scope construction, binding
    normalization, and `buildHir`;
 -  *hir-print.ts* owns deterministic HIR rendering;
 -  *mir.ts* owns MIR declarations, compiler options, and validators;
 -  *mir-build.ts* owns generic MIR construction and semantic lowering;
 -  *mir-specialize.ts* owns guarded specialization selection and rewriting;
 -  *mir-print.ts* owns deterministic MIR rendering;
 -  *module-compile.ts* owns await-point stabilization and asynchronous module
    evaluation lowering;
 -  *compile.ts* owns source and module-graph compilation entry points;
 -  *native.ts* owns target, backend, runtime, toolchain, process, and host
    contracts; and
 -  *index.ts* re-exports the unchanged public surface.

The dependency inventory may merge or rename modules when the code shows a
tighter invariant. It may not retain all implementation in *index.ts*, create
an all-purpose *utils.ts*, or move unrelated declarations together only to
avoid an import.

HIR and MIR declarations remain separate from their builders so a validator,
printer, backend, or property test can consume an owned representation without
importing construction state. Module compilation may share ordinary HIR and MIR
operations, but it does not gain a second lowering implementation.

The C backend continues to consume public validated MIR. It does not import
package-private compiler modules or recover semantics from HIR after this
split. [*PLAN-BACKEND.md*](./PLAN-BACKEND.md) remains the owner of any future
backend interface decision.


Babel frontend layout
---------------------

The initial frontend map is:

 -  *babel.ts* owns private raw-node shapes, node guards, conversion context,
    and raw parser-error adaptation;
 -  *locations.ts* owns UTF-8 indexing, byte offsets, positions, ranges, and
    source-located diagnostics;
 -  *hints.ts* owns TypeScript and JSDoc hint extraction;
 -  *expressions.ts* owns expression and call-target conversion;
 -  *patterns.ts* owns binding and assignment patterns plus name collection;
 -  *statements.ts* owns statements, declarations, functions, and hoisting;
 -  *async.ts* owns direct-await discovery, continuation validation, and
    asynchronous statement rewriting;
 -  *modules.ts* owns import and export conversion and module programs; and
 -  *index.ts* constructs and exports `babelFrontend` and
    `babelModuleFrontend`.

Expression, pattern, statement, and function conversion is mutually recursive
today. The first inventory records those edges. A mutually recursive group may
remain in one conversion module until an owned context or parser-independent
operation separates it naturally. A split must not pass untyped Babel objects
through generic callbacks or leak a Babel node into `@oseo/compiler`.

Locations and hints are leaf services. They move before grammar conversion so
later moves reuse one source-range and hint implementation. Both frontend
values must retain identical fatal and recoverable parser-error handling.


Test layout
-----------

Package tests follow the public contract they prove. The proposed compiler test
families are source and diagnostics, module linking, HIR, MIR, compilation, and
native target contracts. The proposed Babel test families are locations and
hints, expressions, patterns, statements and functions, asynchronous
conversion, and modules.

Each resulting package test remains a *.test.ts* file that Node.js and Deno run
unchanged. Shared test data stays beside its owning package. A helper becomes
production code only when production needs the same contract.

The native runner keeps *tests/native.ts* as the command entry point and moves
data and scenarios under *tests/native/*. Its initial map is:

 -  *context.ts* for the injected host, backend, runtime, toolchain, target, and
    reference prelude;
 -  *fixture.ts* for the immutable fixture contract;
 -  _fixtures/\*.ts_ for ordered semantic fixture families;
 -  *scenarios/modules.ts* for module and asynchronous CLI scenarios;
 -  *scenarios/diagnostics.ts* for native failure observations;
 -  *scenarios/runtime.ts* for direct runtime and collector fixtures;
 -  *scenarios/assembly.ts* for generated-code and target inspection; and
 -  *index.ts* for the ordered catalog and scenario list.

The command entry point remains responsible for argument parsing, stable shard
selection, orchestration, and final summaries. Fixture modules contribute
ordered immutable arrays. One catalog concatenates them in the reviewed order.
No filesystem enumeration, glob order, import evaluation side effect, or test
runner scheduling decides shard membership.

Existing property files already own separate semantic domains. They are not
reorganized unless a moved package-private test helper has a clear shared
owner. Their seeds, replay paths, generated models, and case budgets remain
unchanged.


Conformance boundary
--------------------

The checked-in test262 manifest stays the source of truth defined by ADR 0013.
This refactoring does not select a new test, remove a case, change the supported
feature list, or regenerate expected classifications as progress.

The decomposition records the canonical digest before the first move.
`mise run test:test262` must reproduce it after every checkpoint that touches a
compiler, frontend, diagnostic, or native execution path.

The size and write frequency of *subset.yaml* justify a later authoring
investigation, but feature fragments are not required by this plan. Making
*subset.yaml* generated input, changing its schema, or composing multiple
reviewed manifests requires an explicit ADR 0013 update and a separate
checkpoint. *results.yaml* and *target-parity.yaml* remain generated canonical
artifacts and are never split or hand-edited.


Migration method
----------------

Record the baseline before moving a declaration:

 -  public exports and generated declaration output for both packages;
 -  package-boundary and import-cycle observations;
 -  HIR and MIR snapshots used by structural tests;
 -  diagnostic codes, phases, locations, and rendered messages;
 -  native fixture names, order, shard membership, and summaries;
 -  the test262 canonical and target-parity digests; and
 -  focused and full gate durations.

Move one ownership boundary at a time. A checkpoint first adds any structural
test needed to freeze the boundary, then moves declarations without changing
their bodies. Formatting follows the move. A later cleanup may simplify imports
or remove temporary forwarding exports after the move is green.

Temporary forwarding exports are allowed only when the plan names the
checkpoint that removes them. A forwarding export must not become a public
subpath, duplicate a mutable singleton, or make module initialization order
observable.

Every commit is behavior-preserving and green. A checkpoint that cannot keep
the full public surface and observations stable is too large and must be split.
Semantic M5 work may continue only in source that is not being moved and does
not change an interface needed by the active checkpoint.


Verification
------------

Structural tests verify:

 -  *index.ts* files contain composition and exports rather than parallel
    implementations;
 -  internal imports follow the reviewed dependency direction;
 -  no package-private module is exposed through an npm or JSR export;
 -  bootstrap parser types and values remain inside `@oseo/parser-babel`;
 -  HIR and MIR builders have one authoritative implementation;
 -  printers remain deterministic;
 -  native fixture order and shard selection remain stable; and
 -  public declaration output changes only when a separately reviewed contract
    change permits it.

Focused package tests run under both Node.js and Deno after each package move.
Compiler or frontend moves also run the applicable native and property suites.
The completed migration runs:

~~~~ sh
mise run check
mise run test
mise run test:probes
mise run test:property:native
mise run test:property:extended
mise run test:native
mise run test:test262
~~~~

The final evidence includes Linux AMD64 and macOS AArch64 execution plus
AArch64 Linux compile-link and inspection. Strict warnings, sanitizers,
package dry runs, version checks, specialization-disabled execution,
specialization-enabled execution, and forced collection retain their existing
owners and remain green.


Documentation changes
---------------------

The first implementation checkpoint updates [*DESIGN.md*](./DESIGN.md) with
the implemented internal compiler and frontend ownership, without presenting
the starting file map as already landed. The compiler and Babel package README
files document their internal structure when that structure becomes current.

[*ROADMAP.md*](./ROADMAP.md) and [*PLAN-M5.md*](./PLAN-M5.md) record this as an
M5-enabling refactoring that changes no compatibility count. The
implementation updates [*PLAN-PT.md*](./PLAN-PT.md) only if test placement or a
property-support owner changes. [*PLAN-REGEXP.md*](./PLAN-REGEXP.md) and
[*PLAN-BACKEND.md*](./PLAN-BACKEND.md) keep their semantic and backend
decisions; they consume the resulting compiler boundaries rather than
redefining them.

Commands and source names are documented as current behavior only after they
exist. The closing checkpoint creates a durable source-ownership record if the
implemented layout needs more detail than *DESIGN.md* and package README files
can carry.


Delivery order
--------------

1.  Record the dependency and call inventory, public declaration output,
    structural snapshots, native fixture order, manifest digests, and clean
    baseline gates.
2.  Split compiler and Babel package tests by their public contracts without
    moving production declarations.
3.  Extract compiler source, syntax, HIR, MIR, and native interface
    declarations in dependency order. Keep compatibility forwarding exports
    private and temporary.
4.  Extract module loading, graph construction, component discovery, and
    linking. Prove canonical identity, dependency order, live-cell allocation,
    and link diagnostics unchanged.
5.  Extract HIR construction and printing, then prove name resolution,
    evaluation order, and output snapshots unchanged.
6.  Extract MIR construction, binding and control-flow lowering,
    specialization, and printing in dependency order. Prove safepoints,
    completion edges, fallback blocks, and snapshots unchanged.
7.  Extract asynchronous module compilation while preserving continuation
    order, one evaluation per module, live cells, and top-level-await
    diagnostics.
8.  Extract Babel locations and hints, then grammar conversion families,
    asynchronous conversion, and module conversion. Preserve owned output and
    diagnostics before removing forwarding helpers.
9.  Split the native fixture catalog and scenarios while retaining command
    syntax, fixture order, shard membership, target coverage, and summaries.
10. Remove temporary forwarding helpers, update durable documentation, and run
    clean-checkout ordinary, native, property, probe, package, and standards
    gates on every required target.
11. Record the completed ownership and verification, then retire this plan in a
    separate change after every live reference points to the durable record.


Exit criteria
-------------

The refactoring is complete only when:

 -  `@oseo/compiler` and `@oseo/parser-babel` keep their existing public export
    maps and declaration contracts;
 -  each compiler representation, builder, printer, module operation, and
    native interface has one documented source owner;
 -  both package *index.ts* files are composition and public-export surfaces,
    not catch-all implementations;
 -  internal dependencies follow the reviewed stage direction without a new
    cycle, private cross-package import, or generic dumping-ground module;
 -  parser-owned values, errors, and stack traces never cross the frontend
    boundary;
 -  diagnostics retain their code, phase, source range, and rendered form;
 -  HIR, MIR, generated C, module graphs, and specialization structure retain
    their reviewed textual and behavioral observations;
 -  the native command, fixture names, fixture order, shard membership,
    summaries, supported execution targets, and cross-target checks remain
    stable;
 -  property seeds, replay paths, generated domains, shrinkers, and case budgets
    remain unchanged unless a separate reviewed testing change owns the
    difference;
 -  test262 selections, classifications, summaries, canonical digest, and
    target-parity digest remain unchanged;
 -  package archives expose no private implementation path and build from a
    clean unpacked artifact;
 -  the implemented ownership is recorded in durable design and package
    documentation;
 -  strict warnings, sanitizers, both supported execution targets, AArch64
    Linux compile-link, specialization policies, and forced collection pass;
    and
 -  `mise run check`, `mise run test`, `mise run test:probes`,
    `mise run test:property:extended`, and `mise run test:test262` pass from a
    clean checkout.
